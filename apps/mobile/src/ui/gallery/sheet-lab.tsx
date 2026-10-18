import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '../components/button';
import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';

/**
 * A native sheet sized to what it holds (`formSheet` with `fitToContents`, as the root stack
 * presents the safety and settings sheets), with a button that answers a tap: proof that such a
 * sheet takes touches.
 */
export function SheetLab() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const [tapped, setTapped] = useState(false);
  return (
    <View style={{ paddingTop: 26, paddingHorizontal: 18, paddingBottom: 34, gap: 12 }}>
      <Txt variant="sheetTitle">{t('gallery.sheet.title')}</Txt>
      <Txt variant="sheetBody" multiline color={palette.body}>
        {t('gallery.sheet.body')}
      </Txt>
      <Button
        label={t('gallery.nativeSheet.tap')}
        kind="secondary"
        onPress={() => setTapped(true)}
      />
      {tapped ? (
        <Txt variant="caption" color={palette.secondary} accessibilityLiveRegion="polite">
          {t('gallery.nativeSheet.tapped')}
        </Txt>
      ) : null}
    </View>
  );
}
