import { transaction } from './database.mjs';

const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };

// Keep financial and inventory references intact even when a post is deleted.
// Deleted posts are hidden; archived posts remain accessible in My posts.
export function installPostManagementRoutes(app, db, requireUser) {
  db.exec(`CREATE TABLE IF NOT EXISTS material_management (
    material_id INTEGER PRIMARY KEY REFERENCES materials(id),
    disposition TEXT NOT NULL CHECK(disposition IN ('deleted','archived')),
    managed_at TEXT NOT NULL
  )`);
  function state(material) {
    const active = !!db.prepare("SELECT id FROM reservations WHERE material_id=? AND status='reserved'").get(material.id);
    const history = !!db.prepare('SELECT id FROM reservations WHERE material_id=?').get(material.id);
    const review = !!db.prepare("SELECT id FROM issue_reports WHERE material_id=? AND status='open'").get(material.id);
    const disposition = db.prepare('SELECT disposition FROM material_management WHERE material_id=?').get(material.id)?.disposition || (material.status === 'closed' ? 'archived' : null);
    const blocked = material.is_demo ? 'Sample materials are managed separately.' : active ? 'This material has an active reservation. Wait until it is completed or cancelled.' : review ? 'Use the reported problem below to review or remove this material.' : '';
    return { material_id: material.id, version: material.version, has_history: history, disposition,
      can_delete: !blocked && !history && !disposition,
      can_archive: !blocked && history && !disposition,
      blocked_reason: blocked };
  }
  function owned(id, userId) {
    const material = db.prepare('SELECT * FROM materials WHERE id=? AND owner_id=?').get(Number(id) || -1, userId);
    if (!material) fail('Material not found.', 404);
    return material;
  }
  app.get('/api/me/posts', requireUser, (req, res) => {
    const rows = db.prepare('SELECT * FROM materials WHERE owner_id=? ORDER BY id DESC').all(req.user.id);
    const draft = db.prepare('SELECT payload FROM deposit_drafts WHERE user_id=?').get(req.user.id);
    res.json({ management: rows.map(state).filter(row => row.disposition !== 'deleted'), draft: draft ? JSON.parse(draft.payload) : null });
  });
  app.post('/api/deposit-draft/delete', requireUser, (req, res) => {
    transaction(db, () => {
      if (req.body.confirm !== true) fail('Confirm that you want to delete this draft.', 400);
      const record = db.prepare('SELECT payload FROM deposit_drafts WHERE user_id=?').get(req.user.id);
      if (!record) return;
      if (JSON.parse(record.payload).request_key !== req.body.request_key) fail('This draft changed. Reload My posts before deleting it.');
      db.prepare('DELETE FROM deposit_drafts WHERE user_id=?').run(req.user.id);
    });
    res.json({ deleted: true });
  });
  app.post('/api/me/posts/:id/manage', requireUser, (req, res) => {
    const result = transaction(db, () => {
      const material = owned(req.params.id, req.user.id), current = state(material), { action } = req.body;
      if (req.body.confirm !== true || !['delete', 'archive'].includes(action)) fail('Choose and confirm a management action.', 400);
      if (current.blocked_reason) fail(current.blocked_reason);
      if (current.disposition) {
        if (current.disposition === (action === 'delete' ? 'deleted' : 'archived')) return current;
        fail('This material has already been removed.');
      }
      if (!Number.isInteger(req.body.version) || req.body.version !== material.version) fail('This material changed. Reload My posts before continuing.');
      if (action === 'delete' && current.has_history) fail('This material has reservation or collection history. Archive it to preserve those records.');
      if (action === 'archive' && !current.has_history) fail('This material has no reservation history. Use Delete material.');
      const date = new Date().toISOString(), disposition = action === 'delete' ? 'deleted' : 'archived';
      db.prepare("UPDATE materials SET status='closed',closed_at=?,version=version+1 WHERE id=?").run(date, material.id);
      db.prepare('INSERT INTO material_management(material_id,disposition,managed_at) VALUES (?,?,?)').run(material.id, disposition, date);
      // Closing availability does not discard physical stock or change credits.
      // Keeping the deposit and its reward key also prevents replayed rewards.
      db.prepare('INSERT INTO inventory_entries(material_id,type,quantity_delta,quantity_after,operation_key,created_at) VALUES (?,?,0,?,?,?)')
        .run(material.id, `owner_${action}`, material.stock_quantity, `owner:${action}:${material.id}`, date);
      return state(owned(material.id, req.user.id));
    });
    res.json({ management: result });
  });
}
