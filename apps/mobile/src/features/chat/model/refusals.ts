/*
 * A write the farm refused, as the chat explains it. Some reasons won't change by trying again (the
 * edit window closed, the message is gone, a pause or a frozen farm), so those offer no retry.
 */

export type RefusalCopy =
  | 'chat.refused.editClosed'
  | 'chat.refused.gone'
  | 'chat.refused.notAllowed'
  | 'chat.refused.paused'
  | 'chat.refused.frozen'
  | 'chat.refused.other';

const PERMANENT: Readonly<Record<string, RefusalCopy>> = {
  edit_window_closed: 'chat.refused.editClosed',
  gone: 'chat.refused.gone',
  not_allowed: 'chat.refused.notAllowed',
  account_paused: 'chat.refused.paused',
  farm_frozen: 'chat.refused.frozen',
};

export function refusalOf(reason: string): { readonly copy: RefusalCopy; readonly retry: boolean } {
  const permanent = PERMANENT[reason];
  return permanent
    ? { copy: permanent, retry: false }
    : { copy: 'chat.refused.other', retry: true };
}
