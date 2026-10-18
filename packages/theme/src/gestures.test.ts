import { describe, expect, it } from 'vitest';

import { gestureColours, gestureMotion } from './gestures';
import { readDesign, textOf } from './test/design';

const html = readDesign('05 Gestures.dc.html');
const notes = textOf(html.slice(html.indexOf('id="dev-notes"')));
const c = gestureColours.day;

describe('the gesture colours match 05 Gestures', () => {
  it('writes each day colour inline in the design', () => {
    const inline = [
      c.glassNight.fill,
      c.glassNight.border,
      c.glassDay.fill,
      c.glassDay.border,
      c.onNightArt,
      c.menuTint,
      c.menuSurface,
      c.menuShadow,
      c.liftShadow,
      c.mossPanelText,
      c.mossPanelChevron,
      c.bouquet,
      'rgba(42,34,29,.3)',
    ];
    for (const colour of inline) expect(html).toContain(colour);
  });

  it('keeps words over day-drawn art dark at night too', () => {
    expect(gestureColours.night.onDayArt).toBe(c.onDayArt);
    expect(gestureColours.night.menuSurface).not.toBe(c.menuSurface);
  });
});

describe('the gesture motion matches the notes', () => {
  it('has the knock wobble, the firefly flight and the tray stagger', () => {
    const { knockWobble: w } = gestureMotion;
    expect(notes).toContain(`${w.swings} swings, ±${w.degrees}°, ${w.durationMs}ms`);
    expect(notes).toContain(`over ${gestureMotion.fireflyFlightMs / 1000}s`);
    expect(notes).toContain(`${gestureMotion.trayStaggerMs}ms apart`);
    expect(notes).toContain(`pops ${gestureMotion.reactionPop}`);
    expect(notes).toContain(`${gestureMotion.sentCardOpacity * 100}%`);
  });
});
