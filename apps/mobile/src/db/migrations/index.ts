import type { Migration } from '../migrate';
import { sql as syncStore } from './0001_sync_store';
import { sql as eventDay } from './0002_event_day';

/** Every migration, by file name. Adding a schema change is adding a file and a line here. */
export const MIGRATIONS: readonly Migration[] = [
  { name: '0001_sync_store', sql: syncStore },
  { name: '0002_event_day', sql: eventDay },
];
