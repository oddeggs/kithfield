-- The audit log is kept 2 years. Entries younger than that still can't be deleted; the daily job
-- deletes older ones.
DROP TRIGGER audit_log_no_delete;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
WHEN OLD.at > unixepoch() * 1000 - 63072000000
BEGIN
  SELECT RAISE(ABORT, 'the audit log is append-only');
END;
