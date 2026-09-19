CREATE TABLE diagnostics (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT,
    payload TEXT NOT NULL
);
CREATE INDEX diagnostics_job ON diagnostics(job_id, sequence DESC);
PRAGMA user_version = 3;
