/**
 * Gestures: what other features use from here once they are wired together. The screens
 * themselves are routes (`app/(modal)/gestures-*`), reached by path:
 *
 * - `/gestures-message?farm&seq&top`: the long-press menu; `top` is the bubble's top on screen.
 * - `/gestures-tray?farm&to`, `/gestures-attach?farm`, `/gestures-reactions?farm&seq`.
 * - `/gestures-firefly`, `/gestures-knock`, `/gestures-slow-post`, `/gestures-weather` with
 *   `farm` and `to`; `/gestures-forward?farm&seq`; `/gestures-quick-tend`.
 */
export { FileBubble, type FileBubbleProps } from './file-bubble';
export { provideMediaUploader, type MediaUploader, type PickedFile } from './media-seam';
export { reactionRow, iconOfReaction, type RowMark } from './model/reactions';
export { routes as gestureRoutes } from './routes';
