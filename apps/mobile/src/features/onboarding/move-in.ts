import type {
  CreateFarmRequest,
  CreateFarmResponse,
  Critter,
  JoinRequest,
  MeProfileUpdate,
} from '@kithfield/contracts';

import { clearDraft, readDraft, writeDraft, type DraftStore } from './draft';
import type { Path } from './flow';

export interface MoveInDeps {
  readonly store: DraftStore;
  /** `POST /v1/invites/:code/join`. */
  readonly join: (code: string, join: JoinRequest) => Promise<unknown>;
  /** `POST /v1/farms`. */
  readonly createFarm: (farm: CreateFarmRequest) => Promise<CreateFarmResponse>;
  /** `PATCH /v1/me/profile`. */
  readonly updateProfile: (update: MeProfileUpdate) => Promise<unknown>;
}

export class NoDraft extends Error {
  constructor() {
    super('No critter was chosen on this phone');
    this.name = 'NoDraft';
  }
}

/**
 * Moving in with the chosen name and critter. Joining a friend's farm joins first and only then
 * writes the profile, so a full farm or a gone invite leaves the person outside. Starting a farm
 * keeps the choice on the phone until the farm is planted (`plantFirstFarm`); until then the person
 * is not let through.
 */
export async function moveIn(
  person: string,
  path: Path,
  me: { readonly name: string; readonly critter: Critter },
  deps: MoveInDeps,
): Promise<void> {
  if (path.kind === 'join') {
    await deps.join(path.code, { name: me.name, critter: me.critter });
    await deps.updateProfile({ name: me.name, critter: me.critter });
    return;
  }
  await writeDraft(deps.store, { person, name: me.name, critter: me.critter });
}

/**
 * Plants the first farm: the person becomes the critter they chose (the server plants farms only
 * for someone with a profile), the farm is planted, and only then is the draft dropped, which is
 * what lets the person through.
 */
export async function plantFirstFarm(
  person: string,
  farm: CreateFarmRequest,
  deps: MoveInDeps,
): Promise<CreateFarmResponse> {
  const draft = readDraft(deps.store, person);
  if (!draft) throw new NoDraft();
  await deps.updateProfile({ name: draft.name, critter: draft.critter });
  const planted = await deps.createFarm(farm);
  await clearDraft(deps.store).catch(() => undefined);
  return planted;
}
