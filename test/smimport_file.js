// SM Import: takeoff exports arrive by file (.csv / .txt / .xlsx) as well as paste,
// and both routes go through the same parser.
'use strict';
const { chromium } = require('playwright');
const { seedCompany, INDEX, OUTDIR, WORKBOOK, launchOpts } = require('./_env');
const fs = require('fs');
const path = require('path');

let failures = 0;
const ok = (c, n, x) => { console.log((c ? '✓ ' : '✗ ') + n + (x ? ' — ' + x : '')); if (!c) failures++; };

const ROWS = [
  ['Floor', 'Service', 'Type', 'Material', 'Cut Type', 'Qty', 'Field Hours', 'Shop Hours', 'Material Cost'],
  ['1', 'Supply', 'Rectangular Duct', 'Galv', 'Standard', '250', '40', '18', '5200'],
  ['2', 'Return', 'Round Duct', 'Galv', 'Spiral', '120', '22', '9', '2400'],
  ['3', 'Exhaust', 'Fittings', 'Galv', 'Standard', '75', '15', '6', '1800'],
];

// a minimal .xlsx written by hand — inline strings, no shared strings table
function makeXlsx(rows) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const sheet = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((c, ci) =>
      isNaN(Number(c)) || c === ''
        ? '<c r="' + colName(ci) + (ri + 1) + '" t="inlineStr"><is><t>' + esc(c) + '</t></is></c>'
        : '<c r="' + colName(ci) + (ri + 1) + '"><v>' + c + '</v></c>').join('') + '</row>').join('') +
    '</sheetData></worksheet>';
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Takeoff" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': sheet,
  };
  // stored (uncompressed) zip
  const enc = new TextEncoder();
  const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = crcTable[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunks = [], central = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const nb = enc.encode(name), db = enc.encode(text), crc = crc32(db);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(db.length, 18); lh.writeUInt32LE(db.length, 22); lh.writeUInt16LE(nb.length, 26);
    chunks.push(lh, Buffer.from(nb), Buffer.from(db));
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(db.length, 20); ch.writeUInt32LE(db.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, Buffer.from(nb));
    off += 30 + nb.length + db.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...chunks, cd, end]);
}

// Header rows exactly as the workbook's audit-trail sheets record them
const TSI_HEAD = ['Drawing','Section','Zone','Service','Service Type','Description','Alias','Qty','Specification','Cut Type','Bought Out','Length','Material','Gauge','M-Rate','Fab time','Install time','Insulation','Insul Material','Insul Thickness','Liner Area','Liner Cost','Ext Wrap Area','Ext Wrap Cost','Insul Fab time','Required Date','Job No','Date','Time','Estimate Tables'];
const QP_HEAD = ['Floor','Service Type','Material','Shape','Cut Type','Labor Type','Material Cost','Base Labor Cost','Fringe Cost','Labor Hours','$/hr','Weight','Length','Area','Qty'];

// Two raw TSI rows that belong to ONE group, plus one in another group.
//
// Fab time and Install time are MINUTES in this file — the workbook's pivot defines
// Install Hours = 'Install time'/60. The numbers below are deliberately chosen so a
// missing /60 cannot pass: 480+120 minutes must come out as 10.0 hours, not 600.
// Material cost is Total Material Cost = 'M-Rate' - 'Ext Wrap Cost'.
const tsiRow = (section, service, stype, material, cut, qty, fabMin, installMin, mRate, extWrapCost) => {
  const r = new Array(30).fill('');
  r[1] = section; r[3] = service; r[4] = stype; r[7] = qty; r[9] = cut; r[12] = material;
  r[14] = mRate; r[15] = fabMin; r[16] = installMin; r[23] = extWrapCost;
  return r;
};
const TSI_ROWS = [
  //       section    service   service type        matl    cut         qty  fab  inst  M-Rate  extWrap
  tsiRow('Level 1', 'Supply', 'Rectangular Duct', 'GALV', 'Standard', 100, 240, 480, 900, 100),
  tsiRow('Level 1', 'Supply', 'Rectangular Duct', 'GALV', 'Standard', 50, 120, 120, 400, 50),
  tsiRow('Level 2', 'Return', 'Spiral Straight', 'GALV', 'Standard', 25, 60, 180, 200, 0),
];
const TSI_G1 = { qty: 150, fieldHrs: (480 + 120) / 60, shopHrs: (240 + 120) / 60, mat: (900 - 100) + (400 - 50) };
// QuickPen rows exercising the macro's filters: Field / Shop / N/A / Wrap
const qpRow = (floor, stype, material, shape, cut, labor, matCost, hours, qty) => {
  const r = new Array(15).fill('');
  r[0] = floor; r[1] = stype; r[2] = material; r[3] = shape; r[4] = cut; r[5] = labor;
  r[6] = matCost; r[9] = hours; r[14] = qty;
  return r;
};
const QP_ROWS = [
  qpRow('1', 'Supply', 'GALV', 'Rectangular', 'Standard', 'Field', 500, 12, 200),
  qpRow('1', 'Supply', 'GALV', 'Rectangular', 'Standard', 'Shop', 300, 7, 999),
  qpRow('1', 'Supply', 'GALV', 'Rectangular', 'Standard', 'N/A', 100, 3, 50),
  qpRow('1', 'Supply', '3003H14Aluminum', 'Round', 'Wrap', 'Field', 900, 9, 80),
  // the three fix-ups Import_QP did to the raw rows before pivoting:
  //  - Flex Connector is renamed to Canvas Connector, THEN swapped into Shape
  //  - Hanger is likewise swapped out of Cut Type into Shape
  //  - a blank Material becomes N/A instead of dropping out of the grouping
  qpRow('2', 'Return', 'GALV', 'Round Duct', 'Hanger', 'Field', 40, 2, 10),
  qpRow('2', 'Return', 'GALV', 'Rectangular Duct', 'Flex Connector', 'Field', 60, 3, 5),
  qpRow('2', 'Exhaust', '', 'Round', 'Standard', 'Field', 25, 1, 4),
];
const tsv = (rows) => rows.map(r => r.join('\t')).join('\n');

(async () => {
  const csv = path.join(OUTDIR, 'takeoff_export.csv');
  const xlsx = path.join(OUTDIR, 'takeoff_export.xlsx');
  fs.writeFileSync(csv, ROWS.map(r => r.join(',')).join('\n'));
  fs.writeFileSync(xlsx, makeXlsx(ROWS));

  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await seedCompany(page);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(INDEX);
  await page.waitForSelector('#view');
  await page.click('text=+ New Bid');
  await page.waitForSelector('#topTotal');
  await page.evaluate(() => { location.hash = '#/smimport'; });
  await page.waitForTimeout(400);

  ok(await page.locator('.smi-drop').count() === 1, 'SM Import: drop zone is on the page');

  // ---- CSV ----
  await page.locator('.smi-drop input[type=file]').setInputFiles(csv);
  await page.waitForTimeout(900);
  const afterCsv = await page.evaluate(() => app.bid.smImport.rows.map(r => [r.type, r.qty, r.fieldHoursRaw, r.materialCost]));
  ok(afterCsv.length === 3, 'CSV: three data rows added, header skipped', JSON.stringify(afterCsv.length));
  ok(afterCsv[0][0] === 'Rectangular Duct' && afterCsv[0][1] === 250 && afterCsv[0][2] === 40 && afterCsv[0][3] === 5200,
    'CSV: columns land in the right fields', JSON.stringify(afterCsv[0]));

  // ---- the same rows as a spreadsheet give the same result ----
  await page.evaluate(() => { app.bid.smImport.rows = []; app.touch(); });
  await page.waitForTimeout(400);
  await page.locator('.smi-drop input[type=file]').setInputFiles(xlsx);
  await page.waitForTimeout(1200);
  const afterXlsx = await page.evaluate(() => app.bid.smImport.rows.map(r => [r.type, r.qty, r.fieldHoursRaw, r.materialCost]));
  ok(JSON.stringify(afterXlsx) === JSON.stringify(afterCsv), 'XLSX: same rows as the CSV', JSON.stringify(afterXlsx[0] || null));

  // ---- the hours actually reach the takeoff ----
  const hrs = await page.evaluate(() => app.computed.smImport.totals.fieldHours);
  ok(hrs > 0, 'imported hours feed the engine', String(hrs));

  // ---- dropping the estimate workbook is caught, not mangled ----
  await page.locator('.smi-drop input[type=file]').setInputFiles(WORKBOOK);
  await page.waitForTimeout(2500);
  const toastText = await page.locator('.toast').innerText().catch(() => '');
  const rowsNow = await page.evaluate(() => app.bid.smImport.rows.length);
  ok(/estimate workbook/i.test(toastText), 'estimate workbook is rejected with a useful message', toastText.slice(0, 70));
  ok(rowsNow === afterXlsx.length, 'estimate workbook did not add junk rows', String(rowsNow));

  // ---- paste still works ----
  await page.evaluate(() => { app.bid.smImport.rows = []; app.touch(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { location.hash = '#/smimport'; });
  await page.waitForTimeout(400);
  await page.fill('#view textarea', ROWS.slice(1).map(r => r.join('\t')).join('\n'));
  await page.click('text=Add pasted rows');
  await page.waitForTimeout(700);
  ok(await page.evaluate(() => app.bid.smImport.rows.length) === 3, 'paste still adds rows');

  // ================= raw exports the takeoff software actually writes =================
  const rawQp = path.join(OUTDIR, 'FESTR_QP.txt');
  const rawTsi = path.join(OUTDIR, 'FESTR.txt');
  fs.writeFileSync(rawQp, tsv([QP_HEAD, ...QP_ROWS]));
  fs.writeFileSync(rawTsi, tsv([TSI_HEAD, ...TSI_ROWS]));

  await page.evaluate(() => { app.bid.smImport.rows = []; app.touch(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { location.hash = '#/smimport'; });
  await page.waitForTimeout(400);
  await page.locator('.smi-drop input[type=file]').setInputFiles(rawQp);
  await page.waitForTimeout(1000);
  const qp = await page.evaluate(() => app.bid.smImport.rows.map(r => ({ f: r.floor, s: r.service, t: r.type, m: r.material, c: r.cutType, q: r.qty, fh: r.fieldHoursRaw, sh: r.shopHoursRaw, mc: r.materialCost })));
  ok(qp.length === 4, 'QuickPen raw: rows collapse into their groups (Wrap excluded)', String(qp.length));
  const q1 = qp.find(r => r.f === '1');
  if (q1) {
    ok(q1.t === 'Rectangular' && q1.s === 'Supply', 'QuickPen raw: Floor/Service Type/Shape land in Floor/Service/Type', JSON.stringify([q1.f, q1.s, q1.t]));
    ok(q1.q === 200, 'QuickPen raw: Qty counts Field rows only (not the Shop row)', String(q1.q));
    ok(q1.fh === 12 && q1.sh === 7, 'QuickPen raw: field hours from Field rows, shop hours from Shop rows', JSON.stringify([q1.fh, q1.sh]));
    ok(q1.mc === 800, 'QuickPen raw: material cost skips the N/A row (500+300)', String(q1.mc));
  }
  // the three raw-row fix-ups Import_QP did
  const hanger = qp.find(r => r.t === 'Hanger');
  ok(!!hanger && hanger.c === 'Round Duct', 'QuickPen raw: Hanger swapped out of Cut Type into Shape',
    hanger ? `Shape=${hanger.t} CutType=${hanger.c}` : 'no Hanger row');
  const canvas = qp.find(r => r.t === 'Canvas Connector');
  ok(!!canvas && canvas.c === 'Rectangular Duct', 'QuickPen raw: "Flex Connector" renamed, then swapped',
    canvas ? `Shape=${canvas.t} CutType=${canvas.c}` : 'no Canvas Connector row');
  const noMat = qp.find(r => r.s === 'Exhaust');
  ok(!!noMat && noMat.m === 'N/A', 'QuickPen raw: a blank Material becomes N/A instead of vanishing',
    noMat ? noMat.m : 'row missing');
  // nothing lost, nothing double-counted (Wrap row excluded by the pivot filter)
  const qpTotals = qp.reduce((a, r) => ({ q: a.q + r.q, fh: a.fh + r.fh, sh: a.sh + r.sh, mc: a.mc + r.mc }),
    { q: 0, fh: 0, sh: 0, mc: 0 });
  ok(Math.abs(qpTotals.fh - (12 + 2 + 3 + 1)) < 1e-9 && Math.abs(qpTotals.sh - 7) < 1e-9,
    'QuickPen raw: hours conserved across all groups', JSON.stringify([qpTotals.fh, qpTotals.sh]));

  await page.evaluate(() => { app.bid.smImport.rows = []; app.touch(); });
  await page.waitForTimeout(400);
  await page.locator('.smi-drop input[type=file]').setInputFiles(rawTsi);
  await page.waitForTimeout(1000);
  const tsi = await page.evaluate(() => app.bid.smImport.rows.map(r => ({ f: r.floor, s: r.service, t: r.type, q: r.qty, fh: r.fieldHoursRaw, sh: r.shopHoursRaw, mc: r.materialCost })));
  ok(tsi.length === 2, 'TSI raw: the two matching rows group, the third stays separate', String(tsi.length));
  const g1 = tsi.find(r => r.f === 'Level 1');
  if (g1) {
    ok(g1.q === TSI_G1.qty, 'TSI raw: Qty summed per group', String(g1.q));
    // THE regression guard: the export is in minutes and the pivot divides by 60.
    ok(Math.abs(g1.fh - TSI_G1.fieldHrs) < 1e-9,
      'TSI raw: Install time is MINUTES — 480+120 becomes 10 hours, not 600', `${g1.fh} (want ${TSI_G1.fieldHrs})`);
    ok(Math.abs(g1.sh - TSI_G1.shopHrs) < 1e-9,
      'TSI raw: Fab time is MINUTES too — 240+120 becomes 6 hours, not 360', `${g1.sh} (want ${TSI_G1.shopHrs})`);
    ok(Math.abs(g1.mc - TSI_G1.mat) < 1e-9,
      'TSI raw: material cost = M-Rate - Ext Wrap Cost', `${g1.mc} (want ${TSI_G1.mat})`);
  }
  const g2 = tsi.find(r => r.f === 'Level 2');
  ok(!!g2 && g2.t === 'Decoiled Straight', 'TSI raw: "Spiral Straight" renamed the way the macro did', g2 ? g2.t : 'missing');
  ok(!!g2 && Math.abs(g2.fh - 3) < 1e-9, 'TSI raw: second group converted too — 180 min = 3 hrs', g2 ? String(g2.fh) : 'missing');

  // an export that lost its header row still imports, by shape
  const headless = path.join(OUTDIR, 'FESTR_noheader.txt');
  fs.writeFileSync(headless, tsv(TSI_ROWS));
  await page.evaluate(() => { app.bid.smImport.rows = []; app.touch(); });
  await page.waitForTimeout(400);
  await page.locator('.smi-drop input[type=file]').setInputFiles(headless);
  await page.waitForTimeout(1000);
  ok(await page.evaluate(() => app.bid.smImport.rows.length) === 2,
    'a TSI export with no header row is still recognised, by its shape');

  // a wide file we cannot place is refused, not silently imported as junk
  const junk = path.join(OUTDIR, 'not_an_export.csv');
  fs.writeFileSync(junk, ['a,b,c,d,e,f,g,h,i,j,k,l', '1,2,3,4,5,6,7,8,9,10,11,12'].join('\n'));
  await page.evaluate(() => { app.bid.smImport.rows = []; app.touch(); });
  await page.waitForTimeout(400);
  await page.locator('.smi-drop input[type=file]').setInputFiles(junk);
  await page.waitForTimeout(900);
  ok(await page.evaluate(() => app.bid.smImport.rows.length) === 0, 'a file we cannot place adds NO rows');
  ok(/does not look like a takeoff export/i.test(await page.locator('body').innerText()),
    'a file we cannot place says what it was looking for');

  // a renamed export still works — detection is by header, not file name
  const renamed = path.join(OUTDIR, 'whatever.csv');
  fs.writeFileSync(renamed, [QP_HEAD, ...QP_ROWS].map(r => r.join(',')).join('\n'));
  await page.evaluate(() => { app.bid.smImport.rows = []; app.touch(); });
  await page.waitForTimeout(400);
  await page.locator('.smi-drop input[type=file]').setInputFiles(renamed);
  await page.waitForTimeout(1000);
  ok(await page.evaluate(() => app.bid.smImport.rows.length) === 4, 'renamed comma-separated export is still recognised');

  ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(failures ? `\nFAILURES: ${failures}` : '\n*** SM IMPORT FILE ALL PASS ***');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('crashed:', e); process.exit(2); });
