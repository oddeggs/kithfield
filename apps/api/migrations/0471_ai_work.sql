-- What the AI features made, as an index. Never content: the words live in R2 under `ai/`, so
-- they can be deleted with the thing they came from. Times are epoch milliseconds.

-- A voice note as Whisper heard it, once for every language asked: claimed (`hearing`) by the job
-- that runs Whisper, then `heard` (the words at `ai/voice/<farm>/<seq>/said.json`) or `silent`
-- (nothing to show, never heard again). `claimed_at` names the claim, so only its holder finishes.
CREATE TABLE voice_transcripts (
  farm_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  audio_key TEXT NOT NULL,
  author_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('hearing', 'heard', 'silent')),
  said TEXT,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (farm_id, seq)
);
CREATE INDEX voice_transcripts_author ON voice_transcripts (author_id);
CREATE INDEX voice_transcripts_audio ON voice_transcripts (audio_key);

-- One voice note's caption in one language a friend asked for, at
-- `ai/voice/<farm>/<seq>/<lang>.json`. `silent` is final: nothing was heard, so it is never asked
-- of Whisper again.
CREATE TABLE voice_captions (
  farm_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'vi')),
  audio_key TEXT NOT NULL,
  author_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'ready', 'failed', 'silent')),
  said TEXT,
  asked_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (farm_id, seq, lang)
);
CREATE INDEX voice_captions_author ON voice_captions (author_id);
CREATE INDEX voice_captions_audio ON voice_captions (audio_key);

-- A farm's Sunday letter for the week ending on `week`, in one language. The letter is at
-- `ai/recap/<farm>/<week>/<lang>.json`. `writing` from when the job is queued.
CREATE TABLE recap_letters (
  farm_id TEXT NOT NULL,
  week TEXT NOT NULL,
  lang TEXT NOT NULL CHECK (lang IN ('en', 'vi')),
  state TEXT NOT NULL CHECK (state IN ('writing', 'written', 'failed')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (farm_id, week, lang)
);

-- Whose words went into a week's letter, so withdrawing consent or deleting an account deletes
-- the letters made from them.
CREATE TABLE recap_sources (
  farm_id TEXT NOT NULL,
  week TEXT NOT NULL,
  person_id TEXT NOT NULL,
  PRIMARY KEY (farm_id, week, person_id)
);
CREATE INDEX recap_sources_person ON recap_sources (person_id);

-- When each farm is next looked at for its Sunday letter (Sunday morning in the farm's own time
-- zone). `next_at` is null until the farm's zone has been read; `last_week` is the latest week
-- queued, so a week is never queued twice.
CREATE TABLE recap_schedule (
  farm_id TEXT PRIMARY KEY NOT NULL,
  next_at INTEGER,
  last_week TEXT
);

-- R2 prefixes under `ai/` still to delete: D1 forgets a caption at once (below), and the hourly
-- sweep deletes its words from R2.
CREATE TABLE ai_purge_owed (
  prefix TEXT PRIMARY KEY NOT NULL,
  owed_at INTEGER NOT NULL
);

-- A voice note's media goes when it is unsent, when its author's media is removed with them, or
-- when their account is deleted (the media index row is deleted each time); it is held apart when
-- quarantined or removed by the safety team. Either way its captions and transcript are forgotten
-- in the same statement, and the hourly sweep deletes their words.
CREATE TRIGGER voice_captions_follow_media AFTER DELETE ON media_objects
BEGIN
  INSERT OR IGNORE INTO ai_purge_owed (prefix, owed_at)
    SELECT 'ai/voice/' || farm_id || '/' || seq || '/', CAST(strftime('%s', 'now') AS INTEGER) * 1000
    FROM voice_transcripts WHERE audio_key = OLD.key
    UNION SELECT 'ai/voice/' || farm_id || '/' || seq || '/', CAST(strftime('%s', 'now') AS INTEGER) * 1000
    FROM voice_captions WHERE audio_key = OLD.key;
  DELETE FROM voice_transcripts WHERE audio_key = OLD.key;
  DELETE FROM voice_captions WHERE audio_key = OLD.key;
END;

CREATE TRIGGER voice_captions_follow_quarantine AFTER UPDATE OF quarantined_at ON media_objects
WHEN NEW.quarantined_at IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO ai_purge_owed (prefix, owed_at)
    SELECT 'ai/voice/' || farm_id || '/' || seq || '/', CAST(strftime('%s', 'now') AS INTEGER) * 1000
    FROM voice_transcripts WHERE audio_key = NEW.key
    UNION SELECT 'ai/voice/' || farm_id || '/' || seq || '/', CAST(strftime('%s', 'now') AS INTEGER) * 1000
    FROM voice_captions WHERE audio_key = NEW.key;
  DELETE FROM voice_transcripts WHERE audio_key = NEW.key;
  DELETE FROM voice_captions WHERE audio_key = NEW.key;
END;
