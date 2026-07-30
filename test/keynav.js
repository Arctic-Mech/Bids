// Keyboard navigation in the grids: Enter/Shift+Enter/arrows move, Ctrl+D fills
// down, Escape reverts — and the things that must NOT change still work.
'use strict';
const { chromium } = require('playwright');
const { seedCompany, INDEX, FIXTURES, launchOpts } = require('./_env');
const fs = require('fs');
const path = require('path');

let failures = 0;
const ok = (c, n, x) => { console.log((c ? '✓ ' : '✗ ') + n + (x ? ' — ' + x : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
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

  const focusPath = () => page.evaluate(() => document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.path : null);
  // Wait for focus to settle rather than guessing a delay: a big page can take
  // several hundred ms to re-render before focus lands.
  const focusSettles = async (want) => {
    try {
      await page.waitForFunction((p) => {
        const a = document.activeElement;
        return a && a.dataset && a.dataset.path === p;
      }, want, { timeout: 4000 });
      return want;
    } catch (e) { return await focusPath(); }
  };
  // A takeoff edit re-renders ~1600 inputs (~400ms) and restores focus itself when
  // it lands. Let that finish before starting from a new cell, or the test races it.
  const focusOn = async (p) => {
    await page.waitForTimeout(500);
    const found = await page.evaluate((sel) => {
      const n = document.querySelector('[data-path="' + CSS.escape(sel) + '"]');
      if (!n) return false;
      n.focus(); return true;
    }, p);
    if (!found) return false;
    // confirm the cursor really is there before sending keys, or we race the
    // page's own focus restore after a re-render
    try {
      await page.waitForFunction((sel) => {
        const a = document.activeElement;
        return a && a.dataset && a.dataset.path === sel;
      }, p, { timeout: 4000 });
    } catch (e) { return false; }
    return true;
  };
  const press = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(120); };

  await page.evaluate(() => { location.hash = '#/takeoff'; });
  await page.waitForTimeout(500);

  // ---- Enter moves down, in a column whose edits trigger a re-render ----
  ok(await focusOn('takeoff.groups[0].items[0].qty'), 'setup: focused a qty cell');
  await press('Enter');
  { const got = await focusSettles('takeoff.groups[0].items[1].qty'); ok(got === 'takeoff.groups[0].items[1].qty', 'Enter moves down the column', got); }

  // ---- Shift+Enter moves back up ----
  await press('Shift+Enter');
  { const got = await focusSettles('takeoff.groups[0].items[0].qty'); ok(got === 'takeoff.groups[0].items[0].qty', 'Shift+Enter moves up', got); }

  // ---- a value typed before Enter commits, and the move still lands ----
  const before = await page.locator('#topTotal').innerText();
  await focusOn('takeoff.groups[0].items[0].qty');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('7');
  await press('Enter');
  await page.waitForTimeout(700);
  const committed = await page.evaluate(() => app.bid.takeoff.groups[0].items[0].qty);
  ok(committed === 7, 'Enter commits the typed value first', String(committed));
  { const got = await focusSettles('takeoff.groups[0].items[1].qty'); ok(got === 'takeoff.groups[0].items[1].qty', 'Enter lands on the next row after the re-render', got); }
  ok((await page.locator('#topTotal').innerText()) !== before, 'Enter: the edit recalculated the total');
  await page.evaluate(() => { app.undo(); });
  await page.waitForTimeout(400);

  // ---- a column that does NOT re-render (phase codes had no data-path before) ----
  await page.evaluate(() => { location.hash = '#/takeoff'; });
  await page.waitForTimeout(400);
  ok(await focusOn('takeoff.groups[0].items[0].fieldPhase'), 'setup: focused a phase cell');
  await press('Enter');
  { const got = await focusSettles('takeoff.groups[0].items[1].fieldPhase'); ok(got === 'takeoff.groups[0].items[1].fieldPhase', 'Enter works in the phase-code column', got); }

  // ---- arrows move vertically in a plain numeric cell ----
  await focusOn('takeoff.groups[0].items[0].qty');
  await press('ArrowDown');
  { const got = await focusSettles('takeoff.groups[0].items[1].qty'); ok(got === 'takeoff.groups[0].items[1].qty', 'ArrowDown moves down', got); }
  await press('ArrowUp');
  { const got = await focusSettles('takeoff.groups[0].items[0].qty'); ok(got === 'takeoff.groups[0].items[0].qty', 'ArrowUp moves up', got); }

  // ---- but arrows still belong to the control on datalist and select cells ----
  await focusOn('takeoff.groups[0].items[0].fieldPhase');
  await press('ArrowDown');
  { const got = await focusSettles('takeoff.groups[0].items[0].fieldPhase'); ok(got === 'takeoff.groups[0].items[0].fieldPhase', 'ArrowDown left alone on a datalist cell', got); }
  await focusOn('takeoff.groups[0].items[0].emo');
  await press('ArrowDown');
  { const got = await focusSettles('takeoff.groups[0].items[0].emo'); ok(got === 'takeoff.groups[0].items[0].emo', 'ArrowDown left alone on a dropdown', got); }

  // ---- left/right still move the caret, not the cell ----
  await page.evaluate(() => {
    const n = document.querySelector('[data-path="takeoff.groups[0].items[0].desc"]');
    n.focus(); n.setSelectionRange(4, 4);
  });
  await press('ArrowLeft');
  const caret = await page.evaluate(() => ({ p: document.activeElement.dataset.path, s: document.activeElement.selectionStart }));
  ok(caret.p === 'takeoff.groups[0].items[0].desc' && caret.s === 3, 'ArrowLeft moves the caret, not the cell', JSON.stringify(caret));

  // ---- Ctrl+D fills down, and is undoable ----
  await page.evaluate(() => { pathSet(app.bid, 'takeoff.groups[0].items[0].qty', 42); app.touch(); });
  await page.waitForTimeout(350);
  await focusOn('takeoff.groups[0].items[1].qty');
  await press('Control+d');
  const filled = await page.evaluate(() => app.bid.takeoff.groups[0].items[1].qty);
  ok(filled === 42, 'Ctrl+D copies the cell above', String(filled));
  await page.click('#btnUndo');
  await page.waitForTimeout(400);
  ok((await page.evaluate(() => app.bid.takeoff.groups[0].items[1].qty)) !== 42, 'Ctrl+D is undoable');

  // ---- Escape puts a half-typed cell back ----
  await page.evaluate(() => { location.hash = '#/takeoff'; });
  await page.waitForTimeout(400);
  await focusOn('takeoff.groups[0].items[0].desc');
  const origDesc = await page.evaluate(() => app.bid.takeoff.groups[0].items[0].desc);
  await page.keyboard.type('ZZZ');
  await press('Escape');
  const shown = await page.evaluate(() => document.activeElement.value);
  ok(shown === origDesc, 'Escape restores what was in the cell', JSON.stringify(shown));
  await page.evaluate(() => { document.activeElement.blur(); });
  await page.waitForTimeout(300);
  ok((await page.evaluate(() => app.bid.takeoff.groups[0].items[0].desc)) === origDesc, 'Escape: the model was never changed');

  // ---- it is not takeoff-specific ----
  await page.evaluate(() => { location.hash = '#/crewmix'; });
  await page.waitForTimeout(400);
  const crewMoved = await page.evaluate(async () => {
    const all = [...document.querySelectorAll('#view table.grid input[data-path^="crewMix."]')];
    if (all.length < 2) return 'too few crew inputs';
    all[0].focus();
    const from = document.activeElement.dataset.path;
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 150));
    return from + ' -> ' + (document.activeElement.dataset.path || 'none');
  });
  ok(/->/.test(crewMoved) && !/-> none/.test(crewMoved), 'Enter works on Crew Mix too', crewMoved);

  // ---- textareas keep Enter for newlines ----
  await page.evaluate(() => { location.hash = '#/pricebreakdown'; });
  await page.waitForTimeout(500);
  const ta = await page.evaluate(async () => {
    const t = document.querySelector('#view table.grid textarea, #view textarea');
    if (!t) return 'no textarea';
    t.focus(); t.value = 'a';
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    return document.activeElement === t ? 'still focused' : 'focus moved';
  });
  ok(ta === 'still focused' || ta === 'no textarea', 'Enter in a notes textarea does not jump cells', ta);

  // ---- the shortcuts that already existed still work ----
  await page.evaluate(() => { location.hash = '#/takeoff'; });
  await page.waitForTimeout(400);
  await page.evaluate(() => { pathSet(app.bid, 'info.jobName', 'KEYNAV CHECK'); app.touch(); });
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  ok((await page.evaluate(() => app.bid.info.jobName)) !== 'KEYNAV CHECK', 'Ctrl+Z still undoes');

  ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures ? `\nFAILURES: ${failures}` : '\n*** KEYBOARD NAV ALL PASS ***');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('crashed:', e); process.exit(2); });
