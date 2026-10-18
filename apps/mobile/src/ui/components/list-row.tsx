import { layout, radii } from '@kithfield/theme';
import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { ArtIcon } from '../art/art-view';
import { Avatar } from '../art/avatar';
import { Press } from '../motion/press';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';
import type { Sender } from './bubble';

/** Rows grouped on one card, divided by hairlines (`01 Foundations`, Cards). */
export function ListGroup({ children }: { readonly children: ReactNode }) {
  const { palette } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View
      style={{
        borderRadius: radii.card,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        paddingVertical: 2,
        paddingHorizontal: 14,
      }}
    >
      {rows.map((row, i) => (
        <View
          key={row.key ?? i}
          style={
            i < rows.length - 1
              ? { borderBottomWidth: 1, borderBottomColor: palette.hairline }
              : null
          }
        >
          {row}
        </View>
      ))}
    </View>
  );
}

export interface ListRowProps {
  readonly title: string;
  readonly subtitle?: string;
  /** An icon on a soft tile, or a critter. */
  readonly icon?: string;
  readonly critter?: Sender;
  /** A control at the end (a chip, a toggle). Without one, a tappable row shows a chevron. */
  readonly trailing?: ReactNode;
  readonly onPress?: () => void;
}

/** A row: icon or critter, title and subtitle, then a chevron or a control. At least 44 tall. */
export function ListRow({ title, subtitle, icon, critter, trailing, onPress }: ListRowProps) {
  const { palette } = useTheme();
  const body = (
    <>
      {icon ? (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radii.tile,
            backgroundColor: palette.fillSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArtIcon name={icon} size={23.2} color={palette.text} />
        </View>
      ) : null}
      {critter ? (
        <Avatar kind={critter.kind} {...(critter.look ? { look: critter.look } : {})} size={40} />
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="rowTitle" multiline>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="rowSubtitle" multiline color={palette.secondary} style={{ marginTop: 2 }}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {trailing ??
        (onPress ? (
          <Txt variant="body" color={palette.chevron} style={{ fontSize: 22, lineHeight: 22 }}>
            ›
          </Txt>
        ) : null)}
    </>
  );
  const row = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingVertical: 10,
    minHeight: layout.minHitTarget,
  };
  const label = subtitle ? `${title}, ${subtitle}` : title;
  if (!onPress || trailing) {
    return (
      <View accessible={!trailing} accessibilityLabel={label} style={row}>
        {body}
      </View>
    );
  }
  return (
    <Press onPress={onPress} darken={false} accessibilityLabel={label} style={row}>
      {body}
    </Press>
  );
}
