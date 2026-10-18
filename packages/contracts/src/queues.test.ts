import * as queues from './queues';
import { at, bea, farm } from './samples.test-data';
import { describeSchemas } from './schema-runner.test-data';

const audio = 'farm/f_thursday_lot/0192f1e2-3b4c-7d5e-8f60-123456789abd';
const recap = { kind: 'recap', farm, week: '2026-10-18', langs: ['en', 'vi'], at };
const caption = { kind: 'voice_caption', farm, seq: 51, audio, author: bea, lang: 'vi', at };

describeSchemas('queue messages', queues, {
  PersonMergedJob: [
    [{ kind: 'person_merged', from: 'p_anon_7', into: bea, at }],
    [
      { kind: 'person_deleted', from: 'p_anon_7', into: bea, at },
      { kind: 'person_merged', from: 'p_anon_7', at },
    ],
  ],
  RecapJob: [
    [recap, { ...recap, langs: ['en'] }],
    [
      { ...recap, langs: [] },
      { ...recap, langs: ['en', 'vi', 'fr'] },
      { ...recap, week: 'this week' },
    ],
  ],
  VoiceCaptionJob: [
    [caption],
    [
      { ...caption, audio: 'elsewhere/x' },
      { ...caption, lang: 'fr' },
      { ...caption, seq: 0 },
    ],
  ],
  AiJob: [
    [recap, caption],
    [
      { ...recap, kind: 'summarise' },
      { kind: 'voice_caption', farm },
    ],
  ],
});
