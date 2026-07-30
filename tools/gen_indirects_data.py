import json, os

BASE = '/tmp/claude-0/-home-user-Bids/d95b0eba-ee81-5449-ac02-ef79814d2430/scratchpad'
def load(name):
    return json.load(open(f'{BASE}/extract/{name}.json'))['cells']

def v(cells, ref, default=None):
    c = cells.get(ref)
    return c.get('v', default) if c else default

def locked(cells, ref):
    c = cells.get(ref)
    return c.get('locked', True) if c else True  # absent cells: assume default

out = {}

# ---------------- PERMITS ----------------
P = load('Permits')
def tiers(cells, rows, cmin, cmax, cfee, cinc):
    t = []
    for r in rows:
        row = {
            'min': v(cells, f'{cmin}{r}'), 'max': v(cells, f'{cmax}{r}'),
            'fee': v(cells, f'{cfee}{r}'), 'increment': v(cells, f'{cinc}{r}'),
        }
        row['cells'] = {'min': f'{cmin}{r}', 'max': f'{cmax}{r}', 'fee': f'{cfee}{r}', 'increment': f'{cinc}{r}'}
        row['unlocked'] = {k: (not locked(cells, row['cells'][k])) for k in ('min','max','fee','increment')}
        t.append(row)
    return t

out['permits'] = {
    'constructionValueCell': 'Permits!F1',
    'constructionValueFormula': "='MCAA RECAP'!H63",
    'selectorCell': 'Permits!R1',
    'selectorOptions': [
        {'value': 1, 'label': v(P,'K3'),  'block': 'right-top',  'totalCell': 'O18'},
        {'value': 2, 'label': v(P,'B3'),  'block': 'left-top',   'totalCell': 'F18'},
        {'value': 3, 'label': v(P,'B22'), 'block': 'left-mid',   'totalCell': 'F37'},
        {'value': 4, 'label': v(P,'K22'), 'block': 'right-mid',  'totalCell': 'O37'},
        {'value': 5, 'label': v(P,'I1'),  'block': None,          'totalCell': None},
        {'value': 6, 'label': v(P,'B41'), 'block': 'left-bottom','totalCell': 'F57'},
        {'value': 0, 'label': '(none selected)', 'block': None,   'totalCell': None},
    ],
    'jurisdictions': [
        {
            'id': 'hillsboro', 'selectorValue': 2, 'name': v(P,'B3'), 'asOf': v(P,'H3'),
            'tiers': tiers(P, range(6,10), 'B','C','D','E'),
            'planReviewPct': {'value': v(P,'G14'), 'cell': 'Permits!G14', 'unlocked': not locked(P,'G14')},
            'markupPct':     {'value': v(P,'G16'), 'cell': 'Permits!G16', 'unlocked': not locked(P,'G16')},
        },
        {
            'id': 'portland_multnomah', 'selectorValue': 1, 'name': v(P,'K3'), 'asOf': v(P,'Q3'),
            'tiers': tiers(P, range(6,10), 'K','L','M','N'),
            'planReviewPct': {'value': v(P,'P14'), 'cell': 'Permits!P14', 'unlocked': not locked(P,'P14')},
            'markupPct':     {'value': v(P,'P16'), 'cell': 'Permits!P16', 'unlocked': not locked(P,'P16')},
        },
        {
            'id': 'clackamas', 'selectorValue': 3, 'name': v(P,'B22'), 'asOf': v(P,'H22'),
            'tiers': tiers(P, range(25,29), 'B','C','D','E'),
            'planReviewPct': {'value': v(P,'G33'), 'cell': 'Permits!G33', 'unlocked': not locked(P,'G33')},
            'markupPct':     {'value': v(P,'G35'), 'cell': 'Permits!G35', 'unlocked': not locked(P,'G35')},
        },
        {
            'id': 'custom', 'selectorValue': 4, 'name': v(P,'K22'), 'asOf': v(P,'Q22'),
            'tiers': tiers(P, range(25,30), 'K','L','M','N'),
            'planReviewPct': {'value': v(P,'P33'), 'cell': 'Permits!P33', 'unlocked': not locked(P,'P33')},
            'markupPct':     {'value': v(P,'P35'), 'cell': 'Permits!P35', 'unlocked': not locked(P,'P35')},
        },
        {
            'id': 'tualatin', 'selectorValue': 6, 'name': v(P,'B41'), 'asOf': v(P,'H41'),
            'tiers': tiers(P, range(44,50), 'B','C','D','E'),
            'planReviewPct': {'value': v(P,'G53'), 'cell': 'Permits!G53', 'unlocked': not locked(P,'G53')},
            'markupPct':     {'value': v(P,'G55'), 'cell': 'Permits!G55', 'unlocked': not locked(P,'G55')},
        },
    ],
}

# ---------------- BOND ----------------
B = load('Bond')
out['bond'] = {
    'sellPriceCell': 'Bond!C2',
    'sellPriceFormula': "=SUM('MCAA RECAP'!H63,'MCAA RECAP'!H64,'MCAA RECAP'!H65,'MCAA RECAP'!H67)",
    'brackets': [
        {'label': v(B,f'A{r}'), 'width': v(B,f'B{r}'), 'ratePer1000': v(B,f'C{r}'),
         'cells': {'width': f'Bond!B{r}', 'rate': f'Bond!C{r}'}}
        for r in range(4,9)
    ],
    'totalCell': 'Bond!E9', 'totalNamedRange': 'Bond',
    'jobLengthMonths': {'cell': 'Bond!C10', 'formula': "=ROUNDUP(('Crew Mix'!I7-'Crew Mix'!I5)/30,0)", 'daysPerMonth': 30},
}

# ---------------- OCIP ----------------
O = load('OCIP')
out['ocip'] = {
    'wcClasses': [
        {'row': r,
         'description': v(O,f'B{r}'),
         'classCode': v(O,f'F{r}'),
         'pctOnsite': v(O,f'G{r}'),
         'wcRatePer100': v(O,f'M{r}'),
         'cells': {'description': f'OCIP!B{r}', 'classCode': f'OCIP!F{r}', 'pctOnsite': f'OCIP!G{r}', 'wcRate': f'OCIP!M{r}'}}
        for r in (139,140,141,142)
    ],
    'scopeWCCodes': [  # page-1 scope-of-work table rows 42-45
        {'row': r, 'trade': v(O,f'K{r}'), 'classCode': v(O,f'L{r}')}
        for r in (42,43,44,45)
    ],
    'glClasses': [
        {'row': 161, 'description': v(O,'B161'), 'classCode': v(O,'G161'),
         'ratePer1000': v(O,'M161'), 'cells': {'rate': 'OCIP!M161'}},
        {'row': 163, 'description': v(O,'B163'), 'classCode': v(O,'G163'),
         'ratePer1000': v(O,'M163'), 'cells': {'rate': 'OCIP!M163'}},
        {'row': 165, 'description': v(O,'B165'), 'classCode': v(O,'G165') if isinstance(v(O,'G165'), (int,float)) else None,
         'ratePer1000': v(O,'M165'), 'payrollOverride': v(O,'I165'), 'premiumLiteral': v(O,'O165'),
         'note': v(O,'B166'), 'cells': {'rate': 'OCIP!M165', 'payroll': 'OCIP!I165', 'premium': 'OCIP!O165'}},
    ],
    'factors': {
        'payrollFractionOfLaborCost': {'value': 0.6, 'source': "hard-coded literal '*0.6' inside OCIP!N42,N43,N44,N45",
            'meaning': 'assumed bare-payroll share of fully burdened labor dollars'},
        'otherApplicableFactors': {'value': v(O,'O148'), 'cell': 'OCIP!O148',
            'label': v(O,'B149')},
        'experienceModifier': {'formula': "='Crew Mix'!Q11", 'cachedValue': 0.6, 'cells': ['OCIP!O146','OCIP!N16']},
        'oregonTaxFactor': {'formula': "='Crew Mix'!W11-1", 'cachedValue': -0.169, 'cell': 'OCIP!N150',
            'meaning': "Crew Mix W11 (0.831) is the post-tax retention factor; N150 = W11-1"},
    },
    'formDefaults': {
        'companyName': v(O,'E10'), 'address1': v(O,'E12'), 'address2': v(O,'E14'),
        'phoneFax': v(O,'E16'), 'federalId': v(O,'N10'), 'wcRiskId': v(O,'N12'),
        'anniversaryDate': v(O,'N14'),
        'insuranceContact': {'name': v(O,'D25'), 'phone': v(O,'D27'), 'fax': v(O,'D29'), 'email': v(O,'D31')},
        'contact2': {'name': v(O,'H25'), 'phone': v(O,'H27'), 'fax': v(O,'H29'), 'email': v(O,'H31')},
        'safetyRep': {'name': v(O,'G65'), 'address': v(O,'G66'), 'phone': v(O,'G67'), 'email': v(O,'G69')},
        'authorizedRep': {'title': v(O,'F88'), 'printedName': v(O,'F91')},
        'wcInsurer': v(O,'I133'), 'glInsurer': v(O,'J153'),
        'ocipAdmin': {'contact': v(O,'H96'), 'email': v(O,'H97')},
        'worksheetContact': {'company': v(O,'E127'), 'person': v(O,'E128'), 'phone': v(O,'E129'), 'fax': v(O,'E130'), 'contractNo': v(O,'E131')},
        'owner': v(O,'A2'),
    },
    'radioGroups': [
        {'linkCell': 'OCIP!Y18',  'question': v(O,'D19'), 'options': 4, 'current': v(O,'Y18'),
         'optionLabelsSource': 'VML shape text (not extracted); per note OCIP!I21 likely Corporation/Partnership/Sole Prop./Joint Venture'},
        {'linkCell': 'OCIP!Y50',  'question': v(O,'B49'),
         'options': [{'value':1,'label':v(O,'B50')},{'value':2,'label':v(O,'B51')},{'value':3,'label':v(O,'F50')},{'value':4,'label':v(O,'F51')}],
         'current': v(O,'Y50')},
        {'linkCell': 'OCIP!Y54',  'question': v(O,'B55'), 'options': 'Yes/No (order unverified; current=1 is first radio)', 'current': v(O,'Y54')},
        {'linkCell': 'OCIP!Y123', 'question': 'Bid type',
         'options': [{'value':1,'label':v(O,'M123')},{'value':2,'label':v(O,'M124')}], 'current': v(O,'Y123')},
        {'linkCell': 'OCIP!Y130', 'question': v(O,'L128'),
         'options': [{'value':1,'label':v(O,'M129')},{'value':2,'label':v(O,'M130')},{'value':3,'label':v(O,'M131')}], 'current': v(O,'Y130')},
        {'linkCell': 'OCIP!Y157', 'question': v(O,'B157'), 'options': 'Yes/No (order unverified; current=1 is first radio)', 'current': v(O,'Y157')},
    ],
    'outputs': {
        'totalWCCost': 'OCIP!O151', 'totalGLPremium': 'OCIP!O167', 'totalLiabilityPremium': 'OCIP!O169',
        'grandTotal': {'cell': 'OCIP!O174', 'namedRange': 'OCIP_Deduct_Total'},
    },
}

# ---------------- WORK RECOVERY ----------------
W = load('Work_Recovery')
out['workRecovery'] = {
    'rows': [
        {'row': 4,  'trade': v(W,'A4'),  'takeoffHoursFormula': W['B4']['f'],  'namedRangeGroup': 'WorkRecovery_SM'},
        {'row': 6,  'trade': v(W,'A6'),  'takeoffHoursFormula': W['B6']['f'],  'namedRangeGroup': 'WorkRecovery_SM'},
        {'row': 8,  'trade': v(W,'A8'),  'takeoffHoursFormula': W['B8']['f'],  'namedRangeGroup': 'WorkRecovery_Arch'},
        {'row': 10, 'trade': v(W,'A10'), 'takeoffHoursFormula': W['B10']['f'], 'namedRangeGroup': 'WorkRecovery_Pipe'},
        {'row': 12, 'trade': v(W,'A12'), 'takeoffHoursFormula': W['B12']['f'], 'namedRangeGroup': 'WorkRecovery_Pipe'},
    ],
    'inputs': {'ratePerHourApproved': 'D4,D6,D8,D10,D12 (blank, unlocked)', 'maxHours': 'F4,F6,F8,F10,F12 (blank, unlocked)'},
    'usedFormulaPattern': '=IF(F{r}>B{r},ROUND(D{r}*B{r},0),ROUND(D{r}*F{r},0))',
    'totalCell': "'Work Recovery'!H14",
    'namedRanges': {'WorkRecovery_SM': "'Work Recovery'!H4:H6", 'WorkRecovery_Arch': "'Work Recovery'!H8", 'WorkRecovery_Pipe': "'Work Recovery'!H10:H12"},
}

# ---------------- EMO ----------------
E = load('EMO')
out['emo'] = {
    'title': v(E,'A1'),
    'equipmentValueFormula': E['A6']['f'],
    'originalMarkupPctSource': {'formula': E['C6']['f'], 'cachedValue': v(E,'C6'), 'meaning': "MCAA RECAP G62 = Overhead & Profit %"},
    'revisedMarkupPctSource':  {'formula': E['C12']['f'], 'cachedValue': v(E,'C12'), 'meaning': "MCAA RECAP G61 = Equipment Mark Up %"},
    'outputs': {
        'originalEquipMarkup': {'cell': 'EMO!E6',  'formula': E['E6']['f']},
        'revisedEquipMarkup':  {'cell': 'EMO!E12', 'formula': E['E12']['f'], 'consumedBy': "'MCAA RECAP'!H61"},
        'delta':               {'cell': 'EMO!E18', 'formula': E['E18']['f'], 'consumedBy': "'MCAA RECAP'!M62 (message)"},
    },
}

path = f'{BASE}/specs/indirects.data.json'
json.dump(out, open(path,'w'), indent=1)
print('wrote', path, os.path.getsize(path), 'bytes')
# sanity checks against cached values
cv = 4500313.729619999
import math
def tierfee(CV, mn, mx, fee, inc):
    if CV < mn: return 0
    base = (mx-mn) if CV >= mx else (CV-mn)
    return math.ceil(base/inc)*fee
# Portland check
j = out['permits']['jurisdictions'][1]
sub = sum(tierfee(cv, t['min'], t['max'], t['fee'], t['increment']) for t in j['tiers'])
assert abs(sub-51492.88) < 0.01, sub
pr = math.ceil(sub*0.65*100)/100
mu = math.ceil((sub+pr)*0.05*100)/100
assert abs((sub+pr+mu)-89211.43) < 0.01, (sub,pr,mu)
# Bond check
sell = 4589525.159619999
brk = out['bond']['brackets']
rem_prev = 0; tot=0; cum=0
widths=[b['width'] for b in brk]; rates=[b['ratePer1000'] for b in brk]
c=[0]
for wd in widths: c.append(c[-1]+wd)
for i,(wd,rt) in enumerate(zip(widths,rates)):
    lo=c[i]; hi=c[i+1]
    if i==len(widths)-1:
        amt = 0 if sell<=lo else (sell-lo)/1000*rt
    else:
        amt = 0 if sell<=lo else ((sell-lo)/1000*rt if sell<=hi else wd/1000*rt)
    tot += math.ceil(amt)
assert tot==39018, tot
print('sanity checks passed: Portland permit total 89211.43, bond total 39018')
