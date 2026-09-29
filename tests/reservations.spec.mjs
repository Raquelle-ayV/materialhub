import { test, expect } from '@playwright/test';
import sharp from 'sharp';

async function register(request,prefix){const username=`${prefix}_${Date.now().toString(36)}`;const r=await request.post('/api/auth/register',{data:{username,password:'reservation-test'}});expect(r.status()).toBe(201);return username;}
async function material(request,quantity=2){
  const png=await sharp({create:{width:120,height:90,channels:3,background:'#b0c68a'}}).png().toBuffer();
  const upload=async()=>{const r=await request.post('/api/uploads',{headers:{'Content-Type':'image/png','X-File-Name':'photo.png'},data:png});return(await r.json()).photo.id;};
  const ids=[await upload(),await upload()],placement=await upload();
  const r=await request.post('/api/deposits',{data:{request_key:crypto.randomUUID(),name:`Reservation paper ${Date.now()}`,quantity,category_id:2,unit:'sheets',condition:'Good',color:'Green',dimensions_spec:'A4',notes:'Real material for B browser testing.',reference_url:'https://example.com/paper',photo_ids:ids}});expect(r.status()).toBe(201);const d=(await r.json()).deposit;
  await request.post(`/api/deposits/${d.id}/arrive`,{data:{}});await request.post(`/api/deposits/${d.id}/verify-zone`,{data:{qr:'REMATERIAL|ZONE|PAPER_SHEET'}});await request.post(`/api/deposits/${d.id}/placement`,{data:{photo_ids:[placement]},});expect((await request.post(`/api/deposits/${d.id}/confirm`,{data:{}})).status()).toBe(200);return d;
}
test('B browse, quantity two, duplicate click, persistence and cancellation with real uploaded material',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await register(page.request,'b_provider');const d=await material(page.request);await page.request.post('/api/auth/logout',{data:{}});
  await page.goto(`/materials/${d.material_id}`);await expect(page.getByRole('link',{name:'Log in to reserve'})).toBeVisible();
  const username=await register(page.request,'b_collector');await page.goto('/');await expect(page.getByRole('heading',{name:'Recommended'})).toBeVisible();
  await expect(page.locator('.materials-section .material-card').first()).toHaveAttribute('href',`/materials/${d.material_id}`);
  await page.getByRole('textbox',{name:'Search materials'}).fill(d.display_code);await page.getByRole('button',{name:'Submit search'}).click();await expect(page.locator('.material-card')).toHaveCount(1);
  await page.locator('.material-card').click();await expect(page.locator('.material-gallery img')).toHaveCount(2);await expect(page.getByRole('link',{name:'Purchase / reference link'})).toHaveAttribute('href','https://example.com/paper');
  await page.locator('.material-gallery').evaluate(el=>el.scrollLeft=el.scrollWidth);expect(await page.locator('.material-gallery').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await page.getByRole('link',{name:'Reserve',exact:true}).click();await expect(page.getByRole('heading',{name:'Confirm Reservation',exact:true})).toBeVisible();
  await page.getByLabel('Quantity to collect').selectOption('2');await page.screenshot({path:'test-results/reservation-confirm-402.png',fullPage:true});
  await page.getByRole('button',{name:'Confirm reservation',exact:true}).evaluate(el=>{el.click();el.click();});
  await expect(page.getByRole('heading',{name:'Reservation Confirmed'})).toBeVisible();await expect(page.getByText('Active',{exact:true})).toBeVisible();await expect.poll(async()=>(await(await page.request.get('/api/auth/me')).json()).user.available).toBe(1);
  const url=page.url(),time=await page.locator('time').getAttribute('datetime');await page.reload();await expect(page.locator('time')).toHaveAttribute('datetime',time);await expect(page.locator('.reservation-card')).toContainText('2 sheets');
  const m=(await(await page.request.get(`/api/materials/${d.material_id}`)).json()).material;expect(m.status).toBe('reserved');expect(m.stock_quantity).toBe(2);expect(m.available_quantity).toBe(0);
  await page.goto('/');await page.goto('/me');await expect(page.locator('.task-strip')).toContainText('Reserved for pickup');
  await page.goto('/me');await page.getByRole('button',{name:'Log out',exact:true}).click();await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill('reservation-test');await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page.getByRole('heading',{name:username,exact:true})).toBeVisible();
  await page.getByRole('link',{name:'My Reservations',exact:true}).click();await expect(page.locator('time')).toHaveAttribute('datetime',time);await page.screenshot({path:'test-results/my-reservations-402.png',fullPage:true});
  await page.getByRole('button',{name:'Cancel reservation',exact:true}).click();await expect(page.getByText('Cancelled',{exact:true})).toBeVisible();await expect.poll(async()=>(await(await page.request.get('/api/auth/me')).json()).user.available).toBe(2);await page.reload();await expect(page.getByText('Cancelled',{exact:true})).toBeVisible();
  await page.goto(url);await expect(page.getByRole('button',{name:'Cancel reservation'})).toHaveCount(0);
  for(const width of [320,402,1440]){await page.setViewportSize({width,height:874});await page.goto(`/materials/${d.material_id}`);await expect(page.getByRole('link',{name:'Reserve',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/material-detail-${width}.png`,fullPage:true});}
  expect(errors).toEqual([]);
});

test('B stock limit, stale reservation, filters, empty results and load failure',async({page,browser})=>{
  await register(page.request,'stock_provider');const d=await material(page.request,1);await page.request.post('/api/auth/logout',{data:{}});await register(page.request,'stock_collector');
  await page.goto(`/materials/${d.material_id}/reserve`);await expect(page.getByLabel('Quantity to collect').locator('option[value="2"]')).toHaveJSProperty('disabled',true);
  const other=await browser.newContext({baseURL:'http://127.0.0.1:15173'});await register(other.request,'stock_other');
  const r=await other.request.post(`/api/materials/${d.material_id}/reserve`,{data:{quantity:1,request_key:crypto.randomUUID()}});expect(r.status()).toBe(201);
  await page.getByRole('button',{name:'Confirm reservation',exact:true}).click();await expect(page.getByRole('alert')).toContainText('no longer available');await expect(page.getByRole('button',{name:'Confirm reservation',exact:true})).toBeDisabled();
  await page.goto(`/materials?q=${d.display_code}`);await expect(page.getByText('No materials found',{exact:true})).toBeVisible();await page.getByRole('button',{name:'More filters'}).click();await page.getByLabel('Availability',{exact:true}).selectOption('reserved');await page.getByRole('button',{name:'Apply filters'}).click();await expect(page.locator('.material-card')).toHaveCount(1);await page.getByRole('button',{name:'More filters'}).click();await page.getByLabel('Category',{exact:true}).selectOption('2');await page.getByLabel('Condition',{exact:true}).selectOption('Good');await page.getByRole('button',{name:'Apply filters'}).click();await expect(page.locator('.material-card')).toHaveCount(1);
  await page.route('**/api/materials?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Materials could not be loaded. Please try again.'})}));await page.goto('/materials');await expect(page.getByRole('alert')).toContainText('could not be loaded');await page.unroute('**/api/materials?**');await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('.material-card').first()).toBeVisible();
  await other.close();
});
