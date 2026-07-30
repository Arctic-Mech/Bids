# Arctic Bid Tool

A single-file web app (`index.html`) that replaces the Excel estimating workbook
(`REV_1 ... Estimate.xlsm`). Open it in any modern browser — nothing to install,
no internet needed after loading, works from a file share or GitHub Pages.

> **Changing the app?** `index.html` is generated — never edit it by hand.
> Edit `src/`, run `python3 build.py`, then `./verify.sh`. See **DEVELOPING.md**.

## First time on a computer: the company file

The website carries **no Arctic rates and no estimate workbook**. It is on the public
internet, so wages, fringes, markups, permit and bond tables and OCIP rates are
deliberately left out of it.

They live in one file — **`Arctic Company File.arctic`** — kept on the Arctic network.
The first time someone opens the tool on a computer, it shows a **One-time setup**
screen; drop that file on it and the browser remembers it from then on. Everything
works normally afterwards. Bids already saved on that computer are untouched.

To change rates for everyone: edit them, rebuild, and hand out the new company file —
each person loads it once from **Company Settings → Company file**.

## Daily use

1. **Open `index.html`** (double-click, or host it and bookmark it).
2. **Home** shows every bid saved on this computer. Bids autosave as you type.
3. **New Bid** starts from company defaults. **New Rev** duplicates a bid and bumps the revision.
   **Undo / Redo** are in the top bar (Ctrl+Z / Ctrl+Shift+Z). Each step is named — hover
   Undo to see exactly what it will put back. Overriding a bid on import is undoable too.
4. Work through the pages in the sidebar — they are the old workbook sheets:
   Estimate Recap → TakeOff → SM Import → Crew Mix → Indirect Costs →
   Price Breakdown → Proposal → Booking Report → Notes.
   Cream cells are inputs; gray cells are calculated. The live **Total Bid** is always in the header.
   In the grids, **Enter** moves down a column, **Shift+Enter** up, **Ctrl+D** copies the cell
   above, and **Esc** undoes what you just typed in a cell — the same keys as Excel.
5. **Export / PDF** when a bid is done: pick pages, download either one PDF or a ZIP of
   per-page PDFs named `EstNo JobName Rev N - Page.pdf`. Save that in the job file.
   **Every exported PDF (and the ZIP) carries the complete bid data inside it.**
   The Proposal page prints as the same bordered form as the old spreadsheet, so it can go
   straight to a customer. Pages are numbered `Page N of M`.
6. **SM Import**: drop the file your takeoff program already writes —
   `C:\MAP-Software\EST\Exports\FESTR.txt` (EST) or `FESTR_QP.txt` (QuickPen) — on the page,
   or paste the rows. Either way the lines are grouped exactly as the old pivot tables grouped
   them and feed the CAE group on TakeOff. **You don't create that file; your takeoff export
   writes it.** The `❓ How To` page in the sidebar walks through finding it in Windows.
7. **Import** (Home or Export page): drop in any file this tool exported — PDF, ZIP or JSON —
   **or an Excel estimate workbook (`.xlsm`)**, whether it came from this tool or is an
   untouched original. If a bid with the same estimate number already exists here, you get a
   side-by-side list of **exactly what is different** (old vs new, in plain English).
   **Tick the changes you want and leave the rest** — everything is accepted by default,
   *Deny all* then pick, or toggle a whole page at once. *Keep both* saves the file as a
   separate copy instead, *Cancel* keeps yours. Whatever you apply is one Undo away.
8. **Export as Spreadsheet** (Export page): downloads the bid as a real macro-enabled
   Excel workbook, indistinguishable from the original estimate spreadsheet — same
   formatting, formulas, macros, protection and values. Anyone can keep working in Excel,
   and the file imports right back into the website. Work off whichever you prefer.

## Company rates

Everything that was a locked cell in the spreadsheet — wages, fringes, payroll tax stack,
workers'-comp factors, permit fee tiers, bond brackets, OCIP rates, LOP factors, equipment
rates — lives in **Company Settings**, editable, with the factory value shown beside each field.
Changing a setting affects **new bids**; existing bids keep the rates they were priced with
(a button on Settings applies current rates to the open bid when you want that).

## Fidelity

The calculation engine was verified cell-by-cell against the original workbook's own computed
values — including the exact Total Bid ($4,614,770.00 for the seed job), all crew rates, all
2,400 Booking Report cells, permits, bond, OCIP, and EMO interactions.
See **FUNCTIONS.md** (also the "Function Map" page inside the app) for the complete mapping
of every sheet, formula and macro to its new home.

## Notes

- Bids live in the browser's local storage **per computer, per browser**. The exported
  PDF/ZIP is the permanent record — file it like you filed the old workbook.
- The back/forward buttons work like a normal website, on desktop and iPhone.
- Booking CSV (accounting import) is on the Booking Report page.
- Importing or exporting a workbook shows a progress bar with the current stage.
