import { layout, motion } from '@kithfield/theme';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtIcon } from '../../ui/art/art-view';
import { Sheet, SheetScrollView } from '../../ui/components/sheet';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { useInks } from './kit';

export interface PickerOption<T> {
  readonly value: T;
  readonly label: string;
}

const ROW = 48;
/** Two of the sheet spring's responses: long enough for it to settle shut before it leaves. */
const CLOSING_MS = Math.round(motion.sheet.response * 2000);

/** A modal sheet listing options to pick one from: a day, a month or a year. */
export function PickerSheet<T extends string | number>({
  title,
  options,
  value,
  open,
  onPick,
  onClose,
}: {
  readonly title: string;
  readonly options: readonly PickerOption<T>[];
  readonly value: T | null;
  readonly open: boolean;
  readonly onPick: (value: T) => void;
  readonly onClose: () => void;
}) {
  const { palette } = useTheme();
  const inks = useInks();
  const insets = useSafeAreaInsets();
  const chosen = options.findIndex((o) => o.value === value);
  // Mounted only while open or closing, so a shut sheet leaves no shadow at the bottom edge.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), CLOSING_MS);
    return () => clearTimeout(timer);
  }, [open]);
  if (!mounted) return null;

  return (
    // Over the screen's own bottom buttons.
    <View style={[StyleSheet.absoluteFill, { zIndex: 40 }]} pointerEvents="box-none">
      <Sheet detents={[460]} index={open ? 0 : -1} onIndexChange={(i) => i < 0 && onClose()} modal>
        <Txt variant="sheetTitle" accessibilityRole="header">
          {title}
        </Txt>
        <SheetScrollView
          // Opens with the chosen one in view.
          contentOffset={{ x: 0, y: Math.max(0, (chosen - 2) * ROW) }}
          style={{ flex: 1, marginTop: 8 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + layout.buttonBottom }}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Press
                key={String(option.value)}
                onPress={() => onPick(option.value)}
                haptic="select"
                darken={false}
                accessibilityLabel={option.label}
                accessibilityState={{ selected }}
                style={{
                  height: ROW,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottomWidth: 1,
                  borderBottomColor: palette.hairline,
                }}
              >
                <Txt variant="rowTitle" color={selected ? inks.mossText : palette.text}>
                  {option.label}
                </Txt>
                {selected ? <ArtIcon name="check" size={20} color={inks.moss} /> : <View />}
              </Press>
            );
          })}
        </SheetScrollView>
      </Sheet>
    </View>
  );
}
