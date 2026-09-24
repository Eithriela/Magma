const mysql = require('mysql2/promise');
const config = require('./Config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
});

async function insertProduct(product) {
  const sql = `INSERT INTO ${config.db.table}
    (name, pictureurl, material, size, materialcost, time, price)
    VALUES (?, ?, ?, ?, ?, ?, ?)`;

  const params = [
    product.name,
    product.pictureurl,
    product.material,
    product.size,
    product.materialcost,
    product.time,
    product.price,
  ];

  const [result] = await pool.execute(sql, params);
  return result.insertId;
}

module.exports = { pool, insertProduct };