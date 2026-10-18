// Data Grid: the functions of the formulas (the ones people know from Excel). Pure (no DOM).
//
// FUNCTIONS maps a name (upper case) to { min, max, fn, lazy, errors, volatile }. A function gets its arguments as values (a number, a text, a boolean, null for an
// empty cell, an XlError, or an XlRange); an error among the plain arguments is the result at once unless the function is one that deals with errors (`errors`).
// A `lazy` function (IF, IFERROR ...) gets each argument as a function to call, so what it does not need is never worked out. `ctx` is { now, at, volatile() }.
import { ERR, XlError, XlRange, isError, isRange, toNumber, toText, toBool, compare, roundSig, dateToSerial, serialToDate, criterion, wildcardRegex } from "./xlvalue.js";

const NAMES = { months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] };

// ---- reading arguments ---------------------------------------------------------------------------------------------------------------------------

/** The numbers among the arguments, as SUM takes them: in a range only numbers count (text, booleans and empty cells are left), a plain argument is converted. { error } on the first error. */
function numbers(args) {
    const out = [];
    for (const a of args) {
        if (isRange(a)) {
            for (const v of a.values()) { if (isError(v)) return { error: v }; if (typeof v === "number") out.push(v); }
        } else {
            if (isError(a)) return { error: a };
            if (a === null) continue;
            const n = toNumber(a);
            if (isError(n)) return { error: n };
            out.push(n);
        }
    }
    return { nums: out };
}

const flat = (args) => { const out = []; args.forEach((a) => { if (isRange(a)) out.push(...a.values()); else out.push(a); }); return out; };
const int = (v) => { const n = toNumber(v); return isError(n) ? n : Math.trunc(n); };

function roundTo(x, digits, mode) {
    const f = Math.pow(10, digits);
    const y = roundSig(Math.abs(x) * f);
    const r = mode === "up" ? Math.ceil(y - 1e-9) : mode === "down" ? Math.floor(y + 1e-9) : Math.floor(y + 0.5 + 1e-9);
    return (x < 0 ? -1 : 1) * roundSig(r / f);
}

// ---- TEXT(value, format): the formats people write ------------------------------------------------------------------------------------------------

const pad = (n, w) => String(n).padStart(w, "0");

function formatDateParts(d, fmt) {
    const tokens = fmt.match(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|A\/P|"[^"]*"|\\.|./gi) || [];
    const hasAmPm = tokens.some((t) => /^(AM\/PM|A\/P)$/i.test(t));
    let out = "";
    tokens.forEach((t, i) => {
        const lower = t.toLowerCase();
        // m after an hour, or before a second, is the minute
        const minute = (lower === "m" || lower === "mm") && (tokens.slice(0, i).reverse().find((x) => /^(h|hh|s|ss)$/i.test(x) || /^(yyyy|yy|mmmm|mmm|dddd|ddd|dd|d)$/i.test(x)) || "").match(/^(h|hh)$/i)
            || ((lower === "m" || lower === "mm") && /^(s|ss)$/i.test(tokens.slice(i + 1).find((x) => /^[a-z]/i.test(x) && !/^"/.test(x)) || ""));
        if (lower === "yyyy") out += d.getFullYear();
        else if (lower === "yy") out += pad(d.getFullYear() % 100, 2);
        else if (lower === "mmmm") out += NAMES.months[d.getMonth()];
        else if (lower === "mmm") out += NAMES.months[d.getMonth()].slice(0, 3);
        else if (lower === "mm") out += minute ? pad(d.getMinutes(), 2) : pad(d.getMonth() + 1, 2);
        else if (lower === "m") out += minute ? d.getMinutes() : d.getMonth() + 1;
        else if (lower === "dddd") out += NAMES.days[d.getDay()];
        else if (lower === "ddd") out += NAMES.days[d.getDay()].slice(0, 3);
        else if (lower === "dd") out += pad(d.getDate(), 2);
        else if (lower === "d") out += d.getDate();
        else if (lower === "hh") out += pad(hasAmPm ? (d.getHours() % 12 || 12) : d.getHours(), 2);
        else if (lower === "h") out += hasAmPm ? (d.getHours() % 12 || 12) : d.getHours();
        else if (lower === "ss") out += pad(d.getSeconds(), 2);
        else if (lower === "s") out += d.getSeconds();
        else if (lower === "am/pm") out += d.getHours() < 12 ? "AM" : "PM";
        else if (lower === "a/p") out += d.getHours() < 12 ? "A" : "P";
        else if (t[0] === '"') out += t.slice(1, -1);
        else if (t[0] === "\\") out += t.slice(1);
        else out += t;
    });
    return out;
}

function formatNumberPattern(n, fmt) {
    const quoted = [];
    const hidden = fmt.replace(/"([^"]*)"/g, (m, s) => { quoted.push(s); return "\u0001" + (quoted.length - 1) + "\u0002"; });
    const percent = hidden.indexOf("%") !== -1;
    const core = /[#0?,]*[#0?](?:\.[#0?]*)?|\.[#0?]+/.exec(hidden);
    if (!core) return fmt;
    const pattern = core[0];
    const [intPart, decPart = ""] = pattern.split(".");
    const thousands = intPart.indexOf(",") !== -1;
    const minInt = (intPart.match(/0/g) || []).length;
    const maxDec = (decPart.match(/[0#?]/g) || []).length, minDec = (decPart.match(/0/g) || []).length;
    let x = Math.abs(n) * (percent ? 100 : 1);
    let digits = roundTo(x, maxDec, "half").toFixed(maxDec);
    let [i, d = ""] = digits.split(".");
    // optional decimals (#) that are zero at the end go
    while (d.length > minDec && d.endsWith("0")) d = d.slice(0, -1);
    if (i.length < minInt) i = i.padStart(minInt, "0");
    if (minInt === 0 && i === "0" && d.length) i = "";
    if (thousands) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const body = i + (d.length || /\.$/.test(pattern) ? "." + d : "");
    let out = hidden.slice(0, core.index) + body + hidden.slice(core.index + pattern.length);
    out = out.replace(/\u0001(\d+)\u0002/g, (m, k) => quoted[Number(k)]).replace(/\\(.)/g, "$1");
    return out;
}

/** TEXT: a number or date shown with a format ("0.00", "#,##0", "0%", "yyyy-mm-dd", "hh:mm" ...), as far as the formats people write go. */
export function formatText(value, fmt) {
    const f = toText(fmt);
    if (typeof value === "string") { const n = toNumber(value); if (isError(n)) return value; value = n; }
    const n = typeof value === "boolean" ? (value ? 1 : 0) : value === null ? 0 : value;
    if (/^general$/i.test(f.trim()) || f === "") return toText(n);
    const sections = f.split(";");
    const section = sections.length > 1 && n < 0 ? sections[1] : sections.length > 2 && n === 0 ? sections[2] : sections[0];
    const plain = section.replace(/"[^"]*"/g, "").replace(/\\./g, "");
    if (/[ymdhs]/i.test(plain.replace(/AM\/PM|A\/P/gi, ""))) return formatDateParts(serialToDate(n), section);
    const shown = formatNumberPattern(n, section);
    return n < 0 && sections.length === 1 ? "-" + shown : shown;
}

// ---- the table of functions ---------------------------------------------------------------------------------------------------------------------------

export const FUNCTIONS = {};
const def = (names, min, max, fn, opts) => { [].concat(names).forEach((n) => { FUNCTIONS[n] = Object.assign({ min, max, fn }, opts || {}); }); };

// ---- math ----
def("SUM", 1, Infinity, (a) => { const r = numbers(a); return r.error || roundSig(r.nums.reduce((x, y) => x + y, 0)); });
def("AVERAGE", 1, Infinity, (a) => { const r = numbers(a); return r.error || (r.nums.length ? roundSig(r.nums.reduce((x, y) => x + y, 0) / r.nums.length) : ERR.DIV0); });
def("MIN", 1, Infinity, (a) => { const r = numbers(a); return r.error || (r.nums.length ? Math.min(...r.nums) : 0); });
def("MAX", 1, Infinity, (a) => { const r = numbers(a); return r.error || (r.nums.length ? Math.max(...r.nums) : 0); });
def("PRODUCT", 1, Infinity, (a) => { const r = numbers(a); return r.error || (r.nums.length ? roundSig(r.nums.reduce((x, y) => x * y, 1)) : 0); });
def("COUNT", 1, Infinity, (a) => {
    let n = 0;
    a.forEach((x) => { if (isRange(x)) x.values().forEach((v) => { if (typeof v === "number") n++; }); else if (!isError(x) && x !== null && !isError(toNumber(x))) n++; });
    return n;
}, { errors: true });
def("COUNTA", 1, Infinity, (a) => { let n = 0; a.forEach((x) => { (isRange(x) ? x.values() : [x]).forEach((v) => { if (v !== null && v !== undefined) n++; }); }); return n; }, { errors: true });
def("COUNTBLANK", 1, 1, (a) => (isRange(a[0]) ? a[0].values() : [a[0]]).filter((v) => v === null || v === "").length, { errors: true });
def("ROUND", 2, 2, (a) => { const n = toNumber(a[0]), d = int(a[1]); return isError(n) ? n : isError(d) ? d : roundTo(n, d, "half"); });
def("ROUNDUP", 2, 2, (a) => { const n = toNumber(a[0]), d = int(a[1]); return isError(n) ? n : isError(d) ? d : roundTo(n, d, "up"); });
def("ROUNDDOWN", 2, 2, (a) => { const n = toNumber(a[0]), d = int(a[1]); return isError(n) ? n : isError(d) ? d : roundTo(n, d, "down"); });
def("INT", 1, 1, (a) => { const n = toNumber(a[0]); return isError(n) ? n : Math.floor(n); });
def("TRUNC", 1, 2, (a) => { const n = toNumber(a[0]), d = a.length > 1 ? int(a[1]) : 0; return isError(n) ? n : isError(d) ? d : roundTo(n, d, "down"); });
def("ABS", 1, 1, (a) => { const n = toNumber(a[0]); return isError(n) ? n : Math.abs(n); });
def("SIGN", 1, 1, (a) => { const n = toNumber(a[0]); return isError(n) ? n : Math.sign(n); });
def("SQRT", 1, 1, (a) => { const n = toNumber(a[0]); return isError(n) ? n : n < 0 ? ERR.NUM : roundSig(Math.sqrt(n)); });
def("POWER", 2, 2, (a) => { const x = toNumber(a[0]), y = toNumber(a[1]); if (isError(x)) return x; if (isError(y)) return y; const r = Math.pow(x, y); return isFinite(r) ? roundSig(r) : ERR.NUM; });
def("MOD", 2, 2, (a) => { const x = toNumber(a[0]), y = toNumber(a[1]); if (isError(x)) return x; if (isError(y)) return y; return y === 0 ? ERR.DIV0 : roundSig(x - y * Math.floor(x / y)); });
def("CEILING", 1, 2, (a) => { const n = toNumber(a[0]), s = a.length > 1 ? toNumber(a[1]) : 1; if (isError(n)) return n; if (isError(s)) return s; if (s === 0) return 0; if (n > 0 && s < 0) return ERR.NUM; return roundSig(Math.ceil(roundSig(n / s)) * s); });
def("FLOOR", 1, 2, (a) => { const n = toNumber(a[0]), s = a.length > 1 ? toNumber(a[1]) : 1; if (isError(n)) return n; if (isError(s)) return s; if (s === 0) return ERR.DIV0; if (n > 0 && s < 0) return ERR.NUM; return roundSig(Math.floor(roundSig(n / s)) * s); });
def("PI", 0, 0, () => Math.PI);
def("EXP", 1, 1, (a) => { const n = toNumber(a[0]); return isError(n) ? n : roundSig(Math.exp(n)); });
def("LN", 1, 1, (a) => { const n = toNumber(a[0]); return isError(n) ? n : n <= 0 ? ERR.NUM : roundSig(Math.log(n)); });
def("LOG10", 1, 1, (a) => { const n = toNumber(a[0]); return isError(n) ? n : n <= 0 ? ERR.NUM : roundSig(Math.log10(n)); });
def("LOG", 1, 2, (a) => { const n = toNumber(a[0]), b = a.length > 1 ? toNumber(a[1]) : 10; if (isError(n)) return n; if (isError(b)) return b; return n <= 0 || b <= 0 || b === 1 ? ERR.NUM : roundSig(Math.log(n) / Math.log(b)); });

// ---- logic ----
def("IF", 2, 3, (a) => { const c = toBool(a[0]()); if (isError(c)) return c; return c ? a[1]() : (a.length > 2 ? a[2]() : false); }, { lazy: true });
def("IFS", 2, Infinity, (a) => {
    for (let i = 0; i + 1 < a.length; i += 2) { const c = toBool(a[i]()); if (isError(c)) return c; if (c) return a[i + 1](); }
    return ERR.NA;
}, { lazy: true });
def("IFERROR", 2, 2, (a) => { const v = a[0](); return isError(v) ? a[1]() : v; }, { lazy: true });
def("IFNA", 2, 2, (a) => { const v = a[0](); return v === ERR.NA ? a[1]() : v; }, { lazy: true });
def("SWITCH", 3, Infinity, (a) => {
    const v = a[0]();
    if (isError(v)) return v;
    let i = 1;
    for (; i + 1 < a.length; i += 2) { const c = a[i](); if (isError(c)) return c; if (compare(v, c) === 0) return a[i + 1](); }
    return i < a.length ? a[i]() : ERR.NA;
}, { lazy: true });
const booleans = (a, label) => {
    const out = [];
    for (const x of a) {
        if (isRange(x)) { for (const v of x.values()) { if (isError(v)) return { error: v }; if (typeof v === "boolean") out.push(v); else if (typeof v === "number") out.push(v !== 0); } }
        else { const b = toBool(x); if (isError(b)) return { error: b }; out.push(b); }
    }
    return out.length ? { bools: out } : { error: ERR.VALUE, label };
};
def("AND", 1, Infinity, (a) => { const r = booleans(a); return r.error || r.bools.every(Boolean); });
def("OR", 1, Infinity, (a) => { const r = booleans(a); return r.error || r.bools.some(Boolean); });
def("XOR", 1, Infinity, (a) => { const r = booleans(a); return r.error || r.bools.filter(Boolean).length % 2 === 1; });
def("NOT", 1, 1, (a) => { const b = toBool(a[0]); return isError(b) ? b : !b; });
def("TRUE", 0, 0, () => true);
def("FALSE", 0, 0, () => false);

// ---- text ----
def("LEN", 1, 1, (a) => toText(a[0]).length);
def("LEFT", 1, 2, (a) => { const n = a.length > 1 ? int(a[1]) : 1; return isError(n) ? n : n < 0 ? ERR.VALUE : toText(a[0]).slice(0, n); });
def("RIGHT", 1, 2, (a) => { const n = a.length > 1 ? int(a[1]) : 1; return isError(n) ? n : n < 0 ? ERR.VALUE : n === 0 ? "" : toText(a[0]).slice(-n); });
def("MID", 3, 3, (a) => { const s = int(a[1]), n = int(a[2]); if (isError(s)) return s; if (isError(n)) return n; return s < 1 || n < 0 ? ERR.VALUE : toText(a[0]).substr(s - 1, n); });
def("UPPER", 1, 1, (a) => toText(a[0]).toUpperCase());
def("LOWER", 1, 1, (a) => toText(a[0]).toLowerCase());
def("PROPER", 1, 1, (a) => toText(a[0]).toLowerCase().replace(/(^|[^a-z])([a-z])/g, (m, p, c) => p + c.toUpperCase()));
def("TRIM", 1, 1, (a) => toText(a[0]).trim().replace(/ +/g, " "));
def(["CONCAT", "CONCATENATE"], 1, Infinity, (a) => { const f = flat(a); const bad = f.find(isError); return bad || f.map(toText).join(""); });
def("TEXTJOIN", 3, Infinity, (a) => {
    const delim = toText(a[0]), skip = toBool(a[1]);
    if (isError(skip)) return skip;
    const parts = flat(a.slice(2));
    const bad = parts.find(isError);
    if (bad) return bad;
    return parts.filter((v) => !(skip && (v === null || v === ""))).map(toText).join(delim);
});
def("TEXT", 2, 2, (a) => formatText(a[0], a[1]));
def("VALUE", 1, 1, (a) => { if (typeof a[0] === "number") return a[0]; const t = toText(a[0]).replace(/,/g, ""); return toNumber(t); });
def("FIND", 2, 3, (a) => { const start = a.length > 2 ? int(a[2]) : 1; if (isError(start)) return start; if (start < 1) return ERR.VALUE; const i = toText(a[1]).indexOf(toText(a[0]), start - 1); return i < 0 ? ERR.VALUE : i + 1; });
def("SEARCH", 2, 3, (a) => {
    const start = a.length > 2 ? int(a[2]) : 1;
    if (isError(start)) return start;
    if (start < 1) return ERR.VALUE;
    // the same wildcards as elsewhere, but anywhere in the text instead of the whole of it
    const whole = wildcardRegex(toText(a[0]));
    const re = new RegExp(whole.source.slice(1, -1), "i");
    const m = re.exec(toText(a[1]).slice(start - 1));
    return m ? m.index + start : ERR.VALUE;
});
def("SUBSTITUTE", 3, 4, (a) => {
    const text = toText(a[0]), from = toText(a[1]), to = toText(a[2]);
    if (from === "") return text;
    if (a.length < 4) return text.split(from).join(to);
    const which = int(a[3]);
    if (isError(which)) return which;
    if (which < 1) return ERR.VALUE;
    let at = -1;
    for (let k = 0; k < which; k++) { at = text.indexOf(from, at + 1); if (at < 0) return text; }
    return text.slice(0, at) + to + text.slice(at + from.length);
});
def("REPLACE", 4, 4, (a) => { const s = int(a[1]), n = int(a[2]); if (isError(s)) return s; if (isError(n)) return n; if (s < 1 || n < 0) return ERR.VALUE; const t = toText(a[0]); return t.slice(0, s - 1) + toText(a[3]) + t.slice(s - 1 + n); });
def("REPT", 2, 2, (a) => { const n = int(a[1]); return isError(n) ? n : n < 0 || n > 32767 ? ERR.VALUE : toText(a[0]).repeat(n); });
def("EXACT", 2, 2, (a) => toText(a[0]) === toText(a[1]));

// ---- date and time ----
const serialArg = (v) => {
    if (typeof v === "string" && isNaN(Number(v)) && v.trim() !== "") { const s = dateToSerial(v); return s === null ? ERR.VALUE : s; }
    return toNumber(v);
};
const dateOf = (v) => { const s = serialArg(v); return isError(s) ? s : serialToDate(s); };
def("TODAY", 0, 0, (a, ctx) => { ctx.volatile(); const d = ctx.now; return Math.floor(dateToSerial(new Date(d.getFullYear(), d.getMonth(), d.getDate()))); });
def("NOW", 0, 0, (a, ctx) => { ctx.volatile(); return dateToSerial(ctx.now); });
def("DATE", 3, 3, (a) => {
    const y = int(a[0]), m = int(a[1]), d = int(a[2]);
    if (isError(y)) return y; if (isError(m)) return m; if (isError(d)) return d;
    if (y < 0 || y > 9999) return ERR.NUM;
    return Math.floor(dateToSerial(new Date(y < 1900 ? y + 1900 : y, m - 1, d)));
});
def("TIME", 3, 3, (a) => { const h = int(a[0]), m = int(a[1]), s = int(a[2]); if (isError(h)) return h; if (isError(m)) return m; if (isError(s)) return s; const t = (h * 3600 + m * 60 + s) / 86400; return t < 0 ? ERR.NUM : roundSig(t - Math.floor(t)); });
def("YEAR", 1, 1, (a) => { const d = dateOf(a[0]); return isError(d) ? d : d.getFullYear(); });
def("MONTH", 1, 1, (a) => { const d = dateOf(a[0]); return isError(d) ? d : d.getMonth() + 1; });
def("DAY", 1, 1, (a) => { const d = dateOf(a[0]); return isError(d) ? d : d.getDate(); });
def("HOUR", 1, 1, (a) => { const d = dateOf(a[0]); return isError(d) ? d : d.getHours(); });
def("MINUTE", 1, 1, (a) => { const d = dateOf(a[0]); return isError(d) ? d : d.getMinutes(); });
def("SECOND", 1, 1, (a) => { const d = dateOf(a[0]); return isError(d) ? d : d.getSeconds(); });
def("WEEKDAY", 1, 2, (a) => {
    const d = dateOf(a[0]);
    const type = a.length > 1 ? int(a[1]) : 1;
    if (isError(d)) return d; if (isError(type)) return type;
    const w = d.getDay();
    return type === 1 ? w + 1 : type === 2 ? (w === 0 ? 7 : w) : type === 3 ? (w === 0 ? 6 : w - 1) : ERR.NUM;
});
def("EDATE", 2, 2, (a) => {
    const d = dateOf(a[0]), n = int(a[1]);
    if (isError(d)) return d; if (isError(n)) return n;
    const day = d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes(), d.getSeconds());
    t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
    return Math.floor(dateToSerial(t));
});
def("DATEDIF", 3, 3, (a) => {
    const s = dateOf(a[0]), e = dateOf(a[1]);
    if (isError(s)) return s; if (isError(e)) return e;
    const unit = toText(a[2]).toUpperCase();
    const A = new Date(s.getFullYear(), s.getMonth(), s.getDate()), B = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    if (A > B) return ERR.NUM;
    let months = (B.getFullYear() - A.getFullYear()) * 12 + B.getMonth() - A.getMonth();
    if (B.getDate() < A.getDate()) months--;
    if (unit === "D") return Math.round((B - A) / 86400000);
    if (unit === "M") return months;
    if (unit === "Y") return Math.floor(months / 12);
    if (unit === "YM") return months % 12;
    if (unit === "MD") { const last = new Date(B.getFullYear(), B.getMonth(), 0).getDate(); return B.getDate() >= A.getDate() ? B.getDate() - A.getDate() : last - A.getDate() + B.getDate(); }
    if (unit === "YD") { const t = new Date(B.getFullYear(), A.getMonth(), A.getDate()); const x = t > B ? new Date(B.getFullYear() - 1, A.getMonth(), A.getDate()) : t; return Math.round((B - x) / 86400000); }
    return ERR.NUM;
});

// ---- lookup ----
const asTable = (v) => (isRange(v) ? v : new XlRange(0, 0, 0, 0, () => v));
def("ROW", 0, 1, (a, ctx) => (a.length && isRange(a[0]) ? a[0].r1 + 1 : ctx.at.r + 1), { refs: true });
def("COLUMN", 0, 1, (a, ctx) => (a.length && isRange(a[0]) ? a[0].c1 + 1 : ctx.at.c + 1), { refs: true });
def("ROWS", 1, 1, (a) => asTable(a[0]).rows);
def("COLUMNS", 1, 1, (a) => asTable(a[0]).cols);
def("CHOOSE", 2, Infinity, (a) => { const i = int(a[0]()); if (isError(i)) return i; return i < 1 || i >= a.length ? ERR.VALUE : a[i](); }, { lazy: true });
// the first match of a value in a line of values (exact, or the largest one that is not above it in a sorted line)
const findIn = (value, values, approx) => {
    if (!approx) { for (let i = 0; i < values.length; i++) if (compare(values[i], value) === 0 && values[i] !== null) return i; return -1; }
    let best = -1;
    for (let i = 0; i < values.length; i++) { if (values[i] === null) continue; if (compare(values[i], value) <= 0) best = i; else break; }
    return best;
};
const matchExact = (value, v) => {
    if (typeof value === "string" && /[*?]/.test(value) && typeof v === "string") return wildcardRegex(value).test(v);
    return compare(v, value) === 0 && v !== null;
};
def("VLOOKUP", 3, 4, (a) => {
    const t = asTable(a[1]), col = int(a[2]), approx = a.length > 3 ? toBool(a[3]) : true;
    if (isError(col)) return col; if (isError(approx)) return approx;
    if (col < 1 || col > t.cols) return col < 1 ? ERR.VALUE : ERR.REF;
    const keys = []; for (let i = 0; i < t.rows; i++) keys.push(t.at(i, 0));
    let hit = -1;
    if (approx) hit = findIn(a[0], keys, true); else for (let i = 0; i < keys.length; i++) if (matchExact(a[0], keys[i])) { hit = i; break; }
    return hit < 0 ? ERR.NA : t.at(hit, col - 1);
});
def("HLOOKUP", 3, 4, (a) => {
    const t = asTable(a[1]), row = int(a[2]), approx = a.length > 3 ? toBool(a[3]) : true;
    if (isError(row)) return row; if (isError(approx)) return approx;
    if (row < 1 || row > t.rows) return row < 1 ? ERR.VALUE : ERR.REF;
    const keys = []; for (let j = 0; j < t.cols; j++) keys.push(t.at(0, j));
    let hit = -1;
    if (approx) hit = findIn(a[0], keys, true); else for (let j = 0; j < keys.length; j++) if (matchExact(a[0], keys[j])) { hit = j; break; }
    return hit < 0 ? ERR.NA : t.at(row - 1, hit);
});
def("XLOOKUP", 3, 6, (a) => {
    const look = asTable(a[1]), ret = asTable(a[2]);
    const missing = a.length > 3 ? a[3] : undefined;
    const mode = a.length > 4 ? int(a[4]) : 0, dir = a.length > 5 ? int(a[5]) : 1;
    if (isError(mode)) return mode; if (isError(dir)) return dir;
    const vertical = look.cols === 1;
    if (look.rows !== 1 && look.cols !== 1) return ERR.VALUE;
    const n = vertical ? look.rows : look.cols;
    if ((vertical ? ret.rows : ret.cols) !== n) return ERR.VALUE;
    const at = (i) => (vertical ? look.at(i, 0) : look.at(0, i));
    const order = []; for (let i = 0; i < n; i++) order.push(dir === -1 || dir === -2 ? n - 1 - i : i);
    let hit = -1;
    for (const i of order) if (matchExact(a[0], at(i)) || (mode === 2 && typeof a[0] === "string" && typeof at(i) === "string" && wildcardRegex(a[0]).test(at(i)))) { hit = i; break; }
    if (hit < 0 && (mode === -1 || mode === 1)) {
        let best = -1;
        for (let i = 0; i < n; i++) { const v = at(i); if (v === null) continue; const c = compare(v, a[0]); if (mode === -1 ? c < 0 : c > 0) { if (best < 0 || (mode === -1 ? compare(v, at(best)) > 0 : compare(v, at(best)) < 0)) best = i; } }
        hit = best;
    }
    if (hit < 0) return missing === undefined ? ERR.NA : missing;
    return vertical ? (ret.cols === 1 ? ret.at(hit, 0) : new XlRange(ret.r1 + hit, ret.c1, ret.r1 + hit, ret.c2, ret._get)) : (ret.rows === 1 ? ret.at(0, hit) : new XlRange(ret.r1, ret.c1 + hit, ret.r2, ret.c1 + hit, ret._get));
});
def("INDEX", 2, 3, (a) => {
    const t = asTable(a[0]);
    let r = int(a[1]), c = a.length > 2 ? int(a[2]) : null;
    if (isError(r)) return r; if (c !== null && isError(c)) return c;
    // one index into a single row or column goes along it
    if (c === null) { if (t.rows === 1) { c = r; r = 1; } else c = 0; }
    if (r < 0 || c < 0 || r > t.rows || c > t.cols) return ERR.REF;
    if (r === 0 && c === 0) return t;
    if (r === 0) return new XlRange(t.r1, t.c1 + c - 1, t.r2, t.c1 + c - 1, t._get);
    if (c === 0) return new XlRange(t.r1 + r - 1, t.c1, t.r1 + r - 1, t.c2, t._get);
    return t.at(r - 1, c - 1);
});
def("MATCH", 2, 3, (a) => {
    const t = asTable(a[1]), type = a.length > 2 ? int(a[2]) : 1;
    if (isError(type)) return type;
    if (t.rows !== 1 && t.cols !== 1) return ERR.NA;
    const vals = t.values();
    let hit = -1;
    if (type === 0) { for (let i = 0; i < vals.length; i++) if (matchExact(a[0], vals[i])) { hit = i; break; } }
    else if (type > 0) hit = findIn(a[0], vals, true);
    else { for (let i = 0; i < vals.length; i++) { if (vals[i] === null) continue; if (compare(vals[i], a[0]) >= 0) hit = i; else break; } }
    return hit < 0 ? ERR.NA : hit + 1;
});

// ---- conditional sums, counts and averages ----
// the cells of the ranges, in step: the ones where every criterion holds. `pairs` is [range, criterion, range, criterion ...]
function conditional(pairs) {
    const ranges = [], tests = [];
    for (let i = 0; i < pairs.length; i += 2) {
        if (!isRange(pairs[i])) return { error: ERR.VALUE };
        if (isError(pairs[i + 1])) return { error: pairs[i + 1] };
        ranges.push(pairs[i]); tests.push(criterion(pairs[i + 1]));
    }
    const first = ranges[0];
    if (ranges.some((r) => r.rows !== first.rows || r.cols !== first.cols)) return { error: ERR.VALUE };
    const hits = [];
    for (let i = 0; i < first.rows; i++) for (let j = 0; j < first.cols; j++) if (ranges.every((r, k) => tests[k](r.at(i, j)))) hits.push([i, j]);
    return { hits, shape: first };
}
const sameShape = (a, b) => isRange(b) && a.rows === b.rows && a.cols === b.cols;
const valuesAt = (range, hits) => hits.map(([i, j]) => range.at(i, j));
const numbersOnly = (vals) => vals.filter((v) => typeof v === "number");
def("COUNTIF", 2, 2, (a) => { const r = conditional(a); return r.error || r.hits.length; });
def("COUNTIFS", 2, Infinity, (a) => { if (a.length % 2) return ERR.VALUE; const r = conditional(a); return r.error || r.hits.length; });
const sumLike = (name, reducer, minArgs, firstIsSumRange, needsRange) => def(name, minArgs, Infinity, (a) => {
    const pairs = firstIsSumRange ? a.slice(1) : a.slice(0, 2);
    if (pairs.length % 2) return ERR.VALUE;
    const r = conditional(pairs);
    if (r.error) return r.error;
    const target = firstIsSumRange ? a[0] : (a.length > 2 ? a[2] : a[0]);
    if (!isRange(target)) return ERR.VALUE;
    // a sum range of another place but the same size is read in step with the criteria range
    const range = sameShape(r.shape, target) ? target : new XlRange(target.r1, target.c1, target.r1 + r.shape.rows - 1, target.c1 + r.shape.cols - 1, target._get);
    const vals = valuesAt(range, r.hits);
    const err = vals.find(isError);
    if (err) return err;
    return reducer(numbersOnly(vals));
});
sumLike("SUMIF", (n) => roundSig(n.reduce((x, y) => x + y, 0)), 2, false);
sumLike("SUMIFS", (n) => roundSig(n.reduce((x, y) => x + y, 0)), 3, true);
sumLike("AVERAGEIF", (n) => (n.length ? roundSig(n.reduce((x, y) => x + y, 0) / n.length) : ERR.DIV0), 2, false);
sumLike("AVERAGEIFS", (n) => (n.length ? roundSig(n.reduce((x, y) => x + y, 0) / n.length) : ERR.DIV0), 3, true);
sumLike("MAXIFS", (n) => (n.length ? Math.max(...n) : 0), 3, true);
sumLike("MINIFS", (n) => (n.length ? Math.min(...n) : 0), 3, true);

// ---- statistics ----
def("MEDIAN", 1, Infinity, (a) => { const r = numbers(a); if (r.error) return r.error; if (!r.nums.length) return ERR.NUM; const s = r.nums.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : roundSig((s[m - 1] + s[m]) / 2); });
const variance = (nums, sample) => { const n = nums.length; if (n - (sample ? 1 : 0) < 1) return ERR.DIV0; const mean = nums.reduce((x, y) => x + y, 0) / n; return nums.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (n - (sample ? 1 : 0)); };
def(["VAR", "VAR.S"], 1, Infinity, (a) => { const r = numbers(a); if (r.error) return r.error; const v = variance(r.nums, true); return isError(v) ? v : roundSig(v); });
def("VAR.P", 1, Infinity, (a) => { const r = numbers(a); if (r.error) return r.error; const v = variance(r.nums, false); return isError(v) ? v : roundSig(v); });
def(["STDEV", "STDEV.S"], 1, Infinity, (a) => { const r = numbers(a); if (r.error) return r.error; const v = variance(r.nums, true); return isError(v) ? v : roundSig(Math.sqrt(v)); });
def("STDEV.P", 1, Infinity, (a) => { const r = numbers(a); if (r.error) return r.error; const v = variance(r.nums, false); return isError(v) ? v : roundSig(Math.sqrt(v)); });
const kth = (a, largest) => {
    const r = numbers([a[0]]);
    if (r.error) return r.error;
    const k = int(a[1]);
    if (isError(k)) return k;
    if (k < 1 || k > r.nums.length) return ERR.NUM;
    const s = r.nums.slice().sort((x, y) => (largest ? y - x : x - y));
    return s[k - 1];
};
def("LARGE", 2, 2, (a) => kth(a, true));
def("SMALL", 2, 2, (a) => kth(a, false));
def(["RANK", "RANK.EQ"], 2, 3, (a) => {
    const n = toNumber(a[0]);
    if (isError(n)) return n;
    const r = numbers([a[1]]);
    if (r.error) return r.error;
    const order = a.length > 2 ? int(a[2]) : 0;
    if (isError(order)) return order;
    if (r.nums.indexOf(n) < 0) return ERR.NA;
    return 1 + r.nums.filter((x) => (order ? x < n : x > n)).length;
});

// ---- information ----
def("ISNUMBER", 1, 1, (a) => typeof a[0] === "number", { errors: true });
def("ISTEXT", 1, 1, (a) => typeof a[0] === "string", { errors: true });
def("ISBLANK", 1, 1, (a) => a[0] === null, { errors: true });
def("ISERROR", 1, 1, (a) => isError(a[0]), { errors: true });
def("ISNA", 1, 1, (a) => a[0] === ERR.NA, { errors: true });
def("ISLOGICAL", 1, 1, (a) => typeof a[0] === "boolean", { errors: true });
def("N", 1, 1, (a) => (typeof a[0] === "number" ? a[0] : typeof a[0] === "boolean" ? (a[0] ? 1 : 0) : 0));
