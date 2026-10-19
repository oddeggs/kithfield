import type { EnCatalogue } from './catalogue-types';

/**
 * The reason iOS shows under each permission alert (the Info.plist usage strings). The app asks
 * in its own words first (`03 Onboarding` 03-06, 03-08, 03-11, 03-12; `10 On the System` 10-12,
 * 10-13), then iOS asks with these. Each one covers every place the app uses that permission.
 * The app config reads this file directly, so it imports nothing but types.
 */
export const systemPermissionsEn = {
  /** Photos to share, the sign-in code on another device (11-13), the lantern by the fire. */
  'systemPermissions.camera':
    'Kithfield uses the camera only when you take a photo to share, scan a code to sign in on another device, or light your lantern by the fire.',
  /** Voice notes (04-12) and the fire room (10-12). */
  'systemPermissions.microphone':
    'Your mic is only used while you record a voice note or sit by the fire, and you always arrive muted.',
  /** Recent photos in the + tray (03-11). */
  'systemPermissions.photos':
    'So your recent photos show in the tray when you share one. Only the photos you choose are ever sent.',
  /** Saving from the viewer and shared media (04-13, 04-14). */
  'systemPermissions.photosAdd':
    'So you can save photos and videos from your farms to your library.',
  /** Deleting the account (11-03) and letting a new device in (11-13). */
  'systemPermissions.faceId':
    'You’ll confirm with Face ID before deleting your account or letting a new device in.',
  /** Inviting friends from the contacts (03-08): read on the phone only, nothing matched or sent. */
  'systemPermissions.contacts':
    'So you can pick friends from your contacts to invite by text. Your contacts stay on this phone, and your address book is never uploaded.',
  /** Directions on the day of a hangout (03-12, 06-06). */
  'systemPermissions.location':
    'On a hangout day, to show the path from where you are. Nothing is shared with the farm, ever.',
  /** Add to calendar (06-04): the event is written, the calendar is never read. */
  'systemPermissions.calendar':
    'So you can add a plan to your calendar. Kithfield only writes the event and never reads your calendar.',
} as const satisfies EnCatalogue;
