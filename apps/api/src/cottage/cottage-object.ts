import { DurableObject } from 'cloudflare:workers';

import type { Bindings } from '../env';

/** One per person: the chat list, waiting counts, the push budget and device push tokens. */
export class CottageDO extends DurableObject<Bindings> {}
