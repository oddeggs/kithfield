import type { PendingWrite } from '../../data';
import { View } from 'react-native';

import { ArtIcon } from '../../ui/art/art-view';
import { useLocale } from '../../ui/locale/locale-provider';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { typeAt } from './type-at';

/**
 * The ink banner over the farm in a fog (`12 States`, offline): no signal, and where what you send
 * goes meanwhile. Read once as an alert.
 */
export function OfflineBanner({ top }: { readonly top: number }) {
  const { t, fontLocale } = useLocale();
  const { palette } = useTheme();
  const title = t('states.offline.title');
  const body = t('states.offline.body');
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${body}`}
      style={{
        position: 'absolute',
        top,
        left: 16,
        right: 16,
        borderRadius: 18,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: palette.notice.bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <ArtIcon name="raincloud" size={28} color={palette.notice.bg} />
      <View style={{ flex: 1 }}>
        <Txt
          variant="rowTitle"
          color={palette.notice.fg}
          style={typeAt('rowTitle', 15, 18, fontLocale)}
        >
          {title}
        </Txt>
        <Txt
          variant="caption"
          multiline
          color={palette.notice.fg}
          style={[typeAt('caption', 13.5, 18.2, fontLocale), { opacity: 0.85 }]}
        >
          {body}
        </Txt>
      </View>
    </View>
  );
}

/** What a waiting write is called in the post bag, and the icon it shows with. */
function itemOf(
  w: PendingWrite,
  farmName: string,
  t: ReturnType<typeof useLocale>['t'],
): { icon: string; title: string; sub: string } {
  const payload = (w.payload ?? {}) as { text?: unknown };
  const waiting = t('states.postBag.waiting');
  switch (w.kind) {
    case 'message': {
      const text = typeof payload.text === 'string' ? payload.text.trim() : '';
      return {
        icon: 'envelope',
        title: text ? t('states.postBag.message', { text }) : t('states.postBag.messageNoText'),
        sub: t('states.postBag.messageTo', { farm: farmName }),
      };
    }
    case 'dewdrop':
      return { icon: 'dewdrop', title: t('states.postBag.dewdrop'), sub: waiting };
    case 'firefly':
      return { icon: 'firefly', title: t('states.postBag.firefly'), sub: waiting };
    case 'wave':
      return { icon: 'wave', title: t('states.postBag.wave'), sub: waiting };
    case 'sticker':
      return { icon: 'sparkle', title: t('states.postBag.sticker'), sub: waiting };
    default:
      return {
        icon: 'envelope',
        title: t('states.postBag.other', { farm: farmName }),
        sub: waiting,
      };
  }
}

/**
 * What waits to go while the farm is in a fog, oldest first: it sends in order when the signal is
 * back. Nothing shows when the bag is empty.
 */
export function PostBag({
  pending,
  farmName,
}: {
  readonly pending: readonly PendingWrite[];
  readonly farmName: string;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const waiting = pending.filter((w) => !w.acked);
  if (waiting.length === 0) return null;
  return (
    <View style={{ gap: 0, marginBottom: 12 }}>
      <Txt variant="label" color={palette.secondary} accessibilityRole="header">
        {t('states.postBag.label')}
      </Txt>
      <View style={{ marginTop: 12 }}>
        {waiting.map((w) => {
          const item = itemOf(w, farmName, t);
          return (
            <View
              key={w.opId}
              accessible
              accessibilityLabel={`${item.title}, ${item.sub}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
                minHeight: 44,
              }}
            >
              <ArtIcon name={item.icon} size={34} color={palette.text} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="rowTitle" multiline numberOfLines={2}>
                  {item.title}
                </Txt>
                <Txt variant="caption" multiline color={palette.secondary} style={{ marginTop: 2 }}>
                  {item.sub}
                </Txt>
              </View>
              <ArtIcon name="clock" size={20} color={palette.placeholder} />
            </View>
          );
        })}
      </View>
    </View>
  );
}
