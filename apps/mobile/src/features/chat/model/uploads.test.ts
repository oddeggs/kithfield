import { describe, expect, it } from '@jest/globals';

import { uploadDrafts, uploadOpId, type UploadingMessage } from './uploads';

const voice = (over: Partial<UploadingMessage> = {}): UploadingMessage => ({
  id: 'b1',
  phase: 'uploading',
  opId: null,
  createdAt: 1000,
  message: { command: 'voice', durationMs: 4200, waveform: [10, 200], replyTo: 7 },
  items: [
    {
      key: 'farm/f/0e0c0b0a-0000-4000-8000-000000000001',
      mime: 'audio/mp4',
      bytes: 900,
      failure: null,
    },
  ],
  ...over,
});

describe('messages still going up', () => {
  it('shows a voice note being uploaded as your write on its way', () => {
    const { unsent, refused } = uploadDrafts([voice()], new Set());
    expect(refused).toEqual([]);
    expect(unsent).toEqual([
      {
        opId: uploadOpId('b1'),
        kind: 'voice',
        createdAt: 1000,
        acked: false,
        payload: {
          audio: {
            key: 'farm/f/0e0c0b0a-0000-4000-8000-000000000001',
            mime: 'audio/mp4',
            bytes: 900,
            durationMs: 4200,
          },
          durationMs: 4200,
          waveform: [10, 200],
          replyTo: 7,
        },
      },
    ]);
  });

  it('shows photos going up as a media write with their caption', () => {
    const { unsent } = uploadDrafts(
      [
        voice({
          message: { command: 'media', caption: 'the route' },
          items: [{ key: null, mime: 'image/jpeg', bytes: 5, width: 4, height: 3, failure: null }],
        }),
      ],
      new Set(),
    );
    expect(unsent[0]?.kind).toBe('media');
    expect(unsent[0]?.payload).toEqual({
      items: [{ key: '', mime: 'image/jpeg', bytes: 5, width: 4, height: 3 }],
      caption: 'the route',
    });
  });

  it('leaves a message to the outbox once its write is queued', () => {
    expect(uploadDrafts([voice({ phase: 'sent', opId: 'op-1' })], new Set()).unsent).toEqual([]);
    expect(
      uploadDrafts([voice({ phase: 'uploading', opId: 'op-1' })], new Set(['op-1'])).unsent,
    ).toEqual([]);
  });

  it('shows a message that stopped as failed, with what stopped it', () => {
    const { unsent, refused } = uploadDrafts(
      [
        voice({
          phase: 'failed',
          items: [{ key: null, mime: 'audio/mp4', bytes: 9, failure: 'too_large' }],
        }),
      ],
      new Set(),
    );
    expect(unsent).toEqual([]);
    expect(refused).toMatchObject([
      { opId: uploadOpId('b1'), kind: 'voice', reason: 'too_large', at: 1000 },
    ]);
  });

  it('knows its own drafts by their op id', () => {
    expect(uploadOpId('b1')).not.toBe('b1');
  });
});
