// Design audit: starts an isolated copy of the app (fresh database, never the development data),
// builds realistic records through the real API, then saves a full-page screenshot of every page
// at phone size (390×844) into design-audit/<folder>/.   Usage: node scripts/design-audit.mjs before|after
import { mkdtempSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { openDatabase } from '../backend/src/database.mjs';
import { createApp } from '../backend/src/app.mjs';
import { cameraFixture } from '../tests/camera-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'design-audit', process.argv[2] || 'before');
mkdirSync(out, { recursive: true });
const PORT = 15273, API = 13101, base = `http://127.0.0.1:${PORT}`;

const folder = mkdtempSync(join(tmpdir(), 'rematerial-audit-'));
process.env.FRONTEND_ORIGIN = base;
const db = openDatabase(join(folder, 'audit.sqlite'));
const api = createApp(db, { uploadDir: join(folder, 'uploads'), authAttemptsPerMinute: 1000 }).listen(API, '127.0.0.1');
await new Promise((ok, fail) => { api.once('listening', ok); api.once('error', fail); });
const vite = await createServer({ configFile: resolve(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: PORT, strictPort: true, proxy: { '/api': `http://127.0.0.1:${API}` } } });
await vite.listen();

const video = await cameraFixture();
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] });
const shots = [], problems = [];
const roll = readdirSync(resolve(root, 'public/roll')).filter(f => f.endsWith('.jpg')).map(f => readFileSync(resolve(root, 'public/roll', f)));
const zones = { 1: 'BOARD_FOAM', 2: 'PAPER_SHEET', 3: 'FABRIC_TEXTILE', 4: 'WOOD' };

async function account(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  const page = await context.newPage();
  page.on('pageerror', e => problems.push(`${name}: ${e.message}`));
  if (name) { const r = await page.request.post(`${base}/api/auth/register`, { data: { username: name, password: 'design-audit-2026' } }); if (!r.ok()) throw new Error(`register ${name}: ${await r.text()}`); }
  return page;
}
async function call(page, path, data) {
  const r = await page.request.post(`${base}/api${path}`, { data });
  if (!r.ok()) problems.push(`API ${path}: ${r.status()} ${(await r.text()).slice(0, 120)}`);
  return r.ok() ? r.json() : {};
}
async function upload(page, i) { const r = await page.request.post(`${base}/api/uploads`, { headers: { 'Content-Type': 'image/jpeg', 'X-File-Name': 'photo.jpg' }, data: roll[i % roll.length] }); return (await r.json()).photo.id; }
async function deposit(page, i, f, { publish = true, verify = false } = {}) {
  const d = (await call(page, '/deposits', { request_key: randomUUID(), quantity: 2, unit: 'pieces', dimensions_spec: '', color: '', condition: 'Like new', notes: '', reference_url: '', photo_ids: [await upload(page, i)], ...f })).deposit;
  if (publish || verify) { await call(page, `/deposits/${d.id}/arrive`, {}); await call(page, `/deposits/${d.id}/verify-zone`, { qr: `REMATERIAL|ZONE|${zones[f.category_id]}` }); }
  if (publish) { await call(page, `/deposits/${d.id}/placement`, { photo_ids: [await upload(page, i + 1)] }); await call(page, `/deposits/${d.id}/confirm`, {}); }
  return d;
}
async function shot(page, name, path, prepare) {
  try {
    if (path) await page.goto(base + path, { waitUntil: 'networkidle' });
    if (prepare) await prepare(page);
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
    shots.push(name);
  } catch (e) { problems.push(`${name}: ${e.message.split('\n')[0]}`); }
}

try {
  // Provider with available, pending, draft and reported materials
  const maya = await account('maya');
  const listed = [];
  for (const [i, f] of [[0, { name: 'Grey linen fabric', category_id: 3, unit: 'pieces', dimensions_spec: '60 × 60 cm', color: 'Grey' }], [5, { name: 'Plywood sheets', category_id: 4, unit: 'boards', dimensions_spec: '30 × 40 cm', condition: 'New' }],
    [8, { name: 'White foam board', category_id: 1, unit: 'boards', dimensions_spec: 'A3, 5 mm', color: 'White' }], [2, { name: 'Kraft paper roll', category_id: 2, unit: 'rolls', dimensions_spec: '30 cm wide', condition: 'New' }],
    [3, { name: 'Floral cotton fabric', category_id: 3, dimensions_spec: '20 × 80 cm' }], [6, { name: 'Basswood boards', category_id: 4, unit: 'boards', quantity: 4, dimensions_spec: '50 × 60 cm' }]]) listed.push(await deposit(maya, i, f));
  const pending = await deposit(maya, 9, { name: 'Burlap fabric', category_id: 3, dimensions_spec: '70 × 80 cm' }, { publish: false });
  const verified = await deposit(maya, 10, { name: 'Cotton rag paper', category_id: 2, unit: 'sheets', dimensions_spec: '20 × 30 cm' }, { publish: false, verify: true });
  await call(maya, '/deposit-draft', { request_key: randomUUID(), name: 'Jute twine', category_id: '', custom_category_name: '', quantity: '', unit: '', dimensions_spec: '', dimensions_not_applicable: false, color: '', condition: '', reference_url: '', notes: '', photo_ids: [] });

  // Collector: active, collected, returned, reported and cancelled reservations
  const leo = await account('leo');
  const reserve = async d => (await call(leo, `/materials/${d.material_id}/reserve`, { quantity: 1, request_key: randomUUID() })).reservation;
  const zoneOf = d => `REMATERIAL|ZONE|${zones[d.category_id]}`;
  const pickUp = async (r, d) => { await call(leo, `/reservations/${r.id}/pickup`, { qr: zoneOf(d) }); };
  const collected = await reserve(listed[1]); await pickUp(collected, listed[1]);
  const returned = await reserve(listed[2]); await pickUp(returned, listed[2]);
  await call(leo, `/reservations/${returned.id}/return/start`, {}); await call(leo, `/reservations/${returned.id}/return/verify-zone`, { qr: zoneOf(listed[2]) });
  await call(leo, `/reservations/${returned.id}/return/photos`, { photo_ids: [await upload(leo, 4)] }); await call(leo, `/reservations/${returned.id}/return/confirm`, { placed: true });
  const reported = await reserve(listed[3]); await call(leo, `/reservations/${reported.id}/verify-zone`, { qr: zoneOf(listed[3]) });
  await call(leo, `/reservations/${reported.id}/issues`, { reason: 'Does not match the listing', notes: 'The roll is much shorter than listed.', photo_ids: [await upload(leo, 7)] });
  const cancelled = await reserve(listed[4]); await call(leo, `/reservations/${cancelled.id}/cancel`, {});
  const active = await reserve(listed[0]);
  for (const d of [listed[0], listed[5]]) await call(leo, `/materials/${d.material_id}/favorite`, { favorite: true });
  for (const d of [listed[5], listed[0], listed[1]]) await leo.goto(`${base}/materials/${d.material_id}`, { waitUntil: 'networkidle' });
  const issues = (await (await maya.request.get(`${base}/api/me/issues`)).json()).issues || [];

  // Guest pages
  const guest = await account('');
  await shot(guest, 'explore-guest', '/');
  await shot(guest, 'login', '/login');
  await shot(guest, 'register', '/register');
  await shot(guest, 'login-error', '/login', async p => { await p.getByLabel('Username', { exact: true }).fill('nobody'); await p.getByLabel('Password', { exact: true }).fill('wrong-password'); await p.getByRole('button', { name: 'Log in', exact: true }).click(); await p.waitForTimeout(800); });
  await shot(guest, 'profile-guest', '/me');
  await shot(guest, 'not-found', '/this-page-does-not-exist');
  await shot(guest, 'material-not-found', '/materials/99999');

  // Collector pages
  await shot(leo, 'explore', '/');
  await shot(leo, 'explore-category', '/materials?category=3');
  await shot(leo, 'explore-no-results', '/materials?q=zzzz');
  await shot(leo, 'explore-filters', '/', async p => { await p.locator('.filter-icon').click(); await p.waitForTimeout(400); });
  await shot(leo, 'explore-load-error', null, async p => { await p.route('**/api/materials?*', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Server unavailable."}' })); await p.goto(base + '/'); await p.waitForTimeout(1200); await p.unroute('**/api/materials?*'); });
  await shot(leo, 'recently-viewed', '/recently-viewed');
  await shot(leo, 'material-detail', `/materials/${listed[5].material_id}`);
  await shot(leo, 'material-reserve-sheet', `/materials/${listed[5].material_id}`, async p => { await p.getByRole('button', { name: 'Reserve' }).first().click(); await p.waitForTimeout(400); });
  await shot(leo, 'material-detail-sample', '/materials/1');
  await shot(leo, 'saved', '/saved');
  await shot(leo, 'profile', '/me');
  await shot(leo, 'active-tasks', '/me/tasks');
  await shot(leo, 'credits', '/me/credits');
  await shot(leo, 'activity', '/me/activity');
  await shot(leo, 'my-reservations', '/me/reservations');
  await shot(leo, 'reservation-active', `/reservations/${active.id}`);
  await shot(leo, 'reservation-cancel-sheet', `/reservations/${active.id}`, async p => { await p.getByRole('button', { name: 'Cancel reservation' }).click(); await p.waitForTimeout(400); });
  await shot(leo, 'reservation-collected', `/reservations/${collected.id}`);
  await shot(leo, 'reservation-returned', `/reservations/${returned.id}`);
  await shot(leo, 'reservation-reported', `/reservations/${reported.id}`);
  await shot(leo, 'pickup-guide', `/reservations/${active.id}/guide`);
  await shot(leo, 'pickup-find-area', `/reservations/${active.id}/guide`, async p => { await p.getByRole('button', { name: 'I’m at the Hub' }).click(); await p.waitForTimeout(2500); });
  await shot(leo, 'pickup-problem', `/reservations/${active.id}/problem`);
  await shot(leo, 'return-start', `/reservations/${collected.id}/return`);

  // Provider pages
  await maya.request.post(`${base}/api/auth/logout`, { data: {} }); await maya.request.post(`${base}/api/auth/login`, { data: { username: 'maya', password: 'design-audit-2026' } });
  await shot(maya, 'share', '/deposit');
  await shot(maya, 'share-add-sheet', '/deposit', async p => { await p.getByRole('button', { name: 'Add new material' }).click(); await p.waitForTimeout(400); });
  await shot(maya, 'deposit-form', '/deposit/new?fresh=1');
  await shot(maya, 'deposit-form-errors', '/deposit/new?fresh=1', async p => { await p.getByRole('button', { name: 'Next', exact: true }).click(); await p.waitForTimeout(400); });
  await shot(maya, 'deposit-camera-roll', '/deposit/new?fresh=1', async p => { await p.getByRole('button', { name: /Add photos \/ video/ }).click(); await p.waitForTimeout(500); });
  await shot(maya, 'scan-ai', '/deposit/scan', async p => { await p.waitForTimeout(800); await p.getByRole('button', { name: 'Take photo' }).click(); await p.waitForTimeout(3600); });
  await shot(maya, 'multiple-roll', '/deposit/multiple');
  await shot(maya, 'multiple-editor', '/deposit/multiple', async p => { await p.getByRole('button', { name: 'Library photo 1', exact: true }).click(); await p.getByRole('button', { name: 'Library photo 2', exact: true }).click(); await p.getByRole('button', { name: 'Done', exact: true }).click(); await p.waitForTimeout(1500); });
  await shot(maya, 'batch-review', '/deposit/review');
  await shot(maya, 'deposit-go-to-hub', `/deposits/${pending.id}`);
  await shot(maya, 'deposit-find-area', `/deposits/${pending.id}`, async p => { await p.getByRole('button', { name: 'I’m at the Hub' }).click(); await p.waitForTimeout(2500); });
  await shot(maya, 'deposit-place', `/deposits/${verified.id}/place`);
  await shot(maya, 'deposit-success', `/deposits/${listed[0].id}/success`);
  await shot(maya, 'deposit-edit', `/deposits/${verified.id}/edit`);
  await shot(maya, 'hub-guide', '/hub');
  await shot(maya, 'drop-off-entry', '/deposit/drop-off');
  await shot(maya, 'my-posts', '/me/posts');
  await shot(maya, 'my-posts-delete-dialog', '/me/posts', async p => { await p.getByRole('button', { name: 'Delete material' }).first().click(); await p.waitForTimeout(400); });
  if (issues[0]) await shot(maya, 'issue-review', `/me/issues/${issues[0].id}`);
  await shot(maya, 'profile-provider', '/me');

  // Empty states for a brand-new account
  const fresh = await account('nora');
  await shot(fresh, 'saved-empty', '/saved');
  await shot(fresh, 'my-reservations-empty', '/me/reservations');
  await shot(fresh, 'my-posts-empty', '/me/posts');
  await shot(fresh, 'share-empty', '/deposit');
  await shot(fresh, 'credits-new', '/me/credits');
} finally {
  await browser.close(); await vite.close(); api.close(); db.close();
  console.log(`Saved ${shots.length} screenshots to ${out}`);
  if (problems.length) console.log('Problems:\n' + problems.join('\n'));
}
process.exit(0);
