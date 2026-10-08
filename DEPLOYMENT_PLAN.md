# Deployment Plan — Re:Material

Status: **Draft, not started.** Nothing in this plan has been executed.

Audience: users in **mainland China**, on phones, tablets and desktops, using mainstream browsers (Chrome, Safari, Baidu Browser, WeChat in-app browser).

Target: a public HTTPS site on a **mainland China cloud server** (Tencent Cloud or Alibaba Cloud) with an **ICP filing (ICP备案)**, running the existing Express + SQLite app.

---

## Decisions

| # | Decision | Answer |
|---|---|---|
| D1 | Secure all work on GitHub `main` before starting | **Yes** — Phase 0 |
| D2 | Branch to execute the plan on | **`deployment`**, created from `main` |
| D3 | Production data | **Start with an empty database** |
| D4 | Real Hub, Zone and category data | **Must be provided before execution starts** — see Prerequisites |
| D5 | Users in mainland China? | **Yes** — Vercel + Turso + R2 dropped (see below) |
| D6 | Domain | A domain with real-name verification, required for ICP filing |

### Why not Vercel + Turso + R2
`*.vercel.app` and `*.r2.dev` are often blocked or very slow in mainland China. Custom domains on Vercel and Cloudflare are unreliable there too, and a site served to mainland users on a domain needs an ICP filing, which only works with a mainland server. Links on unfiled domains are also blocked when shared in WeChat.

### Why a single cloud server
The app already stores everything in SQLite and on local disk, and runs as one long-lived Express process. A mainland cloud server with a persistent disk runs it **with no database rewrite**: no async driver migration, no transaction rework, no upload size limits, and the 30-second expiry timer keeps working. Phase 3 becomes production hardening rather than a rewrite.

---

## Prerequisites — before execution starts

These must be in hand before Phase 0. The code changes that load this data happen in Phase 2.

### P1. Real Hub data (D4)
Currently a placeholder in [database.mjs:55](backend/src/database.mjs): `Material Hub` / "Location to be confirmed" / "Opening hours to be confirmed", `is_placeholder = 1`.

Needed:
- [ ] Hub name
- [ ] Hub location (building, room, how to find it)
- [ ] Opening hours
- [ ] More than one Hub? (The schema supports multiple Hubs; the UI currently assumes one.)

### P2. Zones and categories (D4)
Currently 7 zones mapped one-to-one to 7 categories ([database.mjs:56-58](backend/src/database.mjs)): Board & Foam, Paper & Sheet, Fabric & Textile, Wood, Plastic & Acrylic, Cables, Buttons & Small Items, Other.

Needed:
- [ ] Final category list (keep, rename, add or remove)
- [ ] Final Zone list and which category goes in which Zone (is one-to-one still correct?)
- [ ] Zone QR keys confirmed. They are printed on physical QR codes, so they can't change after printing.

### P3. Accounts and paperwork for hosting
- [ ] Tencent Cloud or Alibaba Cloud account with real-name verification (个人 or 企业). Check student programs for free credits.
- [ ] A domain bought from a registrar that supports real-name verification (e.g. through the same cloud provider)
- [ ] Materials for ICP filing: Chinese ID (individual) or business licence (organisation), phone number, and a site description. An individual filing is for a non-commercial site.

---

## Phase 0 — Secure `main` on GitHub, then create `deployment`

### Current state (checked)
- Remote: `origin` → `github.com/Raquelle-ayV/materialhub.git`
- Local `master` tracks `origin/main`. Local `master`, `improve-ui/UX` and `origin/main` all point at the same commit (`68c16c0`) — no unpushed commits.
- Untracked: `DEPLOYMENT_PLAN.md`, `node-v24.21.0-x64.msi` (installer, must not be committed), `scripts/.tmp-walkthrough.mjs` (temp script).
- `.gitignore` already excludes databases, uploads, `.env`, keys, `demo-runtime/`, `test-data/` and `backups/`. No database or secret files are tracked.

### Tasks
1. Add `*.msi` and `scripts/.tmp-*` to `.gitignore` (or delete those two files).
2. Switch to `master` (tracks `origin/main`), commit `DEPLOYMENT_PLAN.md` and the `.gitignore` change.
3. Run `npm test` and `npm run test:browser` to confirm the baseline passes.
4. Push to `origin main`.
5. Verify: `git status` is clean and `git rev-list --left-right --count origin/main...HEAD` returns `0 0`.
6. Check on github.com that the latest commit is on `main`.
7. `git checkout -b deployment` and `git push -u origin deployment`.
8. Optional: delete the local `improve-ui/UX` branch (it's identical to `main`).

**Done when:** `main` on GitHub contains all work, the working tree is clean, and `deployment` exists locally and on GitHub. All later phases are committed to `deployment`.

---

## Phase 1 — Responsive layout across devices and browsers

### Current state
- The layout is a fixed phone frame: `.app-shell` and `.bottom-nav` are capped at `max-width: 402px` ([app-ui.css](frontend/src/app-ui.css), [mobile.css](frontend/src/mobile.css)).
- [mobile.css:5](frontend/src/mobile.css) forces a **minimum 59px top inset** and **24px bottom inset** to imitate an iPhone notch. On Android phones, tablets and desktops this is wasted space.
- Relies on `100dvh`, which older browser engines do not support.
- Playwright tests only one device: Edge/Chromium at 402×874.
- No external fonts or CDNs are loaded (checked), so nothing is blocked in China. Keep it that way — no Google Fonts, Google Analytics or reCAPTCHA.

### Target devices and browsers

| Class | Widths | Browsers |
|---|---|---|
| Android phones (360–412px) | small to large | Chrome, **Baidu Browser**, **WeChat in-app**, plus vendor browsers (Huawei, Xiaomi) and QQ/UC Browser where possible |
| iPhone (375–430px) | | Safari, WeChat in-app (both WebKit) |
| Tablets (768–1024px+) | portrait / landscape | Safari (iPad), Chrome, Huawei tablets |
| Desktop / laptop (1280px+) | | Chrome, Edge, Safari |

### Tasks
1. **Layout breakpoints**
   - Phone (< 600px): fluid full width, no fixed 402px frame.
   - Tablet (600–1023px): wider content column (~640–720px), two-column material grid on Explore.
   - Desktop (≥ 1024px): centred container (~1100px), multi-column grid; bottom nav becomes a top or side nav.
2. **Safe areas**: replace the forced 59px/24px insets with plain `env(safe-area-inset-*)` plus a small base padding. Add `viewport-fit=cover` to the viewport meta in [index.html](index.html).
3. **Viewport height fallbacks**: `min-height: 100vh; min-height: 100dvh;` wherever `dvh` is used.
4. **Touch and input**: minimum 44×44px tap targets; form inputs ≥ 16px font so iOS Safari doesn't zoom on focus.
5. **Images**: gallery (`height: 310px`) and cards scale with width (`aspect-ratio`, `object-fit`).
6. **Browser compatibility**
   - Baidu Browser, WeChat (Android, X5/XWeb kernel) and UC/QQ use Chromium-based kernels that can lag behind Chrome. Test the production build in each; add `@vitejs/plugin-legacy` only if it fails.
   - Avoid or feature-detect newer CSS (`:has()`, container queries, `dvh`) where a fallback is needed.
7. **Camera fallbacks**: `getUserMedia` can be blocked or missing in Baidu Browser and in-app browsers. Every camera step (Zone QR scan, pickup scan) needs a fallback:
   - Manual Zone code entry when the camera can't start.
   - A clear message: "Open in your phone's browser for camera scanning", with a copy-link button (WeChat users can use "Open in browser" from the ⋯ menu).
   - Photo upload from the gallery (already supported for material photos).
8. **Testing**
   - Add Playwright projects in [playwright.config.mjs](playwright.config.mjs): `Pixel 7` (Chromium), `iPhone 14` (WebKit), `iPad` (WebKit), `Desktop Chrome`, and a 360×640 small screen.
   - Install WebKit (`npx playwright install webkit`).
   - Update tests and screenshots that assume a 402px width.
   - Manual checks on real devices: iPhone (Safari + WeChat), Android (Chrome + Baidu Browser + WeChat).

**Done when:** all Playwright device projects pass, there's no horizontal scrolling at 360px, the layout uses the space on tablet and desktop, and camera flows either work or show a usable fallback in every target browser.

---

## Phase 2 — Remove demo data and scripted users; load real Hub data

### What exists now
- **Demo seed** in [database.mjs:59-79](backend/src/database.mjs): a disabled, non-login user `Material Hub Demo` (`__demo_owner__`) and 4 demo materials with `is_demo = 1`.
- **Sample importer** [scripts/import-samples.mjs](scripts/import-samples.mjs): copies sample materials and photos from `demo-runtime/demo.sqlite` into the real database. It runs on every `npm run dev` ([scripts/dev.mjs](scripts/dev.mjs)).
- **Demo data folders** (local only, git-ignored): `demo-runtime/`, `test-data/ui-review-*`. Tracked: `public/placeholders/` (SVG placeholders for demo materials).
- **Preview and demo scripts**: `scripts/demo-server.mjs`, `scripts/launch-preview.ps1`, `scripts/start-dev.ps1`, `scripts/check-preview-startup.mjs`, `scripts/capture-ui-review.mjs`, `scripts/capture-mobile.mjs`, `scripts/extract-ui-once.mjs`, `启动演示预览.cmd`, `启动预览.cmd`, `预览启动说明.md`.
- **Demo code paths**: `is_demo` checks in `backend/src/app.mjs`, `post-management.mjs`, `reservations.mjs`, `frontend/src/main.tsx`, `frontend/src/reservations.tsx`.
- **Demo-specific tests**: `tests/sample-import.test.mjs`, `tests/sample-safety.test.mjs`, `tests/recent-samples.spec.mjs`, plus demo references in `deposits.spec.mjs`, `post-management.test.mjs`, `reservations.test.mjs`, `reviews.test.mjs`.

### Tasks
1. Remove the demo owner and demo materials from `seed()` in `database.mjs`.
2. Replace the placeholder Hub, Zone and category seed with the real data from P1–P2. Set `is_placeholder = 0`.
3. Delete `scripts/import-samples.mjs` and its call in `scripts/dev.mjs`. Drop the `sample_imports` table if present.
4. Delete the preview/demo scripts listed above, after checking none are still needed for local dev.
5. Remove `is_demo` branches from the backend and frontend, and drop the column with a schema migration (see 3.3).
6. Decide whether `public/placeholders/` is still needed as a fallback when a real photo fails to load; remove if not.
7. Delete demo-only tests. Rewrite tests that relied on demo materials so they create their own data (most already do via `/api/auth/register` + API calls).
8. **Keep** the throwaway test users (`f_owner_…`, `b_collector_…`) created by browser tests — they live in an isolated temporary database ([scripts/browser-server.mjs](scripts/browser-server.mjs)) and never touch real data.
9. Update [README.md](README.md) and [HANDOFF.md](HANDOFF.md) to remove demo-data instructions.
10. Regenerate the Zone QR code sheet from the real Zone keys (`/zone-codes`).

**Done when:** a fresh database contains only the real Hub, Zones and categories, Explore is empty until a real user deposits something, and all tests pass.

---

## Phase 3 — Production hardening for a single China server

### Target architecture

```
Browser ──HTTPS──► Nginx (TLS, gzip, static files, 12MB upload limit)
                    ├─ /            → dist/ (built React app, SPA fallback)
                    └─ /api/*, /zone-codes/* → Node 24 · Express (127.0.0.1:3001)
                                                  ├─ SQLite  /var/lib/rematerial/rematerial.sqlite
                                                  └─ Photos  /var/lib/rematerial/uploads/
Nightly backup job ─► COS / OSS bucket (database copy + uploads)
```

### 3.1 Server configuration
1. Production start script: Express listens on `127.0.0.1` with `PORT` from the environment ([server.mjs:9](backend/src/server.mjs) currently hard-codes `localhost`).
2. `app.set('trust proxy', 1)` so secure cookies and client IPs work behind Nginx.
3. Environment variables: `NODE_ENV=production`, `PORT`, `DATABASE_PATH`, `UPLOAD_DIR`, `COOKIE_SECURE=true`, `FRONTEND_ORIGIN=https://<domain>`. Update [.env.example](.env.example).
4. Serve `dist/` from Nginx (preferred) with SPA fallback to `index.html` for React Router routes.

### 3.2 Security
1. Rate limit `/api/auth/login` and `/api/auth/register` (in-memory is fine on one server).
2. Security headers: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security` (Nginx or Express middleware).
3. Keep `sharp` validation and EXIF stripping for uploads. Set Nginx `client_max_body_size` just above the 10MB limit.
4. Server: non-root service user, firewall open only on 22/80/443, SSH key login only.

### 3.3 Database migrations
1. Add versioned migrations using `PRAGMA user_version` (currently `1`). The first one drops `is_demo` (Phase 2).
2. Migrations run on startup inside a transaction, after taking a backup.

### 3.4 Backups
1. `scripts/backup.mjs`: online SQLite backup (`node:sqlite` `backup()`) plus a copy of `uploads/`, uploaded to a Tencent COS or Alibaba OSS bucket in the same region.
2. Scheduled nightly (systemd timer or cron); keep 14 daily + 8 weekly copies.
3. Documented restore procedure, tested once before launch.

### 3.5 Compliance pages (China)
1. Footer shows the **ICP filing number** linked to `https://beian.miit.gov.cn/` (required once the filing is approved).
2. Footer shows the **public security filing number (公安备案)** after it is obtained (within 30 days of launch).
3. **Privacy policy** and **user agreement** pages, linked from registration (the app collects accounts, photos and activity — PIPL applies). Registration requires agreeing to them.
4. Existing issue reporting covers user-generated content; confirm the owner review process is acceptable as the moderation path.

### 3.6 Deployment tooling
1. `scripts/deploy.sh`: build locally or in CI, upload `dist/` and `backend/` to the server with `rsync`, install production dependencies, restart the service.
2. Service definition (systemd unit or `pm2` ecosystem file) with auto-restart and log rotation.
3. Optional: GitHub Actions workflow on push to `main` — test, build, deploy over SSH. GitHub-to-China connections can be slow; the manual script stays as the fallback.
4. Use the `npmmirror.com` registry on the server so installs are fast.

### 3.7 Testing
1. Existing unit and browser tests keep working (no database change).
2. Add a production smoke test script: health check, register, login, list materials, upload a photo.

**Done when:** the app runs in production mode locally behind Nginx (or equivalent), backups and restore work, compliance pages exist, and all tests pass.

---

## Phase 4 — Provision and deploy

ICP filing usually takes **1–3 weeks**. Start 4.1 as early as possible — it can run in parallel with Phases 1–3.

### 4.1 Provision and file (start early)
1. Buy a **mainland** server: Tencent Cloud Lighthouse (轻量应用服务器) or Alibaba Cloud ECS, Ubuntu 24.04, 2 vCPU / 2–4GB RAM, in a region near users. Most providers require a server purchased for at least 3 months to file for ICP.
2. Buy the domain and complete real-name verification (D6).
3. Submit the **ICP filing** through the cloud provider's filing system (P3 materials). Don't serve the domain until it's approved.
4. Create a COS or OSS bucket for backups.

### 4.2 Staging (while the ICP filing is pending)
1. Option A: a small **Hong Kong** region server (no ICP needed; usually reachable from the mainland, speed varies).
2. Option B: test the mainland server by IP / hosts-file mapping, with no public domain.
3. Deploy the `deployment` branch, run the smoke test, and do a full manual walkthrough on real phones: register → deposit (camera + QR) → reserve as a second user → pickup → report issue → review and relist.

### 4.3 Server setup
1. Install Node 24, Nginx, and the service user; configure the firewall.
2. TLS certificate: free DV certificate from the cloud provider, or Let's Encrypt (`certbot`), with auto-renewal.
3. Create `/var/lib/rematerial/` for the database and uploads, owned by the service user.
4. Install the systemd unit (or pm2), backup timer and log rotation from Phase 3.

### 4.4 Go live (after ICP approval)
1. Merge `deployment` → `main`.
2. Deploy to the mainland server; start with an empty database (D3). Migrations create the schema and seed the real Hub/Zones/categories.
3. Point the domain's DNS at the server; confirm HTTPS.
4. Add the ICP number to the footer; apply for the public security filing within 30 days.
5. Print and place the Zone QR codes.
6. Test sharing the link in WeChat and opening it in each target browser.

### 4.5 After launch
1. Verify the first nightly backup, then test a restore on the staging server.
2. Enable cloud monitoring alerts (CPU, disk, uptime).
3. Watch logs and errors for the first week.
4. Take a server snapshot after setup is stable.

**Done when:** the production domain loads over HTTPS in mainland China on iPhone Safari, Android Chrome, Baidu Browser and WeChat, the ICP number is shown, a full provider → collector flow works, and data survives a redeploy and a server restart.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| ICP filing is delayed or rejected | Launch slips | Start 4.1 first; make sure the site description matches the app; use HK staging meanwhile. |
| ICP eligibility (needs Chinese ID or business licence) | Can't file | Confirm who files (P3) before buying anything. |
| Camera blocked in Baidu Browser / WeChat | Deposit and pickup scans fail | Manual code entry + "open in browser" prompt (Phase 1, task 7). |
| Single server fails | Downtime or data loss | Nightly off-server backups, tested restore, server snapshots. |
| Growth beyond one server | Slow site | Move photos to COS/OSS and the database to managed MySQL/Postgres later. Not needed at launch. |
| GitHub is slow or unreachable from China | Deployments fail | Manual `rsync` deploy script; Gitee mirror if needed. |
| Missing privacy policy or unmoderated user content | Compliance issues | Compliance pages (3.5); owner review and hiding of reported items. |
| The app is English-only | Harder for Chinese users | Out of scope here; the i18n setup already exists for adding Chinese later. |

---

## Rough effort

| Phase | Work | Calendar |
|---|---|---|
| Prerequisites | Depends on getting Hub data and paperwork | — |
| 0 — Secure main + branch | < 1 hour | |
| 1 — Responsive + cross-browser | 1–2 days | |
| 2 — Remove demo data, load real data | 0.5–1 day | |
| 3 — Production hardening | 1–2 days | |
| 4 — Provision and deploy | 0.5–1 day of work | **+ 1–3 weeks** waiting for ICP |
