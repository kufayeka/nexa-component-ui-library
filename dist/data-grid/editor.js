// Data Grid: the "Edit grid" dialog, like the SVG's Inspect dialog. Left, the real grid: select cells, type in them like a sheet. Over it a toolbar (merge,
// freeze, lock, bold / italic / underline, alignment, borders). Right, the same tree and property panel as the editor's Properties: "Selection" (the type
// and the style of the selected cells: changing a field puts a rule on them, as Excel's ribbon does), the sheet's own settings, the populate rules, and the
// lists of rules (types and styles, merges, borders, locks). It works on a DRAFT: nothing is written until Apply, and Apply sets only the props that changed.
// Editor only (a page never opens it; the registration below is a no-op there).
//
// The grid in the preview is the component itself, mounted the way the editor's canvas mounts it, so what the dialog shows is what the page shows. Its
// selection reaches this dialog as the DOM event "nexa-selection", a value the user types as "nexa-cell-edit".
import { defineInspectorWidget, html } from "../../../nexa-sdk/nexa-component-sdk.js";
import { sizeOf } from "./address.js";
import { parseColRules, parseRowRules, colSizes, rowSizes, rowSizeAt, setColSize, setRowSize } from "./sizes.js";
import { parseRules, parseCells, mergesFromProps, rangedFromProps } from "./sheet.js";
import { normalizeMerges, normalizeLocks, lockRuleAt } from "./layout.js";
import { crossesFreeze, mergeRange, unmergeRange, mergesTouching, addBorder, clearBorders, addLock, resetLocks, lockState, describeRange, addRule, commonFields, toTextMerges, toTextRules } from "./design.js";
import { rangeLabel } from "./address.js";
import { RULE_SCHEMA } from "./fields.js";

const COMPONENT_ID = "nexa-ui-data-grid";

// What the dialog edits: these props, as one draft (the keys are the component's stored names).
export const DESIGN_KEYS = ["rows", "cols", "viewArea", "freezeRows", "freezeCols", "showHeaders", "showGridLines", "colWidth", "colRules", "adjustCols", "minColWidth", "maxColWidth", "rowHeight", "rowRules", "adjustRows", "autoFit", "minRowHeight", "maxRowHeight", "populate", "cells", "cellRules", "merges", "borders", "locks"];
const SEL_KEYS = Object.keys(RULE_SCHEMA).filter((k) => k !== "range");
const BORDER_COLORS = [{ value: "bd", label: "Light line" }, { value: "bd-strong", label: "Strong line" }, { value: "fg", label: "Text colour" }, { value: "primary", label: "Primary" }, { value: "error", label: "Error" }, { value: "custom", label: "Other colour…" }];
const BORDER_STYLES = ["solid", "dashed", "dotted", "double"].map((v) => ({ value: v, label: v }));

const clone = (v) => JSON.parse(JSON.stringify(v));
const def = () => (window.NEXA && window.NEXA.getComponent ? window.NEXA.getComponent(COMPONENT_ID) : null);

/** The part of the props the dialog works on, complete (a prop never set has its default). */
export function designOf(p) {
    const meta = def() && def().nexa ? def().nexa.props : {};
    const out = {};
    DESIGN_KEYS.forEach((k) => { out[k] = clone(p && p[k] !== undefined && p[k] !== null ? p[k] : meta[k] ? meta[k].default : null); });
    return out;
}

/** The Edit grid button of the inspector: open the dialog, and put the changed props in the component on Apply. */
export function openGridEditor(p, api) {
    const K = window.NexaKit;
    if (!K) return;
    const start = designOf(p);
    K.openDialog({
        title: "Edit grid",
        width: 1360,
        content: html`<nexa-data-grid-editor .props=${start} style="display:block;height:min(620px, 70vh)"></nexa-data-grid-editor>`,
        buttons: [{ label: "Cancel", value: null }, { label: "Apply", primary: true, value: (host) => { const el = host.querySelector("nexa-data-grid-editor"); return el ? { design: el.design() } : null; } }]
    }).then((res) => {
        if (!res || !res.design) return;
        DESIGN_KEYS.forEach((k) => { if (JSON.stringify(res.design[k]) !== JSON.stringify(start[k])) api.set(k, res.design[k]); });
    });
}

/** One line for the Edit grid row of the inspector. */
export function summaryOf(p) {
    const size = sizeOf(p && p.rows, p && p.cols);
    const n = (k) => (Array.isArray(p && p[k]) ? p[k].length : 0);
    const typed = p && p.cells && typeof p.cells === "object" ? Object.keys(p.cells).length : 0;
    const bits = [size.rows + " rows x " + size.cols + " columns"];
    if (typed) bits.push(typed + " cell" + (typed === 1 ? "" : "s") + " typed");
    if (n("cellRules")) bits.push(n("cellRules") + " type / style rule" + (n("cellRules") === 1 ? "" : "s"));
    if (n("populate")) bits.push(n("populate") + " populate rule" + (n("populate") === 1 ? "" : "s"));
    if (n("merges")) bits.push(n("merges") + " merged");
    if (n("locks")) bits.push(n("locks") + " lock rule" + (n("locks") === 1 ? "" : "s"));
    return bits.join(", ");
}

const STYLE = `
nexa-data-grid-editor { display: block; height: 100%; min-height: 320px; }
nexa-data-grid-editor .dge { display: grid; grid-template-columns: minmax(0, 1fr) 390px; gap: 8px; height: 100%; min-height: 0; }
nexa-data-grid-editor .dge-main { display: flex; flex-direction: column; gap: 6px; min-height: 0; min-width: 0; }
nexa-data-grid-editor .dge-bar { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; padding: 6px; border: 1px solid var(--nx-border, #c6c6c6); background: var(--nx-bg, #fff); }
nexa-data-grid-editor .dge-grp { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
nexa-data-grid-editor .dge-grp > .dge-t { font-size: 11px; color: var(--nx-text-muted, #6f6f6f); margin-right: 2px; }
nexa-data-grid-editor .dge-grp .nx-btn { padding: 3px 9px; }
nexa-data-grid-editor .dge-grp .nx-btn.on { background: var(--nx-selected, #d0e2ff); }
nexa-data-grid-editor .dge-grp nx-select, nexa-data-grid-editor .dge-grp nx-number, nexa-data-grid-editor .dge-grp nx-color { width: 120px; }
nexa-data-grid-editor .dge-grp nx-number { width: 70px; }
nexa-data-grid-editor .dge-prev { flex: 1 1 auto; min-height: 220px; position: relative; border: 1px solid var(--nx-border, #c6c6c6); background: var(--nx-bg, #fff); }
nexa-data-grid-editor .dge-prev > * { position: absolute; inset: 0; }
nexa-data-grid-editor .dge-status { font-size: 12px; color: var(--nx-text, #161616); min-height: 18px; display: flex; gap: 12px; flex-wrap: wrap; }
nexa-data-grid-editor .dge-status .dge-note { color: var(--nx-warn, #8e6a00); }
nexa-data-grid-editor .dge-side { min-height: 0; min-width: 0; border: 1px solid var(--nx-border, #c6c6c6); background: var(--nx-bg, #fff); overflow: hidden; display: flex; flex-direction: column; }
nexa-data-grid-editor .dge-form { flex: 1 1 auto; min-height: 0; overflow: hidden; }
`;

defineInspectorWidget("nexa-data-grid-editor", ({ KitElement, html: h, nothing }) => class extends KitElement {
    static properties = {
        props: { attribute: false },
        _range: { state: true },
        _note: { state: true },
        _bstyle: { state: true },
        _bwidth: { state: true },
        _bcolor: { state: true },
        _bcustom: { state: true }
    };

    constructor() {
        super();
        this.props = {};
        this._draft = null;
        this._range = null;
        this._note = "";
        this._bstyle = "solid";
        this._bwidth = 1;
        this._bcolor = "bd-strong";
        this._bcustom = "#161616";
        this._prevSig = "";
        this._prevWired = false;
        this._form = null;
        this._meta = null;
        this._past = [];            // the draft before each change: Ctrl+Z
        this._future = [];          // what Ctrl+Z took back: Ctrl+Y
    }

    /** The design as edited here. */
    design() { return clone(this._draft || designOf(this.props)); }

    willUpdate(changed) {
        if (changed.has("props") && !this._draft) this._draft = designOf(this.props);
    }

    updated() {
        this._mountPreview();
        this._mountForm();
        if (this._form) this._form.update();
    }

    connectedCallback() {
        super.connectedCallback();
        // on the document, in the capture phase: wherever the focus is (also on the page behind), Ctrl+Z is the dialog's while it is open, and the editor's
        // own undo, which would change the flow behind the dialog, never sees it
        this._keys = (e) => this._onKeys(e);
        document.addEventListener("keydown", this._keys, true);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._keys) { document.removeEventListener("keydown", this._keys, true); this._keys = null; }
        if (this._form) { try { this._form.destroy(); } catch (e) { /* gone */ } this._form = null; }
    }

    _size() { return sizeOf(this._draft.rows, this._draft.cols); }
    _freeze() { return { rows: Number(this._draft.freezeRows) || 0, cols: Number(this._draft.freezeCols) || 0 }; }

    // ---- the preview: the component itself ---------------------------------------------------------------------
    _previewProps() {
        // what the dialog needs the grid to do while designing: show the whole sheet, select ranges, show the locks; a populate rule has no value here
        // (its value is a binding, which only a page can resolve), so only its marker shows
        return Object.assign({}, this._draft, {
            selection: "range", mode: "editable", editMode: "instant", viewArea: "",
            populate: (this._draft.populate || []).map((i) => Object.assign({}, i, { value: undefined }))
        });
    }

    _mountPreview() {
        const host = this.querySelector(".dge-prev");
        const d = def();
        if (!host || !d) return;
        if (!this._prevWired) {
            this._prevWired = true;
            host.addEventListener("nexa-selection", (e) => { this._range = e.detail && e.detail.range ? e.detail.range : null; });
            host.addEventListener("nexa-cell-edit", (e) => this._typed(e.detail.address, e.detail.value));
            host.addEventListener("nexa-resize", (e) => this._resized(e.detail));
        }
        const props = this._previewProps();
        const sig = JSON.stringify(props);
        if (sig === this._prevSig) return;
        this._prevSig = sig;
        d.render(host, props, { mode: "editor", namespace: "dg-design", getRawProps: () => props, emit() {} });
        // the SDK switches pointer events off for a component in editor mode (the canvas selects and drags it); in this dialog the grid is the thing to
        // click: the attribute tells the grid to keep them on (it restores them after every update)
        const grid = host.firstElementChild;
        if (grid) { grid.setAttribute("data-interactive", ""); grid.style.pointerEvents = "auto"; }
    }

    // ---- the tree and the properties: the kit's own, as the editor's Properties ---------------------------------------------------
    _buildMeta() {
        const K = window.NexaKit, d = def();
        if (!K || !d || !d.nexa) return null;
        const props = {}, order = [];
        const group = (g) => { if (order.indexOf(g) === -1) order.push(g); return g; };
        // the selection: the type and the style of the selected cells, one row each; a change makes a rule over the selection
        SEL_KEYS.forEach((k) => {
            const f = RULE_SCHEMA[k];
            const vw = f.visibleWhen;
            props["sel_" + k] = K.normalizeProp("sel_" + k, Object.assign({}, f, {
                group: group("Selection"), section: f.section, bindable: false, noReset: true,
                visibleWhen: vw ? (p) => vw({ type: p.sel_type }) : undefined, enabledWhen: (p) => !!p.__hasSelection
            }));
        });
        props.sel_width = K.normalizeProp("sel_width", { type: "number", label: "Column width", default: "", min: 24, unit: "px", group: group("Selection"), section: "Size", bindable: false, noReset: true, enabledWhen: (p) => !!p.__hasSelection });
        props.sel_height = K.normalizeProp("sel_height", { type: "number", label: "Row height", default: "", min: 16, unit: "px", group: group("Selection"), section: "Size", bindable: false, noReset: true, enabledWhen: (p) => !!p.__hasSelection });
        // the sheet's own settings and its lists, from the component's definition: the same fields, the same help
        const take = (k, g) => { const f = d.nexa.props[k]; if (f) props[k] = Object.assign({}, f, { hidden: false, group: group(g), section: undefined }); };
        ["rows", "cols", "viewArea", "freezeRows", "freezeCols", "showHeaders", "showGridLines"].forEach((k) => take(k, "Sheet"));
        ["colWidth", "colRules", "adjustCols", "minColWidth", "maxColWidth"].forEach((k) => take(k, "Columns"));
        ["rowHeight", "rowRules", "adjustRows", "autoFit", "minRowHeight", "maxRowHeight"].forEach((k) => take(k, "Rows"));
        take("populate", "Populate from messages");
        take("cellRules", "Types and styles");
        take("merges", "Merged cells");
        take("borders", "Borders");
        take("locks", "Locked / open cells");
        return { id: "nexa-data-grid-design", label: "Edit grid", props, stateList: [], partList: [], inputs: [], outputs: [], eventList: [], actionList: [], groupOrder: order };
    }

    // what the property rows show: the draft, and for the Selection what the selected cells have in common
    _values() {
        const d = this._draft, size = this._size();
        const out = Object.assign({}, d, { __hasSelection: !!this._range });
        let common = {};
        if (this._range) common = commonFields(parseRules(d.cellRules, size.rows, size.cols), this._range, SEL_KEYS);
        SEL_KEYS.forEach((k) => { out["sel_" + k] = common[k] !== undefined ? common[k] : RULE_SCHEMA[k].default; });
        out.sel_width = ""; out.sel_height = "";
        if (this._range) {
            const dd = this._sizeDefaults();
            const cs = colSizes(parseColRules(d.colRules, size.cols), size.cols, dd.col), rs = rowSizes(parseRowRules(d.rowRules, size.rows), dd.row);
            const widths = [], heights = [];
            for (let c = this._range.c1; c <= this._range.c2 && c < size.cols; c++) widths.push(cs[c].width);
            for (let r = this._range.r1; r <= this._range.r2 && r < size.rows; r++) heights.push(rowSizeAt(rs, r, dd.row).height);
            if (widths.every((w) => w === widths[0])) out.sel_width = widths[0];
            if (heights.every((x) => x === heights[0])) out.sel_height = heights[0];
        }
        return out;
    }

    _mountForm() {
        const host = this.querySelector(".dge-form");
        const K = window.NexaKit;
        if (!host || !K || this._form) return;
        this._meta = this._buildMeta();
        if (!this._meta) return;
        this._form = K.renderInspector(host, {
            meta: this._meta, props: () => this._values(), persistKey: "nexa-data-grid-design", fallbacks: false,
            set: (k, v) => this._setProp(k, v)
        });
    }

    _setProp(key, value) {
        if (key.indexOf("sel_") === 0) { this._applySelection(key.slice(4), value); return; }
        this._set({ [key]: value });
    }

    // ---- editing the draft -----------------------------------------------------------------------------------------
    _set(patch, note) {
        this._past.push(JSON.stringify(this._draft));
        if (this._past.length > 100) this._past.shift();
        this._future = [];
        this._draft = Object.assign({}, this._draft, patch);
        this._note = note || "";
        this.requestUpdate();       // the draft is not a reactive property, and an unchanged note would not draw the new preview
    }

    // Undo / Redo: the draft as it was before the last change / what Undo took back
    _undo() {
        if (!this._past.length) return;
        this._future.push(JSON.stringify(this._draft));
        this._draft = JSON.parse(this._past.pop());
        this._note = "";
        this.requestUpdate();
    }

    _redo() {
        if (!this._future.length) return;
        this._past.push(JSON.stringify(this._draft));
        this._draft = JSON.parse(this._future.pop());
        this._note = "";
        this.requestUpdate();
    }

    // Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) while this dialog is the top one, except where the user is typing: there the field's own undo is the right one
    _onKeys(e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        const mine = this.closest(".nx-dialog-backdrop");
        if (!mine) return;
        for (let n = mine.nextElementSibling; n; n = n.nextElementSibling) if (n.classList.contains("nx-dialog-backdrop")) return;     // another dialog is on top
        const origin = e.composedPath ? e.composedPath()[0] : e.target;
        if (origin && origin.matches && origin.matches("input, textarea, select, [data-edit]")) return;
        const k = String(e.key).toLowerCase();
        if (k === "z" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); this._undo(); }
        else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); e.stopPropagation(); this._redo(); }
    }

    // a value typed in a cell of the preview: the content of the design
    _typed(address, value) {
        const cells = Object.assign({}, this._draft.cells);
        if (value === null || value === "" || value === undefined) delete cells[address]; else cells[address] = value;
        this._set({ cells });
    }

    // a line dragged between two headers: a size rule over the columns / rows it moved
    _resized(d) {
        if (d.kind === "c") this._set({ colRules: setColSize(this._draft.colRules, d.from, d.to, { width: d.size }) });
        else this._set({ rowRules: setRowSize(this._draft.rowRules, d.from, d.to, { height: d.size }) });
    }

    // what a column and a row have when no rule says otherwise: the draft's own settings
    _sizeDefaults() {
        const p = this._draft;
        const n = (v, x) => (v === "" || v === null || v === undefined || !isFinite(Number(v)) ? x : Number(v));
        return {
            col: { width: n(p.colWidth, 110), min: n(p.minColWidth, 30), max: n(p.maxColWidth, 600), adjustable: p.adjustCols !== false },
            row: { height: n(p.rowHeight, 28), min: n(p.minRowHeight, 18), max: n(p.maxRowHeight, 400), adjustable: p.adjustRows !== false, fit: p.autoFit !== false }
        };
    }

    // a field of the Selection: width and height go to the columns and rows; the rest is a rule over the selection
    _applySelection(field, value) {
        const r = this._range;
        if (!r) return;
        const size = this._size();
        if (field === "width") {
            if (value !== "" && value !== null) this._set({ colRules: setColSize(this._draft.colRules, r.c1, Math.min(r.c2, size.cols - 1), { width: Number(value) }) });
        } else if (field === "height") {
            if (value !== "" && value !== null) this._set({ rowRules: setRowSize(this._draft.rowRules, r.r1, Math.min(r.r2, size.rows - 1), { height: Number(value) }) });
        } else {
            this._set({ cellRules: addRule(this._draft.cellRules, rangeLabel(r, size.rows, size.cols), { [field]: value }) });
        }
    }

    _toggle(field) {
        if (!this._range) return;
        const size = this._size();
        const cur = commonFields(parseRules(this._draft.cellRules, size.rows, size.cols), this._range, [field])[field] === true;
        this._applySelection(field, !cur);
    }

    /** Merges that no longer fit (the freeze line moved over them) are taken apart, and the user is told. */
    _fitMerges(freeze) {
        const size = this._size();
        const n = normalizeMerges(mergesFromProps(this._draft.merges), size.rows, size.cols, freeze);
        return { merges: toTextMerges(n.merges), lost: n.dropped.length };
    }

    _merge() {
        const r = this._range;
        if (!r) return;
        if (crossesFreeze(r, this._freeze())) { this._note = "A merged cell cannot cross the frozen line: select cells on one side of it."; this.requestUpdate(); return; }
        this._set({ merges: toTextMerges(mergeRange(mergesFromProps(this._draft.merges), r)) });
    }

    _unmerge() { if (this._range) this._set({ merges: toTextMerges(unmergeRange(mergesFromProps(this._draft.merges), this._range)) }); }

    _freezeTo(what) {
        const r = this._range, cur = this._freeze();
        const freeze = what === "none" ? { rows: 0, cols: 0 } : { rows: what === "cols" ? cur.rows : r.r2 + 1, cols: what === "rows" ? cur.cols : r.c2 + 1 };
        const fit = this._fitMerges(freeze);
        this._set({ freezeRows: freeze.rows, freezeCols: freeze.cols, merges: fit.merges }, fit.lost ? fit.lost + " merged cell" + (fit.lost === 1 ? " was" : "s were") + " taken apart: they crossed the frozen line." : "");
    }

    _spec() { return { style: this._bstyle, width: Number(this._bwidth) || 1, color: this._bcolor === "custom" ? this._bcustom : this._bcolor }; }
    _borders(list) { const s = this._size(); this._set({ borders: toTextRules(list, s.rows, s.cols) }); }
    _border(sides) { if (this._range) this._borders(addBorder(rangedFromProps(this._draft.borders), this._range, sides, this._spec())); }
    _clearBorders() { if (this._range) this._borders(clearBorders(rangedFromProps(this._draft.borders), this._range)); }
    _locks(list) { const s = this._size(); this._set({ locks: toTextRules(list, s.rows, s.cols) }); }
    _lock(locked) { if (this._range) this._locks(addLock(rangedFromProps(this._draft.locks), this._range, locked)); }
    _resetLock() { if (this._range) this._locks(resetLocks(rangedFromProps(this._draft.locks), this._range)); }

    // ---- drawing ---------------------------------------------------------------------------------------------------------
    _btn(label, title, on, extra) {
        return h`<button type="button" class="nx-btn ${extra && extra.on ? "on" : ""}" title=${title} ?disabled=${!this._range} @click=${on}>${label}</button>`;
    }

    _toolbar() {
        const d = this._draft, size = this._size();
        const common = this._range ? commonFields(parseRules(d.cellRules, size.rows, size.cols), this._range, ["bold", "italic", "underline", "align"]) : {};
        const align = (v, label, title) => this._btn(label, title, () => this._applySelection("align", v), { on: common.align === v });
        return h`<div class="dge-bar">
            <div class="dge-grp"><span class="dge-t">History</span>
                <button type="button" class="nx-btn" title="Undo (Ctrl+Z)" ?disabled=${!this._past.length} @click=${() => this._undo()}>Undo</button>
                <button type="button" class="nx-btn" title="Redo (Ctrl+Y)" ?disabled=${!this._future.length} @click=${() => this._redo()}>Redo</button></div>
            <div class="dge-grp"><span class="dge-t">Cells</span>
                ${this._btn("Merge", "One box over the selected cells", () => this._merge())}
                ${this._btn("Unmerge", "Take the merges in the selection apart", () => this._unmerge())}</div>
            <div class="dge-grp"><span class="dge-t">Text</span>
                ${this._btn(h`<b>B</b>`, "Bold", () => this._toggle("bold"), { on: common.bold === true })}
                ${this._btn(h`<i>I</i>`, "Italic", () => this._toggle("italic"), { on: common.italic === true })}
                ${this._btn(h`<u>U</u>`, "Underline", () => this._toggle("underline"), { on: common.underline === true })}
                ${align("left", "Left", "Align left")}${align("center", "Centre", "Align in the middle")}${align("right", "Right", "Align right")}</div>
            <div class="dge-grp"><span class="dge-t">Freeze</span>
                ${this._btn("Rows to here", "Keep the rows down to the selection's last row in place", () => this._freezeTo("rows"))}
                ${this._btn("Columns to here", "Keep the columns up to the selection's last column in place", () => this._freezeTo("cols"))}
                <button type="button" class="nx-btn" ?disabled=${!(d.freezeRows || d.freezeCols)} @click=${() => this._freezeTo("none")}>Unfreeze</button></div>
            <div class="dge-grp"><span class="dge-t">Lock</span>
                ${this._btn("Lock", "These cells cannot be edited (the page's editable mode)", () => this._lock(true))}
                ${this._btn("Open", "These cells can be edited, also in a locked range", () => this._lock(false))}
                ${this._btn("Reset", "Back to what no rule says", () => this._resetLock())}</div>
            <div class="dge-grp"><span class="dge-t">Borders</span>
                <nx-select .options=${BORDER_STYLES} .value=${this._bstyle} @nx-change=${(e) => { this._bstyle = e.detail.value; }}></nx-select>
                <nx-number min="1" max="6" step="1" .value=${this._bwidth} allow-empty="false" @nx-change=${(e) => { this._bwidth = e.detail.value; }}></nx-number>
                <nx-select .options=${BORDER_COLORS} .value=${this._bcolor} @nx-change=${(e) => { this._bcolor = e.detail.value; }}></nx-select>
                ${this._bcolor === "custom" ? h`<nx-color .value=${this._bcustom} @nx-change=${(e) => { this._bcustom = e.detail.value || "#161616"; }}></nx-color>` : nothing}</div>
            <div class="dge-grp">
                ${this._btn("All", "Every line in the selection and around it", () => this._border("all"))}
                ${this._btn("Outer", "Only the box around the selection", () => this._border("outer"))}
                ${this._btn("Inner", "Only the lines between the cells", () => this._border("inner"))}
                ${this._btn("Top", "The line above the selection", () => this._border("top"))}
                ${this._btn("Bottom", "The line under the selection", () => this._border("bottom"))}
                ${this._btn("Left", "The line left of the selection", () => this._border("left"))}
                ${this._btn("Right", "The line right of the selection", () => this._border("right"))}
                ${this._btn("Clear", "Take every line off the selection", () => this._clearBorders())}</div>
        </div>`;
    }

    _status() {
        const r = this._range, d = this._draft;
        const bits = [describeRange(r)];
        if (r) {
            const touching = mergesTouching(mergesFromProps(d.merges), r).length;
            if (touching) bits.push(touching + " merged box" + (touching === 1 ? "" : "es") + " here");
            const rules = normalizeLocks(rangedFromProps(d.locks));
            const st = lockState(r, (row, col) => lockRuleAt(rules, row, col));
            if (st !== "default") bits.push("locks: " + st);
        }
        const f = this._freeze();
        if (f.rows || f.cols) bits.push("frozen: " + f.rows + " row" + (f.rows === 1 ? "" : "s") + ", " + f.cols + " column" + (f.cols === 1 ? "" : "s"));
        const typed = parseCells(d.cells, 1000, 702).size;
        if (typed) bits.push(typed + " typed");
        return h`<div class="dge-status"><span>${bits.join(" · ")}</span>${this._note ? h`<span class="dge-note">${this._note}</span>` : nothing}</div>`;
    }

    render() {
        if (!this._draft) this._draft = designOf(this.props);
        return h`<style>${STYLE}</style>
            <div class="dge">
                <div class="dge-main">${this._toolbar()}<div class="dge-prev"></div>${this._status()}</div>
                <div class="dge-side"><div class="dge-form"></div></div>
            </div>`;
    }
});
