// Nexa UI — Data Grid: a grid of cells for data that comes in as messages. The rows are an array of objects (or an array of arrays); the
// columns are designed (or derived from the data); a cell is text, a number, a checkbox, a choice, a date, a badge, a progress bar, a link,
// an image, a button or an input. Merged cells, frozen rows and columns, borders. Only the cells in view are drawn (virtual scrolling), so
// 100 000 rows scroll as smoothly as ten. On a live page the cells can be edited or read-only, and single cells, rows and columns can be locked.
//
// The model is in the files beside this one (columns, rows, layout, window, stage, selection): plain functions, tested in Node
// (test/data-grid-pure.test.js). This file is the view: it reads the props, keeps the rows, draws the window and handles the user.
import { html, css, nothing, theme } from "../../../nexa-sdk/nexa-component-sdk.js";
import { BASE_CSS, UIElement, PREFIX, part, sizeProp, paletteProp, radiusProp, icon, defineUI } from "../core.js";
import { columnsOf, displayText, badgePalette, coerceEdit, dateInputValue, sampleRows, EDITABLE_TYPES } from "./columns.js";
import { COLUMN_FIELDS } from "./column-fields.js";
import { openGridEditor, summaryOf } from "./editor.js";
import { normalizeData, createStore, storeSet, storePatch, storeUpsert, storeAppend, storeRemove, positionOf, viewIndex, compileFilter, nextSort } from "./rows.js";
import { normalizeFreeze, normalizeMerges, normalizeBorders, buildEdges, boxBorders, normalizeLocks, cellEditable, mergeOf, isCovered } from "./layout.js";
import { uniformAxis, sizesAxis, visibleRange, scrollToShow } from "./window.js";
import { createStage, stageSet, stageValue, stageHas, stageRows, stageCount, stageClear, stageDrop } from "./stage.js";
import { noSelection, selectCell, extendTo, rangeOf, growToMerges, moveFocus, rangeToTsv } from "./selection.js";

export const CATEGORY_DATA = "UI · Data";

const FILTER_ROW = 34;          // the filter inputs under the column names, when filtering is on
const ROW_NUMBER_WIDTH = 52;
const MAX_ROWS_IN_EVENT = 500;  // a selection of more rows sends their keys only, not the rows

// what the editor shows while no data is bound: decoration for the design, never data (see the chip)
const SAMPLE_ROWS = [
    { id: "P-101", name: "Mixer 1", status: "running", temp: 71.4, enabled: true, load: 64 },
    { id: "P-102", name: "Mixer 2", status: "stopped", temp: 24.9, enabled: false, load: 0 },
    { id: "P-103", name: "Pump A", status: "running", temp: 55.2, enabled: true, load: 88 },
    { id: "P-104", name: "Pump B", status: "fault", temp: 93.8, enabled: true, load: 12 },
    { id: "P-105", name: "Filler", status: "running", temp: 38.1, enabled: true, load: 47 },
    { id: "P-106", name: "Capper", status: "stopped", temp: 22.3, enabled: false, load: 0 },
    { id: "P-107", name: "Labeller", status: "running", temp: 41.7, enabled: true, load: 73 },
    { id: "P-108", name: "Packer", status: "running", temp: 36.0, enabled: true, load: 59 }
];

const SAMPLE_MARK = {};      // stands for "the sample rows are loaded" in _lastData

const safeUrl = (v) => { const t = String(v === undefined || v === null ? "" : v).trim(); return /^(https?:|mailto:|tel:|\/|\.\/|#|data:image\/)/i.test(t) ? t : ""; };
const safeName = (n) => String(n || "").replace(/[^A-Za-z0-9_-]/g, "");
const copyRow = (row) => Object.assign({}, row);

// a badge in a palette of the theme: its CSS variables (they follow light / dark), with the value in the current mode as the fallback
function paletteStyle(name) {
    const bg = theme.token(`colors.${name}.subtle`), fg = theme.token(`colors.${name}.fg`);
    return `background: var(--nexa-colors-${name}-subtle${bg !== undefined ? ", " + bg : ""}); color: var(--nexa-colors-${name}-fg${fg !== undefined ? ", " + fg : ""})`;
}

const DATA_GRID_CSS = css`
    :host { display: block; width: 100%; height: 100%; min-width: 0; --row-h: 36px; --head-h: 40px; }
    .grid { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--bg); color: var(--fg); border: 1px solid var(--bd); border-radius: var(--r);
        font-size: var(--fs); outline: none; user-select: none; }
    .grid:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
    .pane { position: absolute; overflow: hidden; }
    .pane > .inner { position: absolute; left: 0; top: 0; will-change: transform; }
    .scroller { position: absolute; overflow: auto; overscroll-behavior: contain; }
    .sizer { position: relative; }
    .cell, .head { position: absolute; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; padding: 0 12px; gap: 6px;
        border-right: 1px solid var(--bd); border-bottom: 1px solid var(--bd); background: var(--bg); white-space: nowrap; }
    .cell.alt { background: var(--bg-subtle); }
    .cell.hatch { background-image: repeating-linear-gradient(135deg, transparent 0 5px, var(--bd) 5px 6px); }
    .cell:hover { background: var(--bg-muted); }
    .cell.sel { background: var(--cp-subtle, #d0e2ff); }
    .cell.focus { outline: 2px solid var(--ring); outline-offset: -2px; z-index: 1; }
    .cell.locked .t { color: var(--fg); }
    .cell.dirty::after { content: ""; position: absolute; top: 0; right: 0; border-style: solid; border-width: 0 7px 7px 0; border-color: transparent var(--cp-solid, #0f62fe) transparent transparent; }
    .cell.rownum { justify-content: center; padding: 0; color: var(--fg-muted); font-family: var(--mono); font-size: 12px; background: var(--bg-subtle); }
    .cell.left { justify-content: flex-start; }
    .cell.center { justify-content: center; }
    .cell.right { justify-content: flex-end; }
    .t { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .num { font-family: var(--mono); font-variant-numeric: tabular-nums; letter-spacing: 0; }
    .head { flex-direction: column; align-items: stretch; justify-content: flex-start; padding: 0; background: var(--bg-muted); border-bottom: 1px solid var(--bd-strong); font-weight: 600; font-size: var(--fs-label); letter-spacing: 0.32px; }
    .head .hl { display: flex; align-items: center; gap: 6px; padding: 0 12px; flex: 0 0 var(--head-h); min-width: 0; cursor: default; }
    .head.sortable .hl { cursor: pointer; }
    .head.sortable .hl:hover { background: var(--bg-emph); }
    .head .hl .t { flex: 1 1 auto; }
    .head .hl .icon { color: var(--cp-solid, #0f62fe); }
    .head.right .hl .t { text-align: right; }
    .head.center .hl .t { text-align: center; }
    .head.rownum { background: var(--bg-muted); }
    .head .flt { flex: 0 0 ${FILTER_ROW}px; padding: 4px 6px; border-top: 1px solid var(--bd); }
    .head .flt input { width: 100%; height: 100%; box-sizing: border-box; border: none; border-bottom: 1px solid var(--bd-strong); background: var(--bg); color: var(--fg);
        font: inherit; font-weight: 400; padding: 0 6px; outline: none; }
    .head .flt input:focus { box-shadow: inset 0 0 0 2px var(--ring); }
    .cb { width: 16px; height: 16px; box-sizing: border-box; border: 1px solid var(--bd-strong); border-radius: 2px; display: inline-flex; align-items: center; justify-content: center; background: var(--bg); }
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
    .in, .ed { box-sizing: border-box; width: 100%; height: 100%; border: none; background: var(--bg-subtle); color: var(--fg); font: inherit; padding: 0 8px; outline: none; border-bottom: 1px solid var(--bd-strong); }
    .ed { background: var(--bg); box-shadow: inset 0 0 0 2px var(--ring); border-bottom: none; }
    .in[readonly] { background: transparent; border-bottom-color: transparent; }
    .empty { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; color: var(--fg-muted); pointer-events: none; padding: 16px; text-align: center; }
    .sample-badge { position: absolute; right: 8px; bottom: 8px; z-index: 5; background: var(--bg-emph); color: var(--fg-muted); font-size: 11px; padding: 2px 8px; border-radius: 10px; pointer-events: none; opacity: 0.9; }
    .staged { position: absolute; right: 8px; bottom: 8px; z-index: 5; display: flex; gap: 6px; align-items: center; background: var(--panel); border: 1px solid var(--bd); border-radius: var(--r); padding: 4px 8px; font-size: 12px; }
    .staged button { all: unset; cursor: pointer; padding: 2px 10px; border-radius: var(--r); background: var(--cp-solid, #0f62fe); color: var(--cp-contrast, #fff); }
    .staged button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--bd-strong); }
`;

const textProp = (label, d, group, extra) => Object.assign({ type: "string", default: d, label, group: group || "Data" }, extra || {});

export const dataGrid = defineUI({
    id: PREFIX + "data-grid",
    label: "Data Grid",
    category: CATEGORY_DATA,
    icon: "fa fa-th",
    size: { w: 640, h: 360 },
    capabilities: { resizable: true, rotatable: false, flippable: false, lockable: true },
    help: "A grid for data that comes in as messages: typed cells (text, number, checkbox, choice, date, badge, progress, link, image, button, input), merged cells, frozen rows and columns, borders, sorting, filtering, selection. Only the cells in view are drawn, so very large data stays smooth. Editable or read-only on the live page, with locks per column, row or cell.",
    version: 1,
    css: "",
    groups: ["Columns", "Data", "Editing", "Layout", "Display", "Style"],
    properties: {
        editGrid: { type: "action", group: "Columns", label: "Edit grid",
            info: (p) => summaryOf(p),
            help: "Opens the grid with a toolbar: select cells and merge them, freeze rows and columns, draw borders, lock or open cells; design the columns beside it. Nothing changes until Apply.",
            buttons: [{ label: "Edit grid…", icon: "fa fa-table", title: "Merge, freeze, borders, locks and columns, on the real grid", run: (p, api) => openGridEditor(p, api) }] },
        columns: { type: "list", default: [], group: "Columns", label: "Columns", noun: "column", itemLabel: "label",
            help: "Empty: the columns come from the data (the keys of the first rows).", item: { row: true, fields: COLUMN_FIELDS, create: (items) => ({ key: "field" + (items.length + 1), label: "Column " + (items.length + 1) }) } },
        rowKey: textProp("Row key (field)", "", "Data", { help: "The field that identifies a row (an id). With it a message can change one row without sending all of them. Empty = the position." }),
        mode: { type: "enum", default: "readonly", group: "Editing", label: "Mode", style: "segmented", options: [{ value: "editable", label: "Editable" }, { value: "readonly", label: "Read only" }],
            help: "Read only: nothing can be edited, whatever is unlocked. Editable: columns, rows and cells can still be locked. Bind it to change it while the page runs." },
        editMode: { type: "enum", default: "instant", group: "Editing", label: "Edits", style: "segmented", options: [{ value: "instant", label: "Instant" }, { value: "staged", label: "Staged (Save / Discard)" }],
            help: "Instant: every change goes out at once. Staged: changes wait, marked in the cell, until Save (the changed rows go out) or Discard." },
        lockField: textProp("Locked-row field", "", "Editing", { help: "A field of the row's data: when it is true, that row cannot be edited." }),
        locks: { type: "json", default: [], group: "Editing", label: "Locked / open cells", help: "A list of { r1, c1, r2, c2, locked } (rows and columns counted from 0, in the order shown). A cell here wins over its row and column." },
        merges: { type: "json", default: [], group: "Layout", label: "Merged cells", help: "A list of { r1, c1, r2, c2 }. With a merged body cell, sorting and filtering are off (the rows under a merge must stay where they are)." },
        borders: { type: "json", default: [], group: "Layout", label: "Borders", help: "A list of { r1, c1, r2, c2, sides, style, width, color }. sides: all, outer, inner, top, right, bottom, left, inner-h, inner-v." },
        freezeRows: { type: "number", default: 0, min: 0, group: "Layout", label: "Frozen rows", help: "The first rows stay in place while the rest scrolls." },
        freezeCols: { type: "number", default: 0, min: 0, group: "Layout", label: "Frozen columns", help: "The first columns stay in place while the rest scrolls." },
        rowHeight: { type: "number", default: 36, min: 20, max: 120, unit: "px", group: "Layout", label: "Row height" },
        headerHeight: { type: "number", default: 40, min: 20, max: 120, unit: "px", group: "Layout", label: "Header height" },
        showHeader: { type: "boolean", default: true, group: "Display", label: "Show the header" },
        showRowNumbers: { type: "boolean", default: false, group: "Display", label: "Show row numbers" },
        selection: { type: "enum", default: "cell", group: "Display", label: "Selection", style: "select",
            options: [{ value: "none", label: "None" }, { value: "cell", label: "Cell" }, { value: "row", label: "Row" }, { value: "range", label: "Range of cells" }] },
        sortable: { type: "boolean", default: true, group: "Display", label: "Sorting (click a title)" },
        filterable: { type: "boolean", default: false, group: "Display", label: "Filtering (a box under each title)" },
        emptyText: { type: "string", default: "No data", group: "Display", label: "Text when there is no data" },
        size: sizeProp("md"),
        colorPalette: paletteProp(),
        radius: radiusProp("md")
    },
    inputs: {
        data: { type: "any", label: "Data (rows)", throttle: 50, help: "An array of objects, or an array of arrays (the first is the column names). A new value replaces all the rows." },
        columns: { type: "any", label: "Columns (override)", help: "An array of column objects: it replaces the Columns list while it has a value." }
    },
    events: {
        cellChange: { label: "On Cell Change (the user edited a cell)", payload: { rowKey: "string", col: "string", old: "any", new: "any", row: "object", staged: "boolean" } },
        rowChange: { label: "On Row Change (instant mode)", payload: { rowKey: "string", row: "object", changed: "object" } },
        save: { label: "On Save (staged mode)", payload: { rows: "array" } },
        discard: { label: "On Discard (staged mode)", payload: { count: "number" } },
        selectionChange: { label: "On Selection Change", payload: { cell: "object", range: "object", rowKeys: "array", rows: "array" } },
        cellClick: { label: "On Cell Click", payload: { rowKey: "string", col: "string", value: "any", row: "object" } },
        rowClick: { label: "On Row Click", payload: { rowKey: "string", row: "object" } },
        buttonClick: { label: "On Button Click", payload: { rowKey: "string", action: "string", col: "string", row: "object" } },
        sortChange: { label: "On Sort Change", payload: { sort: "array" } },
        filterChange: { label: "On Filter Change", payload: { filters: "object" } },
        data: { label: "On Data (after Get data)", payload: { rows: "array", count: "number" } }
    },
    actions: {
        setData: { label: "Replace all rows", help: "Puts new rows in the grid (what the Data input does, from Logic).", example: "[{ id: 1, name: \"A\" }, …]" },
        upsertRows: { label: "Add or change rows by key", help: "A row whose key is already there is merged into it; a new key is added at the end. Needs the Row key.", example: "[{ id: 7, temp: 41.2 }, …]" },
        patchRow: { label: "Change one row", help: "Changes some fields of one row.", example: "{ key: \"P-101\", fields: { temp: 70 } }  (or { id: \"P-101\", temp: 70 } with a Row key)" },
        removeRow: { label: "Remove a row", help: "Takes a row out by its key.", example: "\"P-101\"  or  { key: \"P-101\" }" },
        appendRow: { label: "Add a row at the end", help: "Adds one row.", example: "{ id: 9, name: \"New\" }" },
        clear: { label: "Remove all rows" },
        setCell: { label: "Set one cell", help: "Changes one field of one row, as if the user had edited it, but without an event.", example: "{ key: \"P-101\", col: \"temp\", value: 70 }" },
        selectCell: { label: "Select a cell", help: "Selects a cell by its place (rows and columns from 0, in the order shown).", example: "{ row: 3, col: 1 }" },
        scrollToRow: { label: "Scroll to a row", help: "Brings a row into view by its key (or a position).", example: "\"P-101\"  or  { row: 250 }" },
        save: { label: "Save the staged edits", help: "Staged mode: sends the changed rows (On Save) and makes the edits final." },
        discard: { label: "Discard the staged edits", help: "Staged mode: throws the waiting edits away." },
        getData: { label: "Send all the rows out", help: "Fires On Data with every row (the staged edits are not in it until saved)." }
    },
    parts: {
        root: part("Grid", "root"), header: part("Header cell", "header"), cell: part("Cell", "cell"), button: part("Button in a cell", "button"), badge: part("Badge in a cell", "badge")
    },
    view: class extends UIElement {
        static styles = [BASE_CSS, DATA_GRID_CSS];

        // The host calls propsChanged() while the base constructor runs, and the field initialisers below run after it, so what that first
        // call set would be reset. _prepare() is therefore also called from render(), and it only does work when its inputs changed.
        _store = createStore([], "");
        _stage = createStage();
        _cols = [];                 // the columns shown (hidden ones left out)
        _view = [];                 // positions in the store, in the order shown
        _sort = [];
        _filters = {};              // { key: text }
        _tests = {};                // { key: compiled filter }
        _merges = [];
        _edges = { h: new Map(), v: new Map() };
        _locks = [];
        _freeze = { rows: 0, cols: 0 };
        _geo = null;
        _scroll = { left: 0, top: 0 };
        _sbw = 0;
        _sbh = 0;
        _sel = noSelection();
        _selSig = "";
        _edit = null;               // { r, c, text } while a cell is being edited
        _dragging = false;
        _lastData = undefined;
        _lastRowKey = null;
        _loads = 0;                 // grows when rows come from outside: the shown order is made again
        _viewSig = "";
        _layoutSig = "";
        _sample = false;
        _focusEdit = false;
        _colSig = null;
        _sampleSig = "";
        _positional = false;      // a merge in the body pins the rows: no sorting or filtering
        _filterRow = false;
        _selRange = null;

        propsChanged() { this._prepare(); }

        mounted() {
            // one listener for the whole life of the grid: a drag that ends outside the grid still ends
            this.listen(window, "mouseup", () => { this._dragging = false; });
        }

        // ---- reading the props and the data ------------------------------------------------------------------
        _prepare() {
            const p = this.p || {};
            const rowKey = p.rowKey || "";
            const bound = this.status("data").bound;
            const incoming = bound ? this.in.data : undefined;
            this._sample = false;
            if (bound) {
                if (incoming !== null && incoming !== undefined && (incoming !== this._lastData || rowKey !== this._lastRowKey)) this._load(normalizeData(incoming), rowKey);
                else if (rowKey !== this._lastRowKey) this._load(this._store.rows, rowKey);
                this._lastData = incoming;
            } else if (this.isEditor) {
                // the design canvas: sample rows, decoration only (they are never in the data, the events or an export)
                // with columns designed, the sample has a value for each of them (so a column of buttons or badges shows what it will look like)
                this._sample = true;
                const designed = Array.isArray(p.columns) && p.columns.length > 0;
                const sig = designed ? JSON.stringify(p.columns) : "";
                if (this._lastData !== SAMPLE_MARK || sig !== this._sampleSig || rowKey !== this._lastRowKey) {
                    this._sampleSig = sig;
                    this._load(designed ? sampleRows(columnsOf(p.columns, []), 8) : SAMPLE_ROWS, rowKey);
                }
                this._lastData = SAMPLE_MARK;
            } else if (rowKey !== this._lastRowKey) {
                this._load(this._store.rows, rowKey);
            }
            this._lastRowKey = rowKey;

            const rawCols = this.status("columns").bound && Array.isArray(this.in.columns) ? this.in.columns : p.columns;
            const colSig = JSON.stringify(rawCols) + "|" + (Array.isArray(rawCols) && rawCols.length ? "" : this._store.rows.length > 0 ? Object.keys(this._store.rows[0] || {}).join(",") : "");
            if (colSig !== this._colSig) {
                this._colSig = colSig;
                this._cols = columnsOf(rawCols, this._store.rows).filter((c) => !c.hidden);
            }

            // sorting and filtering are off while a body merge pins the rows in place
            const merged = normalizeMerges(p.merges, Number.MAX_SAFE_INTEGER, this._cols.length, { rows: 0, cols: 0 }).merges.length > 0;
            this._positional = merged;
            const sortOn = p.sortable !== false && !merged, filterOn = !!p.filterable && !merged;
            this._filterRow = filterOn;
            if (!sortOn && this._sort.length) this._sort = [];
            const filterSig = JSON.stringify(this._filters);
            const viewSig = [this._loads, this._store.rows.length, JSON.stringify(this._sort), filterOn ? filterSig : "", this._colSig].join("|");
            if (viewSig !== this._viewSig) {
                this._viewSig = viewSig;
                const colOf = (key) => this._cols.find((c) => c.key === key);
                this._tests = {};
                if (filterOn) Object.keys(this._filters).forEach((k) => {
                    const col = colOf(k);
                    if (col) this._tests[k] = compileFilter(this._filters[k], col.type, (v) => displayText(col, v));
                });
                this._view = viewIndex(this._store, colOf, this._sort, this._tests);
            }

            const rowCount = this._view.length, colCount = this._cols.length;
            const layoutSig = [JSON.stringify(p.merges), JSON.stringify(p.borders), JSON.stringify(p.locks), p.freezeRows, p.freezeCols, rowCount, colCount].join("|");
            if (layoutSig !== this._layoutSig) {
                this._layoutSig = layoutSig;
                this._freeze = normalizeFreeze(p.freezeRows, p.freezeCols, rowCount, colCount);
                this._merges = normalizeMerges(p.merges, rowCount, colCount, this._freeze).merges;
                this._edges = buildEdges(normalizeBorders(p.borders));
                this._locks = normalizeLocks(p.locks);
            }
        }

        _load(rows, rowKey) {
            this._store = createStore(rows, rowKey);
            stageClear(this._stage);
            this._loads++;
            this._edit = null;
            const r = rangeOf(this._sel);
            if (r && r.r1 >= rows.length) this._sel = noSelection();
        }

        get _rowCount() { return this._view.length; }
        _mode() { return (this.p || {}).mode === "editable" ? "editable" : "readonly"; }
        _staged() { return (this.p || {}).editMode === "staged"; }

        _row(r) { return this._store.rows[this._view[r]]; }
        _key(r) { return this._store.keys[this._view[r]]; }
        _value(r, c) {
            const row = this._row(r);
            if (!row) return undefined;
            const col = this._cols[c];
            return stageValue(this._stage, this._key(r), col.key, row[col.key]);
        }
        _rowLocked(r) { const f = (this.p || {}).lockField; const row = this._row(r); return !!(f && row && row[f]); }
        _editable(r, c) {
            const col = this._cols[c];
            return !!col && EDITABLE_TYPES.indexOf(col.type) !== -1 && cellEditable(this._mode(), col.editable, this._rowLocked(r), this._locks, r, c);
        }
        _rowObject(r) {
            // the row as the user sees it: staged edits on top
            const row = this._row(r), key = this._key(r);
            const fields = this._stage.edits.get(key);
            return fields ? Object.assign({}, row, fields) : copyRow(row);
        }

        // ---- geometry -------------------------------------------------------------------------------------------
        _geometry() {
            const p = this.p || {};
            const rh = Math.max(20, Number(p.rowHeight) || 36);
            const headBase = p.showHeader === false ? 0 : Math.max(20, Number(p.headerHeight) || 40);
            const hh = headBase ? headBase + (this._filterRow ? FILTER_ROW : 0) : 0;
            const rn = p.showRowNumbers ? 1 : 0;
            const widths = (rn ? [ROW_NUMBER_WIDTH] : []).concat(this._cols.map((c) => c.width));
            const colAxis = sizesAxis(widths);
            const rowAxis = uniformAxis(this._rowCount, rh, {});
            const F = this._freeze.rows, FC = this._freeze.cols + rn;
            const frozenW = colAxis.offsetOf(FC), frozenRowsH = rowAxis.offsetOf(F);
            const W = Math.max(this.size.w || this.clientWidth || 0, 0), H = Math.max(this.size.h || this.clientHeight || 0, 0);
            const inW = Math.max(0, W - 2), inH = Math.max(0, H - 2);                       // inside the border
            const topH = hh + frozenRowsH;
            const viewW = Math.max(0, inW - frozenW - this._sbw), viewH = Math.max(0, inH - topH - this._sbh);
            const rows = visibleRange(rowAxis, this._scroll.top, viewH, 4, F);
            const cols = visibleRange(colAxis, this._scroll.left, viewW, 1, FC);
            return { rh, hh, headBase, rn, colAxis, rowAxis, F, FC, frozenW, frozenRowsH, topH, viewW, viewH, rows, cols,
                scrollW: Math.max(0, colAxis.total - frozenW), scrollH: Math.max(0, rowAxis.total - frozenRowsH) };
        }

        // ---- drawing ----------------------------------------------------------------------------------------------
        _cellBox(g, r, c, r2, c2, originLeft, originTop) {
            const x = g.colAxis.offsetOf(c + g.rn), x2 = g.colAxis.offsetOf(c2 + g.rn + 1);
            const y = g.rowAxis.offsetOf(r), y2 = g.rowAxis.offsetOf(r2 + 1);
            return { left: x - originLeft, top: y - originTop, width: x2 - x, height: y2 - y };
        }

        _content(col, value, r, c, editable) {
            const ed = this._edit && this._edit.r === r && this._edit.c === c;
            if (ed) {
                if (col.type === "select") {
                    return html`<select class="ed" data-edit @change=${this._onEditChange}>${col.options.map((o) => html`<option value=${o.value} ?selected=${String(value) === o.value}>${o.label}</option>`)}</select>`;
                }
                const date = col.type === "date";
                return html`<input class="ed" data-edit type=${date ? (col.format === "date" ? "date" : "datetime-local") : "text"} .value=${date ? dateInputValue(col, value) : this._edit.text} @input=${this._onEditInput}>`;
            }
            switch (col.type) {
                case "boolean": {
                    const on = value === true || value === "true" || value === 1;
                    return html`<span class="cb ${on ? "on" : ""}" data-act="toggle" role="checkbox" aria-checked=${on ? "true" : "false"}>${on ? icon("check") : nothing}</span>`;
                }
                case "badge": {
                    const pal = safeName(badgePalette(col, value));
                    const text = displayText(col, value);
                    return text === "" ? nothing : html`<span class="badge" part="badge" style=${pal ? paletteStyle(pal) : ""}>${text}</span>`;
                }
                case "progress": {
                    const n = Number(value);
                    if (value === null || value === undefined || value === "" || !isFinite(n)) return html`<span class="t"></span>`;
                    const pct = Math.max(0, Math.min(100, (n / col.max) * 100));
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
                    return html`<button class="btn" part="button" data-act="button" type="button" tabindex="-1">${col.buttonLabel || displayText(col, value) || col.label}</button>`;
                case "input":
                    return html`<input class="in" data-act="input" .value=${value === null || value === undefined ? "" : String(value)} ?readonly=${!editable} tabindex="-1">`;
                default:
                    return html`<span class="t ${col.type === "number" ? "num" : ""}">${displayText(col, value)}</span>`;
            }
        }

        _cell(g, r, c, box, merge) {
            const col = this._cols[c];
            const value = this._value(r, c);
            const editable = this._editable(r, c);
            const range = this._selRange;
            const inSel = !!range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
            const f = this._sel.focus;
            const focus = !!f && f.r === r && f.c === c && (this.p.selection !== "row");
            const r2 = merge ? merge.r2 : r, c2 = merge ? merge.c2 : c;
            const b = boxBorders(this._edges, r, c, r2, c2, this._rowCount, this._cols.length);
            const style = `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;` + Object.keys(b).map((k) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()) + ":" + b[k]).join(";");
            const dirty = stageHas(this._stage, this._key(r), col.key);
            const hatch = this.isEditor && this._mode() === "editable" && !editable && EDITABLE_TYPES.indexOf(col.type) !== -1;
            const cls = ["cell", col.align, inSel ? "sel" : "", focus ? "focus" : "", editable ? "" : "locked", hatch ? "hatch" : "", dirty ? "dirty" : "", r % 2 && !inSel ? "alt" : ""].filter(Boolean).join(" ");
            return html`<div class=${cls} part="cell" data-r=${r} data-c=${c} style=${style}>${this._content(col, value, r, c, editable)}</div>`;
        }

        _rownum(g, r, top) {
            return html`<div class="cell rownum" part="cell" data-r=${r} data-rn="1" style="left:0;top:${top}px;width:${ROW_NUMBER_WIDTH}px;height:${g.rh}px">${r + 1}</div>`;
        }

        _head(g, c, left) {
            const col = this._cols[c], sort = this._sort.find((s) => s.key === col.key);
            const sortable = this.p.sortable !== false && !this._positional && col.sortable;
            const filterable = this._filterRow && col.filterable;
            return html`<div class="head ${col.align} ${sortable ? "sortable" : ""}" part="header" data-hc=${c} style="left:${left}px;top:0;width:${col.width}px;height:${g.hh}px">
                <div class="hl" data-sort=${sortable ? "1" : "0"}><span class="t">${col.label}</span>${sort ? icon(sort.dir === "asc" ? "arrow-up" : "arrow-down") : nothing}</div>
                ${this._filterRow ? html`<div class="flt">${filterable ? html`<input data-filter=${col.key} .value=${this._filters[col.key] || ""} placeholder=${col.type === "number" ? ">5" : "…"} @input=${this._onFilterInput} aria-label=${"Filter " + col.label}>` : nothing}</div>` : nothing}
            </div>`;
        }

        _pane(g, rowsFrom, rowsTo, colsFrom, colsTo, frozenRows, frozenCols) {
            // the cells of one pane, in its own coordinates; a merge is drawn once, as one box, and the cells under it are skipped
            const originLeft = frozenCols ? 0 : g.frozenW;
            const originTop = frozenRows ? -g.hh : g.rowAxis.offsetOf(g.F);
            const out = [];
            const merges = this._merges.filter((m) => (frozenRows ? m.r1 < g.F : m.r1 >= g.F) && (frozenCols ? m.c1 < this._freeze.cols : m.c1 >= this._freeze.cols)
                && m.r1 <= rowsTo - 1 && m.r2 >= rowsFrom && m.c1 <= colsTo - 1 - g.rn && m.c2 >= colsFrom - g.rn);
            for (let r = rowsFrom; r < rowsTo; r++) {
                for (let ci = colsFrom; ci < colsTo; ci++) {
                    const c = ci - g.rn;
                    if (c < 0) { if (frozenCols && g.rn) out.push(this._rownum(g, r, g.rowAxis.offsetOf(r) - originTop)); continue; }
                    if (merges.length && mergeOf(merges, r, c)) continue;
                    const box = this._cellBox(g, r, c, r, c, originLeft, originTop);
                    out.push(this._cell(g, r, c, box, null));
                }
            }
            merges.forEach((m) => out.push(this._cell(g, m.r1, m.c1, this._cellBox(g, m.r1, m.c1, m.r2, m.c2, originLeft, originTop), m)));
            return out;
        }

        render() {
            this._prepare();
            const p = this.p || {};
            const g = this._geo = this._geometry();
            this._selRange = p.selection === "none" ? null : growToMerges(rangeOf(this._sel), this._merges);
            const sl = this._scroll.left, st = this._scroll.top;
            const fCols = this._freeze.cols;
            const nCols = this._cols.length;

            // header cells: the frozen columns in the corner, the others in the strip that follows the horizontal scroll
            const headTL = [], headTR = [];
            if (g.hh) {
                if (g.rn) headTL.push(html`<div class="head rownum" part="header" style="left:0;top:0;width:${ROW_NUMBER_WIDTH}px;height:${g.hh}px"></div>`);
                for (let c = 0; c < fCols; c++) headTL.push(this._head(g, c, g.colAxis.offsetOf(c + g.rn)));
                for (let ci = g.cols.from; ci < g.cols.to; ci++) { const c = ci - g.rn; if (c >= fCols && c < nCols) headTR.push(this._head(g, c, g.colAxis.offsetOf(ci) - g.frozenW)); }
            }
            const F = g.F, rowsTop = g.rowAxis.offsetOf(F);
            const tl = F ? this._pane(g, 0, F, 0, fCols + g.rn, true, true) : [];
            const tr = F ? this._pane(g, 0, F, Math.max(g.cols.from, fCols + g.rn), g.cols.to, true, false) : [];
            const bl = g.FC ? this._pane(g, g.rows.from, g.rows.to, 0, g.FC, false, true) : [];
            const br = this._pane(g, g.rows.from, g.rows.to, Math.max(g.cols.from, g.FC), g.cols.to, false, false);
            const frozenTop = g.hh + g.frozenRowsH;
            const total = this._rowCount;
            const staged = this._staged() && stageCount(this._stage) > 0;
            return html`<div class="grid" part="root" tabindex="0" role="grid" aria-rowcount=${total} aria-colcount=${nCols}
                @mousedown=${this._onMouseDown} @mouseover=${this._onMouseOver} @click=${this._onClick} @dblclick=${this._onDblClick} @keydown=${this._onKey} @copy=${this._onCopy} @change=${this._onChange} @focusout=${this._onFocusOut}
                style="--row-h:${g.rh}px;--head-h:${g.headBase}px">
                <div class="pane" style="left:0;top:0;width:${g.frozenW}px;height:${frozenTop}px"><div class="inner">${headTL}${tl}</div></div>
                <div class="pane" style="left:${g.frozenW}px;top:0;width:${g.viewW}px;height:${frozenTop}px"><div class="inner" data-pane="tr" style="transform:translateX(${-sl}px)">${headTR}${tr}</div></div>
                <div class="pane" style="left:0;top:${frozenTop}px;width:${g.frozenW}px;height:${g.viewH}px"><div class="inner" data-pane="bl" style="transform:translateY(${-st}px)">${bl}</div></div>
                <div class="scroller" data-scroller style="left:${g.frozenW}px;top:${frozenTop}px;right:0;bottom:0" @scroll=${this._onScroll}>
                    <div class="sizer" style="width:${g.scrollW}px;height:${g.scrollH}px">${br}</div>
                </div>
                ${total === 0 ? html`<div class="empty" style="top:${g.hh}px">${p.emptyText || ""}</div>` : nothing}
                ${this._sample && this.isEditor ? html`<div class="sample-badge" title="Only in the editor: the page shows your data (empty until it comes)">Sample data</div>` : nothing}
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

        _select(sel) {
            if (this.p.selection === "none") return;
            this._sel = sel;
            this.requestUpdate();
            this._announceSelection();
        }

        _announceSelection() {
            const range = this.p.selection === "none" ? null : growToMerges(rangeOf(this._sel), this._merges);
            const sig = range ? [range.r1, range.c1, range.r2, range.c2].join(",") : "";
            if (sig === this._selSig) return;
            this._selSig = sig;
            this.dispatchEvent(new CustomEvent("nexa-selection", { detail: { range }, bubbles: true, composed: true }));
            if (!range || !this._rowCount) { this.fire("selectionChange", { cell: null, range: null, rowKeys: [], rows: [] }); return; }
            const rowKeys = [], rows = [];
            for (let r = range.r1; r <= range.r2 && r < this._rowCount; r++) { rowKeys.push(this._key(r)); if (rows.length < MAX_ROWS_IN_EVENT) rows.push(this._rowObject(r)); }
            const f = this._sel.focus, col = f && this._cols[f.c];
            this.fire("selectionChange", { cell: f && col ? { rowKey: this._key(f.r), col: col.key } : null, range, rowKeys, rows: rowKeys.length > MAX_ROWS_IN_EVENT ? [] : rows });
        }

        _onMouseDown(e) {
            if (e.button !== 0) return;
            const hit = this._at(e);
            if (!hit || e.target.closest("[data-edit]") || e.target.closest("input, select")) return;
            if (this._edit) this._commitEdit(this._editText());
            const last = Math.max(0, this._cols.length - 1);
            if (this.p.selection === "row") this._select({ anchor: { r: hit.r, c: 0 }, focus: { r: hit.r, c: last } });
            else if (e.shiftKey && this.p.selection === "range") this._select(extendTo(this._sel, hit.r, hit.c));
            else this._select(selectCell(hit.r, hit.c));
            this._dragging = this.p.selection === "range";
        }

        _onMouseOver(e) {
            if (!this._dragging || !(e.buttons & 1)) return;
            const hit = this._at(e);
            if (hit) this._select(extendTo(this._sel, hit.r, hit.c));
        }

        _onClick(e) {
            const staged = e.target.closest("[data-staged]");
            if (staged) { if (staged.dataset.staged === "save") this.save(); else this.discard(); return; }
            const sorter = e.target.closest("[data-sort]");
            if (sorter) {
                const head = sorter.closest("[data-hc]");
                if (head && sorter.dataset.sort === "1") this._toggleSort(this._cols[Number(head.dataset.hc)].key);
                return;
            }
            const hit = this._at(e);
            if (!hit || hit.el.dataset.rn) return;
            const col = this._cols[hit.c];
            if (!col) return;
            const act = e.target.closest("[data-act]");
            const value = this._value(hit.r, hit.c);
            if (act && act.dataset.act === "toggle" && this._editable(hit.r, hit.c)) { this._applyEdit(hit.r, hit.c, !(value === true || value === "true" || value === 1)); }
            else if (act && act.dataset.act === "button") this.fire("buttonClick", { rowKey: this._key(hit.r), action: col.action, col: col.key, row: this._rowObject(hit.r) });
            this.fire("cellClick", { rowKey: this._key(hit.r), col: col.key, value, row: this._rowObject(hit.r) });
            this.fire("rowClick", { rowKey: this._key(hit.r), row: this._rowObject(hit.r) });
        }

        _onDblClick(e) {
            const hit = this._at(e);
            if (hit && !hit.el.dataset.rn && !e.target.closest("[data-act]") && this._editable(hit.r, hit.c)) this._startEdit(hit.r, hit.c, null);
        }

        _toggleSort(key) {
            this._sort = nextSort(this._sort, key);
            this.fire("sortChange", { sort: this._sort.map((s) => ({ key: s.key, dir: s.dir })) });
            this._viewSig = "";
            this.requestUpdate();
        }

        _onFilterInput(e) {
            const key = e.target.dataset.filter;
            if (e.target.value === "") delete this._filters[key]; else this._filters[key] = e.target.value;
            this.fire("filterChange", { filters: Object.assign({}, this._filters) });
            this._viewSig = "";
            this.requestUpdate();
        }

        // an <input> cell (always an input): its change is the edit
        _onChange(e) {
            const t = e.target;
            if (!t || !t.matches || !t.matches("input[data-act='input']")) return;
            const hit = this._at(e);
            if (hit && this._editable(hit.r, hit.c)) this._applyEdit(hit.r, hit.c, t.value);
        }

        _startEdit(r, c, firstChar) {
            if (this.isEditor || !this._editable(r, c)) return false;
            const col = this._cols[c], value = this._value(r, c);
            if (col.type === "boolean") { this._applyEdit(r, c, !(value === true || value === "true" || value === 1)); return true; }
            this._edit = { r, c, text: firstChar !== null ? firstChar : (value === null || value === undefined ? "" : String(value)) };
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

        /** A value the user put in a cell: staged, or written into the rows at once; the events say what changed. */
        _applyEdit(r, c, input) {
            if (this.isEditor || !this._editable(r, c)) return;
            const col = this._cols[c], key = this._key(r), row = this._row(r);
            if (!row) return;
            const old = this._value(r, c), value = coerceEdit(col, input);
            if (JSON.stringify(old) === JSON.stringify(value)) return;
            if (this._staged()) {
                stageSet(this._stage, key, col.key, value, row[col.key]);
            } else {
                storePatch(this._store, key, { [col.key]: value });
            }
            this.requestUpdate();
            this.fire("cellChange", { rowKey: key, col: col.key, old, new: value, row: this._rowObject(r), staged: this._staged() });
            if (!this._staged()) this.fire("rowChange", { rowKey: key, row: this._rowObject(r), changed: { [col.key]: value } });
        }

        _focusGrid() { const g = this.renderRoot.querySelector(".grid"); if (g) g.focus({ preventScroll: true }); }

        _ensureVisible(r, c) {
            const g = this._geo, s = this.renderRoot.querySelector("[data-scroller]");
            if (!g || !s) return;
            if (r >= g.F) s.scrollTop = scrollToShow(g.rowAxis, r, s.scrollTop, g.viewH, g.F);
            if (c + g.rn >= g.FC) s.scrollLeft = scrollToShow(g.colAxis, c + g.rn, s.scrollLeft, g.viewW, g.FC);
        }

        _onKey(e) {
            const ed = e.target && e.target.matches && e.target.matches("[data-edit]");
            if (ed) {
                if (e.key === "Enter") { e.preventDefault(); const r = this._edit.r, c = this._edit.c; this._commitEdit(e.target.value); this._moveBy(1, 0, r, c); }
                else if (e.key === "Tab") { e.preventDefault(); const r = this._edit.r, c = this._edit.c; this._commitEdit(e.target.value); this._moveBy(0, e.shiftKey ? -1 : 1, r, c); }
                else if (e.key === "Escape") { e.preventDefault(); this._cancelEdit(); this._focusGrid(); }
                return;
            }
            if (e.target.closest && e.target.closest("input, select, [data-filter]")) return;
            const rows = this._rowCount, cols = this._cols.length;
            if (!rows || !cols || this.p.selection === "none") return;
            const f = this._sel.focus || { r: 0, c: 0 };
            const extend = e.shiftKey && this.p.selection === "range";
            const page = Math.max(1, Math.floor((this._geo ? this._geo.viewH : 300) / (this._geo ? this._geo.rh : 36)) - 1);
            const move = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1], PageDown: [page, 0], PageUp: [-page, 0], Tab: [0, e.shiftKey ? -1 : 1] }[e.key];
            if (move) {
                const sel = this._sel.focus ? moveFocus(this._sel, move[0], move[1], rows, cols, this._merges, extend) : selectCell(0, 0);
                // Tab at the last cell (or first, with Shift) is not ours: it lets the user leave the grid
                if (e.key === "Tab" && this._sel.focus && sel.focus.r === f.r && sel.focus.c === f.c) return;
                e.preventDefault();
                this._commitSelection(this.p.selection === "row" ? { anchor: { r: sel.focus.r, c: 0 }, focus: { r: sel.focus.r, c: cols - 1 } } : sel);
            } else if (e.key === "Home" || e.key === "End") {
                e.preventDefault();
                const r = e.ctrlKey ? (e.key === "Home" ? 0 : rows - 1) : f.r, c = e.key === "Home" ? 0 : cols - 1;
                this._commitSelection(extend ? extendTo(this._sel, r, c) : selectCell(r, c));
            } else if (e.key === "Enter" || e.key === "F2") {
                e.preventDefault();
                if (!this._startEdit(f.r, f.c, null) && e.key === "Enter") this._moveBy(1, 0, f.r, f.c);
            } else if (e.key === " " && this._cols[f.c] && this._cols[f.c].type === "boolean") {
                e.preventDefault(); this._startEdit(f.r, f.c, null);
            } else if ((e.key === "Delete" || e.key === "Backspace") && this._editable(f.r, f.c) && this._cols[f.c].type !== "boolean") {
                e.preventDefault(); this._applyEdit(f.r, f.c, "");
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const t = this._cols[f.c] && this._cols[f.c].type;
                if ((t === "text" || t === "number") && this._startEdit(f.r, f.c, e.key)) e.preventDefault();
            } else if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey) && this.p.selection === "range") {
                e.preventDefault(); this._commitSelection({ anchor: { r: 0, c: 0 }, focus: { r: rows - 1, c: cols - 1 } });
            }
        }

        _moveBy(dr, dc, r, c) {
            const sel = moveFocus(selectCell(r, c), dr, dc, this._rowCount, this._cols.length, this._merges, false);
            this._commitSelection(sel);
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
            e.clipboardData.setData("text/plain", rangeToTsv(range, (r, c) => (r < this._rowCount && c < this._cols.length ? displayText(this._cols[c], this._value(r, c)) : "")));
            e.preventDefault();
        }

        // ---- actions (Logic) ------------------------------------------------------------------------------------------
        _external() { this._loads++; this._viewSig = ""; this.requestUpdate(); }

        setData(rows) { this._load(normalizeData(rows), this.p.rowKey || ""); this._viewSig = ""; this._lastData = this.status("data").bound ? this.in.data : this._lastData; this.requestUpdate(); }
        upsertRows(rows) { storeUpsert(this._store, rows); this._external(); }
        patchRow(params) {
            const p = params && typeof params === "object" ? params : {};
            const rk = this.p.rowKey;
            const key = p.key !== undefined ? p.key : rk ? p[rk] : undefined;
            const fields = p.fields && typeof p.fields === "object" ? p.fields : (() => { const o = Object.assign({}, p); delete o.key; return o; })();
            if (key === undefined) return;
            stageDrop(this._stage, String(key));
            if (storePatch(this._store, key, fields) !== -1) { this._viewSig = ""; this._loads++; this.requestUpdate(); }
        }
        removeRow(params) {
            const key = params && typeof params === "object" ? params.key : params;
            if (key === undefined || key === null) return;
            stageDrop(this._stage, String(key));
            if (storeRemove(this._store, key)) this._external();
        }
        appendRow(row) { storeAppend(this._store, row); this._external(); }
        clear() { this._load([], this.p.rowKey || ""); this._viewSig = ""; this.requestUpdate(); }
        setCell(params) {
            const p = params && typeof params === "object" ? params : {};
            if (p.key === undefined || !p.col) return;
            if (storePatch(this._store, p.key, { [p.col]: p.value }) !== -1) this.requestUpdate();
        }
        selectCell(params) {
            const p = params && typeof params === "object" ? params : {};
            const r = Number(p.row), c = Number(p.col === undefined ? 0 : p.col);
            if (!isFinite(r) || r < 0 || r >= this._rowCount) return;
            this._commitSelection(selectCell(r, Math.max(0, Math.min(this._cols.length - 1, isFinite(c) ? c : 0))));
        }
        scrollToRow(params) {
            let r = -1;
            if (params && typeof params === "object" && params.row !== undefined) r = Number(params.row);
            else {
                const key = params && typeof params === "object" ? params.key : params;
                const at = positionOf(this._store, key);
                if (at !== -1) r = this._view.indexOf(at);
            }
            if (r >= 0 && r < this._rowCount) this._ensureVisible(r, 0);
        }
        save() {
            const rows = stageRows(this._stage, (key) => { const at = positionOf(this._store, key); return at === -1 ? null : this._store.rows[at]; });
            if (!rows.length) return;
            rows.forEach((x) => storePatch(this._store, x.key, x.changed));
            stageClear(this._stage);
            this.requestUpdate();
            this.fire("save", { rows: rows.map((x) => ({ rowKey: x.key, changed: x.changed, row: x.row })) });
        }
        discard() {
            const count = stageCount(this._stage);
            if (!count) return;
            stageClear(this._stage);
            this.requestUpdate();
            this.fire("discard", { count });
        }
        getData() { this.fire("data", { rows: this._store.rows.map(copyRow), count: this._store.rows.length }); }
    }
});
