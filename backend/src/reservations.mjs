import { transaction } from './database.mjs';
import { reservationDetails } from './fulfillment.mjs';

const fail = (message, status=409) => { throw Object.assign(new Error(message), {status}); };
export function expireReservations(db, time=Date.now()) {
  const date=new Date(time).toISOString();
  return transaction(db,()=>{
    const rows=db.prepare("SELECT * FROM reservations WHERE status='reserved' AND expires_at<=?").all(date);
    for(const r of rows) settle(db,r,'expired',date);
    return rows.length;
  });
}
function settle(db,r,status,date) {
  const expired=status==='expired';
  db.prepare('UPDATE reservations SET status=?,cancelled_at=? WHERE id=? AND status=\'reserved\'').run(status,expired?null:date,r.id);
  db.prepare("UPDATE materials SET status='available',version=version+1 WHERE id=? AND status='reserved'").run(r.material_id);
  const a=db.prepare('UPDATE credit_accounts SET held=held-1,balance=balance-? WHERE user_id=? RETURNING *').get(expired?1:0,r.user_id);
  db.prepare('INSERT INTO credit_entries(user_id,type,balance_delta,held_delta,balance_after,held_after,reservation_id,operation_key,created_at) VALUES (?,?,?,-1,?,?,?,?,?)').run(r.user_id,expired?'expiry_spend':'cancellation_release',expired?-1:0,a.balance,a.held,r.id,`reservation:settle:${r.id}`,date);
  const m=db.prepare('SELECT owner_id,stock_quantity FROM materials WHERE id=?').get(r.material_id);
  db.prepare('INSERT INTO inventory_entries(material_id,type,quantity_delta,quantity_after,reservation_id,operation_key,created_at) VALUES (?,?,0,?,?,?,?)').run(r.material_id,expired?'reservation_expired':'reservation_cancelled',m.stock_quantity,r.id,`reservation:settle:${r.id}`,date);
  db.prepare('INSERT INTO activities(recipient_id,actor_id,type,material_id,reservation_id,created_at,event_key) VALUES (?,?,?,?,?,?,?)').run(m.owner_id,r.user_id,`reservation_${status}`,r.material_id,r.id,date,`reservation:settle:${r.id}`);
}
export function installReservationRoutes(app,db,requireUser) {
  const select=`SELECT r.*,m.name,m.display_code,m.stock_quantity,m.status AS material_status,z.name AS zone,
    (SELECT CASE WHEN x.storage_key LIKE '/placeholders/%' THEN x.storage_key ELSE '/api/media/'||x.id END FROM material_photos p JOIN media x ON x.id=p.media_id WHERE p.material_id=m.id AND p.kind='material' ORDER BY p.sort_order,p.id LIMIT 1) AS image
    FROM reservations r JOIN materials m ON m.id=r.material_id JOIN zones z ON z.id=r.zone_id_snapshot`;
  function owned(id,user) {const r=db.prepare(`${select} WHERE r.id=? AND r.user_id=?`).get(Number(id)||-1,user);if(!r)fail('Reservation not found.',404);return r;}
  app.get('/api/me/reservations',requireUser,(req,res)=>res.json({reservations:db.prepare(`${select} WHERE r.user_id=? ORDER BY CASE WHEN r.status='reserved' THEN 0 ELSE 1 END,r.expires_at ASC,r.id DESC`).all(req.user.id).map(r=>reservationDetails(db,r)),server_time:new Date().toISOString()}));
  app.get('/api/reservations/:id',requireUser,(req,res)=>res.json({reservation:reservationDetails(db,owned(req.params.id,req.user.id)),server_time:new Date().toISOString()}));
  app.post('/api/materials/:id/reserve',requireUser,(req,res)=>{
    const {quantity,request_key:key}=req.body;
    if(!Number.isInteger(quantity)||![1,2].includes(quantity))fail('Choose a quantity of 1 or 2.',400);
    if(typeof key!=='string'||! /^[a-zA-Z0-9-]{10,100}$/.test(key))fail('Missing or invalid request identifier.',400);
    const result=transaction(db,()=>{
      const previous=db.prepare('SELECT reservation_id FROM reservation_requests WHERE user_id=? AND request_key=?').get(req.user.id,key);
      if(previous){const r=owned(previous.reservation_id,req.user.id);if(r.material_id!==Number(req.params.id)||r.reserved_quantity!==quantity)fail('This request identifier was already used for another reservation.');return {reservation:r,replayed:true};}
      const m=db.prepare('SELECT * FROM materials WHERE id=?').get(Number(req.params.id)||-1);
      if(!m||m.status==='ready_for_drop_off')fail('Material not found.',404);
      if(m.owner_id===req.user.id)fail('You cannot reserve your own material.');
      if(m.status!=='available')fail('This material is no longer available. It may have just been reserved by someone else.');
      if(m.stock_quantity<quantity)fail('Not enough stock. Choose a smaller quantity.');
      const a=db.prepare('UPDATE credit_accounts SET held=held+1 WHERE user_id=? AND balance-held>=1 RETURNING *').get(req.user.id);
      if(!a)fail('Not enough credits. You need 1 available credit to reserve.');
      const date=new Date(),expires=new Date(date.getTime()+24*60*60*1000).toISOString();
      const id=Number(db.prepare("INSERT INTO reservations(material_id,user_id,status,reserved_quantity,unit_snapshot,zone_id_snapshot,created_at,expires_at) VALUES (?,?,'reserved',?,?,?,?,?)").run(m.id,req.user.id,quantity,m.unit,m.zone_id,date.toISOString(),expires).lastInsertRowid);
      db.prepare("UPDATE materials SET status='reserved',version=version+1 WHERE id=? AND status='available'").run(m.id);
      db.prepare('INSERT INTO reservation_requests VALUES (?,?,?)').run(req.user.id,key,id);
      db.prepare("INSERT INTO credit_entries(user_id,type,balance_delta,held_delta,balance_after,held_after,reservation_id,operation_key) VALUES (?,'reservation_hold',0,1,?,?,?,?)").run(req.user.id,a.balance,a.held,id,`reservation:hold:${id}`);
      db.prepare("INSERT INTO inventory_entries(material_id,type,quantity_delta,quantity_after,reservation_id,operation_key,created_at) VALUES (?,'reservation_lock',0,?,?,?,?)").run(m.id,m.stock_quantity,id,`reservation:hold:${id}`,date.toISOString());
      return {reservation:owned(id,req.user.id),replayed:false};
    });res.status(result.replayed?200:201).json({...result,server_time:new Date().toISOString()});
  });
  app.post('/api/reservations/:id/cancel',requireUser,(req,res)=>{
    const reservation=transaction(db,()=>{
      const r=owned(req.params.id,req.user.id);
      if(r.status==='cancelled')return r;
      if(r.status!=='reserved')fail('This reservation is no longer active. Expired reservations cannot be cancelled.');
      const date=new Date().toISOString();
      // Recheck inside the write transaction, including time spent waiting for its lock.
      settle(db,r,r.expires_at<=date?'expired':'cancelled',date);
      return owned(r.id,req.user.id);
    });
    if(reservation.status==='expired')return res.status(409).json({error:'This reservation has expired and cannot be cancelled.'});
    res.json({reservation,server_time:new Date().toISOString()});
  });
}
