import { test, expect } from '@playwright/test';
import sharp from 'sharp';

const password='success-test-2026';
async function register(request,prefix){const username=`${prefix}_${Date.now().toString(36)}`;expect((await request.post('/api/auth/register',{data:{username,password}})).status()).toBe(201);return username;}

test('success screens are the last step: after Confirm drop-off and after Confirm pickup, not after reserving',async({page})=>{
  test.setTimeout(60_000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await register(page.request,'giver');
  const png=await sharp({create:{width:120,height:120,channels:3,background:'#d6b47f'}}).png().toBuffer();
  const upload=async()=>(await(await page.request.post('/api/uploads',{headers:{'Content-Type':'image/png','X-File-Name':'p.png'},data:png})).json()).photo.id;
  const d=(await(await page.request.post('/api/deposits',{data:{request_key:crypto.randomUUID(),name:'foam board',category_id:1,quantity:2,unit:'boards',dimensions_spec:'A3',condition:'Like new',photo_ids:[await upload()]}})).json()).deposit;
  for(const [p,data] of [['arrive',{}],['verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'}],['placement',{photo_ids:[await upload()]}]])expect((await page.request.post(`/api/deposits/${d.id}/${p}`,{data})).status()).toBe(200);

  // Drop-off: the celebration follows the Confirm drop-off button
  await page.goto(`/deposits/${d.id}/place`);await page.getByRole('button',{name:'Confirm drop-off'}).click();
  await expect(page.getByRole('heading',{name:'Drop-off completed!'})).toBeVisible();
  await expect(page.getByText(`${d.display_code} is now available for others`)).toBeVisible();
  await expect(page.locator('.celebrate-material b')).toHaveText('Foam board × 2');
  await expect(page.locator('.celebrate-credit')).toHaveText('+1 credit earned, you now have 3 credits');
  await page.screenshot({path:'test-results/success-dropoff.png'});
  // Opening the post again later shows the plain record, no celebration
  await page.goto('/me/posts');await page.locator(`a[href="/deposits/${d.id}/success"]`).click();await expect(page.getByRole('heading',{name:'Your material is on the shelf'})).toBeVisible();await expect(page.locator('.celebrate')).toHaveCount(0);

  // Reserving goes straight to the reservation, no celebration
  await page.request.post('/api/auth/logout',{data:{}});await register(page.request,'taker');
  await page.goto(`/materials/${d.material_id}`);await page.getByRole('button',{name:'Reserve',exact:true}).click();
  await page.getByRole('button',{name:'Confirm reservation'}).click();
  await expect(page).toHaveURL(/\/reservations\/\d+$/);await expect(page.locator('.celebrate')).toHaveCount(0);
  const root=new URL(page.url()).pathname;

  // Pickup: Hub scan, type the label code, Confirm pickup, then the celebration
  expect((await page.request.post(`/api${root}/verify-zone`,{data:{qr:'REMATERIAL|ZONE|BOARD_FOAM'}})).status()).toBe(200);
  await page.goto(`${root}/check`);await page.getByLabel('Material code on the label').fill(d.display_code);await page.getByRole('button',{name:'Confirm pickup'}).click();
  await expect(page.getByRole('heading',{name:'Pickup completed!'})).toBeVisible();
  await expect(page.locator('.celebrate-credit')).toHaveText('1 credit used, 1 credit left');
  await page.screenshot({path:'test-results/success-pickup.png'});
  await page.getByRole('link',{name:'View my reservations'}).click();await expect(page).toHaveURL(/\/me\/reservations$/);
  expect(errors).toEqual([]);
});

test('reduced motion: no confetti, content simply fades in',async({browser})=>{
  const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:402,height:874}});const page=await context.newPage();
  await register(page.request,'calm');
  const png=await sharp({create:{width:60,height:60,channels:3,background:'#7a6352'}}).png().toBuffer();
  const upload=async()=>(await(await page.request.post('/api/uploads',{headers:{'Content-Type':'image/png','X-File-Name':'p.png'},data:png})).json()).photo.id;const photo=await upload();
  const d=(await(await page.request.post('/api/deposits',{data:{request_key:crypto.randomUUID(),name:'cork',category_id:4,quantity:1,unit:'pieces',dimensions_spec:'',dimensions_not_applicable:true,condition:'Used',photo_ids:[photo]}})).json()).deposit;
  for(const [p,data] of [['arrive',{}],['verify-zone',{qr:'REMATERIAL|ZONE|WOOD'}],['placement',{photo_ids:[await upload()]}]])await page.request.post(`/api/deposits/${d.id}/${p}`,{data});
  await page.goto(`/deposits/${d.id}/place`);await page.getByRole('button',{name:'Confirm drop-off'}).click();await expect(page.locator('.celebrate.calm')).toBeVisible();
  await page.waitForTimeout(700);await expect(page.locator('canvas')).toHaveCount(0);
  await context.close();
});
