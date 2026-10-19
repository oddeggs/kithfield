import type { EnCatalogue } from './catalogue-types';

/**
 * The native surfaces (`10 On the System`, and the share sheet in `05 Gestures`): the widgets, the
 * Live Activities, the notification actions, the share extension, and the fire's audio and
 * permission sheets. The `surfaces.native.*` keys are compiled into the extensions, which run no
 * JavaScript (`targets/_shared/SurfaceCopy.swift`, generated from this file); names arrive in
 * `{name}`, `{names}` and `{count}`, and lists are joined with `surfaces.native.list.*`.
 */
export const surfacesEn = {
  /** Lists of names: "Pip, Fig and Bea". */
  'surfaces.native.list.comma': ', ',
  'surfaces.native.list.and': ' and ',

  /* Widgets (10-01, 10-14) */
  'surfaces.native.widget.name': 'Your farm',
  'surfaces.native.widget.description': 'Who’s up, the next plan, and the fire when it’s lit.',
  /** Before the app has written anything. */
  'surfaces.native.widget.empty': 'Open Kithfield to bring your farm here.',
  'surfaces.native.widget.up': { one: '{names} is up', other: '{names} are up' },
  'surfaces.native.widget.asleep': { one: '{names} is asleep', other: '{names} are asleep' },
  /** Nobody opened the farm in the last three hours. */
  'surfaces.native.widget.allAsleep': 'Everyone’s asleep',
  'surfaces.native.widget.firesLit': 'fire’s lit',
  'surfaces.native.widget.byTheFire': {
    one: '{names} is by the fire',
    other: '{names} are by the fire',
  },
  /** The person themselves, alone by the fire. */
  'surfaces.native.widget.youByTheFire': 'You’re by the fire',
  /** The fire is lit and the phone doesn't know who is by it. */
  'surfaces.native.widget.fireLitTitle': 'The fire’s lit',
  'surfaces.native.widget.comeSit': 'Tap to come sit',
  'surfaces.native.widget.byTheFireLabel': 'By the fire',
  /** The small widget with no plan and no fire. */
  'surfaces.native.widget.noPlan': 'No plans yet',

  /* The plan's day (10-02) */
  'surfaces.native.plan.onTheWay': '{count} on the way',
  'surfaces.native.plan.from': 'from {time}',
  'surfaces.native.plan.there': { one: '{names} is there.', other: '{names} are there.' },
  'surfaces.native.plan.walking': {
    one: '{names} is walking over.',
    other: '{names} are walking over.',
  },
  'surfaces.native.plan.nobodyYet': 'Nobody’s there yet.',
  /** The person themselves in a list of names. */
  'surfaces.native.you': 'you',

  /* The fire (10-08, 10-09) */
  'surfaces.native.fire.title': 'By the fire',
  'surfaces.native.fire.talking': '{name} is talking',
  'surfaces.native.fire.youTalking': 'you’re talking',
  'surfaces.native.fire.quiet': 'All quiet',
  'surfaces.native.fire.youreMuted': 'you’re muted',
  'surfaces.native.fire.mute': 'Mute',
  'surfaces.native.fire.unmute': 'Unmute',
  'surfaces.native.fire.leave': 'Leave',

  /* Notification actions (10-04) */
  'surfaces.native.action.imIn': 'I’m in',
  'surfaces.native.action.cant': 'Can’t this time',
  'surfaces.native.action.dewdrop': 'Leave a dewdrop',

  /* The share sheet (05-08) */
  'surfaces.native.share.photos': { one: '1 photo', other: '{count} photos' },
  'surfaces.native.share.videos': { one: '1 video', other: '{count} videos' },
  'surfaces.native.share.files': { one: '1 file', other: '{count} files' },
  'surfaces.native.share.things': { one: '1 thing', other: '{count} things' },
  'surfaces.native.share.link': 'A link',
  'surfaces.native.share.words': 'A few words',
  'surfaces.native.share.subtitle': 'Shared to Kithfield',
  'surfaces.native.share.send': 'Send',
  'surfaces.native.share.cancel': 'Cancel',
  'surfaces.native.share.sendTo': 'Send to',
  'surfaces.native.share.placeholder': 'Add a few words…',
  'surfaces.native.share.footer': 'Photos grow sunflowers on the farm you send them to.',
  'surfaces.native.share.critters': { one: '1 critter', other: '{count} critters' },
  'surfaces.native.share.visit': 'a visit',
  'surfaces.native.share.noFarms': 'Open Kithfield once, then your farms show up here.',
  'surfaces.native.share.tooMany': 'Kithfield takes up to 10 at a time.',

  /* In the app */
  /** A share that couldn't be sent: the farm is gone or the files went missing. */
  'surfaces.share.failed': 'That share couldn’t be sent.',

  /* Where the fire sounds (10-11) */
  'surfaces.route.title': 'Where the fire sounds',
  'surfaces.route.connected': 'Connected',
  'surfaces.route.micOn': 'mic on {name}',
  'surfaces.route.iphone': 'iPhone',
  'surfaces.route.earpiece': 'Earpiece',
  'surfaces.route.speaker': 'Speaker',
  'surfaces.route.speakerNote': 'For a room full of people',
  'surfaces.route.airplay': 'AirPlay · listen only',
  'surfaces.route.footer':
    'Taking an AirPod out pauses your mic, not the room. Putting it back resumes where you were, still muted if you were.',
  'surfaces.route.nowIn': 'Now in {name}',
  'surfaces.route.micPaused': 'Your mic is paused',
  'surfaces.route.more': 'More places to listen',

  /* Asking for the mic and camera (10-12, 10-13) */
  'surfaces.ask.kicker': 'before you sit down',
  'surfaces.ask.mic.title': 'Can {name} hear you by the fire?',
  'surfaces.ask.mic.titleAnyone': 'Can your friends hear you by the fire?',
  'surfaces.ask.mic.body':
    'Your mic is only used while you’re in a room, and you always arrive muted.',
  'surfaces.ask.mic.muted': 'Muted until you tap Unmute',
  'surfaces.ask.mic.notKept': 'Nothing is recorded or kept',
  'surfaces.ask.mic.background': 'Never used in the background',
  'surfaces.ask.mic.yes': 'Use my mic',
  'surfaces.ask.mic.no': 'Just listen for now',
  'surfaces.ask.camera.kicker': 'lighting your lantern',
  'surfaces.ask.camera.title': 'Show your face by the fire?',
  'surfaces.ask.camera.body':
    'Only when you light your lantern. Camera off is just as welcome: {name} sits in your place.',
  'surfaces.ask.camera.offEachTime': 'Off every time you join',
  'surfaces.ask.camera.flip': 'Flip to show what’s in front of you',
  'surfaces.ask.camera.notKept': 'No photos or recordings, ever',
  'surfaces.ask.camera.yes': 'Light my lantern',
  'surfaces.ask.camera.no': 'Stay as {name}',
  'surfaces.ask.next': 'Next, your iPhone will ask too.',
  'surfaces.ask.justListen': 'Just listen',
  'surfaces.ask.denied': 'Your mic is off for Kithfield.',
  'surfaces.ask.cameraDenied': 'Your camera is off for Kithfield.',
  'surfaces.ask.settings': 'Settings',
} as const satisfies EnCatalogue;
