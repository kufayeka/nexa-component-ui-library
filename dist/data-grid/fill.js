// Data Grid: the fill handle. Pure (no DOM).
//
// The small square at the corner of the selection is dragged down, up, to the right or to the left: the cells it passes get what the selection has.
// Values go on as a series where they are one (numbers, a text that ends in a number), else they repeat; the style of the cells repeats.

const isNum = (v) => typeof v === "number" && isFinite(v);
const round = (x) => Math.round(x * 1e10) / 1e10;

/** "Item 7" -> { prefix: "Item ", n: 7, width: 1 }; "A007" -> { prefix: "A", n: 7, width: 3 }; null when the text does not end in a number. */
export function splitNumberSuffix(s) {
    const m = /^(.*?)(\d+)$/.exec(String(s));
    if (!m) return null;
    return { prefix: m[1], n: Number(m[2]), width: m[2].length, padded: m[2].length > 1 && m[2][0] === "0" };
}

/**
 * The values a fill puts after (or, `backward`, before) the values of the selection along one line. `src` is the selection's values in that line, `count`
 * how many cells to fill. A series of numbers goes on by the step between the first and the last (one number: by 1); a text that ends in the same
 * kind of number goes on the same way ("Item 1", "Item 2"); everything else, and everything with `copy` (Ctrl held), repeats.
 */
export function seriesValues(src, count, opts) {
    const o = opts || {};
    const n = src.length, out = [];
    if (!n || count <= 0) return out;
    const repeat = () => { for (let k = 0; k < count; k++) out.push(o.backward ? src[(n - 1 - (k % n)) % n] : src[k % n]); return out; };
    if (o.copy) return repeat();
    if (src.every(isNum)) {
        const step = n === 1 ? 1 : (src[n - 1] - src[0]) / (n - 1);
        for (let k = 1; k <= count; k++) out.push(round(o.backward ? src[0] - step * k : src[n - 1] + step * k));
        return out;
    }
    const parts = src.map((v) => (typeof v === "string" ? splitNumberSuffix(v) : null));
    if (parts.every(Boolean) && parts.every((p) => p.prefix === parts[0].prefix)) {
        const step = n === 1 ? 1 : (parts[n - 1].n - parts[0].n) / (n - 1);
        const width = Math.max(...parts.map((p) => (p.padded ? p.width : 0)));
        for (let k = 1; k <= count; k++) {
            const v = round(o.backward ? parts[0].n - step * k : parts[n - 1].n + step * k);
            if (v < 0) { out.push(src[(k - 1) % n]); continue; }
            out.push(parts[0].prefix + (width ? String(v).padStart(width, "0") : String(v)));
        }
        return out;
    }
    return repeat();
}

/**
 * Where a fill from `source` (a range) goes when the handle is dragged to the cell `to`: { dir, target } with the range of the cells it adds, or null when
 * the drag stays inside the selection. The direction is the one the drag went furthest along.
 */
export function fillTarget(source, to, limits) {
    const down = to.r - source.r2, up = source.r1 - to.r, right = to.c - source.c2, left = source.c1 - to.c;
    const best = Math.max(down, up, right, left);
    if (best <= 0) return null;
    // a drag that goes along both axes follows the one that went further, but a drag still inside the other axis's span is a plain line
    const vertical = Math.max(down, up) >= Math.max(right, left);
    if (vertical) {
        if (down >= up) return { dir: "down", target: { r1: source.r2 + 1, c1: source.c1, r2: Math.min(to.r, limits.rows - 1), c2: source.c2 } };
        return { dir: "up", target: { r1: Math.max(to.r, 0), c1: source.c1, r2: source.r1 - 1, c2: source.c2 } };
    }
    if (right >= left) return { dir: "right", target: { r1: source.r1, c1: source.c2 + 1, r2: source.r2, c2: Math.min(to.c, limits.cols - 1) } };
    return { dir: "left", target: { r1: source.r1, c1: Math.max(to.c, 0), r2: source.r2, c2: source.c1 - 1 } };
}
