/*
 * Stickers, shared by the app (which makes packs on the phone) and the baker (`tools/art`): the
 * catalogue of packs and poses, each pose's seamless loop length, and the file formats the other
 * apps take (APNG for Messages, animated WebP for WhatsApp, WEBM for Telegram) with their rules.
 * Pure TypeScript over bytes, so it runs on Hermes as in Node.
 */
export * from './catalogue';
export { LOOP_FRAMES } from './loop-lengths.generated';
export {
  assembleApng,
  readApng,
  type ApngFrame,
  type ApngInfo,
  type ApngOptions,
} from './formats/apng';
export { concat, crc32 } from './formats/bytes';
export { changedRect, cropRgba, type Rect } from './formats/delta';
export { changedIndexRect, encodeIndexedPng } from './formats/indexed-png';
export { buildPalette, indexer, paletteBuilder, type Palette } from './formats/palette';
export {
  headerOf,
  isPng,
  pngSize,
  readChunks,
  writeChunk,
  writePng,
  PNG_SIGNATURE,
} from './formats/png';
export * from './formats/specs';
export { readWebm, type WebmInfo } from './formats/webm';
export {
  assembleAnimatedWebp,
  readWebp,
  type WebpFrame,
  type WebpInfo,
  type WebpOptions,
} from './formats/webp';
