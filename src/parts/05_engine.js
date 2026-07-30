// ============================================================
// Calculation engine — faithful port of the workbook formulas.
// calcBid(bid, S) -> computed. Pure function; UI renders from it.
// Order mirrors the workbook dependency chain:
//   crew rates -> takeoff -> indirect sheets -> MCAA recap -> outputs
// ============================================================
'use strict';

// Excel ROUND / ROUNDUP round away from zero; guard fp noise via toPrecision.
function xr(x, d = 2) {
  if (!isFinite(x)) return 0;
  const m = Math.pow(10, d);
  return Math.sign(x) * Math.round(Number((Math.abs(x) * m).toPrecision(12))) / m;
}
function xru(x, d = 0) {
  if (!isFinite(x)) return 0;
  const m = Math.pow(10, d);
  return Math.sign(x) * Math.ceil(Number((Math.abs(x) * m).toPrecision(12))) / m;
}
const N = (v) => { const n = Number(v); return isFinite(n) ? n : 0; }; // blank/text -> 0 like Excel SUM
const sum = (arr) => arr.reduce((a, b) => a + N(b), 0);

// Schedule-blended rate (MCAA E21/F22/G23 formula) — shared by TakeOff and Recap
function blendRate(scheduleType, st, ot) {
  switch (scheduleType) {
    case "5 8's": return st;
    case "5 10's": return (4 * st + ot) / 5;
    case "6 10's": return (4 * st + 2 * ot) / 6;
    case "60 60 50": return (12 * st + 5 * ot) / 17;
    default: return st;
  }
}

// ---------------- Crew Mix ----------------
// S.crew.sections.{smField,smShop,plumberFitter}: wage tables & burden constants (settings)
// bid.crewMix.{smField,smShop,plumberFitter}: qty per class + overridable period factors / shop burden
function ptiTotal(pti) {
  // WC% = gross × EMR × OGSERP × DCBS × OCCPAP (Crew Mix M12/M75/M138)
  const wc = pti.wc.gross * pti.wc.emr * pti.wc.ogserp * pti.wc.dcbs * pti.wc.occpap;
  return { wc, total: pti.futa + pti.sui + pti.sdi + pti.ss + pti.medic + wc + pti.countyTax + pti.gl + pti.tri + pti.fmla + pti.orSickLeave };
}

function calcCrewSection(secS, secB, kind) {
  const { total: pti } = ptiTotal(secS.pti);
  const otM = 1.5, dtM = 2.0;
  const pfST = secB.pfST ?? secS.periodFactor;
  const pfOT = secB.pfOT ?? pfST;               // H30/H51 etc. default-chain to master
  const pfDT = secB.pfDT ?? pfST;
  const roundPti = kind !== 'smShop';            // shop PT&I unrounded (quirk)
  const tiers = {};
  for (const [tier, mult, adder, pf] of [
    ['st', 1, 0, pfST],
    ['ot', otM, secS.otAdder, pfOT],
    ['dt', dtM, secS.dtAdder, pfDT],
  ]) {
    let totalQty = 0, totalDollars = 0, weighted = 0;
    const rows = secS.classes.map((cl, i) => {
      const qty = N(secB.qty[i]);
      const wage = xr(cl.wage * mult, 10);       // D32 = D11*1.5 exact
      const subtotal = wage + cl.fringe + adder;
      let ptiD = wage * pti;
      if (roundPti) ptiD = xr(ptiD, 2);
      const total = xr((subtotal + ptiD) * qty * (1 + pf), 2);
      const perHr = xr((subtotal + ptiD) * (1 + pf), 2);
      totalQty += qty; totalDollars += total; weighted += cl.weight * qty;
      return { classification: cl.name, qty, wage, fringe: cl.fringe, subtotal, pti: ptiD, total, perHr };
    });
    const avgHourly = totalQty === 0 ? 0 : totalDollars / totalQty;
    let crewRate = xr(avgHourly, 2);
    let burden = 0;
    if (kind === 'smShop') {
      burden = tier === 'st' ? (secB.burdenST ?? secS.shopBurden)
        : tier === 'ot' ? (secB.burdenOT ?? secB.burdenST ?? secS.shopBurden)
          : (secB.burdenDT ?? secB.burdenOT ?? secB.burdenST ?? secS.shopBurden);
      crewRate = xr(avgHourly + N(burden), 2);   // I86 = ROUND(I84+I85,2)
    }
    tiers[tier] = { rows, totalQty, totalDollars, avgHourly, crewRate, ratio: totalQty ? weighted / totalQty : 0, burden, pf };
  }
  return { tiers, ptiPct: pti };
}

function calcCrew(bid, S) {
  const cs = S.crew.sections;
  const cb = bid.crewMix;
  const smField = calcCrewSection(cs.smField, cb.smField, 'smField');
  const smShop = calcCrewSection(cs.smShop, cb.smShop, 'smShop');
  const pf = calcCrewSection(cs.plumberFitter, cb.plumberFitter, 'plumberFitter');

  // Shift-premium adders ($/hr). SM: Journeyman wage (class idx 3) × pct.
  const jnyWage = cs.smField.classes[3].wage;
  const smAdds = {
    swing: jnyWage * cs.smField.premium.swingPct,
    grave: jnyWage * cs.smField.premium.gravePct,
    special: jnyWage * cs.smField.premium.specialPct,
  };
  // Plumber/Fitter: avg base wage of crew × pct (D145, G146)
  const pfQty = cb.plumberFitter.qty;
  const pfTotQty = sum(pfQty);
  const pfAvgBase = pfTotQty ? xr(sum(cs.plumberFitter.classes.map((c, i) => N(pfQty[i]) * c.wage)) / pfTotQty, 2) : 0;
  const pfSwing = xr(pfAvgBase * cs.plumberFitter.premium.swingGravePct, 2);

  // OCIP deduct (Crew Mix N27): -(D13 + 4·D14 + D15)/6 × (WC + county + GL)
  const f = cs.smField, fp = ptiTotal(f.pti);
  const ocipDeductSM = -((f.classes[2].wage + 4 * f.classes[3].wage + f.classes[4].wage) / 6) * (fp.wc + f.pti.countyTax + f.pti.gl);
  const p = cs.plumberFitter, pp = ptiTotal(p.pti);
  // N153 quirk: weights 4× Foreman (idx 2) + 1× Journeyman (idx 3) + 1× 4th-yr (idx 4) — replicate as-is
  const ocipDeductPF = -((p.classes[3].wage + 4 * p.classes[2].wage + p.classes[4].wage) / 6) * (pp.wc + p.pti.countyTax + p.pti.gl);

  return {
    smField, smShop, plumberFitter: pf,
    rates: {
      smFieldStraight: smField.tiers.st.crewRate, smFieldOT: smField.tiers.ot.crewRate, smFieldDT: smField.tiers.dt.crewRate,
      smShopStraight: smShop.tiers.st.crewRate, smShopOT: smShop.tiers.ot.crewRate, smShopDT: smShop.tiers.dt.crewRate,
      pfStraight: pf.tiers.st.crewRate, pfOT: pf.tiers.ot.crewRate, pfDT: pf.tiers.dt.crewRate,
      smSwing: smAdds.swing, smGrave: smAdds.grave, smSpecial: smAdds.special,
      pfSwing, pfAvgBase,
      swingLOP: cs.plumberFitter.premium.swingLOP, graveLOP: cs.plumberFitter.premium.graveLOP,
    },
    ocipDeductSM, ocipDeductPF,
    perClassRates: { // 'Crew Mix'!I12/I13/I14/I16/I19/I138 referenced by MCAA
      smGenForeman: smField.tiers.st.rows[1].perHr,  // I12
      smForeman: smField.tiers.st.rows[2].perHr,     // I13
      journeyman: smField.tiers.st.rows[3].perHr,    // I14
      appr3: smField.tiers.st.rows[5].perHr,         // I16
      classified: smField.tiers.st.rows[8].perHr,    // I19
      pfGenForeman: pf.tiers.st.rows[1].perHr,       // I138
    },
  };
}

// ---------------- SM Import -> CAE items ----------------
function matchCae(map, row) {
  // map: {type?, typeAny?, material?, materialAny?, cutType?}
  if (map.type && row.type !== map.type) return false;
  if (map.typeAny && !map.typeAny.includes(row.type)) return false;
  if (map.material && row.material !== map.material) return false;
  if (map.materialAny && !map.materialAny.includes(row.material)) return false;
  if (map.cutType && row.cutType !== map.cutType) return false;
  if (map.cutTypeAny && !map.cutTypeAny.includes(row.cutType)) return false;
  return true;
}

function calcSmImport(bid, S) {
  // SM Import sheet: H = G × (L% or 1), J = I × (N% or 1); difficulty label from %.
  const diff = (p) => p === '' || p === null || p === undefined ? '' : (N(p) === 0 || N(p) === 1 ? 'Standard' : N(p) < 1 ? 'Easy' : 'Hard');
  const rows = bid.smImport.rows.map(r => {
    const fPct = r.fieldPct, sPct = r.shopPct;
    const fRaw = N(r.fieldHoursRaw), sRaw = N(r.shopHoursRaw);
    return {
      ...r,
      qty: N(r.qty), materialCost: N(r.materialCost),
      fieldHours: fRaw * (fPct === '' || fPct === null || fPct === undefined || N(fPct) === 0 ? 1 : N(fPct)),
      shopHours: sRaw * (sPct === '' || sPct === null || sPct === undefined || N(sPct) === 0 ? 1 : N(sPct)),
      fieldDifficulty: diff(fPct), shopDifficulty: diff(sPct),
    };
  });
  const totals = {
    qty: sum(rows.map(r => r.qty)),
    fieldHours: sum(rows.map(r => r.fieldHours)),
    shopHours: sum(rows.map(r => r.shopHours)),
    materialCost: sum(rows.map(r => r.materialCost)),
  };
  return { rows, totals };
}

function buildCaeItems(smi, S) {
  const items = [];
  const used = { qty: 0, fh: 0, sh: 0, mat: 0 };
  for (const m of S.ref.caeMap) {
    const rowsQ = smi.rows.filter(r => matchCae(m.qtyCrit || m.crit, r));
    const rowsH = smi.rows.filter(r => matchCae(m.hoursCrit || m.crit, r));
    const it = {
      matPhase: m.matPhase, shopPhase: m.shopPhase, fieldPhase: m.fieldPhase,
      desc: m.label,
      qty: sum(rowsQ.map(r => r.qty)),
      fieldHours: sum(rowsH.map(r => r.fieldHours)),
      shopHours: sum(rowsH.map(r => r.shopHours)),
      material: sum(rowsQ.map(r => r.materialCost)),
    };
    used.qty += it.qty; used.fh += it.fieldHours; used.sh += it.shopHours; used.mat += it.material;
    items.push(it);
  }
  // Row 34 Miscellaneous remainder
  items.push({
    matPhase: '2-07', shopPhase: '2-07', fieldPhase: '3-07', desc: 'Miscellaneous',
    qty: smi.totals.qty - used.qty,
    fieldHours: smi.totals.fieldHours - used.fh,
    shopHours: smi.totals.shopHours - used.sh,
    material: Math.abs(smi.totals.materialCost - used.mat),
  });
  return items;
}

// ---------------- TakeOff ----------------
function calcTakeoff(bid, S, crew, smi) {
  const R = crew.rates;
  // TakeOff rate rows U2:AF4. Quirk: the SM field STRAIGHT cost rate is the
  // SCHEDULE-BLENDED rate (TakeOff!U2 = CrewRate_SMField = MCAA!G23), with the
  // OT/DT adds measured against that blended base (V2 = SMField_Overtime - CrewRate_SMField).
  // Plumb/Pipe use the un-blended straight rate as their base (TakeOff!U3 = CrewRate_PlumbFitter_Straight).
  const sched = bid.recap && bid.recap.scheduleType;
  const smFieldBlended = blendRate(sched, R.smFieldStraight, R.smFieldOT);
  const fieldRates = {
    'Sheet Metal Takeoff': { str: smFieldBlended, ot: R.smFieldOT - smFieldBlended, dt: R.smFieldDT - smFieldBlended, swing: R.smSwing, grave: R.smGrave, special: R.smSpecial },
    'Plumb Takeoff': { str: R.pfStraight, ot: R.pfOT - R.pfStraight, dt: R.pfDT - R.pfStraight, swing: R.pfSwing, grave: R.pfSwing, special: R.pfSwing },
    'Pipe Takeoff': { str: R.pfStraight, ot: R.pfOT - R.pfStraight, dt: R.pfDT - R.pfStraight, swing: R.pfSwing, grave: R.pfSwing, special: R.pfSwing },
  };
  const shopRates = { str: R.smShopStraight, ot: R.smShopOT - R.smShopStraight, dt: R.smShopDT - R.smShopStraight, swing: R.smSwing, grave: R.smGrave, special: R.smSpecial };

  const caeItemsSrc = buildCaeItems(smi, S);
  const groups = [];
  const allRows = [];

  const doItem = (item, payType, exclude, isCae) => {
    const E = N(item.qty), F = N(item.fUnit), G = item.fMult, I = N(item.sUnit), J = item.sMult, L = N(item.mUnit);
    const Rr = item.shift || '', Q = item.ot || '';
    const s = payType === 'Sheet Metal Takeoff' ? '' : (Rr === '' ? '' : 'LOP');
    let lop = 1;
    if (s === 'LOP' && Rr === 'SWING') lop *= 1 + R.swingLOP;
    if (s === 'LOP' && Rr === 'GRAVE') lop *= 1 + R.graveLOP;
    if (s === 'LOP' && Rr === 'SPECIAL') lop *= 1 + R.swingLOP;
    let H, K, M;
    if (isCae) { // CAE rows carry precomputed hour/cost sums; no exclude/multipliers
      H = N(item.fieldHours); K = N(item.shopHours); M = N(item.material);
    } else {
      H = exclude ? 0 : E * F * (G === '' || G === null || G === undefined ? 1 : N(G)) * lop;
      K = exclude ? 0 : E * I * (J === '' || J === null || J === undefined ? 1 : N(J));
      M = exclude ? 0 : E * L;
    }
    const fr = fieldRates[payType] || fieldRates['Sheet Metal Takeoff'];
    const U = xr(H * fr.str, 2);
    const V = xr(Q === 'OT' ? H * fr.ot : 0, 2);
    const W = xr(Q === 'DBLT' ? H * fr.dt : 0, 2);
    const X = Rr === 'SWING' ? xr(xr(H * fr.swing, 2), 2) : 0;
    const Y = Rr === 'GRAVE' ? xr(xr(H * fr.grave, 2), 2) : 0;
    const Z = Rr === 'SPECIAL' ? xr(xr(H * fr.special, 2), 2) : 0;
    const AA = xr(K * shopRates.str, 2);
    const AB = xr(Q === 'OT' ? K * shopRates.ot : 0, 2);
    const AC = xr(Q === 'DBLT' ? K * shopRates.dt : 0, 2);
    const AD = xr(Rr === 'SWING' ? K * shopRates.swing : 0, 2);
    const AE = xr(Rr === 'GRAVE' ? K * shopRates.grave : 0, 2);
    const AF = xr(Rr === 'SPECIAL' ? K * shopRates.special : 0, 2);
    const AG = U + V + W + X + Y + Z;
    const AH = AA + AB + AC + AD + AE + AF;
    return {
      H, K, M, payType, s,
      U, V, W, X, Y, Z, AA, AB, AC, AD, AE, AF,
      AG, AH, AI: AG + AH, AJ: M + AG + AH, AL: V + W + X + Y + Z, AM: AB + AC + AD + AE + AF,
    };
  };

  // CAE group first
  {
    const payType = bid.takeoff.caeType || 'Sheet Metal Takeoff';
    const rows = caeItemsSrc.map(it => {
      const c = doItem(it, payType, false, true);
      return { src: it, calc: c, matPhase: it.matPhase, shopPhase: it.shopPhase, fieldPhase: it.fieldPhase, desc: it.desc, qty: it.qty };
    });
    rows.forEach(r => allRows.push({ ...r.calc, matPhase: r.matPhase, shopPhase: r.shopPhase, fieldPhase: r.fieldPhase, emo: '', ot: '', shift: '' }));
    groups.push({
      id: 'CAE', name: 'CAE', exclude: false, payType, rows,
      subH: sum(rows.map(r => r.calc.H)), subK: sum(rows.map(r => r.calc.K)), subM: sum(rows.map(r => r.calc.M)),
    });
  }

  for (const g of bid.takeoff.groups) {
    const payType = g.type || 'Sheet Metal Takeoff';
    const exclude = g.exclude === true;
    const rows = g.items.map(it => {
      const c = doItem(it, payType, exclude, false);
      return { src: it, calc: c };
    });
    rows.forEach((r, i) => allRows.push({ ...r.calc, matPhase: g.items[i].matPhase || '', shopPhase: g.items[i].shopPhase || '', fieldPhase: g.items[i].fieldPhase || '', emo: g.items[i].emo || '', ot: g.items[i].ot || '', shift: g.items[i].shift || '' }));
    groups.push({
      id: g.id, name: g.name, exclude, payType, rows,
      subH: sum(rows.map(r => r.calc.H)), subK: sum(rows.map(r => r.calc.K)), subM: sum(rows.map(r => r.calc.M)),
    });
  }

  const t = {
    H7: sum(groups.map(g => g.subH)), K7: sum(groups.map(g => g.subK)), M7: sum(groups.map(g => g.subM)),
    U7: sum(allRows.map(r => r.U)), V7: sum(allRows.map(r => r.V)), W7: sum(allRows.map(r => r.W)),
    X7: sum(allRows.map(r => r.X)), Y7: sum(allRows.map(r => r.Y)), Z7: sum(allRows.map(r => r.Z)),
    AA7: sum(allRows.map(r => r.AA)), AB7: sum(allRows.map(r => r.AB)), AC7: sum(allRows.map(r => r.AC)),
    AD7: sum(allRows.map(r => r.AD)), AE7: sum(allRows.map(r => r.AE)), AF7: sum(allRows.map(r => r.AF)),
    AG7: sum(allRows.map(r => r.AG)), AH7: sum(allRows.map(r => r.AH)), AI7: sum(allRows.map(r => r.AI)),
    AJ7: sum(allRows.map(r => r.AJ)), AL7: sum(allRows.map(r => r.AL)), AM7: sum(allRows.map(r => r.AM)),
  };

  // SUMIF helpers used by MCAA / Crew Mix / Booking / EMO
  const byPay = (pt, col) => sum(allRows.filter(r => r.payType === pt).map(r => r[col]));
  const sumifs = {
    fieldHrsPlumb: byPay('Plumb Takeoff', 'H'),
    fieldHrsPipe: byPay('Pipe Takeoff', 'H'),
    fieldHrsSM: byPay('Sheet Metal Takeoff', 'H'),
    matPlumb: byPay('Plumb Takeoff', 'M'),
    matPipe: byPay('Pipe Takeoff', 'M'),
    premiumFieldPlumb: byPay('Plumb Takeoff', 'AL'),
    premiumFieldPipe: byPay('Pipe Takeoff', 'AL'),
    premiumFieldSM: byPay('Sheet Metal Takeoff', 'AL'),
    premiumShopHalf: t.AM7 / 2,                          // MCAA J24 quirk (=SUM(AM:AM)/2)
    emoMaterial: sum(allRows.filter(r => r.emo === 'Yes').map(r => r.M)),  // EMO!A6
  };

  // Crew Mix hour roll-up (Total_* named ranges: straight = total − OT − DT)
  const crewHours = (() => {
    const mk = (pt, col, totalOverride) => {
      const ot = sum(allRows.filter(r => (pt ? r.payType === pt : true) && r.ot === 'OT').map(r => r[col]));
      const dt = sum(allRows.filter(r => (pt ? r.payType === pt : true) && r.ot === 'DBLT').map(r => r[col]));
      const total = totalOverride !== undefined ? totalOverride : byPay(pt, col);
      return { st: total - ot - dt, ot, dt };
    };
    return {
      smField: mk('Sheet Metal Takeoff', 'H'),
      smShop: mk(null, 'K', t.K7),
      plumb: mk('Plumb Takeoff', 'H'),
      pipe: mk('Pipe Takeoff', 'H'),
    };
  })();
  return { groups, allRows, totals: t, sumifs, crewHours };
}
