import type { FarmId, FarmState } from '@kithfield/contracts';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useDataClient, useFarm, useFarmEvents, useSend } from '../../data';
import { Button } from '../../ui/components/button';
import { TheirBubble, YourBubble, type Sender } from '../../ui/components/bubble';
import { TextField } from '../../ui/components/text-field';
import { useLocale } from '../../ui/locale/locale-provider';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { Note, Section, canonicalJson, lookOf } from './lab-kit';

const senderOf = (state: FarmState | null, person: string | null): Sender => {
  const member = state?.members.find((m) => m.person === person);
  return member
    ? { name: member.name ?? '…', kind: member.critter.species, look: lookOf(member.critter) }
    : { name: '…', kind: 'rabbit' };
};

const textOf = (payload: unknown): string =>
  typeof payload === 'object' && payload !== null && 'text' in payload ? String(payload.text) : '';

/** The farm's newest messages and dewdrops from the phone's cache, and a field to write one. */
export function MessagesPanel({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { person } = useSession();
  const replica = useFarm(farm);
  const events = useFarmEvents(farm, 40);
  const send = useSend(farm);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const state = replica?.state ?? null;
  const me = person?.id ?? null;

  const post = async () => {
    const text = draft.trim();
    if (text === '') return;
    const result = await send('message', { text });
    if (result.status === 'refused') setNote(t('syncLab.refused', { reason: result.reason }));
    else {
      setDraft('');
      setNote(null);
    }
  };

  const shown = events.filter((e) => e.kind === 'message' || e.kind === 'dewdrop');
  const pending = (replica?.pending ?? []).filter((p) => p.kind === 'message' && !p.acked);
  return (
    <Section title={t('syncLab.messages.section')}>
      {shown.length === 0 && pending.length === 0 ? (
        <Note text={t('syncLab.messages.none')} />
      ) : null}
      <View style={{ gap: 8 }}>
        {shown.map((e) => {
          if (e.kind === 'dewdrop') {
            const from = senderOf(state, e.actor);
            return <Note key={e.seq} text={t('syncLab.message.dewdrop', { name: from.name })} />;
          }
          return e.actor === me ? (
            <YourBubble key={e.seq}>{textOf(e.payload)}</YourBubble>
          ) : (
            <TheirBubble key={e.seq} from={senderOf(state, e.actor)}>
              {textOf(e.payload)}
            </TheirBubble>
          );
        })}
        {pending.map((p) => (
          <View key={p.opId} style={{ opacity: 0.6 }}>
            <YourBubble>{textOf(p.payload)}</YourBubble>
          </View>
        ))}
      </View>
      <TextField
        value={draft}
        onChangeText={setDraft}
        placeholder={t('syncLab.message.placeholder')}
        testID="sync-lab-message"
      />
      <Button
        label={t('syncLab.message.send')}
        kind="primary"
        size="medium"
        disabled={draft.trim() === ''}
        onPress={() => void post()}
      />
      <Note text={note} />
    </Section>
  );
}

/**
 * The confirmed farm as the shared rules see it at the time of its newest event, as a short
 * digest: two phones and the server agree when their digests match. The whole view is logged
 * in development, so it can be compared key by key.
 */
export function ViewDigest({ farm }: { readonly farm: FarmId }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { rules } = useDataClient();
  const { person } = useSession();
  const replica = useFarm(farm);
  const newest = useFarmEvents(farm, 1)[0];
  const [digest, setDigest] = useState<string | null>(null);
  const confirmed = replica?.confirmed ?? null;
  const seq = replica?.lastSeq ?? 0;
  const at = newest?.seq === seq ? newest.at : null;

  useEffect(() => {
    if (confirmed === null || at === null) return;
    let live = true;
    const json = canonicalJson(rules.farmView(confirmed, at));
    void digestStringAsync(CryptoDigestAlgorithm.SHA256, json).then((hash) => {
      if (!live) return;
      setDigest(hash.slice(0, 12));
      console.log(`[sync-lab] person=${person?.id ?? ''} seq=${seq} at=${at} view=${json}`);
    });
    return () => {
      live = false;
    };
  }, [rules, confirmed, at, seq, person]);

  const waiting = replica?.pending.length ?? 0;
  return (
    <Section title={t('syncLab.view.section')}>
      <Txt variant="code" mono testID="sync-lab-digest">
        {t('syncLab.view.digest', { seq, digest: digest ?? '…' })}
      </Txt>
      {waiting > 0 ? (
        <Txt variant="caption" color={palette.muted}>
          {t('syncLab.view.pending', { count: waiting })}
        </Txt>
      ) : null}
    </Section>
  );
}
