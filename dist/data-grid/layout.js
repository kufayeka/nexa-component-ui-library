// Data Grid: the layout of the cells (merges, frozen rows and columns, borders) and who may edit which cell. Pure.
//
// Rows and columns are counted from 0 (A1 is row 0, column 0): the rules here take ranges as numbers; the props store them as Excel text and
// sheet.js reads them into numbers.

const int = (v, d) => { const n = Math.floor(Number(v)); return isFinite(n) ? n : d; };

/** How many rows and columns stay in place while the rest scrolls, kept within what exists. */
export function normalizeFreeze(rows, cols, rowCount, colCount) {
    return { rows: Math.max(0, Math.min(int(rows, 0), Math.max(0, rowCount - 1))), cols: Math.max(0, Math.min(int(cols, 0), Math.max(0, colCount - 1))) };
}

/**
 * The merges that can be drawn, and why the others cannot. A merge is { r1, c1, r2, c2 } (inclusive). It is dropped when it is not
 * a rectangle of at least two cells, lies outside the grid, overlaps one that came before it, or crosses the line of a frozen
 * row / column (a frozen cell and a scrolling cell move differently, so one box cannot be both).
 */
export function normalizeMerges(list, rowCount, colCount, freeze) {
    const merges = [], dropped = [];
    const f = freeze || { rows: 0, cols: 0 };
    (Array.isArray(list) ? list : []).forEach((m) => {
        if (!m || typeof m !== "object") { dropped.push({ merge: m, reason: "not a merge" }); return; }
        let r1 = int(m.r1, NaN), c1 = int(m.c1, NaN), r2 = int(m.r2, NaN), c2 = int(m.c2, NaN);
        if ([r1, c1, r2, c2].some((n) => !isFinite(n))) { dropped.push({ merge: m, reason: "missing numbers" }); return; }
        if (r2 < r1) [r1, r2] = [r2, r1];
        if (c2 < c1) [c1, c2] = [c2, c1];
        const merge = { r1, c1, r2, c2 };
        if (r1 === r2 && c1 === c2) { dropped.push({ merge, reason: "one cell" }); return; }
        if (r1 < 0 || c1 < 0 || r2 >= rowCount || c2 >= colCount) { dropped.push({ merge, reason: "outside the grid" }); return; }
        if ((r1 < f.rows && r2 >= f.rows) || (c1 < f.cols && c2 >= f.cols)) { dropped.push({ merge, reason: "crosses a frozen line" }); return; }
        if (merges.some((o) => r1 <= o.r2 && r2 >= o.r1 && c1 <= o.c2 && c2 >= o.c1)) { dropped.push({ merge, reason: "overlaps another merge" }); return; }
        merges.push(merge);
    });
    return { merges, dropped };
}

/** The merges that touch a window of cells (inclusive bounds). */
export function mergesInWindow(merges, r1, r2, c1, c2) {
    return merges.filter((m) => m.r1 <= r2 && m.r2 >= r1 && m.c1 <= c2 && m.c2 >= c1);
}

/** The merge a cell belongs to (whether it is the top-left or covered), or null. A plain scan: the lists are short. */
export function mergeOf(merges, r, c) {
    for (let i = 0; i < merges.length; i++) { const m = merges[i]; if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) return m; }
    return null;
}

/** Whether a cell is hidden under a merge (it belongs to one and is not its top-left). */
export function isCovered(merges, r, c) {
    const m = mergeOf(merges, r, c);
    return !!m && !(m.r1 === r && m.c1 === c);
}

// ---- borders -------------------------------------------------------------------------------------------

const STYLES = ["solid", "dashed", "dotted", "double", "none"];   // "none" paints over: it takes the lines off
const SHORT_COLORS = { bd: "var(--bd)", "bd-strong": "var(--bd-strong)", fg: "var(--fg)", "fg-muted": "var(--fg-muted)", primary: "var(--cp-solid)", error: "var(--err)" };

/** A border colour: a short name of the theme ("bd", "bd-strong", "fg", "primary", "error") or any CSS colour. */
export function resolveColor(c) {
    const t = String(c === undefined || c === null ? "" : c).trim();
    if (t === "") return "var(--bd-strong)";
    return SHORT_COLORS[t] || t;
}

/**
 * The border rules, cleaned. A rule is { r1, c1, r2, c2, sides, style, width, color }; `sides` is a list of any of
 * "top" "right" "bottom" "left" (the outside of the range) and "inner-h" "inner-v" (the lines between its cells), or "all" / "outer" / "inner".
 * A rule that is not usable is dropped. A rule of style "none" takes the lines of the earlier rules off (rules are painted in order).
 */
export function normalizeBorders(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((b) => {
        if (!b || typeof b !== "object") return;
        let r1 = int(b.r1, NaN), c1 = int(b.c1, NaN), r2 = int(b.r2, NaN), c2 = int(b.c2, NaN);
        if ([r1, c1, r2, c2].some((n) => !isFinite(n))) return;
        if (r2 < r1) [r1, r2] = [r2, r1];
        if (c2 < c1) [c1, c2] = [c2, c1];
        if (r1 < 0 || c1 < 0) return;
        let sides = Array.isArray(b.sides) ? b.sides : typeof b.sides === "string" ? [b.sides] : ["all"];
        const expanded = [];
        sides.forEach((s) => {
            if (s === "all") expanded.push("top", "right", "bottom", "left", "inner-h", "inner-v");
            else if (s === "outer") expanded.push("top", "right", "bottom", "left");
            else if (s === "inner") expanded.push("inner-h", "inner-v");
            else expanded.push(s);
        });
        const width = Number(b.width);
        out.push({ r1, c1, r2, c2, sides: expanded, style: STYLES.indexOf(b.style) !== -1 ? b.style : "solid", width: isFinite(width) && width > 0 ? Math.min(width, 6) : 1, color: resolveColor(b.color) });
    });
    return out;
}

/**
 * The border rules as two maps of edges. A horizontal edge `h` ("r:c") is the line ABOVE the cell (r, c); a vertical edge `v` ("r:c") is the
 * line LEFT of it. The line below the last row / right of the last column is the edge of the cell after it ("rowCount:c"). A later rule
 * wins over an earlier one on the same edge (like painting over).
 */
export function buildEdges(rules) {
    const h = new Map(), v = new Map();
    rules.forEach((b) => {
        const spec = { style: b.style, width: b.width, color: b.color };
        const has = (s) => b.sides.indexOf(s) !== -1;
        const put = (map, key) => { if (spec.style === "none") map.delete(key); else map.set(key, spec); };
        for (let c = b.c1; c <= b.c2; c++) {
            if (has("top")) put(h, b.r1 + ":" + c);
            if (has("bottom")) put(h, (b.r2 + 1) + ":" + c);
            if (has("inner-h")) for (let r = b.r1 + 1; r <= b.r2; r++) put(h, r + ":" + c);
        }
        for (let r = b.r1; r <= b.r2; r++) {
            if (has("left")) put(v, r + ":" + b.c1);
            if (has("right")) put(v, r + ":" + (b.c2 + 1));
            if (has("inner-v")) for (let c = b.c1 + 1; c <= b.c2; c++) put(v, r + ":" + c);
        }
    });
    return { h, v };
}

const css = (s) => s.width + "px " + s.style + " " + s.color;

/**
 * The CSS border declarations of one box that covers rows r1..r2 and columns c1..c2 (one cell: r1 = r2 and c1 = c2; a merge: its range).
 * A box draws the line above and left of itself, and below / right only when it is the last row / column or the next box does not
 * draw it back (nothing is drawn twice, so a 1px line stays 1px).
 */
export function boxBorders(edges, r1, c1, r2, c2, rowCount, colCount) {
    const out = {};
    const top = edges.h.get(r1 + ":" + c1), left = edges.v.get(r1 + ":" + c1);
    if (top) out.borderTop = css(top);
    if (left) out.borderLeft = css(left);
    if (r2 === rowCount - 1) { const bottom = edges.h.get((r2 + 1) + ":" + c1); if (bottom) out.borderBottom = css(bottom); }
    if (c2 === colCount - 1) { const right = edges.v.get(r1 + ":" + (c2 + 1)); if (right) out.borderRight = css(right); }
    return out;
}

// ---- who may edit -------------------------------------------------------------------------------------------

/** The lock rules, cleaned: { r1, c1, r2, c2, locked } with `locked` true (can't edit) or false (can edit, even in a locked column / row). */
export function normalizeLocks(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((l) => {
        if (!l || typeof l !== "object") return;
        let r1 = int(l.r1, NaN), c1 = int(l.c1, NaN), r2 = int(l.r2, NaN), c2 = int(l.c2, NaN);
        if ([r1, c1, r2, c2].some((n) => !isFinite(n))) return;
        if (r2 < r1) [r1, r2] = [r2, r1];
        if (c2 < c1) [c1, c2] = [c2, c1];
        out.push({ r1, c1, r2, c2, locked: l.locked !== false });
    });
    return out;
}

/** What the range rules say about a cell: true (locked), false (open), or undefined (no rule). The last rule that covers it wins. */
export function lockRuleAt(locks, r, c) {
    for (let i = locks.length - 1; i >= 0; i--) {
        const l = locks[i];
        if (r >= l.r1 && r <= l.r2 && c >= l.c1 && c <= l.c2) return l.locked;
    }
    return undefined;
}

/**
 * May this cell be edited? The master switch first: a read-only grid edits nothing, whatever the rules say. In an editable grid a cell can be edited
 * unless a rule locks it; the last rule that covers it wins (an "open" rule over a "locked" one opens it).
 */
export function cellEditable(mode, locks, r, c) {
    if (mode !== "editable") return false;
    return lockRuleAt(locks, r, c) !== true;
}
