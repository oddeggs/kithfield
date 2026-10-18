import type { FarmId, PersonId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '../../../ui/art/avatar';
import { Toggle } from '../../../ui/components/toggle';
import { useLocale } from '../../../ui/locale/locale-provider';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { lookOf } from '../format';
import { Group, Note, Row } from '../kit/layout';
import { SheetButtons, SheetPage } from '../kit/sheet-page';
import { KText } from '../kit/text';
import { useFarmSettings } from './use-farm-settings';
import { swap } from '../go';

/**
 * A keeper removes a member. The removed person sees a calm note once and is never told
 * who; their messages stay. "Report to Kithfield as well" goes on to the report sheet.
 */
export function RemoveSheet({
  farm,
  person,
}: {
  readonly farm: FarmId;
  readonly person: PersonId;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { state, isKeeper, write } = useFarmSettings(farm);
  const [photos, setPhotos] = useState(false);
  const [report, setReport] = useState(true);
  const [busy, setBusy] = useState(false);
  const member = state?.members.find((m) => m.person === person) ?? null;
  const name = member?.name ?? t('settings.members.friend');
  const remove = async () => {
    setBusy(true);
    const done = await write('removed', { person, removeMedia: photos });
    setBusy(false);
    if (!done) return;
    if (report) {
      swap({ pathname: '/(modal)/safety-report', params: { farm, person } });
    } else {
      router.back();
    }
  };
  return (
    <SheetPage
      footer={
        <SheetButtons
          primary={t('settings.remove.action', { name })}
          primaryKind="destructive"
          onPrimary={() => void remove()}
          busy={busy || !isKeeper || member === null}
          secondary={t('settings.cancel')}
          onSecondary={() => router.back()}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {member ? (
          <Avatar kind={member.critter.species} look={lookOf(member.critter)} size={52} />
        ) : null}
        <Txt
          variant="sheetTitle"
          multiline
          style={{ flex: 1, lineHeight: 24.2 }}
          accessibilityRole="header"
        >
          {t('settings.remove.title', { name, farm: state?.name ?? '' })}
        </Txt>
      </View>
      <KText kind="sheetBody" multiline color={palette.body}>
        {t('settings.remove.body', { name })}
      </KText>
      <Group>
        <Row
          title={t('settings.remove.photos')}
          trailing={
            <Toggle value={photos} onChange={setPhotos} label={t('settings.remove.photos')} />
          }
        />
        <Row
          title={t('settings.remove.report')}
          subtitle={t('settings.remove.reportSub')}
          trailing={
            <Toggle value={report} onChange={setReport} label={t('settings.remove.report')} />
          }
        />
      </Group>
      <Note text={t('settings.remove.note')} style={{ paddingHorizontal: 0 }} />
    </SheetPage>
  );
}
