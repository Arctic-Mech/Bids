# Changing the app

**`main` is the live site.** Anything committed to `main` appears at
https://arctic-mech.github.io/Bids/ within a minute or two.

> **The history starts at one commit on purpose.** This repository is public, and the
> early commits carried Arctic's rate tables and the estimate workbook — and, inside
> that workbook's VBA, a cleartext email password. Those commits were deleted, not
> hidden. There is nothing before the first commit to go looking for. Keep it that way:
> `src/company_data.json` and `src/workbook.xlsm` are gitignored and must stay that way
> (see "The two files that are not in this repository" below).

**Never edit `index.html`.** It is generated. Every change goes in `src/`:

```bash
# 1. edit a source file, e.g. src/parts/07c_ui_takeoff.js
# 2. rebuild
python3 build.py
# 3. check it still works
./verify.sh                # everything (needs the setup below)
./verify.sh --quick        # build + syntax + engine only, ~10 seconds, no browser
# 4. commit BOTH your source change and the rebuilt index.html
```

If you commit a change to `src/` without rebuilding, the live site does not change.
The `build check` action on GitHub catches that and tells you; so does the commit
hook if you turn it on (below).

## What is where

| Path | |
|---|---|
| `index.html` | **generated** — the whole app in one file, this is what the site serves |
| `HOWTO.md` | the `❓ How To` page's text. Edit it here; `build.py` renders it into the app |
| `build.py` | assembles `index.html` from `src/`. Standard library only |
| `src/parts/` | the app: `01_head.html` (styles), `02_body.html` (shell), then the JS in load order |
| `src/lib/` | self-contained PDF writer, ZIP reader/writer, and bid diff engine |
| `src/company_data.json` | **not in this repo** — every locked value from the workbook: wages, fringes, PT&I, WC factors, permit tiers, bond brackets, OCIP rates, phase codes |
| `src/workbook.xlsm` | **not in this repo** — the original estimate workbook, used for the spreadsheet export and the round-trip test |
| `src/assets/` | the two logos |
| `test/` | the checks. `fixtures/` holds the bid they run against |
| `tools/` | one-off scripts that produced `company_data.json` from the workbook |
| `docs/specs/` | what each workbook sheet does and how it was ported — read this before changing the engine |
| `docs/extract/` | per-cell dumps of the sheets the generators read |

## The two files that are not in this repository

This repository is public, so Arctic's rate tables and the estimate workbook are
**not** in it and are **not** in the published `index.html`:

- `src/company_data.json` — the rates
- `src/workbook.xlsm` — the estimate workbook

They live in the **Arctic company file** (`Arctic Company File.arctic`, an ordinary
zip) on the Arctic network. Each computer running the app loads that file once, on
a setup screen, and the browser remembers it; `src/parts/03_company.js` handles that
end.

Consequences for anyone working on the code:

- `python3 build.py` **works without them.** `index.html` contains no rates and no
  workbook, so the public sources are enough to rebuild the site. The build then
  prints a note saying it skipped the company file. CI only ever does this much.
- `./verify.sh` **needs them**, because the checks price real bids and round-trip the
  real workbook. Unzip the company file and drop those two into `src/` first. They
  are gitignored, so they cannot be committed by accident.
- After changing rates, re-run `python3 build.py` and hand out the new
  `build/Arctic Company File.arctic` — it is rebuilt from whatever is in `src/`.

## One-time setup on a new machine

```bash
git config core.hooksPath .githooks     # rebuilds index.html for you on commit
npm ci                                  # Playwright, for the browser tests
npx playwright install chromium
python3 -m pip install --user openpyxl pymupdf pypdf
# and, to run the tests, unzip the Arctic company file into src/ (above)
```

The app itself has no dependencies — those are only for the tests.

## What the checks prove

| | |
|---|---|
| `node test/harness2.js` | the engine reproduces the workbook's own computed values — crew rates, the recap waterfall, permits, bond, OCIP, EMO, booking. **The fidelity guard.** No browser |
| `node test/adv_io.js` | PDF writer, ZIP, and import/export survive awkward input |
| `node test/e2e.js` | the whole app in a browser: totals, navigation, back button, exports, import compare, spreadsheet round-trip |
| `node test/undo_progress.js` | undo/redo and the progress overlay |
| `node test/selective_diff.js` | accepting some import changes and denying others |
| `node test/clip_check.js` | no field hides its own text, at nine window sizes. Depends on the machine's fonts |
| `node test/pdf_check.js` | every PDF page renders with no overlapping or off-page text |
| `node test/roundtrip.js` + `diff_xlsm.py` | import the original workbook, export it again, and get **0 formula and 0 value differences** |
| `node test/company_file.js` | the published page carries no rates and no workbook, asks for the company file once per computer, then remembers it |
| `node test/smimport_file.js` | raw TSI / QuickPen exports aggregate exactly as the old pivots did — **including the minutes-to-hours divide**, which a synthetic fixture once hid |
| `node test/howto.js` | the How To page answers the question it exists to answer, and prints |

## Things worth knowing before you change something

- **The engine mirrors the workbook, quirks included.** Where the spreadsheet does
  something odd, the code does the same thing and says so in a comment. Do not
  "fix" one without checking `docs/specs/` and re-running `harness2.js`.
- **The spreadsheet export must stay byte-faithful.** `test/roundtrip.js` is what
  guarantees an exported workbook is indistinguishable from the original. If it
  reports differences, something changed that Excel will notice.
- **Re-rendering is deferred.** `rerender()` in `src/parts/07a_ui_helpers.js` waits a
  tick, then rebuilds the page and puts focus back by `data-path`. Keyboard
  navigation depends on that timing — do not make a `change` handler re-render
  synchronously.
- **Every bound input needs a `data-path`**, or focus is lost whenever the page
  re-renders under it.
- **Fixtures made up from column *names* prove nothing about units.** The TSI import
  summed `Install time` straight, and the tests passed, because the sample file had the
  right columns and invented numbers. The export is in *minutes* and the workbook's pivot
  divided by 60 (`docs/specs/sm-import-schedule.md` §2b). When you build a fixture for an
  outside file format, take the values and their units from the workbook, not from thin air.
