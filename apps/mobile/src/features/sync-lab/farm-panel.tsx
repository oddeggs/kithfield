import type { FarmId, FarmList, Me } from '@kithfield/contracts';
import { getCalendars } from 'expo-localization';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useDataClient } from '../../data';
import { Button } from '../../ui/components/button';
import { Chip } from '../../ui/components/chip';
import { ListGroup, ListRow } from '../../ui/components/list-row';
import { TextField } from '../../ui/components/text-field';
import { useLocale } from '../../ui/locale/locale-provider';
import { Note, Section, useAction } from './lab-kit';

type FarmItem = FarmList['farms'][number];

/** The land every lab farm is planted on. */
const LAND = 'meadow';

const timeZone = () => getCalendars()[0]?.timeZone ?? 'UTC';

/**
 * The farms this person lives on, and the ways to a new one: plant a farm (`POST /v1/farms`), make
 * an invite, or move in with a code typed in (`POST /v1/invites/:code/join`).
 */
export function FarmPanel({
  me,
  farm,
  onFarm,
}: {
  readonly me: Me | null;
  readonly farm: FarmId | null;
  readonly onFarm: (farm: FarmId) => void;
}) {
  const { t } = useLocale();
  const { api } = useDataClient();
  const { busy, problem, run } = useAction();
  const [farms, setFarms] = useState<readonly FarmItem[]>([]);
  const [farmName, setFarmName] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await run(() => api.farms());
    if (!list) return;
    setFarms(list.farms);
    const first = list.farms[0];
    if (farm === null && first) onFarm(first.farm);
  }, [api, run, farm, onFarm]);

  useEffect(() => {
    void refresh();
    // Once on opening; after that, only when a farm is planted or joined, or on "Look again".
  }, []);

  const plant = async () => {
    const made = await run(() =>
      api.createFarm({
        name: farmName.trim(),
        land: LAND,
        timeZone: timeZone(),
        hemisphere: 'north',
      }),
    );
    if (!made) return;
    setNote(t('syncLab.invite.code', { code: made.invite.code }));
    onFarm(made.farm);
    await refresh();
  };

  const invite = async () => {
    if (farm === null) return;
    const made = await run(() => api.createInvite(farm, { expiresAt: null }));
    if (made) setNote(t('syncLab.invite.code', { code: made.code }));
  };

  const join = async () => {
    if (!me?.name || !me.critter) return;
    const { name, critter } = me;
    const joined = await run(() => api.join(code.trim(), { name, critter }));
    if (!joined) return;
    if (joined.status === 'waiting_for_keeper') setNote(t('syncLab.join.waiting'));
    onFarm(joined.farm);
    await refresh();
  };

  const selected = farms.find((f) => f.farm === farm);
  const canInvite = selected?.kind === 'farm' && selected.role !== 'critter';
  const hasProfile = Boolean(me?.name && me.critter);

  return (
    <Section title={t('syncLab.farm.section')}>
      {farms.length === 0 ? (
        <Note text={t('syncLab.farm.none')} />
      ) : (
        <ListGroup>
          {farms.map((f) => (
            <ListRow
              key={f.farm}
              title={f.name ?? f.with?.name ?? f.farm}
              subtitle={`${f.role} · ${f.farm}`}
              onPress={() => onFarm(f.farm)}
              {...(f.farm === farm
                ? { trailing: <Chip label={t('syncLab.farm.open')} kind="selected" /> }
                : {})}
            />
          ))}
        </ListGroup>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label={t('syncLab.farm.refresh')}
          kind="text"
          size="small"
          onPress={() => void refresh()}
        />
        {canInvite ? (
          <Button
            label={t('syncLab.invite.new')}
            kind="secondary"
            size="small"
            disabled={busy}
            onPress={() => void invite()}
          />
        ) : null}
      </View>
      <TextField
        value={farmName}
        onChangeText={setFarmName}
        placeholder={t('syncLab.farm.namePlaceholder')}
        testID="sync-lab-farm-name"
      />
      <Button
        label={t('syncLab.farm.create')}
        kind="secondary"
        size="medium"
        disabled={busy || !hasProfile || farmName.trim() === ''}
        onPress={() => void plant()}
      />
      <TextField
        value={code}
        onChangeText={setCode}
        placeholder={t('syncLab.join.placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        testID="sync-lab-code"
      />
      <Button
        label={t('syncLab.join.action')}
        kind="secondary"
        size="medium"
        disabled={busy || !hasProfile || code.trim() === ''}
        onPress={() => void join()}
      />
      <Note text={problem ?? note} />
    </Section>
  );
}
