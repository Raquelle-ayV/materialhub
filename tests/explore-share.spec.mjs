import {test,expect} from '@playwright/test';
import sharp from 'sharp';
test('Share entries stay independent of completed records; pending selection and arrival are safe',async({page})=>{
 test.setTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 expect((await page.request.post('/api/auth/register',{data:{username:'entry_review',password:'entry-review-2026'}})).status()).toBe(201);
 const png=await sharp({create:{width:120,height:90,channels:3,background:'#d4cab7'}}).png().toBuffer();
 const upload=async()=>{const r=await page.request.post('/api/uploads',{headers:{'Content-Type':'image/png','X-File-Name':'test.png'},data:png});return(await r.json()).photo.id;};
 const create=async name=>{const r=await page.request.post('/api/deposits',{data:{request_key:crypto.randomUUID(),name,category_id:1,quantity:2,unit:'sheets',dimensions_spec:'A3',color:'White',condition:'Good',photo_ids:[await upload()]}});expect(r.status()).toBe(201);return(await r.json()).deposit;};
 const old=await create('Completed material');
 for(const[path,data]of[['arrive',{}],['verify-zone',{qr:'REMATERIAL|ZONE|BOARD_FOAM'}],['placement',{photo_ids:[await upload()]}],['confirm',{}]])expect((await page.request.post(`/api/deposits/${old.id}/${path}`,{data})).ok()).toBe(true);
 const account=async()=>(await(await page.request.get('/api/auth/me')).json()).user;
 expect((await account()).balance).toBe(3);
 await page.goto('/deposit');await expect(page.locator('.share-entry-cards .share-step')).toHaveCount(3);await expect(page.getByText('Material Confirmed',{exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'Add material',exact:true}).click();await expect(page.getByRole('heading',{name:'Add Information'})).toBeVisible();await expect(page.getByLabel('Material name',{exact:false})).toHaveValue('');
 await page.getByLabel('Material name',{exact:false}).fill('Unfinished draft');await expect(page.getByText('Draft saved to your account.',{exact:true})).toBeVisible();
 await page.goto('/deposit');await expect(page.getByRole('link',{name:'Continue draft: Unfinished draft'})).toBeVisible();await page.getByRole('link',{name:'Add material',exact:true}).click();await expect(page.getByLabel('Material name',{exact:false})).toHaveValue('');
 await page.goto('/deposit');await page.getByRole('link',{name:'View guide',exact:true}).click();await expect(page).toHaveURL(/\/hub$/);await expect(page.getByRole('heading',{name:'Go to the Hub',exact:true})).toBeVisible();await expect(page.getByText('Material Confirmed',{exact:true})).toHaveCount(0);
 await page.goto('/deposit');await page.getByRole('link',{name:"I'm at the Hub",exact:true}).click();await expect(page).toHaveURL(/\/deposit\/drop-off$/);await expect(page.getByRole('heading',{name:'No materials ready for drop-off'})).toBeVisible();await page.reload();expect((await account()).balance).toBe(3);expect((await(await page.request.get('/deposits'.replace('/deposits','/api/deposits'))).json()).deposits).toHaveLength(1);
 const a=await create('Pending A');const before=(await(await page.request.get(`/api/deposits/${a.id}`)).json()).deposit;
 await page.goto('/deposit');await page.getByRole('link',{name:"I'm at the Hub",exact:true}).click();await expect(page).toHaveURL(new RegExp(`/deposits/${a.id}/scan$`));await expect(page.getByRole('heading',{name:'Scan Zone QR'})).toBeVisible();
 const arrived=(await(await page.request.get(`/api/deposits/${a.id}`)).json()).deposit;expect(arrived.arrived_at).toBeTruthy();expect(arrived.verified_zone_id).toBeNull();expect(arrived.deposit_status).toBe('pending');expect(arrived.stock_quantity).toBe(before.stock_quantity);expect((await account()).balance).toBe(3);expect((await page.request.post(`/api/deposits/${a.id}/confirm`,{data:{}})).ok()).toBe(false);
 await page.goto('/deposit');await page.getByRole('link',{name:"I'm at the Hub",exact:true}).click();await expect(page).toHaveURL(new RegExp(`/deposits/${a.id}/scan$`));
 const b=await create('Pending B');await page.goto('/deposit');await page.getByRole('link',{name:"I'm at the Hub",exact:true}).click();await expect(page.locator('.pending-choice')).toHaveCount(2);await page.getByRole('button',{name:/Pending B/}).click();await expect(page).toHaveURL(new RegExp(`/deposits/${b.id}/scan$`));
 await page.request.post(`/api/deposits/${a.id}/verify-zone`,{data:{qr:'REMATERIAL|ZONE|BOARD_FOAM'}});await page.goto('/deposit/drop-off');await page.getByRole('button',{name:/Pending A/}).click();await expect(page).toHaveURL(new RegExp(`/deposits/${a.id}/place$`));await expect(page.getByRole('button',{name:'Confirm drop-off'})).toBeDisabled();
 for(const[width,height]of[[402,874],[393,852],[320,740]]){await page.setViewportSize({width,height});await page.goto('/deposit');await expect(page.locator('.share-step')).toHaveCount(3);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));const button=await page.getByRole('link',{name:"I'm at the Hub",exact:true}).boundingBox();expect(button.y+button.height).toBeLessThanOrEqual((await page.locator('.bottom-nav').boundingBox()).y);}
 await page.request.post('/api/auth/logout',{data:{}});await page.goto('/hub');await expect(page.getByRole('heading',{name:'Go to the Hub',exact:true})).toBeVisible();expect(errors).toEqual([]);
});

test('Recent history is genuine, ordered, persistent, keyboard-scrollable and has a full history route',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Recommended',exact:true})).toBeVisible();await expect(page.locator('.recent-materials')).toHaveCount(0);
 for(const id of [1,2,3,1]){await page.goto(`/materials/${id}`);await expect(page.locator('.detail-title')).toBeVisible();}
 await page.goto('/');await expect(page.locator('.recent-card')).toHaveCount(3);await expect(page.locator('.recent-card').first()).toHaveAttribute('href','/materials/1');await page.reload();await expect(page.locator('.recent-card')).toHaveCount(3);
 await page.locator('.recent-rail').focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>page.locator('.recent-rail').evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);
 expect(await page.locator('.recent-rail').evaluate(e=>getComputedStyle(e).scrollbarWidth)).toBe('none');
 await page.getByRole('link',{name:'View all recently viewed materials'}).click();await expect(page).toHaveURL(/\/recently-viewed$/);await expect(page.locator('.material-card')).toHaveCount(3);
 await page.goto('/');await expect(page.locator('.more-materials,.arrival-rail,.compact-task,.filter-toolbar')).toHaveCount(0);await expect(page.locator('.recommended-materials .card-bottom')).toHaveCount(0);
 const cat=await page.locator('.category-strip').boundingBox(),filter=await page.getByRole('button',{name:'More filters'}).boundingBox();expect(Math.abs(cat.y-filter.y)).toBeLessThan(5);
 await page.getByRole('button',{name:'More filters'}).click();await page.getByLabel('Condition',{exact:true}).selectOption('Good');await page.getByRole('button',{name:'Apply filters'}).click();await expect(page).toHaveURL(/condition=Good/);
});
