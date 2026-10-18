import { DurableObject } from 'cloudflare:workers';

import type { Bindings } from '../env';

/** One per farm or visit: the event log, derived farm tables, search, presence and alarms. */
export class FarmDO extends DurableObject<Bindings> {}
