import { day, motion } from '@kithfield/theme';
import { Fields, getContactsAsync, getPermissionsAsync, SortTypes } from 'expo-contacts/legacy';
import { useRouter } from 'expo-router';
import * as SMS from 'expo-sms';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Share, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ArtIcon, ArtStill } from '../../../ui/art/art-view';
import { Button } from '../../../ui/components/button';
import { Chip } from '../../../ui/components/chip';
import { EmptyState } from '../../../ui/components/state-shell';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useReduceMotion } from '../../../ui/motion/reduce-motion';
import { useTheme } from '../../../ui/theme/theme-provider';
import { AX_FONT_SCALE, useAccessibilitySize } from '../../../ui/type/accessibility-size';
import { Txt } from '../../../ui/type/text';
import { friendsIn, matching, tintFor, type Friend } from '../contacts';
import { BottomBar, TopBar, useBottom, useDesignTop } from '../kit';
import { useProgress } from '../progress';
import { useFarmMessage } from './plant-screen';

type Book = { kind: 'loading' } | { kind: 'denied' } | { kind: 'ready'; friends: Friend[] };

function FriendRow({
  friend,
  invited,
  onInvite,
  last,
}: {
  readonly friend: Friend;
  readonly invited: boolean;
  readonly onInvite: () => void;
  readonly last: boolean;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const reduce = useReduceMotion();
  const letter = { fontSize: 18, lineHeight: 24 };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        minHeight: 44,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: palette.hairline,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: tintFor(friend.id),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* The friend's tint is always light, so the letter keeps day ink in both appearances; it
            grows with the text only as far as its circle holds. */}
        <Txt
          variant="fieldValue"
          color={day.ink}
          maxFontSizeMultiplier={AX_FONT_SCALE}
          style={letter}
        >
          {friend.initial}
        </Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="rowTitle" numberOfLines={1}>
          {friend.name}
        </Txt>
        <Txt variant="rowSubtitle" color={palette.secondary} style={{ marginTop: 2 }}>
          {t('onboarding.friends.byText')}
        </Txt>
      </View>
      {/* The chip flips to Invited with a short cross-fade. */}
      <Animated.View
        key={invited ? 'invited' : 'invite'}
        {...(reduce ? {} : { entering: FadeIn.duration(motion.cross.durationMs) })}
      >
        {invited ? (
          <Chip
            label={t('onboarding.friends.invited')}
            kind="invited"
            accessibilityLabel={t('onboarding.friends.invitedNamed', { name: friend.name })}
          />
        ) : (
          <Chip
            label={t('onboarding.friends.invite')}
            onPress={onInvite}
            accessibilityLabel={t('onboarding.friends.inviteNamed', { name: friend.name })}
          />
        )}
      </Animated.View>
    </View>
  );
}

/**
 * Find your people: friends from the address book, each invited by text with the farm's link.
 * Matching contacts against Kithfield waits for phone sign-in, so everyone shows as not here yet.
 */
export function FriendsScreen() {
  const router = useRouter();
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const top = useDesignTop();
  const bottom = useBottom();
  const ax = useAccessibilitySize();
  const progress = useProgress();
  const message = useFarmMessage();
  const [book, setBook] = useState<Book>({ kind: 'loading' });
  const [query, setQuery] = useState('');
  const [invited, setInvited] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let live = true;
    void (async () => {
      const { granted } = await getPermissionsAsync();
      if (!granted) {
        if (live) setBook({ kind: 'denied' });
        return;
      }
      const { data } = await getContactsAsync({
        fields: [Fields.Name, Fields.FirstName, Fields.LastName, Fields.PhoneNumbers],
        sort: SortTypes.FirstName,
      });
      if (live) setBook({ kind: 'ready', friends: friendsIn(data, language) });
    })().catch(() => live && setBook({ kind: 'denied' }));
    return () => {
      live = false;
    };
  }, [language]);

  const shown = useMemo(
    () => (book.kind === 'ready' ? matching(book.friends, query) : []),
    [book, query],
  );

  const invite = async (friend: Friend) => {
    if (!message) return;
    let sent: boolean;
    if (await SMS.isAvailableAsync()) {
      const { result } = await SMS.sendSMSAsync([friend.phone], message);
      sent = result !== 'cancelled';
    } else {
      const answer = await Share.share({ message });
      sent = answer.action === Share.sharedAction;
    }
    if (sent) setInvited((s) => new Set(s).add(friend.id));
  };
  const shareLink = () => {
    if (message) void Share.share({ message }).catch(() => undefined);
  };

  const count = invited.size;
  const empty =
    book.kind === 'denied' || (book.kind === 'ready' && book.friends.length === 0) ? (
      <EmptyState
        art={<ArtStill scene="spot" width={280} height={170} attrs={{ name: 'contacts' }} />}
        title={t(book.kind === 'denied' ? 'onboarding.friends.denied' : 'onboarding.friends.none')}
        body={t(
          book.kind === 'denied' ? 'onboarding.friends.deniedBody' : 'onboarding.friends.noneBody',
        )}
        action={{ label: t('onboarding.friends.shareLink'), onPress: shareLink, kind: 'secondary' }}
      />
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <TopBar
        onBack={() => router.back()}
        center={
          <Txt
            variant="rowTitle"
            {...(ax ? { align: 'center' as const } : {})}
            style={{ fontSize: 17, lineHeight: 19.55 }}
          >
            {t('onboarding.friends.title')}
          </Txt>
        }
      />
      <View
        style={
          // At the accessibility sizes the top bar is in the column, and the list follows it.
          ax
            ? { flex: 1, marginTop: 12, marginHorizontal: 16, gap: 10 }
            : { position: 'absolute', top: top(114), left: 16, right: 16, bottom: 0, gap: 10 }
        }
      >
        {empty ?? (
          <>
            <View
              style={{
                minHeight: 44,
                borderRadius: 16,
                backgroundColor: palette.card,
                borderWidth: 1,
                borderColor: palette.cardBorder,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 16,
              }}
            >
              <ArtIcon name="search" size={18} color={palette.placeholder} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('onboarding.friends.search')}
                placeholderTextColor={palette.placeholder}
                accessibilityLabel={t('onboarding.friends.search')}
                autoCorrect={false}
                clearButtonMode="while-editing"
                style={{ flex: 1, minHeight: 44, fontSize: 15, color: palette.text }}
              />
            </View>
            <Txt variant="label" color={palette.secondary} style={{ marginTop: 8 }}>
              {t('onboarding.friends.notHere')}
            </Txt>
            <FlatList
              data={shown}
              keyExtractor={(f) => f.id}
              keyboardShouldPersistTaps="handled"
              style={{
                flexGrow: 0,
                flexShrink: 1,
                borderRadius: 22,
                backgroundColor: palette.card,
              }}
              contentContainerStyle={{ paddingVertical: 2, paddingHorizontal: 14 }}
              renderItem={({ item, index }) => (
                <FriendRow
                  friend={item}
                  invited={invited.has(item.id)}
                  onInvite={() => void invite(item)}
                  last={index === shown.length - 1}
                />
              )}
            />
            <View style={{ height: bottom + 56 + 16 }} />
          </>
        )}
      </View>
      <BottomBar gap={8}>
        <Button
          label={
            count > 0
              ? t('onboarding.friends.doneInvited', { count })
              : t('onboarding.friends.done')
          }
          kind="go"
          onPress={() => void progress.finish()}
        />
      </BottomBar>
    </View>
  );
}
