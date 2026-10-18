// Nexa UI — Data Grid: a sheet, like Excel. Columns are letters (A … Z, AA … ZZ), rows are numbers (up to 1000), a cell has an address (B7). You type in
// the cells, or let a message fill them: a populate rule on a cell takes a value (a message, a variable, a tag) and lays a list down from there, down or
// to the right. A range of cells has a type (text, number, checkbox, choice, date, badge, progress, link, image, button, input) and a style (font, colour,
// fill, alignment); cells can be merged, rows and columns frozen, borders drawn, ranges locked. The live page can show only an area of the sheet, and can let
// the user edit it or not. Only the cells in view are drawn, so 1000 rows scroll as smoothly as ten.
//
// The model is in the files beside this one (address, cell-types, populate, sheet, layout, window, stage, selection): plain functions, tested in Node
// (test/data-grid-pure.test.js). This file is the view: it reads the props, keeps what the user edited, draws the window and handles the user.
import { html, css, nothing, theme } from "../../../nexa-sdk/nexa-component-sdk.js";
import { BASE_CSS, UIElement, PREFIX, part, sizeProp, paletteProp, radiusProp, icon, defineUI } from "../core.js";
import { colName, parseAddress, parseRange, clampRange, addressOf, rangeText, sizeOf } from "./address.js";
import { sortPerm, inversePerm, findMatches, nextMatch } from "./sort.js";
import { displayText, badgePalette, coerceEdit, dateInputValue, toDate, defaultAlign } from "./cell-types.js";
import { expandPopulate, parseFields } from "./populate.js";
import { zipStore } from "../chart/export.js";
import { buildXlsxFiles, cssToArgb, excelSerial, numberFormat } from "./xlsx.js";
import { RULE_FIELDS, cellKey, parseCells, parseRules, fieldsAt, cellSpec, styleCss, populatedCells, valueAt, viewAreaOf, mergesFromProps, rangedFromProps } from "./sheet.js";
import { normalizeFreeze, normalizeMerges, normalizeBorders, buildEdges, boxBorders, normalizeLocks, cellEditable, mergeOf, isCovered } from "./layout.js";
import { uniformAxis, sizesAxis, visibleRange, scrollToShow } from "./window.js";
import { createStage, stageSet, stageValue, stageHas, stageCount, stageClear, stageDrop } from "./stage.js";
import { noSelection, selectCell, extendTo, rangeOf, growToMerges, moveFocus, rangeToTsv } from "./selection.js";
import { RULE_SCHEMA, POPULATE_SCHEMA, BORDER_SCHEMA, LOCK_SCHEMA, COL_RULE_SCHEMA, ROW_RULE_SCHEMA } from "./fields.js";
import { parseColRules, parseRowRules, colSizes, rowSizes, rowSizeAt, clampSize } from "./sizes.js";
import { openGridEditor, summaryOf } from "./editor.js";
import { GRID_MIME, packCells, unpackCells, parseTsv, pasteTargets } from "./clipboard.js";
import { createCalc } from "./calc.js";
import { isFormula, shiftFormula } from "./formula.js";
import { isError, dateToSerial, serialToDate } from "./xlvalue.js";
import { seriesValues, fillTarget } from "./fill.js";
import { rulesFromCells } from "./design.js";

export const CATEGORY_DATA = "UI · Data";

const HEAD_H = 26;                 // the row of column letters
const BAR_H = 28;                  // the formula bar above the sheet (when it is shown)
const MAX_VALUES_IN_EVENT = 400;   // a selection of more cells sends its range only, not its values

const safeUrl = (v) => { const t = String(v === undefined || v === null ? "" : v).trim(); return /^(https?:|mailto:|tel:|\/|\.\/|#|data:image\/)/i.test(t) ? t : ""; };
const safeName = (n) => String(n || "").replace(/[^A-Za-z0-9_-]/g, "");

// a badge in a palette of the theme: its CSS variables (they follow light / dark), with the value in the current mode as the fallback
function paletteStyle(name) {
    const bg = theme.token(`colors.${name}.subtle`), fg = theme.token(`colors.${name}.fg`);
    return `background: var(--nexa-colors-${name}-subtle${bg !== undefined ? ", " + bg : ""}); color: var(--nexa-colors-${name}-fg${fg !== undefined ? ", " + fg : ""})`;
}

const DATA_GRID_CSS = css`
    :host { display: block; width: 100%; height: 100%; min-width: 0; }
    .grid { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--bg); color: var(--fg); border: 1px solid var(--bd); border-radius: var(--r);
        font-size: var(--fs); outline: none; user-select: none; }
    .grid:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
    .grid.nolines .cell { border-right-color: transparent; border-bottom-color: transparent; }
    .pane { position: absolute; overflow: hidden; }
    .pane > .inner { position: absolute; left: 0; top: 0; will-change: transform; }
    .scroller { position: absolute; overflow: auto; overscroll-behavior: contain; }
    .sizer { position: relative; }
    .cell, .head { position: absolute; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; padding: 0 8px; gap: 6px;
        border-right: 1px solid var(--bd); border-bottom: 1px solid var(--bd); background: var(--bg); white-space: nowrap; }
    .cell:hover { background-image: linear-gradient(var(--bg-muted), var(--bg-muted)); background-blend-mode: multiply; }
    .cell.sel::after { content: ""; position: absolute; inset: 0; background: var(--cp-solid, #0f62fe); opacity: 0.14; pointer-events: none; }
    .cell.focus { outline: 2px solid var(--cp-solid, #0f62fe); outline-offset: -2px; z-index: 1; }
    .cell.hatch { background-image: repeating-linear-gradient(135deg, transparent 0 5px, var(--bd) 5px 6px); }
    .cell.dirty::before { content: ""; position: absolute; top: 0; right: 0; border-style: solid; border-width: 0 7px 7px 0; border-color: transparent var(--cp-solid, #0f62fe) transparent transparent; z-index: 2; }
    .cell.pop::before { content: ""; position: absolute; left: 0; top: 0; border-style: solid; border-width: 7px 7px 0 0; border-color: var(--cp-solid, #0f62fe) transparent transparent transparent; z-index: 2; }
    .cell.popbox { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cp-solid, #0f62fe) 45%, transparent); }
    .t { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .num { font-family: var(--mono); font-variant-numeric: tabular-nums; letter-spacing: 0; }
    .err { color: var(--nexa-colors-red-fg, #da1e28); }
    .head { justify-content: center; padding: 0; background: var(--bg-muted); color: var(--fg-muted); font-size: var(--fs-label); letter-spacing: 0.32px; border-color: var(--bd-strong); }
    .head.act { background: var(--bg-emph); color: var(--fg); font-weight: 600; }
    .srt { all: unset; position: absolute; left: 2px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 3px; font-size: 12px; opacity: 0; z-index: 3; }
    .head:hover .srt, .srt.on { opacity: 1; }
    .srt:hover { background: var(--bg-emph); }
    .srt.on { color: var(--cp-solid, #0f62fe); }
    .srt .icon svg { width: 12px; height: 12px; }
    .body { position: absolute; left: 0; right: 0; bottom: 0; }
    .fbar { position: absolute; left: 0; right: 0; top: 0; height: 28px; box-sizing: border-box; display: flex; align-items: center; gap: 6px; padding: 0 6px; border-bottom: 1px solid var(--bd); background: var(--bg-subtle); z-index: 5; }
    .fbar .fa { min-width: 44px; text-align: center; color: var(--fg-muted); font: 12px var(--mono); }
    .fbar .fx { color: var(--fg-muted); font: italic 12px serif; padding: 0 4px; border-left: 1px solid var(--bd); }
    .fbar .fx.on { color: var(--cp-solid); }
    .fbar input { flex: 1 1 auto; min-width: 0; height: 22px; box-sizing: border-box; border: 1px solid var(--bd); border-radius: 3px; background: var(--bg); color: var(--fg); font: 12px var(--mono); padding: 0 6px; outline: none; }
    .fbar input:focus { border-color: var(--ring); }
    .findbar { position: absolute; top: 6px; right: 16px; z-index: 6; display: flex; align-items: center; gap: 4px; background: var(--panel); border: 1px solid var(--bd-strong); border-radius: var(--r); padding: 4px 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); font-size: 12px; }
    .findbar input[type="text"] { width: 150px; height: 24px; box-sizing: border-box; border: none; border-bottom: 1px solid var(--bd-strong); background: var(--bg-subtle); color: var(--fg); font: inherit; padding: 0 6px; outline: none; }
    .findbar button { all: unset; cursor: pointer; padding: 2px 7px; border-radius: 3px; border: 1px solid var(--bd); }
    .findbar button:hover { background: var(--bg-emph); }
    .findbar .fc { min-width: 46px; text-align: center; color: var(--fg-muted); }
    .findbar label { display: inline-flex; align-items: center; gap: 2px; cursor: pointer; }
    .cell.found { box-shadow: inset 0 0 0 2px #f1c21b; }
    .cell.foundcur { box-shadow: inset 0 0 0 2px #ff832b; background-image: linear-gradient(rgba(255,131,43,0.18), rgba(255,131,43,0.18)); }
    .xl { all: unset; cursor: pointer; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; color: var(--fg-muted); }
    .xl:hover { background: var(--bg-emph); color: var(--fg); }
    .rz { position: absolute; z-index: 3; }
    .rz-c { top: 0; right: 0; width: 6px; height: 100%; cursor: col-resize; }
    .rz-r { left: 0; bottom: 0; height: 6px; width: 100%; cursor: row-resize; }
    .rz:hover { background: var(--cp-solid, #0f62fe); opacity: 0.5; }
    .cell.wrap { overflow-y: auto; }
    /* a field in the cell (being typed in, or an input cell) is as big as the cell: the cell's own padding would leave a frame round it */
    .cell.field { padding: 0; gap: 0; }
    .cell.field > .ed, .cell.field > .in { flex: 1 1 auto; width: 100%; min-width: 0; height: 100%; }
    .fillh { position: absolute; right: 0; bottom: 0; width: 8px; height: 8px; background: var(--cp-solid, #0f62fe); border: 1px solid var(--bg); cursor: crosshair; z-index: 4; box-sizing: border-box; }
    .cell.fillp { outline: 1px dashed var(--cp-solid, #0f62fe); outline-offset: -1px; background-image: linear-gradient(color-mix(in srgb, var(--cp-solid, #0f62fe) 10%, transparent), color-mix(in srgb, var(--cp-solid, #0f62fe) 10%, transparent)); }
    textarea.ed { resize: none; padding: 4px 6px; line-height: 1.25; font: inherit; }
    .head.corner { background: var(--bg-muted); }
    .cb { width: 16px; height: 16px; box-sizing: border-box; border: 1px solid var(--bd-strong); border-radius: 2px; display: inline-flex; align-items: center; justify-content: center; background: var(--bg); color: var(--fg); flex: 0 0 auto; }
    .cb.on { background: var(--cp-solid, #0f62fe); border-color: var(--cp-solid, #0f62fe); color: var(--cp-contrast, #fff); }
    .cb .icon svg { width: 12px; height: 12px; }
    .badge { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 10px; font-size: 12px; background: var(--cp-subtle, #d0e2ff); color: var(--cp-fg, #0043ce); }
    .bar { flex: 1 1 auto; height: 6px; border-radius: 3px; background: var(--bg-emph); overflow: hidden; min-width: 20px; }
    .bar > i { display: block; height: 100%; background: var(--cp-solid, #0f62fe); }
    .pct { font-family: var(--mono); font-size: 12px; color: var(--fg-muted); min-width: 34px; text-align: right; }
    a.lnk { color: var(--cp-fg, #0f62fe); text-decoration: underline; overflow: hidden; text-overflow: ellipsis; }
    img.pic { max-width: 100%; max-height: calc(100% - 4px); object-fit: contain; }
    .btn { all: unset; box-sizing: border-box; height: calc(100% - 8px); max-height: 28px; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
        background: var(--cp-solid, #0f62fe); color: var(--cp-contrast, #fff); border-radius: var(--r); font-size: 12px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
    .btn:hover { filter: brightness(1.1); }
    .btn:focus-visible { outline: 2px solid var(--ring); outline-offset: 1px; }
    .in, .ed { box-sizing: border-box; width: 100%; height: 100%; border: none; background: var(--bg-subtle); color: inherit; font: inherit; padding: 0 6px; outline: none; border-bottom: 1px solid var(--bd-strong); }
    .ed { background: var(--bg); color: var(--fg); box-shadow: inset 0 0 0 2px var(--ring); border-bottom: none; }
    .in[readonly] { background: transparent; border-bottom-color: transparent; }
    .staged { position: absolute; right: 8px; bottom: 8px; z-index: 5; display: flex; gap: 6px; align-items: center; background: var(--panel); border: 1px solid var(--bd); border-radius: var(--r); padding: 4px 8px; font-size: 12px; }
    .staged button { all: unset; cursor: pointer; padding: 2px 10px; border-radius: var(--r); background: var(--cp-solid, #0f62fe); color: var(--cp-contrast, #fff); }
    .staged button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--bd-strong); }
`;

export const dataGrid = defineUI({
    id: PREFIX + "data-grid",
    label: "Data Grid",
    category: CATEGORY_DATA,
    icon: "fa fa-th",
    size: { w: 640, h: 360 },
    capabilities: { resizable: true, rotatable: false, flippable: false, lockable: true },
    help: "A sheet like Excel: columns A…ZZ, rows 1…1000, cells with addresses. Type in the cells, or let a message fill them (a populate rule lays a list down from a cell). Types and styles per range of cells, merged cells, frozen rows and columns, borders, locks; the live page can show one area and let the user edit or not. Only the cells in view are drawn.",
    version: 1,
    css: "",
    groups: ["Sheet", "Columns", "Rows", "Populate", "Sort and find", "Editing", "Display", "Style"],
    properties: {
        editGrid: { type: "action", group: "Sheet", label: "Edit grid",
            info: (p) => summaryOf(p),
            help: "Opens the sheet with a toolbar and the property tree: select cells and type in them, merge, freeze, lock, draw borders, give ranges a type and a style, set up the populate rules. Nothing changes until Apply.",
            buttons: [{ label: "Edit grid…", icon: "fa fa-table", title: "Type in the cells and design the sheet", run: (p, api) => openGridEditor(p, api) }] },
        rows: { type: "number", default: 100, min: 1, max: 1000, group: "Sheet", label: "Rows", help: "Up to 1000." },
        cols: { type: "number", default: 26, min: 1, max: 702, group: "Sheet", label: "Columns", help: "Up to 702 (A … ZZ)." },
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
        viewArea: { type: "string", default: "", group: "Sheet", label: "Area shown", placeholder: "A1:H20",
            help: "The page shows only this area of the sheet (the headers keep their letters and numbers). Empty: the whole sheet." },
        freezeRows: { type: "number", default: 0, min: 0, group: "Sheet", label: "Frozen rows", help: "The first rows of what is shown stay in place while the rest scrolls." },
        freezeCols: { type: "number", default: 0, min: 0, group: "Sheet", label: "Frozen columns", help: "The first columns stay in place." },
        sortable: { type: "boolean", default: true, group: "Sort and find", label: "The user can sort (on the page)", help: "A small button on the letter of each column of the area to sort: ascending, descending, back to the order of the sheet. Only the view is sorted: the cells keep their addresses, and a message still fills the cell it was meant for." },
        sortArea: { type: "string", default: "", group: "Sort and find", label: "Area to sort", placeholder: "A1:F200", help: "The columns and rows that are sorted together (a row moves as one). Empty: no sorting." },
        sortHeader: { type: "boolean", default: true, group: "Sort and find", label: "The first row of the area is a heading", help: "A heading stays in place; the rows under it are sorted." },
        exportable: { type: "boolean", default: false, group: "Sort and find", label: "A button in the corner exports to Excel (.xlsx)", help: "On the page, the corner where the letters and the numbers meet downloads the sheet as an .xlsx file. The action Export to Excel does the same from Logic." },
        findable: { type: "boolean", default: true, group: "Sort and find", label: "Ctrl+F finds in the sheet", help: "A search box over the grid: the cells that hold the text are marked, Enter goes to the next one." },
        populate: { type: "list", default: [], group: "Populate", label: "Populate from messages", noun: "rule", itemLabel: "at",
            help: "A rule takes a value from a message (or a variable, a tag) and puts it in the cells from one cell on: one value, a list down or to the right, a table.",
            item: { row: true, fields: POPULATE_SCHEMA, create: (items) => ({ at: "A1", direction: "down", enabled: true }) } },
        mode: { type: "enum", default: "readonly", group: "Editing", label: "Mode", style: "segmented", options: [{ value: "readonly", label: "Read only" }, { value: "editable", label: "Editable" }],
            help: "Read only: nothing can be edited, whatever is unlocked. Editable: every cell can be, except the ones a lock rule locks. Bind it to change it while the page runs." },
        saveMode: { type: "enum", default: "instant", group: "Editing", label: "Saving", style: "select",
            options: [{ value: "instant", label: "At once: Enter saves the cell" }, { value: "bar", label: "A small box with Save and Discard" }, { value: "message", label: "When a message says (the action Save)" }],
            help: "What the user types is told to Logic with On Cell Change in every mode. On Save is the one that means \"keep this\": at once, after each cell (a paste or a fill: once, with all its cells); with the box, when the user presses Save; with a message, when the action Save arrives (the action Discard throws the waiting changes away). In the last two the changed cells wait, marked in the corner, and what the user types stays in the page until it is reloaded." },
        showHeaders: { type: "boolean", default: true, group: "Display", label: "Show the column letters and row numbers" },
        showGridLines: { type: "boolean", default: true, group: "Display", label: "Show the grid lines" },
        showFormulaBar: { type: "boolean", default: false, group: "Display", label: "Show the formula bar", help: "A line above the sheet with the address of the selected cell and what is in it: the formula as it was written, or the value. Typing in it edits the cell (Enter keeps it)." },
        selection: { type: "enum", default: "range", group: "Display", label: "Selection", style: "segmented", options: [{ value: "none", label: "None" }, { value: "cell", label: "Cell" }, { value: "range", label: "Range" }] },
        // what the Edit grid dialog edits: no row of the inspector each, they are in the dialog
        cells: { type: "json", default: {}, group: "Sheet", label: "Cells", hidden: true, noReset: true, bindable: false },
        cellRules: { type: "list", default: [], group: "Sheet", label: "Types and styles", hidden: true, noReset: true, noun: "rule", itemLabel: "range", item: { row: true, fields: RULE_SCHEMA } },
        merges: { type: "list", default: [], group: "Sheet", label: "Merged cells", hidden: true, noReset: true, noun: "merge", item: { type: "string" } },
        borders: { type: "list", default: [], group: "Sheet", label: "Borders", hidden: true, noReset: true, noun: "border rule", itemLabel: "range", item: { row: true, fields: BORDER_SCHEMA } },
        locks: { type: "list", default: [], group: "Editing", label: "Locked / open cells", hidden: true, noReset: true, noun: "lock rule", itemLabel: "range", item: { row: true, fields: LOCK_SCHEMA } },
        size: sizeProp("md"),
        colorPalette: paletteProp(),
        radius: radiusProp("md")
    },
    events: {
        cellChange: { label: "On Cell Change (the user edited a cell)", payload: { address: "string", old: "any", new: "any", staged: "boolean" } },
        save: { label: "On Save (the cells to keep: at once, with the box's Save, or the action Save)", payload: { cells: "array" } },
        discard: { label: "On Discard (the waiting changes were thrown away)", payload: { count: "number" } },
        selectionChange: { label: "On Selection Change", payload: { range: "string", address: "string", values: "array" } },
        cellClick: { label: "On Cell Click", payload: { address: "string", value: "any" } },
        buttonClick: { label: "On Button Click", payload: { address: "string", action: "string", value: "any" } },
        sortChange: { label: "On Sort Change (the user sorted a column)", payload: { column: "string", direction: "string" } },
        columnResize: { label: "On Column Resize (the user dragged a width)", payload: { columns: "array", width: "number" } },
        rowResize: { label: "On Row Resize (the user dragged a height)", payload: { rows: "array", height: "number" } },
        data: { label: "On Data (after Get data)", payload: { cells: "object", range: "string" } }
    },
    actions: {
        setCell: { label: "Set one cell", help: "Puts a value in a cell, as if the user had typed it, but without an event. It lasts until the page is reloaded.", example: "{ address: \"B2\", value: 42 }" },
        setRange: { label: "Fill cells from a cell on", help: "Lays a value down from a cell, like a populate rule: a list down or to the right, a list of lists as a block, a list of objects as a table. An element can be a cell object { value, fill, type, ... } that carries its own type and style.", example: "{ at: \"B2\", values: [[1, { value: 2, fill: \"red\" }], [3, 4]], direction: \"down\" }" },
        clearRange: { label: "Empty cells", help: "Empties the cells of a range.", example: "\"B2:D9\"  or  { range: \"B2:D9\" }" },
        selectCell: { label: "Select a cell", help: "Selects a cell by its address.", example: "\"C5\"  or  { address: \"C5\" }" },
        scrollToCell: { label: "Scroll to a cell", help: "Brings a cell into view.", example: "\"C500\"  or  { address: \"C500\" }" },
        exportXlsx: { label: "Export to Excel (.xlsx)", help: "Downloads the sheet as an .xlsx file: values, number formats, fonts, colours, alignment, borders, merged cells, column widths, row heights, frozen panes. What the view shows (the order of a sorted column, the area shown) is what is exported.", example: "{ name: \"plant.xlsx\" }" },
        sortColumn: { label: "Sort a column of the area to sort", help: "Sorts the view by a column; direction \"asc\", \"desc\", or \"\" for the order of the sheet.", example: "{ column: \"B\", direction: \"desc\" }" },
        save: { label: "Save the staged edits", help: "With the box or by message: sends the changed cells (On Save) and makes the changes final." },
        discard: { label: "Discard the staged edits", help: "With the box or by message: throws the waiting changes away." },
        getData: { label: "Send all the values out", help: "Fires On Data with every cell that has a value, by address." }
    },
    parts: {
        root: part("Grid", "root"), header: part("Column letter / row number", "header"), cell: part("Cell", "cell"), button: part("Button in a cell", "button"), badge: part("Badge in a cell", "badge")
    },
    view: class extends UIElement {
        static styles = [BASE_CSS, DATA_GRID_CSS];

        // The host calls propsChanged() while the base constructor runs, and the field initialisers below run after it, so what that first call set would be
        // reset. _prepare() is therefore also called from render(), and it only does work when the props are a new object.
        _stage = createStage();
        _edits = new Map();         // what the user typed on the page: "r,c" -> value (kept until the page is reloaded, or a message fills the cell)
        _cells = new Map();         // what was typed in the design
        _populated = { map: new Map(), styles: new Map(), blocks: [] };
        _popConfig = "";
        _popValues = [];
        _rules = [];
        _merges = [];
        _edges = { h: new Map(), v: new Map() };
        _locks = [];
        _freeze = { rows: 0, cols: 0 };
        _size = { rows: 100, cols: 26 };
        _area = { r1: 0, c1: 0, r2: 99, c2: 25 };
        _geo = null;
        _scroll = { left: 0, top: 0 };
        _sbw = 0;
        _sbh = 0;
        _sel = noSelection();
        _selSig = "";
        _selRange = null;
        _edit = null;               // { r, c, text } while a cell is being edited
        _dragging = "";             // "" | "cells" | "cols" | "rows"
        _preparedFor = null;
        _focusEdit = false;
        _colSz = [];                // every column's size by the rules: { width, min, max, adjustable }
        _rowSz = new Map();         // the rows a rule talks about: { height, min, max, adjustable, fit }
        _sizeEdits = { cols: new Map(), rows: new Map() };   // what the user dragged on the page: column -> width, row -> height
        _resize = null;             // { kind, indexes, x, y, start, min, max } while a line between two headers is dragged
        _fit = new Map();           // row -> the height its wrapped text needs
        _fitSig = "";
        _dataVersion = 0;           // grows when the values or the sizes change: the heights that fit the text are measured again
        _calcCache = null;          // the calculator of the formulas, made again when the data changed or the clock ticked (NOW, TODAY)
        _calcKey = "";
        _tick = 0;
        _tickOn = false;
        _editFit = null;            // { r, h }: the row of the cell being typed in grows with the text
        _measure = null;
        _fill = null;               // { source, plan } while the fill handle is dragged
        _actionStyles = new Map();  // "r,c" -> the type / style fields a cell object of the action Fill cells set
        _sortArea = null;           // the rows under the heading and the columns of the area to sort: { r1, r2, c1, c2 }
        _sortState = null;          // what the user chose: { c, dir }
        _perm = null;               // the rows of the area in the order shown: the place i of the view shows the row perm[i] of the area
        _inv = null;
        _permSig = "";
        _sortVersion = 0;           // grows when the props or a message change what is sorted (not when the user edits a cell: a row does not jump while it is typed in)
        _find = { open: false, text: "", cs: false, at: -1, focus: false };
        _matches = [];
        _matchSet = new Set();
        _matchSig = "";

        propsChanged() { this._prepare(); }

        mounted() {
            // one listener for the whole life of the grid: a drag that ends outside the grid still ends
            this.listen(window, "mouseup", (e) => { this._dragging = ""; if (this._resize) this._endResize(); if (this._fill) this._endFill(e); });
            this.listen(window, "mousemove", (e) => this._dragResize(e));
        }

        // ---- reading the props -----------------------------------------------------------------------------------
        _prepare() {
            const p = this.p || {};
            if (p === this._preparedFor) return;
            this._preparedFor = p;
            const size = this._size = sizeOf(p.rows, p.cols);
            const area = this._area = viewAreaOf(p.viewArea, size.rows, size.cols);
            this._cells = parseCells(p.cells, size.rows, size.cols);
            this._rules = parseRules(p.cellRules, size.rows, size.cols);
            this._prepareLayout(p, size, area);
            const d = this._sizeDefaults(p);
            this._colSz = colSizes(parseColRules(p.colRules, size.cols), size.cols, d.col);
            this._rowSz = rowSizes(parseRowRules(p.rowRules, size.rows), d.row);
            this._preparePopulate(p, size);
            const g = clampRange(parseRange(p.sortArea), size.rows, size.cols);
            const head = p.sortHeader !== false ? 1 : 0;
            this._sortArea = g && g.r2 - g.r1 + 1 > head ? { r1: g.r1 + head, r2: g.r2, c1: g.c1, c2: g.c2 } : null;
            if (!this._sortArea || p.sortable === false || (this._sortState && (this._sortState.c < this._sortArea.c1 || this._sortState.c > this._sortArea.c2))) this._sortState = null;
            this._sortVersion++;
            this._dataVersion++;
        }

        // the order of the rows of the area to sort, made again when the props, a message or the user's choice changed it
        _ensurePerm() {
            const a = this._sortArea, s = this._sortState;
            const sig = a && s ? [a.r1, a.r2, a.c1, a.c2, s.c, s.dir, this._sortVersion].join() : "";
            if (sig === this._permSig) return;
            this._permSig = sig;
            if (!sig) { this._perm = null; this._inv = null; return; }
            this._perm = sortPerm(a.r2 - a.r1 + 1, (i) => this._atSource(a.r1 + i, s.c), s.dir);
            this._inv = inversePerm(this._perm);
        }

        // the row of the sheet a cell of the view shows (the same one when nothing is sorted) and, the other way, where the view shows a row of the sheet
        _src(r, c) { const a = this._sortArea; return this._perm && r >= a.r1 && r <= a.r2 && c >= a.c1 && c <= a.c2 ? a.r1 + this._perm[r - a.r1] : r; }
        _disp(r, c) { const a = this._sortArea; return this._inv && r >= a.r1 && r <= a.r2 && c >= a.c1 && c <= a.c2 ? a.r1 + this._inv[r - a.r1] : r; }
        // the address Logic is told: the cell's own, whatever place the view shows it at
        _addr(r, c) { return addressOf(this._src(r, c), c); }

        // what a column or a row has when no rule says otherwise: the grid's own settings
        _sizeDefaults(p) {
            const n = (v, d) => (v === "" || v === null || v === undefined || !isFinite(Number(v)) ? d : Number(v));
            return {
                col: { width: n(p.colWidth, 110), min: n(p.minColWidth, 30), max: n(p.maxColWidth, 600), adjustable: p.adjustCols !== false },
                row: { height: n(p.rowHeight, 28), min: n(p.minRowHeight, 18), max: n(p.maxRowHeight, 400), adjustable: p.adjustRows !== false, fit: p.autoFit !== false }
            };
        }

        // the width of column c now: what the user dragged, else the rules'
        _widthOf(c) { const rt = this._sizeEdits.cols.get(c); return rt !== undefined ? rt : this._colSz[c] ? this._colSz[c].width : 110; }

        // the height of row r now: what the user dragged, else the rules' (and, for a row that fits its text, what the text needs), the row being typed in
        _heightOf(r, dd) {
            const rt = this._sizeEdits.rows.get(r);
            if (rt !== undefined) return rt;
            const s = rowSizeAt(this._rowSz, r, dd.row);
            let h = s.height;
            const need = s.fit && s.adjustable ? this._fit.get(r) : undefined;
            if (need !== undefined) h = Math.max(h, need);
            if (this._editFit && this._editFit.r === r && s.fit && s.adjustable) h = Math.max(h, this._editFit.h);
            return clampSize(h, s.min, s.max);
        }

        _prepareLayout(p, size, area) {
            const nR = area.r2 - area.r1 + 1, nC = area.c2 - area.c1 + 1;
            this._freeze = normalizeFreeze(p.freezeRows, p.freezeCols, nR, nC);
            // a merge cannot run through the line of a frozen row / column; the line is where the scrolling part of what is shown begins
            const line = { rows: area.r1 + this._freeze.rows, cols: area.c1 + this._freeze.cols };
            this._merges = normalizeMerges(mergesFromProps(p.merges), size.rows, size.cols, line).merges;
            this._edges = buildEdges(normalizeBorders(rangedFromProps(p.borders)));
            this._locks = normalizeLocks(rangedFromProps(p.locks));
        }

        // The populate rules put values in the sheet. A new message gives new values: they cover what the user typed on the page in the cells they fill.
        _preparePopulate(p, size) {
            const items = Array.isArray(p.populate) ? p.populate : [];
            const config = JSON.stringify(items.map((i) => Object.keys(i).filter((k) => k !== "value").sort().map((k) => [k, i[k]]))) + "|" + size.rows + "," + size.cols;
            const same = config === this._popConfig && items.length === this._popValues.length && items.every((i, k) => i.value === this._popValues[k]);
            if (same) return;
            this._popConfig = config;
            this._popValues = items.map((i) => i.value);
            this._populated = populatedCells(items, size.rows, size.cols);
            this._populated.map.forEach((v, k) => { this._edits.delete(k); this._actionStyles.delete(k); stageDrop(this._stage, k); });
        }

        _mode() { return (this.p || {}).mode === "editable" ? "editable" : "readonly"; }
        // changes wait (marked, not yet saved) with the small box and with the message; at once, they do not
        _staged() { const m = (this.p || {}).saveMode; return m === "bar" || m === "message"; }
        _designing() { return this.isEditor && this.hasAttribute("data-interactive"); }

        _layers() { return { cells: this._cells, populated: this._populated.map, edits: this._edits }; }
        _baseValue(r, c) { return valueAt(this._layers(), this._src(r, c), c); }
        // What is stored in a cell of the sheet (r, c count in the sheet, not in the sorted view): a number, a text, a boolean, nothing. A formula is stored as its text ("=A1+2").
        _rawAt(r, c) { return stageValue(this._stage, cellKey(r, c), "v", valueAt(this._layers(), r, c)); }
        _raw(r, c) { return this._rawAt(this._src(r, c), c); }
        // The formula a cell holds, or null. What a message populated is data and never a formula, even when it starts with "="; what was typed, set by an action or designed is.
        _formulaAt(r, c) {
            const raw = this._rawAt(r, c);
            if (!isFormula(raw)) return null;
            const k = cellKey(r, c);
            if (!stageHas(this._stage, k, "v") && !this._edits.has(k) && this._populated.map.has(k)) return null;
            return raw;
        }
        _formula(r, c) { return this._formulaAt(this._src(r, c), c); }
        // The calculator of this state of the data. Each cell is worked out once and only when it is asked for.
        _calc() {
            const key = this._dataVersion + "|" + this._tick;
            if (this._calcCache && this._calcKey === key) return this._calcCache;
            this._calcKey = key;
            const size = this._size;
            return (this._calcCache = createCalc((r, c) => this._rawAt(r, c), {
                now: new Date(), rows: size.rows, cols: size.cols,
                formulaAt: (r, c) => this._formulaAt(r, c) !== null,
                coerce: (r, c, raw) => this._forFormula(r, c, raw)
            }));
        }
        // What a formula sees in a plain cell: a date-typed cell is a serial number (as in Excel), a boolean-typed one a boolean
        _forFormula(r, c, raw) {
            if (raw === null || raw === undefined || raw === "") return raw;
            const k = cellKey(r, c);
            const type = Object.assign({}, fieldsAt(this._rules, r, c), this._populated.styles.get(k), this._actionStyles.get(k)).type;
            if (type === "date") { const d = toDate(raw); return d ? dateToSerial(d) : raw; }
            if (type === "boolean") return raw === true || raw === "true" || raw === 1;
            return raw;
        }
        // The value of a cell of the sheet: a formula worked out (an error stays an error value), anything else as stored
        _atSource(r, c) { return this._formulaAt(r, c) !== null ? this._calc().value(r, c) : this._rawAt(r, c); }
        // The value of a cell of the view, as Logic is told it (an error as its text, "#DIV/0!")
        _value(r, c) { const v = this._atSource(this._src(r, c), c); return isError(v) ? v.code : v; }
        // The value of a cell of the view as it is drawn: the result of a formula fits the cell's type (a serial number in a date cell is a date; TRUE in a general cell is the word)
        _shown(r, c, spec) {
            if (this._formula(r, c) === null) return this._raw(r, c);
            const v = this._atSource(this._src(r, c), c);
            if (isError(v)) return v;
            if (typeof v === "number" && spec.type === "date") return serialToDate(v);
            if (typeof v === "boolean" && (spec.type === "general" || spec.type === "text")) return v ? "TRUE" : "FALSE";
            return v;
        }
        _errorTip(err) {
            return { "#DIV/0!": "Division by zero", "#VALUE!": "A value of the wrong kind", "#REF!": "A cell that does not exist", "#NAME?": "A function or a word the grid does not know, or a formula that cannot be read",
                "#N/A": "Nothing found", "#NUM!": "A number that cannot be", "#CYCLE!": "The formula depends on itself" }[err.code] || err.code;
        }
        // NOW() and TODAY() change with time: while a cell on show holds one, the formulas are worked out again every second
        _keepTime() {
            if (this._tickOn || !this._calcCache || !this._calcCache.volatile) return;
            this._tickOn = true;
            this.after(1000, () => {
                this._tickOn = false;
                if (this._calcCache && this._calcCache.volatile) { this._tick++; this.requestUpdate(); }
            });
        }
        // The text a cell shows (what is copied, searched and measured)
        _text(r, c) {
            const spec = cellSpec(this._fields(r, c)), v = this._shown(r, c, spec);
            return isError(v) ? v.code : displayText(spec, v);
        }
        // the type and the style of a cell, from the lowest layer to the highest: the rules of its ranges; what a populate rule gives the cells it fills, and over it
        // what a cell object of the message says; what the action Fill cells set. The last two belong to the data, so they follow it when the view is sorted.
        _fields(r, c) {
            const base = fieldsAt(this._rules, r, c);
            const k = cellKey(this._src(r, c), c);
            const populated = this._populated.styles.get(k), set = this._actionStyles.get(k);
            return populated || set ? Object.assign({}, base, populated, set) : base;
        }
        _locked(r, c) { return !cellEditable(this._mode(), this._locks, r, c); }
        // the Edit grid dialog types into every cell (it designs the content); a page types where the mode and the locks allow, never into a button
        _editable(r, c) {
            if (this._fields(r, c).type === "button") return false;
            return this._designing() ? true : cellEditable(this._mode(), this._locks, r, c);
        }

        // ---- geometry -------------------------------------------------------------------------------------------
        _geometry() {
            const p = this.p || {};
            const area = this._area;
            const nR = area.r2 - area.r1 + 1, nC = area.c2 - area.c1 + 1;
            const dd = this._sizeDefaults(p);
            const rh = clampSize(dd.row.height, dd.row.min, dd.row.max);
            const rowOver = {};
            for (let i = 0; i < nR; i++) { const h = this._heightOf(area.r1 + i, dd); if (h !== rh) rowOver[i] = h; }
            const widths = [];
            for (let c = area.c1; c <= area.c2; c++) widths.push(this._widthOf(c));
            const heads = p.showHeaders !== false;
            const hh = heads ? HEAD_H : 0;
            const rn = heads ? 1 : 0;
            const rowHeadW = heads ? Math.max(38, 14 + 8 * String(area.r2 + 1).length) : 0;
            const colAxis = sizesAxis((rn ? [rowHeadW] : []).concat(widths));
            const rowAxis = uniformAxis(nR, rh, rowOver);
            const F = this._freeze.rows, FC = this._freeze.cols + rn;
            const frozenW = colAxis.offsetOf(FC), frozenRowsH = rowAxis.offsetOf(F);
            const W = Math.max(this.size.w || this.clientWidth || 0, 0), H = Math.max(this.size.h || this.clientHeight || 0, 0);
            const bar = p.showFormulaBar === true ? BAR_H : 0;
            const inW = Math.max(0, W - 2), inH = Math.max(0, H - 2 - bar);                 // inside the border, under the formula bar
            const topH = hh + frozenRowsH;
            const viewW = Math.max(0, inW - frozenW - this._sbw), viewH = Math.max(0, inH - topH - this._sbh);
            const rows = visibleRange(rowAxis, this._scroll.top, viewH, 4, F);
            const cols = visibleRange(colAxis, this._scroll.left, viewW, 1, FC);
            return { rh, hh, heads, rn, rowHeadW, colAxis, rowAxis, F, FC, nR, nC, frozenW, frozenRowsH, topH, viewW, viewH, rows, cols,
                scrollW: Math.max(0, colAxis.total - frozenW), scrollH: Math.max(0, rowAxis.total - frozenRowsH) };
        }

        // the box of sheet cells r..r2 x c..c2 inside a pane whose origin is (originLeft, originTop) in the axes' own units
        _cellBox(g, r, c, r2, c2, originLeft, originTop) {
            const a = this._area;
            const i = r - a.r1, i2 = r2 - a.r1, j = c - a.c1, j2 = c2 - a.c1;
            const x = g.colAxis.offsetOf(j + g.rn), x2 = g.colAxis.offsetOf(j2 + g.rn + 1);
            const y = g.rowAxis.offsetOf(i), y2 = g.rowAxis.offsetOf(i2 + 1);
            return { left: x - originLeft, top: y - originTop, width: x2 - x, height: y2 - y };
        }

        // ---- drawing ----------------------------------------------------------------------------------------------
        _content(spec, value, r, c, editable, fields) {
            const ed = this._edit && this._edit.r === r && this._edit.c === c;
            if (ed) {
                const date = spec.type === "date" && !this._edit.formula;
                if (spec.type === "select" && spec.options.length && !this._edit.formula) {
                    return html`<select class="ed" data-edit @change=${this._onEditChange}>${spec.options.map((o) => html`<option value=${o.value} ?selected=${String(value) === o.value}>${o.label}</option>`)}</select>`;
                }
                // a wrapped cell is typed in a text area: Enter is a new line, and the row grows with the text
                if (fields && fields.wrap === true && !date) return html`<textarea class="ed" data-edit .value=${this._edit.text} @input=${this._onEditInput}></textarea>`;
                return html`<input class="ed" data-edit type=${date ? (spec.format === "date" ? "date" : "datetime-local") : "text"} .value=${date ? dateInputValue(spec, value) : this._edit.text} @input=${this._onEditInput}>`;
            }
            // a formula that went wrong shows its error, whatever the type of the cell
            if (isError(value)) return html`<span class="t err" title=${this._errorTip(value)}>${value.code}</span>`;
            switch (spec.type) {
                case "boolean": {
                    const on = value === true || value === "true" || value === 1;
                    return html`<span class="cb ${on ? "on" : ""}" data-act="toggle" role="checkbox" aria-checked=${on ? "true" : "false"}>${on ? icon("check") : nothing}</span>`;
                }
                case "badge": {
                    const pal = safeName(badgePalette(spec, value));
                    const text = displayText(spec, value);
                    return text === "" ? nothing : html`<span class="badge" part="badge" style=${pal ? paletteStyle(pal) : ""}>${text}</span>`;
                }
                case "progress": {
                    const n = Number(value);
                    if (value === null || value === undefined || value === "" || !isFinite(n)) return html`<span class="t"></span>`;
                    const pct = Math.max(0, Math.min(100, (n / spec.max) * 100));
                    return html`<div class="bar"><i style="width:${pct}%"></i></div><span class="pct">${Math.round(pct)}%</span>`;
                }
                case "link": {
                    const href = safeUrl(value);
                    return value === null || value === undefined || value === "" ? nothing : href
                        ? html`<a class="lnk" data-act="link" href=${href} target="_blank" rel="noopener noreferrer">${String(value)}</a>` : html`<span class="t">${String(value)}</span>`;
                }
                case "image": {
                    const src = safeUrl(value);
                    return src ? html`<img class="pic" src=${src} loading="lazy" alt="">` : nothing;
                }
                case "button":
                    return html`<button class="btn" part="button" data-act="button" type="button" tabindex="-1">${spec.buttonLabel || displayText(spec, value) || "Button"}</button>`;
                case "input":
                    return html`<input class="in" data-act="input" .value=${value === null || value === undefined ? "" : String(value)} ?readonly=${!editable} tabindex="-1">`;
                default:
                    return html`<span class="t ${spec.type === "number" ? "num" : ""}">${displayText(spec, value)}</span>`;
            }
        }

        _cell(g, r, c, box, merge, blockIds) {
            const fields = this._fields(r, c);
            const spec = cellSpec(fields);
            const value = this._shown(r, c, spec);
            const editable = this._editable(r, c);
            const range = this._selRange;
            const inSel = !!range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
            const f = this._sel.focus;
            const focus = !!f && f.r === r && f.c === c;
            const area = this._area;
            const r2 = merge ? merge.r2 : r, c2 = merge ? merge.c2 : c;
            const b = boxBorders(this._edges, r, c, r2, c2, area.r2 + 1, area.c2 + 1);
            const style = `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;` + styleCss(fields, spec.type) + ";"
                + Object.keys(b).map((k) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()) + ":" + b[k]).join(";");
            const key = cellKey(r, c);
            const dirty = stageHas(this._stage, cellKey(this._src(r, c), c), "v");
            const found = this._find.open && this._matchSet.has(key) ? (this._matches[this._find.at] && this._matches[this._find.at].r === r && this._matches[this._find.at].c === c ? "foundcur" : "found") : "";
            const hatch = this.isEditor && this._mode() === "editable" && this._locked(r, c);
            const anchor = this.isEditor && this._populateAt && this._populateAt.has(key);
            const lastR = merge ? merge.r2 : r, lastC = merge ? merge.c2 : c;
            const handle = !!range && lastR === range.r2 && lastC === range.c2 && this._canFill();
            const plan = this._fill && this._fill.plan ? this._fill.plan.target : null;
            const planned = !!plan && r >= plan.r1 && r <= plan.r2 && c >= plan.c1 && c <= plan.c2;
            const cls = ["cell", inSel ? "sel" : "", planned ? "fillp" : "", found, focus ? "focus" : "", hatch ? "hatch" : "", dirty ? "dirty" : "", anchor ? "pop" : "", fields.wrap === true ? "wrap" : "", (this._edit && this._edit.r === r && this._edit.c === c) || spec.type === "input" ? "field" : ""].filter(Boolean).join(" ");
            return html`<div class=${cls} part="cell" data-r=${r} data-c=${c} style=${style} title=${anchor ? "Populated from a message: " + this._populateAt.get(key) : nothing}>${this._content(spec, value, r, c, editable, fields)}${handle ? html`<div class="fillh" data-fill title="Drag to fill down or across (Ctrl: copy as it is)"></div>` : nothing}</div>`;
        }

        _colHead(g, c, left) {
            const range = this._selRange;
            const act = !!range && c >= range.c1 && c <= range.c2;
            const w = g.colAxis.sizeOf(c - this._area.c1 + g.rn);
            return html`<div class="head ${act ? "act" : ""}" part="header" data-hc=${c} style="left:${left}px;top:0;width:${w}px;height:${g.hh}px">${colName(c)}${this._sortButton(c)}${this._canAdjust("c", c) ? html`<div class="rz rz-c" data-rz="c" data-i=${c} title="Drag to change the width; double-click to fit the content"></div>` : nothing}</div>`;
        }

        // the button on the letter of a column of the area to sort: ascending, descending, back to the order of the sheet (on a page only; the dialog sorts the typed cells)
        _sortButton(c) {
            const a = this._sortArea, s = this._sortState;
            if (!a || this.isEditor || this.p.sortable === false || c < a.c1 || c > a.c2) return nothing;
            const on = !!s && s.c === c;
            return html`<button type="button" class="srt ${on ? "on" : ""}" data-sortc=${c} title="Sort this column" tabindex="-1">${on ? icon(s.dir === "asc" ? "arrow-up" : "arrow-down") : html`<span aria-hidden="true">↕</span>`}</button>`;
        }

        // ---- find (Ctrl+F) ------------------------------------------------------------------------------------------------
        // The formula bar: the address of the cell in focus, and what is stored in it (a formula as it was written). Enter in it keeps what was typed.
        _formulaBar() {
            const f = this._sel.focus;
            const text = f ? this._rawText(f.r, f.c) : "";
            const editable = !!f && this._editable(f.r, f.c);
            const isF = !!f && this._formula(f.r, f.c) !== null;
            return html`<div class="fbar" @keydown=${this._onBarKey}>
                <span class="fa">${f ? this._addr(f.r, f.c) : ""}</span>
                <span class="fx ${isF ? "on" : ""}">fx</span>
                <input type="text" data-bar .value=${text} ?readonly=${!editable} placeholder=${f ? "" : "Select a cell"} aria-label="Formula bar" @change=${this._onBarChange}>
            </div>`;
        }
        _onBarKey(e) {
            e.stopPropagation();
            const f = this._sel.focus;
            if (e.key === "Enter" && f) { e.preventDefault(); this._onBarChange(e); this._focusGrid(); }
            else if (e.key === "Escape") { e.target.value = f ? this._rawText(f.r, f.c) : ""; this._focusGrid(); }
        }
        _onBarChange(e) {
            const f = this._sel.focus;
            if (f && this._editable(f.r, f.c)) this._applyEdit(f.r, f.c, e.target.value);
        }
        // what is stored in a cell as text: a formula as it was written
        _rawText(r, c) {
            const v = this._raw(r, c);
            return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
        }

        _findBar() {
            const f = this._find, n = this._matches.length;
            return html`<div class="findbar" @keydown=${this._onFindKey}>
                <input type="text" data-find .value=${f.text} placeholder="Find" aria-label="Find in the sheet" @input=${this._onFindInput}>
                <span class="fc">${f.text ? (n ? f.at + 1 : 0) + " / " + n : ""}</span>
                <button type="button" title="Previous (Shift+Enter)" data-findgo="-1">↑</button>
                <button type="button" title="Next (Enter)" data-findgo="1">↓</button>
                <label title="Match case"><input type="checkbox" data-findcase .checked=${f.cs}> Aa</label>
                <button type="button" title="Close (Esc)" data-findclose>×</button>
            </div>`;
        }

        // the cells that hold the text, as the view shows them: made again when the text, the values or the order changed
        _ensureMatches() {
            const f = this._find;
            if (!f.open) return;
            const sig = [f.text, f.cs, this._dataVersion, this._permSig].join("|");
            if (sig === this._matchSig) return;
            this._matchSig = sig;
            const a = this._area, items = [];
            const keys = new Set([...this._cells.keys(), ...this._populated.map.keys(), ...this._edits.keys()]);
            if (f.text && keys.size <= 50000) keys.forEach((k) => {
                const [sr, c] = k.split(",").map(Number);
                const r = this._disp(sr, c);
                if (r < a.r1 || r > a.r2 || c < a.c1 || c > a.c2) return;
                const text = this._text(r, c);
                if (text === "") return;
                items.push({ r, c, text });
            });
            this._matches = findMatches(items, f.text, f.cs);
            this._matchSet = new Set(this._matches.map((m) => cellKey(m.r, m.c)));
            if (f.at >= this._matches.length) f.at = this._matches.length ? 0 : -1;
        }

        _openFind() {
            if (this.p.findable === false) return;
            this._find.open = true;
            this._find.focus = true;
            this._matchSig = "";
            this.requestUpdate();
        }

        _closeFind() { this._find.open = false; this._find.focus = false; this.requestUpdate(); this._focusGrid(); }

        // to a match: it is selected and brought into view; the search box keeps the keyboard
        _goFind(i) {
            const m = this._matches[i];
            if (!m) return;
            this._find.at = i;
            this._commitSelection(selectCell(m.r, m.c));
            this.requestUpdate();
        }

        _onFindInput(e) {
            this._find.text = e.target.value;
            this._matchSig = "";
            this._ensureMatches();
            this._find.at = this._matches.length ? 0 : -1;
            if (this._matches.length) this._goFind(0); else this.requestUpdate();
        }

        _onFindKey(e) {
            if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); this._goFind(nextMatch(this._matches.length, this._find.at, e.shiftKey)); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this._closeFind(); }
            else e.stopPropagation();
        }

        _toggleSort(c) {
            const s = this._sortState;
            this._sortState = !s || s.c !== c ? { c, dir: "asc" } : s.dir === "asc" ? { c, dir: "desc" } : null;
            this._sortVersion++;
            this.fire("sortChange", { column: colName(c), direction: this._sortState ? this._sortState.dir : "" });
            this._dataVersion++;
            this.requestUpdate();
        }

        _rowHead(g, r, top) {
            const range = this._selRange;
            const act = !!range && r >= range.r1 && r <= range.r2;
            const h = g.rowAxis.sizeOf(r - this._area.r1);
            return html`<div class="head ${act ? "act" : ""}" part="header" data-hr=${r} style="left:0;top:${top}px;width:${g.rowHeadW}px;height:${h}px">${r + 1}${this._canAdjust("r", r) ? html`<div class="rz rz-r" data-rz="r" data-i=${r} title="Drag to change the height; double-click to fit the content"></div>` : nothing}</div>`;
        }

        // the cells of one pane, in its own coordinates; a merge is drawn once, as one box, and the cells under it are skipped.
        // rowsFrom..rowsTo and colsFrom..colsTo are display indices (colsFrom counts the row-number column when there is one)
        _pane(g, rowsFrom, rowsTo, colsFrom, colsTo, frozenRows, frozenCols) {
            const a = this._area;
            const originLeft = frozenCols ? 0 : g.frozenW;
            const originTop = frozenRows ? -g.hh : g.rowAxis.offsetOf(g.F);
            const out = [];
            const r1 = a.r1 + rowsFrom, r2 = a.r1 + rowsTo - 1, c1 = a.c1 + colsFrom - g.rn, c2 = a.c1 + colsTo - 1 - g.rn;
            const lineR = a.r1 + g.F, lineC = a.c1 + this._freeze.cols;
            const merges = this._merges.filter((m) => (frozenRows ? m.r1 < lineR : m.r1 >= lineR) && (frozenCols ? m.c1 < lineC : m.c1 >= lineC)
                && m.r1 <= r2 && m.r2 >= r1 && m.c1 <= c2 && m.c2 >= c1);
            for (let i = rowsFrom; i < rowsTo; i++) {
                const r = a.r1 + i;
                for (let ji = colsFrom; ji < colsTo; ji++) {
                    const j = ji - g.rn;
                    if (j < 0) { if (frozenCols && g.heads) out.push(this._rowHead(g, r, g.rowAxis.offsetOf(i) - originTop)); continue; }
                    const c = a.c1 + j;
                    if (merges.length && mergeOf(merges, r, c)) continue;
                    out.push(this._cell(g, r, c, this._cellBox(g, r, c, r, c, originLeft, originTop), null));
                }
            }
            merges.forEach((m) => {
                // a merge that starts above / left of what is shown is drawn from the edge of it
                const cm = { r1: Math.max(m.r1, a.r1), c1: Math.max(m.c1, a.c1), r2: Math.min(m.r2, a.r2), c2: Math.min(m.c2, a.c2) };
                out.push(this._cell(g, m.r1, m.c1, this._cellBox(g, cm.r1, cm.c1, cm.r2, cm.c2, originLeft, originTop), m));
            });
            return out;
        }

        render() {
            this._prepare();
            this._ensurePerm();
            this._ensureMatches();
            const p = this.p || {};
            // where the populate rules start, for the marker the editor shows
            this._populateAt = new Map();
            (Array.isArray(p.populate) ? p.populate : []).forEach((item) => {
                const at = parseAddress(item && item.at);
                if (at && item.enabled !== false) this._populateAt.set(cellKey(at.r, at.c), String(item.direction === "right" ? "to the right" : "down") + " from " + item.at);
            });
            const g = this._geo = this._geometry();
            this._selRange = p.selection === "none" ? null : growToMerges(rangeOf(this._sel), this._merges);
            const sl = this._scroll.left, st = this._scroll.top;
            const a = this._area, fCols = this._freeze.cols;

            // column letters: the frozen columns in the corner, the others in the strip that follows the horizontal scroll
            const headTL = [], headTR = [];
            if (g.heads) {
                headTL.push(html`<div class="head corner" part="header" style="left:0;top:0;width:${g.rowHeadW}px;height:${g.hh}px">${p.exportable === true && !this.isEditor ? html`<button type="button" class="xl" data-xlsx title="Export to Excel (.xlsx)" tabindex="-1">⤓</button>` : nothing}</div>`);
                for (let j = 0; j < fCols; j++) headTL.push(this._colHead(g, a.c1 + j, g.colAxis.offsetOf(j + g.rn)));
                for (let ji = g.cols.from; ji < g.cols.to; ji++) { const j = ji - g.rn; if (j >= fCols && j < g.nC) headTR.push(this._colHead(g, a.c1 + j, g.colAxis.offsetOf(ji) - g.frozenW)); }
            }
            const F = g.F;
            const tl = F ? this._pane(g, 0, F, 0, fCols + g.rn, true, true) : [];
            const tr = F ? this._pane(g, 0, F, Math.max(g.cols.from, fCols + g.rn), g.cols.to, true, false) : [];
            const bl = g.FC ? this._pane(g, g.rows.from, g.rows.to, 0, g.FC, false, true) : [];
            const br = this._pane(g, g.rows.from, g.rows.to, Math.max(g.cols.from, g.FC), g.cols.to, false, false);
            const frozenTop = g.hh + g.frozenRowsH;
            const staged = (this.p || {}).saveMode === "bar" && stageCount(this._stage) > 0;
            const bar = p.showFormulaBar === true;
            return html`<div class="grid ${p.showGridLines === false ? "nolines" : ""}" part="root" tabindex="0" role="grid" aria-rowcount=${g.nR} aria-colcount=${g.nC}
                @mousedown=${this._onMouseDown} @mouseover=${this._onMouseOver} @click=${this._onClick} @dblclick=${this._onDblClick} @keydown=${this._onKey} @copy=${this._onCopy} @cut=${this._onCut} @paste=${this._onPaste} @change=${this._onChange} @focusout=${this._onFocusOut}>
                ${bar ? this._formulaBar() : nothing}
                <div class="body" style="top:${bar ? BAR_H : 0}px">
                <div class="pane" style="left:0;top:0;width:${g.frozenW}px;height:${frozenTop}px"><div class="inner">${headTL}${tl}</div></div>
                <div class="pane" style="left:${g.frozenW}px;top:0;width:${g.viewW}px;height:${frozenTop}px"><div class="inner" data-pane="tr" style="transform:translateX(${-sl}px)">${headTR}${tr}</div></div>
                <div class="pane" style="left:0;top:${frozenTop}px;width:${g.frozenW}px;height:${g.viewH}px"><div class="inner" data-pane="bl" style="transform:translateY(${-st}px)">${bl}</div></div>
                <div class="scroller" data-scroller style="left:${g.frozenW}px;top:${frozenTop}px;right:0;bottom:0" @scroll=${this._onScroll}>
                    <div class="sizer" style="width:${g.scrollW}px;height:${g.scrollH}px">${br}</div>
                </div>
                </div>
                ${this._find.open ? this._findBar() : nothing}
                ${staged ? html`<div class="staged"><span>${stageCount(this._stage)} unsaved</span><button type="button" data-staged="save">Save</button><button type="button" class="ghost" data-staged="discard">Discard</button></div>` : nothing}
            </div>`;
        }

        updated(changed) {
            super.updated(changed);
            // the SDK turns pointer events off in editor mode so that the canvas takes the clicks; the Edit grid dialog hosts the grid to click on it
            if (this.hasAttribute("data-interactive")) this.style.pointerEvents = "auto";
            this._measureFit();
            this._keepTime();
            if (this._find.open && this._find.focus) {
                const input = this.renderRoot.querySelector("[data-find]");
                if (input) { this._find.focus = false; input.focus(); input.select(); }
            }
            const s = this.renderRoot.querySelector("[data-scroller]");
            if (s) {
                const sbw = s.offsetWidth - s.clientWidth, sbh = s.offsetHeight - s.clientHeight;
                if (sbw !== this._sbw || sbh !== this._sbh) { this._sbw = sbw; this._sbh = sbh; this.requestUpdate(); }
            }
            if (this._edit && this._focusEdit) {
                const input = this.renderRoot.querySelector("[data-edit]");
                // like a sheet: the old text stays and the caret goes to its end (a typed first character has already replaced it)
                if (input) { this._focusEdit = false; input.focus(); if (input.type === "text") input.setSelectionRange(input.value.length, input.value.length); }
            }
        }

        // ---- measuring wrapped text ------------------------------------------------------------------------------------
        _measurer() {
            if (!this._measure) {
                const m = document.createElement("div");
                m.setAttribute("aria-hidden", "true");
                m.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:anywhere;box-sizing:border-box;padding:0 8px;line-height:1.25";
                this.renderRoot.appendChild(m);
                this._measure = m;
            }
            return this._measure;
        }

        // the height a text needs in a cell of this width with its font; undefined when there is nothing to measure with yet
        _needHeight(fields, spec, text, width) {
            const m = this._measurer();
            const css = styleCss(fields, spec.type).split(";").filter((x) => /^(font-|text-decoration)/.test(x)).join(";");
            m.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:anywhere;box-sizing:border-box;padding:0 8px;line-height:1.25;width:" + Math.max(10, width) + "px;" + css;
            m.textContent = text === "" || text === null || text === undefined ? " " : String(text);
            return Math.ceil(m.scrollHeight) + 8;
        }

        // the rows whose wrapped cells need more than the row's height: measured after a render (it needs the DOM), again only when the values or the sizes changed
        _measureFit() {
            const p = this.p || {};
            const sig = this._dataVersion + "|" + this._colSz.length + "|" + [...this._sizeEdits.cols.entries()].join(";");
            if (sig === this._fitSig) return;
            this._fitSig = sig;
            const next = new Map();
            if (p.autoFit !== false) {
                const keys = new Set([...this._cells.keys(), ...this._populated.map.keys(), ...this._edits.keys()]);
                const dd = this._sizeDefaults(p), a = this._area;
                if (keys.size <= 20000) keys.forEach((k) => {
                    const [r, c] = k.split(",").map(Number);
                    if (r < a.r1 || r > a.r2 || c < a.c1 || c > a.c2) return;
                    const fields = this._fields(r, c);
                    if (fields.wrap !== true) return;
                    const s = rowSizeAt(this._rowSz, r, dd.row);
                    if (!(s.fit && s.adjustable)) return;
                    const spec = cellSpec(fields), text = this._text(r, c);
                    if (text === "") return;
                    const h = this._needHeight(fields, spec, text, this._widthOf(c));
                    if (h > (next.get(r) || 0)) next.set(r, h);
                });
            }
            const same = next.size === this._fit.size && [...next.entries()].every(([r, h]) => this._fit.get(r) === h);
            if (!same) { this._fit = next; this.requestUpdate(); }
        }

        // ---- dragging the line between two headers -------------------------------------------------------------------------
        // on a page where the grid or the rule lets the user; in the Edit grid dialog always (it designs the sizes)
        _canAdjust(kind, index) {
            if (this._designing()) return true;
            if (this.isEditor) return false;
            if (kind === "c") { const s = this._colSz[index]; return !!s && s.adjustable !== false; }
            return rowSizeAt(this._rowSz, index, this._sizeDefaults(this.p).row).adjustable !== false;
        }

        _beginResize(e, handle) {
            const kind = handle.dataset.rz, index = Number(handle.dataset.i);
            if (!this._canAdjust(kind, index) || !this._geo) return;
            const g = this._geo, a = this._area;
            const dd = this._sizeDefaults(this.p);
            const start = kind === "c" ? g.colAxis.sizeOf(index - a.c1 + g.rn) : g.rowAxis.sizeOf(index - a.r1);
            // a column inside a selection of whole columns moves them all, as in a sheet
            const sel = this._selRange;
            let indexes = [index];
            if (sel && kind === "c" && sel.r1 <= a.r1 && sel.r2 >= a.r2 && index >= sel.c1 && index <= sel.c2) indexes = Array.from({ length: sel.c2 - sel.c1 + 1 }, (_, k) => sel.c1 + k);
            if (sel && kind === "r" && sel.c1 <= a.c1 && sel.c2 >= a.c2 && index >= sel.r1 && index <= sel.r2) indexes = Array.from({ length: sel.r2 - sel.r1 + 1 }, (_, k) => sel.r1 + k);
            const lim = kind === "c" ? this._colSz[index] : rowSizeAt(this._rowSz, index, dd.row);
            this._resize = { kind, indexes, x: e.clientX, y: e.clientY, start, min: lim.min, max: lim.max };
            e.preventDefault();
        }

        _dragResize(e) {
            const z = this._resize;
            if (!z) return;
            const size = clampSize(Math.round(z.start + (z.kind === "c" ? e.clientX - z.x : e.clientY - z.y)), z.min, z.max);
            if (size === z.size) return;
            z.size = size;
            z.indexes.forEach((i) => (z.kind === "c" ? this._sizeEdits.cols : this._sizeEdits.rows).set(i, size));
            this.requestUpdate();
        }

        _endResize() {
            const z = this._resize;
            this._resize = null;
            if (z.size === undefined) return;
            this._commitSize(z.kind, z.indexes, z.size);
        }

        // a size the user chose (dragged, or fitted by a double click): kept on the page, told to Logic; in the dialog it goes to the dialog, as a rule
        _commitSize(kind, indexes, size) {
            const map = kind === "c" ? this._sizeEdits.cols : this._sizeEdits.rows;
            if (this._designing()) {
                this.dispatchEvent(new CustomEvent("nexa-resize", { detail: { kind, from: Math.min(...indexes), to: Math.max(...indexes), size }, bubbles: true, composed: true }));
                indexes.forEach((i) => map.delete(i));
            } else {
                indexes.forEach((i) => map.set(i, size));
                if (kind === "c") this.fire("columnResize", { columns: indexes.map(colName), width: size });
                else this.fire("rowResize", { rows: indexes.map((i) => i + 1), height: size });
            }
            this._dataVersion++;
            this.requestUpdate();
        }

        // a double click on a line: the size that fits the content of the column (its widest text) or of the row (its tallest wrapped text)
        _fitSize(handle) {
            const kind = handle.dataset.rz, index = Number(handle.dataset.i);
            if (!this._canAdjust(kind, index)) return;
            const dd = this._sizeDefaults(this.p), a = this._area;
            let size;
            if (kind === "c") {
                const m = this._measurer();
                let w = 0;
                const keys = new Set([...this._cells.keys(), ...this._populated.map.keys(), ...this._edits.keys()]);
                keys.forEach((k) => {
                    const [sr, c] = k.split(",").map(Number);
                    const r = this._disp(sr, c);
                    if (c !== index || r < a.r1 || r > a.r2) return;
                    const fields = this._fields(r, c), spec = cellSpec(fields);
                    m.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:pre;padding:0 8px;" + styleCss(fields, spec.type).split(";").filter((x) => /^font-/.test(x)).join(";");
                    m.textContent = this._text(r, c);
                    w = Math.max(w, Math.ceil(m.scrollWidth) + 6);
                });
                size = clampSize(w || dd.col.width, this._colSz[index].min, this._colSz[index].max);
            } else {
                const s = rowSizeAt(this._rowSz, index, dd.row);
                size = clampSize(Math.max(dd.row.height, this._fit.get(index) || 0), s.min, s.max);
            }
            this._commitSize(kind, [index], size);
        }

        // ---- the user -----------------------------------------------------------------------------------------------
        _onScroll(e) {
            const s = e.currentTarget, g = this._geo;
            this._scroll = { left: s.scrollLeft, top: s.scrollTop };
            const tr = this.renderRoot.querySelector('[data-pane="tr"]'), bl = this.renderRoot.querySelector('[data-pane="bl"]');
            if (tr) tr.style.transform = "translateX(" + -s.scrollLeft + "px)";
            if (bl) bl.style.transform = "translateY(" + -s.scrollTop + "px)";
            // only a change of which rows / columns are drawn needs a new render
            const rows = visibleRange(g.rowAxis, s.scrollTop, g.viewH, 4, g.F), cols = visibleRange(g.colAxis, s.scrollLeft, g.viewW, 1, g.FC);
            if (rows.from !== g.rows.from || rows.to !== g.rows.to || cols.from !== g.cols.from || cols.to !== g.cols.to) this.requestUpdate();
        }

        _at(e) {
            const t = e.target;
            const cell = t && t.closest ? t.closest("[data-r][data-c]") : null;
            return cell ? { r: Number(cell.dataset.r), c: Number(cell.dataset.c), el: cell } : null;
        }

        _headAt(e) {
            const t = e.target;
            const h = t && t.closest ? t.closest("[data-hc], [data-hr]") : null;
            if (!h) return null;
            return h.dataset.hc !== undefined ? { col: Number(h.dataset.hc) } : { row: Number(h.dataset.hr) };
        }

        _select(sel) {
            if (this.p.selection === "none") return;
            this._sel = sel;
            this.requestUpdate();
            this._announceSelection();
        }

        _selectColumns(c1, c2) { const a = this._area; this._select({ anchor: { r: a.r1, c: c1 }, focus: { r: a.r2, c: c2 } }); }
        _selectRows(r1, r2) { const a = this._area; this._select({ anchor: { r: r1, c: a.c1 }, focus: { r: r2, c: a.c2 } }); }

        _announceSelection() {
            const range = this.p.selection === "none" ? null : growToMerges(rangeOf(this._sel), this._merges);
            const sig = range ? [range.r1, range.c1, range.r2, range.c2].join(",") : "";
            if (sig === this._selSig) return;
            this._selSig = sig;
            // the DOM event is for whoever hosts the grid (the Edit grid dialog), also in the editor where Logic events are silent
            this.dispatchEvent(new CustomEvent("nexa-selection", { detail: { range }, bubbles: true, composed: true }));
            if (!range) { this.fire("selectionChange", { range: "", address: "", values: [] }); return; }
            const f = this._sel.focus;
            const cells = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
            let values = [];
            if (cells <= MAX_VALUES_IN_EVENT) for (let r = range.r1; r <= range.r2; r++) { const line = []; for (let c = range.c1; c <= range.c2; c++) line.push(this._value(r, c)); values.push(line); }
            this.fire("selectionChange", { range: rangeText(range), address: f ? addressOf(f.r, f.c) : "", values });
        }

        _onMouseDown(e) {
            if (e.button !== 0) return;
            const handle = e.target.closest && e.target.closest("[data-rz]");
            if (handle) { this._beginResize(e, handle); return; }
            if (e.target.closest && (e.target.closest("[data-sortc]") || e.target.closest("[data-xlsx]") || e.target.closest(".findbar") || e.target.closest(".fbar"))) return;
            if (e.target.closest && e.target.closest("[data-fill]") && this._selRange) { this._fill = { source: Object.assign({}, this._selRange), plan: null }; e.preventDefault(); return; }
            const head = this._headAt(e);
            if (head) {
                if (this._edit) this._commitEdit(this._editText());
                if (head.col !== undefined) {
                    const from = e.shiftKey && this._sel.anchor ? this._sel.anchor.c : head.col;
                    this._selectColumns(from, head.col);
                    this._dragging = "cols";
                } else {
                    const from = e.shiftKey && this._sel.anchor ? this._sel.anchor.r : head.row;
                    this._selectRows(from, head.row);
                    this._dragging = "rows";
                }
                return;
            }
            const hit = this._at(e);
            if (!hit || e.target.closest("[data-edit]") || e.target.closest("input, select")) return;
            if (this._edit) this._commitEdit(this._editText());
            if (e.shiftKey && this.p.selection === "range") this._select(extendTo(this._sel, hit.r, hit.c));
            else this._select(selectCell(hit.r, hit.c));
            this._dragging = this.p.selection === "range" ? "cells" : "";
        }

        _onMouseOver(e) {
            if (this._fill && (e.buttons & 1)) {
                const hit = this._at(e);
                if (hit) { this._fill.plan = fillTarget(this._fill.source, { r: hit.r, c: hit.c }, this._size); this.requestUpdate(); }
                return;
            }
            if (!this._dragging || !(e.buttons & 1)) return;
            if (this._dragging === "cells") { const hit = this._at(e); if (hit) this._select(extendTo(this._sel, hit.r, hit.c)); return; }
            const head = this._headAt(e);
            if (this._dragging === "cols" && head && head.col !== undefined) this._selectColumns(this._sel.anchor.c, head.col);
            if (this._dragging === "rows" && head && head.row !== undefined) this._selectRows(this._sel.anchor.r, head.row);
        }

        _onClick(e) {
            if (e.target.closest && e.target.closest("[data-xlsx]")) { this.exportXlsx(); return; }
            const srt = e.target.closest && e.target.closest("[data-sortc]");
            if (srt) { this._toggleSort(Number(srt.dataset.sortc)); return; }
            const go = e.target.closest("[data-findgo]");
            if (go) { this._goFind(nextMatch(this._matches.length, this._find.at, go.dataset.findgo === "-1")); return; }
            if (e.target.closest("[data-findclose]")) { this._closeFind(); return; }
            if (e.target.closest("[data-findcase]")) { this._find.cs = e.target.closest("[data-findcase]").checked; this._matchSig = ""; this.requestUpdate(); return; }
            const staged = e.target.closest("[data-staged]");
            if (staged) { if (staged.dataset.staged === "save") this.save(); else this.discard(); return; }
            const hit = this._at(e);
            if (!hit) return;
            const spec = cellSpec(this._fields(hit.r, hit.c));
            const act = e.target.closest("[data-act]");
            const value = this._value(hit.r, hit.c);
            const address = this._addr(hit.r, hit.c);
            if (act && act.dataset.act === "toggle" && this._editable(hit.r, hit.c) && this._formula(hit.r, hit.c) === null) this._applyEdit(hit.r, hit.c, !(value === true || value === "true" || value === 1));
            else if (act && act.dataset.act === "button") this.fire("buttonClick", { address, action: spec.action || address, value });
            this.fire("cellClick", { address, value });
        }

        _onDblClick(e) {
            const handle = e.target.closest && e.target.closest("[data-rz]");
            if (handle) { this._fitSize(handle); return; }
            const hit = this._at(e);
            if (hit && !e.target.closest("[data-act]") && this._editable(hit.r, hit.c)) this._startEdit(hit.r, hit.c, null);
        }

        // an <input> cell (always an input): its change is the edit
        _onChange(e) {
            const t = e.target;
            if (!t || !t.matches || !t.matches("input[data-act='input']")) return;
            const hit = this._at(e);
            if (hit && this._editable(hit.r, hit.c)) this._applyEdit(hit.r, hit.c, t.value);
        }

        _startEdit(r, c, firstChar) {
            if (!this._editable(r, c)) return false;
            const spec = cellSpec(this._fields(r, c)), value = this._raw(r, c);
            // a formula is edited as its text; typing "=" starts one in any cell
            const formula = firstChar === "=" || this._formula(r, c) !== null;
            if (spec.type === "boolean" && !formula) { this._applyEdit(r, c, !(value === true || value === "true" || value === 1)); return true; }
            this._edit = { r, c, formula, text: firstChar !== null ? firstChar : (value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)) };
            this._focusEdit = true;
            this.requestUpdate();
            return true;
        }

        _editText() {
            const input = this.renderRoot.querySelector("[data-edit]");
            return input ? input.value : this._edit ? this._edit.text : "";
        }

        _onEditInput(e) {
            if (!this._edit) return;
            this._edit.text = e.target.value;
            if (e.target.tagName !== "TEXTAREA") return;
            // the row grows with what is typed (up to its largest), so the text can be seen
            const { r, c } = this._edit;
            const fields = this._fields(r, c);
            const h = this._needHeight(fields, cellSpec(fields), e.target.value, this._widthOf(c));
            if (h !== undefined && (!this._editFit || this._editFit.h !== h)) { this._editFit = { r, h }; this.requestUpdate(); }
        }
        _onEditChange(e) { if (this._edit && e.target.tagName === "SELECT") this._commitEdit(e.target.value); }

        _commitEdit(text) {
            const ed = this._edit;
            if (!ed) return;
            this._edit = null;
            this._editFit = null;
            this._applyEdit(ed.r, ed.c, text);
            this.requestUpdate();
        }

        _cancelEdit() { this._edit = null; this._editFit = null; this.requestUpdate(); }

        _onFocusOut(e) {
            // leaving the edit box (a click elsewhere) keeps what was typed; Escape / Enter / Tab have already ended the edit
            if (this._edit && e.target && e.target.matches && e.target.matches("[data-edit]")) this._commitEdit(e.target.value);
        }

        /**
         * A value the user put in a cell. On a page it is kept (staged until Save, or at once) and the events say what changed. In the Edit grid dialog it
         * is the design's content: it goes to the dialog as a DOM event and nothing is kept here.
         */
        _applyEdit(r, c, input) {
            if (!this._editable(r, c)) return;
            const spec = cellSpec(this._fields(r, c));
            const key = cellKey(this._src(r, c), c), address = this._addr(r, c);
            // "=" and something after it is a formula: kept as typed, whatever the cell's type
            const typed = typeof input === "string" ? input.trim() : input;
            const old = this._raw(r, c), value = isFormula(typed) ? typed : coerceEdit(spec, input);
            if (JSON.stringify(old) === JSON.stringify(value)) return;
            if (this._designing()) {
                this.dispatchEvent(new CustomEvent("nexa-cell-edit", { detail: { address, value }, bubbles: true, composed: true }));
                return;
            }
            if (this.isEditor) return;
            if (this._staged()) stageSet(this._stage, key, "v", value, this._baseValue(r, c));
            else this._edits.set(key, value);
            this._dataVersion++;
            this.requestUpdate();
            this.fire("cellChange", { address, old, new: value, staged: this._staged() });
            if (!this._staged()) this.fire("save", { cells: [{ address, old, new: value }] });
        }

        _focusGrid() { const g = this.renderRoot.querySelector(".grid"); if (g) g.focus({ preventScroll: true }); }

        // `vertical` / `horizontal` (default: both): which axes may scroll
        _ensureVisible(r, c, vertical, horizontal) {
            const g = this._geo, s = this.renderRoot.querySelector("[data-scroller]");
            if (!g || !s) return;
            const i = r - this._area.r1, j = c - this._area.c1;
            if (vertical !== false && i >= g.F) s.scrollTop = scrollToShow(g.rowAxis, i, s.scrollTop, g.viewH, g.F);
            if (horizontal !== false && j + g.rn >= g.FC) s.scrollLeft = scrollToShow(g.colAxis, j + g.rn, s.scrollLeft, g.viewW, g.FC);
        }

        // moving with the keyboard counts inside what is shown: the selection is shifted to the area's own 0, moved, and shifted back
        _move(dr, dc, extend, sel) {
            const a = this._area, nR = a.r2 - a.r1 + 1, nC = a.c2 - a.c1 + 1;
            const shift = (p) => (p ? { r: p.r - a.r1, c: p.c - a.c1 } : p);
            const back = (p) => ({ r: p.r + a.r1, c: p.c + a.c1 });
            const merges = this._merges.map((m) => ({ r1: m.r1 - a.r1, c1: m.c1 - a.c1, r2: m.r2 - a.r1, c2: m.c2 - a.c1 }));
            const moved = moveFocus({ anchor: shift((sel || this._sel).anchor), focus: shift((sel || this._sel).focus) }, dr, dc, nR, nC, merges, extend);
            return { anchor: back(moved.anchor), focus: back(moved.focus) };
        }

        _onKey(e) {
            const ed = e.target && e.target.matches && e.target.matches("[data-edit]");
            const a = this._area;
            if (ed) {
                const at = () => ({ r: this._edit.r, c: this._edit.c });
                // in a text area Enter is a new line; Ctrl+Enter commits
                if (e.key === "Enter" && e.target.tagName === "TEXTAREA" && !e.ctrlKey && !e.metaKey) return;
                if (e.key === "Enter") { e.preventDefault(); const p = at(); this._commitEdit(e.target.value); this._moveBy(1, 0, p.r, p.c); }
                else if (e.key === "Tab") { e.preventDefault(); const p = at(); this._commitEdit(e.target.value); this._moveBy(0, e.shiftKey ? -1 : 1, p.r, p.c); }
                else if (e.key === "Escape") { e.preventDefault(); this._cancelEdit(); this._focusGrid(); }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === "f" && this.p.findable !== false) { e.preventDefault(); this._openFind(); return; }
            if (e.target.closest && e.target.closest("input, select")) return;
            if (this.p.selection === "none") return;
            const f = this._sel.focus || { r: a.r1, c: a.c1 };
            const extend = e.shiftKey && this.p.selection === "range";
            const page = Math.max(1, Math.floor((this._geo ? this._geo.viewH : 300) / (this._geo ? this._geo.rh : 28)) - 1);
            const move = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], PageDown: [page, 0], PageUp: [-page, 0], Tab: [0, e.shiftKey ? -1 : 1] }[e.key];
            if (move) {
                const sel = this._sel.focus ? this._move(move[0], move[1], extend) : selectCell(a.r1, a.c1);
                // Tab at the last cell (or first, with Shift) is not ours: it lets the user leave the grid
                if (e.key === "Tab" && this._sel.focus && sel.focus.r === f.r && sel.focus.c === f.c) return;
                e.preventDefault();
                this._commitSelection(sel);
            } else if (e.key === "Home" || e.key === "End") {
                e.preventDefault();
                const r = e.ctrlKey ? (e.key === "Home" ? a.r1 : a.r2) : f.r, c = e.key === "Home" ? a.c1 : a.c2;
                this._commitSelection(extend ? extendTo(this._sel, r, c) : selectCell(r, c));
            } else if (e.key === "Enter" || e.key === "F2") {
                e.preventDefault();
                if (!this._startEdit(f.r, f.c, null) && e.key === "Enter") this._moveBy(1, 0, f.r, f.c);
            } else if (e.key === " " && cellSpec(this._fields(f.r, f.c)).type === "boolean") {
                e.preventDefault(); this._startEdit(f.r, f.c, null);
            } else if ((e.key === "Delete" || e.key === "Backspace") && this._editable(f.r, f.c)) {
                e.preventDefault(); this._clearSelection();
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (cellSpec(this._fields(f.r, f.c)).type !== "boolean" && this._startEdit(f.r, f.c, e.key)) e.preventDefault();
            } else if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey) && this.p.selection === "range") {
                e.preventDefault(); this._commitSelection({ anchor: { r: a.r1, c: a.c1 }, focus: { r: a.r2, c: a.c2 } });
            }
        }

        // Delete: empties the editable cells of the selection
        _clearSelection() {
            const range = this._selRange;
            if (!range) return;
            for (let r = range.r1; r <= range.r2; r++) for (let c = range.c1; c <= range.c2; c++) if (this._editable(r, c)) this._applyEdit(r, c, "");
        }

        _moveBy(dr, dc, r, c) {
            this._commitSelection(this._move(dr, dc, false, selectCell(r, c)));
            this._focusGrid();
        }

        // a new selection by the keyboard: the grid scrolls to the active cell, but only along the axis that moved (a whole column selected and extended to the
        // next one stays where it is, though its active cell is at the bottom)
        _commitSelection(sel) {
            const before = this._sel.focus;
            this._select(sel);
            const f = sel.focus;
            if (f) this._ensureVisible(f.r, f.c, !before || before.r !== f.r, !before || before.c !== f.c);
        }

        // the fill handle shows where the user can fill: in the Edit grid dialog, and on an editable page
        _canFill() { return !!this._selRange && this.p.selection !== "none" && (this._designing() || (!this.isEditor && this._mode() === "editable")); }

        // the style fields of a cell, the ones a rule can have
        _styleOf(r, c) {
            const f = this._fields(r, c), out = {};
            RULE_FIELDS.forEach((k) => { if (Object.prototype.hasOwnProperty.call(f, k)) out[k] = f[k]; });
            return out;
        }

        // Copy: the text of the cells as shown (tab-separated, for Excel and any text field), and a JSON of their values and styles (for this grid and others)
        // A copy carries the formulas as they are written and where they came from (so that a paste can move their references); a cut does not (what it moves keeps pointing where it did)
        _onCopy(e, cut) {
            const range = this._selRange;
            if (!range || !e.clipboardData || (e.target.closest && e.target.closest("input, select, textarea"))) return;
            e.clipboardData.setData("text/plain", rangeToTsv(range, (r, c) => this._text(r, c)));
            const rows = [];
            for (let r = range.r1; r <= range.r2; r++) {
                const line = [];
                for (let c = range.c1; c <= range.c2; c++) line.push({ v: this._raw(r, c), f: this._styleOf(r, c), o: cut || this._formula(r, c) === null ? undefined : { r: this._src(r, c), c } });
                rows.push(line);
            }
            e.clipboardData.setData(GRID_MIME, packCells(rows));
            e.preventDefault();
        }

        // Cut: a copy, then the editable cells of the selection are emptied
        _onCut(e) {
            if (!this._selRange || (e.target.closest && e.target.closest("input, select, textarea"))) return;
            this._onCopy(e, true);
            this._clearSelection();
        }

        // Paste: what this grid (values and styles) or Excel / any text (values) copied, from the cell of the selection on; one cell over a selection fills it
        _onPaste(e) {
            if (!e.clipboardData || (e.target.closest && e.target.closest("input, select, textarea"))) return;
            const range = this._selRange;
            if (!range || this.p.selection === "none") return;
            e.preventDefault();
            const packed = unpackCells(e.clipboardData.getData(GRID_MIME));
            const text = packed ? null : parseTsv(e.clipboardData.getData("text/plain"));
            const block = packed || (text || []).map((row) => row.map((v) => ({ v })));
            if (!block.length) return;
            const h = block.length, w = Math.max(...block.map((row) => row.length));
            const items = pasteTargets({ r: range.r1, c: range.c1 }, h, w, range, this._size).map((t) => {
                const src = block[t.i] && block[t.i][t.j];
                if (src === undefined) return null;
                const v = packed && src.o && isFormula(src.v) ? shiftFormula(src.v, this._src(t.r, t.c) - src.o.r, t.c - src.o.c) : src.v;
                return { r: t.r, c: t.c, v, f: packed ? src.f || {} : undefined, text: !packed };
            }).filter(Boolean);
            this._applyBlock(items);
        }

        // Cells put in by a paste or a fill: [{ r, c, v, f }]. Only the cells the mode and the locks let the user edit. On a page the values are kept (and each
        // change is told); in the Edit grid dialog they are the design's content, with their styles as rules, in one go.
        _applyBlock(items) {
            const todo = items.filter((x) => this._editable(x.r, x.c) && x.v !== undefined);
            if (!todo.length) return;
            const coerced = todo.map((x) => Object.assign({}, x, { value: typeof x.v === "string" && isFormula(x.v.trim()) ? x.v.trim() : coerceEdit(cellSpec(this._fields(x.r, x.c)), x.v === null ? "" : x.v) }));
            if (this._designing()) {
                const r0 = Math.min(...coerced.map((x) => x.r)), r1 = Math.max(...coerced.map((x) => x.r)), c0 = Math.min(...coerced.map((x) => x.c)), c1 = Math.max(...coerced.map((x) => x.c));
                const grid = [];
                for (let r = r0; r <= r1; r++) grid.push(new Array(c1 - c0 + 1).fill(null));
                coerced.forEach((x) => { if (x.f) grid[x.r - r0][x.c - c0] = x.f; });
                const rules = coerced.some((x) => x.f) ? rulesFromCells(grid, { r: r0, c: c0 }, (r, c) => this._fields(r, c), RULE_FIELDS) : [];
                this.dispatchEvent(new CustomEvent("nexa-cells", { detail: { cells: coerced.map((x) => ({ address: addressOf(x.r, x.c), value: x.value })), rules }, bubbles: true, composed: true }));
                return;
            }
            if (this.isEditor) return;
            const changes = [];
            coerced.forEach((x) => {
                const key = cellKey(this._src(x.r, x.c), x.c), old = this._raw(x.r, x.c);
                if (JSON.stringify(old) === JSON.stringify(x.value)) return;
                if (this._staged()) stageSet(this._stage, key, "v", x.value, this._baseValue(x.r, x.c));
                else this._edits.set(key, x.value);
                changes.push({ address: this._addr(x.r, x.c), old, new: x.value, staged: this._staged() });
            });
            this._dataVersion++;
            this.requestUpdate();
            changes.forEach((c) => this.fire("cellChange", c));
            if (!this._staged() && changes.length) this.fire("save", { cells: changes.map((c) => ({ address: c.address, old: c.old, new: c.new })) });
        }

        // The fill handle was let go: the cells it passed get the values of the selection as a series (or copied, with Ctrl) and its styles repeated
        _endFill(e) {
            const f = this._fill;
            this._fill = null;
            this.requestUpdate();
            if (!f || !f.plan) return;
            const S = f.source, { dir, target } = f.plan;
            const vertical = dir === "down" || dir === "up", backward = dir === "up" || dir === "left";
            const lines = vertical ? S.c2 - S.c1 + 1 : S.r2 - S.r1 + 1;            // a column (a row) of the selection is one series
            const length = vertical ? S.r2 - S.r1 + 1 : S.c2 - S.c1 + 1;
            const count = vertical ? target.r2 - target.r1 + 1 : target.c2 - target.c1 + 1;
            const items = [];
            for (let line = 0; line < lines; line++) {
                const cell = (k) => (vertical ? { r: S.r1 + k, c: S.c1 + line } : { r: S.r1 + line, c: S.c1 + k });
                const src = [];
                for (let k = 0; k < length; k++) { const a = cell(k); src.push(this._raw(a.r, a.c)); }
                const vals = seriesValues(src, count, { copy: !!(e && (e.ctrlKey || e.metaKey)), backward });
                for (let k = 0; k < count; k++) {
                    // the k-th cell added: going away from the selection; its style is the one of the selection's cell it repeats
                    const at = dir === "down" ? { r: S.r2 + 1 + k, c: S.c1 + line } : dir === "up" ? { r: S.r1 - 1 - k, c: S.c1 + line }
                        : dir === "right" ? { r: S.r1 + line, c: S.c2 + 1 + k } : { r: S.r1 + line, c: S.c1 - 1 - k };
                    const from = backward ? (length - 1 - (k % length)) : (k % length);
                    const a = cell(from);
                    // a formula is repeated with its references moved by how far the cell is (also with Ctrl, as in Excel)
                    const v = this._formula(a.r, a.c) !== null ? shiftFormula(this._raw(a.r, a.c), this._src(at.r, at.c) - this._src(a.r, a.c), at.c - a.c) : vals[k];
                    items.push({ r: at.r, c: at.c, v, f: this._styleOf(a.r, a.c) });
                }
            }
            this._applyBlock(items);
            // the selection grows over what was filled
            this._select({ anchor: { r: Math.min(S.r1, target.r1), c: Math.min(S.c1, target.c1) }, focus: { r: Math.max(S.r2, target.r2), c: Math.max(S.c2, target.c2) } });
        }

        // ---- actions (Logic) ------------------------------------------------------------------------------------------
        _addressOf(params, key) {
            const text = params && typeof params === "object" ? params[key || "address"] : params;
            return parseAddress(text);
        }

        setCell(params) {
            const a = this._addressOf(params);
            if (!a || a.r >= this._size.rows || a.c >= this._size.cols || !params || typeof params !== "object" || params.value === undefined) return;
            this._edits.set(cellKey(a.r, a.c), params.value);
            stageDrop(this._stage, cellKey(a.r, a.c));
            this._dataVersion++;
            this.requestUpdate();
        }

        setRange(params) {
            const p = params && typeof params === "object" ? params : {};
            const at = parseAddress(p.at);
            if (!at) return;
            const done = expandPopulate(p.values, { at, direction: p.direction === "right" ? "right" : "down", header: p.header === true, fields: parseFields(p.fields), limit: p.limit, shape: p.shape, cellKeys: RULE_FIELDS }, this._size);
            done.cells.forEach((x) => {
                const key = cellKey(x.r, x.c);
                if (x.v !== undefined) this._edits.set(key, x.v);
                if (x.f && Object.keys(x.f).length) this._actionStyles.set(key, x.f); else this._actionStyles.delete(key);
                stageDrop(this._stage, key);
            });
            this._dataVersion++;
            this.requestUpdate();
        }

        clearRange(params) {
            const text = params && typeof params === "object" ? params.range : params;
            const g = viewAreaOf(text, this._size.rows, this._size.cols);
            if (!String(text || "").trim()) return;
            // only the cells that have something: a range of 700 000 cells is not walked
            const keys = new Set([...this._cells.keys(), ...this._populated.map.keys(), ...this._edits.keys()]);
            keys.forEach((k) => {
                const [r, c] = k.split(",").map(Number);
                if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) { this._edits.set(k, null); stageDrop(this._stage, k); }
            });
            this._dataVersion++;
            this.requestUpdate();
        }

        selectCell(params) {
            const a = this._addressOf(params);
            if (!a || a.r >= this._size.rows || a.c >= this._size.cols) return;
            this._commitSelection(selectCell(a.r, a.c));
        }

        scrollToCell(params) {
            const a = this._addressOf(params);
            if (a && a.r < this._size.rows && a.c < this._size.cols) this._ensureVisible(a.r, a.c);
        }

        // ---- export to Excel -------------------------------------------------------------------------------------------------------
        // The model of the file from the grid as it is shown (the order of a sorted view, the area shown, what the user typed): the box of the cells that have a
        // value or are merged, with the types, formats and styles the cells have, the sizes, the merges and the frozen panes. Positions count from the box's corner.
        _xlsxModel() {
            const p = this.p || {}, a = this._area, dd = this._sizeDefaults(p);
            let r0 = Infinity, c0 = Infinity, r1 = -1, c1 = -1;
            const grow = (r, c) => { if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c; };
            const keys = new Set([...this._cells.keys(), ...this._populated.map.keys(), ...this._edits.keys()]);
            keys.forEach((k) => {
                const [sr, c] = k.split(",").map(Number);
                const r = this._disp(sr, c);
                if (r < a.r1 || r > a.r2 || c < a.c1 || c > a.c2) return;
                const v = this._value(r, c);
                if (v !== null && v !== undefined && v !== "") grow(r, c);
            });
            this._merges.forEach((m) => { if (m.r2 >= a.r1 && m.r1 <= a.r2 && m.c2 >= a.c1 && m.c1 <= a.c2) { grow(Math.max(m.r1, a.r1), Math.max(m.c1, a.c1)); grow(Math.min(m.r2, a.r2), Math.min(m.c2, a.c2)); } });
            if (r1 < 0) { r0 = a.r1; c0 = a.c1; r1 = a.r1; c1 = a.c1; }
            const model = { name: "Sheet1", cells: [], cols: {}, rows: {}, merges: [], defaultCol: dd.col.width, defaultRow: dd.row.height, freeze: { rows: 0, cols: 0 } };
            const edge = (map, key) => { const s = map.get(key); return s ? { style: s.style, width: s.width, color: s.color } : null; };
            for (let r = r0; r <= r1 && model.cells.length < 200000; r++) {
                for (let c = c0; c <= c1; c++) {
                    if (isCovered(this._merges, r, c)) continue;
                    const f = this._fields(r, c), spec = cellSpec(f);
                    // a formula is exported as a formula (with its result kept next to it) when the sheet is as the file will have it: not sorted, and the area starts at A1
                    const formula = this._formula(r, c), live = formula !== null && !this._perm && a.r1 === 0 && a.c1 === 0;
                    const result = formula !== null ? this._atSource(this._src(r, c), c) : null;
                    const value = formula !== null ? (isError(result) ? result.code : result) : this._value(r, c);
                    const border = { t: edge(this._edges.h, r + ":" + c), l: edge(this._edges.v, r + ":" + c), b: edge(this._edges.h, (r + 1) + ":" + c), r: edge(this._edges.v, r + ":" + (c + 1)) };
                    const hasBorder = !!(border.t || border.l || border.b || border.r);
                    const fill = cssToArgb(f.fill);
                    const empty = value === null || value === undefined || value === "";
                    if (empty && !fill && !hasBorder) continue;
                    let kind = null, v = value, fmt = "";
                    if (!empty) {
                        if (formula !== null && spec.type === "date" && typeof value === "number") { kind = "n"; v = value; fmt = spec.format === "date" ? "yyyy-mm-dd" : spec.format === "time" ? "hh:mm:ss" : "yyyy-mm-dd hh:mm:ss"; }
                        else if (formula !== null && typeof value === "boolean") { kind = "b"; v = value; }
                        else if (spec.type === "boolean") { kind = "b"; v = value === true || value === "true" || value === 1; }
                        else if (spec.type === "date" && toDate(value)) { kind = "n"; v = excelSerial(toDate(value)); fmt = spec.format === "date" ? "yyyy-mm-dd" : spec.format === "time" ? "hh:mm:ss" : "yyyy-mm-dd hh:mm:ss"; }
                        else if ((spec.type === "number" || spec.type === "progress" || spec.type === "general") && typeof value === "number" && isFinite(value)) { kind = "n"; fmt = spec.type === "number" ? numberFormat(spec.decimals, spec.suffix) : ""; }
                        else { kind = "s"; v = displayText(spec, value); }
                    }
                    const family = { mono: "Consolas", serif: "Georgia", sans: "Calibri" }[f.fontFamily];
                    const size = Number(f.fontSize);
                    const font = { b: f.bold === true, i: f.italic === true, u: f.underline === true, s: f.strike === true, sz: isFinite(size) && size >= 6 ? Math.round(size * 0.75 * 2) / 2 : 0, color: cssToArgb(f.color), name: family || "" };
                    const h = f.align === "left" || f.align === "center" || f.align === "right" ? f.align : (kind === "n" ? "right" : defaultAlign(spec.type) === "left" ? "" : defaultAlign(spec.type));
                    const errored = formula !== null && isError(result);
                    if (errored) kind = "e";
                    model.cells.push({ r: r - r0, c: c - c0, kind, v, fmt, formula: live ? shiftFormula(formula, -r0, -c0) : undefined, font, fill, border, align: { h, v: f.valign === "top" ? "top" : f.valign === "bottom" ? "bottom" : "center", wrap: f.wrap === true } });
                }
            }
            for (let c = c0; c <= c1; c++) { const w = this._widthOf(c); if (w !== dd.col.width) model.cols[c - c0] = w; }
            for (let r = r0; r <= r1; r++) { const h = this._heightOf(r, dd); if (h !== dd.row.height) model.rows[r - r0] = h; }
            this._merges.forEach((m) => { if (m.r1 >= r0 && m.r2 <= r1 && m.c1 >= c0 && m.c2 <= c1) model.merges.push({ r1: m.r1 - r0, c1: m.c1 - c0, r2: m.r2 - r0, c2: m.c2 - c0 }); });
            model.freeze = { rows: Math.max(0, Math.min(this._freeze.rows - (r0 - a.r1), r1 - r0)), cols: Math.max(0, Math.min(this._freeze.cols - (c0 - a.c1), c1 - c0)) };
            return model;
        }

        exportXlsx(params) {
            if (this.isEditor && !this._designing()) return;
            const given = params && typeof params === "object" ? params.name : params;
            let name = typeof given === "string" && given.trim() ? given.trim().replace(/[\\/:*?"<>|]+/g, "_") : "sheet";
            if (!/\.xlsx$/i.test(name)) name += ".xlsx";
            const blob = zipStore(buildXlsxFiles(this._xlsxModel()));
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url; link.download = name;
            this.renderRoot.appendChild(link);
            link.click();
            link.remove();
            this.after(4000, () => URL.revokeObjectURL(url));
        }

        sortColumn(params) {
            const p = params && typeof params === "object" ? params : {};
            const c = parseAddress(String(p.column || "") + "1");
            const dir = p.direction === "asc" || p.direction === "desc" ? p.direction : "";
            const a = this._sortArea;
            if (!a || !c || c.c < a.c1 || c.c > a.c2) return;
            this._sortState = dir ? { c: c.c, dir } : null;
            this._sortVersion++;
            this.fire("sortChange", { column: colName(c.c), direction: dir });
            this._dataVersion++;
            this.requestUpdate();
        }

        save() {
            const cells = [];
            this._stage.edits.forEach((fields, key) => {
                const [r, c] = key.split(",").map(Number);
                cells.push({ address: addressOf(r, c), old: valueAt(this._layers(), r, c), new: fields.v });
                this._edits.set(key, fields.v);
            });
            if (!cells.length) return;
            stageClear(this._stage);
            this._dataVersion++;
            this.requestUpdate();
            this.fire("save", { cells });
        }

        discard() {
            const count = stageCount(this._stage);
            if (!count) return;
            stageClear(this._stage);
            this._dataVersion++;
            this.requestUpdate();
            this.fire("discard", { count });
        }

        getData() {
            const keys = new Set([...this._cells.keys(), ...this._populated.map.keys(), ...this._edits.keys()]);
            const cells = {}, formulas = {};
            let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
            keys.forEach((k) => {
                const [r, c] = k.split(",").map(Number);
                // a formula gives its result in cells and its text in formulas
                const f = this._formulaAt(r, c);
                const raw = valueAt(this._layers(), r, c);
                const v = f !== null ? this._atSource(r, c) : raw;
                if (v === null || v === undefined || v === "") return;
                cells[addressOf(r, c)] = isError(v) ? v.code : v;
                if (f !== null) formulas[addressOf(r, c)] = f;
                if (r < r1) r1 = r; if (r > r2) r2 = r; if (c < c1) c1 = c; if (c > c2) c2 = c;
            });
            this.fire("data", { cells, formulas, range: r2 < 0 ? "" : rangeText({ r1, c1, r2, c2 }) });
        }
    }
});
