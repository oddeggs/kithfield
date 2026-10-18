export { Art, canvasShadowSigma, type ArtOptions, type SceneAttrs, type SceneRequest } from './art';
export { DEFAULT_CACHE_BYTES, SpriteCache } from './cache';
export { ArtCanvas, type SkiaEnv } from './canvas2d/canvas';
export { ArtContext2D } from './canvas2d/context';
export type { FaceEntry } from './canvas2d/font';
export {
  companionFrame,
  critterLayers,
  type CompanionFrame,
  type CritterLayer,
  type CritterLook,
  type CritterPose,
  type CritterState,
  type LayerSlot,
  type Wearable,
} from './critter';
export { faceEntries, systemFaces } from './faces';
export type { CritterDef, Internals, KF, Scene, Sprite } from './internals';
export { drawLoop, fireLoop, FrameLoop, sceneLoop, type LoopOptions } from './loops';
export { watchMemory, type MemoryWarnings } from './memory';
