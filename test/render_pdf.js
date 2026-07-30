// Render PDF pages from a saved bid, through the real app in a browser.
// usage: node test/render_pdf.js <bid.json> <out.pdf> [pageKeys,comma,separated|all]
'use strict';
const { chromium } = require('playwright');
const { seedCompany, ROOT, SRC, FIXTURES, OUTDIR, INDEX, WORKBOOK, launchOpts } = require('./_env');
const fs = require('fs');
const path = require('path');

const bidPath = process.argv[2];
const outPath = process.argv[3];
const keysArg = process.argv[4] || 'proposal';

(async () => {
  const raw = JSON.parse(fs.readFileSync(bidPath, 'utf8'));
  const bid = raw.bid || raw;
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await seedCompany(page);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(INDEX);
  await page.waitForSelector('#view');

  const b64 = await page.evaluate(async ({ bid, keysArg }) => {
    bid.meta.id = 'render-test';
    localStorage.setItem('arctic.bid.' + bid.meta.id, JSON.stringify(bid));
    localStorage.setItem('arctic.bids.index', JSON.stringify([{ id: bid.meta.id, estNo: bid.info.estNo, jobName: bid.info.jobName, rev: bid.meta.rev, savedAt: new Date().toISOString(), total: 0 }]));
    openBid(bid.meta.id);
    const keys = keysArg === 'all' ? Object.keys(PDF_PAGES) : keysArg.split(',');
    const bytes = await buildPagePdf(keys, app.bid, app.computed, app.settings);
    let s = '';
    for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return btoa(s);
  }, { bid, keysArg });

  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log('wrote', outPath, fs.statSync(outPath).size, 'bytes');
  if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5).join(' | '));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
