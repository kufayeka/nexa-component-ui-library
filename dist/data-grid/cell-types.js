// Data Grid: the types of a cell and what they do with a value. Pure (no imports, no DOM).
//
// A cell has a type (text, number, checkbox, choice, date, badge, progress, link, image, button, input) given by the rules of its range. This file
// knows how each type shows a value as text and what an edit of it stores. Nothing is validated: a value is taken as typed.

export const CELL_TYPES = ["general", "text", "number", "boolean", "select", "date", "badge", "progress", "link", "image", "button", "input"];

const ALIGN_BY_TYPE = { number: "right", boolean: "center", button: "center", image: "center" };

/** Where a type puts its content when the rules do not say: numbers on the right, checkboxes and buttons in the middle. */
export function defaultAlign(type) { return ALIGN_BY_TYPE[type] || "left"; }

/** The options of a select / badge column: "a, b" or "value:Label" or "value:Label:palette", one per comma. */
export function parseOptions(text) {
    return String(text === undefined || text === null ? "" : text).split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
        const bits = part.split(":").map((b) => b.trim());
        return { value: bits[0], label: bits[1] !== undefined && bits[1] !== "" ? bits[1] : bits[0], palette: bits[2] || "" };
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
        case "text": return input === undefined || input === null ? "" : String(input);
        default: {
            // general: what looks like a number is a number (zero-padded codes like "0123" stay text), as in a sheet
            if (typeof input === "number" || typeof input === "boolean") return input;
            const text = input === undefined || input === null ? "" : String(input);
            return /^\s*-?(0|[1-9]\d*)([.,]\d+)?\s*$/.test(text) ? Number(text.trim().replace(",", ".")) : text;
        }
    }
}

/** An edit of a date cell goes through a native input: "2026-10-18T13:05" (or "2026-10-18") for what is stored. */
export function dateInputValue(col, value) {
    const d = toDate(value);
    if (!d) return "";
    const day = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    return col.format === "date" ? day : day + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
