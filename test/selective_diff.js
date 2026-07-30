// Per-change accept/deny on import: accept some, deny others, and prove the
// denied ones stayed put and the bid is still structurally sound.
'use strict';
const { chromium } = require('playwright');
const { seedCompany, ROOT, SRC, FIXTURES, OUTDIR, INDEX, WORKBOOK, launchOpts } = require('./_env');
const fs = require('fs');
const path = require('path');

let failures = 0;
const ok = (c, n, x) => { console.log((c ? '✓ ' : '✗ ') + n + (x ? ' — ' + x : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
  const baseTotal = await page.locator('#topTotal').innerText();

  // Build an "incoming" file that differs in several distinct ways, including a
  // list whose length changed (rows added to a takeoff group).
  const info = await page.evaluate(() => {
    const inc = JSON.parse(JSON.stringify(app.bid));
    inc.meta.rev = 4;
    inc.info.jobName = 'FILE JOB NAME';
    inc.info.location = 'FILE LOCATION';
    inc.recap.ohp = 0.33;
    inc.recap.miscContingency = 77000;
    inc.takeoff.groups[1].name = 'FILE GROUP NAME';
    inc.takeoff.groups[1].items.push({ matPhase: '', shopPhase: '', fieldPhase: '3-01', desc: 'FILE EXTRA ROW', qty: 3, fUnit: 4, fMult: '', sUnit: '', sMult: '', mUnit: 500, notes: '', emo: '', ot: '', shift: '' });
    window.__incoming = inc;
    const changes = diffBids(app.bid, inc, DIFF_IGNORE);
    const units = diffUnits(app.bid, inc, changes);
    return {
      rawChanges: changes.length,
      units: units.length,
      listUnits: units.filter(u => u.kind === 'list').map(u => ({ label: u.label, from: u.from, to: u.to, count: u.count })),
      labels: units.map(u => u.label),
    };
  });
  ok(info.units > 0, 'diff: units built', info.units + ' units from ' + info.rawChanges + ' raw changes');
  ok(info.listUnits.length === 1, 'diff: the added row collapses the row list into ONE decision', JSON.stringify(info.listUnits));
  ok(/Overhead/.test(info.labels.join('|')) && /Job Name/.test(info.labels.join('|')), 'diff: units are labelled in plain English');

  // open the modal
  await page.evaluate(() => showDiffModal(app.bid, window.__incoming, 'test-file.pdf'));
  await page.waitForSelector('.modal');
  const cbCount = await page.locator('.modal table.diff input[type=checkbox]').count();
  ok(cbCount === info.units, 'modal: a checkbox per difference', cbCount + ' boxes');
  const applyLabel = () => page.locator('.modal .foot .btn:not(.sec)').innerText();
  ok((await applyLabel()).includes('Accept all'), 'modal: everything accepted by default', await applyLabel());

  // Deny all, then accept exactly two: the OH&P change and the job name
  await page.click('.modal >> text=Deny all');
  await page.waitForTimeout(120);
  ok((await applyLabel()).includes('Keep mine'), 'modal: Deny all clears every box', await applyLabel());

  const picked = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.modal table.diff tr')];
    const want = ['Overhead & Profit %', 'Job Name'];
    const hit = [];
    for (const r of rows) {
      const cells = r.querySelectorAll('td');
      if (cells.length < 4) continue;
      const label = cells[1].textContent.trim();
      if (want.some(w => label === w)) {
        const cb = cells[0].querySelector('input');
        cb.click();
        hit.push(label);
      }
    }
    return hit;
  });
  ok(picked.length === 2, 'modal: ticked two specific changes', picked.join(' + '));
  ok((await applyLabel()).includes('the 2 accepted'), 'modal: button reflects the selection', await applyLabel());

  // Apply and verify ONLY those two landed
  await page.click('.modal .foot .btn:not(.sec)');
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({
    ohp: app.bid.recap.ohp,
    jobName: app.bid.info.jobName,
    location: app.bid.info.location,
    misc: app.bid.recap.miscContingency,
    rev: app.bid.meta.rev,
    groupName: app.bid.takeoff.groups[1].name,
    rowCount: app.bid.takeoff.groups[1].items.length,
    lastDesc: app.bid.takeoff.groups[1].items[app.bid.takeoff.groups[1].items.length - 1].desc,
  }));
  ok(Math.abs(after.ohp - 0.33) < 1e-9, 'accepted: OH&P took the file value', String(after.ohp));
  ok(after.jobName === 'FILE JOB NAME', 'accepted: job name took the file value', after.jobName);
  ok(after.location !== 'FILE LOCATION', 'denied: location kept mine', JSON.stringify(after.location));
  ok(after.misc !== 77000, 'denied: contingency kept mine', String(after.misc));
  ok(Number(after.rev) === 1, 'denied: revision stayed at mine', String(after.rev));
  ok(after.groupName !== 'FILE GROUP NAME', 'denied: group name kept mine', after.groupName);
  ok(after.lastDesc !== 'FILE EXTRA ROW', 'denied: the extra row was not added', String(after.rowCount) + ' rows');

  // the merge is a real, sound bid: engine recomputes and undo puts it all back
  const mergedTotal = await page.locator('#topTotal').innerText();
  ok(/^\$[\d,]+\.\d\d$/.test(mergedTotal), 'merge: engine recomputed a total', mergedTotal);
  ok(mergedTotal !== baseTotal, 'merge: accepted OH&P moved the total', baseTotal + ' -> ' + mergedTotal);
  ok(!(await page.locator('#btnUndo').isDisabled()), 'merge: undo is available');
  await page.click('#btnUndo');
  await page.waitForTimeout(500);
  const undone = await page.evaluate(() => ({ ohp: app.bid.recap.ohp, jobName: app.bid.info.jobName }));
  ok(Math.abs(undone.ohp - 0.24) < 1e-9 && undone.jobName !== 'FILE JOB NAME', 'merge: undo restored my version', JSON.stringify(undone));
  ok((await page.locator('#topTotal').innerText()) === baseTotal, 'merge: undo restored the total', baseTotal);

  // accepting the list unit brings the row across
  await page.evaluate(() => showDiffModal(app.bid, window.__incoming, 'test-file.pdf'));
  await page.waitForSelector('.modal');
  await page.click('.modal >> text=Deny all');
  await page.evaluate(() => {
    for (const r of document.querySelectorAll('.modal table.diff tr')) {
      const c = r.querySelectorAll('td');
      if (c.length >= 4 && /row count|rows/i.test(c[1].textContent)) c[0].querySelector('input').click();
    }
  });
  await page.click('.modal .foot .btn:not(.sec)');
  await page.waitForTimeout(700);
  const rows = await page.evaluate(() => ({
    n: app.bid.takeoff.groups[1].items.length,
    last: app.bid.takeoff.groups[1].items[app.bid.takeoff.groups[1].items.length - 1].desc,
    holes: app.bid.takeoff.groups.some(g => g.items.some(it => it == null)),
    name: app.bid.takeoff.groups[1].name,
  }));
  ok(rows.last === 'FILE EXTRA ROW', 'list unit: accepting it brought the row across', rows.n + ' rows');
  ok(rows.holes === false, 'list unit: no holes left in the row arrays');
  ok(rows.name !== 'FILE GROUP NAME', 'list unit: denied group name still kept mine', rows.name);

  ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures ? `\nFAILURES: ${failures}` : '\n*** SELECTIVE DIFF ALL PASS ***');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('crashed:', e); process.exit(2); });
