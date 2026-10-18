// Data Grid: the rows. Pure (no imports, no DOM).
//
// The grid owns a copy of the rows it was given. A message replaces them (setData) or changes some of them (upsert / patch / remove)
// by key, so a realtime viewer touches one row, not the whole table. What the user edits in the grid is written into this copy.
// Sorting and filtering never reorder the copy: they produce an index (the order to show), so 100 000 rows are not copied.

/**
 * Rows from whatever arrived. An array of objects is used as it is; an array of arrays has its first row as the column names;
 * one object is one row; anything else is no rows.
 */
export function normalizeData(data) {
    if (data === null || data === undefined) return [];
    if (!Array.isArray(data)) return typeof data === "object" ? [data] : [];
    if (!data.length) return [];
    if (Array.isArray(data[0])) {
        const names = data[0].map((n) => String(n));
        const out = [];
        for (let i = 1; i < data.length; i++) {
            const line = data[i];
            if (!Array.isArray(line)) continue;
            const row = {};
            names.forEach((n, j) => { row[n] = line[j]; });
            out.push(row);
        }
        return out;
    }
    return data.filter((r) => r !== null && typeof r === "object");
}

/** The key of a row: the field named by `rowKey` when it has a value, otherwise its position as text. */
export function keyOf(row, rowKey, position) {
    if (rowKey && row && row[rowKey] !== undefined && row[rowKey] !== null && row[rowKey] !== "") return String(row[rowKey]);
    return String(position);
}

/** A store of rows: `rows` in the order they came, `keys` beside them, `byKey` to find one at once, `version` that grows with every change. */
export function createStore(rows, rowKey) {
    const store = { rows: [], keys: [], byKey: new Map(), rowKey: rowKey || "", version: 0 };
    return storeSet(store, rows);
}

function indexAll(store) {
    store.keys = new Array(store.rows.length);
    store.byKey = new Map();
    for (let i = 0; i < store.rows.length; i++) {
        let key = keyOf(store.rows[i], store.rowKey, i);
        // two rows with the same key would hide each other: the later one gets a suffix, and stays reachable by position
        if (store.byKey.has(key)) key = key + "#" + i;
        store.keys[i] = key;
        store.byKey.set(key, i);
    }
}

/** Replace everything. */
export function storeSet(store, rows) {
    store.rows = Array.isArray(rows) ? rows.slice() : [];
    indexAll(store);
    store.version++;
    return store;
}

/** The position of a key, or -1. */
export function positionOf(store, key) {
    const at = store.byKey.get(String(key));
    return at === undefined ? -1 : at;
}

/**
 * Change one row: the given fields are put on it (the others stay). A key that is not there is ignored (use upsert to add it).
 * Returns the position, or -1.
 */
export function storePatch(store, key, fields) {
    const at = positionOf(store, key);
    if (at === -1 || !fields || typeof fields !== "object") return -1;
    // a new object: a row the caller still holds (the message that brought it) is never changed behind its back
    store.rows[at] = Object.assign({}, store.rows[at], fields);
    store.version++;
    return at;
}

/** Rows by key: a known key is merged into its row, an unknown one is added at the end. Returns { added, changed } counts. */
export function storeUpsert(store, rows) {
    let added = 0, changed = 0;
    normalizeData(rows).forEach((row) => {
        const key = store.rowKey && row[store.rowKey] !== undefined && row[store.rowKey] !== null && row[store.rowKey] !== "" ? String(row[store.rowKey]) : "";
        const at = key ? positionOf(store, key) : -1;
        if (at !== -1) { store.rows[at] = Object.assign({}, store.rows[at], row); changed++; }
        else { store.rows.push(row); const i = store.rows.length - 1; const k = key || String(i); store.keys.push(store.byKey.has(k) ? k + "#" + i : k); store.byKey.set(store.keys[i], i); added++; }
    });
    store.version++;
    return { added, changed };
}

/** Add one row at the end. Returns its key. */
export function storeAppend(store, row) {
    const r = row && typeof row === "object" ? row : {};
    store.rows.push(r);
    const i = store.rows.length - 1;
    let key = keyOf(r, store.rowKey, i);
    if (store.byKey.has(key)) key = key + "#" + i;
    store.keys.push(key);
    store.byKey.set(key, i);
    store.version++;
    return key;
}

/** Take a row out. The positions after it move up by one, so the index is rebuilt (rare, and a plain loop). Returns whether it was there. */
export function storeRemove(store, key) {
    const at = positionOf(store, key);
    if (at === -1) return false;
    store.rows.splice(at, 1);
    indexAll(store);
    store.version++;
    return true;
}

// ---- sorting and filtering ----------------------------------------------------------------------------

/** Order of two values of a column's type: numbers by size, dates by time, the rest as text (numbers inside text in natural order). */
export function compareValues(a, b, type) {
    const aNone = a === null || a === undefined || a === "", bNone = b === null || b === undefined || b === "";
    if (aNone || bNone) return aNone === bNone ? 0 : aNone ? 1 : -1;      // an empty value goes last, either direction handled by the caller
    if (type === "number" || type === "progress") {
        const x = Number(a), y = Number(b);
        if (isFinite(x) && isFinite(y)) return x - y;
    }
    if (type === "boolean") return (a === true || a === "true" ? 1 : 0) - (b === true || b === "true" ? 1 : 0);
    if (type === "date") {
        const x = new Date(typeof a === "number" && a < 1e11 ? a * 1000 : a).getTime(), y = new Date(typeof b === "number" && b < 1e11 ? b * 1000 : b).getTime();
        if (isFinite(x) && isFinite(y)) return x - y;
    }
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * A test for a filter text. A number column also takes a comparison ("> 5", ">= 5", "< 5", "<= 5", "= 5", "!= 5"); every other case is
 * "contains this text", ignoring case. Empty text = no test (null).
 */
export function compileFilter(text, type, textOf) {
    const t = String(text === undefined || text === null ? "" : text).trim();
    if (t === "") return null;
    if (type === "number" || type === "progress") {
        const m = /^(>=|<=|!=|=|>|<)\s*(-?\d+(?:[.,]\d+)?)$/.exec(t);
        if (m) {
            const n = Number(m[2].replace(",", "."));
            const ops = { ">": (v) => v > n, ">=": (v) => v >= n, "<": (v) => v < n, "<=": (v) => v <= n, "=": (v) => v === n, "!=": (v) => v !== n };
            const op = ops[m[1]];
            return (value) => { const v = Number(value); return value !== null && value !== undefined && value !== "" && isFinite(v) && op(v); };
        }
    }
    const needle = t.toLowerCase();
    return (value) => textOf(value).toLowerCase().indexOf(needle) !== -1;
}

/**
 * The positions to show, in order. `sort` is [{ key, dir: "asc" | "desc" }] (the first is the main one), `filters` is
 * { key: test }. `columnOf(key)` gives the column (its type); `valueOf(row, key)` the value to compare (the staged edit, when there is one).
 */
export function viewIndex(store, columnOf, sort, filters, valueOf) {
    const get = valueOf || ((row, key) => row[key]);
    let index = new Array(store.rows.length);
    for (let i = 0; i < index.length; i++) index[i] = i;
    const keys = filters ? Object.keys(filters).filter((k) => typeof filters[k] === "function") : [];
    if (keys.length) index = index.filter((i) => keys.every((k) => filters[k](get(store.rows[i], k))));
    if (sort && sort.length) {
        const specs = sort.map((s) => ({ key: s.key, sign: s.dir === "desc" ? -1 : 1, type: (columnOf(s.key) || {}).type }));
        // an empty value is last in both directions; ties keep their data order, so sorting twice is steady
        index.sort((a, b) => {
            for (const s of specs) {
                const x = get(store.rows[a], s.key), y = get(store.rows[b], s.key);
                const xNone = x === null || x === undefined || x === "", yNone = y === null || y === undefined || y === "";
                if (xNone || yNone) { if (xNone !== yNone) return xNone ? 1 : -1; continue; }
                const c = compareValues(x, y, s.type);
                if (c !== 0) return c * s.sign;
            }
            return a - b;
        });
    }
    return index;
}

/** A column's next sort when its header is clicked: ascending, then descending, then none. Other columns' sorts are dropped (one main sort). */
export function nextSort(sort, key) {
    const now = (sort || []).find((s) => s.key === key);
    if (!now) return [{ key, dir: "asc" }];
    if (now.dir === "asc") return [{ key, dir: "desc" }];
    return [];
}
