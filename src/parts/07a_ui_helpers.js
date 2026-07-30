// ============================================================
// UI helpers: bound inputs, tables, cells
// ============================================================
'use strict';

// Safe arithmetic for typed expressions like "=80730+250" or "=(80980*0.0057)"
function evalExpr(s) {
  const body = String(s).replace(/^=/, '').replace(/[$,\s]/g, '');
  if (!/^[-+*/().\d%]+$/.test(body) || !/\d/.test(body)) return null;
  try {
    const v = Function('"use strict";return (' + body.replace(/%/g, '/100') + ')')();
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  } catch (e) { return null; }
}

// Focus-preserving deferred re-render: lets Tab/click move focus first, then
// re-renders and restores focus to the field the user landed on (by data-path).
let rerenderPending = false;
function rerender() {
  // Coalesce: several inputs can ask for a re-render in the same tick, and each
  // one is a full page rebuild that restores focus to wherever the cursor was at
  // ITS moment — which makes focus fight itself while the user keeps typing.
  // One render per tick, using the latest focus, is both correct and faster.
  if (rerenderPending) return;
  rerenderPending = true;
  setTimeout(() => {
    rerenderPending = false;
    const active = document.activeElement;
    const fp = active && active.dataset ? active.dataset.path : null;
    const pos = active && active.selectionStart != null ? active.selectionStart : null;
    router.render();
    if (fp) {
      const again = document.querySelector('[data-path="' + CSS.escape(fp) + '"]');
      if (again) {
        again.focus();
        try { if (pos != null && again.setSelectionRange) again.setSelectionRange(pos, pos); } catch (e) { }
      }
    }
  }, 0);
}

// Grow an input so its whole value stays readable instead of being clipped by the
// box. The widest value in a column sets that column's width; when the columns
// together need more room than the window, the grid scrolls sideways (like Excel).
// Anything past the cap keeps its full text in a hover tooltip.
function autoWidth(i, min, max) {
  i.dataset.minch = min; i.dataset.maxch = max;
  const len = String(i.value ?? '').length;
  i.style.minWidth = Math.max(min, Math.min(max, len + 1)) + 'ch';   // first guess, refined by fitInputs()
  return i;
}

// Second pass, run after a page renders: measures each value in the font the input
// actually got, so capital-heavy text ("Multomah Cty Tax (.15%...") is sized from
// real glyph widths rather than an average-character guess.
function fitInputs(root) {
  const ctx = fitInputs.ctx || (fitInputs.ctx = document.createElement('canvas').getContext('2d'));
  for (const i of root.querySelectorAll('input[data-minch]')) {
    const v = String(i.value ?? '');
    if (!v) continue;
    const cs = getComputedStyle(i);
    ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    const ch = ctx.measureText('0').width || 7;
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 6;   // borders + caret
    const need = ctx.measureText(v).width + pad;
    const lo = Number(i.dataset.minch) * ch, hi = Number(i.dataset.maxch) * ch;
    i.style.minWidth = Math.round(Math.min(hi, Math.max(lo, need))) + 'px';
    if (need > hi) i.title = v;                    // past the cap: full text on hover
    else if (i.title === v) i.title = '';
  }
}

// Numeric input bound to a bid path. opts: {pct, dec, int, allowNull(default true->null when empty), placeholder, title}
function numIn(path, opts = {}) {
  const cur = pathGet(app.bid, path);
  const show = (v) => {
    if (v === null || v === undefined || v === '') return '';
    if (opts.pct) return fmt.num(v * 100, opts.dec ?? 1);
    return fmt.num(v, opts.dec ?? (opts.int ? 0 : 2));
  };
  const i = el('input', {
    class: 'num', inputmode: 'decimal', value: show(cur),
    placeholder: opts.placeholder || '', title: opts.title || null, 'data-path': path,
  });
  autoWidth(i, opts.minCh ?? 6, opts.maxCh ?? 16);
  i.addEventListener('change', () => {
    let raw = i.value.trim();
    let v = null;
    if (raw !== '') {
      v = raw.startsWith('=') ? evalExpr(raw) : fmt.parseNum(raw);
      if (v === null) { toast('Could not read "' + raw + '" as a number', true); i.value = show(pathGet(app.bid, path)); return; }
      if (opts.pct) v = v / 100;
      if (opts.int) v = Math.round(v);
    }
    if (v === null && opts.zeroWhenEmpty) v = 0;
    pathSet(app.bid, path, v);
    // keep the typed arithmetic itself when the field supports it (exports back into the cell as a formula)
    if (opts.exprPath) pathSet(app.bid, opts.exprPath, raw.startsWith('=') && v !== null ? raw : null);
    app.touch();
    i.value = show(v);
    autoWidth(i, opts.minCh ?? 6, opts.maxCh ?? 16);
    if (opts.after) opts.after();
  });
  if (opts.exprPath) {
    i.dataset.exprPath = opts.exprPath;       // so fill-down can copy the typed formula too
    const ex = pathGet(app.bid, opts.exprPath);
    if (ex) i.title = 'Typed as ' + ex;
  }
  return i;
}

function textIn(path, opts = {}) {
  const i = el('input', { type: 'text', value: pathGet(app.bid, path) ?? '', placeholder: opts.placeholder || '', list: opts.list || null, 'data-path': path });
  autoWidth(i, opts.minCh ?? 12, opts.maxCh ?? 46);
  i.addEventListener('change', () => {
    pathSet(app.bid, path, i.value); app.touch();
    autoWidth(i, opts.minCh ?? 12, opts.maxCh ?? 46);
    if (opts.after) opts.after();
  });
  return i;
}

function selIn(path, options, opts = {}) {
  const cur = pathGet(app.bid, path) ?? '';
  const s = el('select', { 'data-path': path },
    (opts.blank ? [el('option', { value: '' }, opts.blankLabel || '—')] : []),
    options.map(o => {
      const [v, label] = Array.isArray(o) ? o : [o, o];
      const opt = el('option', { value: v }, label);
      if (String(v) === String(cur)) opt.selected = true;
      return opt;
    }));
  s.addEventListener('change', () => {
    // opts.num: options whose values are codes (the OCIP form answers) stay numbers
    pathSet(app.bid, path, opts.num ? Number(s.value) : s.value);
    app.touch();
    if (opts.after) opts.after(); else if (opts.rerender !== false) rerender();
  });
  return s;
}

function ckIn(path, label, opts = {}) {
  const c = el('input', { type: 'checkbox' });
  c.checked = pathGet(app.bid, path) === true;
  c.addEventListener('change', () => { pathSet(app.bid, path, c.checked); app.touch(); if (opts.after) opts.after(); else rerender(); });
  return el('label', { class: 'ck' }, c, label);
}

// read-only computed cell
function calcCell(v, kind, opts = {}) {
  const text = kind === 'money' ? fmt.money(v, opts.dec ?? 2)
    : kind === 'pct' ? fmt.pct(v, opts.dec ?? 1)
      : kind === 'hrs' ? fmt.hrs(v)
        : kind === 'int' ? fmt.int(v) : String(v ?? '');
  return el('td', { class: 'num calc', title: opts.title || null }, text);
}
function th(...labels) { return el('tr', {}, labels.map(l => el('th', typeof l === 'object' && l.num ? { class: 'num' } : {}, typeof l === 'object' ? l.t : l))); }
function tdIn(input, cls) { return el('td', { class: cls || '' }, input); }
function tdTxt(t, cls) { return el('td', { class: cls || '' }, t); }

// datalist registry for phase codes etc.
const DATALISTS = {};
function ensureDatalist(id, values) {
  if (DATALISTS[id]) return id;
  const dl = el('datalist', { id });
  for (const v of values) dl.append(el('option', { value: v }));
  document.body.append(dl);
  DATALISTS[id] = true;
  return id;
}
