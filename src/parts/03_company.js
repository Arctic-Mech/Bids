// ============================================================
// Company file — the rates and the workbook, kept out of the published page
// ============================================================
// The app is published on the open internet, so it ships with NO company data
// in it. Wages, fringes, PT&I, workers-comp factors, permit tiers, bond
// brackets, OCIP rates and the estimate workbook all live in a single company
// file that Arctic keeps on its own network. Each computer loads that file once
// and it is remembered in the browser (IndexedDB — localStorage is too small
// for the 1.9 MB workbook).
'use strict';

const COMPANY_DB = 'arctic.company';
const COMPANY_STORE = 'file';
const COMPANY_KEY = 'current';

function companyDb() {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open(COMPANY_DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(COMPANY_STORE);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
function companyLoadStored() {
  return companyDb().then(db => new Promise((resolve, reject) => {
    const rq = db.transaction(COMPANY_STORE, 'readonly').objectStore(COMPANY_STORE).get(COMPANY_KEY);
    rq.onsuccess = () => resolve(rq.result || null);
    rq.onerror = () => reject(rq.error);
  })).catch(() => null);
}
function companySaveStored(rec) {
  return companyDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(COMPANY_STORE, 'readwrite');
    tx.objectStore(COMPANY_STORE).put(rec, COMPANY_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  }));
}
function companyForget() {
  return companyDb().then(db => new Promise((resolve) => {
    const tx = db.transaction(COMPANY_STORE, 'readwrite');
    tx.objectStore(COMPANY_STORE).delete(COMPANY_KEY);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  })).catch(() => false);
}

// Put a loaded company file into play. Accepts the .arctic file (a zip holding
// company_data.json and the workbook) or a bare company_data.json.
async function companyApply(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let dataJson = null, workbook = null;
  if (buf[0] === 0x50 && buf[1] === 0x4B) {                 // a zip
    const entries = await zipRead(buf);
    const dj = entries.find(e => /company_data\.json$/i.test(e.name));
    const wb = entries.find(e => /\.xlsm$/i.test(e.name));
    if (!dj) throw new Error('this file has no company_data.json in it');
    dataJson = new TextDecoder().decode(dj.bytes);
    workbook = wb ? wb.bytes : null;
  } else {
    dataJson = new TextDecoder().decode(buf);               // a bare json
  }
  let parsed;
  try { parsed = JSON.parse(dataJson); } catch (e) { throw new Error('the company data in that file is not readable'); }
  if (!parsed || !parsed.crew || !parsed.recap) throw new Error('that does not look like the Arctic company file');
  COMPANY = parsed;
  TEMPLATE_BYTES = workbook;
  _templateParts = null;                                    // a new workbook means a new template
  return { data: dataJson, workbook, loadedAt: new Date().toISOString() };
}

// Load + remember, so this only happens once per computer.
async function companyInstall(bytes) {
  const rec = await companyApply(bytes);
  try { await companySaveStored(rec); } catch (e) { toast('Loaded, but this browser would not remember it — you may have to load it again next time.', true); }
  return rec;
}

// Boot path: the remembered file, or a copy handed to us by a test.
async function companyRestore() {
  if (typeof ARCTIC_COMPANY_FILE !== 'undefined' && ARCTIC_COMPANY_FILE) {
    await companyApply(ARCTIC_COMPANY_FILE);
    return { loadedAt: null, injected: true };
  }
  const rec = await companyLoadStored();
  if (!rec) return null;
  try {
    COMPANY = JSON.parse(rec.data);
    TEMPLATE_BYTES = rec.workbook || null;
    return rec;
  } catch (e) { return null; }
}

// ---- the screen you see before the company file has been loaded ----
function renderCompanySetup(afterLoad) {
  const view = $('#view');
  view.innerHTML = '';
  const status = el('div', { class: 'hint', style: 'margin-top:10px' });
  const file = el('input', { type: 'file', accept: '.arctic,.zip,.json', style: 'display:none' });

  const load = async (f) => {
    if (!f) return;
    status.textContent = 'Reading ' + f.name + '…';
    try {
      await companyInstall(new Uint8Array(await f.arrayBuffer()));
      toast('Company file loaded — this computer will remember it');
      if (afterLoad) afterLoad();
    } catch (e) {
      status.innerHTML = '';
      status.append(el('span', { class: 'err' }, 'Could not use that file: ' + e.message));
    }
  };
  file.addEventListener('change', () => load(file.files[0]));

  const drop = el('div', { class: 'smi-drop', style: 'padding:26px' },
    el('b', {}, 'Drop the Arctic company file here'),
    el('div', { class: 'hint' }, 'or ', el('button', { class: 'btn', onclick: () => file.click() }, 'Choose the file'), file));
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('over'));
  drop.addEventListener('drop', async (e) => { e.preventDefault(); await load(e.dataTransfer.files[0]); });

  view.append(el('div', { class: 'card' },
    el('h2', {}, 'One-time setup'),
    el('div', { class: 'pad' },
      el('p', {}, 'This computer needs the Arctic company file before it can price a bid. ',
        'It holds the wage and fringe tables, the payroll tax and workers-comp factors, permit and bond ',
        'rates, and the estimate workbook the spreadsheet export is built from.'),
      el('p', {}, el('b', {}, 'You only do this once on each computer.'), ' The file is kept on the Arctic ',
        'network, not on this website — that is why it is not already here.'),
      drop, status,
      el('p', { class: 'hint', style: 'margin-top:14px' },
        'Bids you have already saved on this computer are untouched and will still be here afterwards.'))));
}
