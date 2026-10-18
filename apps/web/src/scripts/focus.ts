/**
 * Puts the cursor in a page's one field (`data-autofocus`) where there's a mouse. On touch screens
 * focusing on load would open the keyboard over the page, so it doesn't.
 */
export function focusOnDesktop(): void {
  if (!matchMedia('(pointer: fine)').matches) return;
  document.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
}
