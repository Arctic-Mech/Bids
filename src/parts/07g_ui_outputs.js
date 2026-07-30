// ============================================================
// Pages: Proposal, Booking Report, Takeoff Notes, SM Schedule
// ============================================================
'use strict';

router.routes.proposal = {
  title: () => 'Proposal',
  needsBid: true,
  render(v) {
    const bid = app.bid, S = app.settings, c = app.computed, P = S.ref.proposal;
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Proposal — ' + fmt.money(c.proposal.amount)),
      el('div', { class: 'pad' },
        el('div', { class: 'formrow' },
          el('div', {}, el('label', {}, 'ATTN'), textIn('proposal.attn')),
          el('div', { style: 'flex:2' }, el('label', {}, 'Proposal submitted to'), textIn('proposal.submittedTo')),
          el('div', {}, el('label', {}, 'Phone'), textIn('proposal.phone')),
          el('div', {}, el('label', {}, 'Fax'), textIn('proposal.fax')),
          el('div', {}, el('label', {}, 'Date'), (() => { const i = el('input', { type: 'date', value: bid.proposal.date || '' }); i.addEventListener('change', () => { bid.proposal.date = i.value; app.touch(); }); return i; })())),
        el('div', { class: 'formrow' },
          el('div', { style: 'flex:2' }, el('label', {}, 'Address'), textIn('proposal.address')),
          el('div', { style: 'flex:2' }, el('label', {}, 'City, State & Zip'), textIn('proposal.cityStateZip')),
          el('div', {}, el('label', {}, 'Architect'), textIn('proposal.architect')),
          el('div', {}, el('label', {}, 'Date of plans'), textIn('proposal.dateOfPlans'))),
        el('p', { class: 'hint' }, 'Job name, location and bid # come from the Recap page: ',
          el('b', {}, (bid.info.estNo || '—') + ' · ' + (bid.info.jobName || '—') + ' · ' + (bid.info.location || '—'))))));

    const scope = el('textarea', { rows: 6, style: 'width:100%' }, bid.proposal.scope || '');
    scope.addEventListener('change', () => { bid.proposal.scope = scope.value; app.touch(); });
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Scope / Terms Paragraph'), el('div', { class: 'pad' }, scope)));

    // exclusions quick picker (the W/X block)
    const pickWrap = el('div', { class: 'pad', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px' });
    for (const name of P.exclusionPicker) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = bid.proposal.exclusionsPicked.includes(name);
      cb.addEventListener('change', () => {
        const list = bid.proposal.exclusionsPicked;
        if (cb.checked) list.push(name); else list.splice(list.indexOf(name), 1);
        app.touch(); router.render();
      });
      pickWrap.append(el('label', { class: 'ck' }, cb, name));
    }
    // second quick picker — the sheet's Z/AA block, which feeds the SAME line
    const pick2 = el('div', { class: 'pad', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px' });
    for (const name of (P.inclusionOptions || [])) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = bid.proposal.inclusionsPicked.includes(name);
      cb.addEventListener('change', () => {
        const list = bid.proposal.inclusionsPicked;
        if (cb.checked) list.push(name); else list.splice(list.indexOf(name), 1);
        app.touch(); router.render();
      });
      pick2.append(el('label', { class: 'ck' }, cb, name));
    }
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Exclusions — quick list (prints as one line)'), pickWrap, pick2,
      el('div', { class: 'pad hint' }, 'Line: ', el('b', {}, 'Exclusions: ' + (c.proposal.exclusionLine || '—')),
        el('br'), 'Both blocks above print as the one "Exclusions:" line, in this order — they are the two picker columns from the spreadsheet.')));

    // exclusion library (the AC block)
    const libWrap = el('div', { class: 'pad', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:4px' });
    for (const line of P.exclusionLibrary) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = bid.proposal.exclusionLibraryPicked.includes(line);
      cb.addEventListener('change', () => {
        const list = bid.proposal.exclusionLibraryPicked;
        if (cb.checked) list.push(line); else list.splice(list.indexOf(line), 1);
        app.touch();
      });
      libWrap.append(el('label', { class: 'ck', style: 'align-items:flex-start' }, cb, line));
    }
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Exclusions — detail library (prints as a list)'), libWrap));

    v.append(el('div', { class: 'card' }, el('h2', {}, 'Amount'),
      el('div', { class: 'pad' },
        el('p', {}, P.proposeText),
        el('p', { style: 'font-size:15px' }, el('b', {}, c.proposal.amountWords), ' — ', el('b', {}, fmt.money(c.proposal.amount))),
        el('div', { class: 'formrow' },
          el('div', { style: 'flex:2' }, el('label', {}, 'Payment to be made as follows'), textIn('proposal.paymentTerms')),
          el('div', {}, el('label', {}, 'Valid for (days)'), numIn('proposal.validityDays', { int: true, dec: 0 }))))));
  },
};

// ---------------- Booking Report ----------------
router.routes.booking = {
  title: () => 'Booking Report',
  needsBid: true,
  render(v) {
    const bid = app.bid, c = app.computed, bk = c.booking;
    const status = el('div', { class: 'pad formrow', style: 'align-items:center' },
      el('div', {}, el('label', {}, 'Total Bid'), el('b', {}, fmt.money(c.recap.H70))),
      el('div', {}, el('label', {}, 'Booked (labor+material)'), el('b', {}, fmt.money(bk.bookedTotal))),
      el('div', {}, el('label', {}, 'Markups + tax + leveler'), el('b', {}, fmt.money(bk.tail))),
      el('div', {}, el('label', {}, 'Un-assigned'),
        el('b', { class: bk.complete ? '' : 'err' }, fmt.money(bk.unassigned))),
      el('div', {}, el('span', { class: 'badge ' + (bk.complete ? 'green' : 'red'), style: 'font-size:14px' },
        bk.complete ? '☺ Booking Complete' : '☹ Review Booking Codes')),
      el('div', {}, el('label', {}, 'Booked hours'), el('b', {}, fmt.num(bk.totalHours, 2))),
      el('div', {}, el('label', {}, 'Target hours'), el('b', {}, fmt.num(bk.hourTarget, 2), bk.missingHours ? el('span', { class: 'err' }, ' (' + fmt.num(bk.missingHours, 2) + ' missing)') : '')));
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Booking Status'), status,
      el('div', { class: 'pad formrow' },
        el('div', {}, el('label', {}, 'Job Number'), textIn('info.jobNumber')),
        el('div', { style: 'flex:2' }, el('label', {}, 'Address'), textIn('info.address')),
        el('div', {}, el('label', {}, 'City'), textIn('info.city')),
        el('div', {}, el('label', {}, 'State'), textIn('info.state')),
        el('div', {}, el('label', {}, 'Zip'), textIn('info.zip')),
        el('div', {}, el('label', {}, 'Certified payroll'), selIn('booking.certifiedPayroll', ['No', 'Yes'], { rerender: false })),
        el('div', {}, el('label', {}, 'Booking type'), selIn('booking.bookingType', ['Original', 'Change'], { rerender: false })),
        el('div', {}, el('label', {}, 'Contract'), selIn('booking.contract', ['T&M', 'Lump Sum', 'GMP', 'Units'], { rerender: false })),
        el('div', {}, el('button', {
          class: 'btn sec', style: 'margin-top:16px', onclick: exportBookingCsv,
          title: 'Accounting-system import file (the old "Booking" macro)'
        }, '⬇ Booking CSV')),
        el('div', {}, el('button', {
          class: 'btn sec', style: 'margin-top:16px', onclick: exportTimeSheetCsv,
          title: 'Phase-code matrix for the field time sheet (the old "Export Phase Codes And Generate New Time Sheet" button)'
        }, '⬇ Time Sheet (phase codes)')))));

    // custom phase codes (per-bid description slots, like the unlocked slots on the Phase Codes sheet)
    v.append(renderPhaseCustomCard(bid));

    for (const d of bk.divisions) {
      const nonEmpty = d.rows.filter(x => x.hours || x.labor || x.material || x.desc);
      if (!nonEmpty.length) continue;
      const t = el('table', { class: 'grid' });
      t.append(th('Phase', 'Description', { t: 'Hours', num: 1 }, { t: 'Labor $', num: 1 }, { t: 'Material $', num: 1 }, { t: 'Total', num: 1 }, 'Code'));
      for (const row of d.rows) {
        if (!(row.hours || row.labor || row.material || row.desc)) continue;
        const hasVal = row.hours || row.labor || row.material;
        const sel = el('select', { 'data-path': 'booking.codes.' + row.code },
          el('option', { value: '' }, '—'),
          ['E', 'M', 'OH', 'OT', 'S'].map(o => { const opt = el('option', { value: o }, o); if (row.gCode === o) opt.selected = true; return opt; }));
        sel.addEventListener('change', () => { bid.booking.codes[row.code] = sel.value; app.touch(); });
        const tr = el('tr', hasVal ? {} : { style: 'opacity:.55' },
          tdTxt(row.code, 'calc'), tdTxt(row.desc, 'label'),
          calcCell(row.hours, 'hrs'), calcCell(row.labor, 'money'), calcCell(row.material, 'money'), calcCell(row.labor + row.material, 'money'),
          tdIn(sel));
        t.append(tr);
      }
      t.append(el('tr', { class: 'subtotal' }, tdTxt('Division ' + d.div + ' totals'), tdTxt(''),
        calcCell(d.totHours, 'hrs'), calcCell(d.totLabor, 'money'), calcCell(d.totMat, 'money'), calcCell(d.totLabor + d.totMat, 'money'), tdTxt('')));
      v.append(el('div', { class: 'card' },
        el('h2', {}, 'Division ' + d.div + ' — ' + d.name, el('span', { class: 'spacer' }),
          el('span', { class: 'badge blue' }, fmt.money(d.totLabor + d.totMat))),
        wrap(t)));
    }
  },
};

function renderPhaseCustomCard(bid) {
  const t = el('table', { class: 'grid' });
  t.append(th('Phase code', 'Custom description (this bid only)', ''));
  const entries = Object.entries(bid.phaseCustom || {}).sort();
  for (const [code, desc] of entries) {
    const di = el('input', { type: 'text', value: desc, 'data-path': 'phaseCustom.' + code });
    di.addEventListener('change', () => { bid.phaseCustom[code] = di.value; app.touch(); });
    t.append(el('tr', {}, tdTxt(code, 'calc'), tdIn(di),
      el('td', {}, el('button', { class: 'btn sm danger', onclick: () => { delete bid.phaseCustom[code]; app.touch(); router.render(); } }, '×'))));
  }
  const codeIn = el('input', { type: 'text', placeholder: 'e.g. 3-39', style: 'width:90px' });
  const descIn = el('input', { type: 'text', placeholder: 'description', style: 'min-width:220px' });
  const add = el('button', {
    class: 'btn sm sec', onclick: () => {
      const code = codeIn.value.trim();
      if (!/^\d-\d\d$/.test(code)) { toast('Code must look like 3-39', true); return; }
      bid.phaseCustom[code] = descIn.value.trim() || 'Custom';
      app.touch(); router.render();
    }
  }, '+ Add');
  return el('div', { class: 'card' },
    el('h2', {}, 'Custom Phase Codes (this bid)'),
    el('div', { class: 'pad hint' }, 'Job-specific code descriptions — the unlocked slots on the old Phase Codes sheet. They show up in the takeoff dropdowns and on this Booking Report, and export into the spreadsheet\'s Phase Codes matrix.'),
    entries.length ? wrap(t) : null,
    el('div', { class: 'pad formrow' }, codeIn, descIn, add));
}

function exportTimeSheetCsv() {
  // The old TimeSheet macro exported Phase Codes B4:H102 (divisions 1-7) to the time-sheet template.
  const S = app.settings;
  const lines = ['Code,' + S.ref.phaseCodes.divisions.filter(d => d.div <= 7).map(d => d.name.replace(/,/g, ' ')).join(',')];
  for (let code = 1; code <= 99; code++) {
    const cc = String(code).padStart(2, '0');
    const row = [cc];
    for (const d of S.ref.phaseCodes.divisions.filter(d => d.div <= 7)) {
      const custom = (app.bid.phaseCustom || {})[d.div + '-' + cc];
      const std = (d.descriptions[cc] || {}).d || '';
      row.push((custom || std).replace(/,/g, ' '));
    }
    if (row.slice(1).some(x => x)) lines.push(row.join(','));
  }
  downloadBytes('Time Sheet.csv', new TextEncoder().encode(lines.join('\r\n')), 'text/csv');
  toast('Time Sheet phase-code matrix exported');
}

function exportBookingCsv() {
  const bid = app.bid, c = app.computed;
  const today = new Date();
  const mmddyy = (d, four) => String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + (four ? d.getFullYear() : String(d.getFullYear()).slice(2));
  const lines = [];
  lines.push(';,' + (bid.booking.bookingType === 'Original' ? 'Original' : 'Change'));
  lines.push(';,Certified Payrole ' + (bid.booking.certifiedPayroll === 'Yes' ? 'Yes' : 'No'));
  lines.push('');
  lines.push(';Job Header');
  lines.push(['*', bid.info.jobNumber || '', bid.info.jobName || '', bid.info.address || '', bid.info.city || '', bid.info.state || '', bid.info.zip || '', mmddyy(today, false)].join(','));
  for (const d of c.booking.divisions) {
    for (const row of d.rows) {
      if (!(row.hours || row.labor || row.material)) continue;
      lines.push(['P', row.code, (row.desc || '').replace(/,/g, ' '), '', mmddyy(today, true), '', '', '', '1'].join(','));
      lines.push(['C', row.code, '', '1', mmddyy(today, true), row.hours.toFixed(2), '', (row.labor + row.material).toFixed(2)].join(','));
    }
  }
  const name = ((bid.info.jobNumber || bid.info.estNo || 'Job') + ' ' + (bid.info.jobName || '')).trim() + ' Booking Export.csv';
  downloadBytes(name.replace(/[\\/:*?"<>|]+/g, '-'), new TextEncoder().encode(lines.join('\r\n')), 'text/csv');
  toast('Booking CSV exported — one P + C record per booked phase');
}

// ---------------- Takeoff Notes ----------------
router.routes.notes = {
  title: () => 'Takeoff Notes',
  needsBid: true,
  render(v) {
    const bid = app.bid;
    const t = el('table', { class: 'grid' });
    t.append(th('#', 'Dry/Wet/Service', 'Description', 'Cost Impact?', { t: 'Est $', num: 1 }, 'Bid Strategy', 'RFI Required?', ''));
    bid.notes.forEach((n, i) => {
      t.append(el('tr', {},
        tdTxt(String(i + 1), 'calc'),
        tdIn(selIn('notes[' + i + '].service', ['Dry', 'Wet', 'Service'], { blank: true, rerender: false })),
        tdIn(textIn('notes[' + i + '].desc')),
        tdIn(selIn('notes[' + i + '].impact', ['Y', 'N'], { blank: true, rerender: false })),
        tdIn(numIn('notes[' + i + '].est', {})),
        tdIn(textIn('notes[' + i + '].strategy')),
        tdIn(selIn('notes[' + i + '].rfi', ['Y', 'N'], { blank: true, rerender: false })),
        el('td', {}, el('button', { class: 'btn sm danger', onclick: () => { bid.notes.splice(i, 1); app.touch(); router.render(); } }, '×'))));
    });
    v.append(el('div', { class: 'card' },
      el('h2', {}, "Estimator's Takeoff Notes & Strategies", el('span', { class: 'spacer' }),
        el('button', { class: 'btn sm sec', onclick: () => { bid.notes.push({ num: bid.notes.length + 1, service: '', desc: '', impact: '', est: null, strategy: '', rfi: '' }); app.touch(); router.render(); } }, '+ Row')),
      wrap(t)));
  },
};

// ---------------- SM Schedule ----------------
function firstMondayOfMonth(d) {
  const seventh = new Date(d.getFullYear(), d.getMonth(), 7);
  const dow = (seventh.getDay() + 6) % 7; // Monday=0
  return new Date(d.getFullYear(), d.getMonth(), 7 - dow);
}
router.routes.schedule = {
  title: () => 'SM Schedule',
  needsBid: true,
  render(v) {
    const bid = app.bid;
    if (!bid.schedule.packages.length) {
      v.append(el('div', { class: 'card' }, el('h2', {}, 'SM Schedule'), el('div', { class: 'pad' },
        el('p', {}, 'A 48-week labor schedule keyed to your takeoff groups. Nothing else reads it — it is a printable planning page.'),
        el('button', {
          class: 'btn', onclick: () => {
            bid.schedule.packages = app.bid.takeoff.groups.filter(g => g.name).slice(0, 19).map((g, i) => ({
              name: g.name, tasks: [{ desc: 'Task A', manpower: null, start: '', finish: '', status: '', actualFinish: '', notes: '' }],
            }));
            if (!bid.schedule.packages.length) bid.schedule.packages = [{ name: 'Package 1', tasks: [{ desc: 'Task A', manpower: null, start: '', finish: '', status: '', actualFinish: '', notes: '' }] }];
            app.touch(); router.render();
          }
        }, 'Build schedule from takeoff groups'))));
      return;
    }
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Project: ' + (bid.info.jobName || '—')),
      el('div', { class: 'pad formrow' },
        el('div', {}, el('label', {}, 'Project Manager'), textIn('schedule.pm')),
        el('div', {}, el('label', {}, 'Alternate start date (Monday)'), (() => { const i = el('input', { type: 'date', value: bid.schedule.altStart || '' }); i.addEventListener('change', () => { bid.schedule.altStart = i.value || null; app.touch(); router.render(); }); return i; })()),
        el('div', {}, el('button', { class: 'btn sm danger', onclick: () => { if (confirm('Clear the whole schedule?')) { bid.schedule.packages = []; app.touch(); router.render(); } } }, 'Clear schedule')))));

    // anchor
    const starts = bid.schedule.packages.flatMap(p => p.tasks.map(t => t.start).filter(Boolean)).map(s => new Date(s));
    const anchor = bid.schedule.altStart ? new Date(bid.schedule.altStart) : (starts.length ? firstMondayOfMonth(new Date(Math.min(...starts))) : null);
    const DAY = 86400000;
    bid.schedule.packages.forEach((p, pi) => {
      const t = el('table', { class: 'grid' });
      t.append(th('WBS', 'Task', { t: 'Manpower', num: 1 }, 'Start', 'Finish', 'Status', 'Notes', { t: 'Work days', num: 1 }, 'Bar (48 weeks)', ''));
      const rollup = { s: null, f: null };
      p.tasks.forEach((task, ti) => {
        const path = 'schedule.packages[' + pi + '].tasks[' + ti + ']';
        const s = task.start ? new Date(task.start) : null, f = task.finish ? new Date(task.finish) : null;
        if (s && (!rollup.s || s < rollup.s)) rollup.s = s;
        if (f && (!rollup.f || f > rollup.f)) rollup.f = f;
        let workDays = '', bar = el('div');
        if (anchor && s && f && f >= s) {
          let wd = 0;
          for (let d = new Date(s); d <= f; d = new Date(d.getTime() + DAY)) { const dow = d.getDay(); if (dow !== 0 && dow !== 6) wd++; }
          workDays = wd;
          const total = 48 * 7 * DAY;
          const left = Math.max(0, (s - anchor) / total * 100), width = Math.max(0.7, (f - s + DAY) / total * 100);
          bar = el('div', { style: 'position:relative;height:12px;background:#eef0f6;border-radius:3px;min-width:230px' },
            el('div', { style: `position:absolute;left:${left.toFixed(2)}%;width:${Math.min(width, 100 - left).toFixed(2)}%;top:0;bottom:0;background:var(--blue);border-radius:3px`, title: task.desc }));
        }
        const dateIn = (key) => { const i = el('input', { type: 'date', value: task[key] || '', style: 'width:130px' }); i.addEventListener('change', () => { task[key] = i.value; app.touch(); router.render(); }); return i; };
        t.append(el('tr', {},
          tdTxt((pi + 1) + '.' + (ti + 1), 'calc'),
          tdIn(textIn(path + '.desc')),
          tdIn(numIn(path + '.manpower', { dec: 0 })),
          tdIn(dateIn('start')), tdIn(dateIn('finish')),
          tdIn(selIn(path + '.status', ['Not Started', 'In Progress', 'Completed'], { blank: true, rerender: false })),
          tdIn(textIn(path + '.notes')),
          el('td', { class: 'num calc' }, String(workDays)),
          el('td', {}, bar),
          el('td', {}, el('button', { class: 'btn sm danger', onclick: () => { p.tasks.splice(ti, 1); app.touch(); router.render(); } }, '×'))));
      });
      const head = el('h2', {}, (pi + 1) + '. ',
        (() => { const i = textIn('schedule.packages[' + pi + '].name'); i.style.minWidth = '240px'; return i; })(),
        el('span', { class: 'spacer' }),
        rollup.s ? el('span', { class: 'hint' }, fmt.date(rollup.s) + ' → ' + (rollup.f ? fmt.date(rollup.f) : '…')) : null,
        el('button', { class: 'btn sm sec', onclick: () => { p.tasks.push({ desc: 'Task ' + String.fromCharCode(65 + p.tasks.length), manpower: null, start: '', finish: '', status: '', actualFinish: '', notes: '' }); app.touch(); router.render(); } }, '+ Task'),
        el('button', { class: 'btn sm danger', onclick: () => { if (confirm('Remove package "' + p.name + '"?')) { bid.schedule.packages.splice(pi, 1); app.touch(); router.render(); } } }, '× Package'));
      v.append(el('div', { class: 'card' }, head, wrap(t)));
    });
    v.append(el('div', { class: 'card' }, el('div', { class: 'pad' },
      el('button', { class: 'btn sec', onclick: () => { bid.schedule.packages.push({ name: 'Package ' + (bid.schedule.packages.length + 1), tasks: [{ desc: 'Task A', manpower: null, start: '', finish: '', status: '', actualFinish: '', notes: '' }] }); app.touch(); router.render(); } }, '+ Add package'))));
  },
};
