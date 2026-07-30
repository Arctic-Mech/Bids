// Round-trip proof: original workbook -> xlsmReadBid -> xlsmInject -> roundtrip.xlsm
// Then diff_xlsm.py compares every formula and value against the original.
'use strict';
const fs = require('fs');
const path = require('path');
const { SRC, OUTDIR, WORKBOOK } = require('./_env');
const BASE = SRC;

const stubs = `
function uid(){return 'test-id';}
function deepClone(o){return JSON.parse(JSON.stringify(o));}
function pathGet(obj, p){
  const parts = p.replace(/\\[(\\d+)\\]/g, '.$1').split('.');
  let cur = obj; for (const k of parts){ if(cur==null) return undefined; cur = cur[k]; } return cur;
}
function pathSet(obj, p, val){
  const parts = p.replace(/\\[(\\d+)\\]/g, '.$1').split('.');
  let cur = obj;
  for (let i=0;i<parts.length-1;i++){ if(cur[parts[i]]==null) cur[parts[i]] = /^\\d+$/.test(parts[i+1])?[]:{}; cur = cur[parts[i]]; }
  cur[parts[parts.length-1]] = val;
}
const store = { settingsOverrides(){ return {}; } };
function toast(){}
function downloadBytes(){}
function bidFileBase(){ return 'x'; }
function newTakeoffItem() {
  return { matPhase: '', shopPhase: '', fieldPhase: '', desc: '', qty: '', fUnit: '', fMult: '', sUnit: '', sMult: '', mUnit: '', notes: '', emo: '', ot: '', shift: '', plug: false };
}
`;

const partFiles = ['lib/zip.js', 'parts/06_fmt.js', 'parts/04_model.js', 'parts/12_xlsm.js'];
const src = partFiles.map(p => fs.readFileSync(path.join(BASE, p), 'utf8')).join('\n').replace(/'use strict';/g, '');
const COMPANY = JSON.parse(fs.readFileSync(path.join(BASE, 'company_data.json'), 'utf8'));

const api = new Function('COMPANY', stubs + src + `
return { zipRead, XlsmDoc, xlsmReadBid, xlsmInject, xlsmBlankAll, makeNewBid, effectiveSettings };
`)(COMPANY);

(async () => {
  const bytes = new Uint8Array(fs.readFileSync(WORKBOOK));
  const entries = await api.zipRead(bytes);
  const doc = new api.XlsmDoc(entries);
  const bid = api.xlsmReadBid(doc);
  fs.writeFileSync(path.join(OUTDIR, 'roundtrip_bid.json'), JSON.stringify(bid, null, 1));

  // fresh doc from the same template (mirrors exportXlsm: template + blank + inject)
  const entries2 = await api.zipRead(new Uint8Array(fs.readFileSync(WORKBOOK)));
  const doc2 = new api.XlsmDoc(entries2);
  api.xlsmInject(doc2, bid);
  const out = await doc2.build();
  fs.writeFileSync(path.join(OUTDIR, 'roundtrip.xlsm'), Buffer.from(out));
  console.log('roundtrip.xlsm written,', out.length, 'bytes');
})().catch(e => { console.error(e); process.exit(1); });
