// Data Grid: a formula as text -> a tree -> a value, like Excel. Pure (no DOM, no eval: the tree is walked, the functions come from a closed list).
//
// "=SUM(A1:A5)*2", "=IF(B2>10;"high";"low")" (the arguments are separated by , or ;). References: A1, $A$1, A1:B5, B:B (a whole column), 2:2 (a whole row).
import { colName, colIndex, MAX_ROWS, MAX_COLS } from "./address.js";
import { ERR, XlRange, isError, isRange, toNumber, toText, compare, roundSig, errorOf } from "./xlvalue.js";
import { FUNCTIONS } from "./xlfuncs.js";

// ---- reading the text ------------------------------------------------------------------------------------------------------------------------------

const RE = {
    sheet: /^(?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!/,
    number: /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i,
    colRange: /^\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}(?![A-Za-z0-9_(.])/,
    rowRange: /^\$?\d+:\$?\d+(?![A-Za-z0-9_.])/,
    cell: /^\$?[A-Za-z]{1,3}\$?\d+(?![A-Za-z0-9_(.])/,
    name: /^[A-Za-z_][A-Za-z0-9_.]*/,
    error: /^#(?:DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!|CYCLE!)/i,
    op: /^(?:<>|<=|>=|[-+*\/^&=<>%(),;:])/
};

/** The pieces of a formula (the text after the "="), each with where it stands: { type, text, start, end } — or { error } when something cannot be read. */
export function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (/\s/.test(ch)) { i++; continue; }
        const rest = src.slice(i);
        let m;
        if (ch === '"') {
            let j = i + 1, text = "";
            for (; j < src.length; j++) {
                if (src[j] === '"') { if (src[j + 1] === '"') { text += '"'; j++; continue; } break; }
                text += src[j];
            }
            if (j >= src.length) return { error: "a text is not closed" };
            out.push({ type: "str", text, start: i, end: j + 1 });
            i = j + 1;
            continue;
        }
        // Sheet2!A1, 'My sheet'!B:B: the name of the sheet a reference is in
        if ((m = RE.sheet.exec(rest))) {
            const raw = m[0].slice(0, -1);
            out.push({ type: "sheet", text: raw[0] === "'" ? raw.slice(1, -1).replace(/''/g, "'") : raw, start: i, end: i + m[0].length });
            i += m[0].length;
            continue;
        }
        if ((m = RE.error.exec(rest))) { out.push({ type: "err", text: m[0].toUpperCase(), start: i, end: i + m[0].length }); i += m[0].length; continue; }
        if ((m = RE.colRange.exec(rest))) { out.push({ type: "colrange", text: m[0], start: i, end: i + m[0].length }); i += m[0].length; continue; }
        if ((m = RE.rowRange.exec(rest))) { out.push({ type: "rowrange", text: m[0], start: i, end: i + m[0].length }); i += m[0].length; continue; }
        if ((m = RE.cell.exec(rest))) { out.push({ type: "cell", text: m[0], start: i, end: i + m[0].length }); i += m[0].length; continue; }
        if ((m = RE.number.exec(rest))) { out.push({ type: "num", text: m[0], start: i, end: i + m[0].length }); i += m[0].length; continue; }
        if ((m = RE.name.exec(rest))) { out.push({ type: "name", text: m[0], start: i, end: i + m[0].length }); i += m[0].length; continue; }
        if ((m = RE.op.exec(rest))) { out.push({ type: "op", text: m[0], start: i, end: i + m[0].length }); i += m[0].length; continue; }
        return { error: "cannot read '" + ch + "'" };
    }
    return { tokens: out };
}

/** "$B$7" -> { r: 6, c: 1, ra: true, ca: true } (ra / ca: the row / column is fixed), or null. */
function cellOf(text) {
    const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/.exec(text);
    if (!m) return null;
    return { c: colIndex(m[2]), r: Number(m[4]) - 1, ca: m[1] === "$", ra: m[3] === "$" };
}

// ---- the tree --------------------------------------------------------------------------------------------------------------------------------------

/**
 * "=A1+2" (or "A1+2" or "=Sheet2!A1+2") -> { ast } or { error: "..." }. Precedence as in Excel, from the loosest: comparisons, &, + -, * /, ^ (left to right: 2^3^2 is 64), a minus in front
 * (-2^2 is 4), % behind.
 */
export function parseFormula(text) {
    const src = String(text).replace(/^\s*=/, "");
    const lexed = tokenize(src);
    if (lexed.error) return { error: lexed.error };
    const toks = lexed.tokens;
    let p = 0;
    const peek = () => toks[p];
    const isOp = (t, ...ops) => t && t.type === "op" && ops.indexOf(t.text) !== -1;
    const fail = (why) => { throw new Error(why); };

    function reference(tok) {
        const a = cellOf(tok.text);
        if (!a) fail("bad reference " + tok.text);
        // A1:B5
        if (isOp(peek(), ":") && toks[p + 1] && toks[p + 1].type === "cell") {
            p++;
            const b = cellOf(toks[p++].text);
            return { t: "range", r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c), a, b };
        }
        return { t: "ref", r: a.r, c: a.c, ra: a.ra, ca: a.ca };
    }

    function primary() {
        const tok = toks[p++];
        if (!tok) fail("the formula ends too soon");
        if (tok.type === "num") return { t: "num", v: Number(tok.text) };
        if (tok.type === "str") return { t: "str", v: tok.text };
        if (tok.type === "err") return { t: "err", v: errorOf(tok.text) };
        if (tok.type === "sheet") {
            const node = primary();
            if (node.t !== "ref" && node.t !== "range") fail("a sheet name must be followed by a cell or a range");
            node.sheet = tok.text;
            return node;
        }
        if (tok.type === "cell") return reference(tok);
        if (tok.type === "colrange") {
            const [x, y] = tok.text.split(":").map((s) => colIndex(s.replace("$", "")));
            return { t: "range", r1: 0, r2: MAX_ROWS - 1, c1: Math.min(x, y), c2: Math.max(x, y), whole: "col", text: tok.text };
        }
        if (tok.type === "rowrange") {
            const [x, y] = tok.text.split(":").map((s) => Number(s.replace("$", "")) - 1);
            return { t: "range", c1: 0, c2: MAX_COLS - 1, r1: Math.min(x, y), r2: Math.max(x, y), whole: "row", text: tok.text };
        }
        if (tok.type === "name") {
            if (isOp(peek(), "(")) {
                p++;
                const args = [];
                if (isOp(peek(), ")")) { p++; return { t: "call", name: tok.text.toUpperCase(), args }; }
                for (;;) {
                    // an argument left empty (IF(A1,,2)) is nothing
                    if (isOp(peek(), ",", ";")) args.push({ t: "empty" });
                    else if (isOp(peek(), ")")) { args.push({ t: "empty" }); }
                    else args.push(comparison());
                    const sep = toks[p++];
                    if (isOp(sep, ")")) break;
                    if (!isOp(sep, ",", ";")) fail("expected , or ) in " + tok.text);
                }
                return { t: "call", name: tok.text.toUpperCase(), args };
            }
            const up = tok.text.toUpperCase();
            if (up === "TRUE") return { t: "bool", v: true };
            if (up === "FALSE") return { t: "bool", v: false };
            return { t: "err", v: ERR.NAME };
        }
        if (isOp(tok, "(")) {
            const inner = comparison();
            if (!isOp(toks[p++], ")")) fail("a ( is not closed");
            return inner;
        }
        return fail("unexpected '" + tok.text + "'");
    }

    function unary() {
        const t = peek();
        if (isOp(t, "-", "+")) { p++; const a = unary(); return t.text === "-" ? { t: "un", a } : a; }
        let node = primary();
        while (isOp(peek(), "%")) { p++; node = { t: "pct", a: node }; }
        return node;
    }
    function level(next, ops) {
        return () => {
            let left = next();
            while (peek() && peek().type === "op" && ops.indexOf(peek().text) !== -1) { const op = toks[p++].text; left = { t: "bin", op, a: left, b: next() }; }
            return left;
        };
    }
    const power = level(unary, ["^"]);
    const product = level(power, ["*", "/"]);
    const sum = level(product, ["+", "-"]);
    const concat = level(sum, ["&"]);
    const comparison = level(concat, ["=", "<>", "<", ">", "<=", ">="]);

    try {
        if (!toks.length) return { error: "the formula is empty" };
        const ast = comparison();
        if (p < toks.length) fail("unexpected '" + toks[p].text + "'");
        return { ast };
    } catch (e) {
        return { error: e.message };
    }
}

// ---- working a tree out ----------------------------------------------------------------------------------------------------------------------------

const outside = (r, c) => r < 0 || c < 0 || r >= MAX_ROWS || c >= MAX_COLS;

/**
 * The value of a tree. `env` is { cell(r, c, sheet) -> value, range(r1, c1, r2, c2, sheet) -> XlRange, now: Date, at: { r, c }, volatile() }.
 * An error never throws: it is the value (and travels on through the sums and the functions, as in Excel).
 */
export function evaluate(node, env) {
    const num2 = (a, b, f) => {
        const x = toNumber(a), y = toNumber(b);
        if (isError(x)) return x;
        if (isError(y)) return y;
        return f(x, y);
    };
    const scalar = (n) => {
        const v = evaluate(n, env);
        return isRange(v) ? (v.rows === 1 && v.cols === 1 ? v.at(0, 0) : ERR.VALUE) : v;
    };
    switch (node.t) {
        case "num": case "str": case "bool": case "err": return node.v;
        case "empty": return null;
        case "ref": return outside(node.r, node.c) ? ERR.REF : env.cell(node.r, node.c, node.sheet);
        case "range": return outside(node.r2, node.c2) ? ERR.REF : env.range(node.r1, node.c1, node.r2, node.c2, node.sheet);
        case "un": { const x = toNumber(scalar(node.a)); return isError(x) ? x : -x; }
        case "pct": { const x = toNumber(scalar(node.a)); return isError(x) ? x : roundSig(x / 100); }
        case "bin": {
            const a = scalar(node.a), b = scalar(node.b);
            if (isError(a)) return a;
            if (isError(b)) return b;
            switch (node.op) {
                case "+": return num2(a, b, (x, y) => roundSig(x + y));
                case "-": return num2(a, b, (x, y) => roundSig(x - y));
                case "*": return num2(a, b, (x, y) => roundSig(x * y));
                case "/": return num2(a, b, (x, y) => (y === 0 ? ERR.DIV0 : roundSig(x / y)));
                case "^": return num2(a, b, (x, y) => { if (x === 0 && y === 0) return ERR.NUM; const r = Math.pow(x, y); return isFinite(r) ? roundSig(r) : ERR.NUM; });
                case "&": return toText(a) + toText(b);
                case "=": return compare(a, b) === 0;
                case "<>": return compare(a, b) !== 0;
                case "<": return compare(a, b) < 0;
                case ">": return compare(a, b) > 0;
                case "<=": return compare(a, b) <= 0;
                default: return compare(a, b) >= 0;
            }
        }
        case "call": {
            const f = FUNCTIONS[node.name];
            if (!f) return ERR.NAME;
            if (node.args.length < f.min || node.args.length > f.max) return ERR.VALUE;
            if (f.lazy) return f.fn(node.args.map((a) => () => scalar(a)), env);
            const args = node.args.map((a) => {
                // ROW(A5) wants to know where the cell is, not what is in it
                if (f.refs && a.t === "ref") return outside(a.r, a.c) ? ERR.REF : env.range(a.r, a.c, a.r, a.c, a.sheet);
                return evaluate(a, env);
            });
            if (!f.errors) { const bad = args.find(isError); if (bad) return bad; }
            return f.fn(args, env);
        }
        default: return ERR.VALUE;
    }
}

// ---- moving a formula (paste, fill) ----------------------------------------------------------------------------------------------------------------

function shiftCell(text, dr, dc) {
    const a = cellOf(text);
    const c = a.ca ? a.c : a.c + dc, r = a.ra ? a.r : a.r + dr;
    if (outside(r, c)) return null;
    return (a.ca ? "$" : "") + colName(c) + (a.ra ? "$" : "") + (r + 1);
}

/** The formula as it reads when it moves dr rows and dc columns: what is not fixed with $ moves along ("=A1+$B$1" one row down: "=A2+$B$1"); a reference pushed off the sheet becomes #REF!. */
export function shiftFormula(text, dr, dc) {
    const s = String(text);
    if (!s.startsWith("=")) return s;
    const body = s.slice(1);
    const lexed = tokenize(body);
    if (lexed.error) return s;
    let out = "", at = 0;
    for (const t of lexed.tokens) {
        let repl = null;
        if (t.type === "cell") repl = shiftCell(t.text, dr, dc) || "#REF!";
        else if (t.type === "colrange") {
            const parts = t.text.split(":").map((x) => { const abs = x[0] === "$"; const c = (abs ? colIndex(x.slice(1)) : colIndex(x)) + (abs ? 0 : dc); return c < 0 || c >= MAX_COLS ? null : (abs ? "$" : "") + colName(c); });
            repl = parts.indexOf(null) !== -1 ? "#REF!" : parts.join(":");
        } else if (t.type === "rowrange") {
            const parts = t.text.split(":").map((x) => { const abs = x[0] === "$"; const r = Number(abs ? x.slice(1) : x) - 1 + (abs ? 0 : dr); return r < 0 || r >= MAX_ROWS ? null : (abs ? "$" : "") + (r + 1); });
            repl = parts.indexOf(null) !== -1 ? "#REF!" : parts.join(":");
        }
        if (repl !== null) { out += body.slice(at, t.start) + repl; at = t.end; }
    }
    return "=" + out + body.slice(at);
}

/** The formula with every reference to the sheet `from` (any case) written for the sheet `to`: "=Old!A1+B1" -> "='New name'!A1+B1". What it does not read is left as it is. */
export function renameInFormula(text, from, to) {
    const s = String(text);
    if (!s.startsWith("=")) return s;
    const body = s.slice(1);
    const lexed = tokenize(body);
    if (lexed.error) return s;
    const want = String(from).toLowerCase();
    const plain = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(to) && !/^[A-Za-z]{1,3}\d+$/.test(to);
    const written = plain ? String(to) : "'" + String(to).replace(/'/g, "''") + "'";
    let out = "", at = 0;
    for (const t of lexed.tokens) {
        if (t.type === "sheet" && t.text.toLowerCase() === want) { out += body.slice(at, t.start) + written + "!"; at = t.end; }
    }
    return "=" + out + body.slice(at);
}

/**
 * Why a formula cannot be kept by the grid: "" when it can (it reads, and every function in it is one the grid has), else the first function it does not have, or a word
 * for the other cases. Used when a file from Excel is read: a formula the grid cannot work out is replaced by the value Excel worked out.
 */
export function formulaProblem(text) {
    const res = parseFormula(text);
    if (!res.ast) return "a formula it cannot read";
    let problem = "";
    const walk = (n) => {
        if (!n || problem) return;
        if (n.t === "call") { if (!FUNCTIONS[n.name]) { problem = n.name; return; } n.args.forEach(walk); }
        else if (n.t === "err" && n.v === ERR.NAME) problem = "a name";
        else if (n.a) { walk(n.a); if (n.b) walk(n.b); }
    };
    walk(res.ast);
    return problem;
}

/** True for a text that is a formula: it starts with "=" and has something after it. */
export const isFormula = (v) => typeof v === "string" && v.length > 1 && v[0] === "=";
