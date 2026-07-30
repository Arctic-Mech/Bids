# Arctic Bid Tool — Complete Function Map

This document maps **every function of `REV_1 The Dalles Adventist Energy Upgrades Estimate.xlsm`**
(21 sheets, ~350 named ranges, ~50 VBA modules) to where it lives in `index.html`.
Nothing was dropped; every formula was ported and verified against the workbook's own
computed values (see *Verification* at the bottom).

## Sheets → App pages

| Workbook sheet | App location | Notes |
|---|---|---|
| **MCAA RECAP** | Estimate Recap page | The hub. Labor modifiers (Detailing/Testing/Safety/QC/Material-Handling ×4 trades), schedule LOP, blended crew rates, labor & material totals, subcontractors (Quote/Plug), supervision, GC/indirects (Page 2), equipment rentals (Page 3), markups, market recovery, bond, permits, CAT/B&O tax (+0.15% Multnomah always), $5 cost-leveler, **Total Bid**. Stored-total snapshot (was Ctrl+T) is the "Store current total" button. Goal-seek on adder % (was two buttons) — type the target as `=hours/base` in any % field. |
| **TakeOff** | TakeOff page | CAE group + unlimited numbered groups (was 31). Per row: 3 phase codes (dropdowns from Phase Codes), qty × unit × multiplier for field/shop hours, material unit $, EMO flag, OT/DBLT, SWING/GRAVE/SPECIAL shift with Plumb/Pipe loss-of-production uplift. Group exclude checkboxes zero the group exactly like `SM_ExludeGroup*`. Material cells accept typed math (`=80730+250`) like estimators did in Excel. Hidden cost columns T–AM (straight/OT/DT/shift adds per trade) are computed internally and feed everything downstream. |
| **Crew Mix** | Crew Mix page | Wage+fringe tables per classification (company settings), PT&I stack incl. WC = gross×EMR×OGSERP×DCBS×OCCPAP, $0.35 OT/DT adder (field & plumb only), unrounded shop PT&I quirk, $16.50 shop burden, period escalation factors, ST/OT/DT blended crew rates, shift premium adders, OCIP $/hr deduct (incl. the workbook's 4×-Foreman weighting quirk, flagged in UI). |
| **SM Import** | SM Import page | Replaces the TSI / QuickPen VBA imports with a paste zone + editable grid. Field/Shop "% of labor" difficulty columns scale hours (Easy/Standard/Hard). Feeds the TakeOff CAE group via the same Type/Material/CutType bucket rules (incl. the BLK row-20 criteria quirk). "Relocate CAE → group" reproduces the 1,714-line `Relocate_CAE` macro: values copied to a group at qty 1, SM Import cleared. |
| **SM Audit Trail / QP SM Audit Trail / Pivot** | inside SM Import import path | The audit-trail → pivot funnel is replaced by direct aggregation of pasted rows; pre-aggregated paste also accepted. `Ext_Insul` names were consumed by nothing (verified) — documented, not ported. |
| **Work Recovery** | card on Recap page (+ Indirects PDF) | Per-trade hours (same MCAA cell math), $/hr approved × min(max hours, hours), rounded to $; feeds Market Recovery line and Booking netting rows. |
| **EMO** | Indirect Costs page | Σ material where TakeOff EMO="Yes"; original (O&P) vs revised (equipment-markup) — H61/H62 wiring identical. |
| **Permits** | Indirect Costs page | All five jurisdiction fee-tier tables (Portland/Multnomah, Hillsboro, Clackamas, Tualatin, Custom) with plan-review + markup ROUNDUP math, jurisdiction radio → `S1`, construction value = Project Subtotal (H63). Custom tiers are per-bid inputs, others are company settings. |
| **Bond** | Indirect Costs page | 5-bracket progressive premium, each bracket ROUNDUP to $; sell price = H63+H64+H65+H67. |
| **OCIP** | Indirect Costs page | Full premium worksheet: on-site payrolls from labor values × 60% payroll fraction × arch/HVAC split (D27), WC classes 5535/5606/5537/5183, EMR/factors/DCBS Oregon tax, GL $3.59+$8.59 per $1,000. Radio form fields kept as bid data. Division-by-zero guard added (workbook quirk R139/R141). |
| **Breakdown** (veryHidden) | internal (Price Breakdown / Schedule feed) | Group prime-cost aggregation lives in the engine; sale-price spread logic is on the Price Breakdown page. |
| **Price Breakdown** | Price Breakdown page | Per-section field/shop labor cost (Σ TakeOff AG/AH), material, hours; GC & Fee allocated pro-rata by section subtotal; per-section notes. Fee = H60+H61+H62+H69. |
| **Proposal** | Proposal page | Letterhead form, scope paragraph, quick exclusions (concatenated line, was W/X columns), detail exclusion library (AC column), `SpellNumber` amount-in-words, acceptance/validity text. |
| **Booking Report** | Booking Report page | All 8 divisions × 99 phase codes. Plain rows = SUMIFS over TakeOff by phase column; the 261 special rows (supervision, adder hours, trucking, GC amounts by phase-code match, subsistence, work-recovery netting, equipment/subcontract SUMIFs) run through an embedded formula evaluator using the workbook's own formulas. E/M/OH/OT/S booking codes, status block (booked vs bid ±$2, hour target M18), Booking CSV export (generalized to every booked phase — the workbook only exported 1-01 and had an empty-filename bug). |
| **Booking CSV** | "Booking CSV" button on Booking page | `;` comment rows, `*` job header, `P`/`C` records, mm/dd/yy stamps. |
| **Phase Codes** | dropdowns everywhere + Settings note | 8 divisions × 99 codes; 270 standard descriptions embedded; per-bid custom code slots kept per bid (`phaseCustom`). Field list = divisions 1,3–8; shop = 2; material = all (exactly the workbook's hidden O/Q/S lists). |
| **Takeoff Notes** | Notes page | 40-row table: Dry/Wet/Service, description, cost impact, EST $, bid strategy, RFI. |
| **SM Schedule** | Schedule page | 48-week Gantt: packages from takeoff groups, tasks with start/finish/status/manpower, work-day counts (5-day weeks), first-Monday anchor or alternate start date. Output-only, as in the workbook. |
| **Macros** (veryHidden) | n/a | Was only the "enable macros" gate. |

## VBA macros → App features

| Macro | Replacement |
|---|---|
| `SaveWorkBook` (Ctrl+S naming `EstNo JobName`) | Export filenames: `EstNo JobName Rev N - Page.pdf` / `.zip` |
| `EstimateTotal` form (Ctrl+T) | "Store current total" + live drift readout on Recap |
| `GoalSeek_MCAA` / `_MCAA2` | Type `=targetHours/baseHours` into any % input (all inputs accept math) |
| `Plug_Quote` (Ctrl+W/Q red font) | Notes column carries "Plug"; Quote/Plug dropdown on subcontract rows |
| `Import_TSI` / `Import_QP` | SM Import: drop a `.csv` / `.txt` / `.xlsx` export on the page, or paste the rows — both go through one parser |
| `Import_QPPipe` | Dead code in the workbook (target sheets missing) — documented, not ported |
| `RemoveSMImport` / `Remove_CAE_NoQuestion` | "Clear all" on SM Import (confirm), auto after Relocate CAE |
| `Relocate_CAE` (31 clones) | "Relocate CAE → group" button on TakeOff |
| `InsertRowsAndFillFormulas` | "+ Row" / "+ 5 Rows" per group (groups are variable-length lists) |
| `HideSheet`/`ProtectAll`/`UnProtectAll` | n/a (no macro gate needed); locked cells → Settings page |
| `Hide_Takeoff_Cells` / `HideSMBookingColumns` | Cost columns are internal; phase columns always visible |
| `Booking` (CSV export) | Booking CSV button (fixed filename bug, generalized to all phases) |
| `HideDiv1..8` (hide blank booking rows) | Booking page only renders rows with values or descriptions |
| `CrewMixShowAll/...` navigation | Crew Mix sections are always visible cards |
| `TimeSheet` (phase-code export) | Phase-code matrix embedded; Booking page/PDF covers reporting |
| `YesNoMessageBox` (new job flow) | "+ New Bid" on Home |
| `SpellNumber` (VBA function) | JS `spellNumber()` on Proposal |
| `SendEmail` (dead code, commented out) | not ported |
| `Workbook_BeforePrint` guard | Crew-mix "no crew but hours exist" warning badge |

## New abilities (requested)

- **Local storage bids** with autosave; bid library on Home.
- **Revision tracking**: every bid carries `rev`; "New Rev" duplicates; **importing a file (older or newer) shows a field-by-field diff** — what you have vs what the file has, grouped by page, with plain-English labels. **Each difference is its own accept/deny tick box** (accept-all / deny-all, and per-page toggles), so a rev can be merged field by field rather than taken wholesale. Structural differences are the one exception: when the two bids disagree on how many rows or groups a list holds, the indices no longer line up, so that list is presented as a single all-or-nothing decision — applying half of it would corrupt the bid. Applying is one Undo step.
- **Export**: any subset of pages, as one PDF or a ZIP of per-page PDFs, named `EstNo JobName Rev N - Page.pdf`. **Every PDF embeds the complete bid data** (a `bid.json` attachment inside the PDF), and the ZIP carries `bid.json` too — so importing any exported file restores the exact bid.
- **Proposal PDF**: printed as the workbook's own Proposal form — the double-ruled boxes, the letterhead, the tiny italic field labels, the scope/exclusions box, WE PROPOSE and the acceptance block. Every element is placed at the position measured off the sheet's own print-out, inset 10pt so no border falls in a printer's unprintable margin. Exclusions compose into one comma-separated run to the right of the label, exactly as the sheet's `D39` formula does, and the amount in words is a faithful port of the workbook's `SpellNumber` VBA (including its "No Cents" wording and double-space quirk). Content that outgrows the box continues on a second page instead of being clipped, which is what Excel does.
- **Every table cell is width-fitted**, borrowing space only from genuinely empty neighbours, so no value can ever print on top of another. Multi-page tables repeat the group header as "(continued)", and every page except the proposal form carries `Page N of M` with the estimate/job/rev.
- **Import**: `.pdf`, `.zip`, or `.json` produced by the tool — **and `.xlsm` workbooks** (an untouched original estimate or one exported by this tool; both parse to the same bid).
- **Spreadsheet export (`.xlsm`)**: "Export as Spreadsheet" writes a real macro-enabled workbook by injecting the bid's inputs into an embedded byte-copy of the original estimate template. Formatting, formulas, macros (`vbaProject.bin` byte-identical), sheet protection, hidden sheets, form controls and pivots are all preserved; Excel recalculates on first open. People can work off the website or the exported workbook interchangeably.
- **Company settings**: every locked constant (wages, fringes, PT&I, WC factors, permit tiers, bond brackets, OCIP rates, LOP factors, equipment rates) is editable with factory values shown; bids freeze the rates they were priced with, with a one-click "apply current rates".
- **Back/forward buttons** work on desktop and iPhone (hash routing; every page change is a history entry).
- **Excel keys in the grids**: Enter / Shift+Enter move down and up a column, Ctrl+D fills down from the cell above, Esc reverts the cell. Left/Right stay as caret movement and Tab is untouched, because every cell is a live input.
- **The second exclusions picker** (the sheet's Z/AA block) is in the app and feeds the same Exclusions line. The workbook's `D39` formula skips `Z17`, so its first item could never be selected in Excel; the export repairs that formula only when that item is picked, leaving every other export byte-identical.
- **The six OCIP enrollment answers** (applicant type, contract with, subcontract work, bid type, contract type, combined rate) are editable and written onto the exported OCIP form.
- **Undo / Redo** (top bar, Ctrl+Z / Ctrl+Shift+Z): 40 steps of bid history, each labelled from the field that changed ("Estimate Recap — Overhead & Profit %"). Import-override is pushed as an undo step, so replacing your saved bid with a file is reversible.
- **Progress bar** on import/export with per-stage labels, yielding to the browser between stages so the tab never looks unresponsive.

## Verification

A Node test harness rebuilt the original *The Dalles Adventist* bid from the workbook's data and compared
the engine's output against Excel's own cached results:

- All 9 blended crew rates (ST/OT/DT × 3 pools) — exact.
- Every TakeOff group subtotal and all row-7 grand totals — exact.
- MCAA RECAP: every intermediate (hours, labor value, GC lines, supervision, EMO, markups, tax, leveler) and **Total Bid $4,614,770.00 — exact**.
- OCIP premium worksheet (payrolls, WC, GL, deduct 17,163.44) — exact.
- All five permit jurisdiction totals (Portland 89,211.43 etc.) — exact.
- Bond ($39,018) — exact.
- **All 2,400 Booking Report cells** (hours/labor/material × 8 divisions × 99 codes + totals) — exact.
- Price Breakdown allocations — exact.

Spreadsheet round-trip (import the original workbook → export it back as `.xlsm`, run in the real app in a browser):

- **0 formula differences and 0 value differences** across all 21 sheets vs the untouched original (every cell compared).
- 185 of 197 zip parts byte-identical, including `vbaProject.bin` (all macros) and `styles.xml` (all formatting). The remaining parts differ only in machine encoding (shared-string vs inline-string storage, and the recalculate-on-open flag) — nothing visible or behavioral in Excel.
- Re-importing a browser-exported workbook parses to a bid identical to the one that produced it (verified field-by-field in the e2e suite).
