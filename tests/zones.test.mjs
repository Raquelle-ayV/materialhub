import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { openDatabase } from '../backend/src/database.mjs';
import { createApp } from '../backend/src/app.mjs';

test('zones: wrong-zone messages name both zones; pickup still needs the label code',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'rematerial-zones-')),db=openDatabase(join(dir,'test.sqlite'));
  const server=createApp(db,{uploadDir:join(dir,'uploads')}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
  const req=async(path,body,cookie='')=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  try{
    const owner=await req('/auth/register',{username:'zone_owner',password:'test-password'}),taker=await req('/auth/register',{username:'zone_taker',password:'test-password'});
    const png=await sharp({create:{width:30,height:30,channels:3,background:'green'}}).png().toBuffer();
    const upload=async()=>(await(await fetch(base+'/uploads',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'image/png','X-File-Name':'p.png'},body:png})).json()).photo;
    const d=(await req('/deposits',{request_key:randomUUID(),name:'Zone board',category_id:1,quantity:3,unit:'sheets',dimensions_spec:'A3',color:'White',condition:'Good',photo_ids:[(await upload()).id]},owner.cookie)).data.deposit;
    await req(`/deposits/${d.id}/arrive`,{},owner.cookie);
    let r=await req(`/deposits/${d.id}/verify-zone`,{qr:'REMATERIAL|ZONE|PAPER_SHEET'},owner.cookie);
    assert.equal(r.status,400);assert.equal(r.data.error,'This is the Paper & Sheet zone. Your material goes to Board & Foam.');
    r=await req(`/deposits/${d.id}/verify-zone`,{qr:'https://example.com'},owner.cookie);assert.equal(r.data.error,'This isn’t a Rematerial zone sign.');
    assert.equal((await req(`/deposits/${d.id}/verify-zone`,{zone_code:'BF'},owner.cookie)).status,400,'typed zone codes are not accepted');
    r=await req(`/deposits/${d.id}/verify-zone`,{qr:'REMATERIAL|ZONE|BOARD_FOAM'},owner.cookie);assert.equal(r.status,200);
    await req(`/deposits/${d.id}/placement`,{photo_ids:[(await upload()).id]},owner.cookie);assert.equal((await req(`/deposits/${d.id}/confirm`,{},owner.cookie)).status,200);

    const reservation=(await req(`/materials/${d.material_id}/reserve`,{quantity:2,request_key:randomUUID()},taker.cookie)).data.reservation;
    assert.equal((await req(`/materials/${d.material_id}`)).data.material.available_quantity,1);
    assert.equal((await req(`/reservations/${reservation.id}/pickup`,{matches:true},taker.cookie)).status,409,'zone must be confirmed first');
    r=await req(`/reservations/${reservation.id}/verify-zone`,{qr:'REMATERIAL|ZONE|PAPER_SHEET'},taker.cookie);assert.equal(r.data.error,'This is the Paper & Sheet zone. Your material is in Board & Foam.');
    r=await req(`/reservations/${reservation.id}/verify-zone`,{qr:'REMATERIAL|ZONE|BOARD_FOAM'},taker.cookie);assert.equal(r.status,200);assert.equal(r.data.reservation.color,'White');
    assert.equal((await req(`/reservations/${reservation.id}/pickup`,{matches:true},taker.cookie)).status,400,'the label code is required');
    assert.equal((await req(`/reservations/${reservation.id}/verify-material`,{material_code:'M999999'},taker.cookie)).status,400);
    assert.equal((await req(`/reservations/${reservation.id}/verify-material`,{material_code:d.display_code},taker.cookie)).status,200);
    r=await req(`/reservations/${reservation.id}/pickup`,{material_code:d.display_code,matches:true},taker.cookie);assert.equal(r.status,200);assert.equal(r.data.reservation.status,'collected');
    const m=(await req(`/materials/${d.material_id}`)).data.material;assert.equal(m.stock_quantity,1);assert.equal(m.available_quantity,1);assert.equal(m.status,'available');
  }finally{await new Promise(r=>server.close(r));db.close();}
});
