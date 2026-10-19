import type { SurfaceFarm, SurfacePerson } from '@kithfield/contracts';
import { day, fonts, fireRoom, night } from '@kithfield/theme';
import { FlexWidget, ImageWidget, OverlapWidget, TextWidget } from 'react-native-android-widget';

import { imageNames, litMask } from '../../surfaces/names';
import { planLabel, type WidgetCopy } from './widget-copy';
import { litKinds, titleOf, type WidgetState } from './widget-state';

/*
 * The home-screen widgets (`14 Platforms`, 14-08), drawn from the same files as the iOS widgets:
 * the farm at night with who's up (4×2), the next plan or the fire (2×2), and quick dewdrops
 * (2×2). Static frames: Android redraws them when the app writes, and every half hour.
 */

type Hex = `#${string}`;

/** The design's widget corner. */
const RADIUS = 28;
/** Moonlight over the night art, and its quieter line. */
const MOON = night.moon as Hex;
const MOON_SOFT: Hex = `${MOON}BF`;
const KICKER: Hex = `${MOON}CC`;

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A widget's whole box, rounded, opening `uri`. */
function Frame({
  uri,
  label,
  background,
  children,
}: {
  readonly uri: string | null;
  readonly label: string;
  readonly background: Hex;
  readonly children: React.ReactNode;
}) {
  return (
    <OverlapWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        borderRadius: RADIUS,
        backgroundColor: background,
        overflow: 'hidden',
      }}
      accessibilityLabel={label}
      {...(uri !== null ? { clickAction: 'OPEN_URI', clickActionData: { uri } } : {})}
    >
      {children}
    </OverlapWidget>
  );
}

/** The art, filling the widget. */
function Still({ src, size }: { readonly src: `data:image${string}` | null; readonly size: Size }) {
  if (src === null) return null;
  return (
    <ImageWidget
      image={src}
      imageWidth={size.width}
      imageHeight={size.height}
      resizeMode="cover"
      style={{ width: 'match_parent', height: 'match_parent' }}
    />
  );
}

/** The small capitals in the top corner. */
function Kicker({ text, size = 12 }: { readonly text: string; readonly size?: number }) {
  return (
    <TextWidget
      text={text.toLocaleUpperCase()}
      maxLines={1}
      truncate="END"
      style={{ fontSize: size, color: KICKER, letterSpacing: 0.04, fontWeight: '500' }}
    />
  );
}

/** "fire's lit", with the lantern, on a chip of night sky. */
function FireChip({
  copy,
  lantern,
}: {
  readonly copy: WidgetCopy;
  readonly lantern: string | null;
}) {
  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexGap: 6,
        height: 26,
        paddingHorizontal: 10,
        borderRadius: 13,
        backgroundColor: '#1B1F3D59',
      }}
    >
      {lantern !== null ? (
        <ImageWidget image={lantern as `data:image${string}`} imageWidth={16} imageHeight={16} />
      ) : null}
      <TextWidget
        text={copy.t('surfaces.native.widget.firesLit')}
        style={{ fontSize: 12, fontWeight: '600', color: fireRoom.glyph }}
      />
    </FlexWidget>
  );
}

/** The friends by the fire as the widgets name them: the first two, and "you" for this person. */
function fireNames(fire: NonNullable<SurfaceFarm['fire']>, me: string | null, copy: WidgetCopy) {
  return fire.people
    .map((p: SurfacePerson) => (p.person === me ? copy.t('surfaces.native.you') : p.name))
    .filter((n): n is string => n !== null)
    .slice(0, 2);
}

function fireLine(fire: NonNullable<SurfaceFarm['fire']>, me: string | null, copy: WidgetCopy) {
  const names = fireNames(fire, me, copy);
  if (names.length === 0) return copy.t('surfaces.native.widget.fireLitTitle');
  if (fire.people.length === 1 && fire.people[0]?.person === me) {
    return copy.t('surfaces.native.widget.youByTheFire');
  }
  return copy.t('surfaces.native.widget.byTheFire', {
    names: copy.list(names),
    count: names.length,
  });
}

/** Who is up and who is asleep, by their windows. */
export function upAndAsleep(
  farm: SurfaceFarm,
  now: number,
  copy: WidgetCopy,
): [string, string | null] {
  const lit = litKinds(farm, now);
  const named = (c: SurfaceFarm['critters'][number]) => c.name;
  const up = farm.critters.filter((c) => lit.has(c.critter.species)).map(named);
  const asleep = farm.critters.filter((c) => !lit.has(c.critter.species)).map(named);
  const upNames = up.filter((n): n is string => n !== null);
  const asleepNames = asleep.filter((n): n is string => n !== null);
  if (upNames.length === 0) return [copy.t('surfaces.native.widget.allAsleep'), null];
  return [
    copy.t('surfaces.native.widget.up', { names: copy.list(upNames), count: upNames.length }),
    asleepNames.length === 0
      ? null
      : copy.t('surfaces.native.widget.asleep', {
          names: copy.list(asleepNames),
          count: asleepNames.length,
        }),
  ];
}

const fireLink = (link: string) => link.replace('to=farm', 'to=fire');
const planLink = (link: string, seed: number) =>
  `${link.replace('to=farm', 'to=plan')}&seed=${seed}`;

/** Before the app has written anything: a quiet line on the night panel. */
function Empty({ copy }: { readonly copy: WidgetCopy }) {
  return (
    <Frame uri={null} label={copy.t('surfaces.native.widget.empty')} background={night.panel}>
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
        clickAction="OPEN_APP"
      >
        <TextWidget
          text={copy.t('surfaces.native.widget.empty')}
          style={{ fontSize: 13, fontWeight: '500', color: MOON, textAlign: 'center' }}
        />
      </FlexWidget>
    </Frame>
  );
}

export interface WidgetProps {
  readonly state: WidgetState;
  readonly farm: SurfaceFarm | null;
  readonly copy: WidgetCopy;
  readonly size: Size;
  readonly now: number;
}

/** 4×2: the farm at night with its lit windows, or by the fire while it's lit. */
export function FarmWidget({ state, farm, copy, size, now }: WidgetProps) {
  if (farm === null) return <Empty copy={copy} />;
  const lit = litKinds(farm, now);
  const art =
    farm.fire !== null
      ? (state.image(imageNames.mediumFire(farm.farm)) ?? state.image(farm.images.night))
      : (state.image(imageNames.medium(farm.farm, litMask(lit))) ?? state.image(farm.images.night));
  const [first, second] =
    farm.fire !== null
      ? [fireLine(farm.fire, state.me, copy), copy.t('surfaces.native.widget.comeSit')]
      : upAndAsleep(farm, now, copy);
  return (
    <Frame
      uri={farm.fire !== null ? fireLink(farm.link) : farm.link}
      label={`${titleOf(farm)}. ${first}`}
      background={night.panel}
    >
      <Still src={art} size={size} />
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          flexDirection: 'column',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 14,
        }}
      >
        <FlexWidget
          style={{
            width: 'match_parent',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Kicker text={titleOf(farm)} />
          {farm.fire !== null ? (
            <FireChip copy={copy} lantern={state.image(imageNames.icon('lantern'))} />
          ) : null}
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column', flexGap: 2 }}>
          <TextWidget
            text={first}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 19, fontFamily: fonts.hand, color: MOON }}
          />
          {second !== null ? (
            <TextWidget
              text={second}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 12, color: MOON_SOFT }}
            />
          ) : null}
        </FlexWidget>
      </FlexWidget>
    </Frame>
  );
}

/** 2×2: the fire, or the next plan, over the little fire. */
export function NextPlanWidget({ state, farm, copy, size }: WidgetProps) {
  if (farm === null) return <Empty copy={copy} />;
  const plan = farm.nextPlan;
  const kicker =
    farm.fire !== null
      ? copy.t('surfaces.native.widget.byTheFireLabel')
      : plan !== null
        ? planLabel(plan.date, plan.from, copy.lang)
        : titleOf(farm);
  const names = farm.fire !== null ? fireNames(farm.fire, state.me, copy) : [];
  const title =
    farm.fire !== null
      ? names.length === 0
        ? copy.t('surfaces.native.widget.fireLitTitle')
        : copy.list(names)
      : (plan?.title ?? copy.t('surfaces.native.widget.noPlan'));
  const uri =
    farm.fire !== null
      ? fireLink(farm.link)
      : plan !== null
        ? planLink(farm.link, plan.seed)
        : farm.link;
  return (
    <Frame uri={uri} label={`${kicker}. ${title}`} background={night.panel}>
      <Still
        src={
          state.image(imageNames.smallFire(farm.season.season)) ?? state.image(farm.images.night)
        }
        size={size}
      />
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          flexDirection: 'column',
          flexGap: 4,
          padding: 14,
        }}
      >
        <Kicker text={kicker} size={11} />
        <TextWidget
          text={title}
          maxLines={2}
          truncate="END"
          style={{ fontSize: 17, fontFamily: fonts.hand, color: MOON }}
        />
      </FlexWidget>
    </Frame>
  );
}

/** A row of the dewdrop widget: a farm (or a visit) someone can leave a dewdrop on. */
export interface DewdropRow {
  readonly farm: string;
  readonly name: string;
  readonly image: string | null;
}

/** The farms the dewdrop widget offers: the newest few, each by its friend or name. */
export function dewdropRows(state: WidgetState, max = 2): DewdropRow[] {
  const farms = [...(state.data?.farms ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
  const rows: DewdropRow[] = [];
  for (const farm of farms) {
    const friend =
      farm.with ??
      [...farm.critters]
        .filter((c) => c.person !== state.me)
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0] ??
      null;
    const name = farm.with?.name ?? farm.name ?? friend?.name ?? null;
    if (name === null) continue;
    // A farm with nobody else on it yet shows its own still.
    rows.push({ farm: farm.farm, name, image: friend !== null ? friend.image : farm.images.day });
    if (rows.length === max) break;
  }
  return rows;
}

/** 2×2: a dewdrop for a friend in one tap, on paper. */
export function DewdropWidget({
  state,
  copy,
  dark,
  left,
}: Omit<WidgetProps, 'farm' | 'now'> & {
  readonly dark: boolean;
  /** Farms a dewdrop was just left on from here: their drop shows as left. */
  readonly left: ReadonlySet<string>;
}) {
  const rows = dewdropRows(state);
  const ink = (dark ? night.moon : day.ink) as Hex;
  const soft = (dark ? night.dim : day.ink3) as Hex;
  const drop = state.image(imageNames.icon(dark ? 'dewdrop-night' : 'dewdrop'));
  const check = state.image(imageNames.icon('left'));
  return (
    <Frame
      uri={null}
      label={copy.t('android.widget.dewdrop.title')}
      background={dark ? night.panel : '#FBF6EE'}
    >
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          flexDirection: 'column',
          flexGap: 8,
          padding: 14,
        }}
      >
        <TextWidget
          text={copy.t('android.widget.dewdrop.title')}
          style={{ fontSize: 12, fontWeight: '500', color: soft }}
        />
        {rows.length === 0 ? (
          <TextWidget
            text={copy.t('android.widget.dewdrop.empty')}
            maxLines={4}
            style={{ fontSize: 13, color: soft }}
          />
        ) : (
          rows.map((row) => (
            <FlexWidget
              key={row.farm}
              clickAction="DEWDROP"
              clickActionData={{ farm: row.farm }}
              accessibilityLabel={copy.t('android.widget.dewdrop.row', { name: row.name })}
              style={{
                width: 'match_parent',
                flexDirection: 'row',
                alignItems: 'center',
                flexGap: 8,
              }}
            >
              {row.image !== null && state.image(row.image) !== null ? (
                <ImageWidget
                  image={state.image(row.image) as `data:image${string}`}
                  imageWidth={32}
                  imageHeight={32}
                  radius={16}
                  resizeMode="cover"
                />
              ) : (
                <FlexWidget
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: soft }}
                />
              )}
              <FlexWidget style={{ flex: 1 }}>
                <TextWidget
                  text={row.name}
                  maxLines={1}
                  truncate="END"
                  style={{ fontSize: 14, fontWeight: '500', color: ink }}
                />
              </FlexWidget>
              {(left.has(row.farm) ? check : drop) !== null ? (
                <ImageWidget
                  image={(left.has(row.farm) ? check : drop) as `data:image${string}`}
                  imageWidth={24}
                  imageHeight={24}
                />
              ) : null}
            </FlexWidget>
          ))
        )}
      </FlexWidget>
    </Frame>
  );
}
