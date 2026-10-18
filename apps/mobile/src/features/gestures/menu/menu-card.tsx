import { LIMITS } from '@kithfield/contracts';
import { fontFor } from '@kithfield/theme';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { ArtIcon } from '../../../ui/art/art-view';
import { Button } from '../../../ui/components/button';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { typeStyleOf } from '../../../ui/type/styles';
import { Txt } from '../../../ui/type/text';
import type { MenuAction } from '../model/message';
import { useGestureColours } from '../ui/colours';

const ROW = 48;
const WIDTH = 250;

/** Each action's icon on the right of its row, from the design's set. */
const icons: Record<MenuAction, { art: string; size: number }> = {
  reply: { art: 'reply', size: 22 },
  edit: { art: 'pencil', size: 22 },
  pin: { art: 'pin', size: 22 },
  unpin: { art: 'pin', size: 22 },
  plant: { art: 'seed', size: 26 },
  copy: { art: 'note', size: 22 },
  forward: { art: 'share', size: 22 },
  unsend: { art: 'trash', size: 22 },
  report: { art: 'flag', size: 22 },
};

/** The menu's surface: paper at 94% over the blur, the menu shadow. */
export function useMenuSurface() {
  const gc = useGestureColours();
  return {
    width: WIDTH,
    borderRadius: 18,
    backgroundColor: gc.menuSurface,
    boxShadow: gc.menuShadow,
    overflow: 'hidden' as const,
  };
}

/** The long-press menu's rows. Planting is set in moss, unsending in clay. */
export function MenuCard({
  actions,
  onAction,
}: {
  readonly actions: readonly MenuAction[];
  readonly onAction: (action: MenuAction) => void;
}) {
  const { t } = useLocale();
  const { palette } = useTheme();
  const surface = useMenuSurface();
  return (
    <View accessibilityRole="menu" style={surface}>
      {actions.map((action, i) => {
        const icon = icons[action];
        const colour =
          action === 'plant'
            ? palette.chip.suggestionFg
            : action === 'unsend'
              ? palette.bubble.failedText
              : palette.text;
        return (
          <Press
            key={action}
            onPress={() => onAction(action)}
            haptic="select"
            darken
            accessibilityRole="menuitem"
            accessibilityLabel={t(`gestures.menu.${action}`)}
            style={{
              height: ROW,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 16,
              paddingRight: 12,
              borderBottomWidth: i < actions.length - 1 ? 1 : 0,
              borderBottomColor: palette.hairline,
            }}
          >
            <Txt
              variant="rowTitle"
              color={colour}
              style={action === 'plant' ? null : { fontWeight: '400' }}
            >
              {t(`gestures.menu.${action}`)}
            </Txt>
            <ArtIcon name={icon.art} size={icon.size} color={colour} />
          </Press>
        );
      })}
    </View>
  );
}

/** Changing a message's words in place: within 15 minutes of sending. */
export function EditCard({
  initial,
  onSave,
  onCancel,
}: {
  readonly initial: string;
  readonly onSave: (text: string) => void;
  readonly onCancel: () => void;
}) {
  const { t, fontLocale } = useLocale();
  const { palette } = useTheme();
  const surface = useMenuSurface();
  const [text, setText] = useState(initial);
  const changed = text.trim() !== '' && text.trim() !== initial.trim();
  return (
    <View style={[surface, { width: 300, padding: 12, gap: 10 }]}>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        maxLength={LIMITS.message}
        placeholder={t('gestures.menu.editPlaceholder')}
        placeholderTextColor={palette.placeholder}
        selectionColor={palette.go.bg}
        testID="menu-edit"
        style={[
          fontFor(typeStyleOf('bubble'), fontLocale, { multiline: true }),
          { minHeight: 44, maxHeight: 160, color: palette.text },
        ]}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <Button label={t('gestures.menu.cancel')} kind="text" onPress={onCancel} />
        <Button
          label={t('gestures.menu.save')}
          kind="go"
          size="small"
          disabled={!changed}
          onPress={() => onSave(text.trim())}
        />
      </View>
    </View>
  );
}
