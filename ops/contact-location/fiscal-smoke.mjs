import {chromium} from '/tmp/radar-visual/node_modules/playwright/index.mjs';
import {execSync} from 'node:child_process';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:execSync('which google-chrome').toString().trim(),args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('https://radargt.wowlatam.com/fiscales/?release='+process.env.GITHUB_RUN_ID);
 assert.equal(response.status(),200);await page.locator('input').first().waitFor();
 assert.match(await page.title(),/Portal Fiscal/);
 assert.ok((await page.locator('#root').innerText()).length>60);
 assert.deepEqual(errors,[]);console.log('FISCAL_FRESH_BROWSER_LOGIN_RENDERED');
}finally{await browser.close()}
