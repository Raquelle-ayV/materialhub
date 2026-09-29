import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../backend/src/database.mjs';
import {createApp} from '../backend/src/app.mjs';

test('samples are browse-only even via direct reservation API and never hold credits',async()=>{
 const db=openDatabase(':memory:');const server=createApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 try{
  const register=await fetch(base+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'sample_viewer',password:'sample-viewer-test'})});
  const cookie=register.headers.get('set-cookie').split(';')[0];
  const before=db.prepare('SELECT * FROM credit_accounts').all();
  const inventory=db.prepare('SELECT * FROM inventory_entries').all();
  const samples=(await(await fetch(base+'/materials')).json()).materials.filter(m=>m.is_demo);
  assert.ok(samples.length>0);assert.ok(samples.every(m=>m.available_quantity===0));
  for(const sample of samples){
   const r=await fetch(base+`/materials/${sample.id}/reserve`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({quantity:1,request_key:crypto.randomUUID()})});
   assert.equal(r.status,409);assert.match((await r.json()).error,/Sample materials/);
  }
  assert.deepEqual(db.prepare('SELECT * FROM credit_accounts').all(),before);assert.deepEqual(db.prepare('SELECT * FROM inventory_entries').all(),inventory);
  assert.equal(db.prepare('SELECT count(*) AS n FROM reservations').get().n,0);
 }finally{await new Promise(r=>server.close(r));db.close();}
});
