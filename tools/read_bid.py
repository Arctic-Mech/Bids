#!/usr/bin/env python3
"""Read a bid out of a workbook (original or website-exported) — inverse of inject.py.
Mirrors what the JS import will do."""
import json, sys
from xlsx_edit import Workbook

TAKEOFF = json.load(open('specs/takeoff.data.json'))
NUMBERED = [g for g in TAKEOFF['groups'] if g['id'] != 'CAE']
COMPANY = json.load(open('company_data.json'))

def s(v): return '' if v is None else str(v)
def n(v):
    if v is None or v == '': return None
    if isinstance(v, bool): return None
    return v

def read_bid(wb):
    bid = {}
    S = 'MCAA RECAP'
    g = lambda sheet, addr: wb.get(sheet, addr)

    bid['info'] = {
        'estNo': s(g(S, 'B7')), 'jobName': s(g(S, 'H6')), 'location': s(g(S, 'H7')),
        'projectType': s(g(S, 'N5')) or 'Commercial',
        'projectSqFt': n(g(S, 'N6')), 'materialLbs': n(g(S, 'N7')),
        'bidDate': '', 'bidTime': '', 'address': '', 'city': '', 'state': '', 'zip': '',
        'jobNumber': s(g('Booking Report', 'F2')),
    }
    mods = lambda col, rows: [n(g(S, f'{col}{r}')) or 0 for r in rows]
    bid['recap'] = {
        'scheduleType': s(g(S, 'C17')) or "5 8's",
        'lop58': n(g(S, 'O21')) or 0,
        'mods': {
            'plumb': mods('B', range(12, 17)), 'pipe': mods('C', range(12, 17)),
            'sm': mods('D', range(12, 17)), 'shop': mods('I', range(12, 18)),
        },
        'archHrsInSM': n(g(S, 'D27')) or 0,
        'ocipToggle': s(g(S, 'B26')) or 'No OCIP',
        'subs': [
            {'name': COMPANY['subRows'][0]['name'], 'fixedCode': '7-03', 'desc': '', 'qp': s(g(S, 'I36')), 'value': n(g(S, 'J36'))},
        ] + [
            {'name': s(g(S, f'B{36+k}')), 'fixedCode': None, 'desc': '', 'qp': s(g(S, f'I{36+k}')), 'value': n(g(S, f'J{36+k}'))}
            for k in range(1, 9)
        ],
        'supPct': [n(g(S, f'E{48+i}')) or 0 for i in range(5)],
        'miscContingency': n(g(S, 'H65')), 'bondRequired': s(g(S, 'A66')) or 'No',
        'taxType': s(g(S, 'E68')) or 'Oregon CAT Tax', 'addDeduct': n(g(S, 'I69')),
        'subMarkup': n(g(S, 'G60')) or 0, 'equipMarkup': n(g(S, 'G61')) or 0, 'ohp': n(g(S, 'G62')) or 0,
        'permitsManual': {k: n(g(S, f'J{row}')) for k, row in
                          [('plumbing', 77), ('hvac', 78), ('medGas', 79), ('boiler', 80), ('specialInsp', 81)]},
        'trucking': {'hrs': n(g(S, 'E81')), 'loads': n(g(S, 'F81')), 'rate': None},
        'gc': {
            'safetyPct': n(g(S, 'G78')) or 0, 'smallToolsPct': n(g(S, 'G79')) or 0,
            'freightPct': n(g(S, 'G80')) or 0, 'miscPct': n(g(S, 'G106')) or 0,
            'rows': {}, 'labels': {},
        },
        'equipment': [], 'equipmentNames': [],
        'storedTotal': n(g(S, 'N70')), 'storedAt': None,
    }
    # GC rows 82-105
    for i, gr in enumerate(COMPANY['gcRows']):
        row = 82 + i
        key = gr['key']
        entry = {}
        if key == 'cadOperator':
            q, d = n(g(S, 'D102')), n(g(S, 'E102'))
            if q is not None: entry['qty'] = q
            if d is not None: entry['dur'] = d
        else:
            q = n(g(S, f'F{row}'))
            if q is not None: entry['qty'] = q
        # rate: read only if row is a plain-value rate column (defaults captured as overrides is safe: same math)
        rate = n(g(S, f'G{row}'))
        if rate is not None and gr.get('rateFrom') != 'journeyman':
            entry['rate'] = rate
        if entry: bid['recap']['gc']['rows'][key] = entry
        if gr.get('editableLabel'):
            lbl = s(g(S, f'B{row}'))
            if lbl and lbl != gr['label']: bid['recap']['gc']['labels'][key] = lbl
    # equipment 114-129
    for i in range(16):
        row = 114 + i
        bid['recap']['equipment'].append({'qty': n(g(S, f'G{row}')), 'dur': n(g(S, f'H{row}')), 'rate': n(g(S, f'I{row}'))})
        nm = s(g(S, f'B{row}')) if row >= 127 else ''
        bid['recap']['equipmentNames'].append(nm)

    # crew mix
    C = 'Crew Mix'
    def qty(rows): return [n(g(C, f'C{r}')) or 0 for r in rows]
    bid['crewMix'] = {
        'smField': {'qty': qty(range(11, 20)), 'pfST': n(g(C, 'H9')), 'pfOT': None, 'pfDT': None},
        'smShop': {'qty': qty(range(74, 83)), 'pfST': n(g(C, 'H72')), 'pfOT': None, 'pfDT': None,
                   'burdenST': n(g(C, 'I85')), 'burdenOT': None, 'burdenDT': None},
        'plumberFitter': {'qty': qty(range(137, 145)), 'pfST': n(g(C, 'H135')), 'pfOT': None, 'pfDT': None},
    }

    # takeoff
    groups = []
    for tg in NUMBERED:
        hdr = tg['headerRow']
        name = s(g('TakeOff', f'D{hdr+2}'))
        typ = s(g('TakeOff', f'F{hdr}'))
        exc = g('TakeOff', f'K{hdr}')
        items = []
        for row in range(tg['itemsStart'], tg['itemsEnd'] + 1):
            it = {
                'matPhase': s(g('TakeOff', f'A{row}')), 'shopPhase': s(g('TakeOff', f'B{row}')),
                'fieldPhase': s(g('TakeOff', f'C{row}')), 'desc': s(g('TakeOff', f'D{row}')),
                'qty': n(g('TakeOff', f'E{row}')) if n(g('TakeOff', f'E{row}')) is not None else '',
                'fUnit': n(g('TakeOff', f'F{row}')) if n(g('TakeOff', f'F{row}')) is not None else '',
                'fMult': n(g('TakeOff', f'G{row}')) if n(g('TakeOff', f'G{row}')) is not None else '',
                'sUnit': n(g('TakeOff', f'I{row}')) if n(g('TakeOff', f'I{row}')) is not None else '',
                'sMult': n(g('TakeOff', f'J{row}')) if n(g('TakeOff', f'J{row}')) is not None else '',
                'mUnit': n(g('TakeOff', f'L{row}')) if n(g('TakeOff', f'L{row}')) is not None else '',
                'notes': s(g('TakeOff', f'N{row}')), 'emo': s(g('TakeOff', f'P{row}')),
                'ot': s(g('TakeOff', f'Q{row}')), 'shift': s(g('TakeOff', f'R{row}')),
            }
            items.append(it)
        # trim trailing empty items
        def empty(it): return not any([it['matPhase'], it['shopPhase'], it['fieldPhase'], it['desc'],
                                        it['qty'] != '', it['fUnit'] != '', it['sUnit'] != '', it['mUnit'] != '', it['notes']])
        while items and empty(items[-1]): items.pop()
        if name or typ or items or exc:
            groups.append({'id': tg['id'], 'name': name, 'type': typ, 'exclude': bool(exc), 'items': items})
    bid['takeoff'] = {'caeType': s(g('TakeOff', 'F9')), 'groups': groups}

    # sm import rows 9..80
    rows = []
    for rr in range(9, 81):
        row = {
            'floor': s(g('SM Import', f'A{rr}')), 'service': s(g('SM Import', f'B{rr}')),
            'type': s(g('SM Import', f'C{rr}')), 'material': s(g('SM Import', f'D{rr}')),
            'cutType': s(g('SM Import', f'E{rr}')),
            'qty': n(g('SM Import', f'F{rr}')) if n(g('SM Import', f'F{rr}')) is not None else '',
            'fieldHoursRaw': n(g('SM Import', f'G{rr}')) if n(g('SM Import', f'G{rr}')) is not None else '',
            'shopHoursRaw': n(g('SM Import', f'I{rr}')) if n(g('SM Import', f'I{rr}')) is not None else '',
            'materialCost': n(g('SM Import', f'K{rr}')) if n(g('SM Import', f'K{rr}')) is not None else '',
            'fieldPct': '', 'shopPct': '',
        }
        if any([row['type'], row['material'], row['qty'] != '', row['fieldHoursRaw'] != '', row['materialCost'] != '']):
            rows.append(row)
    bid['smImport'] = {'rows': rows}

    # work recovery
    wrmap = [('smField', 4), ('smShop', 6), ('arch', 8), ('plumber', 10), ('fitter', 12)]
    bid['workRecovery'] = {}
    for key, row in wrmap:
        e = {}
        rate, mx = n(g('Work Recovery', f'D{row}')), n(g('Work Recovery', f'F{row}'))
        if rate is not None: e['rate'] = rate
        if mx is not None: e['maxHrs'] = mx
        bid['workRecovery'][key] = e

    # permits
    selmap = {1: 'portland', 2: 'hillsboro', 3: 'clackamas', 4: 'custom', 5: 'none', 6: 'tualatin', 0: 'none'}
    sel = g('Permits', 'R1')
    tiers = []
    for i in range(5):
        rr = 25 + i
        tiers.append({'min': n(g('Permits', f'K{rr}')) if i > 0 else 0,
                      'max': n(g('Permits', f'L{rr}')), 'fee': n(g('Permits', f'M{rr}')), 'inc': n(g('Permits', f'N{rr}'))})
    bid['permitCalc'] = {'selection': selmap.get(int(sel) if sel is not None else 5, 'none'),
                         'custom': {'tiers': tiers, 'planReviewPct': n(g('Permits', 'P33')) or 0.65,
                                    'markupPct': n(g('Permits', 'P35')) or 0.05}}
    bid['meta'] = {'rev': 1}
    return bid

if __name__ == '__main__':
    wb = Workbook(sys.argv[1] if len(sys.argv) > 1 else 'workbook.xlsm')
    bid = read_bid(wb)
    json.dump(bid, open(sys.argv[2] if len(sys.argv) > 2 else 'readback_bid.json', 'w'), indent=1)
    print('groups:', len(bid['takeoff']['groups']), '| est:', bid['info']['estNo'], '| job:', bid['info']['jobName'])
