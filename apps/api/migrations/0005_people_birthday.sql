-- The person's birthday, `MM-DD` (never a year), or null when they haven't shared it. Friends see
-- it on the farm; it is set with the name and critter through `PATCH /v1/me/profile`.
ALTER TABLE people ADD COLUMN birthday TEXT;
