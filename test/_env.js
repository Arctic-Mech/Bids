// Shared paths for the test suites, so nothing hard-codes a machine.
// Set PW_CHROMIUM to use a specific Chromium build; otherwise Playwright's own.
'use strict';
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, '..');
const OUTDIR = path.join(ROOT, 'build');
require('fs').mkdirSync(OUTDIR, { recursive: true });

// The published app carries no rates — every suite must hand it the company file
// the way a real computer would, before the page boots.
const COMPANY_FILE = path.join(OUTDIR, 'Arctic Company File.arctic');
async function seedCompany(page) {
  const b64 = require('fs').readFileSync(COMPANY_FILE).toString('base64');
  await page.addInitScript((data) => {
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    window.ARCTIC_COMPANY_FILE = bytes;
  }, b64);
}

module.exports = {
  COMPANY_FILE,
  seedCompany,
  ROOT,
  SRC: path.join(ROOT, 'src'),
  FIXTURES: path.join(__dirname, 'fixtures'),
  OUTDIR,
  INDEX: url.pathToFileURL(path.join(ROOT, 'index.html')).href,
  WORKBOOK: path.join(ROOT, 'src', 'workbook.xlsm'),
  launchOpts: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
};
