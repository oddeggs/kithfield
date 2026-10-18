import type { FarmId, RejectReason } from '@kithfield/contracts';
import { useCallback, useEffect } from 'react';

import { useDataClient, useRejections, useSend } from '../../data';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics, type Haptic } from '../../ui/motion/haptics';

/** Writes made from a gesture screen, so the farm's later refusals can be explained here. */
const ours = new Set<string>();

export interface GestureSendOptions {
  /** The haptic as it leaves your hand; none for writes that aren't care. */
  readonly haptic?: Haptic;
  /** A line confirming it went, in the toast. */
  readonly sent?: string;
  readonly icon?: string;
}

/** The copy for a refusal, from the farm or from the shared rules on the phone. */
export function useRejectCopy(): (reason: RejectReason) => string {
  const { t } = useLocale();
  return useCallback((reason: RejectReason) => t(`gestures.reject.${reason}`), [t]);
}

/**
 * Makes a write on a farm through the outbox, exactly as the contract has it. The shared rules
 * check it first: when they say no, nothing is queued and the reason shows in a toast. A write
 * the farm refuses later is explained by `useGestureRejections`. Answers whether it was queued.
 */
export function useGestureSend(
  farm: FarmId,
): (kind: string, payload: unknown, options?: GestureSendOptions) => Promise<boolean> {
  const send = useSend(farm);
  const toast = useToast();
  const reject = useRejectCopy();
  return useCallback(
    async (kind, payload, options = {}) => {
      const result = await send(kind, payload);
      if (result.status === 'refused') {
        toast.show(reject(result.reason));
        return false;
      }
      ours.add(result.opId);
      if (options.haptic) haptics[options.haptic]();
      if (options.sent) toast.show(options.sent, options.icon);
      return true;
    },
    [send, toast, reject],
  );
}

/** Notes a write made outside `useGestureSend` (another farm's, when forwarding) as ours. */
export const markOurs = (opId: string): void => {
  ours.add(opId);
};

/**
 * Explains, once, each write from a gesture screen that the farm refused (a second knock the same
 * day, a firefly for someone who has left), then lets the outbox forget it.
 */
export function useGestureRejections(): void {
  const rejections = useRejections();
  const client = useDataClient();
  const toast = useToast();
  const reject = useRejectCopy();
  useEffect(() => {
    for (const r of rejections) {
      if (!ours.has(r.opId)) continue;
      ours.delete(r.opId);
      toast.show(reject(r.reason));
      void client.dismissRejection(r.opId);
    }
  }, [rejections, client, toast, reject]);
}
