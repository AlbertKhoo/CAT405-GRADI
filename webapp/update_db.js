const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database/gradi.sqlite');

db.serialize(() => {
    db.run("UPDATE users SET username = 'alice@student.edu' WHERE username = 'student1'");
    db.run("UPDATE users SET username = 'bob@student.edu' WHERE username = 'student2'");
    db.run("UPDATE users SET username = 'drsmith@staff.edu' WHERE username = 'assessor1'");
    console.log('Users updated successfully.');
});

db.close();
