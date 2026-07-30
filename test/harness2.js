// Harness v2 — builds settings straight from company_data.json (the production blob).
'use strict';
const fs = require('fs');
const path = require('path');
const { SRC, OUTDIR, WORKBOOK } = require('./_env');
const BASE = SRC;

function loadEngine() {
  const parts = ['parts/06_fmt.js', 'parts/05_engine.js', 'parts/05b_engine_recap.js', 'parts/05c_engine_indirects.js', 'parts/05d_engine_booking.js'];
  const src = parts.map(p => fs.readFileSync(path.join(BASE, p), 'utf8')).join('\n').replace(/'use strict';/g, '');
  const names = ['calcCrew', 'calcSmImport', 'calcTakeoff', 'calcRecap', 'calcEmo', 'calcBond', 'calcWorkRecovery',
    'buildCaeItems', 'xr', 'xru', 'N', 'sum', 'fmt', 'spellNumber', 'calcBid', 'calcOcip', 'calcPermits',
    'calcBooking', 'calcPriceBreakdown', 'calcProposal', 'xlEval', 'makeBookingCtx'];
  return new Function(src + '\nreturn {' + names.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(',') + '};')();
}

const COMPANY = JSON.parse(fs.readFileSync(path.join(BASE, 'company_data.json'), 'utf8'));

// Mirrors the app's settingsFromCompany()
function settings() {
  const C = JSON.parse(JSON.stringify(COMPANY));
  return {
    crew: { sections: C.crew.sections },
    bond: C.bond,
    ocip: C.ocip,
    permits: C.permits,
    recap: C.recap,
    booking: C.booking,
    ref: {
      caeMap: C.caeMap,
      codesGC: C.codesGC, codesSubcontractor: C.codesSubcontractor,
      gcRows: C.gcRows, equipmentLabels: C.equipmentLabels, equipmentCodes: C.equipmentCodes,
      phaseCodes: C.phaseCodes, typeOfWork: C.typeOfWork,
      subRows: C.subRows,
      smImportTypes: C.smImportLists.types, smImportMaterials: C.smImportLists.materials, smImportCutTypes: C.smImportLists.cutTypes,
      takeoffTypes: ['Sheet Metal Takeoff', 'Plumb Takeoff', 'Pipe Takeoff'],
      phaseField: { material: [], shop: [], field: [] },
      proposal: C.proposal,
    },
  };
}

function seedBid() {
  const td = JSON.parse(fs.readFileSync(path.join(BASE, 'specs/takeoff.data.json'), 'utf8'));
  const cm = COMPANY.crew.sections;
  const val = (x) => x && typeof x === 'object' ? x.v : x;
  const groups = td.seedData.slice(1).map(g => ({
    id: g.id, name: g.name || '', type: g.takeoffType || '', exclude: g.exclude === true,
    items: (g.rows || []).map(r => ({
      rowOffset: r.row != null ? r.row - (COMPANY.takeoffGroupRows.find(x => x.id === g.id) || { itemsStart: r.row }).itemsStart : null,
      matPhase: r.A || '', shopPhase: r.B || '', fieldPhase: r.C || '', desc: r.D || '',
      qty: val(r.E) ?? '', fUnit: val(r.F) ?? '', fMult: val(r.G) ?? '', sUnit: val(r.I) ?? '', sMult: val(r.J) ?? '',
      mUnit: val(r.L) ?? '', mUnitExpr: (r.L && typeof r.L === 'object' && r.L.f) ? r.L.f : null,
      notes: r.N || '', emo: r.P || '', ot: r.Q || '', shift: r.R || '',
    })),
  }));
  return {
    schema: 1,
    meta: { id: 'test', rev: 1 },
    info: { estNo: '25-800', jobName: 'The Dalles Adventist Energy Upgrades', projectSqFt: 0, materialLbs: 0, projectType: 'Commercial' },
    crewMix: {
      smField: { qty: cm.smField.classes.map(c => c.defaultQty ?? null), pfST: null, pfOT: null, pfDT: null },
      smShop: { qty: cm.smShop.classes.map(c => c.defaultQty ?? null), pfST: null, pfOT: null, pfDT: null, burdenST: null, burdenOT: null, burdenDT: null },
      plumberFitter: { qty: cm.plumberFitter.classes.map(c => c.defaultQty ?? null), pfST: null, pfOT: null, pfDT: null },
    },
    smImport: { rows: [] },
    takeoff: { caeType: 'Sheet Metal Takeoff', groups },
    workRecovery: {},
    recap: {
      scheduleType: "5 8's", lop58: 0,
      mods: { plumb: [.12, .04, .02, 0, .10], pipe: [.10, .06, .02, 0, .08], sm: [.12, .01, .02, 0, .10], shop: [.08, 0, 0, 0, 0, 0] },
      archHrsInSM: 0, ocipToggle: 'No OCIP',
      subs: COMPANY.subRows.map(s => ({ name: s.name || '', fixedCode: s.code, desc: '', qp: '', value: null })),
      supPct: [.10, .10, .08, 0, .10], miscContingency: null, bondRequired: 'No', taxType: 'Oregon CAT Tax', addDeduct: null,
      subMarkup: .10, equipMarkup: .10, ohp: .24,
      permitsManual: { plumbing: null, hvac: null, medGas: null, boiler: null, specialInsp: null },
      trucking: { hrs: null, loads: null, rate: null },
      gc: { safetyPct: .002, smallToolsPct: .03, freightPct: 0, miscPct: .04, rows: {}, labels: {} },
      equipment: Array(16).fill(0).map(() => ({ qty: null, dur: null, rate: null })),
      equipmentNames: [],
      storedTotal: null, storedAt: null,
    },
    permitCalc: { selection: 'portland', custom: JSON.parse(JSON.stringify(COMPANY.permits.customDefault)) },
    ocipForm: {},
    booking: { codes: {} },
    phaseCustom: (() => {
      const pcb = JSON.parse(fs.readFileSync(path.join(BASE, 'specs/phase-codes-breakdown.data.json'), 'utf8')).phaseCodes;
      const out = {};
      for (const d of pcb.divisions) for (const [code, info] of Object.entries(d.descriptions || {})) {
        if (info && info.custom) out[d.division + '-' + code] = info.desc;
      }
      return out;
    })(),
    priceBreakdown: { notes: {} },
    proposal: { exclusionsPicked: [] },
    notes: [],
    schedule: { pm: '', altStart: null, packages: [] },
  };
}

function check(checks, tol = 0.011) {
  let fails = 0;
  for (const [name, got, want] of checks) {
    const ok = Math.abs(got - want) < tol;
    if (!ok) { fails++; console.log(`✗ ${name}: got ${Number(got).toFixed(4)} want ${want}`); }
  }
  return fails;
}

module.exports = { loadEngine, settings, seedBid, check, COMPANY };
