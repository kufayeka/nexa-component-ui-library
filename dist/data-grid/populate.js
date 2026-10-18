// Data Grid: populate. Pure (no imports, no DOM).
//
// A populate rule sits on one cell ("B2") and takes a value from a message (or a variable, a tag): what it gets is put into the cells from
// there on, down or to the right. This file turns "a value and a rule" into "these cells".
//
//   a single value                 -> that one cell
//   [1, 2, 3]                      -> three cells, down (or to the right)
//   [[1, 2], [3, 4]]               -> a block: each inner array is a row (down) / a column (right)
//   [{ id: 1, t: 5 }, { id: 2 }]   -> a table: a row per object, a column per field (a first row with the field names, when asked)

const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

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
    if (!Array.isArray(value)) {
        if (isPlain(value)) return matrixOf([value], spec);
        return [[value]];
    }
    if (!value.length) return [];
    if (value.every((x) => Array.isArray(x))) return value.map((row) => row.slice());
    if (value.slice(0, 50).some((x) => isPlain(x))) {
        const rows = value.filter((x) => isPlain(x));
        const fields = fieldsOf(rows, spec && spec.fields);
        const body = rows.map((o) => fields.map((f) => o[f]));
        return spec && spec.header ? [fields.slice()].concat(body) : body;
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
            out.cells.push({ r, c, v: cellValue(line[j]) });
            if (r < r1) r1 = r; if (r > r2) r2 = r; if (c < c1) c1 = c; if (c > c2) c2 = c;
        }
    }
    if (out.cells.length) out.range = { r1, c1, r2, c2 };
    return out;
}
