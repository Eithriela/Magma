require('dotenv').config();
const path = require('path');

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  excelFilePath: path.resolve(required('EXCEL_FILE_PATH')),
  imagesFolderPath: path.resolve(required('IMAGES_FOLDER_PATH')),
  sheetName: process.env.SHEET_NAME || null,
  headerRow: parseInt(process.env.HEADER_ROW || '1', 10),
  matchMode: process.env.MATCH_MODE === 'extract' ? 'extract' : 'hash',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME'),
    table: process.env.DB_TABLE || 'products',
  },
};