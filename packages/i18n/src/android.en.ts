import type { EnCatalogue } from './catalogue-types';

/**
 * Android's own words (`14 Platforms`): the notification channels people see in
 * system settings, the home-screen widgets beside "Your farm", and the predictive back preview.
 */
export const androidEn = {
  /* Notification channels */
  'android.channel.plans.name': 'Plans & doorstep',
  'android.channel.plans.description':
    'Plans that need your yes, things on your doorstep, and @mentions.',
  'android.channel.messages.name': 'Every message',
  'android.channel.messages.description': 'Most people leave this off.',
  'android.channel.quiet.name': 'A few things',
  'android.channel.quiet.description':
    'The quiet roundup when a farm has been busy. Never a sound.',

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
} as const satisfies EnCatalogue;
