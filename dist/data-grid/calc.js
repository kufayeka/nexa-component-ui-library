// Data Grid: the calculation of a sheet. Pure (no DOM).
//
// createCalc(read, options) gives a calculator over one state of the sheet. `read(r, c)` is what stands in a cell (a number, a text, a boolean, null; a text that starts
// with "=" is a formula). value(r, c) is what the cell shows: the formula worked out, or the plain value. Each cell is worked out once (memo) and only when asked, so a
// cell that nobody looks at costs nothing; a cell that depends on itself (also through others) is #CYCLE!. When the sheet changes, make a new calculator (cheap).
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
 * options: { now: Date, coerce(r, c, raw) -> value (a hook for the cell's type: a date as a serial ...), formulaAt(r, c, raw) -> bool (default: a text that starts with "="),
 * rows, cols (the size of the sheet: a whole column is only read that far) }
 * Returns { value(r, c), isFormula(r, c), volatile } — `volatile` turns true once a function that changes with time (NOW, TODAY) has been worked out.
 */
export function createCalc(read, options) {
    const opt = options || {};
    const now = opt.now || new Date();
    const memo = new Map();
    const busy = new Set();
    const calc = { volatile: false };
    const formulaAt = opt.formulaAt || ((r, c, raw) => isFormula(raw));
    const keyOf = (r, c) => r * MAX_COLS + c;

    function plain(r, c, raw) {
        const v = opt.coerce ? opt.coerce(r, c, raw) : raw;
        return v === undefined || v === "" ? null : v;
    }

    function value(r, c) {
        if (r < 0 || c < 0 || r >= MAX_ROWS || c >= MAX_COLS) return ERR.REF;
        const key = keyOf(r, c);
        if (memo.has(key)) return memo.get(key);
        const raw = read(r, c);
        if (!formulaAt(r, c, raw)) { const v = plain(r, c, raw); memo.set(key, v); return v; }
        if (busy.has(key)) return ERR.CYCLE;
        busy.add(key);
        let result;
        try {
            const ast = treeOf(raw);
            if (!ast) result = ERR.NAME;
            else {
                const env = {
                    cell: value,
                    range: (r1, c1, r2, c2) => new XlRange(r1, c1, Math.min(r2, opt.rows ? opt.rows - 1 : r2), Math.min(c2, opt.cols ? opt.cols - 1 : c2), value),
                    now, at: { r, c }, volatile() { calc.volatile = true; }
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
    calc.isFormula = (r, c) => formulaAt(r, c, read(r, c));
    return calc;
}
