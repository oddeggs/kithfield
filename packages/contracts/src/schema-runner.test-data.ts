import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/** Every exported schema of the modules has samples: valid ones round-trip unchanged, invalid ones fail. */
export const describeSchemas = (
  title: string,
  modules: Record<string, unknown>,
  samples: Record<string, [valid: unknown[], invalid: unknown[]]>,
  skip: readonly string[] = [],
) =>
  describe(title, () => {
    const schemas = Object.entries(modules).filter(
      (entry): entry is [string, z.ZodType] => entry[1] instanceof z.ZodType,
    );

    it('has samples for every exported schema', () => {
      const names = schemas.map(([name]) => name);
      expect(names.filter((n) => !(n in samples) && !skip.includes(n))).toEqual([]);
    });

    it.each(schemas.filter(([name]) => name in samples))(
      '%s round-trips and rejects bad input',
      (name, schema) => {
        const [valid, invalid] = samples[name] ?? [[], []];
        for (const value of valid) {
          const parsed = schema.parse(value);
          expect(parsed).toEqual(value);
          expect(schema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
        }
        for (const value of invalid) {
          expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(false);
        }
      },
    );
  });
