import { radii } from '@kithfield/theme';
import { View } from 'react-native';

import { ArtIcon } from '../art/art-view';
import { Press } from '../motion/press';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';

/** How a gesture sits in the tray: on the dewdrop's pale blue, the firefly's night, or bare. */
export type GestureTone = 'dewdrop' | 'firefly' | 'plain';

export interface TrayItem {
  icon: string;
  label: string;
  tone?: GestureTone;
  onPress: () => void;
}

const BUTTON = 50;

/** The gesture tray (`01 Foundations`): a floating pill of 50-point gestures. */
export function GestureTray({ items }: { readonly items: readonly TrayItem[] }) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="toolbar"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        padding: 6,
        borderRadius: 32,
        backgroundColor: palette.card,
        boxShadow: palette.trayShadow,
        alignSelf: 'flex-start',
      }}
    >
      {items.map((item) => {
        const tone = item.tone ?? 'plain';
        const bg =
          tone === 'dewdrop'
            ? palette.dewdropTint
            : tone === 'firefly'
              ? palette.firefly.bg
              : 'transparent';
        return (
          <Press
            key={item.icon}
            onPress={item.onPress}
            haptic="soft"
            radius={BUTTON / 2}
            accessibilityLabel={item.label}
            style={{
              width: BUTTON,
              height: BUTTON,
              borderRadius: BUTTON / 2,
              backgroundColor: bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArtIcon name={item.icon} size={tone === 'firefly' ? 36 : 34} color={palette.text} />
          </Press>
        );
      })}
    </View>
  );
}

/** A gesture explained on a tile: the dewdrop on card, the firefly on its night. */
export function GestureTile({
  icon,
  title,
  body,
  tone = 'plain',
  onPress,
}: {
  readonly icon: string;
  readonly title: string;
  readonly body: string;
  readonly tone?: GestureTone;
  readonly onPress?: () => void;
}) {
  const { palette } = useTheme();
  const night = tone === 'firefly';
  const content = (
    <>
      <ArtIcon name={icon} size={40} color={palette.text} />
      <Txt variant="trayTitle" color={night ? palette.firefly.fg : palette.text}>
        {title}
      </Txt>
      <Txt variant="traySubtitle" multiline color={night ? palette.firefly.sub : palette.secondary}>
        {body}
      </Txt>
    </>
  );
  const surface = {
    flex: 1,
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.card,
    backgroundColor: night ? palette.firefly.bg : palette.card,
    ...(night ? {} : { borderWidth: 1, borderColor: palette.cardBorder }),
  };
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={`${title}. ${body}`} style={surface}>
        {content}
      </View>
    );
  }
  return (
    <Press
      onPress={onPress}
      radius={radii.card}
      accessibilityLabel={`${title}. ${body}`}
      style={surface}
    >
      {content}
    </Press>
  );
}
