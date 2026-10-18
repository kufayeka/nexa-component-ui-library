// Data Grid: the sheets of a workbook (the tabs). Pure (no DOM).
//
// A grid keeps a list of sheets. Each sheet has its own name, whether it is shown as a tab, whether it can be edited, and everything a sheet has: its size, cells,
// rules of types and styles, merges, borders, locks, sizes of columns and rows, frozen panes, populate rules, the area shown, the area to sort. What is the same for
// the whole grid (how it saves, whether it can be sorted, found, exported, the formula bar, the tabs) is not in a sheet.

/** The stored keys of a sheet (besides its name, whether it is shown and its mode). */
export const SHEET_KEYS = ["rows", "cols", "viewArea", "freezeRows", "freezeCols", "showHeaders", "showGridLines", "colWidth", "colRules", "adjustCols", "minColWidth", "maxColWidth",
    "rowHeight", "rowRules", "adjustRows", "autoFit", "minRowHeight", "maxRowHeight", "sortArea", "sortHeader", "populate", "cells", "cellRules", "merges", "borders", "locks"];

const MAX_NAME = 31;

/** A name a sheet can have in Excel: no more than 31 characters, none of [ ] : * ? / \, not starting or ending with an apostrophe. Empty when nothing is left. */
export function cleanName(text) {
    let t = String(text === undefined || text === null ? "" : text).replace(/[\[\]:*?\/\\]/g, "_").trim();
    t = t.replace(/^'+|'+$/g, "").slice(0, MAX_NAME).trim();
    return t;
}

/** `base` made different from every name in `taken` (any case): "Sheet2" -> "Sheet2 (2)". */
export function uniqueName(base, taken) {
    const used = new Set((taken || []).map((n) => String(n).toLowerCase()));
    const root = cleanName(base) || "Sheet";
    if (!used.has(root.toLowerCase())) return root;
    for (let i = 2; i < 10000; i++) {
        const tail = " (" + i + ")";
        const name = root.slice(0, MAX_NAME - tail.length) + tail;
        if (!used.has(name.toLowerCase())) return name;
    }
    return root;
}

/**
 * The list of sheets as the grid can work with it: at least one; every one an object with a name that is a name in Excel and different from the others (any case);
 * a sheet that is not an object is dropped. A sheet that is fine is kept as it is (the same object).
 */
export function normalizeSheets(list) {
    const src = Array.isArray(list) ? list.filter((s) => s && typeof s === "object" && !Array.isArray(s)) : [];
    if (!src.length) return [{ name: "Sheet1" }];
    const taken = [];
    return src.map((s, i) => {
        const wanted = cleanName(s.name) || "Sheet" + (i + 1);
        const name = uniqueName(wanted, taken);
        taken.push(name);
        return name === s.name ? s : Object.assign({}, s, { name });
    });
}

/** The place of the sheet called `name` (any case), or -1. */
export function indexOfSheet(sheets, name) {
    const n = String(name === undefined || name === null ? "" : name).toLowerCase();
    if (n === "") return -1;
    return sheets.findIndex((s) => String(s.name).toLowerCase() === n);
}

/** A sheet is shown as a tab unless it says `visible: false`. */
export const isVisible = (sheet) => !sheet || sheet.visible !== false;

/** The sheet to show: the one called `name`, or else the first one that is shown, or else the first. */
export function activeIndex(sheets, name) {
    const at = indexOfSheet(sheets, name);
    if (at >= 0) return at;
    const first = sheets.findIndex(isVisible);
    return first >= 0 ? first : 0;
}

/** The places of the sheets that are shown as tabs. */
export function visibleIndexes(sheets) {
    const out = [];
    sheets.forEach((s, i) => { if (isVisible(s)) out.push(i); });
    return out;
}

/** The list with a new, empty sheet at the end (or after `after`), named "Sheet<n>". */
export function addSheet(sheets, after) {
    const name = uniqueName("Sheet" + (sheets.length + 1), sheets.map((s) => s.name));
    const at = after === undefined || after === null ? sheets.length : Math.min(sheets.length, Math.max(0, after + 1));
    const out = sheets.slice();
    out.splice(at, 0, { name });
    return out;
}

/** The list without sheet `i`. The last sheet cannot be taken away. */
export function removeSheet(sheets, i) {
    if (sheets.length <= 1 || i < 0 || i >= sheets.length) return sheets;
    return sheets.filter((s, k) => k !== i);
}

/** The list with sheet `i` moved by `by` places (-1: left). */
export function moveSheet(sheets, i, by) {
    const j = i + by;
    if (i < 0 || i >= sheets.length || j < 0 || j >= sheets.length) return sheets;
    const out = sheets.slice();
    const [one] = out.splice(i, 1);
    out.splice(j, 0, one);
    return out;
}

/** A copy of sheet `i`, named "<name> (2)", right after it. */
export function duplicateSheet(sheets, i) {
    if (i < 0 || i >= sheets.length) return sheets;
    const copy = JSON.parse(JSON.stringify(sheets[i]));
    copy.name = uniqueName(sheets[i].name, sheets.map((s) => s.name));
    const out = sheets.slice();
    out.splice(i + 1, 0, copy);
    return out;
}

/** The list with sheet `i` renamed (to a name that is clean and different from the other sheets'); the name it got. */
export function renameSheet(sheets, i, name) {
    if (i < 0 || i >= sheets.length) return { sheets, name: "" };
    const taken = sheets.filter((s, k) => k !== i).map((s) => s.name);
    const clean = cleanName(name) || sheets[i].name;
    const final = uniqueName(clean, taken);
    const out = sheets.slice();
    out[i] = Object.assign({}, sheets[i], { name: final });
    return { sheets: out, name: final };
}
