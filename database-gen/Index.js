const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const config = require('./Config');
const { pool, insertProduct } = require('./Db');
const { hashBuffer, buildFileHashIndex, slugify } = require('./Imagematcher');
const { extractRichCellImages } = require('./richcellimages');

// Column layout in the spreadsheet: A -> G
const COLUMNS = {
  name: 1,
  photo: 2,
  material: 3,
  size: 4,
  materialcost: 5,
  time: 6,
  price: 7,
};

function columnNumberToLetter(n) {
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function cellText(row, col) {
  const cell = row.getCell(col);
  const value = cell.value;
  if (value === null || value === undefined) return null;

  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((rt) => rt.text).join('');
    }
    if (value.result !== undefined) return value.result; // formula cell
    if (value instanceof Date) return value;
  }

  return value;
}

function toInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function toDecimal(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : Math.round(n * 100) / 100;
}

async function main() {
  console.log('Reading workbook:', config.excelFilePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.excelFilePath);

  const worksheet = config.sheetName
    ? workbook.getWorksheet(config.sheetName)
    : workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(`Worksheet not found (sheetName="${config.sheetName}")`);
  }

  // Photos can be embedded in a spreadsheet two different ways:
  //
  // 1. Classic "floating" pictures anchored over a cell (xl/drawings/*.xml).
  //    ExcelJS's worksheet.getImages() understands this format.
  // 2. Newer "Place in Cell" pictures (Excel's image data type), which are
  //    stored as rich values instead and are invisible to getImages(). We
  //    read those directly out of the underlying zip/XML.
  //
  // Build one combined map: rowNumber -> { buffer, extension }.
  const rowImageMap = new Map();

  for (const img of worksheet.getImages()) {
    const anchorRow = Math.round(img.range.tl.nativeRow) + 1;
    const media = workbook.model.media[img.imageId];
    if (media && media.buffer) {
      rowImageMap.set(anchorRow, {
        buffer: media.buffer,
        extension: media.extension || 'png',
      });
    }
  }

  if (rowImageMap.size === 0) {
    const photoColumnLetter = columnNumberToLetter(COLUMNS.photo);
    const richImages = extractRichCellImages({
      filePath: config.excelFilePath,
      sheetName: worksheet.name,
      photoColumnLetter,
    });
    for (const [row, imageData] of richImages) {
      rowImageMap.set(row, imageData);
    }
    if (richImages.size > 0) {
      console.log(
        `Found ${richImages.size} photo(s) using Excel's "Place in Cell" image format.`
      );
    }
  }

  // Build a hash index of the reference images folder, used to recover
  // the original filename of each embedded picture.
  let hashIndex = new Map();
  if (config.matchMode === 'hash') {
    console.log('Indexing images folder:', config.imagesFolderPath);
    hashIndex = buildFileHashIndex(config.imagesFolderPath);
    console.log(`Indexed ${hashIndex.size} file(s) in the images folder.`);
  }

  let inserted = 0;
  let unmatchedImages = 0;
  const firstDataRow = config.headerRow + 1;

  for (let rowNumber = firstDataRow; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const name = cellText(row, COLUMNS.name);
    if (name === null || name === undefined || name === '') {
      continue; // skip blank rows
    }

    const material = cellText(row, COLUMNS.material);
    const size = cellText(row, COLUMNS.size);
    const materialcost = toInt(cellText(row, COLUMNS.materialcost));
    const time = toInt(cellText(row, COLUMNS.time));
    const price = toDecimal(cellText(row, COLUMNS.price));

    // Resolve the picture filename for this row.
    let pictureurl = null;
    const imageData = rowImageMap.get(rowNumber);

    if (imageData !== undefined) {
      const { buffer, extension } = imageData;

      if (config.matchMode === 'hash') {
        const hash = hashBuffer(buffer);
        const matchedFilename = hashIndex.get(hash);

        if (matchedFilename) {
          pictureurl = matchedFilename;
        } else {
          unmatchedImages++;
          pictureurl = `${slugify(name)}-row${rowNumber}.${extension}`;
          console.warn(
            `Row ${rowNumber}: could not match the embedded photo to a file in ` +
              `${config.imagesFolderPath}. Using generated name "${pictureurl}" instead. ` +
              'Double check this row.'
          );
        }
      } else {
        // "extract" mode: don't try to match, just save the embedded
        // image into the folder under a generated filename.
        pictureurl = `${slugify(name)}.${extension}`;
        const destination = path.join(config.imagesFolderPath, pictureurl);
        fs.writeFileSync(destination, buffer);
      }
    } else {
      console.warn(`Row ${rowNumber}: no embedded photo found in column B.`);
    }

    await insertProduct({
      name,
      pictureurl,
      material,
      size,
      materialcost,
      time,
      price,
    });
    inserted++;
  }

  console.log(`Done. Inserted ${inserted} row(s).`);
  if (unmatchedImages > 0) {
    console.log(`${unmatchedImages} photo(s) could not be matched by content hash - check the warnings above.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exitCode = 1;
});