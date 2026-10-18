// Data Grid: the sizes of the columns and the rows. Pure (no DOM).
//
// Sizes are rules over columns ("B:C") and rows ("2:5"), like every other rule of the grid: a width or a height, the smallest and the largest it may be
// dragged to, and whether the user may drag it at all. The last rule that says something about a field wins for that field. The grid's own settings
// (column width, row height, the limits, adjustable or not) are what a column or a row has when no rule talks about it.
import { colName } from "./address.js";

const num = (v) => { if (v === "" || v === null || v === undefined) return undefined; const n = Number(v); return isFinite(n) && n >= 0 ? n : undefined; };
const flag = (v) => (v === true || v === "true" ? true : v === false || v === "false" ? false : undefined);

/** "B" -> { c1: 1, c2: 1 }; "B:D" -> { c1: 1, c2: 3 }; null when it is not column letters. */
export function parseColumns(text) {
    const m = /^\s*\$?([A-Za-z]{1,3})(?::\$?([A-Za-z]{1,3}))?\s*$/.exec(String(text === undefined || text === null ? "" : text));
    if (!m) return null;
    const idx = (s) => { let n = 0; const t = s.toUpperCase(); for (let i = 0; i < t.length; i++) n = n * 26 + (t.charCodeAt(i) - 64); return n - 1; };
    const a = idx(m[1]), b = m[2] ? idx(m[2]) : a;
    return { c1: Math.min(a, b), c2: Math.max(a, b) };
}

/** "3" -> { r1: 2, r2: 2 }; "2:5" -> { r1: 1, r2: 4 }; null when it is not row numbers. */
export function parseRows(text) {
    const m = /^\s*\$?(\d{1,4})(?::\$?(\d{1,4}))?\s*$/.exec(String(text === undefined || text === null ? "" : text));
    if (!m) return null;
    const a = Number(m[1]) - 1, b = m[2] ? Number(m[2]) - 1 : a;
    return a < 0 || b < 0 ? null : { r1: Math.min(a, b), r2: Math.max(a, b) };
}

/** The text of columns c1..c2: "B" or "B:D". */
export function columnsText(c1, c2) { return c1 === c2 ? colName(c1) : colName(c1) + ":" + colName(c2); }

/** The text of rows r1..r2 (from 0): "3" or "2:5". */
export function rowsText(r1, r2) { return r1 === r2 ? String(r1 + 1) : (r1 + 1) + ":" + (r2 + 1); }

/** The column rules, cleaned: { c1, c2, f } with the fields a column rule may have, as numbers / a flag. Rules outside the sheet or unreadable are left out. */
export function parseColRules(list, cols) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((x) => {
        const g = x && typeof x === "object" ? parseColumns(x.columns) : null;
        if (!g || g.c1 >= cols) return;
        const f = {};
        [["width", "width"], ["minWidth", "min"], ["maxWidth", "max"]].forEach(([from, to]) => { const v = num(x[from]); if (v !== undefined) f[to] = v; });
        const a = flag(x.adjustable); if (a !== undefined) f.adjustable = a;
        if (Object.keys(f).length) out.push({ c1: g.c1, c2: Math.min(g.c2, cols - 1), f });
    });
    return out;
}

/** The row rules, cleaned: { r1, r2, f } (height, min, max, adjustable, fit). */
export function parseRowRules(list, rows) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((x) => {
        const g = x && typeof x === "object" ? parseRows(x.rows) : null;
        if (!g || g.r1 >= rows) return;
        const f = {};
        [["height", "height"], ["minHeight", "min"], ["maxHeight", "max"]].forEach(([from, to]) => { const v = num(x[from]); if (v !== undefined) f[to] = v; });
        const a = flag(x.adjustable); if (a !== undefined) f.adjustable = a;
        const fit = flag(x.fit); if (fit !== undefined) f.fit = fit;
        if (Object.keys(f).length) out.push({ r1: g.r1, r2: Math.min(g.r2, rows - 1), f });
    });
    return out;
}

/** A size kept between its limits (a missing limit does not limit). */
export function clampSize(v, min, max) {
    let n = Number(v);
    if (!isFinite(n)) return v;
    if (isFinite(min)) n = Math.max(min, n);
    if (isFinite(max)) n = Math.min(max, n);
    return n;
}

/**
 * Every column's size: [{ width, min, max, adjustable }]. `d` is what the grid says when no rule does: { width, min, max, adjustable }. A width is
 * kept between the column's own limits.
 */
export function colSizes(rules, cols, d) {
    const out = [];
    for (let c = 0; c < cols; c++) out.push({ width: d.width, min: d.min, max: d.max, adjustable: d.adjustable });
    rules.forEach((r) => { for (let c = r.c1; c <= r.c2; c++) Object.assign(out[c], r.f); });
    out.forEach((s) => { s.width = clampSize(s.width, s.min, s.max); });
    return out;
}

/**
 * The size of the rows a rule talks about: a Map row -> { height, min, max, adjustable, fit }. A row no rule talks about has the grid's: `d` is
 * { height, min, max, adjustable, fit }. (A Map, not an array of 1000: most rows are the grid's.)
 */
export function rowSizes(rules, d) {
    const map = new Map();
    rules.forEach((r) => {
        for (let i = r.r1; i <= r.r2; i++) {
            const s = map.get(i) || { height: d.height, min: d.min, max: d.max, adjustable: d.adjustable, fit: d.fit };
            Object.assign(s, r.f);
            map.set(i, s);
        }
    });
    map.forEach((s) => { s.height = clampSize(s.height, s.min, s.max); });
    return map;
}

/** One row's size: the rule's, or the grid's. */
export function rowSizeAt(map, r, d) {
    return map.get(r) || { height: clampSize(d.height, d.min, d.max), min: d.min, max: d.max, adjustable: d.adjustable, fit: d.fit };
}

// ---- what the dialog does to the lists ------------------------------------------------------------------------------------------

function fold(list, key, text, patch) {
    const out = (Array.isArray(list) ? list : []).map((r) => Object.assign({}, r));
    const last = out[out.length - 1];
    if (last && last[key] === text) Object.assign(last, patch);
    else out.push(Object.assign({ [key]: text }, patch));
    return out;
}

/** A change to the columns c1..c2 as a rule: into the last rule when it is for the same columns, else a new rule. */
export function setColSize(list, c1, c2, patch) { return fold(list, "columns", columnsText(c1, c2), patch); }

/** A change to the rows r1..r2 (from 0) as a rule. */
export function setRowSize(list, r1, r2, patch) { return fold(list, "rows", rowsText(r1, r2), patch); }
