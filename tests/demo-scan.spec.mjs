import { test, expect } from '@playwright/test';
import sharp from 'sharp';

const password='demo-scan-2026';
async function material(request,name,category_id,zone){
  const png=await sharp({create:{width:80,height:80,channels:3,background:'#d6b47f'}}).png().toBuffer();
  const upload=async()=>(await(await request.post('/api/uploads',{headers:{'Content-Type':'image/png','X-File-Name':'p.png'},data:png})).json()).photo.id;
  const d=(await(await request.post('/api/deposits',{data:{request_key:crypto.randomUUID(),name,category_id,quantity:2,unit:'boards',dimensions_spec:'',dimensions_not_applicable:true,condition:'Used',photo_ids:[await upload()]}})).json()).deposit;
  await request.post(`/api/deposits/${d.id}/arrive`,{data:{}});
  return {d,upload,zone};
}

test('mockup only: "skip scan" verifies the right zone when storing and picking up; the normal page has no skip',async({page})=>{
  test.setTimeout(60_000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  expect((await page.request.post('/api/auth/register',{data:{username:`skip_${Date.now().toString(36)}`,password}})).status()).toBe(201);
  const {d,upload}=await material(page.request,'Demo plank',4);

  // Normal page: real camera only
  await page.goto(`/deposits/${d.id}/scan`);await expect(page.getByRole('heading',{name:'Find area',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'跳过扫码'})).toHaveCount(0);

  // Inside /mockup: skip storing scan
  await page.goto('/mockup');const frame=page.frameLocator('iframe');await expect(frame.locator('.explore-heading')).toBeVisible();
  await page.frames()[1].evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},`/deposits/${d.id}/scan`);
  await frame.getByRole('button',{name:'跳过扫码'}).click();
  await expect(frame.getByRole('heading',{name:'Drop off',exact:true})).toBeVisible();
  expect((await(await page.request.get(`/api/deposits/${d.id}`)).json()).deposit.verified_zone_id).toBe(d.zone_id);

  // Finish the drop-off, then pick it up as someone else: skip the pickup scan too
  await page.request.post(`/api/deposits/${d.id}/placement`,{data:{photo_ids:[await upload()]}});await page.request.post(`/api/deposits/${d.id}/confirm`,{data:{}});
  await page.request.post('/api/auth/logout',{data:{}});
  expect((await page.request.post('/api/auth/register',{data:{username:`taker_${Date.now().toString(36)}`,password}})).status()).toBe(201);
  const r=(await(await page.request.post(`/api/materials/${d.material_id}/reserve`,{data:{quantity:1,request_key:crypto.randomUUID()}})).json()).reservation;
  await page.goto('/mockup');await expect(frame.locator('.explore-heading')).toBeVisible();
  await page.frames()[1].evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},`/reservations/${r.id}/guide`);
  await frame.getByRole('button',{name:'I’m at the Hub'}).click();
  await frame.getByRole('button',{name:'跳过扫码'}).click();
  await expect.poll(async()=>(await(await page.request.get(`/api/reservations/${r.id}`)).json()).reservation.verified_zone_id).toBe(d.zone_id);
  expect(errors).toEqual([]);
});
