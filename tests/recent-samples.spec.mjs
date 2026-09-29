import {test,expect} from '@playwright/test';
import sharp from 'sharp';

test('history includes own material, stays scoped to each account and samples cannot be reserved',async({page})=>{
 const password='history-test-2026';
 const register=async username=>{expect((await page.request.post('/api/auth/register',{data:{username,password}})).status()).toBe(201);};
 const login=async username=>{expect((await page.request.post('/api/auth/login',{data:{username,password}})).ok()).toBe(true);};
 await register('history_owner');await page.goto('/');await expect(page.locator('.recent-materials')).toHaveCount(0);
 const png=await sharp({create:{width:80,height:90,channels:3,background:'#b0baab'}}).png().toBuffer();
 const photo=(await(await page.request.post('/api/uploads',{headers:{'Content-Type':'image/png','X-File-Name':'history.png'},data:png})).json()).photo;
 const d=(await(await page.request.post('/api/deposits',{data:{request_key:crypto.randomUUID(),name:'My recently viewed board',category_id:1,quantity:2,unit:'sheets',dimensions_spec:'A4',color:'Green',condition:'Good',photo_ids:[photo.id]}})).json()).deposit;
 // Having uploaded a material does not constitute viewing its public details.
 await page.goto('/');await expect(page.locator('.recent-materials')).toHaveCount(0);
 for(const id of [1,2,d.material_id,1,d.material_id]){await page.goto(`/materials/${id}`);await expect(page.locator('.detail-title')).toBeVisible();}
 await page.goto('/');await expect(page.locator('.recent-card')).toHaveCount(3);await expect(page.locator('.recent-card').first()).toHaveAttribute('href',`/materials/${d.material_id}`);
 await page.reload();await expect(page.locator('.recent-card')).toHaveCount(3);await expect(page.locator('.recent-card').first()).toContainText('Not yet available');
 await page.goto('/materials/1');await expect(page.getByText('Sample material',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Reserve',exact:true})).toHaveCount(0);
 const before=(await(await page.request.get('/api/auth/me')).json()).user;
 await page.goto('/materials/1/reserve');await expect(page.getByText('Sample material',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Confirm reservation'})).toHaveCount(0);
 expect((await page.request.post('/api/materials/1/reserve',{data:{quantity:1,request_key:crypto.randomUUID()}})).status()).toBe(409);
 expect((await(await page.request.get('/api/auth/me')).json()).user).toEqual(before);
 await page.request.post('/api/auth/logout',{data:{}});await register('history_other');await page.goto('/');await expect(page.locator('.recent-materials')).toHaveCount(0);
 await page.goto('/materials/3');await expect(page.locator('.detail-title')).toBeVisible();await page.goto('/');await expect(page.locator('.recent-card')).toHaveCount(1);
 await page.request.post('/api/auth/logout',{data:{}});await login('history_owner');await page.goto('/');await expect(page.locator('.recent-card')).toHaveCount(3);await expect(page.locator('.recent-card').first()).toHaveAttribute('href','/materials/1');
 // Current state is fetched again; pending owner's record is still labelled correctly.
 await expect(page.locator(`.recent-card[href="/materials/${d.material_id}"]`)).toContainText('Not yet available');
});
