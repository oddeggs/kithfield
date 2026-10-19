import type { FarmId, FarmNotifications, FarmNotificationsView } from '@kithfield/contracts';
import { ArtIcon } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { Toggle } from '../../../ui/components/toggle';
import { useLocale } from '../../../ui/locale/locale-provider';
import { haptics } from '../../../ui/motion/haptics';
import { Press } from '../../../ui/motion/press';
import { useSettingsApi } from '../api/use-api';
import { MUTE_CHOICES, muteChoiceOf, muteUntil, type MuteChoice } from '../format';
import { useKitColors } from '../kit/colors';
import { Group, Label, NavBar, Note, Page, Row } from '../kit/layout';
import { KText } from '../kit/text';
import { useRemote } from '../use-remote';
import { useRemoteGate } from '../kit/remote-state';
import { useFarmSettings } from './use-farm-settings';

const KNOCKS = ['plans', 'doorstep', 'mentions', 'messages'] as const;

/**
 * Notifications and muting for one farm: mute for a while, which knocks come, and the
 * kinds resting after three went unopened, each with its one-tap undo. Nobody sees any of it.
 */
export function NotificationsScreen({ farm }: { readonly farm: FarmId }) {
  const { t, language } = useLocale();
  const kit = useKitColors();
  const toast = useToast();
  const api = useSettingsApi();
  const { state } = useFarmSettings(farm);
  const view = useRemote(() => api.notifications(farm), farm);
  const n = view.data;
  const gate = useRemoteGate([view]);
  const now = Date.now();
  const chosen = n ? muteChoiceOf(n.mutedUntil, now) : null;

  const save = (next: FarmNotifications) => {
    const before = n;
    view.set((v) => ({ ...v, ...next }));
    api.setNotifications(farm, next).catch(() => {
      if (before) view.set(() => before);
      toast.show(t('settings.failed'));
    });
  };
  const mute = (choice: MuteChoice) => {
    if (!n) return;
    haptics.select();
    // Picking the chosen one again turns the mute off.
    save({
      mutedUntil: chosen === choice ? null : muteUntil(choice, Date.now()),
      knockFor: n.knockFor,
    });
  };
  const knock = (key: (typeof KNOCKS)[number], on: boolean) => {
    if (!n) return;
    save({ mutedUntil: n.mutedUntil, knockFor: { ...n.knockFor, [key]: on } });
  };
  const wake = (resting: FarmNotificationsView['resting'][number]) => {
    view.set((v) => ({ ...v, resting: v.resting.filter((r) => r.type !== resting.type) }));
    api.wakeResting(farm, resting.type).catch(() => {
      view.set((v) => ({ ...v, resting: [...v.resting, resting] }));
      toast.show(t('settings.failed'));
    });
  };
  const day = (at: number) =>
    new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'long' }).format(at);

  return (
    <Page
      header={
        <NavBar
          title={t('settings.farm.notifications')}
          {...(state?.name ? { subtitle: state.name } : {})}
        />
      }
    >
      {gate ?? (
        <>
          <Label text={t('settings.notify.mute')} />
          <Group>
            {MUTE_CHOICES.map((c) => (
              <Row
                key={c}
                title={t(`settings.notify.${c}`)}
                selected={chosen === c}
                onPress={() => mute(c)}
              />
            ))}
          </Group>
          <Note text={t('settings.notify.note')} />
          <Label text={t('settings.notify.knockFor')} />
          <Group>
            {KNOCKS.map((k) => (
              <Row
                key={k}
                title={t(`settings.notify.${k}`)}
                {...(k === 'messages' ? { subtitle: t('settings.notify.messagesSub') } : {})}
                trailing={
                  <Toggle
                    value={n?.knockFor[k] ?? false}
                    onChange={(on) => knock(k, on)}
                    label={t(`settings.notify.${k}`)}
                    disabled={!n}
                  />
                }
              />
            ))}
          </Group>
          {(n?.resting ?? []).map((r) => (
            <Press
              key={r.type}
              onPress={() => wake(r)}
              radius={18}
              accessibilityRole="button"
              accessibilityLabel={`${t('settings.notify.resting', {
                kind: t(`settings.notify.kind.${r.type}`),
                day: day(r.until),
              })} ${t('settings.notify.wake')}`}
              style={{
                borderRadius: 18,
                backgroundColor: kit.honeyNote.bg,
                paddingVertical: 12,
                paddingHorizontal: 14,
                flexDirection: 'row',
                gap: 10,
              }}
            >
              <ArtIcon name="moon" size={22} color={kit.honeyNote.icon} />
              <KText kind="card" multiline color={kit.honeyNote.fg} style={{ flex: 1 }}>
                {t('settings.notify.resting', {
                  kind: t(`settings.notify.kind.${r.type}`),
                  day: day(r.until),
                })}{' '}
                <KText kind="card" color={kit.honeyNote.fg} style={{ fontWeight: '600' }}>
                  {t('settings.notify.wake')}
                </KText>
              </KText>
            </Press>
          ))}
        </>
      )}
    </Page>
  );
}
