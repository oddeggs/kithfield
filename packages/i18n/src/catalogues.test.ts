import { describe, expect, it } from 'vitest';

import { en, features, vi } from './catalogues.generated';
import { findFeatureProblems } from './completeness';
import { findHouseWordProblems } from './house-words';

describe('every feature catalogue', () => {
  it.each(features.map((feature) => [feature.file, feature] as const))(
    '%s has every English key in Vietnamese, filled in, with the same placeholders',
    (_file, feature) => {
      expect(findFeatureProblems(feature)).toEqual([]);
    },
  );

  it.each(features.map((feature) => [feature.file, feature] as const))(
    '%s keeps to the house words in English',
    (_file, feature) => {
      expect(findHouseWordProblems(feature.en)).toEqual([]);
    },
  );
});

describe('the merged catalogues', () => {
  it('lose no key to another feature', () => {
    const total = features.reduce((sum, feature) => sum + Object.keys(feature.en).length, 0);
    expect(Object.keys(en)).toHaveLength(total);
  });

  it('have the same key set in English and Vietnamese', () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });
});
