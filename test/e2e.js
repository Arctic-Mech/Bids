// End-to-end browser test of index.html with Playwright + bundled Chromium.
'use strict';
const { chromium } = require('playwright');
const { seedCompany, ROOT, SRC, FIXTURES, OUTDIR, INDEX, WORKBOOK, launchOpts } = require('./_env');
const fs = require('fs');
const path = require('path');

const SEED = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'seed_bid.json'), 'utf8'));
const DL = path.join(OUTDIR, 'downloads');
fs.mkdirSync(DL, { recursive: true });

let failures = 0;
function ok(cond, name, extra) {
  console.log((cond ? '✓ ' : '✗ ') + name + (extra ? ' — ' + extra : ''));
  if (!cond) failures++;
}

(async () => {
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await seedCompany(page);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // 1) boot
  await page.goto(INDEX);
  await page.waitForSelector('#view');
  ok(await page.locator('#nav a').count() >= 10, 'boot: nav renders');
  ok((await page.locator('#view').innerText()).includes('No bids'), 'boot: empty home');

  // 2) inject seed bid + open
  await page.evaluate((bid) => {
    localStorage.setItem('arctic.bid.' + bid.meta.id, JSON.stringify(bid));
    localStorage.setItem('arctic.bids.index', JSON.stringify([{ id: bid.meta.id, estNo: bid.info.estNo, jobName: bid.info.jobName, rev: bid.meta.rev, savedAt: new Date().toISOString(), total: 0 }]));
  }, SEED);
  await page.reload();
  await page.click('.bidcard');
  await page.waitForSelector('#topTotal');
  const total = await page.locator('#topTotal').innerText();
  ok(total === '$4,614,770.00', 'seed bid: Total Bid on screen', total);

  // 3) navigation + back button
  await page.click('#nav a[data-page=takeoff]');
  await page.waitForTimeout(150);
  ok((await page.locator('#pageTitle').innerText()) === 'TakeOff', 'nav: takeoff page');
  await page.click('#nav a[data-page=crewmix]');
  await page.waitForTimeout(150);
  await page.goBack();
  await page.waitForTimeout(200);
  ok((await page.locator('#pageTitle').innerText()) === 'TakeOff', 'back button returns to TakeOff');
  await page.goBack();
  await page.waitForTimeout(200);
  ok((await page.locator('#pageTitle').innerText()).includes('Recap'), 'back button returns to Recap');

  // 4) crew page numbers
  await page.click('#nav a[data-page=crewmix]');
  await page.waitForTimeout(150);
  const crewText = await page.locator('#view').innerText();
  ok(crewText.includes('$103.07'), 'crew: SM field rate 103.07');
  ok(crewText.includes('$111.45'), 'crew: shop rate 111.45');

  // 5) edit an input on recap -> total changes and restores
  await page.click('#nav a[data-page=recap]');
  await page.waitForTimeout(150);
  const misc = page.locator('input').filter({ hasText: '' });
  // find Miscellaneous/contingency input via label proximity: use the addDeduct path (Cost Leveler row)
  const before = await page.locator('#topTotal').innerText();
  await page.evaluate(() => {
    pathSet(app.bid, 'recap.miscContingency', 100000);
    app.touch();
  });
  await page.waitForTimeout(500);
  const after = await page.locator('#topTotal').innerText();
  ok(after !== before, 'edit: contingency changes total', before + ' -> ' + after);
  const expected = await page.evaluate(() => fmt.money(app.computed.recap.H70));
  ok(after === expected, 'edit: header matches engine');
  await page.evaluate(() => { pathSet(app.bid, 'recap.miscContingency', 0); app.touch(); });
  await page.waitForTimeout(500);
  ok((await page.locator('#topTotal').innerText()) === '$4,614,770.00', 'edit: restore returns to exact total');

  // 6) goal-seek style expression input works (=100*hours/base -> percent points)
  const exprOk = await page.evaluate(() => {
    const v = evalExpr('=100*512.28/4269');
    return Math.abs(v - 12) < 0.01;
  });
  ok(exprOk, 'expression input: =100*512.28/4269 evaluates to 12');

  // 7) takeoff: add a row and type into it
  await page.click('#nav a[data-page=takeoff]');
  await page.waitForTimeout(200);
  const groupCount = await page.evaluate(() => app.bid.takeoff.groups.length);
  await page.evaluate(() => {
    app.bid.takeoff.groups[0].items.push({ matPhase: '', shopPhase: '', fieldPhase: '3-01', desc: 'E2E test row', qty: 10, fUnit: 2, fMult: '', sUnit: '', sMult: '', mUnit: 100, notes: '', emo: '', ot: '', shift: '' });
    app.touch();
  });
  await page.waitForTimeout(400);
  const h7 = await page.evaluate(() => app.computed.takeoff.totals.H7);
  ok(Math.abs(h7 - (7934.12 + 20)) < 0.01, 'takeoff: +10qty×2hr row adds 20 field hrs', String(h7));
  await page.evaluate(() => { app.bid.takeoff.groups[0].items.pop(); app.touch(); });
  await page.waitForTimeout(400);

  // 8) exports: single PDF, ZIP, JSON
  await page.click('#nav a[data-page=export]');
  await page.waitForTimeout(200);
  const dl1 = page.waitForEvent('download');
  await page.click('text=Export as one PDF');
  const pdf = await dl1;
  const pdfPath = path.join(DL, pdf.suggestedFilename());
  await pdf.saveAs(pdfPath);
  ok(pdf.suggestedFilename() === '25-800 The Dalles Adventist Energy Upgrades Rev 1.pdf', 'export: PDF filename convention', pdf.suggestedFilename());
  ok(fs.statSync(pdfPath).size > 20000, 'export: PDF has content', fs.statSync(pdfPath).size + ' bytes');

  const dl2 = page.waitForEvent('download');
  await page.click('text=Export as ZIP');
  const zip = await dl2;
  const zipPath = path.join(DL, zip.suggestedFilename());
  await zip.saveAs(zipPath);
  ok(zip.suggestedFilename().endsWith('.zip'), 'export: ZIP filename', zip.suggestedFilename());

  // 9) import round-trip: modify bid, then import the PDF -> diff modal with override
  await page.evaluate(() => { app.bid.meta.rev = 2; pathSet(app.bid, 'recap.ohp', 0.30); app.bid.takeoff.groups[0].name = 'RENAMED GROUP'; app.touch(); app.saveNow(); });
  await page.waitForTimeout(300);
  const input = page.locator('#fileImport');
  await input.setInputFiles(pdfPath);
  await page.waitForSelector('.modal', { timeout: 8000 });
  const modalText = await page.locator('.modal').innerText();
  ok(modalText.includes('difference'), 'import: diff modal shows differences');
  ok(modalText.includes('Overhead & Profit %'), 'import: OH&P change labeled', '');
  ok(modalText.includes('RENAMED GROUP'), 'import: group rename shown');
  ok(modalText.includes('Revision number'), 'import: rev change shown');
  await page.click('.modal .foot .btn:not(.sec)');   // primary: accept everything
  await page.waitForTimeout(500);
  const revBack = await page.evaluate(() => app.bid.meta.rev);
  const ohpBack = await page.evaluate(() => app.bid.recap.ohp);
  const totalBack = await page.locator('#topTotal').innerText();
  ok(revBack === 1 && Math.abs(ohpBack - 0.24) < 1e-9, 'import: override restored rev 1 values');
  ok(totalBack === '$4,614,770.00', 'import: total restored exactly', totalBack);

  // 10) import the ZIP as a fresh machine (clear storage first) -> becomes new bid
  // (null the open bid too, else the pagehide autosave writes it right back during reload)
  await page.evaluate(() => { app.bid = null; localStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(300);
  const cleanIndex = await page.evaluate(() => localStorage.getItem('arctic.bids.index'));
  ok(!cleanIndex, 'clean machine: no bids stored');
  await page.locator('#fileImport').setInputFiles(zipPath);
  await page.waitForTimeout(1500);
  ok(await page.locator('.modal').count() === 0, 'zip import on clean machine: no diff modal');
  const t2 = await page.locator('#topTotal').innerText();
  ok(t2 === '$4,614,770.00', 'zip import on clean machine restores bid', t2);

  // 11) other pages render without errors
  for (const pg of ['smimport', 'indirects', 'pricebreakdown', 'proposal', 'booking', 'notes', 'schedule', 'settings', 'functions', 'export', 'home']) {
    await page.click('#nav a[data-page=' + pg + ']').catch(() => page.evaluate((p) => { location.hash = '#/' + p; }, pg));
    await page.waitForTimeout(150);
    const txt = await page.locator('#view').innerText();
    ok(txt.length > 40, 'page renders: ' + pg);
  }
  // booking status check
  await page.evaluate(() => { location.hash = '#/booking'; });
  await page.waitForTimeout(300);
  const bookTxt = await page.locator('#view').innerText();
  ok(bookTxt.includes('Booking Complete'), 'booking: status complete on seed bid');

  // proposal words
  await page.evaluate(() => { location.hash = '#/proposal'; });
  await page.waitForTimeout(300);
  const propTxt = await page.locator('#view').innerText();
  ok(propTxt.includes('Four Million Six Hundred Fourteen Thousand Seven Hundred Seventy'), 'proposal: amount in words');

  // 12) new bid flow
  await page.evaluate(() => { document.querySelectorAll('.modal-back').forEach(m => m.remove()); location.hash = '#/home'; });
  await page.waitForTimeout(200);
  await page.click('text=+ New Bid');
  await page.waitForTimeout(500);
  const newTotal = await page.locator('#topTotal').innerText();
  ok(newTotal === '$0.00', 'new bid: zero total', newTotal);

  // 13) spreadsheet (.xlsm) import/export round-trip through the real app
  await page.evaluate(() => { app.bid = null; localStorage.clear(); location.hash = '#/home'; });
  await page.reload();
  await page.waitForTimeout(300);
  await page.locator('#fileImport').setInputFiles(WORKBOOK);
  // parsing a 1.9MB workbook in-page can take a while on a loaded machine
  await page.waitForFunction(() => {
    const e = document.querySelector('#topTotal');
    return e && /\$[\d,]+\.\d\d/.test(e.textContent || '');
  }, null, { timeout: 90000 });
  const tx = await page.locator('#topTotal').innerText();
  ok(tx === '$4,614,770.00', 'xlsm import: original workbook computes exact total', tx);
  ok(await page.locator('.modal').count() === 0, 'xlsm import on clean machine: no diff modal');

  // export via the same path as the Export button, capture the bytes
  const b64 = await page.evaluate(async () => {
    const parts = await templateParts();
    const doc = new XlsmDoc(parts.map(p => ({ name: p.name, bytes: p.bytes })));
    xlsmInject(doc, app.bid);
    doc.forceRecalc();
    const bytes = await doc.build();
    let s = '';
    for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return btoa(s);
  });
  const xlsmOut = path.join(DL, 'browser_export.xlsm');
  fs.writeFileSync(xlsmOut, Buffer.from(b64, 'base64'));
  ok(fs.statSync(xlsmOut).size > 1000000, 'xlsm export: browser produced workbook', fs.statSync(xlsmOut).size + ' bytes');

  // re-import the exported bytes: the parsed bid must equal the one it came from
  const rt = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bid2 = await importXlsmFile(bytes);
    const norm = (b) => { const c = JSON.parse(JSON.stringify(b)); c.meta = null; c.settingsSnapshot = null; return JSON.stringify(c); };
    return { same: norm(bid2) === norm(app.bid), estNo: bid2.info.estNo };
  }, b64);
  ok(rt.same, 'xlsm round-trip: re-imported bid identical to source bid');
  ok(rt.estNo === '25-800', 'xlsm round-trip: est # survives', rt.estNo);

  ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures ? `\nFAILURES: ${failures}` : '\n*** E2E ALL PASS ***');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('E2E crashed:', e); process.exit(2); });
