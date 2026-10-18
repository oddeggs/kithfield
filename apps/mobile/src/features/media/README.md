# features/media

Sending and showing photos, video, voice notes and files. Import from `features/media`. The server
side is `apps/api/src/media` (its README has the design) and `apps/media-worker`.

## Sending: `useUpload()`

```tsx
const upload = useUpload();

// Photos and video (the + tray's Photo, 05-02; a critter card's Photos, 04-07)
const assets = await pickFromLibrary(); // or captureWithCamera()
await upload.sendPicked(farm, assets, { caption, replyTo });

// Files (05-10), from expo-document-picker
await upload.sendDocuments(farm, picked.assets);

// Voice notes (04-12): record with expo-audio, then
const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS); // AAC .m4a, mono, 64 kbit/s, metering on
await upload.sendVoice(farm, { uri: recorder.uri, durationMs, waveform /* ≤ 64 levels 0–255 */, replyTo });

upload.cancel(batch, item); // the ✕ on a tile; without `item`, the whole message
upload.retry(batch);        // items that failed
upload.sendSmaller(batch);  // 12-06: photos again at 1600 px
```

Each call prepares the files and answers a batch id at once; the rest happens in the queue:

- **Prepared on the phone**: photos re-encoded as JPEG at 2048 px on the long side; video compressed
  by iOS as it is picked (H.264 1280×720 with AAC, `prepare.ts`; camera clips up to 150 s); voice
  notes as AAC. Everything is copied into the queue's folder in the app's documents. Something
  that can't go throws `MediaRefused` (`too_large` over 100 MB, `unreadable`) before it is queued.
- **Uploaded**: two items at a time, each as one presigned PUT or in 10 MiB parts above 50 MB, in a
  background URLSession, so it keeps going while the app is in the background. A dropped
  connection retries with back-off (2 s, 5 s, 15 s… up to 5 minutes); an expired or refused URL
  asks for a new one.
- **Survives restarts**: the queue is saved as it changes (`media-uploads/queue.json`), with each
  multipart part's ETag as it lands, so after the app is closed it resumes with the parts it
  hasn't sent.
- **Sent**: once every item of a message is up, the queue writes the `media` (photos, video, files,
  with the caption) or `voice` command with the keys into the farm's outbox (`client.send`).
  The chat then draws the pending write like any other.

Mount `<MediaUploads />` once under the data layer so the queue resumes at launch (until then it
starts with the first screen that uses these hooks).

## Showing progress: `<UploadProgress>` and friends

`useUploads(farm)` lists the messages going up on a farm (and those sent in the last day, so your
own photos show from the phone while the farm catches up). Each `UploadBatch` has `items` with
`phase` (`waiting`, `uploading`, `done`, `failed`), `sentBytes` and `failure`.

| Piece | Where | What |
|---|---|---|
| `<UploadProgress item onCancel>` | over a photo tile (fills its parent) | 12-06's ring: the dimmed tile, the paper-white fill growing continuously on the UI thread, the ✕ |
| `<UploadBar item>` | inside a file's bubble | 05-10's 4-point bar |
| `<UploadStatusLine batch slow>` | under the message | "Sending slowly · 1 of 4" (or "Sending · 1 of 4") |
| `<SlowUploadNotice onSendSmaller>` | below the message | 12-06's card; "Wait for Wi-Fi" shows only with `onWaitForWifi` |
| `useUploadSlow(batch)` | | true under 48 KB/s over the last 5 s |
| `<UploadingMessage batch …>` | | all of the above as 12-06 draws your side of the chat |

## Showing media: `useMediaUrl(key)` and `<MediaImage>`

`useMediaUrl(key)` answers the file on this phone while the queue holds it, else a signed URL from
`POST /v1/media/read-urls` (asked for together, kept until 2 minutes before they expire, null for
keys you can't see). `<MediaImage mediaKey>` shows a photo with `expo-image`, cached on disk by the
key, so a new URL for the same photo is never downloaded twice. Use the URL the same way for
`expo-video` and `expo-audio` players.

## Not here yet

- **Wait for Wi-Fi** needs to tell Wi-Fi from cellular, and no module in the app does
  (`expo-network` would).
- **Forwarding** media to another farm: a key stays readable only on its own farm, so forwarding
  needs a server-side copy into the other farm.
