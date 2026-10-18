# Undesigned states

States the product needs that no design covers. Each is built from existing components and copy
in the house voice, and is logged here so design can draw it later.

| Screen | State | Reason |
|---|---|---|
| 03-02 Sign in (email) | The letter that carries the 6-digit sign-in code: subject with the code for autofill, greeting, the code, its 10-minute lifetime, a "not you" line and the owl's sign-off, in en and vi (`packages/i18n/src/sign-in-code.*.ts`), plain text | 03-02 says "Email sends a 6-digit code" but no design shows the letter |
| 17-01 Landing, waitlist form | Sending, "invalid email", "too many tries" and "the gate didn't answer" notes in the hand line under the form; the button reads "Saving…" while it sends; after it, "Almost there: we sent a letter to confirm your email" | The design shows only a saved state, before double opt-in |
| 17-05 Invite page | "Opening the gate…" while the preview loads; "This gate is closed" (title, body, a button to the waitlist) for an unknown or expired code; a farm with no room left; a retry when the API doesn't answer. The kicker reads "you're invited" and the headline names only the farm | The notes name the closed gate but no design draws it; the invite preview carries no inviter |
| 17-06 Waitlist | Only the email field: no phone (phone sign-in is deferred) and no "I'm on iPhone" (the request has no platform yet) | Docs and contracts over design |
| 17-06, 17-07 Waitlist | The confirmation letter (double opt-in, linking to `/waitlist/confirm#<token>`), the confirm page (checking, expired link with a way back to the waitlist, retry), and the thank-you page's "one more step: check your inbox" until the link is opened; "you're on the list" shows only after it | The notes ask for double opt-in; no design shows the letter or the confirm step |
| 17-07 Thank you | "Saving a critter early opens soon" under the save button | The waitlist request can't carry a critter yet |
| 17-07 Thank you | The "tell a friend: everyone who joins from your link saves a cottage next to yours" line is left out, deferred until referral links exist | Nothing records who invited whom to the waitlist |
| Site-wide | A 404 page ("This path doesn't lead anywhere", back to the farm) in the text-page layout | No design for an unknown address |
| 17-08 Privacy | A "The waitlist" section, and "what we keep" rewritten: no end-to-end encryption in v1 (`docs/backend.md` §8) | The draft promised end-to-end encryption and on-device captions |
| 17-10 Support | Answers that open under each question, a topic filter on the six tiles and a "nothing matches" line | The design shows only the list |
| 17-11 Account deletion | The "code is on its way" and error notes under the button | The design shows only the form |
