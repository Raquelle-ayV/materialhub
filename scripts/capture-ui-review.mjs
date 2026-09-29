// Actual browser walkthrough against an isolated database. Never touches data/ or uploads/.
import { chromium, expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';
import sharp from 'sharp';
import { openDatabase } from '../backend/src/database.mjs';
import { createApp } from '../backend/src/app.mjs';
import { cameraFixture } from '../tests/camera-fixture.mjs';

const output = resolve('artifacts/ui-review');
mkdirSync(output, { recursive: true });
mkdirSync(resolve('test-data'), { recursive: true });
const dataFolder = mkdtempSync(resolve('test-data/ui-review-'));
const databasePath = join(dataFolder, 'review.sqlite');
const uploadDir = join(dataFolder, 'uploads');
let db = openDatabase(databasePath); db.close();
const { importSamples } = await import('./import-samples.mjs');
const samplesImport = await importSamples({ databasePath, uploadDir, backupRoot: join(dataFolder, 'backups') });
db = openDatabase(databasePath);
const base = 'http://127.0.0.1:16173';
process.env.FRONTEND_ORIGIN = base;
const apiServer = createApp(db, { uploadDir }).listen(14001, '127.0.0.1');
await new Promise((yes, no) => { apiServer.once('listening', yes); apiServer.once('error', no); });
const vite = await createServer({ server: { host: '127.0.0.1', port: 16173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:14001', '/zone-codes': 'http://127.0.0.1:14001' } } });
await vite.listen();
const camera = await cameraFixture();
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${camera}`] });
const context = await browser.newContext({ baseURL: base, viewport: { width: 402, height: 874 }, permissions: ['camera'] });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const pageErrors = [], shots = [], checks = [];
page.on('pageerror', e => pageErrors.push(e.message));
const maker = 'ui_review_maker', collector = 'ui_review_collector', password = 'Review-only-2026!';
const materialName = 'UI review foam board';
const sourceSvg = readFileSync(resolve('public/placeholders/foam.svg'));
const photo = await sharp(sourceSvg).resize(600, 450).png().toBuffer();
const alternatePhoto = await sharp(sourceSvg).resize(600, 450).modulate({ brightness: .88 }).png().toBuffer();
const file = (name, buffer = photo) => ({ name, mimeType: 'image/png', buffer });

async function shot(name, description, { top = false } = {}) {
  if (top) await page.evaluate(() => scrollTo(0, 0));
  await page.locator('img').evaluateAll(async images => { await Promise.all(images.map(image => image.decode())); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(output, name + '.png'), animations: 'disabled' });
  shots.push({ filename: name + '.png', description, route: new URL(page.url()).pathname, viewport: '402 × 874' });
  console.log(`Captured ${name}`);
}
async function register(username) {
  await page.goto('/register');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: username, exact: true })).toBeVisible();
}
async function login(username) {
  await page.request.post('/api/auth/logout', { data: {} });
  await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: username, exact: true })).toBeVisible();
}
async function balance() { return (await (await page.request.get('/api/auth/me')).json()).user; }
async function upload() { const r = await page.request.post('/api/uploads', { headers: { 'Content-Type': 'image/png', 'X-File-Name': 'review-fixture.png' }, data: photo }); expect(r.status()).toBe(201); return (await r.json()).photo.id; }
async function fixture(name, completed = false) {
  const r = await page.request.post('/api/deposits', { data: { request_key: crypto.randomUUID(), name, category_id: 1, quantity: 2, unit: 'sheets', dimensions_spec: 'A3, 5 mm', color: 'White', condition: 'Good', notes: 'Isolated UI review test data.', photo_ids: [await upload()] } });
  expect(r.status()).toBe(201); const d = (await r.json()).deposit;
  if (completed) for (const [path, data] of [['arrive', {}], ['verify-zone', { qr: 'REMATERIAL|ZONE|BOARD_FOAM' }], ['placement', { photo_ids: [await upload()] }], ['confirm', {}]]) expect((await page.request.post(`/api/deposits/${d.id}/${path}`, { data })).status()).toBe(200);
  return d;
}
async function scanTo(heading) {
  await expect(page.getByRole('heading', { name: 'Scan Zone QR', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible({ timeout: 30000 });
}

try {
  await register(maker);
  expect((await balance()).balance).toBe(2);
  await page.goto('/');
  await expect(page.locator('.recommended-materials .material-card').first()).toBeVisible();
  expect(await page.locator('.recent-materials').count()).toBe(0);
  const sampleRows = (await (await page.request.get('/api/materials')).json()).materials.filter(m => m.is_demo);
  expect(sampleRows.length).toBeGreaterThanOrEqual(16);
  // Browse through actual links; no localStorage history injection.
  for (const sample of sampleRows.slice(0, 5)) {
    await page.locator(`.recommended-materials a[href="/materials/${sample.id}"]`).click();
    await expect(page.locator('.detail-status')).toContainText('Sample material');
    await page.getByRole('link', { name: 'Back to Explore', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recommended', exact: true })).toBeVisible();
  }
  await page.reload(); await expect(page.locator('.recent-card')).toHaveCount(5);
  const recentHrefs = await page.locator('.recent-card').evaluateAll(cards => cards.map(card => card.getAttribute('href')));
  expect(recentHrefs[0]).toBe(`/materials/${sampleRows[4].id}`);
  await page.locator('.recent-rail').focus(); await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.locator('.recent-rail').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.locator('.recent-rail').evaluate(el => getComputedStyle(el).scrollbarWidth)).toBe('none');
  await page.locator('.recent-rail').evaluate(el => el.scrollLeft = 0); await page.locator('h1').click();
  await shot('01-home-first-screen', 'Homepage: history was created by this test account opening five sample details.', { top: true });
  await page.evaluate(() => scrollTo(0, 1020));
  await shot('02-home-recommended-scrolled', 'Recommended uses a two-column vertical grid of distinct sample materials.');
  expect(await page.evaluate(() => document.body.scrollHeight)).toBeGreaterThan(874 * 3);
  await page.goto(`/materials/${sampleRows[0].id}`); await expect(page.locator('.detail-status')).toContainText('Sample material');
  await shot('03-sample-material-details', 'Sample details are clearly marked; there is no reservation or credit-spending action.', { top: true });
  expect((await page.request.post(`/api/materials/${sampleRows[0].id}/reserve`, { data: { quantity: 1, request_key: crypto.randomUUID() } })).status()).toBe(409);
  expect((await balance()).balance).toBe(2);
  checks.push('Sample materials are browse-only and cannot reserve or spend credits; real detail clicks create persistent deduplicated account history.');

  await page.goto('/deposit');
  await expect(page.locator('.share-entry-cards .share-step')).toHaveCount(3);
  await shot('04-share-home', 'Three stable entries: fresh form, public Hub guide, direct drop-off.', { top: true });
  await page.getByRole('link', { name: 'View guide', exact: true }).click();
  await expect(page).toHaveURL(base + '/hub'); await shot('05-share-public-hub-guide', 'Hub guide is accessible before adding material.', { top: true });
  await page.goto('/deposit'); await page.getByRole('link', { name: "I'm at the Hub", exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No materials ready for drop-off' })).toBeVisible();
  await shot('06-share-empty-drop-off', 'Direct drop-off with no pending material prompts Add material and cannot complete.', { top: true });
  expect((await balance()).balance).toBe(2);
  await page.getByRole('link', { name: 'Add material', exact: true }).click();
  await expect(page.getByLabel('Material name', { exact: false })).toHaveValue('');
  await page.getByLabel('Material photos from gallery').setInputFiles([file('board-front.png'), file('board-side.png', alternatePhoto), file('board-detail.png')]);
  await expect(page.getByAltText('Material photos 3')).toBeVisible();
  await page.getByLabel('Material name', { exact: false }).fill(materialName);
  await page.getByLabel('Category', { exact: false }).selectOption('1');
  await page.getByLabel('Quantity', { exact: false }).fill('2');
  await page.getByLabel('Unit', { exact: false }).fill('sheets');
  await page.getByLabel('Dimensions / specifications', { exact: false }).fill('A3, 5 mm');
  await page.getByLabel('Color', { exact: false }).fill('White');
  await page.getByLabel('Condition', { exact: false }).selectOption('Good');
  await page.getByLabel('Notes', { exact: false }).fill('Isolated UI review material. No real user records or credits are used.');
  await expect(page.getByText('Draft saved to your account.', { exact: true })).toBeVisible();
  await shot('07-a-information-photos-before-delete', 'Information form: material photos allow 1–9, each with its own remove action.', { top: true });
  await page.getByRole('button', { name: 'Remove material photos 2', exact: true }).click();
  await expect(page.locator('.photo-preview')).toHaveCount(2);
  await shot('08-a-photo-removed', 'The second selected photo was removed independently; other photos remain.', { top: true });
  await page.getByLabel('Material photos from gallery').setInputFiles(file('board-side-added-again.png', alternatePhoto));
  await expect(page.locator('.photo-preview')).toHaveCount(3);
  await expect(page.getByText('Draft saved to your account.', { exact: true })).toBeVisible();
  await page.goto('/deposit'); await page.getByRole('link', { name: /Continue draft/ }).click();
  await expect(page.getByLabel('Material name', { exact: false })).toHaveValue(materialName);
  await page.reload(); await expect(page.locator('.photo-preview')).toHaveCount(3);
  await page.evaluate(() => scrollTo(0, 620));
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(400);
  await shot('09-a-information-fields', 'Long form, second segment: quantity, dimensions, condition, notes, persisted draft and Next.');
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Material Recorded', exact: true })).toBeVisible();
  const depositID = Number(new URL(page.url()).pathname.split('/')[2]);
  const d = (await (await page.request.get(`/api/deposits/${depositID}`)).json()).deposit;
  expect((await balance()).balance).toBe(2);
  await shot('11-a-material-recorded', 'Registered material receives a code; it is not yet shelf inventory.', { top: true });
  await page.getByRole('link', { name: 'View drop-off guide', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Go to the Hub', exact: true })).toBeVisible();
  await shot('12-a-drop-off-guide', 'Material-specific guide identifies the assigned Zone.', { top: true });
  await page.goto('/deposit'); await page.getByRole('link', { name: "I'm at the Hub", exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Scan Zone QR', exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Scan Zone QR', exact: true })).toBeVisible();
  await shot('13-a-zone-scan', 'Direct entry resumes the pending material at Zone scanning.', { top: true });
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong zone', { timeout: 15000 });
  await shot('14-a-wrong-zone-feedback', 'A synthetic camera stream is decoded normally; a wrong Zone is rejected.');
  await scanTo('Drop Off Material');
  await expect(page.getByRole('button', { name: 'Confirm drop-off', exact: true })).toBeDisabled();
  await shot('15-a-label-and-shelf', 'Correct Zone confirmation, material label/code and shelf placement instructions.', { top: true });
  await page.getByLabel('Placement photos from gallery').setInputFiles(file('shelf-placement.png'));
  await expect(page.getByRole('button', { name: 'Confirm drop-off', exact: true })).toBeEnabled();
  await page.reload(); await expect(page.getByAltText('Placement photos 1')).toBeVisible();
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await shot('16-a-placement-photo', 'Placement photos are a separate 1–3 photo field; progress survives refresh.');
  await page.getByRole('button', { name: 'Confirm drop-off', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Material Confirmed', exact: true })).toBeVisible();
  await shot('17-a-deposit-complete', 'Drop-off completion awards exactly one credit.', { top: true });
  await page.reload(); expect((await balance()).balance).toBe(3);
  await page.goto('/deposit'); await page.getByRole('link', { name: 'Add material', exact: true }).click();
  await expect(page.getByLabel('Material name', { exact: false })).toHaveValue('');
  await page.goto(`/materials/${d.material_id}`); await expect(page.getByRole('heading', { name: materialName, exact: true })).toBeVisible();
  await page.goto('/'); await expect(page.locator('.recent-card').first()).toHaveAttribute('href', `/materials/${d.material_id}`);
  checks.push('A flow used the real form, autosaved draft, remove/re-add photo, exit/resume, refresh, camera QR validation, placement, completion and one-time reward; fresh Add remains blank after completion; own material details appear in history.');

  await page.request.post('/api/auth/logout', { data: {} }); await register(collector);
  await page.goto('/'); expect(await page.locator('.recent-materials').count()).toBe(0);
  await page.locator(`.recommended-materials a[href="/materials/${d.material_id}"]`).click();
  await expect(page.getByRole('link', { name: 'Reserve', exact: true })).toBeVisible();
  await shot('18-b-real-material-details', 'Real transaction fixture shows current status and 1-credit requirement.', { top: true });
  await page.getByRole('link', { name: 'Reserve', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirm Reservation', exact: true })).toBeVisible();
  await page.getByLabel('Quantity to collect').selectOption('1');
  await page.locator('.reservation-policy').scrollIntoViewIfNeeded();
  await shot('19-b-reservation-confirmation', 'Quantity, 24-hour hold and 1-credit charge are explicit before confirmation.');
  await page.getByRole('button', { name: 'Confirm reservation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reservation Confirmed', exact: true })).toBeVisible();
  const reservationID = Number(new URL(page.url()).pathname.split('/')[2]);
  await shot('20-b-reservation-confirmed', 'Active reservation shows its deadline and held credit.', { top: true });
  expect((await balance()).held).toBe(1);
  // Another context checks the owner-facing active reservation guard, leaving B untouched.
  const ownerContext = await browser.newContext({ baseURL: base, viewport: { width: 402, height: 874 } });
  await ownerContext.request.post('/api/auth/login', { data: { username: maker, password } });
  const ownerPage = await ownerContext.newPage(); await ownerPage.goto('/me/posts');
  await expect(ownerPage.locator('.post-list')).toContainText(materialName);
  const guarded = ownerPage.locator('.post-list article').filter({ hasText: materialName });
  // Post-management UI is supplied by the management change in this same project.
  await expect(guarded).toContainText(/reservation/i);
  await ownerPage.screenshot({ path: join(output, '21-management-active-reservation.png'), animations: 'disabled' });
  shots.push({ filename: '21-management-active-reservation.png', description: 'Owner management preserves an active reservation; deletion/archive is unavailable.', route: '/me/posts', viewport: '402 × 874' });
  await ownerContext.close();
  await page.getByRole('link', { name: 'View pickup guide', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pickup Guide', exact: true })).toBeVisible();
  await shot('22-b-pickup-guide', 'Pickup guide is the existing B flow with Zone and placement information.', { top: true });
  await page.getByRole('button', { name: 'I’m at the Hub', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Scan Zone QR', exact: true })).toBeVisible();
  await shot('23-b-zone-scan', 'Pickup requires the assigned Zone camera scan.', { top: true });
  await scanTo('Check Material');
  await page.getByLabel('Material label code').evaluate(el=>el.scrollIntoView({block:'center'}));
  await shot('24-b-material-code', 'Material code entry follows successful Zone verification.');
  await page.getByLabel('Material label code').fill(d.display_code);
  await page.getByRole('button', { name: 'Confirm material code', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Does this material match the listing?', exact: true })).toBeVisible();
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await shot('25-b-material-match-confirmation', 'Code is validated before final pickup or reporting a problem.');
  await page.getByRole('button', { name: 'Yes, take this material', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pickup completed', exact: true })).toBeVisible();
  await shot('26-b-pickup-complete', 'Pickup completes, decrements stock once and spends the held 1 credit.', { top: true });
  const collected = (await (await page.request.get(`/api/reservations/${reservationID}`)).json()).reservation;
  expect(collected.stock_quantity).toBe(1); expect((await balance()).balance).toBe(1);
  checks.push('B flow used real detail/reserve/guide/camera/code/match/pickup actions; original 24-hour/1-credit/stock behavior was preserved. Active reservation management was checked from the owner account.');

  // Return remains available even after the owner archives the listing.
  await login(maker);
  await page.goto('/'); await expect(page.locator('.recent-card').first()).toHaveAttribute('href', `/materials/${d.material_id}`);
  await page.goto('/me'); await shot('27-profile-signed-in', 'Profile uses the isolated maker account and its actual test credit balance.', { top: true });
  const disposable = await fixture('UI review unused material');
  await page.goto('/me/posts'); await expect(page.locator('.post-list')).toContainText(disposable.name);
  await shot('28-my-posts', 'My posts includes current state, history and permitted management actions.', { top: true });
  const disposableArticle = page.locator('.post-list article').filter({ hasText: disposable.name });
  await disposableArticle.getByRole('button', { name: 'Delete material', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot('29-delete-material-confirmation', 'Deletion asks for confirmation and applies only to the owner’s eligible material.');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete material', exact: true }).click();
  await expect(page.locator('.post-list')).not.toContainText(disposable.name);
  const historyArticle = page.locator('.post-list article').filter({ hasText: materialName });
  await historyArticle.getByRole('button', { name: 'Archive material', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot('30-archive-material-confirmation', 'A material with transaction history is archived while records and credits remain.');
  const beforeArchive = await balance();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive material', exact: true }).click();
  await expect(historyArticle).toContainText('Archived');
  expect((await balance()).balance).toBe(beforeArchive.balance);
  await shot('31-my-posts-archived', 'Archived materials stay in My posts with transaction history.', { top: true });

  await login(collector);
  await page.goto(`/reservations/${reservationID}`); await page.getByRole('link', { name: 'Return Material', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Return Guide', exact: true })).toBeVisible();
  await shot('32-b-return-guide', 'The existing 24-hour return remains available after the owner archives.', { top: true });
  await page.getByRole('button', { name: 'I’m at the Hub', exact: true }).click(); await scanTo('Return Material');
  await page.getByLabel('Return placement photos from gallery').setInputFiles(file('returned-on-shelf.png'));
  await page.getByRole('checkbox').check(); await expect(page.getByRole('button', { name: 'Confirm return', exact: true })).toBeEnabled();
  await shot('33-b-return-placement', 'Return requires new placement evidence and explicit placement confirmation.', { top: true });
  await page.getByRole('button', { name: 'Confirm return', exact: true }).click();
  await expect(page.getByText('Returned', { exact: true })).toBeVisible();
  expect((await balance()).balance).toBe(2);
  await shot('34-b-returned-history', 'Return preserves history and refunds exactly 1 credit.', { top: true });
  checks.push('Owner delete/archive UI was exercised; archive preserves historical reservation and post-archive return/refund, and does not grant an extra reward.');

  const sizes = [];
  for (const width of [402, 393, 320]) {
    await page.setViewportSize({ width, height: width === 393 ? 852 : 874 });
    for (const route of ['/', '/deposit', '/me', `/materials/${sampleRows[0].id}`, '/me/posts', '/deposit/new?fresh=1']) {
      await page.goto(route); await expect(page.locator('h1').first()).toBeVisible();
      await page.locator('img').evaluateAll(async images => { await Promise.all(images.map(image => image.decode())); });
      const geometry = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth, app: document.querySelector('.app-shell').getBoundingClientRect().width }));
      expect(geometry.document).toBeLessThanOrEqual(width); expect(geometry.app).toBe(Math.min(width, 402));
      sizes.push({ width, route, overflow: false });
      if (route === '/') { await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await expect(page.locator('.recommended-materials .material-card').last()).toBeInViewport(); }
    }
  }
  expect(pageErrors).toEqual([]);
  const result = { createdAt: new Date().toISOString(), screenshotViewport: '402 × 874', isolatedDataFolder: dataFolder, samplesImport, accounts: [maker, collector], screenshots: shots, checks, responsiveChecks: sizes, pageErrors };
  writeFileSync(join(output, 'checks.json'), JSON.stringify(result, null, 2));
  writeFileSync(join(output, 'README.md'), `# Re:Material UI review\n\nAll images are screenshots of the running application at 402 × 874 CSS pixels. Data and accounts are isolated from the daily preview. Sample artwork is illustrative; no real user data, uploads, credits or browsing history was changed by this walkthrough. The simulated camera uses actual QR decoding and the normal server validation.\n\nThe same app code runs at the daily preview http://localhost:5173/. The temporary review instance only isolates transaction testing.\n\n## Screenshots in flow order\n\n${shots.map(s => `- **${s.filename}** — ${s.description}`).join('\n')}\n\n## Verified\n\n${checks.map(c => '- ' + c).join('\n')}\n- 402, 393 and 320px viewport checks: home, Share, Profile, sample detail, My posts and the material form have no document-wide horizontal overflow.\n- No browser page errors; every screenshot waits for images to decode successfully.\n\n## Existing limitations\n\n- The real Hub location, hours and route/Zone photos are still explicit placeholders.\n- Camera validation is automated using a synthetic QR camera stream; a physical iPhone camera and device safe-area behavior require a device check.\n- Recently viewed is browser-local and account-separated, not synced between devices.\n`);
  console.log(JSON.stringify({ screenshots: shots.length, checks, responsiveChecks: sizes.length, pageErrors, output }, null, 2));
} catch (error) {
  await page.screenshot({ path: join(output, 'debug-failure.png'), fullPage: true }).catch(() => {});
  writeFileSync(join(output, 'failure.txt'), String(error.stack || error));
  throw error;
} finally {
  await browser.close(); await vite.close(); await new Promise(resolve => apiServer.close(resolve)); db.close();
}
