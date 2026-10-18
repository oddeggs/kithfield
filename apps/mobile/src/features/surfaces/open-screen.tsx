import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../ui/theme/theme-provider';
import { farmRoutes } from '../farm/routes';
import { useValley } from '../farm/valley-store';
import { targetOf } from './links';

/**
 * Where a widget, a Live Activity, the share sheet or a push lands: it shows the farm, a
 * friend's card, a plan, or the fire, then gets out of the way. Nothing is drawn meanwhile but
 * the background.
 */
export function SurfaceOpen() {
  const params = useLocalSearchParams();
  const valley = useValley();
  const { palette } = useTheme();
  const target = targetOf(params);
  const ready = valley.status !== 'loading';

  useEffect(() => {
    if (!ready) return;
    const go = async () => {
      if (target === null || target.to === 'share') {
        router.replace(farmRoutes.home());
        return;
      }
      const lives = valley.farms.some((f) => f.farm === target.farm);
      if (target.to === 'plan') {
        router.replace(farmRoutes.plan(target.farm, target.seed));
        return;
      }
      if (!lives) {
        // A visit has no farm to show: its chat is where it lives.
        router.replace(farmRoutes.chat(target.farm));
        return;
      }
      await valley.choose(target.farm);
      router.replace(farmRoutes.home());
      if (target.to === 'critter') router.push(farmRoutes.critter(target.farm, target.person));
    };
    void go();
    // Once per link.
  }, [ready, params]);

  return <View style={{ flex: 1, backgroundColor: palette.background }} />;
}
