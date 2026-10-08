import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zoneCodes, refreshMaterialStatus } from './zones.mjs';
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export function openDatabase(filename = process.env.DATABASE_PATH || resolve(projectRoot, 'data/rematerial.sqlite')) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  // Additive v2 migration preserves all existing users, balances and sessions.
  db.exec(`CREATE TABLE IF NOT EXISTS deposit_requests (
    user_id INTEGER NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
    deposit_id INTEGER NOT NULL REFERENCES deposits(id), PRIMARY KEY(user_id,request_key)
  );
  CREATE TABLE IF NOT EXISTS deposit_drafts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id), payload TEXT NOT NULL, updated_at TEXT NOT NULL
  ); PRAGMA user_version=2;`);
  // Additive v3: preserve all accounts, ledgers, material records and progress.
  if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'language')) {
    db.exec("ALTER TABLE users ADD COLUMN language TEXT CHECK(language IS NULL OR language IN ('en','zh-CN'))");
  }
  db.exec('PRAGMA user_version=3');
  db.exec(`CREATE TABLE IF NOT EXISTS reservation_requests (
    user_id INTEGER NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
    reservation_id INTEGER NOT NULL REFERENCES reservations(id), PRIMARY KEY(user_id,request_key)
  ); PRAGMA user_version=4;`);
  // v5 is additive: never rebuild material/media tables or rewrite existing rows.
  if (!db.prepare('PRAGMA table_info(issue_reports)').all().some(c => c.name === 'reason_label')) {
    db.exec('ALTER TABLE issue_reports ADD COLUMN reason_label TEXT');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS issue_photos (
    issue_id INTEGER NOT NULL REFERENCES issue_reports(id), media_id INTEGER NOT NULL UNIQUE REFERENCES media(id),
    sort_order INTEGER NOT NULL, PRIMARY KEY(issue_id,media_id)
  );
  CREATE TABLE IF NOT EXISTS return_photos (
    return_id INTEGER NOT NULL REFERENCES returns(id), media_id INTEGER NOT NULL UNIQUE REFERENCES media(id),
    sort_order INTEGER NOT NULL, PRIMARY KEY(return_id,media_id)
  ); PRAGMA user_version=5;`);
  // v6 retains every existing photo while identifying each reviewed placement batch.
  if (!db.prepare('PRAGMA table_info(material_photos)').all().some(c => c.name === 'review_issue_id')) {
    db.exec('ALTER TABLE material_photos ADD COLUMN review_issue_id INTEGER REFERENCES issue_reports(id)');
  }
  db.exec('PRAGMA user_version=6');
  // v7: 2-letter zone codes for manual entry; reservations lock only their quantity.
  if (!db.prepare('PRAGMA table_info(zones)').all().some(c => c.name === 'code')) db.exec('ALTER TABLE zones ADD COLUMN code TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS zones_code ON zones(code)');
  if (db.prepare('PRAGMA user_version').get().user_version < 7) {
    transaction(db, () => {
      db.exec('DROP INDEX IF EXISTS one_active_reservation_per_material');
      for (const m of db.prepare("SELECT id FROM materials WHERE status IN ('available','reserved')").all()) refreshMaterialStatus(db, m.id);
      db.exec('PRAGMA user_version=7');
    });
  }
  seed(db);
  return db;
}
export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function seed(db) {
  transaction(db, () => {
    db.prepare('INSERT OR IGNORE INTO hubs VALUES (1, ?, ?, ?, 1)').run('Material Hub', 'Location to be confirmed', 'Opening hours to be confirmed');
    const names = ['Board & Foam','Paper & Sheet','Fabric & Textile','Wood','Plastic & Acrylic','Cables, Buttons & Small Items','Other'];
    const keys = ['BOARD_FOAM','PAPER_SHEET','FABRIC_TEXTILE','WOOD','PLASTIC_ACRYLIC','CABLES_BUTTONS_SMALL_ITEMS','OTHER'];
    names.forEach((name,i) => { db.prepare('INSERT OR IGNORE INTO zones(id,hub_id,name,qr_key) VALUES (?,1,?,?)').run(i+1,name,keys[i]); db.prepare('UPDATE zones SET code=? WHERE qr_key=? AND code IS NULL').run(zoneCodes[keys[i]],keys[i]); db.prepare('INSERT OR IGNORE INTO categories VALUES (?,?,?,?)').run(i+1,name,i+1,i); });
    db.prepare('INSERT OR IGNORE INTO material_code_sequence VALUES (1,1)').run();
    // A non-login demo owner. No shared default password or synthetic account reward.
    db.prepare('INSERT OR IGNORE INTO users(username,username_key,password_hash) VALUES (?,?,?)').run('Material Hub Demo','__demo_owner__','disabled');
    const owner = db.prepare('SELECT id FROM users WHERE username_key=?').get('__demo_owner__').id;
    db.prepare('INSERT OR IGNORE INTO credit_accounts VALUES (?,0,0)').run(owner);
    const samples = [
      ['M001','Foam board offcuts',1,4,'sheets','A3 · 5 mm','White','Like new','Clean offcuts for your next model. Demo material.', 'foam'],
      ['M002','Cotton canvas',3,2,'pieces','80 × 120 cm','Natural','Good','Unbleached canvas, ready for a new idea. Demo material.','fabric'],
      ['M003','Birch plywood',4,3,'panels','40 × 60 cm · 3 mm','Natural','Good','Useful panels for prototypes and small builds. Demo material.','wood'],
      ['M004','Color paper collection',2,12,'sheets','A4','Mixed','New','A small palette of unused colored sheets. Demo material.','paper']
    ];
    samples.forEach((s,i) => {
      if (db.prepare('SELECT id FROM materials WHERE display_code=?').get(s[0])) return;
      const date = new Date(Date.UTC(2026,8,20-i,9)).toISOString();
      const id = Number(db.prepare(`INSERT INTO materials(display_code,owner_id,name,category_id,initial_quantity,stock_quantity,unit,dimensions_spec,color,condition,notes,zone_id,status,recorded_at,deposited_at,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'available',?,?,1)`).run(s[0],owner,s[1],s[2],s[3],s[3],s[4],s[5],s[6],s[7],s[8],s[2],date,date).lastInsertRowid);
      const media = Number(db.prepare('INSERT INTO media(uploader_id,storage_key,mime_type,size_bytes,created_at) VALUES (?,?,?,0,?)').run(owner,`/placeholders/${s[9]}.svg`,'image/svg+xml',date).lastInsertRowid);
      db.prepare("INSERT INTO material_photos(material_id,media_id,kind,sort_order,created_at) VALUES (?,?,'material',0,?)").run(id,media,date);
    });
    db.prepare('UPDATE material_code_sequence SET next_value=max(next_value,5) WHERE id=1').run();
  });
}
