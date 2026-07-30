#!/usr/bin/env python3
"""Surgical OOXML cell read/write — mirrors exactly what the JS runtime will do.
Edits only targeted <c> nodes in worksheet XML; every other zip part is copied
byte-for-byte, so macros, pivots, drawings, form controls and formatting survive."""
import re, zipfile, io

COL_RE = re.compile(r'([A-Z]+)(\d+)')
def col_num(col):
    n = 0
    for ch in col: n = n * 26 + (ord(ch) - 64)
    return n
def split_addr(a):
    m = COL_RE.match(a); return m.group(1), int(m.group(2))

def _xml_escape(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            .replace('"', '&quot;'))

def find_cell(xml, addr):
    """Return (start, end, style) of the <c r="addr" ...>...</c> node, or (None,None,style_guess)."""
    # self-closing or with children
    m = re.search(r'<c r="' + addr + r'"([^>]*?)/>', xml)
    if m:
        style = re.search(r's="(\d+)"', m.group(1))
        return m.start(), m.end(), (style.group(1) if style else None)
    m = re.search(r'<c r="' + addr + r'"([^>]*?)>.*?</c>', xml, re.S)
    if m:
        style = re.search(r's="(\d+)"', m.group(1))
        return m.start(), m.end(), (style.group(1) if style else None)
    return None, None, None

def make_cell(addr, value, style, is_bool=False):
    s_attr = f' s="{style}"' if style else ''
    if value is None or value == '':
        return f'<c r="{addr}"{s_attr}/>'
    if is_bool:
        return f'<c r="{addr}"{s_attr} t="b"><v>{1 if value else 0}</v></c>'
    if isinstance(value, bool):
        return f'<c r="{addr}"{s_attr} t="b"><v>{1 if value else 0}</v></c>'
    if isinstance(value, (int, float)):
        return f'<c r="{addr}"{s_attr}><v>{value!r}</v></c>' if isinstance(value, float) else f'<c r="{addr}"{s_attr}><v>{value}</v></c>'
    # string -> inline string (avoids sharedStrings surgery)
    return f'<c r="{addr}"{s_attr} t="inlineStr"><is><t xml:space="preserve">{_xml_escape(value)}</t></is></c>'

def set_cell(xml, addr, value, is_bool=False):
    col, row = split_addr(addr)
    start, end, style = find_cell(xml, addr)
    node = make_cell(addr, value, style, is_bool)
    if start is not None:
        return xml[:start] + node + xml[end:]
    # cell absent — insert into its row in column order (create row if needed)
    rm = re.search(r'<row r="' + str(row) + r'"([^>]*?)(/>|>)', xml)
    if not rm:
        # create the row before the closing </sheetData>; find insertion point by row order
        rows = [(int(x.group(1)), x.start()) for x in re.finditer(r'<row r="(\d+)"', xml)]
        newrow = f'<row r="{row}">{node}</row>'
        after = None
        for rnum, pos in rows:
            if rnum < row: after = None if False else pos  # track last smaller
        # insert before first row with larger number, else before </sheetData>
        larger = [pos for rnum, pos in rows if rnum > row]
        if larger:
            p = larger[0]; return xml[:p] + newrow + xml[p:]
        p = xml.find('</sheetData>'); return xml[:p] + newrow + xml[p:]
    if rm.group(2) == '/>':
        # empty self-closing row -> expand
        rowtag = rm.group(0)[:-2] + '>'
        return xml[:rm.start()] + rowtag + node + '</row>' + xml[rm.end():]
    # row has children: find its end and insert cell in column order
    row_start = rm.end()
    row_end = xml.find('</row>', row_start)
    body = xml[row_start:row_end]
    target = col_num(col)
    insert_at = len(body)
    for cm in re.finditer(r'<c r="([A-Z]+)\d+"', body):
        if col_num(cm.group(1)) > target:
            insert_at = cm.start(); break
    newbody = body[:insert_at] + node + body[insert_at:]
    return xml[:row_start] + newbody + xml[row_end:]

def get_cell(xml, addr, shared):
    """Read a cell's value: number, string (resolved via shared strings), or None."""
    start, end, _ = find_cell(xml, addr)
    if start is None: return None
    node = xml[start:end]
    t = re.search(r'\bt="([^"]+)"', node)
    typ = t.group(1) if t else None
    if typ == 'inlineStr':
        m = re.search(r'<t[^>]*>(.*?)</t>', node, re.S)
        return _unescape(m.group(1)) if m else None
    v = re.search(r'<v>(.*?)</v>', node, re.S)
    if not v: return None
    raw = v.group(1)
    if typ == 's':
        return shared[int(raw)]
    if typ == 'b':
        return raw == '1'
    if typ == 'str':
        return _unescape(raw)
    try:
        f = float(raw); return int(f) if f == int(f) else f
    except ValueError:
        return _unescape(raw)

def _unescape(s):
    return (s.replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&amp;', '&'))

def load_shared_strings(zf):
    if 'xl/sharedStrings.xml' not in zf.namelist(): return []
    xml = zf.read('xl/sharedStrings.xml').decode('utf-8')
    out = []
    for si in re.finditer(r'<si>(.*?)</si>', xml, re.S):
        body = si.group(1)
        # concatenate all <t> runs
        text = ''.join(_unescape(t.group(1)) for t in re.finditer(r'<t[^>]*>(.*?)</t>', body, re.S))
        out.append(text)
    return out

SHEET_FILE = {
    'Booking CSV': 'sheet1', 'Pivot': 'sheet2', 'QP SM Audit Trail': 'sheet3', 'SM Audit Trail': 'sheet4',
    'Phase Codes': 'sheet5', 'SM Schedule': 'sheet6', 'Work Recovery': 'sheet7', 'EMO': 'sheet8',
    'Permits': 'sheet9', 'OCIP': 'sheet10', 'Bond': 'sheet11', 'Breakdown': 'sheet12', 'Takeoff Notes': 'sheet13',
    'SM Import': 'sheet14', 'Crew Mix': 'sheet15', 'TakeOff': 'sheet16', 'MCAA RECAP': 'sheet17',
    'Proposal': 'sheet18', 'Price Breakdown': 'sheet19', 'Booking Report': 'sheet20', 'Macros': 'sheet21',
}

class Workbook:
    def __init__(self, path):
        self.zin = zipfile.ZipFile(path)
        self.names = self.zin.namelist()
        self.parts = {n: self.zin.read(n) for n in self.names}
        self.shared = load_shared_strings(self.zin)
        self.sheet_xml = {}  # title -> decoded xml (lazy)

    def _path(self, title): return f'xl/worksheets/{SHEET_FILE[title]}.xml'
    def sheet(self, title):
        if title not in self.sheet_xml:
            self.sheet_xml[title] = self.parts[self._path(title)].decode('utf-8')
        return self.sheet_xml[title]
    def set(self, title, addr, value, is_bool=False):
        self.sheet_xml[title] = set_cell(self.sheet(title), addr, value, is_bool)
    def get(self, title, addr):
        return get_cell(self.sheet(title), addr, self.shared)

    def force_recalc(self):
        wb = self.parts['xl/workbook.xml'].decode('utf-8')
        wb = re.sub(r'<calcPr[^>]*/>', '<calcPr calcId="191028" fullCalcOnLoad="1"/>', wb)
        self.parts['xl/workbook.xml'] = wb.encode('utf-8')
        # drop calcChain so Excel/LO rebuild it
        self.parts.pop('xl/calcChain.xml', None)
        if '[Content_Types].xml' in self.parts:
            ct = self.parts['[Content_Types].xml'].decode('utf-8')
            ct = ct.replace('<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/>', '')
            self.parts['[Content_Types].xml'] = ct.encode('utf-8')

    def save(self, path):
        for title, xml in self.sheet_xml.items():
            self.parts[self._path(title)] = xml.encode('utf-8')
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
            for n in self.names:
                if n in self.parts:
                    z.writestr(n, self.parts[n])
        open(path, 'wb').write(buf.getvalue())
