import { LIMITS, type FarmId, type Invite } from '@kithfield/contracts';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Share, View, useWindowDimensions } from 'react-native';

import { ArtIcon, ArtStill } from '../../../ui/art/art-view';
import { useToast } from '../../../ui/components/toast';
import { Toggle } from '../../../ui/components/toggle';
import { useLocale } from '../../../ui/locale/locale-provider';
import { haptics } from '../../../ui/motion/haptics';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { useSettingsApi } from '../api/use-api';
import { LINK_LIVES, linkExpiry, shortLink, type LinkLife } from '../format';
import { useKitColors } from '../kit/colors';
import { Group, Label, NavBar, Page, Pill, Row } from '../kit/layout';
import { KText } from '../kit/text';
import { useRemote } from '../use-remote';
import { useFarmSettings } from './use-farm-settings';

const STILL_T = 1.2;
const COLUMNS = 12;

/** The invite link and room on the farm. Keepers and helpers share it; keepers change it. */
export function InviteScreen({ farm }: { readonly farm: FarmId }) {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const toast = useToast();
  const api = useSettingsApi();
  const { width } = useWindowDimensions();
  const { state, isKeeper, write } = useFarmSettings(farm);
  const current = useRemote(() => api.currentInvite(farm), farm);
  const [made, setMade] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => setMade(null), [farm]);
  const invite = made ?? current.data?.invite ?? null;
  const taken = state?.members.length ?? 0;
  const full = taken >= LIMITS.members;
  const farmName = state?.name ?? '';

  const makeLink = (life: LinkLife) => {
    setBusy(true);
    api
      .newInvite(farm, { expiresAt: linkExpiry(life, Date.now()) })
      .then(
        (next) => {
          haptics.success();
          setMade(next);
        },
        () => toast.show(t('settings.failed')),
      )
      .finally(() => setBusy(false));
  };
  const copy = () => {
    if (!invite) return;
    void Clipboard.setStringAsync(invite.url).then(() => toast.show(t('settings.invite.copied')));
  };
  const share = () => {
    if (!invite) return;
    void Share.share({
      message: t('settings.invite.message', { farm: farmName, url: invite.url }),
    });
  };
  const lasts = invite?.expiresAt
    ? t('settings.invite.until', {
        day: new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', {
          day: 'numeric',
          month: 'long',
        }).format(invite.expiresAt),
      })
    : t('settings.invite.always');
  const cardWidth = width - 32 - 32 - 2;
  const cell = (width - 32 - 28 - 4 * (COLUMNS - 1)) / COLUMNS;

  return (
    <Page header={<NavBar title={t('settings.farm.invite')} />}>
      <View
        style={{
          borderRadius: 24,
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.cardBorder,
          padding: 16,
          gap: 12,
          alignItems: 'center',
        }}
      >
        <View style={{ borderRadius: 16, overflow: 'hidden' }}>
          <ArtStill
            scene="invite"
            width={cardWidth}
            height={150}
            attrs={{ season: state?.season.season ?? 'spring' }}
            t={STILL_T}
          />
        </View>
        {full ? (
          <KText kind="rowTitle">{t('settings.invite.full')}</KText>
        ) : invite ? (
          <>
            <Txt mono variant="body" style={{ fontSize: 15, lineHeight: 18, fontWeight: '500' }}>
              {shortLink(invite.url)}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
              <Pill label={t('settings.invite.copy')} onPress={copy} style={{ flex: 1 }} />
              <Pill
                label={t('settings.invite.share')}
                kind="ink"
                onPress={share}
                style={{ flex: 1 }}
              />
            </View>
          </>
        ) : (
          <>
            <KText kind="rowSub" color={palette.secondary}>
              {t('settings.invite.none')}
            </KText>
            <Pill
              label={t('settings.invite.make')}
              kind="ink"
              disabled={busy}
              onPress={() => makeLink('always')}
              style={{ alignSelf: 'stretch' }}
            />
          </>
        )}
      </View>
      <Label text={t('settings.invite.roomTitle')} />
      <View style={{ borderRadius: 22, backgroundColor: palette.card, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }} accessible={false}>
          {Array.from({ length: LIMITS.members }, (_, i) => (
            <View
              key={i}
              style={{ width: cell, height: 22, alignItems: 'center', justifyContent: 'center' }}
            >
              <ArtIcon name="farm" size={20} color={i < taken ? palette.text : kit.cottageEmpty} />
            </View>
          ))}
        </View>
        <KText kind="card" multiline color={kit.body2}>
          {t('settings.invite.room', { count: taken, max: LIMITS.members })}
        </KText>
      </View>
      {isKeeper ? (
        <Group>
          <Row
            title={t('settings.invite.approval')}
            trailing={
              <Toggle
                value={state?.approval ?? false}
                onChange={(on) => void write('settings_changed', { setting: 'approval', on })}
                label={t('settings.invite.approval')}
              />
            }
          />
          <Row
            title={t('settings.invite.lasts')}
            value={lasts}
            onPress={() => setChoosing((c) => !c)}
          />
          {choosing
            ? LINK_LIVES.map((life) => (
                <Row
                  key={life}
                  title={t(`settings.invite.${life}`)}
                  selected={false}
                  onPress={() => {
                    setChoosing(false);
                    makeLink(life);
                  }}
                />
              ))
            : null}
          <Row
            title={t('settings.invite.new')}
            subtitle={t('settings.invite.newSub')}
            danger
            chevron={false}
            onPress={() => makeLink('always')}
          />
        </Group>
      ) : null}
    </Page>
  );
}
