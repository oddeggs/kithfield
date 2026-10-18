-- Whether giving a gift is what made its recipient own the item (they may own it already, from
-- before), so a claim the farm then refuses takes back only what it gave.
ALTER TABLE gifts ADD COLUMN granted INTEGER NOT NULL DEFAULT 0;
