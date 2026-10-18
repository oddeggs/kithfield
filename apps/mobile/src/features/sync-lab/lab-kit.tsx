import type { Critter } from '@kithfield/contracts';
import type { CritterLook } from '@kithfield/art';
import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';

/* Small pieces the sync lab's panels share. */

/** A titled block of the lab. */
export function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Txt variant="label" accessibilityRole="header">
        {title}
      </Txt>
      {children}
    </View>
  );
}

/** A quiet line under a control: what happened, or what went wrong. */
export function Note({ text }: { readonly text: string | null }) {
  const { palette } = useTheme();
  return text ? (
    <Txt variant="note" multiline color={palette.muted}>
      {text}
    </Txt>
  ) : null;
}

/** The art's look for a critter as the contracts carry it. */
export const lookOf = (critter: Critter): CritterLook => ({
  coat: critter.coat,
  ...(critter.mark ? { mark: critter.mark } : {}),
});

/** A critter for the lab: a species with the default coat and nothing else on. */
export const plainCritter = (species: Critter['species']): Critter => ({
  species,
  coat: 'cocoa',
  mark: null,
  accessory: null,
  outfit: null,
  outfitColor: null,
  companion: null,
  cottage: null,
});

/**
 * Runs one request at a time and keeps the last problem as a line of copy. `run` answers the
 * action's value, or undefined when it failed.
 */
export function useAction() {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      setProblem(null);
      try {
        return await action();
      } catch (error) {
        setProblem(t('syncLab.failed', { error: String(error) }));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [t],
  );
  return { busy, problem, setProblem, run };
}

/** JSON with every object's keys sorted, so the same value reads the same on every machine. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
