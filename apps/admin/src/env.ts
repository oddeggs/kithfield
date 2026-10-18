/** Everything `wrangler.jsonc` binds for an environment. */
export type Bindings = {
  readonly ENVIRONMENT: 'dev' | 'prd';
  /** The API Worker, which serves the admin API at `/api/admin/v1/*` and checks every Access token. */
  readonly API: Fetcher;
};

export type AdminEnv = { Bindings: Bindings };
