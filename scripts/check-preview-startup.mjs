// Non-mutating smoke check: requires the real preview to be running.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);
const args = ['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/launch-preview.ps1','-NoBrowser'];
const reuse = await exec('powershell.exe', args);
assert.match(reuse.stdout, /Reusing backend/);
assert.match(reuse.stdout, /Reusing frontend/);
assert.match(reuse.stdout, /Ready: http:\/\/localhost:5173/);
console.log('PASS: both existing project services reused.');
const legacy = await exec('powershell.exe',[...args,'-Demo']);
assert.match(legacy.stdout, /Ready: http:\/\/localhost:5173/);
assert.match(legacy.stdout, /"unchanged": true/);
console.log('PASS: legacy entry reuses unified preview; sample import is unchanged.');
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
    const page = await browser.newPage({viewport:{width:402,height:874}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://localhost:5173/');
    await page.getByRole('heading',{name:'Explore materials',exact:true}).waitFor();
    await page.getByRole('heading',{name:'Recommended',exact:true}).waitFor();
    await page.locator('.material-card').first().waitFor();
    const materials=(await(await page.request.get('http://localhost:5173/api/materials')).json()).materials;
    assert.ok(materials.some(m=>!m.is_demo),'Real materials remain visible');
    assert.ok(materials.filter(m=>m.is_demo).length>=16,'Samples appear alongside real materials');
    for(const m of materials.filter(m=>m.is_demo))assert.equal(m.available_quantity,0);
    await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    assert.deepEqual(errors,[]);
    assert.equal((await (await page.request.get('http://localhost:5173/api/health')).json()).database,true);
    console.log('PASS: real React preview rendered in Edge; proxied backend/database healthy.');
} finally { await browser.close(); }
