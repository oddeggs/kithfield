/** A route param as one string: Expo Router gives an array when a key repeats. */
export const oneParam = (value: string | string[] | undefined): string | null => {
  const one = Array.isArray(value) ? value[0] : value;
  return one === undefined || one === '' ? null : one;
};

/** A seq from a route param, or null when it isn't a positive whole number. */
export const seqParam = (value: string | string[] | undefined): number | null => {
  const n = Number(oneParam(value));
  return Number.isInteger(n) && n > 0 ? n : null;
};
