import { NavigationContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Whether the app is in the foreground. Frame callbacks stop when it is not. */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/**
 * Whether the screen this is drawn in is the one showing: false on a hidden tab or under a
 * pushed screen. Outside a navigator (a root overlay) it is always showing.
 */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const onFocus = navigation.addListener('focus', () => setFocused(true));
    const onBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      onFocus();
      onBlur();
    };
  }, [navigation]);
  return focused;
}

/** Whether moving art should run now: its screen is showing and the app is in front. */
export function useArtVisible(): boolean {
  const active = useAppActive();
  const focused = useScreenFocused();
  return active && focused;
}
