// Data Grid: the fields of the lists the grid stores (cell rules, populate rules, borders, locks), as the schema the inspector's lists and the Edit grid
// dialog both use. One definition, so the two can never disagree about what a rule is made of.
import { CELL_TYPES } from "./cell-types.js";
import { FONT_FAMILIES } from "./sheet.js";

const range = { type: "string", label: "Cells", default: "", bindable: false, placeholder: "A1:C10, B:B, 2:5",
    help: "As in a sheet: one cell (B2), a range (A1:C10), whole columns (B:C) or whole rows (2:5)." };
const showFor = (...types) => (rule) => types.indexOf(rule.type || "text") !== -1;

/** A cell rule: the type, the format and the style of a range. Every field is optional; the last rule that sets a field wins for it. */
export const RULE_SCHEMA = {
    range,
    type: { type: "enum", label: "Cell type", default: "", options: [{ value: "", label: "(general)" }].concat(CELL_TYPES.slice(1).map((t) => ({ value: t, label: t }))), style: "select", bindable: false, section: "Type" },
    decimals: { type: "number", label: "Decimals", default: "", min: 0, max: 10, section: "Type", visibleWhen: showFor("number") },
    suffix: { type: "string", label: "Unit / suffix", default: "", section: "Type", visibleWhen: showFor("number") },
    dateFormat: { type: "enum", label: "Date format", default: "", options: [{ value: "", label: "date and time" }, { value: "date", label: "date" }, { value: "time", label: "time" }], section: "Type", visibleWhen: showFor("date") },
    options: { type: "string", label: "Options", default: "", section: "Type", visibleWhen: showFor("select", "badge"),
        help: "Comma separated: value, or value:Label, or (badge) value:Label:palette. Example: on:Running:green, off:Stopped:gray" },
    max: { type: "number", label: "Full bar at", default: "", min: 1, section: "Type", visibleWhen: showFor("progress") },
    buttonLabel: { type: "string", label: "Button text", default: "", section: "Type", visibleWhen: showFor("button") },
    action: { type: "string", label: "Action name", default: "", section: "Type", visibleWhen: showFor("button"), help: "Sent with On Button Click, with the cell's address." },
    fontFamily: { type: "enum", label: "Font", default: "", options: [{ value: "", label: "(grid's)" }].concat(FONT_FAMILIES.map((f) => ({ value: f, label: f }))), style: "select", section: "Text" },
    fontSize: { type: "number", label: "Size", default: "", min: 6, max: 96, unit: "px", section: "Text" },
    bold: { type: "boolean", label: "Bold", default: false, section: "Text" },
    italic: { type: "boolean", label: "Italic", default: false, section: "Text" },
    underline: { type: "boolean", label: "Underline", default: false, section: "Text" },
    strike: { type: "boolean", label: "Strikethrough", default: false, section: "Text" },
    color: { type: "color", label: "Text colour", default: "", section: "Text" },
    fill: { type: "color", label: "Fill", default: "", section: "Cell" },
    align: { type: "enum", label: "Align", default: "", options: [{ value: "", label: "(by type)" }, "left", "center", "right"], style: "segmented", section: "Cell" },
    valign: { type: "enum", label: "Vertical align", default: "", options: [{ value: "", label: "middle" }, { value: "top", label: "top" }, { value: "bottom", label: "bottom" }], section: "Cell" },
    wrap: { type: "boolean", label: "Wrap text", default: false, section: "Cell" }
};

/** A populate rule: where it starts, where its value comes from, and how a list is laid down. */
export const POPULATE_SCHEMA = {
    at: { type: "string", label: "Starts at", default: "A1", bindable: false, placeholder: "B2", help: "The first cell it fills." },
    value: { type: "tag", access: "read", label: "Value", help: "Where the value comes from: a message (msg.payload), a variable, a tag. A list fills the cells after the first." },
    enabled: { type: "boolean", label: "Populate", default: true, help: "Off: the rule stays, but fills nothing." },
    direction: { type: "enum", label: "Fill", default: "down", options: [{ value: "down", label: "down" }, { value: "right", label: "to the right" }], style: "segmented", help: "Down: a list goes down the column; a list of rows is a table. To the right: the other way round." },
    header: { type: "boolean", label: "Field names first", default: false, help: "A list of objects: a first row with their field names." },
    fields: { type: "string", label: "Fields", default: "", placeholder: "id, temp, state", help: "A list of objects: which fields, in which order. Empty: all of them, as they appear." },
    limit: { type: "number", label: "At most (cells)", default: "", min: 1, help: "Empty: no limit." }
};

/** A border rule. */
export const BORDER_SCHEMA = {
    range,
    sides: { type: "enum", label: "Lines", default: "all", options: ["all", "outer", "inner", "top", "bottom", "left", "right", "inner-h", "inner-v"], style: "select" },
    style: { type: "enum", label: "Style", default: "solid", options: ["solid", "dashed", "dotted", "double", "none"], style: "select" },
    width: { type: "number", label: "Width", default: 1, min: 1, max: 6, unit: "px" },
    color: { type: "string", label: "Colour", default: "", help: "bd, bd-strong, fg, primary, error, or any CSS colour. Empty: the strong line colour." }
};

/** A lock rule. */
export const LOCK_SCHEMA = {
    range,
    locked: { type: "boolean", label: "Locked", default: true, help: "On: cannot be edited. Off: can be edited, also when an earlier rule locked it." }
};

const adjustable = { type: "enum", default: "", options: [{ value: "", label: "(the grid's)" }, { value: true, label: "yes" }, { value: false, label: "no" }], style: "select" };

/** A size rule over columns. */
export const COL_RULE_SCHEMA = {
    columns: { type: "string", label: "Columns", default: "", bindable: false, placeholder: "B:C", help: "One column (B) or several (B:D)." },
    width: { type: "number", label: "Width", default: "", min: 0, unit: "px" },
    minWidth: { type: "number", label: "Smallest it can be dragged to", default: "", min: 0, unit: "px" },
    maxWidth: { type: "number", label: "Largest it can be dragged to", default: "", min: 0, unit: "px" },
    adjustable: Object.assign({ label: "The user can drag its width", help: "Empty: what the grid says (Columns can be dragged)." }, adjustable)
};

/** A size rule over rows. */
export const ROW_RULE_SCHEMA = {
    rows: { type: "string", label: "Rows", default: "", bindable: false, placeholder: "2:5", help: "One row (3) or several (2:5)." },
    height: { type: "number", label: "Height", default: "", min: 0, unit: "px" },
    minHeight: { type: "number", label: "Smallest it can be dragged to", default: "", min: 0, unit: "px" },
    maxHeight: { type: "number", label: "Largest it can be dragged to, and grow to", default: "", min: 0, unit: "px", help: "Wrapped text makes a row grow up to this height; past it, the text scrolls in the cell." },
    adjustable: Object.assign({ label: "The user can drag its height", help: "Empty: what the grid says (Rows can be dragged)." }, adjustable),
    fit: Object.assign({ label: "Grows to fit wrapped text", help: "Empty: what the grid says. No: the height stays and long text scrolls in the cell." }, adjustable)
};
