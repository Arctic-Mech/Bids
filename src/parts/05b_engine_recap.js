// ============================================================
// Engine part 2: EMO, Bond, Work Recovery, MCAA RECAP waterfall
// ============================================================
'use strict';

// ---------------- EMO (Equipment Markup Override) ----------------
function calcEmo(bid, takeoff) {
  const base = takeoff.sumifs.emoMaterial;               // EMO!A6 = Σ TakeOff material flagged P="Yes"
  const original = xr(base * N(bid.recap.ohp), 2);       // E6
  const revised = xr(base * N(bid.recap.equipMarkup), 2);// E12
  return { base, original, revised, delta: Math.abs(original - revised), added: original - revised < 0 };
}

// ---------------- Bond (tier table) ----------------
function calcBond(S, sellBeforeBond) {
  const B = S.bond.brackets, C = S.bond.rates;
  const C2 = sellBeforeBond;
  const cum = [B[0], B[0] + B[1], B[0] + B[1] + B[2], B[0] + B[1] + B[2] + B[3]];
  const e = [
    xru(C2 <= B[0] ? C2 / 1000 * C[0] : B[0] / 1000 * C[0], 0),
    xru(C2 <= cum[0] ? 0 : (C2 <= cum[1] ? (C2 - cum[0]) / 1000 * C[1] : B[1] / 1000 * C[1]), 0),
    xru(C2 <= cum[1] ? 0 : (C2 <= cum[2] ? (C2 - cum[1]) / 1000 * C[2] : B[2] / 1000 * C[2]), 0),
    xru(C2 <= cum[2] ? 0 : (C2 <= cum[3] ? (C2 - cum[2]) / 1000 * C[3] : B[3] / 1000 * C[3]), 0),
    xru(C2 <= cum[3] ? 0 : (C2 - cum[3]) / 1000 * C[4], 0),
  ];
  // Bond!C10 = ROUNDUP(('Crew Mix'!I7 - I5)/30, 0): the SM Field labor-rate period
  const s = S.crew.sections.smField;
  const months = s.periodStart && s.periodEnd ? xru((new Date(s.periodEnd) - new Date(s.periodStart)) / (86400000 * 30), 0) : 0;
  return { sellBeforeBond: C2, tiers: e, total: sum(e), months };
}

// ---------------- Work Recovery ----------------
function calcWorkRecovery(bid, wrHours) {
  const wr = bid.workRecovery || {};
  const mk = (key, label, hours) => {
    const inp = wr[key] || {};
    const rate = N(inp.rate), maxH = N(inp.maxHrs);
    return { key, label, hours, rate, maxHrs: maxH, used: maxH > hours ? xr(rate * hours, 0) : xr(rate * maxH, 0) };
  };
  const rows = [
    mk('smField', 'SM Field', wrHours.smFieldWR),
    mk('smShop', 'SM Shop', wrHours.smShopWR),
    mk('arch', 'Arch Field', wrHours.archWR),
    mk('plumber', 'Plumber', wrHours.plumbWR),
    mk('fitter', 'Fitter', wrHours.pipeWR),
  ];
  const g = Object.fromEntries(rows.map(r => [r.key, r.used]));
  return {
    rows, total: sum(rows.map(r => r.used)),
    smRange: g.smField + g.smShop,      // WorkRecovery_SM  = H4:H6
    arch: g.arch,                        // WorkRecovery_Arch = H8
    pipeRange: g.plumber + g.fitter,     // WorkRecovery_Pipe = H10:H12
  };
}

// ---------------- MCAA RECAP ----------------
// hooks: { ocip(ctx) -> {deductTotal, deductGLOnly, ...}, permits(H63) -> {total, ...} }
function calcRecap(bid, S, crew, takeoff, hooks) {
  const r = bid.recap;
  const lop = { "5 8's": N(r.lop58), "5 10's": S.recap.lop510, "6 10's": S.recap.lop610, "60 60 50": S.recap.lop606050 }[r.scheduleType] ?? 0;

  // ---- Hour columns E(Plumb) F(Pipe) G(SM Field) H(SM Shop): rows 11..18 ----
  const mkCol = (base, mods, roundMods) => {
    const rows = mods.map(p => roundMods ? xr(base * N(p), 2) : base * N(p));
    const lopHrs = base * lop;
    return { base, rows, lopHrs, total: base + sum(rows) + lopHrs };
  };
  const colE = mkCol(takeoff.sumifs.fieldHrsPlumb, r.mods.plumb, false);
  const colF = mkCol(takeoff.sumifs.fieldHrsPipe, r.mods.pipe, false);
  const colG = mkCol(takeoff.sumifs.fieldHrsSM, r.mods.sm, true);   // G12..G16 = ROUND(G11*D,2)
  const shopRows = r.mods.shop.map(p => N(takeoff.totals.K7) * N(p));
  const colH = { base: N(takeoff.totals.K7), rows: shopRows, lopHrs: 0, total: N(takeoff.totals.K7) + sum(shopRows) };
  const totalFieldHours = colE.total + colF.total + colG.total + colH.total;   // SUM(E18:H18)

  // ---- Work Recovery (reads the hour block) ----
  const wrHours = {
    smFieldWR: colG.total - N(r.archHrsInSM) - colG.rows[0],  // G18 - D27 - G12
    smShopWR: colH.total,                                     // H18
    archWR: N(r.archHrsInSM),                                 // D27
    plumbWR: colE.total - colE.rows[0],                       // E18 - E12
    pipeWR: colF.total - colF.rows[0],                        // F18 - F12
  };
  const workRecovery = calcWorkRecovery(bid, wrHours);

  // ---- Blended rates by schedule (E21/F22/G23/H24) ----
  const blend = (st, ot) => {
    switch (r.scheduleType) {
      case "5 8's": return st;
      case "5 10's": return (4 * st + ot) / 5;
      case "6 10's": return (4 * st + 2 * ot) / 6;
      case "60 60 50": return (12 * st + 5 * ot) / 17;
      default: return st;
    }
  };
  const ratePlumb = blend(crew.rates.pfStraight, crew.rates.pfOT);
  const ratePipe = ratePlumb;
  const rateSMField = blend(crew.rates.smFieldStraight, crew.rates.smFieldOT);
  const rateSMShop = crew.rates.smShopStraight;

  // ---- Labor value (pre-OCIP) ----
  const I21 = ratePlumb * colE.total;
  const I22 = ratePipe * colF.total;
  const I23 = colG.total * rateSMField;
  const I24 = colH.total * rateSMShop;
  const I25 = I21 + I22 + I23 + I24;
  const J21 = takeoff.sumifs.premiumFieldPlumb;
  const J22 = takeoff.sumifs.premiumFieldPipe;
  const J23 = takeoff.sumifs.premiumFieldSM;
  const J24 = takeoff.sumifs.premiumShopHalf;               // =SUM(TakeOff!AM:AM)/2 (as-is quirk)
  const J25 = J21 + J22 + J23 + J24;

  // ---- Supervision rows 48-52 (needed by OCIP; independent of dollars below) ----
  const cr = crew.perClassRates;
  const F48 = xr(totalFieldHours * N(r.supPct[0]), 2);
  const F49 = xr(N(r.supPct[1]) * colE.total, 2);
  const F50 = xr(N(r.supPct[2]) * colF.total, 2);
  const F51 = xr(N(r.supPct[3]) * colG.total, 2);
  const F52 = xr(N(r.supPct[4]) * colG.total, 2);
  const G48 = cr.smGenForeman, G49 = cr.pfGenForeman, G50 = cr.pfGenForeman, G51 = cr.smForeman, G52 = cr.smForeman;
  const H48 = xru(F48 * G48, 2), H49 = xru(F49 * G49, 2), H50 = xru(F50 * G50, 2), H51 = xru(F51 * G51, 2);
  const H52 = F52 * G52;                                    // no ROUNDUP (quirk)

  // ---- OCIP (reads hours, labor values, supervision, arch hrs) ----
  const ocip = hooks.ocip({
    archHrs: N(r.archHrsInSM), E18: colE.total, F18: colF.total, G18: colG.total, H18: colH.total,
    I21, I22, I23, F48, F49, F50, F51, F52, H48, H49, H50, H51, H52,
  });
  const C27 = r.ocipToggle === 'OCIP' ? -N(ocip.deductTotal)
    : r.ocipToggle === 'OCIP GL Only' ? -N(ocip.deductGLOnly) : 0;
  const J27 = I25 + J25 + C27;                              // Total Labor Cost

  // ---- Material ----
  const D29 = takeoff.sumifs.matPlumb;
  const G29 = takeoff.sumifs.matPipe;
  const J29 = takeoff.totals.M7 - D29 - G29;
  const J31 = D29 + G29 + J29;                              // Total Material Cost

  // ---- EMO ----
  const emo = calcEmo(bid, takeoff);

  // ---- Subcontract rows 36-44 ----
  const subRows = r.subs.map((s, i) => ({
    ...s, value: N(s.value),
    phaseCode: i === 0 ? '7-03' : (s.name ? lookupSubPhaseCode(S, s.name) : ''),
  }));
  const J45 = sum(subRows.map(s => s.value));

  // ---- GC / indirect block rows 78-106 ----
  const truckRate = r.trucking.rate ?? cr.appr3;            // G81 default ='Crew Mix'!I16
  const gcH = {
    safety: xr(J31 * N(r.gc.safetyPct), 2),                 // H78
    smallTools: xr(I25 * N(r.gc.smallToolsPct), 2),         // H79 (% of labor value I25)
    freight: xr(J27 * N(r.gc.freightPct), 2),               // H80
    trucking: xr(N(r.trucking.loads) * N(r.trucking.hrs) * N(truckRate), 2), // H81
  };
  const gcRows = S.ref.gcRows.map(rowDef => {
    const inp = r.gc.rows[rowDef.key] || {};
    let qty = N(inp.qty), rate;
    if (rowDef.key === 'cadOperator') qty = N(inp.qty) * N(inp.dur);          // F102 = D102*E102
    if (rowDef.rateFrom === 'journeyman') rate = cr.journeyman;               // G97 locked
    else if (rowDef.rateDefault === 'classified') rate = inp.rate ?? cr.classified;
    else if (rowDef.rateDefault === 'smGenForeman') rate = inp.rate ?? cr.smGenForeman;
    else rate = inp.rate ?? 0;
    const label = (r.gc.labels && r.gc.labels[rowDef.key]) || rowDef.label;
    return { key: rowDef.key, label, qty, rate: N(rate), total: xr(qty * N(rate), 2) };
  });
  gcH.misc = xr(N(r.gc.miscPct) * (J27 + J31), 2);          // H106
  const H107 = gcH.safety + gcH.smallTools + gcH.freight + gcH.trucking + sum(gcRows.map(x => x.total)) + gcH.misc;

  // ---- Equipment rentals rows 114-129 ----
  const equipRows = r.equipment.map((e2, i) => {
    const rate = e2.rate ?? S.recap.equipmentRates[i] ?? 0;
    const label = (bid.recap.equipmentNames && bid.recap.equipmentNames[i]) || S.ref.equipmentLabels[i] || 'Equipment';
    return { label, qty: N(e2.qty), dur: N(e2.dur), rate: N(rate), total: xr(N(e2.qty) * N(e2.dur) * N(rate), 2) };
  });
  const J130 = sum(equipRows.map(x => x.total));

  const H53 = J130, H54 = H107;
  const J55 = H48 + H49 + H50 + H51 + H52 + H53 + H54;

  // ---- Waterfall ----
  const H59 = J55 + J45 + J27 + J31;
  const H60 = xru(N(r.subMarkup) * J45, 0);
  const H61 = emo.revised;
  const H62 = xru(N(r.ohp) * (H59 - J45) - emo.original, 0);
  const H63 = H59 + H60 + H61 + H62;
  // Market Recovery: B57/D57/F57 are each ABS(SUM(...))*-1, so H64 = -Σ|recovery|
  const H64 = -Math.abs(workRecovery.pipeRange) - Math.abs(workRecovery.arch) - Math.abs(workRecovery.smRange);
  const H65 = N(r.miscContingency);

  // ---- Permits (calculator reads H63) + manual rows ----
  const permits = hooks.permits(H63);
  const pm = r.permitsManual;
  const permitRows = [N(pm.plumbing), N(pm.hvac), N(pm.medGas), N(pm.boiler), N(pm.specialInsp)];
  const J82 = N(permits.total);
  const J83 = sum(permitRows) + J82;
  const H67 = J83;

  const bond = calcBond(S, H63 + H64 + H65 + H67);
  const H66 = r.bondRequired === 'Yes' ? bond.total : 0;
  const I68 = (r.taxType === 'Oregon CAT Tax' ? 0.004 : r.taxType === 'Washington B&O Tax' ? 0.00484 : 0) + 0.0015;
  const H68 = (H63 + H64 + H65 + H66 + H67) * I68;
  const sub68 = H63 + H64 + H65 + H66 + H67 + H68;
  const H69 = (xru(sub68 / 5, 0) * 5) - sub68 + N(r.addDeduct);
  const H70 = sub68 + H69;

  return {
    lopPct: lop, hoursPlumb: colE, hoursPipe: colF, hoursSM: colG, hoursShop: colH, totalFieldHours,
    ratePlumb, ratePipe, rateSMField, rateSMShop,
    I21, I22, I23, I24, I25, J21, J22, J23, J24, J25, C27, J27, D29, G29, J29, J31,
    subRows, J45,
    permitRows, J82, J83,
    gcH, gcRows, H107, equipRows, J130,
    supervision: { F48, F49, F50, F51, F52, G48, G49, G50, G51, G52, H48, H49, H50, H51, H52 },
    H53, H54, J55, H59, H60, H61, H62, H63, H64, H65, H66, H67, H68, I68, H69, H70,
    emo, bond, workRecovery, wrHours,
    totalBid: H70,
    archWarning: N(r.archHrsInSM) > colG.total,
    pctSubEquip: (H53 + H54) === 0 ? 1 : (H53 + H54) / H59,   // I54 = IF(SUM(H53:H54)=0,1,.../H59)
    pctMarkupOfBid: H62 === 0 ? 0 : (H60 + H61 + H62) / H70,
    pctLaborMU: (colE.base + colF.base + colG.base + colH.base) === 0 ? 0 : (H60 + H61 + H62) / J27,
    dollarsPerSqFt: N(bid.info.projectSqFt) ? H70 / N(bid.info.projectSqFt) : null,
    fieldLbsPerHr: N(bid.info.materialLbs) && (colE.total + colF.total + colG.total) ? N(bid.info.materialLbs) / (colE.total + colF.total + colG.total) : null,
    shopLbsPerHr: N(bid.info.materialLbs) && colH.total ? N(bid.info.materialLbs) / colH.total : null,
  };
}

function lookupSubPhaseCode(S, name) {
  const hit = S.ref.codesSubcontractor.find(x => x.name === name);
  return hit ? '7-' + hit.code : '';
}
