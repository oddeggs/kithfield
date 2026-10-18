/** A theme colour (`#RRGGBB`) at an opacity, as `rgba(…)`. */
export function withAlpha(hex: string, alpha: number): string {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (value === undefined) throw new Error(`not a #RRGGBB colour: ${hex}`);
  const n = Number.parseInt(value, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
