import type { CottageDO } from './cottage/cottage-object';
import type { FarmDO } from './farm/farm-object';

/**
 * Secrets the Worker expects, by name. Values live in Wrangler secrets (deployed) or `.dev.vars`
 * (local, ignored by git); `.dev.vars.example` lists the same names.
 */
export const secretNames = [
  // Expo's enhanced push security: sent with every push request once it is turned on.
  'EXPO_ACCESS_TOKEN',
] as const;
export type SecretName = (typeof secretNames)[number];

/** A secret is absent until it has been set for the environment, so readers must handle that. */
export type Secrets = { readonly [K in SecretName]?: string };

export type EnvironmentName = 'dev' | 'prd';

/** Everything `wrangler.jsonc` binds for an environment, plus the secrets. */
export type Bindings = Secrets & {
  readonly ENVIRONMENT: EnvironmentName;
  readonly COMMIT_SHA: string;
  /** One farm object per farm or visit. */
  readonly FARM: DurableObjectNamespace<FarmDO>;
  /** One cottage object per person. */
  readonly COTTAGE: DurableObjectNamespace<CottageDO>;
  readonly DB: D1Database;
  /** Photos, video, voice notes, files and export bundles. */
  readonly MEDIA: R2Bucket;
  /** Email Sending from kithfield.com, such as sign-in codes. */
  readonly EMAIL: SendEmail;
  readonly PUSH_QUEUE: Queue;
  readonly MEDIA_QUEUE: Queue;
  readonly AI_QUEUE: Queue;
  readonly DELETION_QUEUE: Queue;
};

export type AppEnv = {
  Bindings: Bindings;
};
