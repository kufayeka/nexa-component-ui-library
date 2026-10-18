// Data Grid: what is selected, and moving it with the keyboard. Pure.
//
// A selection is an anchor (where it started) and a focus (where it is now), both a cell { r, c } of the shown rows. The range is the
// rectangle between them. A merged cell counts as one: a selection that touches part of a merge grows to take all of it.
import { formatTsv } from "./clipboard.js";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const noSelection = () => ({ anchor: null, focus: null });

export function selectCell(r, c) { return { anchor: { r, c }, focus: { r, c } }; }

/** Extend from the anchor to a cell (shift-click, shift-arrow, drag). Without an anchor it just selects the cell. */
export function extendTo(sel, r, c) {
    if (!sel.anchor) return selectCell(r, c);
    return { anchor: sel.anchor, focus: { r, c } };
}

/** The rectangle { r1, c1, r2, c2 } of a selection, or null. */
export function rangeOf(sel) {
    if (!sel || !sel.anchor || !sel.focus) return null;
    return { r1: Math.min(sel.anchor.r, sel.focus.r), c1: Math.min(sel.anchor.c, sel.focus.c), r2: Math.max(sel.anchor.r, sel.focus.r), c2: Math.max(sel.anchor.c, sel.focus.c) };
}

/** The range grown until it holds every merge it touches (repeated: growing may touch another merge). */
export function growToMerges(range, merges) {
    if (!range) return null;
    let r = Object.assign({}, range), changed = true;
    while (changed) {
        changed = false;
        merges.forEach((m) => {
            if (m.r1 <= r.r2 && m.r2 >= r.r1 && m.c1 <= r.c2 && m.c2 >= r.c1) {
                const n = { r1: Math.min(r.r1, m.r1), c1: Math.min(r.c1, m.c1), r2: Math.max(r.r2, m.r2), c2: Math.max(r.c2, m.c2) };
                if (n.r1 !== r.r1 || n.c1 !== r.c1 || n.r2 !== r.r2 || n.c2 !== r.c2) { r = n; changed = true; }
            }
        });
    }
    return r;
}

/**
 * Move the focus by a step (arrow keys, Tab, PageUp / PageDown, Home / End). A step into a merge lands on its top-left, and a step out of one
 * starts from its edge, so the arrows never get stuck inside a merged box. With `extend`, the anchor stays (the range grows).
 */
export function moveFocus(sel, dr, dc, rowCount, colCount, merges, extend) {
    const from = sel.focus || { r: 0, c: 0 };
    let r = from.r, c = from.c;
    const here = (merges || []).find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
    if (here) { if (dr > 0) r = here.r2; else if (dr < 0) r = here.r1; if (dc > 0) c = here.c2; else if (dc < 0) c = here.c1; }
    r = clamp(r + dr, 0, Math.max(0, rowCount - 1));
    c = clamp(c + dc, 0, Math.max(0, colCount - 1));
    const into = (merges || []).find((m) => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2);
    if (into && !extend) { r = into.r1; c = into.c1; }
    return extend && sel.anchor ? { anchor: sel.anchor, focus: { r, c } } : selectCell(r, c);
}

/** The selected range as text for the clipboard: tab between cells, a new line between rows, quotes around a cell that holds a tab / new line / quote (as Excel). */
export function rangeToTsv(range, valueAt) {
    if (!range) return "";
    const rows = [];
    for (let r = range.r1; r <= range.r2; r++) {
        const cells = [];
        for (let c = range.c1; c <= range.c2; c++) cells.push(valueAt(r, c));
        rows.push(cells);
    }
    return formatTsv(rows);
}
