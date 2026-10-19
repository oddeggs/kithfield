import type { EnCatalogue } from './catalogue-types';

/**
 * The web and desktop app (`14 Platforms`): joining a farm from an invite in the browser, the
 * narrow web, the desktop's three panes, dropping photos, stickers by typing a colon, the
 * keyboard shortcuts, the menu-bar and tray critter, and soft notifications.
 */
export const platformsEn = {
  'platforms.join.hello': 'come in, come in',
  'platforms.join.body':
    'This farm is working right here in your browser. Pick a critter and say hi. Get the app later if you like.',
  'platforms.join.critters': { one: '{count} critter', other: '{count} critters' },
  'platforms.join.saved': 'your cottage,\nsaved by {name}',
  'platforms.join.savedNoName': 'your cottage',
  /** VoiceOver, on each critter in the row. */
  'platforms.join.be': 'Be a {critter}',
  'platforms.join.name': 'Your name',
  'platforms.join.moveIn': 'Move in as {name} the {critter}',
  'platforms.join.moveInNoName': 'Move in as a {critter}',
  'platforms.join.needName': 'Add your name first.',
  'platforms.join.keep': 'Sign in with Apple, Google or email to keep your critter.',
  'platforms.join.year': 'The year you were born',
  'platforms.join.yearBody':
    'Kithfield is for people 13 and over, or older where local law asks. Only the year is checked, and it isn’t kept.',
  'platforms.join.agree': 'By moving in you agree to the {rules} and {privacy}.',
  'platforms.join.go': 'Move in',
  'platforms.join.waiting': 'You’re at the gate. A keeper will let you in soon.',

  'platforms.getApp': 'Get the app',

  'platforms.desk.search': 'Search',
  'platforms.desk.farms': 'Farms',
  'platforms.desk.visits': 'Visits',
  'platforms.desk.settings': 'Settings',
  'platforms.desk.lampOn': 'lamp’s on',
  'platforms.desk.pick': 'Pick a farm or a visit to chat.',
  'platforms.desk.reacts': 'The farm reacts as you chat: {name} just piped up.',
  'platforms.desk.reactsQuiet': 'The farm reacts as you chat.',

  'platforms.drop.title': {
    one: 'Drop to share a photo',
    other: 'Drop to share {count} photos',
  },
  'platforms.drop.body': '{name} will love these',
  'platforms.drop.bodyFarm': 'everyone will love these',
  'platforms.drop.notPhotos': 'Only photos and videos can be dropped here.',

  'platforms.composer.placeholder': 'Say something, or type : for stickers',
  'platforms.stickers.matching': 'Stickers matching',
  'platforms.stickers.choose': 'choose',
  'platforms.stickers.send': 'send',
  'platforms.stickers.none': 'No stickers match. Keep typing, or press Esc.',

  'platforms.keys.title': 'Keyboard shortcuts',
  'platforms.keys.dewdrop': 'Leave a dewdrop on the last message',
  'platforms.keys.quickTend': 'Quick Tend: three cards to catch up',
  'platforms.keys.stickers': 'Type : then a word for stickers',
  'platforms.keys.search': 'Search farms, visits and messages',
  'platforms.keys.firefly': 'Leave a firefly for someone',
  'platforms.keys.seed': 'Plant the selected message as a seed',
  'platforms.keys.jump': 'Jump to a farm',
  'platforms.keys.fire': 'Sit by the fire',
  'platforms.keys.edit': 'Edit your last message',
  'platforms.keys.list': 'Show this list',
  'platforms.keys.mute': 'Mute or unmute by the fire',
  'platforms.keys.close': 'Close',

  'platforms.tray.firefly': '{name} left a firefly',
  'platforms.tray.fireflyBody': 'on your step · no reply needed',
  'platforms.tray.fireAlone': '{name} is by the fire',
  'platforms.tray.fire': {
    one: '{name} and {count} other are by the fire',
    other: '{name} and {count} others are by the fire',
  },
  'platforms.tray.fireBody': 'come sit if you like',
  'platforms.tray.open': 'Open farm',
  'platforms.tray.sendBack': 'Send one back',
  'platforms.tray.sit': 'Sit by the fire',
  'platforms.tray.quiet': 'All quiet on your farms',
  'platforms.tray.quit': 'Quit Kithfield',
  'platforms.tray.show': 'Show Kithfield',

  'platforms.menu.file': 'File',
  'platforms.menu.edit': 'Edit',
  'platforms.menu.farm': 'Farm',
  'platforms.menu.window': 'Window',

  'platforms.notify.firefly': '{name} left a firefly on your step',
  'platforms.notify.dewdrop': 'left a dewdrop on your message',
  'platforms.notify.from': '{name} · {farm}',
} as const satisfies EnCatalogue;
