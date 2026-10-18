# Media

Photos, video, voice notes and files live in R2 (`MEDIA`, `kithfield-media[-dev]`) under
`farm/<farm>/<uuid>`. The API hands out upload and read URLs; bytes never pass through it in
production. Contracts: `packages/contracts/src/http/media.ts`.

## Routes (`/api/v1`)

| Route | Who | What |
|---|---|---|
| `POST /media/upload-url {farm, kind, bytes, mime}` | a member (session or the device's action key) | A presigned PUT, or presigned 10 MiB parts above 50 MB. 404 off the farm, 429 over 60 a minute (`MEDIA_LIMIT`, per person), 400 for a type the kind doesn't take, 413 over the kind's size (`rules.ts`), 503 when uploads can't be offered |
| `POST /media/complete {key, uploadId, parts}` | the uploader, still a member | Joins the parts; checks the size against what was declared. Safe to repeat: once done, or when R2 finished it but the answer was lost (the object is there at its size), it answers 200; 409 when a part is missing or its ETag doesn't match |
| `POST /media/abort {key, uploadId?}` | the uploader | Cancels an upload nothing points at yet: aborts its multipart upload, deletes a landed single PUT, forgets the key. 204 |
| `POST /media/read-urls {keys}` | a signed-in member | Signed read URLs on the media Worker, 30–60 minutes long, on a half-hour grid. Only finished uploads (a single PUT counts once R2 holds its declared size) are signed; keys off the caller's farms, unknown to the index, or quarantined are left out |
| `POST /media/copy {fromFarm, keys, farm}` | a member of both farms | Forwarding: copies finished, unquarantined media into the other farm as the forwarder's (`{keys: {old: new}}`), once per person, farm and key. 404 off either farm or for an unfinished key, 400 for a key not on `fromFarm`, 429 with the upload limit |
| `PUT /media/upload-proxy/farm/<farm>/<uuid>?…&sig=` | anyone holding the URL | Development only (below) |

Every key handed out is recorded in the media index (`media_objects`, migrations 0350 and 0352):
uploader, farm, kind, type, size, multipart id, when it finished, when an event first pointed at it,
and quarantine. Nothing else about the content. Forwarding copies are in `media_copies` (0351).

## Uploads: presigned in production, a signed proxy in development

- **Deployed**: R2's S3-compatible endpoint (`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`)
  with an R2 API token (secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, Object
  Read & Write on the media bucket). `sigv4.ts` presigns with WebCrypto (tested against Amazon's
  published example). Each URL signs `content-length` (and a single PUT its `content-type` and
  `if-none-match: *`), so the phone can only send the size and type it declared, and a single PUT
  only ever creates its object: a repeat answers 412, which the phone takes as done. Multipart uploads are created and completed
  through the binding; R2 lets the S3 endpoint upload their parts.
- **`wrangler dev` and the Workers test pool** simulate the binding but have no S3 endpoint, so
  presigning can't work there. In the `dev` environment *without* the R2 token, the API signs URLs
  to its own upload proxy instead, with `MEDIA_SIGNING_KEY` over the same facts (key, size, type,
  part, expiry), and writes through the binding into the local bucket the media Worker reads. The
  phone can't tell the difference: same flow, same ETag-per-part, same complete. The proxy is
  never served in `prd`, nor in deployed `dev` once the token is set. This keeps real behaviour on
  a laptop (signatures, sizes, multipart, resume) with no stub of R2.

Part URLs live 24 hours, so an upload interrupted by a weak signal or a closed app resumes its
missing parts with the URLs it has. R2 aborts multipart uploads left unfinished after 7 days.

## Reads: the media Worker

`apps/media-worker` serves `GET https://media[-dev].kithfield.com/<key>?exp=&sig=`. It is on its
own host rather than `<host>/m/*` because files are user content: on a separate origin they can't
read the site's cookies or script against it, and anything that isn't a photo, video or voice note
is served as an attachment with `nosniff` and a sandboxing CSP. It checks the signature and expiry,
then the quarantine flag (every request, cache hits included), then serves from R2 with ranges.

Photos are put in the zone cache (Cache API, keyed by the object, not the signature) with
`Cache-Control: public, max-age=86400, immutable`: the CSAM Scanning Tool hashes images as they
enter the kithfield.com zone's cache. Video, voice and files are `private` and not cached.

Locally: run it with `wrangler dev --env dev` on its own port with the same `--persist-to` as the
API (they share the local bucket and database) and the same `MEDIA_SIGNING_KEY`, and start the API
with `--var MEDIA_ORIGIN:http://localhost:<media port>` and `--var
MEDIA_UPLOAD_PROXY_ORIGIN:http://localhost:<api port>` (`wrangler dev` rewrites each request to the
route's host, so the API can't see the address the phone used).

## CSAM: quarantine

Cloudflare's CSAM Scanning Tool is on for kithfield.com. On a match it blocks the URL and emails
the founder. `quarantineMedia(env, {target, source, by, note, at})` (and `mediaAdminRoutes`, for
the moderation API to mount at `/admin/v1/media/quarantine` behind its Access guard):

1. marks the key quarantined in the index: `read-urls` stops signing it and the media Worker
   answers 404 for it at once, cached or not;
2. moves the object to `quarantine/<key>` (with `from` metadata), out of reach of unsend, account
   deletion and farm deletion, held as evidence;
3. opens an urgent `child_safety` report through `registerUrgentReportOpener` (the moderation
   lane's reports table); until one is registered it logs that the report is owed, and the next run
   opens it.

Each step is safe to repeat.

### The manual flow when Cloudflare's notice arrives

1. Don't open the image. Copy the flagged URL from the email.
2. In the moderation console, open *Media → Quarantine*, paste the URL, add the notice's reference
   as the note. (Until the console has that screen: `POST /admin/v1/media/quarantine
   {"url": "<flagged URL>", "note": "<notice reference>"}` through the admin Worker.)
3. The urgent report appears at the top of the queue (`source: hash_match`). Remove the event it
   came from (`unsend {by: safety}`) and ban the account from the report.
4. Report to NCMEC (or the national hotline that applies) within the legal deadline, with the
   evidence key, uploader and time from the report. Keep the evidence until counsel says it may go;
   delete it then with `wrangler r2 object delete kithfield-media/quarantine/<key>`.
5. If the match was wrong, Cloudflare's dashboard can unblock the URL; leave the quarantine in
   place unless counsel and the safety lead agree to restore it.

## Deletion

- **Unsend**: the farm object deletes the event's keys from R2; `forgetMedia(db, keys)` drops their
  index rows (the farm object should call it beside `MEDIA.delete`).
- **Account deletion**: `deletePersonMedia(env, person)` deletes everything the person uploaded on
  every farm and visit, aborts their unfinished multipart uploads and drops the rows. Run it before
  their D1 rows go.
- **A farm that is gone**: `deleteFarmMedia(env, farm)`.

None of them touch quarantined evidence.

## The daily sweep

`sweepMedia(env, now)` runs on the API's daily cron: uploads left unfinished for 7 days are given up
on (multipart aborted, rows and any bytes deleted). With `{unreferenced: true}` it also deletes
finished uploads no event pointed at within the week; that needs the farm object to call
`markMediaReferenced(db, keys, at)` as it commits a `media`, `voice` or `link` event, so it is off
until that is wired.
