import { Hono } from 'hono';

import type { AppEnv } from '../env';
import { farmRoutes } from './routes-farm';
import { joiningRoutes } from './routes-joining';

/** Every farm route, mounted at `/v1`. */
export const farmApi = (): Hono<AppEnv> =>
  new Hono<AppEnv>().route('/', joiningRoutes()).route('/', farmRoutes());
