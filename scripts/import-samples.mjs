import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, cpSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceKey = 'legacy-demo-runtime-v1';
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const mappingExists = db => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sample_imports'").get();
function fileManifest(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? fileManifest(join(dir, entry.name), relative) : [{ path: relative, sha256: hash(join(dir, entry.name)) }];
  });
}

// Only this importer adds sample rows. It never imports users, deposits, sessions,
// reservations, inventory entries or credit ledgers from the old demonstration DB.
export async function importSamples({
  databasePath = resolve(root, 'data/rematerial.sqlite'),
  uploadDir = resolve(root, 'uploads'),
  sourceDatabasePath = resolve(root, 'demo-runtime/demo.sqlite'),
  sourceUploadDir = resolve(root, 'demo-runtime/uploads'),
  backupRoot = resolve(root, 'backups'),
} = {}) {
  if (!existsSync(databasePath)) throw new Error(`Existing database missing: ${databasePath}. No replacement was created.`);
  if (!existsSync(sourceDatabasePath)) return { imported: 0, mapped: 0, warning: 'Existing demo source is missing; real data was left unchanged.' };
  if (resolve(databasePath) === resolve(sourceDatabasePath)) throw new Error('The sample source must not be the target database.');
  const source = new DatabaseSync(sourceDatabasePath, { readOnly: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  try {
    const samples = source.prepare('SELECT * FROM materials WHERE is_demo=1 ORDER BY id').all();
    const pending = samples.filter(material => !mappingExists(db) || !db.prepare('SELECT 1 FROM sample_imports WHERE source_key=? AND source_material_id=?').get(sourceKey, material.id));
    if (!pending.length) return { imported: 0, mapped: samples.length, unchanged: true };
    const prepared = pending.map(material => ({ material, photos: source.prepare("SELECT x.*,p.sort_order FROM material_photos p JOIN media x ON x.id=p.media_id WHERE p.material_id=? AND p.kind='material' ORDER BY p.sort_order,p.id").all(material.id) }));
    for (const { material, photos } of prepared) {
      if (!photos.length) throw new Error(`Sample ${material.id} has no material photo.`);
      for (const photo of photos) {
        if (photo.storage_key.startsWith('/placeholders/')) {
          if (!/^\/placeholders\/[\w-]+\.svg$/.test(photo.storage_key) || !existsSync(join(root, 'public', photo.storage_key))) throw new Error(`Missing sample placeholder: ${photo.storage_key}`);
        } else if (basename(photo.storage_key) !== photo.storage_key || !existsSync(join(sourceUploadDir, photo.storage_key))) {
          throw new Error(`Missing or unsafe sample asset: ${photo.storage_key}`);
        }
      }
    }
    // Online SQLite backup includes committed WAL contents, unlike copying only
    // rematerial.sqlite. No target data/schema/assets have been changed yet.
    const backupDir = join(backupRoot, `unified-preview-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
    mkdirSync(backupDir, { recursive: true });
    const backupFile = join(backupDir, 'rematerial.sqlite');
    await backup(db, backupFile);
    if (existsSync(uploadDir)) cpSync(uploadDir, join(backupDir, 'uploads'), { recursive: true, errorOnExist: true });
    else mkdirSync(join(backupDir, 'uploads'));
    const backupDb = new DatabaseSync(backupFile, { readOnly: true });
    const integrity = backupDb.prepare('PRAGMA integrity_check').get().integrity_check;
    backupDb.close();
    if (integrity !== 'ok') throw new Error('Backup integrity check failed; import cancelled.');
    writeFileSync(join(backupDir, 'manifest.json'), JSON.stringify({ created_at: new Date().toISOString(), databasePath, uploadDir, sourceDatabasePath, sqlite_sha256: hash(backupFile), integrity, uploads: fileManifest(join(backupDir, 'uploads')) }, null, 2));
    writeFileSync(join(backupDir, 'RESTORE.txt'), 'Stop this project\'s backend before restoring. Preserve the current database and uploads as a separate later snapshot. Restore rematerial.sqlite from this folder to the original databasePath recorded in manifest.json; remove only the stopped target database\'s stale -wal and -shm sidecars. Restore this uploads folder to the original uploadDir. The SQLite backup is a complete consistent database and includes committed WAL changes. Never replace the database while the backend is running.\n');

    mkdirSync(uploadDir, { recursive: true });
    let imported = 0, mapped = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS sample_imports (
        source_key TEXT NOT NULL, source_material_id INTEGER NOT NULL,
        material_id INTEGER NOT NULL UNIQUE REFERENCES materials(id), imported_at TEXT NOT NULL,
        PRIMARY KEY(source_key, source_material_id)
      )`);
      db.prepare('INSERT OR IGNORE INTO users(username,username_key,password_hash) VALUES (?,?,?)').run('Sample materials', '__sample_owner__', 'disabled');
      const ownerId = db.prepare('SELECT id FROM users WHERE username_key=?').get('__sample_owner__').id;
      db.prepare('INSERT OR IGNORE INTO credit_accounts(user_id,balance,held) VALUES (?,0,0)').run(ownerId);
      for (const { material: m, photos } of prepared) {
        if (db.prepare('SELECT 1 FROM sample_imports WHERE source_key=? AND source_material_id=?').get(sourceKey, m.id)) continue;
        // These four built-in seed records already exist in the real database.
        // Match their immutable seed code + placeholder identity, never names or
        // similar images, and never reuse a real (is_demo=0) user material.
        const seeded = /^M00[1-4]$/.test(m.display_code) && photos[0].storage_key.startsWith('/placeholders/')
          ? db.prepare(`SELECT m.id FROM materials m JOIN material_photos p ON p.material_id=m.id JOIN media x ON x.id=p.media_id
              WHERE m.display_code=? AND m.is_demo=1 AND p.kind='material' AND x.storage_key=?`).get(m.display_code, photos[0].storage_key)
          : undefined;
        let materialId = seeded?.id;
        if (!materialId) {
          const fields = ['owner_id','display_code','name','category_id','custom_category_name','initial_quantity','stock_quantity','unit','dimensions_spec','dimensions_not_applicable','color','condition','notes','reference_url','zone_id','status','recorded_at','deposited_at','is_demo'];
          const values = [ownerId, `SAMPLE-${String(m.id).padStart(4, '0')}`, m.name, m.category_id, m.custom_category_name, m.initial_quantity, m.initial_quantity, m.unit, m.dimensions_spec, m.dimensions_not_applicable, m.color, m.condition, m.notes, m.reference_url, m.zone_id, 'available', m.recorded_at, m.deposited_at || m.recorded_at, 1];
          materialId = Number(db.prepare(`INSERT INTO materials(${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`).run(...values).lastInsertRowid);
          for (const photo of photos) {
            let storageKey = photo.storage_key;
            if (!storageKey.startsWith('/placeholders/')) {
              const sourceFile = join(sourceUploadDir, storageKey);
              storageKey = `sample-${sourceKey}-${photo.id}-${hash(sourceFile).slice(0, 12)}${extname(storageKey)}`;
              const targetFile = join(uploadDir, storageKey);
              if (existsSync(targetFile) && hash(targetFile) !== hash(sourceFile)) throw new Error(`Sample asset collision: ${storageKey}`);
              if (!existsSync(targetFile)) copyFileSync(sourceFile, targetFile);
            }
            const mediaId = Number(db.prepare('INSERT INTO media(uploader_id,storage_key,mime_type,size_bytes,created_at) VALUES (?,?,?,?,?)').run(ownerId, storageKey, photo.mime_type, photo.size_bytes, photo.created_at).lastInsertRowid);
            db.prepare("INSERT INTO material_photos(material_id,media_id,kind,sort_order,created_at) VALUES (?,?,'material',?,?)").run(materialId, mediaId, photo.sort_order, photo.created_at);
          }
          imported++;
        } else mapped++;
        db.prepare('INSERT INTO sample_imports VALUES (?,?,?,?)').run(sourceKey, m.id, materialId, new Date().toISOString());
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return { imported, mapped, backupDir, samples: samples.length };
  } finally { db.close(); source.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await importSamples(), null, 2)); }
  catch (error) { console.error(`Sample import stopped: ${error.message}`); process.exitCode = 1; }
}
