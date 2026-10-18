// Data Grid: the values a formula works with, and how they turn into one another as in Excel. Pure (no DOM).
//
// A value is a number, a text, a boolean, nothing (an empty cell: null), an error (XlError), or a range of cells (XlRange: only as an argument).

/** An error value: "#DIV/0!", "#VALUE!" ... It travels through a formula and is the result of it, as in Excel. */
export class XlError {
    constructor(code) { this.code = code; }
    toString() { return this.code; }
}

export const ERR = Object.freeze({
    DIV0: new XlError("#DIV/0!"), VALUE: new XlError("#VALUE!"), REF: new XlError("#REF!"), NAME: new XlError("#NAME?"),
    NA: new XlError("#N/A"), NUM: new XlError("#NUM!"), CYCLE: new XlError("#CYCLE!")
});

export const isError = (v) => v instanceof XlError;

/** The error a text stands for ("#N/A" -> ERR.NA), or null. */
export function errorOf(text) {
    const t = String(text).toUpperCase();
    const found = Object.keys(ERR).map((k) => ERR[k]).filter((e) => e.code === t)[0];
    return found || null;
}

/**
 * A rectangle of cells, read through `get(r, c)` (the value of one cell: the engine gives the computed one). Only arguments of functions are ranges.
 * i and j count from the rectangle's corner.
 */
export class XlRange {
    constructor(r1, c1, r2, c2, get) { this.r1 = r1; this.c1 = c1; this.r2 = r2; this.c2 = c2; this._get = get; }
    get rows() { return this.r2 - this.r1 + 1; }
    get cols() { return this.c2 - this.c1 + 1; }
    at(i, j) { return this._get(this.r1 + i, this.c1 + j); }
    /** Every value, row by row. */
    values() { const out = []; for (let r = this.r1; r <= this.r2; r++) for (let c = this.c1; c <= this.c2; c++) out.push(this._get(r, c)); return out; }
}

export const isRange = (v) => v instanceof XlRange;

/** A number as Excel keeps it: 15 significant digits (so 0.1 + 0.2 is 0.3). */
export function roundSig(n) { return typeof n === "number" && isFinite(n) ? Number(n.toPrecision(15)) : n; }

/** A number as text, as Excel shows it in a concatenation: no exponent for what fits, 15 significant digits. */
export function formatNumber(n) {
    if (!isFinite(n)) return "#NUM!";
    const r = roundSig(n);
    const a = Math.abs(r);
    if (a !== 0 && (a >= 1e21 || a < 1e-6)) return String(r);
    return String(r);
}

/** A value as a number: nothing is 0, TRUE is 1, a text that is a number (or "50%") is that number; any other text is #VALUE!. An error stays. */
export function toNumber(v) {
    if (isError(v)) return v;
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "string") {
        const t = v.trim();
        if (t === "") return ERR.VALUE;
        if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?%?$/i.test(t)) return t.endsWith("%") ? Number(t.slice(0, -1)) / 100 : Number(t);
        return ERR.VALUE;
    }
    return ERR.VALUE;
}

/** A value as text. */
export function toText(v) {
    if (isError(v)) return v.code;
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") return formatNumber(v);
    return String(v);
}

/** A value as a boolean: a number is TRUE unless 0, "TRUE" / "FALSE" are what they say, nothing is FALSE; any other text is #VALUE!. */
export function toBool(v) {
    if (isError(v)) return v;
    if (v === null || v === undefined) return false;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
        const t = v.trim().toUpperCase();
        if (t === "TRUE") return true;
        if (t === "FALSE") return false;
    }
    return ERR.VALUE;
}

// ---- comparing -----------------------------------------------------------------------------------------------------------------------------

const rank = (v) => (typeof v === "number" ? 0 : typeof v === "string" ? 1 : 2);

/**
 * The order of two values as Excel compares them: numbers before texts before booleans; texts without regard to case; an empty cell is 0 against a number,
 * "" against a text, FALSE against a boolean. Returns a number below, at, or above 0.
 */
export function compare(a, b) {
    let x = a === undefined ? null : a, y = b === undefined ? null : b;
    if (x === null && y === null) return 0;
    if (x === null) x = typeof y === "number" ? 0 : typeof y === "string" ? "" : false;
    if (y === null) y = typeof x === "number" ? 0 : typeof x === "string" ? "" : false;
    const rx = rank(x), ry = rank(y);
    if (rx !== ry) return rx - ry;
    if (rx === 0) return x < y ? -1 : x > y ? 1 : 0;
    if (rx === 1) { const p = x.toLowerCase(), q = y.toLowerCase(); return p < q ? -1 : p > q ? 1 : 0; }
    return (x ? 1 : 0) - (y ? 1 : 0);
}

// ---- dates -----------------------------------------------------------------------------------------------------------------------------------

/**
 * A date as Excel keeps it: the days since 1899-12-30 (the fraction is the time of day), as the clock on the wall of the viewer's own time zone reads. It is worked out
 * from the parts of the date (year, month ... second), not from the milliseconds, because old dates sit in a time zone's history (offsets with odd seconds).
 */
export function dateToSerial(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    const wall = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
    return Math.round((wall / 86400000 + 25569) * 1e8) / 1e8;
}

/** The date of a serial number, as a local date with the same wall clock. */
export function serialToDate(n) {
    const u = new Date(Math.round((Number(n) - 25569) * 86400000));
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds(), u.getUTCMilliseconds());
}

// ---- criteria (SUMIF, COUNTIF ...) ----------------------------------------------------------------------------------------------------------------

/** A pattern with the wildcards ? (one character) and * (any), ~ before one of them for itself, as a RegExp that must match the whole text. */
export function wildcardRegex(pattern) {
    let out = "";
    const p = String(pattern);
    for (let i = 0; i < p.length; i++) {
        const ch = p[i];
        if (ch === "~" && (p[i + 1] === "*" || p[i + 1] === "?" || p[i + 1] === "~")) { out += "\\" + p[i + 1]; i++; }
        else if (ch === "*") out += "[\\s\\S]*";
        else if (ch === "?") out += "[\\s\\S]";
        else out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp("^" + out + "$", "i");
}

/**
 * A test for what SUMIF and its relatives call a criterion: a number or a text (equal to it; a text may hold wildcards), or an operator and a value
 * (">5", "<=10", "<>x", "=abc"). Returns a function from a cell's value to true / false.
 */
export function criterion(crit) {
    if (isError(crit)) return () => false;
    let op = "=", rest = crit;
    if (typeof crit === "string") {
        const m = /^(>=|<=|<>|>|<|=)([\s\S]*)$/.exec(crit);
        if (m) { op = m[1]; rest = m[2]; }
    }
    const asNumber = typeof rest === "number" ? rest : typeof rest === "string" && rest.trim() !== "" && isFinite(Number(rest)) ? Number(rest) : null;
    if (asNumber !== null) {
        return (v) => {
            const n = typeof v === "number" ? v : null;
            if (n === null) return op === "<>";
            return op === "=" ? n === asNumber : op === "<>" ? n !== asNumber : op === ">" ? n > asNumber : op === "<" ? n < asNumber : op === ">=" ? n >= asNumber : n <= asNumber;
        };
    }
    if (typeof rest === "boolean") return (v) => (op === "<>" ? v !== rest : v === rest);
    const text = rest === null || rest === undefined ? "" : String(rest);
    if (op === "=" || op === "<>") {
        const wild = /[*?]/.test(text) ? wildcardRegex(text) : null;
        const same = (v) => {
            if (v === null || v === undefined) return text === "";
            if (typeof v === "number" || typeof v === "boolean") return false;
            return wild ? wild.test(String(v)) : String(v).toLowerCase() === text.toLowerCase();
        };
        return op === "=" ? same : (v) => !same(v);
    }
    // an order against a text: texts only
    return (v) => {
        if (typeof v !== "string") return false;
        const c = compare(v, text);
        return op === ">" ? c > 0 : op === "<" ? c < 0 : op === ">=" ? c >= 0 : c <= 0;
    };
}
