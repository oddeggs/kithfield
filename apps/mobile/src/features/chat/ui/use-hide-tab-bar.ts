import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback } from 'react';

/**
 * Asks the tab bar to step aside while this screen shows: a chat draws its own bottom (the
 * composer), and the viewer and shared media run to the edge. The bar comes back on leaving.
 */
export function useHideTabBar(): void {
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      const tabs = navigation.getParent();
      tabs?.setOptions({ tabBarStyle: { display: 'none' } });
      return () => tabs?.setOptions({ tabBarStyle: undefined });
    }, [navigation]),
  );
}
