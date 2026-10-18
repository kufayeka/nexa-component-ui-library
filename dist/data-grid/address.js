// Data Grid: Excel addressing. Pure (no imports, no DOM).
//
// Columns are letters (A … Z, AA … ZZ), rows are numbers from 1: a cell is "B7", a range "A1:C3". Inside, everything counts from 0
// ({ r: 6, c: 1 }); the text form is what people read and what the props store.

export const MAX_ROWS = 1000;
export const MAX_COLS = 702;       // A … ZZ

/** The letters of a column: 0 -> "A", 25 -> "Z", 26 -> "AA", 701 -> "ZZ". */
export function colName(index) {
    let n = Math.floor(index) + 1, out = "";
    if (!(n > 0)) return "";
    while (n > 0) { const m = (n - 1) % 26; out = String.fromCharCode(65 + m) + out; n = Math.floor((n - 1) / 26); }
    return out;
}

/** The index of a column's letters: "A" -> 0, "AA" -> 26. -1 when it is not letters. */
export function colIndex(name) {
    const t = String(name === undefined || name === null ? "" : name).trim().toUpperCase();
    if (!/^[A-Z]{1,3}$/.test(t)) return -1;
    let n = 0;
    for (let i = 0; i < t.length; i++) n = n * 26 + (t.charCodeAt(i) - 64);
    return n - 1;
}

/** "B7" (also "$B$7", any case) -> { r: 6, c: 1 }, or null. */
export function parseAddress(text) {
    const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,4})$/.exec(String(text === undefined || text === null ? "" : text).trim());
    if (!m) return null;
    const c = colIndex(m[1]), r = Number(m[2]) - 1;
    return c < 0 || r < 0 ? null : { r, c };
}

/** { r: 6, c: 1 } -> "B7". */
export function addressOf(r, c) { return colName(c) + (r + 1); }

/**
 * "A1:C3" or "B2" -> { r1, c1, r2, c2 } (corners put in order), or null. Whole columns ("B:B", "A:C") and whole rows ("2:2", "2:5") work as in a sheet:
 * they reach the end of the sheet's largest size, and clampRange cuts them to the size it has.
 */
export function parseRange(text) {
    const whole = String(text === undefined || text === null ? "" : text).trim();
    const cols = /^\$?([A-Za-z]{1,3}):\$?([A-Za-z]{1,3})$/.exec(whole);
    if (cols) {
        const a = colIndex(cols[1]), b = colIndex(cols[2]);
        return a < 0 || b < 0 ? null : { r1: 0, c1: Math.min(a, b), r2: MAX_ROWS - 1, c2: Math.max(a, b) };
    }
    const rowsOnly = /^\$?(\d{1,4}):\$?(\d{1,4})$/.exec(whole);
    if (rowsOnly) {
        const a = Number(rowsOnly[1]) - 1, b = Number(rowsOnly[2]) - 1;
        return a < 0 || b < 0 ? null : { r1: Math.min(a, b), c1: 0, r2: Math.max(a, b), c2: MAX_COLS - 1 };
    }
    const parts = whole.split(":");
    if (parts.length > 2 || !parts[0]) return null;
    const a = parseAddress(parts[0]), b = parts.length === 2 ? parseAddress(parts[1]) : a;
    if (!a || !b) return null;
    return { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) };
}

/** { r1, c1, r2, c2 } -> "A1:C3", or "B2" for one cell. */
export function rangeText(range) {
    if (!range) return "";
    const a = addressOf(range.r1, range.c1);
    return range.r1 === range.r2 && range.c1 === range.c2 ? a : a + ":" + addressOf(range.r2, range.c2);
}

/** A range kept inside a sheet of `rows` x `cols`; null when nothing of it is inside. */
export function clampRange(range, rows, cols) {
    if (!range || rows < 1 || cols < 1) return null;
    const r = { r1: Math.max(0, range.r1), c1: Math.max(0, range.c1), r2: Math.min(rows - 1, range.r2), c2: Math.min(cols - 1, range.c2) };
    return r.r1 > r.r2 || r.c1 > r.c2 ? null : r;
}

/** The sheet's size from the props: whole numbers within the limits. */
export function sizeOf(rows, cols) {
    const n = (v, d, max) => { const x = Math.floor(Number(v)); return isFinite(x) && x >= 1 ? Math.min(x, max) : d; };
    return { rows: n(rows, 100, MAX_ROWS), cols: n(cols, 26, MAX_COLS) };
}

/**
 * The shortest text for a range in a sheet of `rows` x `cols`: whole columns as "B:C", whole rows as "2:5", the rest as "A1:C3". A range that
 * reaches the sheet's last row (or column) is a whole column (row), so it still covers the cells added when the sheet grows.
 */
export function rangeLabel(range, rows, cols) {
    if (!range) return "";
    if (range.r1 === 0 && range.r2 >= rows - 1) return colName(range.c1) + ":" + colName(range.c2);
    if (range.c1 === 0 && range.c2 >= cols - 1) return (range.r1 + 1) + ":" + (range.r2 + 1);
    return rangeText(range);
}
