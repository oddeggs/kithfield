import type { DataClient } from '../../data';
import { mediaApiOf, type MediaApi } from './media-api';

/*
 * The media endpoints on this phone: the data layer's API client, with its session. The first
 * screen (or `<MediaUploads />`) under the data layer hands its client over.
 */

let client: DataClient | null = null;
let api: MediaApi | null = null;

/** The data layer's client, once something under it has handed it over. */
export const dataClient = (): DataClient | null => client;

export function handOverDataClient(data: DataClient): void {
  client = data;
}

export function nativeMediaApi(): MediaApi {
  return (api ??= mediaApiOf(() => client?.api ?? null));
}
