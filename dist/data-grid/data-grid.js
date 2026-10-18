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
import { colName, parseAddress, addressOf, rangeText, sizeOf } from "./address.js";
import { displayText, badgePalette, coerceEdit, dateInputValue } from "./cell-types.js";
import { expandPopulate, parseFields } from "./populate.js";
import { cellKey, parseCells, parseRules, fieldsAt, cellSpec, styleCss, populatedCells, valueAt, viewAreaOf, mergesFromProps, rangedFromProps } from "./sheet.js";
import { normalizeFreeze, normalizeMerges, normalizeBorders, buildEdges, boxBorders, normalizeLocks, cellEditable, mergeOf } from "./layout.js";
import { uniformAxis, sizesAxis, visibleRange, scrollToShow } from "./window.js";
import { createStage, stageSet, stageValue, stageHas, stageCount, stageClear, stageDrop } from "./stage.js";
import { noSelection, selectCell, extendTo, rangeOf, growToMerges, moveFocus, rangeToTsv } from "./selection.js";
import { RULE_SCHEMA, POPULATE_SCHEMA, BORDER_SCHEMA, LOCK_SCHEMA } from "./fields.js";
import { openGridEditor, summaryOf } from "./editor.js";

export const CATEGORY_DATA = "UI · Data";

const HEAD_H = 26;                 // the row of column letters
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
    .head { justify-content: center; padding: 0; background: var(--bg-muted); color: var(--fg-muted); font-size: var(--fs-label); letter-spacing: 0.32px; border-color: var(--bd-strong); }
    .head.act { background: var(--bg-emph); color: var(--fg); font-weight: 600; }
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
    groups: ["Sheet", "Populate", "Editing", "Display", "Style"],
    properties: {
        editGrid: { type: "action", group: "Sheet", label: "Edit grid",
            info: (p) => summaryOf(p),
            help: "Opens the sheet with a toolbar and the property tree: select cells and type in them, merge, freeze, lock, draw borders, give ranges a type and a style, set up the populate rules. Nothing changes until Apply.",
            buttons: [{ label: "Edit grid…", icon: "fa fa-table", title: "Type in the cells and design the sheet", run: (p, api) => openGridEditor(p, api) }] },
        rows: { type: "number", default: 100, min: 1, max: 1000, group: "Sheet", label: "Rows", help: "Up to 1000." },
        cols: { type: "number", default: 26, min: 1, max: 702, group: "Sheet", label: "Columns", help: "Up to 702 (A … ZZ)." },
        colWidth: { type: "number", default: 110, min: 24, unit: "px", group: "Sheet", label: "Column width" },
        rowHeight: { type: "number", default: 28, min: 16, max: 200, unit: "px", group: "Sheet", label: "Row height" },
        viewArea: { type: "string", default: "", group: "Sheet", label: "Area shown", placeholder: "A1:H20",
            help: "The page shows only this area of the sheet (the headers keep their letters and numbers). Empty: the whole sheet." },
        freezeRows: { type: "number", default: 0, min: 0, group: "Sheet", label: "Frozen rows", help: "The first rows of what is shown stay in place while the rest scrolls." },
        freezeCols: { type: "number", default: 0, min: 0, group: "Sheet", label: "Frozen columns", help: "The first columns stay in place." },
        populate: { type: "list", default: [], group: "Populate", label: "Populate from messages", noun: "rule", itemLabel: "at",
            help: "A rule takes a value from a message (or a variable, a tag) and puts it in the cells from one cell on: one value, a list down or to the right, a table.",
            item: { row: true, fields: POPULATE_SCHEMA, create: (items) => ({ at: "A1", direction: "down", enabled: true }) } },
        mode: { type: "enum", default: "readonly", group: "Editing", label: "Mode", style: "segmented", options: [{ value: "readonly", label: "Read only" }, { value: "editable", label: "Editable" }],
            help: "Read only: nothing can be edited, whatever is unlocked. Editable: every cell can be, except the ones a lock rule locks. Bind it to change it while the page runs." },
        editMode: { type: "enum", default: "instant", group: "Editing", label: "Edits", style: "segmented", options: [{ value: "instant", label: "Instant" }, { value: "staged", label: "Staged (Save / Discard)" }],
            help: "Instant: every change goes out at once. Staged: changes wait, marked in the cell, until Save (the changed cells go out) or Discard. What the user types is kept in the page until it is reloaded." },
        showHeaders: { type: "boolean", default: true, group: "Display", label: "Show the column letters and row numbers" },
        showGridLines: { type: "boolean", default: true, group: "Display", label: "Show the grid lines" },
        selection: { type: "enum", default: "range", group: "Display", label: "Selection", style: "segmented", options: [{ value: "none", label: "None" }, { value: "cell", label: "Cell" }, { value: "range", label: "Range" }] },
        // what the Edit grid dialog edits: no row of the inspector each, they are in the dialog
        cells: { type: "json", default: {}, group: "Sheet", label: "Cells", hidden: true, noReset: true, bindable: false },
        cellRules: { type: "list", default: [], group: "Sheet", label: "Types and styles", hidden: true, noReset: true, noun: "rule", itemLabel: "range", item: { row: true, fields: RULE_SCHEMA } },
        colWidths: { type: "json", default: {}, group: "Sheet", label: "Column widths", hidden: true, noReset: true, bindable: false },
        rowHeights: { type: "json", default: {}, group: "Sheet", label: "Row heights", hidden: true, noReset: true, bindable: false },
        merges: { type: "list", default: [], group: "Sheet", label: "Merged cells", hidden: true, noReset: true, noun: "merge", item: { type: "string" } },
        borders: { type: "list", default: [], group: "Sheet", label: "Borders", hidden: true, noReset: true, noun: "border rule", itemLabel: "range", item: { row: true, fields: BORDER_SCHEMA } },
        locks: { type: "list", default: [], group: "Editing", label: "Locked / open cells", hidden: true, noReset: true, noun: "lock rule", itemLabel: "range", item: { row: true, fields: LOCK_SCHEMA } },
        size: sizeProp("md"),
        colorPalette: paletteProp(),
        radius: radiusProp("md")
    },
    events: {
        cellChange: { label: "On Cell Change (the user edited a cell)", payload: { address: "string", old: "any", new: "any", staged: "boolean" } },
        save: { label: "On Save (staged mode)", payload: { cells: "array" } },
        discard: { label: "On Discard (staged mode)", payload: { count: "number" } },
        selectionChange: { label: "On Selection Change", payload: { range: "string", address: "string", values: "array" } },
        cellClick: { label: "On Cell Click", payload: { address: "string", value: "any" } },
        buttonClick: { label: "On Button Click", payload: { address: "string", action: "string", value: "any" } },
        data: { label: "On Data (after Get data)", payload: { cells: "object", range: "string" } }
    },
    actions: {
        setCell: { label: "Set one cell", help: "Puts a value in a cell, as if the user had typed it, but without an event. It lasts until the page is reloaded.", example: "{ address: \"B2\", value: 42 }" },
        setRange: { label: "Fill cells from a cell on", help: "Lays a value down from a cell, like a populate rule: a list down or to the right, a list of lists as a block, a list of objects as a table.", example: "{ at: \"B2\", values: [[1, 2], [3, 4]], direction: \"down\" }" },
        clearRange: { label: "Empty cells", help: "Empties the cells of a range.", example: "\"B2:D9\"  or  { range: \"B2:D9\" }" },
        selectCell: { label: "Select a cell", help: "Selects a cell by its address.", example: "\"C5\"  or  { address: \"C5\" }" },
        scrollToCell: { label: "Scroll to a cell", help: "Brings a cell into view.", example: "\"C500\"  or  { address: \"C500\" }" },
        save: { label: "Save the staged edits", help: "Staged mode: sends the changed cells (On Save) and makes the edits final." },
        discard: { label: "Discard the staged edits", help: "Staged mode: throws the waiting edits away." },
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
        _populated = { map: new Map(), blocks: [] };
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

        propsChanged() { this._prepare(); }

        mounted() {
            // one listener for the whole life of the grid: a drag that ends outside the grid still ends
            this.listen(window, "mouseup", () => { this._dragging = ""; });
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
            this._preparePopulate(p, size);
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
            const config = JSON.stringify(items.map((i) => [i.at, i.enabled, i.direction, i.header, i.fields, i.limit])) + "|" + size.rows + "," + size.cols;
            const same = config === this._popConfig && items.length === this._popValues.length && items.every((i, k) => i.value === this._popValues[k]);
            if (same) return;
            this._popConfig = config;
            this._popValues = items.map((i) => i.value);
            this._populated = populatedCells(items, size.rows, size.cols);
            this._populated.map.forEach((v, k) => { this._edits.delete(k); stageDrop(this._stage, k); });
        }

        _mode() { return (this.p || {}).mode === "editable" ? "editable" : "readonly"; }
        _staged() { return (this.p || {}).editMode === "staged"; }
        _designing() { return this.isEditor && this.hasAttribute("data-interactive"); }

        _layers() { return { cells: this._cells, populated: this._populated.map, edits: this._edits }; }
        _baseValue(r, c) { return valueAt(this._layers(), r, c); }
        _value(r, c) { return stageValue(this._stage, cellKey(r, c), "v", this._baseValue(r, c)); }
        _fields(r, c) { return fieldsAt(this._rules, r, c); }
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
            const rh = Math.max(16, Number(p.rowHeight) || 28), cw = Math.max(24, Number(p.colWidth) || 110);
            const rowOver = {};
            const heights = p.rowHeights && typeof p.rowHeights === "object" ? p.rowHeights : {};
            Object.keys(heights).forEach((k) => { const i = Number(k) - 1 - area.r1; const v = Number(heights[k]); if (i >= 0 && i < nR && isFinite(v) && v >= 0) rowOver[i] = v; });
            const widths = [];
            const wmap = p.colWidths && typeof p.colWidths === "object" ? p.colWidths : {};
            for (let c = area.c1; c <= area.c2; c++) { const v = Number(wmap[colName(c)]); widths.push(isFinite(v) && v >= 0 && wmap[colName(c)] !== undefined ? v : cw); }
            const heads = p.showHeaders !== false;
            const hh = heads ? HEAD_H : 0;
            const rn = heads ? 1 : 0;
            const rowHeadW = heads ? Math.max(38, 14 + 8 * String(area.r2 + 1).length) : 0;
            const colAxis = sizesAxis((rn ? [rowHeadW] : []).concat(widths));
            const rowAxis = uniformAxis(nR, rh, rowOver);
            const F = this._freeze.rows, FC = this._freeze.cols + rn;
            const frozenW = colAxis.offsetOf(FC), frozenRowsH = rowAxis.offsetOf(F);
            const W = Math.max(this.size.w || this.clientWidth || 0, 0), H = Math.max(this.size.h || this.clientHeight || 0, 0);
            const inW = Math.max(0, W - 2), inH = Math.max(0, H - 2);                       // inside the border
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
        _content(spec, value, r, c, editable) {
            const ed = this._edit && this._edit.r === r && this._edit.c === c;
            if (ed) {
                const date = spec.type === "date";
                if (spec.type === "select" && spec.options.length) {
                    return html`<select class="ed" data-edit @change=${this._onEditChange}>${spec.options.map((o) => html`<option value=${o.value} ?selected=${String(value) === o.value}>${o.label}</option>`)}</select>`;
                }
                return html`<input class="ed" data-edit type=${date ? (spec.format === "date" ? "date" : "datetime-local") : "text"} .value=${date ? dateInputValue(spec, value) : this._edit.text} @input=${this._onEditInput}>`;
            }
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
            const value = this._value(r, c);
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
            const dirty = stageHas(this._stage, key, "v");
            const hatch = this.isEditor && this._mode() === "editable" && this._locked(r, c);
            const anchor = this.isEditor && this._populateAt && this._populateAt.has(key);
            const cls = ["cell", inSel ? "sel" : "", focus ? "focus" : "", hatch ? "hatch" : "", dirty ? "dirty" : "", anchor ? "pop" : ""].filter(Boolean).join(" ");
            return html`<div class=${cls} part="cell" data-r=${r} data-c=${c} style=${style} title=${anchor ? "Populated from a message: " + this._populateAt.get(key) : nothing}>${this._content(spec, value, r, c, editable)}</div>`;
        }

        _colHead(g, c, left) {
            const range = this._selRange;
            const act = !!range && c >= range.c1 && c <= range.c2;
            const w = g.colAxis.sizeOf(c - this._area.c1 + g.rn);
            return html`<div class="head ${act ? "act" : ""}" part="header" data-hc=${c} style="left:${left}px;top:0;width:${w}px;height:${g.hh}px">${colName(c)}</div>`;
        }

        _rowHead(g, r, top) {
            const range = this._selRange;
            const act = !!range && r >= range.r1 && r <= range.r2;
            const h = g.rowAxis.sizeOf(r - this._area.r1);
            return html`<div class="head ${act ? "act" : ""}" part="header" data-hr=${r} style="left:0;top:${top}px;width:${g.rowHeadW}px;height:${h}px">${r + 1}</div>`;
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
                headTL.push(html`<div class="head corner" part="header" style="left:0;top:0;width:${g.rowHeadW}px;height:${g.hh}px"></div>`);
                for (let j = 0; j < fCols; j++) headTL.push(this._colHead(g, a.c1 + j, g.colAxis.offsetOf(j + g.rn)));
                for (let ji = g.cols.from; ji < g.cols.to; ji++) { const j = ji - g.rn; if (j >= fCols && j < g.nC) headTR.push(this._colHead(g, a.c1 + j, g.colAxis.offsetOf(ji) - g.frozenW)); }
            }
            const F = g.F;
            const tl = F ? this._pane(g, 0, F, 0, fCols + g.rn, true, true) : [];
            const tr = F ? this._pane(g, 0, F, Math.max(g.cols.from, fCols + g.rn), g.cols.to, true, false) : [];
            const bl = g.FC ? this._pane(g, g.rows.from, g.rows.to, 0, g.FC, false, true) : [];
            const br = this._pane(g, g.rows.from, g.rows.to, Math.max(g.cols.from, g.FC), g.cols.to, false, false);
            const frozenTop = g.hh + g.frozenRowsH;
            const staged = this._staged() && stageCount(this._stage) > 0;
            return html`<div class="grid ${p.showGridLines === false ? "nolines" : ""}" part="root" tabindex="0" role="grid" aria-rowcount=${g.nR} aria-colcount=${g.nC}
                @mousedown=${this._onMouseDown} @mouseover=${this._onMouseOver} @click=${this._onClick} @dblclick=${this._onDblClick} @keydown=${this._onKey} @copy=${this._onCopy} @change=${this._onChange} @focusout=${this._onFocusOut}>
                <div class="pane" style="left:0;top:0;width:${g.frozenW}px;height:${frozenTop}px"><div class="inner">${headTL}${tl}</div></div>
                <div class="pane" style="left:${g.frozenW}px;top:0;width:${g.viewW}px;height:${frozenTop}px"><div class="inner" data-pane="tr" style="transform:translateX(${-sl}px)">${headTR}${tr}</div></div>
                <div class="pane" style="left:0;top:${frozenTop}px;width:${g.frozenW}px;height:${g.viewH}px"><div class="inner" data-pane="bl" style="transform:translateY(${-st}px)">${bl}</div></div>
                <div class="scroller" data-scroller style="left:${g.frozenW}px;top:${frozenTop}px;right:0;bottom:0" @scroll=${this._onScroll}>
                    <div class="sizer" style="width:${g.scrollW}px;height:${g.scrollH}px">${br}</div>
                </div>
                ${staged ? html`<div class="staged"><span>${stageCount(this._stage)} unsaved</span><button type="button" data-staged="save">Save</button><button type="button" class="ghost" data-staged="discard">Discard</button></div>` : nothing}
            </div>`;
        }

        updated(changed) {
            super.updated(changed);
            // the SDK turns pointer events off in editor mode so that the canvas takes the clicks; the Edit grid dialog hosts the grid to click on it
            if (this.hasAttribute("data-interactive")) this.style.pointerEvents = "auto";
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
            if (!this._dragging || !(e.buttons & 1)) return;
            if (this._dragging === "cells") { const hit = this._at(e); if (hit) this._select(extendTo(this._sel, hit.r, hit.c)); return; }
            const head = this._headAt(e);
            if (this._dragging === "cols" && head && head.col !== undefined) this._selectColumns(this._sel.anchor.c, head.col);
            if (this._dragging === "rows" && head && head.row !== undefined) this._selectRows(this._sel.anchor.r, head.row);
        }

        _onClick(e) {
            const staged = e.target.closest("[data-staged]");
            if (staged) { if (staged.dataset.staged === "save") this.save(); else this.discard(); return; }
            const hit = this._at(e);
            if (!hit) return;
            const spec = cellSpec(this._fields(hit.r, hit.c));
            const act = e.target.closest("[data-act]");
            const value = this._value(hit.r, hit.c);
            const address = addressOf(hit.r, hit.c);
            if (act && act.dataset.act === "toggle" && this._editable(hit.r, hit.c)) this._applyEdit(hit.r, hit.c, !(value === true || value === "true" || value === 1));
            else if (act && act.dataset.act === "button") this.fire("buttonClick", { address, action: spec.action || address, value });
            this.fire("cellClick", { address, value });
        }

        _onDblClick(e) {
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
            const spec = cellSpec(this._fields(r, c)), value = this._value(r, c);
            if (spec.type === "boolean") { this._applyEdit(r, c, !(value === true || value === "true" || value === 1)); return true; }
            this._edit = { r, c, text: firstChar !== null ? firstChar : (value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)) };
            this._focusEdit = true;
            this.requestUpdate();
            return true;
        }

        _editText() {
            const input = this.renderRoot.querySelector("[data-edit]");
            return input ? input.value : this._edit ? this._edit.text : "";
        }

        _onEditInput(e) { if (this._edit) this._edit.text = e.target.value; }
        _onEditChange(e) { if (this._edit && e.target.tagName === "SELECT") this._commitEdit(e.target.value); }

        _commitEdit(text) {
            const ed = this._edit;
            if (!ed) return;
            this._edit = null;
            this._applyEdit(ed.r, ed.c, text);
            this.requestUpdate();
        }

        _cancelEdit() { this._edit = null; this.requestUpdate(); }

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
            const key = cellKey(r, c), address = addressOf(r, c);
            const old = this._value(r, c), value = coerceEdit(spec, input);
            if (JSON.stringify(old) === JSON.stringify(value)) return;
            if (this._designing()) {
                this.dispatchEvent(new CustomEvent("nexa-cell-edit", { detail: { address, value }, bubbles: true, composed: true }));
                return;
            }
            if (this.isEditor) return;
            if (this._staged()) stageSet(this._stage, key, "v", value, this._baseValue(r, c));
            else this._edits.set(key, value);
            this.requestUpdate();
            this.fire("cellChange", { address, old, new: value, staged: this._staged() });
        }

        _focusGrid() { const g = this.renderRoot.querySelector(".grid"); if (g) g.focus({ preventScroll: true }); }

        _ensureVisible(r, c) {
            const g = this._geo, s = this.renderRoot.querySelector("[data-scroller]");
            if (!g || !s) return;
            const i = r - this._area.r1, j = c - this._area.c1;
            if (i >= g.F) s.scrollTop = scrollToShow(g.rowAxis, i, s.scrollTop, g.viewH, g.F);
            if (j + g.rn >= g.FC) s.scrollLeft = scrollToShow(g.colAxis, j + g.rn, s.scrollLeft, g.viewW, g.FC);
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
                if (e.key === "Enter") { e.preventDefault(); const p = at(); this._commitEdit(e.target.value); this._moveBy(1, 0, p.r, p.c); }
                else if (e.key === "Tab") { e.preventDefault(); const p = at(); this._commitEdit(e.target.value); this._moveBy(0, e.shiftKey ? -1 : 1, p.r, p.c); }
                else if (e.key === "Escape") { e.preventDefault(); this._cancelEdit(); this._focusGrid(); }
                return;
            }
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

        _commitSelection(sel) {
            this._select(sel);
            const f = sel.focus;
            if (f) this._ensureVisible(f.r, f.c);
        }

        _onCopy(e) {
            const range = this._selRange;
            if (!range || !e.clipboardData || (e.target.closest && e.target.closest("input, select"))) return;
            e.clipboardData.setData("text/plain", rangeToTsv(range, (r, c) => displayText(cellSpec(this._fields(r, c)), this._value(r, c))));
            e.preventDefault();
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
            this.requestUpdate();
        }

        setRange(params) {
            const p = params && typeof params === "object" ? params : {};
            const at = parseAddress(p.at);
            if (!at) return;
            const done = expandPopulate(p.values, { at, direction: p.direction === "right" ? "right" : "down", header: p.header === true, fields: parseFields(p.fields), limit: p.limit }, this._size);
            done.cells.forEach((x) => { this._edits.set(cellKey(x.r, x.c), x.v); stageDrop(this._stage, cellKey(x.r, x.c)); });
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

        save() {
            const cells = [];
            this._stage.edits.forEach((fields, key) => {
                const [r, c] = key.split(",").map(Number);
                cells.push({ address: addressOf(r, c), old: this._baseValue(r, c), new: fields.v });
                this._edits.set(key, fields.v);
            });
            if (!cells.length) return;
            stageClear(this._stage);
            this.requestUpdate();
            this.fire("save", { cells });
        }

        discard() {
            const count = stageCount(this._stage);
            if (!count) return;
            stageClear(this._stage);
            this.requestUpdate();
            this.fire("discard", { count });
        }

        getData() {
            const keys = new Set([...this._cells.keys(), ...this._populated.map.keys(), ...this._edits.keys()]);
            const cells = {};
            let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
            keys.forEach((k) => {
                const [r, c] = k.split(",").map(Number);
                const v = this._baseValue(r, c);
                if (v === null || v === undefined || v === "") return;
                cells[addressOf(r, c)] = v;
                if (r < r1) r1 = r; if (r > r2) r2 = r; if (c < c1) c1 = c; if (c > c2) c2 = c;
            });
            this.fire("data", { cells, range: r2 < 0 ? "" : rangeText({ r1, c1, r2, c2 }) });
        }
    }
});
