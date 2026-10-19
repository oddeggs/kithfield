import { platformMotion } from '@kithfield/theme';
import type { ChatListItem } from '@kithfield/contracts';
import { emitTo, listen } from '@tauri-apps/api/event';
import { TrayIcon, type TrayIconEvent } from '@tauri-apps/api/tray';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useCottage, useDataClient, useFarm } from '../../data';
import { hasNews } from '../../features/chat/model/chat-list';
import { useMe } from '../../features/chat/ui/use-me';
import { useSeenTo } from '../../features/chat/ui/seen-store';
import { useFireOnFarm } from '../../features/fire/fire-glow';
import { routes as gestureRoutes } from '../../features/gestures/routes';
import { useArt } from '../../ui/art/art-provider';
import { useLocale } from '../../ui/locale/locale-provider';
import { openChat, useDesk } from '../desk/desk-context';
import { setAppMenu, trayMenu } from './desktop-menu';
import { softNotes } from './notify-model';
import { EVENTS, POPOVER, POPOVER_SURFACE, type TrayAction, type TrayCard } from './tauri';
import { GLOW_FRAMES, trayFrames, type Glow } from './tray-frames';

const POPOVER_W = 300;
const POPOVER_H = 236;

async function showMain(): Promise<void> {
  const main = getCurrentWindow();
  await main.show();
  await main.unminimize();
  await main.setFocus();
}

/** The popover window, made once (hidden) and shown under the critter when it's clicked. */
async function popoverWindow(): Promise<WebviewWindow> {
  const open = await WebviewWindow.getByLabel(POPOVER);
  if (open) return open;
  const url = new URL(window.location.href);
  url.search = `?surface=${POPOVER_SURFACE}`;
  url.hash = '';
  const made = new WebviewWindow(POPOVER, {
    url: url.toString(),
    width: POPOVER_W,
    height: POPOVER_H,
    decorations: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    visible: false,
    focus: true,
    shadow: true,
  });
  // It closes as soon as the person looks elsewhere, as a menu-bar popover does.
  await made.onFocusChanged(({ payload: focused }) => {
    if (!focused) void made.hide();
  });
  return made;
}

async function togglePopover(event: TrayIconEvent): Promise<void> {
  if (event.type !== 'Click' || event.button !== 'Left' || event.buttonState !== 'Up') return;
  const pop = await popoverWindow();
  if (await pop.isVisible()) {
    await pop.hide();
    return;
  }
  const scale = await pop.scaleFactor();
  const { position, size } = event.rect;
  const x = position.x + size.width / 2 - (POPOVER_W * scale) / 2;
  // Under the menu bar on a Mac; above the taskbar on Windows, where the tray sits at the foot.
  const below = position.y < window.screen.height * scale * 0.5;
  const y = below
    ? position.y + size.height + 6 * scale
    : position.y - POPOVER_H * scale - 6 * scale;
  const { PhysicalPosition } = await import('@tauri-apps/api/dpi');
  await pop.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));
  await pop.show();
  await pop.setFocus();
}

/** The firefly waiting longest on your step, across your farms and visits, if any. */
function useWaitingFirefly(rows: readonly ChatListItem[], me: string | null) {
  return (
    rows.find((r) => r.kind === 'firefly' && r.forYou && r.actor !== null && r.actor !== me) ?? null
  );
}

function FireflyCard({
  row,
  me,
  onCard,
}: {
  readonly row: ChatListItem;
  readonly me: string | null;
  readonly onCard: (card: TrayCard | null) => void;
}) {
  const seen = useSeenTo(row.farm);
  const state = useFarm(row.farm)?.state ?? null;
  const fresh = hasNews(row, me, seen);
  const member = state?.members.find((m) => m.person === row.actor);
  const peer = row.with && row.with.person === row.actor ? row.with : null;
  const name = member?.name ?? peer?.name ?? null;
  const species = member?.critter.species ?? peer?.critter.species ?? null;
  const season = state?.season.season ?? 'spring';
  useEffect(() => {
    onCard(
      fresh && name && species && row.actor
        ? { kind: 'firefly', farm: row.farm, season, from: row.actor, name, species }
        : null,
    );
  }, [fresh, name, species, season, row.farm, row.actor, onCard]);
  return null;
}

/**
 * The desktop app's own parts, around the web app (`14 Platforms`, 14-11 to 14-15): the menu
 * bar's menus, the critter in the menu bar (Mac) or tray (Windows) that glows, breathing over
 * 2.4 s, while a firefly waits or friends are by the fire, its popover with the night widget, and
 * soft banners (no sound) for things on your step, knocks and words meant for you.
 */
export function DesktopHost() {
  const { t } = useLocale();
  const store = useArt();
  const desk = useDesk();
  const { chats } = useCottage();
  const me = useMe();
  const client = useDataClient();
  const tray = useRef<TrayIcon | null>(null);
  const [firefly, setFirefly] = useState<TrayCard | null>(null);
  const fire = useFireOnFarm(desk.farm ?? '');
  const fireState = useFarm(desk.farm ?? '')?.state ?? null;
  const waiting = useWaitingFirefly(chats, me.person);

  const card: TrayCard = useMemo(() => {
    if (desk.farm && fire.lit && fire.line) {
      const by = fireState?.members.find((m) => m.person !== me.person);
      return {
        kind: 'fire',
        farm: desk.farm,
        season: fireState?.season.season ?? 'spring',
        line: fire.line,
        species: by?.critter.species ?? null,
      };
    }
    return firefly ?? { kind: 'quiet' };
  }, [desk.farm, fire.lit, fire.line, fireState, me.person, firefly]);
  const glow: Glow | null = card.kind === 'quiet' ? null : card.kind;

  // The menu bar's menus, in the reader's language.
  useEffect(() => {
    void setAppMenu(t, t('shell.appName'));
  }, [t]);

  // The critter, made once; its menu follows the language.
  useEffect(() => {
    let live = true;
    void (async () => {
      const menu = await trayMenu(t, () => void showMain());
      if (tray.current) {
        await tray.current.setMenu(menu);
        return;
      }
      const made = await TrayIcon.new({
        id: 'critter',
        tooltip: t('shell.appName'),
        menu,
        showMenuOnLeftClick: false,
        action: (event) => void togglePopover(event),
      });
      if (live) tray.current = made;
      else void made.close();
    })();
    return () => {
      live = false;
    };
  }, [t]);
  useEffect(
    () => () => {
      void tray.current?.close();
      tray.current = null;
    },
    [],
  );

  // Its picture: your own critter, glowing on a breath while something waits.
  const frames = useMemo(
    () => (me.critter ? trayFrames(store, me.critter, glow) : []),
    [store, me.critter, glow],
  );
  useEffect(() => {
    if (frames.length === 0) return;
    let frame = 0;
    const show = () => void tray.current?.setIcon(frames[frame % frames.length] ?? null);
    show();
    if (frames.length === 1) return;
    const timer = setInterval(() => {
      frame += 1;
      show();
    }, platformMotion.trayBreathMs / GLOW_FRAMES);
    return () => clearInterval(timer);
  }, [frames]);

  // The popover asks for its card when it opens, and hears every change.
  const latest = useRef(card);
  latest.current = card;
  useEffect(() => {
    void emitTo(POPOVER, EVENTS.card, card).catch(() => undefined);
  }, [card]);
  useEffect(() => {
    const wanted = listen(EVENTS.wanted, () => void emitTo(POPOVER, EVENTS.card, latest.current));
    const acted = listen<TrayAction>(EVENTS.action, ({ payload }) => {
      const now = latest.current;
      void showMain();
      if (now.kind === 'quiet') return;
      openChat(now.farm);
      if (payload === 'sendBack' && now.kind === 'firefly') {
        router.push(gestureRoutes.firefly(now.farm, now.from));
      }
      if (payload === 'sit') desk.setFire(true);
    });
    return () => {
      void wanted.then((off) => off());
      void acted.then((off) => off());
    };
  }, [desk]);

  // Soft banners: no sound, only for what's meant for you, never for what was there already.
  const seen = useRef(new Map<string, number>());
  const allowed = useRef<boolean | null>(null);
  useEffect(() => {
    const notes = softNotes(chats, seen.current, me.person);
    if (notes.length === 0) return;
    void (async () => {
      allowed.current ??=
        (await isPermissionGranted()) || (await requestPermission()) === 'granted';
      if (!allowed.current) return;
      for (const note of notes) {
        const state = (await client.replica(note.farm)).getState()?.state ?? null;
        const name =
          note.knownName ??
          state?.members.find((m) => m.person === note.actor)?.name ??
          t('push.aFriend');
        const params = note.preview === null ? { name } : { name, preview: note.preview };
        sendNotification({
          title: note.farmName
            ? t('platforms.notify.from', { name, farm: note.farmName })
            : t('push.app'),
          body: t(note.body as 'push.doorstep.firefly', params as { name: string }),
        });
      }
    })();
  }, [chats, me.person, t, client]);

  return waiting ? <FireflyCard row={waiting} me={me.person} onCard={setFirefly} /> : null;
}
