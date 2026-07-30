// ============================================================
// Page: Crew Mix
// ============================================================
'use strict';

router.routes.crewmix = {
  title: () => 'Crew Mix',
  needsBid: true,
  render(v) {
    const bid = app.bid, S = app.settings, c = app.computed;
    const sections = [
      ['smField', 'SM Field Labor Rate', c.crew.smField],
      ['smShop', 'SM Shop Labor Rate', c.crew.smShop],
      ['plumberFitter', 'Plumber / Pipefitter Labor Rate', c.crew.plumberFitter],
    ];

    const rates = el('div', { class: 'pad formrow' },
      ...sections.map(([key, label, sec]) => el('div', {},
        el('label', {}, label.replace(' Labor Rate', '')),
        el('b', { style: 'font-size:15px' }, fmt.money(sec.tiers.st.crewRate)),
        el('span', { class: 'hint' }, ' ST · ' + fmt.money(sec.tiers.ot.crewRate) + ' OT · ' + fmt.money(sec.tiers.dt.crewRate) + ' DT'))));
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Blended Crew Rates ($/hr)'), rates,
      el('div', { class: 'pad hint' }, 'Enter how many of each classification are on the crew. Wages, fringes and burden percentages are company settings (Settings page) — the blend updates everywhere: TakeOff labor costs, Recap rates, supervision.')));

    for (const [key, label, sec] of sections) {
      const secS = S.crew.sections[key];
      const warn = sec.tiers.st.totalQty === 0 && (
        (key === 'smField' && c.recap.hoursSM.base > 0) ||
        (key === 'smShop' && c.recap.hoursShop.base > 0) ||
        (key === 'plumberFitter' && (c.recap.hoursPlumb.base > 0 || c.recap.hoursPipe.base > 0)));
      const t = el('table', { class: 'grid' });
      t.append(th('Classification', { t: 'Crew Qty', num: 1 }, { t: 'Wage', num: 1 }, { t: 'Fringe', num: 1 }, { t: 'W+F', num: 1 }, { t: 'PT&I', num: 1 }, { t: '$/HR (ST)', num: 1 }));
      secS.classes.forEach((cl, i) => {
        const row = sec.tiers.st.rows[i];
        t.append(el('tr', {},
          tdTxt(cl.name, 'label'),
          tdIn(numIn('crewMix.' + key + '.qty[' + i + ']', { int: true, dec: 0, after: rerender })),
          calcCell(row.wage, 'money'), calcCell(row.fringe, 'money'), calcCell(row.subtotal, 'money'), calcCell(row.pti, 'money'), calcCell(row.perHr, 'money')));
      });
      t.append(el('tr', { class: 'subtotal' }, tdTxt('Crew total / avg'), calcCell(sec.tiers.st.totalQty, 'int'), tdTxt(''), tdTxt(''), tdTxt(''), tdTxt(''), calcCell(sec.tiers.st.crewRate, 'money')));

      const tierBar = el('div', { class: 'pad formrow', style: 'align-items:center' },
        el('div', {}, el('label', {}, 'Period factor (escalation)'), numIn('crewMix.' + key + '.pfST', { pct: true, dec: 1, after: rerender, placeholder: fmt.num(secS.periodFactor * 100, 1) })),
        el('div', {}, el('label', {}, 'OT factor override'), numIn('crewMix.' + key + '.pfOT', { pct: true, dec: 1, after: rerender, placeholder: 'inherits' })),
        el('div', {}, el('label', {}, 'DT factor override'), numIn('crewMix.' + key + '.pfDT', { pct: true, dec: 1, after: rerender, placeholder: 'inherits' })),
        key === 'smShop' ? el('div', {}, el('label', {}, 'Shop burden $/hr'), numIn('crewMix.smShop.burdenST', { after: rerender, placeholder: fmt.num(secS.shopBurden, 2) })) : null,
        el('div', {}, el('label', {}, 'OT rate'), el('b', {}, fmt.money(sec.tiers.ot.crewRate))),
        el('div', {}, el('label', {}, 'DT rate'), el('b', {}, fmt.money(sec.tiers.dt.crewRate))),
        key !== 'smShop' ? el('div', {}, el('label', {}, 'Shift adds $/hr'),
          el('span', { class: 'hint' }, key === 'plumberFitter'
            ? 'Swing/Grave ' + fmt.money(c.crew.rates.pfSwing) + ' · LOP ' + fmt.pct(S.crew.sections.plumberFitter.premium.swingLOP, 2) + ' / ' + fmt.pct(S.crew.sections.plumberFitter.premium.graveLOP, 1)
            : 'Swing ' + fmt.money(c.crew.rates.smSwing) + ' · Grave ' + fmt.money(c.crew.rates.smGrave) + ' · Special ' + fmt.money(c.crew.rates.smSpecial))) : null);

      const cardEl = el('div', { class: 'card' },
        el('h2', {}, label, el('span', { class: 'spacer' }),
          warn ? el('span', { class: 'badge red' }, 'No crew entered but hours exist') : null,
          el('span', { class: 'badge blue' }, fmt.money(sec.tiers.st.crewRate) + '/hr')),
        wrap(t), tierBar);
      v.append(cardEl);
    }

    // hours roll-up (informational, mirrors Total_* named ranges)
    const t = el('table', { class: 'grid' });
    t.append(th('Hours from TakeOff', { t: 'Straight', num: 1 }, { t: 'Overtime', num: 1 }, { t: 'Double-time', num: 1 }, { t: 'Total', num: 1 }));
    const hr = app.computed.crewHours;
    for (const [lbl, o] of [['SM Field', hr.smField], ['SM Shop', hr.smShop], ['Plumb', hr.plumb], ['Pipe', hr.pipe]]) {
      t.append(el('tr', {}, tdTxt(lbl, 'label'), calcCell(o.st, 'hrs'), calcCell(o.ot, 'hrs'), calcCell(o.dt, 'hrs'), calcCell(o.st + o.ot + o.dt, 'hrs')));
    }
    v.append(el('div', { class: 'card' }, el('h2', {}, 'Labor Hours Roll-up'), wrap(t)));

    // OCIP deduct info
    v.append(el('div', { class: 'card' }, el('h2', {}, 'OCIP Deduct (informational)'), el('div', { class: 'pad hint' },
      'SM crew-average OCIP deduct: ' + fmt.money(c.crew.ocipDeductSM) + '/hr · Plumb/Pipe: ' + fmt.money(c.crew.ocipDeductPF) + '/hr. ',
      'Note: the Plumb/Pipe figure replicates the workbook exactly, including its 4×-Foreman weighting (the sheet label says 4× Journeyman).')));
  },
};
