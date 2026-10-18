import { day, night, type Appearance } from './colour';

/**
 * The chat's own inks, as `design/04 Farm and Chat.dc.html` writes them inline (bubbles, chips,
 * the noticeboard, the recorder, the viewer), with night counterparts from the night palette.
 * Night values the design doesn't draw are listed in `docs/undesigned-states.md`.
 */
export interface ChatInks {
  /** The hairline under a chat-list row and inside grouped cards. */
  rowRule: string;
  /** "@Name" in a bubble or the field. */
  mentionBg: string;
  mentionFg: string;
  /** "@Name" inside your own moss bubble. */
  mentionMineBg: string;
  /** The quoted message at the top of a reply, and inside your own bubble. */
  quoteBg: string;
  quoteName: string;
  quoteText: string;
  quoteMineBg: string;
  /** Words on your own moss bubble. */
  onMoss: string;
  /** The reply chip's tint and ink. */
  replyBg: string;
  replyInk: string;
  /** Under a bubble: sending, sent, edited. */
  state: string;
  /** "Didn't send" and its button. */
  failInk: string;
  failButton: string;
  failButtonInk: string;
  /** The day divider and the hand-face lines. */
  hand: string;
  /** A search match, and the words around it. */
  mark: string;
  searchText: string;
  /** A dewdrop chip's names. */
  chipInk: string;
  chipShadow: string;
  /** The "back from a long nap" card. */
  backBg: string;
  backInk: string;
  /** The noticeboard's cork, its dots, its cards and their pins. */
  cork: string;
  corkDot: string;
  corkCard: string;
  corkCardShadow: string;
  pinInk: string;
  /** The pinned strip over the chat. */
  pinStrip: string;
  /** The voice note's play button and its waveform. */
  play: string;
  /** Bars already played (and all of them at rest), bars still to play, the live recording's tail. */
  wave: string;
  waveRest: string;
  waveLive: string;
  /** The recorder: its dot, sheet, critter tile, shadow and the ring round the held mic. */
  recording: string;
  recorderBg: string;
  recorderTile: string;
  recorderShadow: string;
  recorderRing: string;
  /** The quiet note's lift off the page. */
  quietShadow: string;
  /** The chat's sheet over the farm. */
  sheetShadow: string;
  /** The composer fades the chat out behind it. */
  composerFade: string;
  /** The @ list over the chat. */
  mentionList: string;
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
  /** Over a photo or video: the play button's disc, a duration badge and their ink. */
  mediaScrim: string;
  mediaBadge: string;
  onMedia: string;
}

/** The viewer is dark in both appearances. */
export const viewerInks = {
  bg: '#17151c',
  ink: night.moon,
  sub: '#bdb4c4',
  glassFill: 'rgba(30,32,56,.5)',
  glassBorder: 'rgba(255,255,255,.14)',
  track: 'rgba(255,255,255,.2)',
  thumb: '#ffffff',
} as const;

const dayInks: ChatInks = {
  rowRule: 'rgba(42,34,29,.08)',
  mentionBg: 'rgba(94,127,74,.14)',
  mentionFg: '#3f5a31',
  mentionMineBg: 'rgba(255,255,255,.2)',
  quoteBg: 'rgba(94,127,74,.1)',
  quoteName: day.moss,
  quoteText: day.ink2,
  quoteMineBg: 'rgba(255,255,255,.16)',
  onMoss: '#fbf7f0',
  replyBg: day.card,
  replyInk: day.moss,
  state: day.ink3,
  failInk: day.clay,
  failButton: day.clay,
  failButtonInk: '#ffffff',
  hand: '#7d7168',
  mark: '#f6dd93',
  searchText: day.ink2,
  chipInk: day.ink2,
  chipShadow: '0 2px 8px -3px rgba(60,40,20,.35)',
  backBg: '#F3E7CC',
  backInk: '#3a302a',
  cork: '#c9a77f',
  corkDot: 'rgba(90,60,30,.18)',
  corkCard: '#fffaf0',
  corkCardShadow: '0 6px 14px -6px rgba(60,40,20,.45)',
  pinInk: '#b0482f',
  pinStrip: day.sheet,
  play: day.honey,
  wave: day.ink3,
  waveRest: '#b7aca2',
  waveLive: '#c9734e',
  recording: day.clay,
  recorderBg: day.sheet,
  recorderTile: '#F2E0D4',
  recorderShadow: '0 -10px 30px -14px rgba(40,25,10,.35)',
  recorderRing: '0 0 0 10px rgba(232,180,78,.25)',
  quietShadow: '0 3px 10px -6px rgba(60,40,20,.35)',
  sheetShadow: '0 -6px 20px -12px rgba(60,40,20,.3)',
  composerFade: 'linear-gradient(rgba(245,238,226,0), #F5EEE2 30%)',
  mentionList: '#fbf7f0',
  fieldBorder: 'rgba(42,34,29,.1)',
  fieldFocus: day.moss,
  glassFill: 'rgba(251,247,240,.78)',
  glassBorder: 'rgba(255,255,255,.6)',
  searchBorder: day.moss,
  muteAction: '#7d7168',
  pinAction: day.moss,
  actionInk: day.paper,
  mediaScrim: 'rgba(20,18,28,.55)',
  mediaBadge: 'rgba(20,18,28,.6)',
  onMedia: '#ffffff',
};

const nightInks: ChatInks = {
  rowRule: 'rgba(255,255,255,.1)',
  mentionBg: 'rgba(169,196,142,.16)',
  mentionFg: '#a9c48e',
  mentionMineBg: 'rgba(255,255,255,.2)',
  quoteBg: 'rgba(169,196,142,.12)',
  quoteName: '#a9c48e',
  quoteText: night.moon2,
  quoteMineBg: 'rgba(255,255,255,.16)',
  onMoss: '#fbf7f0',
  replyBg: night.bubble,
  replyInk: '#a9c48e',
  state: night.moon2,
  failInk: '#e08a6c',
  failButton: day.clay,
  failButtonInk: '#ffffff',
  hand: night.dim,
  mark: 'rgba(232,180,78,.45)',
  searchText: night.moon,
  chipInk: night.moon,
  chipShadow: '0 2px 8px -3px rgba(0,0,0,.5)',
  backBg: '#34385a',
  backInk: night.moon,
  cork: '#8a6d4f',
  corkDot: 'rgba(0,0,0,.2)',
  corkCard: night.bubble,
  corkCardShadow: '0 6px 14px -6px rgba(0,0,0,.6)',
  pinInk: '#e08a6c',
  pinStrip: night.panel,
  play: night.honey,
  wave: night.moon2,
  waveRest: night.dim,
  waveLive: '#e08a6c',
  recording: '#e08a6c',
  recorderBg: night.panel,
  recorderTile: '#34385a',
  recorderShadow: '0 -10px 30px -14px rgba(0,0,0,.6)',
  recorderRing: '0 0 0 10px rgba(232,180,78,.25)',
  quietShadow: '0 3px 10px -6px rgba(0,0,0,.5)',
  sheetShadow: '0 -6px 20px -12px rgba(0,0,0,.4)',
  composerFade: 'linear-gradient(rgba(27,31,61,0), #1B1F3D 30%)',
  mentionList: night.panel,
  fieldBorder: 'rgba(255,255,255,.12)',
  fieldFocus: '#a9c48e',
  glassFill: 'rgba(30,32,56,.5)',
  glassBorder: 'rgba(255,255,255,.14)',
  searchBorder: '#a9c48e',
  muteAction: night.dim,
  pinAction: day.moss,
  actionInk: night.moon,
  mediaScrim: 'rgba(20,18,28,.55)',
  mediaBadge: 'rgba(20,18,28,.6)',
  onMedia: '#ffffff',
};

export const chatInks: Readonly<Record<Appearance, ChatInks>> = { day: dayInks, night: nightInks };

/**
 * The chat's own timings, from the design's notes: a new message rises 12 points and fades in
 * over 180 ms; a failed bubble shakes once, 3 points; the @ list grows from the caret in 160 ms; a
 * message shown from a link glows a moment; noticeboard cards land on twos.
 */
export const chatMotion = {
  riseMs: 180,
  risePt: 12,
  shakeStepMs: 60,
  shakePt: 3,
  mentionGrowMs: 160,
  glowMs: 1400,
} as const;
