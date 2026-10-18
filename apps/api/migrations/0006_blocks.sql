-- Who a person has blocked. Between two people where either blocked the other no visit opens, no
-- gate gesture, trade or push from one reaches the other, and the gate doesn't show one to the
-- other. Never disclosed to the blocked person. A row goes with the blocker's account; the blocked
-- id carries no foreign key, so a blocker still sees the entry (nameless) after the other's
-- account is deleted. `at` is epoch milliseconds.
CREATE TABLE blocks (
  blocker_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_by_blocked ON blocks (blocked_id);
