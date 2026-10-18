-- The Sunday recap's best pollinator, remembered once chosen: the recap of a week names the same
-- person every time it is read, and the next week's pick rotates away from them. `week` is the
-- week's Sunday (farm day, YYYY-MM-DD); `reason` is the kind of care they were chosen for, never a
-- count. Rows go with the farm, and with the person's account (an account deletion step).
CREATE TABLE recap_pollinators (
  farm_id TEXT NOT NULL REFERENCES farms (id) ON DELETE CASCADE,
  week TEXT NOT NULL,
  person_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  chosen_at INTEGER NOT NULL,
  PRIMARY KEY (farm_id, week)
);
CREATE INDEX recap_pollinators_by_person ON recap_pollinators (person_id);
