/*
 * The native surfaces: widgets, Live Activities, lock-screen answers to pushes, the share
 * extension's drafts, and where the fire sounds. See `surfaces.ts`.
 */
export { SurfacesHost } from './surfaces-host';
export {
  endFireActivity,
  startFireActivity,
  updateFireActivity,
  useFireActivityButtons,
} from './fire-activity';
