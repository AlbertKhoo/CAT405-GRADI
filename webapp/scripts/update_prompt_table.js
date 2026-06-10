const db = require('../database');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS system_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feedback_prompt TEXT NOT NULL
    )`, (err) => {
        if (err) console.error("Error creating system_config table:", err);
    });

    db.get('SELECT COUNT(*) as count FROM system_config', [], (err, row) => {
        if (err) {
            console.error("Error checking system_config count:", err);
            return;
        }
        if (row && row.count === 0) {
            const defaultPrompt = `You are an AI teaching assistant grading a student's logbook entry.
The student's entry log notes: "{logNotes}"
The AI model predicted a score of {score}/10.0 for this entry.

Generate personalized, constructive feedback (2-3 sentences).
Focus on encouraging the student, highlighting what they did well, and pointing out areas for improvement such as adding more technical depth or reflection if the score is low.`;

            db.run('INSERT INTO system_config (feedback_prompt) VALUES (?)', [defaultPrompt], (err) => {
                if (err) console.error("Error inserting default prompt:", err);
                else console.log("Successfully seeded default feedback prompt in live DB!");
            });
        } else {
            console.log("system_config already has entries. Skipping seeding.");
        }
    });
});
