-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL, -- 'student' or 'assessor'
    name TEXT NOT NULL
);

-- Projects table (linking student to a specific ProjectID)
CREATE TABLE IF NOT EXISTS projects (
    project_id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL,
    FOREIGN KEY(student_id) REFERENCES users(id)
);

-- Logbook entries
CREATE TABLE IF NOT EXISTS logbook_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    logdate TEXT,
    logstarthour TEXT,
    logendhour TEXT,
    loghours REAL,
    lognotes TEXT,
    logremarks TEXT,
    logreviewed TEXT,
    logrevieweddate TEXT,
    createdatetime TEXT,
    ai_score INTEGER,
    ai_feedback TEXT,
    assessor_grade INTEGER,
    FOREIGN KEY(project_id) REFERENCES projects(project_id)
);

-- Logbook graded records
CREATE TABLE IF NOT EXISTS logbook_graded (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    assessor_type TEXT,
    element TEXT,
    element_code TEXT,
    grade_marks REAL,
    grade_multiplier REAL,
    createdatetime TEXT
);

-- Logbook rubrics
CREATE TABLE IF NOT EXISTS logbook_rubrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rubric_factor TEXT,
    rubric_code TEXT,
    element TEXT,
    element_weightage REAL,
    element_multiplier REAL
);

-- Model setup table
CREATE TABLE IF NOT EXISTS model_setup (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rf_estimators INTEGER DEFAULT 100,
    gb_estimators INTEGER DEFAULT 100,
    tfidf_features INTEGER DEFAULT 1000,
    rf_rmse REAL,
    gb_rmse REAL,
    ensemble_rmse REAL,
    last_trained TEXT
);

-- System config table
CREATE TABLE IF NOT EXISTS system_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_prompt TEXT NOT NULL
);
