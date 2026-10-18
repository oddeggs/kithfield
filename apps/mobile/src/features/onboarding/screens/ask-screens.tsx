import * as Contacts from 'expo-contacts';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { Share } from 'react-native';

import { useLocale } from '../../../ui/locale/locale-provider';
import { useAccount } from '../../../ui/session/account';
import { AskScreen } from '../ask-screen';
import { afterNotifications, routes } from '../flow';
import { useFlow } from '../flow-state';
import { useProgress } from '../progress';
import { useFarmMessage } from './plant-screen';

/** Can Otis knock when it matters: the farm asks before the system does. */
export function NotificationsScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const account = useAccount();
  const { state } = useFlow();
  const progress = useProgress();
  const next = () => void progress.go(afterNotifications(state.path));
  return (
    <AskScreen
      spot="notif"
      eyebrow={t('onboarding.notifications.eyebrow')}
      title={t('onboarding.notifications.title')}
      body={t('onboarding.notifications.body')}
      promises={[
        { text: t('onboarding.notifications.plan') },
        { text: t('onboarding.notifications.doorstep') },
        { text: t('onboarding.notifications.fire') },
        { text: t('onboarding.notifications.never'), never: true },
      ]}
      yes={t('onboarding.notifications.yes')}
      no={t('onboarding.notifications.no')}
      onYes={async () => {
        const answer = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowSound: true, allowBadge: false },
        }).catch(() => null);
        // Allowed: the server hears where to knock at once, not on the next launch.
        if (answer?.granted) await account.registerPush();
        next();
      }}
      onNo={next}
      onSkip={next}
      onBack={() => router.back()}
    />
  );
}

/** Shall Pim look for your friends: the address book stays on the phone, invites go one by one. */
export function ContactsScreen() {
  const router = useRouter();
  const { t } = useLocale();
  const progress = useProgress();
  const message = useFarmMessage();
  const done = () => void progress.finish();
  return (
    <AskScreen
      spot="contacts"
      eyebrow={t('onboarding.contacts.eyebrow')}
      title={t('onboarding.contacts.title')}
      body={t('onboarding.contacts.body')}
      promises={[
        { text: t('onboarding.contacts.stay') },
        { text: t('onboarding.contacts.choose') },
        { text: t('onboarding.contacts.never'), never: true },
      ]}
      yes={t('onboarding.contacts.yes')}
      no={t('onboarding.contacts.no')}
      onYes={async () => {
        await Contacts.requestPermissionsAsync().catch(() => undefined);
        router.push(routes.friends);
      }}
      onNo={() => {
        if (!message) {
          done();
          return;
        }
        void Share.share({ message })
          .catch(() => undefined)
          .then(done);
      }}
      onSkip={done}
      onBack={() => router.back()}
    />
  );
}

/**
 * Fig would love to see: before the first photo. The system photo picker needs no access, so
 * "Choose photos" goes straight back to it; recent photos in the tray need the library.
 */
export function PhotosAsk({ onDone }: { readonly onDone: () => void }) {
  const { t } = useLocale();
  return (
    <AskScreen
      spot="photos"
      eyebrow={t('onboarding.photos.eyebrow')}
      title={t('onboarding.photos.title')}
      body={t('onboarding.photos.body')}
      promises={[{ text: t('onboarding.photos.picker') }, { text: t('onboarding.photos.recent') }]}
      yes={t('onboarding.photos.yes')}
      no={t('onboarding.photos.no')}
      systemAsksNext={false}
      onYes={onDone}
      onNo={() => {
        void MediaLibrary.requestPermissionsAsync(false, ['photo', 'video'])
          .catch(() => undefined)
          .then(onDone);
      }}
      onSkip={onDone}
      onBack={onDone}
    />
  );
}

/** A lantern on the way: location while the app is open, on a hangout day only. */
export function LocationAsk({ onDone }: { readonly onDone: () => void }) {
  const { t } = useLocale();
  return (
    <AskScreen
      spot="location"
      eyebrow={t('onboarding.location.eyebrow')}
      title={t('onboarding.location.title')}
      body={t('onboarding.location.body')}
      promises={[
        { text: t('onboarding.location.heading') },
        { text: t('onboarding.location.off') },
        { text: t('onboarding.location.never'), never: true },
      ]}
      yes={t('onboarding.location.yes')}
      no={t('onboarding.location.no')}
      onYes={async () => {
        await Location.requestForegroundPermissionsAsync().catch(() => undefined);
        onDone();
      }}
      onNo={onDone}
      onSkip={onDone}
      onBack={onDone}
    />
  );
}
