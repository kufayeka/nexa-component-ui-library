// Data Grid: the sheet as an Excel file (.xlsx). Pure (no DOM): it makes the text of the files of the package; the view puts them in a zip (the chart's
// zipStore) and downloads it.
//
// The model it takes is plain data: the cells (with the value as Excel keeps it, the number format, the font, the fill, the alignment and the borders), the
// widths and heights, the merges, the frozen panes. The view makes it from the grid as it is shown.
import { colName } from "./address.js";

const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
// characters XML cannot hold at all (control characters other than tab, new line, carriage return)
const clean = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

// ---- colours -----------------------------------------------------------------------------------------------------------------------------
const NAMED = {
    black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", yellow: "FFFF00", orange: "FFA500", purple: "800080", gray: "808080", grey: "808080",
    silver: "C0C0C0", maroon: "800000", olive: "808000", lime: "00FF00", aqua: "00FFFF", teal: "008080", navy: "000080", fuchsia: "FF00FF", pink: "FFC0CB", brown: "A52A2A",
    // the grid's own short names (see sheet.js colorOf / layout.js resolveColor)
    primary: "0F62FF", text: "161616", muted: "6F6F6F", error: "DA1E28", border: "C6C6C6", bd: "C6C6C6", "bd-strong": "8D8D8D", fg: "161616"
};

// the grid's own theme variables, as the colours they have in the light theme (a file has no theme)
const VARS = { "--cp-solid": "0F62FF", "--bd": "C6C6C6", "--bd-strong": "8D8D8D", "--fg": "161616", "--fg-muted": "6F6F6F", "--err": "DA1E28" };

/** A CSS colour as Excel's ARGB ("FFRRGGBB"), or null when it has no colour of its own (empty, transparent, a theme variable). */
export function cssToArgb(color) {
    const t = String(color === undefined || color === null ? "" : color).trim().toLowerCase();
    if (!t || t === "transparent" || t === "inherit") return null;
    const v = /^var\(\s*(--[a-z-]+)\s*(?:,.*)?\)$/.exec(t);
    if (v) return VARS[v[1]] ? "FF" + VARS[v[1]] : null;
    if (t.indexOf("var(") !== -1) return null;
    if (NAMED[t]) return "FF" + NAMED[t];
    let m = /^#([0-9a-f]{3})$/.exec(t);
    if (m) return ("FF" + m[1].split("").map((c) => c + c).join("")).toUpperCase();
    m = /^#([0-9a-f]{6})/.exec(t);
    if (m) return ("FF" + m[1]).toUpperCase();
    m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(t);
    if (m) return ("FF" + [m[1], m[2], m[3]].map((v) => Math.max(0, Math.min(255, Number(v))).toString(16).padStart(2, "0")).join("")).toUpperCase();
    return null;
}

// ---- sizes and dates ---------------------------------------------------------------------------------------------------------------------
/** A column width in pixels as Excel's character width (a column of 7-pixel characters, with 5 pixels of padding). */
export function pxToChars(px) { return Math.round(Math.max(0, (Number(px) - 5) / 7) * 100) / 100; }

/** A row height in pixels as points. */
export function pxToPoints(px) { return Math.round(Number(px) * 75) / 100; }

/** A date as Excel keeps it: days since 1899-12-30, the fraction being the time of day (the viewer's own time zone, as the grid shows it). */
export function excelSerial(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return null;
    return Math.round(((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000 + 25569) * 1e8) / 1e8;
}

/** The number format code of a number cell: decimals and a unit ("0.0" and " °C" -> 0.0" °C"). "" = the general format. */
export function numberFormat(decimals, suffix) {
    const base = decimals >= 0 ? (decimals === 0 ? "0" : "0." + "0".repeat(decimals)) : "";
    const unit = suffix ? '"' + String(suffix).replace(/"/g, "") + '"' : "";
    if (!unit) return base;
    return (base || "General") + unit;
}

const BORDER_STYLE = (style, width) => {
    const w = Number(width) || 1;
    if (style === "dashed") return w >= 2 ? "mediumDashed" : "dashed";
    if (style === "dotted") return "dotted";
    if (style === "double") return "double";
    return w >= 3 ? "thick" : w >= 2 ? "medium" : "thin";
};

// ---- the styles ---------------------------------------------------------------------------------------------------------------------------
function registry() {
    const list = [], at = new Map();
    return { list, get(item) { const k = JSON.stringify(item); if (!at.has(k)) { at.set(k, list.length); list.push(item); } return at.get(k); } };
}

function fontXml(f) {
    return "<font>" + (f.b ? "<b/>" : "") + (f.i ? "<i/>" : "") + (f.s ? "<strike/>" : "") + (f.u ? "<u/>" : "") + '<sz val="' + (f.sz || 11) + '"/>'
        + (f.color ? '<color rgb="' + f.color + '"/>' : '<color theme="1"/>') + '<name val="' + xmlEsc(f.name || "Calibri") + '"/><family val="2"/></font>';
}

function borderXml(b) {
    const side = (name, s) => (s ? "<" + name + ' style="' + BORDER_STYLE(s.style, s.width) + '"><color rgb="' + (cssToArgb(s.color) || "FF8D8D8D") + '"/></' + name + ">" : "<" + name + "/>");
    return "<border>" + side("left", b.l) + side("right", b.r) + side("top", b.t) + side("bottom", b.b) + "<diagonal/></border>";
}

/**
 * The files of the package for a model:
 *   { name, cells: [{ r, c, kind: "n" | "s" | "b" | null, v, fmt, font: { b, i, u, s, sz, color, name }, fill, align: { h, v, wrap }, border: { t, r, b, l } }],
 *     cols: { c: px }, rows: { r: px }, defaultCol: px, defaultRow: px, merges: [{ r1, c1, r2, c2 }], freeze: { rows, cols } }
 * (r and c from 0; "fill" and a font's "color" are ARGB; a border side is { style, width, color }). Returns [{ name, text }].
 */
export function buildXlsxFiles(model) {
    const fonts = registry(), fills = registry(), borders = registry(), fmts = registry(), xfs = registry();
    fonts.get({});
    fills.get({ none: true }); fills.get({ gray125: true });
    borders.get({});
    xfs.get({ f: 0, fi: 0, b: 0, n: 0, a: null });
    const sheetName = clean(model.name || "Sheet1").replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet1";

    const xfOf = (cell) => {
        const font = cell.font && Object.keys(cell.font).some((k) => cell.font[k]) ? fonts.get(cell.font) : 0;
        const fill = cell.fill ? fills.get({ rgb: cell.fill }) : 0;
        const border = cell.border && Object.keys(cell.border).some((k) => cell.border[k]) ? borders.get(cell.border) : 0;
        const numFmt = cell.fmt ? fmts.get(cell.fmt) + 164 : 0;
        const a = cell.align && (cell.align.h || cell.align.v || cell.align.wrap) ? { h: cell.align.h || "", v: cell.align.v || "", w: !!cell.align.wrap } : null;
        return xfs.get({ f: font, fi: fill, b: border, n: numFmt, a });
    };

    // the rows of cells, in order
    const byRow = new Map();
    model.cells.forEach((cell) => { if (!byRow.has(cell.r)) byRow.set(cell.r, []); byRow.get(cell.r).push(cell); });
    const rowNumbers = [...new Set([...byRow.keys(), ...Object.keys(model.rows || {}).map(Number)])].sort((a, b) => a - b);
    let maxR = -1, maxC = -1;
    const rowsXml = rowNumbers.map((r) => {
        const ht = model.rows && model.rows[r] !== undefined && model.rows[r] !== model.defaultRow ? ' ht="' + pxToPoints(model.rows[r]) + '" customHeight="1"' : "";
        const cells = (byRow.get(r) || []).sort((a, b) => a.c - b.c).map((cell) => {
            if (cell.r > maxR) maxR = cell.r;
            if (cell.c > maxC) maxC = cell.c;
            const ref = colName(cell.c) + (cell.r + 1), s = xfOf(cell);
            const style = s ? ' s="' + s + '"' : "";
            // a formula goes as the formula with its result next to it (Excel works it out again when the file opens)
            const f = typeof cell.formula === "string" && cell.formula.length > 1 ? "<f>" + xmlEsc(cell.formula.slice(1)) + "</f>" : "";
            if (cell.kind === "e") return '<c r="' + ref + '"' + style + ' t="e">' + f + "<v>" + xmlEsc(String(cell.v)) + "</v></c>";
            if (cell.kind === "n" && typeof cell.v === "number" && isFinite(cell.v)) return '<c r="' + ref + '"' + style + ">" + f + "<v>" + cell.v + "</v></c>";
            if (cell.kind === "b") return '<c r="' + ref + '"' + style + ' t="b">' + f + "<v>" + (cell.v ? 1 : 0) + "</v></c>";
            if (f && cell.kind === "s") return '<c r="' + ref + '"' + style + ' t="str">' + f + "<v>" + xmlEsc(clean(cell.v)) + "</v></c>";
            if (cell.kind === "s") return '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(clean(cell.v)) + "</t></is></c>";
            return '<c r="' + ref + '"' + style + "/>";
        }).join("");
        return '<row r="' + (r + 1) + '"' + ht + ">" + cells + "</row>";
    }).join("");

    const colNumbers = Object.keys(model.cols || {}).map(Number).sort((a, b) => a - b);
    const colsXml = colNumbers.length ? "<cols>" + colNumbers.map((c) => '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + pxToChars(model.cols[c]) + '" customWidth="1"/>').join("") + "</cols>" : "";
    const fz = model.freeze || { rows: 0, cols: 0 };
    const pane = fz.rows || fz.cols
        ? '<pane' + (fz.cols ? ' xSplit="' + fz.cols + '"' : "") + (fz.rows ? ' ySplit="' + fz.rows + '"' : "") + ' topLeftCell="' + colName(fz.cols) + (fz.rows + 1) + '" activePane="'
            + (fz.rows && fz.cols ? "bottomRight" : fz.rows ? "bottomLeft" : "topRight") + '" state="frozen"/>' : "";
    const merges = (model.merges || []).map((m) => '<mergeCell ref="' + colName(m.c1) + (m.r1 + 1) + ":" + colName(m.c2) + (m.r2 + 1) + '"/>');
    const dim = maxR >= 0 ? '<dimension ref="A1:' + colName(Math.max(maxC, 0)) + (maxR + 1) + '"/>' : "";
    const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + dim
        + '<sheetViews><sheetView workbookViewId="0">' + pane + "</sheetView></sheetViews>"
        + '<sheetFormatPr defaultRowHeight="' + pxToPoints(model.defaultRow || 28) + '"' + (model.defaultRow ? ' customHeight="1"' : "") + "/>" + colsXml
        + "<sheetData>" + rowsXml + "</sheetData>" + (merges.length ? '<mergeCells count="' + merges.length + '">' + merges.join("") + "</mergeCells>" : "") + "</worksheet>";

    const numFmts = fmts.list.length ? '<numFmts count="' + fmts.list.length + '">' + fmts.list.map((code, i) => '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + xmlEsc(code) + '"/>').join("") + "</numFmts>" : "";
    const fillXml = (f) => (f.none ? '<fill><patternFill patternType="none"/></fill>' : f.gray125 ? '<fill><patternFill patternType="gray125"/></fill>'
        : '<fill><patternFill patternType="solid"><fgColor rgb="' + f.rgb + '"/><bgColor indexed="64"/></patternFill></fill>');
    const xfXml = (x) => '<xf numFmtId="' + x.n + '" fontId="' + x.f + '" fillId="' + x.fi + '" borderId="' + x.b + '" xfId="0"' + (x.n ? ' applyNumberFormat="1"' : "") + (x.f ? ' applyFont="1"' : "")
        + (x.fi ? ' applyFill="1"' : "") + (x.b ? ' applyBorder="1"' : "") + (x.a ? ' applyAlignment="1"><alignment' + (x.a.h ? ' horizontal="' + x.a.h + '"' : "") + (x.a.v ? ' vertical="' + x.a.v + '"' : "") + (x.a.w ? ' wrapText="1"' : "") + "/></xf>" : "/>");
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + numFmts
        + '<fonts count="' + fonts.list.length + '">' + fonts.list.map(fontXml).join("") + "</fonts>"
        + '<fills count="' + fills.list.length + '">' + fills.list.map(fillXml).join("") + "</fills>"
        + '<borders count="' + borders.list.length + '">' + borders.list.map(borderXml).join("") + "</borders>"
        + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + '<cellXfs count="' + xfs.list.length + '">' + xfs.list.map(xfXml).join("") + "</cellXfs>"
        + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return [
        { name: "[Content_Types].xml", text: head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
        { name: "_rels/.rels", text: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
        { name: "xl/workbook.xml", text: head + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xmlEsc(sheetName) + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
        { name: "xl/_rels/workbook.xml.rels", text: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
        { name: "xl/styles.xml", text: styles },
        { name: "xl/worksheets/sheet1.xml", text: sheet }
    ];
}
