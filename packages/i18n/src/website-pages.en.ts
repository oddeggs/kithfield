import type { EnCatalogue } from './catalogue-types';

/**
 * The site's other pages: the invite page, the waitlist and its thank-you, the legal pages,
 * support, account deletion, contact and the press kit, plus the waitlist's confirmation letter.
 * Legal text is the design's draft, corrected to what the service does (`docs/backend.md` §8).
 */
export const websitePagesEn = {
  'websitePages.switch': 'EN · VI',

  'websitePages.invite.title': 'An invite to Kithfield',
  'websitePages.invite.kicker': "you're invited",
  'websitePages.invite.headline': 'A cottage is saved for you on {farm}',
  'websitePages.invite.members': {
    one: '{count} critter lives here. Come in from your browser, or get the app.',
    other: '{count} critters live here. Come in from your browser, or get the app.',
  },
  'websitePages.invite.approval':
    'The keeper lets new friends in, so you may wait a moment at the gate.',
  'websitePages.invite.browser': 'Come in from the browser →',
  'websitePages.invite.appStore': 'App Store',
  'websitePages.invite.googlePlay': 'Google Play',
  'websitePages.invite.private':
    "This link is private to the farm. Only its keeper's friends get it.",
  'websitePages.invite.loading': 'Opening the gate…',
  'websitePages.invite.full':
    'Every cottage on {farm} is taken for now. Ask your friend to make room.',
  'websitePages.invite.closedTitle': 'This gate is closed',
  'websitePages.invite.closedBody':
    'The link has expired or was taken back. Ask your friend for a new one, or save your own spot at the gate.',
  'websitePages.invite.closedCta': 'Save me a cottage',
  'websitePages.invite.error': "The gate didn't answer. Check your connection and try again.",
  'websitePages.invite.retry': 'Try again',

  'websitePages.waitlist.title': 'Save your spot at the gate',
  'websitePages.waitlist.kicker': 'come in, come in',
  'websitePages.waitlist.body': "We'll write once when Kithfield opens near you. No newsletters.",
  'websitePages.waitlist.email': 'Email',
  'websitePages.waitlist.submit': 'Join the waitlist',

  'websitePages.thanks.title': 'While you wait, who are you?',
  'websitePages.thanks.kicker': "you're on the list",
  'websitePages.thanks.pendingKicker': 'one more step',
  'websitePages.thanks.pending': 'Check your inbox: tap the link in our letter to keep your spot.',
  'websitePages.thanks.body':
    "Pick your critter now and it'll be waiting when the gate opens. You can change your mind later.",
  'websitePages.thanks.save': 'Save {name} the {kind} for me',
  'websitePages.thanks.saveSoon': 'Saving a critter early opens soon.',

  'websitePages.letter.subject': 'Confirm your spot at the Kithfield gate',
  'websitePages.letter.greeting': 'Hello from the farm!',
  'websitePages.letter.ask': 'Tap this link to keep your cottage aside:',
  'websitePages.letter.once':
    "We'll write once more, when Kithfield opens near you. No newsletters.",
  'websitePages.letter.notYou':
    "If you didn't ask for this, let this letter be and we'll forget your email.",
  'websitePages.letter.signOff': 'The owl at Kithfield',
  'websitePages.confirm.title': 'Confirming your spot',
  'websitePages.confirm.working': 'Checking your link…',
  'websitePages.confirm.expired':
    "This link has expired or was already used. Save your spot again and we'll send a fresh one.",
  'websitePages.confirm.again': 'Save my spot again',
  'websitePages.confirm.error': "The gate didn't answer. Try again in a moment.",
  'websitePages.confirm.retry': 'Try again',
  'websitePages.notFound.title': "This path doesn't lead anywhere",
  'websitePages.notFound.body': 'The page may have moved, or the link was mistyped.',
  'websitePages.notFound.home': 'Back to the farm',

  'websitePages.privacy.title': 'Our privacy promise',
  'websitePages.privacy.lead':
    'Last updated 18 October 2026. The short version: your messages are yours, and we never sell or advertise with your data.',
  'websitePages.privacy.keepTitle': 'What we keep',
  'websitePages.privacy.keep':
    "Your account (your email, or your Apple or Google sign-in), your birthday or age check and when you accepted the house rules, your critter, the farms you belong to, and what you share there: messages, photos and voice notes. We also keep your devices' push tokens, what you bought and what it unlocks, and the reports you make or that are made about you. It travels encrypted and is stored encrypted. It is not end-to-end encrypted: our servers can read it, so that search, safety reports and the features you choose can work.",
  'websitePages.privacy.neverTitle': 'What we never do',
  'websitePages.privacy.never':
    'No ads, no data brokers, no selling your data, no recording by the fire. Captions and the Sunday recap stay off until you say yes, and only then do your words leave the farm for them.',
  'websitePages.privacy.partnersTitle': 'Who helps us',
  'websitePages.privacy.partners':
    'Cloudflare runs our servers and stores your data. Expo carries notifications to Apple and Google. LiveKit carries voices by the fire. RevenueCat keeps track of purchases. Apple and Google sign you in when you choose them. Each gets only what its job needs.',
  'websitePages.privacy.waitlistTitle': 'The waitlist',
  'websitePages.privacy.waitlist':
    'If you save a spot, we keep your email to write to you once when Kithfield opens, then we delete it. An email you never confirm is deleted after a week. A keyed fingerprint of it stays, so a critter you picked early finds you when you sign up.',
  'websitePages.privacy.choicesTitle': 'Your choices',
  'websitePages.privacy.choices':
    'Download your keepsakes or delete your account any time, in the app or {link}.',
  'websitePages.privacy.onTheWeb': 'on the web',

  'websitePages.terms.title': 'House rules',
  'websitePages.terms.lead':
    'Kithfield is for friend groups who already know each other. You must be 13 or older (16 where local law requires).',
  'websitePages.terms.kindTitle': 'Be kind on every farm',
  'websitePages.terms.kind':
    'No bullying, hate, harassment or unwanted contact. Keepers can remove critters; we can close accounts that break these rules.',
  'websitePages.terms.purchasesTitle': 'Purchases',
  'websitePages.terms.purchases':
    'Plus and items are sold through the App Store and Google Play. Items you buy are yours for as long as Kithfield runs.',
  'websitePages.terms.leavingTitle': 'Leaving',
  'websitePages.terms.leaving':
    'You can leave any farm quietly, or delete your account. Deleting starts a 30-day wait in which signing in cancels it; after that we delete your data.',

  'websitePages.support.title': 'Help and questions',
  'websitePages.support.search': 'Search help',
  'websitePages.support.farms': 'Farms and critters',
  'websitePages.support.chats': 'Chats and visits',
  'websitePages.support.fire': 'By the fire',
  'websitePages.support.plans': 'Plans and seeds',
  'websitePages.support.patrons': 'Patrons and purchases',
  'websitePages.support.safety': 'Privacy and safety',
  'websitePages.support.popular': 'Popular',
  'websitePages.support.asleepQ': 'Why is my critter asleep?',
  'websitePages.support.asleepA':
    'Critters doze when their person has been quiet for a while. Nothing is lost and nobody keeps count: open the farm or say hi and your critter wakes up to a warm welcome.',
  'websitePages.support.moveQ': 'How do I move a friend into my farm?',
  'websitePages.support.moveA':
    'Open your farm, tap the gate and share the invite link. Your friend picks a critter and moves into a cottage. A farm has room for 24.',
  'websitePages.support.webQ': 'Can I use Kithfield without the app?',
  'websitePages.support.webA':
    'Yes. An invite link opens the farm in your browser too, so you can come in from a computer and get the app later.',
  'websitePages.support.stickersQ': 'How do I get my stickers into WhatsApp?',
  'websitePages.support.stickersA':
    'In the app, open a sticker pack and tap Add to WhatsApp. The pack is saved there with the same critters.',
  'websitePages.support.empty': 'Nothing here matches yet. Write to a real person below.',
  'websitePages.support.stuck': 'Still stuck? Write to a real person →',

  'websitePages.delete.title': 'Ask to delete your account',
  'websitePages.delete.lead':
    "You can do this in the app (You › Settings › Delete account). If you can't open the app, ask here and we'll confirm by email first.",
  'websitePages.delete.label': 'Email on your account',
  'websitePages.delete.critter': 'Your critter, messages, photos and stickers are deleted',
  'websitePages.delete.cottages': 'Your cottages turn back into sketches on every farm',
  'websitePages.delete.days': 'You have 30 days to change your mind',
  'websitePages.delete.purchases': 'Purchases stay with your Apple or Google account',
  'websitePages.delete.submit': 'Send me a confirmation code',
  'websitePages.delete.foot':
    'Required by the App Store and Google Play. We answer within 2 working days and finish within 30.',
  'websitePages.delete.sent':
    'If that email has an account, a letter with a confirmation code is on its way. Nothing is deleted until you confirm.',
  'websitePages.delete.invalid': "That email doesn't look quite right.",
  'websitePages.delete.busy': 'Lots of requests just now. Try again in a minute.',
  'websitePages.delete.unreachable':
    "We couldn't send that just now. Try again, or write to safety@kithfield.com.",

  'websitePages.contact.title': 'Say hello',
  'websitePages.contact.lead': 'A real person reads every message, usually within a day.',
  'websitePages.contact.name': 'Your name',
  'websitePages.contact.email': 'Email',
  'websitePages.contact.topic': "What's it about?",
  'websitePages.contact.topicHelp': 'Help with my farm',
  'websitePages.contact.topicAccount': 'My account',
  'websitePages.contact.topicPurchases': 'Patrons and purchases',
  'websitePages.contact.topicSafety': 'Something unsafe',
  'websitePages.contact.topicOther': 'Something else',
  'websitePages.contact.message': 'Tell us what happened…',
  'websitePages.contact.send': 'Send',
  'websitePages.contact.press': 'Press: {email}',
  'websitePages.contact.safety': 'Safety: {email}',

  'websitePages.press.title': 'Kithfield, for writers and friends of the farm',
  'websitePages.press.kicker': 'press kit',
  'websitePages.press.download': 'Download everything (ZIP)',
  'websitePages.press.blurb':
    'Kithfield is a cosy group chat where friends are critters on a shared farm. Made by oddeggs studio. Launching spring 2027 on iPhone and Android. Contact {email}.',
  'websitePages.press.wordmark': 'Wordmark · PNG',
  'websitePages.press.icon': 'App icon · 1024 px',
  'websitePages.press.critters': '16 critters · transparent PNG',
  'websitePages.press.screenshots': 'Screenshots',
  'websitePages.press.rules':
    "Please don't recolour the critters or redraw the art. Use the art on paper colour #F5EEE2 or night #1b1f3d.",
} as const satisfies EnCatalogue;
