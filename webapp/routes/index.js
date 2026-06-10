const express = require('express');
const router = express.Router();
const db = require('../database');
const aiService = require('../services/aiService');

// Home / Login page
router.get('/', (req, res) => {
    res.render('index');
});

// Process Login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
        if (err || !user) {
            return res.render('index', { error: 'Invalid username or password' });
        }
        req.session.user = user;
        if (user.role === 'admin') {
            res.redirect('/admin');
        } else if (user.role === 'assessor') {
            res.redirect('/assessor');
        } else {
            res.redirect(`/student/${user.id}`);
        }
    });
});

// Student Dashboard
router.get('/student/:id', (req, res) => {
    const studentId = req.params.id;

    // Fetch all logbook entries for the projects this student owns
    const query = `
        SELECT e.* 
        FROM logbook_entries e
        JOIN projects p ON e.project_id = p.project_id
        WHERE p.student_id = ?
        ORDER BY e.logdate DESC, e.createdatetime DESC
    `;

    db.all(query, [studentId], (err, entries) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }
        res.render('student_dashboard', { studentId, entries });
    });
});

// Student Submission
router.post('/student/:id/submit', async (req, res) => {
    const studentId = req.params.id;

    // Look up the actual project_id mapped to this student in the projects table
    db.get(`SELECT project_id FROM projects WHERE student_id = ?`, [studentId], async (err, project) => {
        if (err || !project) {
            console.error(err || `No project found for student ID: ${studentId}`);
            return res.status(500).send("No project mapped to this student");
        }

        const projectId = project.project_id;
        const { logdate, logstarthour, logendhour, loghours, lognotes } = req.body;

        // Generate AI metrics
        const aiScore = await aiService.predictScore(Number(loghours), lognotes);
        const aiFeedback = await aiService.generateFeedback(aiScore, lognotes);
        const createdAt = new Date().toISOString();

        const query = `
            INSERT INTO logbook_entries 
            (project_id, logdate, logstarthour, logendhour, loghours, lognotes, createdatetime, ai_score, ai_feedback)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.run(query, [projectId, logdate, logstarthour, logendhour, loghours, lognotes, createdAt, aiScore, aiFeedback], function (err) {
            if (err) {
                console.error(err);
                return res.status(500).send("Failed to save entry");
            }
            res.redirect(`/student/${studentId}`);
        });
    });
});

// Delete Entry
router.post('/student/:studentId/delete/:entryId', (req, res) => {
    const { studentId, entryId } = req.params;
    const query = `DELETE FROM logbook_entries WHERE id = ?`;
    db.run(query, [entryId], function(err) {
        if (err) console.error(err);
        res.redirect(`/student/${studentId}`);
    });
});

// Edit Entry (GET form)
router.get('/student/:studentId/edit/:entryId', (req, res) => {
    const { studentId, entryId } = req.params;
    
    // Fetch all entries for the feed
    const queryAll = `
        SELECT e.* 
        FROM logbook_entries e
        JOIN projects p ON e.project_id = p.project_id
        WHERE p.student_id = ?
        ORDER BY e.logdate DESC, e.createdatetime DESC
    `;
    
    // Fetch specific entry to edit
    const queryOne = `SELECT * FROM logbook_entries WHERE id = ?`;

    db.all(queryAll, [studentId], (err, entries) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }
        db.get(queryOne, [entryId], (err, editEntry) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Database error");
            }
            res.render('student_dashboard', { studentId, entries, editEntry });
        });
    });
});

// Edit Entry (POST update)
router.post('/student/:studentId/edit/:entryId', async (req, res) => {
    const { studentId, entryId } = req.params;
    const { logdate, logstarthour, logendhour, loghours, lognotes } = req.body;

    // Generate NEW AI metrics because the text or hours may have changed
    const aiScore = await aiService.predictScore(Number(loghours), lognotes);
    const aiFeedback = await aiService.generateFeedback(aiScore, lognotes);

    const query = `
        UPDATE logbook_entries 
        SET logdate = ?, logstarthour = ?, logendhour = ?, loghours = ?, lognotes = ?, ai_score = ?, ai_feedback = ?
        WHERE id = ?
    `;

    db.run(query, [logdate, logstarthour, logendhour, loghours, lognotes, aiScore, aiFeedback, entryId], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Failed to update entry");
        }
        res.redirect(`/student/${studentId}`);
    });
});

// Assessor Dashboard - Student List
router.get('/assessor', (req, res) => {
    const query = `
        SELECT u.id as student_id, u.username, u.name as student_name,
               COUNT(e.id) as total_entries,
               SUM(CASE WHEN e.assessor_grade IS NULL THEN 1 ELSE 0 END) as pending_review,
               AVG(e.ai_score) as avg_ai_score
        FROM logbook_entries e
        JOIN projects p ON e.project_id = p.project_id
        JOIN users u ON p.student_id = u.id
        GROUP BY u.id, u.username, u.name
        ORDER BY student_name ASC
    `;

    db.all(query, [], (err, students) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }
        res.render('assessor_dashboard', { students });
    });
});

// Assessor - View Specific Student Entries
router.get('/assessor/student/:id', (req, res) => {
    const studentId = req.params.id;
    const query = `
        SELECT e.*, u.username, u.name as student_name
        FROM logbook_entries e
        JOIN projects p ON e.project_id = p.project_id
        JOIN users u ON p.student_id = u.id
        WHERE u.id = ?
        ORDER BY e.createdatetime DESC
    `;

    db.all(query, [studentId], (err, entries) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }
        res.render('assessor_entries', { entries });
    });
});

// Assessor Grade Submission
router.post('/assessor/grade', (req, res) => {
    const { entry_id, assessor_grade } = req.body;

    const query = `UPDATE logbook_entries SET assessor_grade = ? WHERE id = ?`;
    db.run(query, [assessor_grade, entry_id], function (err) {
        if (err) {
            console.error(err);
            return res.status(500).send("Failed to save grade");
        }
        res.redirect(req.get('Referrer') || '/assessor');
    });
});

// ==========================================
// ADMIN ROUTES & CONTROLLER LOGIC
// ==========================================

// Middleware to authorize admin access
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.redirect('/');
}

// Background training state tracker
let trainingState = {
    status: 'idle', // 'idle', 'training', 'finished', 'error'
    error: null,
    lastRun: null
};

// GET /admin - Render Admin dashboard with user list, rubric list, model setup, and feedback prompt
router.get('/admin', isAdmin, (req, res) => {
    const studentsQuery = `
        SELECT u.id, u.username, u.name, p.project_id 
        FROM users u 
        LEFT JOIN projects p ON u.id = p.student_id 
        WHERE u.role = 'student'
    `;
    const assessorsQuery = `SELECT id, username, name FROM users WHERE role = 'assessor'`;
    const rubricsQuery = `SELECT * FROM logbook_rubrics`;
    const modelQuery = `SELECT * FROM model_setup ORDER BY id DESC LIMIT 1`;
    const promptQuery = `SELECT feedback_prompt FROM system_config ORDER BY id DESC LIMIT 1`;

    db.all(studentsQuery, [], (err, students) => {
        if (err) return res.status(500).send("DB error fetching students");
        db.all(assessorsQuery, [], (err, assessors) => {
            if (err) return res.status(500).send("DB error fetching assessors");
            db.all(rubricsQuery, [], (err, rubrics) => {
                if (err) return res.status(500).send("DB error fetching rubrics");
                db.get(modelQuery, [], (err, modelSetup) => {
                    if (err) return res.status(500).send("DB error fetching model setup");
                    db.get(promptQuery, [], (err, promptRow) => {
                        if (err) return res.status(500).send("DB error fetching prompt config");
                        
                        const defaultPrompt = `You are an AI teaching assistant grading a student's logbook entry.
The student's entry log notes: "{logNotes}"
The AI model predicted a score of {score}/10.0 for this entry.

Generate personalized, constructive feedback (2-3 sentences).
Focus on encouraging the student, highlighting what they did well, and pointing out areas for improvement such as adding more technical depth or reflection if the score is low.`;
                        
                        res.render('admin_dashboard', {
                            students,
                            assessors,
                            rubrics,
                            modelSetup: modelSetup || { rf_estimators: 100, gb_estimators: 100, tfidf_features: 1000 },
                            feedbackPrompt: promptRow ? promptRow.feedback_prompt : defaultPrompt,
                            user: req.session.user
                        });
                    });
                });
            });
        });
    });
});

// POST /admin/user/add - Register new student or assessor
router.post('/admin/user/add', isAdmin, (req, res) => {
    const { username, password, name, role, project_id } = req.body;
    if (!username || !password || !name || !role) {
        return res.status(400).send("Missing required fields");
    }

    db.run(
        `INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)`,
        [username, password, role, name],
        function (err) {
            if (err) {
                console.error(err);
                return res.status(500).send("Failed to create user (username might already exist)");
            }
            const userId = this.lastID;
            
            // If it's a student and a project ID is specified, link them in the projects table
            if (role === 'student' && project_id) {
                db.run(
                    `INSERT INTO projects (project_id, student_id) VALUES (?, ?)`,
                    [Number(project_id), userId],
                    (err) => {
                        if (err) {
                            console.error(err);
                            return res.status(500).send("User created but failed to link project ID");
                        }
                        res.redirect('/admin');
                    }
                );
            } else {
                res.redirect('/admin');
            }
        }
    );
});

// POST /admin/model/update - Update model hyperparameter setup
router.post('/admin/model/update', isAdmin, (req, res) => {
    const { rf_estimators, gb_estimators, tfidf_features } = req.body;
    db.run(
        `INSERT INTO model_setup (rf_estimators, gb_estimators, tfidf_features) VALUES (?, ?, ?)`,
        [Number(rf_estimators), Number(gb_estimators), Number(tfidf_features)],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Failed to update model config");
            }
            res.redirect('/admin');
        }
    );
});

// POST /admin/prompt/update - Update AI feedback prompt template
router.post('/admin/prompt/update', isAdmin, (req, res) => {
    const { feedback_prompt } = req.body;
    if (!feedback_prompt) {
        return res.status(400).send("Prompt cannot be empty");
    }
    db.run(
        `INSERT INTO system_config (feedback_prompt) VALUES (?)`,
        [feedback_prompt],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Failed to update feedback prompt");
            }
            res.redirect('/admin');
        }
    );
});

// POST /admin/model/train - Spawn model retraining script in background
router.post('/admin/model/train', isAdmin, (req, res) => {
    if (trainingState.status === 'training') {
        return res.status(400).json({ status: 'training', message: 'Already training' });
    }

    trainingState.status = 'training';
    trainingState.error = null;

    const { spawn } = require('child_process');
    const path = require('path');
    
    const scriptPath = path.resolve(__dirname, '../ai_service/train_model.py');
    const venvPython = path.resolve(__dirname, '../ai_service/venv/Scripts/python.exe');
    
    console.log(`Spawning retraining process at ${scriptPath} using python ${venvPython}...`);
    
    const proc = spawn(venvPython, [scriptPath], {
        cwd: path.resolve(__dirname, '../ai_service')
    });

    proc.stdout.on('data', (data) => {
        console.log(`[retrain stdout] ${data}`);
    });

    proc.stderr.on('data', (data) => {
        console.error(`[retrain stderr] ${data}`);
    });

    proc.on('close', (code) => {
        console.log(`Retraining finished with exit code ${code}`);
        if (code === 0) {
            trainingState.status = 'finished';
            trainingState.lastRun = new Date().toISOString();
        } else {
            trainingState.status = 'error';
            trainingState.error = `Retraining failed with exit code ${code}`;
        }
    });

    res.json({ status: 'started' });
});

// GET /admin/model/train-status - Fetch current retraining status
router.get('/admin/model/train-status', isAdmin, (req, res) => {
    res.json(trainingState);
});

// POST /admin/rubric/add - Add new rubric item
router.post('/admin/rubric/add', isAdmin, (req, res) => {
    const { rubric_factor, rubric_code, element, element_weightage, element_multiplier } = req.body;
    db.run(
        `INSERT INTO logbook_rubrics (rubric_factor, rubric_code, element, element_weightage, element_multiplier) VALUES (?, ?, ?, ?, ?)`,
        [rubric_factor, rubric_code, element, Number(element_weightage), Number(element_multiplier)],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Failed to add rubric");
            }
            res.redirect('/admin');
        }
    );
});

// POST /admin/rubric/update/:id - Update existing rubric item
router.post('/admin/rubric/update/:id', isAdmin, (req, res) => {
    const rubricId = req.params.id;
    const { rubric_factor, rubric_code, element, element_weightage, element_multiplier } = req.body;
    db.run(
        `UPDATE logbook_rubrics 
         SET rubric_factor = ?, rubric_code = ?, element = ?, element_weightage = ?, element_multiplier = ? 
         WHERE id = ?`,
        [rubric_factor, rubric_code, element, Number(element_weightage), Number(element_multiplier), rubricId],
        (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Failed to update rubric");
            }
            res.redirect('/admin');
        }
    );
});

// POST /admin/rubric/delete/:id - Delete rubric item
router.post('/admin/rubric/delete/:id', isAdmin, (req, res) => {
    const rubricId = req.params.id;
    db.run(`DELETE FROM logbook_rubrics WHERE id = ?`, [rubricId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Failed to delete rubric");
        }
        res.redirect('/admin');
    });
});

module.exports = router;
