import type { EnCatalogue } from './catalogue-types';

/**
 * The way in (`03 Onboarding`): the welcome, signing in, the age check, the house rules, becoming
 * a critter, planting the first farm, asking for permissions in the farm's voice, and joining a
 * friend's farm from an invite.
 */
export const onboardingEn = {
  'onboarding.back': 'Back',
  'onboarding.skip': 'Skip',
  'onboarding.done': 'Done',
  'onboarding.continue': 'Continue',
  /** VoiceOver, for the dots at the top of the critter and farm screens. */
  'onboarding.step': 'Step {step} of {steps}',
  'onboarding.failed': 'That didn’t work. Try again in a moment.',

  'onboarding.welcome.body':
    'A small farm you share with your friends. Every hello, photo and wave helps it grow.',
  'onboarding.welcome.start': 'Start a farm',
  'onboarding.welcome.invite': 'I have an invite',

  'onboarding.invite.title': 'Got a farm link?',
  'onboarding.invite.body': 'Paste the link a friend sent you, and we’ll take you to their gate.',
  'onboarding.invite.field': 'Farm link',
  'onboarding.invite.placeholder': 'kithfield.com/i/…',
  'onboarding.invite.open': 'Open the invite',
  'onboarding.invite.paste': 'Paste',
  'onboarding.invite.notALink': 'That doesn’t look like a farm link. Check it and try again.',

  'onboarding.join.title': '{name} saved you a cottage',
  'onboarding.join.titleNoName': 'A cottage is waiting for you',
  'onboarding.join.body': 'On {farm}. The glowing one is yours.',
  'onboarding.join.accept': 'Accept the cottage',
  'onboarding.join.full.title': 'This farm is full',
  'onboarding.join.full.body':
    '{farm} already has all the critters it can hold. Ask your friend about it, or start a farm of your own.',
  'onboarding.join.gone.title': 'This invite has gone quiet',
  'onboarding.join.gone.body':
    'The link was taken back, used up or ran out of time. Ask your friend for a fresh one.',
  'onboarding.join.startInstead': 'Start a farm instead',
  'onboarding.join.unreachable.title': 'The path washed out for a moment',
  'onboarding.join.unreachable.body':
    'We couldn’t reach the farm. Check your connection, then try again.',
  'onboarding.join.tryAgain': 'Try again',
  'onboarding.join.waiting.title': 'You’ve knocked on the gate',
  'onboarding.join.waiting.body':
    'The keeper of {farm} lets new critters in. Your cottage is ready the moment they open the gate.',

  'onboarding.signIn.title': 'A key to the gate',
  'onboarding.signIn.body':
    'Sign in so your farm follows you to a new phone. We never post anything, and your friends only see your critter.',
  'onboarding.signIn.apple': 'Continue with Apple',
  'onboarding.signIn.google': 'Continue with Google',
  'onboarding.signIn.email': 'Continue with email',
  /** `{rules}` and `{privacy}` are links, worded by the next two keys. */
  'onboarding.signIn.agree': 'By continuing you agree to the {rules} and {privacy}.',
  'onboarding.signIn.rules': 'house\u00a0rules',
  'onboarding.signIn.privacy': 'privacy\u00a0promise',
  'onboarding.signIn.failed': 'That didn’t work. Try again or use email.',
  /** Once, after writes that never left the phone were lost when the last session ended. */
  'onboarding.signIn.unsent.sessionEnd':
    'You were signed out from another device. A few things you wrote hadn’t sent yet, so they were left behind.',
  'onboarding.signIn.unsent.signOut':
    'A few things you wrote hadn’t sent when you signed out, so they were left behind.',

  'onboarding.email.title': 'Where should Otis fly?',
  'onboarding.email.body':
    'We’ll send a six-digit code to your email. It’s only ever used to let you in.',
  'onboarding.email.field': 'Email',
  'onboarding.email.placeholder': 'you@example.com',
  'onboarding.email.send': 'Send me a code',
  'onboarding.email.invalid': 'That doesn’t look like an email address.',

  'onboarding.code.title': 'Check your letterbox',
  /** `{email}` is set in bold. */
  'onboarding.code.body': 'Otis flew a six-digit code to {email}.',
  'onboarding.code.field': 'Six-digit code',
  'onboarding.code.typed': '{count} of 6',
  'onboarding.code.resendLead': 'Didn’t arrive?',
  'onboarding.code.resend': 'Send another',
  'onboarding.code.otherEmail': 'Use a different email',
  'onboarding.code.note': 'The code fills in on its own from Mail. It works for 10 minutes.',
  'onboarding.code.wrong': 'That code didn’t fit. Try again.',
  'onboarding.code.sent': 'Another code is on its way.',
  'onboarding.code.lockout':
    'Too many tries for this address. Try tomorrow, or use Apple or Google.',

  'onboarding.age.title': 'When’s your birthday?',
  'onboarding.age.body':
    'Kithfield is for people 13 and over, or older where local law asks. Only the day and month are ever shown, and only if you turn on birthday blooms.',
  'onboarding.age.day': 'Day',
  'onboarding.age.month': 'Month',
  'onboarding.age.year': 'Year',
  'onboarding.age.bloom': 'Bloom on my birthday',
  'onboarding.age.bloomBody': 'Friends see a rose over your cottage',
  'onboarding.age.note':
    'If you’re under the age for your country, we’ll say so kindly and nothing is saved.',
  'onboarding.month.1': 'January',
  'onboarding.month.2': 'February',
  'onboarding.month.3': 'March',
  'onboarding.month.4': 'April',
  'onboarding.month.5': 'May',
  'onboarding.month.6': 'June',
  'onboarding.month.7': 'July',
  'onboarding.month.8': 'August',
  'onboarding.month.9': 'September',
  'onboarding.month.10': 'October',
  'onboarding.month.11': 'November',
  'onboarding.month.12': 'December',

  'onboarding.tooYoung.title': 'Come back when you’re older',
  'onboarding.tooYoung.body':
    'Kithfield is for people a little older, where you live. Nothing you told us was saved, and the farm will still be here when it’s your time.',

  'onboarding.rules.title': 'House rules',
  'onboarding.rules.heading': 'The short version',
  'onboarding.rules.kind.title': 'Be kind on every farm',
  'onboarding.rules.kind.body':
    'No bullying, hate or unwanted contact. Keepers and our team can remove people who make a farm feel unsafe.',
  'onboarding.rules.yours.title': 'Your messages are yours',
  'onboarding.rules.yours.body':
    'They travel and are stored encrypted, and we never sell them or advertise with your data. They aren’t end-to-end encrypted, so that search and safety reports can work.',
  'onboarding.rules.fire.title': 'Nothing is recorded by the fire',
  'onboarding.rules.fire.body':
    'Voice rooms and lanterns aren’t recorded or stored. Captions stay off until you say yes.',
  'onboarding.rules.leave.title': 'Leave whenever you like',
  'onboarding.rules.leave.body': 'Download your keepsakes and delete everything.',
  'onboarding.rules.terms': 'Terms of service',
  'onboarding.rules.termsBody': 'The full house rules · updated {date}',
  'onboarding.rules.privacy': 'Privacy policy',
  'onboarding.rules.privacyBody': 'Everything we collect and why',

  'onboarding.critter.title': 'Who are you on the farm?',
  'onboarding.critter.next': 'Next: make them yours',

  'onboarding.look.title': 'Make them yours',
  'onboarding.look.your': 'Your {critter}',
  'onboarding.look.name': 'Name on the farm:',
  'onboarding.look.nameAdd': 'add yours',
  'onboarding.look.namePrompt': 'Your name on the farm',
  'onboarding.look.namePromptBody': 'Friends see it beside your critter.',
  'onboarding.look.save': 'Save',
  'onboarding.look.cancel': 'Cancel',
  'onboarding.look.coat': 'Coat',
  'onboarding.look.markings': 'Markings',
  'onboarding.look.accessory': 'Accessory',
  'onboarding.look.twinNamed':
    'You look just like {name}, who already lives here. Try another coat or accessory?',
  'onboarding.look.twin':
    'Someone on this farm looks just like you. Try another coat or accessory?',
  'onboarding.look.alikeNamed':
    '{name} is a {critter} on this farm too. You two are easy to tell apart.',
  'onboarding.look.alike':
    'Another {critter} lives on this farm too. You two are easy to tell apart.',
  'onboarding.look.moveIn': 'Move in',
  'onboarding.look.needName': 'Add your name on the farm first.',

  'onboarding.notifications.eyebrow': 'one small thing',
  'onboarding.notifications.title': 'Can Otis knock when it matters?',
  'onboarding.notifications.body': 'Only for things a friend would tell you in person.',
  'onboarding.notifications.plan': 'A plan has a date and needs your yes',
  'onboarding.notifications.doorstep': 'Someone left something on your doorstep',
  'onboarding.notifications.fire': 'The fire is lit for a hangout today',
  'onboarding.notifications.never': 'Never “you haven’t posted in a while”',
  'onboarding.notifications.yes': 'Yes, knock gently',
  'onboarding.notifications.no': 'Not now',
  'onboarding.ask.next': 'Next, your iPhone will ask too.',

  'onboarding.farm.title': 'Save a spot for your people',
  'onboarding.farm.body':
    'Sketched cottages turn real when friends move in. Whoever joins brings a critter.',
  'onboarding.farm.name': 'Farm name',
  'onboarding.farm.placeholder': 'Name your farm',
  'onboarding.farm.message': '{name} planted a farm and saved you a cottage. Come be a critter?',
  'onboarding.farm.linkSoon': 'kithfield.com/i/…',
  'onboarding.farm.note': 'No streaks and no read receipts. Just a farm that’s glad you came.',
  'onboarding.farm.copy': 'Copy link',
  'onboarding.farm.share': 'Share invite',
  'onboarding.farm.copied': 'Link copied',
  'onboarding.farm.needName': 'Give the farm a name first.',

  'onboarding.contacts.eyebrow': 'finding your people',
  'onboarding.contacts.title': 'Shall Pim look for your friends?',
  'onboarding.contacts.body':
    'Pim looks through your contacts on this phone, so you can invite friends one by one. No one is messaged unless you send an invite.',
  'onboarding.contacts.stay': 'Your contacts stay on this phone',
  'onboarding.contacts.choose': 'You choose who to invite, one by one',
  'onboarding.contacts.never': 'We never upload your address book',
  'onboarding.contacts.yes': 'Look for friends',
  'onboarding.contacts.no': 'Share a link instead',

  'onboarding.friends.title': 'Find your people',
  'onboarding.friends.search': 'Search contacts',
  'onboarding.friends.notHere': 'Not here yet',
  'onboarding.friends.byText': 'Gets a link by text',
  'onboarding.friends.invite': 'Invite',
  'onboarding.friends.invited': 'Invited',
  'onboarding.friends.done': 'Done',
  'onboarding.friends.doneInvited': {
    one: 'Done · {count} invited',
    other: 'Done · {count} invited',
  },
  'onboarding.friends.none': 'No one to show here',
  'onboarding.friends.noneBody': 'Share the farm’s link instead, wherever your friends are.',
  'onboarding.friends.denied': 'Pim can’t see your contacts',
  'onboarding.friends.deniedBody':
    'You can allow it in Settings any time, or share the farm’s link instead.',
  'onboarding.friends.shareLink': 'Share a link',

  'onboarding.photos.eyebrow': 'when you tap + photo',
  'onboarding.photos.title': 'Fig would love to see',
  'onboarding.photos.body':
    'Pick photos each time you share. Kithfield only ever sees the ones you choose.',
  'onboarding.photos.picker': 'Choose in the photo picker, no library access needed',
  'onboarding.photos.recent': 'Or allow access so recent photos show in the tray',
  'onboarding.photos.yes': 'Choose photos',
  'onboarding.photos.no': 'Allow access to recent photos',

  'onboarding.location.eyebrow': 'only if you want it',
  'onboarding.location.title': 'Want a lantern on the way?',
  'onboarding.location.body':
    'On a hangout day, Rue can show the path from where you are. Nothing is shared with the farm, ever.',
  'onboarding.location.heading': 'Only while you’re heading to a hangout',
  'onboarding.location.off': 'Turns itself off when you arrive',
  'onboarding.location.never': 'No live location sharing',
  'onboarding.location.yes': 'Allow while using the app',
  'onboarding.location.no': 'Skip, I know the way',
} as const satisfies EnCatalogue;
