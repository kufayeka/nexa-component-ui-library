// Data Grid: the columns. Pure (no imports, no DOM), so the model tests run in plain Node.
//
// A column is what the user designs in the Columns list (or what the grid derives from the data when the list is empty).
// This file turns the saved list into complete columns, and knows how each type shows a value and takes an edit.

export const COLUMN_TYPES = ["text", "number", "boolean", "select", "date", "badge", "progress", "link", "image", "button", "input"];

// Types whose cell is edited by typing or choosing; the rest either act on click (button, link) or only show.
export const EDITABLE_TYPES = ["text", "number", "boolean", "select", "date", "input"];

const ALIGN_BY_TYPE = { number: "right", progress: "left", boolean: "center", button: "center", image: "center" };

/** The options of a select / badge column: "a, b" or "value:Label" or "value:Label:palette", one per comma. */
export function parseOptions(text) {
    return String(text === undefined || text === null ? "" : text).split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
        const bits = part.split(":").map((b) => b.trim());
        return { value: bits[0], label: bits[1] !== undefined && bits[1] !== "" ? bits[1] : bits[0], palette: bits[2] || "" };
    });
}

/** The type a column of this data looks like: number, boolean or text. Empty values do not count. */
export function inferType(values) {
    let seen = 0, numbers = 0, booleans = 0;
    for (let i = 0; i < values.length && seen < 50; i++) {
        const v = values[i];
        if (v === null || v === undefined || v === "") continue;
        seen++;
        if (typeof v === "number") numbers++;
        else if (typeof v === "boolean") booleans++;
    }
    if (seen && numbers === seen) return "number";
    if (seen && booleans === seen) return "boolean";
    return "text";
}

/** "createdAt" -> "Created at": a label for a column the grid derived from a field name. */
export function labelOfKey(key) {
    const spaced = String(key).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
    return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase() : String(key);
}

/**
 * The complete columns. `raw` is the saved list (may be empty or missing); `rows` is the data, used only to derive columns when the
 * list is empty (the keys of the first rows, in the order they appear). Hidden columns are kept (they still hold their data)
 * but marked, so the view can skip them.
 */
export function columnsOf(raw, rows) {
    let list = Array.isArray(raw) ? raw.filter((c) => c && typeof c === "object" && String(c.key === undefined ? "" : c.key) !== "") : [];
    if (!list.length) {
        const keys = [];
        const seen = new Set();
        const sample = Array.isArray(rows) ? rows.slice(0, 20) : [];
        sample.forEach((row) => {
            if (row && typeof row === "object") Object.keys(row).forEach((k) => { if (!seen.has(k)) { seen.add(k); keys.push(k); } });
        });
        list = keys.map((k) => ({ key: k, label: labelOfKey(k), type: inferType(sample.map((r) => (r ? r[k] : undefined))) }));
    }
    return list.map((c) => {
        const type = COLUMN_TYPES.indexOf(c.type) !== -1 ? c.type : "text";
        const width = Number(c.width);
        return {
            key: String(c.key),
            label: c.label === undefined || c.label === null || c.label === "" ? labelOfKey(c.key) : String(c.label),
            type,
            width: isFinite(width) && width > 0 ? width : (type === "boolean" || type === "button" ? 90 : 140),
            align: c.align === "left" || c.align === "center" || c.align === "right" ? c.align : (ALIGN_BY_TYPE[type] || "left"),
            editable: c.editable !== false,
            sortable: c.sortable !== false,
            filterable: c.filterable !== false,
            decimals: isFinite(Number(c.decimals)) && c.decimals !== "" && c.decimals !== null && Number(c.decimals) >= 0 ? Math.floor(Number(c.decimals)) : -1,
            format: c.format === "date" || c.format === "time" || c.format === "datetime" ? c.format : "datetime",
            suffix: c.suffix ? String(c.suffix) : "",
            options: parseOptions(c.options),
            action: c.action ? String(c.action) : String(c.key),
            buttonLabel: c.buttonLabel ? String(c.buttonLabel) : "",
            max: isFinite(Number(c.max)) && c.max !== "" && c.max !== null && Number(c.max) > 0 ? Number(c.max) : 100,
            hidden: c.hidden === true
        };
    });
}

const pad = (n) => (n < 10 ? "0" : "") + n;

/** A date value (epoch ms, epoch seconds, ISO text, Date) as a Date, or null. */
export function toDate(v) {
    if (v === null || v === undefined || v === "") return null;
    let d;
    if (v instanceof Date) d = v;
    else if (typeof v === "number") d = new Date(v < 1e11 ? v * 1000 : v);
    else d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
}

/** A date shown in the viewer's own time zone: "2026-10-18", "13:05:09" or "2026-10-18 13:05:09". */
export function formatDate(v, format) {
    const d = toDate(v);
    if (!d) return v === null || v === undefined ? "" : String(v);
    const day = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    const time = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    return format === "date" ? day : format === "time" ? time : day + " " + time;
}

/** What a value of this column looks like as text: the number with its decimals, the date, the option's label, "" for unknown. */
export function displayText(col, value) {
    if (value === null || value === undefined) return "";
    switch (col.type) {
        case "number": {
            const n = typeof value === "number" ? value : Number(value);
            if (value === "" || !isFinite(n)) return String(value);
            return (col.decimals >= 0 ? n.toFixed(col.decimals) : String(n)) + col.suffix;
        }
        case "boolean": return value === true || value === "true" || value === 1 ? "true" : "false";
        case "date": return formatDate(value, col.format);
        case "select": case "badge": {
            const o = col.options.find((x) => x.value === String(value));
            return o ? o.label : String(value);
        }
        case "button": return col.buttonLabel || String(value);
        default: return typeof value === "object" ? JSON.stringify(value) : String(value);
    }
}

/** The palette a badge value is shown in ("" = the grid's own palette). */
export function badgePalette(col, value) {
    const o = col.options.find((x) => x.value === String(value));
    return o ? o.palette : "";
}

/**
 * What an edit of this column's cell stores. Nothing is rejected (the user chose "validation later"): a number column keeps a
 * non-numeric text as typed, so the user sees what they entered and Logic decides.
 */
export function coerceEdit(col, input) {
    switch (col.type) {
        case "number": {
            if (typeof input === "number") return input;
            const text = String(input === undefined || input === null ? "" : input).trim();
            if (text === "") return null;
            const n = Number(text.replace(",", "."));
            return isFinite(n) ? n : text;
        }
        case "boolean": return input === true || input === "true" || input === 1 || input === "1";
        case "date": {
            const text = String(input === undefined || input === null ? "" : input).trim();
            if (text === "") return null;
            const d = toDate(text);
            return d ? (/^\d{4}-\d{2}-\d{2}$/.test(text) ? text : d.toISOString()) : text;
        }
        default: return input === undefined || input === null ? "" : String(input);
    }
}

/** An edit of a date cell goes through a native input: "2026-10-18T13:05" (or "2026-10-18") for what is stored. */
export function dateInputValue(col, value) {
    const d = toDate(value);
    if (!d) return "";
    const day = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    return col.format === "date" ? day : day + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

/**
 * Sample rows that fit the columns the user designed, for the editor (the design canvas and the Edit grid dialog): a value of each column's type.
 * Decoration only: the component never treats it as data.
 */
export function sampleRows(cols, count) {
    const n = count || 8;
    const rows = [];
    const words = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet"];
    for (let i = 0; i < n; i++) {
        const row = {};
        cols.forEach((col, j) => {
            let v;
            switch (col.type) {
                case "number": v = Math.round(((i * 37 + j * 11 + 13) % 1000)) / 10; break;
                case "progress": v = ((i * 23 + j * 7 + 10) % 100); break;
                case "boolean": v = (i + j) % 3 !== 0; break;
                case "select": case "badge": v = col.options.length ? col.options[(i + j) % col.options.length].value : "option" + ((i + j) % 3 + 1); break;
                case "date": v = new Date(2026, 0, 1 + i * 9 + j, 8 + (i % 10), (i * 7) % 60).toISOString(); break;
                case "link": v = "https://example.com/" + (i + 1); break;
                case "image": v = ""; break;
                case "button": v = ""; break;
                default: v = words[(i + j) % words.length] + " " + (i + 1);
            }
            row[col.key] = v;
        });
        rows.push(row);
    }
    return rows;
}
