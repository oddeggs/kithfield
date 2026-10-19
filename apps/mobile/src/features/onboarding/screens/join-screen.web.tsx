import { platformColour } from '@kithfield/theme';
import type { Critter, InvitePreview, Species } from '@kithfield/contracts';
import { getLocales } from 'expo-localization';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { ApiError, useDataClient } from '../../../data';
import { ArtStill } from '../../../ui/art/art-view';
import { ErrorState } from '../../../ui/components/state-shell';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useAccount } from '../../../ui/session/account';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { JoinFarm } from '../../../web/join/join-farm';
import {
  CritterRow,
  NameField,
  PanelFoot,
  PanelHead,
  YearSelect,
} from '../../../web/join/join-panel';
import { platformLook } from '../../../web/look';
import { countryOf } from '../calendar';
import { critterOf, FIRST_CHOICE } from '../critters';
import { routes, termsAccepted } from '../flow';
import { useSceneAttrs } from '../kit';

type Preview =
  | { readonly kind: 'loading' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'full'; readonly invite: InvitePreview }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'ready'; readonly invite: InvitePreview };

/** What the panel asks before moving in: the choice, then the age check and the house rules. */
type Step = 'choose' | 'check';

const critterFor = (species: Species): Critter =>
  critterOf({ ...FIRST_CHOICE, species, coat: FIRST_CHOICE.coat });

/**
 * A friend's invite in the browser: the farm, working, beside a panel to become a critter and move
 * in as a guest (an anonymous person, upgraded later by signing in, which keeps the critter). The
 * age check and the house rules come before moving in, as on the phone. Wide, the farm and the
 * panel sit side by side; narrow, the farm sits over the panel.
 */
export function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { t } = useLocale();
  const { palette } = useTheme();
  const scene = useSceneAttrs();
  const { width, height } = useWindowDimensions();
  const data = useDataClient();
  const account = useAccount();

  const [preview, setPreview] = useState<Preview>({ kind: 'loading' });
  const [species, setSpecies] = useState<Species>(FIRST_CHOICE.species);
  const [name, setName] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [step, setStep] = useState<Step>('choose');
  const [needs, setNeeds] = useState({ age: true, terms: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [glow, setGlow] = useState<{ x: number; y: number; r: number } | null>(null);

  const load = useCallback(() => {
    setPreview({ kind: 'loading' });
    data.api.invite(code).then(
      (invite) =>
        setPreview(
          invite === null
            ? { kind: 'gone' }
            : invite.full
              ? { kind: 'full', invite }
              : { kind: 'ready', invite },
        ),
      () => setPreview({ kind: 'unreachable' }),
    );
  }, [data, code]);
  useEffect(load, [load]);

  const critter = useMemo(() => critterFor(species), [species]);
  const residents = preview.kind === 'ready' ? preview.invite.critters : [];
  const critterName = t(`onboardingCritters.${species}.name`).toLocaleLowerCase();
  const trimmed = name.trim().normalize('NFC');

  const moveIn = async () => {
    if (busy || preview.kind !== 'ready') return;
    if (trimmed === '') {
      setError(t('platforms.join.needName'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const me = await data.api.me();
      const owed = { age: !me.ageOk, terms: !termsAccepted(me) };
      if (step === 'choose' && (owed.age || owed.terms)) {
        setNeeds(owed);
        setStep('check');
        return;
      }
      if (owed.age) {
        if (year === null) return;
        const answer = await data.api.age({
          birthYear: year,
          country: countryOf(getLocales()[0]?.regionCode),
        });
        if (answer === 'under_age') {
          await account.forget().catch(() => undefined);
          router.replace(routes.tooYoung);
          return;
        }
      }
      if (owed.terms) await data.api.acceptTerms({ version: me.currentTermsVersion });
      await data.api.updateProfile({ name: trimmed, critter });
      const joined = await data.api.join(code, { name: trimmed, critter });
      if (joined.status === 'waiting_for_keeper') {
        setError(t('platforms.join.waiting'));
        return;
      }
      // Onboarded now: the root layout turns from the way in to the farm.
      await account.recheck();
      router.replace({ pathname: '/chat/[farm]', params: { farm: joined.farm } });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'farm_full' && preview.kind === 'ready') {
        setPreview({ kind: 'full', invite: preview.invite });
      } else if (e instanceof ApiError && e.code === 'invite_invalid') {
        setPreview({ kind: 'gone' });
      } else {
        setError(t('onboarding.failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  if (preview.kind === 'gone' || preview.kind === 'full' || preview.kind === 'unreachable') {
    const unreachable = preview.kind === 'unreachable';
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <ErrorState
          art={
            <ArtStill
              scene="spot"
              width={280}
              height={170}
              attrs={{ ...scene, name: 'contacts' }}
            />
          }
          title={t(
            preview.kind === 'full'
              ? 'onboarding.join.full.title'
              : unreachable
                ? 'onboarding.join.unreachable.title'
                : 'onboarding.join.gone.title',
          )}
          body={
            preview.kind === 'full'
              ? t('onboarding.join.full.body', { farm: preview.invite.name })
              : t(unreachable ? 'onboarding.join.unreachable.body' : 'onboarding.join.gone.body')
          }
          action={
            unreachable
              ? { label: t('onboarding.join.tryAgain'), onPress: load }
              : {
                  label: t('onboarding.join.startInstead'),
                  onPress: () => router.replace(routes.welcome),
                }
          }
        />
      </View>
    );
  }

  const invite = preview.kind === 'ready' ? preview.invite : null;
  const from = invite?.from?.name ?? null;
  const wide = width >= platformLook.narrow * 1.5;
  const farmW = wide ? width - platformLook.panelWidth : width;
  const farmH = wide ? height : Math.round(Math.min(height * 0.45, (width * 540) / 393));

  const panel = (
    <View
      style={{
        ...(wide ? { width: platformLook.panelWidth, height } : { flexGrow: 1 }),
        backgroundColor: palette.sheet,
        borderLeftWidth: wide ? 1 : 0,
        borderColor: palette.hairline,
        padding: platformLook.panelPadding,
        gap: 14,
      }}
    >
      <PanelHead
        title={from ? t('onboarding.join.title', { name: from }) : t('onboarding.join.titleNoName')}
        body={t('platforms.join.body')}
      />
      {step === 'choose' ? (
        <>
          <CritterRow chosen={species} onChoose={setSpecies} />
          <NameField value={name} onChange={setName} onSubmit={() => void moveIn()} />
        </>
      ) : (
        <View style={{ gap: 10 }}>
          {needs.age ? (
            <>
              <YearSelect value={year} onChange={setYear} />
              <Txt variant="caption" color={palette.secondary}>
                {t('platforms.join.yearBody')}
              </Txt>
            </>
          ) : null}
          {needs.terms ? (
            <Txt variant="caption" color={palette.secondary}>
              {t('platforms.join.agree', {
                rules: t('onboarding.signIn.rules'),
                privacy: t('onboarding.signIn.privacy'),
              })}
            </Txt>
          ) : null}
        </View>
      )}
      <PanelFoot
        label={
          step === 'check'
            ? t('platforms.join.go')
            : trimmed
              ? t('platforms.join.moveIn', { name: trimmed, critter: critterName })
              : t('platforms.join.moveInNoName', { critter: critterName })
        }
        onPress={() => void moveIn()}
        busy={busy || !invite || (step === 'check' && needs.age && year === null)}
        note={t('platforms.join.keep')}
        error={error}
      />
    </View>
  );

  const farm = (
    <View style={{ width: farmW, height: farmH }}>
      <JoinFarm
        width={farmW}
        height={farmH}
        residents={residents}
        newcomer={critter}
        season={scene.season}
        night={scene.night}
        onGlow={setGlow}
      />
      {invite ? (
        <View
          style={{
            position: 'absolute',
            top: 22,
            left: 22,
            height: 46,
            borderRadius: 23,
            paddingLeft: 8,
            paddingRight: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: platformColour.chipOverArt,
          }}
        >
          <View style={{ width: 32, height: 32, borderRadius: 9, overflow: 'hidden' }}>
            <ArtStill scene="appicon" width={32} height={32} />
          </View>
          <Txt variant="displayS" style={{ fontSize: 18, lineHeight: 20 }}>
            {invite.name}
          </Txt>
          <Txt variant="caption" color={palette.secondary}>
            {t('platforms.join.critters', { count: invite.critters.length })}
          </Txt>
        </View>
      ) : null}
      {glow ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: glow.x + glow.r + 10,
            top: glow.y - 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 14,
            backgroundColor: palette.card,
          }}
        >
          <Txt variant="handS" style={{ fontSize: 17, lineHeight: 18.7 }}>
            {from ? t('platforms.join.saved', { name: from }) : t('platforms.join.savedNoName')}
          </Txt>
        </View>
      ) : null}
    </View>
  );

  return wide ? (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: palette.background }}>
      {farm}
      {panel}
    </View>
  ) : (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ minHeight: height }}
    >
      {farm}
      {panel}
    </ScrollView>
  );
}
