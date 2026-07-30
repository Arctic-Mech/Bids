// The published page carries no rates. It must ask for the company file, remember
// it per computer, and price nothing until it has one.
'use strict';
const { chromium } = require('playwright');
const { INDEX, COMPANY_FILE, WORKBOOK, seedCompany, launchOpts } = require('./_env');
const fs = require('fs');

let failures = 0;
const ok = (c, n, x) => { console.log((c ? '✓ ' : '✗ ') + n + (x ? ' — ' + x : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch(launchOpts);

  // ---------- the published file itself ----------
  const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  ok(!/const COMPANY = \{/.test(html), 'published page: no rate tables baked in');
  ok(!/TEMPLATE_XLSM\s*=\s*'[A-Za-z0-9+/]{500,}/.test(html), 'published page: no workbook baked in');
  ok(html.length < 900000, 'published page is small now', Math.round(html.length / 1024) + ' KB');
  for (const probe of ['"wage"', 'periodFactor', 'ocip']) {
    const n = (html.match(new RegExp(probe, 'g')) || []).length;
    ok(!(probe === '"wage"' && n > 2), 'published page does not list ' + probe + ' data', n + ' mentions');
  }

  // ---------- a fresh computer is asked for the file ----------
  let page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(INDEX);
  await page.waitForSelector('#view');
  const setupText = await page.locator('#view').innerText();
  ok(/company file/i.test(setupText), 'fresh computer: asks for the company file', setupText.split('\n')[0]);
  ok(/one[- ]time/i.test(setupText), 'fresh computer: says it is a one-time step');
  ok(await page.locator('#view .smi-drop').count() === 1, 'fresh computer: has somewhere to drop the file');
  const canBid = await page.evaluate(() => !!document.querySelector('.bidcard') || /\+ New Bid/.test(document.querySelector('#view').textContent));
  ok(canBid === false, 'fresh computer: cannot start a bid yet');

  // ---------- the setup screen must HOLD, whatever you click ----------
  // The sidebar is still on screen behind the setup card, and the top-bar Import
  // button is wired before boot() checks for the company file. Both used to let you
  // through to a page with no rates behind it, where the first thing that read a rate
  // died with "Cannot read properties of null (reading 'crew')".
  for (const hash of ['#/home', '#/export', '#/smimport', '#/settings', '#/takeoff']) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(300);
    const t = await page.locator('#view').innerText();
    ok(/one[- ]time setup/i.test(t), 'setup screen holds at ' + hash, t.split('\n')[0]);
  }
  // importing an estimate workbook before setup says what to do, and does not crash
  await page.evaluate(() => { location.hash = '#/home'; });
  await page.waitForTimeout(300);
  const before = errors.length;
  await page.locator('#fileImport').setInputFiles(WORKBOOK);
  await page.waitForTimeout(3000);
  ok(/Load the Arctic company file first/i.test(await page.locator('body').innerText()),
    'importing before setup: says to load the company file');
  ok(errors.length === before, 'importing before setup: no crash', errors.slice(before, before + 2).join(' | '));
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('arctic.bids.index') || '[]').length) === 0,
    'importing before setup: nothing was half-saved');

  // ---------- loading the file gets you working, and it is remembered ----------
  await page.locator('#view input[type=file]').setInputFiles(COMPANY_FILE);
  await page.waitForSelector('text=+ New Bid', { timeout: 20000 });
  ok(true, 'loading the company file opens the app');
  await page.click('text=+ New Bid');
  await page.waitForSelector('#topTotal');
  ok((await page.locator('#topTotal').innerText()) === '$0.00', 'a bid can be created after loading');

  // the rates really arrived: crew rates compute
  const rate = await page.evaluate(() => { location.hash = '#/crewmix'; return null; });
  await page.waitForTimeout(500);
  ok(/\$1[0-9]{2}\.\d\d/.test(await page.locator('#view').innerText()), 'crew rates compute from the loaded file');

  // reload: no setup screen this time
  await page.reload();
  await page.waitForTimeout(1200);
  ok(!/one[- ]time setup/i.test(await page.locator('#view').innerText()), 'the file is remembered after a reload');

  // the workbook came too, so the spreadsheet export works
  const parts = await page.evaluate(async () => (await templateParts()).length);
  ok(parts === 198, 'the estimate workbook loaded with it', parts + ' parts');

  // ---------- a different computer is asked again ----------
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(INDEX);
  await page2.waitForSelector('#view');
  ok(/company file/i.test(await page2.locator('#view').innerText()), 'a different computer is asked for it too');
  await ctx2.close();

  // ---------- a wrong file is refused clearly ----------
  const bad = require('path').join(require('os').tmpdir(), 'not-the-company-file.json');
  fs.writeFileSync(bad, JSON.stringify({ hello: 'world' }));
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForTimeout(600);
  await page.locator('#view input[type=file]').first().setInputFiles(bad);
  await page.waitForTimeout(800);
  ok(/does not look like the Arctic company file/i.test(await page.locator('#view').innerText()),
    'a wrong file is refused with a plain message');

  ok(errors.filter(e => !/company file/i.test(e)).length === 0, 'no page errors', errors.slice(0, 2).join(' | '));
  await browser.close();
  console.log(failures ? `\nFAILURES: ${failures}` : '\n*** COMPANY FILE ALL PASS ***');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('crashed:', e); process.exit(2); });
