import { useEffect, useState } from 'react';

import { chatApi } from './chat-api';

/*
 * Signed reads of a farm's media: asked for in batches, kept until a minute before they expire,
 * and shared by every bubble, tile and the viewer.
 */

const MARGIN_MS = 60_000;
const cache = new Map<string, { url: string; expiresAt: number }>();
const waiting = new Map<string, ((url: string | null) => void)[]>();
let queued: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function settle(key: string, url: string | null) {
  for (const done of waiting.get(key) ?? []) done(url);
  waiting.delete(key);
}

async function flush() {
  timer = null;
  const keys = [...new Set(queued)];
  queued = [];
  for (let i = 0; i < keys.length; i += 50) {
    const batch = keys.slice(i, i + 50);
    try {
      const { urls } = await chatApi.readUrls(batch);
      for (const u of urls) cache.set(u.key, { url: u.url, expiresAt: u.expiresAt });
      for (const key of batch) settle(key, cache.get(key)?.url ?? null);
    } catch {
      for (const key of batch) settle(key, null);
    }
  }
}

/** A signed URL for a media key, or null when it can't be read (gone, or offline). */
export function signedUrl(key: string): Promise<string | null> {
  const held = cache.get(key);
  if (held && held.expiresAt - MARGIN_MS > Date.now()) return Promise.resolve(held.url);
  return new Promise((resolve) => {
    waiting.set(key, [...(waiting.get(key) ?? []), resolve]);
    queued.push(key);
    timer ??= setTimeout(() => void flush(), 30);
  });
}

/** The URL to draw a piece of media from: undefined while asking, null when it can't be read. */
export function useSignedUrl(key: string | null | undefined): string | null | undefined {
  const held = key ? cache.get(key) : undefined;
  const fresh = held && held.expiresAt - MARGIN_MS > Date.now() ? held.url : undefined;
  const [url, setUrl] = useState<string | null | undefined>(fresh);
  useEffect(() => {
    if (!key) {
      setUrl(null);
      return;
    }
    let live = true;
    void signedUrl(key).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [key]);
  return key ? (url ?? fresh) : null;
}
