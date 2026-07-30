# MCAA RECAP — Bid Summary Sheet (implementation spec)

Companion data file: `mcaa-recap.data.json` (all defaults, row templates, dropdown lists, rates — generated from extract).

## (a) Purpose

"MCAA RECAP" is the master estimate-recap / bid-summary sheet. It pulls raw labor hours and material dollars from **TakeOff**, blends crew rates from **Crew Mix**, adds labor adders (detailing/testing/safety/QC/material-handling/LOP), supervision, subcontracts, GC/indirect costs and equipment rentals, then applies markups (subcontractor, equipment via **EMO**, overhead & profit), market recovery (**Work Recovery**), bond (**Bond**), permits (**Permits**), CAT/B&O tax, and a $5 cost-leveler to produce the **Total Bid (H70, named `Info_Total_Bid`)**. It is the hub sheet: Booking Report, Price Breakdown, Breakdown, Proposal, OCIP, Bond, EMO, Permits and Work Recovery all read from it.

Sheet is protected (VBA password `/\rct1c`, `userinterfaceonly:=True`); only unlocked cells listed under USER INPUTS are editable.

## (b) Visible layout (rows top→bottom)

| Rows | Section |
|---|---|
| 6–7 | Header: "Estimate Recap"; Bid # (B7), Bid Date/time (label D7, input ~E7), Job Name (H6:J6), Location (H7:J7). Side panel M5:N11: Project Type (N5), Project SqFt (N6), Material Lbs (N7), computed $/SqFt (N9), Field Lbs/Hr (N10), Shop Lbs/Hr (N11) |
| 9–18 | **Labor grid**: columns E=5-Plumb, F=6-Pipe, G=3-SM Field, H=2-SM Shop. Row 11 = base hours from TakeOff; rows 12–16 = % adders (Detailing, Testing, Safety, QC, Material Handling) with input %s in B/C/D (plumb/pipe/SM-field) and I (SM shop); row 17 = Loss of Production (schedule-driven); row 18 = total hours. R12:T16 = editable default percentages ("insert fixed values" button copies them into B12:D16). N19:Q27 = LOP schedule reference table |
| 20–27 | **Labor rates & value**: blended rates E21/F22/G23/H24 (named `CrewRate_Plumb/Pipe/SMField/SMShop`); labor value I21:I24, premium-time add J21:J24; I25 subtotal labor; J25 premium subtotal; row 26 OCIP toggle (B26) + Arch-hrs-in-SM-takeoff input (D27); J27 Total Labor Cost |
| 29–31 | **Material costs**: Plumb D29, Pipe G29, Sheet Metal J29; J31 Total Material Cost |
| 33–45 | **Subcontractor** table: rows 36–44 (row 36 fixed "Ext Insulation SqFt", rows 37–44 trade dropdown B, phase code auto in A, description E:H, Quote/Plug flag I, value J); J45 Total Subcontract |
| 46–55 | **Other Costs (supervision)**: rows 48–52 (% of labor → hours F → rate G → amount H); row 53 Equipment Rental (=J130 from page 3); row 54 Other GC cost (=H107 from page 2); I54 GC % of total cost; J55 Total Other Costs |
| 55–57 | **Work Recovery** strip: B57 Plumb/Pipe, D57 Architectural, F57 Sheet Metal (negative pulls from Work Recovery sheet) |
| 59–70 | **Bid build-up**: H59 direct costs; H60 sub markup; H61 equipment markup (EMO); H62 OH&P; H63 subtotal; H64 Market Recovery; H65 misc/contingency (input); H66 bond; H67 permits; H68 CAT tax; H69 cost leveler; **H70 TOTAL BID**. N70/O70/P70 = stored total / stored time / difference. I60, J60 = markup-% telltales. M62 EMO-reduction note |
| 73–107 | **Page 2 – Project General Conditions/Indirect Costs**: rows 77–106 (label B, quan/dur F, rate G, amount H); permits mini-table I76:J83; H107 TOTAL GCs |
| 110–130 | **Page 3 – Equipment Rentals**: rows 114–129 (Quantity G, Duration H, Rate/Qty I, Total J); J130 total |

Hidden rows: **34, 35** (contain literals "Quote" / "Plug" — the validation list source for I36:I44). No hidden columns.

## (c) USER INPUTS (unlocked cells)

Job info:
- **B7** Bid/estimate # (text, format `00-000`; sample "25-800"). Save macro refuses to save while 0/empty.
- **H6:J6** Job Name (text). Used in save-path naming.
- **H7:J7** Location (text, empty).
- **E7** (approx) Bid Date/time — label at D7; input cell empty in extract.
- **N5** Project Type — dropdown from named `Type_Of_Work` = 'Booking Report'!R1:R15 (default "Commercial").
- **N6** Project SqFt, **N7** Material Lbs (empty; drive N9:N11 metrics).

Labor-adder percentages (all `0.0%` format):
- **B12:B16** Plumb % — defaults .12, .04, .02, 0, .10
- **C12:C16** Pipe % — defaults .10, .06, .02, 0, .08
- **D12:D16** SM Field % — defaults .12, .01, .02, 0, .10
- **I12:I17** SM Shop % — defaults .08, 0, 0, 0, 0, 0 (I17 = shop LOP %, manual)
- **R12:T16** "Default Percentages" panel (unlocked): R=.16/.04/.02/.05/.10, S=.16/.09/.02/.05/.10, T=.16/.01/.02/0/.10 — a button ("Select this button to insert fixed values in the range to the left", note at M13) copies these into B12:D16.
- **O21** LOP factor for 5 8's schedule (default 0; O22:O24 are locked constants).

Schedule & toggles:
- **C17:D17** `Schedule_Type` — dropdown "5 8's, 5 10's, 6 10's, 60 60 50" (default "5 8's").
- **B26:C26** `OCIP_GL_Toggle` (B26 stores value; C26 = legacy `OCIP_Req` named range, empty because merged) — dropdown "No OCIP,OCIP,OCIP GL Only" (default "No OCIP").
- **D27** Arch Hrs in SM Takeoff (default 0; warning D28 if > G18; read by OCIP + Work Recovery sheets).
- **A65:B66**: **A66** `Bond_Req` — dropdown "No, Yes" (default "No").
- **E68** tax selector — dropdown "Oregon CAT Tax, Washington B&O Tax, No Tax" (default "Oregon CAT Tax").

Subcontractor table (rows 36–44): **B37:D44** trade (dropdown `Codes_Subcontractor`, no blanks), **E36:H44** description (merged per row), **I36:I44** Quote/Plug flag (list from H34:H35), **J36:J44** dollar value. Row 36 label fixed ("Ext Insulation SqFt", phase 7-03).

Supervision % (rows 48–52): **E48:E52** — defaults .10, .10, .08, 0, .10. **N48:N52** DEFAULTS panel (unlocked: .10, .15, .15, 0, .15) with second "insert fixed values" button (note at M47).

Markups: **G60** Subcontractor Mark Up (.10), **G61** Equipment Mark Up (.10), **G62** Overhead and Profit (.24).

Bid adjustments: **H65** Miscellaneous Cost/Contingency (No Markup) — empty $ input; **I69** manual add/deduct folded into the cost leveler (empty).

GC page (rows 77–106): rates **G78** (.002), **G79** (.03), **G80** (0), **G82:G96** ($0 each), **G98/G100/G102** (unlocked but formula-seeded from Crew Mix I19/I19/I12 → treat as overridable rate defaults 56.03/56.03/118.71), **G99/G101/G103:G105** (0), **G106** (.04); quantities **F78?–F105** (QUAN/DUR column, empty; E76 & F76 both headed QUAN/DUR — E81/F81 special-cased for trucking); **D102/E102** CAD-operator qty × duration (F102=D102*E102 is locked); **B101** and **B103:B105** GC description (dropdown `Codes_GC`); **G81** trucking rate (default ='Crew Mix'!I16 → 82.88, overridable); **E81** `Trucking_Hrs`, **F81** `Trucking_Loads`.
Permits mini-table: **I77:I81** permit labels (Plumbing/HVAC/Med Gas/Boiler/Special Insp), **J77:J81** amounts ($0).

Equipment page (rows 114–129): **G114:G129** Quantity, **H114:H129** Duration (empty), **I114:I129** Rate per Qty — defaults 250, 1000, 1200, 600, 0, 1550, 1750, 1000, 0, 0, 0, 0, (I126 n/a), 0, 0, 0; **B127:F129** extra rows with `Codes_Subcontractor` dropdown.

Notes cells (unlocked, free text): L65, L66, L68, L106. Legacy/no-op unlocked cells: K25(=1), K26(=2), K60(=2).

Total distinct unlocked input cells with cached values: **123** (plus the empty input ranges noted above: H7, E7, N6, N7, J36:J44, E/H descriptions, H65, I69, E81, F81, F-column quantities, D102/E102, G/H equipment quantities).

## (d) COMPANY CONSTANTS (locked literals feeding calculations — expose as editable app settings)

| Cell | Value | Meaning |
|---|---|---|
| O22 | 0.15 | LOP factor, 5 10's schedule |
| O23 | 0.25 | LOP factor, 6 10's |
| O24 | 0.25 | LOP factor, 60 60 50 |
| Q21:Q24 | 0 / 15 / 25 / 25 | LOP default reference column (display only) |
| H34 / H35 | "Quote" / "Plug" | list source for I36:I44 (hidden rows) |
| in I68 formula | 0.004 | Oregon CAT tax rate |
| in I68 formula | 0.00484 | Washington B&O tax rate |
| in I68 formula | 0.0015 | Multnomah County tax adder (always added) |
| in H69 formula | 5 | cost-leveler rounding step ($5) |
| in J24 formula | /2 | halves TakeOff col AM premium for SM shop |
| Fixed phase codes col A | see data.json | 1-01…8-24 per row (locked labels) |
| Blend weights | 4+1/5, 4+2/6, 12+5/17 | OT blending per schedule (in E21/F22/G23 formulas) |

Locked-but-formula rate feeds (keep wired, not literals): G48='Crew Mix'!I12, G49/G50='Crew Mix'!I138, G51/G52='Crew Mix'!I13, G97='Crew Mix'!I14, H24=`CrewRate_SMShop_Straight`.

## (e) CALCULATIONS (all patterns, JS pseudo-code)

Base hours (row 11) — from TakeOff (`Takeoff_PayType`=TakeOff!T:T, `SM_FieldLaborColumn`=TakeOff!H:H, `SM_Shop_Labor`=TakeOff!K7):
```js
E11 = SUMIF(TakeOff.T, "Plumb Takeoff", TakeOff.H)
F11 = SUMIF(TakeOff.T, "Pipe Takeoff",  TakeOff.H)
G11 = SUMIF(TakeOff.T, "Sheet Metal Takeoff", TakeOff.H)
H11 = TakeOff.K7                        // SM_Shop_Labor
```
Adder rows 12–16 (r = row):
```js
E_r = E11 * B_r                          // plumb  (no rounding)
F_r = F11 * C_r                          // pipe   (no rounding)
G_r = round2(G11 * D_r)                  // SM field (ROUND ..,2)
H_r = H11 * I_r                          // SM shop (rows 12–17)
```
LOP row 17 (lop = {"5 8's":O21, "5 10's":O22, "6 10's":O23, "60 60 50":O24}[Schedule_Type]):
```js
E17 = E11*lop;  F17 = F11*lop;  G17 = G11*lop;  H17 = H11*I17
// Excel returns FALSE if Schedule_Type matches none — guard with 0
```
Totals row 18: `X18 = SUM(X11:X17)` for X in E,F,G,H.

Blended labor rates (S=straight, O=overtime crew rates from Crew Mix):
```js
function blend(S, O, sched) {
  switch(sched){ case "5 8's": return S;
    case "5 10's":  return (4*S + 1*O)/5;
    case "6 10's":  return (4*S + 2*O)/6;
    case "60 60 50":return (12*S + 5*O)/17; } }
E21 = blend(CrewRate_PlumbFitter_Straight /*CrewMix I148*/, CrewRate_PlumbFitter_Overtime /*I168*/, Schedule_Type)   // = CrewRate_Plumb
F22 = same as E21                                                                                                    // = CrewRate_Pipe
G23 = blend(CrewRate_SMField_Straight /*I23*/, CrewRate_SMField_Overtime /*I44*/, Schedule_Type)                     // = CrewRate_SMField
H24 = CrewRate_SMShop_Straight /*I86*/                                                                               // = CrewRate_SMShop (no blend)
```
Labor value & premium time:
```js
I21 = E21*E18;  I22 = F22*F18;  I23 = G23*G18;  I24 = H24*H18
I25 = SUM(I21:I24)                                  // Subtotal Labor Cost
J21 = SUMIF(TakeOff.T,"Plumb Takeoff", TakeOff.AL)  // premium-time $
J22 = SUMIF(TakeOff.T,"Pipe Takeoff",  TakeOff.AL)
J23 = SUMIF(TakeOff.T,"Sheet Metal Takeoff", TakeOff.AL)
J24 = SUM(TakeOff.AM)/2
J25 = SUM(J21:J24)
```
OCIP deduction & total labor:
```js
C27 = OCIP_GL_Toggle=="No OCIP" ? 0
    : OCIP_GL_Toggle=="OCIP"         ? -OCIP.O174   // OCIP_Deduct_Total
    : OCIP_GL_Toggle=="OCIP GL Only" ? -OCIP.O169 : 0
J27 = I25 + J25 + C27                                // Total Labor Cost
D28 = (D27 > G18) ? "ARCH HRS TO HIGH" : ""          // warning only
```
Materials (`SM_MaterialColumn`=TakeOff!M:M, `SM_Material`=TakeOff!M7):
```js
D29 = SUMIF(TakeOff.T,"Plumb Takeoff", TakeOff.M)
G29 = SUMIF(TakeOff.T,"Pipe Takeoff",  TakeOff.M)
J29 = TakeOff.M7 - D29 - G29                         // SM = total minus others
J31 = D29 + G29 + J29                                // Total Material Cost
```
Subcontractor phase codes & total:
```js
A37..A44 = B_r=="" ? "" : "7-" + INDEX(PhaseCodes.A4:H102, MATCH(B_r, Codes_Subcontractor, 0), 1)
J45 = SUM(J36:J44)                                   // Total Subcontract
```
Supervision / Other Costs rows 48–52:
```js
F48 = round2(SUM(E18:H18) * E48)         // PM: % of ALL hours
F49 = round2(E18 * E49);  F50 = round2(F18 * E50)
F51 = round2(G18 * E51);  F52 = round2(G18 * E52)   // both arch & SM keyed to G18
H48..H51 = roundUp2(F_r * G_r)           // ROUNDUP(...,2)
H52 = F52 * G52                          // plain product, no rounding
H53 = J130                               // equipment rentals total (page 3)
H54 = H107                               // GC total (page 2)
I54 = (H53+H54)==0 ? 1 : (H53+H54)/H59   // % GC of total cost
J55 = SUM(H48:H54)                       // Total Other Costs
```
Work recovery / market recovery:
```js
B57 = -ABS(SUM(WorkRecovery.H10:H12))    // Plumb/Pipe
D57 = -ABS(WorkRecovery.H8)              // Arch
F57 = -ABS(SUM(WorkRecovery.H4:H6))      // Sheet Metal
H64 = SUM(B57:G57)                       // Market Recovery (named Info_Market_Recovery, ≤ 0)
```
Bid build-up:
```js
H59 = J55 + J45 + J27 + J31              // Total of Direct Costs
H60 = roundUpInt(G60 * J45)              // ROUNDUP(..,0) Subcontractor markup
H61 = EMO.E12                            // Equipment markup $ (EMO computes from G61)
H62 = roundUpInt(G62*(H59 - J45) - EMO.E6)  // OH&P on directs excl. subs, less EMO carve-out
H63 = SUM(H59:H62)                       // Project Subtotal
H65 = user input (misc/contingency, no markup)
H66 = (Bond_Req=="Yes") ? Bond.E9 : 0    // Bond sheet reads H63,H64,H65,H67
H67 = J83                                // Total Permits
I68 = (E68=="Oregon CAT Tax" ? 0.004 : E68=="Washington B&O Tax" ? 0.00484 : 0) + 0.0015
H68 = SUM(H63:H67) * I68                 // CAT/B&O + Multnomah tax
H69 = (ceil(SUM(H63:H68)/5)*5) - SUM(H63:H68) + I69   // Cost Leveler → next $5
H70 = SUM(H63:H69)                       // TOTAL BID (Info_Total_Bid)
```
Telltales / stored total:
```js
I60 = H62==0 ? 0 : (H60+H61+H62)/H70                 // markup % of bid
J60 = SUM(E11:H11)==0 ? 0 : (H60+H61+H62)/J27        // % labor markup
M62 = EMO.E18>0 ? "Markup has been reduced by $"+EMO.E18+" due to EMO" : ""
P70 = H70 - N70                                       // Info_Total_Bid_Stored_Difference
// N70 (stored $) & O70 (timestamp) are WRITTEN by VBA (Ctrl+T form "store" button):
//   N70 = H70; O70 = now()
N9  = N6==0 ? "" : H70/N6                             // $/SqFt
N10 = N7==0 ? "" : N7/SUM(E18:G18)                    // Field Lbs/Hr
N11 = N7==0 ? "" : N7/H18                             // Shop Lbs/Hr
```
Page 2 GCs (rows 77–106; H amounts):
```js
H78 = round2(J31 * G78)          // Safety supplies, % of materials
H79 = round2(I25 * G79)          // Small tools, % of straight field labor (pre-premium I25)
H80 = round2(J27 * G80)          // 3rd-party freight, % of total labor
H81 = round2(F81 * E81 * G81)    // Trucking: Loads * Hrs * Rate (named Trucking_Total)
H82..H105 = round2(F_r * G_r)    // generic qty × rate  (F102 = D102*E102 for CAD)
H106 = round2(G106 * (J27 + J31))// Misc % of takeoff labor+material
H107 = SUM(H78:H106)             // TOTAL GCs → feeds H54
A101..A105 = B_r=="" ? "" : "1-" + INDEX(PhaseCodes.A4:H102, MATCH(B_r, Codes_GC, 0), 1)
```
Permits mini-table: `J82 = Permits.S1` (permit calculator; Permits reads H63 → order-dependent, see quirks); `J83 = SUM(J77:J82)`.

Page 3 equipment (rows 114–129): `J_r = round2(G_r * H_r * I_r)`; `J130 = SUM(J114:J129)` → feeds H53. `A127..A129` same INDEX/MATCH pattern as A37 ("7-" prefix).

## (f) Cross-sheet wiring

READS: TakeOff (T:T pay-type, H:H field labor, K7 shop labor, M:M / M7 material, AL:AL premium $, AM:AM), Crew Mix (I12, I13, I14, I16, I19, I138; CrewRate_* straight/OT cells I23/I44/I86/I148/I168), EMO (E6, E12, E18), OCIP (O169, O174), Bond (E9), Permits (S1), Work Recovery (H4:H6, H8, H10:H12), Phase Codes (A4:H102 + Codes_GC B4:B102 + Codes_Subcontractor H4:H102), Booking Report (R1:R15 Type_Of_Work list).

WRITES/EXPORTS (named): `Info_Total_Bid`(H70), `Info_Total_Bid_Stored`(N70), `Info_Total_Bid_Stored_Time`(O70), `Info_Total_Bid_Stored_Difference`(P70), `Info_Market_Recovery`(H64), `CrewRate_Plumb`(E21), `CrewRate_Pipe`(F22), `CrewRate_SMField`(G23), `CrewRate_SMShop`(H24), `Schedule_Type`(C17), `OCIP_GL_Toggle`(B26), `OCIP_Req`(C26, legacy), `Bond_Req`(A66), `Subsistence`(H92:H95), `Trucking_Hrs/Loads/Rate/Total`(E81/F81/G81/H81). Consumers: Bond (=SUM(H63,H64,H65,H67)), EMO (reads G61,G62), Permits (reads H63), OCIP (reads F18/G18, F48:F52, H48:H52, I21:I23, D27), Work Recovery (reads E12/F12/G12, E18/F18/G18, D27), Booking Report (dozens of cells incl. H6, H63, H65, H67, H70, G/H rows 78–106, Trucking_Total, Info_Market_Recovery, OCIP_GL_Toggle), Breakdown & Price_Breakdown (labor rows, A101/H101 GC rows, H70), Proposal.

## (g) Quirks

1. **Goal Seek (vba_GoalSeek.bas)** — two buttons: `GoalSeek_MCAA` on **E12:G16** — prompts "Hours?" and solves the *percentage* cell for that target hours (E targets change B12:B16, F→C12:C16, G→D12:D16; only if base hours row 11 > 0). `GoalSeek_MCAA2` on **F48:F52** — solves E48:E52 % for target supervision hours. App equivalent: pct = targetHours / baseHours (linear, exact).
2. **Stored-total mechanism** — Ctrl+T opens `EstimateTotal` form showing live H70; its button copies H70→N70 and `Now()`→O70; P70 shows drift since last store. N70/O70 are locked cells written by macro (userinterfaceonly protection).
3. **Save macro (vba_Save.bas)** — forces non-zero B7, then saves to `O:\Estimates\{B7}_{H6}\{H6} Estimate.xlsm` (xlsm, FileFormat 52). Falls back to SaveAs dialog on error.
4. **Protection (vba_Protection.bas)** — all sheets (except one whose A1 = "Proposal") protected with password `/\rct1c`; `Workbook_BeforePrint` also blocks printing when Crew Mix C20 empty while D7>0.
5. **Hidden rows 34–35** hold the "Quote"/"Plug" validation list. Ctrl+Q/Ctrl+W (vba_Plug_Quote.bas) merely recolor selection font (black = quote, red = plug) — a visual flag, replicate as a cell style toggle.
6. **Insert-defaults buttons** (notes at M13, M47): copy R12:T16 → B12:D16 and N48:N52 → E48:E52. The macro body isn't in extracted modules (likely button-assigned simple copy); implement as "reset to defaults".
7. **LOP formula returns FALSE** (not 0) if `Schedule_Type` matches no listed value — guard in app. Validation also allows "60 60 50" text exactly (no apostrophe-s).
8. **Ordering/pseudo-circularity**: Bond!E9 ← SUM(H63,H64,H65,H67) while H66 = Bond!E9 (bond excluded from its own basis — OK); Permits!S1 ← H63 while H67 = J83 ← Permits!S1 (permits excluded from H63 — OK); EMO reads G61/G62 and feeds H61/H62. Evaluate in order: H59→H63 → Permits/Bond/tax → H70. No true circular refs, but multi-sheet two-pass wiring required.
9. **H52 rounding inconsistency**: H48:H51 use ROUNDUP(x,2); H52 is a raw product. J24 halves TakeOff AM. H54 displays 1-decimal format but full precision flows.
10. **Legacy cells**: K25=1, K26=2, K60=2 (unlocked), L25/L26=1/2, P25="huge", P26="ginormous" — relics of old form-control links (OCIP_Req/Bond_Req 1/2 era per commented Help-form code); nothing references them. `OCIP_Req` (C26) is empty because B26:C26 merged — keep the named range pointing at the merged value.
11. **A101/H101, A103/H103 heavily referenced by Breakdown/Booking** — GC row user-picked phase codes must stay exportable per row.
12. **D27 (Arch hrs)** feeds OCIP and Work Recovery ratio splits — although its own sheet only uses it for the D28 warning.
13. **Subsistence** named range = H92:H95 (computed F×G rows) — referenced by Phase Codes sheet; the four Subsistence GC rows must keep their identity.
14. M-column cheat sheet (Ctrl+H/I/T/B/Q/W) is informational text; M1 "Updated 8/26/25" + M2 changelog note.
