# Re:Material

Mobile-first campus material sharing. React + TypeScript + Vite, Express, and a persistent SQLite database. Node.js **24 or newer** is required (uses the built-in `node:sqlite` module).

## Run locally

On this Windows workspace, the helper also finds the existing bundled Node runtime when Node is not on PATH:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 install
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 dev
```

With a standard Node/npm installation:

```sh
npm install
npm run dev
```

- Frontend: **http://localhost:5173**
- Backend health: **http://localhost:3001/api/health**
- Stop the foreground development servers with Ctrl+C. Use `localhost`, not a different hostname, for the same session.
- Vite proxies `/api` to Express. Both services start together; port conflicts are reported rather than silently changing the frontend URL.

The current release is English-only. Language controls are hidden, and `/me/settings` redirects to Profile. Existing account and browser language preferences are preserved but ignored by the interface until bilingual support is complete.

## Publisher review and auth header update

Login and Create Account hide the global guest Log in link in the header. The form's submit button remains; other pages keep their existing guest login link, signed-in credit display and navigation.

Profile and My Posts show Action required with a pending-report count. Each reported material shows Needs Review, reason, reporter notes, problem photos, report time and “This material is temporarily hidden from Explore.”

Only the material owner can resolve the report:

- **Review and relist:** check the material at the Hub, edit actual available quantity, Condition, Notes and 1–3 placement photos, then confirm the Hub check. Current placement photos can be kept or replaced with new owner uploads. Quantity is the actual shelf total, excluding units still held by collectors. The transaction sets this quantity (does not add it again), restores Available and resolves the report as relisted.
- **Remove material:** a second confirmation archives the listing as Removed / Archived (database closed). Records/photos remain intact and the listing stays hidden. There is no unarchive control. An eligible old return can still restore its quantity without reopening the archived listing.

The report ID makes both operations idempotent. Version checks prevent an old form overwriting an intervening return or inventory update. Replays cannot overwrite a newer reservation/report. Resolution never changes credits: the reporter already received the single hold release when submitting the issue. B's reservation remains Issue Reported, with “Issue resolved — relisted” or “Issue resolved — removed.”

**Demo limitation:** old demo listings belong to a disabled, non-login demo owner. They have no real publisher who can review them. Reported demo listings remain Needs Review and hidden; no ordinary user receives their action-required reminder or permission to resolve them.

Manual check: report a real A material as B → log in as A → Profile / My Posts → Review and relist → edit and confirm the Hub check → verify Explore and B's result. Repeat on another material with Remove material; use Keep material once before confirming removal. Refresh/relogin to verify persistence. Also check the guest header on /login, /register and Explore. No admin/notification center, SMS, email, redesign or deployment is added.

## What works in this stage

- English phone layout centered at max-width 402px even in ordinary desktop browsers / VS Code Simple Browser. Minimum height is 100dvh, not a fixed 874px; top/bottom safe-area insets and a conservative top gap protect the header. No Dynamic Island is drawn into the page.
- Username/password registration, login, logout, persistent HTTP-only session cookie.
- Exactly one 2-credit registration reward, a durable credit account and a credit-history page.
- Username uniqueness is case-insensitive. Usernames accept 3–24 letters, numbers or underscores; passwords accept 8–128 characters. Passwords use salted scrypt, not plaintext.
- Four clearly labeled demo materials, seven category/Zone records and illustrated SVG placeholders. Demo seeding is idempotent and does not create fake user rewards.
- SQLite-backed Explore: Recently Added and Recommended for You use newest available materials first. Search names, categories, material codes and Notes; combine Category, Condition and Availability filters. Existing labeled demo records remain alongside real deposits.
- Complete A flow: Add Information, Material Recorded, Go to the Hub, Scan Zone QR, Drop Off Material with placement photos, and Material Confirmed. New drafts, uploaded photos and registered progress are stored on the server. Home Active Tasks and My Posts resume pending deposits.
- A2 validates all required fields, Other custom category, Not applicable dimensions, and 1–9 real JPG/JPEG/PNG/WebP images up to 10MB each. The first image is the cover. Camera and gallery upload are supported. Actual image decoding validates content and removes EXIF metadata.
- Camera-only QR scanning verifies the category's Zone; wrong zones are blocked. Arrival and verified zone survive refresh/login. Category edits invalidate the zone and its old placement photos; other edits keep verification. Core information is locked after confirmation, except the quantity, Condition, Notes and placement photos allowed by the owner-only issue review workflow.
- A6 requires 1–3 placement photos. Confirm drop-off atomically makes the material Available, writes inventory/activity/credit entries and awards exactly 1 credit. Duplicate requests or refresh cannot duplicate the reward.
- B stage one: real material details and horizontally scrollable photos; reserve 1 or 2 units through a confirmation page. Each reservation locks the entire record, holds 1 credit and expires after 24 hours. Stock quantity is preserved; available quantity becomes zero while reserved.
- Profile / My Reservations persists Active, Cancelled and Expired records, quantities and exact deadlines across refresh, login and restart. Cancellation releases the held credit and stock lock. Expiry spends the held credit and releases the stock lock. The provider receives an Activity entry. Active B tasks appear before pending A tasks; My Posts reflects the actual stock status.
- SQLite transactions, unique ledger constraints and persistent request keys protect against duplicate clicks and competing users. Startup, a 30-second job and API requests settle expiry; cancellation rechecks the deadline within its transaction.
- B pickup: My Reservations → Pickup Guide → automatic camera Zone scanning → Check Material with a manually entered label code → Yes, take this material → Pickup completed → Done / Explore. Wrong zones or codes do not change inventory or credits.
- Pickup atomically spends the original 1-credit hold (no second charge), deducts the reserved quantity and marks the reservation Collected. Remaining stock becomes Available, or the material becomes Collected when empty.
- Problem reports offer five reasons, require notes for Other and accept 0–3 photos. A transaction sets Issue Reported, releases the hold once and marks the material Needs Review. My Posts shows the reason; the provider can view notes/photos, and the reserving user can view the Open report.
- Full returns within 24 hours of collection: Return Guide, a fresh scan of the original Zone, 1–3 newly uploaded placement photos, and a physical placement confirmation. The transaction restores the collected quantity, marks Returned, updates the current placement photos and refunds 1 credit once. It never awards another deposit credit.
- Collection times, report status, return scans and saved return photos survive refresh, login and restart. New photos become the current placement; previous photo records/files remain intact. Confirmation checkboxes are not restored, and material label input is never prefilled.
- No admin backend, favorites/sharing, interest-based recommendations or partial returns are provided in this release. Hub location/hours/map/site photos remain placeholders. No bilingual rollout, visual redesign, new demo images or deployment is included.

Create your own account in the UI. There is no shared default login. Browser tests create accounts only in a fresh temporary database with a separate upload directory; existing application data is never used.

## Persistence and configuration

The database is `data/rematerial.sqlite` (including SQLite WAL files while running). Restarting does not reset accounts, balances, sessions, materials or progress. Uploaded images are stored under `uploads/` and served through ownership/publication checks. Session lifetime is seven days; logout invalidates the server-side session. The initial schema is in `backend/src/schema.sql`; the additive v2 migration in `database.mjs` introduces draft and idempotent registration tables without changing existing accounts. Additive v4 adds reservation request keys; v3 language preferences are preserved. Additive v5 adds issue reason labels and issue/return photo associations without rebuilding existing tables or rewriting images. Additive v6 adds only the nullable material_photos.review_issue_id to identify reviewed placement batches; historical photos stay intact. Keep both data/ and uploads/ to retain your data.

`DATABASE_PATH`, `UPLOAD_DIR`, `PORT`, `FRONTEND_ORIGIN` and `COOKIE_SECURE` can be set as environment variables before starting. Defaults are SQLite under `data/`, images under `uploads/`, port 3001 and frontend origin `http://localhost:5173`. `.env.example` documents the values; no automatic `.env` loader is used. If changing ports, also update the Vite proxy and allowed frontend origin. Use `COOKIE_SECURE=true` when deploying behind HTTPS, not for plain local HTTP.

Real Hub location, opening hours, routes and photos remain visibly marked placeholders. No production infrastructure, SMS, email or external image service is needed. The preview uses local illustrations and system fonts.

## Verify and build

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 browser
```

Or `npm test` and `npm run build`. The API integration test uses its own temporary database and checks duplicate/concurrent registration, unique rewards, authentication, logout, invalid credentials, origin protection, single active reservation constraints, and database/session persistence after a restart.

Use `npm run test:browser` (or the `browser` helper above) for UI checks. Playwright starts its own isolated API and frontend on ports 13001 and 15173 using IPv4 loopback, refuses to reuse an existing server, and stores test data in a new OS temporary directory. No development servers are required. Playwright uses installed Microsoft Edge with a fresh isolated profile and 402×874 viewport. A flow testing feeds generated wrong/correct QR images through a browser test-camera video; it exercises the actual camera decoder, not a production bypass or manual QR field. API tests also verify file limits, permissions, field validation, draft/relogin/restart recovery, category invalidation, unique codes, concurrent confirmation and transaction rollback. Layout checks cover 320px, 402px and a desktop window; screenshots go to `test-results/`.

After building, `npm start` or `scripts/start.ps1 start` serves the compiled frontend and API together at **http://localhost:3001**. Development preview still uses port 5173.

## Manually verify the A flow

1. Open http://localhost:5173 and log in. Note your starting credits.
2. Choose Share Material → Start now. Complete the required information and upload 1–9 photos. Try a missing field, an unsupported file, or Other without a custom category. For small items, choose Not applicable for dimensions.
3. Refresh before submitting to check the account draft. Click Next: a unique M-number appears and the status is Ready for drop-off. No credit is awarded yet. Demo records already use M001–M004; new materials continue the sequence.
4. Follow View drop-off guide → I’m at the Hub. Open **http://localhost:5173/zone-codes** on a second screen or print it. Enable the camera and point it at a wrong Zone QR, then the correct one. There is no manual entry fallback.
5. On Drop Off Material, refresh or log out/in and resume from Active Tasks / My Posts. A verified record goes back to the placement page without another scan. Editing Category requires a new scan; editing the name does not.
6. Write the displayed material code on a label and attach it. Place the material and upload 1–3 photos. Confirm drop-off must remain disabled with no photo.
7. Confirm drop-off: the completion page shows +1 credit earned. Refresh, revisit the record and check Credit History: the reward occurs only once. Done returns to Explore; the material is now publicly available.

Simple Browser can preview all layouts, but its host iframe may restrict camera access. If it rejects the camera, open the same localhost URL in a normal browser and allow camera permission. A phone's localhost refers to the phone, not your development PC; physical-phone camera testing needs a reachable HTTPS development endpoint. No production cloud deployment is required.

## Manually verify B reservations, pickup, reports and returns

1. Finish a normal A-side deposit with at least 2 units. Use a different B account to reserve 1 unit through the existing confirmation page. The entire record is locked, physical stock is unchanged, and 1 credit is held.
2. Profile → My Reservations → Active reservation → View pickup guide. Check the reserved quantity, material code, Zone and placement photo. Hub location, opening hours, route and site photos are explicitly marked placeholders.
3. Open http://localhost:5173/zone-codes on a second screen. Click I’m at the Hub and allow the camera. Scan a wrong Zone first: an error appears and the scanner remains open. Scan the correct Zone to reach Check Material.
4. Enter a wrong M-number and check the error. Enter the correct code from the material label, then choose Yes, take this material. Pickup completed → Done returns to Explore. My Reservations shows Collected; stock falls by 1 and the already-held credit is spent without reducing available credits again. Refresh/relogin preserves the collection time.
5. Within 24 hours, open the collected reservation → Return Material. Follow Return Guide, scan the original Zone again, put the entire reserved quantity back and upload 1–3 new placement photos. Refresh or log out/in at this stage to verify saved photos/scan progress. Confirm the physical placement, then Confirm return. My Reservations shows Returned, stock is restored and 1 credit is refunded once. Repeated requests cannot add more stock or credits.
6. For another active reservation, scan and confirm the label, then choose No, report a problem. Pick a reason, add mandatory notes for Other (optional for the rest), and optionally add up to 3 photos. Submit. My Reservations shows Issue Reported / Open, the held credit is released, and the material disappears from Explore, including All listed materials. The provider's My Posts shows Needs Review and the reason; open the record for notes/photos.
7. Existing cancellation still releases a hold; reservation expiry still spends it. The isolated backend tests verify the exact 24-hour return boundary without changing real data or waiting a day.

A missing or wrong material can also be reported from Check Material before label verification; the correct Zone scan is still mandatory. This covers cases where the expected label cannot be found.

## Inventory and credit consistency

Reservation stock is not deducted until pickup. Pickup changes balance/held by −1/−1; reporting changes them by 0/−1; a confirmed return changes them by +1/0. Each business event uses a SQLite BEGIN IMMEDIATE transaction with unique settlement/refund and inventory keys. Replays return the existing result.

For reports, stock_quantity stays unchanged because the actual missing/damaged quantity is unverified. Needs Review uses the existing database state unavailable: the whole record is frozen and hidden, with zero available quantity. It stays paused until its publisher checks it at the Hub and explicitly relists or archives it. No automatic relisting or admin feature is included.

Returns restore only the old reservation's collected quantity. A newer active reservation remains Reserved; existing Needs Review or Closed locks remain in place. Otherwise the material becomes Available. All historical placement photos are retained; only the latest confirmed placement is shown as current. My Posts and Explore fetch shared SQLite data on entry/focus and poll at 10–15 second intervals, rather than using push updates.

## Previous verification (before the publisher review update)

Final verification on 2026-09-23: **30/30 backend tests passed, 10/10 browser tests passed, TypeScript --noEmit passed, Vite production build passed.** The browser total includes all 7 existing regressions and 3 new fulfillment tests, with no retries in the final run. The new tests also check collection timestamps after login, saved return photos/scan progress after login, UI double clicks and additional duplicate request replays. Fixed a stale-route-state redirect that skipped the pickup success page, and explicitly associated the report reason label with its select. Earlier first-page startup timeouts were absent from the final full rerun.

All new tests use independent temporary databases and upload directories. Browser tests use separate 15173/13001 ports, refuse to reuse an existing test server and drive Edge with real QR images in a test camera video. getUserMedia and ZXing perform actual decoding, including wrong and correct Zones; the production app has no manual Zone field or scan bypass. API calls prepare test fixtures, verify results and replay completed requests; the pickup/report/return journeys themselves run through UI controls.

Coverage includes the original A and B reservation regressions, wrong labels, duplicate pickup/return, issue hold release, 24-hour boundaries, independent return scans, fresh photo ownership, review/reservation/closed inventory locks, transaction rollback, and restart/relogin recovery. Expected fault-injection errors in backend logs are rollback tests. Screenshots in test-results/ include Check Material at 320/402/1440px, Pickup Guide, return placement, problem reports and provider Needs Review.

The build command runs TypeScript --noEmit before Vite. Local preview uses http://localhost:5173 and API http://localhost:3001. Work stops at this release scope.

## Current update verification

Final results: **38/38 backend tests passed, 13/13 browser tests passed; TypeScript --noEmit and Vite production build passed.** All original A/B regressions remain in the suites. New screenshots are saved as test-results/review-*.png. Local preview and API health were verified at ports 5173/3001 and remain running. New review tests use their own temporary SQLite and upload directories. They cover owner-only access, report details/counts, relist validation, stale inventory versions, transaction rollback, duplicate actions, later reservation/report protection, archival, persistence and the disabled demo owner. Browser tests cover auth headers and both publisher resolution flows with B-side outcomes.