import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { openDatabase } from '../backend/src/database.mjs';
import { createApp } from '../backend/src/app.mjs';

// Never reuse the development database, uploads, or running servers.
const folder = mkdtempSync(join(tmpdir(), 'rematerial-browser-'));
process.env.FRONTEND_ORIGIN = 'http://127.0.0.1:15173';
const db = openDatabase(join(folder, 'test.sqlite'));
const api = createApp(db, { uploadDir: join(folder, 'uploads'), authAttemptsPerMinute: 1000 }).listen(13001, '127.0.0.1');
await new Promise((resolve, reject) => { api.once('listening', resolve); api.once('error', reject); });
const vite = await createServer({ server: { host: '127.0.0.1', port:15173, strictPort:true, proxy:{ '/api':'http://127.0.0.1:13001', '/zone-codes':'http://127.0.0.1:13001' } } });
await vite.listen();
console.log(`Isolated browser data: ${folder}`);
async function stop() { await vite.close(); api.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
