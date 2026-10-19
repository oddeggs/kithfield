import { inDesktop } from '../../web/desktop/tauri';
import type { AppleAskNext } from './ask-next';

export type { AppleAskNext } from './ask-next';

/** What says it will ask next, once the farm has asked: the browser, or the desktop app's system. */
export function askNextKey(_apple: AppleAskNext) {
  return inDesktop()
    ? ('platforms.ask.nextDesktop' as const)
    : ('platforms.ask.nextBrowser' as const);
}
