import type { Critter } from '@kithfield/contracts';
import { ScrollView, View } from 'react-native';

import { Avatar } from '../../../ui/art/avatar';
import { lookOf } from '../../../ui/art/critter-look';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { useStickerColours } from './colours';

export interface Face {
  readonly person: string;
  readonly name: string;
  readonly critter: Critter;
}

/**
 * Friends' faces to pick from, with their names: a picked face wears an ink ring and its name
 * darkens. Five fit across; more scroll sideways.
 */
export function FaceRow({
  faces,
  picked,
  size = 54,
  onToggle,
  labelOf,
}: {
  readonly faces: readonly Face[];
  readonly picked: readonly string[];
  readonly size?: number;
  readonly onToggle: (person: string) => void;
  readonly labelOf: (face: Face, on: boolean) => string;
}) {
  const { palette } = useTheme();
  const sc = useStickerColours();
  const many = faces.length > 5;
  const items = faces.map((f) => {
    const on = picked.includes(f.person);
    return (
      <Press
        key={f.person}
        onPress={() => onToggle(f.person)}
        haptic="select"
        darken={false}
        accessibilityLabel={labelOf(f, on)}
        accessibilityState={{ selected: on }}
        style={{ alignItems: 'center', gap: 5, width: size + 12 }}
      >
        <View
          style={{
            width: size + 9,
            height: size + 9,
            borderRadius: (size + 9) / 2,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: on ? 2 : 0,
            borderColor: sc.ring,
          }}
        >
          <View
            style={{
              borderRadius: size / 2,
              borderWidth: on ? 0 : 1,
              borderColor: palette.cardBorder,
            }}
          >
            <Avatar kind={f.critter.species} look={lookOf(f.critter)} size={size} />
          </View>
        </View>
        <Txt
          variant="bubbleName"
          numberOfLines={1}
          color={on ? palette.text : sc.faceName}
          style={{ marginTop: -2 }}
        >
          {f.name}
        </Txt>
      </Press>
    );
  });
  return many ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8 }}
    >
      {items}
    </ScrollView>
  ) : (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{items}</View>
  );
}
