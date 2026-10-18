-- People and their sign-in records. Better Auth owns these tables under the names it is configured
-- with in `src/auth/options.ts`; `src/auth/schema.test.ts` checks them against Better Auth's own
-- migrator. Better Auth writes its times as ISO 8601 text and its booleans as 0/1; columns Kithfield
-- adds hold epoch milliseconds.

-- A person: Better Auth's user. `id` is the person id everywhere. An anonymous person has a
-- placeholder email and `is_anonymous = 1` until they sign in with Apple, Google or an email code.
CREATE TABLE people (
  id TEXT NOT NULL PRIMARY KEY,
  -- The name the identity provider gave, if any. Never shown; `display_name` is what friends see.
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL,
  image TEXT,
  created_at DATE NOT NULL,
  updated_at DATE NOT NULL,
  is_anonymous INTEGER,
  display_name TEXT,
  -- The critter's look as JSON, set during onboarding.
  critter TEXT,
  -- 1 once the age check passed. A person under the minimum age is deleted, never kept.
  age_ok INTEGER,
  -- The version (its date, YYYY-MM-DD) of the Terms accepted, and when.
  terms_version TEXT,
  terms_at INTEGER,
  -- Set while an account deletion waits out its 30 days.
  deleted_at INTEGER
);

CREATE TABLE sessions (
  id TEXT NOT NULL PRIMARY KEY,
  expires_at DATE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at DATE NOT NULL,
  updated_at DATE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE
);
CREATE INDEX sessions_person_id_idx ON sessions (person_id);

-- One row per identity: `provider_id` is apple or google, `account_id` the provider's subject.
-- Email codes need no row; the verified email on `people` is the identity.
CREATE TABLE accounts (
  id TEXT NOT NULL PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  person_id TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at DATE,
  refresh_token_expires_at DATE,
  scope TEXT,
  password TEXT,
  created_at DATE NOT NULL,
  updated_at DATE NOT NULL
);
CREATE INDEX accounts_person_id_idx ON accounts (person_id);
CREATE UNIQUE INDEX accounts_provider_account_idx ON accounts (provider_id, account_id);

-- Pending email codes, stored hashed.
CREATE TABLE verifications (
  id TEXT NOT NULL PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at DATE NOT NULL,
  created_at DATE NOT NULL,
  updated_at DATE NOT NULL
);
CREATE INDEX verifications_identifier_idx ON verifications (identifier);

-- Better Auth's per-address request limits on the sign-in endpoints.
CREATE TABLE rate_limits (
  id TEXT NOT NULL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  last_request BIGINT NOT NULL
);
