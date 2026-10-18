import { LIMITS } from '@kithfield/contracts';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Text, useWindowDimensions, View } from 'react-native';

import { ApiError } from '../../../data/api-client';
import { Avatar } from '../../../ui/art/avatar';
import { Button } from '../../../ui/components/button';
import { Segmented } from '../../../ui/components/segmented';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { critterOf, farmmateCheck, kindOf, lookAttrs, lookOf, type Farmmate } from '../critters';
import { routes } from '../flow';
import { useFlow } from '../flow-state';
import { SceneArt } from '../scene-art';
import {
  BarAction,
  BottomBar,
  ErrorLine,
  TopBar,
  useDesignTop,
  useInks,
  useSceneAttrs,
} from '../kit';
import { AccessoryOptions, CoatOptions, MarkOptions } from '../look-options';
import { moveIn as moveInWith } from '../move-in';
import { useProgress } from '../progress';

type Tab = 'coat' | 'mark' | 'accessory';

/**
 * Make them yours: a coat, a marking and an accessory on the stage, the name friends see, and
 * moving in. Joining a friend's farm checks the critters already there for a lookalike.
 */
export function LookScreen() {
  const router = useRouter();
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const inks = useInks();
  const { width } = useWindowDimensions();
  const top = useDesignTop();
  const scene = useSceneAttrs();
  const progress = useProgress();
  const { state, update } = useFlow();
  const [tab, setTab] = useState<Tab>('accessory');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { choice } = state;
  const name = state.name || state.suggestedName || '';
  const critterName = t(`onboardingCritters.${choice.species}.name`).toLocaleLowerCase(language);

  const farmmates = useMemo<Farmmate[]>(() => {
    const invite = state.invite;
    if (!invite) return [];
    return [
      ...(invite.from ? [{ critter: invite.from.critter, name: invite.from.name }] : []),
      ...invite.critters.map((critter) => ({ critter, name: null })),
    ];
  }, [state.invite]);
  const check = farmmateCheck(choice, farmmates);

  const askName = (then?: (name: string) => void) =>
    Alert.prompt(
      t('onboarding.look.namePrompt'),
      t('onboarding.look.namePromptBody'),
      [
        { text: t('onboarding.look.cancel'), style: 'cancel' },
        {
          text: t('onboarding.look.save'),
          onPress: (value?: string) => {
            const typed = (value ?? '').trim().slice(0, LIMITS.displayName);
            if (!typed) return;
            update({ name: typed });
            then?.(typed);
          },
        },
      ],
      'plain-text',
      name,
    );

  const moveIn = async (chosenName: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const critter = critterOf(choice);
    try {
      if (!progress.person) throw new Error('No person to move in');
      // Joining writes the profile only once the farm took them; a new farm, once it's planted.
      await moveInWith(
        progress.person,
        state.path,
        { name: chosenName, critter },
        progress.moveInDeps,
      );
      router.push(routes.notifications);
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : null;
      setError(
        code === 'invite_invalid'
          ? t('onboarding.join.gone.title')
          : code === 'farm_full'
            ? t('onboarding.join.full.title')
            : t('onboarding.failed'),
      );
    } finally {
      setBusy(false);
    }
  };
  const go = () => {
    if (name) void moveIn(name);
    else askName((typed) => void moveIn(typed));
  };

  const farmmateText = !check
    ? null
    : check.kind === 'twin'
      ? check.farmmate.name
        ? t('onboarding.look.twinNamed', { name: check.farmmate.name })
        : t('onboarding.look.twin')
      : check.farmmate.name
        ? t('onboarding.look.alikeNamed', { name: check.farmmate.name, critter: critterName })
        : t('onboarding.look.alike', { critter: critterName });

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <TopBar
        onBack={() => router.back()}
        inset={20}
        designTop={56}
        center={<Txt variant="button">{t('onboarding.look.title')}</Txt>}
        trailing={<BarAction label={t('onboarding.done')} tone="go" size={17} onPress={go} />}
      />
      <View
        style={{
          position: 'absolute',
          top: top(108),
          left: 28,
          right: 28,
          height: 232,
          borderTopLeftRadius: 116,
          borderTopRightRadius: 116,
          borderBottomLeftRadius: 30,
          borderBottomRightRadius: 30,
          backgroundColor: kindOf(choice.species).tint,
          overflow: 'hidden',
        }}
      >
        <SceneArt
          scene="stage"
          width={width - 56}
          height={232}
          attrs={{ ...scene, ...lookAttrs(choice) }}
        />
      </View>
      <View
        style={{
          position: 'absolute',
          top: top(352),
          left: 24,
          right: 24,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <Txt variant="displayM" style={{ fontSize: 22, lineHeight: 24.2 }}>
          {t('onboarding.look.your', { critter: critterName })}
        </Txt>
        <Press onPress={() => askName()} darken={false} hitSlop={12}>
          <Txt variant="chip" color={palette.secondary}>
            {t('onboarding.look.name')}{' '}
            <Text style={{ fontWeight: '600', color: name ? palette.text : inks.mossText }}>
              {name || t('onboarding.look.nameAdd')}
            </Text>
          </Txt>
        </Press>
      </View>
      <View style={{ position: 'absolute', top: top(394), left: 20, right: 20 }}>
        <Segmented<Tab>
          label={t('onboarding.look.title')}
          value={tab}
          onChange={setTab}
          segments={[
            { value: 'coat', label: t('onboarding.look.coat') },
            { value: 'mark', label: t('onboarding.look.markings') },
            { value: 'accessory', label: t('onboarding.look.accessory') },
          ]}
        />
      </View>
      <View style={{ position: 'absolute', top: top(448), left: 20, right: 20, height: 172 }}>
        {tab === 'coat' ? (
          <CoatOptions choice={choice} onChange={(c) => update({ choice: c })} />
        ) : null}
        {tab === 'mark' ? (
          <MarkOptions choice={choice} onChange={(c) => update({ choice: c })} />
        ) : null}
        {tab === 'accessory' ? (
          <AccessoryOptions
            choice={choice}
            onChange={(c) => update({ choice: c })}
            width={width - 40}
          />
        ) : null}
      </View>
      {check && farmmateText ? (
        <View
          accessible
          style={{
            position: 'absolute',
            top: top(640),
            left: 20,
            right: 20,
            borderRadius: 20,
            backgroundColor: check.kind === 'twin' ? '#F8E2C8' : palette.card,
            borderWidth: 1,
            borderColor: palette.cardBorder,
            paddingVertical: 10,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row' }}>
            <Avatar
              kind={check.farmmate.critter.species}
              look={lookOf(check.farmmate.critter)}
              size={38}
            />
            <Avatar
              kind={choice.species}
              look={lookOf(critterOf(choice))}
              size={38}
              ring={palette.card}
              style={{ marginLeft: -16 }}
            />
          </View>
          <Txt
            variant="caption"
            multiline
            color={check.kind === 'twin' ? '#4a3f37' : inks.list}
            style={{ flex: 1, fontSize: 14, lineHeight: 18.9 }}
          >
            {farmmateText}
          </Txt>
        </View>
      ) : null}
      <BottomBar>
        <ErrorLine text={error} />
        <Button label={t('onboarding.look.moveIn')} onPress={go} disabled={busy} haptic="success" />
      </BottomBar>
    </View>
  );
}
