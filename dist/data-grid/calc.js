// Data Grid: the calculation of a workbook. Pure (no DOM).
//
// createCalc(read, options) gives a calculator over one state of the sheets. `read(s, r, c)` is what stands in a cell of sheet number s (a number, a text, a boolean,
// null; a text that starts with "=" is a formula). value(s, r, c) is what the cell shows: the formula worked out, or the plain value. Each cell is worked out once (memo)
// and only when asked, so a cell that nobody looks at costs nothing; a cell that depends on itself (also through others, also across sheets) is #CYCLE!. When the data
// changes, make a new calculator (cheap).
import { MAX_ROWS, MAX_COLS } from "./address.js";
import { ERR, XlRange, isRange } from "./xlvalue.js";
import { parseFormula, evaluate, isFormula } from "./formula.js";

const parsed = new Map();   // formula text -> its tree (a text is parsed once, whoever asks)

/** The tree of a formula text, or null when it cannot be read. */
export function treeOf(text) {
    let hit = parsed.get(text);
    if (hit === undefined) {
        const res = parseFormula(text);
        hit = res.ast || null;
        if (parsed.size > 5000) parsed.clear();
        parsed.set(text, hit);
    }
    return hit;
}

/**
 * options: { now: Date, coerce(s, r, c, raw) -> value (a hook for the cell's type: a date as a serial ...), formulaAt(s, r, c, raw) -> bool (default: a text that starts with "="),
 * sheetIndex(name) -> the number of the sheet with that name (any case), or -1, size(s) -> { rows, cols } (a whole column is only read as far as the sheet goes) }
 * Returns { value(s, r, c), isFormula(s, r, c), volatile } — `volatile` turns true once a function that changes with time (NOW, TODAY) has been worked out.
 */
export function createCalc(read, options) {
    const opt = options || {};
    const now = opt.now || new Date();
    const memo = new Map();
    const busy = new Set();
    const calc = { volatile: false };
    const formulaAt = opt.formulaAt || ((s, r, c, raw) => isFormula(raw));
    const keyOf = (s, r, c) => (s * MAX_ROWS + r) * MAX_COLS + c;

    function plain(s, r, c, raw) {
        const v = opt.coerce ? opt.coerce(s, r, c, raw) : raw;
        return v === undefined || v === "" ? null : v;
    }

    function value(s, r, c) {
        if (s < 0 || r < 0 || c < 0 || r >= MAX_ROWS || c >= MAX_COLS) return ERR.REF;
        const key = keyOf(s, r, c);
        if (memo.has(key)) return memo.get(key);
        const raw = read(s, r, c);
        if (!formulaAt(s, r, c, raw)) { const v = plain(s, r, c, raw); memo.set(key, v); return v; }
        if (busy.has(key)) return ERR.CYCLE;
        busy.add(key);
        let result;
        try {
            const ast = treeOf(raw);
            if (!ast) result = ERR.NAME;
            else {
                // a reference without a sheet is in the sheet of the formula; one with a name that no sheet has is #REF!
                const target = (name) => (name === null || name === undefined ? s : opt.sheetIndex ? opt.sheetIndex(name) : -1);
                const env = {
                    cell: (rr, cc, name) => { const t = target(name); return t < 0 ? ERR.REF : value(t, rr, cc); },
                    range: (r1, c1, r2, c2, name) => {
                        const t = target(name);
                        if (t < 0) return ERR.REF;
                        const size = opt.size ? opt.size(t) : null;
                        return new XlRange(r1, c1, Math.min(r2, size ? size.rows - 1 : r2), Math.min(c2, size ? size.cols - 1 : c2), (a, b) => value(t, a, b));
                    },
                    now, at: { r, c, s }, volatile() { calc.volatile = true; }
                };
                result = evaluate(ast, env);
                if (isRange(result)) result = result.rows === 1 && result.cols === 1 ? result.at(0, 0) : ERR.VALUE;
                if (result === undefined) result = null;
            }
        } finally { busy.delete(key); }
        memo.set(key, result);
        return result;
    }

    calc.value = value;
    calc.isFormula = (s, r, c) => formulaAt(s, r, c, read(s, r, c));
    return calc;
}
