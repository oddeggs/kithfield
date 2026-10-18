import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';

/** A section of the gallery, framed as `01 Foundations` frames each part of the library. */
export function Panel({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        borderRadius: 28,
        backgroundColor: palette.panel,
        padding: 22,
        gap: 14,
        width: '100%',
        maxWidth: 386,
        alignSelf: 'center',
      }}
    >
      <Txt variant="label" accessibilityRole="header">
        {title}
      </Txt>
      {children}
    </View>
  );
}

export function Note({ children }: { readonly children: string }) {
  const { palette } = useTheme();
  return (
    <Txt variant="note" multiline color={palette.secondary}>
      {children}
    </Txt>
  );
}
