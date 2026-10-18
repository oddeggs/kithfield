import { describe, expect, it } from 'vitest';
import { type z } from 'zod';

import backend from '../../../docs/backend.md?raw';
import farmModel from '../../../docs/farm-model.md?raw';
import { COMMAND_KINDS } from './commands';
import { EVENT_KINDS, FARM_WRITTEN_KINDS } from './events';
import {
  COTTAGE_CLIENT_FRAME_TYPES,
  COTTAGE_SERVER_FRAME_TYPES,
  CottageClientFrame,
  CottageServerFrame,
  FARM_CLIENT_FRAME_TYPES,
  FARM_SERVER_FRAME_TYPES,
  FarmClientFrame,
  FarmServerFrame,
} from './frames';

/** The text of a numbered section (`## 2. …`) of a doc, up to the next section. */
const section = (doc: string, n: number) => {
  const match = new RegExp(`\\n## ${n}\\. [^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`).exec(doc);
  if (!match?.[1]) throw new Error(`section ${n} not found`);
  return match[1];
};

/** A table's body rows, as cells, skipping the header and the divider. */
const rows = (text: string, header: string) => {
  const start = text.indexOf(header);
  if (start < 0) throw new Error(`table "${header}" not found`);
  const lines = text.slice(start).split('\n');
  const end = lines.findIndex((line) => !line.startsWith('|'));
  return lines.slice(2, end < 0 ? undefined : end).map((line) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
};

/** The first word of every code span in a cell: `` `ack {opId, seq}` `` gives `ack`. */
const names = (cell: string | undefined) =>
  [...(cell ?? '').matchAll(/`([a-z_]+)[^`]*`/g)].map((m) => m[1] ?? '');

/** The event log table in the farm model, group by group. */
const kindRows = rows(section(farmModel, 2), '| Group | Kinds |');
const docKinds = (group?: string) =>
  kindRows.filter(([g]) => group === undefined || g === group).flatMap(([, cell]) => names(cell));

/** Every kind of care the families table counts. */
const docTendingKinds = rows(section(farmModel, 3), '| Family | Counts | Dew |').flatMap(
  ([, cell]) => names(cell),
);

/** The farm protocol table: frames by direction ("both" counts for each). */
const frameRows = rows(section(backend, 3), '| From | Frame | Meaning |');
const docFrames = (from: 'phone' | 'farm') =>
  frameRows.filter(([f]) => f === from || f === 'both').flatMap(([, cell]) => names(cell));

/** A type has a schema when a bare frame of it is not waved through as `unknown`. */
const hasSchema = (schema: z.ZodType<{ type: string }>, type: string) => {
  const parsed = schema.safeParse({ type });
  return !parsed.success || parsed.data.type !== 'unknown';
};

const sorted = (list: readonly string[]) => [...new Set(list)].sort();

describe('agreement with the docs', () => {
  it('lists exactly the event kinds the contracts know', () => {
    expect(docKinds()).toHaveLength(new Set(docKinds()).size);
    expect(sorted(docKinds())).toEqual(sorted(EVENT_KINDS));
  });

  it('keeps the kinds written by the farm out of commands', () => {
    const farmOnly = docKinds('Written by the farm');
    expect(farmOnly).toContain('farm_created');
    for (const kind of [...farmOnly, 'joined', 'farm_opened', 'hibernate', 'gate', 'traded']) {
      expect(FARM_WRITTEN_KINDS, kind).toContain(kind);
      expect(COMMAND_KINDS).not.toContain(kind);
    }
  });

  it('lets a phone write every kind of care, and grows nothing from reactions', () => {
    expect(docTendingKinds.length).toBeGreaterThan(15);
    for (const kind of docTendingKinds) expect(COMMAND_KINDS, kind).toContain(kind);
    expect(docTendingKinds).not.toContain('reaction');
  });

  it('lists exactly the frames each side of the farm socket sends', () => {
    expect(sorted(docFrames('phone'))).toEqual(sorted(FARM_CLIENT_FRAME_TYPES));
    expect(sorted(docFrames('farm'))).toEqual(sorted(FARM_SERVER_FRAME_TYPES));
    for (const type of docFrames('phone')) {
      expect(hasSchema(FarmClientFrame, type), type).toBe(true);
    }
    for (const type of docFrames('farm')) {
      expect(hasSchema(FarmServerFrame, type), type).toBe(true);
    }
  });

  it('has a schema for exactly the frame types each socket knows', () => {
    const sockets = [
      [FarmClientFrame, FARM_CLIENT_FRAME_TYPES],
      [FarmServerFrame, FARM_SERVER_FRAME_TYPES],
      [CottageClientFrame, COTTAGE_CLIENT_FRAME_TYPES],
      [CottageServerFrame, COTTAGE_SERVER_FRAME_TYPES],
    ] as const;
    for (const [schema, types] of sockets) {
      for (const type of types) expect(hasSchema(schema, type), type).toBe(true);
      expect(hasSchema(schema, 'not_a_frame')).toBe(false);
    }
    expect(sorted(COTTAGE_SERVER_FRAME_TYPES)).toEqual(['chat', 'chats', 'error', 'safety_note']);
  });
});
