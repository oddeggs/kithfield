import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../../../ui/art/art-view';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { useFlow } from '../flow-state';
import { BarAction, ErrorLine, Title, TopBar, useDesignTop, useInks } from '../kit';
import { useProgress } from '../progress';

const RULES = ['kind', 'yours', 'fire', 'leave'] as const;
const RULE_ICONS = { kind: 'heart', yours: 'lock', fire: 'leaf', leave: 'trash' } as const;

/** The website's pages, in the reader's language. */
export const pageUrl = (page: 'terms' | 'privacy', language: string) =>
  `https://kithfield.com/${language === 'vi' ? 'vi/' : ''}${page}`;

/** A Terms version (`YYYY-MM-DD`) as a date in the reader's language. */
export function termsDate(version: string, language: string): string {
  const [y, m, d] = version.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function Row({
  icon,
  title,
  body,
  onPress,
}: {
  readonly icon: string;
  readonly title: string;
  readonly body: string;
  readonly onPress?: () => void;
}) {
  const { palette } = useTheme();
  const inks = useInks();
  const content = (
    <>
      {onPress ? (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            backgroundColor: palette.fillSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArtIcon name={icon} size={22} color={palette.text} />
        </View>
      ) : (
        <ArtIcon name={icon} size={26} color={inks.moss} style={{ marginTop: 2 }} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="rowTitle" multiline style={{ fontSize: 15.5, lineHeight: 19.4 }}>
          {title}
        </Txt>
        <Txt
          variant="rowSubtitle"
          multiline
          color={onPress ? palette.secondary : palette.body}
          style={{
            marginTop: 2,
            ...(onPress ? { fontSize: 13, lineHeight: 17.6 } : { lineHeight: 19.6 }),
          }}
        >
          {body}
        </Txt>
      </View>
      {onPress ? (
        <Txt variant="chevron" color="#b3a99f" style={{ fontSize: 20, lineHeight: 20 }}>
          ›
        </Txt>
      ) : null}
    </>
  );
  const row = {
    flexDirection: 'row' as const,
    gap: 12,
    alignItems: onPress ? ('center' as const) : ('flex-start' as const),
    paddingVertical: 10,
    minHeight: 44,
  };
  return onPress ? (
    <Press onPress={onPress} darken={false} accessibilityRole="link" style={row}>
      {content}
    </Press>
  ) : (
    <View accessible style={row}>
      {content}
    </View>
  );
}

/**
 * The house rules in plain words, then the full Terms and Privacy policy on the website. Opened
 * from sign-in to read; opened with `accept` when the Terms in force changed, where Done accepts.
 */
export function HouseRulesScreen() {
  const router = useRouter();
  const { accept } = useLocalSearchParams<{ accept?: string }>();
  const accepting = accept === '1';
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const top = useDesignTop();
  const insets = useSafeAreaInsets();
  const { api } = useFlow();
  const progress = useProgress();
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    progress.me().then(
      (me) => setVersion(me.currentTermsVersion),
      () => undefined,
    );
  }, [progress]);

  const done = async () => {
    if (!accepting) {
      router.back();
      return;
    }
    try {
      const me = await progress.me();
      await api.acceptTerms({ version: me.currentTermsVersion });
      await progress.go(progress.next(me));
    } catch {
      setError(t('onboarding.failed'));
    }
  };
  const open = (page: 'terms' | 'privacy') =>
    void WebBrowser.openBrowserAsync(pageUrl(page, language), {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
  const divider = { borderBottomWidth: 1, borderBottomColor: palette.hairline };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <TopBar
        {...(accepting ? {} : { onBack: () => router.back() })}
        center={
          <Txt variant="rowTitle" style={{ fontSize: 17, lineHeight: 20.4 }}>
            {t('onboarding.rules.title')}
          </Txt>
        }
        trailing={<BarAction label={t('onboarding.done')} tone="go" onPress={() => void done()} />}
      />
      <ScrollView
        style={{ flex: 1, marginTop: top(112) }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          gap: 12,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <Title size={26} line={1.12}>
          {t('onboarding.rules.heading')}
        </Title>
        <View>
          {RULES.map((rule) => (
            <View key={rule} style={divider}>
              <Row
                icon={RULE_ICONS[rule]}
                title={t(`onboarding.rules.${rule}.title`)}
                body={t(`onboarding.rules.${rule}.body`)}
              />
            </View>
          ))}
        </View>
        <View style={{ marginTop: 4, gap: 2 }}>
          <View style={divider}>
            <Row
              icon="note"
              title={t('onboarding.rules.terms')}
              body={
                version
                  ? t('onboarding.rules.termsBody', { date: termsDate(version, language) })
                  : ''
              }
              onPress={() => open('terms')}
            />
          </View>
          <Row
            icon="lock"
            title={t('onboarding.rules.privacy')}
            body={t('onboarding.rules.privacyBody')}
            onPress={() => open('privacy')}
          />
        </View>
        <ErrorLine text={error} />
      </ScrollView>
    </View>
  );
}
