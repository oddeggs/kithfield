import { ReportReason, type FarmId, type PersonId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';

import { useDataClient, useOpenFarm } from '../../data';
import { Avatar } from '../../ui/art/avatar';
import { useToast } from '../../ui/components/toast';
import { Toggle } from '../../ui/components/toggle';
import { useLocale } from '../../ui/locale/locale-provider';
import { haptics } from '../../ui/motion/haptics';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { ApiError } from '../settings/api/request';
import { useBlocks, useSafetyApi } from '../settings/api/use-api';
import { lookOf } from '../settings/format';
import { useKitColors } from '../settings/kit/colors';
import { Group, Row } from '../settings/kit/layout';
import { SheetButtons, SheetPage } from '../settings/kit/sheet-page';
import { KText } from '../settings/kit/text';
import { useSomeone } from './member';

export type ReportTarget =
  | { readonly about: 'event'; readonly seq: number }
  | { readonly about: 'person'; readonly person: PersonId };

/** The words of a reported message, when the phone holds them and they are words. */
function useReported(farm: FarmId, target: ReportTarget) {
  const client = useDataClient();
  const [found, setFound] = useState<{ actor: PersonId | null; text: string | null } | null>(null);
  const seq = target.about === 'event' ? target.seq : null;
  useEffect(() => {
    if (seq === null) return;
    let live = true;
    // The phone's copy first; a message it never held is read from the farm's history.
    const held = client.store.event(farm, seq);
    held
      .then(async (e) => {
        if (e) return { actor: e.actor, payload: e.payload };
        const page = await client.api.events(farm, { after: seq - 1, limit: 1 });
        const envelope = page.events[0] as
          { seq?: unknown; actor?: unknown; payload?: unknown } | undefined;
        return envelope?.seq === seq
          ? {
              actor: typeof envelope.actor === 'string' ? envelope.actor : null,
              payload: envelope.payload,
            }
          : null;
      })
      .then(
        (e) => {
          if (!live || !e) return;
          const text = (e.payload as { text?: unknown } | null)?.text;
          setFound({ actor: e.actor, text: typeof text === 'string' ? text : null });
        },
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, [client, farm, seq]);
  return found;
}

/**
 * Report a message or a person: one of four reasons, a few words if they like, and
 * whether to block them too. The server copies the context; the reported person never learns who.
 */
export function ReportSheet({
  farm,
  target,
}: {
  readonly farm: FarmId;
  readonly target: ReportTarget;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const toast = useToast();
  const api = useSafetyApi();
  const blocks = useBlocks();
  // Keeps the farm caught up while reporting, so the person is named from it.
  useOpenFarm(farm);
  const reported = useReported(farm, target);
  const person = target.about === 'person' ? target.person : (reported?.actor ?? null);
  const someone = useSomeone(farm, person);
  const name = someone.name ?? t('safety.friend');
  const [reason, setReason] = useState<ReportReason>('unkind');
  const [note, setNote] = useState('');
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);

  const send = () => {
    setBusy(true);
    const words = note.trim();
    api
      .report({
        farm,
        about:
          target.about === 'event'
            ? { about: 'event', seq: target.seq }
            : { about: 'person', person: target.person },
        reason,
        ...(words ? { note: words.slice(0, 500) } : {}),
        alsoBlock: block && person !== null,
      })
      .then(
        () => {
          haptics.success();
          // The server blocked them with the report; the phone's list catches up.
          if (block && person !== null) blocks.refresh().catch(() => undefined);
          toast.show(t('safety.report.sent'));
          router.back();
        },
        (error: unknown) => {
          setBusy(false);
          toast.show(
            error instanceof ApiError && error.status === 404
              ? t('safety.report.gone')
              : t('safety.failed'),
          );
        },
      );
  };

  return (
    <SheetPage
      footer={
        <SheetButtons
          primary={t('safety.report.send')}
          primaryKind="destructive"
          onPrimary={send}
          busy={busy}
        />
      }
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Press
          onPress={() => router.back()}
          darken={false}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('safety.cancel')}
        >
          <KText kind="value" color={palette.secondary} style={{ fontSize: 16, lineHeight: 19 }}>
            {t('safety.cancel')}
          </KText>
        </Press>
        <KText kind="rowTitle" style={{ fontSize: 16, lineHeight: 19 }}>
          {t('safety.report.title')}
        </KText>
        <View style={{ width: 50 }} />
      </View>
      <Txt
        variant="displayM"
        multiline
        accessibilityRole="header"
        style={{ fontSize: 24, lineHeight: 26.4 }}
      >
        {target.about === 'event'
          ? t('safety.report.aboutMessage')
          : t('safety.report.aboutPerson', { name })}
      </Txt>
      {reported?.text ? (
        <View
          style={{
            borderRadius: 16,
            backgroundColor: palette.fillSoft,
            paddingVertical: 10,
            paddingHorizontal: 12,
            flexDirection: 'row',
            gap: 8,
            alignItems: 'center',
          }}
        >
          {someone.critter ? (
            <Avatar kind={someone.critter.species} look={lookOf(someone.critter)} size={26} />
          ) : null}
          <KText
            kind="card"
            color={kit.body2}
            numberOfLines={3}
            style={{ flex: 1, fontSize: 14, lineHeight: 18.9 }}
          >
            {reported.text}
          </KText>
        </View>
      ) : null}
      <Group>
        {ReportReason.options.map((r) => (
          <Row
            key={r}
            title={t(`safety.report.${r}`)}
            selected={reason === r}
            onPress={() => {
              haptics.select();
              setReason(r);
            }}
          />
        ))}
      </Group>
      {reason === 'something_else' ? (
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('safety.report.notePlaceholder')}
          placeholderTextColor={palette.placeholder}
          accessibilityLabel={t('safety.report.notePlaceholder')}
          multiline
          maxLength={500}
          style={{
            minHeight: 64,
            borderRadius: 16,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.cardBorder,
            paddingHorizontal: 14,
            paddingVertical: 10,
            color: palette.text,
            fontSize: 15,
          }}
        />
      ) : null}
      {person !== null ? (
        <Group>
          <Row
            title={t('safety.report.alsoBlock', { name })}
            subtitle={t('safety.report.alsoBlockSub')}
            trailing={
              <Toggle
                value={block}
                onChange={setBlock}
                label={t('safety.report.alsoBlock', { name })}
              />
            }
          />
        </Group>
      ) : null}
      <KText kind="note" multiline color={palette.secondary} style={{ lineHeight: 18.9 }}>
        {target.about === 'event'
          ? t('safety.report.footMessage', { name })
          : t('safety.report.footPerson', { name })}
      </KText>
    </SheetPage>
  );
}
