import type { AiFeature, FarmId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useFarmSelector } from '../../../data';
import { ArtIcon } from '../../../ui/art/art-view';
import { Button } from '../../../ui/components/button';
import { useToast } from '../../../ui/components/toast';
import { useLocale } from '../../../ui/locale/locale-provider';
import { haptics } from '../../../ui/motion/haptics';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { useSettingsApi } from '../api/use-api';
import { go } from '../go';
import { useKitColors } from '../kit/colors';
import { SheetPage } from '../kit/sheet-page';
import { KText } from '../kit/text';
import { openPage, siteUrl } from '../links';
import { AI_PROVIDER, CONSENT_TEXT_VERSION } from './consent';

const farmName = (s: { state: { name: string | null } | null } | null) => s?.state?.name ?? null;

function Lead({ text }: { readonly text: string }) {
  const kit = useKitColors();
  return (
    <KText kind="sheetBody" multiline color={kit.body2} style={{ fontSize: 14.5, lineHeight: 21 }}>
      {text}
    </KText>
  );
}

/** The recap's lead names the farm whose letter it is. */
function RecapLead({ farm, provider }: { readonly farm: FarmId; readonly provider: string }) {
  const { t } = useLocale();
  const name = useFarmSelector(farm, farmName);
  return (
    <Lead
      text={
        name
          ? t('settings.consent.recap.lead', { farm: name, provider })
          : t('settings.consent.recap.leadAll', { provider })
      }
    />
  );
}

function Point({
  icon,
  title,
  text,
}: {
  readonly icon: string;
  readonly title: string;
  readonly text: string;
}) {
  const kit = useKitColors();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          backgroundColor: kit.settingsTile,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArtIcon name={icon} size={22} color="" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <KText kind="rowTitle" style={{ fontSize: 14.5, lineHeight: 18.1 }}>
          {title}
        </KText>
        <KText kind="card" multiline color={kit.body2} style={{ marginTop: 2, lineHeight: 18.9 }}>
          {text}
        </KText>
      </View>
    </View>
  );
}

/**
 * Asking first: before anything is sent to an outside AI, the person reads what
 * is sent, what may be done with it and what stays, and says yes or no. The answer is stored with
 * the time and the wording's version; saying no never breaks the feature for anyone else.
 */
export function ConsentSheet({
  feature,
  farm,
}: {
  readonly feature: AiFeature;
  readonly farm?: FarmId;
}) {
  // Without a provider there is nothing to agree to: the route closes without asking.
  useEffect(() => {
    if (AI_PROVIDER === null) router.back();
  }, []);
  if (AI_PROVIDER === null) return null;
  return <Asking feature={feature} provider={AI_PROVIDER} {...(farm ? { farm } : {})} />;
}

function Asking({
  feature,
  farm,
  provider,
}: {
  readonly feature: AiFeature;
  readonly farm?: FarmId;
  readonly provider: string;
}) {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const toast = useToast();
  const api = useSettingsApi();
  const [busy, setBusy] = useState(false);
  const answer = (allowed: boolean) => {
    setBusy(true);
    api.setConsent(feature, { allowed, textVersion: CONSENT_TEXT_VERSION }).then(
      () => {
        if (allowed) haptics.success();
        router.back();
      },
      () => {
        setBusy(false);
        toast.show(t('settings.failed'));
      },
    );
  };
  const captions = feature === 'captions';
  return (
    <SheetPage
      footer={
        <>
          <Button
            label={captions ? t('settings.consent.captions.yes') : t('settings.consent.recap.yes')}
            onPress={() => answer(true)}
            disabled={busy}
          />
          <Button
            label={captions ? t('settings.consent.captions.no') : t('settings.consent.recap.no')}
            kind="text"
            onPress={() => answer(false)}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14 }}>
            {(
              [
                [t('settings.consent.privacy'), () => openPage(siteUrl('privacy', language))],
                [t('settings.aiData'), () => go('/(tabs)/you/ai')],
              ] as const
            ).map(([label, act]) => (
              <Press
                key={label}
                onPress={act}
                darken={false}
                hitSlop={10}
                accessibilityRole="link"
                accessibilityLabel={label}
              >
                <KText
                  kind="pill"
                  color={kit.body2}
                  style={{ fontSize: 12.5, lineHeight: 15, textDecorationLine: 'underline' }}
                >
                  {label}
                </KText>
              </Press>
            ))}
          </View>
        </>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt variant="handS" color={kit.honeyNote.icon} style={{ fontSize: 17, lineHeight: 17 }}>
          {captions ? t('settings.consent.captions.eyebrow') : t('settings.consent.recap.eyebrow')}
        </Txt>
        {captions ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: kit.plusBadge.bg,
            }}
          >
            <KText kind="badge" color={kit.plusBadge.fg}>
              {t('settings.consent.plus')}
            </KText>
          </View>
        ) : null}
      </View>
      <Txt variant="displayM" multiline accessibilityRole="header" style={{ lineHeight: 29.1 }}>
        {captions ? t('settings.consent.captions.title') : t('settings.consent.recap.title')}
      </Txt>
      {captions ? (
        <Lead text={t('settings.consent.captions.lead', { provider })} />
      ) : farm ? (
        <RecapLead farm={farm} provider={provider} />
      ) : (
        <Lead text={t('settings.consent.recap.leadAll', { provider })} />
      )}
      <View style={{ gap: 12 }}>
        <Point
          icon={captions ? 'mic' : 'chat'}
          title={t('settings.consent.sent')}
          text={captions ? t('settings.consent.captions.sent') : t('settings.consent.recap.sent')}
        />
        <Point
          icon="lock"
          title={t('settings.consent.use')}
          text={`${captions ? t('settings.consent.captions.use') : t('settings.consent.recap.use')} ${t('settings.consent.never')}`}
        />
        {captions ? (
          <Point
            icon="note"
            title={t('settings.consent.captions.stays')}
            text={t('settings.consent.captions.staysText')}
          />
        ) : (
          <Point
            icon="bee"
            title={t('settings.consent.recap.ifNo')}
            text={t('settings.consent.recap.ifNoText')}
          />
        )}
      </View>
      {captions ? (
        <KText kind="note" multiline color={palette.secondary}>
          {t('settings.consent.captions.others')}
        </KText>
      ) : null}
    </SheetPage>
  );
}
