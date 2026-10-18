import { type, type Face, type TypeStyle, type Weight } from '@kithfield/theme';
import type { TextProps } from 'react-native';

/** The iOS text style a piece of text scales with under Dynamic Type. */
export type Ramp = NonNullable<TextProps['dynamicTypeRamp']>;

/** A type style plus the Dynamic Type style it scales with (the ramp's own carry theirs). */
export interface ComponentType extends TypeStyle {
  ramp: Ramp | null;
}

const style = (
  face: Face,
  weight: Weight,
  size: number,
  lineHeight: number,
  ramp: Ramp | null,
): ComponentType => ({
  face,
  weight,
  size,
  lineHeight,
  letterSpacing: 0,
  uppercase: false,
  textStyle: null,
  ramp,
});

/**
 * Component text the type ramp has no step for, as `01 Foundations`' component library sets it.
 * Each scales with the Dynamic Type style nearest its size.
 */
export const componentType = {
  /** Small buttons (36 tall). */
  buttonSmall: style('system', 600, 14, 14, 'subheadline'),
  /** Text buttons (48 tall). */
  buttonText: style('system', 600, 15, 15, 'subheadline'),
  /** Chips; set at weight 500 (see `Txt`'s `medium`). */
  chip: style('system', 400, 14, 14, 'subheadline'),
  segment: style('system', 600, 13.5, 13.5, 'footnote'),
  tab: style('system', 600, 10, 10, 'caption2'),
  fieldLabel: style('system', 400, 15, 15, 'subheadline'),
  fieldText: style('system', 400, 15, 19.5, 'body'),
  fieldValue: style('youngSerif', 400, 18, 18, null),
  sheetTitle: style('youngSerif', 400, 22, 24, 'title2'),
  errorTitle: style('youngSerif', 400, 28, 31, 'title1'),
  bubble: style('system', 400, 15, 21, 'body'),
  bubbleName: style('system', 600, 12, 12, 'caption1'),
  bubbleState: style('system', 600, 12, 12, 'caption1'),
  quietHead: style('gaegu', 700, 14, 14, null),
  note: style('system', 400, 12, 15.6, 'caption1'),
  trayTitle: style('system', 600, 16, 17.6, 'callout'),
  traySubtitle: style('system', 400, 13, 16.9, 'footnote'),
  planTitle: style('system', 600, 16, 19.2, 'callout'),
  planDetail: style('system', 400, 13.5, 17.5, 'footnote'),
  credit: style('system', 400, 14.5, 20, 'subheadline'),
  notice: style('system', 400, 13.5, 18.9, 'footnote'),
  rowTitle: style('system', 600, 16, 20, 'callout'),
  rowSubtitle: style('system', 400, 13.5, 18.2, 'footnote'),
  sheetBody: style('system', 400, 15, 21.75, 'body'),
  code: style('system', 400, 12.5, 12.5, 'caption1'),
} as const satisfies Record<string, ComponentType>;

/**
 * Each face's ascent plus descent, as a fraction of its size (hhea, or OS/2 typo where the font
 * asks for it; SF Pro's from the system). Chrome centres the glyphs of a line set tighter than
 * this inside the line; iOS sits them at its bottom, so `Txt` moves them down by half the gap.
 */
export const glyphHeight: Readonly<Record<string, number>> = {
  system: 1.193,
  'YoungSerif-Regular': 1.412,
  'Gaegu-Bold': 1.0,
  'PatrickHand-Regular': 1.354,
  'Lora-Regular': 1.28,
  'Lora-SemiBold': 1.28,
  Menlo: 1.164,
};

export type ComponentTypeKey = keyof typeof componentType;
export type TypeVariant = keyof typeof type | ComponentTypeKey;

export function typeStyleOf(variant: TypeVariant): ComponentType {
  if (variant in componentType) return componentType[variant as ComponentTypeKey];
  const s = type[variant as keyof typeof type];
  return { ...s, ramp: s.textStyle };
}
