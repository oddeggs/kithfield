import { day, night, type Appearance } from '@kithfield/theme';

import { useTheme } from '../../../ui/theme/theme-provider';

/*
 * The chat's own inks, as `04 Farm and Chat` writes them inline, with their night counterparts
 * taken from the night palette (12-08, 12-09 and `docs/undesigned-states.md`).
 */
export interface ChatColours {
  /** The hairline under a chat-list row and inside grouped cards. */
  rowRule: string;
  /** "@Name" in a bubble or the field. */
  mentionBg: string;
  mentionFg: string;
  /** "@Name" inside your own moss bubble. */
  mentionMineBg: string;
  /** The quoted message at the top of a reply. */
  quoteBg: string;
  quoteName: string;
  quoteText: string;
  /** The reply chip's tint and ink (04-08). */
  replyBg: string;
  replyInk: string;
  /** Under a bubble: sending, sent, edited. */
  state: string;
  /** "Didn't send" and its button. */
  failInk: string;
  failButton: string;
  /** The day divider and the hand-face lines. */
  hand: string;
  /** A search match. */
  mark: string;
  /** The "back from a long nap" card. */
  backBg: string;
  backInk: string;
  /** The noticeboard's cork and its cards. */
  cork: string;
  corkDot: string;
  corkCard: string;
  pinInk: string;
  /** The voice note's play button and its waveform. */
  play: string;
  wave: string;
  waveLive: string;
  /** The recording dot. */
  recording: string;
  /** The voice recorder's sheet and its critter's tile. */
  recorderBg: string;
  recorderTile: string;
  /** A soft chip under a bubble (dewdrops and reactions). */
  chipShadow: string;
  /** The composer's field border, and when it has focus. */
  fieldBorder: string;
  fieldFocus: string;
  /** Glass over the farm art. */
  glassFill: string;
  glassBorder: string;
  /** The search field's border. */
  searchBorder: string;
  /** Swipe actions behind a chat-list row. */
  muteAction: string;
  pinAction: string;
  actionInk: string;
}

const dayColours: ChatColours = {
  rowRule: 'rgba(42,34,29,.08)',
  mentionBg: 'rgba(94,127,74,.14)',
  mentionFg: '#3f5a31',
  mentionMineBg: 'rgba(255,255,255,.2)',
  quoteBg: 'rgba(94,127,74,.1)',
  quoteName: day.moss,
  quoteText: day.ink2,
  replyBg: day.card,
  replyInk: day.moss,
  state: day.ink3,
  failInk: day.clay,
  failButton: day.clay,
  hand: '#7d7168',
  mark: '#f6dd93',
  backBg: '#F3E7CC',
  backInk: '#3a302a',
  cork: '#c9a77f',
  corkDot: 'rgba(90,60,30,.18)',
  corkCard: '#fffaf0',
  pinInk: '#b0482f',
  play: day.honey,
  wave: day.ink2,
  waveLive: '#c9734e',
  recording: day.clay,
  recorderBg: day.sheet,
  recorderTile: '#F2E0D4',
  chipShadow: '0 2px 8px -3px rgba(60,40,20,.35)',
  fieldBorder: 'rgba(42,34,29,.1)',
  fieldFocus: day.moss,
  glassFill: 'rgba(251,247,240,.78)',
  glassBorder: 'rgba(255,255,255,.6)',
  searchBorder: day.moss,
  muteAction: '#7d7168',
  pinAction: day.moss,
  actionInk: day.paper,
};

const nightColours: ChatColours = {
  rowRule: 'rgba(255,255,255,.1)',
  mentionBg: 'rgba(169,196,142,.16)',
  mentionFg: '#a9c48e',
  mentionMineBg: 'rgba(255,255,255,.2)',
  quoteBg: 'rgba(169,196,142,.12)',
  quoteName: '#a9c48e',
  quoteText: night.moon2,
  replyBg: night.bubble,
  replyInk: '#a9c48e',
  state: night.moon2,
  failInk: '#e08a6c',
  failButton: day.clay,
  hand: night.dim,
  mark: 'rgba(232,180,78,.45)',
  backBg: '#34385a',
  backInk: night.moon,
  cork: '#8a6d4f',
  corkDot: 'rgba(0,0,0,.2)',
  corkCard: night.bubble,
  pinInk: '#e08a6c',
  play: night.honey,
  wave: night.moon2,
  waveLive: '#e08a6c',
  recording: '#e08a6c',
  recorderBg: night.panel,
  recorderTile: '#34385a',
  chipShadow: '0 2px 8px -3px rgba(0,0,0,.5)',
  fieldBorder: 'rgba(255,255,255,.12)',
  fieldFocus: '#a9c48e',
  glassFill: 'rgba(30,32,56,.5)',
  glassBorder: 'rgba(255,255,255,.14)',
  searchBorder: '#a9c48e',
  muteAction: night.dim,
  pinAction: day.moss,
  actionInk: night.moon,
};

export const chatColours: Readonly<Record<Appearance, ChatColours>> = {
  day: dayColours,
  night: nightColours,
};

export function useChatColours(): ChatColours {
  return chatColours[useTheme().appearance];
}
