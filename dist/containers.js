// Nexa UI — containers: components that hold other components in their SLOTS (the SDK's
// `slots`). Each slot is a frame of the page (auto layout, fill, what you drop in it);
// the component only decides where it is drawn and whether it shows.
//   Tabs: one slot per tab, the chosen one shown.
import { html, css, nothing } from "../../nexa-sdk/nexa-component-sdk.js";
import {
    PREFIX, BASE_CSS, UIElement, CSS_GROUP, part,
    sizeProp, paletteProp, variantProp, disabledProp, icon,
    VALUE_IO, VALUE_EVENTS, ValueState, defineUI } from "./core.js";

export const CATEGORY_LAYOUT = "UI · Layout";

const CAPS = {
    resizable: true,
    rotatable: false,
    flippable: false,
    lockable: true
};

const common = {
    category: CATEGORY_LAYOUT,
    capabilities: CAPS,
    css: ""
};

// =================================================================================================
// Tabs
// =================================================================================================

/** The tabs of the props: [{ value, label, icon, disabled }] — a value is a slot's name. */
function tabsOf(p) {
    const list = Array.isArray(p.tabs) ? p.tabs : [];

    return list.map((t, i) => {
        const o =
            t !== null && typeof t === "object"
                ? t
                : { label: t };

        const value =
            o.value !== undefined &&
                o.value !== null &&
                String(o.value).trim() !== ""
                ? String(o.value).trim()
                : o.label
                    ? String(o.label).trim()
                    : "tab-" + (i + 1);

        return {
            value,
            label:
                o.label !== undefined && o.label !== ""
                    ? String(o.label)
                    : value,
            icon: o.icon || "",
            disabled: !!o.disabled
        };
    });
}

const TABS_CSS = css`
    .tabs {
        --tab-size: 25%;
        --accent-size: 2px;
        --tab-align: left;

        width: 100%;
        height: 100%;

        display: flex;
        flex-direction: column;

        min-width: 0;
        min-height: 0;
    }

    .tabs.vertical {
        flex-direction: row;
    }

    /* ---------------------------------------------------------------------------------------------
       Tab list
       --------------------------------------------------------------------------------------------- */

    /* the tab area: the list and, when the tabs do not fit, a scroll button at each end */
    .bar {
        flex: 0 0 var(--tab-size);

        display: flex;

        min-width: 0;
        min-height: 0;

        position: relative;
    }

    .tabs.vertical .bar {
        width: var(--tab-size);
        height: 100%;
    }

    .list {
        flex: 1 1 auto;

        display: flex;

        min-width: 0;
        min-height: 0;

        overflow-x: auto;
        overflow-y: hidden;

        scrollbar-width: none;
        position: relative;
    }

    .list::-webkit-scrollbar {
        display: none;
    }

    .tabs:not(.vertical) .list {
        flex-direction: row;
    }

    .tabs.vertical .list {
        flex-direction: column;

        overflow-x: hidden;
        overflow-y: auto;

        min-width: 0;
    }

    /* ---------------------------------------------------------------------------------------------
       Scrolling (Scroll the tabs): a button at the end that has more tabs behind it; a tab never gets
       narrower than a readable size when the tabs fill the width
       --------------------------------------------------------------------------------------------- */

    /* the buttons take their own room at the ends of the list (nothing is covered, any background) */
    .nav {
        all: unset;
        box-sizing: border-box;

        flex: 0 0 28px;

        display: flex;
        align-items: center;
        justify-content: center;

        cursor: pointer;
        color: var(--fg-muted);
    }

    .tabs.vertical .bar {
        flex-direction: column;
    }

    .tabs.vertical .nav {
        width: 100%;
    }

    .nav:hover { color: var(--ring); }

    .nav:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: -2px;
    }

    .tabs.scrolls:not(.vertical).fitted .tab { min-width: 96px; }
    .tabs.scrolls.vertical.fitted .tab { min-height: var(--h); }

    /* ---------------------------------------------------------------------------------------------
       Tab
       --------------------------------------------------------------------------------------------- */

    .tab {
        all: unset;
        box-sizing: border-box;

        flex: 0 0 auto;

        display: inline-flex;
        align-items: center;
        justify-content: var(--tab-align);

        gap: var(--gap);

        height: 100%;

        padding: 0 var(--px);

        min-width: 0;
        max-width: 100%;

        cursor: pointer;
        user-select: none;

        color: var(--fg-muted);

        white-space: nowrap;
        text-align: var(--tab-align);

        position: relative;

        transition:
            color var(--t) var(--ease),
            background-color var(--t) var(--ease),
            box-shadow var(--t) var(--ease);
    }

    .tab .txt {
        min-width: 0;

        overflow: hidden;
        text-overflow: ellipsis;
    }

    .fitted .tab {
        flex: 1 1 0;
    }

    /* ---------------------------------------------------------------------------------------------
       Label wrapping
       --------------------------------------------------------------------------------------------- */

    .tabs.wrap-labels .tab {
        white-space: normal;
    }

    .tabs.wrap-labels .tab .txt {
        overflow: visible;
        text-overflow: clip;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
    }


    /* ---------------------------------------------------------------------------------------------
       Vertical tabs
       --------------------------------------------------------------------------------------------- */

    .tabs.vertical {
        flex-direction: row;
    }

    .tabs.vertical .list {
        height: 100%;

        min-width: 0;
        min-height: 0;

        max-width: none;

        flex-direction: column;

        overflow-x: hidden;
        overflow-y: auto;
    }

    .tabs.vertical .tab {
        width: 100%;
        height: auto;

        min-height: var(--h);

        flex: 0 0 auto;
    }

    /*
    * When fitted is enabled, vertical tabs fill the entire
    * available height equally.
    */
    .tabs.vertical.fitted .tab {
        flex: 1 1 0;
        min-height: 0;
    }

    /* ---------------------------------------------------------------------------------------------
       Focus / disabled
       --------------------------------------------------------------------------------------------- */

    .tab:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: -2px;
    }

    .tab[aria-disabled="true"] {
        cursor: not-allowed;
        color: var(--fg-subtle);
    }

    /* =============================================================================================
       LINE
       ============================================================================================= */

    :host([data-variant="line"]) .tab {
        box-shadow:
            inset 0 calc(-1 * var(--accent-size))
            0 0 var(--bd);
    }

    :host([data-variant="line"]) .tab:hover:not([aria-disabled="true"]):not([aria-selected="true"]) {
        color: var(--fg);

        box-shadow:
            inset 0 calc(-1 * var(--accent-size))
            0 0 var(--bd-strong);
    }

    :host([data-variant="line"]) .tab[aria-selected="true"] {
        color: var(--fg);
        font-weight: 600;

        box-shadow:
            inset 0 calc(-1 * var(--accent-size))
            0 0 var(--cp-solid);
    }

    /* Vertical line */

    :host([data-variant="line"]) .vertical .tab {
        box-shadow:
            inset var(--accent-size) 0
            0 0 var(--bd);
    }

    :host([data-variant="line"]) .vertical .tab:hover:not([aria-disabled="true"]):not([aria-selected="true"]) {
        box-shadow:
            inset var(--accent-size) 0
            0 0 var(--bd-strong);
    }

    :host([data-variant="line"]) .vertical .tab[aria-selected="true"] {
        box-shadow:
            inset var(--accent-size) 0
            0 0 var(--cp-solid);
    }

    /* =============================================================================================
       CONTAINED
       ============================================================================================= */

    :host([data-variant="contained"]) .tab {
        background: var(--bg-emph);
        color: var(--fg-muted);
    }

    :host([data-variant="contained"]) .tab + .tab::before {
        content: "";

        position: absolute;

        left: 0;
        top: 25%;
        bottom: 25%;

        width: 1px;

        background: var(--bd-strong);
    }

    :host([data-variant="contained"]) .tab:hover:not([aria-disabled="true"]):not([aria-selected="true"]) {
        background:
            color-mix(
                in srgb,
                var(--bg-emph) 70%,
                var(--bd-strong)
            );

        color: var(--fg);
    }

    :host([data-variant="contained"]) .tab[aria-selected="true"] {
        background: var(--panel);
        color: var(--fg);
        font-weight: 600;

        box-shadow:
            inset 0 var(--accent-size)
            0 0 var(--cp-solid);
    }

    :host([data-variant="contained"]) .tab[aria-selected="true"]::before,
    :host([data-variant="contained"]) .tab[aria-selected="true"] + .tab::before {
        background: transparent;
    }

    /* Vertical contained */

    :host([data-variant="contained"]) .vertical .tab[aria-selected="true"] {
        box-shadow:
            inset var(--accent-size) 0
            0 0 var(--cp-solid);
    }

    :host([data-variant="contained"]) .vertical .tab + .tab::before {
        left: 25%;
        right: 25%;

        top: 0;
        bottom: auto;

        width: auto;
        height: 1px;
    }

    :host([data-variant="contained"]) .panel {
        background: var(--panel);
    }

    /* =============================================================================================
       PILLS
       ============================================================================================= */

    :host([data-variant="pills"]) .list {
        gap: 4px;
        padding: 4px;
    }

    :host([data-variant="pills"]) .tab {
        border-radius: var(--r);
        height: calc(100% - 8px);
    }

    :host([data-variant="pills"]) .tab:hover:not([aria-disabled="true"]):not([aria-selected="true"]) {
        background: var(--bg-muted);
        color: var(--fg);
    }

    :host([data-variant="pills"]) .tab[aria-selected="true"] {
        background: var(--cp-solid);
        color: var(--cp-contrast);
    }

    /* Vertical pills */

    :host([data-variant="pills"]) .vertical .tab {
        height: auto;
        min-height: calc(var(--h) - 8px);
    }

    /* ---------------------------------------------------------------------------------------------
       Panel
       --------------------------------------------------------------------------------------------- */

    .panel {
        flex: 1 1 auto;

        min-width: 0;
        min-height: 0;

        position: relative;
    }

    /* ---------------------------------------------------------------------------------------------
       Empty
       --------------------------------------------------------------------------------------------- */

    .empty {
        position: absolute;
        inset: 0;

        display: flex;
        align-items: center;
        justify-content: center;

        color: var(--fg-subtle);
        font-size: var(--fs-label);
    }
`;

// =================================================================================================
// Tabs component
// =================================================================================================

export const tabs = defineUI({
    ...common,
    ...VALUE_IO,

    id: PREFIX + "tabs",
    label: "Tabs",
    icon: "fa fa-folder-o",

    size: {
        w: 480,
        h: 300
    },

    help:
        "Tabs: each tab has a panel — a frame of the page. Drop components into a panel on the canvas " +
        "(click a tab to show its panel). Value = the chosen tab's value (two-way with a binding).",

    properties: {
        // =========================================================================================
        // Content
        // =========================================================================================

        tabs: {
            type: "list",

            default: [
                {
                    value: "overview",
                    label: "Overview"
                },
                {
                    value: "trends",
                    label: "Trends"
                },
                {
                    value: "alarms",
                    label: "Alarms"
                }
            ],

            group: "Content",
            label: "Tabs",

            help:
                "Each tab's value names its panel: renaming a value gives it a new (empty) panel — " +
                "the old one is kept, not shown, until the value comes back.",

            item: {
                fields: {
                    value: {
                        type: "string",
                        label: "Value",
                        default: "",
                        // it names the tab's panel (a slot): a fixed name, never a binding
                        bindable: false
                    },

                    label: {
                        type: "string",
                        label: "Label",
                        default: ""
                    },

                    icon: {
                        type: "string",
                        label: "Icon (a Nexa UI icon name)",
                        default: ""
                    },

                    disabled: {
                        type: "boolean",
                        label: "Disabled",
                        default: false
                    }
                }
            }
        },

        defaultValue: {
            type: "string",
            default: "overview",
            group: "Content",
            label: "Default tab (its value)"
        },

        // =========================================================================================
        // Orientation
        // =========================================================================================

        orientation: {
            type: "enum",
            default: "horizontal",

            group: "Style",
            label: "Tabs on",
            style: "segmented",

            options: [
                {
                    value: "horizontal",
                    label: "Top"
                },
                {
                    value: "vertical",
                    label: "Left"
                }
            ]
        },

        // =========================================================================================
        // Tab area ratio
        // =========================================================================================

        tabRatio: {
            type: "number",
            default: 25,

            min: 10,
            max: 50,
            step: 1,

            group: "Style",
            label: "Tab area (%)",

            help:
                "Percentage of the component occupied by the tab area. " +
                "Top = height, Left = width."
        },

        // =========================================================================================
        // Accent thickness
        // =========================================================================================

        accentThickness: {
            type: "number",
            default: 2,

            min: 0,
            max: 10,
            step: 1,

            group: "Style",
            label: "Accent thickness (px)",

            help:
                "Thickness of the active tab accent line."
        },

        // =========================================================================================
        // Label alignment
        // =========================================================================================

        labelAlignment: {
            type: "enum",
            default: "left",

            group: "Style",
            label: "Label alignment",
            style: "segmented",

            options: [
                {
                    value: "left",
                    label: "Left"
                },
                {
                    value: "center",
                    label: "Center"
                },
                {
                    value: "right",
                    label: "Right"
                }
            ]
        },

        // =========================================================================================
        // Label wrapping
        // =========================================================================================

        labelWrap: {
            type: "boolean",
            default: false,

            group: "Style",
            label: "Wrap labels",

            help:
                "Allow long tab labels to wrap onto multiple lines."
        },

        // =========================================================================================
        // Existing style
        // =========================================================================================

        fitted: {
            type: "boolean",
            default: false,

            group: "Style",
            label: "Fill the width (equal tabs)"
        },

        scrollTabs: {
            type: "boolean",
            default: true,

            group: "Style",
            label: "Scroll the tabs when they do not fit",

            help:
                "Too many tabs for the width (or the height, with the tabs on the left): a button appears at the end that has more " +
                "tabs, the mouse wheel scrolls the list, and the tab you choose is always brought into view. " +
                "With Fill the width, a tab stays readable (at least 96 px) and the rest scroll. Off: the tabs are as before."
        },

        variant: variantProp(
            [
                {
                    value: "line",
                    label: "Line"
                },
                {
                    value: "contained",
                    label: "Contained"
                },
                {
                    value: "pills",
                    label: "Pills"
                }
            ],
            "line"
        ),

        size: sizeProp(),
        colorPalette: paletteProp(),
        disabled: disabledProp()
    },

    // =============================================================================================
    // Slots
    // =============================================================================================

    slots: (p) =>
        tabsOf(p).map((t) => ({
            name: t.value,
            label: t.label
        })),

    // =============================================================================================
    // Events
    // =============================================================================================

    events: VALUE_EVENTS,

    // =============================================================================================
    // Actions
    // =============================================================================================

    actions: {
        select: {
            label: "Show a tab",

            params: {
                value: {
                    type: "string",
                    label: "The tab's value"
                }
            }
        },

        next: {
            label: "Next tab"
        },

        previous: {
            label: "Previous tab"
        }
    },

    // =============================================================================================
    // Editor
    // =============================================================================================

    editor: {
        interactive: [".tab", ".nav"]
    },

    // =============================================================================================
    // Parts
    // =============================================================================================

    parts: {
        list: part("The tab list", "list"),
        nav: part("A scroll button (when the tabs do not fit)", "nav"),
        tab: part("A tab", "tab"),
        panel: part("The panel", "panel")
    },

    // =============================================================================================
    // View
    // =============================================================================================

    view: class extends UIElement {
        static styles = [
            BASE_CSS,
            TABS_CSS
        ];

        vs = new ValueState(this, {
            coerce: (v) =>
                v === null || v === undefined
                    ? v
                    : String(v)
        });

        // The canvas: the tab shown while designing (not saved)
        editorValue = undefined;

        // the tabs do not fit: whether there is more toward the start / the end (the scroll buttons), and the tab last brought into view
        _more = { a: false, b: false };
        _seen = undefined;
        _pend = undefined;

        get _scrolls() {
            return this.p.scrollTabs !== false;
        }

        _listEl() {
            return this.renderRoot && this.renderRoot.querySelector(".list");
        }

        // from the layout sizes (not getBoundingClientRect: the editor canvas is CSS-zoomed)
        _measure() {
            const l = this._listEl();
            if (!l) return;
            const v = this.p.orientation === "vertical";
            const pos = v ? l.scrollTop : l.scrollLeft;
            const max = (v ? l.scrollHeight - l.clientHeight : l.scrollWidth - l.clientWidth);
            const a = this._scrolls && pos > 1, b = this._scrolls && pos < max - 1;
            if (a !== this._more.a || b !== this._more.b) {
                this._more = { a, b };
                this.requestUpdate();
                return true;
            }
            return false;
        }

        // the chosen tab is brought into view (the list only: the page never moves)
        _reveal(value) {
            const l = this._listEl();
            const t = l && l.querySelector(`.tab[data-value="${CSS.escape(value)}"]`);
            if (!t) return;
            const v = this.p.orientation === "vertical";
            const start = v ? t.offsetTop : t.offsetLeft, size = v ? t.offsetHeight : t.offsetWidth;
            const pos = v ? l.scrollTop : l.scrollLeft, view = v ? l.clientHeight : l.clientWidth;
            const room = 8;                            // a little of the next tab shows
            let to = pos;
            if (start < pos + room) to = Math.max(0, start - room);
            else if (start + size > pos + view - room) to = start + size - view + room;
            if (to !== pos) { if (v) l.scrollTop = to; else l.scrollLeft = to; }
        }

        updated(changed) {
            super.updated(changed);
            const cur = this.current();
            if (this._scrolls && cur && cur.value !== this._seen) { this._seen = cur.value; this._pend = cur.value; }
            // the chosen tab is brought into view; a scroll button that appears or goes narrows or widens the list, so it is done again
            // until the buttons stand still (a manual scroll afterwards is left alone)
            if (this._pend !== undefined) this._reveal(this._pend);
            if (!this._measure()) this._pend = undefined;
        }

        // a button: one page of tabs toward an end
        _page(d) {
            const l = this._listEl();
            if (!l) return;
            const v = this.p.orientation === "vertical", view = v ? l.clientHeight : l.clientWidth;
            l.scrollBy(v ? { top: d * view * 0.8, behavior: "smooth" } : { left: d * view * 0.8, behavior: "smooth" });
        }

        // the wheel over a horizontal list moves it sideways, but only while it can: at an end (or with nothing to scroll) the page scrolls
        _wheel(e) {
            if (!this._scrolls || this.p.orientation === "vertical" || e.ctrlKey || e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            const l = this._listEl();
            if (!l) return;
            const max = l.scrollWidth - l.clientWidth;
            if (max <= 1 || (e.deltaY < 0 && l.scrollLeft <= 0) || (e.deltaY > 0 && l.scrollLeft >= max - 1)) return;
            l.scrollLeft += e.deltaY;
            e.preventDefault();
        }

        get list() {
            return tabsOf(this.p);
        }

        /**
         * The tab shown:
         * editor value -> chosen value -> first enabled tab.
         */
        current() {
            const list = this.list;

            const want =
                this.isEditor &&
                    this.editorValue !== undefined
                    ? this.editorValue
                    : this.vs.value;

            const hit = list.find(
                (t) =>
                    t.value === want &&
                    !t.disabled
            );

            return (
                hit ||
                list.find((t) => !t.disabled) ||
                null
            );
        }

        choose(value, focus) {
            const t = this.list.find(
                (x) => x.value === value
            );

            if (
                !t ||
                t.disabled ||
                this.p.disabled
            ) {
                return;
            }

            if (this.isEditor) {
                this.editorValue = value;
                this.slotShown(value);
                this.requestUpdate();
            } else {
                this.vs.set(value);
            }

            if (focus) {
                this.updateComplete.then(() => {
                    const b =
                        this.renderRoot.querySelector(
                            `.tab[data-value="${CSS.escape(value)}"]`
                        );

                    if (b) {
                        b.focus();
                    }
                });
            }
        }

        step(d, focus) {
            const list =
                this.list.filter(
                    (t) => !t.disabled
                );

            if (!list.length) {
                return;
            }

            const cur = this.current();

            const i =
                Math.max(
                    0,
                    list.findIndex(
                        (t) =>
                            cur &&
                            t.value === cur.value
                    )
                );

            this.choose(
                list[
                    (i + d + list.length) % list.length
                ].value,
                focus
            );
        }

        // Logic actions
        select(params) {
            const v =
                params &&
                    typeof params === "object"
                    ? params.value
                    : params;

            this.choose(String(v));
        }

        next() {
            this.step(1);
        }

        previous() {
            this.step(-1);
        }

        // The editor wants a panel seen
        // because something in it was picked in the Hierarchy.
        revealSlot(name) {
            this.editorValue = name;
            this.requestUpdate();
        }

        key(e) {
            const vertical =
                this.p.orientation === "vertical";

            const fwd =
                vertical
                    ? "ArrowDown"
                    : "ArrowRight";

            const back =
                vertical
                    ? "ArrowUp"
                    : "ArrowLeft";

            const list =
                this.list.filter(
                    (t) => !t.disabled
                );

            if (e.key === fwd) {
                this.step(1, true);
            } else if (e.key === back) {
                this.step(-1, true);
            } else if (
                e.key === "Home" &&
                list.length
            ) {
                this.choose(
                    list[0].value,
                    true
                );
            } else if (
                e.key === "End" &&
                list.length
            ) {
                this.choose(
                    list[list.length - 1].value,
                    true
                );
            } else {
                return;
            }

            e.preventDefault();
        }

        render() {
            const p = this.p;
            const list = this.list;
            const cur = this.current();

            const vertical =
                p.orientation === "vertical";

            // ---------------------------------------------------------------------
            // Sanitize style values
            // ---------------------------------------------------------------------

            const tabRatio = Math.max(
                10,
                Math.min(
                    50,
                    Number(p.tabRatio) || 25
                )
            );

            const accentThickness = Math.max(
                0,
                Math.min(
                    10,
                    Number(p.accentThickness) || 2
                )
            );

            const labelAlignment =
                ["left", "center", "right"].includes(
                    p.labelAlignment
                )
                    ? p.labelAlignment
                    : "left";

            // ---------------------------------------------------------------------
            // CSS variables
            // ---------------------------------------------------------------------

            const style = `
                --tab-size: ${tabRatio}%;
                --accent-size: ${accentThickness}px;
                --tab-align: ${labelAlignment};
            `;

            const id = (v) =>
                "t-" +
                String(v).replace(
                    /[^A-Za-z0-9_-]/g,
                    "_"
                );

            return html`
                <div
                    class="
                        tabs
                        ${vertical ? "vertical" : ""}
                        ${p.fitted ? "fitted" : ""}
                        ${p.labelWrap ? "wrap-labels" : ""}
                        ${this._scrolls ? "scrolls" : ""}
                    "
                    style="${style}"
                >

                    <div class="bar">
                    ${this._more.a ? html`
                        <button class="nav prev" part="nav" type="button" tabindex="-1" aria-label="${vertical ? "Scroll the tabs up" : "Scroll the tabs left"}"
                            @click="${() => this._page(-1)}">${icon(vertical ? "chevron-up" : "chevron-left")}</button>
                    ` : nothing}
                    <div
                        class="list"
                        role="tablist"
                        part="list"
                        aria-orientation="${vertical
                    ? "vertical"
                    : "horizontal"
                }"
                        @keydown="${(e) => this.key(e)}"
                        @scroll="${() => this._measure()}"
                        @wheel="${(e) => this._wheel(e)}"
                    >
                        ${list.map((t) => {
                    const sel =
                        !!cur &&
                        cur.value === t.value;

                    const off =
                        t.disabled ||
                        !!p.disabled;

                    return html`
                                <button
                                    class="tab"
                                    part="tab"
                                    type="button"
                                    role="tab"

                                    id="${id(t.value)}"

                                    data-value="${t.value}"

                                    aria-selected="${sel
                            ? "true"
                            : "false"
                        }"

                                    aria-controls="p-${id(t.value)}"

                                    aria-disabled="${off
                            ? "true"
                            : "false"
                        }"

                                    tabindex="${sel
                            ? 0
                            : -1
                        }"

                                    @click="${() =>
                            this.choose(
                                t.value
                            )}"
                                >
                                    ${t.icon
                            ? icon(t.icon)
                            : nothing
                        }

                                    <span class="txt">
                                        ${t.label}
                                    </span>
                                </button>
                            `;
                })}
                    </div>
                    ${this._more.b ? html`
                        <button class="nav next" part="nav" type="button" tabindex="-1" aria-label="${vertical ? "Scroll the tabs down" : "Scroll the tabs right"}"
                            @click="${() => this._page(1)}">${icon(vertical ? "chevron-down" : "chevron-right")}</button>
                    ` : nothing}
                    </div>

                    <div
                        class="panel"
                        part="panel"
                        role="tabpanel"

                        id="${cur
                    ? "p-" + id(cur.value)
                    : "p-none"
                }"

                        aria-labelledby="${cur
                    ? id(cur.value)
                    : nothing
                }"
                    >
                        ${cur
                    ? this.renderSlot(
                        cur.value,
                        {
                            style:
                                "position:absolute;inset:0;"
                        }
                    )
                    : html`
                                    <div class="empty">
                                        No tabs
                                    </div>
                                `
                }
                    </div>
                </div>
            `;
        }
    }
});