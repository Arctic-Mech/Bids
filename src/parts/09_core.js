// ============================================================
// Core: storage, router, app state, helpers
// ============================================================
'use strict';

const $ = (sel, el) => (el || document).querySelector(sel);
const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) {
    if (k === null || k === undefined) continue;
    e.append(k.nodeType ? k : document.createTextNode(k));
  }
  return e;
}

function toast(msg, bad) {
  $$('.toast').forEach(t => t.remove());
  const t = el('div', { class: 'toast' + (bad ? ' bad' : '') }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), bad ? 6000 : 3200);
}

// Progress overlay for work that takes long enough to notice (reading a workbook,
// building a spreadsheet, writing a stack of PDFs). step() awaits a paint, which
// both moves the bar and hands the main thread back so the tab never looks hung.
const nextPaint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));

function progressStart(title) {
  $$('.prog-back').forEach(x => x.remove());
  const fill = el('div', { class: 'fill indet' });
  const stage = el('div', { class: 'stage' }, 'Starting…');
  const pct = el('div', { class: 'pct' }, '');
  const back = el('div', { class: 'prog-back' },
    el('div', { class: 'prog' }, el('h4', {}, title), el('div', { class: 'track' }, fill), stage, pct));
  document.body.append(back);
  let done = false;
  return {
    // frac: 0..1, or null to keep the indeterminate sweep
    async step(frac, label) {
      if (done) return;
      if (label) stage.textContent = label;
      if (frac == null) { fill.classList.add('indet'); pct.textContent = ''; }
      else {
        fill.classList.remove('indet');
        const p = Math.max(0, Math.min(1, frac));
        fill.style.width = (p * 100).toFixed(0) + '%';
        pct.textContent = (p * 100).toFixed(0) + '%';
      }
      await nextPaint();
    },
    done() { done = true; back.remove(); },
  };
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// path get/set: "recap.mods.plumb[2].pct"
function pathGet(obj, path) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = obj;
  for (const p of parts) { if (cur == null) return undefined; cur = cur[p]; }
  return cur;
}
let LAST_EDIT_PATH = null;      // used to label undo steps
function pathSet(obj, path, val) {
  if (obj === (typeof app !== 'undefined' && app ? app.bid : null)) LAST_EDIT_PATH = path;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = val;
}

// ---------- storage ----------
const store = {
  KEY_INDEX: 'arctic.bids.index',
  KEY_BID: (id) => 'arctic.bid.' + id,
  KEY_SETTINGS: 'arctic.settings.overrides',
  KEY_ACTIVE: 'arctic.activeBid',

  index() { try { return JSON.parse(localStorage.getItem(this.KEY_INDEX)) || []; } catch (e) { return []; } },
  saveIndex(ix) { localStorage.setItem(this.KEY_INDEX, JSON.stringify(ix)); },
  loadBid(id) { try { return JSON.parse(localStorage.getItem(this.KEY_BID(id))); } catch (e) { return null; } },
  saveBid(bid) {
    // stamp the bid's own total when it is the open, freshly-computed bid
    if (app.bid && app.bid.meta.id === bid.meta.id && app.computed && app.computed.recap) {
      bid.meta.lastTotal = app.computed.recap.totalBid;
    }
    bid.meta.savedAt = new Date().toISOString();
    try {
      localStorage.setItem(this.KEY_BID(bid.meta.id), JSON.stringify(bid));
      const prev = this.index().find(x => x.id === bid.meta.id);
      const ix = this.index().filter(x => x.id !== bid.meta.id);
      ix.unshift({
        id: bid.meta.id, estNo: bid.info.estNo, jobName: bid.info.jobName, rev: bid.meta.rev,
        savedAt: bid.meta.savedAt,
        total: bid.meta.lastTotal ?? (prev ? prev.total : 0) ?? 0,
      });
      this.saveIndex(ix);
    } catch (e) {
      // quota exceeded or storage disabled — never fail silently
      toast('SAVE FAILED — browser storage is full or blocked. Export this bid to a file NOW so you do not lose work, then delete old bids from Home.', true);
      throw e;
    }
  },
  deleteBid(id) {
    localStorage.removeItem(this.KEY_BID(id));
    this.saveIndex(this.index().filter(x => x.id !== id));
    if (localStorage.getItem(this.KEY_ACTIVE) === id) localStorage.removeItem(this.KEY_ACTIVE);
  },
  settingsOverrides() { try { return JSON.parse(localStorage.getItem(this.KEY_SETTINGS)) || {}; } catch (e) { return {}; } },
  saveSettingsOverrides(o) { localStorage.setItem(this.KEY_SETTINGS, JSON.stringify(o)); },
};

// Effective settings = factory defaults + user overrides (flat path map)
function effectiveSettings() {
  const s = deepClone(COMPANY);
  const ov = store.settingsOverrides();
  for (const [path, val] of Object.entries(ov)) pathSet(s, path, val);
  return s;
}

// ---------- app state ----------
const UNDO_LIMIT = 40;

const app = {
  bid: null,          // active bid (mutable)
  computed: null,     // engine output
  settings: null,     // effective settings used for the active bid
  dirty: false,
  saveTimer: null,
  undoStack: [],      // [{json, label}] states BEFORE each change, oldest first
  redoStack: [],
  snapshot: null,     // serialized current bid, taken at the last settled state

  // Called whenever a bid becomes the active one (open / new / import / undo)
  resetHistory() {
    this.undoStack = []; this.redoStack = [];
    this.snapshot = this.bid ? JSON.stringify(this.bid) : null;
    this.syncUndoButtons();
  },
  pushUndo() {
    if (!this.bid) return;
    const now = JSON.stringify(this.bid);
    if (this.snapshot === null) { this.snapshot = now; return; }
    if (this.snapshot === now) return;                  // nothing actually changed
    this.undoStack.push({ json: this.snapshot, label: undoLabel(LAST_EDIT_PATH) });
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];                               // a new edit invalidates redo
    this.snapshot = now;
    this.syncUndoButtons();
  },
  _restore(json) {
    this.bid = migrateBid(JSON.parse(json));
    this.snapshot = JSON.stringify(this.bid);
    this.dirty = true;
    this.recalc();
    this.saveNow(true);
    router.render();
    this.syncUndoButtons();
  },
  undo() {
    if (!this.undoStack.length) { toast('Nothing to undo'); return; }
    const step = this.undoStack.pop();
    this.redoStack.push({ json: this.snapshot, label: step.label });
    this._restore(step.json);
    toast('Undid ' + (step.label || 'last change'));
  },
  redo() {
    if (!this.redoStack.length) { toast('Nothing to redo'); return; }
    const step = this.redoStack.pop();
    this.undoStack.push({ json: this.snapshot, label: step.label });
    this._restore(step.json);
    toast('Redid ' + (step.label || 'last change'));
  },
  syncUndoButtons() {
    const u = $('#btnUndo'), r = $('#btnRedo');
    if (u) {
      u.disabled = !this.undoStack.length;
      const last = this.undoStack[this.undoStack.length - 1];
      u.title = last ? 'Undo ' + last.label + '  (Ctrl+Z)' : 'Nothing to undo  (Ctrl+Z)';
    }
    if (r) {
      r.disabled = !this.redoStack.length;
      const last = this.redoStack[this.redoStack.length - 1];
      r.title = last ? 'Redo ' + last.label + '  (Ctrl+Shift+Z)' : 'Nothing to redo  (Ctrl+Shift+Z)';
    }
  },

  recalc() {
    if (!this.bid) return;
    this.settings = this.bid.settingsSnapshot || effectiveSettings();
    this.computed = calcBid(this.bid, this.settings);
    const t = $('#topTotal');
    if (t) t.textContent = fmt.money(this.computed.recap.totalBid);
  },
  touch() {                     // input changed: recalc + autosave (debounced)
    if (!this.bid) return;
    this.pushUndo();
    this.dirty = true;
    this.recalc();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.saveNow(); }, 400);
  },
  saveNow(force) {
    if (!this.bid) return;
    if (!this.dirty && !force) return;               // never write a stale copy (multi-tab safety)
    // detect another tab having saved this bid since we loaded/saved it
    const stored = store.loadBid(this.bid.meta.id);
    if (stored && stored.meta.savedAt && stored.meta.savedAt !== this.baseSavedAt) {
      if (!confirm('This bid was also changed in another tab or window.\n\nOK = keep THIS tab’s version (overwrites the other tab’s save)\nCancel = discard this tab’s unsaved changes and reload the other version')) {
        const fresh = migrateBid(stored);
        this.bid = fresh; this.dirty = false; this.baseSavedAt = stored.meta.savedAt;
        this.recalc(); router.render();
        return;
      }
    }
    store.saveBid(this.bid);
    this.baseSavedAt = this.bid.meta.savedAt;
    this.dirty = false;
  },
};

// ---------- router (hash-based so Back works everywhere incl. iPhone) ----------
const router = {
  routes: {},            // name -> {title, render, needsBid}
  current: null,
  go(name, opts) {
    const target = '#/' + name;
    if (location.hash !== target) location.hash = target;  // pushes history entry
    else this.render();
  },
  render() {
    // Nothing can be priced, imported or exported without the company file, and
    // the sidebar is still on screen while the setup card is showing — so the gate
    // has to live HERE, not only in boot(). Clicking a link or changing the hash
    // used to render a real page with no rates behind it, and the first thing that
    // read a rate died with an error nobody could act on.
    if (!COMPANY) {
      $('#pageTitle').textContent = 'Setup';
      $('#bidName').innerHTML = '<b>Setup needed</b>Load the Arctic company file';
      $$('#sidebar nav a').forEach(a => a.classList.remove('active'));
      renderCompanySetup(() => location.reload());
      return;
    }
    let name = (location.hash || '#/home').replace(/^#\//, '') || 'home';
    let route = this.routes[name];
    if (!route) { name = 'home'; route = this.routes.home; }
    if (route.needsBid && !app.bid) { name = 'home'; route = this.routes.home; }
    const samePage = this.current === name;
    const keepX = window.scrollX, keepY = window.scrollY;
    this.current = name;
    $$('#sidebar nav a').forEach(a => a.classList.toggle('active', a.dataset.page === name));
    $('#pageTitle').textContent = route.title(!!app.bid);
    const v = $('#view');
    v.innerHTML = '';
    route.render(v);
    fitInputs(v);                                  // size inputs to their text (no clipped values)
    if (samePage) window.scrollTo(keepX, keepY);   // re-render in place: keep scroll
    else { v.scrollTop = 0; window.scrollTo(0, 0); }
    const bn = $('#bidName');
    if (app.bid) {
      bn.innerHTML = '<b>' + esc(app.bid.info.estNo || 'No Est #') + ' — Rev ' + esc(app.bid.meta.rev) + '</b>' + esc(app.bid.info.jobName || 'Untitled job');
    } else bn.innerHTML = '<b>No bid open</b>Open or create one from Home';
  },
};
window.addEventListener('hashchange', () => router.render());
// Flush the focused field (change only fires on blur), then save if dirty.
function flushAndSave() {
  const a = document.activeElement;
  if (a && a.blur && a !== document.body) a.blur();
  app.saveNow();
}
window.addEventListener('pagehide', flushAndSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAndSave(); });
