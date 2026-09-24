import { transaction } from './database.mjs';
import { placementPhotos } from './fulfillment.mjs';

const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
export function installReviewRoutes(app,db,requireUser) {
  const select=`SELECT i.*,m.name,m.display_code,m.stock_quantity,m.condition,m.notes AS material_notes,
    m.unit,m.zone_id,m.version,m.status AS material_status FROM issue_reports i JOIN materials m ON m.id=i.material_id`;
  function decorate(i) {
    return {...i,photos:db.prepare("SELECT media_id AS id,'/api/media/'||media_id AS url FROM issue_photos WHERE issue_id=? ORDER BY sort_order").all(i.id),placement_photos:placementPhotos(db,i.material_id)};
  }
  function owned(id,user) {
    const i=db.prepare(`${select} WHERE i.id=? AND m.owner_id=?`).get(Number(id)||-1,user);
    if(!i)fail('Report not found.',404);return decorate(i);
  }
  app.get('/api/me/issues',requireUser,(req,res)=>{
    const issues=db.prepare(`${select} WHERE m.owner_id=? ORDER BY CASE WHEN i.status='open' THEN 0 ELSE 1 END,i.id DESC`).all(req.user.id).map(decorate);
    res.json({issues,pending_count:issues.filter(i=>i.status==='open').length});
  });
  app.get('/api/me/issues/:id',requireUser,(req,res)=>res.json({issue:owned(req.params.id,req.user.id)}));
  app.post('/api/me/issues/:id/resolve',requireUser,(req,res)=>{
    const issue=transaction(db,()=>{
      const i=owned(req.params.id,req.user.id),b=req.body;
      if(!['relisted','removed'].includes(b.resolution))fail('Choose Review and relist or Remove material.',400);
      // The report itself is the idempotency key, even after subsequent reservations or reports.
      if(i.status==='resolved'){
        if(i.resolution!==b.resolution)fail('This report has already been resolved differently.');
        return i;
      }
      if(i.material_status!=='unavailable')fail('This material is no longer awaiting review.');
      if(!Number.isInteger(b.version)||b.version!==i.version)fail('This material changed. Reload the report and check the latest quantity before continuing.');
      if(db.prepare("SELECT id FROM reservations WHERE material_id=? AND status='reserved'").get(i.material_id))fail('This material has an active reservation.');
      const date=new Date().toISOString();let quantity=i.stock_quantity;
      if(b.resolution==='relisted') {
        if(b.checked_at_hub!==true)fail('Confirm you have checked this material at the Hub.',400);
        if(!Number.isSafeInteger(b.quantity)||b.quantity<1||b.quantity>1000000)fail('Available quantity must be a whole number between 1 and 1,000,000. Use Remove material if nothing remains.',400);
        if(typeof b.condition!=='string'||!b.condition.trim()||b.condition.trim().length>80)fail('Please enter a condition (up to 80 characters).',400);
        if(typeof b.notes!=='string'||b.notes.length>4000)fail('Notes must be no more than 4000 characters.',400);
        const ids=b.photo_ids;
        if(!Array.isArray(ids)||ids.length<1||ids.length>3||new Set(ids).size!==ids.length)fail('Please add 1–3 placement photos.',400);
        const current=new Set(i.placement_photos.map(p=>p.id));
        for(const id of ids) {
          if(!Number.isSafeInteger(id))fail('Invalid placement photo.',400);
          if(current.has(id))continue; // Current material placement may be kept, including a previous return photo.
          const p=db.prepare('SELECT * FROM media WHERE id=? AND uploader_id=?').get(id,req.user.id);
          if(!p||!['image/jpeg','image/png','image/webp'].includes(p.mime_type)
            ||db.prepare('SELECT id FROM material_photos WHERE media_id=?').get(id)
            ||db.prepare('SELECT issue_id FROM issue_photos WHERE media_id=?').get(id)
            ||db.prepare('SELECT return_id FROM return_photos WHERE media_id=?').get(id))fail('Use the current placement photos or upload new photos from your account.',400);
        }
        quantity=b.quantity;
        db.prepare("UPDATE materials SET stock_quantity=?,condition=?,notes=?,status='available',version=version+1 WHERE id=?").run(quantity,b.condition.trim(),b.notes.trim(),i.material_id);
        ids.forEach((id,index)=>db.prepare("INSERT INTO material_photos(material_id,media_id,kind,review_issue_id,sort_order,created_at) VALUES (?,?,'placement',?,?,?)").run(i.material_id,id,i.id,index,date));
      } else {
        if(b.confirm_remove!==true)fail('Confirm removal to archive this material.',400);
        // Archive, do not delete: retain the quantity and all audit/media records.
        db.prepare("UPDATE materials SET status='closed',closed_at=?,version=version+1 WHERE id=?").run(date,i.material_id);
      }
      db.prepare("UPDATE issue_reports SET status='resolved',resolved_at=?,resolved_by=?,resolution=? WHERE id=? AND status='open'").run(date,req.user.id,b.resolution,i.id);
      db.prepare('INSERT INTO inventory_entries(material_id,type,quantity_delta,quantity_after,operation_key,created_at) VALUES (?,?,?,?,?,?)').run(i.material_id,`review_${b.resolution}`,quantity-i.stock_quantity,quantity,`review:${i.id}`,date);
      // Resolution never touches credits. B already received the release at report submission.
      return owned(i.id,req.user.id);
    });res.json({issue});
  });
}
