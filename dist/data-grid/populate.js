// Data Grid: populate. Pure (no imports, no DOM).
//
// A populate rule sits on one cell ("B2") and takes a value from a message (or a variable, a tag): what it gets is put into the cells from
// there on, down or to the right. This file turns "a value and a rule" into "these cells".
//
//   a single value                 -> that one cell
//   [1, 2, 3]                      -> three cells, down (or to the right)
//   [[1, 2], [3, 4]]               -> a block: each inner array is a row (down) / a column (right)
//   [{ id: 1, t: 5 }, { id: 2 }]   -> a table: a row per object, a column per field (a first row with the field names, when asked)
//   { value: 12, fill: "red" }     -> a CELL OBJECT: the value of a cell and what it overrides (any field of a type / style rule: type, fill, bold ...)
//
// A cell object can stand anywhere a value can: in a list, in a block, as a field of a row of a table. A list of objects that all have a "value" is a
// list of cells; one whose objects do not is a table. The rule's Shape can say which, when the data is not clear.

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** A cell object: a plain object with a "value" and nothing but fields a rule may have (`keys`). Anything else (a row of a table that has a field "value") is data. */
export function isCellObject(v, keys) {
    if (!isPlain(v) || !Object.prototype.hasOwnProperty.call(v, "value")) return false;
    const ok = keys ? new Set(keys) : null;
    return Object.keys(v).every((k) => k === "value" || (ok !== null && ok.has(k)));
}

/** What a cell holds: a plain value as it is; a nested object or array as JSON text (a cell shows one thing). */
function cellValue(v) {
    if (v === null || typeof v !== "object") return v;
    try { return JSON.stringify(v); } catch (e) { return String(v); }
}

/** The fields of a list of objects: the named ones, or the keys the first rows have, in the order they appear. */
export function fieldsOf(rows, named) {
    if (Array.isArray(named) && named.length) return named.slice();
    const out = [], seen = new Set();
    rows.slice(0, 50).forEach((row) => { if (isPlain(row)) Object.keys(row).forEach((k) => { if (!seen.has(k)) { seen.add(k); out.push(k); } }); });
    return out;
}

/** "id, temp,state" -> ["id", "temp", "state"]. */
export function parseFields(text) {
    return String(text === undefined || text === null ? "" : text).split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * The matrix a value makes, before it is laid down: rows of cell values. A list of scalars is a column (one value per row); the direction later
 * turns it into a row when it goes to the right.
 */
export function matrixOf(value, spec) {
    if (value === undefined) return [];
    const shape = (spec && spec.shape) || "auto", keys = spec && spec.cellKeys;
    const table = (rows) => {
        const fields = fieldsOf(rows, spec && spec.fields);
        const body = rows.map((o) => fields.map((f) => o[f]));
        return spec && spec.header ? [fields.slice()].concat(body) : body;
    };
    if (!Array.isArray(value)) {
        if (isPlain(value) && !isCellObject(value, keys) && (shape === "auto" || shape === "table")) return table([value]);
        return [[value]];
    }
    if (!value.length) return [];
    if (value.every((x) => Array.isArray(x))) return value.map((row) => row.slice());
    const objects = value.filter((x) => isPlain(x));
    if (objects.length && shape !== "list" && shape !== "cells") {
        // a list whose objects are all cells is a list of cells; otherwise its objects are the rows of a table
        if (shape === "table" || !objects.every((x) => isCellObject(x, keys))) return table(objects);
    }
    return value.map((x) => [x]);
}

/**
 * The cells a rule fills: { cells: [{ r, c, v }], range } with `range` the box they cover ({ r1, c1, r2, c2 }, or null when there are none).
 * `spec` is { at: { r, c }, direction: "down" | "right", header, fields (an array), limit (0 = no limit) }; `limits` is { rows, cols }, the sheet:
 * what falls outside it is dropped. A value that is `undefined` leaves its cell alone; `null` makes it empty (it covers what was under it).
 */
export function expandPopulate(value, spec, limits) {
    const out = { cells: [], range: null };
    if (!spec || !spec.at) return out;
    const matrix = matrixOf(value, spec);
    const right = spec.direction === "right";
    const cap = Math.floor(Number(spec.limit)) > 0 ? Math.floor(Number(spec.limit)) : Infinity;
    let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
    for (let i = 0; i < matrix.length && out.cells.length < cap; i++) {
        const line = matrix[i];
        for (let j = 0; j < line.length && out.cells.length < cap; j++) {
            if (line[j] === undefined) continue;
            // down: a row of the matrix is a row of the sheet; right: it is a column (the matrix is turned over)
            const r = spec.at.r + (right ? j : i), c = spec.at.c + (right ? i : j);
            if (r >= limits.rows || c >= limits.cols) continue;
            const raw = line[j];
            if (isCellObject(raw, spec.cellKeys)) {
                // a cell object: its value, and the fields it overrides
                const f = {};
                Object.keys(raw).forEach((k) => { if (k !== "value" && raw[k] !== undefined && raw[k] !== null) f[k] = raw[k]; });
                out.cells.push({ r, c, v: raw.value === undefined ? undefined : cellValue(raw.value), f });
            } else out.cells.push({ r, c, v: cellValue(raw) });
            if (r < r1) r1 = r; if (r > r2) r2 = r; if (c < c1) c1 = c; if (c > c2) c2 = c;
        }
    }
    if (out.cells.length) out.range = { r1, c1, r2, c2 };
    return out;
}
