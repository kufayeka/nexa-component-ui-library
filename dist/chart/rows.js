// Nexa UI — chart rows: what a Logic message brings (an SQL / historian result, [{ time, floor, kwh }]) as the
// columns a Cartesian chart draws. Pure: no DOM, no SDK (tested on its own, test/chart-pure.test.js).
//
//   buildFrame(rows, map, opts) -> { xType, cats: [label…], series: [{ key, name, x: Float64Array | null, y: Float64Array }] }
//
//   map = { x: "time", y: "kwh" | ["kwh_f1", "kwh_f2"], split: "floor" }
//     long form: one y field + a `split` field  -> one series per distinct value of `split` (Power BI "Legend")
//     wide form: several y fields               -> one series per field
//     no split, one y                           -> one series (named after the y field)
//   opts = { xType: "auto" | "time" | "category" | "number", aggregate: "sum" | "avg" | "last" | "min" | "max" | "count",
//            order: "data" | "asc" | "desc", maxCategories }
//
// A category x: `cats` holds the labels (in the order of the data, or sorted) and every series' `y` is aligned to it
// (NaN where it has no value). A number / time x: `x` and `y` are sorted pairs (duplicates of one x are aggregated).
// Values are Float64: a value is shown as it came.

/** Epoch milliseconds from a number (seconds or milliseconds), a Date or an ISO string; NaN when it is none of them. */
export function toMs(v) {
    if (v instanceof Date) return v.getTime();
    if (typeof v === "number") return !Number.isFinite(v) ? NaN : v >= 1e9 && v < 1e11 ? v * 1000 : v;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) { const t = Date.parse(v); return Number.isFinite(t) ? t : NaN; }
    return NaN;
}

/** The kind of x a column holds: "time" (epoch seconds / ms, Dates, ISO strings), "number", or "category". */
export function detectXType(values) {
    let n = 0, num = 0, time = 0;
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (v === null || v === undefined || v === "") continue;
        n++;
        if (v instanceof Date || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && Number.isFinite(Date.parse(v)))) { time++; continue; }
        if (typeof v === "number" && Number.isFinite(v)) { num++; if (v >= 1e9) time++; }
    }
    if (!n) return "category";
    if (time === n) return "time";
    if (num === n) return "number";
    return "category";
}

function numberOf(v) {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") { const n = Number(v); return Number.isFinite(n) ? n : NaN; }
    return NaN;
}

function newCell() { return { sum: 0, n: 0, last: NaN, min: Infinity, max: -Infinity }; }
function addCell(c, y) { c.sum += y; c.n++; c.last = y; if (y < c.min) c.min = y; if (y > c.max) c.max = y; }
function cellValue(c, how) {
    if (!c || !c.n) return NaN;
    switch (how) {
        case "avg": return c.sum / c.n;
        case "last": return c.last;
        case "min": return c.min;
        case "max": return c.max;
        case "count": return c.n;
        default: return c.sum;
    }
}

export function buildFrame(rows, map, opts) {
    rows = Array.isArray(rows) ? rows : [];
    map = map || {}; opts = opts || {};
    const xKey = map.x || "x";
    const ys = Array.isArray(map.y) ? map.y.filter(Boolean) : [map.y || "y"];
    const split = map.split || "";
    const how = opts.aggregate || "sum";
    const xs = rows.map((r) => (r && typeof r === "object" ? r[xKey] : undefined));
    let xType = opts.xType && opts.xType !== "auto" ? opts.xType : detectXType(xs);
    const cap = Math.max(1, opts.maxCategories || 2000);

    // series keys in the order they first appear
    const names = [], seen = new Map();
    const seriesOf = (name) => {
        let s = seen.get(name);
        if (!s) { s = { key: name, name, cells: new Map() }; seen.set(name, s); names.push(s); }
        return s;
    };

    const cats = [], catIndex = new Map();
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r || typeof r !== "object") continue;
        let xv = r[xKey];
        let xk;
        if (xType === "time") { xk = toMs(xv); if (!Number.isFinite(xk)) continue; }
        else if (xType === "number") { xk = numberOf(xv); if (!Number.isFinite(xk)) continue; }
        else { xk = xv === undefined || xv === null ? "" : String(xv); }
        if (xType === "category" && !catIndex.has(xk)) { if (cats.length >= cap) continue; catIndex.set(xk, cats.length); cats.push(xk); }
        const add = (name, y) => {
            if (!Number.isFinite(y)) return;
            const s = seriesOf(name);
            let c = s.cells.get(xk);
            if (!c) { c = newCell(); s.cells.set(xk, c); }
            addCell(c, y);
        };
        if (split && ys.length === 1) add(r[split] === undefined || r[split] === null ? "" : String(r[split]), numberOf(r[ys[0]]));
        else for (const yk of ys) add(yk, numberOf(r[yk]));
    }

    if (xType === "category") {
        let order = cats.slice();
        if (opts.order === "asc") order.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        else if (opts.order === "desc") order.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
        const series = names.map((s) => {
            const y = new Float64Array(order.length).fill(NaN);
            order.forEach((k, i) => { const c = s.cells.get(k); if (c) y[i] = cellValue(c, how); });
            return { key: s.key, name: s.name, x: null, y };
        });
        return { xType, cats: order, series };
    }

    const series = names.map((s) => {
        const keys = Array.from(s.cells.keys()).sort((a, b) => a - b);
        const x = new Float64Array(keys.length), y = new Float64Array(keys.length);
        keys.forEach((k, i) => { x[i] = k; y[i] = cellValue(s.cells.get(k), how); });
        return { key: s.key, name: s.name, x, y };
    });
    return { xType, cats: [], series };
}
