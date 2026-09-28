// Nexa UI — containers: components that hold other components in their SLOTS (the SDK's
// `slots`). Each slot is a frame of the page (auto layout, fill, what you drop in it);
// the component only decides where it is drawn and whether it shows.
//   Tabs: one slot per tab, the chosen one shown.
import { defineComponent, html, css, nothing } from "../../nexa-sdk/nexa-component-sdk.js";
import {
    PREFIX, BASE_CSS, UIElement, CSS_GROUP, part,
    sizeProp, paletteProp, variantProp, disabledProp, iconProp, icon,
    VALUE_IO, VALUE_EVENTS, ValueState
} from "./core.js";

export const CATEGORY_LAYOUT = "UI · Layout";
const CAPS = { resizable: true, rotatable: false, flippable: false, lockable: true };
const common = { category: CATEGORY_LAYOUT, capabilities: CAPS, cssGroup: CSS_GROUP, css: "" };

// =================================================================================================
// Tabs
// =================================================================================================
/** The tabs of the props: [{ value, label, icon, disabled }] — a value is a slot's name. */
function tabsOf(p) {
    const list = Array.isArray(p.tabs) ? p.tabs : [];
    return list.map((t, i) => {
        const o = t !== null && typeof t === "object" ? t : { label: t };
        const value = o.value !== undefined && o.value !== null && String(o.value).trim() !== "" ? String(o.value).trim()
            : o.label ? String(o.label).trim() : "tab-" + (i + 1);
        return { value, label: o.label !== undefined && o.label !== "" ? String(o.label) : value, icon: o.icon || "", disabled: !!o.disabled };
    });
}

const TABS_CSS = css`
    .tabs { width: 100%; height: 100%; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
    .tabs.vertical { flex-direction: row; }
    .list { flex: 0 0 auto; display: flex; min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; position: relative; }
    .list::-webkit-scrollbar { display: none; }
    .vertical .list { flex-direction: column; overflow-x: hidden; overflow-y: auto; min-width: 120px; max-width: 40%; }
    .tab { all: unset; box-sizing: border-box; flex: 0 0 auto; display: inline-flex; align-items: center; gap: var(--gap); height: var(--h); padding: 0 var(--px);
        min-width: 0; max-width: 100%; cursor: pointer; user-select: none; color: var(--fg-muted); white-space: nowrap; position: relative;
        transition: color var(--t) var(--ease), background-color var(--t) var(--ease), box-shadow var(--t) var(--ease); }
    .tab .txt { overflow: hidden; text-overflow: ellipsis; }
    .fitted .tab { flex: 1 1 0; }
    .tab:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
    .tab[aria-disabled="true"] { cursor: not-allowed; color: var(--fg-subtle); }
    /* line (Carbon): a 2px line under each tab, the chosen one's in the palette */
    :host([data-variant="line"]) .tab { box-shadow: inset 0 -2px 0 0 var(--bd); }
    :host([data-variant="line"]) .tab:hover:not([aria-disabled="true"]):not([aria-selected="true"]) { color: var(--fg); box-shadow: inset 0 -2px 0 0 var(--bd-strong); }
    :host([data-variant="line"]) .tab[aria-selected="true"] { color: var(--fg); font-weight: 600; box-shadow: inset 0 -2px 0 0 var(--cp-solid); }
    :host([data-variant="line"]) .vertical .tab { box-shadow: inset 2px 0 0 0 var(--bd); }
    :host([data-variant="line"]) .vertical .tab:hover:not([aria-disabled="true"]):not([aria-selected="true"]) { box-shadow: inset 2px 0 0 0 var(--bd-strong); }
    :host([data-variant="line"]) .vertical .tab[aria-selected="true"] { box-shadow: inset 2px 0 0 0 var(--cp-solid); }
    /* contained (Carbon): filled tabs, the chosen one the page's colour with a line on top */
    :host([data-variant="contained"]) .tab { background: var(--bg-emph); color: var(--fg-muted); }
    :host([data-variant="contained"]) .tab + .tab::before { content: ""; position: absolute; left: 0; top: 25%; bottom: 25%; width: 1px; background: var(--bd-strong); }
    :host([data-variant="contained"]) .tab:hover:not([aria-disabled="true"]):not([aria-selected="true"]) { background: color-mix(in srgb, var(--bg-emph) 70%, var(--bd-strong)); color: var(--fg); }
    :host([data-variant="contained"]) .tab[aria-selected="true"] { background: var(--panel); color: var(--fg); font-weight: 600; box-shadow: inset 0 2px 0 0 var(--cp-solid); }
    :host([data-variant="contained"]) .tab[aria-selected="true"]::before, :host([data-variant="contained"]) .tab[aria-selected="true"] + .tab::before { background: transparent; }
    :host([data-variant="contained"]) .vertical .tab[aria-selected="true"] { box-shadow: inset 2px 0 0 0 var(--cp-solid); }
    :host([data-variant="contained"]) .vertical .tab + .tab::before { left: 25%; right: 25%; top: 0; bottom: auto; width: auto; height: 1px; }
    :host([data-variant="contained"]) .panel { background: var(--panel); }
    /* pills (softer): the chosen one filled */
    :host([data-variant="pills"]) .list { gap: 4px; padding: 4px; }
    :host([data-variant="pills"]) .tab { border-radius: var(--r); height: calc(var(--h) - 8px); }
    :host([data-variant="pills"]) .tab:hover:not([aria-disabled="true"]):not([aria-selected="true"]) { background: var(--bg-muted); color: var(--fg); }
    :host([data-variant="pills"]) .tab[aria-selected="true"] { background: var(--cp-solid); color: var(--cp-contrast); }
    .panel { flex: 1 1 auto; min-width: 0; min-height: 0; position: relative; }
    .empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--fg-subtle); font-size: var(--fs-label); }
`;

export const tabs = defineComponent({
    ...common, ...VALUE_IO,
    id: PREFIX + "tabs", label: "Tabs", icon: "fa fa-folder-o", size: { w: 480, h: 300 },
    help: "Tabs: each tab has a panel — a frame of the page. Drop components into a panel on the canvas (click a tab to show its panel). Value = the chosen tab's value (two-way with a binding).",
    properties: {
        tabs: {
            type: "list", default: [{ value: "overview", label: "Overview" }, { value: "trends", label: "Trends" }, { value: "alarms", label: "Alarms" }],
            group: "Content", label: "Tabs",
            help: "Each tab's value names its panel: renaming a value gives it a new (empty) panel — the old one is kept, not shown, until the value comes back.",
            item: { fields: {
                value: { type: "string", label: "Value", default: "" }, label: { type: "string", label: "Label", default: "" },
                icon: { type: "string", label: "Icon (a Nexa UI icon name)", default: "" }, disabled: { type: "boolean", label: "Disabled", default: false } } }
        },
        defaultValue: { type: "string", default: "overview", group: "Content", label: "Default tab (its value)" },
        orientation: { type: "enum", default: "horizontal", group: "Style", label: "Tabs on", style: "segmented",
            options: [{ value: "horizontal", label: "Top" }, { value: "vertical", label: "Left" }] },
        fitted: { type: "boolean", default: false, group: "Style", label: "Fill the width (equal tabs)" },
        variant: variantProp([{ value: "line", label: "Line" }, { value: "contained", label: "Contained" }, { value: "pills", label: "Pills" }], "line"),
        size: sizeProp(), colorPalette: paletteProp(), disabled: disabledProp()
    },
    slots: (p) => tabsOf(p).map((t) => ({ name: t.value, label: t.label })),
    events: VALUE_EVENTS,
    actions: {
        select: { label: "Show a tab", params: { value: { type: "string", label: "The tab's value" } } },
        next: { label: "Next tab" },
        previous: { label: "Previous tab" }
    },
    editor: { interactive: [".tab"] },
    parts: { list: part("The tab list", "list"), tab: part("A tab", "tab"), panel: part("The panel", "panel") },
    view: class extends UIElement {
        static styles = [BASE_CSS, TABS_CSS];
        vs = new ValueState(this, { coerce: (v) => (v === null || v === undefined ? v : String(v)) });
        editorValue = undefined; // the canvas: the tab shown while designing (not saved)

        get list() { return tabsOf(this.p); }
        /** The tab shown: the value (bound, chosen, the default), else the first one enabled. */
        current() {
            const list = this.list;
            const want = this.isEditor && this.editorValue !== undefined ? this.editorValue : this.vs.value;
            const hit = list.find((t) => t.value === want && !t.disabled);
            return hit || list.find((t) => !t.disabled) || null;
        }
        choose(value, focus) {
            const t = this.list.find((x) => x.value === value);
            if (!t || t.disabled || this.p.disabled) return;
            if (this.isEditor) { this.editorValue = value; this.slotShown(value); this.requestUpdate(); }
            else this.vs.set(value);
            if (focus) this.updateComplete.then(() => { const b = this.renderRoot.querySelector(`.tab[data-value="${CSS.escape(value)}"]`); if (b) b.focus(); });
        }
        step(d, focus) {
            const list = this.list.filter((t) => !t.disabled);
            if (!list.length) return;
            const cur = this.current();
            const i = Math.max(0, list.findIndex((t) => cur && t.value === cur.value));
            this.choose(list[(i + d + list.length) % list.length].value, focus);
        }
        // Logic actions
        select(params) { const v = params && typeof params === "object" ? params.value : params; this.choose(String(v)); }
        next() { this.step(1); }
        previous() { this.step(-1); }
        // the editor wants a panel seen (something in it was picked in the Hierarchy)
        revealSlot(name) { this.editorValue = name; this.requestUpdate(); }

        key(e) {
            const vertical = this.p.orientation === "vertical";
            const fwd = vertical ? "ArrowDown" : "ArrowRight", back = vertical ? "ArrowUp" : "ArrowLeft";
            const list = this.list.filter((t) => !t.disabled);
            if (e.key === fwd) this.step(1, true);
            else if (e.key === back) this.step(-1, true);
            else if (e.key === "Home" && list.length) this.choose(list[0].value, true);
            else if (e.key === "End" && list.length) this.choose(list[list.length - 1].value, true);
            else return;
            e.preventDefault();
        }
        render() {
            const p = this.p, list = this.list, cur = this.current();
            const vertical = p.orientation === "vertical";
            const id = (v) => "t-" + String(v).replace(/[^A-Za-z0-9_-]/g, "_");
            return html`<div class="tabs ${vertical ? "vertical" : ""} ${p.fitted ? "fitted" : ""}">
                <div class="list" role="tablist" part="list" aria-orientation="${vertical ? "vertical" : "horizontal"}" @keydown="${(e) => this.key(e)}">
                    ${list.map((t) => {
                        const sel = !!cur && cur.value === t.value;
                        const off = t.disabled || !!p.disabled;
                        return html`<button class="tab" part="tab" type="button" role="tab" id="${id(t.value)}" data-value="${t.value}"
                            aria-selected="${sel ? "true" : "false"}" aria-controls="p-${id(t.value)}" aria-disabled="${off ? "true" : "false"}"
                            tabindex="${sel ? 0 : -1}" @click="${() => this.choose(t.value)}">${t.icon ? icon(t.icon) : nothing}<span class="txt">${t.label}</span></button>`;
                    })}
                </div>
                <div class="panel" part="panel" role="tabpanel" id="${cur ? "p-" + id(cur.value) : "p-none"}" aria-labelledby="${cur ? id(cur.value) : nothing}">
                    ${cur ? this.renderSlot(cur.value, { style: "position:absolute;inset:0;" }) : html`<div class="empty">No tabs</div>`}
                </div>
            </div>`;
        }
    }
});
