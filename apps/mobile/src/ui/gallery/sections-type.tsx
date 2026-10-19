import type { StringKey } from '@kithfield/i18n';
import { View } from 'react-native';

import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';
import type { TypeVariant } from '../type/styles';
import { Panel } from './panel';

/**
 * The type ramp as `01 Foundations` sets it out, one sample per step, then two lines whose
 * Vietnamese stacks marks above capitals and tall letters: the text most likely to be cut off at
 * the top of its line. Last, a Vietnamese name in hand and display text, as English shows it too.
 */
const SAMPLES = [
  ['displayXL', 'gallery.type.displayXL', 'gallery.type.sample.displayXL'],
  ['displayL', 'gallery.type.displayL', 'gallery.type.sample.displayL'],
  ['displayM', 'gallery.type.displayM', 'gallery.type.sample.displayM'],
  ['displayS', 'gallery.type.displayS', 'gallery.type.sample.displayS'],
  ['handL', 'gallery.type.handL', 'gallery.type.sample.handL'],
  ['handS', 'gallery.type.handS', 'gallery.type.sample.handS'],
  ['button', 'gallery.type.button', 'gallery.type.sample.button'],
  ['body', 'gallery.type.body', 'gallery.type.sample.body'],
  ['rowTitle', 'gallery.type.rowTitle', 'gallery.type.sample.rowTitle'],
  ['caption', 'gallery.type.caption', 'gallery.type.sample.caption'],
  ['label', 'gallery.type.label', 'gallery.type.sample.label'],
  ['displayL', 'gallery.type.displayL', 'gallery.type.marks.display'],
  ['handL', 'gallery.type.handL', 'gallery.type.marks.hand'],
  ['handS', 'gallery.type.handS', 'gallery.type.marks.name'],
  ['displayS', 'gallery.type.displayS', 'gallery.type.marks.name'],
] as const satisfies readonly (readonly [TypeVariant, StringKey, StringKey])[];

export function TypeSection() {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <Panel title={t('gallery.section.type')}>
      <View>
        {SAMPLES.map(([variant, name, sample], i) => (
          <View
            key={`${variant}:${sample}`}
            style={{
              gap: 6,
              paddingVertical: 12,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: palette.cardBorder,
            }}
          >
            <Txt variant="caption" medium color={palette.secondary}>
              {t(name)}
            </Txt>
            <Txt variant={variant} multiline>
              {t(sample)}
            </Txt>
          </View>
        ))}
      </View>
    </Panel>
  );
}
