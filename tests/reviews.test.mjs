import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { openDatabase } from '../backend/src/database.mjs';
import { createApp } from '../backend/src/app.mjs';

test('Publisher review: owned reports, atomic relisting and permanent archival',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'rematerial-reviews-')),file=join(dir,'test.sqlite');let db=openDatabase(file),server,base;
  const start=async()=>{server=createApp(db,{uploadDir:join(dir,'uploads')}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api`;};
  const stop=()=>new Promise(r=>server.close(r));
  const req=async(path,body,cookie='')=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const png=await sharp({create:{width:32,height:32,channels:3,background:'green'}}).png().toBuffer();
  const upload=async cookie=>{const r=await fetch(base+'/uploads',{method:'POST',headers:{Cookie:cookie,'Content-Type':'image/png','X-File-Name':'photo.png'},body:png});assert.equal(r.status,201);return(await r.json()).photo.id;};
  let a,b,c;
  const report=async materialId=>{const r=(await req(`/materials/${materialId}/reserve`,{quantity:1,request_key:randomUUID()},b.cookie)).data.reservation;assert.ok(r);await req(`/reservations/${r.id}/verify-zone`,{qr:'REMATERIAL|ZONE|BOARD_FOAM'},b.cookie);const photo=await upload(b.cookie);const result=await req(`/reservations/${r.id}/issues`,{reason:'Damaged',notes:'Cracked corner',photo_ids:[photo]},b.cookie);assert.equal(result.status,200);return result.data.reservation;};
  const setup=async()=>{const photo=await upload(a.cookie),placement=await upload(a.cookie);const d=(await req('/deposits',{request_key:randomUUID(),name:'Review foam',category_id:1,quantity:3,unit:'sheets',dimensions_spec:'A3',color:'White',condition:'Good',notes:'Original notes',photo_ids:[photo]},a.cookie)).data.deposit;
    for(const [path,body] of [['arrive',{}],['verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'}],['placement',{photo_ids:[placement]}],['confirm',{}]])assert.equal((await req(`/deposits/${d.id}/${path}`,body,a.cookie)).status,200);
    return{d,r:await report(d.material_id)};};
  const get=async id=>(await req(`/me/issues/${id}`,undefined,a.cookie)).data.issue;
  const resolve=(id,body,cookie=a.cookie)=>req(`/me/issues/${id}/resolve`,body,cookie);
  const relist=i=>({resolution:'relisted',version:i.version,quantity:2,condition:'Used',notes:'Checked at Hub',photo_ids:i.placement_photos.map(p=>p.id),checked_at_hub:true});
  const credits=()=>db.prepare('SELECT * FROM credit_accounts ORDER BY user_id').all();
  try{await start();a=await req('/auth/register',{username:'review_owner',password:'test-password'});b=await req('/auth/register',{username:'review_reporter',password:'test-password'});c=await req('/auth/register',{username:'review_other',password:'test-password'});
    const{d,r}=await setup();let i=await get(r.issue.id);
    await t.test('only publisher sees pending count, reason, notes, timestamp and private photos',async()=>{
      assert.equal((await req('/me/issues',undefined,a.cookie)).data.pending_count,1);assert.equal(i.reason_label,'Damaged');assert.equal(i.notes,'Cracked corner');assert.ok(i.created_at);assert.equal(i.photos.length,1);
      assert.equal((await req('/me/issues',undefined,c.cookie)).data.pending_count,0);
      assert.equal((await req(`/me/issues/${i.id}`,undefined,b.cookie)).status,404);assert.equal((await resolve(i.id,relist(i),c.cookie)).status,404);assert.equal((await resolve(i.id,relist(i),'')).status,401);
      assert.equal((await fetch(base+`/media/${i.photos[0].id}`,{headers:{Cookie:a.cookie}})).status,200);assert.equal((await fetch(base+`/media/${i.photos[0].id}`,{headers:{Cookie:c.cookie}})).status,404);
    });
    await t.test('relisting validates Hub confirmation, actual quantity and placement photo ownership',async()=>{
      for(const body of [{...relist(i),checked_at_hub:false},{...relist(i),quantity:0},{...relist(i),quantity:1.5},{...relist(i),photo_ids:[]},{...relist(i),condition:''},{...relist(i),photo_ids:[await upload(c.cookie)]}])assert.equal((await resolve(i.id,body)).status,400);
      assert.equal((await get(i.id)).material_status,'unavailable');assert.equal((await get(i.id)).stock_quantity,3);
    });
    await t.test('stale version cannot overwrite an intervening inventory update',async()=>{
      db.prepare('UPDATE materials SET stock_quantity=stock_quantity+1,version=version+1 WHERE id=?').run(d.material_id);
      assert.equal((await resolve(i.id,relist(i))).status,409);assert.equal((await get(i.id)).stock_quantity,4);i=await get(i.id);
    });
    await t.test('rollback and duplicate relist preserve credits and old photos, updating inventory once',async()=>{
      const before=credits(),old=i.placement_photos[0].id,newPhoto=await upload(a.cookie),body={...relist(i),photo_ids:[newPhoto]};
      db.exec("CREATE TEMP TRIGGER fail_review BEFORE INSERT ON inventory_entries WHEN NEW.type='review_relisted' BEGIN SELECT RAISE(ABORT,'review rollback test'); END");assert.equal((await resolve(i.id,body)).status,500);db.exec('DROP TRIGGER fail_review');assert.equal((await get(i.id)).status,'open');assert.equal((await get(i.id)).stock_quantity,4);
      assert.ok((await Promise.all([resolve(i.id,body),resolve(i.id,body)])).every(x=>x.status===200));const done=await get(i.id);assert.equal(done.status,'resolved');assert.equal(done.resolution,'relisted');assert.equal(done.resolved_by,a.data.user.id);assert.equal(done.material_status,'available');assert.equal(done.stock_quantity,2);assert.equal(done.condition,'Used');assert.equal(done.material_notes,'Checked at Hub');assert.deepEqual(done.placement_photos.map(p=>p.id),[newPhoto]);assert.deepEqual(credits(),before);
      assert.equal((await req('/materials')).data.materials.some(m=>m.id===d.material_id),true);assert.equal((await req(`/reservations/${r.id}`,undefined,b.cookie)).data.reservation.issue.resolution,'relisted');assert.equal((await req('/me/issues',undefined,a.cookie)).data.pending_count,0);
      assert.equal(db.prepare('SELECT count(*) n FROM inventory_entries WHERE operation_key=?').get(`review:${i.id}`).n,1);assert.ok(db.prepare('SELECT id FROM material_photos WHERE media_id=?').get(old));assert.equal((await fetch(base+`/media/${old}`)).status,200);
    });
    await t.test('old relist replays cannot clear a later reservation or another report',async()=>{
      const active=(await req(`/materials/${d.material_id}/reserve`,{quantity:1,request_key:randomUUID()},b.cookie)).data.reservation;
      await resolve(i.id,relist(i));assert.equal((await get(i.id)).material_status,'reserved');await req(`/reservations/${active.id}/cancel`,{},b.cookie);
      const next=await report(d.material_id);await resolve(i.id,relist(i));assert.equal((await get(i.id)).material_status,'unavailable');assert.equal((await get(next.issue.id)).status,'open');
      const open=await get(next.issue.id);await resolve(open.id,relist(open));
    });
    await t.test('removal requires confirmation, archives once without credit changes or deletion',async()=>{
      const next=await setup(),issue=await get(next.r.issue.id),before=credits();const body={resolution:'removed',version:issue.version};
      assert.equal((await resolve(issue.id,body)).status,400);assert.ok((await Promise.all([resolve(issue.id,{...body,confirm_remove:true}),resolve(issue.id,{...body,confirm_remove:true})])).every(x=>x.status===200));assert.equal((await get(issue.id)).material_status,'closed');assert.equal((await get(issue.id)).stock_quantity,3);assert.deepEqual(credits(),before);
      assert.equal((await resolve(issue.id,relist(issue))).status,409);assert.equal((await req('/materials?availability=all')).data.materials.some(m=>m.id===next.d.material_id),false);assert.equal((await req(`/reservations/${next.r.id}`,undefined,b.cookie)).data.reservation.issue.resolution,'removed');assert.ok(db.prepare('SELECT id FROM materials WHERE id=?').get(next.d.material_id));
      await stop();db.close();db=openDatabase(file);await start();a.cookie=(await req('/auth/login',{username:'review_owner',password:'test-password'})).cookie;
      assert.equal((await get(issue.id)).resolution,'removed');assert.equal((await get(i.id)).resolution,'relisted');assert.deepEqual(credits(),before);
    });
    await t.test('demo reports stay hidden and cannot be assigned to an ordinary publisher',async()=>{
      // Build a legacy historical report in this isolated fixture; new samples cannot be reserved.
      db.prepare('UPDATE materials SET is_demo=0 WHERE id=1').run();
      const demo=await report(1);
      db.prepare('UPDATE materials SET is_demo=1 WHERE id=1').run();
      assert.equal((await req(`/me/issues/${demo.issue.id}`,undefined,a.cookie)).status,404);assert.equal((await req('/me/issues',undefined,a.cookie)).data.pending_count,0);assert.equal((await resolve(demo.issue.id,{resolution:'removed',confirm_remove:true,version:0})).status,404);assert.equal((await req('/materials?availability=all')).data.materials.some(m=>m.id===1),false);
    });
  }finally{if(server?.listening)await stop();db.close();}
});
