// ============================================================
// Pages: Company Settings, Function Map
// ============================================================
'use strict';

// A settings row: {path (into settings object), label, kind: 'money'|'pct'|'num'|'text', dec}
function settingRows() {
  const rows = [];
  const C = COMPANY;
  for (const [secKey, sec] of Object.entries(C.crew.sections)) {
    const g = 'Crew rates — ' + sec.label;
    sec.classes.forEach((cl, i) => {
      rows.push({ group: g, path: `crew.sections.${secKey}.classes[${i}].wage`, label: cl.name + ' — base wage $/hr', kind: 'money' });
      rows.push({ group: g, path: `crew.sections.${secKey}.classes[${i}].fringe`, label: cl.name + ' — fringe $/hr', kind: 'money' });
    });
    rows.push({ group: g, path: `crew.sections.${secKey}.periodFactor`, label: 'Period factor (escalation %)', kind: 'pct', dec: 1 });
    if (sec.shopBurden !== undefined) rows.push({ group: g, path: `crew.sections.${secKey}.shopBurden`, label: 'Shop burden $/hr', kind: 'money' });
    if (sec.otAdder !== undefined) rows.push({ group: g, path: `crew.sections.${secKey}.otAdder`, label: 'OT/DT subtotal adder $/hr', kind: 'money' });
    const p = `crew.sections.${secKey}.pti`;
    const gg = 'Payroll tax & insurance — ' + sec.label;
    for (const [k, lbl] of [['futa', 'FUTA'], ['sui', 'SUI'], ['sdi', 'SDI'], ['ss', 'Social Security'], ['medic', 'Medicare'], ['countyTax', 'County tax'], ['gl', 'General liability'], ['tri', 'TRI'], ['fmla', 'FMLA'], ['orSickLeave', 'OR sick leave']]) {
      rows.push({ group: gg, path: `${p}.${k}`, label: lbl + ' %', kind: 'pct', dec: 4 });
    }
    rows.push({ group: gg, path: `${p}.wc.gross`, label: "Workers' comp gross rate %", kind: 'pct', dec: 2 });
    rows.push({ group: gg, path: `${p}.wc.emr`, label: 'EMR (experience modifier)', kind: 'num', dec: 2 });
    rows.push({ group: gg, path: `${p}.wc.ogserp`, label: 'OGSERP factor', kind: 'num', dec: 2 });
    rows.push({ group: gg, path: `${p}.wc.dcbs`, label: 'DCBS premium assessment', kind: 'num', dec: 3 });
    rows.push({ group: gg, path: `${p}.wc.occpap`, label: 'OCCPAP factor', kind: 'num', dec: 2 });
    if (sec.premium) {
      const gp = 'Shift premiums — ' + sec.label;
      for (const [k, val] of Object.entries(sec.premium)) {
        if (typeof val !== 'number') continue;
        rows.push({ group: gp, path: `crew.sections.${secKey}.premium.${k}`, label: { swingPct: 'Swing % of Jny wage', gravePct: 'Grave % of Jny wage', specialPct: 'Special % of Jny wage', swingGravePct: 'Swing/Grave % of avg wage', swingLOP: 'Swing loss-of-production', graveLOP: 'Grave loss-of-production' }[k] || k, kind: 'pct', dec: 2 });
      }
    }
    if (sec.periodStart) rows.push({ group: g, path: `crew.sections.${secKey}.periodStart`, label: 'Labor-rate period start', kind: 'text' });
    if (sec.periodEnd) rows.push({ group: g, path: `crew.sections.${secKey}.periodEnd`, label: 'Labor-rate period end', kind: 'text' });
  }
  const gl = 'Recap constants';
  rows.push({ group: gl, path: 'recap.lop510', label: "Loss of production % — 5 10's", kind: 'pct', dec: 0 });
  rows.push({ group: gl, path: 'recap.lop610', label: "Loss of production % — 6 10's", kind: 'pct', dec: 0 });
  rows.push({ group: gl, path: 'recap.lop606050', label: 'Loss of production % — 60/60/50', kind: 'pct', dec: 0 });
  rows.push({ group: gl, path: 'recap.taxRates.oregonCat', label: 'Oregon CAT tax rate', kind: 'pct', dec: 2 });
  rows.push({ group: gl, path: 'recap.taxRates.washingtonBO', label: 'Washington B&O tax rate', kind: 'pct', dec: 3 });
  rows.push({ group: gl, path: 'recap.taxRates.multnomahAdder', label: 'Multnomah County adder (always applied)', kind: 'pct', dec: 2 });
  COMPANY.recap.equipmentRates.forEach((v, i) => {
    if (COMPANY.equipmentLabels[i]) rows.push({ group: 'Equipment default rates', path: `recap.equipmentRates[${i}]`, label: COMPANY.equipmentLabels[i], kind: 'money' });
  });
  COMPANY.bond.brackets.forEach((b, i) => {
    rows.push({ group: 'Bond brackets', path: `bond.brackets[${i}]`, label: 'Bracket ' + (i + 1) + ' width $', kind: 'num', dec: 0 });
    rows.push({ group: 'Bond brackets', path: `bond.rates[${i}]`, label: 'Bracket ' + (i + 1) + ' rate per $1,000', kind: 'money' });
  });
  const go = 'OCIP';
  rows.push({ group: go, path: 'ocip.payrollFraction', label: 'Bare-payroll fraction of labor $', kind: 'pct', dec: 0 });
  rows.push({ group: go, path: 'ocip.otherFactors', label: 'Other applicable factors', kind: 'num', dec: 2 });
  COMPANY.ocip.wcClasses.forEach((w, i) => {
    rows.push({ group: go, path: `ocip.wcClasses[${i}].rate`, label: w.desc + ' — WC rate per $100', kind: 'pct', dec: 2 });
  });
  rows.push({ group: go, path: 'ocip.glPremisesRate', label: 'GL premises & ops per $1,000', kind: 'money' });
  rows.push({ group: go, path: 'ocip.glProductsRate', label: 'GL products/completed per $1,000', kind: 'money' });
  COMPANY.permits.jurisdictions.forEach((j, ji) => {
    const gp = 'Permit tiers — ' + j.name;
    j.tiers.forEach((t, ti) => {
      rows.push({ group: gp, path: `permits.jurisdictions[${ji}].tiers[${ti}].fee`, label: `Tier ${ti + 1} (${fmt.int(t.min)}–${fmt.int(t.max)}) fee`, kind: 'money' });
      rows.push({ group: gp, path: `permits.jurisdictions[${ji}].tiers[${ti}].inc`, label: `Tier ${ti + 1} per-$ increment`, kind: 'num', dec: 0 });
    });
    rows.push({ group: gp, path: `permits.jurisdictions[${ji}].planReviewPct`, label: 'Plan review %', kind: 'pct', dec: 0 });
    rows.push({ group: gp, path: `permits.jurisdictions[${ji}].markupPct`, label: 'Markup %', kind: 'pct', dec: 0 });
  });
  return rows;
}

router.routes.settings = {
  title: () => 'Company Settings',
  needsBid: false,
  render(v) {
    const overrides = store.settingsOverrides();
    const factory = settingsFromCompany(COMPANY);

    // ---- the company file itself ----
    const cfStatus = el('div', { class: 'hint' });
    const cfInput = el('input', { type: 'file', accept: '.arctic,.zip,.json', style: 'display:none' });
    cfInput.addEventListener('change', async () => {
      const f = cfInput.files[0];
      if (!f) return;
      try {
        await companyInstall(new Uint8Array(await f.arrayBuffer()));
        toast('Company file updated — rates reloaded');
        location.reload();
      } catch (e) { cfStatus.innerHTML = ''; cfStatus.append(el('span', { class: 'err' }, 'Could not use that file: ' + e.message)); }
    });
    companyLoadStored().then(rec => {
      cfStatus.textContent = rec && rec.loadedAt
        ? 'Loaded on this computer ' + fmt.dateTime(rec.loadedAt) + (rec.workbook ? ' — includes the estimate workbook' : ' — rates only, no workbook (spreadsheet export will not work)')
        : 'Loaded for this session only.';
    }).catch(() => { cfStatus.textContent = ''; });
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Company file'),
      el('div', { class: 'pad' },
        el('p', {}, 'The rates below, and the workbook the spreadsheet export is built from, come from the Arctic company file — they are deliberately not part of this website. ',
          'To roll out new rates company-wide, replace the file on the network and load it again here on each computer.'),
        el('div', { class: 'formrow', style: 'align-items:center' },
          el('button', { class: 'btn sec', onclick: () => cfInput.click() }, 'Load a new company file'), cfInput,
          el('button', {
            class: 'btn sm danger', onclick: async () => {
              if (!confirm('Forget the company file on this computer?\n\nYour saved bids are not affected, but you will have to load the file again before you can price anything.')) return;
              await companyForget(); location.reload();
            }
          }, 'Forget it on this computer')),
        cfStatus)));

    v.append(el('div', { class: 'card' }, el('h2', {}, 'Company Settings — rates & factors'),
      el('div', { class: 'pad hint' },
        el('p', {}, 'These are the values that were locked cells in the spreadsheet — wages, burden percentages, fee tables. Changing one here changes it for ', el('b', {}, 'new bids'), '. Bids keep the rates they were created with; open a bid and use the banner button below to bring it up to current rates.'),
        app.bid ? el('div', { class: 'formrow', style: 'align-items:center' },
          el('button', {
            class: 'btn', onclick: () => {
              app.bid.settingsSnapshot = effectiveSettings();
              app.touch(); router.render();
              toast('Bid "' + (app.bid.info.estNo || '') + '" now uses current company rates');
            }
          }, 'Apply current rates to the open bid'),
          el('span', {}, 'Open bid: ' + (app.bid.info.estNo || '—') + ' Rev ' + app.bid.meta.rev)) : null)));

    const rows = settingRows();
    const groups = {};
    for (const r of rows) (groups[r.group] = groups[r.group] || []).push(r);
    for (const [gname, list] of Object.entries(groups)) {
      const body = el('div', { class: 'pad' });
      body.append(el('div', { class: 'set-row', style: 'font-weight:600;color:var(--muted)' },
        el('span', {}, 'Setting'), el('span', { style: 'text-align:right' }, 'Current'), el('span', { class: 'factory' }, 'Factory'), el('span')));
      for (const r of list) {
        const factoryVal = pathGet(factory, r.path);
        const curVal = r.path in overrides ? overrides[r.path] : factoryVal;
        const show = (val) => r.kind === 'pct' ? fmt.num(val * 100, r.dec ?? 1) : (r.kind === 'text' ? String(val ?? '') : fmt.num(val, r.kind === 'money' ? 2 : (r.dec ?? 2)));
        const input = el('input', { class: 'num' + (r.path in overrides ? ' set-changed' : ''), value: show(curVal), style: 'text-align:right' });
        input.addEventListener('change', () => {
          let val;
          if (r.kind === 'text') val = input.value;
          else {
            val = fmt.parseNum(input.value);
            if (val === null) { input.value = show(curVal); return; }
            if (r.kind === 'pct') val = val / 100;
          }
          const ov = store.settingsOverrides();
          const same = r.kind === 'text' ? val === factoryVal : Math.abs(val - factoryVal) < 1e-12;
          if (same) delete ov[r.path]; else ov[r.path] = val;
          store.saveSettingsOverrides(ov);
          router.render();
        });
        const reset = el('button', { class: 'btn sm sec', disabled: r.path in overrides ? null : '', onclick: () => { const ov = store.settingsOverrides(); delete ov[r.path]; store.saveSettingsOverrides(ov); router.render(); } }, 'Reset');
        body.append(el('div', { class: 'set-row' },
          el('span', {}, r.label), input,
          el('span', { class: 'factory' }, show(factoryVal)), reset));
      }
      v.append(el('div', { class: 'card' }, el('h2', {}, gname,
        el('span', { class: 'spacer' }),
        list.some(r => r.path in overrides) ? el('span', { class: 'badge yellow' }, 'modified') : null), body));
    }

    // phase code descriptions (company-standard)
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Phase Codes'), el('div', { class: 'pad hint' },
      'The 8-division phase code dictionary (270 standard descriptions) rides inside the app. Per-bid custom codes are entered on the bid itself (they show as editable slots on the Booking page and in the takeoff dropdowns). Export the code matrix from the Booking page if you need the time-sheet file.')));
  },
};

// ---------------- Function map page ----------------
router.routes.functions = {
  title: () => 'Function Map',
  needsBid: false,
  render(v) {
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Where every spreadsheet function lives now'),
      el('div', { class: 'pad', html: FUNCTION_MAP_HTML })));
  },
};
