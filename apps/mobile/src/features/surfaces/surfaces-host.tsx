import type { NotificationAction, SurfaceData } from '@kithfield/contracts';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useRef } from 'react';
import { AppState, Image, Platform } from 'react-native';

import { useCottage, useDataClient } from '../../data';
import { useArt } from '../../ui/art/art-provider';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { useSession } from '../../ui/session/session';
import { useUpload } from '../media';
import { setUpChannels } from '../android/notification-channels';
import { androidSurfaceRoot } from '../android/surface-root';
import { reloadAndroidWidgets } from '../android/widgets/reload';
import { useMessagesSync } from '../stickers/export/use-messages-sync';
import { followActivityTokens } from './activity-tokens';
import { registerBackgroundTask, takeWoken } from './background';
import { clearSurfacesForSignOut, writtenForSomeoneElse } from './clear';
import { endOrphanFireActivities } from './fire-activity';
import { groupRoot, nativeGroupStore } from './group-store';
import { ACTION_TITLES, categories } from './notification-actions';
import { openTarget } from './open';
import { appScheme } from './scheme';
import type { ShareSender, SharedFile } from './share-outbox';
import { createSurfaces, urgentKind, type Surfaces } from './surfaces';

const sizeOf = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve) =>
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 }),
    ),
  );

/** The media queue and the outbox, as the share extension's drafts are sent through them. */
function useShareSender(): ShareSender {
  const upload = useUpload();
  const client = useDataClient();
  return useMemo(
    () => ({
      async media(farm, files, caption) {
        const assets = await Promise.all(
          files.map(async (f: SharedFile) => ({
            uri: f.uri,
            ...(f.kind === 'photo' ? await sizeOf(f.uri) : { width: 0, height: 0 }),
            type: f.kind === 'video' ? ('video' as const) : ('image' as const),
            fileName: f.name,
            fileSize: f.bytes,
            mimeType: f.mime,
          })),
        );
        await upload.sendPicked(farm, assets, caption !== undefined ? { caption } : {});
      },
      async documents(farm, files, caption) {
        const assets = files.map((f) => ({
          uri: f.uri,
          name: f.name,
          size: f.bytes,
          mimeType: f.mime,
          lastModified: Date.now(),
        }));
        await upload.sendDocuments(farm, assets, caption !== undefined ? { caption } : {});
      },
      async words(farm, opId, text, url) {
        const result =
          url !== undefined
            ? await client.send(
                farm,
                'link',
                { url, ...(text !== undefined ? { text } : {}) },
                opId,
              )
            : await client.send(farm, 'message', { text: text ?? '' }, opId);
        if (result.status === 'refused') throw new Error(`refused: ${result.reason}`);
      },
    }),
    [client, upload],
  );
}

/**
 * The native surfaces' side in the app, mounted once under the data layer: see `surfaces.ts`.
 * It renders nothing.
 */
export function SurfacesHost() {
  const session = useSession();
  const me = session.status === 'signedIn' && session.onboarded ? session.person?.id : null;
  // Android has no App Group or Live Activities, but the same widgets, pushes and their actions.
  const native = Platform.OS === 'ios' || Platform.OS === 'android';
  if (!native || me === undefined || me === null) return null;
  return <Running me={me} />;
}

function Running({ me }: { readonly me: string }) {
  const client = useDataClient();
  const art = useArt();
  const { t, language } = useLocale();
  const shares = useShareSender();
  const toast = useToast();
  const { chats } = useCottage();
  const lang = useRef(language);
  lang.current = language;
  const surfacesRef = useRef<Surfaces | null>(null);
  // The Messages drawer keeps wearing what the critter wears now.
  useMessagesSync();

  useEffect(() => {
    const root = Platform.OS === 'android' ? androidSurfaceRoot() : groupRoot();
    if (root === null) return;
    const report = (error: unknown) => {
      if (__DEV__) console.warn('surfaces', error);
    };
    const surfaces = createSurfaces({
      client,
      art,
      group: nativeGroupStore(root),
      me,
      lang: () => lang.current,
      scheme: appScheme(),
      shares,
      open: openTarget,
      sharesRefused: () => toast.show(t('surfaces.share.failed')),
      report,
      ...(Platform.OS === 'android'
        ? { reloadWidgets: (data: SurfaceData) => reloadAndroidWidgets(art, data) }
        : {}),
    });
    surfacesRef.current = surfaces;
    const stopTokens = followActivityTokens(client, report);
    const stopWoken = takeWoken(async (event) => {
      if (event.kind === 'refresh') {
        await surfaces.refresh({ force: true, catchUp: [event.data.farm] });
      } else {
        await surfaces.respond(event);
      }
    });
    registerBackgroundTask().catch(report);
    endOrphanFireActivities().catch(report);
    // Another person on this phone: nothing of the last one stays on the surfaces.
    const group = nativeGroupStore(root);
    void writtenForSomeoneElse(group, me)
      .then((theirs) => (theirs ? clearSurfacesForSignOut() : undefined))
      .then(() => surfaces.refresh({ force: true }))
      .then(() => surfaces.shares());

    const answered = new Set<string>();
    const respond = (response: Notifications.NotificationResponse) => {
      const request = response.notification.request;
      const key = `${request.identifier}\n${response.actionIdentifier}`;
      if (answered.has(key)) return;
      answered.add(key);
      void surfaces
        .respond({
          id: request.identifier,
          action: response.actionIdentifier,
          category: request.content.categoryIdentifier ?? null,
          data: request.content.data,
          at: response.notification.date,
        })
        .catch(report);
    };
    const responses = Notifications.addNotificationResponseReceivedListener(respond);
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      respond(last);
      Notifications.clearLastNotificationResponse();
    }

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void surfaces.refresh().then(() => surfaces.shares());
      // Leaving the app is when the widgets matter: write what changed while it was open.
      if (state === 'background') void surfaces.refresh({ force: true });
    });

    return () => {
      surfaces.stop();
      surfacesRef.current = null;
      stopTokens();
      stopWoken();
      responses.remove();
      appState.remove();
    };
  }, [client, art, me, shares, t, toast]);

  // The lock-screen actions, titled in the person's language. One at a time: each call reads the
  // categories already set and writes them back with its own, so calls side by side lose one.
  useEffect(() => {
    if (Platform.OS === 'android') {
      setUpChannels(t).catch((error: unknown) => {
        if (__DEV__) console.warn('surfaces: channels', error);
      });
    }
    const set = categories((action: NotificationAction) => t(ACTION_TITLES[action]));
    void (async () => {
      for (const category of set) {
        await Notifications.setNotificationCategoryAsync(category.identifier, category.actions);
      }
    })().catch((error: unknown) => {
      if (__DEV__) console.warn('surfaces: categories', error);
    });
  }, [t]);

  // Farm activity: the widgets catch up within 15 minutes, the fire and knocks at once.
  const newest = chats.reduce((latest, c) => Math.max(latest, c.at), 0);
  const urgent = chats
    .filter((c) => urgentKind(c.kind))
    .map((c) => `${c.farm}:${c.seq}`)
    .join(',');
  useEffect(() => {
    surfacesRef.current?.refresh().catch(() => undefined);
  }, [newest]);
  useEffect(() => {
    if (urgent === '') return;
    const farms = [...new Set(urgent.split(',').map((s) => s.slice(0, s.lastIndexOf(':'))))];
    surfacesRef.current?.refresh({ force: true, catchUp: farms }).catch(() => undefined);
  }, [urgent]);

  return null;
}
