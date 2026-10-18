/** The four tabs, by route name. */
export const tabs = ['farm', 'chat', 'seedbed', 'you'] as const;
export type TabName = (typeof tabs)[number];
