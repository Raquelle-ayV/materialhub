import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { cameraFixture } from './camera-fixture.mjs';

const video=await cameraFixture();
const image=await sharp({create:{width:220,height:160,channels:3,background:'#b8c894'}}).png().toBuffer();
test.use({viewport:{width:402,height:874},permissions:['camera'],launchOptions:{args:['--use-fake-device-for-media-stream',`--use-file-for-fake-video-capture=${video}`]}});

test('A flow through actual camera decoding, wrong zone, refresh, placement and one reward',async({page})=>{
  test.setTimeout(80_000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const username=`provider_${Date.now().toString(36)}`;
  await page.goto('/register');await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill('provider-test-2026');await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('heading',{name:username,exact:true})).toBeVisible();
  await page.getByRole('navigation').getByRole('link',{name:'Share',exact:true}).click();await page.getByRole('link',{name:'Add new material',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Add Information'})).toBeVisible();
  await page.getByLabel('Material name',{exact:false}).fill(`Test foam ${username}`);
  await page.getByLabel('Category',{exact:false}).selectOption('1');
  await page.getByLabel('Quantity',{exact:false}).fill('2');await page.getByLabel('Unit',{exact:false}).fill('sheets');
  await page.getByLabel('Dimensions / specifications',{exact:false}).fill('A3, 5 mm');await page.getByLabel('Color',{exact:false}).fill('White');await page.getByLabel('Condition',{exact:false}).selectOption('Good');
  await page.getByText('Additional details (optional)',{exact:true}).click();
  await page.getByLabel('Notes',{exact:false}).fill('Camera-tested end-to-end sample.');
  await page.getByLabel('Material photos from gallery').setInputFiles({name:'foam.png',mimeType:'image/png',buffer:image});
  await expect(page.getByAltText('Material photos 1')).toBeVisible();
  await expect(page.getByText('Draft saved to your account.',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByLabel('Material name',{exact:false})).toHaveValue(`Test foam ${username}`);
  await expect(page.getByAltText('Material photos 1')).toBeVisible();
  await page.screenshot({path:'test-results/add-information-402.png',fullPage:true});
  await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.getByRole('heading',{name:'Go to the Hub',exact:true})).toBeVisible();
  const recordURL=page.url().split('?')[0];const code=await page.locator('.material-strip-text small').innerText();expect(code).toMatch(/^M\d{3,}$/);
  await expect(page.getByRole('status').filter({hasText:'Material recorded'})).toHaveText(`Material recorded · ${code}`);await expect(page.getByText(/registered but not on the shelf|Tap .* above/)).toHaveCount(0);await expect(page.locator('img[src*="/qr"]')).toHaveCount(0);await expect(page.getByLabel('Illustration of the Board & Foam zone sign')).toBeVisible();
  await page.reload();await expect(page.getByRole('status').filter({hasText:'Material recorded'})).toHaveCount(0);
  await page.locator('.strip-toggle').click();await expect(page.locator('.material-strip-details')).toContainText('ColorWhite');await expect(page.locator('.material-strip-details')).toContainText('ConditionGood');await expect(page.locator('.material-strip-details')).not.toContainText('Zone');await page.locator('.strip-toggle').click();
  await expect.poll(async()=>(await(await page.request.get('/api/auth/me')).json()).user.available).toBe(2);
  await page.locator('.flow-progress').getByRole('link',{name:/Go to the Hub/}).click();await expect(page.getByRole('heading',{name:'Go to the Hub',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'I’m at the Hub',exact:true}).click();await expect(page.getByRole('heading',{name:'Find area',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Find area',exact:true})).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('This is the Wood zone. Your material goes to Board & Foam.',{timeout:15_000});
  await expect(page.getByRole('heading',{name:'Find area',exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/wrong-zone-camera.png'});
  await expect(page.getByRole('heading',{name:'Drop off',exact:true})).toBeVisible({timeout:25_000});
  await expect(page.locator('.label-code')).toHaveText(code);await expect(page.getByRole('button',{name:'Confirm drop-off',exact:true})).toBeDisabled();await expect(page.locator('.flow-hint')).toHaveText('Add at least 1 placement photo');await expect(page.getByText(/You earn 1 credit/)).toHaveCount(0);
  await page.goto('/deposit');await page.getByRole('link',{name:new RegExp(`Test foam ${username}`)}).click();await expect(page.getByRole('heading',{name:'Drop off',exact:true})).toBeVisible();
  await page.getByLabel('Placement photos from gallery').setInputFiles({name:'shelf.png',mimeType:'image/png',buffer:image});
  await expect(page.getByRole('button',{name:'Confirm drop-off',exact:true})).toBeEnabled();await expect(page.locator('.flow-hint')).toHaveCount(0);
  await page.reload();await expect(page.getByAltText('Placement photos 1')).toBeVisible();
  await expect(page.getByRole('button',{name:'Confirm drop-off',exact:true})).toBeEnabled();
  await page.screenshot({path:'test-results/place-material-402.png',fullPage:true});
  // Verify a new login resumes the database-backed zone and placement progress.
  await page.goto('/me');await page.getByRole('button',{name:'Log out',exact:true}).click();
  await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill('provider-test-2026');await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page.getByRole('heading',{name:username,exact:true})).toBeVisible();
  await page.goto(recordURL);await expect(page.getByRole('heading',{name:'Drop off',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Confirm drop-off',exact:true}).click();await expect(page.getByRole('heading',{name:'Your material is on the shelf'})).toBeVisible();await expect(page.getByText('Now live on Explore',{exact:true})).toBeVisible();await expect(page.locator('.back-link')).toHaveCount(0);await expect(page.getByRole('link',{name:'Share another'})).toHaveAttribute('href','/deposit/new?fresh=1');
  await expect(page.locator('.success-credit')).toHaveText('+1 credit · Balance 3');await expect.poll(async()=>(await(await page.request.get('/api/auth/me')).json()).user.available).toBe(3);
  await page.reload();await expect.poll(async()=>(await(await page.request.get('/api/auth/me')).json()).user.available).toBe(3);await page.screenshot({path:'test-results/completion-402.png',fullPage:true});
  await page.getByRole('link',{name:'Done',exact:true}).click();await expect(page.getByRole('heading',{name:'New on the shelf'})).toBeVisible();
  await expect(page.locator('.material-card').filter({hasText:`Test foam ${username}`})).toBeVisible();
  await page.goto('/me/credits');await expect(page.getByText('Material drop-off',{exact:true})).toHaveCount(1);await expect(page.getByText('+1',{exact:true})).toHaveCount(1);
  for(const width of [402,320,1440]){
    await page.setViewportSize({width,height:874});await page.goto('/');await expect(page.getByRole('heading',{name:'New on the shelf'})).toBeVisible();
    const layout=await page.evaluate(()=>{const app=document.querySelector('.app-shell').getBoundingClientRect();const header=document.querySelector('.explore-heading').getBoundingClientRect();const nav=document.querySelector('.bottom-nav').getBoundingClientRect();return{width:app.width,x:app.x,window:innerWidth,scroll:document.documentElement.scrollWidth,top:header.y,navWidth:nav.width};});
    expect(layout.width).toBe(Math.min(width,402));expect(layout.scroll).toBeLessThanOrEqual(width);expect(layout.x).toBeCloseTo((width-layout.width)/2);expect(layout.top).toBeLessThan(40);expect(layout.navWidth).toBeLessThanOrEqual(402);
    await page.screenshot({path:`test-results/fixed-phone-${width}.png`});
  }
  expect(errors).toEqual([]);
});

test('camera denial explains recovery and opens zone-code entry',async({page})=>{
  const username=`denied_${Date.now().toString(36)}`;await page.goto('/register');await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill('camera-denied-test');await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page.getByRole('heading',{name:username})).toBeVisible();
  const upload=await page.request.post('/api/uploads',{headers:{'Content-Type':'image/png','X-File-Name':'test.png'},data:image});const photo=(await upload.json()).photo;
  const saved=await page.request.post('/api/deposits',{data:{request_key:crypto.randomUUID(),name:'Camera permission test',category_id:1,quantity:1,unit:'sheet',dimensions_spec:'A4',color:'White',condition:'Good',photo_ids:[photo.id]}});const d=(await saved.json()).deposit;
  await page.request.post(`/api/deposits/${d.id}/arrive`,{data:{}});
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Denied','NotAllowedError'));});
  await page.goto(`/deposits/${d.id}/scan`);await expect(page.getByRole('alert')).toContainText('Camera permission was denied.');await expect(page.getByRole('button',{name:'Retry camera'})).toBeVisible();
  await page.getByLabel('Zone code').fill('bf');await expect(page.getByLabel('Zone code')).toHaveValue('BF');await page.getByRole('button',{name:'Confirm zone'}).click();await expect(page.getByRole('heading',{name:'Drop off',exact:true})).toBeVisible();
});
