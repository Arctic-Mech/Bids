// ---------- Minimal PDF writer (no dependencies) ----------
// Generates PDF 1.4 documents with Helvetica text, vector lines/rects,
// JPEG images, multi-page support, and a proper embedded-file attachment
// (bid JSON) so exported PDFs can be re-imported losslessly.
'use strict';

const PDF_FONTS = {
  helv: { base: 'Helvetica', widths: null },
  helvB: { base: 'Helvetica-Bold', widths: null },
  helvO: { base: 'Helvetica-Oblique', widths: null },
  helvBO: { base: 'Helvetica-BoldOblique', widths: null },
};

// Helvetica AFM widths (per 1000 units) for WinAnsi chars 32..255 (subset: 32..126 + common)
const HELV_W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELV_BW = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function textWidth(str, size, bold) {
  const W = bold ? HELV_BW : HELV_W;
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    w += (c >= 32 && c <= 126) ? W[c - 32] : 556;
  }
  return w * size / 1000;
}

// Shorten a string with an ellipsis until it fits maxW points — prevents any
// cell from spilling into the next column (WinAnsi ellipsis renders correctly).
function pdfFit(txt, maxW, size, bold) {
  const t = String(txt);
  if (maxW <= 0 || textWidth(t, size, bold) <= maxW) return t;
  let lo = 0, hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(t.slice(0, mid) + '…', size, bold) <= maxW) lo = mid; else hi = mid - 1;
  }
  return lo <= 0 ? '' : t.slice(0, lo) + '…';
}

function pdfEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    .replace(/[-￿]/g, ch => {
      // WinAnsi approximations for common chars
      const map = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '•': '\\267', '·': '\\267', '°': '\\260', '→': '->', '−': '-', '☺': ':)', '☹': ':(', '×': 'x', '≤': '<=', '≥': '>=', '►': '>', '◄': '<', '▶': '>', '…': '\\205', '½': '\\275', '¼': '\\274', '¾': '\\276', '©': '\\251', '®': '\\256', '™': '\\231', 'é': '\\351', ' ': ' ' };
      return map[ch] !== undefined ? map[ch] : '?';
    });
}

class PdfDoc {
  constructor(opts = {}) {
    this.pageW = opts.landscape ? 792 : 612; // Letter
    this.pageH = opts.landscape ? 612 : 792;
    this.objs = [];       // array of {id, body(string) or raw stream parts}
    this.pages = [];      // page object ids
    this.images = {};     // key -> {id, w, h}
    this.attachments = []; // {name, bytes, id, specId}
    this.cur = null;      // current content stream (array of strings)
    this.curLandscape = false;
  }
  _alloc() { this.objs.push(null); return this.objs.length; } // ids are 1-based
  _set(id, body) { this.objs[id - 1] = body; }

  addPage(landscape) {
    const isL = landscape === undefined ? (this.pageW > this.pageH) : landscape;
    this.cur = [];
    this.pages.push({ content: this.cur, landscape: isL, imgs: new Set() });
    return this;
  }
  _target() { return this.pages[this._idx == null ? this.pages.length - 1 : this._idx]; }
  get pw() { const p = this._target(); return p && p.landscape ? 792 : 612; }
  get ph() { const p = this._target(); return p && p.landscape ? 612 : 792; }
  // Draw onto an earlier page (used to stamp footers once the page count is known)
  onPage(i, fn) {
    const prevCur = this.cur, prevIdx = this._idx;
    this.cur = this.pages[i].content; this._idx = i;
    try { fn(); } finally { this.cur = prevCur; this._idx = prevIdx; }
  }

  // y measured from TOP of page for convenience
  text(x, yTop, str, opts = {}) {
    const size = opts.size || 9;
    const font = (opts.bold && opts.italic) ? '/F4' : opts.bold ? '/F2' : (opts.italic ? '/F3' : '/F1');
    const y = this.ph - yTop;
    let tx = x;
    const w = textWidth(String(str), size, !!opts.bold);
    if (opts.align === 'right') tx = x - w;
    else if (opts.align === 'center') tx = x - w / 2;
    const col = opts.color || [0, 0, 0];
    this.cur.push(`BT ${font} ${size} Tf ${col[0]} ${col[1]} ${col[2]} rg 1 0 0 1 ${tx.toFixed(2)} ${(y - size * 0.8).toFixed(2)} Tm (${pdfEscape(str)}) Tj ET`);
    return w;
  }
  line(x1, y1, x2, y2, opts = {}) {
    const c = opts.color || [0, 0, 0];
    this.cur.push(`${(opts.width || 0.5).toFixed(2)} w ${c[0]} ${c[1]} ${c[2]} RG ${x1.toFixed(2)} ${(this.ph - y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.ph - y2).toFixed(2)} l S`);
  }
  rect(x, yTop, w, h, opts = {}) {
    const y = this.ph - yTop - h;
    if (opts.fill) {
      const f = opts.fill;
      this.cur.push(`${f[0]} ${f[1]} ${f[2]} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    }
    if (opts.stroke !== false && (opts.stroke || !opts.fill)) {
      const s = Array.isArray(opts.stroke) ? opts.stroke : [0, 0, 0];
      this.cur.push(`${(opts.width || 0.5).toFixed(2)} w ${s[0]} ${s[1]} ${s[2]} RG ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    }
  }
  // JPEG only (DCTDecode). bytes: Uint8Array; must know pixel dims.
  addJpeg(key, bytes, pxW, pxH) {
    if (this.images[key]) return;
    this.images[key] = { bytes, pxW, pxH };
  }
  image(key, x, yTop, w, h) {
    const p = this.pages[this.pages.length - 1];
    p.imgs.add(key);
    const y = this.ph - yTop - h;
    this.cur.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im_${key} Do Q`);
  }
  attach(name, str) {
    const bytes = typeof str === 'string' ? new TextEncoder().encode(str) : str;
    this.attachments.push({ name, bytes });
  }

  build() {
    const enc = new TextEncoder();
    const chunks = [];
    let pos = 0;
    const offsets = [];
    const push = (s) => { const b = typeof s === 'string' ? enc.encode(s) : s; chunks.push(b); pos += b.length; };

    // Object numbering plan:
    // 1 Catalog, 2 Pages, 3 F1, 4 F2, 5 F3, then per-image, per-attachment (stream+filespec), per-page (page+content), optional Names tree
    let nextId = 1;
    const catalogId = nextId++;
    const pagesId = nextId++;
    const f1 = nextId++, f2 = nextId++, f3 = nextId++, f4 = nextId++;
    const imgIds = {};
    for (const k of Object.keys(this.images)) imgIds[k] = nextId++;
    const attIds = this.attachments.map(() => ({ stream: nextId++, spec: nextId++ }));
    const pageIds = this.pages.map(() => ({ page: nextId++, content: nextId++ }));
    const namesId = this.attachments.length ? nextId++ : 0;

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const objects = [];
    const addObj = (id, bodyStr, streamBytes) => { objects.push({ id, bodyStr, streamBytes }); };

    addObj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R${namesId ? ` /Names << /EmbeddedFiles ${namesId} 0 R >>` : ''} >>`);
    addObj(pagesId, `<< /Type /Pages /Kids [${pageIds.map(p => p.page + ' 0 R').join(' ')}] /Count ${this.pages.length} >>`);
    addObj(f1, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
    addObj(f2, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
    addObj(f3, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>`);
    addObj(f4, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>`);
    for (const [k, img] of Object.entries(this.images)) {
      addObj(imgIds[k], `<< /Type /XObject /Subtype /Image /Width ${img.pxW} /Height ${img.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>`, img.bytes);
    }
    this.attachments.forEach((att, i) => {
      addObj(attIds[i].stream, `<< /Type /EmbeddedFile /Subtype /application#2Fjson /Length ${att.bytes.length} >>`, att.bytes);
      addObj(attIds[i].spec, `<< /Type /Filespec /F (${pdfEscape(att.name)}) /UF (${pdfEscape(att.name)}) /EF << /F ${attIds[i].stream} 0 R >> >>`);
    });
    this.pages.forEach((p, i) => {
      const W = p.landscape ? 792 : 612, H = p.landscape ? 612 : 792;
      const xo = [...p.imgs].map(k => `/Im_${k} ${imgIds[k]} 0 R`).join(' ');
      addObj(pageIds[i].page, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R /F4 ${f4} 0 R >> ${xo ? `/XObject << ${xo} >>` : ''} >> /Contents ${pageIds[i].content} 0 R >>`);
      const content = enc.encode(p.content.join('\n'));
      addObj(pageIds[i].content, `<< /Length ${content.length} >>`, content);
    });
    if (namesId) {
      const pairs = this.attachments.map((a, i) => `(${pdfEscape(a.name)}) ${attIds[i].spec} 0 R`).join(' ');
      addObj(namesId, `<< /Names [ ${pairs} ] >>`);
    }

    objects.sort((a, b) => a.id - b.id);
    const xref = [];
    for (const o of objects) {
      xref[o.id] = pos;
      push(`${o.id} 0 obj\n${o.bodyStr}\n`);
      if (o.streamBytes) { push('stream\n'); push(o.streamBytes); push('\nendstream\n'); }
      push('endobj\n');
    }
    const xrefPos = pos;
    let x = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= objects.length; id++) x += String(xref[id]).padStart(10, '0') + ' 00000 n \n';
    x += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    push(x);

    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

// Extract an embedded JSON attachment from a PDF produced by PdfDoc (or any
// PDF with an /EmbeddedFile whose stream is raw JSON, no filter).
function pdfExtractJson(bytes) {
  const latin = new TextDecoder('latin1').decode(bytes);
  // find EmbeddedFile objects with Length
  const re = /\/Type\s*\/EmbeddedFile[^>]*?\/Length\s+(\d+)[^>]*?>>\s*stream\r?\n/g;
  let m;
  let fallback = null;
  while ((m = re.exec(latin))) {
    const start = m.index + m[0].length;
    const len = parseInt(m[1], 10);
    const raw = bytes.slice(start, start + len);
    try {
      const obj = JSON.parse(new TextDecoder('utf-8').decode(raw));
      if (obj && typeof obj === 'object') {
        // prefer an actual Arctic bid over any other embedded JSON
        if (obj.format === 'arctic-bid' || (obj.meta && obj.info && obj.takeoff)) return obj;
        if (!fallback) fallback = obj;
      }
    } catch (e) { /* keep scanning */ }
  }
  return fallback;
}

if (typeof module !== 'undefined') module.exports = { PdfDoc, pdfExtractJson, textWidth };
