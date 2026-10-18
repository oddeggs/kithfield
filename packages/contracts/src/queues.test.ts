import * as queues from './queues';
import { at, bea } from './samples.test-data';
import { describeSchemas } from './schema-runner.test-data';

describeSchemas('queue messages', queues, {
  PersonMergedJob: [
    [{ kind: 'person_merged', from: 'p_anon_7', into: bea, at }],
    [
      { kind: 'person_deleted', from: 'p_anon_7', into: bea, at },
      { kind: 'person_merged', from: 'p_anon_7', at },
    ],
  ],
});
