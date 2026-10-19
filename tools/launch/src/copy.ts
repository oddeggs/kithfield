import { type Language, type StringKey, t } from '@kithfield/i18n';

import { type FontSwap, type Rewrite, type RewriteArgs } from './in-page';

/** The copy for a key that takes no parameters (every key listed here). */
const say = t as (language: Language, key: StringKey) => string;

/**
 * Board words that are app UI, set to what the app itself says: store screenshots show real UI
 * only, so the tab bar and the tend tray read as the app's catalogues have them, in both
 * languages. Keyed by the board's English text.
 */
export const APP_WORDS: Readonly<Record<string, StringKey>> = {
  Farm: 'shell.tab.farm',
  Chat: 'shell.tab.chat',
  'Seed bed': 'shell.tab.seedBed',
  You: 'shell.tab.you',
  Farms: 'chat.list.farms',
  'Tend without words': 'gestures.tray.title',
  Dewdrop: 'gestures.tray.dewdrop',
  Firefly: 'gestures.tray.firefly',
  Wave: 'gestures.tray.wave',
  'Quiet note': 'gestures.tray.quietNote',
  'Say something, or just wave': 'chat.composer.placeholder',
  'it sprouted!': 'plans.bed.sprouted',
};

/** Board copy `13 Launch` gives only in English, from the launch catalogue. */
export const LAUNCH_WORDS: readonly StringKey[] = [
  'launch.preview.stayClose',
  'launch.preview.firefly',
  'launch.preview.dewdrop',
  'launch.preview.campfire',
  'launch.preview.gathers',
  'launch.preview.homeScreen',
  'launch.play.tagline',
  'launch.ipad.bookClub',
  'launch.ipad.family',
  'launch.ipad.uniLot',
  'launch.ipad.picnicAsk',
  'launch.ipad.picnicYes',
  'launch.ipad.picnicWhen',
  'launch.ipad.dinner',
  'launch.ipad.dinnerWhen',
  'launch.ipad.games',
  'launch.ipad.gamesWhen',
];

/**
 * The store rule for Vietnamese: Lora for headlines, a size down as 13-04 sets them (20 for 22),
 * and Patrick Hand for the hand-lettered kickers and captions.
 */
export const VI_SWAPS: readonly FontSwap[] = [
  { from: 'Young Serif', family: 'Lora, Georgia, serif', weight: '600', sizeRatio: 20 / 22 },
  { from: 'Gaegu', family: '"Patrick Hand", cursive', weight: '400', sizeRatio: 1 },
];

/**
 * What to rewrite on a board for one language. English keeps the board's words except the app's
 * own UI words. Vietnamese takes the board's own Vietnamese set (`fromBoard`, English text →
 * Vietnamese with its type), then the launch catalogue, which sets its copy in the type the
 * element already has (swapped by `VI_SWAPS`), so a line the board uses both as a headline and as
 * a caption reads right in each; and the app's words over both.
 */
export function rewritesFor(
  language: Language,
  fromBoard: Readonly<Record<string, Rewrite>>,
): RewriteArgs {
  const rewrites: Record<string, Rewrite> = {};
  if (language === 'vi') {
    Object.assign(rewrites, fromBoard);
    for (const key of LAUNCH_WORDS) rewrites[say('en', key)] = { texts: [say('vi', key)] };
  }
  for (const [board, key] of Object.entries(APP_WORDS)) {
    const text = say(language, key);
    if (language === 'en' && text === board) continue;
    const font = rewrites[board]?.font;
    rewrites[board] = { texts: [text], ...(font ? { font } : {}) };
  }
  return { rewrites, swaps: language === 'vi' ? [...VI_SWAPS] : [] };
}

/** Copy that is fine to leave as it is: names, and the system's own app labels on a home screen. */
const KEPT = new Set([
  'Kithfield',
  'Otis',
  'Clock',
  'Photos',
  'Notes',
  'Weather',
  'Camera',
  'Mail',
  'Music',
  'Maps',
  'Files',
  'Books',
  'Settings',
]);

/** The English copy a Vietnamese rewrite missed, less names and system labels. */
export function stillEnglish(missing: readonly string[]): string[] {
  return [...new Set(missing.filter((text) => !KEPT.has(text)))];
}
