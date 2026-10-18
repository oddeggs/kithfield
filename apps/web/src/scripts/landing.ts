/**
 * The landing page's scroll-driven evening, the field guide and the waitlist form, as `17 Landing`
 * runs them. All motion is transforms and opacity set once per animation frame from the scroll
 * position, so the browser composites it; nothing animates on a timer. With reduced motion the
 * scroll still turns the pages of the evening, but the cursor's firefly stays home.
 */
import { joinWaitlist, type JoinOutcome } from './waitlist';

/** Camera stops through the evening: [progress, focus x, focus y, zoom]. */
const CAM: readonly (readonly [number, number, number, number])[] = [
  [0, 0.5, 0.5, 1],
  [0.05, 0.5, 0.52, 1],
  [0.13, 0.6, 0.7, 1.1],
  [0.22, 0.72, 0.7, 1.12],
  [0.29, 0.8, 0.74, 1.32],
  [0.39, 0.8, 0.74, 1.32],
  [0.45, 0.445, 0.8, 1.36],
  [0.56, 0.46, 0.8, 1.3],
  [0.64, 0.58, 0.82, 1.18],
  [0.8, 0.58, 0.82, 1.14],
  [0.9, 0.5, 0.56, 1],
  [1, 0.5, 0.56, 1],
];
const smooth = (u: number): number => {
  const v = Math.min(1, Math.max(0, u));
  return v * v * (3 - 2 * v);
};

interface ArtElement extends HTMLElement {
  p?: number;
  dirty?: boolean;
}

function q<T extends HTMLElement = HTMLElement>(name: string): T | null {
  return document.querySelector<T>(`[data-kf="${name}"]`);
}

function evening(): void {
  const pin = q('pin');
  const world = q('world');
  const stage = q('stage');
  const nav = q('nav');
  const fly = q('fly');
  if (!pin || !world || !stage) return;
  const chapters = [...stage.querySelectorAll<HTMLElement>('[data-a]')];
  const ticks = [...stage.querySelectorAll<HTMLElement>('[data-tick]')];
  const notes = world.querySelector<HTMLElement>('[data-ann]');
  const veilPaper = stage.querySelector<HTMLElement>('[data-veil="paper"]');
  const veilNight = stage.querySelector<HTMLElement>('[data-veil="night"]');
  const phone = stage.querySelector<HTMLElement>('[data-phone]');
  const art = q<ArtElement>('art');
  const finePointer = matchMedia('(pointer:fine)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  let vw = 0;
  let vh = 0;
  let W = 0;
  let H = 0;
  let inPin = false;
  let raf = 0;

  const layout = (): void => {
    vw = innerWidth;
    vh = innerHeight;
    W = Math.max(vw, vh * 1.6);
    H = W / 1.6;
    world.style.width = `${W}px`;
    world.style.height = `${H}px`;
  };

  const frame = (): void => {
    const r = pin.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
    const narrow = vw < 760;
    inPin = r.top < vh * 0.5 && r.bottom > vh * 0.5;
    if (art) {
      art.p = p;
      art.dirty = true;
    }
    let i = 1;
    while (i < CAM.length - 1 && p > (CAM[i]?.[0] ?? 1)) i++;
    const A = CAM[i - 1] ?? CAM[0];
    const B = CAM[i] ?? CAM[0];
    if (!A || !B) return;
    const u = smooth((p - A[0]) / (B[0] - A[0] || 1));
    const hero = 1 - smooth(p / 0.06);
    const fx = A[1] + (B[1] - A[1]) * u - (narrow ? 0.08 * hero : 0);
    const fy = A[2] + (B[2] - A[2]) * u;
    const z = A[3] + (B[3] - A[3]) * u;
    const tx = narrow ? 0.5 : 0.5 + 0.14 * (1 - hero);
    const ty = narrow ? 0.5 + 0.17 * (1 - hero) : 0.5 + 0.06 * (1 - hero);
    let X = tx * vw - z * fx * W;
    let Y = ty * vh - z * fy * H;
    X = Math.min(0, Math.max(vw - z * W, X));
    Y = Math.min(0, Math.max(vh - z * H, Y));
    world.style.transform = `translate3d(${X.toFixed(1)}px,${Y.toFixed(1)}px,0) scale(${z.toFixed(4)})`;
    if (notes) notes.style.opacity = String(1 - smooth(p / 0.03));
    for (const el of chapters) {
      const a = Number(el.dataset.a);
      const b = Number(el.dataset.b);
      const o = Math.max(0, Math.min(1, (p - a) / 0.022 + 1, (b - p) / 0.022 + 1));
      el.style.opacity = o.toFixed(3);
      el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
      el.style.transform = `translateY(${((1 - o) * (p < a ? 30 : -30)).toFixed(1)}px)`;
    }
    for (const el of ticks) {
      const on = p > Number(el.dataset.tick);
      el.style.background = on ? '#5E7F4A' : 'rgba(255,250,242,.6)';
      el.style.color = on ? '#fff' : 'transparent';
    }
    if (veilPaper) veilPaper.style.opacity = String((1 - hero) * smooth((0.575 - p) / 0.03));
    if (veilNight) veilNight.style.opacity = String(smooth((p - 0.575) / 0.03));
    if (phone) {
      const e = smooth((p - 0.86) / 0.07);
      phone.style.transform = `translateY(${((1 - e) * 130).toFixed(1)}%) rotate(${(4 - e * 1.5).toFixed(2)}deg)`;
    }
    if (nav) {
      const past = r.bottom < 64;
      const onNight = !past && p > 0.575 && r.top <= 0;
      nav.style.color = onNight ? '#f6eedb' : '#2a221d';
      nav.style.background = past ? 'rgba(245,238,226,.84)' : 'transparent';
      const blur = past ? 'blur(16px) saturate(1.4)' : 'none';
      nav.style.backdropFilter = blur;
      nav.style.setProperty('-webkit-backdrop-filter', blur);
      nav.style.boxShadow = past ? '0 1px 0 rgba(42,34,29,.08)' : 'none';
    }
    if (fly) {
      if (!followerOn()) fly.style.opacity = '0';
      else if (!flyRaf) flyRaf = requestAnimationFrame(flyStep);
    }
  };

  const schedule = (): void => {
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        frame();
      });
    }
  };

  // The firefly that follows a mouse over the evening (fine pointers, motion allowed).
  let mx: number | null = null;
  let my = 0;
  let fx = 0;
  let fy = 0;
  let flyRaf = 0;
  const followerOn = (): boolean => finePointer && !reduce.matches && inPin && mx !== null;
  const flyStep = (): void => {
    if (!fly || mx === null) {
      flyRaf = 0;
      return;
    }
    fx += (mx + 16 - fx) * 0.1;
    fy += (my - 22 - fy) * 0.1;
    const bob = Math.sin(performance.now() / 260) * 3;
    fly.style.transform = `translate3d(${(fx - 23).toFixed(1)}px,${(fy - 23 + bob).toFixed(1)}px,0) scaleX(${mx < fx - 16 ? -1 : 1})`;
    fly.style.opacity = followerOn() ? '1' : '0';
    flyRaf = followerOn() ? requestAnimationFrame(flyStep) : 0;
  };
  if (finePointer && fly) {
    addEventListener(
      'pointermove',
      (e) => {
        if (mx === null) {
          fx = e.clientX;
          fy = e.clientY;
        }
        mx = e.clientX;
        my = e.clientY;
        if (!flyRaf && followerOn()) flyRaf = requestAnimationFrame(flyStep);
      },
      { passive: true },
    );
  }

  addEventListener('scroll', schedule, { passive: true, capture: true });
  addEventListener('resize', () => {
    layout();
    frame();
  });
  layout();
  frame();
}

function strikes(): void {
  const rules = q('rules');
  if (!rules) return;
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        rules.classList.add('kf-seen');
        io.disconnect();
      }
    },
    { threshold: 0.3 },
  );
  io.observe(rules);
}

interface CastEntry {
  kind: string;
  plate: string;
  name: string;
  latin: string;
  seen: string;
  care: string;
  quiet: string;
  tint: string;
}

function guide(): void {
  const book = q('guide');
  if (!book) return;
  const cast = JSON.parse(book.dataset.cast ?? '[]') as CastEntry[];
  const part = (name: string) => book.querySelector<HTMLElement>(`[data-fg="${name}"]`);
  const tiles = [...document.querySelectorAll<HTMLButtonElement>('.kf-cast-tile')];
  for (const tile of tiles) {
    tile.addEventListener('click', () => {
      const entry = cast.find((c) => c.kind === tile.dataset.kind);
      if (!entry) return;
      for (const other of tiles) other.setAttribute('aria-pressed', String(other === tile));
      part('stage')?.setAttribute('kind', entry.kind);
      const tint = part('tint');
      if (tint) tint.style.background = entry.tint;
      for (const field of ['plate', 'name', 'latin', 'seen', 'care', 'quiet'] as const) {
        const el = part(field);
        if (el) el.textContent = entry[field];
      }
    });
  }
}

function joinForm(): void {
  const form = q<HTMLFormElement>('join');
  const note = q('join-note');
  if (!form || !note) return;
  const button = form.querySelector('button');
  const input = form.querySelector('input');
  const idle = button?.textContent ?? '';
  const messages: Record<Exclude<JoinOutcome, 'listed'>, string> = {
    invalid: form.dataset.invalid ?? '',
    busy: form.dataset.busy ?? '',
    unreachable: form.dataset.unreachable ?? '',
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!button || !input || button.disabled) return;
    button.disabled = true;
    button.textContent = form.dataset.sending ?? idle;
    note.textContent = '';
    void joinWaitlist(input.value, form.dataset.lang === 'vi' ? 'vi' : 'en').then((outcome) => {
      if (outcome === 'listed') {
        button.textContent = form.dataset.saved ?? idle;
        note.textContent = form.dataset.done ?? '';
        input.readOnly = true;
        return;
      }
      button.disabled = false;
      button.textContent = idle;
      note.textContent = messages[outcome];
    });
  });
}

evening();
strikes();
guide();
joinForm();
