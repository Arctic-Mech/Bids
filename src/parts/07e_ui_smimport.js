// ============================================================
// Page: SM Import (CAE feed) — replaces the TSI / QuickPen VBA imports
// ============================================================
'use strict';

function newSmImportRow() {
  return { floor: '', service: '', type: '', material: '', cutType: '', qty: '', fieldHoursRaw: '', shopHoursRaw: '', materialCost: '', fieldPct: '', shopPct: '' };
}

// Where the takeoff software drops its export. The old macros opened this path with
// no prompt and no file picker, which is why nobody ever had to know it — and why
// nobody knows it now. It is on the screen, and copyable, on purpose.
const SM_EXPORT_DIR = 'C:\\MAP-Software\\EST\\Exports';

// The folder, with a button that puts it on the clipboard so it can be pasted
// straight into File Explorer's address bar.
function exportPathBox() {
  const label = el('code', {}, SM_EXPORT_DIR);
  const btn = el('button', { class: 'btn sm', onclick: async () => {
    try {
      await navigator.clipboard.writeText(SM_EXPORT_DIR);
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy folder path'; }, 1800);
    } catch (e) {
      // clipboard blocked (older browser, or the page is not trusted) — select it instead
      const r = document.createRange(); r.selectNodeContents(label);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      toast('Press Ctrl+C to copy the highlighted folder');
    }
  } }, 'Copy folder path');
  return el('span', { class: 'pathbox' }, label, btn);
}

router.routes.smimport = {
  title: () => 'SM Import (CAE)',
  needsBid: true,
  render(v) {
    const bid = app.bid, S = app.settings, c = app.computed;
    const smi = c.smImport;

    ensureDatalist('dlSmiType', S.ref.smImportTypes);
    ensureDatalist('dlSmiMaterial', S.ref.smImportMaterials);
    ensureDatalist('dlSmiCut', S.ref.smImportCutTypes);

    v.append(el('div', { class: 'card' }, el('h2', {}, 'Where your takeoff file is'), el('div', { class: 'pad' },
      el('p', {}, el('b', {}, 'You do not make this file — your takeoff program writes it for you'),
        ', every time you run its export, into the same folder. You just have to go and get it. ',
        'This page does what the old ', el('b', {}, 'Ctrl+I'), ' import macros did.'),
      el('div', { class: 'formrow', style: 'align-items:center' },
        el('div', { style: 'min-width:auto' }, exportPathBox()),
        el('a', { href: '#/howto', class: 'btn sm sec' }, 'Where do I find this file?')),
      el('div', { class: 'tablewrap' }, el('table', { class: 'grid' },
        el('tr', {}, el('th', {}, 'You took off in'), el('th', {}, 'Your file'), el('th', {}, 'The old button')),
        el('tr', {}, el('td', {}, 'EST'), el('td', {}, el('b', {}, 'FESTR.txt')), el('td', {}, 'Import New SM From EST')),
        el('tr', {}, el('td', {}, 'QuickPen'), el('td', {}, el('b', {}, 'FESTR_QP.txt')), el('td', {}, 'Import New SM From QP')))),
      el('p', { class: 'hint', style: 'margin-top:10px' },
        'Not sure which? Sort that folder by Date modified — whichever changed when you ran your export is yours. ',
        'This page reads the file and works out which kind it is, so the wrong one does no harm.'),
      el('p', { class: 'hint' },
        'Lines are grouped the way the old pivot tables grouped them, then matched into the CAE group on the ',
        'TakeOff page by Type / Material / Cut Type, exactly like the spreadsheet did. You can also paste rows ',
        'that are already summarised (tab- or comma-separated) as ',
        el('b', {}, 'Floor, Service, Type, Material, Cut Type, Qty, Field Hours, Shop Hours, Material Cost'),
        ' — or add rows by hand. The "% of Labor" columns scale the imported hours (100% = standard).'))));

    const paste = el('textarea', { rows: 5, style: 'width:100%', placeholder: 'Paste export rows here…' });

    // Drop the export file straight in. Both routes end up in the same parser,
    // so the column rules are identical however the rows arrive.
    const file = el('input', { type: 'file', accept: '.csv,.txt,.tsv,.xlsx', multiple: '', style: 'display:none' });
    const takeFiles = async (files) => {
      for (const f of files) {
        try {
          const rows = await readSmImportFile(f);
          if (!rows.length) { toast('No takeoff rows recognised in "' + f.name + '"', true); continue; }
          bid.smImport.rows.push(...rows);
          app.touch(); router.render();
          toast('Added ' + rows.length + ' line' + (rows.length > 1 ? 's' : '') + ' from ' + f.name);
        } catch (e) {
          // a file we can explain is a warning, not a page error — the toast is the message
          console.warn('SM Import: ' + f.name + ' — ' + e.message);
          toast('Could not read "' + f.name + '": ' + e.message, true);
        }
      }
    };
    file.addEventListener('change', async (e) => { await takeFiles(Array.from(e.target.files)); e.target.value = ''; });
    const drop = el('div', { class: 'smi-drop' },
      el('b', {}, 'Drop FESTR.txt or FESTR_QP.txt here'),
      el('div', { class: 'hint' }, 'or ', el('button', { class: 'btn sm sec', onclick: () => file.click() }, 'choose a file'),
        el('br'), 'from ', el('b', {}, SM_EXPORT_DIR),
        ' — or any .csv / .txt / .xlsx already summarised into ',
        'Floor, Service, Type, Material, Cut Type, Qty, Field Hrs, Shop Hrs, Material $'), file);
    for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
    for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('over'));
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      await takeFiles(Array.from(e.dataTransfer.files || []));
    });

    const pasteCard = el('div', { class: 'card' }, el('h2', {}, 'Import lines from a file or paste'), el('div', { class: 'pad' }, drop, paste,
      el('div', { class: 'formrow', style: 'margin-top:8px' },
        el('button', {
          class: 'btn', onclick: () => {
            const rows = parseSmImportPaste(paste.value);
            if (!rows.length) { toast('Nothing recognized — expected at least Type, Qty and hour columns', true); return; }
            bid.smImport.rows.push(...rows);
            app.touch(); router.render();
            toast('Added ' + rows.length + ' line' + (rows.length > 1 ? 's' : ''));
          }
        }, 'Add pasted rows'),
        el('button', {
          class: 'btn danger', onclick: () => {
            if (!bid.smImport.rows.length) return;
            if (confirm('Clear all ' + bid.smImport.rows.length + ' SM Import lines? (This is the old "Remove SM Import" macro.)')) {
              bid.smImport.rows = []; app.touch(); router.render();
            }
          }
        }, 'Clear all (Remove SM Import)'))));
    v.append(pasteCard);

    const t = el('table', { class: 'grid' });
    t.append(th('Floor', 'Service', 'Type', 'Material', 'Cut Type', { t: 'Qty', num: 1 },
      { t: 'Field Hrs', num: 1 }, { t: 'Field %', num: 1 }, { t: 'Calc Field', num: 1 },
      { t: 'Shop Hrs', num: 1 }, { t: 'Shop %', num: 1 }, { t: 'Calc Shop', num: 1 }, { t: 'Material $', num: 1 }, ''));
    bid.smImport.rows.forEach((r, i) => {
      const p = 'smImport.rows[' + i + ']';
      const cr = smi.rows[i];
      const dlIn = (path, dl) => { const inp = el('input', { type: 'text', value: pathGet(bid, path) ?? '', list: dl, style: 'width:110px', 'data-path': path }); inp.addEventListener('change', () => { pathSet(bid, path, inp.value); app.touch(); }); return tdIn(inp); };
      t.append(el('tr', {},
        tdIn(textIn(p + '.floor')), tdIn(textIn(p + '.service')),
        dlIn(p + '.type', 'dlSmiType'), dlIn(p + '.material', 'dlSmiMaterial'), dlIn(p + '.cutType', 'dlSmiCut'),
        tdIn(numIn(p + '.qty', { zeroWhenEmpty: true, after: rerender })),
        tdIn(numIn(p + '.fieldHoursRaw', { after: rerender })),
        tdIn(numIn(p + '.fieldPct', { pct: true, dec: 0, after: rerender, placeholder: '100', title: cr.fieldDifficulty || 'Standard' })),
        calcCell(cr.fieldHours, 'hrs', { title: cr.fieldDifficulty }),
        tdIn(numIn(p + '.shopHoursRaw', { after: rerender })),
        tdIn(numIn(p + '.shopPct', { pct: true, dec: 0, after: rerender, placeholder: '100', title: cr.shopDifficulty || 'Standard' })),
        calcCell(cr.shopHours, 'hrs', { title: cr.shopDifficulty }),
        tdIn(numIn(p + '.materialCost', { after: rerender })),
        el('td', {}, el('button', { class: 'btn sm danger', onclick: () => { bid.smImport.rows.splice(i, 1); app.touch(); router.render(); } }, '×'))));
    });
    t.append(el('tr', { class: 'subtotal' }, tdTxt('Totals'), tdTxt(''), tdTxt(''), tdTxt(''), tdTxt(''),
      calcCell(smi.totals.qty, 'int'), tdTxt(''), tdTxt(''), calcCell(smi.totals.fieldHours, 'hrs'),
      tdTxt(''), tdTxt(''), calcCell(smi.totals.shopHours, 'hrs'), calcCell(smi.totals.materialCost, 'money'), tdTxt('')));
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Import lines', el('span', { class: 'spacer' }),
      el('button', { class: 'btn sm sec', onclick: () => { bid.smImport.rows.push(newSmImportRow()); app.touch(); router.render(); } }, '+ Row')),
      wrap(t)));
  },
};

// Read a takeoff export into SM Import rows. .csv/.txt go straight to the paste
// parser; .xlsx is unpacked with the same OOXML helpers the spreadsheet export
// uses, so there is no extra library.
// The macros opened these files with Origin:=437 — the old DOS code page — so a
// degree, diameter or fraction symbol in a Description is not UTF-8. Read as UTF-8
// first (that is what a modern export writes) and fall back only if it comes out
// broken. Browsers have no cp437 decoder, hence the table.
const CP437_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»' +
  '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀' +
  'αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
function decodeExportText(buf) {
  const utf = new TextDecoder('utf-8').decode(buf);
  if (!utf.includes('�')) return utf;
  let out = '';
  for (let i = 0; i < buf.length; i++) out += buf[i] < 128 ? String.fromCharCode(buf[i]) : CP437_HIGH[buf[i] - 128];
  return out;
}

async function readSmImportFile(f) {
  const buf = new Uint8Array(await f.arrayBuffer());
  const isZip = buf[0] === 0x50 && buf[1] === 0x4B;
  if (!isZip) return parseTakeoffExport(decodeExportText(buf));

  const entries = await zipRead(buf);
  if (!entries.find(e => e.name === 'xl/workbook.xml')) throw new Error('not a spreadsheet or a text export');
  if (entries.find(e => e.name === 'xl/worksheets/sheet17.xml') && entries.find(e => e.name === 'xl/vbaProject.bin')) {
    throw new Error('that is the estimate workbook — import it from Home to load the whole bid');
  }
  const dec = (n) => { const p = entries.find(e => e.name === n); return p ? new TextDecoder().decode(p.bytes) : ''; };

  // first sheet in the workbook's own order: workbook.xml -> rels -> part name
  const first = /<sheet\b[^>]*r:id="([^"]+)"/.exec(dec('xl/workbook.xml'));
  let part = 'xl/worksheets/sheet1.xml';
  if (first) {
    const rel = new RegExp('<Relationship[^>]*Id="' + first[1] + '"[^>]*Target="([^"]+)"').exec(dec('xl/_rels/workbook.xml.rels'));
    if (rel) part = rel[1].replace(/^\/?(xl\/)?/, 'xl/');
  }
  const xml = dec(part);
  if (!xml) throw new Error('could not find the first worksheet');

  const shared = xlsmSharedStrings(entries);
  const cells = xlsmIndexCells(xml);
  const rows = new Map();
  for (const [addr, node] of cells) {
    const m = /^([A-Z]+)(\d+)$/.exec(addr);
    if (!m) continue;
    const v = xlsmNodeValue(node, shared);
    if (v === null || v === '') continue;
    let col = 0;
    for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
    const r = +m[2];
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r)[col - 1] = v;
  }
  const lines = [...rows.keys()].sort((a, b) => a - b)
    .map(r => { const cols = rows.get(r); for (let i = 0; i < cols.length; i++) if (cols[i] === undefined) cols[i] = ''; return cols.join('\t'); });
  return parseTakeoffExport(lines.join('\n'));
}

// ---- raw takeoff exports -------------------------------------------------
// The old macros read C:\MAP-Software\EST\Exports\FESTR.txt (TSI) and
// FESTR_QP.txt (QuickPen), pasted them into an audit-trail sheet, pivoted, and
// pasted the pivot output into SM Import. These do the pivot's work directly.
// Layouts and rules: docs/specs/sm-import-schedule.md §3-§5.

// split a delimited line, honouring "quoted, fields"
function splitDelimited(line, delim) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(v => v.trim());
}
const TSI_COLS = 30, QP_COLS = 15;                     // the two exports' fixed widths

// The macro let Excel split on tab AND comma at once (Tab:=True, Comma:=True). Doing
// that literally would tear a tab-separated row apart at a comma inside a Description,
// so pick the delimiter that actually yields one of the two known widths instead.
function splitExportRows(text) {
  const lines = String(text).split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const known = (n) => n === TSI_COLS || n === QP_COLS;
  const t = splitDelimited(lines[0], '\t').length, c = splitDelimited(lines[0], ',').length;
  let delim = '\t';
  if (known(c) && !known(t)) delim = ',';
  else if (!known(t) && !known(c) && c > t) delim = ',';
  return lines.map(l => splitDelimited(l, delim));
}

const TSI_HEAD = ['drawing', 'section', 'zone', 'service', 'service type'];
const QP_HEAD = ['floor', 'service type', 'material', 'shape', 'cut type'];
// TrailingMinusNumbers:=True in the macro — "123-" is negative in these files.
const num = (v) => {
  let s = String(v ?? '').trim();
  if (/^[\d.,]+-$/.test(s)) s = '-' + s.slice(0, -1);
  const n = fmt.parseNum(s);
  return n === null ? 0 : n;
};

// Which export is this? The header row names it, so a renamed file still works. If
// the header is missing the file is still usable: the two exports are a fixed width
// apart, and QuickPen's Labor Type column is a short known list.
function takeoffExportKind(rows) {
  const h = ((rows && rows[0]) || []).map(v => String(v).toLowerCase().trim());
  const starts = (want) => want.every((w, i) => h[i] === w);
  if (starts(TSI_HEAD)) return { kind: 'tsi', header: true };
  if (starts(QP_HEAD)) return { kind: 'qp', header: true };
  const sample = (rows || []).slice(0, 50);
  const width = Math.max(0, ...sample.map(r => r.length));
  const laborish = sample.some(r => /^(field|shop|n\/?a|equipment)$/i.test(String(r[5] ?? '').trim()));
  if (laborish && width >= QP_COLS - 3) return { kind: 'qp', header: false };
  if (width >= TSI_COLS - 4) return { kind: 'tsi', header: false };
  return null;
}

function parseTakeoffExport(text) {
  const rows = splitExportRows(text);
  const found = takeoffExportKind(rows);
  if (!found) {
    // A wide table we cannot place is almost certainly the wrong file. Importing it
    // anyway would quietly add junk rows, so say what we were looking for instead.
    if ((rows[0] || []).length >= 10) {
      throw new Error('this does not look like a takeoff export. It should be FESTR.txt (EST) or ' +
        'FESTR_QP.txt (QuickPen) from C:\\MAP-Software\\EST\\Exports — the How To page shows where to find it');
    }
    return parseSmImportPaste(text);                   // already-summarised rows, or a paste
  }
  const body = found.header ? rows.slice(1) : rows;
  return found.kind === 'tsi' ? aggregateTsiExport(body) : aggregateQpExport(body);
}

// The pivots sorted on their row fields and the macro pasted that order into SM
// Import. Match it so an imported list can be read down beside the old spreadsheet's.
function sortGroups(groups, order) {
  return [...groups].sort((a, b) => {
    for (const i of order) {
      const c = String(a.key[i]).localeCompare(String(b.key[i]), undefined, { numeric: true, sensitivity: 'base' });
      if (c) return c;
    }
    return 0;
  });
}
// Delete_Blank: the macro wiped the pivot's "(blank)" labels before using them. They
// come from the source range running one row past the data (see the OFFSET names).
const unblank = (v) => (/^\(blank\)$/i.test(v) ? '' : v);
const allBlank = (key) => key.every(v => v === '');

// TSI / EST "All Material" pivot: group Section / Service / Service Type / Material /
// Cut Type and sum Qty, Install Hours, Fab Hours, Total Material Cost.
//
// Three of those four are CALCULATED fields defined in the pivot cache, not columns
// in the file (xl/pivotCache/pivotCacheDefinition2.xml, verbatim):
//     Install Hours       = 'Install time' / 60      <- the export writes MINUTES
//     Fab Hours           = 'Fab time'    / 60
//     Total Material Cost = 'M-Rate' - 'Ext Wrap Cost'
// Miss the /60 and every imported hour is 60x too big. (Fab Hours is plain
// Fab time/60 — it does NOT add Insul Fab time, which has its own unused field.)
const TSI_MINUTES_PER_HOUR = 60;
function aggregateTsiExport(body) {
  const C = { section: 1, service: 3, serviceType: 4, qty: 7, cutType: 9, material: 12,
    mRate: 14, fabTime: 15, installTime: 16, extWrapCost: 23 };
  const groups = new Map();
  for (const r of body) {
    if (!r || r.length < 13) continue;
    const clean = (v) => unblank(String(v ?? '').replace(/Spiral Straight/g, 'Decoiled Straight').trim());  // the macro's replacement
    const key = [clean(r[C.section]), clean(r[C.service]), clean(r[C.serviceType]), clean(r[C.material]), clean(r[C.cutType])];
    if (allBlank(key)) continue;                       // the trailing blank row
    const k = key.join('\u0000');
    if (!groups.has(k)) groups.set(k, { key, qty: 0, field: 0, shop: 0, mat: 0 });
    const g = groups.get(k);
    g.qty += num(r[C.qty]);
    g.field += num(r[C.installTime]) / TSI_MINUTES_PER_HOUR;
    g.shop += num(r[C.fabTime]) / TSI_MINUTES_PER_HOUR;
    g.mat += num(r[C.mRate]) - num(r[C.extWrapCost]);
  }
  return sortGroups(groups.values(), [0, 1, 2, 3, 4]).map(g => ({
    floor: g.key[0], service: g.key[1], type: g.key[2], material: g.key[3], cutType: g.key[4],
    qty: g.qty, fieldHoursRaw: g.field, shopHoursRaw: g.shop, materialCost: g.mat,
    fieldPct: '', shopPct: '',
  }));
}

// QuickPen "QP All" pivot: group Floor / Service Type / Material / Shape / Cut Type,
// with the macro's filters — Qty and field hours from Labor Type "Field" rows only,
// shop hours from "Shop" rows, material cost from everything except blank / N/A, and
// Cut Type "Wrap" left out (it feeds the separate wrap pivot). Labor Hours here are
// already hours; only the TSI export is in minutes.
//
// Import_QP also cleans the raw rows first, in this order — the order matters,
// because the rename feeds the swap:
//   1. 3003H14Aluminum -> Alum                (whole cell)
//   2. Flex Connector  -> Canvas Connector    (whole cell)
//   3. rows whose Cut Type is Hanger or Canvas Connector: the macro cuts that cell
//      and inserts it one column left, which nets out as SWAPPING Shape and Cut Type.
//      QuickPen writes those two the wrong way round. Confirmed against the
//      workbook's own pivot cache: Hanger and Canvas Connector appear under Shape,
//      and shape words (Rectangular Duct, Round Duct, Air Device) appear under Cut
//      Type — which only happens if they were swapped.
//   4. a blank Material becomes N/A, so the row still groups instead of vanishing.
function qpCleanRow(raw) {
  const r = raw.map(v => {
    const s = String(v ?? '').trim();
    if (/^3003H14Aluminum$/i.test(s)) return 'Alum';
    if (/^Flex Connector$/i.test(s)) return 'Canvas Connector';
    return s;
  });
  if (/^(hanger|canvas connector)$/i.test(r[4] || '')) { const t = r[3]; r[3] = r[4]; r[4] = t; }
  if (r[2] === '' || r[2] === '0') r[2] = 'N/A';
  return r;
}
function aggregateQpExport(body) {
  const C = { floor: 0, serviceType: 1, material: 2, shape: 3, cutType: 4, laborType: 5, materialCost: 6, hours: 9, qty: 14 };
  const groups = new Map();
  for (const raw of body) {
    if (!raw || raw.length < 10) continue;
    const r = qpCleanRow(raw);
    const clean = (v) => unblank(String(v ?? '').trim());
    const cut = clean(r[C.cutType]);
    if (/^wrap$/i.test(cut)) continue;
    const labor = String(r[C.laborType] ?? '').trim();
    const key = [clean(r[C.floor]), clean(r[C.serviceType]), clean(r[C.shape]), clean(r[C.material]), cut];
    if (allBlank(key)) continue;                       // the trailing blank row
    const k = key.join('\u0000');
    if (!groups.has(k)) groups.set(k, { key, qty: 0, field: 0, shop: 0, mat: 0 });
    const g = groups.get(k);
    if (/^field$/i.test(labor)) { g.qty += num(r[C.qty]); g.field += num(r[C.hours]); }
    else if (/^shop$/i.test(labor)) g.shop += num(r[C.hours]);
    if (labor !== '' && !/^n\/?a$/i.test(labor)) g.mat += num(r[C.materialCost]);
  }
  // pivot row-field order is Floor, Service Type, Material, Shape, Cut Type
  return sortGroups(groups.values(), [0, 1, 3, 2, 4]).map(g => ({
    floor: g.key[0], service: g.key[1], type: g.key[2], material: g.key[3], cutType: g.key[4],
    qty: g.qty, fieldHoursRaw: g.field, shopHoursRaw: g.shop, materialCost: g.mat,
    fieldPct: '', shopPct: '',
  }));
}

function parseSmImportPaste(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = line.includes('\t') ? line.split('\t') : line.split(',');
    if (cells.length < 3) continue;
    const [floor, service, type, material, cutType, qty, fh, sh, mat] = cells.map(s => s.trim());
    if ((type || '').toLowerCase() === 'type') continue; // header row
    out.push({
      floor: floor || '', service: service || '', type: type || '', material: material || '', cutType: cutType || '',
      qty: fmt.parseNum(qty) ?? '', fieldHoursRaw: fmt.parseNum(fh) ?? '', shopHoursRaw: fmt.parseNum(sh) ?? '',
      materialCost: fmt.parseNum(mat) ?? '', fieldPct: '', shopPct: '',
    });
  }
  return out;
}
