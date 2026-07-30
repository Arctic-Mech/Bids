// ============================================================
// Pages: Home (bid library), Export, Settings shell, boot
// ============================================================
'use strict';

function openBid(id) {
  const bid = store.loadBid(id);
  if (!bid) { toast('Could not load that bid', true); return; }
  app.bid = migrateBid(bid);
  app.dirty = false;
  app.baseSavedAt = bid.meta.savedAt || null;
  localStorage.setItem(store.KEY_ACTIVE, id);
  app.resetHistory();
  app.recalc();
  router.go('recap');
  router.render();
}

function newBid() {
  const S = effectiveSettings();
  const bid = makeNewBid(S);
  bid.settingsSnapshot = S;              // freeze company rates with the bid
  store.saveBid(bid);
  openBid(bid.meta.id);
  toast('New bid created — start with the job info on the Recap page');
}

router.routes.home = {
  title: () => 'Home — Saved Bids',
  needsBid: false,
  render(v) {
    const ix = store.index();
    const bar = el('div', { class: 'formrow', style: 'align-items:center' },
      el('button', { class: 'btn', onclick: newBid }, '+ New Bid'),
      el('button', { class: 'btn sec', onclick: () => $('#fileImport').click() }, '⬆ Import bid (.pdf / .zip / .json)'),
      el('span', { class: 'hint' }, 'Bids are stored in this browser (localStorage). Export to PDF/ZIP to file them on the server or share.'));
    v.append(el('div', { class: 'card' }, el('div', { class: 'pad' }, bar)));

    if (!ix.length) {
      v.append(el('div', { class: 'card' }, el('div', { class: 'pad' },
        el('p', {}, 'No bids on this computer yet.'),
        el('p', { class: 'hint' }, 'Create a new bid, or import one that was exported from this tool (a ZIP or any of its PDFs — the full bid data rides inside every export).'))));
      return;
    }
    const grid = el('div', { class: 'bidcards' });
    for (const b of ix) {
      const card = el('div', { class: 'bidcard', onclick: () => openBid(b.id) },
        el('h3', {}, (b.estNo ? b.estNo + ' — ' : '') + (b.jobName || 'Untitled')),
        el('div', { class: 'amt' }, b.total ? fmt.money(b.total) : '—'),
        el('div', { class: 'meta' }, 'Rev ' + b.rev + ' · saved ' + fmt.dateTime(b.savedAt)),
        el('div', { class: 'rowbtns' },
          el('button', { class: 'btn sm sec', onclick: (e) => { e.stopPropagation(); openBid(b.id); } }, 'Open'),
          el('button', {
            class: 'btn sm sec', onclick: (e) => {
              e.stopPropagation();
              const bid = store.loadBid(b.id); if (!bid) return;
              const copy = deepClone(bid);
              copy.meta.id = uid(); copy.meta.rev = (Number(copy.meta.rev) || 0) + 1;
              store.saveBid(copy); router.render();
              toast('Created Rev ' + copy.meta.rev + ' as a new copy — the old rev stays saved');
            }, title: 'Duplicate as next rev'
          }, 'New Rev'),
          el('button', {
            class: 'btn sm danger', onclick: (e) => {
              e.stopPropagation();
              if (confirm('Delete "' + (b.jobName || b.estNo) + '" (Rev ' + b.rev + ') from this computer?\nExported files are not affected.')) {
                if (app.bid && app.bid.meta.id === b.id) { app.bid = null; app.computed = null; }
                store.deleteBid(b.id); router.render();
              }
            }
          }, 'Delete')));
      grid.append(card);
    }
    v.append(grid);
  },
};

// ---------- Export page ----------
router.routes.export = {
  title: () => 'Export / PDF',
  needsBid: true,
  render(v) {
    const keys = Object.keys(PDF_PAGES);
    const boxes = {};
    const list = el('div', { class: 'pad' });
    list.append(el('p', { class: 'hint' }, 'Files are named "', el('b', {}, bidFileBase(app.bid)), ' - Page.pdf" — the same convention as the spreadsheet. Every PDF (and the ZIP) carries the full bid data inside it, so importing any of these files later restores the whole bid exactly.'));
    for (const k of keys) {
      const cb = el('input', { type: 'checkbox', checked: '' });
      boxes[k] = cb;
      list.append(el('div', {}, el('label', { class: 'ck' }, cb, PDF_PAGES[k].label)));
    }
    const selected = () => keys.filter(k => boxes[k].checked);
    const btns = el('div', { class: 'formrow', style: 'margin-top:12px' },
      el('button', {
        class: 'btn', onclick: async () => {
          const s = selected(); if (!s.length) return toast('Pick at least one page', true);
          try { await exportZip(s); } catch (e) { console.error(e); toast('Export failed: ' + e.message, true); }
        }
      }, '⬇ Export as ZIP (one PDF per page + bid.json)'),
      el('button', {
        class: 'btn sec', onclick: async () => {
          const s = selected(); if (!s.length) return toast('Pick at least one page', true);
          try { await exportPdf(s, s.length === 1 ? PDF_PAGES[s[0]].label : null); } catch (e) { console.error(e); toast('Export failed: ' + e.message, true); }
        }
      }, '⬇ Export as one PDF (selected pages combined)'),
      el('button', {
        class: 'btn sec', onclick: () => {
          downloadBytes(bidFileBase(app.bid) + '.json', new TextEncoder().encode(exportBidJson(app.bid)), 'application/json');
        }
      }, '⬇ Bid data only (.json)'));
    const xlsmBtns = el('div', { class: 'formrow', style: 'margin-top:4px' },
      el('button', {
        class: 'btn', onclick: async () => {
          try { toast('Building spreadsheet…'); await exportXlsm(); }
          catch (e) { console.error(e); toast('Spreadsheet export failed: ' + e.message, true); }
        }
      }, '⬇ Export as Spreadsheet (.xlsm) — the original workbook'),
      el('span', { class: 'hint', style: 'align-self:center' },
        'A genuine copy of the estimating workbook with this bid\'s inputs filled in — identical look, formulas, macros and protection. Anyone can keep working on it in Excel, and this site can re-import it (or any original workbook) with the same compare-before-override step.'));
    const all = el('div', { class: 'formrow' },
      el('button', { class: 'btn sm sec', onclick: () => { keys.forEach(k => boxes[k].checked = true); } }, 'Select all'),
      el('button', { class: 'btn sm sec', onclick: () => { keys.forEach(k => boxes[k].checked = false); } }, 'Select none'));
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Choose pages to export'), list));
    list.prepend(all);
    list.append(btns);
    list.append(xlsmBtns);
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Import'), el('div', { class: 'pad' },
      el('p', {}, 'Load a bid from a file that was exported here (older or newer revision). You will see exactly what is different before anything is overwritten.'),
      el('button', { class: 'btn sec', onclick: () => $('#fileImport').click() }, '⬆ Import bid (.pdf / .zip / .json)'))));
  },
};

// ---------- boot ----------
async function boot() {
  $('#logoImg').src = 'data:image/png;base64,' + ASSETS.wordmark;
  // Excel-like: focusing a bound numeric cell selects its content
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.path && t.select && t.classList.contains('num')) {
      setTimeout(() => { try { t.select(); } catch (err) { } }, 0);
    }
  });
  $('#verLabel').textContent = 'v' + APP_VERSION + ' — replaces REV_1 estimate workbook';
  // tab icon: swap the placeholder monogram for the company seal (bytes already embedded)
  const favi = document.querySelector('link[rel=icon]');
  if (favi && typeof ASSETS !== 'undefined' && ASSETS.seal) favi.href = 'data:image/jpeg;base64,' + ASSETS.seal;
  $('#btnSave').addEventListener('click', () => { app.saveNow(true); toast('Saved'); });
  installGridNav();            // Enter/arrows move between grid cells, Ctrl+D fills down
  $('#btnUndo').addEventListener('click', () => app.undo());
  $('#btnRedo').addEventListener('click', () => app.redo());
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); app.undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); app.redo(); }
  });
  $('#fileImport').addEventListener('change', async (e) => {
    await handleImportFiles(Array.from(e.target.files));
    e.target.value = '';
  });
  // The rates and the workbook are not in this page — they come from the company
  // file. Without it there is nothing to price a bid with, so ask for it first.
  let companyRec = null;
  try { companyRec = await companyRestore(); } catch (e) { console.warn('company file:', e.message); }
  if (!COMPANY) {
    $('#bidName').innerHTML = '<b>Setup needed</b>Load the Arctic company file';
    $('#pageTitle').textContent = 'Setup';
    renderCompanySetup(() => location.reload());
    return;
  }

  // restore last open bid
  const activeId = localStorage.getItem(store.KEY_ACTIVE);
  if (activeId && store.loadBid(activeId)) {
    const stored = store.loadBid(activeId);
    app.bid = migrateBid(stored);
    app.dirty = false;
    app.baseSavedAt = stored.meta.savedAt || null;
    app.resetHistory();
    app.recalc();
  }
  if (!location.hash) location.replace('#/home');
  router.render();
}
document.addEventListener('DOMContentLoaded', boot);
