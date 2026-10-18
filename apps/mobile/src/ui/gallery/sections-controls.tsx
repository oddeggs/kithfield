import { useState } from 'react';
import { View } from 'react-native';

import { Button, CircleButton } from '../components/button';
import { Chip } from '../components/chip';
import { Segmented } from '../components/segmented';
import { TextField } from '../components/text-field';
import { Toggle } from '../components/toggle';
import { useLocale } from '../locale/locale-provider';
import { Note, Panel } from './panel';

const noop = () => undefined;

export function ButtonsSection() {
  const { t } = useLocale();
  return (
    <Panel title={t('gallery.section.buttons')}>
      <View style={{ gap: 10 }}>
        <Button label={t('gallery.button.primary')} onPress={noop} />
        <Button label={t('gallery.button.go')} kind="go" onPress={noop} />
        <Button label={t('gallery.button.light')} kind="light" onPress={noop} />
        <Button label={t('gallery.button.destructive')} kind="destructive" onPress={noop} />
        <Button label={t('gallery.button.secondary')} kind="secondary" onPress={noop} />
        <Button label={t('gallery.button.text')} kind="text" onPress={noop} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Button label={t('gallery.button.small')} size="small" onPress={noop} />
          <CircleButton icon="plus" label={t('gallery.button.add')} onPress={noop} />
          <CircleButton
            icon="mic"
            kind="ink"
            iconSize={22}
            label={t('gallery.button.record')}
            onPress={noop}
          />
          <CircleButton
            icon="seeds"
            kind="glass"
            iconSize={22}
            label={t('glossary.seedBed')}
            onPress={noop}
          />
        </View>
        <Note>{t('gallery.button.note')}</Note>
      </View>
    </Panel>
  );
}

type Share = 'couple' | 'most' | 'everyone';

export function ControlsSection() {
  const { t } = useLocale();
  const [selected, setSelected] = useState(true);
  const [name, setName] = useState(t('gallery.field.value'));
  const [words, setWords] = useState('');
  const [share, setShare] = useState<Share>('most');
  const [lampOn, setLampOn] = useState(true);
  const [hibernate, setHibernate] = useState(false);
  return (
    <Panel title={t('gallery.section.controls')}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip label={t('gallery.chip.default')} onPress={noop} />
          <Chip
            label={t('gallery.chip.selected')}
            kind={selected ? 'selected' : 'default'}
            onPress={() => setSelected((s) => !s)}
          />
          <Chip label={t('gallery.chip.suggestion')} kind="suggestion" onPress={noop} />
          <Chip label={t('gallery.chip.invited')} kind="invited" />
        </View>
        <TextField label={t('gallery.field.label')} value={name} onChangeText={setName} />
        <TextField
          placeholder={t('gallery.field.placeholder')}
          value={words}
          onChangeText={setWords}
        />
        <Segmented<Share>
          label={t('gallery.section.controls')}
          value={share}
          onChange={setShare}
          segments={[
            { value: 'couple', label: t('gallery.segment.couple') },
            { value: 'most', label: t('gallery.segment.most') },
            { value: 'everyone', label: t('gallery.segment.everyone') },
          ]}
        />
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Toggle value={lampOn} onChange={setLampOn} label={t('glossary.lampOn')} />
          <Toggle value={hibernate} onChange={setHibernate} label={t('glossary.hibernate')} />
        </View>
      </View>
    </Panel>
  );
}
