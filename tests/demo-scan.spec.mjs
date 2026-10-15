import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test('local dev: "simulate scan" verifies the material\'s own zone and moves to drop off',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  expect((await page.request.post('/api/auth/register',{data:{username:`demo_${Date.now().toString(36)}`,password:'demo-scan-2026'}})).status()).toBe(201);
  const png=await sharp({create:{width:80,height:80,channels:3,background:'#d6b47f'}}).png().toBuffer();
  const photo=(await(await page.request.post('/api/uploads',{headers:{'Content-Type':'image/png','X-File-Name':'p.png'},data:png})).json()).photo;
  const d=(await(await page.request.post('/api/deposits',{data:{request_key:crypto.randomUUID(),name:'Demo plank',category_id:4,quantity:1,unit:'boards',dimensions_spec:'',dimensions_not_applicable:true,condition:'Used',photo_ids:[photo.id]}})).json()).deposit;
  await page.request.post(`/api/deposits/${d.id}/arrive`,{data:{}});
  await page.goto(`/deposits/${d.id}/scan`);await expect(page.getByRole('heading',{name:'Find area',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'模拟扫码成功'}).click();
  await expect(page.getByRole('heading',{name:'Drop off',exact:true})).toBeVisible();
  expect((await(await page.request.get(`/api/deposits/${d.id}`)).json()).deposit.verified_zone_id).toBe(d.zone_id);
  expect(errors).toEqual([]);
});
