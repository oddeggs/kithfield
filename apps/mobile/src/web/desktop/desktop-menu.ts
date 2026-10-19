import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import type { Translate } from '@kithfield/i18n';

import { runDeskAction } from '../desk/desk-keys';
import type { DeskAction } from '../desk/keymap';

/** A Farm menu item: its words, its keys as the system draws them, and what it does. */
const farmItem = (t: Translate, copy: string, accelerator: string, action: DeskAction) =>
  MenuItem.new({
    text: t(copy as 'platforms.keys.dewdrop'),
    accelerator,
    action: () => runDeskAction(action),
  });

/**
 * The desktop's menu bar (Kithfield, File, Edit, Farm, Window). Edit's items are the
 * system's own, so copy and paste work in every field; Farm holds the shortcuts, which the menu
 * then takes before the page sees them, so both paths run the same action.
 */
export async function setAppMenu(t: Translate, appName: string): Promise<void> {
  const app = await Submenu.new({
    text: appName,
    items: await Promise.all([
      PredefinedMenuItem.new({ item: { About: null } }),
      PredefinedMenuItem.new({ item: 'Separator' }),
      PredefinedMenuItem.new({ item: 'Hide' }),
      PredefinedMenuItem.new({ item: 'HideOthers' }),
      PredefinedMenuItem.new({ item: 'Separator' }),
      PredefinedMenuItem.new({ item: 'Quit', text: t('platforms.tray.quit') }),
    ]),
  });
  const file = await Submenu.new({
    text: t('platforms.menu.file'),
    items: [await PredefinedMenuItem.new({ item: 'CloseWindow' })],
  });
  const edit = await Submenu.new({
    text: t('platforms.menu.edit'),
    items: await Promise.all([
      PredefinedMenuItem.new({ item: 'Undo' }),
      PredefinedMenuItem.new({ item: 'Redo' }),
      PredefinedMenuItem.new({ item: 'Separator' }),
      PredefinedMenuItem.new({ item: 'Cut' }),
      PredefinedMenuItem.new({ item: 'Copy' }),
      PredefinedMenuItem.new({ item: 'Paste' }),
      PredefinedMenuItem.new({ item: 'SelectAll' }),
    ]),
  });
  const farm = await Submenu.new({
    text: t('platforms.menu.farm'),
    items: await Promise.all([
      farmItem(t, 'platforms.keys.dewdrop', 'CmdOrCtrl+D', 'dewdrop'),
      farmItem(t, 'platforms.keys.quickTend', 'CmdOrCtrl+Shift+T', 'quickTend'),
      farmItem(t, 'platforms.keys.search', 'CmdOrCtrl+K', 'search'),
      farmItem(t, 'platforms.keys.firefly', 'CmdOrCtrl+Shift+F', 'firefly'),
      farmItem(t, 'platforms.keys.seed', 'CmdOrCtrl+Shift+S', 'seed'),
      farmItem(t, 'platforms.keys.fire', 'Alt+CmdOrCtrl+L', 'fire'),
      farmItem(t, 'platforms.keys.mute', 'Alt+CmdOrCtrl+M', 'mute'),
      PredefinedMenuItem.new({ item: 'Separator' }),
      farmItem(t, 'platforms.keys.list', 'CmdOrCtrl+/', 'list'),
    ]),
  });
  const window = await Submenu.new({
    text: t('platforms.menu.window'),
    items: await Promise.all([
      PredefinedMenuItem.new({ item: 'Minimize' }),
      PredefinedMenuItem.new({ item: 'Maximize' }),
      PredefinedMenuItem.new({ item: 'Fullscreen' }),
    ]),
  });
  const menu = await Menu.new({ items: [app, file, edit, farm, window] });
  await menu.setAsAppMenu();
}

/** The critter's own menu (a right click): open the window, or quit. */
export async function trayMenu(t: Translate, show: () => void): Promise<Menu> {
  return Menu.new({
    items: await Promise.all([
      MenuItem.new({ text: t('platforms.tray.show'), action: show }),
      PredefinedMenuItem.new({ item: 'Separator' }),
      PredefinedMenuItem.new({ item: 'Quit', text: t('platforms.tray.quit') }),
    ]),
  });
}
