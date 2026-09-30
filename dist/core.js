// Nexa UI — the pieces every component shares. An ES module on the Nexa component SDK:
// everything (Lit, the theme, zag.js) comes from the SDK facade, nothing from outside.
//
// How a component looks is the library's (like any UI library): its structure is fixed
// (accessible, consistent). What you change, from the most common to the most special:
//   1. its props: variant, size (xs … xl), colorPalette (a theme palette), radius…
//   2. the app's theme (Theme tab): every colour / size here is a design token, light
//      and dark — change the primary palette and every button follows
//   3. Custom CSS: the base CSS and each documented part (root, label, control, helper…)
//      — declarations for that part, which win over the library's own
// Every prop is bindable (Variable / Tag / Message / Expression), per breakpoint (📱)
// and takes theme tokens (◆): the SDK's property kit does it for every field.
import { NexaElement, html, css, svg, nothing, theme } from "../../nexa-sdk/nexa-component-sdk.js";

export const CATEGORY_FORM = "UI · Form";
export const CATEGORY_DISPLAY = "UI · Display";
export const PREFIX = "nexa-ui-";

// ---- common props -------------------------------------------------------------------------
export const SIZES = [
    { value: "xs", label: "XS" }, { value: "sm", label: "SM" }, { value: "md", label: "MD" }, { value: "lg", label: "LG" }, { value: "xl", label: "XL" }
];
export const PALETTES = ["primary", "gray", "red", "orange", "yellow", "green", "teal", "blue", "cyan", "purple", "pink"];

export const sizeProp = (d = "md") => ({ type: "enum", default: d, options: SIZES, style: "segmented", group: "Style", label: "Size" });
export const paletteProp = (d = "primary") => ({
    type: "enum", default: d, options: PALETTES.map((p) => ({ value: p, label: p })), style: "combobox", free: true,
    group: "Style", label: "Colour palette", help: "A palette of the theme (Theme tab → Colors): its solid, subtle, text… colours, light and dark."
});
export const variantProp = (options, d) => ({ type: "enum", default: d, options, group: "Style", label: "Variant" });
export const radiusProp = (d = "md") => ({ type: "number", default: `{token:radii.${d}}`, tokens: "radii", min: 0, unit: "px", group: "Style", label: "Corner radius" });
export const disabledProp = () => ({ type: "boolean", default: false, group: "Behaviour", label: "Disabled" });

// The field around a form control (Chakra's Field): a label, a helper line, an error.
export const FIELD_PROPS = {
    label: { type: "string", default: "", group: "Field", label: "Label" },
    labelPosition: { type: "enum", default: "top", group: "Field", label: "Label position", style: "segmented",
        options: [{ value: "top", label: "Top" }, { value: "left", label: "Left" }], visibleWhen: (p) => !!p.label },
    helperText: { type: "string", default: "", group: "Field", label: "Helper text" },
    invalid: { type: "boolean", default: false, group: "Field", label: "Invalid", help: "Shows the error text (bind it to a check)." },
    errorText: { type: "string", default: "", group: "Field", label: "Error text", help: "Shown while it is invalid." },
    required: { type: "boolean", default: false, group: "Field", label: "Required (a * after the label)" }
};

// Custom CSS: each part's declarations (the SDK wraps them in its selector). ":host" makes
// them win over the library's own styles.
export const part = (label, name) => ({ label, selector: `:host [part~="${name}"]`, css: "" });
export const FIELD_PARTS = {
    root: part("Root", "root"), label: part("Label", "label"), control: part("Control", "control"), helper: part("Helper / error text", "helper")
};
export const CSS_GROUP = "Custom CSS";

// ---- the look: sizes, the palette, tokens -------------------------------------------------
export const BASE_CSS = css`
    :host {
        display: block; width: 100%; height: 100%; box-sizing: border-box; min-width: 0;
        font-family: var(--nexa-fonts-body, "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
        color: var(--fg); letter-spacing: 0.16px;
        --fs: var(--nexa-fontSizes-sm, 14px); --fs-label: var(--nexa-fontSizes-xs, 12px);
        --h: 40px; --px: 16px; --gap: 8px; --icon: 16px;
        --r: var(--nexa-radii-md, 4px);
        --ease: cubic-bezier(0.2, 0, 0.38, 0.9); --t: var(--nexa-durations-faster, 110ms);
        --mono: var(--nexa-fonts-mono, "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace);
        --ring: var(--cp-focusRing, #0f62fe);
        font-size: var(--fs); line-height: 1.43;
    }
    :host([data-size="xs"]) { --fs: var(--nexa-fontSizes-xs, 12px); --h: 24px; --px: 8px; --gap: 4px; --icon: 12px; }
    :host([data-size="sm"]) { --fs: var(--nexa-fontSizes-sm, 14px); --h: 32px; --px: 12px; --gap: 6px; --icon: 14px; }
    :host([data-size="lg"]) { --fs: var(--nexa-fontSizes-md, 16px); --h: 48px; --px: 16px; --gap: 10px; --icon: 18px; --fs-label: var(--nexa-fontSizes-sm, 14px); }
    :host([data-size="xl"]) { --fs: var(--nexa-fontSizes-md, 16px); --h: 64px; --px: 16px; --gap: 12px; --icon: 20px; --fs-label: var(--nexa-fontSizes-sm, 14px); }
    *, *::before, *::after { box-sizing: border-box; }
    .icon { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; }
    .icon svg { width: var(--icon); height: var(--icon); }
    :focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
    .num, .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; letter-spacing: 0; }
    /* the field (Carbon): a small tracked label over the control, a helper line under it */
    .field { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; gap: 6px; }
    .field.left { flex-direction: row; align-items: center; gap: var(--px); }
    .label { flex: 0 0 auto; font-size: var(--fs-label); line-height: 1.33; letter-spacing: 0.32px; font-weight: 400; color: var(--fg-muted);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .field.left .label { max-width: 40%; }
    .req { color: var(--err); margin-left: 2px; }
    .body { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .helper { flex: 0 0 auto; font-size: var(--fs-label); line-height: 1.33; letter-spacing: 0.32px; color: var(--fg-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .helper.error { color: var(--err); }
    .spin { animation: nx-ui-spin 0.69s linear infinite; }
    @keyframes nx-ui-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
`;

// a palette's roles on the element (--cp-solid …): the theme's CSS variables (they follow
// the colour mode), with the current value as the fallback (a page without the theme CSS)
const ROLES = ["solid", "contrast", "fg", "muted", "subtle", "emphasized", "focusRing", "border"];
const SHADE_ROLES = ["50", "600", "700", "800"];
export function applyPalette(el, name) {
    name = String(name || "primary").trim().replace(/[^A-Za-z0-9_-]/g, "") || "primary";
    const key = name + "|" + theme.mode();
    if (el.__nxPal === key) return;
    el.__nxPal = key;
    ROLES.forEach((r) => {
        const v = theme.token(`colors.${name}.${r}`);
        el.style.setProperty(`--cp-${r}`, `var(--nexa-colors-${name}-${r}${v !== undefined ? ", " + v : ""})`);
    });
    SHADE_ROLES.forEach((sh) => {
        const v = theme.token(`colors.${name}.${sh}`);
        el.style.setProperty(`--cp-${sh}`, `var(--nexa-colors-${name}-${sh}${v !== undefined ? ", " + v : ""})`);
    });
    // a notification's background: the palette's lightest in light, a layer in dark
    const dark = theme.mode() === "dark";
    const soft = dark ? theme.token("colors.bg.muted") : theme.token(`colors.${name}.50`);
    el.style.setProperty("--cp-soft", dark ? `var(--nexa-colors-bg-muted, ${soft})` : `var(--nexa-colors-${name}-50${soft !== undefined ? ", " + soft : ""})`);
}

// the semantic colours on the element: the theme's CSS variables, with their value in the
// current mode as the fallback (so a page without the theme CSS is right in dark mode too)
const SEMANTIC = {
    "--fg": "colors.fg", "--fg-muted": "colors.fg.muted", "--fg-subtle": "colors.fg.subtle",
    "--bg": "colors.bg", "--bg-subtle": "colors.bg.subtle", "--bg-muted": "colors.bg.muted", "--bg-emph": "colors.bg.emphasized", "--panel": "colors.bg.panel",
    "--bd": "colors.border", "--bd-strong": "colors.border.emphasized", "--err": "colors.fg.error", "--err-bd": "colors.border.error"
};
export function applySemantic(el) {
    const key = theme.mode();
    if (el.__nxSem === key) return;
    el.__nxSem = key;
    Object.keys(SEMANTIC).forEach((v) => {
        const path = SEMANTIC[v], val = theme.token(path);
        el.style.setProperty(v, `var(--nexa-${path.replace(/\./g, "-")}${val !== undefined ? ", " + val : ""})`);
    });
}

// IBM Plex, shipped with the library (dist/fonts, SIL OFL): declared once on the page (a
// shadow root takes the page's fonts); the theme's fonts name it first.
let fontsIn = false;
export function ensureFonts() {
    if (fontsIn || typeof document === "undefined" || !document.head) return;
    fontsIn = true;
    const base = new URL("./fonts/", import.meta.url).href;
    const face = (family, weight, file) => `@font-face { font-family: "${family}"; font-style: normal; font-weight: ${weight}; font-display: swap; src: url("${base}${file}") format("woff2"); }`;
    const st = document.createElement("style");
    st.id = "nexa-ui-fonts";
    st.textContent = [face("IBM Plex Sans", 400, "ibm-plex-sans-latin-400-normal.woff2"), face("IBM Plex Sans", 500, "ibm-plex-sans-latin-500-normal.woff2"),
        face("IBM Plex Sans", 600, "ibm-plex-sans-latin-600-normal.woff2"), face("IBM Plex Mono", 400, "ibm-plex-mono-latin-400-normal.woff2"),
        face("IBM Plex Mono", 500, "ibm-plex-mono-latin-500-normal.woff2")].join("\n");
    document.head.appendChild(st);
}
ensureFonts();

/** A view of this library: size / variant as host attributes, its palette as CSS variables, its radius. */
export class UIElement extends NexaElement {
    static styles = [BASE_CSS];
    updated(changed) {
        super.updated(changed);
        const p = this.p || {};
        this.setAttribute("data-size", p.size || "md");
        if (p.variant) this.setAttribute("data-variant", p.variant); else this.removeAttribute("data-variant");
        applySemantic(this);
        applyPalette(this, p.colorPalette || this.constructor.palette || "primary");
        if (p.radius !== undefined && p.radius !== "" && isFinite(Number(p.radius))) this.style.setProperty("--r", Number(p.radius) + "px");
    }
    /** Fire a Logic event unless this is the editor's canvas. */
    fire(name, payload) { if (!this.isEditor) this.emit(name, payload || {}); }
}

/** The field around a control: label, the control, the helper / error line. */
export function field(el, control, message) {
    const p = el.p || {};
    const err = message || (p.invalid && p.errorText ? p.errorText : "");
    const helper = err || p.helperText;
    return html`<div class="field ${p.label && p.labelPosition === "left" ? "left" : ""} ${err ? "invalid" : ""}" part="root">
        ${p.label ? html`<label class="label" part="label">${p.label}${p.required ? html`<span class="req" aria-hidden="true">*</span>` : nothing}</label>` : nothing}
        <div class="body">${control}${helper ? html`<div class="helper ${err ? "error" : ""}" part="helper">${helper}</div>` : nothing}</div>
    </div>`;
}

// ---- the value of a control that is not a text field (checkbox, select, slider…) ------------
// input `value` (read: a tag / variable / message) and output `value` (write; empty = the
// input's own target): two-way. Unbound, the control keeps its own value, starting at the
// `defaultValue` prop. After a user change it shows that value at once (optimistic) until
// the binding reports it, or the write fails.
export const VALUE_IO = {
    inputs: { value: { type: "any", label: "Value (read)", help: "What it shows: a tag, a variable, the message. Empty = its own value (Default value)." } },
    outputs: { value: { fallback: "value", label: "Value (write)", help: "Where a change goes. Empty = back to the Value (read) binding: two-way." } }
};
export class ValueState {
    constructor(host, opts) {
        this.host = host;
        // toWrite(v, tagValue): what is written for the value v (a tag of text keeps its format)
        this.opts = Object.assign({ input: "value", output: "value", initial: "defaultValue", coerce: (v) => v, same: (a, b) => JSON.stringify(a) === JSON.stringify(b), toWrite: null, confirmMs: 3000 }, opts || {});
        this.local = undefined;
        this.pending = undefined;
        this.timer = null;
        host.addController(this);
    }
    hostDisconnected() { clearTimeout(this.timer); this.timer = null; }
    hostUpdate() {
        // the binding now reports the value written: no longer pending
        const st = this.host.status(this.opts.input);
        if (this.pending !== undefined && st.bound && this.opts.same(this.opts.coerce(this.host.in[this.opts.input]), this.pending)) { this.pending = undefined; clearTimeout(this.timer); }
    }
    get bound() { return this.host.status(this.opts.input).bound; }
    get value() {
        if (this.pending !== undefined) return this.pending;
        if (this.bound) { const v = this.host.in[this.opts.input]; return v === null || v === undefined ? null : this.opts.coerce(v); }
        if (this.local !== undefined) return this.local;
        return this.opts.coerce(this.host.p[this.opts.initial]);
    }
    get unknown() { return this.bound && this.pending === undefined && (this.host.in[this.opts.input] === null || this.host.in[this.opts.input] === undefined); }
    /** The user chose `v`: shown now, written (or kept locally), and the change event. */
    set(v, payload) {
        const host = this.host;
        if (host.isEditor) return;
        if (this.opts.same(v, this.value)) return;
        const bound = this.bound;
        if (bound) this.pending = v; else this.local = v;
        host.requestUpdate();
        host.emit("change", Object.assign({ value: v }, payload || {}));
        if (!host.out.canWrite(this.opts.output)) { if (bound) this.pending = undefined; return; }
        const out = this.opts.toWrite ? this.opts.toWrite(v, bound ? host.in[this.opts.input] : undefined) : v;
        clearTimeout(this.timer);
        host.out.write(this.opts.output, out).then(() => {
            // written (acked), but the tag did not report the new value: after a while it
            // shows the tag's real value again (never a value the device did not take)
            if (this.pending === undefined) return;
            this.timer = setTimeout(() => { if (this.pending === v) { this.pending = undefined; host.requestUpdate(); } }, this.opts.confirmMs);
        }, (e) => {
            if (this.pending === v) this.pending = undefined;
            host.requestUpdate();
            host.emit("writeError", { value: v, error: e && e.message ? e.message : String(e) });
        });
    }
}
export const VALUE_EVENTS = {
    change: { label: "On Change (the user changed it)", payload: { value: "any" } },
    writeError: { label: "On Write Error", payload: { value: "any", error: "string" } }
};

// ---- options (radio, select, segmented, combobox): a list, or from data ----------------------
export const OPTION_PROPS = {
    options: { type: "list", default: [{ value: "a", label: "Option A" }, { value: "b", label: "Option B" }, { value: "c", label: "Option C" }],
        group: "Content", label: "Options", item: { row: true, fields: { value: { type: "string", label: "Value", default: "" }, label: { type: "string", label: "Label", default: "" } } } },
    itemValue: { type: "string", default: "value", group: "Content", label: "From data: the value field", help: "Options from data (Data → Options from data): an array of strings, or of objects with this field…" },
    itemLabel: { type: "string", default: "label", group: "Content", label: "From data: the label field" }
};
export const OPTION_INPUT = { items: { type: "any", label: "Options from data (overrides the list)", help: "An array: strings, or objects ({ value, label } — the fields named in Content)." } };
/** [{ value, label, disabled }] from the list or the data. */
export function optionsOf(el) {
    const p = el.p || {};
    const data = el.status("items").bound ? el.in.items : null;
    const src = Array.isArray(data) ? data : (Array.isArray(p.options) ? p.options : []);
    const vf = p.itemValue || "value", lf = p.itemLabel || "label";
    return src.map((o) => {
        if (o === null || typeof o !== "object") return { value: String(o), label: String(o) };
        const v = o[vf] !== undefined ? o[vf] : o.value;
        const l = o[lf] !== undefined ? o[lf] : (o.label !== undefined ? o.label : v);
        return { value: v === undefined || v === null ? "" : String(v), label: l === undefined || l === null ? "" : String(l), disabled: !!o.disabled };
    }).filter((o) => o.value !== "" || o.label !== "");
}

// ---- icons (inline SVG: Font Awesome does not reach into a shadow root) ----------------------
const P = {
    check: "M20 6 9 17l-5-5",
    x: "M18 6 6 18M6 6l12 12",
    "chevron-down": "m6 9 6 6 6-6",
    "chevron-up": "m18 15-6-6-6 6",
    "chevron-right": "m9 18 6-6-6-6",
    plus: "M12 5v14M5 12h14",
    minus: "M5 12h14",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3",
    "chevron-left": "m15 18-6-6 6-6",
    "chevrons-left": "m11 17-5-5 5-5m7 10-5-5 5-5",
    "chevrons-right": "m13 17 5-5-5-5m-7 10 5-5-5-5",
    calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2",
    eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    "eye-off": "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.4 10.4 0 0 1 12 5c5 0 9 4.5 10 7a11.8 11.8 0 0 1-2.9 3.9M6.1 6.1C3.9 7.6 2.5 9.7 2 12c1 2.5 5 7 10 7 1.5 0 2.9-.3 4.1-.9",
    info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01",
    "external-link": "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
    "alert-triangle": "m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3ZM12 9v4M12 17h.01",
    "alert-circle": "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 8v4M12 16h.01",
    "check-circle": "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3",
    user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "arrow-up": "M12 19V5M5 12l7-7 7 7",
    "arrow-down": "M12 5v14M19 12l-7 7-7-7",
    "arrow-right": "M5 12h14M12 5l7 7-7 7",
    inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z",
    power: "M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
    play: "m6 3 14 9-14 9V3Z",
    stop: "M6 6h12v12H6z",
    star: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1L12 2Z",
    circle: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    loader: "M21 12a9 9 0 1 1-6.2-8.6"
};
export const ICON_NAMES = Object.keys(P).filter((k) => k !== "loader");
export const ICON_OPTIONS = [{ value: "", label: "(none)" }].concat(ICON_NAMES.map((n) => ({ value: n, label: n })));
export const iconProp = (label, d = "", group = "Content") => ({ type: "enum", default: d, options: ICON_OPTIONS, style: "select", group, label });
/** An icon by name ("" = none). */
export function icon(name, cls) {
    const d = P[name];
    if (!d) return nothing;
    return html`<span class="icon ${cls || ""}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg`<path d="${d}"></path>`}</svg></span>`;
}
/** A filled star (rating). */
export function starIcon(fill) {
    return html`<svg viewBox="0 0 24 24" aria-hidden="true" style="width:100%;height:100%"><path d="${P.star}" fill="${fill}" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path></svg>`;
}
export function spinner() {
    return html`<span class="icon spin" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">${svg`<path d="${P.loader}"></path>`}</svg></span>`;
}

// ---- small helpers ----------------------------------------------------------------------------
/** "true" / "1" / 12 / "{\"a\":1}" -> their values; anything else stays text. */
export function parseValue(v) {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (t === "") return "";
    if (t === "true") return true;
    if (t === "false") return false;
    if (t !== "" && isFinite(Number(t))) return Number(t);
    if (/^[[{"]/.test(t)) { try { return JSON.parse(t); } catch (e) { /* text */ } }
    return v;
}
export const num = (v, d) => { const n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : d; };
