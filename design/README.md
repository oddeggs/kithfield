# Design

The export of the Claude Design project **Kithfield: Critter Farm Chat** (`6f134fff-2d85-44fe-b11f-a51fc6dcac4c`). Read only: change the design in Claude Design, then sync.

- Start at `00 Cover.dc.html`: the index of every file and screen.
- Screen ids (`03-01`, `16-12`, …) are stable references; they are not in numeric order inside a file.
- Each file ends with "Notes for the developer": states, interactions and motion per screen.
- `kithfield-art.js` is the single source of all art (`docs/tech-decisions.md` §2). `kf-motion.js` holds the motion samples for `18`.
- `renders/` (made by `tools/design`) holds a PNG per screen id for side-by-side checks.

## Syncing

The DesignSync tool caps a file at 256 KB, and `kithfield-art.js` is larger, so sync through the design app's own file API from a signed-in browser tab on the project:

1. In a Chrome tab on `claude.ai/design/p/6f134fff-2d85-44fe-b11f-a51fc6dcac4c`, run a script that, for each path from the project's file list, `POST`s to `/design/anthropic.omelette.api.v1alpha.OmeletteService/GetFile` with `content-type: application/proto`, `connect-protocol-version: 1`, `x-organization-uuid: <org>` and a protobuf body of field 1 = project id, field 2 = path. Save the responses (base64) to a JSON file.
2. Decode each response: the file content is the longest length-delimited field in the protobuf message.
3. In every `.dc.html`, remove the editor's injected `<style data-omelette-injected>` and `<script data-omelette-injected>` elements (and the newline after each), so `<head>` is followed directly by `<meta charset>`.
4. `git diff --stat` should then show only real design changes.
