// ============================================================
// Page: Estimate Recap (MCAA RECAP)
// ============================================================
'use strict';

function card(title, ...kids) {
  const h = el('h2', {}, title);
  return el('div', { class: 'card' }, h, ...kids);
}
function wrap(t) { return el('div', { class: 'tablewrap' }, t); }

router.routes.recap = {
  title: () => 'Estimate Recap',
  needsBid: true,
  render(v) {
    const c = app.computed, r = c.recap, bid = app.bid, S = app.settings;

    // ---------- Job info ----------
    const info = el('div', { class: 'pad' },
      el('div', { class: 'formrow' },
        el('div', {}, el('label', {}, 'Estimate # (Bid #)'), textIn('info.estNo', { placeholder: '25-800', after: rerender })),
        el('div', { style: 'flex:2' }, el('label', {}, 'Job Name'), textIn('info.jobName', { after: rerender })),
        el('div', {}, el('label', {}, 'Location'), textIn('info.location')),
        el('div', {}, el('label', {}, 'Bid Date'), (() => { const i = el('input', { type: 'date', value: bid.info.bidDate || '' }); i.addEventListener('change', () => { bid.info.bidDate = i.value; app.touch(); }); return i; })()),
        el('div', {}, el('label', {}, 'Bid Time'), (() => { const i = el('input', { type: 'time', value: bid.info.bidTime || '' }); i.addEventListener('change', () => { bid.info.bidTime = i.value; app.touch(); }); return i; })()),
        el('div', {}, el('label', {}, 'Revision'), numIn('meta.rev', { int: true, dec: 0, zeroWhenEmpty: true, after: rerender }))),
      el('div', { class: 'formrow' },
        el('div', {}, el('label', {}, 'Project Type'), selIn('info.projectType', S.ref.typeOfWork, { rerender: false })),
        el('div', {}, el('label', {}, 'Project SqFt'), numIn('info.projectSqFt', { dec: 0, after: rerender })),
        el('div', {}, el('label', {}, 'Material Lbs'), numIn('info.materialLbs', { dec: 0, after: rerender })),
        el('div', {}, el('label', {}, '$ / SqFt'), el('div', { class: 'in', style: 'background:var(--calc-bg);border-color:transparent' }, r.dollarsPerSqFt ? fmt.money(r.dollarsPerSqFt) : '—')),
        el('div', {}, el('label', {}, 'Field Lbs/Hr'), el('div', { class: 'in', style: 'background:var(--calc-bg);border-color:transparent' }, r.fieldLbsPerHr ? fmt.num(r.fieldLbsPerHr, 0) : '—')),
        el('div', {}, el('label', {}, 'Shop Lbs/Hr'), el('div', { class: 'in', style: 'background:var(--calc-bg);border-color:transparent' }, r.shopLbsPerHr ? fmt.num(r.shopLbsPerHr, 0) : '—'))));
    v.append(card('Job Information', info));

    // ---------- Labor hours & modifiers ----------
    const modLabels = ['Detailing', 'Testing', 'Safety', 'QC', 'Material Handling'];
    const t1 = el('table', { class: 'grid' });
    t1.append(th('Labor Modifiers', { t: 'Plumb %', num: 1 }, { t: 'Pipe %', num: 1 }, { t: 'SM Field %', num: 1 }, { t: 'Shop %', num: 1 },
      { t: '5-Plumb hrs', num: 1 }, { t: '6-Pipe hrs', num: 1 }, { t: '3-SM Field hrs', num: 1 }, { t: '2-SM Shop hrs', num: 1 }));
    t1.append(el('tr', {}, tdTxt('Hours from TakeOff', 'label'), tdTxt('', 'calc'), tdTxt('', 'calc'), tdTxt('', 'calc'), tdTxt('', 'calc'),
      calcCell(r.hoursPlumb.base, 'hrs'), calcCell(r.hoursPipe.base, 'hrs'), calcCell(r.hoursSM.base, 'hrs'), calcCell(r.hoursShop.base, 'hrs')));
    modLabels.forEach((lbl, i) => {
      t1.append(el('tr', {},
        tdTxt(lbl, 'label'),
        tdIn(numIn('recap.mods.plumb[' + i + ']', { pct: true, zeroWhenEmpty: true, after: rerender })),
        tdIn(numIn('recap.mods.pipe[' + i + ']', { pct: true, zeroWhenEmpty: true, after: rerender })),
        tdIn(numIn('recap.mods.sm[' + i + ']', { pct: true, zeroWhenEmpty: true, after: rerender })),
        tdIn(numIn('recap.mods.shop[' + i + ']', { pct: true, zeroWhenEmpty: true, after: rerender })),
        calcCell(r.hoursPlumb.rows[i], 'hrs'), calcCell(r.hoursPipe.rows[i], 'hrs'), calcCell(r.hoursSM.rows[i], 'hrs'), calcCell(r.hoursShop.rows[i], 'hrs')));
    });
    t1.append(el('tr', {},
      tdTxt('Loss of Production (schedule)', 'label'),
      el('td', { class: 'calc num', colspan: 3 }, fmt.pct(r.lopPct, 1) + ' via schedule'),
      tdIn(numIn('recap.mods.shop[5]', { pct: true, zeroWhenEmpty: true, after: rerender, title: 'Shop LOP % (manual)' })),
      calcCell(r.hoursPlumb.lopHrs, 'hrs'), calcCell(r.hoursPipe.lopHrs, 'hrs'), calcCell(r.hoursSM.lopHrs, 'hrs'), calcCell(r.hoursShop.rows[5], 'hrs')));
    const totRow = el('tr', { class: 'subtotal' }, tdTxt('Total Hours with Adders'), tdTxt(''), tdTxt(''), tdTxt(''), tdTxt(''),
      calcCell(r.hoursPlumb.total, 'hrs'), calcCell(r.hoursPipe.total, 'hrs'), calcCell(r.hoursSM.total, 'hrs'), calcCell(r.hoursShop.total, 'hrs'));
    t1.append(totRow);
    const schedRow = el('div', { class: 'formrow', style: 'margin-top:10px; align-items:center' },
      el('div', {}, el('label', {}, 'Schedule'), selIn('recap.scheduleType', ["5 8's", "5 10's", "6 10's", "60 60 50"])),
      el('div', {}, el('label', {}, "LOP % for 5 8's"), numIn('recap.lop58', { pct: true, zeroWhenEmpty: true, after: rerender })),
      el('div', {}, el('label', {}, 'Arch Hrs in SM Takeoff'), numIn('recap.archHrsInSM', { zeroWhenEmpty: true, after: rerender })),
      r.archWarning ? el('span', { class: 'err' }, 'ARCH HRS TOO HIGH') : null,
      el('button', {
        class: 'btn sm sec', title: 'Copy the company default percentages into the modifier columns',
        onclick: () => {
          bid.recap.mods.plumb = S.recap.defaultMods.plumb.slice();
          bid.recap.mods.pipe = S.recap.defaultMods.pipe.slice();
          bid.recap.mods.sm = S.recap.defaultMods.sm.slice();
          app.touch(); router.render();
        }
      }, 'Insert default %s'));
    v.append(card('Labor Hours & Modifiers', el('div', { class: 'pad' }, schedRow), wrap(t1),
      el('div', { class: 'pad hint' }, 'Tip: to hit a target hour count (like the old Goal Seek button), type the % as "=100*hours/base" — e.g. "=100*512.28/' + fmt.num(r.hoursSM.base, 0) + '" gives 12.0% — or adjust until the hours column matches.')));

    // ---------- Labor cost ----------
    const t2 = el('table', { class: 'grid' });
    t2.append(th('', { t: 'Hours', num: 1 }, { t: 'Rate (blend)', num: 1 }, { t: 'Labor Value', num: 1 }, { t: 'Premium Time Add', num: 1 }));
    const laborRows = [
      ['Plumb Labor', r.hoursPlumb.total, r.ratePlumb, r.I21, r.J21],
      ['Pipe Labor', r.hoursPipe.total, r.ratePipe, r.I22, r.J22],
      ['Sheetmetal Field Labor', r.hoursSM.total, r.rateSMField, r.I23, r.J23],
      ['Sheetmetal Shop Labor', r.hoursShop.total, r.rateSMShop, r.I24, r.J24],
    ];
    for (const [lbl, hrs, rate, val, prem] of laborRows) {
      t2.append(el('tr', {}, tdTxt(lbl, 'label'), calcCell(hrs, 'hrs'), calcCell(rate, 'money'), calcCell(val, 'money'), calcCell(prem, 'money')));
    }
    t2.append(el('tr', { class: 'subtotal' }, tdTxt('Subtotal Labor Cost'), tdTxt(''), tdTxt(''), calcCell(r.I25, 'money'), calcCell(r.J25, 'money')));
    const ocipRow = el('div', { class: 'formrow', style: 'align-items:center' },
      el('div', {}, el('label', {}, 'OCIP'), selIn('recap.ocipToggle', ['No OCIP', 'OCIP', 'OCIP GL Only'])),
      el('div', {}, el('label', {}, 'OCIP deduction'), el('div', { class: 'in', style: 'background:var(--calc-bg);border-color:transparent' }, fmt.money(r.C27))),
      el('div', {}, el('label', {}, 'Total Labor Cost'), el('b', { style: 'font-size:15px' }, fmt.money(r.J27))));
    v.append(card('Labor Cost', wrap(t2), el('div', { class: 'pad' }, ocipRow)));

    // ---------- Material ----------
    const t3 = el('table', { class: 'grid' });
    t3.append(th('Material Costs', { t: 'Plumb', num: 1 }, { t: 'Pipe', num: 1 }, { t: 'Sheet Metal', num: 1 }, { t: 'Total', num: 1 }));
    t3.append(el('tr', {}, tdTxt('From TakeOff (by pay type)', 'label'), calcCell(r.D29, 'money'), calcCell(r.G29, 'money'), calcCell(r.J29, 'money'),
      el('td', { class: 'num calc', style: 'font-weight:700' }, fmt.money(r.J31))));
    v.append(card('Material Cost', wrap(t3)));

    // ---------- Subcontractors ----------
    const t4 = el('table', { class: 'grid' });
    t4.append(th('Phase', 'Trade / Subcontract', 'Description', 'Quote/Plug', { t: 'Value', num: 1 }));
    bid.recap.subs.forEach((s, i) => {
      const cs = r.subRows[i];
      t4.append(el('tr', {},
        tdTxt(i === 0 ? '7-03' : (cs.phaseCode || ''), 'calc'),
        i === 0 ? tdTxt(s.name, 'label') : tdIn(selIn('recap.subs[' + i + '].name', S.ref.codesSubcontractor.map(x => x.name), { blank: true, blankLabel: '—', rerender: true })),
        tdIn(textIn('recap.subs[' + i + '].desc')),
        tdIn(selIn('recap.subs[' + i + '].qp', ['Quote', 'Plug'], { blank: true, rerender: false })),
        tdIn(numIn('recap.subs[' + i + '].value', { after: rerender }))));
    });
    t4.append(el('tr', { class: 'subtotal' }, tdTxt('Total Subcontract', '', ), tdTxt(''), tdTxt(''), tdTxt(''), calcCell(r.J45, 'money')));
    v.append(card('Subcontractors', wrap(t4)));

    // ---------- Supervision / other costs ----------
    const t5 = el('table', { class: 'grid' });
    t5.append(th('Other Costs', { t: '% of Labor', num: 1 }, { t: 'Hours', num: 1 }, { t: 'Rate', num: 1 }, { t: 'Amount', num: 1 }));
    const supLabels = ['Project Manager', 'Plumb Field Supervision (NW)', 'Pipe Field Supervision (NW)', 'Arch Field Supervision (NW)', 'Sheetmetal Field Supervision (NW)'];
    const supF = [r.supervision.F48, r.supervision.F49, r.supervision.F50, r.supervision.F51, r.supervision.F52];
    const supG = [r.supervision.G48, r.supervision.G49, r.supervision.G50, r.supervision.G51, r.supervision.G52];
    const supH = [r.supervision.H48, r.supervision.H49, r.supervision.H50, r.supervision.H51, r.supervision.H52];
    supLabels.forEach((lbl, i) => {
      t5.append(el('tr', {}, tdTxt(lbl, 'label'),
        tdIn(numIn('recap.supPct[' + i + ']', { pct: true, zeroWhenEmpty: true, after: rerender })),
        calcCell(supF[i], 'hrs'), calcCell(supG[i], 'money'), calcCell(supH[i], 'money')));
    });
    t5.append(el('tr', {}, tdTxt('Equipment Rental (from Equipment page below)', 'label'), tdTxt(''), tdTxt(''), tdTxt(''), calcCell(r.H53, 'money')));
    t5.append(el('tr', {}, tdTxt('Other Project General Conditions Cost (below)', 'label'), tdTxt(''), tdTxt(''), tdTxt(''), calcCell(r.H54, 'money')));
    t5.append(el('tr', { class: 'subtotal' }, tdTxt('Total Other Costs'), tdTxt(''), tdTxt(''), tdTxt(''), calcCell(r.J55, 'money')));
    v.append(card('Supervision & Other Costs', wrap(t5), el('div', { class: 'pad' },
      el('button', {
        class: 'btn sm sec', onclick: () => { bid.recap.supPct = S.recap.defaultSupPct.slice(); app.touch(); router.render(); }
      }, 'Insert default %s'))));

    // ---------- GC / indirect page ----------
    v.append(renderGcCard(bid, r, S));
    // ---------- Equipment page ----------
    v.append(renderEquipmentCard(bid, r, S));
    // ---------- Work recovery ----------
    v.append(renderWorkRecoveryCard(bid, r));
    // ---------- Permits mini table ----------
    v.append(renderPermitsMiniCard(bid, r));

    // ---------- Bid build-up ----------
    const t6 = el('table', { class: 'grid' });
    const row = (label, amountCell, extra) => el('tr', {}, tdTxt(label, 'label'), extra || tdTxt(''), amountCell);
    t6.append(th('Bid Build-up', '', { t: 'Amount', num: 1 }));
    t6.append(row('Total of Direct Costs', calcCell(r.H59, 'money')));
    t6.append(row('Subcontractor Mark Up', calcCell(r.H60, 'money'), tdIn(numIn('recap.subMarkup', { pct: true, zeroWhenEmpty: true, after: rerender }))));
    t6.append(row('Equipment Mark Up (EMO)', calcCell(r.H61, 'money'), tdIn(numIn('recap.equipMarkup', { pct: true, zeroWhenEmpty: true, after: rerender }))));
    t6.append(row('Overhead & Profit (excl. lines above)', calcCell(r.H62, 'money'), tdIn(numIn('recap.ohp', { pct: true, zeroWhenEmpty: true, after: rerender }))));
    t6.append(el('tr', { class: 'subtotal' }, tdTxt('Project Subtotal'), tdTxt(''), calcCell(r.H63, 'money')));
    t6.append(row('Market Recovery (Work Recovery)', calcCell(r.H64, 'money')));
    t6.append(row('Miscellaneous Cost / Contingency (no markup)', calcCell(r.H65, 'money'), tdIn(numIn('recap.miscContingency', { zeroWhenEmpty: true, after: rerender }))));
    t6.append(row('Bonds (Performance)', calcCell(r.H66, 'money'), tdIn(selIn('recap.bondRequired', ['No', 'Yes']))));
    t6.append(row('Permits', calcCell(r.H67, 'money')));
    t6.append(row('Tax — rate ' + fmt.pct(r.I68, 2), calcCell(r.H68, 'money'), tdIn(selIn('recap.taxType', ['Oregon CAT Tax', 'Washington B&O Tax', 'No Tax']))));
    t6.append(row('Cost Leveler & Add/Deduct', calcCell(r.H69, 'money'), tdIn(numIn('recap.addDeduct', { zeroWhenEmpty: true, after: rerender, title: 'Manual add/deduct folded into the $5 leveler' }))));
    t6.append(el('tr', { class: 'grand' }, tdTxt('TOTAL BID'), tdTxt(''), el('td', { class: 'num', style: 'font-size:16px' }, fmt.money(r.H70))));
    if (c.recap.emo.delta > 0) {
      t6.append(el('tr', {}, el('td', { colspan: 3, class: 'hint' },
        'Markup has been ' + (r.emo.added ? 'increased' : 'reduced') + ' by ' + fmt.money(r.emo.delta) + ' due to EMO (equipment flagged in TakeOff: ' + fmt.money(r.emo.base) + ')')));
    }
    const stored = el('div', { class: 'pad formrow', style: 'align-items:center' },
      el('button', {
        class: 'btn sm sec', onclick: () => {
          bid.recap.storedTotal = r.H70; bid.recap.storedAt = new Date().toISOString();
          app.touch(); router.render();
        }, title: 'Snapshot the current total so you can see drift as you keep working (the old Ctrl+T)'
      }, 'Store current total'),
      bid.recap.storedTotal != null ? el('span', { class: 'hint' },
        'Stored ' + fmt.money(bid.recap.storedTotal) + ' at ' + fmt.dateTime(bid.recap.storedAt) + ' — difference now: ',
        el('b', { class: (r.H70 - bid.recap.storedTotal) ? 'err' : '' }, fmt.money(r.H70 - bid.recap.storedTotal))) : el('span', { class: 'hint' }, 'No stored total yet'),
      el('span', { style: 'flex:1' }),
      el('span', { class: 'hint' }, 'Markup = ' + fmt.pct(r.pctMarkupOfBid, 0) + ' of bid · ' + fmt.pct(r.pctLaborMU, 0) + ' of labor'));
    const notesRow = el('div', { class: 'pad formrow' },
      el('div', { style: 'flex:1' }, el('label', {}, 'Notes — contingency/plumbing'), textIn('recap.mcaaNotes.misc', { maxCh: 96 })),
      el('div', { style: 'flex:1' }, el('label', {}, 'Notes — bonds/base'), textIn('recap.mcaaNotes.bond', { maxCh: 96 })),
      el('div', { style: 'flex:1' }, el('label', {}, 'Notes — tax'), textIn('recap.mcaaNotes.tax', { maxCh: 96 })),
      el('div', { style: 'flex:1' }, el('label', {}, 'Notes — GC misc %'), textIn('recap.mcaaNotes.gcMisc', { maxCh: 96 })));
    v.append(card('Bid Build-up & Total', wrap(t6), stored, notesRow));
  },
};

// ---------- GC card ----------
function renderGcCard(bid, r, S) {
  const t = el('table', { class: 'grid' });
  t.append(th('Project General Conditions / Indirect Costs', { t: 'Quan/Dur', num: 1 }, { t: 'Rate', num: 1 }, { t: 'Amount', num: 1 }));
  t.append(el('tr', {}, tdTxt('Safety Supplies (% of Materials)', 'label'),
    tdTxt('', 'calc'), tdIn(numIn('recap.gc.safetyPct', { pct: true, dec: 2, zeroWhenEmpty: true, after: rerender })), calcCell(r.gcH.safety, 'money')));
  t.append(el('tr', {}, tdTxt('Small Tools & Consumables (% of Labor Value)', 'label'),
    tdTxt('', 'calc'), tdIn(numIn('recap.gc.smallToolsPct', { pct: true, dec: 1, zeroWhenEmpty: true, after: rerender })), calcCell(r.gcH.smallTools, 'money')));
  t.append(el('tr', {}, tdTxt('Third Party Freight (% of Total Labor)', 'label'),
    tdTxt('', 'calc'), tdIn(numIn('recap.gc.freightPct', { pct: true, dec: 1, zeroWhenEmpty: true, after: rerender })), calcCell(r.gcH.freight, 'money')));
  t.append(el('tr', {}, tdTxt('Trucking — Hrs × Loads × $/hr', 'label'),
    el('td', {}, el('div', { style: 'display:flex;gap:4px' }, numIn('recap.trucking.hrs', { zeroWhenEmpty: true, after: rerender, placeholder: 'hrs' }), numIn('recap.trucking.loads', { zeroWhenEmpty: true, after: rerender, placeholder: 'loads' }))),
    tdIn(numIn('recap.trucking.rate', { after: rerender, placeholder: fmt.num(app.computed.crew.perClassRates.appr3, 2) })),
    calcCell(r.gcH.trucking, 'money')));
  S.ref.gcRows.forEach((def, i) => {
    const cRow = r.gcRows[i];
    const rateLocked = def.rateFrom === 'journeyman';
    const rateInput = rateLocked
      ? calcCell(cRow.rate, 'money')
      : tdIn(numIn('recap.gc.rows.' + def.key + '.rate', { after: rerender, placeholder: def.rateDefault ? fmt.num(cRow.rate, 2) : '' }));
    const qtyCell = def.key === 'cadOperator'
      ? el('td', {}, el('div', { style: 'display:flex;gap:4px' }, numIn('recap.gc.rows.cadOperator.qty', { zeroWhenEmpty: true, after: rerender, placeholder: 'qty' }), numIn('recap.gc.rows.cadOperator.dur', { zeroWhenEmpty: true, after: rerender, placeholder: 'dur' })))
      : tdIn(numIn('recap.gc.rows.' + def.key + '.qty', { zeroWhenEmpty: true, after: rerender }));
    let labelCell;
    if (def.editableLabel) {
      labelCell = tdIn(textIn('recap.gc.labels.' + def.key, { placeholder: def.label }));
    } else labelCell = tdTxt(def.label, 'label');
    t.append(el('tr', {}, labelCell, qtyCell, rateInput, calcCell(cRow.total, 'money')));
  });
  t.append(el('tr', {}, tdTxt("Miscellaneous (% of Takeoff Labor & Material $'s)", 'label'), tdTxt('', 'calc'),
    tdIn(numIn('recap.gc.miscPct', { pct: true, dec: 0, zeroWhenEmpty: true, after: rerender })), calcCell(r.gcH.misc, 'money')));
  t.append(el('tr', { class: 'subtotal' }, tdTxt('TOTAL GCs'), tdTxt(''), tdTxt(''), calcCell(r.H107, 'money')));
  return el('div', { class: 'card' }, el('h2', {}, 'General Conditions (Page 2)', el('span', { class: 'spacer' }), el('span', { class: 'badge blue' }, fmt.money(r.H107))), wrap(t));
}

// ---------- Equipment card ----------
function renderEquipmentCard(bid, r, S) {
  const t = el('table', { class: 'grid' });
  t.append(th('Equipment Rentals', { t: 'Quantity', num: 1 }, { t: 'Duration', num: 1 }, { t: 'Rate per Qty', num: 1 }, { t: 'Total', num: 1 }));
  S.ref.equipmentLabels.forEach((lbl, i) => {
    t.append(el('tr', {},
      lbl ? tdTxt(lbl, 'label') : tdIn(textIn('recap.equipmentNames[' + i + ']', { placeholder: '(other)' })),
      tdIn(numIn('recap.equipment[' + i + '].qty', { zeroWhenEmpty: true, after: rerender })),
      tdIn(numIn('recap.equipment[' + i + '].dur', { zeroWhenEmpty: true, after: rerender })),
      tdIn(numIn('recap.equipment[' + i + '].rate', { after: rerender, placeholder: fmt.num(S.recap.equipmentRates[i] || 0, 0) })),
      calcCell(r.equipRows[i].total, 'money')));
  });
  t.append(el('tr', { class: 'subtotal' }, tdTxt('Total Equipment Rental & Third Party'), tdTxt(''), tdTxt(''), tdTxt(''), calcCell(r.J130, 'money')));
  return el('div', { class: 'card' }, el('h2', {}, 'Equipment Rentals (Page 3)', el('span', { class: 'spacer' }), el('span', { class: 'badge blue' }, fmt.money(r.J130))), wrap(t));
}

// ---------- Work Recovery card ----------
function renderWorkRecoveryCard(bid, r) {
  const t = el('table', { class: 'grid' });
  t.append(th('Work Recovery', { t: 'Takeoff Hours', num: 1 }, { t: '$/Hr Approved', num: 1 }, { t: 'Max Hours', num: 1 }, { t: 'Recovery Used', num: 1 }));
  r.workRecovery.rows.forEach((row) => {
    t.append(el('tr', {}, tdTxt(row.label, 'label'), calcCell(row.hours, 'hrs'),
      tdIn(numIn('workRecovery.' + row.key + '.rate', { zeroWhenEmpty: true, after: rerender })),
      tdIn(numIn('workRecovery.' + row.key + '.maxHrs', { zeroWhenEmpty: true, after: rerender })),
      calcCell(row.used, 'money')));
  });
  t.append(el('tr', { class: 'subtotal' }, tdTxt('Total (applied as negative Market Recovery)'), tdTxt(''), tdTxt(''), tdTxt(''), calcCell(r.workRecovery.total, 'money')));
  return el('div', { class: 'card' }, el('h2', {}, 'Work / Market Recovery', el('span', { class: 'spacer' }), el('span', { class: 'badge blue' }, fmt.money(r.H64))), wrap(t));
}

// ---------- Permits mini card ----------
function renderPermitsMiniCard(bid, r) {
  const t = el('table', { class: 'grid' });
  t.append(th('Permits', { t: 'Amount', num: 1 }));
  const items = [['Plumbing', 'plumbing'], ['HVAC', 'hvac'], ['Med Gas', 'medGas'], ['Boiler', 'boiler'], ['Special Insp', 'specialInsp']];
  for (const [lbl, key] of items) {
    t.append(el('tr', {}, tdTxt(lbl, 'label'), tdIn(numIn('recap.permitsManual.' + key, { zeroWhenEmpty: true, after: rerender }))));
  }
  t.append(el('tr', {}, tdTxt('Permit Calculator (Indirect Costs page)', 'label'), calcCell(r.J82, 'money')));
  t.append(el('tr', { class: 'subtotal' }, tdTxt('Total Permits'), calcCell(r.J83, 'money')));
  return el('div', { class: 'card' }, el('h2', {}, 'Permits', el('span', { class: 'spacer' }), el('span', { class: 'badge blue' }, fmt.money(r.J83))), wrap(t));
}
