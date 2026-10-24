require('dotenv').config();
const mysql = require('mysql2/promise');

// Connection pool = reusable set of connections to MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'library_db',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,           // return DATE columns as 'YYYY-MM-DD' strings
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});
module.exports = pool;
