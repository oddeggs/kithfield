-- Farm themes a farm owns: covered once by friends' chip-in, kept forever.
CREATE TABLE farm_themes (
  farm_id TEXT NOT NULL,
  theme TEXT NOT NULL,
  chip_in_id TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (farm_id, theme)
);
