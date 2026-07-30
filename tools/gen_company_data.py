#!/usr/bin/env python3
"""Consolidate all extracted workbook data into company_data.json — the blob embedded in index.html."""
import json, re, os

BASE = os.path.dirname(os.path.abspath(__file__))
def load(p): return json.load(open(os.path.join(BASE, p)))

cm = load('specs/crew-mix.data.json')
td = load('specs/takeoff.data.json')
ind = load('specs/indirects.data.json')
pcb = load('specs/phase-codes-breakdown.data.json')
mc = load('specs/mcaa-recap.data.json')
smi = load('specs/sm-import-schedule.data.json')
book_specials = load('specs/booking_specials.json')
booking_cells = load('extract/Booking_Report.json')['cells']
proposal_cells = load('extract/Proposal.json')['cells']
mcaa_cells = load('extract/MCAA_RECAP.json')['cells']

out = {'version': 1}

# ---------------- crew ----------------
f_pti = cm['sections']['smField']['ptiOutside']
def pti(section_pti, wc_gross):
    return {
        'futa': f_pti['FUTA'], 'sui': f_pti['SUI'], 'sdi': f_pti['SDI'], 'ss': f_pti['SS'], 'medic': f_pti['MEDIC'],
        'countyTax': f_pti['countyTax'], 'gl': section_pti.get('GLcomb', f_pti['GL']),
        'tri': f_pti['TRI'], 'fmla': f_pti['FMLA'], 'orSickLeave': f_pti['orSickLeave'],
        'wc': {'gross': wc_gross, 'emr': 0.6, 'ogserp': 0.87, 'dcbs': 0.831, 'occpap': 0.89},
    }
CREW_QTY_EXACT = {                     # true cell states: None = blank, 0 = explicit zero
    'smField': [None, None, 1, 4, None, 1, None, None, None],
    'smShop': [0, 0, 1, 2, 1, 0, 0, 0, 1],
    'plumberFitter': [None, 1, 3, None, 0, None, None, None],
}
def classes(sec, key=None):
    qs = CREW_QTY_EXACT.get(key, [])
    return [{'name': c['classification'], 'weight': c['ratioWeight'], 'wage': c['baseWage'], 'fringe': c['fringe'],
             'defaultQty': (qs[i] if i < len(qs) else None)} for i, c in enumerate(sec['classes'])]
out['crew'] = {'sections': {
    'smField': {
        'label': 'SM Field', 'classes': classes(cm['sections']['smField'], 'smField'),
        'pti': pti(cm['sections']['smField']['ptiOutside'], 0.0224),
        'periodFactor': 0.055, 'otAdder': 0.35, 'dtAdder': 0.35,
        'premium': {'swingPct': 0.15, 'gravePct': 0.23, 'specialPct': 0.10},
        'periodStart': '2025-07-01', 'periodEnd': '2026-07-01', 'wcClassCode': 5537,
        'wageIncreases': cm['sections']['smField'].get('wageIncreases', []),
    },
    'smShop': {
        'label': 'SM Shop', 'classes': classes(cm['sections']['smShop'], 'smShop'),
        'pti': pti(cm['sections']['smShop']['ptiShop'], 0.0177),
        'periodFactor': 0.055, 'otAdder': 0, 'dtAdder': 0, 'shopBurden': 16.5,
        'premium': {'swingPct': 0.15, 'gravePct': 0.23, 'specialPct': 0.10}, 'wcClassCode': 3076,
    },
    'plumberFitter': {
        'label': 'Plumber / Pipefitter', 'classes': classes(cm['sections']['plumberFitter'], 'plumberFitter'),
        'pti': pti(cm['sections']['plumberFitter']['ptiOutside'], 0.0132),
        'periodFactor': 0.06, 'otAdder': 0.35, 'dtAdder': 0.35,
        'premium': {'swingGravePct': 0.10, 'swingLOP': 0.0625, 'graveLOP': 0.125},
        'periodStart': '2025-04-01', 'periodEnd': '2026-03-31', 'wcClassCode': 5537,
        'wageIncreases': cm['sections']['plumberFitter'].get('wageIncreases', []),
    },
}}

# ---------------- recap defaults / constants ----------------
out['recap'] = {
    'lop510': 0.15, 'lop610': 0.25, 'lop606050': 0.25,
    'defaultMods': {'plumb': [.16, .04, .02, .05, .10], 'pipe': [.16, .09, .02, .05, .10], 'sm': [.16, .01, .02, 0, .10]},  # R/S/T panel
    'defaultSupPct': [.10, .15, .15, 0, .15],   # N48:N52
    'equipmentRates': [250, 1000, 1200, 600, 0, 1550, 1750, 1000, 0, 0, 0, 0, 0, 0, 0, 0],  # I114:I129
    'taxRates': {'oregonCat': 0.004, 'washingtonBO': 0.00484, 'multnomahAdder': 0.0015},
    'costLevelerStep': 5,
}

# ---------------- bond / work recovery / ocip / permits ----------------
out['bond'] = {'brackets': [b['width'] for b in ind['bond']['brackets']],
               'rates': [b['ratePer1000'] for b in ind['bond']['brackets']]}
out['ocip'] = {
    'payrollFraction': 0.6, 'otherFactors': 0.89,
    'wcClasses': [{'desc': w['description'], 'code': w['classCode'], 'pctOnsite': w['pctOnsite'], 'rate': w['wcRatePer100']}
                  for w in ind['ocip']['wcClasses']],
    'glPremisesRate': 3.59, 'glProductsRate': 8.59, 'glExcess': 0,
    'form': ind['ocip']['formDefaults'],
}
pr_pcts = {'hillsboro': 0.25, 'portland_multnomah': 0.65, 'clackamas': 0.65, 'tualatin': 0.65}
out['permits'] = {'jurisdictions': [
    {'id': ('portland' if j['id'] == 'portland_multnomah' else j['id']), 'name': j['name'],
     'tiers': [{'min': t['min'], 'max': t['max'], 'fee': t['fee'], 'inc': t['increment']} for t in j['tiers']],
     'planReviewPct': pr_pcts[j['id']], 'markupPct': 0.05}
    for j in ind['permits']['jurisdictions'] if j['id'] != 'custom'
], 'customDefault': {
    'tiers': [{'min': t['min'], 'max': t['max'], 'fee': t['fee'], 'inc': t['increment']}
              for t in next(j for j in ind['permits']['jurisdictions'] if j['id'] == 'custom')['tiers']],
    'planReviewPct': 0.65, 'markupPct': 0.05,
}}

# ---------------- phase codes ----------------
pc = pcb['phaseCodes']
divisions = []
for d in pc['divisions']:
    descs = {}
    for code, info in (d.get('descriptions') or {}).items():
        if isinstance(info, dict):
            custom = bool(info.get('custom'))
            descs[code] = {'d': '' if custom else info.get('desc', info.get('description', '')), 'custom': custom}
        else:
            descs[code] = {'d': info, 'custom': False}
    divisions.append({'div': d['division'], 'name': d['name'], 'descriptions': descs})
out['phaseCodes'] = {
    'divisions': divisions,
    'fieldDivs': [1, 3, 4, 5, 6, 7, 8],   # Phase_Code_List_Field
    'shopDivs': [2],                      # Phase_Code_List_Shop
    'materialDivs': [1, 2, 3, 4, 5, 6, 7, 8],
}

# ---------------- CAE mapping (parse SUMPRODUCT criteria) ----------------
FIELDMAP = {'SMImport_Type': 'type', 'SMImport_Material': 'material', 'SMImport_CutType': 'cutType'}
def parse_crit(formula):
    crit = {}
    # groups like (SMImport_Type="X") possibly OR'd: ((A="x")+(A="y"))
    for grp in re.findall(r'\(((?:\(?SMImport_\w+="[^"]*"\)?(?:\+)?)+)\)\*', formula + '*'):
        fields = re.findall(r'(SMImport_\w+)="([^"]*)"', grp)
        if not fields: continue
        key = FIELDMAP[fields[0][0]]
        vals = [v for _, v in fields]
        if len(vals) == 1: crit[key] = vals[0]
        else: crit[key + 'Any'] = vals
    return crit
cae_rows = {r['row']: r for r in td['seedData'][0]['rows']}
cae_map = []
for m in td['caeMappingTable']:
    if m['row'] == 34: continue  # remainder handled natively
    qty_crit = parse_crit(m['qtyFormula'])
    hrs_crit = parse_crit(m['fieldHoursFormula'])
    seed = cae_rows.get(m['row'], {})
    entry = {'label': m['label'], 'matPhase': seed.get('A', ''), 'shopPhase': seed.get('B', ''), 'fieldPhase': seed.get('C', '')}
    if qty_crit == hrs_crit: entry['crit'] = qty_crit
    else: entry['qtyCrit'] = qty_crit; entry['hoursCrit'] = hrs_crit
    cae_map.append(entry)
out['caeMap'] = cae_map
# distinct dropdown values for SM Import
types, mats, cuts = set(), set(), set()
for m in cae_map:
    for c in [m.get('crit', {}), m.get('qtyCrit', {}), m.get('hoursCrit', {})]:
        for k, v in c.items():
            vals = v if isinstance(v, list) else [v]
            if k.startswith('type'): types.update(vals)
            elif k.startswith('material'): mats.update(vals)
            elif k.startswith('cutType'): cuts.update(vals)
out['smImportLists'] = {'types': sorted(types), 'materials': sorted(mats), 'cutTypes': sorted(cuts)}

# ---------------- GC rows / equipment / subs schemas ----------------
out['gcRows'] = [
    {'key': 'tempPower', 'label': 'Temporary Power'}, {'key': 'tempWater', 'label': 'Temporary Water'},
    {'key': 'phones', 'label': 'Telephones and Fax'}, {'key': 'jobSafety', 'label': 'Job Safety Supplies'},
    {'key': 'jobTruck', 'label': 'Job Truck'}, {'key': 'fuel', 'label': 'Fuel'}, {'key': 'parking', 'label': 'Parking'},
    {'key': 'siteTrailer', 'label': 'Site Office - Trailer'}, {'key': 'siteStorage', 'label': 'Site Storage Facility'},
    {'key': 'miscRow', 'label': 'Miscellaneous'}, {'key': 'subsArch', 'label': 'Subsistence - Arch'},
    {'key': 'subsService', 'label': 'Subsistence - Service'}, {'key': 'subsSM', 'label': 'Subsistence - Sheet Metal'},
    {'key': 'subsPM', 'label': 'Subsistence - PM/Admin'}, {'key': 'adminAssist', 'label': 'Administrative Assistance'},
    {'key': 'jobOrientation', 'label': 'Job Orientation - Sheet Metal Field', 'rateFrom': 'journeyman'},
    {'key': 'asstPM', 'label': 'Assistant PM', 'rateDefault': 'classified'},
    {'key': 'thirdPartyTesting', 'label': 'Third Party Testing'},
    {'key': 'laborer', 'label': 'Laborer- or Non Bargaining (Cleanup Crew)', 'rateDefault': 'classified'},
    {'key': 'safetySupplies2', 'label': 'Safety Supplies', 'editableLabel': True, 'mcaaRow': 101},
    {'key': 'cadOperator', 'label': 'CAD Operator', 'rateDefault': 'smGenForeman', 'mcaaRow': 102},
    {'key': 'gcExtra1', 'label': '', 'editableLabel': True, 'mcaaRow': 103},
    {'key': 'gcExtra2', 'label': '', 'editableLabel': True, 'mcaaRow': 104},
    {'key': 'gcExtra3', 'label': '', 'editableLabel': True, 'mcaaRow': 105},
]
# fixed phase codes of MCAA GC rows 77..100 + 106 (col A literals) — booking references them via H-cells,
# but keep the identity map for the function map / booking G codes.
gc_fixed_codes = {}
for r in list(range(77, 101)) + [106]:
    e = mcaa_cells.get(f'A{r}')
    if e and not e.get('f'): gc_fixed_codes[r] = str(e.get('v', '')).strip()
out['gcFixedCodes'] = gc_fixed_codes
out['equipmentLabels'] = ['Crane/Hoist', 'Crane Mobilization - Demobilization and Setup',
    "Scissor Lift - Large (Rough Terrain Under 33')", "Scissor Lift - Small (Under 26')", 'Boom Truck',
    "Articulating Boom - Snorkel (Under 40' Reach)", "Forklift  - Large, Gradall (5.5K 19' Reach)",
    'Forklift - Small (5K Wharehouse Style)', 'Genie Lift', 'Weld Machine Electric', 'Weld Machine Gas',
    'Scaffold', 'Arch Specialty Rental Equipment', '', '', '']
out['equipmentCodes'] = ['7-15', '7-15', '1-19', '1-19', '1-19', '1-19', '1-19', '1-19', '1-19', '1-19', '1-19', '1-19', '8-24', '', '', '']
out['subRows'] = [{'name': 'Ext Insulation     SqFt', 'fixed': True, 'code': '7-03'},
                  {'name': 'Test and Balance'}, {'name': 'Instrumentation and Control'},
                  {'name': 'Crane and Hoisting'}, {'name': 'Engineering'}, {}, {}, {}, {}]

# codes lists for dropdowns (name -> code number string) from Phase Codes divisions 1 and 7
def codelist(divno):
    d = next(x for x in divisions if x['div'] == divno)
    return [{'code': code, 'name': info['d']} for code, info in sorted(d['descriptions'].items()) if info['d']]
out['codesGC'] = codelist(1)
out['codesSubcontractor'] = codelist(7)

# ---------------- Type of Work list (Booking Report R1:R15) ----------------
tow = []
for r in range(1, 16):
    e = booking_cells.get(f'R{r}')
    if e and e.get('v') not in (None, ' '): tow.append(str(e['v']))
out['typeOfWork'] = tow

# ---------------- Booking Report layout ----------------
blocks = [(1, 22), (2, 128), (3, 234), (4, 340), (5, 446), (6, 552), (7, 658), (8, 764)]
plain_pat = {
    'D': re.compile(r'^=SUMIFS\(SM_(?:Field|Shop)LaborColumn,PC_SM_(?:Field|Shop),\$A\d+\)$'),
    'E': re.compile(r'^=SUMIFS\(Takeoff_Total_(?:Field|Shop)_Labor_Cost,PC_SM_(?:Field|Shop),\$A\d+\)$'),
    'F': re.compile(r'^=SUMIFS\(SM_MaterialColumn,PC_SM_Material,\$A\d+\)$'),
}
specials_by_row = {}
for s in book_specials:
    specials_by_row.setdefault((s['div'], s['code']), {})[s['col']] = s['f']
# G column defaults + H mapping numbers
g_defaults = {}
h_formula = None
for div, r0 in blocks:
    for i in range(99):
        r = r0 + i
        g = booking_cells.get(f'G{r}')
        if g and g.get('v') not in (None, ''): g_defaults[f'{div}-{i+1:02d}'] = str(g['v'])
        if not h_formula:
            h = booking_cells.get(f'H{r}')
            if h and h.get('f'): h_formula = h['f']
out['booking'] = {
    'divisions': [{'div': d, 'startRow': r0,
                   'kind': ('shop' if d in (2, 4) else 'field'),
                   } for d, r0 in blocks],
    'specials': {f'{d}|{code}': cols for (d, code), cols in specials_by_row.items()},
    'gDefaults': g_defaults,
    'hFormula': h_formula,
    'bookingStatusList': [str(booking_cells.get(f'K{r}', {}).get('v', '')) for r in range(2, 6)],
}
# sanity output
print('booking specials rows:', len(specials_by_row), '| gDefaults:', len(g_defaults))
print('hFormula:', h_formula)

# ---------------- Proposal texts ----------------
def pv(addr):
    e = proposal_cells.get(addr)
    return str(e.get('v')) if e and e.get('v') is not None else ''
out['proposal'] = {
    'letterhead': [pv('A3'), pv('A4'), pv('A5'), pv('A6')],
    'scopeDefault': pv('B17'),
    'termsText': pv('A48'),
    'proposeText': pv('A44'),
    'acceptanceText': pv('A59') + ' ' + pv('A60') + ' ' + pv('A61'),
    'validityDays': 30,
    'exclusionPicker': [pv(f'X{r}') for r in range(17, 35) if pv(f'X{r}')],
    'inclusionOptions': [pv(f'AA{r}') for r in range(17, 35) if pv(f'AA{r}')],
    'exclusionLibrary': [pv(f'AC{r}') for r in range(14, 77) if pv(f'AC{r}')],
    'clarifications': [pv(f'AC{r}') for r in range(79, 83) if pv(f'AC{r}')],
}


# ---------------- XLSM template metadata (for browser-side spreadsheet export/import) ----------------
out['takeoffGroupRows'] = [
    {'id': g['id'], 'headerRow': g['headerRow'], 'itemsStart': g['itemsStart'], 'itemsEnd': g['itemsEnd']}
    for g in td['groups'] if g['id'] != 'CAE'
]
unlocked = load('unlocked_cells.json')
keep_formula = {
    'Crew Mix': ['H30', 'H51', 'H72', 'H93', 'H114', 'H155', 'H175', 'I106', 'I127'],
    'MCAA RECAP': ['G81', 'G98', 'G100', 'G102'],
    'SM Import': ['L9', 'N9'],
    'OCIP': ['E8'],
}
# Sheets whose unlocked cells hold DISPLAY content the app leaves as-is
# (Proposal text library, SM Schedule task defaults) are not blanked wholesale;
# Booking Report blanks only its modeled header cells.
blank_cells = {}
for title, cells in unlocked.items():
    if title in ('Proposal', 'SM Schedule'):
        continue
    if title == 'Booking Report':
        blank_cells[title] = ['F2', 'C5', 'C6', 'D6', 'E6', 'C10', 'B16', 'G8']
        continue
    kf = set(keep_formula.get(title, []))
    lst = [c for c, t in cells if not (t == 'F' and c in kf)]
    if title == 'TakeOff':
        lst = [c for c in lst if int(re.match(r'[A-Z]+(\d+)', c).group(1)) >= 36]
    if lst: blank_cells[title] = lst
out['xlsmBlank'] = blank_cells
# custom phase-code slots (per-bid descriptions) -> addresses to blank before writing bid's own
divcol = {1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F', 6: 'G', 7: 'H', 8: 'I'}
slots = []
for d in out['phaseCodes']['divisions']:
    for code, info in d['descriptions'].items():
        if info.get('custom'):
            slots.append(divcol[d['div']] + str(3 + int(code)))
out['phaseCustomSlots'] = slots

# ---------------- company identity ----------------
out['company'] = {
    'name': 'Arctic Sheet Metal, Inc.',
    'address1': '2310 NE Columbia Boulevard', 'address2': 'Portland, Oregon  97211',
    'phoneLine': 'Phone (503) 288-5844   Fax (503) 288-5849',
    'federalId': ind['ocip']['formDefaults'].get('federalId', ''),
    'wcInsurer': ind['ocip']['formDefaults'].get('wcInsurer', ''),
}

with open(os.path.join(BASE, 'company_data.json'), 'w') as f:
    json.dump(out, f, separators=(',', ':'))
size = os.path.getsize(os.path.join(BASE, 'company_data.json'))
print(f'company_data.json: {size//1024}KB')
for k in out: print(' ', k)
