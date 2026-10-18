import * as Haptics from 'expo-haptics';

/**
 * The haptics the app uses, by what happened rather than by strength. The design names none, so
 * these follow the platform: a selection tick for picking among options, a light tap for an action
 * starting, a soft tap for something gentle arriving, a success for something finished. Never a
 * buzz for something someone else did (`10 On the System`: nothing rings, buzzes or badges).
 */
export const haptics = {
  /** A tab, a segment, a chip or a toggle changes; a sheet settles at a new detent. */
  select: () => void Haptics.selectionAsync(),
  /** A long-press opens a menu or the gesture tray; a button starts something lasting. */
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  /** A dewdrop or firefly leaves your hand. */
  soft: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  /** Something you made is done: a seed planted, a plan sprouted. */
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
} as const;

export type Haptic = keyof typeof haptics;
