import type { PersonId } from '@kithfield/contracts';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { useFarm } from '../../data';
import { useUpload } from '../../features/media';
import { visitPeer } from '../../features/chat/model/people';
import { canEdit } from '../../features/chat/model/rows';
import type { BubbleItem } from '../../features/chat/model/timeline';
import { go } from '../../features/chat/routes';
import { TypingLine } from '../../features/chat/room/lines';
import { RoomProvider, type RoomValue } from '../../features/chat/room/room-context';
import { RoomNotice, useRoomNotice } from '../../features/chat/room/room-notice';
import { sprouted, useOutLine } from '../../features/chat/room/room-people';
import { TimelineList, type JumpRequest } from '../../features/chat/room/timeline-list';
import { useRoomData } from '../../features/chat/room/use-room-data';
import {
  MicButton,
  RecorderPanel,
  useVoiceRecorder,
} from '../../features/chat/room/voice-recorder';
import { noteSeen } from '../../features/chat/ui/seen-store';
import { ArtIcon } from '../../ui/art/art-view';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { DeskComposer, type DeskComposerHandle } from './desk-composer';
import { DropZone } from './drop-zone';
import { prepareDropped } from './dropped-media';
import { useDeskKey } from './desk-keys';

/** The chat header's icons: the noticeboard, the seed bed, and more. */
function HeaderIcon({
  icon,
  label,
  onPress,
}: {
  readonly icon: string;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Press onPress={onPress} radius={14} accessibilityLabel={label} style={{ padding: 4 }}>
      <ArtIcon name={icon} size={20} color={palette.secondary} />
    </Press>
  );
}

/**
 * The middle pane: a farm's chat or a visit, under a plain header (the farm itself is in the
 * pane beside it), with the desktop's composer and room to drop photos. Everything it reads and
 * writes is the phone's chat (`useRoomData`), so the two never differ.
 */
export function DeskChat({ farm, seq }: { readonly farm: string; readonly seq?: number }) {
  const data = useRoomData(farm);
  const { t } = useLocale();
  const { palette } = useTheme();
  const toast = useToast();
  const upload = useUpload();
  const { state, timeline, people, bubbles, presence, actions } = data;
  const visit = state?.kind === 'visit';
  const composer = useRef<DeskComposerHandle>(null);
  const [editing, setEditing] = useState<BubbleItem | null>(null);
  const [jump, setJump] = useState<JumpRequest | null>(seq === undefined ? null : { seq, id: 0 });
  const [toNewest, setToNewest] = useState(0);
  const scrollY = useSharedValue(0);
  const notice = useRoomNotice(data.link, state, data.me, data.now);
  const outLine = useOutLine(state, presence.here, data.me);
  const peer = visitPeer(state, data.me);
  const typing = presence.typing.filter((p) => p !== data.me);
  const writer = useFarm(farm);

  useEffect(() => {
    if (data.lastSeq > 0) noteSeen(farm, data.lastSeq);
  }, [farm, data.lastSeq]);
  useEffect(() => {
    if (seq !== undefined) setJump((j) => ({ seq, id: (j?.id ?? 0) + 1 }));
  }, [seq]);

  const latest = useRef({ data, bubbles, people, state, t });
  latest.current = { data, bubbles, people, state, t };
  const nameOf = useCallback((person: PersonId | null) => {
    const { data: d, people: p, state: st, t: tr } = latest.current;
    if (person === null) return '';
    if (person === d.me) return tr('chat.you');
    return p.get(st?.aliases[person] ?? person)?.name ?? tr('chat.friendWhoLeft');
  }, []);
  const room: RoomValue = useMemo(
    () => ({
      farm,
      me: data.me,
      timeZone: state?.timeZone ?? null,
      visit,
      people,
      nameOf,
      bubbleAt: (s: number) => latest.current.bubbles.get(s) ?? null,
      reply: () => composer.current?.focus(),
      openMenu: (item, top) => {
        if (item.seq !== null) go.messageMenu(farm, item.seq, top);
      },
      toggleDew: (item) => {
        if (item.seq === null) return;
        const a = latest.current.data.actions;
        if (item.myDew !== null) void a.takeDewBack(item.myDew);
        else void a.dewdrop(item.seq);
      },
      retry: (item) => void latest.current.data.actions.retry(item),
      jumpTo: (s: number) => setJump((j) => ({ seq: s, id: (j?.id ?? 0) + 1 })),
      wave: (to) => void latest.current.data.actions.wave(to),
      sproutedFrom: (s) => sprouted(latest.current.data.events, latest.current.state, s),
      events: () => latest.current.data.events,
    }),
    [farm, data.me, state?.timeZone, visit, people, nameOf],
  );

  const voice = useVoiceRecorder((note) => void actions.voice(note, null));

  const dewdrop = useCallback(() => {
    void actions.dewdrop();
    toast.show(t('chat.composer.dewdropLeft'), 'dewdrop');
  }, [actions, toast, t]);
  useDeskKey('dewdrop', dewdrop);

  const editLast = () => {
    const mine = [...timeline]
      .reverse()
      .find((r): r is BubbleItem => r.type === 'bubble' && r.mine && r.seq !== null);
    if (!mine) return;
    if (!canEdit(mine, Date.now())) {
      toast.show(t('chat.composer.editClosed'));
      return;
    }
    setEditing(mine);
    composer.current?.edit(mine.body.kind === 'message' ? mine.body.text : '');
  };

  const dropped = async (files: globalThis.File[]) => {
    const { media, skipped } = await prepareDropped(files);
    if (skipped > 0) toast.show(t('platforms.drop.notPhotos'));
    if (media.length === 0) return;
    setToNewest((n) => n + 1);
    await upload.sendPrepared(farm, media).catch(() => toast.show(t('chat.composer.refused')));
  };

  const title = visit ? (peer?.name ?? t('chat.friendWhoLeft')) : (state?.name ?? '');
  const critters = state?.members.length ?? 0;
  const subtitle = visit
    ? outLine
    : [t('platforms.join.critters', { count: critters }), outLine].filter(Boolean).join(' · ');

  return (
    <RoomProvider value={room}>
      <DropZone
        who={visit ? (peer?.name ?? null) : null}
        season={state?.season.season ?? 'spring'}
        onDrop={(files) => void dropped(files)}
      >
        <View style={{ flex: 1, backgroundColor: palette.background }}>
          <View
            style={{
              height: 58,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 18,
              borderBottomWidth: 1,
              borderColor: palette.hairline,
            }}
          >
            <Txt
              variant="displayS"
              numberOfLines={1}
              style={{ fontSize: 18, lineHeight: 20, flexShrink: 0 }}
            >
              {title}
            </Txt>
            <Txt
              variant="caption"
              color={palette.secondary}
              numberOfLines={1}
              style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 15 }}
            >
              {subtitle}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <HeaderIcon icon="pin" label={t('chat.pins.title')} onPress={() => go.media(farm)} />
              <HeaderIcon icon="seeds" label={t('chat.room.seedBed')} onPress={go.seedBed} />
              <HeaderIcon
                icon="more"
                label={t('chat.room.more')}
                onPress={() =>
                  visit && peer
                    ? go.critter(farm, peer.person)
                    : router.push({ pathname: '/(tabs)/you/farm-settings', params: { farm } })
                }
              />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <TimelineList
              rows={timeline}
              now={data.now}
              older={data.older}
              loadOlder={() => void data.loadOlder()}
              topSpace={16}
              topFold={0}
              bottomSpace={8}
              scrollY={scrollY}
              jump={jump}
              toNewest={toNewest}
              top={null}
              bottom={
                typing.length > 0 ? (
                  <View style={{ marginTop: 12 }}>
                    <TypingLine people={typing} />
                  </View>
                ) : null
              }
            />
          </View>
          <RoomNotice notice={notice} />
          <DeskComposer
            ref={composer}
            farm={farm}
            state={state}
            disabled={(notice !== null && notice.blocksWriting) || writer === null}
            mic={<MicButton voice={voice} />}
            onTray={() => go.tray(farm)}
            onDewdrop={dewdrop}
            onEditLast={editLast}
            onTyping={() => undefined}
            onSend={(text) => {
              setToNewest((n) => n + 1);
              if (editing?.seq != null) void actions.edit(editing.seq, text);
              else void actions.sendText(text, null);
              setEditing(null);
            }}
          />
          <RecorderPanel
            voice={voice}
            me={state?.members.find((m) => m.person === data.me)?.critter ?? null}
            name={nameOf(data.me)}
            season={state?.season.season ?? 'spring'}
            bottomInset={0}
          />
        </View>
      </DropZone>
    </RoomProvider>
  );
}
