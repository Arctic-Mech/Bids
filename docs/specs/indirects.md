# Indirects group — OCIP, Permits, Bond, Work Recovery, EMO

Five small support sheets that compute indirect-cost line items consumed by `MCAA RECAP` (the bid summary) and `Breakdown`/`Booking Report`. All five sheets are protected; EMO and Bond contain **no unlocked cells at all** (pure calculators). Static data extracted programmatically into `indirects.data.json` (same directory) — the app must embed that file; every "COMPANY CONSTANT" below is present there with exact cell + value and must be surfaced as an editable setting.

Excel semantics used throughout: `ROUNDUP(x,0)` = ceil away from zero (Math.ceil for positive x); `ROUNDUP(x,2)` = ceil(x*100)/100; `ROUND` = half-away-from-zero.

---

## 1. OCIP (sheet "OCIP")

### Purpose
Intel Corporation **Owner-Controlled Insurance Program (OCIP) Contractor Enrollment Application** (a printable 3-page form) plus an **Insurance Premium Worksheet** that computes the insurance cost Arctic must *deduct from its bid* when the owner supplies WC/GL insurance. Its single money output is **`OCIP!O174` = named range `OCIP_Deduct_Total`** (grand total of all insurance costs).

### Consumed by (cross-sheet outputs)
- `'MCAA RECAP'!C27` = `IF(OCIP_GL_Toggle="No OCIP",0, IF(OCIP_GL_Toggle="OCIP", OCIP_Deduct_Total*-1, IF(OCIP_GL_Toggle="OCIP GL Only", OCIP!O169*-1, 0)))` — the deduct entering Total Labor Cost (`J27`). `OCIP_GL_Toggle` = `'MCAA RECAP'!B26` (text: `"No OCIP"` / `"OCIP"` / `"OCIP GL Only"`, driven by radio `'MCAA RECAP'!K26`, 2 = No in current file). Note **GL-only mode uses `OCIP!O169`** (liability premium only), full mode uses `O174`.
- `Breakdown!F8:F91`: `=IF(OCIP_Req=1, OCIP_Deduct_Total*(C{r}/SUM($C$40,$C$66,$C$92)), 0)` — allocates the deduct across phase lines proportionally to labor cost. `OCIP_Req` = `'MCAA RECAP'!C26`.
- VBA `Help.frm`: OCIP Yes/No buttons set `OCIP_Req` (`Range("OCIP_Req").Value = 1 / 2`); `HideSheets` reset macro sets `'MCAA RECAP'!K26 = 2` (No OCIP).
- Note: named range `OCIP_Deduct` (`'Crew Mix'!N27`, = `-(avg crew)×(WC+GL rates)` per hour) is a *different* Crew-Mix-level value, not from this sheet.

### Reads (cross-sheet inputs)
| Source | Meaning |
|---|---|
| `Info_Job_Name` = `'MCAA RECAP'!H6` | job name (E8, E35) |
| `Info_Total_Bid` = `'MCAA RECAP'!H70` | est. contract value (E36, O127) — **circular through MCAA RECAP**: O174 → C27 → J27 → … → H70 → OCIP E36/O127. Display-only cells, so no calc cycle, but the app must render them after the recap solves. |
| `Info_Schedule_Start_Date` / `_End_Date` = `'Crew Mix'!I5` / `I7` | M35 / M36 |
| `'Crew Mix'!Q11` (= 0.6) | Experience Modifier (N16, O146) |
| `'Crew Mix'!W11` (= 0.831) | "Other Factors" retention factor; N150 = `W11 − 1` = −0.169 ("Oregon Tax") |
| `'MCAA RECAP'!E18/F18/G18/H18` | total field hours w/ adders: Plumb / Pipe / SM / SM-Shop |
| `'MCAA RECAP'!I21/I22/I23` | labor value $: Plumb / Pipe / SM field |
| `'MCAA RECAP'!D27` | "Arch Hrs in SM Takeoff" (user input on recap) |
| `'MCAA RECAP'!F48,H48` | Project Manager hours / cost |
| `'MCAA RECAP'!F49,H49` | Plumb field supervision hours / cost |
| `'MCAA RECAP'!F50,H50` | Pipe field supervision hours / cost |
| `'MCAA RECAP'!H51` | Arch field supervision cost |
| `'MCAA RECAP'!F52,H52` | SM field supervision hours / cost |

### Visible layout
- **Page 1 rows 1–62** ("Form 1 Page 1/3"): Intel header (A2:A7 legal text), §1 Identification (rows 9–21), §2 Contact info (23–31), §3 Contract info (33–39), Scope of Work / WC codes & est. payroll table (41–45), §4 Contractor status (47–52), §5 Subcontracts (54–61).
- **Page 2 rows 63–121** ("PAGE 2/3"): Safety info (65–69), Certification & Assignment legal text (72–79), signature block (82–92), OCIP administrator contacts (94–101), "FOR INTERNAL USE ONLY" box (108–112).
- **Page 3 rows 122–176** ("PAGE 3/3"): Insurance Premium Worksheet — §1 Identification (126–131), §2 WC insurer (133), §3 WC payroll/premium table (135–151), §4 GL insurer (153), §5 GL premium table (155–169), totals (172–174).
- Columns R and Y are off-print helper columns (R = arch/HVAC split %, Y = radio link cells). No hidden rows/cols on this sheet.

### USER INPUTS (unlocked cells)
| Cell | Label | Default | Notes |
|---|---|---|---|
| `E8` | BID PACKAGE NAME | `=Info_Job_Name` (formula in unlocked cell) | user may overtype |
| `M8` | BID PACKAGE # | `"XXXXXXXXXX"` | free text |
| `Y18` | "Applicant is:" radio link | 1 | 4 radios (group box row 17–19). Option labels live in VML shape text (not extracted); per note I21 almost certainly Corporation / Partnership / Sole Proprietorship / Joint Venture |
| `Y50` | "Who is your contract with?" radio link | 3 | 1=Owner Directly (B50), 2=Construction Manager (B51), 3=General/Prime Contractor (F50), 4=Subcontractor–Please Identify (F51) — mapping consistent with checked radio position |
| `Y54` | "Will you subcontract any of your work?" radio link | 1 | Yes/No pair; order unverified (labels in VML) |
| `Y123` | Original Bid / Change Order radio link | 1 | 1=Original Bid (M123), 2=Change Order (M124) |
| `Y130` | Contract Type radio link | 2 | 1=GMP, 2=FIXED PRICE, 3=TIME & MATERIALS (M129:M131) |
| `Y157` | "Is the rate shown a combined rate…?" radio link | 1 | Yes/No pair; order unverified |
| `D124` | (Contract-No line marker) | `"O"` | stray typed marker next to "Change Order"; harmless free text |

**None of the Y cells feed any formula** — they are print/form state only. No data validations on the sheet.

### COMPANY CONSTANTS (locked literals feeding calculations — keep as editable settings)
WC classification table (rows 139–142):
| Row | Description (B) | Class code (F) | % Onsite (G) | WC rate per $100 (M, stored as fraction) |
|---|---|---|---|---|
| 139 | Sheet Metal Work (Arch) | 5535 | 1.00 | 0.0297 (2.97%) |
| 140 | Contractor Exec Supervisor | 5606 | 0.25 | 0.0039 (0.39%) |
| 141 | AC Heating and Refrig | 5537 | 1.00 | 0.0224 (2.24%) |
| 142 | Plumbing | 5183 | 1.00 | 0.0132 (1.32%) |

(The same class codes appear as literals `L42:L45` = 5535/5606/5537/5183 beside trades Arch/Super/HVAC/Plumb in the page-1 scope table.)

GL table: `M161` = **$3.59 per $1,000** (Premises & Operations, class code `G161` = 98884); `M163` = **$8.59 per $1,000** (Products/Completed Ops, class code `G163` = 98884); Excess Liability row 165: `I165`=0, `M165`=0, `O165`=0 (literal zeros; B166 "NA - Fixed Premium").

Other factors: `O148` = **0.89** ("Other Applicable Factors": Partial Waiver of Sub, AGC, TRIA per B149). Hard-coded literal **0.6** inside `N42..N45` = assumed bare-payroll fraction of fully-burdened labor dollars (60%) — appears 8 times; make it ONE setting. (It numerically equals `'Crew Mix'!Q11` = 0.6 but is a separate literal.)

Static form text/constants (embedded in data.json `ocip.formDefaults`): company name/address/phones, Federal ID `93-0680369`, anniversary `10/1/11`, contacts (Arlene Frazier, Hailey Latherow), WC insurer `SAIF Corporation`, GL insurer blank, Intel OCIP admin (Kathryn Swazo), authorized rep, etc.

### CALCULATIONS
Page-1 scope table (est. on-site payroll $ per class; these mirror into K139:K142):

```js
// helper fractions (col R)
R42  = archHrs===0 ? 0 : archHrs / smFieldHrs            // archHrs='MCAA RECAP'!D27, smFieldHrs=G18
R44  = archHrs===0 ? 1 : (smFieldHrs-archHrs)/smFieldHrs
R139 = archHrs / smFieldHrs                              // NO zero guard → #DIV/0! if G18=0 (quirk)
R141 = (smFieldHrs-archHrs)/smFieldHrs                   // NO zero guard

PF = 0.6  // payroll fraction setting

// N42 (Arch payroll):  I23=SM field labor $, H52=SM supervision $, H51=Arch supervision $
N42 = I23===0 ? 0 : ROUND((I23*PF + H52*PF + H51*PF) * R42, 0)
// N43 (Supervisor payroll): H48=PM cost, 25% onsite
N43 = H48 * 0.25 * PF
// N44 (HVAC payroll): I22=Pipe labor $, H50=Pipe supervision $
N44 = (I22+I23)===0 ? 0 : ROUND((I23*PF + H52*PF)*R44 + I22*PF + H50*PF, 0)
// N45 (Plumb payroll): I21=Plumb labor $, H49=Plumb supervision $
N45 = ROUND((I21 + H49) * PF, 2)
```

Estimated man-hours (col H, display only):
```js
H139 = smFieldHrs===0 ? 0 : ROUND((G18 + F52) * R139, 0)
H140 = F48 * 0.25                                  // G140 = 25% onsite
H141 = (F18+G18)===0 ? 0 : ROUND((G18+F52)*R141,0) + (F18 + F50)
H142 = E18 + F49
```

WC premium worksheet:
```js
K139..K142 = N42..N45                       // on-site payrolls
O[r]  = K[r] * M[r]                         // premium = payroll × rate  (r=139..142; M as fraction ⇒ "per $100")
K144  = SUM(K139:L143)                      // Total payroll (L col empty)
O145  = ROUND(SUM(O139:O143), 2)            // Estimated Total Premium
O146  = CrewMix.Q11                         // Experience Mod. Factor (0.6)
O147  = ROUND(O145 * O146, 2)               // Modified Premium
O149  = O147 * O148                         // Premium after factors (O148=0.89)
N150  = CrewMix.W11 - 1                     // "Oregon Tax" (−0.169)
O150  = O149 * N150
O151  = O149 + O150                         // Total Workers' Comp. Cost  (≡ O149 * W11)
```

GL/liability worksheet:
```js
I161 = K144;  O161 = M161 * I161 / 1000     // Premises & Ops premium ($3.59/$1000)
I163 = K144;  O163 = M163 * I163 / 1000     // Products/Completed Ops ($8.59/$1000)
O165 = 0                                    // Excess Liability (literal)
O167 = SUM(O161:O166)                       // Total GL Premium
O169 = SUM(O167:O168)                       // Total Liability Premium (O168 blank ⇒ = O167)
O172 = O151 + O169                          // Est. Contractors Ins. Cost
O174 = O172                                 // GRAND TOTAL → named range OCIP_Deduct_Total
```
Cached check: K144=786,497.80; O145=17,090.32; O151=7,583.90; O167=O169=9,579.54; O174=17,163.44.

### Quirks
- `R139`/`R141` divide by `'MCAA RECAP'!G18` without a zero guard (unlike R42/R44) → the app should guard.
- `N147` contains the bogus formula `= Modified Premium ` (Excel stored a text formula); treat as label text.
- E8 is unlocked *with a formula* — overtyping in Excel kills the link; app should treat it as text input defaulting to job name.
- Circular display reference to `Info_Total_Bid` (see above).
- OCIP deliberately excludes SM **shop** labor/payroll (off-site; covered by contractor's own insurer, hence "ON-SITE PAYROLLS ONLY").

---

## 2. Permits (sheet "Permits")

### Purpose
Mechanical-permit fee calculator: applies jurisdiction fee tiers to the project construction value, adds plan-review and markup percentages, and exposes the chosen jurisdiction's total to MCAA RECAP.

### Layout
Row 1: `E1` "Construction Value", `F1 = 'MCAA RECAP'!H63` (Project Subtotal, = 4,500,313.73 cached), `I1` "No Permits" label, `R1` radio link, `S1` selected total. Five fee blocks in two columns:
- Left cols B–H: **City of Hillsboro (Washington County)** rows 3–18 (as-of 4/4/23); **Clackamas County** rows 22–37 (4/4/23); **City of Tualatin** rows 41–57 (4/4/22).
- Right cols K–Q: **City of Portland / Multnomah County** rows 3–18 (4/4/23); **Custom** rows 22–37 (note Q22 "4/4/23 Based on City of Salem").
Each block: tier rows (Min $, Max $, fee, $ increment), Subtotal, Plan Review %, Markup %, Total. No merged cells, no hidden rows/cols, no validations.

### USER INPUTS
- `R1` (unlocked, radio group `vmlDrawing3`, GBox spans whole sheet): jurisdiction selector. **Value map (from `S1`)**: 0 = nothing selected → 0; **1 = Portland/Multnomah (O18)**; **2 = Hillsboro/Washington Co (F18)**; **3 = Clackamas (F37)**; **4 = Custom (O37)**; **5 = No Permits → 0**; **6 = Tualatin (F57)**. Radio anchor positions confirm: K3↔1, B3↔2, B22↔3, K22↔4, I1↔5, B41↔6. Current value 1.
- **Custom block tiers (unlocked)**: `L25:N29` and `K26:K29` — Max $, fee, $ increment for 5 tiers plus tier-2..5 Min $. (`K25` Min of first tier is locked = 0.) Defaults: mins 0/2,000/25,000/50,000/100,000; maxes 2,000/25,000/50,000/100,000/999,999,999; fees 67.25/11/9/6/4; increments 2,000/1,000/1,000/1,000/1,000.
- **Custom percentages (unlocked)**: `P33` Plan Review = 0.65, `P35` Markup = 0.05.

### COMPANY CONSTANTS (locked tier tables — exact values in data.json `permits.jurisdictions`)
- **Hillsboro** (B6:E9): mins 0/5,000/10,000/100,000; maxes 5,000/10,000/100,000/999,999,999; fees 64.90/2.36/6.61/2.95; increments 2,000/100/1,000/1,000. Plan review `G14`=0.25, markup `G16`=0.05.
- **Portland/Multnomah** (K6:N9): mins 0/1,000/10,000/100,000; maxes 1,000/10,000/100,000/999,999,999; fees 127/2.69/16.45/11.28; increments 1,000/100/1,000/1,000. Plan review `P14`=0.65, markup `P16`=0.05.
- **Clackamas** (B25:E28): mins 0/5,000/10,000/100,000; maxes 5,000/10,000/100,000/999,999,999; fees 85/1.66/12.34/8.47; increments 5,000/100/1,000/1,000. Plan review `G33`=0.65, markup `G35`=0.05.
- **Tualatin** (B44:E49, 6 tiers): mins 0/501/2,001/25,001/50,001/100,001; maxes 500/2,000/25,000/50,000/100,000/999,999,999; fees 45/7/27/20/14/11; increments 500/100/1,000/1,000/1,000/1,000. Plan review `G53`=0.65, markup `G55`=0.05.

### CALCULATIONS
Tier fee (identical pattern for every tier row; left block shown, right block swaps B→K, C→L, D→M, E→N):
```js
// F{r} = IF($F$1<B{r},0, IF($F$1>=C{r}, ROUNDUP(((C{r}-B{r})/E{r}),0)*D{r}, ROUNDUP((($F$1-B{r})/E{r}),0)*D{r}))
tierFee = (CV, min, max, fee, inc) =>
  CV < min ? 0
  : Math.ceil(((CV >= max ? max : CV) - min) / inc) * fee
```
Block roll-up:
```js
subtotal   = SUM(tierFees)                       // F12=SUM(F6:F10), F31=SUM(F25:F29), F51=SUM(F44:F49), O12, O31
planReview = ROUNDUP(subtotal * planReviewPct, 2)      // ceil to cents
markup     = ROUNDUP((subtotal + planReview) * markupPct, 2)
total      = subtotal + planReview + markup      // F18/F37/F57/O18/O37
S1 = {0:0, 1:O18, 2:F18, 3:F37, 4:O37, 5:0, 6:F57}[R1]   // R1 outside 0–6 ⇒ Excel FALSE; treat as 0
```
Cached check @ CV = 4,500,313.73: Portland O12 = 51,492.88, O14 = 33,470.38, O16 = 4,248.17, **O18 = 89,211.43**; Hillsboro F18 = 18,231.35; Clackamas F37 = 66,796.67; Tualatin F57 = 87,286.82; Custom O37 = 31,963.34.

### Cross-sheet
Reads `'MCAA RECAP'!H63` (Project Subtotal). Writes `S1` → `'MCAA RECAP'!J82` ("Permit Calculator") → `J83` (Total Permits, `=SUM(J77:J82)`, may include manual permit lines J77:J81) → `H67` (Permits line of the bid). **Circularity**: H63 includes H62 (O&P) which sits above H67; permits feed H67 → H70 total but H63 (their input) excludes the permit line, so no true cycle — evaluate H63 first.

### Quirks
- Subtotal sums include one blank spare row (F10/O10, F29 left blank in fixed blocks).
- Blocks are always all computed; only `S1` selection matters downstream.
- `IF(R1=6,F57)` has no else-branch — Excel yields FALSE for other values; implement as 0.

---

## 3. Bond (sheet "Bond")

### Purpose
Performance-bond premium via progressive rate brackets on the sell price. Output `E9` = named range **`Bond`**.

### Layout / inputs
Title A1. `C2` sell price (formula), bracket table rows 3–8 (A label, B bracket width, C rate/1000, E bracket premium), `E9` total, `C10` job length months. **No unlocked cells** — brackets and rates are company constants; the only "input" is the recap-side toggle.

### COMPANY CONSTANTS
| Row | Label (A) | Bracket width (B) | Rate per $1,000 (C) |
|---|---|---|---|
| 4 | 1st | 500,000 | 14.40 |
| 5 | Next: | 2,000,000 | 8.70 |
| 6 | Next: | 2,500,000 | 6.90 |
| 7 | Next: | 2,500,000 | 6.30 |
| 8 | Over: | 7,500,000 | 5.76 |

(Marginal brackets: first $500k @ 14.40, next $2.0M @ 8.70, next $2.5M @ 6.90, next $2.5M @ 6.30, everything above $7.5M cumulative @ 5.76 — note the B8 "width" 7,500,000 is unused by the E8 formula, which is open-ended.)

### CALCULATIONS
```js
// C2: sell price before bonding
C2 = MCAA.H63 + MCAA.H64 + MCAA.H65 + MCAA.H67   // Project Subtotal + Market Recovery + Misc/Contingency + Permits
// cumulative bracket floors: c0=0, c1=B4, c2=B4+B5, c3=..+B6, c4=..+B7
E4 = ROUNDUP( C2<=B4 ? C2/1000*C4 : B4/1000*C4, 0)
E5 = ROUNDUP( C2<=c1 ? 0 : (C2<=c2 ? (C2-c1)/1000*C5 : B5/1000*C5), 0)
E6 = ROUNDUP( C2<=c2 ? 0 : (C2<=c3 ? (C2-c2)/1000*C6 : B6/1000*C6), 0)
E7 = ROUNDUP( C2<=c3 ? 0 : (C2<=c4 ? (C2-c3)/1000*C7 : B7/1000*C7), 0)
E8 = ROUNDUP( C2<=c4 ? 0 : (C2-c4)/1000*C8, 0)     // open-ended top bracket
E9 = SUM(E4:E8)                                     // → named range "Bond"
C10 = ROUNDUP((CrewMix.I7 - CrewMix.I5)/30, 0)      // job length, 30-day months (informational)
```
Cached: C2 = 4,589,525.16 → E4 = 7,200; E5 = 17,400; E6 = 14,418; **E9 = 39,018**. Each bracket premium is individually rounded **up to whole dollars** before summing.

### Cross-sheet
Reads MCAA RECAP H63/H64/H65/H67 and Crew Mix I5/I7 (schedule dates). Consumed by `'MCAA RECAP'!H66 = IF(Bond_Req="Yes", Bond, 0)`; `Bond_Req` = `'MCAA RECAP'!A66` ("Yes"/"No", radio `K60`, reset macro sets 2 = No). Circularity note: C2 uses H63–H67 which exclude H66 (the bond line itself) — evaluate those first, no cycle.

---

## 4. Work Recovery (sheet "Work Recovery")

### Purpose
Union **market-recovery** program credit: approved $/hr subsidies against takeoff labor hours, reducing the bid ("Market Recovery" negative line) and netting labor cost in the Booking Report.

### Layout
Grid rows 4/6/8/10/12 (one per trade), columns: A trade label, B Takeoff Hours (computed), D "$/Hr Approved" (input), F "Max Hours" (input), H "Work Recovery Used" (computed). Total H14. No merges/hidden/validations.

### USER INPUTS
`D4, D6, D8, D10, D12` ($/Hr Approved) and `F4, F6, F8, F10, F12` (Max Hours) — all blank in the file (absent from the extract ⇒ empty cells; the two columns are the sheet's only edit targets, treat as unlocked numeric inputs, default 0/blank).

### CALCULATIONS
```js
// Takeoff hours per trade (column B):
B4  = MCAA.G18 - MCAA.D27 - MCAA.G12   // SM Field  = SM field hrs w/adders − Arch hrs − SM detailing hrs
B6  = MCAA.H18                          // SM Shop   = shop hrs w/adders
B8  = MCAA.D27                          // Arch Field = Arch hrs in SM takeoff
B10 = MCAA.E18 - MCAA.E12               // Plumber   = plumb field hrs − plumb detailing
B12 = MCAA.F18 - MCAA.F12               // Fitter    = pipe field hrs − pipe detailing
// Recovery used (column H), r ∈ {4,6,8,10,12}:
H[r] = F[r] > B[r] ? ROUND(D[r]*B[r], 0) : ROUND(D[r]*F[r], 0)   // rate × min(maxHours, takeoffHours), whole $
H14  = SUM(H4:H12)   // Total (informational)
```

### Cross-sheet outputs (named ranges)
- `WorkRecovery_SM` = `H4:H6` → `'MCAA RECAP'!F57 = ABS(SUM(WorkRecovery_SM))*-1`
- `WorkRecovery_Arch` = `H8` → `'MCAA RECAP'!D57 = ABS(SUM(WorkRecovery_Arch))*-1`
- `WorkRecovery_Pipe` = `H10:H12` → `'MCAA RECAP'!B57 = ABS(SUM(WorkRecovery_Pipe))*-1`
- `'MCAA RECAP'!H64` (Market Recovery bid line) `= SUM(B57:G57)` — i.e. minus total recovery.
- `Booking Report` nets recovery out of specific phase-code labor rows: `E135` (shop) −ABS(H6); `E241` (SM field) −ABS(H4); `E453` (plumb) −ABS(H10); `E559` (fitter) −ABS(H12); `E783` (arch) −ABS(WorkRecovery_Arch). Wire these exact cells.

### Quirks
Rows 5,7,9,11,13 are blank spacers included in `SUM(H4:H12)`. ROUND to whole dollars happens per-row. Amounts entered are positive; all consumers apply `ABS(x)*-1`.

---

## 5. EMO (sheet "EMO")

### Purpose
**Equipment Markup Override**: takeoff lines flagged EMO get marked up at the (lower) equipment-markup rate instead of full O&P. Computes original vs revised markup on flagged equipment value; MCAA RECAP subtracts the original and adds the revised.

### Layout / inputs
Single small block; **no unlocked cells** (fully derived). Drivers live elsewhere: the per-line "EMO?" Yes flag = `TakeOff!P:P`, and the two percentages on MCAA RECAP (`G61` equipment markup = 0.10, `G62` O&P = 0.24 — both editable there).

### CALCULATIONS
```js
A6  = SUMIFS(SM_MaterialColumn, TakeOff.P, "Yes")   // SM_MaterialColumn = TakeOff!$M:$M — Σ material cost of EMO-flagged lines (cached 1,145,363.37)
C6  = MCAA.G62          // 0.24 O&P %
E6  = ROUND(A6*C6, 2)   // Original equipment markup (274,887.21)
C12 = MCAA.G61          // 0.10 equipment markup %
E12 = ROUND(A6*C12, 2)  // Revised equipment markup (114,536.34)
E15 = E6-E12<0 ? "Amount added" : "Amount reduced"   // + E16 "to estimate"/"from estimate"
E18 = ABS(E6-E12)       // 160,350.87
```

### Cross-sheet
- `'MCAA RECAP'!H61` (Equipment Mark Up line) `= EMO!E12`
- `'MCAA RECAP'!H62` (O&P line) `= ROUNDUP((G62*(H59-J45)) - EMO!E6, 0)` — full O&P on direct cost less subs, **minus** the original equipment markup.
- `'MCAA RECAP'!M62` note `= IF(EMO!E18>0, "Markup has been reduced by $"&EMO!E18&" due to EMO", "")`.

---

## App-level notes for the builder
1. Evaluation order (no true cycles): TakeOff/Crew Mix → MCAA rows ≤63 → Permits → Bond → CAT tax/H70 → OCIP (which displays H70) — Permits reads H63 only; Bond reads H63:H65+H67; OCIP's O174 feeds `C27` **above** H63, so OCIP's *calculation* inputs (labor rows 18–52) must not depend on C27: they don't (I21–I24 are pre-deduct). The only OCIP↔total link is display-only (`Info_Total_Bid`).
2. All tier/bracket/rate tables live in `indirects.data.json`; render them as editable settings with the workbook values as defaults, preserving the locked/unlocked distinction (Custom permit block + its two pcts are per-estimate inputs; everything else is company config).
3. Radio widgets: Permits R1 (7 states incl. 0 = none, 5 = No Permits), OCIP Y18/Y50/Y54/Y123/Y130/Y157 (form-only). Two Yes/No label orders are unverified from VML — flag in UI copy but functionally irrelevant.
4. Rounding fidelity matters for penny-matching: permit plan-review/markup use ROUNDUP-to-cents; bond brackets ROUNDUP-to-dollars each; work recovery ROUND-to-dollars per row; OCIP O145/O147 ROUND-to-cents, N42/N44 ROUND-to-dollars, N45 ROUND-to-cents.
5. No hidden rows/cols on any of the five sheets; all protected; only OCIP is a print "form" (3 pages) — the others are internal calculators.
