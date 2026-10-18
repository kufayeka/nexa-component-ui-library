// Data Grid: what the "Edit grid" dialog does to the design, as plain functions. Pure (no imports, no DOM), tested in Node.
//
// A range is { r1, c1, r2, c2 } (inclusive, from 0, in the order shown). Every function gives back a NEW list: the dialog keeps a draft
// and only Apply puts it in the component, so nothing here may change what it is given.

const clone = (list) => (Array.isArray(list) ? list.map((x) => Object.assign({}, x)) : []);
const same = (a, b) => a.r1 === b.r1 && a.c1 === b.c1 && a.r2 === b.r2 && a.c2 === b.c2;

export const intersects = (a, b) => a.r1 <= b.r2 && a.r2 >= b.r1 && a.c1 <= b.c2 && a.c2 >= b.c1;
export const contains = (outer, inner) => outer.r1 <= inner.r1 && outer.r2 >= inner.r2 && outer.c1 <= inner.c1 && outer.c2 >= inner.c2;
export const cellCount = (r) => (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);
const box = (r) => ({ r1: r.r1, c1: r.c1, r2: r.r2, c2: r.c2 });

/** Whether a merge over this range would cross the line of a frozen row / column (it could not be drawn). */
export function crossesFreeze(range, freeze) {
    const f = freeze || { rows: 0, cols: 0 };
    return (range.r1 < f.rows && range.r2 >= f.rows) || (range.c1 < f.cols && range.c2 >= f.cols);
}

/** Merge a range: the merges it overlaps are replaced by it (as in a sheet, the new box wins). A single cell merges nothing. */
export function mergeRange(merges, range) {
    if (cellCount(range) < 2) return clone(merges);
    return clone(merges).filter((m) => !intersects(m, range)).concat([box(range)]);
}

/** Un-merge: every merge that touches the range goes. */
export function unmergeRange(merges, range) {
    return clone(merges).filter((m) => !intersects(m, range));
}

/** The merge boxes of a list that touch a range, to say "this selection holds 2 merged cells". */
export function mergesTouching(merges, range) {
    return merges.filter((m) => intersects(m, range));
}

/** Freeze rows and columns up to and including the range's last row / column (what a sheet's "Freeze panes" does). */
export function freezeAt(range, what) {
    return { rows: what === "cols" ? undefined : range.r2 + 1, cols: what === "rows" ? undefined : range.c2 + 1 };
}

/**
 * Paint borders on a range. `sides` is any of "all" "outer" "inner" "top" "right" "bottom" "left" "inner-h" "inner-v"; `spec` is { style, width, color }.
 * A rule that paints every line inside a range makes the earlier rules fully inside that range pointless (they would be painted over), so they go:
 * the list stays as short as what the user did, not as long as every click.
 */
export function addBorder(rules, range, sides, spec) {
    const list = Array.isArray(sides) ? sides : [sides];
    const rule = Object.assign(box(range), { sides: list.length === 1 ? list[0] : list.slice() }, { style: spec.style || "solid", width: spec.width || 1, color: spec.color || "" });
    const paintsAll = list.indexOf("all") !== -1;
    const kept = clone(rules).filter((r) => !(paintsAll && contains(range, r)));
    return kept.concat([rule]);
}

/** Take the borders off a range: a "none" rule over everything in it (it paints over what is there, also lines of bigger rules). */
export function clearBorders(rules, range) {
    return addBorder(rules, range, "all", { style: "none", width: 1, color: "" });
}

/** Lock (true) or open (false) the cells of a range. Earlier rules fully inside it are overridden, so they go. */
export function addLock(locks, range, locked) {
    const kept = clone(locks).filter((l) => !contains(range, l));
    return kept.concat([Object.assign(box(range), { locked: locked !== false })]);
}

/** Forget the lock rules inside a range (the cells go back to what their column and row say). */
export function resetLocks(locks, range) {
    return clone(locks).filter((l) => !contains(range, l));
}

/** What the lock rules say about every cell of a range: "locked", "open", "mixed" or "default" (no rule). `ruleAt(r, c)` gives true / false / undefined. */
export function lockState(range, ruleAt) {
    let locked = 0, open = 0, none = 0;
    for (let r = range.r1; r <= range.r2; r++) for (let c = range.c1; c <= range.c2; c++) {
        const v = ruleAt(r, c);
        if (v === true) locked++; else if (v === false) open++; else none++;
    }
    const kinds = (locked ? 1 : 0) + (open ? 1 : 0) + (none ? 1 : 0);
    if (kinds > 1) return "mixed";
    return locked ? "locked" : open ? "open" : "default";
}

/** Keep the draft consistent after the grid's shape changed (a column removed, rows frozen): rules past the last column go; the others stay. */
export function dropColumn(draft, index) {
    // a rule only on that column goes; one that spans it gets one column narrower; one after it moves one column left
    const shift = (list) => clone(list).filter((x) => !(x.c1 === index && x.c2 === index)).map((x) => Object.assign({}, x, { c1: x.c1 > index ? x.c1 - 1 : x.c1, c2: x.c2 >= index ? x.c2 - 1 : x.c2 }));
    return { merges: shift(draft.merges), borders: shift(draft.borders), locks: shift(draft.locks) };
}

/** A column moved from `from` to `to` in the list: the rules keep their cells' columns, so they are mapped to where those columns went. */
export function moveColumn(draft, from, to) {
    const map = (c) => (c === from ? to : from < to ? (c > from && c <= to ? c - 1 : c) : (c >= to && c < from ? c + 1 : c));
    const remap = (list) => clone(list).map((x) => {
        // a range of several columns that the move would tear apart is not a range any more: it keeps its first and last column's new places
        const a = map(x.c1), b = map(x.c2);
        return Object.assign({}, x, { c1: Math.min(a, b), c2: Math.max(a, b) });
    });
    return { merges: remap(draft.merges), borders: remap(draft.borders), locks: remap(draft.locks) };
}

/** One line for the dialog's status bar: "Rows 2-4 x columns 1-3 (9 cells)". Counted from 1 for people. */
export function describeRange(range) {
    if (!range) return "Nothing selected: click a cell, or drag over several.";
    const rows = range.r1 === range.r2 ? "Row " + (range.r1 + 1) : "Rows " + (range.r1 + 1) + "-" + (range.r2 + 1);
    const cols = range.c1 === range.c2 ? "column " + (range.c1 + 1) : "columns " + (range.c1 + 1) + "-" + (range.c2 + 1);
    const n = cellCount(range);
    return rows + ", " + cols + " (" + n + " cell" + (n === 1 ? "" : "s") + ")";
}

/** Whether two ranges are the same box. */
export const sameRange = (a, b) => !!a && !!b && same(a, b);
