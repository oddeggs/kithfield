import type { TextStyle } from 'react-native';

import { Txt, type TxtProps } from '../../../ui/type/text';
import type { TypeVariant } from '../../../ui/type/styles';

/**
 * The text `11 Settings and Safety` sets, each on the library's nearest type style (for the face
 * and Dynamic Type) with the design's own size and line height.
 */
const kinds = {
  /** The pushed screens' centred title: 600 17/1.15. */
  navTitle: ['button', { fontSize: 17, lineHeight: 19.5 }],
  /** Under the centred title: the farm's name, 12/1.25. */
  navSub: ['note', { fontSize: 12, lineHeight: 15 }],
  /** Row titles: 600 15.5/1.25. */
  rowTitle: ['rowTitle', { fontSize: 15.5, lineHeight: 19.4 }],
  /** Settings' regular row titles: 16/1.25. */
  settingTitle: ['body', { fontSize: 16, lineHeight: 20 }],
  /** Row subtitles: 13.5/1.35. */
  rowSub: ['caption', { fontSize: 13.5, lineHeight: 18.2 }],
  /** Settings' subtitles: 13/1.35. */
  settingSub: ['caption', { fontSize: 13, lineHeight: 17.6 }],
  /** A row's value: 15/1. */
  value: ['fieldLabel', { fontSize: 15, lineHeight: 18 }],
  chevron: ['chevron', { fontSize: 20, lineHeight: 20 }],
  /** Section labels: 700 12, tracked, upper case. */
  label: ['label', {}],
  /** Settings' section labels: 600 12.5, tracked .05em. */
  settingsLabel: ['label', { fontSize: 12.5, lineHeight: 12.5, letterSpacing: 0.625 }],
  /** Quiet notes under groups: 13/1.4 (or 1.45). */
  note: ['caption', { fontSize: 13, lineHeight: 18.5 }],
  /** Paragraphs in cards: 13.5/1.45. */
  card: ['caption', { fontSize: 13.5, lineHeight: 19.6 }],
  /** Sheet paragraphs: 15/1.45. */
  sheetBody: ['sheetBody', { fontSize: 15, lineHeight: 21.75 }],
  /** Lists in sheets: 15.5/1.4. */
  listItem: ['body', { fontSize: 15.5, lineHeight: 21.7 }],
  /** Badges beside a name: 600 11. */
  badge: ['tab', { fontSize: 11, lineHeight: 13 }],
  /** Pill buttons' labels: 600 15. */
  pill: ['buttonText', { fontSize: 15, lineHeight: 18 }],
  /** Menu items: 16. */
  menu: ['body', { fontSize: 16, lineHeight: 20 }],
} as const satisfies Record<string, readonly [TypeVariant, TextStyle]>;

export type TextKind = keyof typeof kinds;

export function KText({
  kind,
  style,
  ...rest
}: Omit<TxtProps, 'variant'> & { readonly kind: TextKind }) {
  const [variant, own] = kinds[kind];
  return <Txt variant={variant} {...rest} style={[own, style]} />;
}
