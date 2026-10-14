import { test, expect } from '@playwright/test';
import { cameraFixture } from './camera-fixture.mjs';

const video=await cameraFixture();
test.use({viewport:{width:402,height:874},permissions:['camera'],launchOptions:{args:['--use-fake-device-for-media-stream',`--use-file-for-fake-video-capture=${video}`]}});

async function register(page){
  const username=`capture_${Date.now().toString(36)}`;
  await page.goto('/register');await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill('capture-test-2026');await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('heading',{name:username,exact:true})).toBeVisible();
}

test('Scan with AI: guidance after each photo, two recognised items, review and submit',async({page})=>{
  test.setTimeout(90_000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await register(page);
  await page.goto('/deposit');await page.getByRole('button',{name:'Add new material',exact:true}).click();
  await expect(page.getByRole('button',{name:/^One item/})).toBeVisible();await expect(page.getByRole('button',{name:/^Multiple items/})).toBeVisible();
  await page.getByRole('button',{name:/^Scan with AI/}).click();
  const guide=page.locator('.camera-guide');await expect(guide).toContainText('Fit the whole material');
  await page.getByRole('button',{name:'Take photo'}).click();await expect(guide).toContainText('Analyzing photo');
  await expect(guide).toContainText('Too close',{timeout:10_000});
  await page.getByRole('button',{name:'Take photo'}).click();await expect(guide).toContainText('Got it: white foam board',{timeout:10_000});
  await page.screenshot({path:'test-results/scan-ai-detected.png'});
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.getByText('Items to list')).toBeVisible();await expect(page.getByRole('button',{name:/Generating details/})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Review 1 item'})).toBeEnabled({timeout:6_000});
  await page.getByRole('button',{name:'Add another item'}).click();
  await page.getByRole('button',{name:'Take photo'}).click();await expect(guide).toContainText('Part of the plank is cut off',{timeout:10_000});
  await page.getByRole('button',{name:'Take photo'}).click();await expect(guide).toContainText('Got it: pine wood plank',{timeout:10_000});
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.screenshot({path:'test-results/scan-ai-items.png'});
  await page.getByRole('button',{name:'Review 2 items'}).click({timeout:6_000});
  await expect(page.getByRole('heading',{name:'Created with AI'})).toBeVisible();
  await expect(page.locator('.review-item')).toHaveCount(2);await expect(page.locator('.review-item').first()).toContainText('Board & Foam · 3 boards · Like new');
  await page.locator('.review-item').nth(1).getByRole('link',{name:'Edit'}).click();
  await expect(page.getByLabel('Material name',{exact:false})).toHaveValue('Pine wood plank');await page.getByLabel('Quantity',{exact:false}).fill('4');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.locator('.review-item').nth(1)).toContainText('4 boards');
  await page.screenshot({path:'test-results/scan-ai-review.png',fullPage:true});
  await page.getByRole('button',{name:'Submit 2 materials'}).click();
  await expect(page.getByRole('status').filter({hasText:'2 materials recorded'})).toBeVisible();
  await expect(page.locator('.share-active')).toContainText('White foam board (KT board)');await expect(page.locator('.share-active')).toContainText('Pine wood plank');
  expect(errors).toEqual([]);
});

test('Multiple items: camera roll covers, details per material, color optional',async({page})=>{
  test.setTimeout(60_000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await register(page);
  await page.goto('/deposit');await page.getByRole('button',{name:'Add new material',exact:true}).click();await page.getByRole('button',{name:/^Multiple items/}).click();
  await expect(page.getByText('Choose one cover photo per material')).toBeVisible();await expect(page.getByRole('button',{name:'Open camera'})).toBeVisible();
  await page.getByRole('button',{name:'Sample photo 1'}).click();await page.getByRole('button',{name:'Sample photo 2'}).click();
  await expect(page.locator('.roll-badge')).toHaveText(['Material 1','Material 2']);
  await page.screenshot({path:'test-results/camera-roll-covers.png'});
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Material 1'})).toBeVisible();
  const fill=async(name,category)=>{await page.getByLabel('Material name',{exact:false}).fill(name);await page.getByRole('combobox',{name:/^Category/}).selectOption(category);await page.getByLabel('Quantity',{exact:false}).fill('2');await page.getByRole('radio',{name:'Used'}).check();};
  await fill('Grey felt','3');
  await page.getByRole('button',{name:'Edit material 2'}).click();await expect(page.getByRole('heading',{name:'Material 2'})).toBeVisible();await expect(page.getByLabel('Material name',{exact:false})).toHaveValue('');
  await fill('Birch offcuts','4');
  await page.screenshot({path:'test-results/multiple-items.png',fullPage:true});
  await page.getByRole('link',{name:'Review materials'}).click();
  await expect(page.getByRole('heading',{name:'Review materials'})).toBeVisible();await expect(page.locator('.review-item')).toHaveCount(2);
  await page.getByRole('button',{name:'Submit 2 materials'}).click();
  await expect(page.getByRole('status').filter({hasText:'2 materials recorded'})).toBeVisible();await expect(page.locator('.share-active')).toContainText('Birch offcuts');
  expect(errors).toEqual([]);
});

test('Video upload accepts a real container and rejects other files',async({page})=>{
  await register(page);
  const mp4=Buffer.concat([Buffer.from([0,0,0,0x18]),Buffer.from('ftypmp42'),Buffer.alloc(64)]);
  const ok=await page.request.post('/api/uploads/video',{headers:{'Content-Type':'video/mp4','X-File-Name':'clip.mp4'},data:mp4});expect(ok.status()).toBe(201);
  const bad=await page.request.post('/api/uploads/video',{headers:{'Content-Type':'video/mp4','X-File-Name':'clip.mp4'},data:Buffer.from('not a video at all')});expect(bad.status()).toBe(400);
  const photo=await page.request.post('/api/uploads/video',{headers:{'Content-Type':'image/png','X-File-Name':'a.png'},data:mp4});expect(photo.status()).toBe(400);
});
