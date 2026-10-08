import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../backend/src/database.mjs';
import { createApp } from '../backend/src/app.mjs';

test('saved materials: per-user hearts, list and removal',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'rematerial-favorites-')),db=openDatabase(join(dir,'test.sqlite'));
  const server=createApp(db,{uploadDir:join(dir,'uploads')}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
  const req=async(path,body,cookie='')=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  try{
    const a=await req('/auth/register',{username:'saver_a',password:'test-password'}),b=await req('/auth/register',{username:'saver_b',password:'test-password'});
    const material=(await req('/materials?availability=all')).data.materials[0];assert.ok(material,'a listed material exists');
    assert.equal((await req(`/materials/${material.id}/favorite`,{favorite:true})).status,401);
    assert.equal((await req('/me/favorites')).status,401);
    assert.equal((await req(`/materials/${material.id}/favorite`,{favorite:true},a.cookie)).data.is_favorite,true);
    assert.equal((await req(`/materials/${material.id}/favorite`,{favorite:true},a.cookie)).status,200,'saving twice is harmless');
    assert.deepEqual((await req('/me/favorites',undefined,a.cookie)).data.materials.map(m=>m.id),[material.id]);
    assert.equal((await req(`/materials/${material.id}`,undefined,a.cookie)).data.material.is_favorite,true);
    assert.equal((await req('/materials?availability=all',undefined,a.cookie)).data.materials.find(m=>m.id===material.id).is_favorite,true);
    assert.equal((await req(`/materials/${material.id}`,undefined,b.cookie)).data.material.is_favorite,false,'hearts are per user');
    assert.equal((await req('/me/favorites',undefined,b.cookie)).data.materials.length,0);
    assert.equal((await req('/materials/999999/favorite',{favorite:true},a.cookie)).status,404);
    assert.equal((await req(`/materials/${material.id}/favorite`,{favorite:false},a.cookie)).data.is_favorite,false);
    assert.equal((await req('/me/favorites',undefined,a.cookie)).data.materials.length,0);
  }finally{await new Promise(r=>server.close(r));db.close();}
});
