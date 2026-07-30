// ============================================================
// IO: export (PDF pages / ZIP), import (.json/.pdf/.zip), diff modal
// ============================================================
'use strict';

// Every exportable page registers here: key -> {label, landscape, render(doc, bid, computed, settings)}
const PDF_PAGES = {}; // filled by ui modules

function bidFileBase(bid) {
  // Mirrors VBA SaveWorkBook convention: "<EstNo> <JobName> Rev <N>"
  const est = (bid.info.estNo || 'NoEst').trim();
  const job = (bid.info.jobName || 'Untitled').trim();
  const clean = (s) => s.replace(/[\\/:*?"<>|]+/g, '-');
  return clean(est + ' ' + job + ' Rev ' + (bid.meta.rev ?? 0));
}

function exportBidJson(bid) {
  return JSON.stringify({
    format: 'arctic-bid',
    schema: bid.schema,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    bid: bid,
  }, null, 1);
}

function downloadBytes(name, bytes, mime) {
  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function logoJpegBytes() {
  // Convert embedded base64 PNG logo to JPEG bytes for the PDF (DCTDecode)
  if (logoJpegBytes.cache) return logoJpegBytes.cache;
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + ASSETS.wordmark; });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  const dataUrl = c.toDataURL('image/jpeg', 0.92);
  const bin = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  logoJpegBytes.cache = { bytes, w: c.width, h: c.height };
  return logoJpegBytes.cache;
}

// Standard page header/footer for every PDF page
async function pdfChrome(doc, bid, pageTitle) {
  const logo = await logoJpegBytes();
  doc.addJpeg('wm', logo.bytes, logo.w, logo.h);
  const w = doc.pw;
  const lw = 90, lh = lw * logo.h / logo.w;
  doc.image('wm', 36, 24, lw, lh);
  doc.text(w - 36, 26, pageTitle, { size: 13, bold: true, align: 'right' });
  doc.text(w - 36, 42, (bid.info.estNo || '') + '  ·  ' + (bid.info.jobName || '') + '  ·  Rev ' + bid.meta.rev, { size: 8.5, align: 'right', color: [.33, .36, .45] });
  doc.text(w - 36, 53, 'Bid date: ' + (bid.info.bidDate ? fmt.date(bid.info.bidDate) : '—') + '   Printed: ' + fmt.dateTime(new Date().toISOString()), { size: 7.5, align: 'right', color: [.45, .48, .55] });
  doc.line(36, 62, w - 36, 62, { width: 1, color: [.11, .18, .62] });
  return 74; // content start y
}

// Page numbers, stamped once the total is known. Pages that carry their own
// numbering (the Proposal form) opt out via page.noFooter.
function stampFooters(doc, bid) {
  const n = doc.pages.length;
  if (n < 2) return;
  doc.pages.forEach((p, i) => {
    if (p.noFooter) return;
    doc.onPage(i, () => {
      const w = doc.pw;
      doc.text(w / 2, doc.ph - 26, 'Page ' + (i + 1) + ' of ' + n, { size: 7.5, align: 'center', color: [.45, .48, .55] });
      doc.text(36, doc.ph - 26, (bid.info.estNo || '') + (bid.info.jobName ? '  ·  ' + bid.info.jobName : '') + '  ·  Rev ' + bid.meta.rev,
        { size: 7.5, color: [.45, .48, .55] });
    });
  });
}

async function buildPagePdf(keys, bid, computed, settings) {
  const doc = new PdfDoc();
  for (const key of keys) {
    const page = PDF_PAGES[key];
    if (!page) continue;
    await page.render(doc, bid, computed, settings);
  }
  stampFooters(doc, bid);
  doc.attach('bid.json', exportBidJson(bid));
  return doc.build();
}

async function exportPdf(keys, singleName) {
  try { app.saveNow(); } catch (e) { /* storage full — export from memory anyway */ }
  const pr = progressStart('Building PDF');
  await pr.step(0.3, 'Drawing ' + keys.length + ' page' + (keys.length === 1 ? '' : 's'));
  const bytes = await buildPagePdf(keys, app.bid, app.computed, app.settings);
  await pr.step(1, 'Saving');
  pr.done();
  const base = bidFileBase(app.bid);
  const name = singleName ? base + ' - ' + singleName + '.pdf' : base + '.pdf';
  downloadBytes(name, bytes, 'application/pdf');
  toast('Exported ' + name);
}

async function exportZip(keys) {
  try { app.saveNow(); } catch (e) { /* storage full — export from memory anyway */ }
  const pr = progressStart('Building ZIP');
  const base = bidFileBase(app.bid);
  const files = [];
  files.push({ name: base + '/bid.json', bytes: new TextEncoder().encode(exportBidJson(app.bid)) });
  let n = 0;
  for (const key of keys) {
    const page = PDF_PAGES[key];
    if (!page) continue;
    await pr.step(++n / (keys.length + 1), page.label);
    const bytes = await buildPagePdf([key], app.bid, app.computed, app.settings);
    files.push({ name: base + '/' + base + ' - ' + page.label + '.pdf', bytes });
  }
  await pr.step(1, 'Zipping ' + files.length + ' files');
  const zip = zipCreate(files);
  pr.done();
  downloadBytes(base + '.zip', zip, 'application/zip');
  toast('Exported ' + base + '.zip (' + files.length + ' files)');
}

// ---------- import ----------
async function readImportedFile(file, pr) {
  const step = async (f, l) => { if (pr) await pr.step(f, l); };
  await step(0.05, 'Reading ' + file.name);
  const buf = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const tryJson = (bytes) => {
    try {
      const obj = JSON.parse(new TextDecoder('utf-8').decode(bytes));
      if (obj && obj.format === 'arctic-bid' && obj.bid) return obj.bid;
      if (obj && obj.meta && obj.info && obj.takeoff) return obj; // bare bid
    } catch (e) { }
    return null;
  };
  if (name.endsWith('.json')) return tryJson(buf);
  if (name.endsWith('.pdf') || (buf[0] === 0x25 && buf[1] === 0x50)) { // %P
    await step(0.4, 'Looking for the bid data inside the PDF');
    const obj = pdfExtractJson(buf);
    if (obj && obj.format === 'arctic-bid' && obj.bid) return obj.bid;
    if (obj && obj.meta && obj.info) return obj;
    return null;
  }
  if (name.endsWith('.zip') || name.endsWith('.xlsm') || name.endsWith('.xlsx') || (buf[0] === 0x50 && buf[1] === 0x4B)) {
    await step(0.2, 'Unpacking ' + file.name);
    const entries = await zipRead(buf);
    // Excel workbook (original spreadsheet or one we exported) — parse the cells
    if (entries.find(e => e.name === 'xl/workbook.xml')) {
      await step(0.45, 'Reading the workbook cells');
      const parsed = await importXlsmFile(buf, pr);
      return parsed;
    }
    await step(0.55, 'Looking for the bid data');
    // Prefer bid.json, else first PDF with an embedded bid
    const j = entries.find(e => e.name.toLowerCase().endsWith('bid.json'));
    if (j) { const b = tryJson(j.bytes); if (b) return b; }
    for (const e of entries) {
      if (e.name.toLowerCase().endsWith('.pdf')) {
        const obj = pdfExtractJson(e.bytes);
        if (obj && obj.format === 'arctic-bid' && obj.bid) return obj.bid;
      }
    }
    return null;
  }
  return tryJson(buf);
}

async function handleImportFiles(files) {
  // The top-bar Import button is wired before boot() knows whether the company file
  // is here, so it can be pressed on the setup screen. Importing a bid means pricing
  // it, and there is nothing to price it with yet — say that instead of failing deep
  // inside the engine on a rate that is not there.
  if (!COMPANY) {
    toast('Load the Arctic company file first — this computer has no rates to price a bid with yet.', true);
    router.render();
    return;
  }
  for (const f of files) {
    const pr = progressStart('Importing ' + f.name);
    let incoming = null;
    try { incoming = await readImportedFile(f, pr); }
    catch (e) { console.error(e); pr.done(); toast('Could not read "' + f.name + '": ' + e.message, true); continue; }
    if (!incoming) { pr.done(); toast('Could not read a bid from "' + f.name + '". Use a file exported by this tool (.pdf, .zip, .json or .xlsm).', true); continue; }
    await pr.step(0.9, 'Checking against what is already saved');
    incoming = migrateBid(incoming);
    // find existing bid with same identity (est # first, then exact id)
    const ix = store.index();
    const match = ix.find(x => x.id === incoming.meta.id) ||
      ix.find(x => incoming.info.estNo && x.estNo === incoming.info.estNo);
    if (!match) {
      incoming.meta.id = incoming.meta.id || uid();
      store.saveBid(incoming);
      await pr.step(1, 'Done');
      pr.done();
      openBid(incoming.meta.id);
      toast('Imported new bid ' + (incoming.info.estNo || '') + ' — Rev ' + incoming.meta.rev);
      continue;
    }
    const existing = store.loadBid(match.id);
    pr.done();
    showDiffModal(existing, incoming, f.name);
  }
}

// ---------- diff modal ----------
// Ignore volatile identity fields and reference lists; rate tables inside the
// snapshot DO diff (labor-rate changes between revs are real changes).
const DIFF_IGNORE = [/^meta\.savedAt$/, /^meta\.id$/, /^meta\.lastTotal$/, /^settingsSnapshot\.ref\./, /^settingsSnapshot\.booking\./, /^xlsmSpaces\./];

function labelForPath(path) {
  for (const [re, fn] of DIFF_LABELS) {
    const m = path.match(re);
    if (m) return fn(m);
  }
  return path;
}
function pageForPath(path) {
  const seg = path.split(/[.[]/)[0];
  return DIFF_PAGE_NAMES[seg] || 'Other';
}
function fmtDiffVal(v) {
  if (v === undefined) return '—';
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  if (typeof v === 'number') return Math.abs(v) >= 1000 ? fmt.num(v, 2) : String(Math.round(v * 10000) / 10000);
  return String(v) === '' ? '(blank)' : String(v);
}

// Every difference is its own accept/deny decision. Structural differences are the
// exception: when the two bids disagree on how many rows or groups a list has, the
// indices no longer line up, so that whole list is one all-or-nothing decision —
// applying half of it would corrupt the bid.
function arrayPrefixes(path) {
  const out = [];
  const re = /\[(\d+)\]/g;
  let m;
  while ((m = re.exec(path))) out.push(path.slice(0, m.index));
  return out;
}

function diffUnits(existing, incoming, changes) {
  const lenOf = (bid, p) => { const v = pathGet(bid, p); return Array.isArray(v) ? v.length : null; };
  const units = new Map();
  for (const c of changes) {
    let key = null;
    const asLen = /\.length$/.test(c.path) ? c.path.replace(/\.length$/, '') : null;
    if (asLen && lenOf(existing, asLen) !== lenOf(incoming, asLen)) key = asLen;
    if (!key) {
      for (const pre of arrayPrefixes(c.path)) {          // outermost list that changed shape
        if (lenOf(existing, pre) !== lenOf(incoming, pre)) { key = pre; break; }
      }
    }
    if (key) {
      if (!units.has(key)) {
        const a = lenOf(existing, key), b = lenOf(incoming, key);
        const rows = (n) => n === null ? '—' : n + (n === 1 ? ' row' : ' rows');
        units.set(key, {
          key, path: key, kind: 'list', count: 0,
          from: rows(a), to: rows(b),
          value: deepClone(pathGet(incoming, key) ?? []),
          label: labelForPath(key + '.length'), page: pageForPath(key),
        });
      }
      units.get(key).count++;
    } else {
      units.set(c.path, {
        key: c.path, path: c.path, kind: c.kind, count: 1,
        from: c.from, to: c.to,
        value: c.kind === 'removed' ? null : c.to,
        label: labelForPath(c.path), page: pageForPath(c.path),
      });
    }
  }
  return [...units.values()].sort((a, b) => a.path < b.path ? -1 : 1);
}

function applyDiffUnits(existing, units, accepted) {
  const merged = deepClone(existing);
  for (const u of units) {
    if (!accepted.has(u.key)) continue;
    pathSet(merged, u.path, u.kind === 'list' ? deepClone(u.value) : u.value);
  }
  return migrateBid(merged);
}

function showDiffModal(existing, incoming, sourceName) {
  const changes = diffBids(existing, incoming, DIFF_IGNORE);
  const units = diffUnits(existing, incoming, changes);
  const accepted = new Set(units.map(u => u.key));      // default: take the file
  const byPage = {};
  for (const u of units) (byPage[u.page] = byPage[u.page] || []).push(u);

  const back = el('div', { class: 'modal-back' });
  const revLine = (b, tag) => `${tag}: Rev ${b.meta.rev} — saved ${fmt.dateTime(b.meta.savedAt)}${b.info.estNo ? ' — ' + b.info.estNo : ''}`;
  const body = el('div', { class: 'body' });
  body.append(el('p', {}, el('b', {}, existing.info.jobName || existing.info.estNo || 'This bid'), ' already exists on this computer.'));
  body.append(el('p', { class: 'hint' }, revLine(existing, 'On this computer'), el('br'), revLine(incoming, 'File "' + sourceName + '"')));
  const revIn = Number(incoming.meta.rev) || 0, revEx = Number(existing.meta.rev) || 0;
  if (revIn < revEx) {
    body.append(el('p', {}, el('span', { class: 'badge red' }, 'Older revision'), ' The file is Rev ' + revIn + ' but you already have Rev ' + revEx + ' — taking everything would roll the bid back.'));
  } else if (revIn > revEx) {
    body.append(el('p', {}, el('span', { class: 'badge green' }, 'Newer revision'), ' The file is Rev ' + revIn + '; you have Rev ' + revEx + '.'));
  }

  const applyBtn = el('button', { class: 'btn' }, 'Apply');
  const countLbl = el('span', { class: 'hint' });
  const boxes = new Map();                              // unit key -> checkbox (rendered ones)
  const refresh = () => {
    const n = accepted.size, m = units.length;
    countLbl.textContent = n + ' of ' + m + ' accepted';
    applyBtn.textContent = n === 0 ? 'Keep mine (nothing accepted)'
      : n === m ? 'Accept all ' + m + ' changes' : 'Apply the ' + n + ' accepted change' + (n === 1 ? '' : 's');
    for (const [k, cb] of boxes) cb.checked = accepted.has(k);
  };
  const setAll = (on) => {
    accepted.clear();
    if (on) for (const u of units) accepted.add(u.key);
    refresh();
  };

  if (!changes.length) {
    body.append(el('p', {}, el('span', { class: 'badge green' }, 'No differences'), ' The file matches what you already have.'));
  } else {
    body.append(el('p', {}, el('span', { class: 'badge yellow' }, units.length + ' difference' + (units.length > 1 ? 's' : '')),
      ' Tick the ones you want from the file. Left is what you have, right is the file.'));
    body.append(el('div', { class: 'formrow', style: 'align-items:center;margin-bottom:8px' },
      el('button', { class: 'btn sm sec', onclick: () => setAll(true) }, 'Accept all'),
      el('button', { class: 'btn sm sec', onclick: () => setAll(false) }, 'Deny all'),
      countLbl));

    for (const [page, list] of Object.entries(byPage)) {
      const g = el('div', { class: 'diff-group' });
      const pageCb = el('input', { type: 'checkbox', checked: '' });
      pageCb.addEventListener('change', () => {
        for (const u of list) { if (pageCb.checked) accepted.add(u.key); else accepted.delete(u.key); }
        refresh();
      });
      g.append(el('h4', {}, el('label', { class: 'ck' }, pageCb, page + ' (' + list.length + ')')));
      const t = el('table', { class: 'diff' });
      t.append(el('tr', {}, el('th', { style: 'width:26px' }, '✓'), el('th', {}, 'Field'), el('th', {}, 'You have'), el('th', {}, 'File has')));
      const addRow = (u) => {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = accepted.has(u.key);
        cb.addEventListener('change', () => {
          if (cb.checked) accepted.add(u.key); else accepted.delete(u.key);
          refresh();
        });
        boxes.set(u.key, cb);
        const name = u.kind === 'list'
          ? el('td', {}, u.label, el('br'), el('span', { class: 'hint' }, 'list changed shape — ' + u.count + ' field change' + (u.count === 1 ? '' : 's') + ', taken together'))
          : el('td', {}, u.label);
        t.append(el('tr', { class: 'k-' + u.kind }, el('td', {}, cb), name,
          el('td', { class: u.kind !== 'added' ? 'old' : '' }, fmtDiffVal(u.from)),
          el('td', { class: u.kind !== 'removed' ? 'new' : '' }, fmtDiffVal(u.to))));
      };
      const CAP = 300;
      list.slice(0, CAP).forEach(addRow);
      if (list.length > CAP) {
        const moreRow = el('tr', {}, el('td', { colspan: 4 },
          el('button', {
            class: 'btn sm sec', onclick: (e) => {
              e.preventDefault();
              list.slice(CAP).forEach(addRow);
              moreRow.remove();
            }
          }, 'Show the other ' + (list.length - CAP) + ' — they are already counted above')));
        t.append(moreRow);
      }
      g.append(el('div', { class: 'tablewrap' }, t));
      body.append(g);
    }
    refresh();
  }

  const close = () => back.remove();
  applyBtn.addEventListener('click', () => {
    const replaced = JSON.stringify(existing);            // so Undo can put it back
    const n = accepted.size;
    if (!changes.length || n === units.length) {
      incoming.meta.id = existing.meta.id;
      store.saveBid(incoming); openBid(incoming.meta.id); close();
      app.undoStack.push({ json: replaced, label: 'import of ' + sourceName });
      app.syncUndoButtons();
      toast(changes.length ? 'Took everything from the file (Rev ' + incoming.meta.rev + ') — Undo puts your version back'
        : 'Reloaded from the file');
      return;
    }
    if (n === 0) { close(); toast('Kept your version — nothing changed'); return; }
    const merged = applyDiffUnits(existing, units, accepted);
    merged.meta.id = existing.meta.id;
    store.saveBid(merged); openBid(merged.meta.id); close();
    app.undoStack.push({ json: replaced, label: 'import of ' + sourceName + ' (' + n + ' change' + (n === 1 ? '' : 's') + ')' });
    app.syncUndoButtons();
    toast('Applied ' + n + ' of ' + units.length + ' changes — Undo puts your version back');
  });

  const foot = el('div', { class: 'foot' },
    el('button', { class: 'btn sec', onclick: close }, 'Cancel — keep mine'),
    el('button', {
      class: 'btn sec', onclick: () => {
        incoming.meta.id = uid();
        incoming.info.jobName = (incoming.info.jobName || 'Untitled') + ' (imported copy)';
        store.saveBid(incoming); openBid(incoming.meta.id); close();
        toast('Saved as a separate copy');
      }
    }, 'Keep both (save as copy)'),
    applyBtn);
  const modal = el('div', { class: 'modal' }, el('h3', {}, 'Import — choose what to take'), body, foot);
  back.append(modal);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.body.append(back);
}
