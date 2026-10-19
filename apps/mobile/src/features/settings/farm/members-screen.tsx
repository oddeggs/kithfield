import type { FarmId, MemberState, Role } from '@kithfield/contracts';
import { motion } from '@kithfield/theme';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  View,
  findNodeHandle,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ArtIcon } from '../../../ui/art/art-view';
import { Avatar } from '../../../ui/art/avatar';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useSession } from '../../../ui/session/session';
import { useTheme } from '../../../ui/theme/theme-provider';
import { lookOf } from '../format';
import { go } from '../go';
import { useKitColors } from '../kit/colors';
import { Badge, Group, IconCircle, NavBar, Page, Row } from '../kit/layout';
import { KText } from '../kit/text';
import { memberActions, type MemberAction } from './member-actions';
import { useFarmSettings } from './use-farm-settings';

interface MenuItem {
  readonly label: string;
  readonly icon: string;
  readonly danger?: boolean;
  readonly act: () => void;
}

interface OpenMenu {
  readonly person: string;
  readonly y: number;
  readonly items: readonly MenuItem[];
}

const ITEM = 48;
const MENU_WIDTH = 250;

/** Members and roles: every critter with their role, and what you may do for each. */
export function MembersScreen({ farm }: { readonly farm: FarmId }) {
  const { t, language } = useLocale();
  const { palette } = useTheme();
  const kit = useKitColors();
  const { person } = useSession();
  const { height } = useWindowDimensions();
  const { state, role, canInvite, write } = useFarmSettings(farm);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const menuRef = useRef<ComponentRef<typeof Animated.View>>(null);
  // VoiceOver moves into the menu as it opens.
  useEffect(() => {
    if (!menu) return;
    const node = findNodeHandle(menuRef.current);
    if (typeof node === 'number') AccessibilityInfo.setAccessibilityFocus(node);
  }, [menu]);
  const buttons = useRef(new Map<string, ComponentRef<typeof View> | null>());

  const month = (at: number) =>
    new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-GB', { month: 'long' }).format(at);
  const nameOf = (m: MemberState) => m.name ?? t('settings.members.friend');
  const params = (m: MemberState) => ({ farm, person: m.person });
  const setRole = (m: MemberState, role: Role) =>
    void write('settings_changed', { setting: 'role', person: m.person, role });

  const itemsFor = (m: MemberState): MenuItem[] => {
    const name = nameOf(m);
    const items: Record<MemberAction, MenuItem> = {
      leave: {
        label: t('settings.farm.leave'),
        icon: 'door',
        danger: true,
        act: () => go({ pathname: '/(tabs)/farm/leave', params: { farm } }),
      },
      makeHelper: {
        label: t('settings.members.makeHelper'),
        icon: 'people',
        act: () => setRole(m, 'helper'),
      },
      makeKeeper: {
        label: t('settings.members.makeKeeper'),
        icon: 'key',
        act: () => setRole(m, 'keeper'),
      },
      makeCritter: {
        label: t('settings.members.makeCritter'),
        icon: 'leaf',
        act: () => setRole(m, 'critter'),
      },
      report: {
        label: t('settings.members.report', { name }),
        icon: 'flag',
        act: () => go({ pathname: '/(modal)/safety-report', params: params(m) }),
      },
      remove: {
        label: t('settings.members.remove'),
        icon: 'leaf',
        danger: true,
        act: () => go({ pathname: '/(modal)/settings-remove', params: params(m) }),
      },
      block: {
        label: t('settings.members.block', { name }),
        icon: 'block',
        act: () => go({ pathname: '/(modal)/safety-block', params: params(m) }),
      },
    };
    return memberActions(person?.id ?? null, m, role).map((a) => items[a]);
  };

  const openMenu = (m: MemberState) => {
    const items = itemsFor(m);
    const button = buttons.current.get(m.person);
    button?.measureInWindow((_x, y) => {
      const below = y + 12;
      const tall = items.length * ITEM;
      setMenu({
        person: m.person,
        y: below + tall > height - 40 ? Math.max(60, y + 44 - tall) : below,
        items,
      });
    });
  };

  const subtitle = (m: MemberState) => {
    const species = t(`settings.species.${m.critter.species}`);
    if (m.hibernating) return t('settings.members.hibernating', { species });
    if (m.battery === 'resting') return t('settings.members.resting', { species });
    return t('settings.members.since', { species, month: month(m.joinedAt) });
  };

  // The bold role names sit wherever each language puts them in the sentence.
  const info = t('settings.members.info', { keepers: '§', helpers: '§' });
  const [before = '', middle = '', after = ''] = info.split('§');

  return (
    <View style={{ flex: 1 }}>
      <Page
        header={
          <NavBar
            title={t('settings.farm.critters')}
            {...(canInvite
              ? {
                  right: (
                    <IconCircle
                      icon="plus"
                      label={t('settings.members.invite')}
                      onPress={() => go({ pathname: '/(tabs)/you/farm-invite', params: { farm } })}
                    />
                  ),
                }
              : {})}
          />
        }
      >
        <View
          style={{
            borderRadius: 18,
            backgroundColor: kit.info.bg,
            paddingVertical: 12,
            paddingHorizontal: 14,
          }}
        >
          <KText kind="card" multiline color={kit.info.fg}>
            {before}
            <KText kind="card" color={kit.info.strong} style={{ fontWeight: '600' }}>
              {t('settings.members.keepers')}
            </KText>
            {middle}
            <KText kind="card" color={kit.info.strong} style={{ fontWeight: '600' }}>
              {t('settings.members.helpers')}
            </KText>
            {after}
          </KText>
        </View>
        <Group>
          {(state?.members ?? []).map((m) => (
            <Row
              key={m.person}
              title={
                m.person === person?.id ? t('settings.members.you', { name: nameOf(m) }) : nameOf(m)
              }
              subtitle={subtitle(m)}
              lead={<Avatar kind={m.critter.species} look={lookOf(m.critter)} size={40} />}
              {...(m.role === 'critter'
                ? {}
                : {
                    badge: (
                      <Badge
                        text={t(
                          m.role === 'keeper'
                            ? 'settings.members.keeper'
                            : 'settings.members.helper',
                        )}
                        tone={m.role}
                      />
                    ),
                  })}
              trailing={
                <View ref={(v) => void buttons.current.set(m.person, v)} collapsable={false}>
                  <Press
                    onPress={() => openMenu(m)}
                    radius={22}
                    darken={false}
                    accessibilityRole="button"
                    accessibilityLabel={t('settings.members.more', { name: nameOf(m) })}
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ArtIcon name="more" size={20} color={palette.text} />
                  </Press>
                </View>
              }
            />
          ))}
        </Group>
      </Page>
      {menu ? (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={t('shell.sheet.close')}
            onPress={() => setMenu(null)}
          />
          <Animated.View
            ref={menuRef}
            accessibilityViewIsModal
            onAccessibilityEscape={() => setMenu(null)}
            entering={FadeIn.duration(motion.fade.durationMs)}
            exiting={FadeOut.duration(motion.cross.durationMs)}
            style={{
              position: 'absolute',
              top: menu.y,
              right: 16,
              width: MENU_WIDTH,
              borderRadius: 18,
              backgroundColor: palette.card,
              boxShadow: kit.menuShadow,
              overflow: 'hidden',
            }}
          >
            {menu.items.map((item, i) => (
              <Press
                key={item.label}
                onPress={() => {
                  setMenu(null);
                  item.act();
                }}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
                style={{
                  height: ITEM,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingLeft: 16,
                  paddingRight: 14,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: palette.hairline,
                }}
              >
                <KText kind="menu" color={item.danger ? kit.danger : palette.text}>
                  {item.label}
                </KText>
                <ArtIcon
                  name={item.icon}
                  size={20}
                  color={item.danger ? kit.danger : palette.text}
                />
              </Press>
            ))}
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}
