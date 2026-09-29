import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../backend/src/database.mjs';
import { importSamples } from '../scripts/import-samples.mjs';

test('sample import backs up committed WAL and uploads, preserves real data, and is idempotent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rematerial-samples-'));
  const targetPath = join(dir, 'target.sqlite'), sourcePath = join(dir, 'source.sqlite');
  const target = openDatabase(targetPath), source = openDatabase(sourcePath);
  const uploads = join(dir, 'uploads'), sourceUploads = join(dir, 'source-uploads');
  mkdirSync(uploads); mkdirSync(sourceUploads);
  writeFileSync(join(uploads, 'real-photo.png'), 'existing user photo');
  writeFileSync(join(sourceUploads, 'sample.png'), 'separate sample illustration');
  const realId = Number(target.prepare("INSERT INTO users(username,username_key,password_hash) VALUES ('Real user','real-user','real-password-hash')").run().lastInsertRowid);
  target.prepare('INSERT INTO credit_accounts VALUES (?,7,0)').run(realId);
  target.prepare("INSERT INTO sessions VALUES ('real-session',?,9999999999999)").run(realId);
  target.prepare("INSERT INTO deposit_drafts VALUES (?, ?, '2026-01-01')").run(realId, JSON.stringify({ name: 'My existing draft', photo_ids: [] }));
  const owner = source.prepare("SELECT id FROM users WHERE username_key='__demo_owner__'").get().id;
  source.prepare(`INSERT INTO materials(display_code,owner_id,name,category_id,initial_quantity,stock_quantity,unit,dimensions_spec,color,condition,zone_id,status,recorded_at,is_demo)
    VALUES ('M005',?,'Real user lookalike name',1,2,2,'pieces','30 cm','White','Good',1,'available','2026-09-01',1)`).run(owner);
  const sampleId = source.prepare("SELECT id FROM materials WHERE display_code='M005'").get().id;
  const media = Number(source.prepare("INSERT INTO media(uploader_id,storage_key,mime_type,size_bytes,created_at) VALUES (?,'sample.png','image/png',28,'2026-09-01')").run(owner).lastInsertRowid);
  source.prepare("INSERT INTO material_photos(material_id,media_id,kind,sort_order,created_at) VALUES (?,?,'material',0,'2026-09-01')").run(sampleId, media);
  const before = target.prepare('SELECT * FROM users WHERE id=?').get(realId);
  try {
    const options = { databasePath: targetPath, uploadDir: uploads, sourceDatabasePath: sourcePath, sourceUploadDir: sourceUploads, backupRoot: join(dir, 'backups') };
    const result = await importSamples(options);
    assert.equal(result.imported, 1); assert.equal(result.mapped, 4);
    assert.deepEqual(target.prepare('SELECT * FROM users WHERE id=?').get(realId), before);
    assert.equal(target.prepare('SELECT balance FROM credit_accounts WHERE user_id=?').get(realId).balance, 7);
    assert.equal(target.prepare('SELECT count(*) AS n FROM sessions').get().n, 1);
    assert.equal(target.prepare('SELECT count(*) AS n FROM deposit_drafts').get().n, 1);
    for (const table of ['deposits', 'reservations', 'credit_entries', 'inventory_entries']) assert.equal(target.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
    const snapshot = new DatabaseSync(join(result.backupDir, 'rematerial.sqlite'), { readOnly: true });
    assert.deepEqual(snapshot.prepare('SELECT * FROM users WHERE id=?').get(realId), before);
    assert.equal(snapshot.prepare('SELECT count(*) AS n FROM materials').get().n, 4);
    snapshot.close();
    assert.equal(readFileSync(join(result.backupDir, 'uploads/real-photo.png'), 'utf8'), 'existing user photo');
    assert.equal(readFileSync(join(uploads, 'real-photo.png'), 'utf8'), 'existing user photo');
    assert.equal(target.prepare("SELECT count(*) AS n FROM materials WHERE is_demo=1").get().n, 5);
    const next = await importSamples(options);
    assert.equal(next.unchanged, true); assert.equal(next.imported, 0);
    assert.equal(target.prepare('SELECT count(*) AS n FROM materials').get().n, 5);
    assert.equal(readdirSync(join(dir, 'backups')).length, 1);
    await assert.rejects(importSamples({ ...options, databasePath: join(dir, 'missing.sqlite') }), /No replacement/);
  } finally { target.close(); source.close(); rmSync(dir, { recursive: true, force: true }); }
});
