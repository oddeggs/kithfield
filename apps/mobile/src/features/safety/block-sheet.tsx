import type { FarmId, PersonId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ArtIcon } from '../../ui/art/art-view';
import { Avatar } from '../../ui/art/avatar';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { useSettingsApi } from '../settings/api/use-api';
import { lookOf } from '../settings/format';
import { useKitColors } from '../settings/kit/colors';
import { SheetButtons, SheetPage } from '../settings/kit/sheet-page';
import { KText } from '../settings/kit/text';
import { useSomeone, type Someone } from './member';

const POINTS = [
  ['block', 'safety.block.hidden'],
  ['door', 'safety.block.visits'],
  ['people', 'safety.block.stay'],
  ['lock', 'safety.block.untold'],
] as const;

function BlockBody({
  person,
  someone,
  fallbackName,
}: {
  readonly person: PersonId;
  readonly someone: Someone;
  readonly fallbackName?: string;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const toast = useToast();
  const api = useSettingsApi();
  const [busy, setBusy] = useState(false);
  const name = someone.name ?? fallbackName ?? t('safety.friend');
  const block = () => {
    setBusy(true);
    api.block(person).then(
      () => {
        haptics.success();
        toast.show(t('safety.block.done', { name }));
        router.back();
      },
      () => {
        setBusy(false);
        toast.show(t('safety.failed'));
      },
    );
  };
  return (
    <SheetPage
      footer={
        <SheetButtons
          primary={t('safety.block.action', { name })}
          primaryKind="destructive"
          onPrimary={block}
          busy={busy}
          secondary={t('safety.cancel')}
          onSecondary={() => router.back()}
        />
      }
    >
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 6 }}>
        {someone.critter ? (
          <Avatar kind={someone.critter.species} look={lookOf(someone.critter)} size={72} />
        ) : null}
        <Txt
          variant="displayM"
          multiline
          align="center"
          accessibilityRole="header"
          style={{ fontSize: 28, lineHeight: 30.8 }}
        >
          {t('safety.block.title', { name })}
        </Txt>
      </View>
      <View style={{ gap: 10, paddingVertical: 4, paddingHorizontal: 6 }}>
        {POINTS.map(([icon, key]) => (
          <View key={key} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <ArtIcon name={icon} size={22} color={palette.secondary} style={{ marginTop: 1 }} />
            <KText
              kind="listItem"
              multiline
              color={kit.body2}
              style={{ flex: 1, fontSize: 15, lineHeight: 21 }}
            >
              {t(key)}
            </KText>
          </View>
        ))}
      </View>
    </SheetPage>
  );
}

function OnFarm({
  farm,
  person,
  name,
}: {
  readonly farm: FarmId;
  readonly person: PersonId;
  readonly name?: string;
}) {
  const someone = useSomeone(farm, person);
  return <BlockBody person={person} someone={someone} {...(name ? { fallbackName: name } : {})} />;
}

/**
 * Block someone: what blocking does, and that they are never told. With a farm the
 * phone holds, their critter and name come from it; otherwise from `name`.
 */
export function BlockSheet({
  person,
  farm,
  name,
}: {
  readonly person: PersonId;
  readonly farm?: FarmId;
  readonly name?: string;
}) {
  if (farm) return <OnFarm farm={farm} person={person} {...(name ? { name } : {})} />;
  return <BlockBody person={person} someone={{ name: name ?? null, critter: null }} />;
}
