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

    .list {
        flex: 0 0 var(--tab-size);

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
        max-width: 50%;
    }

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
        flex: 0 0 var(--tab-size);

        width: var(--tab-size);
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
                        default: ""
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
        interactive: [".tab"]
    },

    // =============================================================================================
    // Parts
    // =============================================================================================

    parts: {
        list: part("The tab list", "list"),
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
                    "
                    style="${style}"
                >

                    <div
                        class="list"
                        role="tablist"
                        part="list"
                        aria-orientation="${vertical
                    ? "vertical"
                    : "horizontal"
                }"
                        @keydown="${(e) => this.key(e)}"
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