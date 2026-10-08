import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { openDatabase } from '../backend/src/database.mjs';
import { createApp } from '../backend/src/app.mjs';
import { expireReservations } from '../backend/src/reservations.mjs';

test('B stage one: real discovery, atomic reservations, cancellation and expiry',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'rematerial-reservations-')),file=join(dir,'test.sqlite');let db=openDatabase(file),server,base;
  const start=async()=>{server=createApp(db,{uploadDir:join(dir,'uploads')}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/api`;};
  const stop=()=>new Promise(r=>server.close(r));
  const req=async(path,body,cookie='')=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const reserve=(id,cookie,quantity=1,key=randomUUID())=>req(`/materials/${id}/reserve`,{quantity,request_key:key},cookie);
  const account=async cookie=>(await req('/auth/me',undefined,cookie)).data.user;
  try{await start();const provider=await req('/auth/register',{username:'provider_b',password:'test-password'}),a=await req('/auth/register',{username:'collector_a',password:'test-password'}),b=await req('/auth/register',{username:'collector_b',password:'test-password'});
    const png=await sharp({create:{width:30,height:30,channels:3,background:'green'}}).png().toBuffer();
    const upload=async()=>{const r=await fetch(base+'/uploads',{method:'POST',headers:{Cookie:provider.cookie,'Content-Type':'image/png','X-File-Name':'photo.png'},body:png});return(await r.json()).photo;};
    const photos=[await upload(),await upload()],placement=await upload();
    const d=(await req('/deposits',{request_key:randomUUID(),name:'Real two sheets',category_id:1,quantity:2,unit:'sheets',dimensions_spec:'A3',color:'White',condition:'Good',notes:'Real searchable notes',reference_url:'https://example.com/material',photo_ids:photos.map(p=>p.id)},provider.cookie)).data.deposit;
    await req(`/deposits/${d.id}/arrive`,{},provider.cookie);await req(`/deposits/${d.id}/verify-zone`,{qr:'REMATERIAL|ZONE|BOARD_FOAM'},provider.cookie);await req(`/deposits/${d.id}/placement`,{photo_ids:[placement.id]},provider.cookie);await req(`/deposits/${d.id}/confirm`,{},provider.cookie);
    let reservation,key=randomUUID();
    await t.test('real uploaded material appears first; name, category, code, filters and photos work',async()=>{
      assert.equal((await req('/materials')).data.materials[0].id,d.material_id);
      for(const q of ['Real two','Board & Foam',d.display_code,'searchable notes'])assert.ok((await req(`/materials?q=${encodeURIComponent(q)}`)).data.materials.some(m=>m.id===d.material_id));
      assert.equal((await req('/materials?condition=New&category=1')).data.materials.length,0);
      const m=(await req(`/materials/${d.material_id}`)).data.material;assert.equal(m.photos.length,2);assert.equal(m.reference_url,'https://example.com/material');assert.equal((await fetch(base.replace('/api','')+m.photos[1].url)).status,200);
    });
    await t.test('auth, own material, quantity and insufficient stock are rejected without credit changes',async()=>{
      assert.equal((await reserve(d.material_id,'')).status,401);assert.equal((await reserve(d.material_id,provider.cookie)).status,409);
      for(const q of [0,-1,1.5,'1'])assert.equal((await reserve(d.material_id,a.cookie,q)).status,400);
      assert.match((await reserve(d.material_id,a.cookie,3)).data.error,/Only 2 left/);
      db.prepare('UPDATE materials SET stock_quantity=1 WHERE id=?').run(d.material_id);
      assert.match((await reserve(d.material_id,a.cookie,2)).data.error,/Only 1 left/);assert.equal((await account(a.cookie)).held,0);
      db.prepare('UPDATE materials SET stock_quantity=2 WHERE id=?').run(d.material_id);
    });
    await t.test('quantity two, concurrent duplicate clicks and changed keys cannot double hold',async()=>{
      const results=await Promise.all([reserve(d.material_id,a.cookie,2,key),reserve(d.material_id,a.cookie,2,key)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);reservation=results[0].data.reservation;
      assert.equal(results[1].data.reservation.id,reservation.id);assert.equal(reservation.reserved_quantity,2);assert.equal(Date.parse(reservation.expires_at)-Date.parse(reservation.created_at),86400000);
      assert.equal((await reserve(d.material_id,a.cookie,2)).status,409);assert.equal((await reserve(d.material_id,b.cookie,1)).status,409);
      assert.equal((await account(a.cookie)).held,1);assert.equal((await account(a.cookie)).balance,2);assert.equal((await account(b.cookie)).held,0);
      const m=(await req(`/materials/${d.material_id}`)).data.material;assert.equal(m.stock_quantity,2);assert.equal(m.available_quantity,0);assert.equal(m.status,'reserved');
      assert.equal((await req(`/deposits/${d.id}`,undefined,provider.cookie)).data.deposit.status,'reserved');
      assert.ok((await req('/materials?availability=reserved')).data.materials.some(m=>m.id===d.material_id));
      assert.equal((await req(`/reservations/${reservation.id}`,undefined,b.cookie)).status,404);
    });
    await t.test('refresh, restart and relogin retain reservation and exact deadline',async()=>{
      await req('/auth/logout',{},a.cookie);await stop();db.close();db=openDatabase(file);await start();a.cookie=(await req('/auth/login',{username:'collector_a',password:'test-password'})).cookie;
      const r=(await req('/me/reservations',undefined,a.cookie)).data.reservations[0];assert.equal(r.id,reservation.id);assert.equal(r.expires_at,reservation.expires_at);assert.equal((await account(a.cookie)).held,1);
    });
    await t.test('cancellation is owned, idempotent and restores availability plus held credit',async()=>{
      assert.equal((await req(`/reservations/${reservation.id}/cancel`,{},b.cookie)).status,404);
      const results=await Promise.all([req(`/reservations/${reservation.id}/cancel`,{},a.cookie),req(`/reservations/${reservation.id}/cancel`,{},a.cookie)]);assert.ok(results.every(r=>r.data.reservation.status==='cancelled'));
      assert.equal((await account(a.cookie)).available,2);assert.equal((await account(a.cookie)).held,0);assert.equal((await req(`/materials/${d.material_id}`)).data.material.available_quantity,2);
      assert.equal(db.prepare("SELECT count(*) n FROM activities WHERE type='reservation_cancelled' AND material_id=?").get(d.material_id).n,1);
      assert.equal((await reserve(d.material_id,a.cookie,2,key)).data.reservation.status,'cancelled');assert.equal((await account(a.cookie)).held,0);
    });
    await t.test('reservations lock only their quantity: two people share the stock, one active reservation each',async()=>{
      const results=await Promise.all([reserve(d.material_id,a.cookie),reserve(d.material_id,b.cookie)]);assert.deepEqual(results.map(r=>r.status),[201,201]);
      const [ra,rb]=results.map(r=>r.data.reservation);assert.equal(ra.reserved_quantity,1);assert.equal(rb.reserved_quantity,1);
      let m=(await req(`/materials/${d.material_id}`)).data.material;assert.equal(m.stock_quantity,2);assert.equal(m.available_quantity,0);assert.equal(m.status,'reserved');
      assert.match((await reserve(d.material_id,a.cookie)).data.error,/already have an active reservation/);
      await req(`/reservations/${ra.id}/cancel`,{},a.cookie);
      m=(await req(`/materials/${d.material_id}`)).data.material;assert.equal(m.available_quantity,1);assert.equal(m.status,'available');
      assert.equal((await reserve(d.material_id,a.cookie,2)).status,409,'only the unreserved quantity can be taken');
      await req(`/reservations/${rb.id}/cancel`,{},b.cookie);
      m=(await req(`/materials/${d.material_id}`)).data.material;assert.equal(m.available_quantity,2);assert.equal(m.status,'available');
    });
    await t.test('insufficient available credits cannot lock another material',async()=>{
      // This isolated fixture models tradable stock; production samples are browse-only.
      db.prepare('UPDATE materials SET is_demo=0 WHERE id IN (1,2)').run();
      const r1=(await reserve(1,a.cookie)).data.reservation,r2=(await reserve(2,a.cookie)).data.reservation;
      assert.match((await reserve(d.material_id,a.cookie)).data.error,/credits/);assert.equal((await req(`/materials/${d.material_id}`)).data.material.status,'available');
      await req(`/reservations/${r1.id}/cancel`,{},a.cookie);await req(`/reservations/${r2.id}/cancel`,{},a.cookie);
    });
    await t.test('ledger failure rolls back reservation, stock state, request key and held credit',async()=>{
      db.exec("CREATE TEMP TRIGGER fail_hold BEFORE INSERT ON credit_entries WHEN NEW.type='reservation_hold' BEGIN SELECT RAISE(ABORT,'reservation rollback test'); END");
      assert.equal((await reserve(d.material_id,a.cookie)).status,500);db.exec('DROP TRIGGER fail_hold');assert.equal((await account(a.cookie)).held,0);assert.equal((await req(`/materials/${d.material_id}`)).data.material.status,'available');
    });
    await t.test('expiry at exact deadline settles once, survives restart and rejects late cancellation',async()=>{
      const r=(await reserve(d.material_id,a.cookie)).data.reservation;assert.equal(expireReservations(db,Date.parse(r.expires_at)-1),0);assert.equal(expireReservations(db,Date.parse(r.expires_at)),1);assert.equal(expireReservations(db,Date.parse(r.expires_at)),0);
      assert.equal((await account(a.cookie)).balance,1);assert.equal((await account(a.cookie)).held,0);assert.equal((await req(`/reservations/${r.id}/cancel`,{},a.cookie)).status,409);
      assert.equal((await req(`/materials/${d.material_id}`)).data.material.available_quantity,2);
      const next=(await reserve(d.material_id,a.cookie)).data.reservation;db.prepare('UPDATE reservations SET expires_at=? WHERE id=?').run(new Date(Date.now()-1).toISOString(),next.id);
      await stop();db.close();db=openDatabase(file);await start();assert.equal((await req(`/reservations/${next.id}/cancel`,{},a.cookie)).status,409);assert.equal((await account(a.cookie)).balance,0);assert.equal((await account(a.cookie)).held,0);
    });
  }finally{if(server?.listening)await stop();db.close();}
});
