// Adversarial export/import tests for lib/pdf.js, lib/zip.js, parts/08_io.js logic
'use strict';
const fs = require('fs');
const path = require('path');
const { SRC, OUTDIR, WORKBOOK } = require('./_env');
const BASE = SRC;
const { PdfDoc, pdfExtractJson, textWidth } = require(path.join(BASE, 'lib/pdf.js'));
const { zipCreate, zipRead } = require(path.join(BASE, 'lib/zip.js'));

let fails = 0;
const ok = (cond, name, extra) => {
  if (cond) console.log('  ok  ' + name);
  else { fails++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

// replicate 08_io.js pieces (no DOM deps)
function bidFileBase(bid) {
  const est = (bid.info.estNo || 'NoEst').trim();
  const job = (bid.info.jobName || 'Untitled').trim();
  const clean = (s) => s.replace(/[\\/:*?"<>|]+/g, '-');
  return clean(est + ' ' + job + ' Rev ' + (bid.meta.rev ?? 0));
}
function exportBidJson(bid) {
  return JSON.stringify({ format: 'arctic-bid', schema: bid.schema, exportedAt: new Date().toISOString(), appVersion: 'test', bid }, null, 1);
}
const tryJson = (bytes) => {
  try {
    const obj = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    if (obj && obj.format === 'arctic-bid' && obj.bid) return obj.bid;
    if (obj && obj.meta && obj.info && obj.takeoff) return obj;
  } catch (e) { }
  return null;
};

// ---- validate xref offsets of a built PDF ----
function checkXref(bytes, name) {
  const latin = new TextDecoder('latin1').decode(bytes);
  const sx = latin.lastIndexOf('startxref');
  const xrefPos = parseInt(latin.slice(sx + 9).trim(), 10);
  const tbl = latin.slice(xrefPos);
  const m = tbl.match(/^xref\n0 (\d+)\n/);
  if (!m) { ok(false, name + ': xref header'); return; }
  const n = parseInt(m[1], 10);
  let p = m[0].length;
  let good = true;
  for (let id = 0; id < n; id++) {
    const line = tbl.slice(p, p + 20);
    p += 20;
    if (id === 0) continue;
    const off = parseInt(line.slice(0, 10), 10);
    const at = latin.slice(off, off + String(id).length + 6);
    if (!at.startsWith(id + ' 0 obj')) { good = false; console.log('    bad offset for obj', id, JSON.stringify(at)); }
    if (line.length !== 20) { good = false; console.log('    xref entry not 20 bytes for obj', id, JSON.stringify(line)); }
  }
  ok(good, name + ': xref offsets all point at "N 0 obj"');
}

(async () => {
  console.log('--- A. PDF roundtrip with hostile job name ---');
  const nasty = 'Job )( \\ ) name (unclosed  50% "Q" — café •';
  const bid1 = { schema: 1, meta: { id: 'x1', rev: 3 }, info: { estNo: '25-900', jobName: nasty }, takeoff: { groups: [] } };
  {
    const doc = new PdfDoc();
    doc.addPage(false);
    doc.text(36, 36, nasty, { size: 10, bold: true });
    doc.text(300, 300, ')))(((', { align: 'center' });
    doc.attach('bid.json', exportBidJson(bid1));
    const bytes = doc.build();
    fs.writeFileSync(path.join(OUTDIR, 'out_nasty.pdf'), bytes);
    checkXref(bytes, 'nasty pdf');
    const got = pdfExtractJson(bytes);
    ok(got && got.bid && got.bid.info.jobName === nasty, 'attachment JSON roundtrips exactly', got && got.bid && got.bid.info.jobName);
    // string balance check inside content stream: parens must be escaped
    const latin = new TextDecoder('latin1').decode(bytes);
    const cs = latin.slice(latin.indexOf('BT'), latin.indexOf('ET'));
    let bal = 0, negative = false;
    for (let i = 0; i < cs.length; i++) {
      if (cs[i] === '\\') { i++; continue; }
      if (cs[i] === '(') bal++;
      if (cs[i] === ')') { bal--; if (bal < 0) negative = true; }
    }
    ok(!negative, 'no unbalanced/unescaped parens in content stream');
  }

  console.log('--- B. multiple attachments: foreign JSON first ---');
  {
    const doc = new PdfDoc();
    doc.addPage(false);
    doc.text(36, 36, 'two attachments');
    doc.attach('other.json', JSON.stringify({ some: 'metadata', notABid: true }));
    doc.attach('bid.json', exportBidJson(bid1));
    const bytes = doc.build();
    checkXref(bytes, 'two-att pdf');
    const got = pdfExtractJson(bytes);
    // What does the importer see?
    const isBid = got && got.format === 'arctic-bid' && got.bid;
    console.log('    pdfExtractJson returned:', JSON.stringify(got).slice(0, 80));
    ok(isBid, 'importer finds the arctic-bid attachment when a foreign JSON attachment precedes it');
  }

  console.log('--- C. truncated PDF (JSON stream cut) ---');
  {
    const doc = new PdfDoc();
    doc.addPage(false);
    doc.attach('bid.json', exportBidJson(bid1));
    const bytes = doc.build();
    const latin = new TextDecoder('latin1').decode(bytes);
    const streamAt = latin.indexOf('stream\n', latin.indexOf('/EmbeddedFile'));
    const cut = bytes.slice(0, streamAt + 40); // cut mid-JSON
    let threw = false, got = null;
    try { got = pdfExtractJson(cut); } catch (e) { threw = true; console.log('    threw:', e.message); }
    ok(!threw && got === null, 'truncated PDF returns null (no throw)');
  }

  console.log('--- D. zip roundtrip with unicode + hostile names ---');
  {
    const base = bidFileBase({ meta: { rev: 2 }, info: { estNo: '25-901', jobName: 'Café München — A/B: <phase*2?> "x" | y' } });
    console.log('    bidFileBase =', JSON.stringify(base));
    ok(!/[\\/:*?"<>|]/.test(base), 'bidFileBase strips Windows-illegal chars');
    const files = [
      { name: base + '/bid.json', bytes: new TextEncoder().encode(exportBidJson(bid1)) },
      { name: base + '/' + base + ' - Estimate Recap.pdf', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) },
    ];
    const zip = zipCreate(files);
    fs.writeFileSync(path.join(OUTDIR, 'out_uni.zip'), zip);
    const back = await zipRead(zip);
    ok(back.length === 2 && back[0].name === files[0].name, 'zipRead returns identical unicode names', back.map(e => e.name).join(','));
    const j = back.find(e => e.name.toLowerCase().endsWith('bid.json'));
    ok(j && tryJson(j.bytes), 'bid.json found and parses');
  }

  console.log('--- E. zipRead on system-made deflate zip ---');
  console.log('--- F. zip64 handling ---');
  console.log('    (created externally; see shell steps)');

  console.log('--- G. proposal page overflow: text below page bottom ---');
  {
    const doc = new PdfDoc();
    doc.addPage(false);
    doc.text(54, 800, 'BELOW PAGE'); // yTop beyond 792
    doc.attach('bid.json', '{}');
    const bytes = doc.build();
    const latin = new TextDecoder('latin1').decode(bytes);
    const m = latin.match(/1 0 0 1 54\.00 (-?[\d.]+) Tm \(BELOW PAGE\)/);
    console.log('    Tm y for yTop=800:', m && m[1]);
    ok(m && parseFloat(m[1]) < 0, 'text at yTop>pageH lands at negative y (invisible, no page break)');
  }

  console.log('--- H. proposal render budget with real company texts ---');
  {
    const C = JSON.parse(fs.readFileSync(path.join(BASE, 'company_data.json'), 'utf8'));
    const P = C.proposal;
    // replicate 11_pdf_pages.js proposal layout math
    const w = 612, L = 54;
    let y = 78;
    y += (P.letterhead.slice(1).length) * 13; // center lines at size 9 => size+4
    y += 6 + 19 + 4; // PROPOSAL title
    y += 26 + 26 + 26 + 30 + 8; // field rows + line
    const paraLines = (txt, size) => {
      const words = String(txt || '').split(/\s+/);
      let line = '', n = 0;
      for (const word of words) {
        if (textWidth(line + ' ' + word, size) > w - 2 * L) { n++; line = word; }
        else line = line ? line + ' ' + word : word;
      }
      if (line) n++;
      return n;
    };
    const scopeLines = (chars) => paraLines('word '.repeat(Math.ceil(chars / 5)), 9);
    const fixed = paraLines(P.proposeText, 8.5) * 11.5 + 2 + 14 + 18 + paraLines(P.termsText, 7) * 10 + 8 + 24 + 24;
    console.log('    y before scope =', y, '; fixed tail (propose+terms+amount+signatures) =', Math.round(fixed));
    const room = 792 - y - fixed - 6 - 10;
    console.log('    room left for scope+exclusions =', Math.round(room), 'pt =', Math.floor(room / 12), 'scope lines =', Math.floor(room / 12) * 100, 'chars approx');
    ok(true, 'informational');
  }

  console.log('--- I. importer identity: readImportedFile equivalents ---');
  {
    // .json file that is a bare bid without takeoff -> rejected by json path?
    const bare = { meta: { id: 'z', rev: 0 }, info: { estNo: '1' } };
    ok(tryJson(new TextEncoder().encode(JSON.stringify(bare))) === null, 'bare bid without takeoff rejected by .json path (pdf path would accept it)');
  }

  console.log(fails ? ('*** ' + fails + ' FAILURES ***') : '*** adv_io all pass ***');
  process.exit(0);
})().catch(e => { console.error('UNCAUGHT', e); process.exit(1); });
