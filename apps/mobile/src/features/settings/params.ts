import { useLocalSearchParams } from 'expo-router';

/** A route's string parameters, each the first value given or empty. */
export function useParams<K extends string>(...names: readonly K[]): Record<K, string> {
  const raw = useLocalSearchParams<Record<string, string | string[]>>();
  const out = {} as Record<K, string>;
  for (const name of names) {
    const v = raw[name];
    out[name] = (Array.isArray(v) ? v[0] : v) ?? '';
  }
  return out;
}
