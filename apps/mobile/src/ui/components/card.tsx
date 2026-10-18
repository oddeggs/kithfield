import { radii } from '@kithfield/theme';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ArtIcon, ArtStill } from '../art/art-view';
import { Avatar } from '../art/avatar';
import { Press } from '../motion/press';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';
import type { Sender } from './bubble';
import type { ViewStyleProp } from '../style';

const pad = { paddingVertical: 12, paddingHorizontal: 14 };

/** The plain card: 22 radius, card colour, a hairline. Tappable when given `onPress`. */
export function Card({
  onPress,
  accessibilityLabel,
  style,
  children,
}: {
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly style?: ViewStyleProp;
  readonly children: ReactNode;
}) {
  const { palette } = useTheme();
  const surface: ViewStyleProp = [
    pad,
    {
      borderRadius: radii.card,
      backgroundColor: palette.card,
      borderWidth: 1,
      borderColor: palette.cardBorder,
    },
    style,
  ];
  if (!onPress) return <View style={surface}>{children}</View>;
  return (
    <Press
      onPress={onPress}
      radius={radii.card}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      style={surface}
    >
      {children}
    </Press>
  );
}

/** A plan in honey: the seed at its stage, a hand-lettered eyebrow, title and when · where. */
export function PlanCard({
  stage,
  eyebrow,
  title,
  detail,
  onPress,
}: {
  /** The seed's stage, 0 (a seed) to 3 (sprouted). */
  readonly stage: 0 | 1 | 2 | 3;
  readonly eyebrow?: string;
  readonly title: string;
  readonly detail: string;
  readonly onPress?: () => void;
}) {
  const { palette } = useTheme();
  const p = palette.plan;
  const content = (
    <>
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 16,
          backgroundColor: p.art,
          overflow: 'hidden',
        }}
      >
        <ArtStill scene="seed" width={60} height={60} attrs={{ stage }} />
      </View>
      <View style={{ flex: 1 }}>
        {eyebrow ? (
          <Txt variant="handS" color={p.eyebrow}>
            {eyebrow}
          </Txt>
        ) : null}
        <Txt variant="planTitle" style={{ marginTop: 2 }}>
          {title}
        </Txt>
        <Txt variant="planDetail" color={p.detail}>
          {detail}
        </Txt>
      </View>
    </>
  );
  const surface: ViewStyleProp = [
    pad,
    {
      borderRadius: radii.card,
      backgroundColor: p.bg,
      borderWidth: 1,
      borderColor: p.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
  ];
  if (!onPress) {
    return (
      <View accessible style={surface}>
        {content}
      </View>
    );
  }
  return (
    <Press onPress={onPress} radius={radii.card} style={surface}>
      {content}
    </Press>
  );
}

/** Overlapping critters, each ringed in the surface colour. */
export function CritterStack({
  friends,
  size = 30,
  ring,
}: {
  readonly friends: readonly Sender[];
  readonly size?: number;
  readonly ring: string;
}) {
  return (
    <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants">
      {friends.map((f, i) => (
        <Avatar
          key={`${f.kind}:${i}`}
          kind={f.kind}
          {...(f.look ? { look: f.look } : {})}
          size={size}
          ring={ring}
          style={i > 0 ? { marginLeft: -8 } : null}
        />
      ))}
    </View>
  );
}

/** The credit card: the quiet friends whose care kept the farm going, by name. */
export function CreditCard({
  friends,
  lead,
  rest,
}: {
  readonly friends: readonly Sender[];
  /** The bold opening words. */
  readonly lead: string;
  readonly rest: string;
}) {
  const { palette } = useTheme();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <CritterStack friends={friends} ring={palette.card} />
      <Txt variant="credit" multiline color={palette.creditText} style={{ flex: 1 }}>
        <Txt variant="credit" color={palette.creditText} style={{ fontWeight: '600' }}>
          {lead}
        </Txt>{' '}
        {rest}
      </Txt>
    </Card>
  );
}

/** The notice card, in ink: offline and other gentle warnings. */
export function NoticeCard({
  icon = 'raincloud',
  text,
  style,
}: {
  readonly icon?: string;
  readonly text: string;
  readonly style?: ViewStyleProp;
}) {
  const { palette } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={text}
      style={[
        pad,
        {
          borderRadius: radii.card,
          backgroundColor: palette.notice.bg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        style,
      ]}
    >
      <ArtIcon name={icon} size={26} color={palette.notice.fg} />
      <Txt variant="notice" multiline color={palette.notice.fg} style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}
