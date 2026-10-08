import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import sharp from 'sharp';
import { openDatabase } from '../backend/src/database.mjs';
import { createApp } from '../backend/src/app.mjs';

// What an https tunnel such as cpolar sends to this computer: the public host, the public origin and the visitor's address.
const tunnel = 'abc123.r1.cpolar.top';
const viaTunnel = (ip, extra = {}) => ({ Host: tunnel, Origin: `https://${tunnel}`, 'X-Forwarded-For': ip, 'X-Forwarded-Proto': 'https', ...extra });
// fetch() refuses to set Host, so send raw HTTP the way the tunnel client does.
function send(port, method, path, headers, body) {
  return new Promise((done, failed) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers }, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { const text = Buffer.concat(chunks).toString(); done({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) }); }); });
    req.on('error', failed); if (body) req.write(body); req.end();
  });
}

test('through an https tunnel: sign-up, log-in cookie, uploads, the built page, and per-visitor limits', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rematerial-tunnel-')), db = openDatabase(join(dir, 'test.sqlite'));
  const server = createApp(db, { uploadDir: join(dir, 'uploads') }).listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const port = server.address().port;
  const post = (path, body, headers) => send(port, 'POST', path, { 'Content-Type': 'application/json', ...headers }, JSON.stringify(body));
  try {
    const signup = await post('/api/auth/register', { username: 'phone_tester', password: 'tunnel-pass-1' }, viaTunnel('203.0.113.7'));
    assert.equal(signup.status, 201, 'same-address requests from the tunnel are accepted');
    const cookie = signup.headers['set-cookie'][0];
    assert.match(cookie, /rm_session=[0-9a-f]{64}/); assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i); assert.match(cookie, /Path=\//);
    const session = cookie.split(';')[0];
    const me = (await send(port, 'GET', '/api/auth/me', { ...viaTunnel('203.0.113.7'), Cookie: session })).json();
    assert.equal(me.user.username, 'phone_tester', 'the cookie keeps the tester logged in');

    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: 'green' } }).png().toBuffer();
    const upload = await send(port, 'POST', '/api/uploads', { ...viaTunnel('203.0.113.7'), Cookie: session, 'Content-Type': 'image/png', 'X-File-Name': 'phone.png' }, png);
    assert.equal(upload.status, 201, 'photo uploads work through the tunnel');

    if (existsSync('dist/index.html')) {
      const page = await send(port, 'GET', '/materials/1', viaTunnel('203.0.113.7'));
      assert.equal(page.status, 200); assert.match(page.text, /<div id="root">/, 'the built app is served on the same port');
    }
    const forged = await post('/api/auth/register', { username: 'forged_user', password: 'tunnel-pass-1' }, viaTunnel('203.0.113.7', { Origin: 'https://evil.example' }));
    assert.equal(forged.status, 403, 'other websites still cannot post on a tester’s behalf');

    // 31 attempts from one phone hit the limit; another phone behind the same tunnel is unaffected.
    for (let i = 0; i < 31; i++) await post('/api/auth/login', { username: 'phone_tester', password: 'wrong' }, viaTunnel('198.51.100.1'));
    assert.equal((await post('/api/auth/login', { username: 'phone_tester', password: 'wrong' }, viaTunnel('198.51.100.1'))).status, 429);
    assert.equal((await post('/api/auth/login', { username: 'phone_tester', password: 'tunnel-pass-1' }, viaTunnel('198.51.100.2'))).status, 200);
  } finally { await new Promise(r => server.close(r)); db.close(); }
});
