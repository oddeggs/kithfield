-- What a person wishes for. Friends on a shared farm can read it; nobody is told who looked.
CREATE TABLE wishlists (
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (person_id, item)
);
