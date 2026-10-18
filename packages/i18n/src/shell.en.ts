import type { EnCatalogue } from './catalogue-types';

/**
 * The app's frame: the tab bar, sheets, the shared bubble states and the screens every feature
 * falls back on. Tab names follow the tab bar in `01 Foundations` and `12 States`.
 */
export const shellEn = {
  'shell.tab.farm': 'Farm',
  'shell.tab.chat': 'Chats',
  'shell.tab.seedBed': 'Seed bed',
  'shell.tab.you': 'You',
  /** Read by VoiceOver for a tab's honey dot. A dot never counts anything. */
  'shell.tab.somethingNew': 'Something new',
  /** The grabber at the top of a sheet. */
  'shell.sheet.handle': 'Sheet handle',
  'shell.sheet.handleHint': 'Swipe up or down to resize',
  'shell.sheet.close': 'Close',
  /** A quiet note's header: the sender's name, then the note's promise. */
  'shell.bubble.quietNote': '{name} · no reply needed',
  /** Under a bubble that didn't send; tapping it sends again. */
  'shell.bubble.failed': 'Didn’t send · Try again',
  /** The writing indicator in a chat: a friend's critter writing a letter. */
  'shell.bubble.writing': '{name} is writing a letter…',
  /** A support code under a full-screen error, shown small. */
  'shell.error.code': '{code} · we’ve been told',
  'shell.notFound.title': 'This path doesn’t lead anywhere',
  'shell.notFound.body': 'The page you were after isn’t on this farm.',
  'shell.notFound.action': 'Back to the farm',
} as const satisfies EnCatalogue;
