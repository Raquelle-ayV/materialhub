import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../backend/src/database.mjs';
import { createApp } from '../backend/src/app.mjs';

test('account, unique reward, durable session, origin protection and database constraints', async () => {
  const folder = mkdtempSync(join(tmpdir(),'rematerial-auth-'));
  const file = join(folder,'test.sqlite');
  let db = openDatabase(file); let server; let base;
  async function start() { server = createApp(db).listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r)); base=`http://127.0.0.1:${server.address().port}`; }
  async function stop() { await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())); }
  async function request(path,body,cookie='',origin) { const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}; }
  try {
    await start();
    assert.equal((await request('/api/health')).data.database,true);
    assert.equal((await request('/api/me/credits')).status,401);
    assert.equal((await request('/api/auth/register',{username:'ab',password:'short'})).status,400);
    const result = await request('/api/auth/register',{username:'Maker_one',password:'test-password-2026'});
    assert.equal(result.status,201);assert.equal(result.data.user.available,2);assert.ok(result.cookie);
    const cookie=result.cookie;const id=result.data.user.id;
    assert.equal((await request('/api/auth/register',{username:'maker_ONE',password:'another-password'})).status,409);
    assert.equal((await request('/api/auth/me',undefined,cookie)).data.user.username,'Maker_one');
    assert.equal((await request('/api/me/credits',undefined,cookie)).data.entries.length,1);
    assert.equal(db.prepare('SELECT type,balance_delta FROM credit_entries WHERE user_id=?').get(id).balance_delta,2);
    assert.notEqual(db.prepare('SELECT password_hash FROM users WHERE id=?').get(id).password_hash,'test-password-2026');
    assert.equal((await request('/api/auth/login',{username:'Maker_one',password:'wrong-password'})).status,401);
    assert.equal((await request('/api/auth/logout',{},cookie,'https://untrusted.example')).status,403);
    const parallel=await Promise.all([request('/api/auth/register',{username:'Concurrent',password:'parallel-password'}),request('/api/auth/register',{username:'concurrent',password:'parallel-password'})]);
    assert.deepEqual(parallel.map(x=>x.status).sort(),[201,409]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM credit_entries WHERE type='registration_reward'").get().n,2);
    assert.throws(()=>db.prepare("INSERT INTO credit_entries(user_id,type,balance_delta,held_delta,balance_after,held_after,operation_key) VALUES (?,'registration_reward',2,0,4,0,'different-key')").run(id),/UNIQUE/);
    // Close and reopen the file and API: neither the account nor the session is in memory only.
    await stop();db.close();db=openDatabase(file);await start();
    assert.equal((await request('/api/auth/me',undefined,cookie)).data.user.available,2);
    assert.equal((await request('/api/me/credits',undefined,cookie)).data.entries.length,1);
    assert.equal((await request('/api/auth/logout',{},cookie)).status,200);
    assert.equal((await request('/api/auth/me',undefined,cookie)).data.user,null);
    const login=await request('/api/auth/login',{username:'MAKER_ONE',password:'test-password-2026'});
    assert.equal(login.status,200);assert.equal(login.data.user.available,2);
    assert.equal((await request('/api/materials')).data.materials.length,4);
    assert.equal((await request('/api/materials?q=canvas')).data.materials[0].name,'Cotton canvas');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM zones').get().n,7);
    db.prepare("INSERT INTO reservations(material_id,user_id,status,reserved_quantity,unit_snapshot,zone_id_snapshot,created_at,expires_at) VALUES (1,?,'reserved',1,'sheets',1,'2026-09-22','2026-09-23')").run(id);
    assert.throws(()=>db.prepare("INSERT INTO reservations(material_id,user_id,status,reserved_quantity,unit_snapshot,zone_id_snapshot,created_at,expires_at) VALUES (1,?,'reserved',1,'sheets',1,'2026-09-22','2026-09-23')").run(id),/UNIQUE/);
  } finally { if(server?.listening)await stop(); db.close(); rmSync(folder,{recursive:true,force:true}); }
});
