// Data Grid: an Excel file (.xlsx) read into sheets of the grid. No DOM: bytes in, sheets out. (Inflating a zip entry uses the browser's own DecompressionStream.)
//
// What it takes from a file: for every sheet its name and whether it is hidden; the values (numbers, texts, booleans, dates, errors); the formulas (the ones whose
// functions the grid has; for any other the value Excel worked out is kept, and the warning says so); number formats (decimals, a unit, dates), fonts, colours, fills,
// alignment, wrap, borders; merged cells; column widths and row heights; frozen panes. What a grid has no place for (charts, pictures, conditional formats, data
// validation, defined names, other formats of a percent) is left out, and the warnings say what was seen.
import { colName, parseAddress, MAX_ROWS, MAX_COLS } from "./address.js";
import { shiftFormula, formulaProblem } from "./formula.js";
import { serialToDate } from "./xlvalue.js";
import { cleanName, uniqueName } from "./sheets.js";

const MAX_ENTRY = 40 * 1024 * 1024;       // the most one file inside the package may have once inflated
const MAX_TOTAL = 120 * 1024 * 1024;      // and all of them together: a small zip that inflates to gigabytes is refused
const MAX_RULES = 4000;                   // style and border rules made from the cells: more than this and the rest is left out

// ---- the zip ----------------------------------------------------------------------------------------------------------------------------------

async function inflate(data, limit) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();
    const parts = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) { try { await reader.cancel(); } catch (e) { /* stopped */ } throw new Error("a file in the package is too big once inflated"); }
        parts.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    parts.forEach((p) => { out.set(p, at); at += p.length; });
    return out;
}

/** The files of a zip: Map name -> bytes (stored and deflated entries; no encryption, no zip64). Throws a short message for a file that is not a zip. */
export async function unzip(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error("this is not an Excel file (no zip directory)");
    const count = dv.getUint16(end + 10, true);
    let at = dv.getUint32(end + 16, true);
    if (count > 2000) throw new Error("the package has too many files");
    const files = new Map();
    let total = 0;
    const text = new TextDecoder("utf-8");
    for (let k = 0; k < count; k++) {
        if (at + 46 > bytes.length || dv.getUint32(at, true) !== 0x02014b50) throw new Error("the zip directory is damaged");
        const method = dv.getUint16(at + 10, true), comp = dv.getUint32(at + 20, true), plain = dv.getUint32(at + 24, true);
        const nameLen = dv.getUint16(at + 28, true), extraLen = dv.getUint16(at + 30, true), commentLen = dv.getUint16(at + 32, true), local = dv.getUint32(at + 42, true);
        const name = text.decode(bytes.subarray(at + 46, at + 46 + nameLen));
        at += 46 + nameLen + extraLen + commentLen;
        if (name.endsWith("/")) continue;
        if (plain > MAX_ENTRY || (total += plain) > MAX_TOTAL) throw new Error("the package is too big");
        if (local + 30 > bytes.length || dv.getUint32(local, true) !== 0x04034b50) throw new Error("the zip is damaged");
        const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        const data = bytes.subarray(start, start + comp);
        if (method === 0) files.set(name, data);
        else if (method === 8) files.set(name, await inflate(data, MAX_ENTRY));
        else throw new Error("the package uses a way of packing the grid does not know");
    }
    return files;
}

// ---- the XML ----------------------------------------------------------------------------------------------------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
    return ENTITIES[e] !== undefined ? ENTITIES[e] : m;
});
const local = (name) => { const i = name.indexOf(":"); return i < 0 ? name : name.slice(i + 1); };

/**
 * XML text -> a tree of { name, attrs, children, text } (names without their prefix; `text` is the text directly in the element, entities decoded, CDATA as it is).
 * Enough for what Excel writes: no DTD, no processing beyond skipping the declaration and the comments.
 */
export function parseXml(source) {
    const root = { name: "#root", attrs: {}, children: [], text: "" };
    const stack = [root];
    const token = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s\/>!?]+)((?:\s+[^\s=\/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    const attr = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = token.exec(source))) {
        const top = stack[stack.length - 1];
        if (m[1] !== undefined) top.text += m[1];
        else if (m[2] !== undefined) { if (stack.length > 1) stack.pop(); }
        else if (m[3] !== undefined) {
            const node = { name: local(m[3]), attrs: {}, children: [], text: "" };
            let a;
            attr.lastIndex = 0;
            while ((a = attr.exec(m[4] || ""))) node.attrs[local(a[1])] = unescapeXml(a[2] !== undefined ? a[2] : a[3]);
            top.children.push(node);
            if (!m[5]) { if (stack.length > 200) throw new Error("the XML is nested too deep"); stack.push(node); }
        } else if (m[6] !== undefined) top.text += unescapeXml(m[6]);
    }
    return root;
}

const kid = (node, name) => (node ? node.children.find((c) => c.name === name) : undefined);
const kids = (node, name) => (node ? node.children.filter((c) => c.name === name) : []);

// ---- the pieces of a workbook ----------------------------------------------------------------------------------------------------------------

const BUILTIN_FORMATS = { 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 9: "0%", 10: "0.00%", 14: "yyyy-mm-dd", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "yyyy-mm-dd h:mm", 37: "#,##0", 38: "#,##0", 39: "#,##0.00", 40: "#,##0.00", 45: "mm:ss", 46: "[h]:mm:ss", 47: "mm:ss.0", 49: "@" };

/** What a number format code means to the grid: { type, decimals, suffix, dateFormat } with only what applies. */
export function formatFields(code) {
    if (code === undefined || code === null || code === "" || /^general$/i.test(code)) return {};
    if (code === "@") return { type: "text" };
    const quoted = [];
    const bare = String(code).split(";")[0].replace(/"([^"]*)"/g, (m, s) => { quoted.push(s); return "\u0001"; }).replace(/\\(.)/g, (m, c) => { quoted.push(c); return "\u0001"; }).replace(/\[[^\]]*\]/g, "");
    if (/[ymdhs]/i.test(bare.replace(/AM\/PM|A\/P/gi, "").replace(/\u0001/g, ""))) {
        // an m on its own may be the month or the minute: a year or a day makes it a date, an hour or a second a time
        const letters = bare.replace(/AM\/PM|A\/P/gi, "").replace(/\u0001/g, "");
        const hasDate = /[yd]/i.test(letters), hasTime = /[hs]/i.test(letters);
        return { type: "date", dateFormat: hasDate && hasTime ? "" : hasTime ? "time" : "date" };
    }
    if (bare.indexOf("%") !== -1) return {};
    const core = /[#0?,]*[#0?](?:\.[#0?]*)?/.exec(bare);
    if (!core) return {};
    const dot = core[0].indexOf(".");
    const decimals = dot < 0 ? 0 : core[0].length - dot - 1;
    // the text round the number: a unit after it is the suffix ("kg", " °C"); what stands before it (a currency sign) is left out
    let qi = bare.slice(0, core.index).split("\u0001").length - 1;
    const suffix = bare.slice(core.index + core[0].length).replace(/\u0001/g, () => quoted[qi++] || "").replace(/_.|\*./g, "");
    return { type: "number", decimals, suffix };
}

const argbToCss = (rgb) => {
    if (!rgb || !/^[0-9a-fA-F]{8}$/.test(rgb) || rgb.slice(0, 2).toUpperCase() === "00") return "";
    return "#" + rgb.slice(2).toLowerCase();
};
const colorOf = (node) => (node && node.attrs.rgb ? argbToCss(node.attrs.rgb) : "");

const BORDER_MAP = { thin: ["solid", 1], hair: ["dotted", 1], dotted: ["dotted", 1], dashed: ["dashed", 1], dashDot: ["dashed", 1], dashDotDot: ["dashed", 1], mediumDashed: ["dashed", 2], mediumDashDot: ["dashed", 2],
    mediumDashDotDot: ["dashed", 2], slantDashDot: ["dashed", 2], medium: ["solid", 2], thick: ["solid", 3], double: ["double", 3] };

function readStyles(files) {
    const out = { xfs: [] };
    const file = files.get("xl/styles.xml");
    if (!file) return out;
    const root = kid(parseXml(new TextDecoder().decode(file)), "styleSheet");
    const formats = {};
    kids(kid(root, "numFmts"), "numFmt").forEach((n) => { formats[n.attrs.numFmtId] = n.attrs.formatCode; });
    const fonts = kids(kid(root, "fonts"), "font").map((f) => ({
        b: !!kid(f, "b") && kid(f, "b").attrs.val !== "0", i: !!kid(f, "i") && kid(f, "i").attrs.val !== "0", s: !!kid(f, "strike") && kid(f, "strike").attrs.val !== "0",
        u: !!kid(f, "u") && kid(f, "u").attrs.val !== "none", sz: kid(f, "sz") ? Number(kid(f, "sz").attrs.val) : 0, color: colorOf(kid(f, "color")), name: kid(f, "name") ? kid(f, "name").attrs.val : ""
    }));
    const fills = kids(kid(root, "fills"), "fill").map((f) => { const p = kid(f, "patternFill"); return p && p.attrs.patternType === "solid" ? colorOf(kid(p, "fgColor")) : ""; });
    const borders = kids(kid(root, "borders"), "border").map((b) => {
        const side = (n) => { const s = kid(b, n); if (!s || !s.attrs.style || s.attrs.style === "none") return null; const m = BORDER_MAP[s.attrs.style] || ["solid", 1]; return { style: m[0], width: m[1], color: colorOf(kid(s, "color")) }; };
        return { l: side("left"), r: side("right"), t: side("top"), b: side("bottom") };
    });
    const baseSize = fonts[0] ? fonts[0].sz : 11;
    kids(kid(root, "cellXfs"), "xf").forEach((x) => {
        const id = Number(x.attrs.numFmtId) || 0;
        const fields = Object.assign({}, formatFields(formats[id] !== undefined ? formats[id] : BUILTIN_FORMATS[id]));
        const f = fonts[Number(x.attrs.fontId) || 0];
        if (f) {
            if (f.b) fields.bold = true;
            if (f.i) fields.italic = true;
            if (f.u) fields.underline = true;
            if (f.s) fields.strike = true;
            if (f.sz && f.sz !== baseSize) fields.fontSize = Math.round(f.sz * 4 / 3);
            if (f.color && f.color !== "#000000") fields.color = f.color;
            if (/mono|consolas|courier/i.test(f.name)) fields.fontFamily = "mono";
            else if (/times|georgia|cambria|garamond|serif/i.test(f.name) && !/sans/i.test(f.name)) fields.fontFamily = "serif";
        }
        const fill = fills[Number(x.attrs.fillId) || 0];
        if (fill) fields.fill = fill;
        const al = kid(x, "alignment");
        if (al) {
            if (["left", "center", "right"].indexOf(al.attrs.horizontal) !== -1) fields.align = al.attrs.horizontal;
            if (al.attrs.vertical === "top" || al.attrs.vertical === "bottom") fields.valign = al.attrs.vertical;
            if (al.attrs.wrapText === "1" || al.attrs.wrapText === "true") fields.wrap = true;
        }
        out.xfs.push({ fields, border: borders[Number(x.attrs.borderId) || 0] || null });
    });
    return out;
}

function readShared(files) {
    const file = files.get("xl/sharedStrings.xml");
    if (!file) return [];
    const root = kid(parseXml(new TextDecoder().decode(file)), "sst");
    // a string is its <t>, or the <t> of each of its runs (rich text); the phonetic runs are not part of it
    return kids(root, "si").map((si) => (kid(si, "t") ? kid(si, "t").text : kids(si, "r").map((r) => (kid(r, "t") ? kid(r, "t").text : "")).join("")));
}

// ---- rectangles: many cells with one style are a few ranges -------------------------------------------------------------------------------------

/** A set of cells ("r,c" keys) as boxes that together are exactly those cells: row by row, right as far as it goes, then down while the whole run is there. */
export function boxesOf(keys) {
    const has = new Set(keys), done = new Set(), out = [];
    const list = [...keys].map((k) => k.split(",").map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    list.forEach(([r, c]) => {
        if (done.has(r + "," + c)) return;
        let c2 = c;
        while (has.has(r + "," + (c2 + 1)) && !done.has(r + "," + (c2 + 1))) c2++;
        let r2 = r;
        const rowOk = (rr) => { for (let k = c; k <= c2; k++) if (!has.has(rr + "," + k) || done.has(rr + "," + k)) return false; return true; };
        while (rowOk(r2 + 1)) r2++;
        for (let a = r; a <= r2; a++) for (let b = c; b <= c2; b++) done.add(a + "," + b);
        out.push({ r1: r, c1: c, r2, c2 });
    });
    return out;
}

const boxText = (b) => (b.r1 === b.r2 && b.c1 === b.c2 ? colName(b.c1) + (b.r1 + 1) : colName(b.c1) + (b.r1 + 1) + ":" + colName(b.c2) + (b.r2 + 1));
const charsToPx = (chars) => Math.round(Number(chars) * 7 + 5);

// ---- one sheet ---------------------------------------------------------------------------------------------------------------------------------------

function readSheet(root, shared, styles, date1904, info, warnings) {
    const sheet = kid(root, "worksheet");
    const data = kid(sheet, "sheetData");
    const cells = {}, styleOf = new Map(), borderOf = new Map(), shares = new Map(), bad = new Set();
    let maxR = 0, maxC = 0, dropped = 0;
    kids(data, "row").forEach((row) => {
        kids(row, "c").forEach((c) => {
            const a = parseAddress(c.attrs.r);
            if (!a) return;
            if (a.r >= MAX_ROWS || a.c >= MAX_COLS) { dropped++; return; }
            const xf = styles.xfs[Number(c.attrs.s) || 0];
            const t = c.attrs.t || "n";
            const v = kid(c, "v"), f = kid(c, "f");
            let value;
            if (t === "s") value = shared[Number(v && v.text)] !== undefined ? shared[Number(v.text)] : "";
            else if (t === "str") value = v ? v.text : "";
            else if (t === "inlineStr") value = kids(kid(c, "is"), "r").length ? kids(kid(c, "is"), "r").map((r) => (kid(r, "t") ? kid(r, "t").text : "")).join("") : (kid(kid(c, "is"), "t") ? kid(kid(c, "is"), "t").text : "");
            else if (t === "b") value = !!v && v.text.trim() === "1";
            else if (t === "e") value = "=" + (v ? v.text.trim() : "#N/A");
            else if (t === "d") value = v ? v.text.trim() : "";
            else value = v && v.text.trim() !== "" ? Number(v.text) : null;
            const fields = xf ? Object.assign({}, xf.fields) : {};
            // a number under a date format is a date (its serial number is what a formula sees: the cell turns it back)
            if (fields.type === "date" && typeof value === "number" && !f) {
                const d = serialToDate(value + (date1904 ? 1462 : 0));
                value = fields.dateFormat === "date" ? d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") : d.toISOString();
            }
            if (typeof value === "boolean" && !fields.type) fields.type = "boolean";
            // a formula: kept when the grid knows every function in it, else the value Excel worked out stays
            if (f) {
                let text = f.text;
                if (f.attrs.t === "shared") {
                    if (text) shares.set(f.attrs.si, { text, r: a.r, c: a.c });
                    else if (shares.has(f.attrs.si)) { const m = shares.get(f.attrs.si); text = shiftFormula("=" + m.text, a.r - m.r, a.c - m.c).slice(1); }
                }
                if (text) {
                    const formula = "=" + text;
                    const problem = formulaProblem(formula);
                    if (!problem) value = formula;
                    else bad.add(problem);
                }
            }
            if (value !== null && value !== undefined && value !== "") { cells[colName(a.c) + (a.r + 1)] = value; }
            if (a.r > maxR) maxR = a.r;
            if (a.c > maxC) maxC = a.c;
            const key = a.r + "," + a.c;
            if (Object.keys(fields).length) styleOf.set(key, fields);
            if (xf && xf.border && (xf.border.l || xf.border.r || xf.border.t || xf.border.b)) borderOf.set(key, xf.border);
        });
    });

    // the rules: one per box of cells that look the same
    const groups = new Map();
    styleOf.forEach((fields, key) => { const k = JSON.stringify(fields); if (!groups.has(k)) groups.set(k, { fields, keys: [] }); groups.get(k).keys.push(key); });
    const cellRules = [];
    groups.forEach((g) => boxesOf(g.keys).forEach((b) => cellRules.push(Object.assign({ range: boxText(b) }, g.fields))));
    const lines = new Map();
    borderOf.forEach((b, key) => ["l", "r", "t", "b"].forEach((s) => {
        if (!b[s]) return;
        const k = s + "|" + b[s].style + "|" + b[s].width + "|" + b[s].color;
        if (!lines.has(k)) lines.set(k, { side: { l: "left", r: "right", t: "top", b: "bottom" }[s], spec: b[s], keys: [] });
        lines.get(k).keys.push(key);
    }));
    const borders = [];
    lines.forEach((g) => boxesOf(g.keys).forEach((b) => borders.push({ range: boxText(b), sides: g.side, style: g.spec.style, width: g.spec.width, color: g.spec.color || "" })));
    if (cellRules.length > MAX_RULES) { warnings.push("'" + info.name + "': " + (cellRules.length - MAX_RULES) + " style rules were left out (too many different looks)"); cellRules.length = MAX_RULES; }
    if (borders.length > MAX_RULES) { warnings.push("'" + info.name + "': " + (borders.length - MAX_RULES) + " border rules were left out"); borders.length = MAX_RULES; }

    // sizes
    const fmt = kid(sheet, "sheetFormatPr");
    const colWidth = fmt && fmt.attrs.defaultColWidth ? charsToPx(fmt.attrs.defaultColWidth) : 64;
    const rowHeight = fmt && fmt.attrs.defaultRowHeight ? Math.round(Number(fmt.attrs.defaultRowHeight) * 4 / 3) : 20;
    const colRules = [];
    kids(kid(sheet, "cols"), "col").forEach((c) => {
        const lo = Number(c.attrs.min) - 1, hi = Math.min(Number(c.attrs.max) - 1, MAX_COLS - 1);
        if (!(c.attrs.width && lo >= 0 && lo < MAX_COLS) || c.attrs.hidden === "1") return;
        const width = charsToPx(c.attrs.width);
        if (width !== colWidth) colRules.push({ columns: lo === hi ? colName(lo) : colName(lo) + ":" + colName(hi), width });
    });
    const rowRules = [];
    kids(data, "row").forEach((r) => {
        const n = Number(r.attrs.r);
        if (!(n >= 1 && n <= MAX_ROWS) || !r.attrs.ht || r.attrs.customHeight !== "1") return;
        const height = Math.round(Number(r.attrs.ht) * 4 / 3);
        if (height !== rowHeight) rowRules.push({ rows: String(n), height });
    });
    const merges = kids(kid(sheet, "mergeCells"), "mergeCell").map((m) => m.attrs.ref).filter(Boolean);
    const pane = kid(kid(kid(sheet, "sheetViews"), "sheetView"), "pane");
    const out = { name: info.name };
    if (info.hidden) out.visible = false;
    out.rows = Math.min(MAX_ROWS, Math.max(maxR + 1 + 20, 50));
    out.cols = Math.min(MAX_COLS, Math.max(maxC + 1 + 3, 10));
    out.colWidth = colWidth;
    out.rowHeight = rowHeight;
    if (pane && pane.attrs.state === "frozen") { out.freezeRows = Number(pane.attrs.ySplit) || 0; out.freezeCols = Number(pane.attrs.xSplit) || 0; }
    out.cells = cells;
    if (cellRules.length) out.cellRules = cellRules;
    if (borders.length) out.borders = borders;
    if (merges.length) out.merges = merges;
    if (colRules.length) out.colRules = colRules;
    if (rowRules.length) out.rowRules = rowRules;
    if (bad.size) warnings.push("'" + info.name + "': formulas with " + [...bad].slice(0, 6).join(", ") + (bad.size > 6 ? " ..." : "") + " are not in the grid: their values were kept");
    if (dropped) warnings.push("'" + info.name + "': " + dropped + " cell" + (dropped === 1 ? " is" : "s are") + " beyond row " + MAX_ROWS + " or column " + colName(MAX_COLS - 1) + " and was left out");
    if (kid(sheet, "drawing") || kid(sheet, "legacyDrawing")) warnings.push("'" + info.name + "': pictures, charts or comments were not imported");
    if (kid(sheet, "conditionalFormatting")) warnings.push("'" + info.name + "': conditional formatting was not imported");
    if (kid(sheet, "dataValidations")) warnings.push("'" + info.name + "': data validation was not imported");
    return out;
}

/**
 * An .xlsx file (bytes) -> { sheets, active, warnings }: the sheets as the grid stores them (name, visible, rows, cols, colWidth, rowHeight, freezeRows, freezeCols, cells,
 * cellRules, borders, merges, colRules, rowRules), the place of the sheet that was open, and what was left out. Throws a short message for a file it cannot read.
 */
export async function readXlsx(bytes) {
    const files = await unzip(bytes);
    const book = files.get("xl/workbook.xml");
    if (!book) throw new Error("this is not an Excel workbook (no xl/workbook.xml)");
    const wb = kid(parseXml(new TextDecoder().decode(book)), "workbook");
    const rels = {};
    const relFile = files.get("xl/_rels/workbook.xml.rels");
    if (relFile) kids(kid(parseXml(new TextDecoder().decode(relFile)), "Relationships"), "Relationship").forEach((r) => { rels[r.attrs.Id] = r.attrs.Target; });
    const styles = readStyles(files), shared = readShared(files);
    const date1904 = !!kid(wb, "workbookPr") && ["1", "true"].indexOf(kid(wb, "workbookPr").attrs.date1904) !== -1;
    const warnings = [], sheets = [], taken = [];
    const infos = kids(kid(wb, "sheets"), "sheet");
    if (!infos.length) throw new Error("the workbook has no sheets");
    if (infos.length > 100) warnings.push("only the first 100 sheets were read");
    for (const s of infos.slice(0, 100)) {
        const target = rels[s.attrs.id];
        const path = target ? (target[0] === "/" ? target.slice(1) : "xl/" + target.replace(/^\.\//, "")) : "";
        const bytesOfSheet = files.get(path);
        if (!bytesOfSheet) { warnings.push("the sheet '" + s.attrs.name + "' is not in the file (a chart sheet?)"); continue; }
        const name = uniqueName(cleanName(s.attrs.name) || "Sheet" + (sheets.length + 1), taken);
        taken.push(name);
        sheets.push(readSheet(parseXml(new TextDecoder().decode(bytesOfSheet)), shared, styles, date1904, { name, hidden: !!s.attrs.state && s.attrs.state !== "visible" }, warnings));
    }
    if (!sheets.length) throw new Error("the workbook has no sheet the grid can read");
    if (kid(wb, "definedNames") && kids(kid(wb, "definedNames"), "definedName").some((d) => !/^_xlnm\./.test(d.attrs.name || ""))) warnings.push("named ranges were not imported (a formula that used one kept its value)");
    const view = kid(kid(wb, "bookViews"), "workbookView");
    const active = Math.max(0, Math.min(sheets.length - 1, Number(view && view.attrs.activeTab) || 0));
    return { sheets, active, warnings };
}

