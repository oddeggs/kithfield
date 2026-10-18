import { Hono } from 'hono';

import type { SessionEnv } from '../auth';
import './merge';
import { farmRoutes } from './routes-farm';
import { joiningRoutes } from './routes-joining';
import { meRoutes } from './routes-me';

/** Every farm route, mounted at `/v1`. */
export const farmApi = (): Hono<SessionEnv> =>
  new Hono<SessionEnv>()
    .route('/', meRoutes())
    .route('/', joiningRoutes())
    .route('/', farmRoutes());
