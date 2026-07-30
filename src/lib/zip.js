// ---------- Minimal ZIP writer/reader (STORE only, no compression deps) ----------
// Reader also handles DEFLATE entries via DecompressionStream when available
// (all modern desktop/iOS browsers), so zips from Finder/Explorer re-import too.
'use strict';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zipCreate(files) { // files: [{name, bytes}]
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (b) => { chunks.push(b); offset += b.length; };
  const u16 = (v) => new Uint8Array([v & 255, (v >> 8) & 255]);
  const u32 = (v) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
  const dosTime = u16(0), dosDate = u16(0x5821); // fixed date to keep exports deterministic-ish

  for (const f of files) {
    const nameB = enc.encode(f.name);
    const data = f.bytes;
    const crc = crc32(data);
    const local = offset;
    push(new Uint8Array([0x50, 0x4B, 0x03, 0x04])); push(u16(20)); push(u16(0x0800)); push(u16(0)); // ver, utf8 flag, store
    push(dosTime); push(dosDate); push(u32(crc)); push(u32(data.length)); push(u32(data.length));
    push(u16(nameB.length)); push(u16(0)); push(nameB); push(data);
    central.push({ nameB, crc, size: data.length, local });
  }
  const cdStart = offset;
  for (const c of central) {
    push(new Uint8Array([0x50, 0x4B, 0x01, 0x02])); push(u16(20)); push(u16(20)); push(u16(0x0800)); push(u16(0));
    push(dosTime); push(dosDate); push(u32(c.crc)); push(u32(c.size)); push(u32(c.size));
    push(u16(c.nameB.length)); push(u16(0)); push(u16(0)); push(u16(0)); push(u16(0)); push(u32(0)); push(u32(c.local)); push(c.nameB);
  }
  const cdSize = offset - cdStart;
  push(new Uint8Array([0x50, 0x4B, 0x05, 0x06])); push(u16(0)); push(u16(0)); push(u16(central.length)); push(u16(central.length));
  push(u32(cdSize)); push(u32(cdStart)); push(u16(0));

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function zipRead(bytes) { // -> [{name, bytes}]
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // find EOCD
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
    if (dv.getUint32(i, true) === 0x06054B50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP file');
  let count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  // zip64 sentinels: the app never writes these, but a Finder/Explorer zip might.
  if (count === 0xFFFF || p === 0xFFFFFFFF) {
    throw new Error('This ZIP uses the ZIP64 format, which this tool cannot read. Re-export from the tool, or import one of the PDFs inside it instead.');
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014B50) throw new Error('Bad or truncated ZIP central directory');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder('utf-8').decode(bytes.slice(p + 46, p + 46 + nlen));
    // local header to find data start
    const lnlen = dv.getUint16(lho + 26, true);
    const lelen = dv.getUint16(lho + 28, true);
    const dataStart = lho + 30 + lnlen + lelen;
    const comp = bytes.slice(dataStart, dataStart + csize);
    let data;
    if (method === 0) data = comp;
    else if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Compressed ZIP not supported in this browser');
      const ds = new DecompressionStream('deflate-raw');
      const stream = new Blob([comp]).stream().pipeThrough(ds);
      const buf = await new Response(stream).arrayBuffer();
      data = new Uint8Array(buf);
    } else throw new Error('Unsupported ZIP compression method ' + method);
    if (!name.endsWith('/')) out.push({ name, bytes: data });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { zipCreate, zipRead, crc32 };
