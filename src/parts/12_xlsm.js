// ============================================================
// Spreadsheet export/import — the ORIGINAL .xlsm as template.
// Export: inject this bid's inputs into a genuine copy of the workbook
// (macros, formatting, formulas, protection all untouched); Excel
// recalculates on open. Import: read those same cells back — works for
// files we exported AND for original workbooks never touched by the site.
// ============================================================
'use strict';

// ---------- template access ----------
const XLSM_SHEET_FILE = {
  'Booking CSV': 'sheet1', 'Pivot': 'sheet2', 'QP SM Audit Trail': 'sheet3', 'SM Audit Trail': 'sheet4',
  'Phase Codes': 'sheet5', 'SM Schedule': 'sheet6', 'Work Recovery': 'sheet7', 'EMO': 'sheet8',
  'Permits': 'sheet9', 'OCIP': 'sheet10', 'Bond': 'sheet11', 'Breakdown': 'sheet12', 'Takeoff Notes': 'sheet13',
  'SM Import': 'sheet14', 'Crew Mix': 'sheet15', 'TakeOff': 'sheet16', 'MCAA RECAP': 'sheet17',
  'Proposal': 'sheet18', 'Price Breakdown': 'sheet19', 'Booking Report': 'sheet20', 'Macros': 'sheet21',
};

let _templateParts = null;   // [{name, bytes}] in original order
async function templateParts() {
  if (_templateParts) return _templateParts;
  if (!TEMPLATE_BYTES) throw new Error('the estimate workbook is not loaded — reload the company file from Company Settings');
  _templateParts = await zipRead(TEMPLATE_BYTES);
  return _templateParts;
}

// ---------- XML cell surgery (mirror of the validated Python xlsx_edit) ----------
function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function xmlUnescape(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
}
function colToNum(col) { let n = 0; for (const ch of col) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
function splitAddr(a) { const m = /^([A-Z]+)(\d+)$/.exec(a); return [m[1], +m[2]]; }

function xlsmFindCell(xml, addr) {
  let re = new RegExp('<c r="' + addr + '"([^>]*?)/>');
  let m = re.exec(xml);
  if (!m) {
    re = new RegExp('<c r="' + addr + '"([^>]*?)>[\\s\\S]*?</c>');
    m = re.exec(xml);
  }
  if (!m) return null;
  const st = /s="(\d+)"/.exec(m[1]);
  return { start: m.index, end: m.index + m[0].length, style: st ? st[1] : null, node: m[0] };
}
function xlsmMakeCell(addr, value, style, isBool) {
  const s = style ? ' s="' + style + '"' : '';
  if (value === null || value === undefined || value === '') return '<c r="' + addr + '"' + s + '/>';
  if (value && typeof value === 'object' && value.f) {
    // user-typed formula (e.g. "=20916+28200"); Excel computes it on open (fullCalcOnLoad)
    return '<c r="' + addr + '"' + s + '><f>' + xmlEscape(value.f.replace(/^=/, '')) + '</f></c>';
  }
  if (isBool || typeof value === 'boolean') return '<c r="' + addr + '"' + s + ' t="b"><v>' + (value ? 1 : 0) + '</v></c>';
  if (typeof value === 'number') return '<c r="' + addr + '"' + s + '><v>' + value + '</v></c>';
  return '<c r="' + addr + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>';
}
function xlsmGetFormula(xml, addr) {
  const found = xlsmFindCell(xml, addr);
  return found ? xlsmNodeFormula(found.node) : null;
}
function xlsmNodeFormula(node) {
  if (!node) return null;
  const m = /<f[^>]*>([\s\S]*?)<\/f>/.exec(node);
  return m ? xmlUnescape(m[1]) : null;
}
// One pass over a sheet builds addr -> cell node. Reading a workbook touches tens
// of thousands of cells; scanning the whole sheet per cell made that quadratic
// (21s for this workbook) and froze the tab.
function xlsmIndexCells(xml) {
  const map = new Map();
  const re = /<c r="([A-Z]+\d+)"(?:[^>]*?\/>|[^>]*?>[\s\S]*?<\/c>)/g;
  let m;
  while ((m = re.exec(xml))) map.set(m[1], m[0]);
  return map;
}
function xlsmSetCell(xml, addr, value, isBool) {
  const [col, row] = splitAddr(addr);
  const found = xlsmFindCell(xml, addr);
  const node = xlsmMakeCell(addr, value, found ? found.style : null, isBool);
  if (found) return xml.slice(0, found.start) + node + xml.slice(found.end);
  // cell absent: insert into row (create row if needed)
  const rowRe = new RegExp('<row r="' + row + '"([^>]*?)(/>|>)');
  const rm = rowRe.exec(xml);
  if (!rm) {
    const newrow = '<row r="' + row + '">' + node + '</row>';
    let insertPos = xml.indexOf('</sheetData>');
    const rowIter = /<row r="(\d+)"/g;
    let rmatch;
    while ((rmatch = rowIter.exec(xml))) {
      if (+rmatch[1] > row) { insertPos = rmatch.index; break; }
    }
    return xml.slice(0, insertPos) + newrow + xml.slice(insertPos);
  }
  if (rm[2] === '/>') {
    const rowtag = rm[0].slice(0, -2) + '>';
    return xml.slice(0, rm.index) + rowtag + node + '</row>' + xml.slice(rm.index + rm[0].length);
  }
  const rowStart = rm.index + rm[0].length;
  const rowEnd = xml.indexOf('</row>', rowStart);
  const body = xml.slice(rowStart, rowEnd);
  const target = colToNum(col);
  let insertAt = body.length;
  const cellIter = /<c r="([A-Z]+)\d+"/g;
  let cm;
  while ((cm = cellIter.exec(body))) {
    if (colToNum(cm[1]) > target) { insertAt = cm.index; break; }
  }
  return xml.slice(0, rowStart) + body.slice(0, insertAt) + node + body.slice(insertAt) + xml.slice(rowEnd);
}
function xlsmGetCell(xml, addr, shared) {
  const found = xlsmFindCell(xml, addr);
  return found ? xlsmNodeValue(found.node, shared) : null;
}
function xlsmNodeValue(node, shared) {
  if (!node) return null;
  const t = /\bt="([^"]+)"/.exec(node);
  const typ = t ? t[1] : null;
  if (typ === 'inlineStr') {
    const m = /<t[^>]*>([\s\S]*?)<\/t>/.exec(node);
    return m ? xmlUnescape(m[1]) : null;
  }
  const v = /<v>([\s\S]*?)<\/v>/.exec(node);
  if (!v) return null;
  const raw = v[1];
  if (typ === 's') return shared[+raw];
  if (typ === 'b') return raw === '1';
  if (typ === 'str') return xmlUnescape(raw);
  const f = Number(raw);
  return isFinite(f) ? f : xmlUnescape(raw);
}
function xlsmSharedStrings(parts) {
  const p = parts.find(x => x.name === 'xl/sharedStrings.xml');
  if (!p) return [];
  const xml = new TextDecoder().decode(p.bytes);
  const out = [];
  const si = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = si.exec(xml))) {
    let text = '';
    const tIter = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    while ((tm = tIter.exec(m[1]))) text += xmlUnescape(tm[1]);
    out.push(text);
  }
  return out;
}

// ---------- workbook wrapper ----------
class XlsmDoc {
  constructor(parts) {
    this.order = parts.map(p => p.name);
    this.parts = new Map(parts.map(p => [p.name, p.bytes]));
    this.shared = xlsmSharedStrings(parts);
    this.xml = {};
  }
  _path(t) { return 'xl/worksheets/' + XLSM_SHEET_FILE[t] + '.xml'; }
  sheet(t) {
    if (!(t in this.xml)) this.xml[t] = new TextDecoder().decode(this.parts.get(this._path(t)));
    return this.xml[t];
  }
  _index(t) {
    this._flush(t);
    if (!this.idx) this.idx = {};
    if (!this.idx[t]) this.idx[t] = xlsmIndexCells(this.sheet(t));
    return this.idx[t];
  }
  // Writes are buffered and applied in ONE rebuild per sheet. Injecting a bid sets
  // ~22,000 cells; doing each as its own scan-and-splice of a 1MB string took 26s
  // and froze the tab.
  set(t, addr, value, isBool) {
    if (!this.pend) this.pend = {};
    (this.pend[t] = this.pend[t] || new Map()).set(addr, { value, isBool });
  }
  _flush(t) {
    const w = this.pend && this.pend[t];
    if (!w || !w.size) return;
    delete this.pend[t];
    if (this.idx) delete this.idx[t];
    const xml = this.sheet(t);
    const pos = new Map();
    const re = /<c r="([A-Z]+\d+)"(?:[^>]*?\/>|[^>]*?>[\s\S]*?<\/c>)/g;
    let m;
    while ((m = re.exec(xml))) pos.set(m[1], { start: m.index, end: re.lastIndex, node: m[0] });
    const edits = [], missing = [];
    for (const [addr, v] of w) {
      const hit = pos.get(addr);
      if (hit) {
        const st = /s="(\d+)"/.exec(hit.node.slice(0, hit.node.indexOf('>')));
        edits.push({ start: hit.start, end: hit.end, text: xlsmMakeCell(addr, v.value, st ? st[1] : null, v.isBool) });
      } else if (v.value !== null && v.value !== undefined && v.value !== '') {
        missing.push([addr, v]);                 // cell absent from the template: rare
      }                                          // blanking an absent cell is a no-op
    }
    edits.sort((a, b) => a.start - b.start);
    let out = '', cur = 0;
    for (const e of edits) { out += xml.slice(cur, e.start) + e.text; cur = e.end; }
    this.xml[t] = out + xml.slice(cur);
    for (const [addr, v] of missing) this.xml[t] = xlsmSetCell(this.xml[t], addr, v.value, v.isBool);
  }
  flushAll() { for (const t of Object.keys(this.pend || {})) this._flush(t); }
  get(t, addr) { return xlsmNodeValue(this._index(t).get(addr), this.shared); }
  getF(t, addr) { return xlsmNodeFormula(this._index(t).get(addr)); }
  forceRecalc() {
    let wb = new TextDecoder().decode(this.parts.get('xl/workbook.xml'));
    wb = wb.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191028" fullCalcOnLoad="1"/>');
    this.parts.set('xl/workbook.xml', new TextEncoder().encode(wb));
    this.parts.delete('xl/calcChain.xml');
    let ct = new TextDecoder().decode(this.parts.get('[Content_Types].xml'));
    ct = ct.replace('<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/>', '');
    this.parts.set('[Content_Types].xml', new TextEncoder().encode(ct));
  }
  async build() {
    this.flushAll();
    const enc = new TextEncoder();
    for (const [t, xml] of Object.entries(this.xml)) this.parts.set(this._path(t), enc.encode(xml));
    const files = this.order.filter(n => this.parts.has(n)).map(n => ({ name: n, bytes: this.parts.get(n) }));
    return await zipCreateDeflate(files);
  }
}

// DEFLATE-capable zip writer (falls back to STORE without CompressionStream)
async function zipCreateDeflate(files) {
  if (typeof CompressionStream === 'undefined') return zipCreate(files);
  const out = [];
  for (const f of files) {
    const cs = new CompressionStream('deflate-raw');
    const buf = await new Response(new Blob([f.bytes]).stream().pipeThrough(cs)).arrayBuffer();
    out.push({ name: f.name, bytes: f.bytes, comp: new Uint8Array(buf) });
  }
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (b) => { chunks.push(b); offset += b.length; };
  const u16 = (v) => new Uint8Array([v & 255, (v >> 8) & 255]);
  const u32 = (v) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
  for (const f of out) {
    const nameB = enc.encode(f.name);
    const crc = crc32(f.bytes);
    const local = offset;
    push(new Uint8Array([0x50, 0x4B, 0x03, 0x04])); push(u16(20)); push(u16(0x0800)); push(u16(8));
    push(u16(0)); push(u16(0x5821)); push(u32(crc)); push(u32(f.comp.length)); push(u32(f.bytes.length));
    push(u16(nameB.length)); push(u16(0)); push(nameB); push(f.comp);
    central.push({ nameB, crc, csize: f.comp.length, usize: f.bytes.length, local });
  }
  const cdStart = offset;
  for (const c of central) {
    push(new Uint8Array([0x50, 0x4B, 0x01, 0x02])); push(u16(20)); push(u16(20)); push(u16(0x0800)); push(u16(8));
    push(u16(0)); push(u16(0x5821)); push(u32(c.crc)); push(u32(c.csize)); push(u32(c.usize));
    push(u16(c.nameB.length)); push(u16(0)); push(u16(0)); push(u16(0)); push(u16(0)); push(u32(0)); push(u32(c.local)); push(c.nameB);
  }
  const cdSize = offset - cdStart;
  push(new Uint8Array([0x50, 0x4B, 0x05, 0x06])); push(u16(0)); push(u16(0)); push(u16(central.length)); push(u16(central.length));
  push(u32(cdSize)); push(u32(cdStart)); push(u16(0));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const outB = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { outB.set(c, o); o += c.length; }
  return outB;
}

// ---------- inject (bid -> workbook) — mirror of validated inject.py ----------
const XLSM_NUM = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v); return isFinite(n) ? n : null;
};
// Every user-input cell the export clears before injecting the bid.
function* xlsmBlankCells() {
  for (const [title, cells] of Object.entries(COMPANY.xlsmBlank)) {
    for (const addr of cells) yield [title, addr];
  }
  for (const tg of COMPANY.takeoffGroupRows) {
    yield ['TakeOff', 'F' + tg.headerRow];
    yield ['TakeOff', 'K' + tg.headerRow];
    yield ['TakeOff', 'D' + (tg.headerRow + 2)];
    for (let row = tg.itemsStart; row <= tg.itemsEnd; row++) {
      for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'J', 'L', 'N', 'P', 'Q', 'R']) yield ['TakeOff', col + row];
    }
  }
  yield ['TakeOff', 'F9'];
  for (let rr = 9; rr <= 80; rr++) for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'K']) yield ['SM Import', col + rr];
  for (const row of [4, 6, 8, 10, 12]) { yield ['Work Recovery', 'D' + row]; yield ['Work Recovery', 'F' + row]; }
  // per-bid custom phase-code slots from the template job
  for (const addr of COMPANY.phaseCustomSlots) yield ['Phase Codes', addr];
  // proposal quick-list marks — both picker columns drive the D39 concat formula
  for (let rr = 17; rr <= 34; rr++) { yield ['Proposal', 'W' + rr]; yield ['Proposal', 'Z' + rr]; }
}
// The workbook's D39 exclusions formula tests Z18:Z34 and skips Z17, so its
// first second-picker item is unselectable in Excel. Insert the missing term
// right after the W/X run. Called ONLY when that item is picked, so every other
// export keeps the original formula exactly.
function xlsmPatchD39(doc) {
  const f = doc.getF('Proposal', 'D39');
  if (!f || /Z17=/.test(f)) return;
  const m = /IF\(Z18="","",", "&AA18\)/.exec(f);
  if (!m) return;                                  // unrecognised template: leave it alone
  const patched = f.slice(0, m.index) + 'IF(Z17="","",", "&AA17)&' + f.slice(m.index);
  doc.set('Proposal', 'D39', { f: '=' + patched });
}

function xlsmBlankAll(doc) {
  for (const [title, addr] of xlsmBlankCells()) doc.set(title, addr, null);
}

function excelSerial(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d)) return null;
  return Math.round((d.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
}
function fromExcelSerial(n) {
  if (n == null || !isFinite(n)) return '';
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

function xlsmInject(doc, bid) {
  const r = bid.recap, info = bid.info, num = XLSM_NUM;
  xlsmBlankAll(doc);
  const S = 'MCAA RECAP';
  doc.set(S, 'B7', info.estNo || null);
  doc.set(S, 'H6', info.jobName || null);
  doc.set(S, 'H7', info.location || null);
  doc.set(S, 'N5', info.projectType || null);
  doc.set(S, 'N6', num(info.projectSqFt));
  doc.set(S, 'N7', num(info.materialLbs));
  doc.set(S, 'C17', r.scheduleType);
  doc.set(S, 'O21', num(r.lop58) || 0);
  doc.set(S, 'B26', r.ocipToggle);
  doc.set(S, 'D27', num(r.archHrsInSM) || 0);
  doc.set(S, 'A66', r.bondRequired);
  doc.set(S, 'E68', r.taxType);
  doc.set(S, 'G60', num(r.subMarkup));
  doc.set(S, 'G61', num(r.equipMarkup));
  doc.set(S, 'G62', num(r.ohp));
  doc.set(S, 'H65', num(r.miscContingency));
  doc.set(S, 'I69', num(r.addDeduct));
  for (let i = 0; i < 5; i++) {
    doc.set(S, 'B' + (12 + i), num(r.mods.plumb[i]));
    doc.set(S, 'C' + (12 + i), num(r.mods.pipe[i]));
    doc.set(S, 'D' + (12 + i), num(r.mods.sm[i]));
    doc.set(S, 'I' + (12 + i), num(r.mods.shop[i]));
  }
  doc.set(S, 'I17', num(r.mods.shop[5]));
  for (let i = 0; i < 5; i++) doc.set(S, 'E' + (48 + i), num(r.supPct[i]));
  if (r.subs.length) {
    doc.set(S, 'J36', num(r.subs[0].value));
    doc.set(S, 'I36', r.subs[0].qp || null);
  }
  for (let k = 1; k < Math.min(r.subs.length, 9); k++) {
    doc.set(S, 'B' + (36 + k), r.subs[k].name || null);
    doc.set(S, 'I' + (36 + k), r.subs[k].qp || null);
    doc.set(S, 'J' + (36 + k), num(r.subs[k].value));
  }
  doc.set(S, 'G78', num(r.gc.safetyPct));
  doc.set(S, 'G79', num(r.gc.smallToolsPct));
  doc.set(S, 'G80', num(r.gc.freightPct));
  doc.set(S, 'G106', num(r.gc.miscPct));
  doc.set(S, 'E81', num(r.trucking.hrs));
  doc.set(S, 'F81', num(r.trucking.loads));
  if (r.trucking.rate != null) doc.set(S, 'G81', num(r.trucking.rate));
  const pmRows = [['plumbing', 77, 'Plumbing'], ['hvac', 78, 'HVAC'], ['medGas', 79, 'Med Gas'], ['boiler', 80, 'Boiler'], ['specialInsp', 81, 'Special Insp']];
  for (const [key, row, lbl] of pmRows) { doc.set(S, 'I' + row, lbl); doc.set(S, 'J' + row, num(r.permitsManual[key])); }
  COMPANY.gcRows.forEach((gr, i) => {
    const row = 82 + i;
    const rowdata = (r.gc.rows || {})[gr.key] || {};
    if (gr.key === 'cadOperator') {
      doc.set(S, 'D102', num(rowdata.qty));
      doc.set(S, 'E102', num(rowdata.dur));
    } else {
      doc.set(S, 'F' + row, num(rowdata.qty));
    }
    if (rowdata.rate != null) doc.set(S, 'G' + row, num(rowdata.rate));
    if (gr.editableLabel) {
      const lbl = (r.gc.labels || {})[gr.key] || gr.label;
      if (lbl) doc.set(S, 'B' + row, lbl);
    }
  });
  r.equipment.forEach((e, i) => {
    const row = 114 + i;
    if (row > 129) return;
    doc.set(S, 'G' + row, num(e.qty));
    doc.set(S, 'H' + row, num(e.dur));
    if (e.rate != null) doc.set(S, 'I' + row, num(e.rate));
  });
  (r.equipmentNames || []).forEach((nm, i) => {
    if (nm && 114 + i >= 127 && 114 + i <= 129) doc.set(S, 'B' + (114 + i), nm);
  });

  const C = 'Crew Mix', cm = bid.crewMix;
  const secDefaults = (typeof app !== 'undefined' && app && app.settings ? app.settings.crew.sections : COMPANY.crew.sections);
  cm.smField.qty.forEach((q, i) => doc.set(C, 'C' + (11 + i), num(q)));    // null stays blank, 0 stays 0
  cm.smShop.qty.forEach((q, i) => doc.set(C, 'C' + (74 + i), num(q)));
  cm.plumberFitter.qty.forEach((q, i) => doc.set(C, 'C' + (137 + i), num(q)));
  doc.set(C, 'H9', cm.smField.pfST != null ? num(cm.smField.pfST) : secDefaults.smField.periodFactor);
  // H72 ships as an inheritance formula (=$H$9); keep it unless overridden
  if (cm.smShop.pfST != null) doc.set(C, 'H72', num(cm.smShop.pfST));
  else doc.set(C, 'H72', { f: '=$H$9' });
  doc.set(C, 'H135', cm.plumberFitter.pfST != null ? num(cm.plumberFitter.pfST) : secDefaults.plumberFitter.periodFactor);
  const pfCells = [['smField', 'H30', 'H51'], ['smShop', 'H93', 'H114'], ['plumberFitter', 'H155', 'H175']];
  for (const [sec, otc, dtc] of pfCells) {
    if (cm[sec].pfOT != null) doc.set(C, otc, num(cm[sec].pfOT));
    if (cm[sec].pfDT != null) doc.set(C, dtc, num(cm[sec].pfDT));
  }
  doc.set(C, 'I85', cm.smShop.burdenST != null ? num(cm.smShop.burdenST) : secDefaults.smShop.shopBurden);
  if (cm.smShop.burdenOT != null) doc.set(C, 'I106', num(cm.smShop.burdenOT));
  if (cm.smShop.burdenDT != null) doc.set(C, 'I127', num(cm.smShop.burdenDT));

  const T = 'TakeOff';
  doc.set(T, 'F9', bid.takeoff.caeType || null);
  bid.takeoff.groups.forEach((g, gi) => {
    if (gi >= COMPANY.takeoffGroupRows.length) return;
    const tg = COMPANY.takeoffGroupRows[gi];
    doc.set(T, 'F' + tg.headerRow, g.type || null);
    doc.set(T, 'K' + tg.headerRow, !!g.exclude, true);
    doc.set(T, 'D' + (tg.headerRow + 2), g.name || null);
    let nextFree = tg.itemsStart;
    const used = new Set();
    g.items.forEach((it, ii) => {
      let row;
      if (it.rowOffset != null && tg.itemsStart + it.rowOffset <= tg.itemsEnd && !used.has(tg.itemsStart + it.rowOffset)) {
        row = tg.itemsStart + it.rowOffset;          // keep the workbook's original row position
      } else {
        while (used.has(nextFree)) nextFree++;
        row = nextFree;
      }
      used.add(row); if (row >= nextFree) nextFree = row + 1;
      if (row > tg.itemsEnd) return;
      doc.set(T, 'A' + row, it.matPhase || null);
      doc.set(T, 'B' + row, it.shopPhase || null);
      doc.set(T, 'C' + row, it.fieldPhase || null);
      doc.set(T, 'D' + row, it.desc || null);
      doc.set(T, 'E' + row, num(it.qty));
      doc.set(T, 'F' + row, num(it.fUnit));
      if (it.fMult !== '' && it.fMult != null) doc.set(T, 'G' + row, num(it.fMult));
      doc.set(T, 'I' + row, num(it.sUnit));
      if (it.sMult !== '' && it.sMult != null) doc.set(T, 'J' + row, num(it.sMult));
      // preserve typed arithmetic ("=80730+250") exactly as the workbook stores it
      if (it.mUnitExpr) doc.set(T, 'L' + row, { f: it.mUnitExpr });
      else doc.set(T, 'L' + row, num(it.mUnit));
      doc.set(T, 'N' + row, it.notes || null);
      doc.set(T, 'P' + row, it.emo || null);
      doc.set(T, 'Q' + row, it.ot || null);
      doc.set(T, 'R' + row, it.shift || null);
    });
  });

  const SI = 'SM Import';
  bid.smImport.rows.forEach((row, i) => {
    const rr = 9 + i;
    if (rr > 80) return;
    doc.set(SI, 'A' + rr, row.floor || null);
    doc.set(SI, 'B' + rr, row.service || null);
    doc.set(SI, 'C' + rr, row.type || null);
    doc.set(SI, 'D' + rr, row.material || null);
    doc.set(SI, 'E' + rr, row.cutType || null);
    doc.set(SI, 'F' + rr, num(row.qty));
    doc.set(SI, 'G' + rr, num(row.fieldHoursRaw));
    doc.set(SI, 'I' + rr, num(row.shopHoursRaw));
    doc.set(SI, 'K' + rr, num(row.materialCost));
    doc.set(SI, 'L' + rr, row.fieldPct !== '' && row.fieldPct != null ? num(row.fieldPct) : 1);
    doc.set(SI, 'N' + rr, row.shopPct !== '' && row.shopPct != null ? num(row.shopPct) : 1);
  });

  const wrMap = [['smField', 4], ['smShop', 6], ['arch', 8], ['plumber', 10], ['fitter', 12]];
  for (const [key, row] of wrMap) {
    const w = (bid.workRecovery || {})[key] || {};
    if (w.rate != null) doc.set('Work Recovery', 'D' + row, num(w.rate));
    if (w.maxHrs != null) doc.set('Work Recovery', 'F' + row, num(w.maxHrs));
  }

  const P = 'Permits';
  const selMap = { none: 5, portland: 1, hillsboro: 2, clackamas: 3, custom: 4, tualatin: 6 };
  doc.set(P, 'R1', selMap[bid.permitCalc.selection] ?? 5);
  bid.permitCalc.custom.tiers.forEach((t, i) => {
    const rr = 25 + i;
    if (i > 0) doc.set(P, 'K' + rr, num(t.min));
    doc.set(P, 'L' + rr, num(t.max));
    doc.set(P, 'M' + rr, num(t.fee));
    doc.set(P, 'N' + rr, num(t.inc));
  });
  doc.set(P, 'P33', num(bid.permitCalc.custom.planReviewPct));
  doc.set(P, 'P35', num(bid.permitCalc.custom.markupPct));

  // stored-total snapshot (Ctrl+T cells)
  if (r.storedTotal != null) doc.set(S, 'N70', num(r.storedTotal));

  // Takeoff Notes rows 7-46: C service, D desc, E Y / F N marks, G est, H strategy, I rfi;
  // B column keeps its 1..40 numbering exactly as the original displays it.
  for (let i = 0; i < 40; i++) doc.set('Takeoff Notes', 'B' + (7 + i), i + 1);
  (bid.notes || []).forEach((nt, i) => {
    const rr = 7 + i;
    if (rr > 46) return;
    doc.set('Takeoff Notes', 'C' + rr, nt.service || null);
    doc.set('Takeoff Notes', 'D' + rr, nt.desc || null);
    doc.set('Takeoff Notes', 'E' + rr, nt.impact === 'Y' ? 'X' : null);
    doc.set('Takeoff Notes', 'F' + rr, nt.impact === 'N' ? 'X' : null);
    doc.set('Takeoff Notes', 'G' + rr, num(nt.est));
    doc.set('Takeoff Notes', 'H' + rr, nt.strategy || null);
    doc.set('Takeoff Notes', 'I' + rr, nt.rfi || null);
  });

  // MCAA notes cells (L65/L66/L68/L106)
  const rn = r.mcaaNotes || {};
  doc.set(S, 'L65', rn.misc || null);
  doc.set(S, 'L66', rn.bond || null);
  doc.set(S, 'L68', rn.tax || null);
  doc.set(S, 'L106', rn.gcMisc || null);
  // defaults panels (R/S/T 12-16, N48:N52) — company factory values, as the sheet ships
  const dm = (typeof app !== 'undefined' && app && app.settings ? app.settings.recap : COMPANY.recap);
  for (let i = 0; i < 5; i++) {
    doc.set(S, 'R' + (12 + i), num(dm.defaultMods.plumb[i]));
    doc.set(S, 'S' + (12 + i), num(dm.defaultMods.pipe[i]));
    doc.set(S, 'T' + (12 + i), num(dm.defaultMods.sm[i]));
    doc.set(S, 'N' + (48 + i), num(dm.defaultSupPct[i]));
  }
  // legacy link cells the sheet ships with
  doc.set(S, 'K25', 1); doc.set(S, 'K26', 2); doc.set(S, 'K60', 2); doc.set(S, 'A66', r.bondRequired);

  // Proposal: scope paragraph + quick-list marks (X labels/library stay template)
  doc.set('Proposal', 'B17', bid.proposal.scope || null);
  const picker = (COMPANY.proposal.exclusionPicker || []);
  (bid.proposal.exclusionsPicked || []).forEach(name => {
    const idx = picker.indexOf(name);
    if (idx >= 0) doc.set('Proposal', 'W' + (17 + idx), 'X');
  });
  // Second picker (Z/AA). The sheet's own D39 formula tests Z18:Z34 but NOT Z17,
  // so its first item can never be selected in Excel. We mark Z17 anyway and, only
  // if that item is actually picked, add the missing term to D39 — leaving the
  // formula untouched for every other bid so exports stay byte-faithful.
  const picker2 = (COMPANY.proposal.inclusionOptions || []);
  let needsZ17 = false;
  (bid.proposal.inclusionsPicked || []).forEach(name => {
    const idx = picker2.indexOf(name);
    if (idx < 0) return;
    doc.set('Proposal', 'Z' + (17 + idx), 'X');
    if (idx === 0) needsZ17 = true;
  });
  if (needsZ17) xlsmPatchD39(doc);

  // OCIP form state
  const of = bid.ocipForm || {};
  doc.set('OCIP', 'Y18', num(of.applicantType) || 1);
  doc.set('OCIP', 'Y50', num(of.contractWith) || 3);
  doc.set('OCIP', 'Y54', num(of.subcontractWork) || 1);
  doc.set('OCIP', 'Y123', num(of.bidType) || 1);
  doc.set('OCIP', 'Y130', num(of.contractType) || 2);
  doc.set('OCIP', 'Y157', num(of.combinedRate) || 1);
  doc.set('OCIP', 'M8', of.bidPackageNo || 'XXXXXXXXXX');
  doc.set('OCIP', 'D124', 'O');
  if (of.bidPackageName) doc.set('OCIP', 'E8', of.bidPackageName);

  // SM Schedule: PM, alternate start, tasks (packages beyond the 19 blocks are dropped)
  const sched = bid.schedule || {};
  doc.set('SM Schedule', 'A2', sched.pm ? 'PROJECT MANAGER: ' + sched.pm : 'PROJECT MANAGER:');
  doc.set('SM Schedule', 'M1', excelSerial(sched.altStart));
  (sched.packages || []).forEach((p, pi) => {
    if (pi >= 19) return;
    const base = 4 + pi * 11;
    (p.tasks || []).forEach((t, ti) => {
      if (ti >= 10) return;
      const row = base + 1 + ti;
      doc.set('SM Schedule', 'C' + row, t.desc || null);
      doc.set('SM Schedule', 'D' + row, num(t.manpower));
      doc.set('SM Schedule', 'E' + row, excelSerial(t.start));
      doc.set('SM Schedule', 'F' + row, excelSerial(t.finish));
      doc.set('SM Schedule', 'G' + row, t.status || null);
      doc.set('SM Schedule', 'H' + row, excelSerial(t.actualFinish));
      doc.set('SM Schedule', 'I' + row, t.notes || null);
    });
  });

  // Booking Report header + custom phase code descriptions into Phase Codes matrix
  const B = 'Booking Report';
  doc.set(B, 'F2', info.jobNumber || null);
  doc.set(B, 'C5', info.address || null);
  doc.set(B, 'C6', info.city || null);
  doc.set(B, 'D6', info.state || null);
  doc.set(B, 'E6', info.zip || null);
  doc.set(B, 'C10', bid.booking.certifiedPayroll === 'Yes' ? 1 : 2);
  doc.set(B, 'B16', bid.booking.bookingType === 'Original' ? 1 : 2);
  doc.set(B, 'G8', bid.booking.contract || null);
  const divCols = { 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F', 6: 'G', 7: 'H', 8: 'I' };
  for (const [code, descr] of Object.entries(bid.phaseCustom || {})) {
    const m = /^(\d)-(\d\d)$/.exec(code);
    if (!m || !descr) continue;
    doc.set('Phase Codes', divCols[m[1]] + (3 + +m[2]), descr);
  }
  // stray whitespace-only strings carried from an imported workbook (see xlsmReadBid)
  for (const [t, cells] of Object.entries(bid.xlsmSpaces || {})) {
    for (const [a, v] of Object.entries(cells)) if (doc.get(t, a) == null) doc.set(t, a, v);
  }
}

async function exportXlsm() {
  try { app.saveNow(); } catch (e) { }
  const pr = progressStart('Building spreadsheet');
  try {
    await pr.step(0.15, 'Opening the workbook template');
    const parts = await templateParts();
    const doc = new XlsmDoc(parts.map(p => ({ name: p.name, bytes: p.bytes })));
    await pr.step(0.4, 'Filling in this bid');
    xlsmInject(doc, app.bid);
    doc.forceRecalc();
    await pr.step(0.65, 'Writing the sheets');
    const bytes = await doc.build();
    await pr.step(1, 'Saving');
    downloadBytes(bidFileBase(app.bid) + '.xlsm', bytes, 'application/vnd.ms-excel.sheet.macroEnabled.12');
    toast('Exported ' + bidFileBase(app.bid) + '.xlsm — opens in Excel exactly like the original workbook');
  } finally { pr.done(); }
}

// ---------- read (workbook -> bid) — mirror of validated read_bid.py ----------
function xlsmReadBid(doc) {
  const g = (t, a) => doc.get(t, a);
  const s = (v) => v == null ? '' : String(v);
  const n = (v) => (v == null || v === '' || typeof v === 'boolean' || (typeof v === 'string' && v.trim() === '')) ? null : (isFinite(Number(v)) ? Number(v) : null);
  const S = 'MCAA RECAP';
  const bid = makeNewBid(effectiveSettings());
  bid.info.estNo = s(g(S, 'B7'));
  bid.info.jobName = s(g(S, 'H6'));
  bid.info.location = s(g(S, 'H7'));
  bid.info.projectType = s(g(S, 'N5')) || 'Commercial';
  bid.info.projectSqFt = n(g(S, 'N6'));
  bid.info.materialLbs = n(g(S, 'N7'));
  bid.info.jobNumber = s(g('Booking Report', 'F2'));
  bid.info.address = s(g('Booking Report', 'C5'));
  bid.info.city = s(g('Booking Report', 'C6'));
  bid.info.state = s(g('Booking Report', 'D6'));
  bid.info.zip = s(g('Booking Report', 'E6'));
  const r = bid.recap;
  r.scheduleType = s(g(S, 'C17')) || "5 8's";
  r.lop58 = n(g(S, 'O21')) || 0;
  for (let i = 0; i < 5; i++) {
    r.mods.plumb[i] = n(g(S, 'B' + (12 + i))) || 0;
    r.mods.pipe[i] = n(g(S, 'C' + (12 + i))) || 0;
    r.mods.sm[i] = n(g(S, 'D' + (12 + i))) || 0;
    r.mods.shop[i] = n(g(S, 'I' + (12 + i))) || 0;
  }
  r.mods.shop[5] = n(g(S, 'I17')) || 0;
  r.archHrsInSM = n(g(S, 'D27')) || 0;
  r.ocipToggle = s(g(S, 'B26')) || 'No OCIP';
  r.subs[0].qp = s(g(S, 'I36'));
  r.subs[0].value = n(g(S, 'J36'));
  for (let k = 1; k < 9; k++) {
    r.subs[k] = { name: s(g(S, 'B' + (36 + k))), fixedCode: null, desc: '', qp: s(g(S, 'I' + (36 + k))), value: n(g(S, 'J' + (36 + k))) };
  }
  for (let i = 0; i < 5; i++) r.supPct[i] = n(g(S, 'E' + (48 + i))) || 0;
  r.miscContingency = n(g(S, 'H65'));
  r.bondRequired = s(g(S, 'A66')) || 'No';
  r.taxType = s(g(S, 'E68')) || 'Oregon CAT Tax';
  r.addDeduct = n(g(S, 'I69'));
  r.subMarkup = n(g(S, 'G60')) || 0;
  r.equipMarkup = n(g(S, 'G61')) || 0;
  r.ohp = n(g(S, 'G62')) || 0;
  for (const [key, row] of [['plumbing', 77], ['hvac', 78], ['medGas', 79], ['boiler', 80], ['specialInsp', 81]]) {
    r.permitsManual[key] = n(g(S, 'J' + row));
  }
  r.trucking = { hrs: n(g(S, 'E81')), loads: n(g(S, 'F81')), rate: null };
  r.gc.safetyPct = n(g(S, 'G78')) || 0;
  r.gc.smallToolsPct = n(g(S, 'G79')) || 0;
  r.gc.freightPct = n(g(S, 'G80')) || 0;
  r.gc.miscPct = n(g(S, 'G106')) || 0;
  COMPANY.gcRows.forEach((gr, i) => {
    const row = 82 + i;
    const entry = {};
    if (gr.key === 'cadOperator') {
      const q = n(g(S, 'D102')), d = n(g(S, 'E102'));
      if (q != null) entry.qty = q;
      if (d != null) entry.dur = d;
    } else {
      const q = n(g(S, 'F' + row));
      if (q != null) entry.qty = q;
    }
    const rate = n(g(S, 'G' + row));
    if (rate != null && gr.rateFrom !== 'journeyman' && !doc.getF(S, 'G' + row)) entry.rate = rate;
    if (Object.keys(entry).length) r.gc.rows[gr.key] = entry;
    if (gr.editableLabel) {
      const lbl = s(g(S, 'B' + row));
      if (lbl && lbl !== gr.label) r.gc.labels[gr.key] = lbl;
    }
  });
  r.equipment = [];
  r.equipmentNames = [];
  for (let i = 0; i < 16; i++) {
    const row = 114 + i;
    r.equipment.push({ qty: n(g(S, 'G' + row)), dur: n(g(S, 'H' + row)), rate: n(g(S, 'I' + row)) });
    r.equipmentNames.push(row >= 127 ? s(g(S, 'B' + row)) : '');
  }
  r.storedTotal = n(g(S, 'N70'));

  const C = 'Crew Mix';
  const qtyArr = (start, count) => Array.from({ length: count }, (_, i) => n(g(C, 'C' + (start + i))));  // null = blank, 0 = explicit
  bid.crewMix.smField.qty = qtyArr(11, 9);
  bid.crewMix.smShop.qty = qtyArr(74, 9);
  bid.crewMix.plumberFitter.qty = qtyArr(137, 8);
  bid.crewMix.smField.pfST = n(g(C, 'H9'));
  bid.crewMix.smShop.pfST = doc.getF(C, 'H72') ? null : n(g(C, 'H72'));   // formula = inherits H9
  bid.crewMix.plumberFitter.pfST = n(g(C, 'H135'));
  bid.crewMix.smShop.burdenST = n(g(C, 'I85'));

  const T = 'TakeOff';
  bid.takeoff.caeType = s(g(T, 'F9'));
  const groups = [];
  for (const tg of COMPANY.takeoffGroupRows) {
    const name = s(g(T, 'D' + (tg.headerRow + 2)));
    const typ = s(g(T, 'F' + tg.headerRow));
    const exc = g(T, 'K' + tg.headerRow) === true;
    const items = [];
    for (let row = tg.itemsStart; row <= tg.itemsEnd; row++) {
      const nv = (a) => { const v = n(g(T, a + row)); return v == null ? '' : v; };
      const lf = doc.getF(T, 'L' + row);   // typed arithmetic like 20916+28200 — keep it
      const it = {
        matPhase: s(g(T, 'A' + row)), shopPhase: s(g(T, 'B' + row)), fieldPhase: s(g(T, 'C' + row)),
        desc: s(g(T, 'D' + row)), qty: nv('E'), fUnit: nv('F'), fMult: nv('G'),
        sUnit: nv('I'), sMult: nv('J'), mUnit: nv('L'),
        notes: s(g(T, 'N' + row)), emo: s(g(T, 'P' + row)), ot: s(g(T, 'Q' + row)), shift: s(g(T, 'R' + row)),
      };
      if (lf && /^[-+*/().\d\s]+$/.test(lf)) {
        it.mUnitExpr = '=' + lf;
        if (it.mUnit === '') { const ev = evalExpr(it.mUnitExpr); if (ev != null) it.mUnit = ev; }
      }
      it.rowOffset = row - tg.itemsStart;            // preserve original row position
      items.push(it);
    }
    const emptyIt = (it) => !(it.matPhase || it.shopPhase || it.fieldPhase || it.desc || it.notes ||
      it.emo || it.ot || it.shift || it.qty !== '' || it.fUnit !== '' || it.sUnit !== '' || it.mUnit !== '');
    // drop blank spacer rows entirely; rowOffset keeps every kept item at its original position
    for (let k = items.length - 1; k >= 0; k--) if (emptyIt(items[k])) items.splice(k, 1);
    if (name || typ || items.length || exc) groups.push({ id: tg.id, name, type: typ, exclude: exc, items });
  }
  bid.takeoff.groups = groups.length ? groups : bid.takeoff.groups;

  bid.smImport.rows = [];
  for (let rr = 9; rr <= 80; rr++) {
    const row = {
      floor: s(g('SM Import', 'A' + rr)), service: s(g('SM Import', 'B' + rr)),
      type: s(g('SM Import', 'C' + rr)), material: s(g('SM Import', 'D' + rr)), cutType: s(g('SM Import', 'E' + rr)),
      qty: n(g('SM Import', 'F' + rr)) ?? '', fieldHoursRaw: n(g('SM Import', 'G' + rr)) ?? '',
      shopHoursRaw: n(g('SM Import', 'I' + rr)) ?? '', materialCost: n(g('SM Import', 'K' + rr)) ?? '',
      fieldPct: '', shopPct: '',
    };
    const lp = n(g('SM Import', 'L' + rr)), np = n(g('SM Import', 'N' + rr));
    if (lp != null && lp !== 1) row.fieldPct = lp;
    if (np != null && np !== 1) row.shopPct = np;
    if (row.type || row.material || row.qty !== '' || row.fieldHoursRaw !== '' || row.materialCost !== '') bid.smImport.rows.push(row);
  }

  for (const [key, row] of [['smField', 4], ['smShop', 6], ['arch', 8], ['plumber', 10], ['fitter', 12]]) {
    const e = {};
    const rate = n(g('Work Recovery', 'D' + row)), mx = n(g('Work Recovery', 'F' + row));
    if (rate != null) e.rate = rate;
    if (mx != null) e.maxHrs = mx;
    bid.workRecovery[key] = e;
  }

  const selBack = { 1: 'portland', 2: 'hillsboro', 3: 'clackamas', 4: 'custom', 5: 'none', 6: 'tualatin', 0: 'none' };
  const sel = n(g('Permits', 'R1'));
  bid.permitCalc.selection = selBack[sel ?? 5] || 'none';
  bid.permitCalc.custom.tiers = bid.permitCalc.custom.tiers.map((t, i) => {
    const rr = 25 + i;
    return {
      min: i === 0 ? 0 : (n(g('Permits', 'K' + rr)) ?? t.min),
      max: n(g('Permits', 'L' + rr)) ?? t.max,
      fee: n(g('Permits', 'M' + rr)) ?? t.fee,
      inc: n(g('Permits', 'N' + rr)) ?? t.inc,
    };
  });
  bid.permitCalc.custom.planReviewPct = n(g('Permits', 'P33')) ?? 0.65;
  bid.permitCalc.custom.markupPct = n(g('Permits', 'P35')) ?? 0.05;

  // Takeoff Notes back
  bid.notes = [];
  for (let rr = 7; rr <= 46; rr++) {
    const nt = {
      num: rr - 6, service: s(g('Takeoff Notes', 'C' + rr)), desc: s(g('Takeoff Notes', 'D' + rr)),
      impact: g('Takeoff Notes', 'E' + rr) ? 'Y' : (g('Takeoff Notes', 'F' + rr) ? 'N' : ''),
      est: n(g('Takeoff Notes', 'G' + rr)), strategy: s(g('Takeoff Notes', 'H' + rr)), rfi: s(g('Takeoff Notes', 'I' + rr)),
    };
    if (nt.desc || nt.strategy || nt.est != null) bid.notes.push(nt);
  }
  if (!bid.notes.length) bid.notes = Array(10).fill(0).map((_, i) => ({ num: i + 1, service: '', desc: '', impact: '', est: null, strategy: '', rfi: '' }));

  const cp = g('Booking Report', 'C10');
  bid.booking.certifiedPayroll = cp === 1 ? 'Yes' : 'No';
  const bt = g('Booking Report', 'B16');
  bid.booking.bookingType = bt === 2 ? 'Change' : 'Original';
  bid.booking.contract = s(g('Booking Report', 'G8')) || 'Lump Sum';

  // MCAA notes cells
  bid.recap.mcaaNotes = {
    misc: s(g(S, 'L65')), bond: s(g(S, 'L66')), tax: s(g(S, 'L68')), gcMisc: s(g(S, 'L106')),
  };

  // Proposal scope + quick-list marks
  const scope = s(g('Proposal', 'B17'));
  if (scope) bid.proposal.scope = scope;
  bid.proposal.exclusionsPicked = [];
  (COMPANY.proposal.exclusionPicker || []).forEach((name, idx) => {
    if (g('Proposal', 'W' + (17 + idx))) bid.proposal.exclusionsPicked.push(name);
  });
  bid.proposal.inclusionsPicked = [];
  (COMPANY.proposal.inclusionOptions || []).forEach((name, idx) => {
    if (g('Proposal', 'Z' + (17 + idx))) bid.proposal.inclusionsPicked.push(name);
  });

  // OCIP form state
  bid.ocipForm.applicantType = n(g('OCIP', 'Y18')) || 1;
  bid.ocipForm.contractWith = n(g('OCIP', 'Y50')) || 3;
  bid.ocipForm.subcontractWork = n(g('OCIP', 'Y54')) || 1;
  bid.ocipForm.bidType = n(g('OCIP', 'Y123')) || 1;
  bid.ocipForm.contractType = n(g('OCIP', 'Y130')) || 2;
  bid.ocipForm.combinedRate = n(g('OCIP', 'Y157')) || 1;
  const pkgNo = s(g('OCIP', 'M8'));
  bid.ocipForm.bidPackageNo = pkgNo === 'XXXXXXXXXX' ? '' : pkgNo;

  // SM Schedule tasks
  const pmTxt = s(g('SM Schedule', 'A2'));
  bid.schedule.pm = pmTxt.replace(/^PROJECT MANAGER:\s*/i, '');
  const altS = n(g('SM Schedule', 'M1'));
  bid.schedule.altStart = altS != null ? fromExcelSerial(altS) : null;
  bid.schedule.packages = [];
  for (let pi = 0; pi < 19; pi++) {
    const base = 4 + pi * 11;
    const pkgName = s(g('SM Schedule', 'C' + base));
    const tasks = [];
    for (let ti = 0; ti < 10; ti++) {
      const row = base + 1 + ti;
      const t = {
        desc: s(g('SM Schedule', 'C' + row)), manpower: n(g('SM Schedule', 'D' + row)),
        start: n(g('SM Schedule', 'E' + row)) != null ? fromExcelSerial(n(g('SM Schedule', 'E' + row))) : '',
        finish: n(g('SM Schedule', 'F' + row)) != null ? fromExcelSerial(n(g('SM Schedule', 'F' + row))) : '',
        status: s(g('SM Schedule', 'G' + row)).trim(),
        actualFinish: n(g('SM Schedule', 'H' + row)) != null ? fromExcelSerial(n(g('SM Schedule', 'H' + row))) : '',
        notes: s(g('SM Schedule', 'I' + row)),
      };
      if (t.start || t.finish || t.manpower != null || (t.desc && !/^Task [A-J]$/.test(t.desc))) tasks.push(t);
    }
    if (tasks.length) bid.schedule.packages.push({ name: pkgName || 'Package ' + (pi + 1), tasks });
  }

  // custom phase-code descriptions: any description differing from company standard
  const divCols = { 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F', 6: 'G', 7: 'H', 8: 'I' };
  for (const d of COMPANY.phaseCodes.divisions) {
    for (let code = 1; code <= 99; code++) {
      const cc = String(code).padStart(2, '0');
      const std = (d.descriptions[cc] || {}).d || '';
      const cur = s(g('Phase Codes', divCols[d.div] + (3 + code)));
      if (cur && cur !== std) bid.phaseCustom[d.div + '-' + cc] = cur;
    }
  }

  // Cells holding only whitespace (someone typed a space in the workbook): keep them
  // so a re-export reproduces the imported file exactly.
  bid.xlsmSpaces = {};
  for (const [t, a] of xlsmBlankCells()) {
    const v = g(t, a);
    if (typeof v === 'string' && v !== '' && v.trim() === '') {
      (bid.xlsmSpaces[t] = bid.xlsmSpaces[t] || {})[a] = v;
    }
  }
  return bid;
}

async function importXlsmFile(bytes, pr) {
  const entries = await zipRead(bytes);
  if (!entries.find(e => e.name === 'xl/workbook.xml')) throw new Error('Not an Excel workbook');
  const doc = new XlsmDoc(entries);
  // sanity: must be the Arctic estimate template (sheet17 = MCAA RECAP with the recap title)
  if (!doc.parts.has('xl/worksheets/sheet17.xml')) throw new Error('This workbook does not look like the Arctic estimate template');
  if (pr) await pr.step(0.6, 'Reading recap, takeoff, crew and booking cells');
  return xlsmReadBid(doc);
}
