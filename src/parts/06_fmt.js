// ============================================================
// Number formatting (mirrors the workbook's cell formats)
// ============================================================
'use strict';

const fmt = {
  money(v, dec = 2) {
    if (v === null || v === undefined || v === '' || isNaN(v)) return '';
    const n = Number(v);
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return n < 0 ? '($' + s + ')' : '$' + s;
  },
  num(v, dec = 2) {
    if (v === null || v === undefined || v === '' || isNaN(v)) return '';
    return Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  },
  hrs(v) { return this.num(v, 2); },
  int(v) { return this.num(v, 0); },
  pct(v, dec = 1) {
    if (v === null || v === undefined || v === '' || isNaN(v)) return '';
    return (Number(v) * 100).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
  },
  date(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
  },
  dateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return this.date(iso) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  },
  // parse user numeric input: strip $ , % and spaces; '' -> null
  parseNum(str) {
    if (str === null || str === undefined) return null;
    const s = String(str).replace(/[$,%\s]/g, '');
    if (s === '') return null;
    const n = Number(s);
    return isNaN(n) ? null : n;
  },
};

// SpellNumber — faithful port of the workbook's VBA Functions.SpellNumber.
// Quirks reproduced on purpose so the printed proposal matches the spreadsheet
// character for character: GetTens keeps a trailing space on 20/30/.../90, which
// is why 4,614,770 spells "...Seven Hundred Seventy  Dollars" (two spaces); zero
// cents reads " and No Cents"; an empty dollar part reads "No Dollars".
function spellNumber(amount) {
  const getDigit = (d) => ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'][Number(d) || 0] || '';
  const getTens = (txt) => {
    const s = String(txt);
    if (Number(s[0]) === 1) {                     // 10..19
      return ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'][Number(s.slice(0, 2)) - 10] || '';
    }
    const t = ['', '', 'Twenty ', 'Thirty ', 'Forty ', 'Fifty ', 'Sixty ', 'Seventy ', 'Eighty ', 'Ninety '][Number(s[0]) || 0] || '';
    return t + getDigit(s.slice(-1));             // trailing space survives when ones = 0
  };
  const getHundreds = (num) => {
    if (!Number(num)) return '';
    const s = ('000' + num).slice(-3);
    let out = '';
    if (s[0] !== '0') out = getDigit(s[0]) + ' Hundred ';
    out += s[1] !== '0' ? getTens(s.slice(1)) : getDigit(s[2]);
    return out;
  };
  const place = ['', '', ' Thousand ', ' Million ', ' Billion ', ' Trillion '];
  // VBA: MyNumber = Trim(Str(MyNumber)) — Str() prints no trailing zeros
  let my = String(Math.abs(Number(amount) || 0));
  let cents = '';
  const dot = my.indexOf('.');
  if (dot >= 0) {
    cents = getTens((my.slice(dot + 1) + '00').slice(0, 2));
    my = my.slice(0, dot);
  }
  let dollars = '', count = 1;
  while (my !== '') {
    const temp = getHundreds(my.slice(-3));
    if (temp !== '') dollars = temp + (place[count] || '') + dollars;
    my = my.length > 3 ? my.slice(0, -3) : '';
    count++;
  }
  dollars = dollars === '' ? 'No Dollars' : dollars === 'One' ? 'One Dollar' : dollars + ' Dollars';
  cents = cents === '' ? ' and No Cents' : cents === 'One' ? ' and One Cent' : ' and ' + cents + ' Cents';
  return dollars + cents;
}
