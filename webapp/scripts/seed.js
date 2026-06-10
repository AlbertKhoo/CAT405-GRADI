const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const aiService = require('../services/aiService');

const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../database/gradi.sqlite');
const schemaPath = path.resolve(__dirname, '../database/schema.sql');
const datasetDir = path.resolve(__dirname, '../../dataset');

// Remove existing DB to start fresh
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error opening database " + err.message);
        process.exit(1);
    }
});

const schema = fs.readFileSync(schemaPath, 'utf8');

db.exec(schema, (err) => {
    if (err) {
        console.error("Error executing schema " + err.message);
        process.exit(1);
    }

    console.log("Schema executed successfully. Seeding data...");
    seedData();
});

function readExcel(filename) {
    const filePath = path.join(datasetDir, filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        return [];
    }
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
}

function normalizeDate(dateStr) {
    if (typeof dateStr === 'number') {
        const date = new Date(Math.round((dateStr - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }
    return dateStr;
}

function formatExcelTime(timeVal) {
    if (typeof timeVal === 'number') {
        let totalSeconds = Math.round(timeVal * 24 * 3600);
        let hours = Math.floor(totalSeconds / 3600);
        let mins = Math.floor((totalSeconds % 3600) / 60);
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
    return timeVal;
}

function seedData() {
    db.serialize(() => {
        // 1. Seed users
        const insertUser = db.prepare(`INSERT INTO users (id, username, password, role, name) VALUES (?, ?, ?, ?, ?)`);
        // We'll create some default users
        insertUser.run(1, 'student1', 'password', 'student', 'Alice Student');
        insertUser.run(2, 'student2', 'password', 'student', 'Bob Student');
        insertUser.run(3, 'assessor1', 'password', 'assessor', 'Dr. Smith Assessor');
        insertUser.run(4, 'admin@gradi.edu', 'password', 'admin', 'System Admin');
        insertUser.finalize();

        // Seed default model setup config
        db.run(`INSERT INTO model_setup (rf_estimators, gb_estimators, tfidf_features, rf_rmse, gb_rmse, ensemble_rmse, last_trained) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [100, 100, 1000, 1.4782, 1.5486, 1.4863, '2026-06-10 08:00:00']);

        // Seed default feedback prompt config
        const defaultPrompt = `You are an AI teaching assistant grading a student's logbook entry.
The student's entry log notes: "{logNotes}"
The AI model predicted a score of {score}/10.0 for this entry.

Generate personalized, constructive feedback (2-3 sentences).
Focus on encouraging the student, highlighting what they did well, and pointing out areas for improvement such as adding more technical depth or reflection if the score is low.`;
        db.run(`INSERT INTO system_config (feedback_prompt) VALUES (?)`, [defaultPrompt]);

        // 2. Seed projects (Map some ProjectIDs to student1 [17592, 17593, 17594, 542])
        const insertProj = db.prepare(`INSERT INTO projects (project_id, student_id) VALUES (?, ?)`);
        insertProj.run(17594, 1);
        insertProj.run(17593, 1);
        insertProj.run(17592, 2);
        insertProj.run(542, 1);
        insertProj.run(543, 2);
        insertProj.finalize();

        // 3. Seed logbook rubrics
        const rubrics = readExcel('logbook_rubrics.xlsx');
        if (rubrics.length > 0) {
            const insertRubric = db.prepare(`INSERT INTO logbook_rubrics (rubric_factor, rubric_code, element, element_weightage, element_multiplier) VALUES (?, ?, ?, ?, ?)`);
            rubrics.forEach(r => {
                insertRubric.run(r.RubricFactor, r.RubricCode, r.Element, r.ElementWeightage, r.ElementMultiplier);
            });
            insertRubric.finalize();
            console.log(`Seeded ${rubrics.length} rubrics.`);
        }

        // 4. Seed logbook graded
        const graded = readExcel('logbook_graded.xlsx');
        if (graded.length > 0) {
            const insertGraded = db.prepare(`INSERT INTO logbook_graded (project_id, assessor_type, element, element_code, grade_marks, grade_multiplier, createdatetime) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            graded.forEach(g => {
                insertGraded.run(g.ProjectID, g.AssessorType, g.Element, g.ElementCode, g.GradeMarks, g.GradeMultiplier, g.CreateDateTime);
            });
            insertGraded.finalize();
            console.log(`Seeded ${graded.length} graded records.`);
        }

        // 5. Seed logbook entries
        const entries = readExcel('logbook_entries.xlsx');
        if (entries.length > 0) {
            const insertEntry = db.prepare(`INSERT INTO logbook_entries (project_id, logdate, logstarthour, logendhour, loghours, lognotes, logremarks, logreviewed, logrevieweddate, createdatetime, ai_score, ai_feedback) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            
            (async () => {
                let count = 0;
                for (let e of entries) {
                    db.run(`INSERT OR IGNORE INTO projects (project_id, student_id) VALUES (?, ?)`, [e.ProjectID, 1]);

                    const startHour = formatExcelTime(e.LogStartHour);
                    const endHour = formatExcelTime(e.LogEndHour);
                    const notes = e.LogNotes || "";
                    const hours = Number(e.LogHours) || 0;
                    
                    const aiScore = await aiService.predictScore(hours, notes);
                    const aiFeedback = await aiService.generateFeedback(aiScore, notes);

                    insertEntry.run(
                        e.ProjectID,
                        normalizeDate(e.Logdate),
                        startHour,
                        endHour,
                        hours,
                        notes,
                        e.LogRemarks,
                        e.LogReviewed,
                        e.LogReviewedDate,
                        e.CreateDateTime,
                        aiScore,
                        aiFeedback
                    );
                    count++;
                }
                insertEntry.finalize();
                console.log(`Seeded ${count} logbook entries.`);
                db.close((err) => {
                    if (err) console.error(err.message);
                    console.log('Database seeding completed. DB closed.');
                });
            })();
        } else {
            db.close((err) => {
                if (err) console.error(err.message);
                console.log('Database seeding completed. DB closed.');
            });
        }
    });
}
