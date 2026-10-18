import { AccessibilityInfo } from 'react-native';

/**
 * Reads `text` out after whatever VoiceOver is saying, never cutting in (`12 States`: announcements
 * are polite, never interrupting). Android's live regions do this by themselves; iOS needs it said.
 */
export function announcePolitely(text: string): void {
  AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
}
