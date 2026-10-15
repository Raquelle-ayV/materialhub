import { test, expect } from '@playwright/test';
import sharp from 'sharp';

const password='success-test-2026';
async function register(request,prefix){const username=`${prefix}_${Date.now().toString(36)}`;expect((await request.post('/api/auth/register',{data:{username,password}})).status()).toBe(201);return username;}

test('success screens: drop-off completed and material reserved, with animation and credit tick',async({page})=>{
  test.setTimeout(60_000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await register(page.request,'giver');
  const png=await sharp({create:{width:120,height:120,channels:3,background:'#d6b47f'}}).png().toBuffer();
  const upload=async()=>(await(await page.request.post('/api/uploads',{headers:{'Content-Type':'image/png','X-File-Name':'p.png'},data:png})).json()).photo.id;
  const d=(await(await page.request.post('/api/deposits',{data:{request_key:crypto.randomUUID(),name:'foam board',category_id:1,quantity:2,unit:'boards',dimensions_spec:'A3',condition:'Like new',photo_ids:[await upload()]}})).json()).deposit;
  for(const [p,data] of [['arrive',{}],['verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'}],['placement',{photo_ids:[await upload()]}],['confirm',{}]])expect((await page.request.post(`/api/deposits/${d.id}/${p}`,{data})).status()).toBe(200);

  // Drop-off version
  await page.goto(`/deposits/${d.id}/success`);
  await expect(page.getByRole('heading',{name:'Drop-off completed!'})).toBeVisible();
  await expect(page.getByText(`${d.display_code} is now available for others`)).toBeVisible();
  await expect(page.locator('.celebrate-material b')).toHaveText('Foam board × 2');
  await expect(page.locator('.celebrate-credit')).toHaveText('+1 credit earned, you now have 3 credits');
  await page.screenshot({path:'test-results/success-dropoff.png'});
  await expect(page.getByRole('link',{name:'Share another material'})).toBeVisible();

  // Reservation version, through the real reserve sheet
  await page.request.post('/api/auth/logout',{data:{}});await register(page.request,'taker');
  await page.goto(`/materials/${d.material_id}`);await page.getByRole('button',{name:'Reserve',exact:true}).click();
  await page.getByRole('button',{name:'Confirm reservation'}).click();
  await expect(page).toHaveURL(/\/reservations\/\d+\/reserved$/);
  for(const ms of [150,450,750,1100])await page.waitForTimeout(ms===150?150:300).then(()=>page.screenshot({path:`test-results/success-reserved-${ms}ms.png`}));
  await expect(page.getByRole('heading',{name:'Material reserved!'})).toBeVisible();
  await expect(page.getByText('Pick it up at Building 16, Level 1 within 24 hours')).toBeVisible();
  await expect(page.locator('.celebrate-code strong')).toHaveText(d.display_code);
  await expect(page.locator('.celebrate-credit')).toHaveText('−1 credit, 1 credit left');
  await page.screenshot({path:'test-results/success-reserved.png'});
  await page.getByRole('link',{name:'Done'}).click();await expect(page.locator('.reservation-code')).toHaveText(d.display_code);
  expect(errors).toEqual([]);
});

test('reduced motion: no confetti, content simply fades in',async({browser})=>{
  const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:402,height:874}});const page=await context.newPage();
  await register(page.request,'calm');
  const png=await sharp({create:{width:60,height:60,channels:3,background:'#7a6352'}}).png().toBuffer();
  const upload=async()=>(await(await page.request.post('/api/uploads',{headers:{'Content-Type':'image/png','X-File-Name':'p.png'},data:png})).json()).photo.id;const photo=await upload();
  const d=(await(await page.request.post('/api/deposits',{data:{request_key:crypto.randomUUID(),name:'cork',category_id:4,quantity:1,unit:'pieces',dimensions_spec:'',dimensions_not_applicable:true,condition:'Used',photo_ids:[photo]}})).json()).deposit;
  for(const [p,data] of [['arrive',{}],['verify-zone',{qr:'REMATERIAL|ZONE|WOOD'}],['placement',{photo_ids:[await upload()]}],['confirm',{}]])await page.request.post(`/api/deposits/${d.id}/${p}`,{data});
  await page.goto(`/deposits/${d.id}/success`);await expect(page.locator('.celebrate.calm')).toBeVisible();
  await page.waitForTimeout(700);await expect(page.locator('canvas')).toHaveCount(0);
  await context.close();
});
