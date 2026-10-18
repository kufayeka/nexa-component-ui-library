// Data Grid: the sheet. Pure (no DOM).
//
// What the user designed (the cells they typed, the rules of types and styles, the merges, borders, locks) is stored as text of Excel addresses.
// This file reads it into what the view needs: the value of each cell (the layers), the type and style a cell gets from the rules of its
// ranges, the area the live page shows. The view does not parse an address itself.
import { parseAddress, parseRange, clampRange } from "./address.js";
import { parseOptions, defaultAlign } from "./cell-types.js";
import { parseFields, expandPopulate } from "./populate.js";

/** The key of a cell in a map: "6,1" for B7 (a number pair, no string building of letters in the hot path). */
export const cellKey = (r, c) => r + "," + c;

// ---- what a rule can say ---------------------------------------------------------------------------------------------
// One list of rules for the type, the format and the style of a range, as the Format Cells of a sheet: the last rule that says something about a
// field wins for that field.
export const TYPE_FIELDS = ["type", "decimals", "suffix", "dateFormat", "options", "max", "buttonLabel", "action"];
export const STYLE_FIELDS = ["fontFamily", "fontSize", "bold", "italic", "underline", "strike", "color", "fill", "align", "valign", "wrap"];
export const RULE_FIELDS = TYPE_FIELDS.concat(STYLE_FIELDS);

// An empty text is a value: "back to the default", which covers what an earlier rule said about that field. Only a field that is missing says nothing.
const isSet = (v) => v !== undefined && v !== null;

/** The rules, cleaned: { range, fields } with the range inside the sheet and only the fields a rule may have, set. A rule with nothing to say is dropped. */
export function parseRules(list, rows, cols) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((rule) => {
        if (!rule || typeof rule !== "object") return;
        const range = clampRange(parseRange(rule.range), rows, cols);
        if (!range) return;
        const fields = {};
        RULE_FIELDS.forEach((k) => { if (isSet(rule[k])) fields[k] = rule[k]; });
        if (Object.keys(fields).length) out.push({ range, fields });
    });
    return out;
}

/** What the rules say about one cell: the fields of every rule that covers it, the later rule over the earlier. */
export function fieldsAt(rules, r, c) {
    const out = {};
    for (let i = 0; i < rules.length; i++) {
        const g = rules[i].range;
        if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) Object.assign(out, rules[i].fields);
    }
    return out;
}

/** The cell's type as the type file wants it (decimals, options parsed, and so on), with defaults. */
export function cellSpec(fields) {
    const f = fields || {};
    const decimals = Number(f.decimals), max = Number(f.max);
    const type = typeof f.type === "string" && f.type ? f.type : "text";
    return {
        type,
        decimals: f.decimals !== undefined && f.decimals !== "" && isFinite(decimals) && decimals >= 0 ? Math.floor(decimals) : -1,
        suffix: f.suffix ? String(f.suffix) : "",
        format: f.dateFormat === "date" || f.dateFormat === "time" || f.dateFormat === "datetime" ? f.dateFormat : "datetime",
        options: parseOptions(f.options),
        max: isFinite(max) && max > 0 ? max : 100,
        buttonLabel: f.buttonLabel ? String(f.buttonLabel) : "",
        action: f.action ? String(f.action) : "",
        label: ""
    };
}

// ---- style ------------------------------------------------------------------------------------------------------------
const NAMED_COLORS = { primary: "var(--cp-solid)", text: "var(--fg)", muted: "var(--fg-muted)", error: "var(--err)", border: "var(--bd)" };

/** A colour for a style: a short name of the theme, or a CSS colour. Anything that could carry more than a colour is refused (it goes into a style attribute). */
export function colorOf(c) {
    const t = String(c === undefined || c === null ? "" : c).trim();
    if (!t) return "";
    if (NAMED_COLORS[t]) return NAMED_COLORS[t];
    return /^[#a-zA-Z0-9(),.%\s-]+$/.test(t) && !/url|expression|var\(/i.test(t) ? t : "";
}

const FAMILIES = { sans: "var(--nexa-fonts-body, 'IBM Plex Sans', sans-serif)", mono: "var(--mono)", serif: "Georgia, 'Times New Roman', serif" };
export const FONT_FAMILIES = ["sans", "mono", "serif"];

/** The inline style of a cell from its fields (text style and the cell box), as one string. The cell's alignment is flex: `align` is horizontal, `valign` vertical. */
export function styleCss(fields, type) {
    const f = fields || {};
    const css = [];
    if (FAMILIES[f.fontFamily]) css.push("font-family:" + FAMILIES[f.fontFamily]);
    const size = Number(f.fontSize);
    if (isFinite(size) && size >= 6 && size <= 96) css.push("font-size:" + size + "px");
    if (f.bold === true) css.push("font-weight:700");
    if (f.italic === true) css.push("font-style:italic");
    const deco = [f.underline === true ? "underline" : "", f.strike === true ? "line-through" : ""].filter(Boolean).join(" ");
    if (deco) css.push("text-decoration:" + deco);
    const color = colorOf(f.color), fill = colorOf(f.fill);
    if (color) css.push("color:" + color);
    if (fill) css.push("background:" + fill);
    const align = f.align === "left" || f.align === "center" || f.align === "right" ? f.align : defaultAlign(type);
    css.push("justify-content:" + (align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"));
    css.push("text-align:" + align);
    // "safe": a wrapped text taller than its cell starts at the top instead of being cut off above
    css.push("align-items:" + (f.wrap === true ? "safe " : "") + (f.valign === "top" ? "flex-start" : f.valign === "bottom" ? "flex-end" : "center"));
    if (f.wrap === true) css.push("white-space:normal;line-height:1.25");
    return css.join(";");
}

// ---- the values ----------------------------------------------------------------------------------------------------------

/** The cells the user typed: { "A1": value } -> a Map keyed by cellKey, only addresses inside the sheet. */
export function parseCells(obj, rows, cols) {
    const map = new Map();
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return map;
    Object.keys(obj).forEach((address) => {
        const a = parseAddress(address);
        if (a && a.r < rows && a.c < cols && obj[address] !== undefined) map.set(cellKey(a.r, a.c), obj[address]);
    });
    return map;
}

/**
 * What the populate rules put in the sheet now. `items` are the rules with their value already taken from the message / variable / tag:
 * { at: "B2", value, enabled, direction, header, fields (text), limit }. A later rule covers an earlier one. Returns the cells and, per rule, the box it filled.
 */
export function populatedCells(items, rows, cols) {
    const map = new Map(), blocks = [];
    (Array.isArray(items) ? items : []).forEach((item, index) => {
        if (!item || item.enabled === false) { blocks.push(null); return; }
        const at = parseAddress(item.at);
        if (!at) { blocks.push(null); return; }
        const done = expandPopulate(item.value, { at, direction: item.direction === "right" ? "right" : "down", header: item.header === true, fields: parseFields(item.fields), limit: item.limit }, { rows, cols });
        done.cells.forEach((cell) => map.set(cellKey(cell.r, cell.c), cell.v));
        blocks.push(done.range);
    });
    return { map, blocks };
}

/** The value of a cell: what the user edited on the page, else what was populated, else what was typed in the design. `null` when there is none. */
export function valueAt(layers, r, c) {
    const k = cellKey(r, c);
    if (layers.edits && layers.edits.has(k)) return layers.edits.get(k);
    if (layers.populated && layers.populated.has(k)) return layers.populated.get(k);
    return layers.cells && layers.cells.has(k) ? layers.cells.get(k) : null;
}

// ---- the area the live page shows ---------------------------------------------------------------------------------------------

/** The area to show: the range the text says (kept inside the sheet), or the whole sheet when it is empty or not usable. */
export function viewAreaOf(text, rows, cols) {
    const whole = { r1: 0, c1: 0, r2: rows - 1, c2: cols - 1 };
    if (!String(text === undefined || text === null ? "" : text).trim()) return whole;
    return clampRange(parseRange(text), rows, cols) || whole;
}

// ---- the rule lists of the props, as numbers ----------------------------------------------------------------------------------------

/** Merges: a list of "A1:B2" -> [{ r1, c1, r2, c2 }] (an unusable entry is left out). */
export function mergesFromProps(list) {
    return (Array.isArray(list) ? list : []).map((t) => parseRange(typeof t === "string" ? t : t && t.range)).filter(Boolean);
}

/** Borders and locks: [{ range: "A1:B2", ... }] -> the same with r1, c1, r2, c2 beside the other fields. */
export function rangedFromProps(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((x) => {
        const g = x && typeof x === "object" ? parseRange(x.range) : null;
        if (g) out.push(Object.assign({}, x, g));
    });
    return out;
}
