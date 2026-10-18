import { radii } from '@kithfield/theme';
import { View } from 'react-native';

import { Avatar } from '../../../ui/art/avatar';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import type { Friend } from '../model/people';

const MAX = 260;

/**
 * The message lifted out of the chat under the menu: your own in moss on the right, a
 * friend's on card with their critter, set a little larger than in the chat and casting a shadow.
 */
export function LiftedBubble({
  mine,
  from,
  text,
}: {
  readonly mine: boolean;
  readonly from: Friend | null;
  readonly text: string;
}) {
  const { palette } = useTheme();
  const bubble = (
    <View
      style={{
        maxWidth: MAX,
        paddingVertical: 11,
        paddingHorizontal: 15,
        borderRadius: 20,
        ...(mine
          ? { borderBottomRightRadius: radii.bubbleTail }
          : { borderBottomLeftRadius: radii.bubbleTail }),
        backgroundColor: mine ? palette.bubble.yoursBg : palette.card,
        boxShadow: '0 14px 34px -14px rgba(40,25,10,.5)',
      }}
    >
      <Txt
        variant="bubble"
        multiline
        color={mine ? palette.bubble.yoursFg : palette.text}
        style={{ fontSize: 16, lineHeight: 22.4 }}
      >
        {text}
      </Txt>
    </View>
  );
  if (mine) return <View style={{ alignSelf: 'flex-end' }}>{bubble}</View>;
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
      <Avatar kind={from?.kind ?? 'rabbit'} look={from?.look ?? {}} size={30} />
      {bubble}
    </View>
  );
}
