import type { Critter } from '@kithfield/contracts';
import { View } from 'react-native';

import { ArtIcon, ArtStill } from '../../ui/art/art-view';
import { sceneLook } from '../../ui/art/critter-look';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useAccessibilitySize } from '../../ui/type/accessibility-size';
import {
  AskText,
  CritterStack,
  FIRE_TEXT_MAX_SCALE,
  FireButton,
  FirePanel,
  GlassRound,
} from './fire-chrome';
import { FireTxt } from './fire-text';
import { fireLook, fireSize } from './look';
import type { DockState } from './room-model';

/*
 * The panel at the bottom of the fire room, for each moment: lighting the fire, pulling up a log,
 * sitting by it (listening, muted or talking), heading home, and the fire settling.
 */

/** "Your mic is off for Kithfield. Settings": the quiet way back once the mic or camera is off. */
export function DeniedNote({
  device,
  onSettings,
}: {
  readonly device: 'mic' | 'camera';
  readonly onSettings: () => void;
}) {
  const { t } = useLocale();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <FireTxt variant="caption" color={fireLook.sub} style={{ fontSize: 13, lineHeight: 17 }}>
        {t(device === 'mic' ? 'surfaces.ask.denied' : 'surfaces.ask.cameraDenied')}
      </FireTxt>
      <Press
        onPress={onSettings}
        darken={false}
        accessibilityRole="link"
        accessibilityLabel={t('surfaces.ask.settings')}
        hitSlop={12}
      >
        <FireTxt
          variant="caption"
          color={fireLook.text}
          style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}
        >
          {t('surfaces.ask.settings')}
        </FireTxt>
      </Press>
    </View>
  );
}

export function UnlitPanel({
  onLight,
  onNotTonight,
  busy,
}: {
  readonly onLight: () => void;
  readonly onNotTonight: () => void;
  readonly busy: boolean;
}) {
  const { t } = useLocale();
  return (
    <FirePanel gap={12}>
      <AskText
        eyebrow={t('fire.unlit.eyebrow')}
        title={t('fire.unlit.title')}
        body={t('fire.unlit.body')}
      />
      <FireButton
        label={t('fire.unlit.light')}
        icon="lantern"
        onPress={onLight}
        disabled={busy}
        testID="fire-light"
      />
      <FireButton
        label={t('fire.unlit.notTonight')}
        kind="secondary"
        height={fireSize.smallButton}
        onPress={onNotTonight}
      />
    </FirePanel>
  );
}

export function JoinPanel({
  you,
  onJoin,
  onListen,
  busy,
  micOff = false,
  onSettings,
}: {
  readonly you: string;
  readonly onJoin: () => void;
  readonly onListen: () => void;
  readonly busy: boolean;
  /** The mic is off for Kithfield: Join in becomes Just listen, with a quiet Settings link. */
  readonly micOff?: boolean;
  readonly onSettings?: () => void;
}) {
  const { t } = useLocale();
  return (
    <FirePanel gap={12}>
      <AskText
        eyebrow={t('fire.join.walking', { name: you })}
        title={t('fire.join.title')}
        body={t('fire.join.body')}
      />
      {micOff ? (
        <>
          <FireButton
            label={t('surfaces.ask.justListen')}
            icon="ear"
            onPress={onListen}
            disabled={busy}
            testID="fire-listen"
          />
          {onSettings ? <DeniedNote device="mic" onSettings={onSettings} /> : null}
        </>
      ) : (
        <>
          <FireButton
            label={t('fire.join.in')}
            icon="mic"
            onPress={onJoin}
            disabled={busy}
            testID="fire-join"
          />
          <FireButton
            label={t('fire.join.listen')}
            icon="ear"
            kind="secondary"
            onPress={onListen}
            disabled={busy}
            testID="fire-listen"
          />
        </>
      )}
    </FirePanel>
  );
}

export function LeavePanel({
  you,
  onWalk,
  onStay,
}: {
  readonly you: string;
  readonly onWalk: () => void;
  readonly onStay: () => void;
}) {
  const { t } = useLocale();
  return (
    <FirePanel gap={12}>
      <AskText title={t('fire.leave.title')} body={t('fire.leave.body', { name: you })} />
      <FireButton label={t('fire.leave.walk')} onPress={onWalk} testID="fire-walk-home" />
      <FireButton
        label={t('fire.leave.stay')}
        kind="secondary"
        height={fireSize.smallButton}
        onPress={onStay}
      />
    </FirePanel>
  );
}

export function QuietPanel({ onBack }: { readonly onBack: () => void }) {
  const { t } = useLocale();
  return (
    <FirePanel gap={12}>
      <AskText
        eyebrow={t('fire.quiet.eyebrow')}
        title={t('fire.quiet.title')}
        body={t('fire.quiet.body')}
      />
      <FireButton label={t('fire.quiet.back')} kind="secondary" onPress={onBack} />
    </FirePanel>
  );
}

export type GestureKind = 'wave' | 'dewdrop' | 'hug' | 'sticker';

const GESTURES = [
  { kind: 'wave', icon: 'wave', label: 'fire.gesture.wave' },
  { kind: 'dewdrop', icon: 'dewdrop', label: 'fire.gesture.dewdrop' },
  { kind: 'hug', icon: 'heart', label: 'fire.gesture.hug' },
] as const;

/** Wave, dewdrop, hug and a sticker: saying it without words. */
function GestureRow({
  critter,
  to,
  onGesture,
}: {
  readonly critter: Critter | null;
  readonly to: string | null;
  readonly onGesture: (kind: GestureKind) => void;
}) {
  const { t } = useLocale();
  // At the accessibility sizes a name takes two lines, held to twice its size so the dock doesn't
  // climb over the scene; the large content viewer shows it whole.
  const ax = useAccessibilitySize();
  const tile = {
    minHeight: fireSize.tile,
    borderRadius: 18,
    backgroundColor: fireLook.tile,
    alignItems: 'center',
    justifyContent: 'center',
  } as const;
  const said = (label: string) =>
    to === null ? label : `${label}, ${t('fire.gesture.to', { name: to })}`;
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      {GESTURES.map((g) => (
        <Press
          key={g.kind}
          onPress={() => onGesture(g.kind)}
          haptic="soft"
          radius={18}
          accessibilityRole="button"
          accessibilityLabel={said(t(g.label))}
          accessibilityShowsLargeContentViewer
          accessibilityLargeContentTitle={t(g.label)}
          style={[
            tile,
            { flex: 1, minWidth: 0, gap: 3, paddingHorizontal: 4 },
            ax ? { paddingVertical: 6 } : null,
          ]}
          testID={`fire-gesture-${g.kind}`}
        >
          <ArtIcon name={g.icon} size={22} color={fireLook.primaryInk} />
          <FireTxt
            variant="buttonSmall"
            color={fireLook.text}
            align="center"
            numberOfLines={ax ? 2 : 1}
            maxFontSizeMultiplier={FIRE_TEXT_MAX_SCALE}
            style={{ fontSize: 11.5, lineHeight: 13 }}
          >
            {t(g.label)}
          </FireTxt>
        </Press>
      ))}
      <Press
        onPress={() => onGesture('sticker')}
        haptic="soft"
        radius={18}
        accessibilityRole="button"
        accessibilityLabel={said(t('fire.gesture.sticker'))}
        style={[tile, { width: fireSize.tile }]}
      >
        {critter ? (
          <ArtStill
            scene="sticker"
            width={40}
            height={40}
            attrs={{ ...sceneLook(critter), pose: 'love' }}
          />
        ) : null}
      </Press>
    </View>
  );
}

export interface RoomDockProps {
  readonly state: DockState;
  /** Lanterns or a shared screen fill the room: the panel holds only its buttons. */
  readonly compact: boolean;
  readonly yourName: string;
  readonly yourCritter: Critter | null;
  readonly others: readonly { readonly id: string; readonly kind: string; readonly look: object }[];
  /** Someone's weak connection to explain, by name. */
  readonly weak: string | null;
  readonly gestureTo: string | null;
  readonly lantern: boolean;
  readonly sharing: boolean;
  readonly lookingAway: boolean;
  readonly busy: boolean;
  readonly onMic: () => void;
  readonly onLantern: () => void;
  readonly onHome: () => void;
  readonly onGesture: (kind: GestureKind) => void;
  readonly onStopSharing: () => void;
  readonly onFlipBack: () => void;
  /** Opens where the fire sounds (the route sheet). */
  readonly onSound: () => void;
  /** The mic or camera is off for Kithfield: a quiet Settings link under the buttons. */
  readonly denied: 'mic' | 'camera' | null;
  readonly onSettings: () => void;
}

/** The panel while you're by the fire. */
export function RoomDock(p: RoomDockProps) {
  const { t } = useLocale();
  const status =
    p.state === 'listening'
      ? { title: t('fire.dock.listening'), line: t('fire.dock.listeningLine') }
      : p.state === 'muted'
        ? { title: t('fire.dock.muted'), line: t('fire.dock.mutedLine') }
        : { title: t('fire.dock.talking'), line: t('fire.dock.talkingLine', { name: p.yourName }) };
  const micLabel =
    p.state === 'listening'
      ? t('fire.dock.unmuteToTalk')
      : p.state === 'muted'
        ? t('fire.dock.unmute')
        : t('fire.dock.mute');
  const mic = (
    <FireButton
      label={micLabel}
      icon={p.state === 'talking' ? 'muted' : 'mic'}
      kind={p.state === 'talking' ? 'secondary' : 'primary'}
      flex={p.state === 'listening' ? 1.4 : p.state === 'muted' ? 1.2 : 1}
      onPress={p.onMic}
      disabled={p.busy}
      testID="fire-mic"
    />
  );
  const lantern =
    p.state === 'listening' ? null : (
      <GlassRound
        label={p.lantern ? t('fire.dock.putOutLantern') : t('fire.dock.lightLantern')}
        onPress={p.onLantern}
        testID="fire-lantern"
      >
        <ArtIcon name="lantern" size={26} color={fireLook.primaryInk} />
      </GlassRound>
    );
  // Where the fire sounds: a small round beside who's here, so the dock's buttons keep their room.
  const sound = (
    <Press
      onPress={p.onSound}
      haptic="select"
      radius={18}
      accessibilityRole="button"
      accessibilityLabel={t('surfaces.route.title')}
      testID="fire-sound"
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fireLook.glass,
        borderWidth: 1,
        borderColor: fireLook.glassBorder,
      }}
    >
      <ArtIcon name="ear" size={20} color={fireLook.text} />
    </Press>
  );
  const home = (
    <FireButton
      label={t('fire.dock.headHome')}
      kind="secondary"
      flex={1}
      onPress={p.onHome}
      testID="fire-home"
    />
  );
  let buttons;
  if (p.sharing) {
    buttons = (
      <>
        <FireButton
          label={t('fire.dock.stopSharing')}
          kind="stop"
          flex={1}
          onPress={p.onStopSharing}
        />
        {mic}
      </>
    );
  } else if (p.lookingAway) {
    buttons = (
      <>
        <FireButton
          label={t('fire.dock.flipBack')}
          icon="camera"
          kind="secondary"
          flex={1}
          onPress={p.onFlipBack}
        />
        {mic}
        {home}
      </>
    );
  } else {
    buttons = (
      <>
        {mic}
        {lantern}
        {home}
      </>
    );
  }
  return (
    <FirePanel tight={p.weak !== null} gap={p.weak !== null ? 12 : 14}>
      {p.compact ? null : p.weak !== null ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 18,
            backgroundColor: fireLook.note,
          }}
          accessible
          accessibilityLiveRegion="polite"
        >
          <ArtIcon name="moon" size={22} color={fireLook.text} />
          <FireTxt
            variant="caption"
            color={fireLook.sub}
            multiline
            style={{ flex: 1, fontSize: 13.5, lineHeight: 18.9 }}
          >
            <FireTxt variant="caption" color={fireLook.text} style={{ fontWeight: '600' }}>
              {t('fire.weak.title', { name: p.weak })}
            </FireTxt>{' '}
            {t('fire.weak.body')}
          </FireTxt>
        </View>
      ) : (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View style={{ flex: 1, gap: 3 }} accessible accessibilityLiveRegion="polite">
            <FireTxt
              variant="rowTitle"
              color={fireLook.sub}
              style={{ fontSize: 13, lineHeight: 15 }}
            >
              {status.title}
            </FireTxt>
            <FireTxt
              variant="handL"
              color={fireLook.text}
              multiline
              style={{ fontSize: 19, lineHeight: 20.9 }}
            >
              {status.line}
            </FireTxt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {sound}
            <CritterStack people={p.others} />
          </View>
        </View>
      )}
      {!p.compact && p.weak === null && p.state === 'muted' ? (
        <GestureRow critter={p.yourCritter} to={p.gestureTo} onGesture={p.onGesture} />
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: p.state === 'listening' ? 12 : 10,
        }}
      >
        {buttons}
      </View>
      {p.denied ? <DeniedNote device={p.denied} onSettings={p.onSettings} /> : null}
    </FirePanel>
  );
}
