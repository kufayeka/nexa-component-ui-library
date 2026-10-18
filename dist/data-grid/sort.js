// Data Grid: sorting and finding. Pure (no DOM).
//
// On a page, sorting is a VIEW over an area of the sheet: the cells keep their addresses (a message still fills the cell it was meant for), only what
// is shown moves. In the Edit grid dialog it is physical, as in Excel: the typed cells of the selected rows change places.

const none = (v) => v === null || v === undefined || v === "";

/**
 * The order of two values as a sheet sorts a column: numbers by size, before the text (which goes in natural order, so "item2" is before "item10"),
 * booleans after the text; empty values are not compared here (they go last, whatever the direction: see sortPerm).
 */
export function compareValues(a, b) {
    // 0: a number (or a text that is one), 1: other text, 2: a boolean
    const rank = (v) => ((typeof v === "number" || (typeof v === "string" && v.trim() !== "" && isFinite(Number(v)))) ? 0 : typeof v === "boolean" ? 2 : 1);
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return Number(a) - Number(b);
    if (ra === 2) return (a ? 1 : 0) - (b ? 1 : 0);
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * The rows in sorted order: an array of the numbers 0 … count - 1 (a row's place), the first being the row that comes first. `valueAt(i)` is the value
 * of row i in the column sorted by, `dir` is "asc" or "desc". Empty values are last in both directions; equal values keep their order, so sorting
 * twice changes nothing.
 */
export function sortPerm(count, valueAt, dir) {
    const sign = dir === "desc" ? -1 : 1;
    const values = new Array(count);
    for (let i = 0; i < count; i++) values[i] = valueAt(i);
    const order = new Array(count);
    for (let i = 0; i < count; i++) order[i] = i;
    order.sort((x, y) => {
        const a = values[x], b = values[y];
        const an = none(a), bn = none(b);
        if (an || bn) return an === bn ? x - y : an ? 1 : -1;
        const c = compareValues(a, b);
        return c !== 0 ? c * sign : x - y;
    });
    return order;
}

/** The inverse of a sort order: for each row of the sheet, the place it is shown at. */
export function inversePerm(perm) {
    const inv = new Array(perm.length);
    perm.forEach((from, to) => { inv[from] = to; });
    return inv;
}

/**
 * The typed cells with the rows of a range put in order by one column of it (the design's sort: physical). "cells" is { "A1": value }, "range"
 * { r1, c1, r2, c2 }, "col" the column to sort by (inside the range). Only the cells of the range move; the rest of the object is as it was.
 * addressOf(r, c) is the address function (this file is pure and takes it in).
 */
export function sortRangeCells(cells, range, col, dir, addressOf) {
    const rows = range.r2 - range.r1 + 1;
    const out = Object.assign({}, cells);
    const line = (i) => { const o = {}; for (let c = range.c1; c <= range.c2; c++) { const a = addressOf(range.r1 + i, c); if (Object.prototype.hasOwnProperty.call(cells, a)) o[c] = cells[a]; } return o; };
    const lines = []; for (let i = 0; i < rows; i++) lines.push(line(i));
    const perm = sortPerm(rows, (i) => lines[i][col], dir);
    for (let i = 0; i < rows; i++) for (let c = range.c1; c <= range.c2; c++) delete out[addressOf(range.r1 + i, c)];
    perm.forEach((from, to) => { Object.keys(lines[from]).forEach((c) => { out[addressOf(range.r1 + to, Number(c))] = lines[from][c]; }); });
    return out;
}

// ---- finding ----------------------------------------------------------------------------------------------------------------

/**
 * The cells that hold a text: "items" is [{ r, c, text }] (the text each cell shows). Returns [{ r, c }] in reading order (row by row, left to right).
 * An empty query finds nothing.
 */
export function findMatches(items, query, caseSensitive) {
    const q = String(query === undefined || query === null ? "" : query);
    if (q === "") return [];
    const needle = caseSensitive ? q : q.toLowerCase();
    return items.filter((x) => (caseSensitive ? String(x.text) : String(x.text).toLowerCase()).indexOf(needle) !== -1)
        .map((x) => ({ r: x.r, c: x.c })).sort((a, b) => a.r - b.r || a.c - b.c);
}

/** The match after (or, when "backward", before) the current one, going round at the end. -1 when there are none. */
export function nextMatch(count, at, backward) {
    if (!count) return -1;
    if (at < 0 || at >= count) return backward ? count - 1 : 0;
    return backward ? (at - 1 + count) % count : (at + 1) % count;
}
