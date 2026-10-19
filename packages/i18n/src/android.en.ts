import type { EnCatalogue } from './catalogue-types';

/**
 * Android's own words (`14 Platforms`): the two notification channels people see in system
 * settings, the home-screen widgets beside "Your farm", the predictive back preview, and Google's
 * names where iOS's words name Apple's.
 */
export const androidEn = {
  /* Notification channels */
  'android.channel.plans.name': 'Plans & doorstep',
  'android.channel.plans.description':
    'Plans that need your yes, things on your doorstep, and @mentions.',
  'android.channel.messages.name': 'Every message',
  'android.channel.messages.description': 'Most people leave this off.',

  /* Widgets */
  'android.widget.nextPlan.name': 'Next plan',
  'android.widget.nextPlan.description': 'The next plan, or who’s by the fire when it’s lit.',
  'android.widget.dewdrop.name': 'Quick dewdrop',
  'android.widget.dewdrop.description': 'Leave a dewdrop on a friend’s farm in one tap.',
  'android.widget.dewdrop.title': 'Quick dewdrop',
  /** A friend's row, read aloud. */
  'android.widget.dewdrop.row': 'Leave a dewdrop for {name}',
  'android.widget.dewdrop.empty': 'Friends show up here once your farm has some.',

  /* Predictive back */
  'android.back.toFarm': 'back to the farm',

  /* The system share sheet: something shared into Kithfield picks its farm in a list */
  'android.share.pick': 'Share to which farm?',
  'android.share.cancel': 'Cancel',

  /* Where iOS's words name Apple's things, Android says its own */
  /** Under a permission ask, before the system's own question. */
  'android.ask.next': 'Next, your phone will ask too.',
  'android.code.note': 'It works for 10 minutes.',
  'android.store.unavailable': 'Google Play can’t be reached from this phone right now.',
  'android.delete.purchases': 'Purchases stay with your Google account if you come back',
  'android.delete.biometric': 'You’ll confirm with your fingerprint, face or screen lock.',
  /** The photos ask's quiet way out: the photo picker needs no access, so there's none to give. */
  'android.photos.notNow': 'Not now',
  'android.shop.disclosure':
    ' at {month} a month, or {year} a year, until you cancel. Farm Plus renews at {plus} a month. Payment is charged to your Google Play account when you confirm. It renews unless you cancel before the current period ends. Manage or cancel any time in Google Play › Payments & subscriptions › Subscriptions.',
  'android.shop.priceUnknown': 'Google Play’s price',
  'android.shop.grace': 'Google Play is retrying the payment. Perks stay on meanwhile.',
  'android.shop.cancel': 'Cancel in Google Play',
  'android.fire.captionsFree':
    'Captions are free if Live Caption is on in your phone’s accessibility settings.',
  'android.fire.share': 'Sharing your screen from this phone isn’t ready yet.',
} as const satisfies EnCatalogue;
