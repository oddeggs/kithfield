-- Each person's answer for each AI feature that sends words or voices out (`PUT
-- /v1/me/consents/:feature`): whether they allowed it, the consent text version they answered and
-- when. `forgotten_at` is when they last asked for what was already sent to be deleted (`POST
-- /v1/me/consents/:feature/forget`). Times are epoch milliseconds; rows go with the person.
CREATE TABLE consents (
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK (feature IN ('captions', 'recap')),
  allowed INTEGER NOT NULL,
  text_version TEXT NOT NULL,
  at INTEGER NOT NULL,
  forgotten_at INTEGER,
  PRIMARY KEY (person_id, feature)
);
