#!/usr/bin/env python3
"""Generate sm-import-schedule.data.json from the raw extract JSONs.
Headers/labels/literals are pulled programmatically from the extracts;
VBA-derived import mappings are transcribed from vba_ImportTSI/ImportQPSM."""
import json, re, os

BASE = os.path.dirname(os.path.abspath(__file__))
EX = os.path.join(BASE, '..', 'extract')

def load(name):
    return json.load(open(os.path.join(EX, name)))

def colnum(c):
    n = 0
    for ch in c:
        n = n * 26 + ord(ch) - 64
    return n

def row_values(cells, row):
    """Return {col: value} for a given row, ordered by column."""
    out = {}
    for addr, c in cells.items():
        m = re.match(r'^([A-Z]+)(\d+)$', addr)
        if m and int(m.group(2)) == row and c and 'v' in c and c['v'] is not None:
            out[m.group(1)] = c['v']
    return dict(sorted(out.items(), key=lambda kv: colnum(kv[0])))

data = {}

# ---------------- SM Import ----------------
smi = load('SM_Import.json')['cells']
data['smImport'] = {
    'headerRow': 8,
    'firstDataRow': 9,
    'namedRangeLastRow': 78,   # SMImport_* saved as $9:$78; dynamic in Excel (VBA SetImportRanges)
    'columns': row_values(smi, 8),
    'totalsRow7': {addr: {'f': c['f'], 'nf': c.get('nf')} for addr, c in smi.items()
                   if addr.endswith('7') and c.get('f')},
    'rowFormulas': {a: smi[a]['f'] for a in ['H9', 'J9', 'L9', 'M9', 'N9', 'O9']},
    'unlockedCols': [a[0] for a in ['L9', 'N9'] if smi[a].get('locked') is False],
    'namedRanges': {
        'SMImport_Type': "'SM Import'!$C$9:$C$78",
        'SMImport_Material': "'SM Import'!$D$9:$D$78",
        'SMImport_CutType': "'SM Import'!$E$9:$E$78",
        'SMImport_Qty': "'SM Import'!$F$9:$F$78",
        'SMImport_CalcFieldHours': "'SM Import'!$H$9:$H$78",
        'SMImport_CalcShopHours': "'SM Import'!$J$9:$J$78",
        'SMImport_MaterialCost': "'SM Import'!$K$9:$K$78",
        'CAE_Field_Hours_Total': "'SM Import'!$H$7",
        'CAE_Shop_Hours_Total': "'SM Import'!$J$7",
        'CAE_Material_Cost_Total': "'SM Import'!$K$7",
    },
}

# ---------------- SM Audit Trail (TSI export schema) ----------------
sat = load('SM_Audit_Trail.json')['cells']
data['tsiAuditTrail'] = {
    'sheet': 'SM Audit Trail',
    'headerRow': 1,
    'columns': row_values(sat, 1),
    'sourceFile': r'C:\MAP-Software\EST\Exports\FESTR.txt',
    'delimiters': ['tab', 'comma'], 'textQualifier': '"',
}

# ---------------- QP SM Audit Trail (QuotePro export schema) ----------------
qat = load('QP_SM_Audit_Trail.json')['cells']
data['qpAuditTrail'] = {
    'sheet': 'QP SM Audit Trail',
    'headerRow': 1,
    'columns': row_values(qat, 1),
    'sourceFile': r'C:\MAP-Software\EST\Exports\FESTR_QP.txt',
    'delimiters': ['tab', 'comma'], 'textQualifier': '"',
}

# ---------------- Pivot sheet cached labels ----------------
piv = load('Pivot.json')['cells']
data['pivotSheetLabels'] = {a: c['v'] for a, c in sorted(piv.items(), key=lambda kv: (int(re.search(r'\d+', kv[0]).group()), colnum(re.match(r'[A-Z]+', kv[0]).group())))
                            if c and 'v' in c}

# Pivot table definitions (reconstructed from sheet labels + VBA)
data['pivotTables'] = {
    'All Material': {
        'source': 'SM Audit Trail', 'filter': 'Bought Out',
        'rows': ['Section', 'Service', 'Service Type', 'Material', 'Cut Type'],
        'values': ['Sum of Qty', 'Sum of Install Hours', 'Sum of Fab Hours',
                   'Sum of Total Material Cost', 'Sum of Ext Wrap Area', 'Sum of Ext Wrap Cost'],
        'anchor': 'Pivot!A1',
    },
    'QP All': {
        'source': 'QP SM Audit Trail', 'filter': 'Labor Type',
        'rows': ['Service Type', 'Material', 'Shape', 'Cut Type'],
        'values': ['Sum of Material Cost', 'Sum of Labor Hours', 'Sum of Qty'],
        'anchor': 'Pivot!M1',
    },
    'QP Wrap': {
        'source': 'QP SM Audit Trail', 'filter': 'Cut Type (=Wrap)',
        'values': ['Sum of Material Cost', 'Sum of Area'],
        'anchor': 'Pivot!V1',
    },
}

# ---------------- VBA import mappings (from vba_ImportTSI.bas / vba_ImportQPSM.bas) ----
data['importMappings'] = {
    'TSI': {  # Import_TSI: pivot 'All Material' field -> SM Import column
        'Section': 'A', 'Service': 'B', 'Service Type': 'C', 'Material': 'D',
        'Cut Type': 'E', 'Sum of Qty': 'F', 'Sum of Install Hours': 'G',
        'Sum of Fab Hours': 'I', 'Sum of Total Material Cost': 'K',
        'fillDownBlanks': ['A', 'B', 'C', 'D', 'E'],
        'extInsulNames': {'Ext_Insul': 'Sum of Ext Wrap Area', 'Ext_Insul_Cost': 'Sum of Ext Wrap Cost'},
        'replacements': [{'find': 'Spiral Straight', 'replace': 'Decoiled Straight', 'match': 'part'}],
    },
    'QP': {   # Import_QP: pivot 'QP All' field -> SM Import column (appended below TSI rows)
        'Floor': 'A', 'Service Type': 'B', 'Shape': 'C', 'Material': 'D',
        'Cut Type': 'E',
        'Sum Of Qty (Labor Type=Field)': 'F',
        'Sum of Labor Hours (Labor Type=Field)': 'G',
        'Sum of Labor Hours (Labor Type=Shop)': 'I',
        'Sum of Material Cost (Labor Type all except blank/N-A)': 'K',
        'fillDownBlanks': ['A', 'B', 'C', 'D', 'E'],
        'extInsulNames': {'Ext_Insul': 'QP Wrap: Sum of Area (Cut Type=Wrap)',
                          'Ext_Insul_Cost': 'QP Wrap: Sum of Material Cost (Cut Type=Wrap)'},
        'replacements': [
            {'find': '3003H14Aluminum', 'replace': 'Alum', 'match': 'whole'},
            {'find': 'Flex Connector', 'replace': 'Canvas Connector', 'match': 'whole'},
        ],
        'rowFixups': [
            "If col E == 'Hanger' or 'Canvas Connector': shift that cell left into D (row has no Cut Type)",
            "If col C (Material) is 0/empty: set to 'N/A'",
        ],
    },
    'common': {
        'deleteBlankToken': '(blank)',   # Delete_Blank: replace '(blank)' with '' everywhere
        'appendBehavior': 'QP import appends at first empty row of each column (NextOpenCell)',
    },
}

# ---------------- SM Schedule ----------------
sch = load('SM_Schedule.json')
cells = sch['cells']
packages = []
for i in range(19):
    hdr = 4 + 11 * i
    c = cells.get(f'C{hdr}') or {}
    packages.append({'index': i + 1, 'headerRow': hdr, 'taskRows': [hdr + 1, hdr + 10],
                     'nameFormula': c.get('f'), 'cachedName': c.get('v')})
weekHdr = {}
for a, c in cells.items():
    m = re.match(r'^([A-Z]+)3$', a)
    if m and c.get('f'):
        weekHdr[m.group(1)] = c['f']
data['smSchedule'] = {
    'grid': {'packages': 19, 'tasksPerPackage': 10, 'rowBlock': 11,
             'firstPackageRow': 4, 'lastRow': 212,
             'weeks': 48, 'dayColumns': ['M', 'IR'], 'workdaysPerWeek': 5},
    'packages': packages,
    'statusOptions': ['Not Started', 'In Progress', 'Completed'],  # validation on G4:G522 (Excel list keeps leading spaces; trim in app)
    'anchorFormulaM3': cells['M3']['f'],
    'weekHeaderFormulas': dict(sorted(weekHdr.items(), key=lambda kv: colnum(kv[0]))[:3]),
    'projectNameFormulaA1': cells['A1']['f'],
    'comments': {
        'M1': 'Any entered date becomes first date displayed in Gantt below. Leave blank to use earliest task start date as beginning. If you enter manual date enter a date that is on a Monday for the weeks to work properly.',
        'L3': 'Assumes 5 work days per calendar week',
    },
    'hiddenCols': ['G', 'H', 'J', 'K'],
    'columnRoles': {
        'A': 'WBS number (locked literals: pkg n, tasks n.1..n.9, n.10 shown via nf 0.00)',
        'C': 'Task description (pkg row = Breakdown!A9+i formula; task rows unlocked, default "Task A".."Task J")',
        'D': 'MAN POWER (user input, informational)',
        'E': 'Planned start date (task rows input; pkg row =IF(E+1="","",MIN(tasks)))',
        'F': 'Planned finish date (task rows input; pkg row =MAX(tasks))',
        'G': 'STATUS (hidden; dropdown)', 'H': 'ACTUAL FINISH DATE (hidden; input)',
        'I': 'NOTES (input)',
        'J': 'Cal Start helper (hidden) =IF(E="","",E-$M$3+1); pkg row =MIN(block)',
        'K': 'Cal End helper (hidden) =IF(F="","",F-$M$3+1); pkg row =MAX(block)',
        'L': 'Work Days =SUM(M:IR row)',
        'M..IR': 'Gantt cells =IF(AND(day#>=$J,day#<=$K),1,"")',
    },
    'dayNumbering': 'Row 2: M..Q = 1..5; each new week jumps +3 over the weekend (R2=Q2+3, then +1) so numbers are calendar-day offsets from the anchor Monday; 48 week headers in row 3 (M3 anchor, each merged over 5 cols, +7 days)',
}

# ---------------- Job-name sanitisation (Yes_No_Import_New_Job) ----------------
data['jobNameSanitize'] = {
    '/': '-', '.': '_', '\\': '-', '"': '-', '|': '-', '[': '-', ']': '-', '{': '-', '}': '-',
}

out = os.path.join(BASE, 'sm-import-schedule.data.json')
json.dump(data, open(out, 'w'), indent=1)
print('wrote', out, os.path.getsize(out), 'bytes')
