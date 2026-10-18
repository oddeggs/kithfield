import type { D1Migration } from 'cloudflare:test';

import type { MediaEnv } from '../src/serve';
import type * as main from '../src/index';

// Types the `env` and `exports` that `cloudflare:workers` provides inside the test runtime.
declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof main;
    }
    interface Env extends MediaEnv {
      /** The API's migration files, read by `vitest.config.ts`. */
      readonly TEST_MIGRATIONS: D1Migration[];
    }
  }
}
