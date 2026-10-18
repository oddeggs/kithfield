import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Each test file starts from an empty local database with the API's migrations applied.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
