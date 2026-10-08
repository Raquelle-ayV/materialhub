import { transaction } from './database.mjs';
import { requireZone, refreshMaterialStatus } from './zones.mjs';

const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const now=()=>new Date().toISOString();
export const issueReasons=['Material is missing','Wrong material','Damaged','Does not match the listing','Other'];
export function placementPhotos(db,materialId) {
  // Preserve every historical photo; only the latest confirmed placement is current.
  return db.prepare(`SELECT x.id, '/api/media/'||x.id AS url FROM material_photos p JOIN media x ON x.id=p.media_id
    WHERE p.material_id=? AND p.kind='placement' AND coalesce('review:'||p.review_issue_id,'return:'||p.return_id,'deposit')=
      (SELECT coalesce('review:'||review_issue_id,'return:'||return_id,'deposit') FROM material_photos WHERE material_id=? AND kind='placement' ORDER BY id DESC LIMIT 1)
    ORDER BY p.sort_order,p.id`).all(materialId,materialId);
}
export function reservationDetails(db,r) {
  const m=db.prepare('SELECT m.dimensions_spec,m.dimensions_not_applicable,m.condition,m.color,c.name AS category,m.custom_category_name,z.code AS zone_code FROM materials m JOIN categories c ON c.id=m.category_id JOIN zones z ON z.id=? WHERE m.id=?').get(r.zone_id_snapshot,r.material_id);
  const issue=db.prepare('SELECT * FROM issue_reports WHERE reservation_id=?').get(r.id);
  if(issue)issue.photos=db.prepare("SELECT media_id AS id,'/api/media/'||media_id AS url FROM issue_photos WHERE issue_id=? ORDER BY sort_order").all(issue.id);
  const ret=db.prepare('SELECT * FROM returns WHERE reservation_id=?').get(r.id);
  if(ret)ret.photos=db.prepare("SELECT media_id AS id,'/api/media/'||media_id AS url FROM return_photos WHERE return_id=? ORDER BY sort_order").all(ret.id);
  return {...r,...m,placement_photos:placementPhotos(db,r.material_id),issue:issue||null,return:ret||null,
    can_return:r.status==='collected'&&r.return_deadline_at>now()};
}
export function installFulfillmentRoutes(app,db,requireUser) {
  function owned(id,user) {
    const r=db.prepare(`SELECT r.*,m.display_code,m.name,m.stock_quantity,m.owner_id,m.status AS material_status,z.name AS zone,z.qr_key,z.id AS zone_id
      FROM reservations r JOIN materials m ON m.id=r.material_id JOIN zones z ON z.id=r.zone_id_snapshot WHERE r.id=? AND r.user_id=?`).get(Number(id)||-1,user);
    if(!r)fail('Reservation not found.',404);return r;
  }
  function active(r) {if(r.status!=='reserved'||r.expires_at<=now())fail('This reservation is no longer active.');}
  function zone(r) {if(r.verified_zone_id!==r.zone_id_snapshot)fail('Scan the correct Zone QR first.');}
  function code(r,value) {zone(r);if(typeof value!=='string'||!/^M\d{3,}$/.test(value.trim())||value.trim()!==r.display_code)fail('The material code does not match your reservation.',400);}
  function returnable(r) {if(r.status!=='collected'||!r.return_deadline_at||r.return_deadline_at<=now())fail('The 24-hour return window has ended or this reservation cannot be returned.');}
  function freshPhotos(ids,r,minimum,retId=0) {
    if(!Array.isArray(ids)||ids.length<minimum||ids.length>3||new Set(ids).size!==ids.length)fail(`Please add ${minimum}–3 photos.`,400);
    for(const id of ids) {
      if(!Number.isSafeInteger(id))fail('Invalid photo.',400);
      const p=db.prepare('SELECT * FROM media WHERE id=? AND uploader_id=?').get(id,r.user_id);
      if(!p||!['image/jpeg','image/png','image/webp'].includes(p.mime_type))fail('This photo does not belong to your account.',400);
      if(p.created_at<(retId?db.prepare('SELECT created_at FROM returns WHERE id=?').get(retId).created_at:r.created_at)
        ||db.prepare('SELECT id FROM material_photos WHERE media_id=?').get(id)
        ||db.prepare('SELECT issue_id FROM issue_photos WHERE media_id=?').get(id)
        ||db.prepare('SELECT return_id FROM return_photos WHERE media_id=? AND return_id!=?').get(id,retId))fail('Upload new photos for this task.',400);
    }return ids;
  }
  function ledger(r,type,balanceDelta,heldDelta,date,returnId=null,issueId=null) {
    const key=returnId?`return:${returnId}`:`reservation:settle:${r.id}`;
    const a=db.prepare('UPDATE credit_accounts SET balance=balance+?,held=held+? WHERE user_id=? RETURNING *').get(balanceDelta,heldDelta,r.user_id);
    db.prepare('INSERT INTO credit_entries(user_id,type,balance_delta,held_delta,balance_after,held_after,reservation_id,return_id,issue_id,operation_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(r.user_id,type,balanceDelta,heldDelta,a.balance,a.held,r.id,returnId,issueId,key,date);
  }
  function inventory(r,type,delta,date,returnId=null) {
    const quantity=db.prepare('SELECT stock_quantity FROM materials WHERE id=?').get(r.material_id).stock_quantity;
    db.prepare('INSERT INTO inventory_entries(material_id,type,quantity_delta,quantity_after,reservation_id,return_id,operation_key,created_at) VALUES (?,?,?,?,?,?,?,?)').run(r.material_id,type,delta,quantity,r.id,returnId,returnId?`return:${returnId}`:`reservation:settle:${r.id}`,date);
  }
  function activity(r,type,date,returnId=null,issueId=null) {
    db.prepare('INSERT INTO activities(recipient_id,actor_id,type,material_id,reservation_id,return_id,issue_id,created_at,event_key) VALUES (?,?,?,?,?,?,?,?,?)').run(r.owner_id,r.user_id,type,r.material_id,r.id,returnId,issueId,date,returnId?`return:${returnId}`:`reservation:settle:${r.id}`);
  }
  function route(path,action) {app.post(`/api/reservations/:id/${path}`,requireUser,(req,res)=>{
    const reservation=transaction(db,()=>{const r=owned(req.params.id,req.user.id);action(r,req.body);return reservationDetails(db,owned(r.id,req.user.id));});res.json({reservation});
  });}
  route('verify-zone',(r,b)=>{active(r);requireZone(db,b,{id:r.zone_id_snapshot,name:r.zone},'is in');db.prepare('UPDATE reservations SET verified_zone_id=?,zone_verified_at=? WHERE id=?').run(r.zone_id_snapshot,now(),r.id);});
  route('verify-material',(r,b)=>{active(r);code(r,b.material_code);db.prepare('UPDATE reservations SET material_code_verified_at=? WHERE id=?').run(now(),r.id);});
  route('pickup',(r,b)=>{
    if(['collected','returned'].includes(r.status))return;
    // The person confirms they found the labelled material; the Zone scan is the location check.
    active(r);zone(r);
    if(b.matches!==true)fail('Confirm that the material matches the listing.',400);
    if(!['available','reserved'].includes(r.material_status)||r.stock_quantity<r.reserved_quantity)fail('This material cannot be collected.');
    const date=now(),deadline=new Date(Date.parse(date)+86400000).toISOString();
    db.prepare("UPDATE reservations SET status='collected',collected_quantity=reserved_quantity,completed_at=?,return_deadline_at=? WHERE id=?").run(date,deadline,r.id);
    db.prepare("UPDATE materials SET stock_quantity=stock_quantity-?,status=CASE WHEN stock_quantity-?>0 THEN status ELSE 'collected' END,version=version+1 WHERE id=?").run(r.reserved_quantity,r.reserved_quantity,r.material_id);
    refreshMaterialStatus(db,r.material_id);
    ledger(r,'pickup_spend',-1,-1,date);inventory(r,'pickup',-r.reserved_quantity,date);activity(r,'material_collected',date);
  });
  route('issues',(r,b)=>{
    if(r.status==='issue_reported')return;
    active(r);zone(r);
    // Missing/wrong materials must remain reportable even if the physical label cannot be found.
    if(!issueReasons.includes(b.reason))fail('Please select a problem reason.',400);
    const notes=typeof b.notes==='string'?b.notes.trim():'';
    if(notes.length>4000||b.reason==='Other'&&!notes)fail('For Other, please describe the problem (up to 4000 characters).',400);
    const ids=freshPhotos(b.photo_ids||[],r,0),date=now();
    const legacy=['material_not_found','wrong_item','material_damaged','other','other'][issueReasons.indexOf(b.reason)];
    const issueId=Number(db.prepare("INSERT INTO issue_reports(reservation_id,material_id,reporter_id,reason,reason_label,notes,status,created_at) VALUES (?,?,?,?,?,?,'open',?)").run(r.id,r.material_id,r.user_id,legacy,b.reason,notes,date).lastInsertRowid);
    ids.forEach((id,i)=>db.prepare('INSERT INTO issue_photos VALUES (?,?,?)').run(issueId,id,i));
    db.prepare("UPDATE reservations SET status='issue_reported' WHERE id=?").run(r.id);
    db.prepare("UPDATE materials SET status='unavailable',version=version+1 WHERE id=?").run(r.material_id);
    ledger(r,'issue_release',0,-1,date,null,issueId);inventory(r,'issue_freeze',0,date);activity(r,'issue_reported',date,null,issueId);
  });
  route('return/start',r=>{
    if(r.status==='returned')return;returnable(r);
    db.prepare("INSERT OR IGNORE INTO returns(reservation_id,user_id,quantity,status,created_at) VALUES (?,?,?,'draft',?)").run(r.id,r.user_id,r.collected_quantity,now());
  });
  function draft(r) {returnable(r);const ret=db.prepare("SELECT * FROM returns WHERE reservation_id=? AND status='draft'").get(r.id);if(!ret)fail('Open the Return Guide first.');return ret;}
  route('return/verify-zone',(r,b)=>{const ret=draft(r);requireZone(db,b,{id:r.zone_id_snapshot,name:r.zone},'goes back to');db.prepare('UPDATE returns SET verified_zone_id=?,zone_verified_at=? WHERE id=?').run(r.zone_id_snapshot,now(),ret.id);});
  route('return/photos',(r,b)=>{
    const ret=draft(r);if(ret.verified_zone_id!==r.zone_id_snapshot)fail('Scan the original Zone QR before uploading return photos.');
    const ids=freshPhotos(b.photo_ids,r,0,ret.id);db.prepare('DELETE FROM return_photos WHERE return_id=?').run(ret.id);ids.forEach((id,i)=>db.prepare('INSERT INTO return_photos VALUES (?,?,?)').run(ret.id,id,i));
  });
  route('return/confirm',(r,b)=>{
    if(r.status==='returned')return;
    const ret=draft(r);if(ret.verified_zone_id!==r.zone_id_snapshot)fail('Scan the original Zone QR before returning.');
    if(b.placed!==true)fail('Confirm you have put all the material back in the correct place.',400);
    const ids=db.prepare('SELECT media_id FROM return_photos WHERE return_id=? ORDER BY sort_order').all(ret.id).map(p=>p.media_id);freshPhotos(ids,r,1,ret.id);
    const date=now();
    db.prepare("UPDATE reservations SET status='returned' WHERE id=?").run(r.id);
    db.prepare("UPDATE returns SET status='confirmed',confirmed_at=? WHERE id=?").run(date,ret.id);
    // Never overwrite a later reservation or a review/closure lock.
    db.prepare("UPDATE materials SET stock_quantity=stock_quantity+?,status=CASE WHEN status IN ('unavailable','closed') THEN status ELSE 'available' END,version=version+1 WHERE id=?").run(r.collected_quantity,r.material_id);
    refreshMaterialStatus(db,r.material_id);
    ids.forEach((id,i)=>db.prepare("INSERT INTO material_photos(material_id,media_id,kind,return_id,sort_order,created_at) VALUES (?,?,'placement',?,?,?)").run(r.material_id,id,ret.id,i,date));
    ledger(r,'return_refund',1,0,date,ret.id);inventory(r,'return',r.collected_quantity,date,ret.id);activity(r,'material_returned',date,ret.id);
  });
}
