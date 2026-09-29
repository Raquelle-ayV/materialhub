import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { openDatabase } from '../backend/src/database.mjs';
import { createApp } from '../backend/src/app.mjs';

test('My posts: owner management preserves reservations, rewards, inventory and returns', async t => {
  const dir=mkdtempSync(join(tmpdir(),'rematerial-posts-')),db=openDatabase(':memory:');
  const server=createApp(db,{uploadDir:join(dir,'uploads')}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const req=async(path,body,cookie='')=>{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
  const png=await sharp({create:{width:8,height:8,channels:3,background:'#264c3b'}}).png().toBuffer();
  const upload=async(cookie)=>{const response=await fetch(base+'/uploads',{method:'POST',headers:{Cookie:cookie,'Content-Type':'image/png','X-File-Name':'material.png'},body:png});assert.equal(response.status,201);return(await response.json()).photo.id;};
  const owner=await req('/auth/register',{username:'posts_owner',password:'test-password'}),buyer=await req('/auth/register',{username:'posts_buyer',password:'test-password'});
  const photoIds=async()=>[await upload(owner.cookie)];
  const material=async(confirmed=true)=>{
    const result=await req('/deposits',{request_key:randomUUID(),name:'Managed board',category_id:1,quantity:2,unit:'sheets',dimensions_spec:'A3',color:'White',condition:'Good',photo_ids:await photoIds()},owner.cookie);
    assert.equal(result.status,201);const d=result.data.deposit;
    if(confirmed)for(const[path,body]of[['arrive',{}],['verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'}],['placement',{photo_ids:await photoIds()}],['confirm',{}]])assert.equal((await req(`/deposits/${d.id}/${path}`,body,owner.cookie)).status,200);
    return d;
  };
  const management=async id=>(await req('/me/posts',undefined,owner.cookie)).data.management.find(item=>item.material_id===id);
  const manage=async(d,action='delete',cookie=owner.cookie,extras={})=>req(`/me/posts/${d.material_id}/manage`,{action,confirm:true,version:(await management(d.material_id))?.version,...extras},cookie);
  const credits=()=>db.prepare('SELECT * FROM credit_accounts ORDER BY user_id').all();
  const stock=id=>db.prepare('SELECT status,stock_quantity FROM materials WHERE id=?').get(id);
  try {
    await t.test('draft deletion needs confirmation and the current key, without changing other users or photos',async()=>{
      const id=await upload(owner.cookie),draft={request_key:randomUUID(),name:'Draft board',photo_ids:[id]};
      await req('/deposit-draft',draft,owner.cookie);
      assert.equal((await req('/deposit-draft/delete',{request_key:draft.request_key},owner.cookie)).status,400);
      assert.equal((await req('/deposit-draft/delete',{request_key:'outdated-key',confirm:true},owner.cookie)).status,409);
      await req('/deposit-draft/delete',{request_key:draft.request_key,confirm:true},buyer.cookie);
      assert.equal((await req('/deposit-draft',undefined,owner.cookie)).data.draft.name,'Draft board');
      assert.equal((await req('/deposit-draft/delete',{request_key:draft.request_key,confirm:true},owner.cookie)).status,200);
      assert.equal((await req('/deposit-draft',undefined,owner.cookie)).data.draft,null);
      assert.ok(db.prepare('SELECT id FROM media WHERE id=?').get(id));
    });
    await t.test('pending deletion enforces ownership and cannot be restored through old flow URLs',async()=>{
      const d=await material(false),before=credits();
      assert.equal((await manage(d,'delete',buyer.cookie)).status,404);
      assert.equal((await manage(d,'delete','')).status,401);
      assert.equal((await manage(d,'delete',owner.cookie,{confirm:false})).status,400);
      assert.equal((await manage(d,'delete',owner.cookie,{version:99})).status,409);
      assert.equal((await manage(d)).status,200);
      assert.equal((await req('/deposits',undefined,owner.cookie)).data.deposits.some(item=>item.id===d.id),false);
      assert.equal((await req(`/materials/${d.material_id}`,undefined,owner.cookie)).status,404);
      for(const path of ['arrive','verify-zone','placement','confirm','edit'])assert.equal((await req(`/deposits/${d.id}/${path}`,{},owner.cookie)).status,404);
      assert.deepEqual(credits(),before);assert.equal(stock(d.material_id).stock_quantity,0);
    });
    await t.test('published deletion hides post but keeps its one reward and stock ledger, even on replay',async()=>{
      const d=await material(),before=credits(),entries=db.prepare('SELECT count(*) AS n FROM credit_entries').get().n;
      assert.equal((await manage(d)).status,200);
      assert.equal((await manage(d)).status,200);
      assert.equal((await req(`/deposits/${d.id}/confirm`,{},owner.cookie)).status,404);
      assert.equal((await req(`/materials/${d.material_id}`)).status,404);
      assert.deepEqual(credits(),before);assert.equal(db.prepare('SELECT count(*) AS n FROM credit_entries').get().n,entries);
      assert.equal(db.prepare("SELECT count(*) AS n FROM credit_entries WHERE deposit_id=? AND type='deposit_reward'").get(d.id).n,1);
      assert.equal(db.prepare("SELECT count(*) AS n FROM inventory_entries WHERE material_id=? AND type='owner_delete'").get(d.material_id).n,1);
      assert.equal(stock(d.material_id).stock_quantity,2);assert.equal(stock(d.material_id).status,'closed');
    });
    await t.test('sample materials stay immutable even when the requester owns the sample row',async()=>{
      const d=await material();db.prepare('UPDATE materials SET is_demo=1 WHERE id=?').run(d.material_id);
      assert.equal((await manage(d)).status,409);assert.match((await management(d.material_id)).blocked_reason,/Sample materials/);
      assert.equal(stock(d.material_id).status,'available');
    });
    await t.test('active reservation blocks both actions; cancelled history permits archive only',async()=>{
      const d=await material(),reservation=(await req(`/materials/${d.material_id}/reserve`,{quantity:1,request_key:randomUUID()},buyer.cookie)).data.reservation;
      const before=credits();
      assert.match((await management(d.material_id)).blocked_reason,/active reservation/);
      assert.equal((await manage(d,'delete')).status,409);assert.equal((await manage(d,'archive')).status,409);
      assert.deepEqual(credits(),before);assert.equal(stock(d.material_id).status,'reserved');
      await req(`/reservations/${reservation.id}/cancel`,{},buyer.cookie);
      assert.equal((await manage(d,'delete')).status,409);assert.equal((await manage(d,'archive')).status,200);
      assert.equal((await management(d.material_id)).disposition,'archived');
      assert.equal((await req(`/reservations/${reservation.id}`,undefined,buyer.cookie)).data.reservation.status,'cancelled');
      assert.equal((await req(`/materials/${d.material_id}/reserve`,{quantity:1,request_key:randomUUID()},buyer.cookie)).status,409);
    });
    await t.test('open problem reports retain the established review and remove workflow',async()=>{
      const d=await material(),reservation=(await req(`/materials/${d.material_id}/reserve`,{quantity:1,request_key:randomUUID()},buyer.cookie)).data.reservation;
      await req(`/reservations/${reservation.id}/verify-zone`,{qr:'REMATERIAL|ZONE|BOARD_FOAM'},buyer.cookie);
      const reported=await req(`/reservations/${reservation.id}/issues`,{reason:'Damaged',notes:'Corner needs review'},buyer.cookie);
      assert.equal(reported.status,200);assert.equal((await manage(d,'archive')).status,409);
      const issue=(await req(`/me/issues/${reported.data.reservation.issue.id}`,undefined,owner.cookie)).data.issue;
      assert.equal((await req(`/me/issues/${issue.id}/resolve`,{resolution:'removed',version:issue.version,confirm_remove:true},owner.cookie)).status,200);
      assert.equal((await management(d.material_id)).disposition,'archived');
      assert.equal((await req(`/reservations/${reservation.id}`,undefined,buyer.cookie)).data.reservation.issue.resolution,'removed');
    });
    await t.test('archiving after pickup preserves the original 24-hour return and refunds once without relisting',async()=>{
      const d=await material(),reservation=(await req(`/materials/${d.material_id}/reserve`,{quantity:1,request_key:randomUUID()},buyer.cookie)).data.reservation;
      for(const[path,body]of[['verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'}],['verify-material',{material_code:d.display_code}],['pickup',{material_code:d.display_code,matches:true}]])assert.equal((await req(`/reservations/${reservation.id}/${path}`,body,buyer.cookie)).status,200);
      assert.equal((await manage(d,'archive')).status,200);const balance=(await req('/auth/me',undefined,buyer.cookie)).data.user.balance;
      for(const[path,body]of[['return/start',{}],['return/verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'}]])assert.equal((await req(`/reservations/${reservation.id}/${path}`,body,buyer.cookie)).status,200);
      const photo=await upload(buyer.cookie);
      await req(`/reservations/${reservation.id}/return/photos`,{photo_ids:[photo]},buyer.cookie);
      for(let i=0;i<2;i++)assert.equal((await req(`/reservations/${reservation.id}/return/confirm`,{placed:true},buyer.cookie)).status,200);
      assert.equal(stock(d.material_id).status,'closed');assert.equal(stock(d.material_id).stock_quantity,2);
      assert.equal((await req('/auth/me',undefined,buyer.cookie)).data.user.balance,balance+1);
      assert.equal((await req(`/reservations/${reservation.id}`,undefined,buyer.cookie)).data.reservation.status,'returned');
      assert.equal(db.prepare("SELECT count(*) AS n FROM credit_entries WHERE reservation_id=? AND type='return_refund'").get(reservation.id).n,1);
      assert.equal((await req(`/deposits/${d.id}/confirm`,{},owner.cookie)).data.deposit.status,'closed');
    });
  } finally { await new Promise(resolve=>server.close(resolve));db.close(); }
});
