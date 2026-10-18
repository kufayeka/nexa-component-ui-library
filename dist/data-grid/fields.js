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

function withoutRange(schema) {
    const out = {};
    Object.keys(schema).forEach((k) => { if (k !== "range") out[k] = Object.assign({}, schema[k], { help: schema[k].help || "For the cells this rule fills; a cell object in the value overrides it." }); });
    return out;
}

/** A populate rule: where it starts, where its value comes from, and how a list is laid down. */
export const POPULATE_SCHEMA = Object.assign({
    at: { type: "string", label: "Starts at", default: "A1", bindable: false, placeholder: "B2", section: "Where", help: "The first cell it fills." },
    direction: { type: "enum", label: "Fill", default: "down", options: [{ value: "down", label: "down" }, { value: "right", label: "to the right" }], style: "segmented", section: "Where", help: "Down: a list goes down the column; a list of rows is a table. To the right: the other way round." },
    limit: { type: "number", label: "At most (cells)", default: "", min: 1, section: "Where", help: "Empty: no limit." },
    enabled: { type: "boolean", label: "Populate", default: true, section: "Where", help: "Off: the rule stays, but fills nothing." },
    value: { type: "tag", access: "read", label: "Value", section: "Data", help: "Where the value comes from: a message (msg.payload), a variable, a tag. A list fills the cells after the first." },
    shape: { type: "enum", label: "Shape of the value", default: "auto", options: [{ value: "auto", label: "automatic" }, { value: "list", label: "a list of values" }, { value: "table", label: "a table (objects are rows)" }, { value: "cells", label: "a list of cell objects" }], style: "select", section: "Data",
        help: "Automatic: a list of objects that all have a value (and nothing but fields of a type or a style) is a list of cells; other objects are the rows of a table; a list of lists is a block. A cell object { value: 12, fill: \"red\" } can stand anywhere and carries its own type and style." },
    header: { type: "boolean", label: "Field names first", default: false, section: "Data", help: "A table: a first row with the field names." },
    fields: { type: "string", label: "Fields", default: "", placeholder: "id, temp, state", section: "Data", help: "A table: which fields, in which order. Empty: all of them, as they appear." }
}, withoutRange(RULE_SCHEMA));

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

/**
 * What a sheet has of its own (the stored keys of one entry of the grid's `sheets`): the name, whether it is shown as a tab, whether it can be edited, its size,
 * its content and its rules. The Edit grid dialog builds its tree from this; the view reads the same keys. The groups are the dialog's.
 */
export const SHEET_PROPS = {
    name: { type: "string", default: "Sheet1", group: "Sheet", label: "Name", bindable: false, help: "The name on the tab, and what a formula writes before an exclamation mark to read this sheet (Sheet2!A1; with a space in the name: 'My data'!A1). Up to 31 characters, none of [ ] : * ? / \\." },
    visible: { type: "boolean", default: true, group: "Sheet", label: "Shown as a tab", help: "Off: the tab is hidden, but formulas can still read the sheet and a message can still switch to it." },
    rows: { type: "number", default: 100, min: 1, max: 1000, group: "Sheet", label: "Rows", help: "Up to 1000." },
    cols: { type: "number", default: 26, min: 1, max: 702, group: "Sheet", label: "Columns", help: "Up to 702 (A … ZZ)." },
    viewArea: { type: "string", default: "", group: "Sheet", label: "Area shown", placeholder: "A1:H20",
        help: "The page shows only this area of the sheet (the headers keep their letters and numbers). Empty: the whole sheet." },
    freezeRows: { type: "number", default: 0, min: 0, group: "Sheet", label: "Frozen rows", help: "The first rows of what is shown stay in place while the rest scrolls." },
    freezeCols: { type: "number", default: 0, min: 0, group: "Sheet", label: "Frozen columns", help: "The first columns stay in place." },
    showHeaders: { type: "boolean", default: true, group: "Display", label: "Show the column letters and row numbers" },
    showGridLines: { type: "boolean", default: true, group: "Display", label: "Show the grid lines" },
    mode: { type: "enum", default: "readonly", group: "Sheet", label: "Mode", style: "segmented", options: [{ value: "readonly", label: "Read only" }, { value: "editable", label: "Editable" }],
        help: "Read only: nothing can be edited, whatever is unlocked. Editable: every cell can be, except the ones a lock rule locks. Bind it to change it while the page runs." },
    colWidth: { type: "number", default: 110, min: 24, unit: "px", group: "Columns", label: "Column width", help: "What a column has when no rule below says otherwise." },
    colRules: { type: "list", default: [], group: "Columns", label: "Column sizes", noun: "column rule", itemLabel: "columns", help: "A width, and the smallest and largest it can be dragged to, for some columns.",
        item: { row: true, fields: COL_RULE_SCHEMA, create: () => ({ columns: "A" }) } },
    adjustCols: { type: "boolean", default: true, group: "Columns", label: "The user can drag the column widths", help: "On the page: drag the line between two letters. What is dragged stays until the page is reloaded. A column rule can say otherwise." },
    minColWidth: { type: "number", default: 30, min: 0, unit: "px", group: "Columns", label: "Smallest a column can be dragged to" },
    maxColWidth: { type: "number", default: 600, min: 0, unit: "px", group: "Columns", label: "Largest a column can be dragged to" },
    rowHeight: { type: "number", default: 28, min: 16, max: 200, unit: "px", group: "Rows", label: "Row height", help: "What a row has when no rule below says otherwise." },
    rowRules: { type: "list", default: [], group: "Rows", label: "Row sizes", noun: "row rule", itemLabel: "rows", help: "A height, the limits, and whether it grows to fit wrapped text, for some rows.",
        item: { row: true, fields: ROW_RULE_SCHEMA, create: () => ({ rows: "1" }) } },
    adjustRows: { type: "boolean", default: true, group: "Rows", label: "The user can drag the row heights", help: "On the page: drag the line between two numbers. A row rule can say otherwise." },
    autoFit: { type: "boolean", default: true, group: "Rows", label: "Rows grow to fit wrapped text", help: "A cell with Wrap text makes its row as tall as the text needs, up to the largest height; past it, the text scrolls in the cell. A row that cannot be adjusted keeps its height." },
    minRowHeight: { type: "number", default: 18, min: 0, unit: "px", group: "Rows", label: "Smallest a row can be dragged to" },
    maxRowHeight: { type: "number", default: 400, min: 0, unit: "px", group: "Rows", label: "Largest a row can be dragged to, and grow to" },
    sortArea: { type: "string", default: "", group: "Sort and find", label: "Area to sort", placeholder: "A1:F200", help: "The columns and rows that are sorted together (a row moves as one). Empty: no sorting." },
    sortHeader: { type: "boolean", default: true, group: "Sort and find", label: "The first row of the area is a heading", help: "A heading stays in place; the rows under it are sorted." },
    populate: { type: "list", default: [], group: "Populate", label: "Populate from messages", noun: "rule", itemLabel: "at",
        help: "A rule takes a value from a message (or a variable, a tag) and puts it in the cells from one cell on: one value, a list down or to the right, a table.",
        item: { row: true, fields: POPULATE_SCHEMA, create: (items) => ({ at: "A1", direction: "down", enabled: true }) } },
    cells: { type: "json", default: {}, group: "Sheet", label: "Cells", hidden: true, noReset: true, bindable: false },
    cellRules: { type: "list", default: [], group: "Sheet", label: "Types and styles", hidden: true, noReset: true, noun: "rule", itemLabel: "range", item: { row: true, fields: RULE_SCHEMA } },
    merges: { type: "list", default: [], group: "Sheet", label: "Merged cells", hidden: true, noReset: true, noun: "merge", item: { type: "string" } },
    borders: { type: "list", default: [], group: "Sheet", label: "Borders", hidden: true, noReset: true, noun: "border rule", itemLabel: "range", item: { row: true, fields: BORDER_SCHEMA } },
    locks: { type: "list", default: [], group: "Editing", label: "Locked / open cells", hidden: true, noReset: true, noun: "lock rule", itemLabel: "range", item: { row: true, fields: LOCK_SCHEMA } },
};
