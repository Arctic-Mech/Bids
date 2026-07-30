// ============================================================
// Keyboard navigation for the data grids — the Excel muscle memory
// ============================================================
// Enter / Shift+Enter  move down / up the same column
// Down / Up arrow      same, EXCEPT on a <select> or a datalist cell, where the
//                      arrows belong to the control itself
// Ctrl+D               fill down from the nearest cell above in the column
// Escape               put the cell back the way it was when you entered it
// Tab                  left alone — the browser already moves right
//
// Left/Right arrows are deliberately NOT bound: every cell here is a live input,
// so those have to keep moving the caret inside the text.
'use strict';

// Column position of a cell, counting colspans (some rows merge cells).
function gridColOf(td) {
  let col = 0;
  for (const child of td.parentElement.children) {
    if (child === td) return col;
    col += child.colSpan || 1;
  }
  return col;
}
function gridCellAt(tr, col) {
  let at = 0;
  for (const child of tr.children) {
    const span = child.colSpan || 1;
    if (col >= at && col < at + span) return child;
    at += span;
  }
  return null;
}
const GRID_CTRL = 'input:not([type=hidden]):not([type=checkbox]):not([disabled]), select:not([disabled])';

// The editable cell `step` rows away in the same column, or null.
// Stops at subtotal/total rows and header rows, and never leaves this table —
// the next table may be inside a collapsed group where focus would vanish.
function gridNeighbour(node, step) {
  const td = node.closest('td');
  if (!td) return null;
  const tr = td.parentElement;
  const table = tr.closest('table.grid');
  if (!table) return null;
  const col = gridColOf(td);
  const rows = [...table.rows];
  for (let i = rows.indexOf(tr) + step; i >= 0 && i < rows.length; i += step) {
    const row = rows[i];
    if (row.classList.contains('subtotal') || row.classList.contains('grand')) break;
    if (row.querySelector('th')) break;
    const cell = gridCellAt(row, col);
    if (!cell) continue;
    const ctrl = cell.querySelector(GRID_CTRL);
    if (ctrl) return ctrl;
  }
  return null;
}

// Scroll a cell clear of the sticky top bar and sticky table header.
function gridEnsureVisible(node) {
  if (!node || !node.getBoundingClientRect) return;
  const bar = document.getElementById('topbar');
  const th = node.closest('table') && node.closest('table').querySelector('th');
  const top = (bar ? bar.getBoundingClientRect().bottom : 0) + (th ? th.getBoundingClientRect().height : 0) + 8;
  const r = node.getBoundingClientRect();
  if (r.top < top) window.scrollBy(0, r.top - top);
  else if (r.bottom > window.innerHeight - 8) window.scrollBy(0, r.bottom - window.innerHeight + 8);
}

// Move focus to `dest`. Focusing it blurs the current cell, which commits that
// edit and may queue a re-render; rerender() reads document.activeElement inside
// its timeout, i.e. after this, so it restores focus to the NEW cell by data-path.
// The follow-up below only repairs the rare case where that lookup misses.
let gridNavSeq = 0;
function gridFocus(dest) {
  if (!dest) return;
  // Each move gets a ticket. A busy page can delay the follow-up below past the
  // next keystroke, and an old follow-up must never drag focus back from where
  // the user has since moved to.
  const seq = ++gridNavSeq;
  const path = dest.dataset ? dest.dataset.path : null;
  dest.focus();
  if (dest.select) { try { dest.select(); } catch (e) { } }
  setTimeout(() => {
    if (seq !== gridNavSeq) return;              // superseded by a newer move
    let node = dest;
    if (path && !document.body.contains(node)) node = document.querySelector('[data-path="' + CSS.escape(path) + '"]');
    if (node && document.activeElement !== node) {
      node.focus();
      if (node.select) { try { node.select(); } catch (e) { } }
    }
    gridEnsureVisible(node);
  }, 0);
}

// Copy the value from the cell above into this one, through the normal change
// path so the model write, the recalc and the undo step all happen as usual.
function gridFillDown(node) {
  const src = gridNeighbour(node, -1);
  const dstPath = node.dataset ? node.dataset.path : null;
  if (!src || !src.dataset.path || !dstPath) { toast('Nothing above to fill down from', true); return; }
  // copy the stored value, never the displayed text — money and percentages are
  // formatted on the way out and would be corrupted by copying what you see
  pathSet(app.bid, dstPath, pathGet(app.bid, src.dataset.path));
  const dstExpr = node.dataset.exprPath, srcExpr = src.dataset.exprPath;
  if (dstExpr) pathSet(app.bid, dstExpr, srcExpr ? pathGet(app.bid, srcExpr) : null);
  app.touch();
  rerender();
}

function installGridNav() {
  // remember each cell's value on the way in, so Escape can put it back
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('table.grid') && 'value' in t) t.dataset.entryValue = t.value;
  });

  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
    let t = e.target;
    if (!t || !t.closest) return;
    if (t.tagName === 'TEXTAREA') return;            // notes fields: Enter makes a new line
    if (!t.closest('table.grid')) return;            // form fields and the import compare table
    // A big page can still be re-rendering from the previous keystroke, which leaves
    // this node detached. Re-find the live cell by its path so fast typing never
    // moves relative to a stale table.
    if (!document.body.contains(t) && t.dataset && t.dataset.path) {
      const live = document.querySelector('[data-path="' + CSS.escape(t.dataset.path) + '"]');
      if (!live) return;
      t = live;
    }

    const key = e.key;
    if ((e.ctrlKey || e.metaKey) && (key === 'd' || key === 'D')) {
      e.preventDefault();                            // also stops the browser's Add Bookmark
      gridFillDown(t);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;  // leave every other shortcut alone

    if (key === 'Enter') {
      e.preventDefault();
      gridFocus(gridNeighbour(t, e.shiftKey ? -1 : 1));
      return;
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      // these belong to the control on a dropdown or a datalist cell
      if (t.tagName === 'SELECT' || t.hasAttribute('list')) return;
      e.preventDefault();
      gridFocus(gridNeighbour(t, key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (key === 'Escape' && t.dataset && t.dataset.entryValue !== undefined) {
      // restoring the original text means no change event fires on the way out
      t.value = t.dataset.entryValue;
      if (t.select) { try { t.select(); } catch (err) { } }
    }
  });
}
