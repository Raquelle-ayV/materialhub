import { test, expect } from '@playwright/test';

test('English remains usable with legacy Chinese preferences and hidden settings', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('rematerial.language','zh-CN'));
  await page.goto('/register');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByRole('group',{name:'Language'})).toHaveCount(0);
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('Please complete this required field.');
  const registered=await page.request.post('/api/auth/register',{data:{username:`english_${Date.now().toString(36)}`,password:'english-test-2026',language:'zh-CN'}});
  expect(registered.status()).toBe(201);
  for (const path of ['/me','/me/settings','/','/deposit','/deposit/new','/me/posts','/me/credits','/me/activity','/me/reservations','/me/favorites','/materials','/materials/1']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('lang','en');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('a[href="/me/settings"]')).toHaveCount(0);
    await expect(page.getByRole('group',{name:'Language'})).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/undefined|\{\{|[\u4e00-\u9fff]/);
    if(path==='/me/settings')await expect(page).toHaveURL(/\/me$/);
  }
  expect((await (await page.request.get('/api/auth/me')).json()).user.language).toBe('zh-CN');
  expect(await page.evaluate(()=>localStorage.getItem('rematerial.language'))).toBe('zh-CN');
});

test('English messages preserve dynamic progress, parameters and API explanations',async({page})=>{
  await page.goto('/');
  const messages=await page.evaluate(async()=>{
    const {translateMessage,ApiError,messageOf}=await import('/frontend/src/i18n.ts');
    return [
      translateMessage('Uploading photo 1 of 2…'),
      translateMessage('Draft saved to your account.'),
      translateMessage({key:'You can upload a maximum of {{max}} photos.',values:{max:9}}),
      translateMessage(messageOf(new ApiError({error:'Wrong zone. Please scan the QR code for Board & Foam.',error_key:'unfinished.key'}))),
      translateMessage(messageOf(new ApiError({}))),
    ];
  });
  expect(messages).toEqual(['Uploading photo 1 of 2…','Draft saved to your account.','You can upload a maximum of 9 photos.','Wrong zone. Please scan the QR code for Board & Foam.','Something went wrong. Please try again.']);
});
