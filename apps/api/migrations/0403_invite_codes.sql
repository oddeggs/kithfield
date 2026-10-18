-- The farm's current invite code, sealed with AES-GCM under the INVITE_CODE_KEY secret (bound to
-- the farm id), so keepers and helpers can read their link again (`GET /v1/farms/:id/invite`)
-- while a leaked database still can't be turned into working links. Lookups stay by `code_hash`.
-- NULL for a link made before this column, or while the key isn't set.
ALTER TABLE invites ADD COLUMN code_sealed TEXT;
