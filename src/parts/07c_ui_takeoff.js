// ============================================================
// Page: TakeOff
// ============================================================
'use strict';

function newTakeoffItem() {
  return { matPhase: '', shopPhase: '', fieldPhase: '', desc: '', qty: '', fUnit: '', fMult: '', sUnit: '', sMult: '', mUnit: '', notes: '', emo: '', ot: '', shift: '', plug: false };
}
// Session-scoped open/closed state for takeoff groups (survives re-renders)
const TAKEOFF_OPEN = new Set([0, 1, 2]);

router.routes.takeoff = {
  title: () => 'TakeOff',
  needsBid: true,
  render(v) {
    const bid = app.bid, S = app.settings, c = app.computed;
    const to = c.takeoff;

    ensureDatalist('dlMat', S.ref.phaseField.material);
    ensureDatalist('dlShop', S.ref.phaseField.shop);
    ensureDatalist('dlField', S.ref.phaseField.field);

    // sanity banner (mirrors D4:D6 checks — here: engine internal consistency)
    const bar = el('div', { class: 'pad formrow', style: 'align-items:center' },
      el('div', {}, el('label', {}, 'Field Hours'), el('b', {}, fmt.hrs(to.totals.H7))),
      el('div', {}, el('label', {}, 'Shop Hours'), el('b', {}, fmt.hrs(to.totals.K7))),
      el('div', {}, el('label', {}, 'Material'), el('b', {}, fmt.money(to.totals.M7))),
      el('div', {}, el('label', {}, 'Field Labor $'), el('b', {}, fmt.money(to.totals.AG7))),
      el('div', {}, el('label', {}, 'Shop Labor $'), el('b', {}, fmt.money(to.totals.AH7))),
      el('div', {}, el('label', {}, 'Total w/ Material'), el('b', {}, fmt.money(to.totals.AJ7))),
      el('span', { style: 'flex:1' }),
      el('button', {
        class: 'btn', onclick: () => {
          const nextId = 1 + Math.max(0, ...bid.takeoff.groups.map(g => Number(g.id) || 0));
          TAKEOFF_OPEN.add(bid.takeoff.groups.length);
          bid.takeoff.groups.push({ id: nextId, name: '', type: '', exclude: false, items: [newTakeoffItem(), newTakeoffItem(), newTakeoffItem()] });
          app.touch(); router.render();
        }
      }, '+ Add Group'));
    v.append(el('div', { class: 'card' }, el('h2', {}, 'TakeOff Totals'), bar,
      el('div', { class: 'pad hint', style: 'padding-top:0' }, 'Enter moves down a column · Shift+Enter moves up · Ctrl+D copies the cell above · Esc undoes what you just typed in a cell')));

    // ---- CAE group (auto from SM Import) ----
    const cae = to.groups[0];
    if (cae.subH || cae.subK || cae.subM || bid.smImport.rows.length) {
      const t = el('table', { class: 'grid' });
      t.append(th('Mat Ph', 'Shop Ph', 'Field Ph', 'Description', { t: 'Qty', num: 1 }, { t: 'Field Hrs', num: 1 }, { t: 'Shop Hrs', num: 1 }, { t: 'Material', num: 1 }));
      cae.rows.forEach(rr => {
        if (!rr.qty && !rr.calc.H && !rr.calc.K && !rr.calc.M) return;
        t.append(el('tr', {}, tdTxt(rr.matPhase, 'calc'), tdTxt(rr.shopPhase, 'calc'), tdTxt(rr.fieldPhase, 'calc'), tdTxt(rr.desc, 'calc'),
          calcCell(rr.qty, 'hrs'), calcCell(rr.calc.H, 'hrs'), calcCell(rr.calc.K, 'hrs'), calcCell(rr.calc.M, 'money')));
      });
      t.append(el('tr', { class: 'subtotal' }, tdTxt('CAE Subtotal', '', ), tdTxt(''), tdTxt(''), tdTxt(''), tdTxt(''), calcCell(cae.subH, 'hrs'), calcCell(cae.subK, 'hrs'), calcCell(cae.subM, 'money')));
      const head = el('summary', {}, el('span', { class: 'caret' }, '▶'), el('b', {}, 'CAE (from SM Import)'),
        el('span', {}, ' Type: '), selIn('takeoff.caeType', S.ref.takeoffTypes, { rerender: true }),
        el('button', {
          class: 'btn sm sec', onclick: (e) => { e.preventDefault(); relocateCae(); },
          title: 'Copy the CAE lines into a takeoff group as editable items (qty 1, unit = total) and clear SM Import — the old "Relocate CAE" macro'
        }, 'Relocate CAE → group'),
        el('span', { class: 'sums' }, fmt.hrs(cae.subH) + ' fld hrs · ' + fmt.hrs(cae.subK) + ' shop hrs · ' + fmt.money(cae.subM)));
      v.append(el('details', { class: 'togroup', open: '' }, head, wrap(t)));
    } else {
      v.append(el('div', { class: 'card' }, el('div', { class: 'pad hint' },
        'CAE group is empty — drop your takeoff export (FESTR.txt or FESTR_QP.txt) on the ',
        el('a', { href: '#/smimport' }, 'SM Import'), ' page and the CAE lines fill in automatically. ',
        el('a', { href: '#/howto' }, 'Where do I find that file?'))));
    }

    // ---- numbered groups ----
    bid.takeoff.groups.forEach((g, gi) => v.append(renderTakeoffGroup(bid, S, to, g, gi)));
  },
};

function renderTakeoffGroup(bid, S, to, g, gi) {
  const cg = to.groups[gi + 1]; // +1: CAE occupies index 0
  const base = 'takeoff.groups[' + gi + ']';
  const head = el('summary', {},
    el('span', { class: 'caret' }, '▶'),
    el('b', {}, (gi + 1) + '.'),
    (() => { const i = textIn(base + '.name', { placeholder: '(group name)', minCh: 26, maxCh: 52, after: () => { app.touch(); } }); i.addEventListener('click', e => e.preventDefault()); return i; })(),
    selIn(base + '.type', S.ref.takeoffTypes, { rerender: true }),
    ckIn(base + '.exclude', 'Exclude'),
    g.exclude ? el('span', { class: 'excl-note' }, 'EXCLUDED — zeroed in totals') : null,
    el('span', { class: 'sums' }, fmt.hrs(cg.subH) + ' fld · ' + fmt.hrs(cg.subK) + ' shop · ' + fmt.money(cg.subM)));

  const t = el('table', { class: 'grid' });
  t.append(th('Mat Ph', 'Shop Ph', 'Field Ph', 'Description', { t: 'Qty', num: 1 }, { t: 'Fld Unit', num: 1 }, { t: 'Fld ×', num: 1 },
    { t: 'Fld Hrs', num: 1 }, { t: 'Shp Unit', num: 1 }, { t: 'Shp ×', num: 1 }, { t: 'Shp Hrs', num: 1 },
    { t: 'Mat Unit $', num: 1 }, { t: 'Material $', num: 1 }, 'Notes', 'EMO', 'OT', 'Shift', ''));
  g.items.forEach((it, ii) => {
    const p = base + '.items[' + ii + ']';
    const cr = cg.rows[ii].calc;
    const mk = (path, opts) => tdIn(numIn(path, { ...opts, after: rerender }));
    const phaseIn = (path, dl) => {
      const i = el('input', { type: 'text', value: pathGet(app.bid, path) ?? '', list: dl, style: 'width:64px', 'data-path': path });
      i.addEventListener('change', () => { pathSet(app.bid, path, i.value); app.touch(); });
      return tdIn(i);
    };
    t.append(el('tr', {},
      phaseIn(p + '.matPhase', 'dlMat'),
      phaseIn(p + '.shopPhase', 'dlShop'),
      phaseIn(p + '.fieldPhase', 'dlField'),
      tdIn((() => { const i = textIn(p + '.desc'); if (it.plug) i.style.color = '#c00'; return i; })()),
      mk(p + '.qty', {}), mk(p + '.fUnit', {}), mk(p + '.fMult', { placeholder: '1' }),
      calcCell(cr.H, 'hrs'),
      mk(p + '.sUnit', {}), mk(p + '.sMult', { placeholder: '1' }),
      calcCell(cr.K, 'hrs'),
      mk(p + '.mUnit', { exprPath: p + '.mUnitExpr' }),
      calcCell(cr.M, 'money'),
      tdIn(textIn(p + '.notes')),
      tdIn(selIn(p + '.emo', ['Yes'], { blank: true, rerender: true })),
      tdIn(selIn(p + '.ot', ['OT', 'DBLT'], { blank: true, rerender: true })),
      tdIn(selIn(p + '.shift', ['SWING', 'GRAVE', 'SPECIAL'], { blank: true, rerender: true })),
      el('td', {}, el('button', {
        class: 'btn sm danger', title: 'Delete row', onclick: () => {
          if (it.desc || it.qty || it.mUnit) { if (!confirm('Delete row "' + (it.desc || '') + '"?')) return; }
          g.items.splice(ii, 1); app.touch(); router.render();
        }
      }, '×'))));
  });
  const foot = el('div', { class: 'pad formrow' },
    el('button', { class: 'btn sm sec', onclick: () => { g.items.push(newTakeoffItem()); app.touch(); router.render(); } }, '+ Row'),
    el('button', { class: 'btn sm sec', onclick: () => { g.items.push(...Array(5).fill(0).map(newTakeoffItem)); app.touch(); router.render(); } }, '+ 5 Rows'),
    el('span', { style: 'flex:1' }),
    el('button', {
      class: 'btn sm danger', onclick: () => {
        if (!confirm('Delete group "' + (g.name || ('#' + (gi + 1))) + '" and all its rows?')) return;
        bid.takeoff.groups.splice(gi, 1); app.touch(); router.render();
      }
    }, 'Delete group'));
  const details = el('details', { class: 'togroup' + (g.exclude ? ' excluded' : '') }, head, wrap(t), foot);
  details.open = TAKEOFF_OPEN.has(gi);
  details.addEventListener('toggle', () => { if (details.open) TAKEOFF_OPEN.add(gi); else TAKEOFF_OPEN.delete(gi); });
  return details;
}

// Relocate CAE: port of the Copy_CAEn VBA — values into a group, qty=1, unit=total; SM Import cleared.
function relocateCae() {
  const bid = app.bid;
  const cae = app.computed.takeoff.groups[0];
  if (!cae.rows.some(r => r.calc.H || r.calc.K || r.calc.M || r.qty)) { toast('CAE group is empty — nothing to relocate', true); return; }
  const name = prompt('Name for the new takeoff group (section name):', 'CAE Import');
  if (name === null) return;
  const items = cae.rows
    .filter(r => r.qty || r.calc.H || r.calc.K || r.calc.M)
    .map(r => ({
      ...newTakeoffItem(),
      matPhase: r.matPhase, shopPhase: r.shopPhase, fieldPhase: r.fieldPhase, desc: r.desc,
      qty: 1, fUnit: r.calc.H, sUnit: r.calc.K, mUnit: r.calc.M,
    }));
  bid.takeoff.groups.push({ id: bid.takeoff.groups.length + 1, name, type: bid.takeoff.caeType || '', exclude: false, items });
  bid.smImport.rows = [];   // Remove_CAE_NoQuestion equivalent
  app.touch(); router.render();
  toast('CAE relocated into group "' + name + '" — SM Import cleared');
}
