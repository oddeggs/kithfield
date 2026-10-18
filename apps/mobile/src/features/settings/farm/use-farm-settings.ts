import type { FarmId, FarmState, MemberState, Role } from '@kithfield/contracts';
import { useCallback } from 'react';

import { useFarm, useOpenFarm, useSend } from '../../../data';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { haptics } from '../../../ui/motion/haptics';
import { useSession } from '../../../ui/session/session';

export interface FarmSettings {
  /** The farm as this phone holds it, its own pending writes drawn in; null until read. */
  readonly state: FarmState | null;
  readonly me: MemberState | null;
  readonly role: Role | null;
  readonly isKeeper: boolean;
  /** Keepers and helpers: invite links. */
  readonly canInvite: boolean;
  /** A write on the farm. Answers whether it was queued; a refusal is explained in a toast. */
  readonly write: (kind: string, payload: unknown) => Promise<boolean>;
}

/**
 * One farm for its settings screens: keeps its socket open while shown, and says what the person
 * may change there. Keepers rename, change the link and remove; helpers invite.
 */
export function useFarmSettings(farm: FarmId): FarmSettings {
  useOpenFarm(farm);
  const replica = useFarm(farm);
  const send = useSend(farm);
  const toast = useToast();
  const { t } = useLocale();
  const { person } = useSession();
  const state = replica?.state ?? null;
  const me = state?.members.find((m) => m.person === person?.id) ?? null;
  const role = me?.role ?? null;
  const write = useCallback(
    async (kind: string, payload: unknown) => {
      try {
        const result = await send(kind, payload);
        if (result.status === 'queued') {
          haptics.select();
          return true;
        }
      } catch {
        // Falls through to the same gentle line.
      }
      toast.show(t('settings.failed'));
      return false;
    },
    [send, toast, t],
  );
  return {
    state,
    me,
    role,
    isKeeper: role === 'keeper',
    canInvite: role === 'keeper' || role === 'helper',
    write,
  };
}
