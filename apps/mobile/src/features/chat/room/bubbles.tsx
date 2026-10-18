import type { LinkPayload, MediaPayload, MediaRef, StickerPayload } from '@kithfield/contracts';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ArtIcon } from '../../../ui/art/art-view';
import { useLocale } from '../../../ui/locale/locale-provider';
import { Press } from '../../../ui/motion/press';
import { useTheme } from '../../../ui/theme/theme-provider';
import { Txt } from '../../../ui/type/text';
import { MediaImage } from '../../media';
import { sceneOfSticker, StickerArt, type StickerPerson } from '../../stickers';
import { clock } from '../model/format';
import { siteOf } from '../model/media';
import { segmentsOf } from '../model/mentions';
import type { BubbleItem } from '../model/timeline';
import { go } from '../routes';
import { useChatColours } from '../ui/chat-colours';
import { FileBubble } from './gesture-seams';
import { useRoom } from './room-context';
import { VoiceBubble } from './voice-bubble';

/** 262 points of words, as the design sets them, plus the bubble's own padding. */
export const BUBBLE_MAX = 290;
const R = 20;
const TAIL = 6;

/** The bubble's own shape: theirs with the tail at the bottom left, yours at the bottom right. */
export function BubbleShell({
  item,
  padded = true,
  width,
  children,
}: {
  readonly item: BubbleItem;
  readonly padded?: boolean;
  readonly width?: number;
  readonly children: ReactNode;
}) {
  const { palette } = useTheme();
  const b = palette.bubble;
  const failed = item.delivery === 'failed';
  const mine = item.mine && !failed;
  return (
    <View
      style={[
        {
          maxWidth: width ?? BUBBLE_MAX,
          ...(width ? { width } : {}),
          borderRadius: R,
          overflow: 'hidden',
          ...(padded ? { paddingVertical: 10, paddingHorizontal: 14 } : {}),
        },
        item.mine ? { borderBottomRightRadius: TAIL } : { borderBottomLeftRadius: TAIL },
        failed
          ? { backgroundColor: palette.card, borderWidth: 1.5, borderColor: b.failedBorder }
          : mine
            ? { backgroundColor: b.yoursBg }
            : { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.cardBorder },
        item.delivery === 'sending' ? { opacity: 0.6 } : null,
      ]}
    >
      {children}
    </View>
  );
}

/** Words with "@Name" marked, in the bubble's ink. */
export function Words({ text, item }: { readonly text: string; readonly item: BubbleItem }) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { nameOf } = useRoom();
  const ink = item.mine && item.delivery !== 'failed' ? palette.bubble.yoursFg : palette.text;
  const names = item.mentions.map((p) => nameOf(p));
  return (
    <Txt variant="bubble" multiline color={ink}>
      {segmentsOf(text, names).map((s, i) =>
        s.mention ? (
          <Txt
            key={i}
            variant="bubble"
            color={item.mine && item.delivery !== 'failed' ? ink : colours.mentionFg}
            style={{
              fontWeight: '600',
              backgroundColor:
                item.mine && item.delivery !== 'failed' ? colours.mentionMineBg : colours.mentionBg,
            }}
          >
            {s.text}
          </Txt>
        ) : (
          s.text
        ),
      )}
    </Txt>
  );
}

/** The message a reply answers, quoted at the top of its bubble. */
export function ReplyQuote({ seq, mine }: { readonly seq: number; readonly mine: boolean }) {
  const colours = useChatColours();
  const { t } = useLocale();
  const { bubbleAt, nameOf, jumpTo } = useRoom();
  const target = bubbleAt(seq);
  const name = target ? nameOf(target.actor) : '';
  const said =
    target === null
      ? t('chat.bubble.original')
      : target.body.kind === 'message' || target.body.kind === 'quiet_note'
        ? target.body.text
        : target.body.kind === 'voice'
          ? t('chat.what.voice', { duration: clock(target.body.voice.durationMs) })
          : target.body.kind === 'link'
            ? (target.body.link.preview?.title ?? target.body.link.url)
            : target.body.kind === 'media'
              ? t('chat.what.photo')
              : t('chat.what.sticker');
  return (
    <Press
      onPress={() => jumpTo(seq)}
      darken={false}
      accessibilityLabel={`${t('chat.bubble.replyTo', { name })}: ${said}`}
      style={{
        borderRadius: 12,
        backgroundColor: mine ? colours.quoteMineBg : colours.quoteBg,
        paddingVertical: 7,
        paddingHorizontal: 10,
        gap: 2,
      }}
    >
      {name !== '' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <ArtIcon name="reply" size={13} color={mine ? colours.onMoss : colours.quoteName} />
          <Txt variant="bubbleName" color={mine ? colours.onMoss : colours.quoteName}>
            {name}
          </Txt>
        </View>
      ) : null}
      <Txt
        variant="rowSubtitle"
        numberOfLines={1}
        color={mine ? colours.onMoss : colours.quoteText}
      >
        {said}
      </Txt>
    </Press>
  );
}

function TextBubble({ item, text }: { readonly item: BubbleItem; readonly text: string }) {
  if (item.replyTo === null) {
    return (
      <BubbleShell item={item}>
        <Words text={text} item={item} />
      </BubbleShell>
    );
  }
  return (
    <BubbleShell item={item} padded={false}>
      <View style={{ paddingTop: 8, paddingHorizontal: 8, paddingBottom: 10 }}>
        <ReplyQuote seq={item.replyTo} mine={item.mine && item.delivery !== 'failed'} />
        <View style={{ marginTop: 6, paddingHorizontal: 6 }}>
          <Words text={text} item={item} />
        </View>
      </View>
    </BubbleShell>
  );
}

/** A quiet note: lined paper tilted a little, headed "no reply needed" in the hand face. */
function QuietBubble({ item, text }: { readonly item: BubbleItem; readonly text: string }) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const { nameOf } = useRoom();
  const b = palette.bubble;
  return (
    <View
      style={{
        maxWidth: 270,
        paddingTop: 10,
        paddingBottom: 12,
        paddingHorizontal: 14,
        borderRadius: 18,
        borderTopLeftRadius: TAIL,
        backgroundColor: b.quietBg,
        borderWidth: 1,
        borderColor: palette.cardBorder,
        transform: [{ rotate: '-0.6deg' }],
        boxShadow: colours.quietShadow,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: 12 }, (_, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: (i + 1) * 22 - 1,
            height: 1,
            backgroundColor: b.quietRule,
          }}
        />
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <ArtIcon name="note" size={16} color={palette.text} />
        <Txt variant="quietHead" color={b.quietHead}>
          {t('shell.bubble.quietNote', { name: nameOf(item.actor) })}
        </Txt>
      </View>
      <Txt variant="bubble" multiline style={{ lineHeight: 22 }}>
        {text}
      </Txt>
    </View>
  );
}

function MediaTile({
  item,
  media: ref,
  index,
  width,
  height,
}: {
  readonly item: BubbleItem;
  readonly media: MediaRef;
  readonly index: number;
  readonly width: number;
  readonly height: number;
}) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const { farm } = useRoom();
  const video = ref.mime.startsWith('video/');
  return (
    <Press
      onPress={() => {
        if (item.seq !== null) go.viewer(farm, item.seq, index);
      }}
      darken={false}
      accessibilityLabel={video ? t('chat.bubble.openVideo') : t('chat.bubble.openMedia')}
      style={{ width, height, backgroundColor: palette.fillSoft }}
    >
      {video || ref.key === '' ? null : <MediaImage mediaKey={ref.key} style={{ width, height }} />}
      {video ? (
        <View
          style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colours.mediaScrim,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArtIcon name="play" size={18} color={colours.onMedia} />
          </View>
        </View>
      ) : null}
    </Press>
  );
}

const isVisual = (ref: MediaRef) => ref.mime.startsWith('image/') || ref.mime.startsWith('video/');

function MediaBubble({ item, media }: { readonly item: BubbleItem; readonly media: MediaPayload }) {
  // Photos and video in a grid, by their place in the message (the viewer counts them so).
  const visual = media.items.map((ref, index) => ({ ref, index })).filter((m) => isVisual(m.ref));
  const files = media.items.filter((ref) => !isVisual(ref));
  const shown = visual.slice(0, 4);
  const single = shown.length === 1;
  const first = shown[0]?.ref;
  const w = 206;
  // The bubble's hairline sits inside its width.
  const inner = w - 2;
  const h =
    single && first?.width && first.height
      ? Math.min(260, Math.max(110, (w * first.height) / first.width))
      : 132;
  return (
    <BubbleShell item={item} padded={false} width={w}>
      {files.map((ref) => (
        <FileBubble
          key={ref.key || ref.name}
          name={ref.name ?? ''}
          mime={ref.mime}
          bytes={ref.bytes}
          mine={item.mine}
          mediaKey={ref.key}
        />
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
        {shown.map(({ ref, index }) => (
          <MediaTile
            key={ref.key || String(index)}
            item={item}
            media={ref}
            index={index}
            width={single ? inner : (inner - 2) / 2}
            height={single ? h : shown.length === 2 ? 132 : 102}
          />
        ))}
      </View>
      {media.caption ? (
        <View style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
          <Words text={media.caption} item={item} />
        </View>
      ) : null}
    </BubbleShell>
  );
}

function LinkBubble({ item, link }: { readonly item: BubbleItem; readonly link: LinkPayload }) {
  const { palette } = useTheme();
  const colours = useChatColours();
  const { t } = useLocale();
  const { farm } = useRoom();
  const image = link.preview?.image?.key ?? null;
  const site = link.preview?.site ?? siteOf(link.url);
  const words = link.text && link.text.trim() !== link.url ? link.text : null;
  const inkMine = item.mine && item.delivery !== 'failed';
  return (
    <View style={{ gap: 4, alignItems: item.mine ? 'flex-end' : 'flex-start' }}>
      {words ? (
        <BubbleShell item={item}>
          <Words text={words} item={item} />
        </BubbleShell>
      ) : null}
      <View
        style={{
          width: 250,
          borderRadius: R,
          ...(item.mine ? { borderBottomRightRadius: TAIL } : { borderBottomLeftRadius: TAIL }),
          overflow: 'hidden',
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.cardBorder,
          opacity: item.delivery === 'sending' ? 0.6 : 1,
        }}
      >
        <Press
          onPress={() => void WebBrowser.openBrowserAsync(link.url)}
          darken={false}
          accessibilityRole="link"
          accessibilityLabel={`${link.preview?.title ?? link.url}, ${site}`}
        >
          {image !== null ? (
            <MediaImage mediaKey={image} style={{ width: 250, height: 104 }} />
          ) : null}
          <View
            style={{
              paddingTop: 10,
              paddingHorizontal: 12,
              paddingBottom: inkMine ? 12 : 4,
              gap: 3,
            }}
          >
            <Txt variant="planTitle" multiline style={{ fontSize: 15 }}>
              {link.preview?.title ?? link.url}
            </Txt>
            {link.preview?.description ? (
              <Txt
                variant="caption"
                color={palette.secondary}
                numberOfLines={2}
                style={{ fontSize: 13 }}
              >
                {link.preview.description}
              </Txt>
            ) : null}
            <Txt variant="caption" color={palette.secondary} style={{ fontSize: 12, marginTop: 2 }}>
              {site}
            </Txt>
          </View>
        </Press>
        {!item.mine && item.seq !== null ? (
          <View
            style={{
              flexDirection: 'row',
              paddingHorizontal: 12,
              paddingBottom: 12,
              paddingTop: 6,
            }}
          >
            <Press
              onPress={() => {
                if (item.seq !== null) go.plantPlan(farm, item.seq);
              }}
              radius={15}
              accessibilityLabel={t('chat.bubble.planAction')}
              style={{
                height: 30,
                paddingLeft: 6,
                paddingRight: 12,
                borderRadius: 15,
                backgroundColor: colours.mentionBg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <ArtIcon name="seed" size={22} color={colours.mentionFg} />
              <Txt variant="buttonSmall" color={colours.mentionFg} style={{ fontSize: 13 }}>
                {t('chat.bubble.planAction')}
              </Txt>
            </Press>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function StickerBubble({
  item,
  sticker,
}: {
  readonly item: BubbleItem;
  readonly sticker: StickerPayload;
}) {
  const { t } = useLocale();
  const { people, bubbleAt, nameOf } = useRoom();
  // Everyone drawn as they look now; anyone the phone can't find is left out.
  const personOf = (id: string | null): StickerPerson | null => {
    const p = id === null ? undefined : people.get(id);
    return p?.critter ? { name: p.name, critter: p.critter } : null;
  };
  const replied = item.replyTo === null ? null : bubbleAt(item.replyTo);
  const attrs = sceneOfSticker(
    t,
    sticker,
    personOf(item.actor),
    personOf,
    replied ? nameOf(replied.actor) : null,
  );
  return <StickerArt attrs={attrs} size={100} />;
}

/** The body of a bubble, by kind. */
export function BubbleBody({ item }: { readonly item: BubbleItem }) {
  const body = item.body;
  switch (body.kind) {
    case 'message':
      return <TextBubble item={item} text={body.text} />;
    case 'quiet_note':
      return <QuietBubble item={item} text={body.text} />;
    case 'media':
      return <MediaBubble item={item} media={body.media} />;
    case 'voice':
      return (
        <BubbleShell item={item} padded={false}>
          <VoiceBubble item={item} voice={body.voice} />
        </BubbleShell>
      );
    case 'link':
      return <LinkBubble item={item} link={body.link} />;
    case 'sticker':
      return <StickerBubble item={item} sticker={body.sticker} />;
  }
}
