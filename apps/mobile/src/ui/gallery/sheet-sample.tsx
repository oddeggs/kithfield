import { ScrollView, View } from 'react-native';

import { Chip } from '../components/chip';
import { ListRow } from '../components/list-row';
import { Sheet, SheetScrollView } from '../components/sheet';
import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';

const ICONS = [
  'bell',
  'farm',
  'chat',
  'seeds',
  'camera',
  'gear',
  'people',
  'clock',
  'moon',
  'leaf',
];
const noop = () => undefined;

/**
 * A modal sheet with what real sheets hold: a sideways row of chips, which must swipe without
 * moving the sheet, and a long list, which scrolls once the sheet is at its highest stop.
 */
export function SheetSample({
  index,
  onIndexChange,
}: {
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const chips = [
    t('gallery.chip.default'),
    t('gallery.chip.selected'),
    t('gallery.chip.suggestion'),
    t('gallery.segment.couple'),
    t('gallery.segment.most'),
    t('gallery.segment.everyone'),
  ];
  return (
    <Sheet detents={[260, 620]} index={index} onIndexChange={onIndexChange} modal>
      <Txt variant="sheetTitle">{t('gallery.sheet.title')}</Txt>
      <Txt variant="sheetBody" multiline color={palette.body}>
        {t('gallery.sheet.body')}
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[...chips, ...chips].map((label, i) => (
            <Chip key={`${label}:${i}`} label={label} onPress={noop} />
          ))}
        </View>
      </ScrollView>
      <SheetScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }}>
        {Array.from({ length: 30 }, (_, i) => (
          <ListRow
            key={i}
            icon={ICONS[i % ICONS.length] ?? 'bell'}
            title={`${t('gallery.card.listTitle')} ${i + 1}`}
            subtitle={t('gallery.card.listSubtitle')}
            onPress={noop}
          />
        ))}
      </SheetScrollView>
    </Sheet>
  );
}
