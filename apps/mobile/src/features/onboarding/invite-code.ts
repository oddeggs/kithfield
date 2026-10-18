/** An invite code as the API makes them. */
const CODE = /^[A-Za-z0-9-]{4,64}$/;

/**
 * The invite code in what someone pasted: a farm link (`kithfield.com/i/<code>`, with or without
 * `https://`, the Vietnamese `/vi/i/<code>`, or the app's own `kithfield://i/<code>`), or the bare
 * code. Null when it holds no code.
 */
export function inviteCodeIn(pasted: string): string | null {
  const text = pasted.trim();
  if (text === '') return null;
  const link = /(?:^|[\s/])i\/([A-Za-z0-9-]{4,64})(?:[/?#\s]|$)/.exec(text);
  if (link?.[1]) return link[1];
  return CODE.test(text) ? text : null;
}

/** The farm link in what the clipboard holds (often a whole invite message), or null. */
export function inviteLinkIn(text: string): string | null {
  return /\S*kithfield\S*\/i\/[A-Za-z0-9-]{4,64}/.exec(text)?.[0] ?? null;
}
