/**
 * What a tap on a friend's face does: lands the flight already in the air (so one card opens),
 * flies the face to the farm, or, with no face on screen to lift or another farm on the Farm
 * tab, opens their card over the chat.
 */
export function meetChoice(now: {
  readonly flying: boolean;
  readonly face: boolean;
  readonly onFarm: boolean;
}): 'finish' | 'fly' | 'card' {
  if (now.flying) return 'finish';
  return now.face && now.onFarm ? 'fly' : 'card';
}

/** The VoiceOver action on a friend's message that does what tapping their face does. */
export function meetAction(
  t: (key: 'chat.bubble.meet', values: { name: string }) => string,
  who: { readonly mine: boolean; readonly name: string; readonly critter: boolean },
): { readonly name: 'meet'; readonly label: string } | null {
  if (who.mine || !who.critter) return null;
  return { name: 'meet', label: t('chat.bubble.meet', { name: who.name }) };
}
