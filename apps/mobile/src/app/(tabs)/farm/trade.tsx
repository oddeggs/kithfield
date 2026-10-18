import { useLocalSearchParams } from 'expo-router';

import { TradeScreen } from '../../../features/rhythm/trade-screen';

/** Swapping crops at a friend's gate: `farm` (theirs), from your farm `from`, with `friend`. */
export default function Trade() {
  const { farm, from, friend } = useLocalSearchParams<{
    farm: string;
    from: string;
    friend: string;
  }>();
  return farm && from && friend ? <TradeScreen farm={farm} from={from} friend={friend} /> : null;
}
