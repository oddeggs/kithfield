import type { EnCatalogue } from './catalogue-types';

/**
 * The fire room: lighting the fire, sitting by it, listening or joining in, lanterns, captions
 * and heading home. It never rings anyone, never says who left, and never counts how long anyone
 * stayed. Counts here are of people simply there by the fire, never of care.
 */
export const fireEn = {
  'fire.title': 'By the fire',
  'fire.friend': 'a friend',
  'fire.back': 'Back to the farm',

  /* The pill under the title */
  'fire.sub.unlit': '{farm} · unlit',
  'fire.sub.count': { one: '{count} by the fire', other: '{count} by the fire' },
  'fire.sub.countWith': {
    one: '{count} by the fire · {state}',
    other: '{count} by the fire · {state}',
  },
  'fire.sub.listening': 'you’re listening',
  'fire.sub.muted': 'you’re muted',
  'fire.sub.full': 'full',
  'fire.sub.pair': '{name} and you',
  'fire.sub.settling': 'settling down',
  'fire.sub.captions': 'Captions on · only you see them',
  'fire.sub.sharing': 'You’re sharing your screen',
  'fire.sub.showing': '{name} is showing you something',
  'fire.names.two': '{a} and {b}',
  'fire.names.more': '{list}, {name}',

  /* An unlit fire */
  'fire.unlit.eyebrow': 'the fire is out',
  'fire.unlit.title': 'Light the fire?',
  'fire.unlit.body':
    'Your critter sits down and the farm glows. Friends see it on the farm and their widget, and can come sit if they like. Nobody’s phone rings.',
  'fire.unlit.light': 'Light it and sit down',
  'fire.unlit.notTonight': 'Not tonight',

  /* On the farm while it burns */
  'fire.glow.one': '{name}’s by the fire',
  'fire.glow.two': '{a} and {b} are by the fire',
  'fire.glow.many': '{name} and friends are by the fire',
  'fire.glow.body': 'Come sit if you like. No need to talk.',

  /* Pulling up a log */
  'fire.join.walking': '{name} is walking over',
  'fire.join.title': 'Pull up a log',
  'fire.join.body':
    'You arrive muted either way. Switch any time. Nothing is recorded, and nobody sees how long you stay.',
  'fire.join.in': 'Join in',
  'fire.join.listen': 'Just listen',

  /* The panel at the bottom */
  'fire.dock.listening': 'You’re listening',
  'fire.dock.listeningLine': 'nobody hears you till you unmute',
  'fire.dock.muted': 'You’re muted',
  'fire.dock.mutedLine': 'say it without words',
  'fire.dock.talking': 'You’re talking',
  'fire.dock.talkingLine': '{name} looks pleased to be here',
  'fire.dock.unmuteToTalk': 'Unmute to talk',
  'fire.dock.unmute': 'Unmute',
  'fire.dock.mute': 'Mute',
  'fire.dock.headHome': 'Head home',
  'fire.dock.lightLantern': 'Light your lantern',
  'fire.dock.putOutLantern': 'Put out your lantern',
  'fire.dock.share': 'Share your screen',
  'fire.dock.stopSharing': 'Stop sharing',
  'fire.dock.flip': 'Look at this',
  'fire.dock.flipBack': 'Flip back',

  /* Gestures by the fire */
  'fire.gesture.wave': 'Wave',
  'fire.gesture.dewdrop': 'Dewdrop',
  'fire.gesture.hug': 'Hug',
  'fire.gesture.sticker': 'A sticker',
  'fire.gesture.to': 'to {name}',
  'fire.gesture.fromYou': 'from you',

  /* Name chips over the critters */
  'fire.chip.you': 'You',
  'fire.chip.youCameraOff': 'You · camera off',
  'fire.chip.paused': 'paused',
  'fire.chip.justListening': 'just listening',
  'fire.chip.joining': '{name}, joining',
  'fire.chip.talking': '{name}, talking',
  'fire.chip.mutedA11y': '{name}, muted',
  'fire.chip.listeningA11y': '{name}, just listening',

  /* A weak connection */
  'fire.weak.title': '{name}’s connection is weak.',
  'fire.weak.body': 'Their critter dozes and their audio is paused until it’s back.',

  /* Heading home */
  'fire.leave.title': 'Heading home',
  'fire.leave.body':
    '{name} waves goodnight and walks back up the path. The others just see {name} go, the way you’d leave a real fire. No announcement, no “{name} left”.',
  'fire.leave.walk': 'Walk home',
  'fire.leave.stay': 'Stay a bit longer',

  /* The room going quiet */
  'fire.quiet.eyebrow': 'the fire is settling',
  'fire.quiet.title': 'Everyone has wandered home',
  'fire.quiet.body':
    'The embers glow on the farm for a few minutes, then go out. Anyone can light it again.',
  'fire.quiet.back': 'Back to the farm',

  /* Lanterns */
  'fire.lantern.welcome': '{name} lit a lantern. You’re here as {you}, just as welcome.',
  'fire.lantern.lookAtThis': 'look at this!',

  /* Captions */
  'fire.captions.button': 'Captions',
  'fire.captions.cc': 'CC',
  'fire.captions.plus': 'PLUS',
  'fire.captions.title': 'Captions',
  'fire.captions.pair': '{from} → {to}',
  'fire.captions.settings': 'Settings',
  'fire.captions.withheld': '…',
  'fire.captions.waiting': 'Words appear here as people talk.',
  'fire.captions.lang.en': 'English',
  'fire.captions.lang.vi': 'Vietnamese',
  'fire.captions.sheetEyebrow': 'with Kithfield+',
  'fire.captions.sheetTitle': 'Hear it, read it',
  /** The corrected lead: the voices go to Workers AI, not only the phone. */
  'fire.captions.lead':
    'Captions appear as friends talk, translated into your language if you like. The voices of friends who said yes go to {processor} and come back as words: nothing is recorded or saved, and nobody is told.',
  'fire.captions.processor':
    'Workers AI, run by Cloudflare, the company that already runs Kithfield’s servers',
  'fire.captions.live': 'Live captions',
  'fire.captions.liveSub': 'Words appear under the fire as people talk',
  'fire.captions.translate': 'Translate into',
  'fire.captions.translateSub': 'Detects each speaker’s language',
  'fire.captions.original': 'Show the original too',
  'fire.captions.expressions': 'Expressions from your voice',
  'fire.captions.expressionsSub':
    'Your critter laughs, softens or looks surprised as you do. Free for everyone, and you can switch yours off.',
  'fire.captions.free':
    'Captions are free if Live Captions is on in your iPhone’s accessibility settings.',
  'fire.captions.turnOn': 'Turn on with Plus',
  'fire.captions.done': 'Done',
  'fire.captions.notNow': 'Not now',
  'fire.captions.yourVoice': 'Caption your voice too',

  /* When something doesn’t work */
  'fire.error.connect': 'Couldn’t reach the fire. Try again in a moment.',
  'fire.error.mic':
    'Kithfield can’t hear your microphone. You can listen, or allow it in Settings.',
  'fire.error.camera': 'Kithfield can’t use your camera. You can allow it in Settings.',
  'fire.error.share': 'Sharing your screen from iPhone isn’t ready yet.',
} as const satisfies EnCatalogue;
