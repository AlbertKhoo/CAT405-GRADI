const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, 'gradi.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database at:', dbPath, err.message);
    } else {
        console.log('Successfully connected to SQLite database at:', dbPath);
    }
});

module.exports = db;
