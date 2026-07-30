// The How To page: it exists, it is reachable, and it actually answers the question
// the estimators asked — where the takeoff export file is.
'use strict';
const { chromium } = require('playwright');
const { seedCompany, INDEX, launchOpts } = require('./_env');

let failures = 0;
const ok = (c, n, x) => { console.log((c ? '✓ ' : '✗ ') + n + (x ? ' — ' + x : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await seedCompany(page);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(INDEX);
  await page.waitForSelector('#view');

  // ---- reachable from the sidebar without opening a bid ----
  const link = page.locator('#sidebar nav a[data-page="howto"]');
  ok(await link.count() === 1, 'How To is in the sidebar', (await link.innerText()).trim());
  await link.click();
  await page.waitForTimeout(500);
  ok((await page.locator('#pageTitle').innerText()) === 'How To', 'How To opens with no bid open');

  const text = await page.locator('#view').innerText();

  // ---- the answer to "how do I get the FESTR text" is actually on the page ----
  ok(/C:\\MAP-Software\\EST\\Exports/.test(text), 'names the exact folder');
  ok(/FESTR\.txt/.test(text) && /FESTR_QP\.txt/.test(text), 'names both export files');
  ok(/do not create this file|does not create|your takeoff program writes it/i.test(text),
    'says plainly that the takeoff program writes the file');
  ok(/File Explorer/i.test(text), 'tells them how to get there in Windows');
  ok(/Date modified/i.test(text), 'tells them how to work out which file is theirs');
  ok(/Import New SM From EST/.test(text) && /Import New SM From QP/.test(text),
    'names the old buttons, so it is recognisable');
  ok(/\.xlsm|spreadsheet/i.test(text), 'gives the fallback route through the old spreadsheet');

  // ---- the one-time company file step is explained too ----
  ok(/company file/i.test(text), 'explains the company file');
  ok(/once/i.test(text), 'says the company file is a one-time step');

  // ---- it is a real page, not a wall of text ----
  const shape = await page.evaluate(() => ({
    h3: document.querySelectorAll('#view .howto h3').length,
    ol: document.querySelectorAll('#view .howto ol').length,
    li: document.querySelectorAll('#view .howto ol li').length,
    tables: document.querySelectorAll('#view .howto table.grid').length,
    code: document.querySelectorAll('#view .howto code').length,
  }));
  ok(shape.h3 >= 5, 'has sections', shape.h3 + ' headings');
  ok(shape.ol >= 1 && shape.li >= 5, 'has real numbered steps', shape.li + ' steps');
  ok(shape.tables >= 2, 'has the lookup tables', shape.tables + ' tables');
  ok(shape.code >= 1, 'the folder path is set apart from the prose', shape.code + ' code spans');

  // ---- printable: the sidebar and top bar drop away ----
  await page.emulateMedia({ media: 'print' });
  const printed = await page.evaluate(() => {
    const hidden = (sel) => { const n = document.querySelector(sel); return !n || getComputedStyle(n).display === 'none'; };
    return { side: hidden('#sidebar'), top: hidden('#topbar'), btn: hidden('#view .noprint') };
  });
  ok(printed.side, 'printing drops the sidebar');
  ok(printed.btn, 'printing drops the Print button itself');
  await page.emulateMedia({ media: 'screen' });

  // ---- SM Import points here, and shows the folder with a copy button ----
  await page.evaluate(() => { location.hash = '#/home'; });
  await page.waitForSelector('text=+ New Bid');
  await page.click('text=+ New Bid');
  await page.waitForSelector('#topTotal');
  await page.evaluate(() => { location.hash = '#/smimport'; });
  await page.waitForTimeout(600);
  const smi = await page.locator('#view').innerText();
  ok(/C:\\MAP-Software\\EST\\Exports/.test(smi), 'SM Import shows the folder');
  ok(await page.locator('#view .pathbox button').count() === 1, 'SM Import has a Copy folder path button');
  ok(await page.locator('#view a[href="#/howto"]').count() >= 1, 'SM Import links to How To');
  ok(/Import New SM From EST/.test(smi), 'SM Import names the old buttons too');

  // the copy button really puts the path on the clipboard
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#view .pathbox button').click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok(clip === 'C:\\MAP-Software\\EST\\Exports', 'Copy folder path copies the folder', JSON.stringify(clip));

  // ---- TakeOff's empty-CAE hint points at both pages ----
  await page.evaluate(() => { location.hash = '#/takeoff'; });
  await page.waitForTimeout(600);
  ok(await page.locator('#view a[href="#/howto"]').count() >= 1, 'TakeOff empty CAE hint links to How To');

  ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures ? `\nFAILURES: ${failures}` : '\n*** HOW TO ALL PASS ***');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('crashed:', e); process.exit(2); });
