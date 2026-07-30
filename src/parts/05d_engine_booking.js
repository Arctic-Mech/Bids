// ============================================================
// Engine part 4: mini formula evaluator (Booking specials),
// Booking Report, Price Breakdown, Proposal
// ============================================================
'use strict';

// ---- Mini evaluator for the Booking Report's special formulas ----
// Supports: numbers, + - * / ( ), 'Sheet'!A1 refs, local A# refs, named ranges,
// SUM(...), ABS(x), SUMIF(rangeA, crit, rangeB), SUMIFS(baseCol, pcCol, crit).
// ctx = { cell(sheet,addr)->num, cellRange(sheet,a,b)->[{key?,val}], local(addr)->string,
//         named(name)->num, sumifs(baseName, code)->num, sumifPairs(sheet, aRange, hRange)->[{code,val}] }
function xlEval(formula, ctx) {
  const src = formula.replace(/^=/, '');
  let i = 0;
  const peek = () => src[i];
  const eof = () => i >= src.length;
  function skipWs() { while (!eof() && src[i] === ' ') i++; }
  function parseExpr() {
    let v = parseTerm();
    for (; ;) {
      skipWs();
      if (peek() === '+') { i++; v += parseTerm(); }
      else if (peek() === '-') { i++; v -= parseTerm(); }
      else return v;
    }
  }
  function parseTerm() {
    let v = parseFactor();
    for (; ;) {
      skipWs();
      if (peek() === '*') { i++; v *= parseFactor(); }
      else if (peek() === '/') { i++; v /= parseFactor(); }
      else return v;
    }
  }
  function parseFactor() {
    skipWs();
    if (peek() === '(') { i++; const v = parseExpr(); skipWs(); if (peek() === ')') i++; return v; }
    if (peek() === '-') { i++; return -parseFactor(); }
    if (peek() === "'") { // 'Sheet Name'!A1 or range
      const m = /^'([^']+)'!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?/.exec(src.slice(i));
      if (!m) throw new Error('bad sheet ref @' + i + ' in ' + formula);
      i += m[0].length;
      if (m[4]) throw new Error('naked range outside function: ' + m[0]);
      return N(ctx.cell(m[1], m[2] + m[3]));
    }
    const num = /^\d+(?:\.\d+)?/.exec(src.slice(i));
    if (num && !/^[A-Z]/.test(src.slice(i))) { i += num[0].length; return Number(num[0]); }
    const fn = /^(SUMIFS|SUMIF|SUM|ABS|ROUND)\(/.exec(src.slice(i));
    if (fn) {
      i += fn[0].length;
      const args = parseArgs();
      return applyFn(fn[1], args);
    }
    const ident = /^\$?[A-Za-z_][A-Za-z0-9_.]*\$?\d*(?::\$?[A-Z]+\$?\d+)?/.exec(src.slice(i));
    if (ident) {
      const raw = ident[0];
      i += raw.length;
      const cellm = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(raw);
      if (cellm) return ctx.local(cellm[1] + cellm[2]);         // local cell ref (phase code)
      return N(ctx.named(raw.replace(/\$/g, '')));
    }
    throw new Error('parse error @' + i + ' in ' + formula);
  }
  // parse raw argument spans (handles nested parens); returns array of raw strings
  function parseArgs() {
    const args = [];
    let depth = 0, start = i;
    for (; ; i++) {
      if (eof()) throw new Error('unterminated args in ' + formula);
      const c = src[i];
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) { args.push(src.slice(start, i)); i++; break; }
        depth--;
      } else if (c === ',' && depth === 0) { args.push(src.slice(start, i)); start = i + 1; }
    }
    return args.map(a => a.trim());
  }
  function evalSub(str) { return xlEval('=' + str, ctx); }
  function rangeRef(str) {
    let m = /^'([^']+)'!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/.exec(str);
    if (m) return { sheet: m[1], a: m[2] + m[3], b: m[4] + m[5] };
    m = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/.exec(str);
    if (m) return { sheet: null, a: m[1] + m[2], b: m[3] + m[4] };
    return null;
  }
  function applyFn(name, args) {
    if (name === 'ABS') return Math.abs(evalSub(args[0]));
    if (name === 'ROUND') return xr(evalSub(args[0]), Number(args[1] ?? 0));
    if (name === 'SUM') {
      let t = 0;
      for (const a of args) {
        const r = rangeRef(a);
        if (r) { for (const p of ctx.cellRange(r.sheet, r.a, r.b)) t += N(p.val); }
        else t += evalSub(a);
      }
      return t;
    }
    if (name === 'SUMIF') {
      const rA = rangeRef(args[0]), rB = rangeRef(args[2]);
      const crit = /^\$?[A-Z]{1,3}\$?\d+$/.test(args[1]) ? ctx.local(args[1].replace(/\$/g, '')) : args[1].replace(/^"|"$/g, '');
      const codes = ctx.cellRange(rA.sheet, rA.a, rA.b);
      const vals = ctx.cellRange(rB.sheet, rB.a, rB.b);
      let t = 0;
      for (let k = 0; k < codes.length; k++) if (String(codes[k].val) === String(crit)) t += N(vals[k] && vals[k].val);
      return t;
    }
    if (name === 'SUMIFS') return N(ctx.sumifs(args[0], ctx.local(args[2].replace(/\$/g, ''))));
    throw new Error('fn ' + name);
  }
  const out = parseExpr();
  skipWs();
  if (!eof()) throw new Error('trailing input @' + i + ' in ' + formula);
  return out;
}

// ---- context for Booking evaluation ----
function makeBookingCtx(bid, S, crew, takeoff, recap, ownCode, baseKind) {
  const r = recap;
  // MCAA addressable cells used by the specials
  const cells = {};
  const put = (addr, v) => { cells[addr] = v; };
  const hcols = { E: r.hoursPlumb, F: r.hoursPipe, G: r.hoursSM, H: r.hoursShop };
  for (const [col, c] of Object.entries(hcols)) {
    for (let k = 0; k < 5; k++) put(col + (12 + k), c.rows[k]);
    put(col + '17', col === 'H' ? c.rows[5] : c.lopHrs);
    put(col + '18', c.total);
  }
  put('E21', r.ratePlumb); put('F22', r.ratePipe); put('G23', r.rateSMField); put('H24', r.rateSMShop);
  put('C27', r.C27);
  const sv = r.supervision;
  ['48', '49', '50', '51', '52'].forEach((n, k) => {
    put('F' + n, [sv.F48, sv.F49, sv.F50, sv.F51, sv.F52][k]);
    put('H' + n, [sv.H48, sv.H49, sv.H50, sv.H51, sv.H52][k]);
  });
  put('H65', r.H65); put('H66', r.H66); put('H67', r.H67);
  // GC amounts H78..H106 (+ hours F97/F98/F102)
  put('H78', r.gcH.safety); put('H79', r.gcH.smallTools); put('H80', r.gcH.freight); put('H81', r.gcH.trucking);
  const gcByKey = Object.fromEntries(r.gcRows.map(x => [x.key, x]));
  const gcOrder = ['tempPower', 'tempWater', 'phones', 'jobSafety', 'jobTruck', 'fuel', 'parking', 'siteTrailer', 'siteStorage',
    'miscRow', 'subsArch', 'subsService', 'subsSM', 'subsPM', 'adminAssist', 'jobOrientation', 'asstPM', 'thirdPartyTesting',
    'laborer', 'safetySupplies2', 'cadOperator', 'gcExtra1', 'gcExtra2', 'gcExtra3'];
  gcOrder.forEach((key, k) => {
    const row = 82 + k;
    put('H' + row, gcByKey[key] ? gcByKey[key].total : 0);
    put('F' + row, gcByKey[key] ? gcByKey[key].qty : 0);
  });
  put('H106', r.gcH.misc);
  // GC user rows 101..105 phase codes (A101:A105) — code from label lookup in Codes_GC
  const codeOfGC = (label) => {
    if (!label) return '';
    const hit = S.ref.codesGC.find(x => x.name === label);
    return hit ? '1-' + hit.code : '';
  };
  const gcCodeRows = [
    { addr: 101, code: codeOfGC((bid.recap.gc.labels && bid.recap.gc.labels.safetySupplies2) || 'Safety Supplies'), val: gcByKey.safetySupplies2.total },
    { addr: 102, code: codeOfGC('CAD Operator'), val: gcByKey.cadOperator.total },
    { addr: 103, code: codeOfGC(bid.recap.gc.labels && bid.recap.gc.labels.gcExtra1), val: gcByKey.gcExtra1.total },
    { addr: 104, code: codeOfGC(bid.recap.gc.labels && bid.recap.gc.labels.gcExtra2), val: gcByKey.gcExtra2.total },
    { addr: 105, code: codeOfGC(bid.recap.gc.labels && bid.recap.gc.labels.gcExtra3), val: gcByKey.gcExtra3.total },
  ];
  gcCodeRows.forEach(g => { put('A' + g.addr, g.code); });
  // subs rows 36..44
  r.subRows.forEach((s, k) => { put('A' + (36 + k), s.phaseCode || ''); put('J' + (36 + k), s.value); });
  // equipment rows 114..129
  r.equipRows.forEach((e, k) => {
    const row = 114 + k;
    let code = S.ref.equipmentCodes[k] || '';
    if (!code && bid.recap.equipmentNames && bid.recap.equipmentNames[k]) {
      const hit = S.ref.codesSubcontractor.find(x => x.name === bid.recap.equipmentNames[k]);
      code = hit ? '7-' + hit.code : '';
    }
    put('A' + row, code); put('J' + row, e.total);
  });

  const wrCells = { H4: r.workRecovery.rows[0].used, H6: r.workRecovery.rows[1].used, H8: r.workRecovery.rows[2].used, H10: r.workRecovery.rows[3].used, H12: r.workRecovery.rows[4].used };

  const named = {
    CrewRate_Plumb: r.ratePlumb, CrewRate_Pipe: r.ratePipe, CrewRate_SMField: r.rateSMField, CrewRate_SMShop: r.rateSMShop,
    Trucking_Hrs: N(bid.recap.trucking.hrs), Trucking_Loads: N(bid.recap.trucking.loads), Trucking_Total: r.gcH.trucking,
    WorkRecovery_Arch: r.workRecovery.arch, CAT_TAX: r.H68, Info_Market_Recovery: r.H64, Info_Total_Bid: r.H70,
  };

  const bases = {
    SM_FieldLaborColumn: (code) => sum(takeoff.allRows.filter(x => x.fieldPhase === code).map(x => x.H)),
    SM_ShopLaborColumn: (code) => sum(takeoff.allRows.filter(x => x.shopPhase === code).map(x => x.K)),
    SM_MaterialColumn: (code) => sum(takeoff.allRows.filter(x => x.matPhase === code).map(x => x.M)),
    Takeoff_Total_Field_Labor_Cost: (code) => sum(takeoff.allRows.filter(x => x.fieldPhase === code).map(x => x.AG)),
    Takeoff_Total_Shop_Labor_Cost: (code) => sum(takeoff.allRows.filter(x => x.shopPhase === code).map(x => x.AH)),
    Takeoff_Total_Straight_Field_Labor_Cost: (code) => sum(takeoff.allRows.filter(x => x.fieldPhase === code).map(x => x.U)),
  };

  return {
    cell(sheet, addr) {
      if (sheet === 'MCAA RECAP') { const v = cells[addr]; return v === undefined ? 0 : v; }
      if (sheet === 'Work Recovery') return wrCells[addr] ?? 0;
      throw new Error('unknown sheet ' + sheet);
    },
    cellRange(sheet, a, b) {
      const colA = a.replace(/\d+/, ''), colB = b.replace(/\d+/, '');
      const r0 = parseInt(a.replace(/\D+/g, '')), r1 = parseInt(b.replace(/\D+/g, ''));
      const colNum = (c) => c.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      const colName = (n) => { let s = ''; while (n > 0) { s = String.fromCharCode(65 + (n - 1) % 26) + s; n = Math.floor((n - 1) / 26); } return s; };
      const outArr = [];
      for (let cn = colNum(colA); cn <= colNum(colB); cn++) {
        for (let rr = r0; rr <= r1; rr++) {
          const addr = colName(cn) + rr;
          if (sheet === 'MCAA RECAP') outArr.push({ val: cells[addr] ?? 0 });
          else if (sheet === 'Work Recovery') outArr.push({ val: wrCells[addr] ?? 0 });
          else throw new Error('range sheet ' + sheet);
        }
      }
      return outArr;
    },
    local(addr) { return ownCode; },   // every local $A ref is the row's own phase code
    named(nm) { if (nm in named) return named[nm]; throw new Error('named ' + nm); },
    sumifs(base, code) { const f = bases[base]; if (!f) throw new Error('base ' + base); return f(code); },
  };
}

// ---- Booking Report ----
function calcBooking(bid, S, crew, takeoff, recap) {
  const bookS = S.booking;
  const divisions = [];
  const to = takeoff;
  for (const dv of bookS.divisions) {
    const pcDiv = S.ref.phaseCodes.divisions.find(x => x.div === dv.div);
    const rows = [];
    for (let i = 1; i <= 99; i++) {
      const code = dv.div + '-' + String(i).padStart(2, '0');
      const info = (pcDiv.descriptions[String(i).padStart(2, '0')]) || { d: '' };
      const custom = (bid.phaseCustom && bid.phaseCustom[code]) || '';
      const desc = custom || info.d;
      const spec = bookS.specials[dv.div + '|' + code];
      let hours, labor, material;
      if (dv.kind === 'shop') {
        hours = sum(to.allRows.filter(x => x.shopPhase === code).map(x => x.K));
        labor = sum(to.allRows.filter(x => x.shopPhase === code).map(x => x.AH));
      } else {
        hours = sum(to.allRows.filter(x => x.fieldPhase === code).map(x => x.H));
        labor = sum(to.allRows.filter(x => x.fieldPhase === code).map(x => x.AG));
      }
      material = sum(to.allRows.filter(x => x.matPhase === code).map(x => x.M));
      if (spec) {
        const ctx = makeBookingCtx(bid, S, crew, takeoff, recap, code, dv.kind);
        if (spec.D) hours = xlEval(spec.D, ctx);
        if (spec.E) labor = xlEval(spec.E, ctx);
        if (spec.F) material = xlEval(spec.F, ctx);
      }
      const gCode = (bid.booking.codes && bid.booking.codes[code]) ?? (bookS.gDefaults[code] || '');
      rows.push({ code, desc, hours, labor, material, gCode, total: hours + labor + material });
    }
    const totHours = sum(rows.map(x => x.hours)), totLabor = sum(rows.map(x => x.labor)), totMat = sum(rows.map(x => x.material));
    divisions.push({ div: dv.div, name: pcDiv.name, kind: dv.kind, rows, totHours, totLabor, totMat });
  }
  // status block (Booking Report Y13:Y16, M10..M18, K8)
  const booked = sum(divisions.map(d => d.totLabor + d.totMat));                       // Y14
  const Y15 = recap.H60 + recap.H61 + recap.H62 + recap.H68 + recap.H69;               // markups + tax + leveler
  const Y16 = recap.H70 - booked - Y15;
  const totHours = sum(divisions.map(d => d.totHours));                                // M15 basis
  const sv = recap.supervision;
  const gcByKey = Object.fromEntries(recap.gcRows.map(x => [x.key, x]));
  const hourTarget = xr(recap.hoursPlumb.total + recap.hoursPipe.total + recap.hoursSM.total + recap.hoursShop.total
    + sv.F48 + sv.F49 + sv.F50 + sv.F51 + sv.F52
    + N(bid.recap.trucking.hrs) * N(bid.recap.trucking.loads)
    + (gcByKey.jobOrientation ? gcByKey.jobOrientation.qty : 0)
    + (gcByKey.asstPM ? gcByKey.asstPM.qty : 0), 2)
    + (gcByKey.cadOperator ? gcByKey.cadOperator.qty : 0);                             // M18
  return {
    divisions,
    bookedTotal: booked, tail: Y15, unassigned: Y16,
    complete: Y16 > -2 && Y16 < 2,                                                     // M10
    totalHours: totHours,
    hourTarget,
    missingHours: xr(hourTarget - xr(totHours, 2), 2),                                 // M13
  };
}

// ---- Price Breakdown ----
function calcPriceBreakdown(bid, S, crew, takeoff, recap) {
  const items = takeoff.groups.map((g, gi) => {
    const rows = g.rows.map(x => x.calc);
    const fieldCost = sum(rows.map(x => x.AG));
    const shopCost = sum(rows.map(x => x.AH));
    return {
      idx: gi, name: g.name || (gi === 0 ? 'CAE if not moved to sections' : ''),
      fieldHours: g.subH, shopHours: g.subK, material: g.subM,
      fieldCost, shopCost, subTotal: fieldCost + shopCost + g.subM,
      notes: (bid.priceBreakdown.notes || {})[gi === 0 ? 'CAE' : String(g.id)] || '',
    };
  });
  const directs = sum(items.map(x => x.subTotal));
  const fee = recap.H60 + recap.H61 + recap.H62 + recap.H69;
  const gcs = recap.H70 - directs - fee;
  for (const it of items) {
    it.gcAlloc = directs ? it.subTotal / directs * gcs : 0;
    it.feeAlloc = directs ? it.subTotal / directs * fee : 0;
    it.sellTotal = it.subTotal + it.gcAlloc + it.feeAlloc;
  }
  const laborFactor = takeoff.totals.H7 ? (recap.hoursPlumb.total + recap.hoursPipe.total + recap.hoursSM.total
    - recap.hoursPlumb.base - recap.hoursPipe.base - recap.hoursSM.base) / takeoff.totals.H7 : 0;
  return { items, directs, fee, gcs, totalSell: recap.H70, laborFactor };
}

// ---- Proposal ----
function calcProposal(bid, S, recap) {
  const amount = xr(recap.H70, 2);
  // Both pickers feed ONE exclusions line, in the sheet's own order:
  // the W/X block first, then the Z/AA block (D39 concatenates them that way).
  const picked = [...(bid.proposal.exclusionsPicked || []), ...(bid.proposal.inclusionsPicked || [])];
  return {
    amount, amountWords: spellNumber(amount),
    exclusionLine: picked.join(', '),
  };
}
