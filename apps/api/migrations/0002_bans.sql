-- Account bans. Moderation writes them; sign-in and socket tokens read them. A ban with scope
-- `account` refuses new sessions and socket tokens until `until` (epoch ms), or for good when null.
-- No foreign key: a ban outlives the person it names.
CREATE TABLE bans (
  person_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  until INTEGER,
  reason TEXT NOT NULL,
  PRIMARY KEY (person_id, scope)
);
