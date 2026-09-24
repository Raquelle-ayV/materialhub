import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import sharp from 'sharp';
import { openDatabase } from '../backend/src/database.mjs';
import { createApp } from '../backend/src/app.mjs';

test('A flow: actual images, draft recovery, sequential codes, zone checks and one atomic reward',async t=>{
  const folder=mkdtempSync(join(tmpdir(),'rematerial-deposits-'));const file=join(folder,'test.sqlite');const uploadDir=join(folder,'uploads');
  let db=openDatabase(file);let server,base;
  async function start(){server=createApp(db,{uploadDir}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;}
  async function stop(){await new Promise((r,j)=>server.close(e=>e?j(e):r()));}
  const request=async(path,body,cookie='')=>{const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const png=await sharp({create:{width:60,height:50,channels:3,background:'#779977'}}).png().toBuffer();
  async function upload(cookie,buffer=png,type='image/png',name='photo.png'){const r=await fetch(base+'/api/uploads',{method:'POST',headers:{Cookie:cookie,'Content-Type':type,'X-File-Name':encodeURIComponent(name)},body:buffer});return{status:r.status,data:await r.json()};}
  try{
    await start();
    const a=await request('/auth/register',{username:'Provider',password:'test-password'});const b=await request('/auth/register',{username:'Another',password:'test-password'});let cookie=a.cookie;
    let photo,placement,dep;
    const valid={request_key:'create-material-001',name:'Foam board',category_id:1,custom_category_name:'',quantity:2,unit:'sheets',dimensions_spec:'A3, 5 mm',dimensions_not_applicable:false,color:'White',condition:'Good',reference_url:'https://example.com/material',notes:'Useful for models.',photo_ids:[]};
    await t.test('uploads reject anonymous, oversized, disguised and unsupported files',async()=>{
      assert.equal((await upload('')).status,401);
      assert.equal((await upload(cookie,Buffer.from('<svg/>'),'image/svg+xml','a.svg')).status,400);
      assert.equal((await upload(cookie,Buffer.from('not an image'))).status,400);
      assert.equal((await upload(cookie,png,'image/jpeg','a.jpg')).status,400);
      assert.equal((await upload(cookie,png,'image/png','video.mp4')).status,400);
      assert.equal((await upload(cookie,Buffer.alloc(10*1024*1024+1))).status,413);
      const r=await upload(cookie);assert.equal(r.status,201);photo=r.data.photo;
      assert.equal((await fetch(base+photo.url)).status,404);
      assert.equal((await fetch(base+photo.url,{headers:{Cookie:cookie}})).status,200);
      for(const format of ['jpeg','webp']){const bytes=await sharp(png).toFormat(format).toBuffer();assert.equal((await upload(cookie,bytes,`image/${format}`,`photo.${format}`)).status,201);}
      placement=(await upload(cookie)).data.photo;
    });
    await t.test('required fields, Other and photo counts are validated on the server',async()=>{
      valid.photo_ids=[photo.id];
      for(const field of ['name','unit','color','condition','dimensions_spec']) assert.equal((await request('/deposits',{...valid,[field]:''},cookie)).status,400,field);
      for(const quantity of [0,-1,1.2,1000001])assert.equal((await request('/deposits',{...valid,quantity},cookie)).status,400);
      assert.equal((await request('/deposits',{...valid,category_id:7},cookie)).status,400);
      assert.equal((await request('/deposits',{...valid,category_id:999},cookie)).status,400);
      assert.equal((await request('/deposits',{...valid,photo_ids:[]},cookie)).status,400);
      assert.equal((await request('/deposits',{...valid,photo_ids:Array(10).fill(photo.id)},cookie)).status,400);
      assert.equal((await request('/deposits',{...valid,reference_url:'javascript:alert(1)'},cookie)).status,400);
      assert.equal((await request('/deposits',valid,b.cookie)).status,400);
      assert.equal((await request('/deposit-draft',valid,cookie)).status,200);
    });
    await t.test('draft survives restart and relogin; repeat save returns the same unique material',async()=>{
      await request('/auth/logout',{},cookie);await stop();db.close();db=openDatabase(file);await start();
      cookie=(await request('/auth/login',{username:'Provider',password:'test-password'})).cookie;
      assert.equal((await request('/deposit-draft',undefined,cookie)).data.draft.name,'Foam board');
      const responses=await Promise.all([request('/deposits',valid,cookie),request('/deposits',valid,cookie)]);
      assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);dep=responses[0].data.deposit;
      assert.equal(dep.display_code,'M005');assert.equal(dep.status,'ready_for_drop_off');assert.equal(dep.stock_quantity,0);
      assert.equal(responses[1].data.deposit.id,dep.id);
      assert.equal((await request('/auth/me',undefined,cookie)).data.user.available,2);
      assert.equal((await request('/deposit-draft',undefined,cookie)).data.draft,null);
      assert.equal((await request(`/deposits/${dep.id}`,undefined,b.cookie)).status,404);
      assert.equal((await request(`/materials/${dep.material_id}`)).status,404);
      assert.equal((await request('/materials')).data.materials.some(m=>m.id===dep.material_id),false);
    });
    await t.test('arrival and correct QR are mandatory; wrong zone never unlocks placement',async()=>{
      assert.equal((await request(`/deposits/${dep.id}/verify-zone`,{qr:'REMATERIAL|ZONE|BOARD_FOAM'},cookie)).status,409);
      assert.equal((await request(`/deposits/${dep.id}/confirm`,{},cookie)).status,409);
      assert.equal((await request(`/deposits/${dep.id}/arrive`,{},cookie)).status,200);
      const wrong=await request(`/deposits/${dep.id}/verify-zone`,{qr:'REMATERIAL|ZONE|WOOD'},cookie);assert.equal(wrong.status,400);assert.match(wrong.data.error,/Board & Foam/);
      assert.equal((await request(`/deposits/${dep.id}/placement`,{photo_ids:[placement.id]},cookie)).status,409);
      assert.equal((await request(`/deposits/${dep.id}/verify-zone`,{qr:'https://example.com'},cookie)).status,400);
      assert.equal((await request(`/deposits/${dep.id}/verify-zone`,{qr:'REMATERIAL|ZONE|BOARD_FOAM'},cookie)).status,200);
      await stop();db.close();db=openDatabase(file);await start();
      const resumed=(await request(`/deposits/${dep.id}`,undefined,cookie)).data.deposit;assert.ok(resumed.arrived_at);assert.equal(resumed.verified_zone_id,1);
    });
    await t.test('same-category edits preserve QR; category change clears QR and old placement photos',async()=>{
      const edited=await request(`/deposits/${dep.id}/edit`,{...valid,version:0,name:'Foam board updated'},cookie);assert.equal(edited.status,200);assert.equal(edited.data.deposit.verified_zone_id,1);
      assert.equal((await request(`/deposits/${dep.id}/edit`,{...valid,version:0},cookie)).status,409);
      assert.equal((await request(`/deposits/${dep.id}/placement`,{photo_ids:[placement.id]},cookie)).status,200);
      const moved=await request(`/deposits/${dep.id}/edit`,{...valid,version:1,category_id:7,custom_category_name:'Mixed craft pieces',dimensions_spec:'',dimensions_not_applicable:true},cookie);
      assert.equal(moved.status,200);assert.equal(moved.data.deposit.verified_zone_id,null);assert.ok(moved.data.deposit.arrived_at);assert.equal(moved.data.deposit.placement_photos.length,0);
      assert.equal((await request(`/deposits/${dep.id}/confirm`,{},cookie)).status,409);
      assert.equal((await request(`/deposits/${dep.id}/verify-zone`,{qr:'REMATERIAL|ZONE|OTHER'},cookie)).status,200);
    });
    await t.test('placement is required and ownership/count are enforced before an atomic reward',async()=>{
      assert.equal((await request(`/deposits/${dep.id}/confirm`,{},cookie)).status,400);
      assert.equal((await request(`/deposits/${dep.id}/placement`,{photo_ids:[photo.id]},cookie)).status,400);
      assert.equal((await request(`/deposits/${dep.id}/placement`,{photo_ids:Array(4).fill(placement.id)},cookie)).status,400);
      const foreign=(await upload(b.cookie)).data.photo;
      assert.equal((await request(`/deposits/${dep.id}/placement`,{photo_ids:[foreign.id]},cookie)).status,400);
      assert.equal((await request(`/deposits/${dep.id}/placement`,{photo_ids:[placement.id]},cookie)).status,200);
      // An induced ledger error must roll back both material status and account balance.
      db.exec("CREATE TEMP TRIGGER fail_reward BEFORE INSERT ON credit_entries WHEN NEW.type='deposit_reward' BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
      assert.equal((await request(`/deposits/${dep.id}/confirm`,{},cookie)).status,500);
      assert.equal((await request('/auth/me',undefined,cookie)).data.user.available,2);
      assert.equal((await request(`/deposits/${dep.id}`,undefined,cookie)).data.deposit.status,'ready_for_drop_off');db.exec('DROP TRIGGER fail_reward');
      const results=await Promise.all([request(`/deposits/${dep.id}/confirm`,{},cookie),request(`/deposits/${dep.id}/confirm`,{},cookie)]);
      assert.ok(results.every(r=>r.status===200));assert.ok(results.every(r=>r.data.deposit.status==='available'));
      assert.equal((await request('/auth/me',undefined,cookie)).data.user.available,3);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM credit_entries WHERE deposit_id=? AND type='deposit_reward'").get(dep.id).n,1);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inventory_entries WHERE deposit_id=?').get(dep.id).n,1);
      assert.equal((await request(`/deposits/${dep.id}/edit`,{...valid,version:3},cookie)).status,409);
      assert.equal((await request(`/deposits/${dep.id}/placement`,{photo_ids:[]},cookie)).status,409);
      assert.equal((await fetch(base+photo.url)).status,200);
      assert.equal((await request('/materials')).data.materials.find(m=>m.id===dep.material_id).stock_quantity,2);
      await stop();db.close();db=openDatabase(file);await start();
      assert.equal((await request(`/deposits/${dep.id}/confirm`,{},cookie)).status,200);
      assert.equal((await request('/auth/me',undefined,cookie)).data.user.available,3);
    });
    await t.test('independent creations allocate new codes and nine photos are allowed',async()=>{
      const ids=[];for(let i=0;i<9;i++)ids.push((await upload(cookie)).data.photo.id);
      const one=await request('/deposits',{...valid,request_key:'second-material-002',photo_ids:ids},cookie);assert.equal(one.status,201);assert.equal(one.data.deposit.photos.length,9);assert.equal(one.data.deposit.display_code,'M006');
      const p=(await upload(cookie)).data.photo;
      const two=await request('/deposits',{...valid,request_key:'third-material-003',photo_ids:[p.id]},cookie);assert.equal(two.status,201);assert.equal(two.data.deposit.display_code,'M007');
      assert.equal((await request('/auth/me',undefined,cookie)).data.user.available,3);
    });
  }finally{if(server?.listening)await stop();db.close();const rel=relative(resolve(tmpdir()),resolve(folder));assert.ok(rel.startsWith('rematerial-deposits-')&&!rel.includes('..'));rmSync(folder,{recursive:true,force:true});}
});
