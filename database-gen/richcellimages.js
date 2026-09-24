const path = require('path');
const AdmZip = require('adm-zip');

// ---------------------------------------------------------------------------
// Modern Excel ("Insert > Pictures > Place in Cell", also used when Excel's
// "Data Types" inserts an image into a cell) stores photos as *rich values*
// rather than as classic floating drawings. There is no xl/drawings/*.xml at
// all in that case - the reference chain instead runs through:
//
//   cell (@vm attr) -> xl/metadata.xml -> xl/richData/rdrichvalue.xml
//        -> xl/richData/richValueRel.xml -> richValueRel.xml.rels -> xl/media
//
// ExcelJS's worksheet.getImages() only knows about the classic drawings
// mechanism, so it returns nothing for these files. This module reads the
// xlsx as a raw zip and walks that chain directly.
// ---------------------------------------------------------------------------

function parseVmByRow(sheetXml, colLetter) {
  const map = new Map();
  const cellRe = /<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gs;
  let m;
  while ((m = cellRe.exec(sheetXml))) {
    const attrs = m[1];
    const refMatch = /r="([A-Z]+)(\d+)"/.exec(attrs);
    if (!refMatch) continue;
    const [, col, row] = refMatch;
    if (col !== colLetter) continue;
    const vmMatch = /\bvm="(\d+)"/.exec(attrs);
    if (vmMatch) map.set(parseInt(row, 10), parseInt(vmMatch[1], 10));
  }
  return map;
}

function parseBkList(metadataXml) {
  const fmMatch = /<futureMetadata[^>]*name="XLRICHVALUE"[^>]*>(.*?)<\/futureMetadata>/s.exec(
    metadataXml
  );
  const scope = fmMatch ? fmMatch[1] : metadataXml;
  const list = [];
  const re = /<xlrd:rvb i="(\d+)"\s*\/>/g;
  let m;
  while ((m = re.exec(scope))) list.push(parseInt(m[1], 10));
  return list;
}

function parseStructures(structXml) {
  const structs = [];
  const re = /<s\b[^>]*>(.*?)<\/s>/gs;
  let m;
  while ((m = re.exec(structXml))) {
    const keys = [];
    const kre = /<k n="([^"]+)"/g;
    let km;
    while ((km = kre.exec(m[1]))) keys.push(km[1]);
    structs.push(keys);
  }
  return structs;
}

function parseRichValues(rvXml) {
  const list = [];
  const re = /<rv s="(\d+)">(.*?)<\/rv>/gs;
  let m;
  while ((m = re.exec(rvXml))) {
    const structureIndex = parseInt(m[1], 10);
    const values = [];
    const vre = /<v>([^<]*)<\/v>/g;
    let vm;
    while ((vm = vre.exec(m[2]))) values.push(vm[1]);
    list.push({ structureIndex, values });
  }
  return list;
}

function parseRelIdList(xml) {
  const list = [];
  const re = /<rel r:id="([^"]+)"\s*\/>/g;
  let m;
  while ((m = re.exec(xml))) list.push(m[1]);
  return list;
}

function parseRelsMap(xml) {
  const map = {};
  const re = /<Relationship\s+Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  let m;
  while ((m = re.exec(xml))) map[m[1]] = m[2];
  return map;
}

function getEntryText(zip, entryPath) {
  const entry = zip.getEntry(entryPath);
  return entry ? entry.getData().toString('utf8') : null;
}

// Finds the worksheet's xml path inside the zip (e.g. "xl/worksheets/sheet2.xml")
// given the sheet's display name, or the first sheet if sheetName is null.
function findSheetEntryPath(zip, sheetName) {
  const workbookXml = getEntryText(zip, 'xl/workbook.xml');
  const relsXml = getEntryText(zip, 'xl/_rels/workbook.xml.rels');
  if (!workbookXml || !relsXml) return null;

  const sheets = [];
  const tagRe = /<sheet\b([^>]*)\/>/g;
  let m;
  while ((m = tagRe.exec(workbookXml))) {
    const attrs = m[1];
    const nameMatch = /name="([^"]*)"/.exec(attrs);
    const ridMatch = /r:id="([^"]*)"/.exec(attrs);
    sheets.push({ name: nameMatch ? nameMatch[1] : null, rId: ridMatch ? ridMatch[1] : null });
  }

  const relsMap = parseRelsMap(relsXml);
  const chosen = sheetName ? sheets.find((s) => s.name === sheetName) : sheets[0];
  if (!chosen || !chosen.rId || !relsMap[chosen.rId]) return null;

  return path.posix.normalize(path.posix.join('xl', relsMap[chosen.rId]));
}

/**
 * Extracts every "placed in cell" photo in a given column, keyed by row number.
 * Returns a Map<rowNumber, { buffer: Buffer, extension: string }>. Returns an
 * empty map (never throws for "no rich images here") if this file doesn't use
 * this mechanism or the column has no such cells.
 */
function extractRichCellImages({ filePath, sheetName, photoColumnLetter }) {
  const result = new Map();
  const zip = new AdmZip(filePath);

  const sheetPath = findSheetEntryPath(zip, sheetName);
  if (!sheetPath) return result;

  const sheetXml = getEntryText(zip, sheetPath);
  if (!sheetXml) return result;

  const vmByRow = parseVmByRow(sheetXml, photoColumnLetter);
  if (vmByRow.size === 0) return result;

  const metadataXml = getEntryText(zip, 'xl/metadata.xml');
  const structXml = getEntryText(zip, 'xl/richData/rdrichvaluestructure.xml');
  const rvXml = getEntryText(zip, 'xl/richData/rdrichvalue.xml');
  const relIdXml = getEntryText(zip, 'xl/richData/richValueRel.xml');
  const relsXml = getEntryText(zip, 'xl/richData/_rels/richValueRel.xml.rels');

  if (!metadataXml || !structXml || !rvXml || !relIdXml || !relsXml) {
    // Cells reference rich values but the supporting parts are missing -
    // an unsupported/unexpected file shape. Bail out cleanly.
    return result;
  }

  const bkList = parseBkList(metadataXml);
  const structures = parseStructures(structXml);
  const richValues = parseRichValues(rvXml);
  const relIdList = parseRelIdList(relIdXml);
  const relsMap = parseRelsMap(relsXml);

  for (const [row, vm] of vmByRow) {
    try {
      const i = bkList[vm - 1];
      const rv = richValues[i];
      const keys = structures[rv.structureIndex];
      const pos = keys.indexOf('_rvRel:LocalImageIdentifier');
      if (pos === -1) continue;

      const relIndex = parseInt(rv.values[pos], 10);
      const rId = relIdList[relIndex];
      const target = relsMap[rId];
      if (!target) continue;

      const mediaPath = path.posix.normalize(path.posix.join('xl/richData', target));
      const mediaEntry = zip.getEntry(mediaPath);
      if (!mediaEntry) continue;

      const buffer = mediaEntry.getData();
      const extension = (path.extname(mediaPath).replace('.', '') || 'png').toLowerCase();
      result.set(row, { buffer, extension });
    } catch {
      // Skip rows we can't resolve; index.js will warn about the missing photo.
      continue;
    }
  }

  return result;
}

module.exports = { extractRichCellImages };