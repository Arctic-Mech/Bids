// ============================================================
// PDF page renderers — registered in PDF_PAGES for the exporter
// ============================================================
'use strict';

// Generic table drawer with pagination. cols: [{w, label, align}], rows: arrays of strings
// rowsOpts entries may be {cells:[...], style:'sub'|'grand'|'head'|'note'}
async function pdfTable(doc, bid, title, cols, rows, opts = {}) {
  const landscape = !!opts.landscape;
  doc.addPage(landscape);
  let y = await pdfChrome(doc, bid, title);
  const x0 = 36;
  const totalW = doc.pw - 72;
  const scale = totalW / cols.reduce((a, c) => a + c.w, 0);
  const widths = cols.map(c => c.w * scale);
  const rowH = opts.rowH || 13;
  const drawHead = () => {
    doc.rect(x0, y, totalW, rowH + 2, { fill: [0.9, 0.92, 0.96], stroke: [0.6, 0.63, 0.7], width: 0.4 });
    let x = x0;
    cols.forEach((c, i) => {
      doc.text(c.align === 'right' ? x + widths[i] - 3 : x + 3, y + 3, c.label, { size: 7.5, bold: true, align: c.align === 'right' ? 'right' : 'left' });
      x += widths[i];
    });
    y += rowH + 2;
  };
  const drawRow = (row, noteSuffix) => {
    const cells = Array.isArray(row) ? row : row.cells;
    const style = Array.isArray(row) ? '' : (row.style || '');
    if (style === 'sub') doc.rect(x0, y, totalW, rowH, { fill: [0.87, 0.9, 0.96], stroke: false });
    if (style === 'grand') doc.rect(x0, y, totalW, rowH, { fill: [0.79, 0.83, 0.93], stroke: false });
    if (style === 'head') doc.rect(x0, y, totalW, rowH, { fill: [0.94, 0.95, 0.98], stroke: false });
    const size = opts.fontSize || 7.5;
    const bold = style === 'sub' || style === 'grand' || style === 'head';
    if (row.span) {
      // full-width banner row (group headers): never chopped into a narrow first column
      const txt = cells.filter(Boolean).join('   ') + (noteSuffix || '');
      doc.text(x0 + 3, y + 2.5, pdfFit(txt, totalW - 6, size, bold), { size, bold });
    } else {
      let x = x0;
      cells.forEach((cell, i) => {
        const c = cols[i];
        const txt = String(cell ?? '');
        // Available width = this column plus any immediately following empty ones,
        // so nothing is truncated needlessly — but a value can never overlap a
        // neighbour that actually has text in it.
        let avail = widths[i];
        if (c.align !== 'right') {
          for (let j = i + 1; j < cols.length && !String(cells[j] ?? '').trim(); j++) avail += widths[j];
        }
        if (txt) doc.text(c.align === 'right' ? x + widths[i] - 3 : x + 3, y + 2.5,
          pdfFit(txt, avail - 6, size, bold),
          { size, bold, align: c.align === 'right' ? 'right' : 'left' });
        x += widths[i];
      });
    }
    doc.line(x0, y + rowH, x0 + totalW, y + rowH, { width: 0.25, color: [0.85, 0.86, 0.9] });
    y += rowH;
  };

  drawHead();
  let lastHead = null;                       // repeated after a break so continuations aren't orphaned
  for (const row of rows) {
    const style = Array.isArray(row) ? '' : (row.style || '');
    if (y > doc.ph - 46) {
      doc.addPage(landscape);
      y = await pdfChrome(doc, bid, title + ' (cont.)');
      drawHead();
      if (lastHead && lastHead !== row) drawRow(lastHead, '  (continued)');
    }
    if (style === 'head') lastHead = row;
    drawRow(row);
  }
  return y;
}

const M = (v) => fmt.money(v);
const H = (v) => fmt.hrs(v);
const P = (v, d) => fmt.pct(v, d ?? 1);

PDF_PAGES.recap = {
  label: 'Estimate Recap', landscape: false,
  async render(doc, bid, c) {
    const r = c.recap;
    const rows = [];
    rows.push({ cells: ['JOB INFORMATION'], style: 'head', span: true });
    rows.push(['Estimate #', bid.info.estNo, 'Bid date: ' + (bid.info.bidDate ? fmt.date(bid.info.bidDate) : '—') + ' ' + (bid.info.bidTime || '')]);
    rows.push(['Job name', bid.info.jobName, 'Location: ' + (bid.info.location || '—')]);
    rows.push(['Project type', bid.info.projectType || '', bid.info.projectSqFt ? '$' + fmt.num(r.dollarsPerSqFt, 2) + ' / SqFt' : '']);
    rows.push({ cells: ['LABOR (hours with adders)'], style: 'head', span: true });
    rows.push(['Plumb  ' + H(r.hoursPlumb.total) + ' hrs @ ' + M(r.ratePlumb), M(r.I21), 'premium ' + M(r.J21)]);
    rows.push(['Pipe  ' + H(r.hoursPipe.total) + ' hrs @ ' + M(r.ratePipe), M(r.I22), 'premium ' + M(r.J22)]);
    rows.push(['SM Field  ' + H(r.hoursSM.total) + ' hrs @ ' + M(r.rateSMField), M(r.I23), 'premium ' + M(r.J23)]);
    rows.push(['SM Shop  ' + H(r.hoursShop.total) + ' hrs @ ' + M(r.rateSMShop), M(r.I24), 'premium ' + M(r.J24)]);
    rows.push(['OCIP deduction (' + bid.recap.ocipToggle + ')', M(r.C27), '']);
    rows.push({ cells: ['Total Labor Cost', M(r.J27), 'Schedule: ' + bid.recap.scheduleType], style: 'sub' });
    rows.push({ cells: ['MATERIAL'], style: 'head', span: true });
    rows.push(['Plumb ' + M(r.D29) + '   ·   Pipe ' + M(r.G29) + '   ·   Sheet Metal ' + M(r.J29), '', '']);
    rows.push({ cells: ['Total Material Cost', M(r.J31), ''], style: 'sub' });
    rows.push({ cells: ['SUBCONTRACT'], style: 'head', span: true });
    for (const s of r.subRows) if (s.value) rows.push([(s.phaseCode ? s.phaseCode + '  ' : '') + (s.name || '') + (s.desc ? ' — ' + s.desc : ''), M(s.value), s.qp || '']);
    rows.push({ cells: ['Total Subcontract', M(r.J45), ''], style: 'sub' });
    rows.push({ cells: ['SUPERVISION & OTHER'], style: 'head', span: true });
    const sv = r.supervision;
    rows.push(['Project Manager ' + H(sv.F48) + ' hrs', M(sv.H48), '']);
    if (sv.H49) rows.push(['Plumb supervision ' + H(sv.F49) + ' hrs', M(sv.H49), '']);
    if (sv.H50) rows.push(['Pipe supervision ' + H(sv.F50) + ' hrs', M(sv.H50), '']);
    if (sv.H51) rows.push(['Arch supervision ' + H(sv.F51) + ' hrs', M(sv.H51), '']);
    if (sv.H52) rows.push(['SM supervision ' + H(sv.F52) + ' hrs', M(sv.H52), '']);
    rows.push(['Equipment rentals', M(r.H53), '']);
    rows.push(['General conditions / indirects', M(r.H54), '']);
    rows.push({ cells: ['Total Other Costs', M(r.J55), ''], style: 'sub' });
    rows.push({ cells: ['BID BUILD-UP'], style: 'head', span: true });
    rows.push(['Total of Direct Costs', M(r.H59), '']);
    rows.push(['Subcontractor markup ' + P(N(bid.recap.subMarkup), 0), M(r.H60), '']);
    rows.push(['Equipment markup (EMO) ' + P(N(bid.recap.equipMarkup), 0), M(r.H61), '']);
    rows.push(['Overhead & profit ' + P(N(bid.recap.ohp), 0), M(r.H62), '']);
    rows.push({ cells: ['Project Subtotal', M(r.H63), ''], style: 'sub' });
    rows.push(['Market recovery', M(r.H64), '']);
    rows.push(['Miscellaneous / contingency', M(r.H65), '']);
    rows.push(['Performance bond (' + bid.recap.bondRequired + ')', M(r.H66), '']);
    rows.push(['Permits', M(r.H67), '']);
    rows.push([bid.recap.taxType + ' @ ' + P(r.I68, 2), M(r.H68), '']);
    rows.push(['Cost leveler & add/deduct', M(r.H69), '']);
    rows.push({ cells: ['TOTAL BID', M(r.H70), ''], style: 'grand' });
    await pdfTable(doc, bid, 'Estimate Recap', [
      { w: 60, label: 'Item' }, { w: 18, label: 'Amount', align: 'right' }, { w: 22, label: '' },
    ], rows, { fontSize: 8.5, rowH: 14 });
  },
};

PDF_PAGES.takeoff = {
  label: 'TakeOff', landscape: true,
  async render(doc, bid, c) {
    const rows = [];
    c.takeoff.groups.forEach((g, gi) => {
      const items = g.rows.filter(rr => (gi === 0) ? (rr.qty || rr.calc.H || rr.calc.K || rr.calc.M) : (rr.src.desc || rr.src.qty || rr.calc.M));
      if (!items.length && !g.name) return;
      rows.push({
        cells: [(gi === 0 ? 'CAE (from SM Import)' : gi + '. ' + (g.name || '(unnamed)')) + (g.exclude ? '  — EXCLUDED' : ''),
          g.payType ? '(' + g.payType + ')' : ''],
        style: 'head', span: true,
      });
      for (const rr of items) {
        const s = gi === 0 ? { matPhase: rr.matPhase, desc: rr.desc, qty: rr.qty } : rr.src;
        rows.push([
          gi === 0 ? rr.matPhase : (s.matPhase || s.fieldPhase || s.shopPhase || ''),
          s.desc || '', fmt.num(N(s.qty), 2),
          gi === 0 ? '' : fmt.num(N(s.fUnit), 2), H(rr.calc.H),
          gi === 0 ? '' : fmt.num(N(s.sUnit), 2), H(rr.calc.K),
          M(rr.calc.M), (s.notes || '') + (s.emo === 'Yes' ? ' [EMO]' : '') + (s.ot ? ' ' + s.ot : '') + (s.shift ? ' ' + s.shift : ''), M(rr.calc.AJ)]);
      }
      rows.push({ cells: ['', 'Group subtotal', '', '', H(g.subH), '', H(g.subK), M(g.subM), '', ''], style: 'sub' });
    });
    const t = c.takeoff.totals;
    rows.push({ cells: ['', 'TOTALS', '', '', H(t.H7), '', H(t.K7), M(t.M7), 'Labor ' + M(t.AI7), M(t.AJ7)], style: 'grand' });
    await pdfTable(doc, bid, 'TakeOff', [
      { w: 8, label: 'Phase' }, { w: 30, label: 'Description' }, { w: 8, label: 'Qty', align: 'right' },
      { w: 7, label: 'Fld U', align: 'right' }, { w: 9, label: 'Fld Hrs', align: 'right' },
      { w: 7, label: 'Shp U', align: 'right' }, { w: 9, label: 'Shp Hrs', align: 'right' },
      { w: 12, label: 'Material', align: 'right' }, { w: 18, label: 'Notes' }, { w: 12, label: 'Row Total', align: 'right' },
    ], rows, { landscape: true });
  },
};

PDF_PAGES.crewmix = {
  label: 'Crew Mix', landscape: false,
  async render(doc, bid, c, S) {
    const rows = [];
    for (const [key, sec] of [['smField', c.crew.smField], ['smShop', c.crew.smShop], ['plumberFitter', c.crew.plumberFitter]]) {
      const label = S.crew.sections[key].label;
      rows.push({ cells: [label], style: 'head', span: true });
      S.crew.sections[key].classes.forEach((cl, i) => {
        const rr = sec.tiers.st.rows[i];
        if (!rr.qty) return;
        rows.push([cl.name, fmt.int(rr.qty), M(rr.wage), M(rr.fringe), M(rr.pti), M(rr.perHr)]);
      });
      rows.push({ cells: ['Crew rate — Straight', fmt.int(sec.tiers.st.totalQty), '', '', '', M(sec.tiers.st.crewRate)], style: 'sub' });
      rows.push({ cells: ['Crew rate — Overtime', '', '', '', '', M(sec.tiers.ot.crewRate)], style: 'sub' });
      rows.push({ cells: ['Crew rate — Double-time', '', '', '', '', M(sec.tiers.dt.crewRate)], style: 'sub' });
    }
    await pdfTable(doc, bid, 'Crew Mix', [
      { w: 34, label: 'Classification' }, { w: 8, label: 'Qty', align: 'right' }, { w: 12, label: 'Wage', align: 'right' },
      { w: 12, label: 'Fringe', align: 'right' }, { w: 12, label: 'PT&I', align: 'right' }, { w: 12, label: '$/HR', align: 'right' },
    ], rows, { fontSize: 8.5, rowH: 14 });
  },
};

PDF_PAGES.indirects = {
  label: 'Indirects (OCIP-Permits-Bond)', landscape: false,
  async render(doc, bid, c, S) {
    const rows = [];
    const o = c.ocip, r = c.recap;
    rows.push({ cells: ['PERMIT CALCULATOR — construction value ' + M(c.permits.constructionValue), '', ''], style: 'head' });
    for (const [id, b] of Object.entries(c.permits.blocks)) {
      rows.push([(bid.permitCalc.selection === id ? '> ' : '') + b.name, M(b.total), bid.permitCalc.selection === id ? 'SELECTED' : '']);
    }
    rows.push({ cells: ['Permit calculator total (+ manual permits ' + M(sum(r.permitRows)) + ')', M(r.J83), ''], style: 'sub' });
    rows.push({ cells: ['OCIP PREMIUM WORKSHEET — mode: ' + bid.recap.ocipToggle, '', ''], style: 'head' });
    S.ocip.wcClasses.forEach((w, i) => rows.push([w.desc + ' (class ' + w.code + ') payroll ' + M(o.payrolls[i]), M(o.wcRows[i].premium), P(w.rate, 2) + '/$100']));
    rows.push(['Modified premium (EMR)', M(o.modifiedPremium), '']);
    rows.push(['Total workers comp cost', M(o.totalWC), '']);
    rows.push(['General liability premium', M(o.totalGL), '']);
    rows.push({ cells: ['OCIP deduct total', M(o.deductTotal), 'GL-only: ' + M(o.deductGLOnly)], style: 'sub' });
    rows.push({ cells: ['PERFORMANCE BOND — ' + bid.recap.bondRequired, '', ''], style: 'head' });
    S.bond.brackets.forEach((w, i) => rows.push(['Bracket ' + (i + 1) + ' (' + fmt.int(w) + ' @ ' + fmt.num(S.bond.rates[i], 2) + '/$1,000)', M(r.bond.tiers[i]), '']));
    rows.push({ cells: ['Total job bond (sell before bonding ' + M(r.bond.sellBeforeBond) + ')', M(r.bond.total), ''], style: 'sub' });
    rows.push({ cells: ['WORK / MARKET RECOVERY', '', ''], style: 'head' });
    for (const w of r.workRecovery.rows) if (w.used || w.rate) rows.push([w.label + ' — ' + H(w.hours) + ' hrs @ ' + M(w.rate) + ' (max ' + fmt.num(w.maxHrs, 0) + ')', M(w.used), '']);
    rows.push({ cells: ['Applied to bid as Market Recovery', M(r.H64), ''], style: 'sub' });
    rows.push({ cells: ['EMO — EQUIPMENT MARKUP OVERRIDE', '', ''], style: 'head' });
    rows.push(['Equipment flagged in TakeOff', M(r.emo.base), '']);
    rows.push(['Original markup ' + P(N(bid.recap.ohp), 0) + ' → revised ' + P(N(bid.recap.equipMarkup), 0), M(r.emo.revised), (r.emo.added ? 'added' : 'reduced') + ' ' + M(r.emo.delta)]);
    await pdfTable(doc, bid, 'Indirect Costs', [
      { w: 58, label: 'Item' }, { w: 20, label: 'Amount', align: 'right' }, { w: 22, label: '' },
    ], rows, { fontSize: 8.5, rowH: 14 });
  },
};

PDF_PAGES.pricebreakdown = {
  label: 'Price Breakdown', landscape: true,
  async render(doc, bid, c) {
    const pb = c.priceBreakdown;
    const rows = [];
    pb.items.forEach((it, i) => {
      if (i > 0 && !it.name && !it.subTotal) return;
      rows.push([String(i), it.name, H(it.fieldHours), M(it.fieldCost), H(it.shopHours), M(it.shopCost), M(it.material), M(it.subTotal), M(it.gcAlloc), M(it.feeAlloc), M(it.sellTotal)]);
      if (it.notes) rows.push({ cells: ['', it.notes, '', '', '', '', '', '', '', '', ''], style: 'note' });
    });
    rows.push({ cells: ['', 'TOTALS', '', '', '', '', '', M(pb.directs), M(pb.gcs), M(pb.fee), M(pb.totalSell)], style: 'grand' });
    await pdfTable(doc, bid, 'Price Breakdown', [
      { w: 4, label: '#' }, { w: 30, label: 'Section' }, { w: 8, label: 'Fld Hrs', align: 'right' }, { w: 11, label: 'Fld $', align: 'right' },
      { w: 8, label: 'Shp Hrs', align: 'right' }, { w: 10, label: 'Shp $', align: 'right' }, { w: 11, label: 'Material', align: 'right' },
      { w: 11, label: 'Sub Total', align: 'right' }, { w: 10, label: 'GCs', align: 'right' }, { w: 10, label: 'Fee', align: 'right' }, { w: 12, label: 'Item Total', align: 'right' },
    ], rows, { landscape: true });
  },
};

// ---------------- Proposal: the classic printed form ----------------
// Reproduces the workbook's own printed Proposal sheet. Every coordinate below is
// the position measured off that printed sheet (a 612x792 page whose content runs
// x 2.5..609.7), mapped through X()/Y() into a 10pt page margin so no border ever
// lands in a printer's unprintable edge. Keep the raw numbers: they are the spec.
const PROP_G = {
  boxes: [                                  // [topY, bottomY] of each double-ruled box
    [21.7, 179.9],                          // letterhead + field grid
    [184.9, 502.5],                         // scope / exclusions
    [507.0, 644.3],                         // WE PROPOSE
    [648.1, 706.9],                         // acceptance
  ],
  rowTops: [95.4, 116.4, 138.1, 159.9],     // the four field-grid rows
  scopeTop: 186.6, scopeBottom: 502.5,      // usable interior of the scope box (B17 sits right under the rule)
  exclAnchor: 453.6,                        // where "Exclusions:" sits on the blank form
  scopeIndent: 12.8, scopeRight: 557,        // the scope cell's own left/right
  exListX: 79.4, exListRight: 598.6,        // D39:S42 — the exclusions run sits right of the label
};

PDF_PAGES.proposal = {
  label: 'Proposal', landscape: false,
  async render(doc, bid, c, S) {
    doc.addPage(false);
    const P = S.ref.proposal;
    const G = PROP_G;

    // ---- target-sheet coordinates -> page coordinates ----
    const SX = 588 / 607.2;                            // 2.5..609.7  ->  12..600
    const DY = 6;
    const X = (v) => 12 + (v - 2.5) * SX;
    const Y = (v) => v + DY;
    // text() takes the top of the text box; the measured numbers are Arial ascender
    // tops, hence the small per-size correction.
    // Text is drawn at size*SX so a string occupies the same fraction of the form as
    // it does on the printed sheet; every width below is therefore in sheet units.
    const T = (x, y, str, size, opts = {}) => doc.text(X(x), Y(y) + 0.105 * size, String(str ?? ''), { size: size * SX, ...opts });
    const Tc = (x1, x2, y, str, size, opts = {}) => doc.text((X(x1) + X(x2)) / 2, Y(y) + 0.105 * size, String(str ?? ''), { size: size * SX, align: 'center', ...opts });
    const rule = (y, x1 = 2.5, x2 = 609.7, width = 0.7) => doc.line(X(x1), Y(y), X(x2), Y(y), { width });
    const vrule = (x, y1, y2, width = 0.7) => doc.line(X(x), Y(y1), X(x), Y(y2), { width });
    const ul = (y, x1, x2) => doc.line(X(x1), Y(y), X(x2), Y(y), { width: 0.6 });
    // Excel's "double" border: two hairlines, 1.7pt apart, all the way round
    const boxDouble = (yTop, yBot) => {
      const x0 = X(0.4), x1 = X(611.8), h = (yBot + 2.2) - yTop;
      doc.rect(x0, Y(yTop), x1 - x0, h, { width: 0.7 });
      doc.rect(x0 + 1.7, Y(yTop) + 1.7, x1 - x0 - 3.4, h - 3.4, { width: 0.5 });
    };
    const wrap = (txt, size, bold, maxW, firstW) => {
      const out = [];
      for (const para of String(txt ?? '').split(/\n+/)) {
        const words = para.split(/\s+/).filter(Boolean);
        if (!words.length) { out.push(''); continue; }
        let line = '';
        for (const word of words) {
          const lim = out.length === 0 && firstW ? firstW : maxW;
          const test = line ? line + ' ' + word : word;
          if (line && textWidth(test, size, bold) > lim) { out.push(line); line = word; }
          else line = test;
        }
        if (line) out.push(line);
      }
      return out;
    };

    // ================= frame =================
    for (const [a, b] of G.boxes) boxDouble(a, b);
    rule(94.6);                                      // under the ATTN / BID # line
    for (const y of [115.6, 137.3, 159.0]) rule(y);   // field-grid row separators
    vrule(239.6, 95.4, 179.9);                        // main left/right divider
    vrule(378.7, 95.4, 116.4); vrule(387.1, 95.4, 116.4);   // PHONE | spacer | DATE
    vrule(159.0, 159.9, 179.9); vrule(424.6, 159.9, 179.9); // ARCHITECT | DATE OF PLANS | FAX
    rule(553.8);                                      // under "Payment to be made as follows:"

    // ================= title + letterhead =================
    Tc(2.5, 609.7, 1.7, 'Proposal', 17.6, { bold: true, italic: true });
    const lh = P.letterhead || [];
    Tc(2.5, 609.7, 27.3, lh[0] || '', 14.2, { bold: true });
    Tc(2.5, 609.7, 44.7, lh[1] || '', 9.7);
    Tc(2.5, 609.7, 56.8, lh[2] || '', 9.7);
    Tc(2.5, 609.7, 69.0, lh[3] || '', 9.7, { bold: true });

    // ================= ATTN / BID # =================
    T(5.0, 82.3, 'ATTN:', 10.6, { bold: true });
    if (bid.proposal.attn) T(42, 82.9, pdfFit(bid.proposal.attn, 500 - 42, 9.7, false), 9.7);
    T(508.1, 83.9, 'BID #', 8.8);
    T(545.5, 83.9, bid.info.estNo || '', 8.8);

    // ================= field grid =================
    // label (tiny italic, top-left of the cell) + value indented 17.2pt, like the sheet
    const cellV = (x, rowIx, val, right, center) => {
      const s = String(val ?? '');
      if (!s) return;
      if (center) Tc(x, right, G.rowTops[rowIx] + 10.3, pdfFit(s, right - x - 6, 9.7, true), 9.7, { bold: true });
      else T(x + 17.2, G.rowTops[rowIx] + 10.3, pdfFit(s, right - (x + 17.2) - 4, 9.7, true), 9.7, { bold: true });
    };
    const cellL = (x, rowIx, label) => T(x, G.rowTops[rowIx] + 0.4, label, 6.1, { italic: true });
    const dt = (v) => v ? (/^\d{4}-\d\d-\d\d$/.test(v) ? fmt.date(v) : v) : '';

    cellL(2.5, 0, 'PROPOSAL SUBMITTED TO');  cellV(2.5, 0, bid.proposal.submittedTo, 239.6);
    cellL(241.2, 0, 'PHONE');                cellV(241.2, 0, bid.proposal.phone, 378.7);
    cellL(388.8, 0, 'DATE');                 cellV(387.1, 0, dt(bid.proposal.date), 609.7, true);
    cellL(2.5, 1, 'ADDRESS:');               cellV(2.5, 1, bid.proposal.address, 239.6);
    cellL(241.2, 1, 'JOB NAME');             cellV(241.2, 1, bid.info.jobName, 609.7);
    cellL(2.5, 2, 'CITY, STATE, & ZIP');     cellV(2.5, 2, bid.proposal.cityStateZip, 239.6);
    cellL(241.2, 2, 'JOB LOCATION');         cellV(241.2, 2, bid.info.location, 609.7);
    cellL(2.5, 3, 'ARCHITECT');              cellV(2.5, 3, bid.proposal.architect, 159.0);
    cellL(160.7, 3, 'DATE OF PLANS');        cellV(160.7, 3, dt(bid.proposal.dateOfPlans), 239.6);
    cellL(426.3, 3, 'FAX ');                 cellV(426.3, 3, bid.proposal.fax, 609.7);

    // ================= scope / clarifications / exclusions =================
    const wScope = G.scopeRight - G.scopeIndent;
    const body = [];                                  // {t,size,bold,ul,x,lead}
    const scopeParas = String(bid.proposal.scope || '').split(/\n\s*\n/).filter(t => t.trim());
    scopeParas.forEach((para, pi) => {
      const bold = pi === 0;                          // B17:S18 is bold+underlined, B19:S38 underlined
      for (const ln of wrap(para, 9.7, bold, wScope)) body.push({ t: ln, size: 9.7, bold, ul: !!ln, x: G.scopeIndent, lead: 12.5 });
      if (pi < scopeParas.length - 1) body.push({ t: '', size: 6, lead: 6 });
    });
    const clar = (bid.proposal.clarifications || []).filter(Boolean);
    if (clar.length) {
      body.push({ t: '', size: 6, lead: 8 });
      body.push({ t: 'Clarifications:', size: 9.7, ul: true, x: G.scopeIndent, lead: 12.5 });
      for (const cl of clar) {
        wrap('· ' + cl, 8.5, false, wScope - 12).forEach((ln, i) => body.push({ t: ln, size: 8.5, x: G.scopeIndent + (i ? 18 : 8), lead: 10.5 }));
      }
    }
    // Exclusions print as ONE flat comma-separated run in the sheet's D39:S42 box,
    // i.e. to the RIGHT of the "Exclusions:" label, underlined like the scope lines.
    const exText = [...(bid.proposal.exclusionsPicked || []), ...(bid.proposal.inclusionsPicked || []),
      ...(bid.proposal.exclusionLibraryPicked || [])].filter(Boolean).join(', ');
    const exLines = (exText ? wrap(exText, 9.7, false, G.exListRight - G.exListX) : [])
      .map(ln => ({ t: ln, size: 9.7, ul: true, x: G.exListX, lead: 12.4 }));

    // flow the body, then place "Exclusions:" on its printed line when it still fits
    const overflow = [];
    let y = G.scopeTop;
    const draw = (it) => {
      if (it.t) {
        T(it.x, y, it.t, it.size, { bold: it.bold });
        if (it.ul) ul(y + it.size + 0.9, it.x, it.x + textWidth(it.t, it.size, it.bold));
      }
      y += it.lead;
    };
    for (const it of body) {
      if (y + it.lead > G.scopeBottom) { overflow.push(it); continue; }
      if (overflow.length) overflow.push(it); else draw(it);
    }
    const exHeight = Math.max(12.4, exLines.reduce((a, it) => a + it.lead, 0));
    let exY = G.exclAnchor;
    if (exY < y + 8) exY = y + 8;                                       // never sit on the scope text
    if (exY + exHeight > G.scopeBottom) exY = Math.max(y + 8, G.scopeBottom - exHeight);
    if (exY + 12.4 <= G.scopeBottom && !overflow.length) {
      const label = { t: 'Exclusions:', size: 9.7, ul: true, x: G.scopeIndent, lead: 0 };
      y = exY; draw(label);                                             // lead 0: list starts on the same line
      for (const it of exLines) { if (y + it.lead > G.scopeBottom) overflow.push(it); else draw(it); }
    } else {
      overflow.push({ t: 'Exclusions:', size: 9.7, ul: true, x: G.scopeIndent, lead: 12.4 }, ...exLines);
    }

    // ================= WE PROPOSE =================
    const propose = String(P.proposeText || '');
    const mHead = /^(WE PROPOSE)\s*(.*)$/s.exec(propose) || [null, 'WE PROPOSE', propose];
    T(3.1, 509.6, mHead[1], 9.7);
    T(75.6, 511.2, pdfFit(mHead[2], 455 - 75.6, 7.9, false), 7.9);
    Tc(2.5, 425.1, 522.1, pdfFit(c.proposal.amountWords, 425.1 - 2.5 - 6, 7.9, true), 7.9, { bold: true });
    ul(532.0, 2.5, 425.1);
    T(460.1, 522.9, 'dollars ($', 7.1);
    Tc(490.9, 600.0, 520.5, fmt.num(c.proposal.amount, 2), 9.7, { bold: true });
    ul(532.0, 490.9, 600.0);
    T(601.4, 522.9, ').', 7.1);
    const payLbl = 'Payment to be made as follows:';
    T(2.5, 533.9, payLbl, 6.1);
    if (bid.proposal.paymentTerms) {
      T(2.5 + textWidth(payLbl, 6.1, false) + 4, 533.9, pdfFit(bid.proposal.paymentTerms, 609.7 - 95, 6.1, false), 6.1);
    }

    // fine print (left) — two paragraphs, the second on its printed line when it fits
    const terms = String(P.termsText || '').split(/\n\s*\n/);
    const wTerms = 281 - 2.5;
    let ty = 554.9;
    for (const ln of wrap(terms[0] || '', 6.1, false, wTerms)) { T(2.5, ty, ln, 6.1); ty += 8.05; }
    ty = Math.max(603.2, ty + 8);
    for (const ln of wrap(terms[1] || '', 6.1, false, wTerms)) { if (ty > 636) break; T(2.5, ty, ln, 6.1); ty += 8.05; }

    // signature / validity (right)
    T(285.0, 575.2, 'Authorized', 6.1);
    T(285.0, 585.0, 'Signature', 6.1);
    ul(592.7, 318.5, 600.0);
    T(370.4, 603.5, 'Note:  This proposal may be withdrawn by us if not accepted', 7.1);
    T(410.1, 613.3, 'within', 7.1);
    Tc(432.1, 499.4, 613.3, String(bid.proposal.validityDays ?? P.validityDays ?? 30), 7.1);
    ul(620.4, 432.1, 499.4);
    T(503.0, 613.3, 'days.', 7.1);

    // ================= acceptance =================
    const accept = String(P.acceptanceText || '');
    const mAcc = /^(Acceptance of proposal)\s*(.*)$/s.exec(accept) || [null, 'Acceptance of proposal', accept];
    T(3.2, 650.7, mAcc[1] + ' ', 10.6);
    const accLines = wrap(mAcc[2], 7.1, false, 252 - 2.8, 252 - 116.5);
    if (accLines[0]) T(116.5, 653.8, accLines[0], 7.1);
    let ay = 662.7;
    for (const ln of accLines.slice(1)) { if (ay > 690) break; T(2.8, ay, ln, 7.1); ay += 10.2; }
    T(260.2, 672.9, 'Signature', 7.1);
    ul(681.5, 318.5, 609.7);
    T(2.9, 694.0, 'Date of Acceptance', 7.9);
    ul(703.3, 78.9, 240.0);
    T(260.2, 694.7, 'Signature', 7.1);
    ul(703.3, 318.5, 609.7);

    doc.pages[doc.pages.length - 1].noFooter = true;
    Tc(2.5, 609.7, 743.0, String(doc.pages.length), 10);

    // ================= continuation page, only if the scope box overflowed =================
    if (overflow.length) {
      doc.addPage(false);
      boxDouble(21.7, 706.9);
      Tc(2.5, 609.7, 1.7, 'Proposal', 17.6, { bold: true, italic: true });
      T(5.0, 27.0, (bid.info.estNo || '') + '   ' + (bid.info.jobName || '') + '   (continued)', 9.7, { bold: true });
      y = 46;
      for (const it of overflow) {
        if (y + it.lead > 700) { doc.addPage(false); boxDouble(21.7, 706.9); y = 30; }
        draw(it);
      }
      doc.pages[doc.pages.length - 1].noFooter = true;
      Tc(2.5, 609.7, 743.0, String(doc.pages.length), 10);
    }
  },
};

PDF_PAGES.booking = {
  label: 'Booking Report', landscape: false,
  async render(doc, bid, c) {
    const bk = c.booking;
    const rows = [];
    rows.push({ cells: ['STATUS: ' + (bk.complete ? 'Booking Complete' : 'Review booking codes — ' + M(bk.unassigned) + ' un-assigned')], style: bk.complete ? 'sub' : 'head', span: true });
    rows.push({ cells: ['Total bid ' + M(c.recap.H70) + '   ·   Booked ' + M(bk.bookedTotal) + '   ·   Markups+tax ' + M(bk.tail) + '   ·   Hours ' + fmt.num(bk.totalHours, 1)], span: true });
    for (const d of bk.divisions) {
      const nonEmpty = d.rows.filter(x => x.hours || x.labor || x.material);
      if (!nonEmpty.length) continue;
      rows.push({ cells: ['Division ' + d.div + ' — ' + d.name], style: 'head', span: true });
      for (const row of nonEmpty) rows.push([row.code + '  ' + row.desc, H(row.hours), M(row.labor), M(row.material), row.gCode]);
      rows.push({ cells: ['Division totals', H(d.totHours), M(d.totLabor), M(d.totMat), ''], style: 'sub' });
    }
    await pdfTable(doc, bid, 'Booking Report', [
      { w: 46, label: 'Phase' }, { w: 12, label: 'Hours', align: 'right' }, { w: 15, label: 'Labor $', align: 'right' },
      { w: 15, label: 'Material $', align: 'right' }, { w: 8, label: 'Code' },
    ], rows);
  },
};

PDF_PAGES.smimport = {
  label: 'SM Import', landscape: true,
  async render(doc, bid, c) {
    const rows = c.smImport.rows.map(r => [r.floor, r.service, r.type, r.material, r.cutType, fmt.num(r.qty, 0),
      fmt.num(N(r.fieldHoursRaw), 2), r.fieldPct !== '' && r.fieldPct != null ? P(N(r.fieldPct), 0) : '100%', H(r.fieldHours),
      fmt.num(N(r.shopHoursRaw), 2), H(r.shopHours), M(r.materialCost)]);
    rows.push({ cells: ['Totals', '', '', '', '', fmt.num(c.smImport.totals.qty, 0), '', '', H(c.smImport.totals.fieldHours), '', H(c.smImport.totals.shopHours), M(c.smImport.totals.materialCost)], style: 'grand' });
    await pdfTable(doc, bid, 'SM Import (CAE feed)', [
      { w: 10, label: 'Floor' }, { w: 10, label: 'Service' }, { w: 16, label: 'Type' }, { w: 10, label: 'Material' }, { w: 12, label: 'Cut Type' },
      { w: 7, label: 'Qty', align: 'right' }, { w: 8, label: 'Fld Hrs', align: 'right' }, { w: 7, label: 'Fld %', align: 'right' }, { w: 9, label: 'Calc Fld', align: 'right' },
      { w: 8, label: 'Shp Hrs', align: 'right' }, { w: 9, label: 'Calc Shp', align: 'right' }, { w: 11, label: 'Material $', align: 'right' },
    ], rows, { landscape: true });
  },
};

PDF_PAGES.notes = {
  label: 'Takeoff Notes', landscape: false,
  async render(doc, bid) {
    const rows = bid.notes.filter(n => n.desc || n.strategy).map((n, i) => [String(i + 1), n.service, n.desc, n.impact, n.est != null ? M(n.est) : '', n.strategy, n.rfi]);
    if (!rows.length) rows.push(['', '', '(no notes)', '', '', '', '']);
    await pdfTable(doc, bid, "Estimator's Takeoff Notes", [
      { w: 4, label: '#' }, { w: 10, label: 'Service' }, { w: 34, label: 'Description' }, { w: 8, label: 'Impact?' },
      { w: 10, label: 'Est $', align: 'right' }, { w: 26, label: 'Bid Strategy' }, { w: 8, label: 'RFI?' },
    ], rows, { rowH: 15 });
  },
};

PDF_PAGES.schedule = {
  label: 'SM Schedule', landscape: true,
  async render(doc, bid) {
    const rows = [];
    bid.schedule.packages.forEach((p, pi) => {
      rows.push({ cells: [(pi + 1) + '. ' + p.name], style: 'head', span: true });
      p.tasks.forEach((t, ti) => {
        rows.push([(pi + 1) + '.' + (ti + 1), t.desc, t.manpower != null ? fmt.int(t.manpower) : '',
          t.start ? fmt.date(t.start) : '', t.finish ? fmt.date(t.finish) : '', t.status || '']);
      });
    });
    if (!rows.length) rows.push(['', '(no schedule)', '', '', '', '']);
    await pdfTable(doc, bid, 'SM Schedule' + (bid.schedule.pm ? ' — PM: ' + bid.schedule.pm : ''), [
      { w: 6, label: 'WBS' }, { w: 38, label: 'Task' }, { w: 12, label: 'Manpower', align: 'right' },
      { w: 12, label: 'Start' }, { w: 12, label: 'Finish' }, { w: 16, label: 'Status' },
    ], rows, { landscape: true });
  },
};
