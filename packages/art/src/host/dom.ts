import { ArtCanvas, type SkiaEnv } from '../canvas2d/canvas';
import { ArtPath2D } from '../canvas2d/path2d';

/**
 * The few DOM pieces the renderer touches, backed by Skia: `document.createElement('canvas')`,
 * the `<kf-art>` element's base class and its registry. Nothing ticks on its own: there is no
 * animation frame, so a scene is drawn only when the host asks.
 */
export class HostElement {
  readonly style: Record<string, string> = {};
  clientWidth = 0;
  clientHeight = 0;
  private attrs = new Map<string, string>();

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  setAttribute(name: string, value: string): void {
    const old = this.getAttribute(name);
    this.attrs.set(name, String(value));
    this.changed(name, old, String(value));
  }
  removeAttribute(name: string): void {
    const old = this.getAttribute(name);
    if (!this.attrs.delete(name)) return;
    this.changed(name, old, null);
  }
  private changed(name: string, old: string | null, value: string | null): void {
    const ctor = this.constructor as { observedAttributes?: string[] };
    const cb = (this as { attributeChangedCallback?: (...a: unknown[]) => void })
      .attributeChangedCallback;
    if (cb && ctor.observedAttributes?.includes(name)) cb.call(this, name, old, value);
  }
  appendChild<T>(child: T): T {
    return child;
  }
}

export interface ArtHost {
  host: Record<string, unknown>;
  /** The `<kf-art>` class once the renderer has defined it. */
  element: () => (new () => HostElement) | null;
}

export function createHost(env: SkiaEnv, log: (msg: string, err: unknown) => void): ArtHost {
  const registry = new Map<string, new () => HostElement>();
  const start = Date.now();
  const host = {
    window: {} as Record<string, unknown>,
    document: {
      createElement(tag: string) {
        if (tag.toLowerCase() !== 'canvas') throw new Error(`createElement(${tag}) is not hosted`);
        return new ArtCanvas(env);
      },
    },
    customElements: {
      define(name: string, ctor: new () => HostElement) {
        registry.set(name, ctor);
      },
    },
    HTMLElement: HostElement,
    ResizeObserver: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
    IntersectionObserver: undefined,
    performance: { now: () => Date.now() - start },
    requestAnimationFrame: () => 0,
    matchMedia: undefined,
    getComputedStyle: () => ({ display: 'block' }),
    Path2D: ArtPath2D,
    console: {
      ...console,
      // The element reports a scene that throws and carries on; the host hears about it.
      error: (msg: string, ...rest: unknown[]) =>
        log(`${msg} ${rest.slice(0, 1).join(' ')}`, rest.at(-1)),
    },
  };
  return { host, element: () => registry.get('kf-art') ?? null };
}
