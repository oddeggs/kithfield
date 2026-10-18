import { describe, expect, it } from '@jest/globals';
import { SURFACES_VERSION } from '@kithfield/contracts';
import { day, night, planColours } from '@kithfield/theme';

import { imageJobs } from './image-plan';

const jobs = imageJobs({ version: SURFACES_VERSION, lang: 'en', writtenAt: 0, farms: [] }, 0);
const drawing = (name: string) => jobs.find((j) => j.name === name)?.drawing;

describe('the surfaces’ images', () => {
  it('draw the seed on the theme’s seed tile', () => {
    expect(drawing('seed.png')).toMatchObject({ background: planColours.day.seedTile });
  });

  it('colour the icons with theme tokens', () => {
    expect(drawing('icon-lantern.png')).toMatchObject({ attrs: { color: day.ink } });
    expect(drawing('icon-check.png')).toMatchObject({ attrs: { color: planColours.day.check } });
    expect(drawing('icon-mic.png')).toMatchObject({ attrs: { color: night.moon } });
    expect(drawing('icon-muted.png')).toMatchObject({ attrs: { color: night.moon } });
  });
});
