import { describe, expect, it } from '@jest/globals';

import { webm512, webmAudio } from './fixtures.test-data';
import { readWebm } from './webm';

describe('WebM reader', () => {
  it('reads a VP9 clip with alpha', () => {
    const info = readWebm(webm512);
    expect(info).toMatchObject({
      docType: 'webm',
      codec: 'V_VP9',
      width: 512,
      height: 512,
      frameCount: 30,
      hasAudio: false,
      hasAlpha: true,
    });
    expect(info.fps).toBeCloseTo(30, 0);
    expect(info.durationMs).toBeCloseTo(1000, -1);
  });

  it('notices an audio track', () => {
    expect(readWebm(webmAudio)).toMatchObject({ codec: 'V_VP9', hasAudio: true, width: 32 });
  });

  it('refuses something that is not EBML', () => {
    expect(() => readWebm(new Uint8Array([0x00, 0x01, 0x02]))).toThrow();
  });
});
