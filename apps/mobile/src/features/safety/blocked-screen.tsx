import type { BlockList } from '@kithfield/contracts';
import { motion } from '@kithfield/theme';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';

import { Avatar } from '../../ui/art/avatar';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { useBlocked } from '../../data/blocks';
import { useBlocks } from '../settings/api/use-api';
import { lookOf } from '../settings/format';
import { NavBar, Note, Page, Row } from '../settings/kit/layout';
import { KText } from '../settings/kit/text';

type Blocked = BlockList['blocked'][number];

/** Settings › Blocked: the people you blocked, each a tap from unblocked. Neither is ever told. */
export function BlockedScreen() {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const toast = useToast();
  const blocks = useBlocks();
  const people = useBlocked().blocked;
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    blocks.refresh().then(
      () => setLoaded(true),
      () => setLoaded(true),
    );
  }, [blocks]);
  const day = (at: number) =>
    new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
      day: 'numeric',
      month: 'long',
    }).format(at);
  const unblock = (b: Blocked) => {
    const name = b.name ?? t('safety.friend');
    blocks.unblock(b.person).then(
      () => toast.show(t('safety.blocked.undone', { name })),
      () => toast.show(t('safety.failed')),
    );
  };
  return (
    <Page header={<NavBar title={t('safety.blocked.title')} />}>
      {people.length > 0 ? (
        <View
          style={{
            borderRadius: 22,
            backgroundColor: palette.card,
            paddingVertical: 2,
            paddingHorizontal: 14,
          }}
        >
          {people.map((b, i) => (
            <Animated.View
              key={b.person}
              layout={LinearTransition.duration(motion.fade.durationMs)}
              exiting={FadeOut.duration(motion.fade.durationMs)}
              style={i === 0 ? null : { borderTopWidth: 1, borderTopColor: palette.hairline }}
            >
              <Row
                title={b.name ?? t('safety.friend')}
                subtitle={t('safety.blocked.since', { day: day(b.at) })}
                {...(b.critter
                  ? { lead: <Avatar kind={b.critter.species} look={lookOf(b.critter)} size={40} /> }
                  : {})}
                trailing={
                  <Press
                    onPress={() => unblock(b)}
                    darken={false}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('safety.blocked.unblock')}, ${b.name ?? t('safety.friend')}`}
                  >
                    <KText kind="pill" style={{ fontSize: 14, lineHeight: 17 }}>
                      {t('safety.blocked.unblock')}
                    </KText>
                  </Press>
                }
              />
            </Animated.View>
          ))}
        </View>
      ) : null}
      <Note
        text={loaded && people.length === 0 ? t('safety.blocked.none') : t('safety.blocked.note')}
      />
    </Page>
  );
}
