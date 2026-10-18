import { router } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { LayeredScene } from '../../../ui/art/layered-scene';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { Eyebrow, Title } from '../kit/bits';
import { useInks } from '../kit/inks';
import { Header, HeroSheet, useDesignTop } from '../kit/layout';
import { BigPill, LegalLinks, PerkGrid, Tick } from '../kit/patron-bits';
import { currentSeason } from '../kit/season';
import { SText } from '../kit/text';
import { openShopPage } from '../site';

/**
 * Patrons, one honest screen: why the shop exists, what stays free, what patrons get, and the way
 * on to the tiers. The renewal line and the legal links are always shown in full.
 */
export function PatronsScreen() {
  const { t, language } = useLocale();
  const inks = useInks();
  const { width } = useWindowDimensions();
  const top = useDesignTop();
  return (
    <HeroSheet
      artHeight={300}
      sheetTop={240}
      art={
        <LayeredScene
          scene="style"
          width={width}
          height={top(300)}
          attrs={{ name: 'lighthouse', night: 'true', season: currentSeason() }}
        />
      }
      header={<Header />}
    >
      <Eyebrow text={t('shop.patrons.eyebrow')} tone="honey" />
      <Title text={t('shop.patrons.title')} />
      <Ticks lines={[t('shop.patrons.noAds'), t('shop.patrons.paidBy'), t('shop.patrons.free')]} />
      <Press
        onPress={() => openShopPage('costs', language)}
        darken={false}
        accessibilityRole="link"
        accessibilityLabel={t('shop.patrons.costs')}
        style={{ alignSelf: 'flex-start' }}
      >
        <SText s={14} w={600} color={inks.link}>
          {t('shop.patrons.costs')}
        </SText>
      </Press>
      <PerkGrid
        perks={[
          t('shop.perk.wardrobe'),
          t('shop.perk.parcel'),
          t('shop.perk.glow'),
          t('shop.perk.wall'),
          t('shop.perk.votes'),
          t('shop.perk.betas'),
        ]}
      />
      <BigPill label={t('shop.patrons.choose')} onPress={() => router.push('/shop/tiers')} />
      <SText s={12} lh={1.4} multiline align="center" color={inks.body} style={{ marginTop: -2 }}>
        {t('shop.patrons.renews')}
      </SText>
      <LegalLinks />
    </HeroSheet>
  );
}

/** What's true, ticked, 8 apart. */
function Ticks({ lines }: { readonly lines: readonly string[] }) {
  return (
    <View style={{ gap: 8 }}>
      {lines.map((line) => (
        <Tick key={line} text={line} />
      ))}
    </View>
  );
}
