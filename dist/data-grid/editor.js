// Data Grid: the "Edit grid" dialog, like the SVG's Inspect dialog: the real grid on the left to select cells on, a toolbar over it (merge, freeze,
// borders, lock), and on the right the columns and the settings. It works on a DRAFT: nothing is written until Apply, and Apply is the only
// way the component's props change. Editor only (a page never opens it; the registration below is a no-op there).
//
// The grid in the preview is the component itself, mounted the way the editor's canvas mounts it, so what the dialog shows is what the page shows
// (merges, frozen panes, borders, locked cells hatched). Its selection reaches this dialog as the DOM event "nexa-selection".
import { defineInspectorWidget, html } from "../../../nexa-sdk/nexa-component-sdk.js";
import { columnsOf } from "./columns.js";
import { COLUMN_FIELDS } from "./column-fields.js";
import { normalizeMerges, normalizeLocks, lockRuleAt } from "./layout.js";
import { crossesFreeze, mergeRange, unmergeRange, mergesTouching, addBorder, clearBorders, addLock, resetLocks, lockState, dropColumn, moveColumn, describeRange } from "./design.js";

// What the dialog edits: these props, as one draft (the keys are the component's stored names).
export const DESIGN_KEYS = ["columns", "merges", "borders", "locks", "freezeRows", "freezeCols", "rowHeight", "headerHeight", "showRowNumbers"];
const DEFAULTS = { columns: [], merges: [], borders: [], locks: [], freezeRows: 0, freezeCols: 0, rowHeight: 36, headerHeight: 40, showRowNumbers: false };
const COMPONENT_ID = "nexa-ui-data-grid";
const BORDER_COLORS = [{ value: "bd", label: "Light line" }, { value: "bd-strong", label: "Strong line" }, { value: "fg", label: "Text colour" }, { value: "primary", label: "Primary" }, { value: "error", label: "Error" }, { value: "custom", label: "Other colour…" }];
const BORDER_STYLES = ["solid", "dashed", "dotted", "double"].map((v) => ({ value: v, label: v }));

const clone = (v) => JSON.parse(JSON.stringify(v));

/** The part of the props the dialog works on, complete (a prop never set has its default). */
export function designOf(p) {
    const out = {};
    DESIGN_KEYS.forEach((k) => { out[k] = clone(p && p[k] !== undefined && p[k] !== null ? p[k] : DEFAULTS[k]); });
    return out;
}

/** The Edit grid button of the inspector: open the dialog, and put the changed props in the component on Apply. */
export function openGridEditor(p, api) {
    const K = window.NexaKit;
    if (!K) return;
    const start = designOf(p);
    K.openDialog({
        title: "Edit grid",
        width: 1320,
        content: html`<nexa-data-grid-editor .props=${start} style="display:block;height:min(600px, 66vh)"></nexa-data-grid-editor>`,
        buttons: [{ label: "Cancel", value: null }, { label: "Apply", primary: true, value: (host) => { const el = host.querySelector("nexa-data-grid-editor"); return el ? { design: el.design() } : null; } }]
    }).then((res) => {
        if (!res || !res.design) return;
        DESIGN_KEYS.forEach((k) => { if (JSON.stringify(res.design[k]) !== JSON.stringify(start[k])) api.set(k, res.design[k]); });
    });
}

/** One line for the Edit grid row of the inspector. */
export function summaryOf(p) {
    const cols = columnsOf(p && p.columns, []).length;
    const merges = Array.isArray(p && p.merges) ? p.merges.length : 0;
    const locks = Array.isArray(p && p.locks) ? p.locks.length : 0;
    const frozen = (Number(p && p.freezeRows) || 0) + (Number(p && p.freezeCols) || 0);
    return (cols ? cols + " column" + (cols === 1 ? "" : "s") : "columns from the data") + (merges ? ", " + merges + " merged" : "") + (frozen ? ", frozen" : "") + (locks ? ", " + locks + " lock rule" + (locks === 1 ? "" : "s") : "");
}

const STYLE = `
nexa-data-grid-editor { display: block; height: 100%; min-height: 320px; }
nexa-data-grid-editor .dge { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 8px; height: 100%; min-height: 0; }
nexa-data-grid-editor .dge-main { display: flex; flex-direction: column; gap: 6px; min-height: 0; min-width: 0; }
nexa-data-grid-editor .dge-bar { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; padding: 6px; border: 1px solid var(--nx-border, #c6c6c6); background: var(--nx-bg, #fff); }
nexa-data-grid-editor .dge-grp { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
nexa-data-grid-editor .dge-grp > .dge-t { font-size: 11px; color: var(--nx-text-muted, #6f6f6f); margin-right: 2px; }
nexa-data-grid-editor .dge-grp .nx-btn { padding: 3px 9px; }
nexa-data-grid-editor .dge-grp nx-select, nexa-data-grid-editor .dge-grp nx-number, nexa-data-grid-editor .dge-grp nx-color { width: 120px; }
nexa-data-grid-editor .dge-grp nx-number { width: 70px; }
nexa-data-grid-editor .dge-prev { flex: 1 1 auto; min-height: 220px; position: relative; border: 1px solid var(--nx-border, #c6c6c6); background: var(--nx-bg, #fff); }
nexa-data-grid-editor .dge-prev > * { position: absolute; inset: 0; }
nexa-data-grid-editor .dge-status { font-size: 12px; color: var(--nx-text, #161616); min-height: 18px; display: flex; gap: 12px; flex-wrap: wrap; }
nexa-data-grid-editor .dge-status .dge-note { color: var(--nx-warn, #8e6a00); }
nexa-data-grid-editor .dge-side { display: flex; flex-direction: column; min-height: 0; border: 1px solid var(--nx-border, #c6c6c6); background: var(--nx-bg, #fff); }
nexa-data-grid-editor .dge-tabs { display: flex; border-bottom: 1px solid var(--nx-border, #c6c6c6); }
nexa-data-grid-editor .dge-tab { flex: 1; padding: 7px 4px; text-align: center; cursor: pointer; font-size: 12px; border: 0; background: transparent; color: var(--nx-text, #161616); border-bottom: 2px solid transparent; }
nexa-data-grid-editor .dge-tab.on { border-bottom-color: var(--nx-primary, #0f62fe); font-weight: 600; }
nexa-data-grid-editor .dge-pane { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
nexa-data-grid-editor .dge-pane > * { flex-shrink: 0; }
nexa-data-grid-editor .dge-cols { display: flex; flex-direction: column; gap: 2px; max-height: 190px; overflow: auto; border: 1px solid var(--nx-border, #c6c6c6); }
nexa-data-grid-editor .dge-col { display: flex; align-items: center; gap: 4px; padding: 3px 6px; cursor: pointer; font-size: 12px; }
nexa-data-grid-editor .dge-col.on { background: var(--nx-selected, #d0e2ff); }
nexa-data-grid-editor .dge-col .dge-n { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
nexa-data-grid-editor .dge-col .dge-ty { color: var(--nx-text-muted, #6f6f6f); font-size: 11px; }
nexa-data-grid-editor .dge-col button { padding: 0 6px; }
nexa-data-grid-editor .dge-help { font-size: 11px; color: var(--nx-text-muted, #6f6f6f); }
`;

defineInspectorWidget("nexa-data-grid-editor", ({ KitElement, html: h, nothing }) => class extends KitElement {
    static properties = {
        props: { attribute: false },
        _tab: { state: true },
        _ci: { state: true },
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
        this._tab = "columns";
        this._ci = 0;
        this._range = null;
        this._note = "";
        this._bstyle = "solid";
        this._bwidth = 1;
        this._bcolor = "bd-strong";
        this._bcustom = "#161616";
        this._prevSig = "";
        this._prevWired = false;
    }

    /** The design as edited here. */
    design() { return clone(this._draft || designOf(this.props)); }

    willUpdate(changed) {
        if (changed.has("props") && !this._draft) this._draft = designOf(this.props);
    }

    updated() { this._mountPreview(); }

    // ---- the preview: the component itself ---------------------------------------------------------------------
    _previewProps() {
        // what the dialog needs the grid to do while designing: select ranges, show locks, keep the rows where they are
        return Object.assign({}, this._draft, { selection: "range", mode: "editable", editMode: "instant", sortable: false, filterable: false, rowKey: "", lockField: "", showHeader: true, emptyText: "" });
    }

    _mountPreview() {
        const host = this.querySelector(".dge-prev");
        const def = window.NEXA && window.NEXA.getComponent ? window.NEXA.getComponent(COMPONENT_ID) : null;
        if (!host || !def) return;
        if (!this._prevWired) {
            this._prevWired = true;
            host.addEventListener("nexa-selection", (e) => { this._range = e.detail && e.detail.range ? e.detail.range : null; });
        }
        const props = this._previewProps();
        const sig = JSON.stringify(props);
        if (sig === this._prevSig) return;
        this._prevSig = sig;
        def.render(host, props, { mode: "editor", namespace: "dg-design", getRawProps: () => props, emit() {} });
        // the SDK switches pointer events off for a component in editor mode (the canvas selects and drags it); in this dialog the grid is the
        // thing to click: the attribute tells the grid to keep them on (it restores them after every update)
        const grid = host.firstElementChild;
        if (grid) { grid.setAttribute("data-interactive", ""); grid.style.pointerEvents = "auto"; }
    }

    // ---- editing the draft -----------------------------------------------------------------------------------------
    _set(patch, note) {
        this._draft = Object.assign({}, this._draft, patch);
        this._note = note || "";
        this.requestUpdate();       // the draft is not a reactive property, and an unchanged note would not draw the new preview
    }

    _freeze() { return { rows: Number(this._draft.freezeRows) || 0, cols: Number(this._draft.freezeCols) || 0 }; }
    _colCount() { return columnsOf(this._draft.columns, []).filter((c) => !c.hidden).length; }

    /** Merges that no longer fit (the freeze line moved over them, a column went) are taken apart, and the user is told. */
    _fitMerges(merges, freeze) {
        const n = normalizeMerges(merges, Number.MAX_SAFE_INTEGER, Math.max(this._colCount(), 1), freeze);
        return { merges: n.merges, lost: n.dropped.length };
    }

    _merge() {
        const r = this._range;
        if (!r) return;
        if (crossesFreeze(r, this._freeze())) { this._note = "A merged cell cannot cross the frozen line: select cells on one side of it."; return; }
        this._set({ merges: mergeRange(this._draft.merges, r) });
    }

    _unmerge() { if (this._range) this._set({ merges: unmergeRange(this._draft.merges, this._range) }); }

    _freezeTo(what) {
        const r = this._range;
        const freeze = what === "none" ? { rows: 0, cols: 0 } : { rows: what === "cols" ? this._freeze().rows : r.r2 + 1, cols: what === "rows" ? this._freeze().cols : r.c2 + 1 };
        const fit = this._fitMerges(this._draft.merges, freeze);
        this._set({ freezeRows: freeze.rows, freezeCols: freeze.cols, merges: fit.merges }, fit.lost ? fit.lost + " merged cell" + (fit.lost === 1 ? " was" : "s were") + " taken apart: they crossed the frozen line." : "");
    }

    _spec() { return { style: this._bstyle, width: Number(this._bwidth) || 1, color: this._bcolor === "custom" ? this._bcustom : this._bcolor }; }
    _border(sides) { if (this._range) this._set({ borders: addBorder(this._draft.borders, this._range, sides, this._spec()) }); }
    _clearBorders() { if (this._range) this._set({ borders: clearBorders(this._draft.borders, this._range) }); }
    _lock(locked) { if (this._range) this._set({ locks: addLock(this._draft.locks, this._range, locked) }); }
    _resetLock() { if (this._range) this._set({ locks: resetLocks(this._draft.locks, this._range) }); }

    _addColumn() {
        const cols = this._draft.columns.slice();
        // an empty list means "from the data": adding the first column makes the list real, so it starts with what the data has
        const n = cols.length + 1;
        cols.push({ key: "field" + n, label: "Column " + n, type: "text" });
        this._set({ columns: cols });
        this._ci = cols.length - 1;
    }

    _removeColumn(i) {
        const cols = this._draft.columns.slice();
        cols.splice(i, 1);
        const rules = dropColumn(this._draft, i);
        this._set({ columns: cols, merges: rules.merges, borders: rules.borders, locks: rules.locks });
        this._ci = Math.max(0, Math.min(this._ci, cols.length - 1));
    }

    _moveColumn(i, to) {
        if (to < 0 || to >= this._draft.columns.length) return;
        const cols = this._draft.columns.slice();
        const [c] = cols.splice(i, 1);
        cols.splice(to, 0, c);
        const rules = moveColumn(this._draft, i, to);
        this._set({ columns: cols, merges: rules.merges, borders: rules.borders, locks: rules.locks });
        this._ci = to;
    }

    _setColumnField(i, key, value) {
        const cols = this._draft.columns.map((c, k) => (k === i ? Object.assign({}, c, { [key]: value }) : c));
        this._set({ columns: cols });
    }

    // ---- drawing ---------------------------------------------------------------------------------------------------------
    _btn(label, title, on, disabled) {
        return h`<button type="button" class="nx-btn" title=${title} ?disabled=${disabled || !this._range} @click=${on}>${label}</button>`;
    }

    _toolbar() {
        return h`<div class="dge-bar">
            <div class="dge-grp"><span class="dge-t">Cells</span>
                ${this._btn("Merge", "One box over the selected cells", () => this._merge())}
                ${this._btn("Unmerge", "Take the merges in the selection apart", () => this._unmerge())}</div>
            <div class="dge-grp"><span class="dge-t">Freeze</span>
                ${this._btn("Rows to here", "Keep the rows down to the selection's last row in place", () => this._freezeTo("rows"))}
                ${this._btn("Columns to here", "Keep the columns up to the selection's last column in place", () => this._freezeTo("cols"))}
                <button type="button" class="nx-btn" ?disabled=${!(this._draft.freezeRows || this._draft.freezeCols)} @click=${() => this._freezeTo("none")}>Unfreeze</button></div>
            <div class="dge-grp"><span class="dge-t">Lock</span>
                ${this._btn("Lock", "These cells cannot be edited (the page's editable mode)", () => this._lock(true))}
                ${this._btn("Open", "These cells can be edited, also in a locked column or row", () => this._lock(false))}
                ${this._btn("Reset", "Back to what the column and the row say", () => this._resetLock())}</div>
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
        const r = this._range;
        const bits = [describeRange(r)];
        if (r) {
            const touching = mergesTouching(this._draft.merges, r).length;
            if (touching) bits.push(touching + " merged box" + (touching === 1 ? "" : "es") + " here");
            const rules = normalizeLocks(this._draft.locks);
            const st = lockState(r, (row, col) => lockRuleAt(rules, row, col));
            if (st !== "default") bits.push("locks: " + st);
        }
        const f = this._freeze();
        if (f.rows || f.cols) bits.push("frozen: " + f.rows + " row" + (f.rows === 1 ? "" : "s") + ", " + f.cols + " column" + (f.cols === 1 ? "" : "s"));
        return h`<div class="dge-status"><span>${bits.join(" · ")}</span>${this._note ? h`<span class="dge-note">${this._note}</span>` : nothing}</div>`;
    }

    _field(i, key, def) {
        const col = this._draft.columns[i];
        const value = col[key] !== undefined ? col[key] : def.default;
        const set = (v) => this._setColumnField(i, key, v);
        const common = { label: def.label, help: def.help || "" };
        switch (def.type) {
            case "boolean": return h`<nx-checkbox label=${common.label} help=${common.help} .value=${value !== false && value !== "false"} @nx-change=${(e) => set(!!e.detail.value)}></nx-checkbox>`;
            case "number": return h`<nx-number label=${common.label} help=${common.help} min=${def.min ?? nothing} max=${def.max ?? nothing} unit=${def.unit ?? nothing} .value=${value} @nx-change=${(e) => set(e.detail.value)}></nx-number>`;
            case "enum": {
                const options = (def.options || []).map((o) => (typeof o === "object" ? o : { value: o, label: o }));
                return h`<nx-select label=${common.label} help=${common.help} .options=${options} .value=${value} @nx-change=${(e) => set(e.detail.value)}></nx-select>`;
            }
            default: return h`<nx-text label=${common.label} help=${common.help} .value=${value === undefined || value === null ? "" : String(value)} @nx-change=${(e) => set(e.detail.value)}></nx-text>`;
        }
    }

    _columnsTab() {
        const cols = this._draft.columns;
        const sel = cols[this._ci] ? this._ci : -1;
        return h`<div class="dge-pane">
            ${cols.length === 0 ? h`<div class="dge-help">No columns designed: the grid takes them from the data (the keys of the first rows). Add one to design the columns yourself.</div>` : nothing}
            <div class="dge-cols">${cols.map((c, i) => h`<div class="dge-col ${i === sel ? "on" : ""}" @click=${() => { this._ci = i; }}>
                <span class="dge-n">${c.label || c.key}</span><span class="dge-ty">${c.type || "text"}</span>
                <button type="button" class="nx-btn" title="Move up" ?disabled=${i === 0} @click=${(e) => { e.stopPropagation(); this._moveColumn(i, i - 1); }}>↑</button>
                <button type="button" class="nx-btn" title="Move down" ?disabled=${i === cols.length - 1} @click=${(e) => { e.stopPropagation(); this._moveColumn(i, i + 1); }}>↓</button>
                <button type="button" class="nx-btn" title="Remove" @click=${(e) => { e.stopPropagation(); this._removeColumn(i); }}>×</button></div>`)}</div>
            <div><button type="button" class="nx-btn nx-primary" @click=${() => this._addColumn()}>Add column</button></div>
            ${sel === -1 ? nothing : Object.keys(COLUMN_FIELDS).filter((k) => !COLUMN_FIELDS[k].visibleWhen || COLUMN_FIELDS[k].visibleWhen(Object.assign({ type: "text" }, cols[sel]))).map((k) => this._field(sel, k, COLUMN_FIELDS[k]))}
        </div>`;
    }

    _settingsTab() {
        const d = this._draft;
        const num = (key, label, min, max, help) => h`<nx-number label=${label} help=${help || ""} min=${min} max=${max ?? nothing} .value=${d[key]} @nx-change=${(e) => this._setNumber(key, e.detail.value)}></nx-number>`;
        return h`<div class="dge-pane">
            ${num("freezeRows", "Frozen rows", 0, undefined, "The first rows stay in place while the rest scrolls. The Freeze buttons set it from the selection.")}
            ${num("freezeCols", "Frozen columns", 0, undefined, "The first columns stay in place.")}
            ${num("rowHeight", "Row height (px)", 20, 120)}
            ${num("headerHeight", "Header height (px)", 20, 120)}
            <nx-checkbox label="Show row numbers" .value=${!!d.showRowNumbers} @nx-change=${(e) => this._set({ showRowNumbers: !!e.detail.value })}></nx-checkbox>
            <div class="dge-help">Rows and columns are counted in the order shown. A merge in the body switches sorting and filtering off on the page.</div>
        </div>`;
    }

    _setNumber(key, value) {
        const n = value === "" ? 0 : Number(value);
        if (!isFinite(n)) return;
        if (key === "freezeRows" || key === "freezeCols") {
            const freeze = Object.assign(this._freeze(), key === "freezeRows" ? { rows: Math.max(0, n) } : { cols: Math.max(0, n) });
            const fit = this._fitMerges(this._draft.merges, freeze);
            this._set({ [key]: Math.max(0, n), merges: fit.merges }, fit.lost ? fit.lost + " merged cell" + (fit.lost === 1 ? " was" : "s were") + " taken apart: they crossed the frozen line." : "");
        } else this._set({ [key]: n });
    }

    render() {
        if (!this._draft) this._draft = designOf(this.props);
        return h`<style>${STYLE}</style>
            <div class="dge">
                <div class="dge-main">${this._toolbar()}<div class="dge-prev"></div>${this._status()}</div>
                <div class="dge-side">
                    <div class="dge-tabs">
                        <button type="button" class="dge-tab ${this._tab === "columns" ? "on" : ""}" @click=${() => { this._tab = "columns"; }}>Columns</button>
                        <button type="button" class="dge-tab ${this._tab === "settings" ? "on" : ""}" @click=${() => { this._tab = "settings"; }}>Settings</button>
                    </div>
                    ${this._tab === "columns" ? this._columnsTab() : this._settingsTab()}
                </div>
            </div>`;
    }
});

