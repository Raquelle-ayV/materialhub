import { test, expect } from '@playwright/test';
import sharp from 'sharp';

async function register(request,prefix){const username=`${prefix}_${Date.now().toString(36)}`;const r=await request.post('/api/auth/register',{data:{username,password:'reservation-test'}});expect(r.status()).toBe(201);return username;}
async function material(request,quantity=2){
  const png=await sharp({create:{width:120,height:90,channels:3,background:'#b0c68a'}}).png().toBuffer();
  const upload=async()=>{const r=await request.post('/api/uploads',{headers:{'Content-Type':'image/png','X-File-Name':'photo.png'},data:png});return(await r.json()).photo.id;};
  const ids=[await upload(),await upload()],placement=await upload();
  const r=await request.post('/api/deposits',{data:{request_key:crypto.randomUUID(),name:`Reservation paper ${Date.now()}`,quantity,category_id:2,unit:'sheets',condition:'Used',color:'Green',dimensions_spec:'A4',notes:'Real material for B browser testing.',reference_url:'https://example.com/paper',photo_ids:ids}});expect(r.status()).toBe(201);const d=(await r.json()).deposit;
  await request.post(`/api/deposits/${d.id}/arrive`,{data:{}});await request.post(`/api/deposits/${d.id}/verify-zone`,{data:{qr:'REMATERIAL|ZONE|PAPER_SHEET'}});await request.post(`/api/deposits/${d.id}/placement`,{data:{photo_ids:[placement]},});expect((await request.post(`/api/deposits/${d.id}/confirm`,{data:{}})).status()).toBe(200);return d;
}
test('B browse, reserve from the bottom sheet, duplicate click, persistence and cancellation with confirmation',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await register(page.request,'b_provider');const d=await material(page.request);await page.request.post('/api/auth/logout',{data:{}});
  await page.goto(`/materials/${d.material_id}`);await expect(page.getByRole('link',{name:'Log in to reserve'})).toBeVisible();
  const username=await register(page.request,'b_collector');await page.goto('/');await expect(page.getByRole('heading',{name:'New on the shelf'})).toBeVisible();
  await expect(page.locator('.materials-section .material-card').first()).toHaveAttribute('href',`/materials/${d.material_id}`);
  await page.getByRole('textbox',{name:'Search materials'}).fill(d.display_code);await page.getByRole('button',{name:'Submit search'}).click();await expect(page.locator('.material-card')).toHaveCount(1);
  await page.locator('.material-card').click();await expect(page.locator('.material-gallery img')).toHaveCount(2);await expect(page.getByRole('link',{name:'Purchase / reference link'})).toHaveAttribute('href','https://example.com/paper');
  await expect(page.locator('.specs').first()).toContainText('Available2 sheets');await expect(page.getByText('In stock')).toHaveCount(0);await expect(page.locator('.detail-gallery .favorite-button')).toBeVisible();
  await page.locator('.material-gallery').evaluate(el=>el.scrollLeft=el.scrollWidth);expect(await page.locator('.material-gallery').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  const dots=page.locator('.carousel-dots button');await expect(dots).toHaveCount(2);await expect(dots.nth(1)).toHaveAttribute('aria-current','true');await expect(page.getByText(/Swipe horizontally/)).toHaveCount(0);
  expect(await page.locator('.material-gallery').evaluate(el=>getComputedStyle(el).scrollbarWidth)).toBe('none');
  await dots.nth(0).click();await expect(dots.nth(0)).toHaveAttribute('aria-current','true');
  await expect(page.getByText('Collect within 24 hours')).toHaveCount(0);
  await page.getByRole('button',{name:'Reserve',exact:true}).click();const sheet=page.getByRole('dialog',{name:'Reserve'});await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Costs 1 credit');await expect(sheet).toContainText('You’ll have 1 credit left');await expect(sheet).toContainText('Free cancellation before the deadline.');await expect(sheet.getByRole('button',{name:'Fewer'})).toBeDisabled();
  await sheet.getByRole('button',{name:'More'}).click();await expect(sheet.locator('output')).toHaveText('2 sheets');await expect(sheet.getByRole('button',{name:'More'})).toBeDisabled();await page.screenshot({path:'test-results/reservation-sheet-402.png'});
  await sheet.getByRole('button',{name:'Confirm reservation',exact:true}).evaluate(el=>{el.click();el.click();});
  await expect(page.locator('.reservation-code')).toHaveText(d.display_code);await expect(page.locator('.status-badge')).toHaveText('Active');await expect(page.locator('.due-line')).toContainText(/^Due (today|tomorrow), \d{1,2}:\d{2} [AP]M \(\d+h left\)$/);
  await expect(page.getByRole('link',{name:'Start pickup'})).toBeVisible();await expect.poll(async()=>(await(await page.request.get('/api/auth/me')).json()).user.available).toBe(1);
  const url=page.url(),time=await page.locator('time').getAttribute('datetime');await page.reload();await expect(page.locator('time')).toHaveAttribute('datetime',time);await expect(page.locator('.active-task')).toContainText('2 sheets');
  const m=(await(await page.request.get(`/api/materials/${d.material_id}`)).json()).material;expect(m.status).toBe('reserved');expect(m.stock_quantity).toBe(2);expect(m.available_quantity).toBe(0);
  await page.goto('/me');await expect(page.locator('.task-strip')).toContainText('Reserved for pickup');
  await page.getByRole('button',{name:'Log out',exact:true}).click();await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill('reservation-test');await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page.getByRole('heading',{name:username,exact:true})).toBeVisible();
  await page.getByRole('link',{name:'My reservations',exact:true}).click();await expect(page.locator('time')).toHaveAttribute('datetime',time);await page.screenshot({path:'test-results/my-reservations-402.png',fullPage:true});
  await page.locator('.reservation-card .active-task').click();await page.getByRole('button',{name:'Cancel reservation',exact:true}).click();
  const confirm=page.getByRole('dialog',{name:'Cancel this reservation?'});await confirm.getByRole('button',{name:'Keep it'}).click();await expect(confirm).toBeHidden();await expect(page.locator('.status-badge')).toHaveText('Active');
  await page.getByRole('button',{name:'Cancel reservation',exact:true}).click();await confirm.getByRole('button',{name:'Cancel reservation',exact:true}).click();
  await expect(page.locator('.status-badge')).toHaveText('Cancelled');await expect.poll(async()=>(await(await page.request.get('/api/auth/me')).json()).user.available).toBe(2);await page.reload();await expect(page.locator('.status-badge')).toHaveText('Cancelled');
  await page.goto(url);await expect(page.getByRole('button',{name:'Cancel reservation'})).toHaveCount(0);await expect(page.getByRole('link',{name:'Start pickup'})).toHaveCount(0);
  for(const width of [320,402,1440]){await page.setViewportSize({width,height:874});await page.goto(`/materials/${d.material_id}`);await expect(page.getByRole('button',{name:'Reserve',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/material-detail-${width}.png`,fullPage:true});}
  await page.goto(`/materials/${d.material_id}/reserve`);await expect(page).toHaveURL(new RegExp(`/materials/${d.material_id}$`));
  expect(errors).toEqual([]);
});

test('B partial reservations, stale sheet, own material, filters, empty results and load failure',async({page,browser})=>{
  await register(page.request,'stock_provider');const d=await material(page.request,3);
  await page.goto(`/materials/${d.material_id}`);await expect(page.getByText('This is your material',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Reserve'})).toHaveCount(0);await expect(page.locator('.detail-gallery .favorite-button')).toHaveCount(0);
  await page.goto(`/materials?q=${d.display_code}`);await expect(page.locator('.material-card .yours-tag')).toHaveCount(0);await expect(page.locator('.material-card')).toHaveCount(1);await expect(page.locator('.material-card .favorite-button')).toHaveCount(0);
  await page.request.post('/api/auth/logout',{data:{}});await register(page.request,'stock_collector');
  const other=await browser.newContext({baseURL:'http://127.0.0.1:15173'});await register(other.request,'stock_other');
  expect((await other.request.post(`/api/materials/${d.material_id}/reserve`,{data:{quantity:1,request_key:crypto.randomUUID()}})).status()).toBe(201);
  expect((await page.request.post(`/api/materials/${d.material_id}/favorite`,{data:{favorite:true}})).ok()).toBe(true);
  await page.goto('/saved');await expect(page.locator('.saved-page .material-card')).not.toHaveClass(/unavailable/);await expect(page.locator('.saved-page .material-status')).toHaveText('2 sheets');
  await page.goto(`/materials/${d.material_id}`);await expect(page.locator('.specs').first()).toContainText('Available2 sheets');
  await page.getByRole('button',{name:'Reserve',exact:true}).click();const sheet=page.getByRole('dialog',{name:'Reserve'});await sheet.getByRole('button',{name:'More'}).click();await expect(sheet.getByRole('button',{name:'More'})).toBeDisabled();
  const third=await browser.newContext({baseURL:'http://127.0.0.1:15173'});await register(third.request,'stock_third');
  expect((await third.request.post(`/api/materials/${d.material_id}/reserve`,{data:{quantity:2,request_key:crypto.randomUUID()}})).status()).toBe(201);
  await sheet.getByRole('button',{name:'Confirm reservation',exact:true}).click();await expect(page.getByRole('alert')).toContainText('no longer available');await expect(page.getByRole('button',{name:'Fully reserved'})).toBeDisabled();
  await page.goto('/saved');await expect(page.locator('.saved-page .material-card')).toHaveClass(/unavailable/);await expect(page.locator('.saved-page .material-status')).toHaveText('No longer available');
  await page.goto(`/materials?q=${d.display_code}`);await expect(page.getByText('No materials found',{exact:true})).toBeVisible();await expect(page.locator('.filter-count')).toHaveCount(0);
  await page.getByRole('button',{name:'More filters'}).click();const filters=page.getByRole('dialog',{name:'Filters'});await expect(filters.getByLabel('Category')).toHaveCount(0);
  await expect(filters.getByRole('switch',{name:/Show unavailable/})).not.toBeChecked();await filters.getByRole('switch',{name:/Show unavailable/}).check();await filters.getByRole('button',{name:'Apply filters'}).click();await expect(page.locator('.material-card')).toHaveCount(1);await expect(page.locator('.filter-count')).toHaveText('1');
  await page.getByRole('button',{name:/More filters/}).click();await filters.getByLabel('Condition',{exact:true}).selectOption('Used');await filters.getByRole('button',{name:'Apply filters'}).click();await expect(page.locator('.material-card')).toHaveCount(1);await expect(page.locator('.filter-count')).toHaveText('2');
  await page.route('**/api/materials?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Materials could not be loaded. Please try again.'})}));await page.goto('/materials');await expect(page.getByRole('alert')).toContainText('could not be loaded');await page.unroute('**/api/materials?**');await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('.material-card').first()).toBeVisible();
  await other.close();await third.close();
});
