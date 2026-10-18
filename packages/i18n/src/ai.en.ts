import type { EnCatalogue } from './catalogue-types';

/**
 * The AI features that send words or voices out, as Cloudflare Workers AI runs them: the corrected
 * wording for asking first (the fire's captions, the Sunday recap, and voice-note captions, which
 * has no design of its own and follows the captions sheet), AI and your data, and the fire's
 * caption sheet. What Workers AI does with what it is sent comes from Cloudflare's data terms: it
 * never trains on it, and keeps none of it once a request is answered.
 */
export const aiEn = {
  /** Who runs the AI: named wherever a sheet says where words or voices go. */
  'ai.provider': 'Cloudflare',
  /** The lead's "an AI service we work with", made exact. */
  'ai.consent.processor':
    'Workers AI, run by {provider}, the company that already runs Kithfield’s servers',
  /** Under "What they can do with it" on every sheet, in place of the 30-day promise. */
  'ai.consent.terms':
    '{provider} never trains AI on it and keeps none of it once the work is done.',

  /* Asking first: captions by the fire */
  'ai.consent.captions.lead':
    'To caption and translate the fire, voices are sent to {processor}. Here is exactly what happens.',
  'ai.consent.captions.staysText':
    'Your chats, photos, contacts and location are never sent. Captions are never saved: they vanish when the fire goes out.',

  /* Asking first: the Sunday recap */
  'ai.consent.recap.lead':
    'To write a short letter about the week on {farm}, the farm’s messages are sent to {processor}.',
  'ai.consent.recap.leadAll':
    'To write a short letter about the week on your farms, their messages are sent to {processor}.',
  'ai.consent.recap.sent':
    'The text of this week’s messages and the kinds of care given, only from friends who said yes. Names are never sent: they are filled in here. No photos, voice notes or visits are sent.',
  'ai.consent.recap.kept':
    'The letter is kept with the farm’s week. Take your words back and every letter they went into is deleted.',

  /* Asking first: captions for voice notes */
  'ai.consent.voiceNotes.eyebrow': 'before we turn this on',
  'ai.consent.voiceNotes.title': 'Voice-note captions use an outside AI',
  'ai.consent.voiceNotes.lead':
    'When a friend asks to read one of your voice notes, its audio is sent to {processor}. Here is exactly what happens.',
  'ai.consent.voiceNotes.sent':
    'The audio of one voice note of yours, only when a friend on that farm asks to read it. Voice notes you forward are never sent.',
  'ai.consent.voiceNotes.use': 'Turn it into text, and translate it into your friend’s language.',
  'ai.consent.voiceNotes.stays': 'What stays here',
  'ai.consent.voiceNotes.staysText':
    'The caption stays with the voice note on the farm, and goes when you unsend it.',
  'ai.consent.voiceNotes.others':
    'Say no and your voice notes are never captioned. Friends see a quiet “…”.',
  'ai.consent.voiceNotes.yes': 'Caption my voice notes',
  'ai.consent.voiceNotes.no': 'Not now',

  /* AI and your data */
  'ai.data.voiceNotes': 'Voice-note captions',
  'ai.data.voiceNotesOn': 'Allowed · your voice notes, when a friend asks',
  'ai.data.voiceNotesOff': 'Not allowed · your voice notes are never captioned',
  'ai.data.takeBackText':
    'Switching something off stops sending right away. {provider} keeps nothing once the work is done, and you can ask us to delete the captions and letters we kept.',
  'ai.data.forgotten': 'We’re deleting what we kept for this. It will be gone within a day.',

  /** The Sunday letter's name for a farm that has none. */
  'ai.letter.theFarm': 'the farm',

  /* The fire's caption sheet */
  'ai.fire.captionsLead':
    'Captions appear as friends talk, translated into your language if you like. The voices of friends who said yes go to {processor} and come back as words: nothing is recorded or saved, and nobody is told.',
} as const satisfies EnCatalogue;
