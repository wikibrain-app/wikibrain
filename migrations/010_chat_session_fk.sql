-- Reviewer suggestion: add a foreign key and index on ingest_jobs.session_id.
ALTER TABLE ingest_jobs ADD CONSTRAINT ingest_jobs_session_fk FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL NOT VALID;
CREATE INDEX IF NOT EXISTS ingest_jobs_session ON ingest_jobs (session_id);
