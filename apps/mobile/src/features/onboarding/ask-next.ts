import { Platform } from 'react-native';

/** The line under a permission ask on Apple's systems, by the screen that asks. */
export type AppleAskNext = 'onboarding.ask.next' | 'surfaces.ask.next';

/** What says it will ask next, once the farm has asked: the phone's own system. */
export function askNextKey(apple: AppleAskNext) {
  return Platform.OS === 'android' ? ('android.ask.next' as const) : apple;
}
