import { useState } from 'react';
import { View } from 'react-native';

import { ArtStill } from '../art/art-view';
import { Button } from '../components/button';
import { Sheet } from '../components/sheet';
import { EmptyState, ErrorState } from '../components/state-shell';
import { useToast } from '../components/toast';
import { useLocale } from '../locale/locale-provider';
import type { TabName } from '../tab-bar/tabs';
import { TabBarView } from '../tab-bar/tab-bar-view';
import { ThemeScope, useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';
import { Note, Panel } from './panel';

const noop = () => undefined;
const rabbit = { kind: 'rabbit' };

function TabBarFrame({ active, dot }: { readonly active: TabName; readonly dot?: TabName }) {
  const { palette } = useTheme();
  const [tab, setTab] = useState(active);
  const dots = { farm: false, chat: false, seedbed: false, you: false };
  if (dot) dots[dot] = true;
  return (
    <View style={{ height: 96, borderRadius: 24, backgroundColor: palette.background }}>
      <View style={{ position: 'absolute', left: 10, right: 10, bottom: 16 }}>
        <TabBarView active={tab} dots={dots} you={rabbit} onPress={setTab} />
      </View>
    </View>
  );
}

export function SheetsSection({ onOpenSheet }: { readonly onOpenSheet: () => void }) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const [index, setIndex] = useState(0);
  return (
    <Panel title={t('gallery.section.sheets')}>
      <View
        style={{
          height: 300,
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: palette.background,
        }}
      >
        <ArtStill scene="strip" width={342} height={150} />
        <Sheet detents={[180, 260]} index={index} onIndexChange={(i) => setIndex(Math.max(0, i))}>
          <Txt variant="sheetTitle">{t('gallery.sheet.title')}</Txt>
          <Txt variant="sheetBody" multiline color={palette.body}>
            {t('gallery.sheet.body')}
          </Txt>
        </Sheet>
      </View>
      <Button label={t('gallery.sheet.open')} kind="secondary" size="small" onPress={onOpenSheet} />
      <TabBarFrame active="farm" />
      <ThemeScope appearance="night">
        <TabBarFrame active="chat" dot="chat" />
      </ThemeScope>
      <Note>{t('gallery.tabBar.note')}</Note>
    </Panel>
  );
}

export function ShellsSection() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const toast = useToast();
  return (
    <Panel title={t('gallery.section.shells')}>
      <View style={{ height: 520, borderRadius: 24, backgroundColor: palette.background }}>
        <EmptyState
          art={
            <ArtStill
              scene="plant"
              width={200}
              height={200}
              attrs={{ name: 'aster', stage: 0, color: 'none' }}
            />
          }
          title={t('gallery.empty.title')}
          body={t('gallery.empty.body')}
          action={{ label: t('gallery.empty.action'), icon: 'seed', onPress: noop }}
        />
      </View>
      <View
        style={{
          height: 640,
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: palette.background,
        }}
      >
        <ErrorState
          art={<ArtStill scene="spot" width={300} height={216} attrs={{ name: 'error' }} />}
          title={t('gallery.error.title')}
          body={t('gallery.error.body')}
          code={t('gallery.error.code')}
          action={{ label: t('gallery.error.action'), onPress: noop }}
        />
      </View>
      <Button
        label={t('gallery.toast.show')}
        kind="secondary"
        size="small"
        onPress={() => toast.show(t('gallery.toast.text'), 'photo')}
      />
    </Panel>
  );
}
