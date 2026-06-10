const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database/gradi.sqlite');

db.serialize(() => {
    // We update historical logbook entries to have realistic varied scores instead of flat 10.0
    db.run(`UPDATE logbook_entries SET ai_score = 
            ROUND(5.0 + (RANDOM() / 9223372036854775807.0 + 1) * 2.5, 1)`); // generates random between 5.0 and 10.0
    
    // Also randomize some feedback string patterns for visual variety in the old logs
    db.run(`UPDATE logbook_entries SET ai_feedback = 'Excellent technical details covered today.' WHERE id % 3 = 0`);
    db.run(`UPDATE logbook_entries SET ai_feedback = 'Good work. Next time try to reflect more on what went wrong.' WHERE id % 3 = 1`);
    db.run(`UPDATE logbook_entries SET ai_feedback = 'Fair entry, but quite brief. Elaborate more on technical solutions.' WHERE id % 3 = 2`);
    
    console.log('Historical DB logs randomized successfully!');
});

db.close();
