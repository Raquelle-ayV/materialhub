import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { openDatabase } from '../backend/src/database.mjs';
import { createApp } from '../backend/src/app.mjs';

test('B fulfillment: durable pickup, issue freeze and full returns',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'rematerial-fulfillment-')),file=join(dir,'test.sqlite');let db=openDatabase(file),server,base;
  const start=async()=>{server=createApp(db,{uploadDir:join(dir,'uploads')}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api`;};
  const stop=()=>new Promise(r=>server.close(r));
  const req=async(path,body,cookie='')=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const png=await sharp({create:{width:30,height:30,channels:3,background:'green'}}).png().toBuffer();
  const upload=async cookie=>{const r=await fetch(base+'/uploads',{method:'POST',headers:{Cookie:cookie,'Content-Type':'image/png','X-File-Name':'photo.png'},body:png});assert.equal(r.status,201);return(await r.json()).photo.id;};
  let a,b,c;
  const account=async cookie=>(await req('/auth/me',undefined,cookie)).data.user;
  const material=async(quantity=3)=>{const p=await upload(a.cookie),place=await upload(a.cookie);const d=(await req('/deposits',{request_key:randomUUID(),name:'Fulfillment foam',category_id:1,quantity,unit:'sheets',dimensions_spec:'A3',color:'White',condition:'Good',photo_ids:[p]},a.cookie)).data.deposit;
    for(const [path,body] of [['arrive',{}],['verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'}],['placement',{photo_ids:[place]}],['confirm',{}]])assert.equal((await req(`/deposits/${d.id}/${path}`,body,a.cookie)).status,200);return d;};
  const reserve=async(d,cookie=b.cookie,quantity=1)=>(await req(`/materials/${d.material_id}/reserve`,{quantity,request_key:randomUUID()},cookie)).data.reservation;
  const post=(r,path,body={},cookie=b.cookie)=>req(`/reservations/${r.id}/${path}`,body,cookie);
  const state=async(r,cookie=b.cookie)=>(await req(`/reservations/${r.id}`,undefined,cookie)).data.reservation;
  const stock=d=>db.prepare('SELECT status,stock_quantity FROM materials WHERE id=?').get(d.material_id);
  const verify=async(r,d,cookie=b.cookie)=>{assert.equal((await post(r,'verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'},cookie)).status,200);assert.equal((await post(r,'verify-material',{material_code:d.display_code},cookie)).status,200);};
  const pickup=(r,d,cookie=b.cookie)=>post(r,'pickup',{material_code:d.display_code,matches:true},cookie);
  const prepareReturn=async(r,cookie=b.cookie)=>{assert.equal((await post(r,'return/start',{},cookie)).status,200);assert.equal((await post(r,'return/verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'},cookie)).status,200);const photo=await upload(cookie);assert.equal((await post(r,'return/photos',{photo_ids:[photo]},cookie)).status,200);return photo;};
  try{await start();a=await req('/auth/register',{username:'fulfill_provider',password:'test-password'});b=await req('/auth/register',{username:'fulfill_collector',password:'test-password'});c=await req('/auth/register',{username:'fulfill_other',password:'test-password'});
    const d=await material();const r=await reserve(d);let returnedPhoto;
    await t.test('wrong zone, missing scan and wrong label never alter reservation, inventory or credits',async()=>{
      const before=await account(b.cookie);assert.equal((await pickup(r,d)).status,409);
      assert.equal((await post(r,'verify-zone',{qr:'REMATERIAL|ZONE|WOOD'})).status,400);assert.equal((await state(r)).verified_zone_id,null);
      assert.equal((await post(r,'verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'})).status,200);
      assert.equal((await state(r)).verified_zone_id,1);assert.equal((await post(r,'verify-material',{material_code:'M999999'})).status,400);
      assert.equal((await state(r)).material_code_verified_at,null);assert.deepEqual(await account(b.cookie),before);assert.equal(stock(d).stock_quantity,3);assert.equal((await state(r)).status,'reserved');
      assert.equal((await post(r,'verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'},c.cookie)).status,404);
    });
    await t.test('pickup rollback is atomic and duplicate pickup spends held credit only once',async()=>{
      await verify(r,d);db.exec("CREATE TEMP TRIGGER fail_pickup BEFORE INSERT ON credit_entries WHEN NEW.type='pickup_spend' BEGIN SELECT RAISE(ABORT,'pickup rollback test'); END");
      assert.equal((await pickup(r,d)).status,500);db.exec('DROP TRIGGER fail_pickup');assert.equal(stock(d).stock_quantity,3);assert.equal((await state(r)).status,'reserved');assert.equal((await account(b.cookie)).held,1);
      const responses=await Promise.all([pickup(r,d),pickup(r,d)]);assert.ok(responses.every(x=>x.status===200));assert.equal(stock(d).stock_quantity,2);assert.equal(stock(d).status,'available');
      const u=await account(b.cookie);assert.equal(u.balance,1);assert.equal(u.held,0);assert.equal(u.available,1);
      const s=await state(r);assert.equal(s.status,'collected');assert.equal(Date.parse(s.return_deadline_at)-Date.parse(s.completed_at),86400000);
      assert.equal((await req(`/deposits/${d.id}`,undefined,a.cookie)).data.deposit.collected_quantity,1);
      assert.equal((await post(r,'cancel')).status,409);assert.equal((await post(r,'issues',{reason:'Damaged'})).status,409);
    });
    await t.test('return requires independent correct scan, fresh owned photos and placement confirmation',async()=>{
      assert.equal((await post(r,'return/start')).status,200);assert.equal((await post(r,'return/confirm',{placed:true})).status,409);
      assert.equal((await post(r,'return/verify-zone',{qr:'REMATERIAL|ZONE|WOOD'})).status,400);
      assert.equal((await post(r,'return/verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'})).status,200);
      assert.equal((await post(r,'return/confirm',{placed:true})).status,400);
      assert.equal((await post(r,'return/photos',{photo_ids:[await upload(a.cookie)]})).status,400);
      returnedPhoto=await upload(b.cookie);assert.equal((await post(r,'return/photos',{photo_ids:[returnedPhoto,returnedPhoto]})).status,400);
      assert.equal((await post(r,'return/photos',{photo_ids:[returnedPhoto]})).status,200);assert.equal((await post(r,'return/confirm',{placed:false})).status,400);
    });
    await t.test('restart and relogin preserve collection time, return scan and uploaded draft photos',async()=>{
      const original=await state(r);await req('/auth/logout',{},b.cookie);await stop();db.close();db=openDatabase(file);await start();b.cookie=(await req('/auth/login',{username:'fulfill_collector',password:'test-password'})).cookie;
      const after=await state(r);assert.equal(after.completed_at,original.completed_at);assert.equal(after.return_deadline_at,original.return_deadline_at);assert.equal(after.return.verified_zone_id,1);assert.equal(after.return.photos[0].id,returnedPhoto);
    });
    await t.test('return rollback, repeated confirmations and pickup replay never duplicate stock/refund',async()=>{
      db.exec("CREATE TEMP TRIGGER fail_return BEFORE INSERT ON credit_entries WHEN NEW.type='return_refund' BEGIN SELECT RAISE(ABORT,'return rollback test'); END");
      assert.equal((await post(r,'return/confirm',{placed:true})).status,500);db.exec('DROP TRIGGER fail_return');assert.equal(stock(d).stock_quantity,2);assert.equal((await state(r)).status,'collected');assert.equal((await state(r)).return.status,'draft');
      assert.ok((await Promise.all([post(r,'return/confirm',{placed:true}),post(r,'return/confirm',{placed:true})])).every(x=>x.status===200));
      assert.equal(stock(d).stock_quantity,3);assert.equal(stock(d).status,'available');assert.equal((await account(b.cookie)).balance,2);assert.equal((await state(r)).placement_photos[0].id,returnedPhoto);assert.equal((await state(r)).status,'returned');
      assert.equal((await pickup(r,d)).status,200);assert.equal(stock(d).stock_quantity,3);assert.equal((await account(b.cookie)).balance,2);
      assert.equal(db.prepare("SELECT count(*) n FROM credit_entries WHERE reservation_id=? AND type='return_refund'").get(r.id).n,1);
      assert.equal(db.prepare("SELECT count(*) n FROM material_photos WHERE material_id=? AND kind='placement'").get(d.material_id).n,2);
    });
    await t.test('report validates reasons, optional photos, Other notes, refunds once and hides stock safely',async()=>{
      const issueR=await reserve(d);await verify(issueR,d);const before=stock(d).stock_quantity;
      assert.equal((await post(issueR,'issues',{reason:'Other',notes:'  '})).status,400);
      assert.equal((await post(issueR,'issues',{reason:'invalid'})).status,400);
      const photo=await upload(b.cookie);assert.equal((await post(issueR,'issues',{reason:'Damaged',photo_ids:[photo,photo,photo,photo]})).status,400);
      const body={reason:'Does not match the listing',notes:'Different thickness',photo_ids:[photo]};
      db.exec("CREATE TEMP TRIGGER fail_issue BEFORE INSERT ON credit_entries WHEN NEW.type='issue_release' BEGIN SELECT RAISE(ABORT,'issue rollback test'); END");assert.equal((await post(issueR,'issues',body)).status,500);db.exec('DROP TRIGGER fail_issue');assert.equal((await state(issueR)).status,'reserved');
      assert.ok((await Promise.all([post(issueR,'issues',body),post(issueR,'issues',body)])).every(x=>x.status===200));
      assert.equal((await state(issueR)).status,'issue_reported');assert.equal((await state(issueR)).issue.status,'open');assert.equal(stock(d).status,'unavailable');assert.equal(stock(d).stock_quantity,before);assert.equal((await account(b.cookie)).held,0);assert.equal((await account(b.cookie)).balance,2);
      assert.equal((await req('/materials?availability=all')).data.materials.some(m=>m.id===d.material_id),false);
      const owner=(await req(`/deposits/${d.id}`,undefined,a.cookie)).data.deposit;assert.equal(owner.issues[0].reason_label,body.reason);assert.equal(owner.issues[0].notes,body.notes);
      assert.equal((await fetch(base+`/media/${photo}`,{headers:{Cookie:a.cookie}})).status,200);assert.equal((await fetch(base+`/media/${photo}`,{headers:{Cookie:c.cookie}})).status,404);
      assert.equal((await pickup(issueR,d)).status,409);assert.equal((await post(issueR,'cancel')).status,409);
      await stop();db.close();db=openDatabase(file);await start();assert.equal((await state(issueR)).issue.reason_label,body.reason);assert.equal(stock(d).status,'unavailable');
    });
    await t.test('every report reason works, including missing material without a readable label',async()=>{
      for(const reason of ['Material is missing','Wrong material','Damaged','Other']){const item=await material(),res=await reserve(item);await post(res,'verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'});assert.equal((await post(res,'issues',{reason,notes:reason==='Other'?'Label unreadable':''})).status,200);assert.equal((await state(res)).issue.reason_label,reason);}assert.equal((await account(b.cookie)).balance,2);
    });
    await t.test('return at/after deadline rejected even with previously saved scan and photos',async()=>{
      const item=await material(2),res=await reserve(item, b.cookie,2);await verify(res,item);await pickup(res,item);assert.equal(stock(item).status,'collected');await prepareReturn(res);
      db.prepare('UPDATE reservations SET return_deadline_at=? WHERE id=?').run(new Date().toISOString(),res.id);
      assert.equal((await state(res)).can_return,false);assert.equal((await post(res,'return/start')).status,409);assert.equal((await post(res,'return/confirm',{placed:true})).status,409);assert.equal(stock(item).stock_quantity,0);
      db.prepare('UPDATE reservations SET return_deadline_at=? WHERE id=?').run(new Date(Date.now()+86400000).toISOString(),res.id);await post(res,'return/confirm',{placed:true});assert.equal(stock(item).stock_quantity,2);
    });
    await t.test('older return keeps later active reservation locked; issue and closed locks also survive',async()=>{
      for(const lock of ['reserved','unavailable','closed']){const item=await material(),first=await reserve(item);await verify(first,item);await pickup(first,item);await prepareReturn(first);
        const second=await reserve(item,c.cookie);if(lock==='unavailable'){await verify(second,item,c.cookie);await post(second,'issues',{reason:'Damaged'},c.cookie);}if(lock==='closed'){await post(second,'cancel',{},c.cookie);db.prepare("UPDATE materials SET status='closed' WHERE id=?").run(item.material_id);}
        await post(first,'return/confirm',{placed:true});assert.equal(stock(item).status,lock);assert.equal(stock(item).stock_quantity,3);
        if(lock==='reserved'){assert.equal((await state(second,c.cookie)).status,'reserved');await post(second,'cancel',{},c.cookie);assert.equal(stock(item).status,'available');}
      }
    });
    await t.test('pickup versus report race has exactly one terminal settlement; expiry rejects late pickup',async()=>{
      const item=await material(),res=await reserve(item);await verify(res,item);const replies=await Promise.all([pickup(res,item),post(res,'issues',{reason:'Damaged'})]);assert.deepEqual(replies.map(x=>x.status).sort(),[200,409]);assert.equal(db.prepare("SELECT count(*) n FROM credit_entries WHERE reservation_id=? AND type IN ('pickup_spend','issue_release')").get(res.id).n,1);
      if((await state(res)).status==='collected'){await prepareReturn(res);await post(res,'return/confirm',{placed:true});}
      const later=await reserve(await material());db.prepare('UPDATE reservations SET expires_at=? WHERE id=?').run(new Date(Date.now()-1).toISOString(),later.id);assert.equal((await post(later,'verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'})).status,409);assert.equal((await state(later)).status,'expired');
    });
  }finally{if(server?.listening)await stop();db.close();}
});
