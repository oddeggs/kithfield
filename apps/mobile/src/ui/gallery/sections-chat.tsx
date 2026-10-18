import { View } from 'react-native';

import { QuietNote, TheirBubble, WritingIndicator, YourBubble } from '../components/bubble';
import { GestureTile, GestureTray } from '../components/gesture-tray';
import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { Panel } from './panel';

const noop = () => undefined;

export function BubblesSection() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const bea = { name: t('gallery.bubble.name'), kind: 'sheep' };
  const mo = { name: t('gallery.bubble.quietName'), kind: 'mole' };
  return (
    <Panel title={t('gallery.section.bubbles')}>
      <View style={{ gap: 10, backgroundColor: palette.background, borderRadius: 20, padding: 14 }}>
        <TheirBubble from={bea}>{t('gallery.bubble.theirs')}</TheirBubble>
        <YourBubble>{t('gallery.bubble.yours')}</YourBubble>
        <QuietNote from={mo}>{t('gallery.bubble.quiet')}</QuietNote>
        <YourBubble failed onRetry={noop}>
          {t('gallery.bubble.failed')}
        </YourBubble>
        <WritingIndicator from={bea} />
      </View>
    </Panel>
  );
}

export function TraySection() {
  const { t } = useLocale();
  return (
    <Panel title={t('gallery.section.tray')}>
      <GestureTray
        items={[
          { icon: 'dewdrop', label: t('glossary.dewdrop'), tone: 'dewdrop', onPress: noop },
          { icon: 'sun', label: t('glossary.tending'), onPress: noop },
          { icon: 'sprout', label: t('glossary.seed'), onPress: noop },
          { icon: 'wave', label: t('glossary.critter'), onPress: noop },
          { icon: 'firefly', label: t('glossary.firefly'), tone: 'firefly', onPress: noop },
        ]}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <GestureTile
          icon="dewdrop"
          title={t('glossary.dewdrop')}
          body={t('gallery.tray.dewdrop')}
        />
        <GestureTile
          icon="firefly"
          tone="firefly"
          title={t('glossary.firefly')}
          body={t('gallery.tray.firefly')}
        />
      </View>
    </Panel>
  );
}
