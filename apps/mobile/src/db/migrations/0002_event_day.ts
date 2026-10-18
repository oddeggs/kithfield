/** Each event's farm-time day, as the farm stamps it at commit. Null for events from before it. */
export const sql = `ALTER TABLE events ADD COLUMN day TEXT;`;
