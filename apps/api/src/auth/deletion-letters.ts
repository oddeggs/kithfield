import type { Lang } from '@kithfield/contracts';
import { t } from '@kithfield/i18n';

import { cottageOf } from '../cottage/stub';
import type { Bindings } from '../env';
import { CODE_SENDER } from './email-code';

/* The letters about deleting an account: the website's code, and the day it is scheduled for. */

export function deletionLetter(lang: Lang, code: string): { subject: string; text: string } {
  return {
    subject: t(lang, 'deletionCode.subject', { code }),
    text: [
      t(lang, 'deletionCode.greeting'),
      '',
      t(lang, 'deletionCode.code', { code }),
      t(lang, 'deletionCode.lifetime'),
      t(lang, 'deletionCode.wait'),
      '',
      t(lang, 'deletionCode.notYou'),
      '',
      t(lang, 'deletionCode.signOff'),
    ].join('\n'),
  };
}

/** The day, as the person reads dates, in their own time zone. */
export function purgeDay(lang: Lang, purgeAt: number, timeZone: string): string {
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(purgeAt);
}

export function scheduledLetter(lang: Lang, date: string): { subject: string; text: string } {
  return {
    subject: t(lang, 'deletionScheduled.subject', { date }),
    text: [
      t(lang, 'deletionScheduled.greeting'),
      '',
      t(lang, 'deletionScheduled.when', { date }),
      t(lang, 'deletionScheduled.cancel'),
      '',
      t(lang, 'deletionScheduled.notYou'),
      '',
      t(lang, 'deletionScheduled.signOff'),
    ].join('\n'),
  };
}

/**
 * Writes to someone who signed in with an email (never to an install that didn't) on the day their
 * deletion was scheduled: when it happens, and that signing in again cancels it. In their
 * language and time zone, from their cottage.
 */
export async function sendScheduledLetter(
  env: Bindings,
  person: string,
  purgeAt: number,
): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT email FROM people WHERE id = ? AND coalesce(is_anonymous, 0) = 0',
  )
    .bind(person)
    .first<{ email: string }>();
  if (row === null) return;
  const { settings, zoneKnown } = await cottageOf(env, person).settings();
  const date = purgeDay(settings.lang, purgeAt, zoneKnown ? settings.timeZone : 'UTC');
  const { subject, text } = scheduledLetter(settings.lang, date);
  await env.EMAIL.send({ from: CODE_SENDER, to: row.email, subject, text });
}
