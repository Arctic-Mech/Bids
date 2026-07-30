// ============================================================
// Engine part 3: OCIP insurance worksheet, Permits calculator, calcBid master
// ============================================================
'use strict';

// ---------------- OCIP ----------------
// ctx: hour totals + labor values + supervision rows from the recap hour pass
function calcOcip(bid, S, crew, ctx) {
  const o = S.ocip;
  const PF = o.payrollFraction;                       // 0.6 bare-payroll fraction
  const emr = S.crew.sections.smField.pti.wc.emr;     // 'Crew Mix'!Q11
  const dcbs = S.crew.sections.smField.pti.wc.dcbs;   // 'Crew Mix'!W11
  const arch = N(ctx.archHrs);
  const G18 = ctx.G18;
  const R42 = arch === 0 ? 0 : arch / (G18 || 1);
  const R44 = arch === 0 ? 1 : (G18 - arch) / (G18 || 1);

  // On-site payroll estimates per WC class
  const N42 = ctx.I23 === 0 ? 0 : xr((ctx.I23 * PF + ctx.H52 * PF + ctx.H51 * PF) * R42, 0);   // Arch
  const N43 = ctx.H48 * 0.25 * PF;                                                              // Exec supervisor (25% onsite)
  const N44 = (ctx.I22 + ctx.I23) === 0 ? 0 : xr((ctx.I23 * PF + ctx.H52 * PF) * R44 + ctx.I22 * PF + ctx.H50 * PF, 0); // HVAC
  const N45 = xr((ctx.I21 + ctx.H49) * PF, 2);                                                  // Plumbing

  const payrolls = [N42, N43, N44, N45];
  const wcRows = o.wcClasses.map((cl, i) => ({ ...cl, payroll: payrolls[i], premium: payrolls[i] * cl.rate }));
  const K144 = sum(payrolls);
  const O145 = xr(sum(wcRows.map(r => r.premium)), 2);
  const O147 = xr(O145 * emr, 2);
  const O149 = O147 * o.otherFactors;                 // 0.89
  const O150 = O149 * (dcbs - 1);                     // "Oregon Tax" (negative)
  const O151 = O149 + O150;                           // Total WC cost

  const O161 = o.glPremisesRate * K144 / 1000;
  const O163 = o.glProductsRate * K144 / 1000;
  const O167 = O161 + O163 + N(o.glExcess);
  const O169 = O167;                                  // Total Liability Premium
  const O174 = O151 + O169;                           // GRAND TOTAL (OCIP_Deduct_Total)

  // Estimated man-hours per class (display)
  const hrs = [
    G18 === 0 ? 0 : xr((G18 + ctx.F52) * (arch / (G18 || 1)), 0),
    ctx.F48 * 0.25,
    (ctx.F18 + G18) === 0 ? 0 : xr((G18 + ctx.F52) * ((G18 - arch) / (G18 || 1)), 0) + (ctx.F18 + ctx.F50),
    ctx.E18 + ctx.F49,
  ];
  return {
    payrolls, wcRows, hours: hrs, totalPayroll: K144,
    estPremium: O145, modifiedPremium: O147, afterFactors: O149, oregonTax: O150,
    totalWC: O151, glPremises: O161, glProducts: O163, totalGL: O167,
    deductGLOnly: O169, deductTotal: O174,
  };
}

// ---------------- Permits ----------------
function permitTierFee(CV, tier) {
  const { min, max, fee, inc } = tier;
  if (CV < min) return 0;
  const top = CV >= max ? max : CV;
  return xru((top - min) / inc, 0) * fee;
}
function permitBlock(CV, tiers, planReviewPct, markupPct) {
  const fees = tiers.map(t => permitTierFee(CV, t));
  const subtotal = sum(fees);
  const planReview = xru(subtotal * planReviewPct, 2);
  const markup = xru((subtotal + planReview) * markupPct, 2);
  return { fees, subtotal, planReview, markup, total: subtotal + planReview + markup };
}
function calcPermits(bid, S, constructionValue) {
  const blocks = {};
  for (const j of S.permits.jurisdictions) {
    blocks[j.id] = { name: j.name, ...permitBlock(constructionValue, j.tiers, j.planReviewPct, j.markupPct) };
  }
  const cu = bid.permitCalc.custom;
  blocks.custom = { name: 'Custom', ...permitBlock(constructionValue, cu.tiers, N(cu.planReviewPct), N(cu.markupPct)) };
  const sel = bid.permitCalc.selection;   // 'none'|'portland'|'hillsboro'|'clackamas'|'custom'|'tualatin'
  const total = sel && blocks[sel] ? blocks[sel].total : 0;
  return { constructionValue, blocks, selection: sel, total };
}

// ---------------- calcBid master ----------------
function calcBid(bid, S) {
  const crew = calcCrew(bid, S);
  const smImport = calcSmImport(bid, S);
  const takeoff = calcTakeoff(bid, S, crew, smImport);

  let ocip = null, permits = null;
  const hooks = {
    ocip: (ctx) => { ocip = calcOcip(bid, S, crew, ctx); return ocip; },
    permits: (H63) => { permits = calcPermits(bid, S, H63); return permits; },
  };
  const recap = calcRecap(bid, S, crew, takeoff, hooks);
  const priceBreakdown = (typeof calcPriceBreakdown === 'function') ? calcPriceBreakdown(bid, S, crew, takeoff, recap) : null;
  const booking = (typeof calcBooking === 'function') ? calcBooking(bid, S, crew, takeoff, recap) : null;
  const proposal = (typeof calcProposal === 'function') ? calcProposal(bid, S, recap) : null;
  return { crew, smImport, takeoff, recap, ocip, permits, priceBreakdown, booking, proposal, crewHours: takeoff.crewHours };
}
