/**
 * Tweaks are the props a design file declares in its `<script data-dc-script data-props="…">`
 * (an enum like `season`, booleans like `night`). The renderer reads them from the file, renders
 * every combination, and keeps a variant only where it changes a screen's pixels.
 */

export type TweakValue = string | number | boolean;

export interface Tweak {
  name: string;
  /** Every value the tweak can take; the first is not necessarily the default. */
  values: TweakValue[];
  default: TweakValue;
  /**
   * The file's own default lays every option out side by side (`both`); renders take one option
   * at a time instead, so the page is set to `default` before anything is captured.
   */
  pinned?: true;
}

/** The enum option that shows every other option at once. */
const SIDE_BY_SIDE = 'both';

export interface Variant {
  /** File-name suffix, e.g. `night`, `winter`, `winter.night`; empty for the defaults. */
  suffix: string;
  /** The full prop set to apply (the design runtime replaces, not merges, overrides). */
  props: Record<string, TweakValue>;
  /** The tweaks this variant moves away from their default, in declaration order. */
  changed: string[];
}

/**
 * Tweaks that only switch animation on or off. Renders already freeze every animation at one
 * frame, so a variant for these would only show a different instant, not a different design.
 */
export const ANIMATION_ONLY_TWEAKS: readonly string[] = ['motion'];

const ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" };

/** Decodes the HTML entities used inside attribute values. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X'))
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function isValue(v: unknown): v is TweakValue {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

/** Reads the tweak declarations from a `.dc.html` source. Unknown editors are ignored. */
export function readTweaks(html: string): Tweak[] {
  const tag = /<script\b[^>]*\bdata-dc-script\b[^>]*>/i.exec(html)?.[0];
  const raw = tag && /\bdata-props="([^"]*)"/i.exec(tag)?.[1];
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeEntities(raw));
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const tweaks: Tweak[] = [];
  for (const [name, meta] of Object.entries(parsed as Record<string, unknown>)) {
    if (name.startsWith('$') || !meta || typeof meta !== 'object') continue;
    const { editor, options, default: def } = meta as Record<string, unknown>;
    if (editor === 'boolean') {
      const d = typeof def === 'boolean' ? def : false;
      tweaks.push({ name, values: [d, !d], default: d });
    } else if (editor === 'enum' && Array.isArray(options)) {
      const all = options.filter(isValue);
      const pinned = def === SIDE_BY_SIDE && all.length > 2;
      const values = pinned ? all.filter((v) => v !== SIDE_BY_SIDE) : all;
      const first = values[0];
      if (first === undefined) continue;
      if (pinned) tweaks.push({ name, values, default: first, pinned });
      else
        tweaks.push({ name, values, default: isValue(def) && values.includes(def) ? def : first });
    }
  }
  return tweaks;
}

/** The suffix part for one tweak away from its default: the enum value, or the boolean's name. */
export function suffixPart(tweak: Tweak, value: TweakValue): string {
  if (typeof value === 'boolean') return value ? tweak.name : `no-${tweak.name}`;
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

/** Every combination of the visual tweaks, defaults first. */
export function tweakVariants(
  tweaks: readonly Tweak[],
  skip: readonly string[] = ANIMATION_ONLY_TWEAKS,
): Variant[] {
  const visual = tweaks.filter((t) => !skip.includes(t.name));
  const defaults = Object.fromEntries(tweaks.map((t) => [t.name, t.default]));
  let variants: Variant[] = [{ suffix: '', props: defaults, changed: [] }];
  for (const tweak of visual) {
    const next: Variant[] = [];
    for (const base of variants) {
      for (const value of tweak.values) {
        if (value === tweak.default) {
          next.push(base);
          continue;
        }
        const part = suffixPart(tweak, value);
        next.push({
          suffix: base.suffix ? `${base.suffix}.${part}` : part,
          props: { ...base.props, [tweak.name]: value },
          changed: [...base.changed, tweak.name],
        });
      }
    }
    variants = next;
  }
  return variants.sort((a, b) => a.changed.length - b.changed.length);
}

/**
 * The variants a combination must differ from to be worth keeping: the defaults and every
 * variant that moves a strict subset of its tweaks (with the same values).
 */
export function parentVariants(variant: Variant, all: readonly Variant[]): Variant[] {
  return all.filter(
    (other) =>
      other.changed.length < variant.changed.length &&
      other.changed.every((name) => variant.props[name] === other.props[name]),
  );
}
