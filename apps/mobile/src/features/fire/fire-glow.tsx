import type { FarmId, FarmState } from '@kithfield/contracts';
import type { Translate } from '@kithfield/i18n';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useFarm } from '../../data';
import { ArtLoop } from '../../ui/art/art-view';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useSession } from '../../ui/session/session';
import { memberOf, useFireCircle } from './use-fire-room';
import { FireTxt } from './fire-text';
import { fireLook } from './look';

/*
 * The fire on the farm, for the farm screen to show: a soft glow and one line, "Mo's by the
 * fire". It is the only signal: no ring, no alert, no badge. The farm scene draws the glow itself
 * (`state: 'fire'`); this is the card under it and the words for its speech bubble.
 */

/** Opens a farm's fire room. */
export const openFire = (farm: FarmId) => router.push({ pathname: '/fire-room', params: { farm } });

/** "Mo's by the fire", "Mo and Bea are by the fire", or null while nobody (else) is. */
export function fireLine(
  t: Translate,
  state: FarmState | null,
  circle: readonly string[],
  me: string | null,
): string | null {
  if (state === null || state.fireLitAt === null) return null;
  const names = circle
    .filter((id) => id !== me)
    .map((id) => memberOf(state, id)?.name)
    .filter((n): n is string => typeof n === 'string');
  const [a, b] = names;
  if (a === undefined) return null;
  if (b === undefined) return t('fire.glow.one', { name: a });
  if (names.length === 2) return t('fire.glow.two', { a, b });
  return t('fire.glow.many', { name: a });
}

/** Whether the farm's fire is lit, and the line about who is by it. */
export function useFireOnFarm(farm: FarmId): {
  readonly lit: boolean;
  readonly line: string | null;
} {
  const { t } = useLocale();
  const state = useFarm(farm)?.state ?? null;
  const circle = useFireCircle(farm);
  const me = useSession().person?.id ?? null;
  return { lit: state?.fireLitAt != null, line: fireLine(t, state, circle, me) };
}

/** The card on the farm while friends sit by the fire: "Come sit if you like. No need to talk." */
export function FireGlowCard({
  farm,
  onOpen,
}: {
  readonly farm: FarmId;
  /** Opens the room its own way (the farm zooms into its fire); straight in otherwise. */
  readonly onOpen?: () => void;
}) {
  const { t } = useLocale();
  const { line } = useFireOnFarm(farm);
  const state = useFarm(farm)?.state ?? null;
  if (line === null) return null;
  return (
    <Press
      onPress={onOpen ?? (() => openFire(farm))}
      radius={22}
      accessibilityRole="button"
      accessibilityLabel={`${line}. ${t('fire.glow.body')}`}
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        padding: 12,
        borderRadius: 22,
        backgroundColor: fireLook.glowCard,
      }}
    >
      <View style={{ width: 52, height: 52, borderRadius: 16, overflow: 'hidden' }}>
        <ArtLoop
          scene="firesmall"
          width={52}
          height={52}
          attrs={{ season: state?.season.season ?? 'spring' }}
        />
      </View>
      <View style={{ flex: 1 }}>
        <FireTxt
          variant="rowTitle"
          color={fireLook.text}
          style={{ fontSize: 16, lineHeight: 19.2 }}
        >
          {line}
        </FireTxt>
        <FireTxt
          variant="caption"
          color={fireLook.sub}
          style={{ fontSize: 13.5, lineHeight: 18.2 }}
        >
          {t('fire.glow.body')}
        </FireTxt>
      </View>
      <FireTxt variant="body" color={fireLook.dim} style={{ fontSize: 22, lineHeight: 24 }}>
        ›
      </FireTxt>
    </Press>
  );
}
