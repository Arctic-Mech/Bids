# How to use the Arctic Bid Tool

This is the same estimate you have always done. Same sheets, same order, same numbers —
it just runs in a browser instead of Excel.

## First time on this computer

The first time you open the tool on a computer it asks for the **Arctic company file**.

That file holds the wage and fringe tables, the payroll tax and workers-comp factors, the
permit and bond rates and the estimate workbook. It is kept on the Arctic network, not on
this website, because the website is on the public internet and those are our numbers.

Drop the file on the setup screen. **You only do this once on each computer** — it is
remembered from then on. Bids already saved on that computer are not touched.

If someone changes the rates, you will be handed a new company file. Load it from
**Company Settings → Company file**. Same one-time drop, and it replaces the old one.

## Getting your sheet metal takeoff in

This is the part the old spreadsheet never explained.

**You do not create this file. Your takeoff program writes it for you, every time, to the
same folder.** You do not need to save it, rename it, or put it anywhere. You just have to
go and get it.

### Step by step

1. **Do your takeoff and run its export**, exactly the way you always have. That is what
   writes the file.
2. **Open File Explorer** in Windows (the yellow folder on the taskbar).
3. **Click the white address bar** across the top and type this in, then press Enter:

   `C:\MAP-Software\EST\Exports`

   There is a **Copy folder path** button on the SM Import page that puts this on the
   clipboard for you, so you can just paste it in.
4. **Find your file.** Which one depends on which program you took off in:

| You took off in | Your file | The old button that used to read it |
|---|---|---|
| EST | `FESTR.txt` | *Import New SM From EST* |
| QuickPen | `FESTR_QP.txt` | *Import New SM From QP* |

5. **Drag that file onto the SM Import page** in the bid tool — right onto the dashed box.
   Or click *choose a file* and pick it.
6. The lines appear, grouped the same way the old pivot tables grouped them, and they feed
   the **CAE** group on the TakeOff page automatically.

### If you are not sure which file is yours

Sort the folder by **Date modified**. Whichever one changed when you ran your export is the
one you want. The tool reads the file and works out which kind it is by itself, so dropping
the wrong one does no harm — it just tells you.

### If that folder is not there

Open **This PC** and search for `FESTR`. It takes about a minute. The folder is wherever
your takeoff software was installed, and it may be on a different drive letter.

### If you cannot find it at all

Do the import in the old spreadsheet exactly the way you always have, save it, and then
**upload that `.xlsm` file from the Home page**. The whole bid comes across, SM Import lines
included. This route works today and will keep working.

## Where the old buttons and shortcuts went

| Old workbook | Now |
|---|---|
| `Ctrl+I` — Import Menu | The **SM Import** page in the sidebar |
| *Remove SM CAE Import* | **Clear all** on the SM Import page |
| *Move CAE to Breakdown* | **Relocate CAE → group** on the TakeOff page |
| `Ctrl+T` — live total | The **Total Bid** in the header, always showing |
| `Ctrl+Q` / `Ctrl+W` — Quote / Plug | The Quote/Plug dropdown on subcontract rows |
| *Insert Rows* | **+ Row** / **+ 5 Rows** on each group |
| *Clean Up Booking Phase Codes* | Automatic — blank rows are simply not printed |
| Saving as `EstNo JobName` | Export filenames are built that way for you |

## Working a bid

Go down the sidebar in order — they are the old sheets under the old names:

Estimate Recap → TakeOff → SM Import → Crew Mix → Indirect Costs → Price Breakdown →
Proposal → Booking Report → Notes.

- **Cream cells are yours to type in. Grey cells are calculated** — same as the workbook.
- In any grid, **Enter** moves down a column, **Shift+Enter** moves up, **Ctrl+D** copies the
  cell above, and **Esc** puts back what was in a cell before you started typing. The same
  keys as Excel.
- Any number box will do math: type `40*3` and it will work it out.
- **Undo and Redo** are in the top bar (`Ctrl+Z` and `Ctrl+Shift+Z`). Hover Undo and it tells
  you what it is about to put back.
- Bids save themselves as you type. There is no Save button.

## Finishing a bid

- **Export / PDF** — pick the pages you want and download one PDF, or a ZIP with one PDF per
  page, named `EstNo JobName Rev N - Page.pdf`. File it in the job folder like you always did.
- **Every PDF has the whole bid inside it.** Drop an exported PDF back on the tool later and
  the bid comes back — on any computer.
- **Export as Spreadsheet** gives you a real macro-enabled Excel workbook, the same as the old
  one, formulas and macros and all. Anyone can carry on in Excel, and that file imports
  straight back in.
- **Booking CSV** for accounting is on the Booking Report page.

## If something does not look right

Run one job both ways — the old spreadsheet and this — and compare the totals. That is the
honest check, and it is worth doing on your first job.

If they disagree, say so and send the job over. Nothing here is a guess: every calculation was
checked cell by cell against the workbook, so a difference means something is wrong and it can
be found.
