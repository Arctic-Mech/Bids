// Tests for the undo/redo history and the import progress overlay.
'use strict';
const { chromium } = require('playwright');
const { seedCompany, ROOT, SRC, FIXTURES, OUTDIR, INDEX, WORKBOOK, launchOpts } = require('./_env');
const fs = require('fs');
const path = require('path');
const BASE = SRC;

let failures = 0;
const ok = (c, n, x) => { console.log((c ? '✓ ' : '✗ ') + n + (x ? ' — ' + x : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await seedCompany(page);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(INDEX);
  await page.waitForSelector('#view');

  const seed = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'seed_bid.json'), 'utf8'));
  await page.evaluate((b) => {
    localStorage.setItem('arctic.bid.' + b.meta.id, JSON.stringify(b));
    localStorage.setItem('arctic.bids.index', JSON.stringify([{ id: b.meta.id, estNo: b.info.estNo, jobName: b.info.jobName, rev: b.meta.rev, savedAt: new Date().toISOString(), total: 0 }]));
  }, seed);
  await page.reload();
  await page.click('.bidcard');
  await page.waitForSelector('#topTotal');

  // ---- undo starts disabled on a freshly opened bid ----
  ok(await page.locator('#btnUndo').isDisabled(), 'undo: disabled with no history');
  ok(await page.locator('#btnRedo').isDisabled(), 'redo: disabled with no history');
  const base = await page.locator('#topTotal').innerText();

  // ---- an edit enables undo and names itself ----
  await page.evaluate(() => { pathSet(app.bid, 'recap.ohp', 0.30); app.touch(); });
  await page.waitForTimeout(250);
  const afterEdit = await page.locator('#topTotal').innerText();
  ok(afterEdit !== base, 'edit changed the total', base + ' -> ' + afterEdit);
  ok(!(await page.locator('#btnUndo').isDisabled()), 'undo: enabled after an edit');
  const tip = await page.locator('#btnUndo').getAttribute('title');
  ok(/Overhead/i.test(tip), 'undo: step is named in plain English', tip);

  // ---- undo restores the value and the total ----
  await page.click('#btnUndo');
  await page.waitForTimeout(400);
  const ohp = await page.evaluate(() => app.bid.recap.ohp);
  ok(Math.abs(ohp - 0.24) < 1e-9, 'undo: value restored', String(ohp));
  ok((await page.locator('#topTotal').innerText()) === base, 'undo: total back to ' + base);
  ok(!(await page.locator('#btnRedo').isDisabled()), 'redo: enabled after an undo');

  // ---- redo re-applies ----
  await page.click('#btnRedo');
  await page.waitForTimeout(400);
  ok(Math.abs((await page.evaluate(() => app.bid.recap.ohp)) - 0.30) < 1e-9, 'redo: value re-applied');
  ok((await page.locator('#topTotal').innerText()) === afterEdit, 'redo: total re-applied');

  // ---- undo survives a reload (it was saved) then multi-step undo ----
  await page.click('#btnUndo');
  await page.waitForTimeout(300);
  for (const [p, v] of [['info.jobName', 'STEP ONE'], ['info.location', 'STEP TWO'], ['recap.miscContingency', 5000]]) {
    await page.evaluate(([pp, vv]) => { pathSet(app.bid, pp, vv); app.touch(); }, [p, v]);
    await page.waitForTimeout(120);
  }
  ok(await page.evaluate(() => app.undoStack.length) >= 3, 'undo: stack holds several steps');
  for (let i = 0; i < 3; i++) { await page.click('#btnUndo'); await page.waitForTimeout(220); }
  const back = await page.evaluate(() => ({ j: app.bid.info.jobName, l: app.bid.info.location, m: app.bid.recap.miscContingency }));
  ok(back.j !== 'STEP ONE' && back.l !== 'STEP TWO' && back.m !== 5000, 'undo: three steps rolled back', JSON.stringify(back));
  ok((await page.locator('#topTotal').innerText()) === base, 'undo: total back to the original after 3 undos');

  // ---- keyboard shortcut ----
  await page.evaluate(() => { pathSet(app.bid, 'info.jobName', 'KEYBOARD'); app.touch(); });
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(350);
  ok((await page.evaluate(() => app.bid.info.jobName)) !== 'KEYBOARD', 'undo: Ctrl+Z works');

  // ---- undo cap keeps memory bounded ----
  await page.evaluate(async () => {
    for (let i = 0; i < 60; i++) { pathSet(app.bid, 'info.bidTime', 'T' + i); app.touch(); }
  });
  await page.waitForTimeout(400);
  const depth = await page.evaluate(() => app.undoStack.length);
  ok(depth <= 40, 'undo: stack capped at 40 steps', String(depth));

  // ---- progress overlay appears during a workbook import and clears afterwards ----
  await page.evaluate(() => { app.bid = null; localStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(300);
  const seenStages = [];
  const poll = setInterval(async () => {
    try {
      const t = await page.locator('.prog .stage').innerText({ timeout: 200 });
      if (t && !seenStages.includes(t)) seenStages.push(t);
    } catch (e) { }
  }, 60);
  await page.locator('#fileImport').setInputFiles(WORKBOOK);
  await page.waitForFunction(() => {
    const e = document.querySelector('#topTotal');
    return e && /\$[\d,]+\.\d\d/.test(e.textContent || '');
  }, null, { timeout: 90000 });
  clearInterval(poll);
  await page.waitForTimeout(400);
  ok(seenStages.length > 0, 'progress: overlay showed stages during import', JSON.stringify(seenStages.slice(0, 4)));
  ok(await page.locator('.prog-back').count() === 0, 'progress: overlay removed when done');
  ok((await page.locator('#topTotal').innerText()) === '$4,614,770.00', 'progress: workbook still imports to the exact total');

  ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures ? `\nFAILURES: ${failures}` : '\n*** UNDO + PROGRESS ALL PASS ***');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('crashed:', e); process.exit(2); });
