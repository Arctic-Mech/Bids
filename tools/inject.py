#!/usr/bin/env python3
"""Inject a bid (website JSON model) into the workbook template via surgical cell edits.
Shared by validation (here) and mirrored by the JS runtime. Also emits cellmap.json."""
import json, re, sys
from xlsx_edit import Workbook, col_num

TAKEOFF = json.load(open('specs/takeoff.data.json'))
GROUPS = TAKEOFF['groups']            # includes CAE first, then 1..31
NUMBERED = [g for g in GROUPS if g['id'] != 'CAE']

def num(v):
    if v is None or v == '': return None
    try:
        f = float(v); return int(f) if f == int(f) else f
    except (ValueError, TypeError): return None

def inject(wb, bid, blank=True):
    r = bid['recap']; info = bid['info']

    # ---------- blank all input regions first (no Dalles leakage) ----------
    if blank:
        blank_all(wb)

    # ---------- MCAA RECAP scalars ----------
    S = 'MCAA RECAP'
    wb.set(S, 'B7', info.get('estNo') or None)
    wb.set(S, 'H6', info.get('jobName') or None)
    wb.set(S, 'H7', info.get('location') or None)
    wb.set(S, 'N5', info.get('projectType') or None)
    wb.set(S, 'N6', num(info.get('projectSqFt')))
    wb.set(S, 'N7', num(info.get('materialLbs')))
    wb.set(S, 'C17', r['scheduleType'])
    wb.set(S, 'O21', num(r.get('lop58')) or 0)
    wb.set(S, 'B26', r['ocipToggle'])
    wb.set(S, 'D27', num(r.get('archHrsInSM')) or 0)
    wb.set(S, 'A66', r['bondRequired'])
    wb.set(S, 'E68', r['taxType'])
    wb.set(S, 'G60', num(r.get('subMarkup')))
    wb.set(S, 'G61', num(r.get('equipMarkup')))
    wb.set(S, 'G62', num(r.get('ohp')))
    wb.set(S, 'H65', num(r.get('miscContingency')))
    wb.set(S, 'I69', num(r.get('addDeduct')))
    # modifiers rows 12-16
    for i in range(5):
        wb.set(S, f'B{12+i}', num(r['mods']['plumb'][i]))
        wb.set(S, f'C{12+i}', num(r['mods']['pipe'][i]))
        wb.set(S, f'D{12+i}', num(r['mods']['sm'][i]))
        wb.set(S, f'I{12+i}', num(r['mods']['shop'][i]))
    wb.set(S, 'I17', num(r['mods']['shop'][5]))   # shop LOP
    # supervision E48:E52
    for i in range(5): wb.set(S, f'E{48+i}', num(r['supPct'][i]))
    # subs: [0]->J36; [k>=1]-> row 36+k
    subs = r['subs']
    if subs:
        wb.set(S, 'J36', num(subs[0].get('value')))
        wb.set(S, 'I36', subs[0].get('qp') or None)
    for k in range(1, len(subs)):
        row = 36 + k
        if row > 44: break
        wb.set(S, f'B{row}', subs[k].get('name') or None)
        wb.set(S, f'I{row}', subs[k].get('qp') or None)
        wb.set(S, f'J{row}', num(subs[k].get('value')))
    # GC block: safety/smalltools/freight/misc + trucking
    wb.set(S, 'G78', num(r['gc']['safetyPct']))
    wb.set(S, 'G79', num(r['gc']['smallToolsPct']))
    wb.set(S, 'G80', num(r['gc']['freightPct']))
    wb.set(S, 'G106', num(r['gc']['miscPct']))
    wb.set(S, 'E81', num(r['trucking'].get('hrs')))
    wb.set(S, 'F81', num(r['trucking'].get('loads')))
    if r['trucking'].get('rate') is not None: wb.set(S, 'G81', num(r['trucking']['rate']))
    # permits manual J77:J81
    pm = r['permitsManual']
    for key, row in [('plumbing', 77), ('hvac', 78), ('medGas', 79), ('boiler', 80), ('specialInsp', 81)]:
        wb.set(S, f'J{row}', num(pm.get(key)))
    # GC rows 82-105 (24 gcRows)
    GCROWS = json.load(open('company_data.json'))['gcRows']
    for i, gr in enumerate(GCROWS):
        row = 82 + i
        key = gr['key']
        rowdata = r['gc'].get('rows', {}).get(key, {}) or {}
        if key == 'cadOperator':
            wb.set(S, 'D102', num(rowdata.get('qty')))
            wb.set(S, 'E102', num(rowdata.get('dur')))
        else:
            wb.set(S, f'F{row}', num(rowdata.get('qty')))
        if rowdata.get('rate') is not None:
            wb.set(S, f'G{row}', num(rowdata['rate']))
        if gr.get('editableLabel'):
            lbl = (r['gc'].get('labels', {}) or {}).get(key)
            if lbl: wb.set(S, f'B{row}', lbl)
    # equipment rows 114-129
    for i, e in enumerate(r['equipment']):
        row = 114 + i
        wb.set(S, f'G{row}', num(e.get('qty')))
        wb.set(S, f'H{row}', num(e.get('dur')))
        if e.get('rate') is not None: wb.set(S, f'I{row}', num(e['rate']))
    for i, nm in enumerate(r.get('equipmentNames', []) or []):
        if nm and 114 + i >= 127: wb.set(S, f'B{114+i}', nm)

    # ---------- Crew Mix ----------
    C = 'Crew Mix'
    cm = bid['crewMix']
    for i, q in enumerate(cm['smField']['qty']): wb.set(C, f'C{11+i}', num(q) or 0)
    for i, q in enumerate(cm['smShop']['qty']): wb.set(C, f'C{74+i}', num(q) or 0)
    for i, q in enumerate(cm['plumberFitter']['qty']): wb.set(C, f'C{137+i}', num(q) or 0)
    # period factors — write resolved value for ST (plain cell); OT/DT only if override
    def pf(section, base_default):
        d = cm[section]
        st = d.get('pfST'); return st if st is not None else base_default
    wb.set(C, 'H9', pf('smField', 0.055))
    wb.set(C, 'H72', pf('smShop', 0.055))
    wb.set(C, 'H135', pf('plumberFitter', 0.06))
    for section, otc, dtc in [('smField', 'H30', 'H51'), ('smShop', 'H93', 'H114'), ('plumberFitter', 'H155', 'H175')]:
        if cm[section].get('pfOT') is not None: wb.set(C, otc, num(cm[section]['pfOT']))
        if cm[section].get('pfDT') is not None: wb.set(C, dtc, num(cm[section]['pfDT']))
    if cm['smShop'].get('burdenST') is not None: wb.set(C, 'I85', num(cm['smShop']['burdenST']))
    if cm['smShop'].get('burdenOT') is not None: wb.set(C, 'I106', num(cm['smShop']['burdenOT']))
    if cm['smShop'].get('burdenDT') is not None: wb.set(C, 'I127', num(cm['smShop']['burdenDT']))

    # ---------- TakeOff ----------
    T = 'TakeOff'
    wb.set(T, 'F9', bid['takeoff'].get('caeType') or None)
    for gi, g in enumerate(bid['takeoff']['groups']):
        if gi >= len(NUMBERED): break   # overflow: too many groups
        tg = NUMBERED[gi]
        hdr = tg['headerRow']; namerow = hdr + 2
        wb.set(T, f'F{hdr}', g.get('type') or None)
        wb.set(T, f'K{hdr}', bool(g.get('exclude')), is_bool=True)
        wb.set(T, f'D{namerow}', g.get('name') or None)
        rows = list(range(tg['itemsStart'], tg['itemsEnd'] + 1))
        for ii, it in enumerate(g['items']):
            if ii >= len(rows): break   # overflow: too many items in group
            row = rows[ii]
            wb.set(T, f'A{row}', it.get('matPhase') or None)
            wb.set(T, f'B{row}', it.get('shopPhase') or None)
            wb.set(T, f'C{row}', it.get('fieldPhase') or None)
            wb.set(T, f'D{row}', it.get('desc') or None)
            wb.set(T, f'E{row}', num(it.get('qty')))
            wb.set(T, f'F{row}', num(it.get('fUnit')))
            if it.get('fMult') not in (None, ''): wb.set(T, f'G{row}', num(it.get('fMult')))
            wb.set(T, f'I{row}', num(it.get('sUnit')))
            if it.get('sMult') not in (None, ''): wb.set(T, f'J{row}', num(it.get('sMult')))
            wb.set(T, f'L{row}', num(it.get('mUnit')))
            wb.set(T, f'N{row}', it.get('notes') or None)
            wb.set(T, f'P{row}', it.get('emo') or None)
            wb.set(T, f'Q{row}', it.get('ot') or None)
            wb.set(T, f'R{row}', it.get('shift') or None)

    # ---------- SM Import ----------
    SI = 'SM Import'
    for i, row in enumerate(bid['smImport']['rows']):
        rr = 9 + i
        wb.set(SI, f'A{rr}', row.get('floor') or None)
        wb.set(SI, f'B{rr}', row.get('service') or None)
        wb.set(SI, f'C{rr}', row.get('type') or None)
        wb.set(SI, f'D{rr}', row.get('material') or None)
        wb.set(SI, f'E{rr}', row.get('cutType') or None)
        wb.set(SI, f'F{rr}', num(row.get('qty')))
        wb.set(SI, f'G{rr}', num(row.get('fieldHoursRaw')))
        wb.set(SI, f'I{rr}', num(row.get('shopHoursRaw')))
        wb.set(SI, f'K{rr}', num(row.get('materialCost')))
        wb.set(SI, f'L{rr}', num(row.get('fieldPct')) if row.get('fieldPct') not in (None, '') else 1)
        wb.set(SI, f'N{rr}', num(row.get('shopPct')) if row.get('shopPct') not in (None, '') else 1)

    # ---------- Work Recovery ----------
    WR = 'Work Recovery'
    for key, row in [('smField', 4), ('smShop', 6), ('arch', 8), ('plumber', 10), ('fitter', 12)]:
        w = bid.get('workRecovery', {}).get(key, {}) or {}
        if w.get('rate') is not None: wb.set(WR, f'D{row}', num(w['rate']))
        if w.get('maxHrs') is not None: wb.set(WR, f'F{row}', num(w['maxHrs']))

    # ---------- Permits ----------
    P = 'Permits'
    selmap = {'none': 5, 'portland': 1, 'hillsboro': 2, 'clackamas': 3, 'custom': 4, 'tualatin': 6}
    wb.set(P, 'R1', selmap.get(bid['permitCalc']['selection'], 5))
    cu = bid['permitCalc']['custom']
    for i, t in enumerate(cu['tiers']):
        rr = 25 + i
        if i > 0: wb.set(P, f'K{rr}', num(t['min']))
        wb.set(P, f'L{rr}', num(t['max']))
        wb.set(P, f'M{rr}', num(t['fee']))
        wb.set(P, f'N{rr}', num(t['inc']))
    wb.set(P, 'P33', num(cu['planReviewPct']))
    wb.set(P, 'P35', num(cu['markupPct']))


def blank_all(wb):
    """Clear every input region so no template (Dalles) data leaks into an injected bid."""
    unlocked = json.load(open('unlocked_cells.json'))
    # skip formula-default cells (preserve their template formula unless we overwrite)
    keep_formula = {
        'Crew Mix': {'H30', 'H51', 'H72', 'H93', 'H114', 'H155', 'H175', 'I106', 'I127'},
        'MCAA RECAP': {'G81', 'G98', 'G100', 'G102'},
        'SM Import': {'L9', 'N9'},
        'OCIP': {'E8'},
        'Proposal': {'D39'},
    }
    for title, cells in unlocked.items():
        kf = keep_formula.get(title, set())
        for coord, t in cells:
            if t == 'F' and coord in kf: continue
            wb.set(title, coord, None)
    # TakeOff full item grid + headers (clear Dalles rows)
    for tg in NUMBERED:
        hdr = tg['headerRow']
        wb.set('TakeOff', f'F{hdr}', None); wb.set('TakeOff', f'K{hdr}', None); wb.set('TakeOff', f'D{hdr+2}', None)
        for row in range(tg['itemsStart'], tg['itemsEnd'] + 1):
            for col in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'J', 'L', 'N', 'P', 'Q', 'R']:
                wb.set('TakeOff', f'{col}{row}', None)
    wb.set('TakeOff', 'F9', None)
    # SM Import grid rows 9..80
    for rr in range(9, 81):
        for col in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'K']:
            wb.set('SM Import', f'{col}{rr}', None)
    # Work Recovery inputs
    for row in [4, 6, 8, 10, 12]:
        wb.set('Work Recovery', f'D{row}', None); wb.set('Work Recovery', f'F{row}', None)


if __name__ == '__main__':
    bid = json.load(open(sys.argv[2] if len(sys.argv) > 2 else 'test/seed_bid.json'))
    wb = Workbook('workbook.xlsm')
    inject(wb, bid)
    wb.force_recalc()
    wb.save(sys.argv[1] if len(sys.argv) > 1 else 'injected.xlsm')
    print('wrote', sys.argv[1] if len(sys.argv) > 1 else 'injected.xlsm')
