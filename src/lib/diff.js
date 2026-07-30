// ---------- Bid diff engine ----------
// Compares two bid objects field-by-field and returns human-readable changes
// grouped by page. Labels come from a registry the app fills in (path prefix
// -> friendly names); unlabeled paths fall back to the raw path.
'use strict';

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function flatten(obj, prefix, out) {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => flatten(v, prefix + '[' + i + ']', out));
    out[prefix + '.length'] = obj.length;
  } else if (isObj(obj)) {
    for (const k of Object.keys(obj)) flatten(obj[k], prefix ? prefix + '.' + k : k, out);
  } else {
    out[prefix] = obj;
  }
  return out;
}

function eqVal(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return a === b;
}

// returns [{path, kind:'changed'|'added'|'removed', from, to}]
function diffBids(oldBid, newBid, ignore) {
  const a = flatten(oldBid, '', {});
  const b = flatten(newBid, '', {});
  const ig = ignore || [];
  const skip = (p) => ig.some(rx => rx.test(p));
  const paths = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = [];
  for (const p of paths) {
    if (skip(p)) continue;
    const inA = p in a, inB = p in b;
    if (inA && inB) {
      if (!eqVal(a[p], b[p])) out.push({ path: p, kind: 'changed', from: a[p], to: b[p] });
    } else if (inA) {
      if (a[p] !== '' && a[p] !== 0 && a[p] !== null && a[p] !== false) out.push({ path: p, kind: 'removed', from: a[p], to: undefined });
    } else {
      if (b[p] !== '' && b[p] !== 0 && b[p] !== null && b[p] !== false) out.push({ path: p, kind: 'added', from: undefined, to: b[p] });
    }
  }
  out.sort((x, y) => x.path < y.path ? -1 : 1);
  return out;
}

if (typeof module !== 'undefined') module.exports = { diffBids, flatten };
