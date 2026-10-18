import type { CritterLook } from '@kithfield/art';
import { radii } from '@kithfield/theme';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { announcePolitely } from '../announce';
import { ArtIcon, ArtLoop } from '../art/art-view';
import { Avatar } from '../art/avatar';
import { useLocale } from '../locale/locale-provider';
import { Press } from '../motion/press';
import { useTheme } from '../theme/theme-provider';
import { useAccessibilitySize } from '../type/accessibility-size';
import { Txt } from '../type/text';

const MAX = 262;
const R = 20;
const TAIL = radii.bubbleTail;
const RULE = 22;

export interface Sender {
  name: string;
  kind: string;
  look?: CritterLook;
}

const bubbleBox = { paddingVertical: 10, paddingHorizontal: 14 };

/** Bubbles stop at 262 points, and run full width at the accessibility text sizes. */
function useBubbleMax(): number | undefined {
  return useAccessibilitySize() ? undefined : MAX;
}

/** A friend's message: their critter, their name above, the tail at the bottom left. */
export function TheirBubble({
  from,
  showName = true,
  children,
}: {
  readonly from: Sender;
  readonly showName?: boolean;
  readonly children: ReactNode;
}) {
  const { palette } = useTheme();
  const max = useBubbleMax();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
      <Avatar kind={from.kind} {...(from.look ? { look: from.look } : {})} size={30} />
      <View style={{ gap: 4, alignItems: 'flex-start', flexShrink: 1 }}>
        {showName ? (
          <Txt variant="bubbleName" color={palette.muted} style={{ paddingLeft: 10 }}>
            {from.name}
          </Txt>
        ) : null}
        <View
          style={[
            bubbleBox,
            { maxWidth: max },
            {
              borderRadius: R,
              borderBottomLeftRadius: TAIL,
              backgroundColor: palette.card,
              borderWidth: 1,
              borderColor: palette.cardBorder,
            },
          ]}
        >
          <Txt variant="bubble" multiline>
            {children}
          </Txt>
        </View>
      </View>
    </View>
  );
}

/**
 * Your message, in moss with the tail at the bottom right. A failed one keeps the card colour with
 * a clay border, and a line under it that sends it again.
 */
export function YourBubble({
  failed = false,
  onRetry,
  children,
}: {
  readonly failed?: boolean;
  readonly onRetry?: () => void;
  readonly children: ReactNode;
}) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const b = palette.bubble;
  const max = useBubbleMax();
  return (
    <View style={{ alignSelf: 'flex-end', alignItems: 'flex-end', gap: 4, maxWidth: max }}>
      <View
        style={[
          bubbleBox,
          { borderRadius: R, borderBottomRightRadius: TAIL },
          failed
            ? { backgroundColor: palette.card, borderWidth: 1.5, borderColor: b.failedBorder }
            : { backgroundColor: b.yoursBg },
        ]}
      >
        <Txt variant="bubble" multiline color={failed ? palette.text : b.yoursFg}>
          {children}
        </Txt>
      </View>
      {failed && onRetry ? (
        <Press
          onPress={onRetry}
          darken={false}
          haptic="tap"
          // The line is 12 points tall; the slop makes it a 44-point target.
          hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
          accessibilityLabel={t('shell.bubble.failed')}
        >
          <Txt variant="bubbleState" color={b.failedText}>
            {t('shell.bubble.failed')}
          </Txt>
        </Press>
      ) : null}
    </View>
  );
}

/** A quiet note: lined paper, tilted a little, headed in the hand face with "no reply needed". */
export function QuietNote({
  from,
  children,
}: {
  readonly from: Sender;
  readonly children: ReactNode;
}) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const b = palette.bubble;
  const [height, setHeight] = useState(0);
  const rules = Math.max(0, Math.floor(height / RULE));
  const max = useBubbleMax();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
      <Avatar kind={from.kind} {...(from.look ? { look: from.look } : {})} size={30} />
      <View
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        style={[
          bubbleBox,
          { maxWidth: max },
          {
            borderRadius: 18,
            borderTopLeftRadius: TAIL,
            backgroundColor: b.quietBg,
            overflow: 'hidden',
            transform: [{ rotate: '-0.6deg' }],
            flexShrink: 1,
          },
        ]}
      >
        {Array.from({ length: rules }, (_, i) => (
          <View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: (i + 1) * RULE - 1,
              height: 1,
              backgroundColor: b.quietRule,
            }}
          />
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <ArtIcon name="note" size={16} color={palette.text} />
          <Txt variant="quietHead" color={b.quietHead}>
            {t('shell.bubble.quietNote', { name: from.name })}
          </Txt>
        </View>
        <Txt variant="bubble" multiline>
          {children}
        </Txt>
      </View>
    </View>
  );
}

/** A friend writing: their critter at a little desk, in the hand face. */
export function WritingIndicator({ from }: { readonly from: Sender }) {
  const { palette } = useTheme();
  const { t } = useLocale();
  const text = t('shell.bubble.writing', { name: from.name });
  useEffect(() => {
    if (Platform.OS === 'ios') announcePolitely(text);
  }, [text]);
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={text}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <ArtLoop scene="writing" width={96} height={46} attrs={{ kind: from.kind }} />
      <Txt variant="handS" color={palette.secondary}>
        {text}
      </Txt>
    </View>
  );
}
