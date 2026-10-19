import type { AiFeature, FarmId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
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
import { answerConsent } from './consent';

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
function RecapLead({ farm, processor }: { readonly farm: FarmId; readonly processor: string }) {
  const { t } = useLocale();
  const name = useFarmSelector(farm, farmName);
  return (
    <Lead
      text={
        name
          ? t('ai.consent.recap.lead', { farm: name, processor })
          : t('ai.consent.recap.leadAll', { processor })
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
 * Asking first: before anything is sent to the outside AI (Workers AI, run by Cloudflare), the
 * person reads what is sent, what may be done with it and what stays, and says yes or no. The
 * answer is stored with the time and the wording's version; saying no never breaks the feature for
 * anyone else. Voice-note captions have no design of their own and follow the captions sheet.
 */
export function ConsentSheet({
  feature,
  farm,
}: {
  readonly feature: AiFeature;
  readonly farm?: FarmId;
}) {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const toast = useToast();
  const api = useSettingsApi();
  const [busy, setBusy] = useState(false);
  const answer = (allowed: boolean) => {
    setBusy(true);
    answerConsent(api, feature, allowed).then(
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
  const provider = t('ai.provider');
  const processor = t('ai.consent.processor', { provider });
  const terms = t('ai.consent.terms', { provider });
  const copy =
    feature === 'captions'
      ? {
          eyebrow: t('settings.consent.captions.eyebrow'),
          title: t('settings.consent.captions.title'),
          lead: <Lead text={t('ai.consent.captions.lead', { processor })} />,
          sentIcon: 'mic',
          sent: t('settings.consent.captions.sent'),
          use: `${t('settings.consent.captions.use')} ${terms}`,
          last: {
            icon: 'note',
            title: t('settings.consent.captions.stays'),
            text: t('ai.consent.captions.staysText'),
          },
          others: t('settings.consent.captions.others'),
          yes: t('settings.consent.captions.yes'),
          no: t('settings.consent.captions.no'),
        }
      : feature === 'voice_notes'
        ? {
            eyebrow: t('ai.consent.voiceNotes.eyebrow'),
            title: t('ai.consent.voiceNotes.title'),
            lead: <Lead text={t('ai.consent.voiceNotes.lead', { processor })} />,
            sentIcon: 'mic',
            sent: t('ai.consent.voiceNotes.sent'),
            use: `${t('ai.consent.voiceNotes.use')} ${terms}`,
            last: {
              icon: 'note',
              title: t('ai.consent.voiceNotes.stays'),
              text: t('ai.consent.voiceNotes.staysText'),
            },
            others: t('ai.consent.voiceNotes.others'),
            yes: t('ai.consent.voiceNotes.yes'),
            no: t('ai.consent.voiceNotes.no'),
          }
        : {
            eyebrow: t('settings.consent.recap.eyebrow'),
            title: t('settings.consent.recap.title'),
            lead: farm ? (
              <RecapLead farm={farm} processor={processor} />
            ) : (
              <Lead text={t('ai.consent.recap.leadAll', { processor })} />
            ),
            sentIcon: 'chat',
            sent: t('ai.consent.recap.sent'),
            use: `${t('settings.consent.recap.use')} ${terms} ${t('ai.consent.recap.kept')}`,
            last: {
              icon: 'bee',
              title: t('settings.consent.recap.ifNo'),
              text: t('settings.consent.recap.ifNoText'),
            },
            others: null,
            yes: t('settings.consent.recap.yes'),
            no: t('settings.consent.recap.no'),
          };
  return (
    <SheetPage
      footer={
        <>
          <Button label={copy.yes} onPress={() => answer(true)} disabled={busy} />
          <Button label={copy.no} kind="text" onPress={() => answer(false)} />
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
          {copy.eyebrow}
        </Txt>
        {feature === 'captions' ? (
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
        {copy.title}
      </Txt>
      {copy.lead}
      <View style={{ gap: 12 }}>
        <Point icon={copy.sentIcon} title={t('settings.consent.sent')} text={copy.sent} />
        <Point icon="lock" title={t('settings.consent.use')} text={copy.use} />
        <Point icon={copy.last.icon} title={copy.last.title} text={copy.last.text} />
      </View>
      {copy.others === null ? null : (
        <KText kind="note" multiline color={palette.secondary}>
          {copy.others}
        </KText>
      )}
    </SheetPage>
  );
}
