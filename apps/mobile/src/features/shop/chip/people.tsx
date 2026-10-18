import type { FarmState, PersonId } from '@kithfield/contracts';
import { View } from 'react-native';

import { lookOf } from '../../../ui/art/critter-look';
import { Avatar } from '../../../ui/art/avatar';
import { useTheme } from '../../../ui/theme/theme-provider';
import { memberOf } from '../kit/members';

/** Who chipped in, as overlapping 28-point critters ringed in the sheet's colour; never amounts. */
export function People({
  state,
  people,
  max = 5,
}: {
  readonly state: FarmState | null;
  readonly people: readonly PersonId[];
  readonly max?: number;
}) {
  const { palette } = useTheme();
  const shown = people.flatMap((p) => {
    const m = memberOf(state, p);
    return m ? [m] : [];
  });
  return (
    <View style={{ flexDirection: 'row' }} accessible={false}>
      {shown.slice(0, max).map((m, i) => (
        <Avatar
          key={m.person}
          kind={m.critter.species}
          look={lookOf(m.critter)}
          size={28}
          ring={palette.sheet}
          {...(m.name ? { label: m.name } : {})}
          style={i === 0 ? null : { marginLeft: -8 }}
        />
      ))}
    </View>
  );
}
