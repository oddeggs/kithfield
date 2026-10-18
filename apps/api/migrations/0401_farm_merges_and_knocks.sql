-- Farms a merged-away person lived on, written in the same D1 batch as the merge, so the
-- `person_merged` job can ask each of those farms to move the person's state; removed once done.
CREATE TABLE farm_merges (
  from_person TEXT NOT NULL,
  into_person TEXT NOT NULL,
  farm_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (from_person, into_person, farm_id)
);

-- What knocks for the person on this farm (`FarmNotifications.knockFor`), as JSON; NULL is the
-- default (everything knocks).
ALTER TABLE memberships ADD COLUMN knock_for TEXT;
