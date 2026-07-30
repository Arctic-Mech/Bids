// ============================================================
// Page: Indirect Costs (OCIP · Permits · Bond · EMO)
// ============================================================
'use strict';

router.routes.indirects = {
  title: () => 'Indirect Costs',
  needsBid: true,
  render(v) {
    const bid = app.bid, S = app.settings, c = app.computed, r = c.recap;

    // ---------- Permits ----------
    const permitOptions = [['none', 'No Permits'], ...S.permits.jurisdictions.map(j => [j.id, j.name]), ['custom', 'Custom (own fee tiers)']];
    const pt = el('table', { class: 'grid' });
    pt.append(th('Jurisdiction', { t: 'Subtotal', num: 1 }, { t: 'Plan Review', num: 1 }, { t: 'Markup', num: 1 }, { t: 'Total', num: 1 }, ''));
    for (const [id, name] of permitOptions) {
      if (id === 'none') continue;
      const b = c.permits.blocks[id];
      if (!b) continue;
      const sel = bid.permitCalc.selection === id;
      pt.append(el('tr', sel ? { style: 'outline:2px solid var(--blue)' } : {},
        tdTxt(name, 'label'), calcCell(b.subtotal, 'money'), calcCell(b.planReview, 'money'), calcCell(b.markup, 'money'), calcCell(b.total, 'money'),
        el('td', {}, el('button', { class: 'btn sm ' + (sel ? '' : 'sec'), onclick: () => { bid.permitCalc.selection = sel ? 'none' : id; app.touch(); router.render(); } }, sel ? 'Selected' : 'Select'))));
    }
    const permitCard = el('div', { class: 'card' },
      el('h2', {}, 'Permit Calculator', el('span', { class: 'spacer' }),
        el('span', { class: 'hint' }, 'Construction value (Project Subtotal): ' + fmt.money(c.permits.constructionValue)),
        el('span', { class: 'badge blue' }, bid.permitCalc.selection === 'none' ? 'No Permits' : fmt.money(c.permits.total))),
      wrap(pt));
    // custom tier editor
    const ct = el('table', { class: 'grid' });
    ct.append(th({ t: 'Min $', num: 1 }, { t: 'Max $', num: 1 }, { t: 'Fee', num: 1 }, { t: 'per $ Increment', num: 1 }, { t: 'Tier fee @ CV', num: 1 }));
    bid.permitCalc.custom.tiers.forEach((t2, i) => {
      ct.append(el('tr', {},
        i === 0 ? calcCell(0, 'int') : tdIn(numIn('permitCalc.custom.tiers[' + i + '].min', { dec: 0, zeroWhenEmpty: true, after: rerender })),
        tdIn(numIn('permitCalc.custom.tiers[' + i + '].max', { dec: 0, zeroWhenEmpty: true, after: rerender })),
        tdIn(numIn('permitCalc.custom.tiers[' + i + '].fee', { after: rerender })),
        tdIn(numIn('permitCalc.custom.tiers[' + i + '].inc', { dec: 0, after: rerender })),
        calcCell(c.permits.blocks.custom.fees[i], 'money')));
    });
    permitCard.append(el('div', { class: 'pad' },
      el('details', {},
        el('summary', { style: 'cursor:pointer' }, 'Custom jurisdiction fee tiers (based on City of Salem)'),
        wrap(ct),
        el('div', { class: 'formrow', style: 'margin-top:8px' },
          el('div', {}, el('label', {}, 'Plan review %'), numIn('permitCalc.custom.planReviewPct', { pct: true, dec: 0, after: rerender })),
          el('div', {}, el('label', {}, 'Markup %'), numIn('permitCalc.custom.markupPct', { pct: true, dec: 0, after: rerender }))))));
    v.append(permitCard);

    // ---------- OCIP ----------
    const o = c.ocip;
    const ot = el('table', { class: 'grid' });
    ot.append(th('WC Class', 'Code', { t: '% Onsite', num: 1 }, { t: 'Est. Man-hours', num: 1 }, { t: 'Est. On-site Payroll', num: 1 }, { t: 'Rate per $100', num: 1 }, { t: 'Premium', num: 1 }));
    S.ocip.wcClasses.forEach((w, i) => {
      ot.append(el('tr', {}, tdTxt(w.desc, 'label'), tdTxt(String(w.code), 'calc'), calcCell(w.pctOnsite, 'pct'),
        calcCell(o.hours[i], 'hrs'), calcCell(o.payrolls[i], 'money'), calcCell(w.rate * 100, 'money'), calcCell(o.wcRows[i].premium, 'money')));
    });
    const os = el('table', { class: 'grid' });
    const orow = (l, v2, hint) => os.append(el('tr', {}, tdTxt(l, 'label'), calcCell(v2, 'money'), tdTxt(hint || '', 'label')));
    os.append(th('Premium Worksheet', { t: 'Amount', num: 1 }, ''));
    orow('Total On-site Payroll', o.totalPayroll);
    orow('Estimated Total WC Premium', o.estPremium);
    orow('Modified Premium (× EMR ' + fmt.num(S.crew.sections.smField.pti.wc.emr, 2) + ')', o.modifiedPremium);
    orow('After Other Factors (× ' + fmt.num(S.ocip.otherFactors, 2) + ')', o.afterFactors, 'Partial Waiver of Sub, AGC, TRIA');
    orow('Oregon Tax (× DCBS − 1)', o.oregonTax);
    orow('Total Workers’ Comp Cost', o.totalWC);
    orow('GL — Premises & Operations (' + fmt.money(S.ocip.glPremisesRate) + '/$1,000)', o.glPremises);
    orow('GL — Products / Completed Ops (' + fmt.money(S.ocip.glProductsRate) + '/$1,000)', o.glProducts);
    orow('Total General Liability Premium', o.totalGL);
    os.append(el('tr', { class: 'subtotal' }, tdTxt('Total Liability Premium (used for "OCIP GL Only")'), calcCell(o.deductGLOnly, 'money'), tdTxt('')));
    os.append(el('tr', { class: 'grand' }, tdTxt('GRAND TOTAL — OCIP Deduct'), calcCell(o.deductTotal, 'money'), tdTxt('')));
    v.append(el('div', { class: 'card' },
      el('h2', {}, 'OCIP — Insurance Premium Worksheet', el('span', { class: 'spacer' }),
        el('span', { class: 'badge ' + (bid.recap.ocipToggle === 'No OCIP' ? 'blue' : 'green') }, bid.recap.ocipToggle)),
      el('div', { class: 'pad formrow' },
        el('div', {}, el('label', {}, 'OCIP mode (also on Recap)'), selIn('recap.ocipToggle', ['No OCIP', 'OCIP', 'OCIP GL Only'])),
        el('div', {}, el('label', {}, 'Bid package name'), textIn('ocipForm.bidPackageName', { placeholder: bid.info.jobName || 'job name' })),
        el('div', {}, el('label', {}, 'Bid package #'), textIn('ocipForm.bidPackageNo'))),
      // The enrollment application's own questions. They change no total — they are
      // written onto the OCIP sheet of the exported workbook, where they print as
      // the circled answers on the form.
      el('div', { class: 'pad formrow' },
        el('div', {}, el('label', {}, 'Applicant is'), selIn('ocipForm.applicantType',
          [[1, 'Corporation'], [2, 'Partnership'], [3, 'Sole Proprietorship'], [4, 'Joint Venture']], { rerender: false, num: true })),
        el('div', {}, el('label', {}, 'Contract is with'), selIn('ocipForm.contractWith',
          [[1, 'Owner directly'], [2, 'Construction Manager'], [3, 'General / Prime Contractor'], [4, 'Subcontractor']], { rerender: false, num: true })),
        el('div', {}, el('label', {}, 'Subcontracting any work?'), selIn('ocipForm.subcontractWork',
          [[1, 'Yes'], [2, 'No']], { rerender: false, num: true })),
        el('div', {}, el('label', {}, 'Bid type'), selIn('ocipForm.bidType',
          [[1, 'Original bid'], [2, 'Change order']], { rerender: false, num: true })),
        el('div', {}, el('label', {}, 'Contract type'), selIn('ocipForm.contractType',
          [[1, 'GMP'], [2, 'Fixed price'], [3, 'Time & materials']], { rerender: false, num: true })),
        el('div', {}, el('label', {}, 'Rate is a combined rate'), selIn('ocipForm.combinedRate',
          [[1, 'Yes'], [2, 'No']], { rerender: false, num: true }))),
      wrap(ot), wrap(os),
      el('div', { class: 'pad hint' }, 'The deduct only enters the bid when OCIP mode is "OCIP" (full deduct) or "OCIP GL Only" (liability only) — it reduces Total Labor Cost on the Recap. On-site payrolls assume ' + fmt.pct(S.ocip.payrollFraction, 0) + ' of burdened labor dollars is bare payroll; SM Shop is excluded (off-site).')));

    // ---------- Bond ----------
    const b = r.bond;
    const bt = el('table', { class: 'grid' });
    bt.append(th('Bracket', { t: 'Width', num: 1 }, { t: 'Rate / $1,000', num: 1 }, { t: 'Premium', num: 1 }));
    S.bond.brackets.forEach((w, i) => {
      bt.append(el('tr', {}, tdTxt(['1st', 'Next', 'Next', 'Next', 'Over'][i], 'label'), calcCell(w, 'int'), calcCell(S.bond.rates[i], 'money'), calcCell(b.tiers[i], 'money')));
    });
    bt.append(el('tr', { class: 'subtotal' }, tdTxt('Total Job Bond'), tdTxt(''), tdTxt(''), calcCell(b.total, 'money')));
    v.append(el('div', { class: 'card' },
      el('h2', {}, 'Performance Bond', el('span', { class: 'spacer' }),
        el('span', { class: 'badge ' + (bid.recap.bondRequired === 'Yes' ? 'green' : 'blue') }, bid.recap.bondRequired === 'Yes' ? 'Included: ' + fmt.money(r.H66) : 'Not required')),
      el('div', { class: 'pad formrow' },
        el('div', {}, el('label', {}, 'Bond required (also on Recap)'), selIn('recap.bondRequired', ['No', 'Yes'])),
        el('div', {}, el('label', {}, 'Sell price before bonding'), el('b', {}, fmt.money(b.sellBeforeBond))),
        el('div', {}, el('label', {}, 'Job length (labor-rate period)'), el('b', {}, b.months + ' months'))),
      wrap(bt)));

    // ---------- EMO ----------
    const e2 = r.emo;
    v.append(el('div', { class: 'card' },
      el('h2', {}, 'EMO — Equipment Markup Override', el('span', { class: 'spacer' }), el('span', { class: 'badge blue' }, fmt.money(e2.base) + ' flagged')),
      el('div', { class: 'pad' },
        el('p', {}, 'Total equipment value marked "EMO = Yes" in TakeOff: ', el('b', {}, fmt.money(e2.base))),
        el('p', {}, 'Original markup at O&P ', fmt.pct(N(bid.recap.ohp), 0), ': ', el('b', {}, fmt.money(e2.original)),
          ' → revised at equipment markup ', fmt.pct(N(bid.recap.equipMarkup), 0), ': ', el('b', {}, fmt.money(e2.revised))),
        el('p', {}, e2.delta > 0 ? ('Amount ' + (e2.added ? 'added to' : 'reduced from') + ' estimate overhead & profit: ') : 'No EMO adjustment. ',
          e2.delta > 0 ? el('b', {}, fmt.money(e2.delta)) : ''))));
  },
};

// ============================================================
// Page: Price Breakdown
// ============================================================
router.routes.pricebreakdown = {
  title: () => 'Price Breakdown',
  needsBid: true,
  render(v) {
    const bid = app.bid, c = app.computed, pb = c.priceBreakdown;
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Budget Breakdown — ' + (bid.info.jobName || '')),
      el('div', { class: 'pad formrow' },
        el('div', {}, el('label', {}, 'Direct Costs'), el('b', {}, fmt.money(pb.directs))),
        el('div', {}, el('label', {}, 'GCs, Indirects & Project Subs'), el('b', {}, fmt.money(pb.gcs))),
        el('div', {}, el('label', {}, 'Fee'), el('b', {}, fmt.money(pb.fee))),
        el('div', {}, el('label', {}, 'Labor Factor (adders / takeoff hrs)'), el('b', {}, fmt.pct(pb.laborFactor, 0))),
        el('div', {}, el('label', {}, 'Total Sell'), el('b', { style: 'font-size:16px;color:var(--blue-dark)' }, fmt.money(pb.totalSell))))));
    const t = el('table', { class: 'grid' });
    t.append(th('#', 'Section', { t: 'Fld Hrs', num: 1 }, { t: 'Fld Labor $', num: 1 }, { t: 'Shop Hrs', num: 1 }, { t: 'Shop Labor $', num: 1 },
      { t: 'Materials', num: 1 }, { t: 'Sub Total', num: 1 }, { t: 'GCs', num: 1 }, { t: 'Fee', num: 1 }, { t: 'Item Total', num: 1 }));
    pb.items.forEach((it, i) => {
      if (i > 0 && !it.name && !it.subTotal) return;
      t.append(el('tr', {}, tdTxt(String(i), 'calc'), tdTxt(it.name, 'label'),
        calcCell(it.fieldHours, 'hrs'), calcCell(it.fieldCost, 'money'), calcCell(it.shopHours, 'hrs'), calcCell(it.shopCost, 'money'),
        calcCell(it.material, 'money'), calcCell(it.subTotal, 'money'), calcCell(it.gcAlloc, 'money'), calcCell(it.feeAlloc, 'money'), calcCell(it.sellTotal, 'money')));
      const key = i === 0 ? 'CAE' : String(app.bid.takeoff.groups[i - 1].id);
      const ta = el('textarea', { rows: 1, style: 'width:100%;font-size:12px', placeholder: 'Notes about scope / what is included in this section…' }, it.notes || '');
      ta.addEventListener('change', () => { app.bid.priceBreakdown.notes[key] = ta.value; app.touch(); });
      t.append(el('tr', {}, el('td', { colspan: 11, style: 'background:#fbfcff' }, ta)));
    });
    t.append(el('tr', { class: 'grand' }, tdTxt(''), tdTxt('Column Totals'),
      calcCell(sum(pb.items.map(x => x.fieldHours)), 'hrs'), calcCell(sum(pb.items.map(x => x.fieldCost)), 'money'),
      calcCell(sum(pb.items.map(x => x.shopHours)), 'hrs'), calcCell(sum(pb.items.map(x => x.shopCost)), 'money'),
      calcCell(sum(pb.items.map(x => x.material)), 'money'), calcCell(pb.directs, 'money'),
      calcCell(pb.gcs, 'money'), calcCell(pb.fee, 'money'), calcCell(pb.totalSell, 'money')));
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Sections'), wrap(t)));
  },
};
