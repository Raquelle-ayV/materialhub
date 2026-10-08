// Copies a live SQLite database (including unsaved WAL changes) to a new file: node scripts/backup-db.mjs <source> <target>
import { DatabaseSync } from 'node:sqlite';
const [source, target] = process.argv.slice(2);
if (!source || !target) { console.error('Usage: node scripts/backup-db.mjs <source> <target>'); process.exit(1); }
const db = new DatabaseSync(source);
try { db.prepare('VACUUM INTO ?').run(target); } finally { db.close(); }
