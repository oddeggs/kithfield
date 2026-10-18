import type { Critter, Me } from '@kithfield/contracts';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useDataClient } from '../../data';
import { Avatar } from '../../ui/art/avatar';
import { Button } from '../../ui/components/button';
import { Chip } from '../../ui/components/chip';
import { TextField } from '../../ui/components/text-field';
import { useLocale } from '../../ui/locale/locale-provider';
import { useSession } from '../../ui/session/session';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { Note, Section, lookOf, plainCritter, useAction } from './lab-kit';

const SPECIES: readonly Critter['species'][] = ['rabbit', 'fox', 'hedgehog', 'frog', 'owl', 'duck'];

/** Who this phone is, and their name and critter (`PATCH /v1/me/profile`). */
export function YouPanel({
  me,
  onMe,
}: {
  readonly me: Me | null;
  readonly onMe: (me: Me) => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const { person } = useSession();
  const { api } = useDataClient();
  const { busy, problem, run } = useAction();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<Critter['species']>('rabbit');
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void run(() => api.me()).then((found) => {
      if (!found) return;
      onMe(found);
      if (found.name) setName(found.name);
      if (found.critter) setSpecies(found.critter.species);
    });
  }, [api, run, onMe]);

  const save = async () => {
    const answer = await run(() =>
      api.updateProfile({ name: name.trim(), critter: plainCritter(species) }),
    );
    if (!answer) return;
    onMe(answer);
    setSaved(t('syncLab.profile.saved', { name: answer.name ?? '' }));
  };

  return (
    <Section title={t('syncLab.you.section')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {me?.critter ? (
          <Avatar kind={me.critter.species} look={lookOf(me.critter)} size={44} />
        ) : null}
        <View style={{ flexShrink: 1 }}>
          <Txt variant="rowTitle">{me?.name ?? t('syncLab.you.anonymous')}</Txt>
          <Txt variant="caption" color={palette.muted} mono testID="sync-lab-person">
            {t('syncLab.you.person', { id: person?.id ?? '…' })}
          </Txt>
        </View>
      </View>
      <TextField
        value={name}
        onChangeText={setName}
        placeholder={t('syncLab.name.placeholder')}
        autoCorrect={false}
        testID="sync-lab-name"
      />
      <Txt variant="caption" color={palette.muted}>
        {t('syncLab.critter.section')}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SPECIES.map((s) => (
          <Chip
            key={s}
            label={s}
            kind={s === species ? 'selected' : 'default'}
            onPress={() => setSpecies(s)}
          />
        ))}
      </View>
      <Button
        label={t('syncLab.profile.save')}
        kind="secondary"
        size="medium"
        disabled={busy || name.trim() === ''}
        onPress={() => void save()}
      />
      <Note text={problem ?? saved} />
    </Section>
  );
}
