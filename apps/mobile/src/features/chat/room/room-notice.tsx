import type { FarmState, PersonId } from '@kithfield/contracts';
import { View } from 'react-native';

import type { FarmLink } from '../../../data';
import { ArtIcon } from '../../../ui/art/art-view';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';

export interface Notice {
  readonly text: string;
  readonly icon: string;
  /** The person can read but not write here for now. */
  readonly blocksWriting: boolean;
}

/** What the chat should say over its field: no signal, an update needed, a pause, a frozen farm. */
export function useRoomNotice(
  link: FarmLink,
  state: FarmState | null,
  me: PersonId | null,
  now: number,
): Notice | null {
  const { t } = useLocale();
  if (link.status === 'blocked') {
    if (link.code === 'rules_outdated' || link.code === 'protocol_unsupported') {
      return { text: t('chat.room.needsUpdate'), icon: 'sparkle', blocksWriting: false };
    }
    if (link.code === 'not_member' || link.code === 'farm_gone') {
      return { text: t('chat.room.gone'), icon: 'door', blocksWriting: true };
    }
  }
  const mine = state?.members.find((m) => m.person === me);
  if (mine && (mine.pausedUntil ?? 0) > now) {
    return { text: t('chat.room.paused'), icon: 'moon', blocksWriting: true };
  }
  if (state?.frozen) return { text: t('chat.room.frozen'), icon: 'moon', blocksWriting: true };
  if (link.status === 'offline') {
    return { text: t('chat.room.offline'), icon: 'raincloud', blocksWriting: false };
  }
  return null;
}

/** The ink card over the field (04-15): "No signal. Messages wait in the post bag…". */
export function RoomNotice({ notice }: { readonly notice: Notice | null }) {
  const { palette } = useTheme();
  if (!notice) return null;
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={notice.text}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: palette.notice.bg,
      }}
    >
      <ArtIcon name={notice.icon} size={22} color={palette.notice.fg} />
      <Txt variant="notice" multiline color={palette.notice.fg} style={{ flex: 1 }}>
        {notice.text}
      </Txt>
    </View>
  );
}
