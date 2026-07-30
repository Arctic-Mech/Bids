// Measure text clipping in inputs across desktop viewport sizes.
// An input clips when its scrollWidth exceeds its clientWidth.
'use strict';
const { chromium } = require('playwright');
const { seedCompany, ROOT, SRC, FIXTURES, OUTDIR, INDEX, WORKBOOK, launchOpts } = require('./_env');
const fs = require('fs');
const path = require('path');

const BASE = SRC;
const raw = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'seed_bid.json'), 'utf8'));
const bid = raw.bid || raw;   // fixtures may be a bare bid or an export wrapper
const SIZES = JSON.parse(process.env.SIZES || '[[1280,800],[1440,900],[1680,1050],[1920,1080],[2560,1440]]');
const PAGES = ['takeoff', 'recap', 'smimport', 'notes', 'pricebreakdown', 'proposal', 'schedule', 'booking', 'indirects', 'crewmix'];

(async () => {
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await seedCompany(page);
  await page.goto(INDEX);
  await page.waitForSelector('#view');
  await page.evaluate((b) => {
    b.meta.id = 'clip-test';
    localStorage.setItem('arctic.bid.' + b.meta.id, JSON.stringify(b));
    localStorage.setItem('arctic.bids.index', JSON.stringify([{ id: b.meta.id, estNo: b.info.estNo, jobName: b.info.jobName, rev: b.meta.rev, savedAt: new Date().toISOString(), total: 0 }]));
    openBid(b.meta.id);
  }, bid);

  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    const rows = [];
    for (const pg of PAGES) {
      await page.evaluate((p) => { location.hash = '#/' + p; }, pg);
      await page.waitForTimeout(350);
      const res = await page.evaluate(() => {
        const out = {};
        for (const i of document.querySelectorAll('input[type=text], input.num, input:not([type]), select, textarea')) {
          const val = i.value || '';
          if (!val.trim()) continue;
          const clipped = i.scrollWidth > i.clientWidth + 1;
          if (!clipped) continue;
          // identify the column from the table header above it
          let col = '(form field)';
          const td = i.closest('td');
          if (td) {
            const tbl = td.closest('table');
            const hdr = tbl && tbl.querySelector('tr');
            const idx = [...td.parentElement.children].indexOf(td);
            if (hdr && hdr.children[idx]) col = (hdr.children[idx].textContent || '').trim() || '(col ' + idx + ')';
          } else if (i.dataset && i.dataset.path) col = i.dataset.path.replace(/\[\d+\]/g, '[]');
          (out[col] = out[col] || { n: 0, worst: 0, sample: '' });
          out[col].n++;
          const over = i.scrollWidth - i.clientWidth;
          if (over > out[col].worst) { out[col].worst = over; out[col].sample = val.slice(0, 42); }
        }
        return out;
      });
      for (const [col, v] of Object.entries(res)) rows.push([pg, col, v.n, v.worst, v.sample]);
    }
    console.log(`\n=== ${w}x${h}  — ${rows.length ? rows.length + ' clipped field group(s)' : 'NO CLIPPING'}`);
    rows.sort((a, b) => b[3] - a[3]);
    for (const [pg, col, n, worst, sample] of rows.slice(0, 12)) {
      console.log(`   ${pg.padEnd(15)} ${col.padEnd(18)} ${String(n).padStart(3)} fields  worst +${worst}px  e.g. ${JSON.stringify(sample)}`);
    }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(2); });
