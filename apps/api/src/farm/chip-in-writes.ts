import {
  type ArtId,
  type CommandResult,
  type GiftPayload,
  type OpId,
  type PersonId,
  RESTORATION_RULES_VERSION,
} from '@kithfield/contracts';

import type { FarmHost } from './host';

/*
 * What the farm writes once friends' chip-in is covered: the gift, on behalf of whoever started
 * the chip-in, and a farm theme switching on, with no actor. Each once per op id (made from the
 * chip-in), so telling the farm twice writes once.
 */

const finish = async (
  host: FarmHost,
  written: { result: CommandResult; event: Parameters<FarmHost['publish']>[0][number] | null },
) => {
  if (written.event !== null) {
    host.publish([written.event]);
    await host.settle([written.event]);
  }
  return written.result;
};

/** `gift {given, chipIn, with}` on behalf of the starter, who must still live here. */
export const chipInGift = (
  host: FarmHost,
  opId: OpId,
  starter: PersonId,
  payload: Extract<GiftPayload, { action: 'given' }>,
) =>
  finish(
    host,
    host.farm.once(opId, host.now(), () => {
      const state = host.farm.state;
      if (state === null) return 'not_found';
      const actor = host.farm.actorOf(starter);
      const members = new Set(state.members.map((m) => m.person));
      if (!members.has(actor)) return 'not_member';
      if (!members.has(host.farm.actorOf(payload.to))) return 'not_found';
      return { actor, kind: 'gift', payload };
    }),
  );

/**
 * `settings_changed {theme}` written by the farm itself, once the theme is covered. Farm-written
 * themes come with the rules that brought the restoration project; a farm on older rules answers
 * `not_allowed`, the theme stays owned, and a keeper switches it on.
 */
export const chipInTheme = (host: FarmHost, opId: OpId, theme: ArtId) =>
  finish(
    host,
    host.farm.once(opId, host.now(), () => {
      const state = host.farm.state;
      if (state === null || state.kind === 'visit') return 'not_found';
      if (state.rulesVersion < RESTORATION_RULES_VERSION) return 'not_allowed';
      return { actor: null, kind: 'settings_changed', payload: { setting: 'theme', theme } };
    }),
  );
