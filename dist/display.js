// Nexa UI — display and feedback: Text, Heading, Badge, Tag, Card, Avatar, Stat, Alert,
// Progress, Spinner, Skeleton, Separator, Empty State, Timeline, Fieldset.
// Their colours and sizes are theme tokens by default ({token:colors.fg}, {token:fontSizes.2xl}…):
// they follow the app's theme and the colour mode, and each one can be bound instead.
import { html, css, nothing, svg, assetUrl, theme } from "../../nexa-sdk/nexa-component-sdk.js";
import {
    CATEGORY_DISPLAY, PREFIX, BASE_CSS, UIElement, CSS_GROUP, part, PALETTES,
    sizeProp, paletteProp, variantProp, radiusProp, iconProp, icon, num, defineUI } from "./core.js";

const CAPS = { resizable: true, rotatable: true, flippable: false, lockable: true };
const common = { category: CATEGORY_DISPLAY, capabilities: CAPS, css: "" };
const px = (v, d) => num(v, d) + "px";
const ALIGN = { type: "enum", default: "left", group: "Style", label: "Align", style: "segmented",
    options: [{ value: "left", label: "Left", icon: "fa fa-align-left" }, { value: "center", label: "Center", icon: "fa fa-align-center" }, { value: "right", label: "Right", icon: "fa fa-align-right" }] };
const VALIGN = { type: "enum", default: "top", group: "Style", label: "Vertical", style: "segmented",
    options: [{ value: "top", label: "Top" }, { value: "center", label: "Middle" }, { value: "bottom", label: "Bottom" }] };
const JUST = { top: "flex-start", center: "center", bottom: "flex-end", left: "flex-start", right: "flex-end" };

// =================================================================================================
// Text, Heading
// =================================================================================================
const TEXT_CSS = css`
    .t { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; }
    .in { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
    .in.clamp { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
    .in.truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;
const typeProps = (text, size, weight, color) => ({
    text: { type: "text", default: text, group: "Content", label: "Text", rows: 3 },
    fontSize: { type: "number", default: `{token:fontSizes.${size}}`, tokens: "fontSizes", min: 1, unit: "px", group: "Style", label: "Font size" },
    fontWeight: { type: "number", default: `{token:fontWeights.${weight}}`, tokens: "fontWeights", min: 100, max: 900, step: 100, group: "Style", label: "Weight" },
    color: { type: "color", default: `{token:colors.${color}}`, group: "Style", label: "Colour" },
    lineHeight: { type: "number", default: "{token:lineHeights.moderate}", tokens: "lineHeights", min: 0.5, step: 0.05, group: "Style", label: "Line height" },
    align: ALIGN, verticalAlign: VALIGN,
    italic: { type: "boolean", default: false, group: "Style", label: "Italic" },
    lineClamp: { type: "number", default: 0, min: 0, group: "Style", label: "At most … lines (0 = all)" },
    truncate: { type: "boolean", default: false, group: "Style", label: "One line, … at the end" }
});
class TextView extends UIElement {
    static styles = [BASE_CSS, TEXT_CSS];
    tag() { return "p"; }
    render() {
        const p = this.p, clamp = num(p.lineClamp, 0);
        const style = `font-size:${px(p.fontSize, 14)};font-weight:${num(p.fontWeight, 400)};letter-spacing:${this.tag() === "h" ? "0" : "0.16px"};color:${p.color || "inherit"};line-height:${num(p.lineHeight, 1.5)};text-align:${p.align || "left"};font-style:${p.italic ? "italic" : "normal"};${clamp > 0 ? "-webkit-line-clamp:" + clamp + ";" : ""}`;
        const cls = "in " + (p.truncate ? "truncate" : clamp > 0 ? "clamp" : "");
        const body = this.tag() === "h" ? html`<h2 class="${cls}" part="text" style="${style}">${p.text}</h2>` : html`<p class="${cls}" part="text" style="${style}">${p.text}</p>`;
        return html`<div class="t" part="root" style="justify-content:${JUST[p.verticalAlign] || "flex-start"}">${body}</div>`;
    }
}
export const text = defineUI({
    ...common, id: PREFIX + "text", label: "Text", icon: "fa fa-font", size: { w: 240, h: 44 },
    properties: typeProps("The quick brown fox jumps over the lazy dog.", "sm", "normal", "fg"),
    parts: { root: part("Root", "root"), text: part("The text", "text") },
    view: class extends TextView { tag() { return "p"; } }
});
export const heading = defineUI({
    ...common, id: PREFIX + "heading", label: "Heading", icon: "fa fa-header", size: { w: 280, h: 40 },
    properties: Object.assign(typeProps("Heading", "3xl", "normal", "fg"), {
        lineHeight: { type: "number", default: "{token:lineHeights.shorter}", tokens: "lineHeights", min: 0.5, step: 0.05, group: "Style", label: "Line height" },
        fontFamily: { type: "string", default: "{token:fonts.heading}", tokens: "fonts", group: "Style", label: "Font" }
    }),
    parts: { root: part("Root", "root"), text: part("The heading", "text") },
    view: class extends TextView {
        tag() { return "h"; }
        updated(c) { super.updated(c); this.style.setProperty("font-family", this.p.fontFamily || ""); }
    }
});

// =================================================================================================
// Badge, Tag
// =================================================================================================
const CHIP_CSS = css`
    .wrap { width: 100%; height: 100%; display: flex; align-items: center; justify-content: var(--jc, flex-start); }
    .chip { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; height: 24px; padding: 0 8px;
        border-radius: var(--r); border: 1px solid transparent; font-weight: 400; font-size: var(--fs-label); letter-spacing: 0.32px; line-height: 1;
        white-space: nowrap; user-select: none; transition: background-color var(--t) var(--ease); }
    :host([data-size="xs"]) .chip { height: 18px; padding: 0 6px; }
    :host([data-size="md"]) .chip { height: 32px; padding: 0 12px; font-size: var(--fs); letter-spacing: 0.16px; }
    :host([data-size="lg"]) .chip, :host([data-size="xl"]) .chip { height: 40px; padding: 0 16px; font-size: var(--fs); letter-spacing: 0.16px; }
    .badge .chip { font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; }
    .chip .icon svg { width: 12px; height: 12px; }
    .chip .txt { overflow: hidden; text-overflow: ellipsis; }
    :host([data-variant="solid"]) .chip { background: var(--cp-solid); color: var(--cp-contrast); }
    :host([data-variant="subtle"]) .chip { background: var(--cp-subtle); color: var(--cp-fg); }
    :host([data-variant="surface"]) .chip { background: var(--cp-subtle); color: var(--cp-fg); border-color: var(--cp-muted); }
    :host([data-variant="outline"]) .chip { background: transparent; color: var(--cp-fg); border-color: var(--cp-fg); }
    .clickable:hover { filter: brightness(0.96); }
    .close { all: unset; display: inline-flex; cursor: pointer; border-radius: 50%; padding: 2px; margin-right: -4px; }
    .close:hover { background: var(--cp-muted); }
    .close:focus-visible { outline: 2px solid var(--ring); outline-offset: 0; }
    .clickable { cursor: pointer; }
`;
const chipProps = (textDefault, palette) => ({
    text: { type: "string", default: textDefault, group: "Content", label: "Text" },
    startIcon: iconProp("Icon"),
    align: ALIGN,
    variant: variantProp(["subtle", "solid", "surface", "outline"].map((v) => ({ value: v, label: v })), "subtle"),
    size: sizeProp("sm"), colorPalette: paletteProp(palette), radius: radiusProp("full")
});
export const badge = defineUI({
    ...common, id: PREFIX + "badge", label: "Badge", icon: "fa fa-certificate", size: { w: 90, h: 28 },
    properties: Object.assign(chipProps("Badge", "gray"), { radius: radiusProp("sm") }),
    parts: { chip: part("The badge", "chip") },
    view: class extends UIElement {
        static styles = [BASE_CSS, CHIP_CSS];
        static palette = "gray";
        render() {
            const p = this.p;
            return html`<div class="wrap badge" style="--jc:${JUST[p.align] || "flex-start"}"><span class="chip" part="chip">${icon(p.startIcon)}<span class="txt">${p.text}</span></span></div>`;
        }
    }
});
export const tag = defineUI({
    ...common, id: PREFIX + "tag", label: "Tag", icon: "fa fa-tag", size: { w: 110, h: 32 },
    properties: Object.assign(chipProps("Tag", "gray"), {
        closable: { type: "boolean", default: false, group: "Behaviour", label: "× to close it (On Close)" },
        hideOnClose: { type: "boolean", default: true, group: "Behaviour", label: "Hides itself when closed", visibleWhen: (p) => !!p.closable }
    }),
    events: { click: { label: "On Click" }, close: { label: "On Close (×)" } },
    parts: { chip: part("The tag", "chip") },
    view: class extends UIElement {
        static styles = [BASE_CSS, CHIP_CSS];
        static palette = "gray";
        closed = false;
        render() {
            const p = this.p;
            if (this.closed && !this.isEditor) return nothing;
            return html`<div class="wrap" style="--jc:${JUST[p.align] || "flex-start"}"><span class="chip clickable" part="chip" @click="${() => this.fire("click")}">
                ${icon(p.startIcon)}<span class="txt">${p.text}</span>
                ${p.closable ? html`<button class="close" type="button" title="Close" @click="${(e) => { e.stopPropagation(); if (this.isEditor) return; this.fire("close"); if (p.hideOnClose !== false) { this.closed = true; this.requestUpdate(); } }}">${icon("x")}</button>` : nothing}
            </span></div>`;
        }
    }
});

// =================================================================================================
// Card
// =================================================================================================
const CARD_CSS = css`
    .card { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; border-radius: var(--r); background: var(--panel); color: var(--fg); border: 1px solid transparent;
        transition: box-shadow var(--t) var(--ease), border-color var(--t) var(--ease); }
    :host([data-variant="tile"]) .card { background: var(--bg-subtle); }
    :host([data-variant="elevated"]) .card { box-shadow: var(--nexa-shadows-sm, 0 1px 2px rgba(0,0,0,0.2)); }
    :host([data-variant="elevated"]) .card:hover { box-shadow: var(--nexa-shadows-md, 0 2px 6px rgba(0,0,0,0.3)); }
    :host([data-variant="outline"]) .card { border-color: var(--bd); }
    :host([data-variant="accent"]) .card { background: var(--bg-subtle); box-shadow: inset 0 3px 0 0 var(--cp-solid); }
    .img { flex: 0 0 auto; width: 100%; object-fit: cover; display: block; }
    .content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 8px; padding: var(--pad); overflow: auto; }
    .title { margin: 0; font-size: 1.43em; line-height: 1.3; font-weight: 400; letter-spacing: 0; }
    .desc { margin: 0; color: var(--fg-muted); }
    .body { margin: 0; white-space: pre-wrap; }
    .foot { flex: 0 0 auto; display: flex; }
    .act { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: 0; height: var(--h); padding: 0 var(--px); font-weight: 500; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: space-between; gap: var(--gap); transition: background-color var(--t) var(--ease); }
    .act:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }
    .act.primary { background: var(--cp-solid); color: var(--cp-contrast); }
    .act.primary:hover { background: color-mix(in srgb, var(--cp-solid) 88%, #000); }
    .act.secondary { background: var(--nexa-colors-gray-700, #393939); color: var(--nexa-colors-white, #fff); }
    .act.secondary:hover { background: var(--nexa-colors-gray-600, #525252); }
`;
export const card = defineUI({
    ...common, id: PREFIX + "card", label: "Card", icon: "fa fa-id-card-o", size: { w: 300, h: 220 },
    help: "A card: an image, a title, text and up to two actions. For a card holding other components, use a frame (auto layout) with a fill / stroke / radius from the theme.",
    properties: {
        image: { type: "asset", default: "", group: "Content", label: "Image (top)" },
        imageHeight: { type: "number", default: 120, min: 0, unit: "px", group: "Content", label: "Image height", visibleWhen: (p) => !!p.image },
        title: { type: "string", default: "Card title", group: "Content", label: "Title" },
        description: { type: "string", default: "A short description.", group: "Content", label: "Description" },
        body: { type: "text", default: "", group: "Content", label: "Body text", rows: 3 },
        primaryAction: { type: "string", default: "Open", group: "Content", label: "Primary action (a button; empty = none)" },
        secondaryAction: { type: "string", default: "", group: "Content", label: "Secondary action" },
        variant: variantProp([{ value: "tile", label: "Tile" }, { value: "accent", label: "Tile, a coloured top" }, { value: "outline", label: "Outline" }, { value: "elevated", label: "Elevated" }], "tile"),
        size: sizeProp(), colorPalette: paletteProp(), radius: radiusProp("md"),
        padding: { type: "number", default: "{token:spacing.4}", tokens: "spacing", min: 0, unit: "px", group: "Style", label: "Padding" }
    },
    events: { action: { label: "On Action (a button)", payload: { action: "string" } }, primary: { label: "On Primary Action" }, secondary: { label: "On Secondary Action" } },
    parts: { card: part("The card", "card"), title: part("Title", "title"), description: part("Description", "description"), body: part("Body", "body"), footer: part("Footer", "footer") },
    view: class extends UIElement {
        static styles = [BASE_CSS, CARD_CSS];
        act(which) { this.fire(which); this.fire("action", { action: which }); }
        render() {
            const p = this.p, src = p.image ? assetUrl(p.image) : "";
            return html`<div class="card" part="card" style="--pad:${px(p.padding, 16)}">
                ${src ? html`<img class="img" src="${src}" alt="" style="height:${px(p.imageHeight, 120)}" loading="lazy" />` : nothing}
                <div class="content">
                    ${p.title ? html`<h3 class="title" part="title">${p.title}</h3>` : nothing}
                    ${p.description ? html`<p class="desc" part="description">${p.description}</p>` : nothing}
                    ${p.body ? html`<p class="body" part="body">${p.body}</p>` : nothing}
                </div>
                ${p.primaryAction || p.secondaryAction ? html`<div class="foot" part="footer">
                    ${p.secondaryAction ? html`<button class="act secondary" type="button" @click="${() => this.act("secondary")}">${p.secondaryAction}</button>` : nothing}
                    ${p.primaryAction ? html`<button class="act primary" type="button" @click="${() => this.act("primary")}">${p.primaryAction}${icon("arrow-right")}</button>` : nothing}
                </div>` : nothing}
            </div>`;
        }
    }
});

// =================================================================================================
// Avatar
// =================================================================================================
const AVATAR_CSS = css`
    .wrap { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
    .av { position: relative; width: min(100%, 100cqh); aspect-ratio: 1; height: auto; max-height: 100%; display: flex; align-items: center; justify-content: center;
        border-radius: var(--shape); background: var(--cp-subtle); color: var(--cp-fg); font-weight: 600; overflow: visible; user-select: none; }
    :host { container-type: size; }
    :host([data-variant="solid"]) .av { background: var(--cp-solid); color: var(--cp-contrast); }
    :host([data-variant="outline"]) .av { background: transparent; box-shadow: inset 0 0 0 1.5px var(--cp-border); }
    .av img { width: 100%; height: 100%; object-fit: cover; border-radius: inherit; display: block; }
    .initials { font-size: calc(min(100cqw, 100cqh) * 0.38); line-height: 1; }
    .av .icon svg { width: calc(min(100cqw, 100cqh) * 0.5); height: calc(min(100cqw, 100cqh) * 0.5); }
    .status { position: absolute; right: 4%; bottom: 4%; width: 24%; height: 24%; border-radius: 50%; border: 2px solid var(--bg); }
    .status.online { background: var(--nexa-colors-green-500, #24a148); }
    .status.offline { background: var(--nexa-colors-gray-400, #8d8d8d); }
    .status.busy { background: var(--nexa-colors-red-600, #da1e28); }
    .status.away { background: var(--nexa-colors-yellow-300, #f1c21b); }
`;
function initialsOf(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
}
function paletteFor(name) {
    const list = PALETTES.filter((p) => p !== "primary" && p !== "gray");
    let h = 0; for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return list[h % list.length];
}
export const avatar = defineUI({
    ...common, id: PREFIX + "avatar", label: "Avatar", icon: "fa fa-user-circle", size: { w: 48, h: 48 },
    properties: {
        name: { type: "string", default: "Ada Lovelace", group: "Content", label: "Name (its initials)" },
        src: { type: "asset", default: "", group: "Content", label: "Picture" },
        status: { type: "enum", default: "", group: "Content", label: "Status dot", options: [{ value: "", label: "(none)" }, "online", "offline", "busy", "away"] },
        shape: { type: "enum", default: "full", group: "Style", label: "Shape", style: "segmented", options: [{ value: "full", label: "Circle" }, { value: "rounded", label: "Rounded" }, { value: "square", label: "Square" }] },
        variant: variantProp(["subtle", "solid", "outline"].map((v) => ({ value: v, label: v })), "subtle"),
        colorPalette: { ...paletteProp("auto"), options: [{ value: "auto", label: "auto (from the name)" }].concat(PALETTES.map((p) => ({ value: p, label: p }))), help: "auto: a palette picked from the name, the same one each time." }
    },
    events: { click: { label: "On Click" } },
    parts: { avatar: part("The avatar", "avatar") },
    view: class extends UIElement {
        static styles = [BASE_CSS, AVATAR_CSS];
        failed = "";
        updated(c) {
            // "auto": the palette from the name
            if (this.p.colorPalette === "auto") this.p = Object.assign({}, this.p, { colorPalette: paletteFor(this.p.name) });
            super.updated(c);
        }
        render() {
            const p = this.p, src = p.src ? assetUrl(p.src) : "";
            const shape = p.shape === "square" ? "0" : p.shape === "rounded" ? "var(--nexa-radii-lg, 8px)" : "9999px";
            const ini = initialsOf(p.name);
            const inner = src && this.failed !== src
                ? html`<img src="${src}" alt="${p.name || ""}" @error="${() => { this.failed = src; this.requestUpdate(); }}" />`
                : ini ? html`<span class="initials">${ini}</span>` : icon("user");
            return html`<div class="wrap"><div class="av" part="avatar" role="img" aria-label="${p.name || "avatar"}" style="--shape:${shape}" @click="${() => this.fire("click")}">
                ${inner}${p.status ? html`<span class="status ${p.status}" title="${p.status}"></span>` : nothing}
            </div></div>`;
        }
    }
});

// =================================================================================================
// Stat
// =================================================================================================
const STAT_CSS = css`
    .stat { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 4px; overflow: hidden; }
    .lbl { color: var(--fg-muted); font-size: var(--fs-label); letter-spacing: 0.32px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
    .val { font-family: var(--mono); font-size: 2em; font-weight: 400; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .unit { color: var(--fg-muted); font-size: 0.93em; }
    .help { display: flex; align-items: center; gap: 6px; font-size: var(--fs-label); letter-spacing: 0.32px; color: var(--fg-muted); white-space: nowrap; overflow: hidden; }
    .chg { display: inline-flex; align-items: center; gap: 2px; font-family: var(--mono); letter-spacing: 0; }
    .chg.good { color: var(--nexa-colors-fg-success, #198038); }
    .chg.bad { color: var(--nexa-colors-fg-error, #da1e28); }
    .chg .icon svg { width: 1em; height: 1em; }
    .unknown { color: var(--fg-subtle); }
`;
export const stat = defineUI({
    ...common, id: PREFIX + "stat", label: "Stat", icon: "fa fa-line-chart", size: { w: 200, h: 96 },
    help: "A value with its label, unit, and a change up / down. Bind Value (or Data → Value) to a tag.",
    properties: {
        label: { type: "string", default: "Throughput", group: "Content", label: "Label" },
        value: { type: "string", default: "1284", group: "Content", label: "Value (static; Data → Value (read) wins)" },
        unit: { type: "string", default: "pcs/h", group: "Content", label: "Unit" },
        decimals: { type: "number", default: -1, min: -1, max: 10, group: "Content", label: "Decimals (-1: as it is)" },
        helpText: { type: "string", default: "vs last shift", group: "Content", label: "Help text" },
        change: { type: "string", default: "12.5", group: "Content", label: "Change (a number; empty = none)" },
        changeFormat: { type: "enum", default: "percent", group: "Content", label: "The change is", style: "segmented", options: [{ value: "percent", label: "%" }, { value: "value", label: "a value" }] },
        upIsGood: { type: "boolean", default: true, group: "Content", label: "Up is good (green); off: up is bad" },
        align: ALIGN, size: sizeProp()
    },
    inputs: { value: { type: "any", label: "Value (read)", help: "A tag / variable: shown instead of the static value." } },
    parts: { label: part("Label", "label"), value: part("Value", "value"), help: part("Help line", "help") },
    view: class extends UIElement {
        static styles = [BASE_CSS, STAT_CSS];
        render() {
            const p = this.p, st = this.status("value");
            const raw = st.bound ? this.in.value : p.value;
            const unknown = st.bound && (raw === null || raw === undefined);
            const n = typeof raw === "number" ? raw : parseFloat(raw);
            const d = num(p.decimals, -1);
            const shown = unknown ? "" : isFinite(n) && String(raw).trim() !== "" ? (d >= 0 ? this.format(n, { decimals: d }) : String(raw)) : String(raw === null || raw === undefined ? "" : raw);
            const ch = String(p.change === null || p.change === undefined ? "" : p.change).trim() === "" ? NaN : parseFloat(p.change);
            const up = ch > 0, good = isFinite(ch) && ch !== 0 && (up === (p.upIsGood !== false));
            const align = p.align === "center" ? "center" : p.align === "right" ? "flex-end" : "flex-start";
            return html`<div class="stat" style="align-items:${align};text-align:${p.align || "left"}">
                ${p.label ? html`<div class="lbl" part="label">${p.label}</div>` : nothing}
                <div class="row"><span class="val ${unknown ? "unknown" : ""}" part="value">${shown}</span>${p.unit ? html`<span class="unit">${p.unit}</span>` : nothing}</div>
                ${isFinite(ch) || p.helpText ? html`<div class="help" part="help">
                    ${isFinite(ch) ? html`<span class="chg ${ch === 0 ? "" : good ? "good" : "bad"}">${ch === 0 ? nothing : icon(up ? "arrow-up" : "arrow-down")}${Math.abs(ch)}${p.changeFormat === "percent" ? "%" : ""}</span>` : nothing}
                    ${p.helpText ? html`<span>${p.helpText}</span>` : nothing}
                </div>` : nothing}
            </div>`;
        }
    }
});

// =================================================================================================
// Alert
// =================================================================================================
const STATUS_PALETTE = { info: "blue", success: "green", warning: "yellow", error: "red", neutral: "gray" };
const STATUS_ICON = { info: "info", success: "check-circle", warning: "alert-triangle", error: "alert-circle", neutral: "info" };
const ALERT_CSS = css`
    .alert { width: 100%; height: 100%; display: flex; align-items: flex-start; gap: var(--gap); padding: 14px var(--px) 14px calc(var(--px) - 3px);
        border-radius: var(--r); border: 1px solid transparent; overflow: hidden; color: var(--fg); position: relative; }
    :host([data-variant="inline"]) .alert { background: var(--cp-soft); border-color: color-mix(in srgb, var(--cp-solid) 40%, transparent); border-left: 3px solid var(--cp-solid); }
    :host([data-variant="subtle"]) .alert { background: var(--cp-subtle); padding-left: var(--px); }
    :host([data-variant="outline"]) .alert { background: var(--bg); border-color: var(--bd); border-left: 3px solid var(--cp-solid); }
    :host([data-variant="solid"]) .alert { background: var(--nexa-colors-gray-800, #262626); color: var(--nexa-colors-gray-50, #f4f4f4); border-left: 3px solid var(--cp-solid); }
    :host([data-size="xs"]) .alert, :host([data-size="sm"]) .alert { padding-top: 8px; padding-bottom: 8px; }
    .ico { color: var(--cp-solid); display: inline-flex; padding-top: 1px; }
    .ico .icon svg { width: calc(var(--icon) + 4px); height: calc(var(--icon) + 4px); }
    .txt { flex: 1 1 auto; min-width: 0; display: flex; flex-wrap: wrap; column-gap: 6px; row-gap: 2px; align-items: baseline; }
    .title { font-weight: 600; }
    .desc { white-space: pre-wrap; }
    .close { all: unset; cursor: pointer; display: inline-flex; padding: 2px; border-radius: 2px; }
    .close:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
    .close:focus-visible { outline: 2px solid var(--ring); }
`;
export const alert = defineUI({
    ...common, id: PREFIX + "alert", label: "Alert", icon: "fa fa-exclamation-circle", size: { w: 360, h: 72 },
    properties: {
        status: { type: "enum", default: "info", group: "Content", label: "Status", options: ["info", "success", "warning", "error", "neutral"] },
        title: { type: "string", default: "Heads up", group: "Content", label: "Title" },
        description: { type: "text", default: "Something needs your attention.", group: "Content", label: "Description", rows: 2 },
        showIcon: { type: "boolean", default: true, group: "Content", label: "Its icon" },
        closable: { type: "boolean", default: false, group: "Behaviour", label: "× to close it (On Close)" },
        variant: variantProp([{ value: "inline", label: "Inline (a bar at the start)" }, { value: "subtle", label: "Subtle" }, { value: "outline", label: "Outline" }, { value: "solid", label: "High contrast" }], "inline"),
        size: sizeProp(), radius: radiusProp("sm"),
        colorPalette: { ...paletteProp("auto"), options: [{ value: "auto", label: "auto (from the status)" }].concat(PALETTES.map((p) => ({ value: p, label: p }))) }
    },
    events: { close: { label: "On Close (×)" } },
    parts: { alert: part("The alert", "alert"), title: part("Title", "title"), description: part("Description", "description") },
    view: class extends UIElement {
        static styles = [BASE_CSS, ALERT_CSS];
        closed = false;
        updated(c) {
            if (!this.p.colorPalette || this.p.colorPalette === "auto") this.p = Object.assign({}, this.p, { colorPalette: STATUS_PALETTE[this.p.status] || "blue" });
            super.updated(c);
        }
        render() {
            const p = this.p;
            if (this.closed && !this.isEditor) return nothing;
            return html`<div class="alert" part="alert" role="${p.status === "error" || p.status === "warning" ? "alert" : "status"}">
                ${p.showIcon !== false ? html`<span class="ico">${icon(STATUS_ICON[p.status] || "info")}</span>` : nothing}
                <div class="txt">${p.title ? html`<div class="title" part="title">${p.title}</div>` : nothing}${p.description ? html`<div class="desc" part="description">${p.description}</div>` : nothing}</div>
                ${p.closable ? html`<button class="close" type="button" title="Close" @click="${() => { if (this.isEditor) return; this.fire("close"); this.closed = true; this.requestUpdate(); }}">${icon("x")}</button>` : nothing}
            </div>`;
        }
    }
});

// =================================================================================================
// Progress (a bar or a circle), Spinner, Skeleton
// =================================================================================================
const PROGRESS_CSS = css`
    .pw { width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 4px; }
    .top { display: flex; justify-content: space-between; gap: var(--gap); font-size: var(--fs-label); letter-spacing: 0.32px; }
    .top .lbl { color: var(--fg-muted); }
    .top .out { color: var(--fg); font-family: var(--mono); font-variant-numeric: tabular-nums; letter-spacing: 0; }
    .track { position: relative; width: 100%; height: var(--thick); border-radius: var(--r); background: var(--bg-muted); overflow: hidden; }
    :host([data-variant="subtle"]) .track { background: var(--cp-subtle); }
    .bar { position: absolute; top: 0; bottom: 0; left: 0; background: var(--cp-solid); border-radius: inherit; transition: width var(--nexa-durations-moderate, 240ms) var(--ease); }
    .striped .bar { background-image: linear-gradient(45deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%); background-size: 1rem 1rem; }
    .animated .bar { animation: nx-ui-stripes 1s linear infinite; }
    @keyframes nx-ui-stripes { from { background-position: 1rem 0; } to { background-position: 0 0; } }
    .indeterminate .bar { width: 40% !important; animation: nx-ui-indet 1.2s ease-in-out infinite; }
    @keyframes nx-ui-indet { 0% { left: -40%; } 100% { left: 100%; } }
    .circle { position: relative; height: 100%; max-width: 100%; aspect-ratio: 1; margin: 0 auto; }
    .circle svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .circle .ring { stroke: var(--bg-muted); }
    .circle .arc { stroke: var(--cp-solid); transition: stroke-dashoffset 0.3s ease; }
    .circle.indeterminate svg { animation: nx-ui-spin 1s linear infinite; }
    .circle .mid { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-variant-numeric: tabular-nums; }
`;
export const progress = defineUI({
    ...common, id: PREFIX + "progress", label: "Progress", icon: "fa fa-tasks", size: { w: 240, h: 36 },
    properties: {
        value: { type: "number", default: 60, group: "Data", label: "Value (static; Data → Value (read) wins)" },
        min: { type: "number", default: 0, group: "Data", label: "Min" },
        max: { type: "number", default: 100, group: "Data", label: "Max" },
        indeterminate: { type: "boolean", default: false, group: "Data", label: "Indeterminate (busy, no value)" },
        shape: { type: "enum", default: "bar", group: "Style", label: "Shape", style: "segmented", options: [{ value: "bar", label: "Bar" }, { value: "circle", label: "Circle" }] },
        label: { type: "string", default: "", group: "Content", label: "Label" },
        showValue: { type: "boolean", default: true, group: "Content", label: "Show the value" },
        valueText: { type: "enum", default: "percent", group: "Content", label: "The value as", style: "segmented", options: [{ value: "percent", label: "%" }, { value: "value", label: "Value" }] },
        thickness: { type: "number", default: 8, min: 1, unit: "px", group: "Style", label: "Thickness", help: "The bar's height; the circle's line." },
        striped: { type: "boolean", default: false, group: "Style", label: "Striped" },
        animated: { type: "boolean", default: false, group: "Style", label: "Moving stripes", visibleWhen: (p) => !!p.striped },
        variant: variantProp([{ value: "outline", label: "Outline" }, { value: "subtle", label: "Subtle" }], "outline"),
        size: sizeProp(), colorPalette: paletteProp(), radius: radiusProp("xs")
    },
    inputs: { value: { type: "number", label: "Value (read)", help: "A tag / variable instead of the static value." } },
    parts: { track: part("The track", "track"), bar: part("The bar / arc", "bar"), label: part("Label line", "label") },
    view: class extends UIElement {
        static styles = [BASE_CSS, PROGRESS_CSS];
        render() {
            const p = this.p, st = this.status("value");
            const raw = st.bound ? this.in.value : p.value;
            const unknown = st.bound && (raw === null || raw === undefined);
            const min = num(p.min, 0), max = num(p.max, 100), v = num(raw, min);
            const pct = max > min ? Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100)) : 0;
            const ind = !!p.indeterminate;
            const out = unknown ? "" : p.valueText === "value" ? String(v) : Math.round(pct) + "%";
            const aria = { role: "progressbar", min, max, now: ind || unknown ? nothing : v };
            if (p.shape === "circle") {
                const t = Math.max(1, num(p.thickness, 8)), r = 50 - t / 2, c = 2 * Math.PI * r;
                return html`<div class="circle ${ind ? "indeterminate" : ""}" part="track" role="progressbar" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${aria.now}">
                    <svg viewBox="0 0 100 100">${svg`<circle class="ring" cx="50" cy="50" r="${r}" fill="none" stroke-width="${t}"></circle>
                        <circle class="arc" part="bar" cx="50" cy="50" r="${r}" fill="none" stroke-width="${t}" stroke-linecap="butt"
                            stroke-dasharray="${c}" stroke-dashoffset="${ind ? c * 0.7 : c * (1 - pct / 100)}"></circle>`}</svg>
                    ${p.showValue && !ind ? html`<div class="mid">${out}</div>` : nothing}
                </div>`;
            }
            return html`<div class="pw" style="--thick:${px(p.thickness, 8)}">
                ${p.label || (p.showValue && !ind) ? html`<div class="top" part="label"><span class="lbl">${p.label}</span>${p.showValue && !ind ? html`<span class="out">${out}</span>` : nothing}</div>` : nothing}
                <div class="track ${p.striped ? "striped" : ""} ${p.striped && p.animated ? "animated" : ""} ${ind ? "indeterminate" : ""}" part="track"
                    role="progressbar" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${aria.now}" aria-label="${p.label || nothing}">
                    <div class="bar" part="bar" style="width:${ind ? 40 : pct}%"></div>
                </div>
            </div>`;
        }
    }
});

const SPINNER_CSS = css`
    .sw { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; gap: var(--gap); color: var(--fg-muted); }
    .sp { height: min(100%, calc(var(--icon) * 2)); aspect-ratio: 1; border-radius: 50%; border: var(--thk) solid var(--bg-muted); border-top-color: var(--c); animation: nx-ui-spin var(--speed) linear infinite; }
`;
export const spinnerComponent = defineUI({
    ...common, id: PREFIX + "spinner", label: "Spinner", icon: "fa fa-spinner", size: { w: 40, h: 40 },
    properties: {
        label: { type: "string", default: "", group: "Content", label: "Text next to it" },
        color: { type: "color", default: "{token:colors.primary.solid}", group: "Style", label: "Colour" },
        thickness: { type: "number", default: 3, min: 1, unit: "px", group: "Style", label: "Thickness" },
        speed: { type: "number", default: 700, min: 100, step: 100, unit: "ms", group: "Style", label: "One turn" },
        size: sizeProp()
    },
    parts: { spinner: part("The spinner", "spinner") },
    view: class extends UIElement {
        static styles = [BASE_CSS, SPINNER_CSS];
        render() {
            const p = this.p;
            return html`<div class="sw" role="status" aria-label="${p.label || "Loading"}"><span class="sp" part="spinner" style="--thk:${px(p.thickness, 3)};--c:${p.color || "currentColor"};--speed:${num(p.speed, 700)}ms"></span>${p.label ? html`<span>${p.label}</span>` : nothing}</div>`;
        }
    }
});

const SKELETON_CSS = css`
    .sk { width: 100%; height: 100%; display: flex; flex-direction: column; gap: 8px; }
    .b { background: var(--bg-muted); border-radius: var(--r); }
    .shape-rect .b { flex: 1 1 auto; }
    .shape-circle .b { height: 100%; aspect-ratio: 1; border-radius: 50%; margin: 0 auto; }
    .shape-text .b { height: 0.8em; min-height: 8px; }
    .shape-text .b:last-child:not(:first-child) { width: 70%; }
    .pulse .b { animation: nx-ui-pulse 1.5s ease-in-out infinite; }
    @keyframes nx-ui-pulse { 50% { opacity: 0.45; } }
    .shine .b { background: linear-gradient(90deg, var(--bg-muted) 25%, var(--bg-subtle) 50%, var(--bg-muted) 75%); background-size: 200% 100%; animation: nx-ui-shine 1.4s linear infinite; }
    @keyframes nx-ui-shine { from { background-position: 200% 0; } to { background-position: -200% 0; } }
`;
export const skeleton = defineUI({
    ...common, id: PREFIX + "skeleton", label: "Skeleton", icon: "fa fa-square", size: { w: 240, h: 60 },
    help: "A placeholder while something loads: bind Loaded to hide it.",
    properties: {
        shape: { type: "enum", default: "text", group: "Content", label: "Shape", style: "segmented", options: [{ value: "text", label: "Text" }, { value: "rect", label: "Box" }, { value: "circle", label: "Circle" }] },
        lines: { type: "number", default: 3, min: 1, max: 20, group: "Content", label: "Lines", visibleWhen: (p) => p.shape === "text" },
        animation: { type: "enum", default: "pulse", group: "Style", label: "Animation", style: "segmented", options: [{ value: "pulse", label: "Pulse" }, { value: "shine", label: "Shine" }, { value: "none", label: "None" }] },
        loaded: { type: "boolean", default: false, group: "Behaviour", label: "Loaded (hides it; bind it)" },
        radius: radiusProp("sm")
    },
    parts: { block: part("A block", "block") },
    view: class extends UIElement {
        static styles = [BASE_CSS, SKELETON_CSS];
        render() {
            const p = this.p;
            if (p.loaded && !this.isEditor) return nothing;
            const n = p.shape === "text" ? Math.max(1, Math.min(20, num(p.lines, 3))) : 1;
            const blocks = []; for (let i = 0; i < n; i++) blocks.push(html`<div class="b" part="block"></div>`);
            return html`<div class="sk shape-${p.shape || "text"} ${p.animation || "pulse"}" aria-busy="true" aria-label="Loading">${blocks}</div>`;
        }
    }
});

// =================================================================================================
// Separator, Empty State, Timeline, Fieldset
// =================================================================================================
const SEP_CSS = css`
    .sep { width: 100%; height: 100%; display: flex; align-items: center; gap: var(--gap); color: var(--fg-muted); }
    .sep.vertical { flex-direction: column; }
    .line { flex: 1 1 auto; border: 0 var(--style) var(--c); border-top-width: var(--thk); }
    .sep.vertical .line { border-top-width: 0; border-left-width: var(--thk); align-self: stretch; }
    .sep.vertical .line { width: 0; }
    .sep.start .line:first-child, .sep.end .line:last-child { flex: 0 0 12px; }
    .lbl { flex: 0 0 auto; font-size: 0.86em; white-space: nowrap; }
`;
export const separator = defineUI({
    ...common, id: PREFIX + "separator", label: "Separator", icon: "fa fa-minus", size: { w: 240, h: 16 },
    properties: {
        orientation: { type: "enum", default: "horizontal", group: "Style", label: "Direction", style: "segmented", options: [{ value: "horizontal", label: "Across" }, { value: "vertical", label: "Down" }] },
        variant: variantProp(["solid", "dashed", "dotted"].map((v) => ({ value: v, label: v })), "solid"),
        thickness: { type: "number", default: 1, min: 1, unit: "px", group: "Style", label: "Thickness" },
        color: { type: "color", default: "{token:colors.border}", group: "Style", label: "Colour" },
        label: { type: "string", default: "", group: "Content", label: "Text in it" },
        labelPosition: { type: "enum", default: "center", group: "Content", label: "Text at", style: "segmented", options: [{ value: "start", label: "Start" }, { value: "center", label: "Middle" }, { value: "end", label: "End" }], visibleWhen: (p) => !!p.label }
    },
    parts: { line: part("The line", "line"), label: part("Its text", "label") },
    view: class extends UIElement {
        static styles = [BASE_CSS, SEP_CSS];
        render() {
            const p = this.p, style = `--thk:${px(p.thickness, 1)};--c:${p.color || "currentColor"};--style:${p.variant || "solid"}`;
            return html`<div class="sep ${p.orientation === "vertical" ? "vertical" : ""} ${p.label ? p.labelPosition || "center" : ""}" role="separator" aria-orientation="${p.orientation || "horizontal"}" style="${style}">
                <span class="line" part="line"></span>${p.label ? html`<span class="lbl" part="label">${p.label}</span><span class="line" part="line"></span>` : nothing}
            </div>`;
        }
    }
});

const EMPTY_CSS = css`
    .es { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; padding: var(--px); overflow: hidden; }
    .ic { width: calc(var(--icon) * 3); height: calc(var(--icon) * 3); border-radius: 50%; background: var(--bg-muted); color: var(--fg-muted); display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
    .ic .icon svg { width: calc(var(--icon) * 1.5); height: calc(var(--icon) * 1.5); }
    .title { font-weight: 600; font-size: 1.1em; }
    .desc { color: var(--fg-muted); max-width: 40ch; }
    .act { all: unset; margin-top: 6px; height: calc(var(--h) * 0.85); padding: 0 var(--px); border-radius: var(--r); font-weight: 600; cursor: pointer; background: var(--cp-solid); color: var(--cp-contrast); display: inline-flex; align-items: center; }
    .act:hover { background: color-mix(in srgb, var(--cp-solid) 86%, #000); }
`;
export const emptyState = defineUI({
    ...common, id: PREFIX + "empty-state", label: "Empty State", icon: "fa fa-inbox", size: { w: 320, h: 220 },
    properties: {
        icon: iconProp("Icon", "inbox"),
        title: { type: "string", default: "No data yet", group: "Content", label: "Title" },
        description: { type: "text", default: "When there is something to show, it appears here.", group: "Content", label: "Description", rows: 2 },
        actionText: { type: "string", default: "", group: "Content", label: "Action (a button; empty = none)" },
        size: sizeProp(), colorPalette: paletteProp(), radius: radiusProp("md")
    },
    events: { action: { label: "On Action (its button)" } },
    parts: { root: part("Root", "root"), title: part("Title", "title"), description: part("Description", "description") },
    view: class extends UIElement {
        static styles = [BASE_CSS, EMPTY_CSS];
        render() {
            const p = this.p;
            return html`<div class="es" part="root">
                ${p.icon ? html`<div class="ic">${icon(p.icon)}</div>` : nothing}
                ${p.title ? html`<div class="title" part="title">${p.title}</div>` : nothing}
                ${p.description ? html`<div class="desc" part="description">${p.description}</div>` : nothing}
                ${p.actionText ? html`<button class="act" type="button" @click="${() => this.fire("action")}">${p.actionText}</button>` : nothing}
            </div>`;
        }
    }
});

const TIMELINE_CSS = css`
    .tl { width: 100%; height: 100%; overflow: auto; display: flex; flex-direction: column; }
    .it { display: flex; gap: var(--gap); position: relative; min-height: 0; }
    .rail { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; width: calc(var(--icon) + 4px); }
    .dot { flex: 0 0 auto; width: calc(var(--icon) * 0.75); height: calc(var(--icon) * 0.75); margin-top: 4px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 20%, transparent); }
    :host([data-variant="outline"]) .dot { background: var(--bg); border: 2px solid var(--c); box-shadow: none; }
    .conn { flex: 1 1 auto; width: 2px; background: var(--bd); margin: 4px 0; min-height: 12px; }
    .it:last-child .conn { visibility: hidden; }
    .ct { flex: 1 1 auto; min-width: 0; padding-bottom: calc(var(--gap) * 2); }
    .row { display: flex; justify-content: space-between; gap: var(--gap); }
    .ttl { font-weight: 600; }
    .time { color: var(--fg-subtle); font-size: var(--fs-label); font-family: var(--mono); white-space: nowrap; }
    .desc { color: var(--fg-muted); white-space: pre-wrap; }
`;
export const timeline = defineUI({
    ...common, id: PREFIX + "timeline", label: "Timeline", icon: "fa fa-list-ol", size: { w: 300, h: 240 },
    properties: {
        items: { type: "list", default: [
            { title: "Order received", description: "PO-1042", time: "08:00", color: "green" },
            { title: "In production", description: "Line 2", time: "09:30", color: "primary" },
            { title: "Quality check", description: "", time: "—", color: "gray" }
        ], group: "Content", label: "Steps", item: { fields: {
            title: { type: "string", label: "Title", default: "" }, description: { type: "string", label: "Description", default: "" },
            time: { type: "string", label: "Time", default: "" }, color: { type: "string", label: "Palette (or empty)", default: "" } } } },
        titleField: { type: "string", default: "title", group: "Content", label: "From data: the title field" },
        descriptionField: { type: "string", default: "description", group: "Content", label: "From data: the description field" },
        timeField: { type: "string", default: "time", group: "Content", label: "From data: the time field" },
        colorField: { type: "string", default: "color", group: "Content", label: "From data: the palette field" },
        variant: variantProp([{ value: "solid", label: "Solid" }, { value: "outline", label: "Outline" }], "solid"),
        size: sizeProp(), colorPalette: paletteProp()
    },
    inputs: { items: { type: "any", label: "Steps from data (overrides the list)", help: "An array of objects (the fields named in Content)." } },
    parts: { item: part("A step", "item"), title: part("A title", "title") },
    view: class extends UIElement {
        static styles = [BASE_CSS, TIMELINE_CSS];
        render() {
            const p = this.p;
            const data = this.status("items").bound && Array.isArray(this.in.items) ? this.in.items : (Array.isArray(p.items) ? p.items : []);
            const f = (o, k, d) => (o && o[p[k] || d] !== undefined ? o[p[k] || d] : o && o[d]);
            return html`<div class="tl" role="list">${data.map((o) => {
                const pal = String(f(o, "colorField", "color") || p.colorPalette || "primary").replace(/[^A-Za-z0-9_-]/g, "");
                const fb = theme.token(`colors.${pal}.solid`);
                return html`<div class="it" role="listitem" part="item" style="--c: var(--nexa-colors-${pal}-solid, ${fb !== undefined ? fb : "var(--cp-solid)"})">
                    <div class="rail"><span class="dot"></span><span class="conn"></span></div>
                    <div class="ct"><div class="row"><span class="ttl" part="title">${f(o, "titleField", "title") || ""}</span><span class="time">${f(o, "timeField", "time") || ""}</span></div>
                        ${f(o, "descriptionField", "description") ? html`<div class="desc">${f(o, "descriptionField", "description")}</div>` : nothing}</div>
                </div>`;
            })}</div>`;
        }
    }
});

const FIELDSET_CSS = css`
    fieldset { width: 100%; height: 100%; margin: 0; padding: calc(var(--px) * 0.75); border: 1px solid transparent; border-radius: var(--r); display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    :host([data-variant="outline"]) fieldset { border-color: var(--bd); }
    :host([data-variant="subtle"]) fieldset { background: var(--bg-subtle); }
    legend { padding: 0 6px; font-size: var(--fs-label); letter-spacing: 0.32px; color: var(--fg-muted); }
    .desc { color: var(--fg-muted); }
    .err { color: var(--err); }
`;
export const fieldset = defineUI({
    ...common, id: PREFIX + "fieldset", label: "Fieldset", icon: "fa fa-object-group", size: { w: 320, h: 200 },
    help: "A group box with a legend: put form controls on it (drawn behind them). For controls that move with it, use a frame and this as its background.",
    properties: {
        legend: { type: "string", default: "Details", group: "Content", label: "Legend" },
        helperText: { type: "string", default: "", group: "Content", label: "Description" },
        invalid: { type: "boolean", default: false, group: "Content", label: "Invalid (shows the error)" },
        errorText: { type: "string", default: "", group: "Content", label: "Error text" },
        variant: variantProp([{ value: "outline", label: "Outline" }, { value: "subtle", label: "Subtle" }, { value: "plain", label: "Plain" }], "outline"),
        size: sizeProp(), radius: radiusProp("md")
    },
    parts: { root: part("The box", "root"), legend: part("Legend", "legend") },
    view: class extends UIElement {
        static styles = [BASE_CSS, FIELDSET_CSS];
        render() {
            const p = this.p;
            return html`<fieldset part="root">${p.legend ? html`<legend part="legend">${p.legend}</legend>` : nothing}
                ${p.helperText ? html`<div class="desc">${p.helperText}</div>` : nothing}
                ${p.invalid && p.errorText ? html`<div class="err">${p.errorText}</div>` : nothing}</fieldset>`;
        }
    }
});
