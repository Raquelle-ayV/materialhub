import { test, expect } from '@playwright/test';
import sharp from 'sharp';

const unique=prefix=>`${prefix}_${Date.now().toString(36)}`;
async function register(request,prefix){const username=unique(prefix);expect((await request.post('/api/auth/register',{data:{username,password:'favorite-test'}})).status()).toBe(201);return username;}
async function sharedMaterial(request){
  await register(request,'fav_owner');
  const png=await sharp({create:{width:120,height:90,channels:3,background:'#c9b89a'}}).png().toBuffer();
  const upload=async()=>(await(await request.post('/api/uploads',{headers:{'Content-Type':'image/png','X-File-Name':'photo.png'},data:png})).json()).photo.id;
  const name=unique('Heart test board');
  const d=(await(await request.post('/api/deposits',{data:{request_key:crypto.randomUUID(),name,category_id:1,quantity:2,unit:'sheets',dimensions_spec:'A3',color:'White',condition:'Good',photo_ids:[await upload()]}})).json()).deposit;
  for(const[path,data]of[['arrive',{}],['verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'}],['placement',{photo_ids:[await upload()]}],['confirm',{}]])expect((await request.post(`/api/deposits/${d.id}/${path}`,{data})).ok()).toBe(true);
  await request.post('/api/auth/logout',{data:{}});
  return{id:d.material_id,name};
}
const savedCards=page=>page.locator('.saved-page .material-card');

// One test with two accounts: the auth endpoints allow 30 attempts per minute for the whole browser suite.
test('hearts save instantly without opening the material, sync with Saved, roll back on failure and ask guests to log in',async({page})=>{
  test.setTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const m=await sharedMaterial(page.request);
  const card=page.locator('.recommended-materials .material-card').filter({hasText:m.name});
  const recentCard=page.locator('.recent-materials .material-card').filter({hasText:m.name});
  await test.step('logged-out visitors are sent to log in',async()=>{
    await page.goto('/');await card.getByRole('button',{name:'Save material'}).click();
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
  });
  await register(page.request,'fav_user');
  await test.step('home heart fills before the server answers and does not open the material',async()=>{
    let release;const gate=new Promise(r=>release=r);
    await page.route('**/api/materials/*/favorite',async route=>{await gate;await route.continue();});
    await page.goto('/');await card.getByRole('button',{name:'Save material'}).click();
    await expect(card.getByRole('button',{name:'Remove from saved'})).toHaveAttribute('aria-pressed','true',{timeout:1000});
    await expect(page).toHaveURL(/\/$/);
    const saved=page.waitForResponse(r=>r.url().includes('/favorite'));release();expect((await saved).ok()).toBe(true);
    await page.unrouteAll({behavior:'wait'});
  });
  await test.step('Saved shows it, and unsaving there removes it',async()=>{
    await page.getByRole('navigation').getByRole('link',{name:'Saved',exact:true}).click();
    await expect(savedCards(page)).toHaveCount(1);await expect(savedCards(page)).toContainText(m.name);
    await savedCards(page).getByRole('button',{name:'Remove from saved'}).click();
    await expect(page).toHaveURL(/\/saved$/);await expect(savedCards(page)).toHaveCount(0);await expect(page.getByText('Nothing saved yet')).toBeVisible();
    await page.reload();await expect(page.getByText('Nothing saved yet')).toBeVisible();
    await page.goto('/');await expect(card.getByRole('button',{name:'Save material'})).toHaveAttribute('aria-pressed','false');
  });
  await test.step('detail page heart saves and unsaves',async()=>{
    await page.goto(`/materials/${m.id}`);await expect(page.getByRole('heading',{name:m.name})).toBeVisible();
    await page.getByRole('button',{name:'Save material'}).click();
    await expect(page.getByRole('button',{name:'Remove from saved'})).toHaveAttribute('aria-pressed','true');
    await expect(page).toHaveURL(new RegExp(`/materials/${m.id}$`));
    await expect.poll(async()=>(await(await page.request.get('/api/me/favorites')).json()).materials.length).toBe(1);
    await page.goto('/saved');await expect(savedCards(page)).toContainText(m.name);
    await savedCards(page).getByRole('heading').click();await expect(page).toHaveURL(new RegExp(`/materials/${m.id}$`));
    await page.getByRole('button',{name:'Remove from saved'}).click();
    await expect(page.getByRole('button',{name:'Save material'})).toHaveAttribute('aria-pressed','false');
    await page.getByRole('button',{name:'Save material'}).click();await expect(page.getByRole('button',{name:'Remove from saved'})).toBeVisible();
    await page.goto('/');await expect(recentCard.getByRole('button',{name:'Remove from saved'})).toBeVisible();
    await recentCard.getByRole('button',{name:'Remove from saved'}).click();
    await expect(card.getByRole('button',{name:'Save material'})).toHaveAttribute('aria-pressed','false');
    await expect.poll(async()=>(await(await page.request.get('/api/me/favorites')).json()).materials.length).toBe(0);
    await page.goto('/saved');await expect(page.getByText('Nothing saved yet')).toBeVisible();
  });
  await test.step('a failed save rolls back with a message',async()=>{
    await page.route('**/api/materials/*/favorite',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Server unavailable.'})}));
    await page.goto('/');await card.getByRole('button',{name:'Save material'}).click();
    await expect(page.getByRole('alert')).toHaveText('Couldn’t save. Try again.');
    await expect(card.getByRole('button',{name:'Save material'})).toHaveAttribute('aria-pressed','false');
    await expect(page).toHaveURL(/\/$/);
  });
  expect(errors).toEqual([]);
});
