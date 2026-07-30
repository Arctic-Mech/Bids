// Second exclusions picker (the sheet's Z/AA block) and the clarifications default.
'use strict';
const { chromium } = require('playwright');
const { seedCompany, INDEX, WORKBOOK, OUTDIR, launchOpts } = require('./_env');
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

  // ---- new bids start with no clarifications (match the blank printed form) ----
  await page.click('text=+ New Bid');
  await page.waitForSelector('#topTotal');
  const clar = await page.evaluate(() => app.bid.proposal.clarifications);
  ok(Array.isArray(clar) && clar.length === 0, 'new bid: no clarifications by default', JSON.stringify(clar));

  // ---- both pickers feed the one Exclusions line, in sheet order ----
  await page.evaluate(() => {
    app.bid.proposal.exclusionsPicked = ['Duct Wrap', 'Air Balance'];
    app.bid.proposal.inclusionsPicked = ['Refrigeration', 'Controls'];
    app.touch();
  });
  await page.waitForTimeout(300);
  const line = await page.evaluate(() => app.computed.proposal.exclusionLine);
  ok(line === 'Duct Wrap, Air Balance, Refrigeration, Controls', 'line: W block then Z block', line);

  // ---- the picker renders on the Proposal page and is bound ----
  await page.evaluate(() => { location.hash = '#/proposal'; });
  await page.waitForTimeout(400);
  const boxes = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('#view label.ck')].map(l => l.textContent.trim());
    return { hasRefrigeration: labels.includes('Refrigeration'), hasDuctWrap: labels.includes('Duct Wrap') };
  });
  ok(boxes.hasRefrigeration && boxes.hasDuctWrap, 'proposal page: both pickers rendered');

  // ---- it reaches the PDF ----
  const pdfText = await page.evaluate(async () => {
    const bytes = await buildPagePdf(['proposal'], app.bid, app.computed, app.settings);
    return new TextDecoder('latin1').decode(bytes);
  });
  ok(/Refrigeration/.test(pdfText), 'proposal PDF: second-picker item printed');
  ok(!/Clarifications/.test(pdfText), 'proposal PDF: no clarifications block on a new bid');

  // ---- spreadsheet: marks written, D39 patched ONLY when Refrigeration is picked ----
  const withRefrig = await page.evaluate(async () => {
    const parts = await templateParts();
    const doc = new XlsmDoc(parts.map(p => ({ name: p.name, bytes: p.bytes })));
    xlsmInject(doc, app.bid);
    return {
      z17: doc.get('Proposal', 'Z17'), z19: doc.get('Proposal', 'Z19'),
      w17: doc.get('Proposal', 'W17'),
      d39HasZ17: /Z17=/.test(doc.getF('Proposal', 'D39') || ''),
    };
  });
  ok(withRefrig.w17 === 'X', 'xlsm: first picker mark written (W17)');
  ok(withRefrig.z17 === 'X' && withRefrig.z19 === 'X', 'xlsm: second picker marks written (Z17, Z19)');
  ok(withRefrig.d39HasZ17 === true, 'xlsm: D39 patched so Refrigeration actually appears in Excel');

  const withoutRefrig = await page.evaluate(async () => {
    app.bid.proposal.inclusionsPicked = ['Controls'];        // not the first item
    app.touch();
    const parts = await templateParts();
    const doc = new XlsmDoc(parts.map(p => ({ name: p.name, bytes: p.bytes })));
    xlsmInject(doc, app.bid);
    return { d39HasZ17: /Z17=/.test(doc.getF('Proposal', 'D39') || ''), z19: doc.get('Proposal', 'Z19') };
  });
  ok(withoutRefrig.d39HasZ17 === false, 'xlsm: D39 left untouched when Refrigeration is not picked');
  ok(withoutRefrig.z19 === 'X', 'xlsm: other second-picker marks still written');

  // ---- round-trip: marks survive export -> import ----
  const back = await page.evaluate(async () => {
    app.bid.proposal.inclusionsPicked = ['Refrigeration', 'Starters'];
    app.bid.proposal.exclusionsPicked = ['Duct Wrap'];
    app.touch();
    const parts = await templateParts();
    const doc = new XlsmDoc(parts.map(p => ({ name: p.name, bytes: p.bytes })));
    xlsmInject(doc, app.bid);
    const bytes = await doc.build();
    const again = await importXlsmFile(bytes);
    return { inc: again.proposal.inclusionsPicked, exc: again.proposal.exclusionsPicked };
  });
  ok(JSON.stringify(back.inc) === JSON.stringify(['Refrigeration', 'Starters']), 'round-trip: second picker survives', JSON.stringify(back.inc));
  ok(JSON.stringify(back.exc) === JSON.stringify(['Duct Wrap']), 'round-trip: first picker survives', JSON.stringify(back.exc));

  ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures ? `\nFAILURES: ${failures}` : '\n*** PROPOSAL PICKERS ALL PASS ***');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('crashed:', e); process.exit(2); });
