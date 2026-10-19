import type { Lang } from '@kithfield/contracts';
import { translator, type Translate } from '@kithfield/i18n';

/*
 * The widgets' words, as the iOS widgets put them (`targets/_shared/SurfaceCopy.swift`): lists of
 * names, who is up, and a plan's day and hour.
 */

export interface WidgetCopy {
  readonly t: Translate;
  readonly lang: Lang;
  /** "Pip", "Pip and Bea", "Pip, Fig and Bea". */
  readonly list: (names: readonly string[]) => string;
}

export function widgetCopy(lang: Lang): WidgetCopy {
  const t = translator(lang);
  const list = (names: readonly string[]) => {
    if (names.length <= 1) return names[0] ?? '';
    const head = names.slice(0, -1).join(t('surfaces.native.list.comma'));
    return `${head}${t('surfaces.native.list.and')}${names[names.length - 1] ?? ''}`;
  };
  return { t, lang, list };
}

const LOCALES: Record<Lang, string> = { en: 'en-US', vi: 'vi-VN' };

/** "4pm", "4:30pm", or "16:00" in Vietnamese. */
export function planHour(from: string, lang: Lang): string {
  const [h = 0, m = 0] = from.split(':').map(Number);
  if (lang === 'vi') return `${h}:${String(m).padStart(2, '0')}`;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const half = h < 12 ? 'am' : 'pm';
  return m === 0 ? `${hour12}${half}` : `${hour12}:${String(m).padStart(2, '0')}${half}`;
}

/** "Saturday · 4pm": a plan's day and hour; the day alone for a whole-day plan. */
export function planLabel(date: string, from: string | null, lang: Lang): string {
  const [y = 2000, mo = 1, d = 1] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, mo - 1, d, 12));
  const weekday = day.toLocaleDateString(LOCALES[lang], { weekday: 'long', timeZone: 'UTC' });
  return from === null ? weekday : `${weekday} · ${planHour(from, lang)}`;
}
