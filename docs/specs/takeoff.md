# TakeOff sheet — functional spec

Companion data file: `takeoff.data.json` (group map, dropdowns, rate-cell definitions, CAE mapping table, full seed data + Excel cached reference values). Sheet is protected; state visible; max_row 1046, max_col 39 (AM).

## (a) Purpose

TakeOff is the CORE estimating sheet. The estimator builds the bid as **1 "CAE" group + 31 numbered takeoff groups** (work packages / bid areas). Each group holds phase-coded line items with quantity, field/shop labor unit-hours and multipliers, and material unit cost. The sheet computes per-line field hours (H), shop hours (K) and material dollars (M); per-group subtotals; converts hours to labor **cost** via crew rates (columns U–AF, normally hidden); and produces workbook-wide totals in row 7 that feed Breakdown, MCAA RECAP, Crew Mix, Booking Report, Price Breakdown and EMO. The CAE group is auto-populated from the `SM Import` sheet (TSI/QuickPen ductwork import) and can be "relocated" into a numbered group via VBA.

## (b) Visible layout

- **Rows 1–7 (sheet header):**
  - L1:R6 "Sheet Navigation" block: L2 shows CAE name (`=Breakdown_SMCAE`), then group names 1–31 laid out down-then-across: L3:L6=SM1–4, M2:M6=SM5–9, N2:N6=SM10–14, O2:O6=SM15–19, P2:P6=SM20–24, Q2:Q6=SM25–29, R2:R3=SM30–31; each cell `=IF(Breakdown_SMn="","Empty",Breakdown_SMn)`. **31 form-control checkboxes sit on this grid** (one per group, next to each name) linked to the group exclude cells `K38…K1017` (named `SM_ExludeGroup1..31`). Clicking a name navigates to the group (hyperlink behavior); the checkbox excludes it.
  - D4/D5/D6: self-check error banners — `=IF(SUM(H:H)/3=H7,"","FIELD LABOR ERRORS CONTACT ERIC K")` (and K/K7 "SHOP LABOR ERRORS", M/M7 "MATERIAL COST ERRORS"). Column sums are 3× the true total because each column contains items + group subtotal + row-7 grand total.
  - T2='SM', T3='Plumb', T4='Pipe'; U1:AF1 & U6:AF6 rate-column captions; rate rows 2–4 (see constants).
  - Row 7 = grand totals (see calculations). AL5/AM5 'Breakout', AL6 'Field Premium Add', AM6 'Shop Premium Add'.
  - Macro buttons: E1 `HideSMBookingColumns` (toggles hiding of phase-code columns A:C), E4 `InsertRowsAndFillFormulas_caller`, G1 `Select_CAE_Destination` (Relocate CAE), I1 `Goto_Phase_Codes`, I4 `Goto_MCAA_RECAP`.
- **CAE group (rows 8–36):** row 8 column headers; row 9: D9="CAE" (locked), E9="Type" label, F9(:G9 merged)=takeoff-type dropdown (unlocked); item rows 10–35 (10–33 auto-mapped from SM Import, 34="Miscellaneous" remainder, 35 spare); row 36 subtotals H36/K36/M36. No exclude checkbox, no P/Q/R validation for CAE rows.
- **Numbered group n (31 blocks):** 3-row header then items then subtotal row:
  - header row `hdr` (38, 72, 103, 136, 171, 204, 272, 304, 335, 366, 397, 428, 459, 490, 521, 552, 583, 614, 645, 676, 707, 738, 769, 800, 831, 862, 893, 924, 955, 986, 1017): E="Type" label, **F(:G merged) = takeoff-type dropdown** (unlocked, default "Sheet Metal Takeoff"), I="Exclude Section" label, **K = exclude boolean** (unlocked, FALSE default; checkbox-linked; named `SM_ExludeGroupn`).
  - column-header row `hdr+1`: A"Material Phase" B"Shop Phase" C"Field Phase" D"Description" E"Quantity" F"Field Lab Unit" G"Field Lab Multiplier" H"Field Lab Total" I"Shop Lab Unit" J"Shop Lab Multiplier" K"Shop Lab Total" L"Material Unit" M"Material Total" N"NOTES" P"Equipment Markup Overide" Q"Overtime" R"Shift".
  - group-name row `hdr+2`: **D = group name** (unlocked; named `Breakdown_SMn`).
  - item rows / subtotal row per group (itemsStart–itemsEnd, subtotalRow — exact map in data.json `groups`): G1: 41–69/70, G2: 75–100/101, G3: 106–133/134, G4: 139–168/169, G5: 174–201/202, G6: 207–269/270 (enlarged by row-inserts), G7: 275–301/302, G8: 307–332/333, G9: 338–363/364, G10: 369–394/395, G11: 400–425/426, G12: 431–456/457, G13: 462–487/488, G14: 493–518/519, G15: 524–549/550, G16: 555–580/581, G17: 586–611/612, G18: 617–642/643, G19: 648–673/674, G20: 679–704/705, G21: 710–735/736, G22: 741–766/767, G23: 772–797/798, G24: 803–828/829, G25: 834–859/860, G26: 865–890/891, G27: 896–921/922, G28: 927–952/953, G29: 958–983/984, G30: 989–1014/1015, G31: 1020–1045/1046.
  - The **last item row of every numbered group is hidden** (hidden_rows = 69,100,133,…,1045) — a blank spare row kept as formula template.
- Columns T–AM are back-office labor-cost columns; the `Hide_Takeoff_Cells` macro hides T:AI (extraction shows currently unhidden, but the app should treat T–AM as non-user-facing detail).

## (c) USER INPUTS (unlocked cells)

Per item row of every group (validation lists apply to numbered groups only; CAE rows 10–35 have unlocked A/B/C but computed D–M):

| Col | Label | Validation / format | Notes |
|---|---|---|---|
| A | Material Phase | list `Phase_Code_List_Material` ('Phase Codes'!$S$4:$S$795); text `@` | e.g. "3-13" |
| B | Shop Phase | list `Phase_Code_List_Shop` ('Phase Codes'!$Q$4:$Q$102); text | |
| C | Field Phase | list `Phase_Code_List_Field` ('Phase Codes'!$O$4:$O$696); text | |
| D | Description | free text | |
| E | Quantity | number, nf `0.00` | |
| F | Field Lab Unit | hours per unit, nf `0.00` | |
| G | Field Lab Multiplier | number | blank ⇒ treated as 1 (only G310=0.9 in seed) |
| I | Shop Lab Unit | hours per unit | |
| J | Shop Lab Multiplier | blank ⇒ 1 | no values in seed |
| L | Material Unit | $ per unit, nf `0.00`; users often type arithmetic formulas here (e.g. `=432106*0.5`) — app input should accept expressions | |
| N | NOTES | free text (vendor names, "Plug", "TO", …) | |
| P | Equipment Markup Overide | list `"Yes"`, blank allowed | "Yes" flags the row's material $ as vendor equipment → summed by EMO sheet |
| Q | Overtime | list `"OT, DBLT"`, blank allowed | |
| R | Shift | first item row of each group: list `"SWING, GRAVE, SPECIAL"`; all other rows: `"SWING, GRAVE, HAZARD"` (quirk: formulas only recognize SWING/GRAVE/SPECIAL; HAZARD has no cost effect) | |

Per group: group name `D<hdr+2>` (`Breakdown_SMn`, free text); takeoff type `F<hdr>` (list "Sheet Metal Takeoff,Plumb Takeoff,Pipe Takeoff"; blank ⇒ "Sheet Metal Takeoff"); exclude flag `K<hdr>` (TRUE/FALSE checkbox, `SM_ExludeGroupn`). CAE has type cell F9 only.

Unlocked non-empty cell count in seed workbook: 937. Named range `Takeoff_Type` = TakeOff!$E$5 exists but the cell is empty/locked (legacy — safe to ignore).

## (d) COMPANY CONSTANTS

TakeOff itself holds **no hard-coded rates** — rate cells U2:AF4 are formulas pulling named ranges from Crew Mix (values below are current cached results; keep them editable settings sourced from the Crew Mix spec):

- U2 `=CrewRate_SMField` → 103.07 · V2 `=CrewRate_SMField_Overtime-CrewRate_SMField` → 34.66 · W2 `=CrewRate_SMField_DoubleTime-CrewRate_SMField` → 68.96 · X2 `=CrewRate_SMField_Swing` → 8.436 · Y2 `=CrewRate_SMField_Grave` → 12.9352 · Z2 `=CrewRate_SMField_Special` → 5.624
- Rows 3 (Plumb) and 4 (Pipe) are identical to each other: U `=CrewRate_PlumbFitter_Straight` → 132.95, V `=CrewRate_PlumbFitter_Overtime-CrewRate_PlumbFitter_Straight` → 46.31, W `=CrewRate_PlumbFitter_DoubleTime-…Straight` → 92.25, X/Y/Z all `=CrewRate_PlumbFitter_Swing` → 7.32 (grave & special reuse swing — intentional quirk).
- AA2 `=CrewRate_SMShop_Straight` → 111.45 · AB2 `=CrewRate_SMShop_Overtime-…Straight` → 31.61 · AC2 `=CrewRate_SMShop_DoubleTime-…Straight` → 63.22 · AD2 `=CrewRate_SMShop_Swing` → 8.436 · AE2 `=CrewRate_SMShop_Grave` → 12.9352 · AF2 `=CrewRate_SMShop_Special` → 5.624
- LOP factors used in H: `CrewRate_PlumbFitter_SwingLOP` ('Crew Mix'!$F$147), `CrewRate_PlumbFitter_GraveLOP` ('Crew Mix'!$F$148) — loss-of-productivity fractions.

## (e) CALCULATIONS (row-generic pseudo-code; r = item row, g = its group)

```js
exclude   = SM_ExludeGroup[g] === true            // CAE: always false
payType   = groupTypeCell === "" ? "Sheet Metal Takeoff" : groupTypeCell   // col T, per row: =IF($F$hdr="","Sheet Metal Takeoff",$F$hdr)
S_r       = (payType === "Sheet Metal Takeoff") ? "" : (R_r === "" ? "" : "LOP")   // col S (locked helper)

// H — Field Lab Total (numbered groups; LOP uplift only applies to Plumb/Pipe rows with a shift)
lopFactor = 1
if (S_r === "LOP" && R_r === "SWING")   lopFactor *= 1 + CrewRate_PlumbFitter_SwingLOP
if (S_r === "LOP" && R_r === "GRAVE")   lopFactor *= 1 + CrewRate_PlumbFitter_GraveLOP
if (S_r === "LOP" && R_r === "SPECIAL") lopFactor *= 1 + CrewRate_PlumbFitter_SwingLOP   // special uses Swing LOP
H_r = exclude ? 0 : E_r * F_r * (G_r === "" ? 1 : G_r) * lopFactor

// K — Shop Lab Total ; M — Material Total
K_r = exclude ? 0 : E_r * I_r * (J_r === "" ? 1 : J_r)
M_r = exclude ? 0 : E_r * L_r

// group subtotals (rows named Breakdown_SM_Field_n / _Shop_n / _Material_n)
H_sub = SUM(H items) ; K_sub = SUM(K items) ; M_sub = SUM(M items)

// Field labor cost columns (rate row: 2=SM, 3=Plumb, 4=Pipe chosen by payType)
U_r = ROUND(H_r * Urate, 2)                                  // straight cost
V_r = ROUND(Q_r === "OT"   ? H_r * Vrate : 0, 2)             // OT add
W_r = ROUND(Q_r === "DBLT" ? H_r * Wrate : 0, 2)             // DT add
X_r = ROUND(R_r === "SWING"   ? ROUND(H_r * Xrate, 2) : 0, 2)  // swing add (Excel: nested IF/SUM, non-match → FALSE → 0)
Y_r = ROUND(R_r === "GRAVE"   ? ROUND(H_r * Yrate, 2) : 0, 2)
Z_r = ROUND(R_r === "SPECIAL" ? ROUND(H_r * Zrate, 2) : 0, 2)

// Shop labor cost columns (single SM shop rate; no payType branch)
AA_r = ROUND(K_r * AA2, 2)
AB_r = ROUND(Q_r === "OT"   ? K_r * AB2 : 0, 2)
AC_r = ROUND(Q_r === "DBLT" ? K_r * AC2 : 0, 2)
AD_r = ROUND(R_r === "SWING"   ? K_r * AD2 : 0, 2)
AE_r = ROUND(R_r === "GRAVE"   ? K_r * AE2 : 0, 2)
AF_r = ROUND(R_r === "SPECIAL" ? K_r * AF2 : 0, 2)

AG_r = SUM(U_r..Z_r)    // Field Labor cost   (named Breakdown_FieldLaborCost_n over group item ranges)
AH_r = SUM(AA_r..AF_r)  // Shop Labor cost    (named Breakdown_ShopLaborCost_n)
AI_r = SUM(U_r..AF_r)   // Total Labor cost
AJ_r = M_r + AI_r       // Total Row Cost
AL_r = SUM(V_r..Z_r)    // Field Premium Add (all non-straight adds)
AM_r = SUM(AB_r..AF_r)  // Shop Premium Add
```

**Row 7 grand totals** (over all item+subtotal rows; Excel sums to row 1549 — harmless over-range):
`H7 = SUM(all 32 group H subtotals)` (named `SM_Field_Labor`); `K7` likewise (`SM_Shop_Labor`); `M7` likewise (`SM_Material`, $ format); `U7..AF7 = SUM(col 10:1549)` — U7/V7/W7 named `Labor_Cost_Field_Straight/OT/Double`, AA7/AB7/AC7 named `Labor_Cost_Shop_Straight/OT/Double`; `AG7,AH7,AI7,AJ7,AL7,AM7` column sums. Note U7…AM7 include item rows only (rows 10+), so they are true totals; H7/K7/M7 sum the named subtotals.

**CAE auto-mapping (rows 10–34):** each row filters SM Import lines by Type/Material/CutType and sums Qty (E), CalcFieldHours (H), CalcShopHours (K), MaterialCost (M) via SUMPRODUCT. Full criteria table in data.json `caeMappingTable`; summary (Type criterion unless noted): 10 Hanger; 11 Floor Support; 12 Rect Duct+GALV+Decoiled Straight; 13 Rect Duct+GALV+Machine Cut; 14 Round Duct+GALV+Decoiled Straight; 15 Round Duct+GALV+(Machine Cut + Pipework); 16 (Material SS or "SS 304 2B")+Decoiled Straight; 17 same +Machine Cut; 18 Oval Duct; 19 Material=Alum; 20 Material=BLK (E/M also require Type=Rectangular Duct; H/K don't — inconsistency in source); 21 Fire Smoke Damper; 22 Fire Damper; 23 Canvas Connector; 24 Air Device; 25 Flex Duct; 26 Louver; 27 Access Door; 28 Control Damper; 29 VAV; 30 Duct Accessory; 31 Exhaust Fan; 32 AHU; 33 CutType=Liner. Row 34 "Miscellaneous" remainders: `E34='SM Import'!F7-SUM(E10:E33)`, `H34=CAE_Field_Hours_Total-SUM(H10:H33)` ('SM Import'!H7), `K34=CAE_Shop_Hours_Total-SUM(K10:K33)` ('SM Import'!J7), `M34=ABS(CAE_Material_Cost_Total-SUM(M10:M33))` ('SM Import'!K7). CAE H/K/M rows ignore exclude/multipliers. CAE subtotal row 36 sums rows 10–35.

## (f) Cross-sheet inputs / outputs

Reads: `SM Import` (SMImport_* dynamic named ranges C/D/E/F/H/J/K col 9+, plus F7/H7/J7/K7 totals); `Crew Mix` CrewRate_* names (see constants); Breakdown_SMn names are self-referential (on-sheet).

Written/consumed elsewhere (wire these exactly):
- **Breakdown**: per group — name `=TakeOff!$D$74` etc.; field cost `=TakeOff!$H$101*CrewRate_SMField_Straight`; shop cost `=TakeOff!$K$101*CrewRate_SMShop_Straight`; material `=TakeOff!$M$101` (i.e. group H/K/M subtotal cells; 128 refs).
- **MCAA RECAP**: E11/F11/G11 `=SUMIF(Takeoff_PayType,"Plumb|Pipe|Sheet Metal Takeoff",SM_FieldLaborColumn)` (H hours by trade); H11 `=SM_Shop_Labor`; D29/G29 material $ by trade via SUMIF on M column; J29 `=SM_Material-D29-G29`; J21/J22/J23 `=SUMIF(Takeoff_PayType,…,TakeOff!AL:AL)` (field premium $ by trade); J24 `=SUM(TakeOff!AM:AM)/2` (halved shop premium — quirk: AM contains only item rows so /2 likely legacy of duplicated subtotals; replicate as-is).
- **Crew Mix**: SM field straight/OT/DT hours `SUMIF(S)` on H with Q ("OT"/"DBLT") and payType filters (D5/D26/D47); shop D68 `=SM_Shop_Labor-…`, D89/D110 by Q on K col; Plumb D131/D151/D171; Pipe analogues.
- **Booking Report**: labor-hour and material buckets by phase code — `SUMIFS(SM_FieldLaborColumn,PC_SM_Field,$A22)`, `SUMIFS(SM_ShopLaborColumn,PC_SM_Shop,$A128)`, `SUMIFS(SM_MaterialColumn,PC_SM_Material,$A128)`, plus `SUMIFS(Takeoff_Total_Shop_Labor_Cost,PC_SM_Shop,…)` (col AH) and other Takeoff_Total_* whole-column names (AG=field cost, AH=shop cost, AI=total cost, U=straight field cost).
- **EMO**: A6 `=SUMIFS(SM_MaterialColumn,TakeOff!P:P,"Yes")` — total vendor-equipment material.
- **Price Breakdown**: group names via Breakdown_SMn (127 refs).
- Whole-column named ranges used by consumers: `PC_SM_Material`=A:A, `PC_SM_Shop`=B:B, `PC_SM_Field`=C:C, `SM_FieldLaborColumn`=H:H, `SM_ShopLaborColumn`=K:K, `SM_MaterialColumn`=M:M, `SM_OvertimeColumn`=Q:Q, `Takeoff_PayType`=T:T, `Takeoff_Total_Field_Labor_Cost`=AG:AG, `Takeoff_Total_Shop_Labor_Cost`=AH:AH, `Takeoff_Total_Labor_Cost`=AI:AI, `Takeoff_Total_Straight_Field_Labor_Cost`=U:U. **Caution:** whole-column SUMIFs over H/K/M include the group subtotal rows and row 7, but those rows have no phase code/paytype in the criteria column, so criteria-based SUMIFs stay correct; the D4:D6 sanity checks exploit the 3× duplication.

## (g) Quirks

1. Hidden rows: last item row of each numbered group (69,100,…,1045) hidden as spare template. `Hide_Takeoff_Cells` macro (stale row numbers 66,97,128…) also hides columns T:AI — treat T–AM as internal.
2. `HideSMBookingColumns` button toggles visibility of phase-code columns A:C.
3. **Insert Rows VBA**: refuses above row 41; inserts N rows below the active row inside a group, autofills formulas (H,K,M,S,T,U–AM) and clears constants — all group boundaries, named subtotal ranges and consumer references shift accordingly. In the app, model groups as variable-length item lists instead.
4. **Relocate CAE VBA** (`Select_CAE_Destination` → `Copy_CAEn`, 1714 lines, 31 near-identical subs): user selects a group-name cell (`Breakdown_SMn`); macro prompts for a section name, writes it into D<name row>, then pastes CAE **values**: A10:E35→A/E block of the group's first rows (phase codes, descriptions, qty), H10:H35→**F** (Field Lab Unit), K10:K35→**I** (Shop Lab Unit), M10:M35→**L** (Material Unit); then walks rows setting Qty **E=1** while descriptions are non-blank (so unit=total, qty=1); finally runs `Remove_CAE_NoQuestion` which wipes SM Import (A9:G/I/K last-row, deletes surplus rows), clears both audit-trail sheets, refreshes Pivot tables and re-registers the SMImport_* dynamic names. Net effect: converts the imported CAE aggregate into an editable takeoff group and zeroes the CAE group.
5. `Plug_Quote` module: Ctrl+W turns selection font red ("Plug" = guessed price), Ctrl+Q back to automatic ("Quote"). Purely visual tagging convention — worth an app affordance (plug/quote flag per row).
6. Pay type is per **group**, not per row (T formula copies group F cell). Blank type ⇒ "Sheet Metal Takeoff".
7. R (Shift) validation offers HAZARD on non-first rows but no formula consumes it; SPECIAL is only offered on each group's first item row yet consumed anywhere. Plumb/Pipe Y/Z rates reuse the swing rate; SPECIAL LOP uses the Swing LOP factor.
8. Excel `""` string comparisons: an excluded group zeroes H/K/M but U–AF still compute from those zeros (thus 0) — safe.
9. E/H/K/M CAE row 20 (BLK) criteria mismatch between qty/material (requires Rectangular Duct) and hours (any BLK) — replicate exactly.
10. G/J multipliers: blank means ×1; only G310=0.9 exists in seed data.
11. Merged cells: F:G on every group header row (type dropdown), N:O on many item rows (notes spill) — cosmetic.
12. `Takeoff_Type`(E5) named range points at an empty cell — unused.
13. D4:D6 error banners are useful app assertions: `sum(all H cells incl. subtotals & grand)=3×H7`.
