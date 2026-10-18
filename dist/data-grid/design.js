// Data Grid: what the "Edit grid" dialog does to the design, as plain functions. Pure (no imports, no DOM), tested in Node.
//
// A range is { r1, c1, r2, c2 } (inclusive, from 0; A1 is row 0, column 0). Every function gives back a NEW list: the dialog keeps a draft
// and only Apply puts it in the component, so nothing here may change what it is given.

import { rangeText, rangeLabel } from "./address.js";
import { fieldsAt } from "./sheet.js";

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

/** One line for the dialog's status bar: "B2:C4 (6 cells)". */
export function describeRange(range) {
    if (!range) return "Nothing selected: click a cell, or drag over several.";
    const n = cellCount(range);
    return rangeText(range) + " (" + n + " cell" + (n === 1 ? "" : "s") + ")";
}

/** Whether two ranges are the same box. */
export const sameRange = (a, b) => !!a && !!b && same(a, b);

// ---- the lists as the props store them: Excel text -----------------------------------------------------------------------

/** Merges as the props store them: [{ r1, c1, r2, c2 }] -> ["A1:B2"]. */
export function toTextMerges(list) { return list.map(rangeText); }

/** Border / lock rules as the props store them: the numbers go, the range is text ("B:C" when it is whole columns, "2:5" whole rows). */
export function toTextRules(list, rows, cols) {
    return list.map((x) => {
        const o = { range: rangeLabel(x, rows, cols) };
        Object.keys(x).forEach((k) => { if (["r1", "c1", "r2", "c2", "range"].indexOf(k) === -1) o[k] = x[k]; });
        return o;
    });
}

// ---- the type and style rules of cells ------------------------------------------------------------------------------------

/**
 * A change to the cells of a range as a rule: when the last rule has this very range, the change goes into it (turning Bold on and off does not make a
 * list of rules); otherwise a new rule follows. An empty value is "back to the default" and is kept: it covers what an earlier rule said.
 */
export function addRule(rules, rangeStr, patch) {
    const out = (Array.isArray(rules) ? rules : []).map((r) => Object.assign({}, r));
    const last = out[out.length - 1];
    if (last && last.range === rangeStr) Object.assign(last, patch);
    else out.push(Object.assign({ range: rangeStr }, patch));
    return out;
}

/**
 * What the cells of a range have in common: { key: value } for each key whose value is the same in every cell looked at; a key whose cells differ is left
 * out. `rules` are the parsed rules (sheet.js parseRules). At most 1500 cells are looked at: a whole column is sampled from its top.
 */
export function commonFields(rules, range, keys) {
    const out = {}, mixed = {};
    let seen = 0;
    for (let r = range.r1; r <= range.r2 && seen < 1500; r++) {
        for (let c = range.c1; c <= range.c2 && seen < 1500; c++, seen++) {
            const f = fieldsAt(rules, r, c);
            keys.forEach((k) => {
                if (mixed[k]) return;
                const has = Object.prototype.hasOwnProperty.call(f, k);
                if (seen === 0) { if (has) out[k] = f[k]; return; }
                if (has !== Object.prototype.hasOwnProperty.call(out, k) || (has && JSON.stringify(f[k]) !== JSON.stringify(out[k]))) { mixed[k] = true; delete out[k]; }
            });
        }
    }
    return out;
}

// ---- rules for pasted and filled cells -------------------------------------------------------------------------------------

/**
 * The rules that give the cells of a block the styles they came with. "cells" is the block as rows of the fields (the styles) each cell had in the copy,
 * "at" the cell of the sheet where it lands, currentFieldsAt(r, c) what the cell has now, "keys" the fields a rule may have. A field the copy does not
 * have but the cell has now is set to "" (back to the default), so a pasted plain cell is plain. The rules are short: neighbours with the same fields in
 * a row become one range, and identical rows one under the other become one range too.
 */
export function rulesFromCells(cells, at, currentFieldsAt, keys) {
    const runs = [];                                           // rows of { c1, c2, f, json }
    cells.forEach((row, i) => {
        const line = [];
        row.forEach((src, j) => {
            const now = currentFieldsAt(at.r + i, at.c + j) || {};
            const f = {};
            // a cell the block does not touch (null) is left as it is
            if (src !== null) (keys || []).forEach((k) => {
                if (src && Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined && src[k] !== null) f[k] = src[k];
                else if (Object.prototype.hasOwnProperty.call(now, k)) f[k] = "";
            });
            const json = JSON.stringify(f);
            const last = line[line.length - 1];
            if (last && last.json === json && last.c2 === at.c + j - 1) last.c2 = at.c + j;
            else line.push({ c1: at.c + j, c2: at.c + j, f, json });
        });
        runs.push(line);
    });
    const out = [];
    const open = new Map();                                    // "c1:c2:json" -> the rule being extended downwards
    runs.forEach((line, i) => {
        const keep = new Set();
        line.forEach((run) => {
            if (run.json === "{}") return;
            const id = run.c1 + ":" + run.c2 + ":" + run.json;
            const above = open.get(id);
            if (above && above.r2 === at.r + i - 1) { above.r2 = at.r + i; keep.add(id); return; }
            const rule = { r1: at.r + i, r2: at.r + i, c1: run.c1, c2: run.c2, f: run.f };
            open.set(id, rule); keep.add(id); out.push(rule);
        });
        open.forEach((v, id) => { if (!keep.has(id)) open.delete(id); });
    });
    return out.map((x) => Object.assign({ range: rangeText(x) }, x.f));
}
