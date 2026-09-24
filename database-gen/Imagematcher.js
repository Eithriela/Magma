const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function hashBuffer(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Builds a map of md5(content) -> filename for every file in a folder.
 * This lets us recover the original filename of a photo that was embedded
 * in Excel (which strips filenames) by matching it against the same photo
 * file still sitting on disk.
 */
function buildFileHashIndex(folderPath) {
  const index = new Map();
  const files = fs.readdirSync(folderPath);

  for (const file of files) {
    const fullPath = path.join(folderPath, file);
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) continue;

    const buffer = fs.readFileSync(fullPath);
    const hash = hashBuffer(buffer);
    index.set(hash, file);
  }

  return index;
}

function slugify(text) {
  const slug = String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || 'image';
}

module.exports = { hashBuffer, buildFileHashIndex, slugify };