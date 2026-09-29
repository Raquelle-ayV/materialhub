# Re:Material UI review

All images are screenshots of the running application at 402 × 874 CSS pixels. Data and accounts are isolated from the daily preview. Sample artwork is illustrative; no real user data, uploads, credits or browsing history was changed by this walkthrough. The simulated camera uses actual QR decoding and the normal server validation.

The same app code runs at the daily preview http://localhost:5173/. The temporary review instance only isolates transaction testing.

## Screenshots in flow order

- **01-home-first-screen.png** — Homepage: history was created by this test account opening five sample details.
- **02-home-recommended-scrolled.png** — Recommended uses a two-column vertical grid of distinct sample materials.
- **03-sample-material-details.png** — Sample details are clearly marked; there is no reservation or credit-spending action.
- **04-share-home.png** — Three stable entries: fresh form, public Hub guide, direct drop-off.
- **05-share-public-hub-guide.png** — Hub guide is accessible before adding material.
- **06-share-empty-drop-off.png** — Direct drop-off with no pending material prompts Add material and cannot complete.
- **07-a-information-photos-before-delete.png** — Information form: material photos allow 1–9, each with its own remove action.
- **08-a-photo-removed.png** — The second selected photo was removed independently; other photos remain.
- **09-a-information-fields.png** — Long form, second segment: quantity, dimensions, condition, notes and draft persistence.
- **11-a-material-recorded.png** — Registered material receives a code; it is not yet shelf inventory.
- **12-a-drop-off-guide.png** — Material-specific guide identifies the assigned Zone.
- **13-a-zone-scan.png** — Direct entry resumes the pending material at Zone scanning.
- **14-a-wrong-zone-feedback.png** — A synthetic camera stream is decoded normally; a wrong Zone is rejected.
- **15-a-label-and-shelf.png** — Correct Zone confirmation, material label/code and shelf placement instructions.
- **16-a-placement-photo.png** — Placement photos are a separate 1–3 photo field; progress survives refresh.
- **17-a-deposit-complete.png** — Drop-off completion awards exactly one credit.
- **18-b-real-material-details.png** — Real transaction fixture shows current status and 1-credit requirement.
- **19-b-reservation-confirmation.png** — Quantity, 24-hour hold and 1-credit charge are explicit before confirmation.
- **20-b-reservation-confirmed.png** — Active reservation shows its deadline and held credit.
- **21-management-active-reservation.png** — Owner management preserves an active reservation; deletion/archive is unavailable.
- **22-b-pickup-guide.png** — Pickup guide is the existing B flow with Zone and placement information.
- **23-b-zone-scan.png** — Pickup requires the assigned Zone camera scan.
- **24-b-material-code.png** — Material code entry follows successful Zone verification.
- **25-b-material-match-confirmation.png** — Code is validated before final pickup or reporting a problem.
- **26-b-pickup-complete.png** — Pickup completes, decrements stock once and spends the held 1 credit.
- **27-profile-signed-in.png** — Profile uses the isolated maker account and its actual test credit balance.
- **28-my-posts.png** — My posts includes current state, history and permitted management actions.
- **29-delete-material-confirmation.png** — Deletion asks for confirmation and applies only to the owner’s eligible material.
- **30-archive-material-confirmation.png** — A material with transaction history is archived while records and credits remain.
- **31-my-posts-archived.png** — Archived materials stay in My posts with transaction history.
- **32-b-return-guide.png** — The existing 24-hour return remains available after the owner archives.
- **33-b-return-placement.png** — Return requires new placement evidence and explicit placement confirmation.
- **34-b-returned-history.png** — Return preserves history and refunds exactly 1 credit.

## Verified

- Sample materials are browse-only and cannot reserve or spend credits; real detail clicks create persistent deduplicated account history.
- A flow used the real form, autosaved draft, remove/re-add photo, exit/resume, refresh, camera QR validation, placement, completion and one-time reward; fresh Add remains blank after completion; own material details appear in history.
- B flow used real detail/reserve/guide/camera/code/match/pickup actions; original 24-hour/1-credit/stock behavior was preserved. Active reservation management was checked from the owner account.
- Owner delete/archive UI was exercised; archive preserves historical reservation and post-archive return/refund, and does not grant an extra reward.
- 402, 393 and 320px viewport checks: home, Share, Profile, sample detail, My posts and the material form have no document-wide horizontal overflow.
- No browser page errors; every screenshot waits for images to decode successfully.

## Existing limitations

- The real Hub location, hours and route/Zone photos are still explicit placeholders.
- Camera validation is automated using a synthetic QR camera stream; a physical iPhone camera and device safe-area behavior require a device check.
- Recently viewed is browser-local and account-separated, not synced between devices.
