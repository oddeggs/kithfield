/** A photo's size once its long side is at most `longSide`, keeping its shape. */
export function photoSize(
  width: number,
  height: number,
  longSide: number,
): { width: number; height: number; resized: boolean } {
  const long = Math.max(width, height);
  if (long <= longSide || width <= 0 || height <= 0) return { width, height, resized: false };
  const scale = longSide / long;
  return {
    width: width >= height ? longSide : Math.max(1, Math.round(width * scale)),
    height: height > width ? longSide : Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}
