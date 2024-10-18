// db.js
const mysql = require('mysql2');

// MySQL connection setup using createConnection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '12345',
  database: 'mydatabase',
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to database');
});

module.exports = db;
