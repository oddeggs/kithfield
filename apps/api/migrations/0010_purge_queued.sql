-- When the daily job last put the person's purge on the deletion queue. The job takes those queued
-- least lately first, so purges that keep failing never hold back the rest.
ALTER TABLE people ADD COLUMN purge_queued_at INTEGER;
