// ============================================================
// Bid model: factory, migration, settings assembly, diff labels
// ============================================================
'use strict';

const APP_VERSION = '1.0.0';
const BID_SCHEMA = 1;

// Effective settings structure consumed by the engine (from COMPANY + overrides)
function settingsFromCompany(C) {
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
      phaseCodes: C.phaseCodes, typeOfWork: C.typeOfWork, subRows: C.subRows,
      smImportTypes: C.smImportLists.types, smImportMaterials: C.smImportLists.materials, smImportCutTypes: C.smImportLists.cutTypes,
      takeoffTypes: ['Sheet Metal Takeoff', 'Plumb Takeoff', 'Pipe Takeoff'],
      phaseField: phaseLists(C.phaseCodes),
      proposal: C.proposal,
      company: C.company,
    },
  };
}
function phaseLists(pc) {
  const gen = (divs) => {
    const out = [];
    for (const d of divs) for (let i = 1; i <= 99; i++) out.push(d + '-' + String(i).padStart(2, '0'));
    return out;
  };
  return { material: gen(pc.materialDivs), shop: gen(pc.shopDivs), field: gen(pc.fieldDivs) };
}

function effectiveSettings() {
  const s = settingsFromCompany(deepClone(COMPANY));
  const ov = store.settingsOverrides();
  for (const [path, val] of Object.entries(ov)) pathSet(s, path, val);
  return s;
}

function newTakeoffGroup(id) {
  return { id, name: '', type: '', exclude: false, items: Array(5).fill(0).map(() => newTakeoffItem()) };
}

function makeNewBid(S) {
  const C = COMPANY;
  return {
    schema: BID_SCHEMA,
    meta: { id: uid(), rev: 1, savedAt: null },
    info: {
      estNo: '', jobName: '', location: '', bidDate: '', bidTime: '',
      address: '', city: '', state: '', zip: '', jobNumber: '',
      projectType: 'Commercial', projectSqFt: null, materialLbs: null,
    },
    crewMix: {   // qty: null = blank cell, 0 = explicit zero (mirrors the workbook exactly)
      smField: { qty: S.crew.sections.smField.classes.map(c => c.defaultQty ?? null), pfST: null, pfOT: null, pfDT: null },
      smShop: { qty: S.crew.sections.smShop.classes.map(c => c.defaultQty ?? null), pfST: null, pfOT: null, pfDT: null, burdenST: null, burdenOT: null, burdenDT: null },
      plumberFitter: { qty: S.crew.sections.plumberFitter.classes.map(c => c.defaultQty ?? null), pfST: null, pfOT: null, pfDT: null },
    },
    smImport: { rows: [] },
    takeoff: { caeType: '', groups: [newTakeoffGroup(1)] },
    workRecovery: { smField: {}, smShop: {}, arch: {}, plumber: {}, fitter: {} },
    recap: {
      scheduleType: "5 8's", lop58: 0,
      mods: { plumb: [.12, .04, .02, 0, .10], pipe: [.10, .06, .02, 0, .08], sm: [.12, .01, .02, 0, .10], shop: [.08, 0, 0, 0, 0, 0] },
      archHrsInSM: 0, ocipToggle: 'No OCIP',
      subs: C.subRows.map(s => ({ name: s.name || '', fixedCode: s.code || null, desc: '', qp: '', value: null })),
      supPct: [.10, .10, .08, 0, .10],
      miscContingency: null, bondRequired: 'No', taxType: 'Oregon CAT Tax', addDeduct: null,
      subMarkup: .10, equipMarkup: .10, ohp: .24,
      permitsManual: { plumbing: null, hvac: null, medGas: null, boiler: null, specialInsp: null },
      trucking: { hrs: null, loads: null, rate: null },
      gc: { safetyPct: .002, smallToolsPct: .03, freightPct: 0, miscPct: .04, rows: {}, labels: {} },
      equipment: Array(16).fill(0).map(() => ({ qty: null, dur: null, rate: null })),
      equipmentNames: [],
      storedTotal: null, storedAt: null,
      mcaaNotes: { misc: '', bond: '', tax: '', gcMisc: '' },   // L65/L66/L68/L106
    },
    permitCalc: { selection: 'none', custom: deepClone(C.permits.customDefault) },
    ocipForm: { bidPackageName: '', bidPackageNo: '', applicantType: 1, contractWith: 3, subcontractWork: 1, bidType: 1, contractType: 2, combinedRate: 1 },
    booking: { codes: {}, certifiedPayroll: 'No', bookingType: 'Original', contract: 'Lump Sum', status: '', statusHours: '' },
    phaseCustom: {},                      // per-bid custom phase code descriptions: {"3-39": "Fan Deck room"}
    xlsmSpaces: {},                       // whitespace-only cells carried from an imported workbook (exact re-export)
    priceBreakdown: { notes: {} },
    proposal: {
      attn: '', submittedTo: '', address: '', cityStateZip: '', architect: '', phone: '', fax: '', date: '', dateOfPlans: '',
      scope: C.proposal.scopeDefault, exclusionsPicked: [], exclusionLibraryPicked: [],
      inclusionsPicked: [],              // the sheet's second picker (Z/AA) — same Exclusions line
      clarifications: [],                // the printed form has no clarifications slot; add per bid

      paymentTerms: '', validityDays: 30,
    },
    notes: Array(10).fill(0).map((_, i) => ({ num: i + 1, service: '', desc: '', impact: '', est: null, strategy: '', rfi: '' })),
    schedule: { pm: '', altStart: null, packages: [] },
    settingsSnapshot: null,               // set on save: rates frozen with the bid
  };
}

function migrateBid(bid) {
  const fresh = makeNewBid(effectiveSettings());
  const merge = (dst, src) => {
    for (const k of Object.keys(src)) {
      if (dst[k] === undefined) dst[k] = src[k];
      else if (dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k]) && src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) merge(dst[k], src[k]);
    }
  };
  merge(bid, fresh);                      // fill any fields added since the bid was saved
  bid.schema = BID_SCHEMA;
  if (!bid.meta.id) bid.meta.id = uid();
  return bid;
}

// Plain-English name for an undo step, from the path that was edited.
function undoLabel(path) {
  if (!path) return 'last change';
  const lbl = labelForPath(path);
  const page = DIFF_PAGE_NAMES[path.split(/[.[]/)[0]];
  return page && lbl !== path ? page + ' — ' + lbl : (lbl === path ? 'last change' : lbl);
}

// ---------- diff labels ----------
const DIFF_PAGE_NAMES = {
  info: 'Job Information', meta: 'Revision', crewMix: 'Crew Mix', smImport: 'SM Import', takeoff: 'TakeOff',
  workRecovery: 'Work Recovery', recap: 'Estimate Recap', permitCalc: 'Permits', ocipForm: 'OCIP Form',
  booking: 'Booking Report', phaseCustom: 'Phase Codes', priceBreakdown: 'Price Breakdown',
  proposal: 'Proposal', notes: 'Takeoff Notes', schedule: 'SM Schedule', settingsSnapshot: 'Rates snapshot',
};
const MODLBL = ['Detailing', 'Testing', 'Safety', 'QC', 'Material Handling', 'LOP'];
const SUPLBL = ['Project Manager', 'Plumb Supervision', 'Pipe Supervision', 'Arch Supervision', 'SM Supervision'];
const DIFF_LABELS = [
  [/^info\.(\w+)$/, m => ({ estNo: 'Estimate #', jobName: 'Job Name', location: 'Location', bidDate: 'Bid Date', bidTime: 'Bid Time', projectType: 'Project Type', projectSqFt: 'Project SqFt', materialLbs: 'Material Lbs', address: 'Address', city: 'City', state: 'State', zip: 'Zip', jobNumber: 'Job Number' }[m[1]] || 'Job info: ' + m[1])],
  [/^meta\.rev$/, () => 'Revision number'],
  [/^takeoff\.groups\[(\d+)\]\.name$/, m => 'Group ' + (Number(m[1]) + 1) + ' name'],
  [/^takeoff\.groups\[(\d+)\]\.exclude$/, m => 'Group ' + (Number(m[1]) + 1) + ' excluded'],
  [/^takeoff\.groups\[(\d+)\]\.type$/, m => 'Group ' + (Number(m[1]) + 1) + ' takeoff type'],
  [/^takeoff\.groups\[(\d+)\]\.items\[(\d+)\]\.(\w+)$/, m => {
    const f = { matPhase: 'material phase', shopPhase: 'shop phase', fieldPhase: 'field phase', desc: 'description', qty: 'quantity', fUnit: 'field labor unit', fMult: 'field multiplier', sUnit: 'shop labor unit', sMult: 'shop multiplier', mUnit: 'material unit $', notes: 'notes', emo: 'EMO flag', ot: 'overtime', shift: 'shift', plug: 'plug flag' }[m[3]] || m[3];
    return 'Group ' + (Number(m[1]) + 1) + ' row ' + (Number(m[2]) + 1) + ' — ' + f;
  }],
  [/^takeoff\.groups\[(\d+)\]\.items\.length$/, m => 'Group ' + (Number(m[1]) + 1) + ' row count'],
  [/^takeoff\.groups\.length$/, () => 'Number of takeoff groups'],
  [/^takeoff\.caeType$/, () => 'CAE takeoff type'],
  [/^crewMix\.(\w+)\.qty\[(\d+)\]$/, m => ({ smField: 'SM Field', smShop: 'SM Shop', plumberFitter: 'Plumber/Fitter' }[m[1]]) + ' crew — ' + (COMPANY.crew.sections[m[1]].classes[Number(m[2])] || {}).name],
  [/^crewMix\.(\w+)\.pf(ST|OT|DT)$/, m => ({ smField: 'SM Field', smShop: 'SM Shop', plumberFitter: 'Plumber/Fitter' }[m[1]]) + ' period factor ' + m[2]],
  [/^crewMix\.smShop\.burden/, () => 'Shop burden $/hr'],
  [/^recap\.mods\.(\w+)\[(\d+)\]$/, m => ({ plumb: 'Plumb', pipe: 'Pipe', sm: 'SM Field', shop: 'SM Shop' }[m[1]]) + ' modifier % — ' + MODLBL[Number(m[2])]],
  [/^recap\.supPct\[(\d+)\]$/, m => 'Supervision % — ' + SUPLBL[Number(m[1])]],
  [/^recap\.subs\[(\d+)\]\.(\w+)$/, m => 'Subcontract row ' + (Number(m[1]) + 1) + ' ' + ({ name: 'trade', desc: 'description', qp: 'quote/plug', value: 'value' }[m[2]] || m[2])],
  [/^recap\.scheduleType$/, () => 'Schedule'],
  [/^recap\.lop58$/, () => "LOP % (5 8's)"],
  [/^recap\.archHrsInSM$/, () => 'Arch hours in SM takeoff'],
  [/^recap\.ocipToggle$/, () => 'OCIP toggle'],
  [/^recap\.subMarkup$/, () => 'Subcontractor markup %'],
  [/^recap\.equipMarkup$/, () => 'Equipment markup %'],
  [/^recap\.ohp$/, () => 'Overhead & Profit %'],
  [/^recap\.miscContingency$/, () => 'Miscellaneous / contingency'],
  [/^recap\.bondRequired$/, () => 'Bond required'],
  [/^recap\.taxType$/, () => 'Tax type'],
  [/^recap\.addDeduct$/, () => 'Cost leveler add/deduct'],
  [/^recap\.permitsManual\.(\w+)$/, m => 'Manual permit — ' + m[1]],
  [/^recap\.trucking\.(\w+)$/, m => 'Trucking ' + m[1]],
  [/^recap\.gc\.(safetyPct|smallToolsPct|freightPct|miscPct)$/, m => 'GC % — ' + ({ safetyPct: 'safety supplies', smallToolsPct: 'small tools', freightPct: 'freight', miscPct: 'miscellaneous' }[m[1]])],
  [/^recap\.gc\.rows\.(\w+)\.(\w+)$/, m => 'GC row ' + (COMPANY.gcRows.find(x => x.key === m[1]) || { label: m[1] }).label + ' — ' + m[2]],
  [/^recap\.gc\.labels\.(\w+)$/, m => 'GC row label (' + m[1] + ')'],
  [/^recap\.equipment\[(\d+)\]\.(\w+)$/, m => 'Equipment — ' + (COMPANY.equipmentLabels[Number(m[1])] || ('row ' + (Number(m[1]) + 1))) + ' ' + m[2]],
  [/^recap\.equipmentNames\[(\d+)\]$/, m => 'Equipment row ' + (Number(m[1]) + 1) + ' name'],
  [/^recap\.storedTotal$/, () => 'Stored total snapshot'],
  [/^recap\.storedAt$/, () => 'Stored total time'],
  [/^workRecovery\.(\w+)\.(\w+)$/, m => 'Work recovery ' + m[1] + ' ' + ({ rate: '$/hr', maxHrs: 'max hours' }[m[2]] || m[2])],
  [/^permitCalc\.selection$/, () => 'Permit jurisdiction'],
  [/^permitCalc\.custom\./, () => 'Permit custom tier table'],
  [/^smImport\.rows\[(\d+)\]\.(\w+)$/, m => 'SM Import row ' + (Number(m[1]) + 1) + ' ' + m[2]],
  [/^smImport\.rows\.length$/, () => 'SM Import row count'],
  [/^booking\.codes\.(.+)$/, m => 'Booking code for phase ' + m[1]],
  [/^booking\.(\w+)$/, m => 'Booking ' + m[1]],
  [/^phaseCustom\.(.+)$/, m => 'Custom phase code ' + m[1]],
  [/^priceBreakdown\.notes\.(\w+)$/, m => 'Price breakdown notes — group ' + m[1]],
  [/^proposal\.(\w+)/, m => 'Proposal ' + m[1]],
  [/^notes\[(\d+)\]\.(\w+)$/, m => 'Takeoff note ' + (Number(m[1]) + 1) + ' ' + m[2]],
  [/^schedule\./, () => 'SM Schedule'],
  [/^ocipForm\.(\w+)$/, m => 'OCIP form ' + m[1]],
  [/^settingsSnapshot\.crew\.sections\.(\w+)\.classes\[(\d+)\]\.(wage|fringe)$/, m => 'Company rate — ' + m[1] + ' ' + ((COMPANY.crew.sections[m[1]] || { classes: [] }).classes[Number(m[2])] || {}).name + ' ' + m[3]],
  [/^settingsSnapshot\.(.+)$/, m => 'Company rate — ' + m[1]],
];
