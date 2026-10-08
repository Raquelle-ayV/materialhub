// Shared Zone checks for drop-off, pickup and return: accepts a scanned sign QR or the 2-letter code printed on it.
export const zoneCodes = { BOARD_FOAM:'BF', PAPER_SHEET:'PS', FABRIC_TEXTILE:'FT', WOOD:'WD', PLASTIC_ACRYLIC:'PA', CABLES_BUTTONS_SMALL_ITEMS:'SI', OTHER:'OT' };
const fail = message => { throw Object.assign(new Error(message), { status:400 }); };

export function findZone(db, body) {
  const code = typeof body?.zone_code === 'string' ? body.zone_code.trim() : '';
  if (code) return db.prepare('SELECT * FROM zones WHERE code=? COLLATE NOCASE').get(code) || null;
  const match = typeof body?.qr === 'string' ? /^REMATERIAL\|ZONE\|([A-Z_]+)$/.exec(body.qr) : null;
  return match ? db.prepare('SELECT * FROM zones WHERE qr_key=?').get(match[1]) || null : null;
}

/** Throws a message that names both the zone the person is at and the zone they need. */
export function requireZone(db, body, expected, verb='goes to') {
  const zone = findZone(db, body);
  if (!zone) fail(typeof body?.zone_code === 'string' && body.zone_code.trim() ? 'That zone code isn’t recognised. Check the sign and try again.' : 'This isn’t a Re:Material zone sign.');
  if (zone.id !== expected.id) fail(`This is the ${zone.name} zone. Your material ${verb} ${expected.name}.`);
  return zone;
}

/** Recomputes available/reserved from stock minus active reservations; other statuses are left alone. */
export function refreshMaterialStatus(db, materialId) {
  db.prepare(`UPDATE materials SET status=CASE
      WHEN status NOT IN ('available','reserved') THEN status
      WHEN stock_quantity-(SELECT coalesce(sum(reserved_quantity),0) FROM reservations WHERE material_id=materials.id AND status='reserved')>0 THEN 'available'
      ELSE 'reserved' END,version=version+1 WHERE id=?`).run(materialId);
}
