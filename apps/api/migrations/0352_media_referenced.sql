-- When a farm event first pointed at the object (a message, a voice note, a link preview). The
-- daily sweep can then delete uploads that were finished but never sent.
ALTER TABLE media_objects ADD COLUMN referenced_at INTEGER;
