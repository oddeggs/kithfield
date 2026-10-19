/**
 * The browser's side of `android-system`: no Android module, and no iOS action sheet or
 * `Alert.prompt` either (React Native for Web has neither). A question with a field is the
 * browser's own prompt; a list of choices is a small modal dialog in the app's paper and ink.
 * Metro takes this file for web builds only; the phone keeps `index.ts`.
 */
import { day, night, radii, systemCss } from '@kithfield/theme';

import type { ChoiceSheet, TextPrompt } from './index';

export type {
  BackPreviewEvent,
  ChoiceSheet,
  SharedIntent,
  SharedIntentFile,
  TextPrompt,
} from './index';

/** No Android module in the browser. */
export const androidSystem = null;

function button(label: string, colour: string, background: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  Object.assign(b.style, {
    font: `600 16px ${systemCss}`,
    color: colour,
    background,
    border: 'none',
    borderRadius: `${radii.button}px`,
    padding: '12px 16px',
    cursor: 'pointer',
    textAlign: 'center',
  });
  return b;
}

/**
 * A list of choices in a modal dialog: a button for each, the cancel one last. `then` gets the
 * chosen index in `options`, or the cancel index (or -1) for Esc or a click outside.
 */
export function showChoices(sheet: ChoiceSheet, then: (index: number) => void): void {
  const { options, cancelButtonIndex, destructiveButtonIndex, title } = sheet;
  const palette = sheet.dark
    ? { paper: night.panel, ink: night.moon, sub: night.dim, fill: night.bubble }
    : { paper: day.card, ink: day.ink, sub: day.ink3, fill: day.sheet };
  const dialog = document.createElement('dialog');
  Object.assign(dialog.style, {
    border: 'none',
    borderRadius: '20px',
    padding: '16px',
    minWidth: '280px',
    maxWidth: '360px',
    background: palette.paper,
    color: palette.ink,
    font: `16px ${systemCss}`,
  });
  const list = document.createElement('div');
  Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '8px' });
  if (title !== undefined) {
    const heading = document.createElement('p');
    heading.textContent = title;
    Object.assign(heading.style, { margin: '0 0 4px', color: palette.sub, textAlign: 'center' });
    list.appendChild(heading);
  }
  let answered = false;
  const answer = (index: number) => {
    if (answered) return;
    answered = true;
    dialog.close();
    dialog.remove();
    then(index);
  };
  const order = options
    .map((label, index) => ({ label, index }))
    .sort((a, b) => Number(a.index === cancelButtonIndex) - Number(b.index === cancelButtonIndex));
  for (const { label, index } of order) {
    const colour = index === destructiveButtonIndex ? day.clay : palette.ink;
    const b = button(label, colour, index === cancelButtonIndex ? 'transparent' : palette.fill);
    b.addEventListener('click', () => answer(index));
    list.appendChild(b);
  }
  dialog.appendChild(list);
  dialog.addEventListener('close', () => answer(cancelButtonIndex ?? -1));
  // A click on the backdrop (the dialog itself, outside its content) cancels.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) answer(cancelButtonIndex ?? -1);
  });
  document.body.appendChild(dialog);
  dialog.showModal();
}

/** A one-line question: the browser's own prompt. Cancel answers nothing. */
export function promptText(prompt: TextPrompt, then: (value: string) => void): void {
  const question = prompt.message ? `${prompt.title}\n\n${prompt.message}` : prompt.title;
  const value = window.prompt(question, prompt.initial ?? '');
  if (value !== null) then(value);
}
