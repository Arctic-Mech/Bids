// Layout regression guard: render every PDF page from a real bid and assert the
// audit finds no colliding text and nothing off the page.
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const { seedCompany, SRC, FIXTURES, OUTDIR } = require('./_env');
const BASE = SRC;

const bid = process.argv[2] || path.join(FIXTURES, 'seed_bid.json');
const out = path.join(OUTDIR, 'out_all.pdf');
execFileSync('node', [path.join(__dirname, 'render_pdf.js'), bid, out, 'all'], { stdio: 'inherit' });
const report = execFileSync('python3', [path.join(__dirname, 'pdf_audit.py'), out], { encoding: 'utf8' });
process.stdout.write(report);
const m = /TOTAL: (\d+) colliding span pairs, (\d+) off-page spans/.exec(report);
if (!m) { console.error('✗ could not parse audit report'); process.exit(2); }
const [, coll, off] = m;
console.log(Number(coll) === 0 && Number(off) === 0
  ? '*** PDF LAYOUT OK — no collisions, nothing off-page ***'
  : `✗ PDF LAYOUT REGRESSION: ${coll} collisions, ${off} off-page`);
process.exit(Number(coll) === 0 && Number(off) === 0 ? 0 : 1);
