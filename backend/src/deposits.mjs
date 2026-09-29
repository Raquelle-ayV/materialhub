import express from 'express';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot, transaction } from './database.mjs';
import { placementPhotos } from './fulfillment.mjs';

const MAX_BYTES = 10 * 1024 * 1024;
const MIME = {jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
const fail = (message,status=400,messageKey=message,params={}) => { throw Object.assign(new Error(message),{status,messageKey,params}); };
const now = () => new Date().toISOString();
const text = (value,max=200) => typeof value === 'string' ? value.trim().slice(0,max) : '';
export function installDepositRoutes(app,db,requireUser,{uploadDir=process.env.UPLOAD_DIR || resolve(projectRoot,'uploads')}={}) {
  function owned(id,userId) {
    const d=db.prepare(`SELECT d.id,d.status AS deposit_status,d.arrived_at,d.verified_zone_id,d.zone_verified_at,d.confirmed_at,
      m.*,d.id AS deposit_id,m.id AS material_id,c.name AS category,z.name AS zone,z.qr_key
      FROM deposits d JOIN materials m ON m.id=d.material_id JOIN categories c ON c.id=m.category_id JOIN zones z ON z.id=m.zone_id
      WHERE d.id=? AND d.user_id=? AND NOT EXISTS (SELECT 1 FROM material_management mm WHERE mm.material_id=m.id AND mm.disposition='deleted')`).get(Number(id)||-1,userId);
    if(!d)fail('Material record not found.',404);
    const photos=db.prepare('SELECT p.media_id AS id,p.kind,p.sort_order FROM material_photos p WHERE p.material_id=? ORDER BY p.sort_order,p.id').all(d.material_id);
    const issues=db.prepare("SELECT id,reason,reason_label,notes,status,created_at,resolution,resolved_at FROM issue_reports WHERE material_id=? ORDER BY id DESC").all(d.material_id);
    for(const issue of issues)issue.photos=db.prepare("SELECT media_id AS id,'/api/media/'||media_id AS url FROM issue_photos WHERE issue_id=? ORDER BY sort_order").all(issue.id);
    const collected=db.prepare("SELECT coalesce(sum(collected_quantity),0) AS quantity FROM reservations WHERE material_id=? AND status='collected'").get(d.material_id).quantity;
    return {...d,id:d.deposit_id,issues,collected_quantity:collected,photos:photos.filter(p=>p.kind==='material').map(p=>({id:p.id,url:`/api/media/${p.id}`})),placement_photos:placementPhotos(db,d.material_id)};
  }
  function editable(d) {if(d.deposit_status==='confirmed')fail('This material has already been dropped off. Core information is locked.',409);}
  function imageIds(ids,userId,limit,materialId=0,required=true) {
    if(!Array.isArray(ids)||ids.length>(limit)|| (required && ids.length<1)||new Set(ids).size!==ids.length)fail(`Please add ${required?'at least 1 and ':''}no more than ${limit} photos.`,400,required?'Please add 1–{{max}} photos.':'Please add no more than {{max}} photos.',{max:limit});
    for(const id of ids) {
      if(!Number.isSafeInteger(id))fail('Invalid photo. Please upload it again.');
      const m=db.prepare('SELECT * FROM media WHERE id=? AND uploader_id=?').get(id,userId);
      if(!m || !Object.values(MIME).includes(m.mime_type))fail('This photo does not belong to your account.');
      if(db.prepare('SELECT id FROM material_photos WHERE media_id=? AND material_id!=?').get(id,materialId))fail('A photo cannot be reused from another material record.');
    }
    return ids;
  }
  function validate(body,userId,materialId=0) {
    const fields={name:text(body.name),category_id:Number(body.category_id),custom_category_name:text(body.custom_category_name),quantity:Number(body.quantity),unit:text(body.unit,50),dimensions_spec:text(body.dimensions_spec,500),dimensions_not_applicable:body.dimensions_not_applicable===true,color:text(body.color,80),condition:text(body.condition,80),reference_url:text(body.reference_url,2000),notes:text(body.notes,4000)};
    for(const k of ['name','unit','color','condition'])if(!fields[k])fail('Material name, unit, color and condition are required.');
    const category=db.prepare('SELECT * FROM categories WHERE id=?').get(fields.category_id||-1);if(!category)fail('Please select a valid category.');
    if(fields.category_id===7&&!fields.custom_category_name)fail('Please enter a custom category name for Other.');
    if(!Number.isSafeInteger(fields.quantity)||fields.quantity<1||fields.quantity>1_000_000)fail('Quantity must be a whole number between 1 and 1,000,000.');
    if(!fields.dimensions_not_applicable&&!fields.dimensions_spec)fail('Enter dimensions / specifications or choose Not applicable.');
    if(fields.reference_url){try{if(!['http:','https:'].includes(new URL(fields.reference_url).protocol))throw new Error();}catch{fail('Use an http or https purchase / reference link.');}}
    return {...fields,zone_id:category.zone_id,photo_ids:imageIds(body.photo_ids,userId,9,materialId)};
  }
  function attach(materialId,depositId,ids,kind) {
    db.prepare('DELETE FROM material_photos WHERE material_id=? AND kind=?').run(materialId,kind);
    ids.forEach((id,i)=>db.prepare('INSERT INTO material_photos(material_id,media_id,kind,deposit_id,sort_order,created_at) VALUES (?,?,?,?,?,?)').run(materialId,id,kind,depositId,i,now()));
  }
  app.post('/api/uploads',requireUser,express.raw({type:()=>true,limit:MAX_BYTES}),async(req,res)=>{
    const mime=req.headers['content-type']?.split(';')[0];
    let filename='';try{filename=decodeURIComponent(req.headers['x-file-name']||'');}catch{fail('Invalid photo filename.');}
    if(!Object.values(MIME).includes(mime)||! /\.(jpe?g|png|webp)$/i.test(filename))fail('Use JPG, JPEG, PNG or WebP photos only. Videos are not supported.');
    if(!Buffer.isBuffer(req.body)||!req.body.length)fail('Please choose a photo.');
    let buffer,format;
    try {
      const image=sharp(req.body,{limitInputPixels:40_000_000,failOn:'warning'});
      const meta=await image.metadata();format=meta.format;
      if(MIME[format]!==mime || (meta.pages||1)>1)fail('Use a single JPG, JPEG, PNG or WebP photo.');
      buffer=await image.rotate().toBuffer(); // Decode the image and remove location/EXIF metadata.
    } catch(error) { if(error.status)throw error; fail('This file is not a valid image or is too large to process.'); }
    if(buffer.length>MAX_BYTES)fail('Each photo must be 10MB or smaller.');
    await mkdir(uploadDir,{recursive:true});
    const key=`${randomUUID()}.${format}`;const file=resolve(uploadDir,key);
    await writeFile(file,buffer,{flag:'wx'});
    try {
      const id=Number(db.prepare('INSERT INTO media(uploader_id,storage_key,mime_type,size_bytes,created_at) VALUES (?,?,?,?,?)').run(req.user.id,key,MIME[format],buffer.length,now()).lastInsertRowid);
      res.status(201).json({photo:{id,url:`/api/media/${id}`}});
    } catch(error){await unlink(file);throw error;}
  });
  app.get('/api/media/:id',(req,res)=>{
    const media=db.prepare('SELECT * FROM media WHERE id=?').get(Number(req.params.id)||-1);
    if(!media || media.storage_key.includes('/') || media.storage_key.includes('\\'))return res.status(404).json({error:'Photo not found.'});
    const published=db.prepare("SELECT p.id FROM material_photos p JOIN materials m ON m.id=p.material_id WHERE p.media_id=? AND m.status!='ready_for_drop_off'").get(media.id);
    const issueOwner=req.user&&db.prepare('SELECT i.id FROM issue_photos p JOIN issue_reports i ON i.id=p.issue_id JOIN materials m ON m.id=i.material_id WHERE p.media_id=? AND m.owner_id=?').get(media.id,req.user.id);
    if(media.uploader_id!==req.user?.id&&!published&&!issueOwner)return res.status(404).json({error:'Photo not found.'});
    res.type(media.mime_type).sendFile(resolve(uploadDir,media.storage_key));
  });
  app.get('/api/deposit-draft',requireUser,(req,res)=>{const draft=db.prepare('SELECT payload FROM deposit_drafts WHERE user_id=?').get(req.user.id);res.json({draft:draft?JSON.parse(draft.payload):null});});
  app.post('/api/deposit-draft',requireUser,(req,res)=>{
    const key=text(req.body.request_key,100);if(!key)fail('Missing draft identifier.');
    if(db.prepare('SELECT deposit_id FROM deposit_requests WHERE user_id=? AND request_key=?').get(req.user.id,key))return res.json({saved:true});
    imageIds(req.body.photo_ids||[],req.user.id,9,0,false);
    db.prepare('INSERT INTO deposit_drafts VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(req.user.id,JSON.stringify(req.body),now());
    res.json({saved:true});
  });
  app.get('/api/deposits',requireUser,(req,res)=>{
    const ids=db.prepare("SELECT d.id FROM deposits d WHERE d.user_id=? AND NOT EXISTS (SELECT 1 FROM material_management mm WHERE mm.material_id=d.material_id AND mm.disposition='deleted') ORDER BY d.id DESC").all(req.user.id);
    res.json({deposits:ids.map(d=>owned(d.id,req.user.id))});
  });
  app.get('/api/deposits/:id',requireUser,(req,res)=>res.json({deposit:owned(req.params.id,req.user.id)}));
  app.post('/api/deposits',requireUser,(req,res)=>{
    const key=text(req.body.request_key,100);if(!/^[a-zA-Z0-9-]{10,100}$/.test(key))fail('Missing or invalid request identifier.');
    const result=transaction(db,()=>{
      const previous=db.prepare('SELECT deposit_id FROM deposit_requests WHERE user_id=? AND request_key=?').get(req.user.id,key);
      if(previous)return {deposit:owned(previous.deposit_id,req.user.id),replayed:true};
      const f=validate(req.body,req.user.id);const date=now();
      const sequence=db.prepare('UPDATE material_code_sequence SET next_value=next_value+1 WHERE id=1 RETURNING next_value-1 AS value').get().value;
      const code=`M${String(sequence).padStart(3,'0')}`;
      const materialId=Number(db.prepare(`INSERT INTO materials(display_code,owner_id,name,category_id,custom_category_name,initial_quantity,stock_quantity,unit,dimensions_spec,dimensions_not_applicable,color,condition,notes,reference_url,zone_id,status,recorded_at) VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,'ready_for_drop_off',?)`).run(code,req.user.id,f.name,f.category_id,f.custom_category_name||null,f.quantity,f.unit,f.dimensions_spec,Number(f.dimensions_not_applicable),f.color,f.condition,f.notes,f.reference_url||null,f.zone_id,date).lastInsertRowid);
      const id=Number(db.prepare("INSERT INTO deposits(material_id,user_id,status) VALUES (?,?,'pending')").run(materialId,req.user.id).lastInsertRowid);
      attach(materialId,id,f.photo_ids,'material');
      db.prepare('INSERT INTO deposit_requests VALUES (?,?,?)').run(req.user.id,key,id);
      db.prepare('DELETE FROM deposit_drafts WHERE user_id=?').run(req.user.id);
      return {deposit:owned(id,req.user.id),replayed:false};
    });res.status(result.replayed?200:201).json(result);
  });
  app.post('/api/deposits/:id/edit',requireUser,(req,res)=>{
    const deposit=transaction(db,()=>{
      const d=owned(req.params.id,req.user.id);editable(d);const f=validate(req.body,req.user.id,d.material_id);
      if(!Number.isInteger(req.body.version)||req.body.version!==d.version)fail('This material changed in another tab. Reload before saving.',409);
      db.prepare('UPDATE materials SET name=?,category_id=?,custom_category_name=?,initial_quantity=?,unit=?,dimensions_spec=?,dimensions_not_applicable=?,color=?,condition=?,notes=?,reference_url=?,zone_id=?,version=version+1 WHERE id=?').run(f.name,f.category_id,f.custom_category_name||null,f.quantity,f.unit,f.dimensions_spec,Number(f.dimensions_not_applicable),f.color,f.condition,f.notes,f.reference_url||null,f.zone_id,d.material_id);
      attach(d.material_id,d.id,f.photo_ids,'material');
      if(f.category_id!==d.category_id){db.prepare('UPDATE deposits SET verified_zone_id=NULL,zone_verified_at=NULL WHERE id=?').run(d.id);db.prepare("DELETE FROM material_photos WHERE material_id=? AND kind='placement'").run(d.material_id);}
      return owned(d.id,req.user.id);
    });res.json({deposit});
  });
  app.post('/api/deposits/:id/arrive',requireUser,(req,res)=>{
    const d=owned(req.params.id,req.user.id);editable(d);
    db.prepare('UPDATE deposits SET arrived_at=coalesce(arrived_at,?) WHERE id=?').run(now(),d.id);res.json({deposit:owned(d.id,req.user.id)});
  });
  app.post('/api/deposits/:id/verify-zone',requireUser,(req,res)=>{
    const d=owned(req.params.id,req.user.id);editable(d);
    if(!d.arrived_at)fail('Confirm that you are at the Hub before scanning.',409);
    if(req.body.qr!==`REMATERIAL|ZONE|${d.qr_key}`)fail(`Wrong zone. Please scan the QR code for ${d.zone}.`,400,'Wrong zone. Please scan the QR code for {{zone}}.',{zone:d.zone});
    db.prepare('UPDATE deposits SET verified_zone_id=?,zone_verified_at=? WHERE id=?').run(d.zone_id,now(),d.id);res.json({deposit:owned(d.id,req.user.id)});
  });
  app.post('/api/deposits/:id/placement',requireUser,(req,res)=>{
    const deposit=transaction(db,()=>{
      const d=owned(req.params.id,req.user.id);editable(d);if(d.verified_zone_id!==d.zone_id)fail('Scan the correct Zone QR before uploading placement photos.',409);
      const ids=imageIds(req.body.photo_ids,req.user.id,3,d.material_id,false);
      if(ids.some(id=>d.photos.some(p=>p.id===id)))fail('Upload new placement photos showing the material on the shelf.');
      attach(d.material_id,d.id,ids,'placement');return owned(d.id,req.user.id);
    });res.json({deposit});
  });
  app.post('/api/deposits/:id/confirm',requireUser,(req,res)=>{
    const deposit=transaction(db,()=>{
      const d=owned(req.params.id,req.user.id);if(d.deposit_status==='confirmed')return d;
      if(!d.arrived_at||d.verified_zone_id!==d.zone_id)fail('Scan the correct Zone QR before confirming drop-off.',409);
      imageIds(d.placement_photos.map(p=>p.id),req.user.id,3,d.material_id);
      const date=now();
      db.prepare("UPDATE materials SET stock_quantity=initial_quantity,status='available',deposited_at=?,version=version+1 WHERE id=?").run(date,d.material_id);
      db.prepare("UPDATE deposits SET status='confirmed',confirmed_at=? WHERE id=?").run(date,d.id);
      const account=db.prepare('UPDATE credit_accounts SET balance=balance+1 WHERE user_id=? RETURNING balance,held').get(req.user.id);
      db.prepare("INSERT INTO credit_entries(user_id,type,balance_delta,held_delta,balance_after,held_after,deposit_id,operation_key) VALUES (?,'deposit_reward',1,0,?,?,?,?)").run(req.user.id,account.balance,account.held,d.id,`deposit:${d.id}`);
      db.prepare("INSERT INTO inventory_entries(material_id,type,quantity_delta,quantity_after,deposit_id,operation_key,created_at) VALUES (?,'deposit',?,?,?,?,?)").run(d.material_id,d.initial_quantity,d.initial_quantity,d.id,`deposit:${d.id}`,date);
      db.prepare("INSERT INTO activities(recipient_id,actor_id,type,material_id,created_at,event_key) VALUES (?,?,'deposit_confirmed',?,?,?)").run(req.user.id,req.user.id,d.material_id,date,`deposit:${d.id}`);
      return owned(d.id,req.user.id);
    });res.json({deposit});
  });
  app.get('/api/zones/:id/qr',async(req,res)=>{
    const zone=db.prepare('SELECT * FROM zones WHERE id=?').get(Number(req.params.id)||-1);if(!zone)fail('Zone not found.',404);
    res.type('svg').send(await QRCode.toString(`REMATERIAL|ZONE|${zone.qr_key}`,{type:'svg',margin:4,width:300}));
  });
  app.get('/zone-codes',(req,res)=>{
    const zones=db.prepare('SELECT * FROM zones ORDER BY id').all();
    res.type('html').send(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Material Hub — Zone QR cards</title><style>body{font:16px system-ui;max-width:1000px;margin:30px auto;padding:20px}main{display:flex;flex-wrap:wrap;gap:20px}article{border:1px solid #ccc;padding:20px;text-align:center;break-inside:avoid}img{width:230px}code{display:block;font-size:10px}h2{font-size:18px}</style><h1>Material Hub · Zone QR cards</h1><p>Local demonstration signs. Print these cards or display on a second screen for the camera to scan. These are zone identifiers, not web links.</p><main>${zones.map(z=>`<article><h2>${z.name.replaceAll('&','&amp;')}</h2><img src="/api/zones/${z.id}/qr" alt="${z.name.replaceAll('&','&amp;')} Zone QR"><code>REMATERIAL|ZONE|${z.qr_key}</code></article>`).join('')}</main></html>`);
  });
}
