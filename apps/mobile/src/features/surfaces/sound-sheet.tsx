import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { surfaces, type AudioRoute } from '../../../modules/surfaces';
import { ArtIcon } from '../../ui/art/art-view';
import { useToast } from '../../ui/components/toast';
import { useLocale } from '../../ui/locale/locale-provider';
import { Press } from '../../ui/motion/press';
import { useTheme } from '../../ui/theme/theme-provider';
import { Txt } from '../../ui/type/text';
import { headsetGone, routeRows, type RouteRow } from './audio-route';

const ICON = { bluetooth: 'ear', wired: 'ear', iphone: 'more', speaker: 'bell', airplay: 'people' };

/** The route now, and as it changes; null where the native surfaces aren't built in. */
function useAudioRoute(): AudioRoute | null {
  const [route, setRoute] = useState<AudioRoute | null>(() => surfaces?.audioRoute() ?? null);
  useEffect(() => {
    if (surfaces === null) return;
    const sub = surfaces.addListener('onAudioRoute', (event) => setRoute(event));
    return () => sub.remove();
  }, []);
  return route;
}

/**
 * Where the fire sounds: the person's headsets, the earpiece, the speaker, and AirPlay (listen
 * only). A tap moves the room there.
 */
export function SoundSheet() {
  const { t } = useLocale();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const route = useAudioRoute();
  const rows = route ? routeRows(route) : [];

  const subtitle = (row: RouteRow) => {
    if (row.kind === 'bluetooth' || row.kind === 'wired') {
      return row.current
        ? `${t('surfaces.route.connected')} · ${t('surfaces.route.micOn', { name: row.name })}`
        : t('surfaces.route.connected');
    }
    if (row.kind === 'iphone') return t('surfaces.route.earpiece');
    if (row.kind === 'speaker') return t('surfaces.route.speakerNote');
    return t('surfaces.route.airplay');
  };
  const title = (row: RouteRow) => {
    if (row.kind === 'iphone') return t('surfaces.route.iphone');
    if (row.kind === 'speaker') return t('surfaces.route.speaker');
    if (row.kind === 'airplay' && row.name === '') return t('surfaces.route.more');
    return row.name;
  };
  const choose = (row: RouteRow) => {
    if (surfaces === null) return;
    void (row.kind === 'airplay' ? surfaces.showAirPlayPicker() : surfaces.setAudioRoute(row.id));
  };

  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Math.max(34, insets.bottom),
        gap: 6,
      }}
    >
      <Txt variant="displayM" style={{ fontSize: 24, lineHeight: 26.4 }} accessibilityRole="header">
        {t('surfaces.route.title')}
      </Txt>
      {rows.map((row) => (
        <Press
          key={row.id}
          onPress={() => choose(row)}
          darken={false}
          accessibilityLabel={`${title(row)}, ${subtitle(row)}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 11,
            borderBottomWidth: 1,
            borderBottomColor: palette.hairline,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: row.current ? palette.go.bg : palette.fillSecondary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArtIcon
              name={ICON[row.kind]}
              size={22}
              color={row.current ? palette.go.fg : palette.text}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="rowTitle" style={{ fontSize: 15.5, lineHeight: 18.6 }}>
              {title(row)}
            </Txt>
            <Txt
              variant="caption"
              color={palette.secondary}
              style={{ fontSize: 13, lineHeight: 17 }}
            >
              {subtitle(row)}
            </Txt>
          </View>
          {row.current ? <ArtIcon name="check" size={20} color={palette.go.bg} /> : null}
        </Press>
      ))}
      <Txt
        variant="caption"
        multiline
        color={palette.secondary}
        style={{ fontSize: 13, lineHeight: 18.85, marginTop: 6 }}
      >
        {t('surfaces.route.footer')}
      </Txt>
    </View>
  );
}

/**
 * While the fire room is open: says where the room now sounds (a 2-second note in the farm's
 * voice) and tells the room when a headset went away, so it pauses the mic, not the room.
 */
export function useAudioRouteNotes(onHeadsetGone: () => void): void {
  const { t } = useLocale();
  const toast = useToast();
  const gone = useRef(onHeadsetGone);
  gone.current = onHeadsetGone;
  useEffect(() => {
    if (surfaces === null) return;
    let before = surfaces.audioRoute().output.kind;
    const sub = surfaces.addListener('onAudioRoute', (event) => {
      if (headsetGone(event, before)) {
        gone.current();
        toast.show(t('surfaces.route.micPaused'), 'ear');
      } else if (event.reason === 'new' && event.output.name !== '') {
        toast.show(t('surfaces.route.nowIn', { name: event.output.name }), 'ear');
      }
      before = event.output.kind;
    });
    return () => sub.remove();
  }, [t, toast]);
}
