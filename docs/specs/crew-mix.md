# Crew Mix — Functional Spec

Companion data file: `crew-mix.data.json` (all rate-table values generated from extract — embed as editable company settings).

## (a) Purpose

Computes **blended ("crew") labor cost rates per hour** for three labor pools — SM Field, SM Shop, Plumber/Pipefitter — at three pay tiers each (Straight, Overtime ×1.5, Double-time ×2.0). The estimator enters a crew mix (headcount per classification); the sheet combines locked union wage + fringe tables, a payroll-tax-and-insurance (PT&I) burden percentage, and a period-escalation factor to produce the `CrewRate_*` named ranges consumed by TakeOff, MCAA RECAP, Breakdown, and Booking Report. It also rolls up labor hours from TakeOff (informational Total_* named ranges), computes shift-premium adders (swing/grave/special), loss-of-production factors, an OCIP insurance deduct, and wage-increase escalation percentages.

## (b) Visible layout

Sheet title `B1: "Crew Mix Calculator"`. Protected; column A hidden (holds ratio weights). Three vertically stacked sections, each with 3 blocks (ST/OT/DT). Saved state: rows 3–128 hidden (only Plumber/Fitter visible); 4 VBA navigation macros (button-driven) toggle section visibility — in the app use tabs: **All / SM Field / SM Shop / Plumb–Fitter**.

| Section | Rows | ST block | OT block | DT block |
|---|---|---|---|---|
| SM Field Labor Rate | 3–65 | 10–23 | 31–44 | 52–65 |
| SM Shop Labor Rate | 66–128 | 73–86 | 94–107 | 115–128 |
| Plumber/Fitter | 129–188 | 136–148 | 156–168 | 176–188 |

Each block is a table with columns: `A` ratio weight (hidden) | `B` classification label | `C` Quantity | `D` Wage | `E` Fringe | `F` Subtotal Wage+Fringe | `G` PT&I | `H` Total | `I` $/HR. Below: Total Quantity, Total Dollars, Average Hourly Cost, **Total Cost/HR (the crew rate)**, Crew Ratio Percentage. Above each ST block: an Hours summary (D/E, from TakeOff) and a "LaborRate Period" date pair (col I). Right side (cols L–W): PT&I rate tables, OCIP deduct, composite-rate notes, wage-increase tables — treat as a company-settings panel.

Classifications (9 for SM, 8 for Plumber/Fitter — no Classified Worker row):
Senior General Foreman (1.25 / PF 1.3), General Foreman (1.2), Foreman (1.15 / PF 1.1), Journeyman (1.0), 4th-Yr Apprentice .90, 3rd-Yr .75, 2nd-Yr .65, 1st-Yr .55, Classified Worker/PA .50 (SM only).

## (c) USER INPUTS (unlocked cells — 27 total)

| Cells | Label | Default | Notes |
|---|---|---|---|
| C11:C19 | SM Field crew Quantity per classification | C13=1 (Fmn), C14=4 (Jny), C16=1 (3rd-yr appr), rest empty | whole numbers; OT/DT blocks mirror these (C32:C40 = `=$C$11`… , C53:C61 same) |
| C74:C82 | SM Shop crew Quantity | 0,0,1,2,1,0,0,0,1 | OT block C95:C103 and DT block C116:C124 mirror `=$C$74`… |
| C137:C144 | Plumber/Fitter crew Quantity | C138=1 (GF), C139=3 (Fmn), others empty/0 | OT C157:C164 / DT C177:C184 mirror `=C137`… |
| H9 | SM Field Period Factor (escalation %) | 0.055 (5.5%) | nf `0.0%` |
| H30, H51 | Period Factor, SM Field OT / DT blocks | `=$H$9` | unlocked *with formula* — user may override per block |
| H72 | SM Shop Period Factor | `=$H$9` (0.055) | unlocked, overridable |
| H93, H114 | Shop OT / DT period factor | `=$H$72` | unlocked, overridable |
| H135 | Plumber/Fitter Period Factor | 0.06 (6.0%) literal | |
| H155, H175 | PF OT / DT period factor | `=$H$135` | unlocked, overridable |
| I85 | Shop Burden /hr | $16.50 | added on top of shop avg hourly cost |
| I106, I127 | Shop Burden /hr, OT / DT blocks | `=I85` / `=I106` | unlocked, overridable |

No data validations on the sheet. App: implement the mirror cells as "inherit unless overridden".

## (d) COMPANY CONSTANTS (locked literals — keep as editable app settings; exact values in crew-mix.data.json)

**Wage & fringe tables** (per classification, straight-time; $/hr):

- SM Field & Shop (shop reuses field table via `D74..D82 = D11..`, `E74.. = E11`): wages D11:D19 = 69.99, 67.24, 64.49, 56.24, 50.62, 42.19, 36.57, 30.95, 27.55; fringes E11:E19 = 33.43, 33.43, 33.43, 33.43, 29.36, 28.94, 28.66, 28.38, 20.71. LaborRate Period I5=2025-07-01 → I7=2026-07-01 (**named `Info_Schedule_Start_Date` / `Info_Schedule_End_Date`**; echoed to every other block via `=$I$5`/`=$I$7`).
- Plumber/Fitter: wages D137:D144 = 90.63, 80.67, 70.72, 60.77, 54.96, 45.58, 39.50, 33.42; fringes E137:E144 = 38.75 ×4, 36.92, 34.17, 32.33, 30.50. Period I131=2025-04-01 → I133=2026-03-31.
- Ratio weights (hidden col A): SM 1.25/1.2/1.15/1.0/0.9/0.75/0.65/0.55/0.5 (rows 11–19, repeated each block); PF 1.3/1.2/1.1/1.0/0.9/0.75/0.65/0.55 (rows 137–144).

**PT&I tables** (col L labels, col M rates, nf `0.0000%`):

- SM Field OUTSIDE (L4 block): FUTA M6=0.006, SUI M7=0.036, SDI M8=0.000419, SS M9=0.062, MEDIC M10=0.0145, WC M12=formula (below), County Tax M13=0.009, GL M14=0.013, TRI M16=0.008237, FMLA M17=0.004, OR Sick Leave M18=0.0144. Total M20 = `SUM(M6:M18)` = 0.176203878.
- SM Shop (rows 68–83): every row echoes the field table (`M69..M74 = M6..M11`, `M76=$M$13`, `M77=M14`, `M79..M81=M16..M18`) **except** WC gross rate. Total M83 = `SUM(M69:M81)` = 0.174389368. (M74/L74 echo empty M11/L11 → vestigial 0 row.)
- Plumber/Fitter OUTSIDE (rows 131–146): echoes field (`M132..M137=M6..M11`, `M139=$M$13`, `M142..M144=M16..M18`) except WC gross rate and **GL comb M140 = 0.0243 literal**. Total M146 = `SUM(M132:M144)` = 0.183952071.

**Workers'-Comp components** (WC% = grossRate × EMR × OGSERP × DCBS × OCCPAP):
- Gross rates: SM Field P13 = 0.0224 (class code 5537); SM Shop P76 = 0.0177 (class code 3076); Plumb/Fitter P139 = 0.0132 (class code 5537).
- Shared factors (single source, echoed to other sections): EMR Q11 = 0.6; OGSERP T11 = 0.87; OCCPAP U11 = 0.89; DCBS Prem Assessment W11 = 0.831 (note in R12: "Including 6.8% prem assessment").
- Formulas: `M12 = P13*Q11*T11*W11*U11` = 0.008647878; `M75 = P76*Q74*T74*W74*U74` = 0.006833368; `M138 = P139*Q137*T137*W137*U137` = 0.005096071 (Q74/Q137 etc. all echo the row-11 masters).

**Shift-premium percentages**: SM (field & shop, "% of JNY wage"): Swing F21=0.15, Graveyard F22=0.23, Special Circumstances F23=0.10 (shop F84:F86 = `=F21`…). Plumber/Fitter: Swing/Grave add F146=0.10 of avg base wage; **Swing Loss of Production F147 = 0.0625 (named `CrewRate_PlumbFitter_SwingLOP`); Grave Loss of Production F148 = 0.125 (named `CrewRate_PlumbFitter_GraveLOP`)** — consumed heavily by TakeOff (124 / 62 references). PF notes: "* Graveyard: Add $1.00", "* Swing: Add $0.75" (D166/D167, informational).

**Hard-coded in formulas**: OT multiplier 1.5; DT multiplier 2.0; **$0.35/hr adder** on Subtotal for Field OT/DT and Plumb OT/DT blocks (NOT shop, NOT straight); OCIP crew-average weights (1 Fmn + 4 Jny + 1 4th-yr)/6.

**Wage-increase tables** ("Wage Increases", $/hr raises): SM — L39:L41 dates 2026-07-01/2027-07-01/2028-07-01, M39:M41 = $5.50/$6.25/$7.00. PF — L165:L167 dates 2026-04-01/2027-04-01/2028-04-01, M165:M167 = $6.00/$6.25/$6.50. (O40/O41/O165:O167 flag "Guess".)

**Composite-rate notes** (text only, L29–M35 & L155–M161): 5/10s = "40 x str + 10 x otr / 50"; 6/10s = "40 x str + 20 x otr / 60"; 60/60/50s = "120 x str +50 x otr/170"; each with "apply Lop to Total hours in material handling(?)".

## (e) CALCULATIONS

Let, per block: `qty[i]`, `wage[i]`, `fringe[i]`, `ptiPct` (M20 | M83 | M146), `pf` (period factor H-cell), `weight[i]` (col A).

```js
// ---- per classification row i ----
// Wage per tier
wageST[i] = table value (literal)                        // D11..D19, D137..D144; shop D74..=D11..
wageOT[i] = wageST[i] * 1.5                              // D32..D40 =D11*1.5; PF D157..=D137*1.5; shop OT D95..=D32 (echo)
wageDT[i] = wageST[i] * 2                                // D53.. =SUM(D11*2); PF D177..; shop DT D116..=D53
fringe[i] = table value (same for all tiers; E32..=E11 etc.)

// Subtotal Wage+Fringe (col F)
subtotal[i] = wage[i] + fringe[i] + adder
//   adder = 0.35 for SM Field OT (F32..F40 =SUM(D32+E32)+0.35), SM Field DT (F53..),
//           PF OT (F157..), PF DT (F177..);  adder = 0 for all ST blocks and BOTH shop OT/DT blocks.

// PT&I dollars (col G)
ptiSMField[i]  = round2(wage[i] * M20)                   // G11.. =ROUND(SUM(D11*$M$20),2); OT G32.., DT G53..
ptiSMShop[i]   = wage[i] * M83                           // G74.. =$D74*$M$83  — NOT rounded (quirk)
ptiPF[i]       = round2(wage[i] * M146)                  // G137.. =ROUND(SUM(D137*$M$146),2)

// Total dollars (col H) and unit rate (col I)
total[i]  = round2((subtotal[i] + pti[i]) * qty[i] * (1 + pf))   // H11.. =ROUND(SUM(F11+G11)*C11*(1+$H$9),2)
perHr[i]  = round2((subtotal[i] + pti[i]) * (1 + pf))            // I11.. =ROUND(SUM(F11:G11)*(1+$H$9),2)

// ---- block totals ----
totalQty     = Σ qty[i]                                   // C21 =SUM(C11:C19)
crewRatioPct = Σ(weight[i]*qty[i]) / totalQty             // C23 =SUM(A11*C11,...)/C21  (display, nf 0.00)
totalDollars = Σ total[i]                                 // H21 =SUM(H11:H19)
avgHourly    = totalQty == 0 ? 0 : totalDollars/totalQty  // I21 =IF(C21=0,0,H21/C21)
crewRate     = round2(avgHourly)                          // I23 =ROUND(I21,2)
// SHOP blocks add burden: I86 =ROUND(I84+I85,2); I107 =ROUND(I105+I106,2); I128 =ROUND(I126+I127,2)
```

Named crew-rate outputs: `CrewRate_SMField_Straight`=I23 (103.07), `_Overtime`=I44 (137.73), `_DoubleTime`=I65 (172.03); `CrewRate_SMShop_Straight`=I86 (111.45), `_Overtime`=I107 (143.06), `_DoubleTime`=I128 (174.67); `CrewRate_PlumbFitter_Straight`=I148 (132.95), `_Overtime`=I168 (179.26), `_DoubleTime`=I188 (225.20).

```js
// ---- shift premium adders ($/hr) ----
CrewRate_SMField_Swing   = D14 * F21        // G21 =$D$14*F21 → 8.436   (Jny wage × 15%)
CrewRate_SMField_Grave   = D14 * F22        // G22 → 12.9352 (23%)
CrewRate_SMField_Special = D14 * F23        // G23 → 5.624   (10%)
CrewRate_SMShop_Swing/Grave/Special = D77 * F84..F86   // G84..G86 =$D$77*F84 — same values (D77 echoes D14)
// Plumber/Fitter:
avgBaseWage = round2(Σ(qty[i]*wageST[i]) / totalQty)    // D145 → 73.21
CrewRate_PlumbFitter_Swing = round2(avgBaseWage * F146) // G146 =ROUND(D145*F146,2) → 7.32
CrewRate_PlumbFitter_SwingLOP = F147 (0.0625); _GraveLOP = F148 (0.125)   // plain constants

// ---- hours roll-up from TakeOff (informational; Total_* named ranges) ----
// Named columns: SM_FieldLaborColumn=TakeOff!$H:$H, SM_ShopLaborColumn=TakeOff!$K:$K,
// SM_Shop_Labor=TakeOff!$K$7, SM_OvertimeColumn=TakeOff!$Q:$Q ("OT"/"DBLT"), Takeoff_PayType=TakeOff!$T:$T
D26  = SUMIFS(H:H, Q:Q,"OT",  T:T,"Sheet Metal Takeoff")   // Total_SMField_OverTime
D47  = SUMIFS(H:H, Q:Q,"DBLT",T:T,"Sheet Metal Takeoff")   // Total_SMField_DoubleTime
D5   = SUMIF(T:T,"Sheet Metal Takeoff", H:H) - D6 - D7     // Total_SMField_StraightTime (D6=D26, D7=D47 via names)
D8   = D5+D6+D7                                            // Total_SMField_Hours (4269 in sample)
D89  = SUMIFS(K:K, Q:Q,"OT");  D110 = SUMIFS(K:K, Q:Q,"DBLT")     // shop (no paytype filter)
D68  = SM_Shop_Labor - D69 - D70;  D71 = SUM(D68:D70)             // Total_SMShop_* (653)
D151/D171 = SUMIFS(H:H, Q:Q,"OT"/"DBLT", T:T,"Plumb Takeoff"); D131 = SUMIF(T,"Plumb Takeoff",H)-D132-D133; D134=Σ  // Plumb (169.22)
F151/F171 = same with "Pipe Takeoff"; F131 = SUMIF(...)-F132-F133; F134=Σ                                            // Pipe (3495.90)

// ---- OCIP deduct (named OCIP_Deduct = N27) ----
N27  = -((D13 + 4*D14 + D15)/6) * (M12+M13+M14)     // =-SUM(D13+4*D14+D15)/6*SUM(M12:M15) → -1.7371  ($/hr credit)
N153 = -((D140 + 4*D139 + D141)/6) * (M138+M139+M140) // plumb variant → -2.5508  (NOTE: weights 4× FOREMAN D139,
      // 1× Jny D140 — contradicts label "(Ave of 4Jyn, 1Fmn, 1 .9A)"; replicate as-is, flag in UI)

// ---- wage-increase escalation % (col N, nf 0.0%) ----
N39 = M39/(I14*(1-H9)); N40 = (M39+M40)/(I14*(1-H9)); N41 = (M39+M40+M41)/(I14*(1-H9))
      // I14 = Journeyman straight $/HR. (Excel: =SUM(M38,M39)/... — M38 is text, ignored by SUM)
N165..N167 = cumulative M165..M167 / (I140*(1-H135))   // PF, I140 = PF Journeyman $/HR

// ---- Driver_Rate (named, D19:G19 array) ----
[wage 27.55, fringe 20.71, subtotal 48.26, PT&I 4.85]  // Classified Worker/PA row doubles as driver rate.
// No formula references found anywhere in the workbook extract — expose the name, low priority.
```

Vestigial (render nothing): F26:H29, F47:H50, F68:H71, F89:H92, F110:H113 echo empty $F$5:$H$8 via `=IF($F$5="","",$F$5)` patterns → always blank. I26/I28 etc. echo the period dates into each block header.

## (f) Cross-sheet wiring

Reads (all from TakeOff): `SM_FieldLaborColumn` TakeOff!H:H, `SM_ShopLaborColumn` TakeOff!K:K, `SM_Shop_Labor` TakeOff!K7, `SM_OvertimeColumn` TakeOff!Q:Q, `Takeoff_PayType` TakeOff!T:T.

Written outputs (named ranges hosted here) and consumers:
- **TakeOff**: all 9 `CrewRate_*` tier rates, all swing/grave/special adders, `CrewRate_PlumbFitter_SwingLOP` (×124) and `_GraveLOP` (×62).
- **MCAA RECAP**: `CrewRate_SMField_Straight/_Overtime`, `CrewRate_SMShop_Straight`, `CrewRate_PlumbFitter_Straight/_Overtime`, `OCIP_Deduct`, plus direct refs `'Crew Mix'!I12, I14, I16, I19` (per-class straight $/HR: Gen Foreman, Journeyman, 3rd-yr Appr, Classified Worker).
- **Breakdown**: `CrewRate_SMField_Straight`, `CrewRate_SMShop_Straight` (×32 each), `OCIP_Deduct`.
- **Bond**: `'Crew Mix'!I5`, `'Crew Mix'!I7` (labor-rate period dates).
- **OCIP**: `'Crew Mix'!Q11` (EMR), `'Crew Mix'!W11` (DCBS), `Info_Schedule_Start_Date`/`_End_Date`.
- Note: `CrewRate_SMField/SMShop/Plumb/Pipe` (no suffix, used by Booking Report) are **MCAA RECAP** cells (G23/H24/E21/F22 there), not this sheet. `OCIP_Deduct_Total` = OCIP!O174, not here. `Total_Arch*` named ranges are broken (`#REF!`) — ignore.
- The `Total_*` hour names (D5/D8/D26/D47, D68/D71/D89/D110, D131/D134/D151/D171, F131/F134/F151/F171) are self-referenced within this sheet only.

## (g) Quirks

1. **Hidden col A** holds the crew-ratio weights; hidden rows 3–128 at save (VBA `CrewMixShowAll/ShowSMField/ShowSMShop/ShowPlumbFitt` in `CrewMixNavigation` toggle sections; ShowSMField has an off-by-one — unhides 3:66 then hides 66:128, so row 66 header ends hidden). Implement as tabs.
2. **$0.35 subtotal adder** applies to Field & Plumb OT/DT only — Shop OT/DT and all straight blocks omit it. Shop PT&I (G74 etc.) is **unrounded** while Field/Plumb PT&I round to cents; keep exact behavior or verification against cached values fails.
3. Unlocked-with-formula cells (H30/H51/H72/H93/H114/H155/H175, I106/I127): defaults chain to a master (H9, H135, I85) but users may type over — model as inheritable overrides.
4. **OCIP plumb deduct N153 weights 4× Foreman instead of 4× Journeyman** (label says 4 Jny) — probable workbook bug; replicate exactly, surface a warning.
5. `SUM(M38,M39)` includes text cell M38 ("$ amount") — harmless in Excel; JS must skip non-numerics. Same for `SUM(M12:M15)`/`SUM(M138:M141)` including blank M15/M141.
6. Shop crew rates add `Shop Burden /hr` ($16.50) after averaging; Field/Plumb have no burden adder.
7. `Info_Schedule_Start/End_Date` (I5/I7) are actually the SM **labor-rate period**, not the project schedule, and are **locked** literals — expose as company settings (Bond and OCIP read them).
8. Workbook `Workbook_BeforePrint` guard: if `'Crew Mix'!C20` blank and D7>0, blocks printing with "SM Field Crew Mix has not been filled out." — C20 contains the text "Total Quantity", so it can never fire; intent was "warn if DT hours exist but no crew entered". Reimplement the intent as a validation warning (crew qty total = 0 while hours > 0) for each section.
9. Plumber/Fitter section shares one rate table for two hour streams (Plumb col D, Pipe col F); pipe hours (3495.9) dwarf plumb (169.22) in the sample.
10. Shop PT&I table row 74 and PF row 137 echo empty M11/L11 (vestigial zero rows inside the SUM range). No validations, no volatile functions, no circular refs (Total_* names resolve forward within the sheet: D6→D26, D7→D47, etc.).
