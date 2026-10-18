import { LanguageTag } from '@kithfield/contracts';

/*
 * The Workers AI models the AI features run on (`docs/tech-decisions.md` §1), called through the
 * `AI` binding. Nothing here keeps what it sends: Workers AI holds inputs and outputs only while a
 * request runs and never trains on them (Cloudflare's Workers AI data usage terms).
 */

/** Speech to text, for voice notes (and the fire's live captions). */
export const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';
/** Text translation between the languages friends speak. */
export const TRANSLATION_MODEL = '@cf/meta/m2m100-1.2b';
/** The Sunday recap letter: a multilingual instruct model that writes Vietnamese well. */
export const RECAP_MODEL = '@cf/google/gemma-4-26b-a4b-it';

/** The slice of the `AI` binding these features use, so tests can stand in for it. */
export type AiBinding = Pick<Ai, 'run'>;

/** What a model answered, as JSON; each reader checks the shape it expects. */
type Answer = Record<string, unknown>;

const run = async (ai: AiBinding, model: string, input: object): Promise<Answer> => {
  const answer: unknown = await (ai.run as (m: string, i: object) => Promise<unknown>)(
    model,
    input,
  );
  if (typeof answer !== 'object' || answer === null) throw new Error(`${model} answered nothing`);
  return answer as Answer;
};

/** Whisper names some languages in full; the app speaks in ISO 639-1 tags. */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  english: 'en',
  vietnamese: 'vi',
};

/** A tag for the language Whisper heard, or `und` when it named none we can read. */
export const languageTagOf = (heard: unknown): LanguageTag => {
  if (typeof heard !== 'string') return 'und';
  const lower = heard.trim().toLowerCase();
  const tag = LANGUAGE_NAMES[lower] ?? lower;
  return LanguageTag.safeParse(tag).success ? tag : 'und';
};

/** Base64 of audio bytes, built in slices so a long voice note never overflows the stack. */
export const base64Of = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

export type Transcript = { said: LanguageTag; text: string };

/** Transcribes speech in its own language. Silence comes back as empty text. */
export async function transcribe(ai: AiBinding, audio: Uint8Array): Promise<Transcript> {
  const answer = await run(ai, WHISPER_MODEL, {
    audio: base64Of(audio),
    task: 'transcribe',
    vad_filter: true,
  });
  const info = answer['transcription_info'] as { language?: unknown } | undefined;
  const text = typeof answer['text'] === 'string' ? answer['text'].trim() : '';
  return { said: languageTagOf(info?.language), text };
}

/** Translates text between two languages by their tags. */
export async function translate(
  ai: AiBinding,
  text: string,
  from: LanguageTag,
  to: LanguageTag,
): Promise<string> {
  const answer = await run(ai, TRANSLATION_MODEL, {
    text,
    ...(from === 'und' ? {} : { source_lang: from }),
    target_lang: to,
  });
  const translated = answer['translated_text'];
  if (typeof translated !== 'string') throw new Error('translation answered no text');
  return translated.trim();
}

export type ChatMessage = { role: 'system' | 'user'; content: string };

/** One reply from the recap's text model, as plain text. */
export async function write(
  ai: AiBinding,
  messages: readonly ChatMessage[],
  maxTokens: number,
): Promise<string> {
  const answer = await run(ai, RECAP_MODEL, {
    messages,
    max_completion_tokens: maxTokens,
    temperature: 0.7,
    // The letter needs no step-by-step reasoning; answering at once keeps it quick.
    chat_template_kwargs: { enable_thinking: false },
  });
  if (typeof answer['response'] === 'string') return answer['response'];
  const choices = answer['choices'] as { message?: { content?: unknown } }[] | undefined;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('the text model answered no text');
  return content;
}
