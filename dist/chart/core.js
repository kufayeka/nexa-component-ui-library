// Nexa UI — the chart core: what every chart shares. Constants (palettes, options, number
// formats), the look (CHART_CSS: the container, the plot, the legend, the tooltip, the menu) and
// ChartElement, the base of every chart's view:
//   - its canvas at its LAYOUT size (the editor zooms its canvas with a CSS transform: a measured
//     box is scaled; the zoom only sharpens the backing store), its observers, scheduleDraw();
//   - the theme's colours, numbers (a spec per series / per value), times (the Time axis props);
//   - the export: the ⋮ menu (Properties: which formats), the file name (an expression of its own
//     {tokens}), the download, the options from Logic over the Properties, a PNG (2×, a title,
//     the span, the legend) — a chart gives its own data / legend through a few hooks.
// A chart's view extends ChartElement and implements prepareData() and draw(target).
import { html, css, evaluateExpression, theme } from "../../../nexa-sdk/nexa-component-sdk.js";
import { BASE_CSS, UIElement } from "../core.js";
import { parts, pad2, clock, relative, MONTHS, DAYS } from "./time.js";

export const CATEGORY_CHART = "UI · Charts";

export const CHART_CAPS = { resizable: true, rotatable: false, flippable: false, lockable: true };

/** The defineUI fields every chart shares. */
export const chartCommon = { category: CATEGORY_CHART, capabilities: CHART_CAPS, css: "" };

// Series colours come from the THEME (Theme & Styling: colors.chart.1 … chart.14, Carbon's categorical colours): the
// view asks `seriesColor(i)`. This list is only the fallback when a page has no theme variables (a bare harness).
export const SERIES_PALETTE = ["#6929c4", "#1192e8", "#005d5d", "#9f1853", "#fa4d56", "#520408", "#198038", "#002d9c", "#ee5396", "#b28600", "#009d9a", "#012749", "#8a3800", "#a56eff"];
// the semantic status colours (tokens colors.red.solid …), with Carbon's values as the fallback
export const STATUS_FALLBACK = { error: "#da1e28", warning: "#f1c21b", success: "#198038", info: "#0f62fe", neutral: "#8d8d8d" };
const STATUS_VAR = { error: "red", warning: "yellow", success: "green", info: "blue", neutral: "gray" };

export const opt = (list) => list.map((x) => (Array.isArray(x) ? { value: x[0], label: x[1] } : { value: x, label: String(x) }));

export const NOTATIONS = [["standard", "As it is (1,234.5)"], ["compact", "Short (1.2K 3.4M 5B)"], ["si", "Engineering (1.5 MW, 2 ms)"], ["scientific", "Scientific (1.23e6)"]];
export const DECIMALS = [["auto", "Automatic"], "0", "1", "2", "3", "4"];
export const DASHES = { solid: [], dashed: [6, 4], dotted: [2, 3] };

export function notationOf(n) {
    return n === "engineering" ? "si" : n === "compact" || n === "si" || n === "scientific" ? n : "standard";
}

export function numOr(v, d) {
    const n = typeof v === "number" ? v : v === "" || v === null || v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : d;
}

export function niceNum(range, round) {
    const exponent = Math.floor(Math.log10(range));
    const fraction = range / Math.pow(10, exponent);
    let niceFraction;
    if (round) {
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3) niceFraction = 2;
        else if (fraction < 7) niceFraction = 5;
        else niceFraction = 10;
    } else {
        if (fraction <= 1) niceFraction = 1;
        else if (fraction <= 2) niceFraction = 2;
        else if (fraction <= 5) niceFraction = 5;
        else niceFraction = 10;
    }
    return niceFraction * Math.pow(10, exponent);
}

export const CHART_CSS = css`
    :host {
        display: block;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        user-select: none;
        box-sizing: border-box;
    }

    .chart-container {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: var(--panel, #181b1f);
        border: 1px solid var(--bd, #2c3235);
        border-radius: var(--r, 4px);
        box-sizing: border-box;
    }

    .plot {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        cursor: crosshair;
        /* "page first": one finger scrolls the page; "chart first" sets none (TimeChartElement) */
        touch-action: pan-x pan-y;
    }

    .gesture-hint {
        position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
        padding: 6px 12px; border-radius: 4px; background: rgba(0, 0, 0, 0.72); color: #fff;
        font: 12px/1.3 var(--nexa-fonts-body, sans-serif); white-space: nowrap;
        pointer-events: none; opacity: 0; transition: opacity 0.2s; z-index: 6;
    }
    .gesture-hint.on { opacity: 1; }

    /* the time ruler / navigator: it says it can be dragged */
    .plot.hover-ruler { cursor: grab; }
    .plot.hover-edge { cursor: ew-resize; }
    .plot.hover-ann { cursor: pointer !important; }
    .plot.dragging { cursor: grabbing !important; }
    .plot.scrubbing { cursor: grabbing !important; }
    .plot.selecting { cursor: col-resize !important; }

    .corner {
        position: absolute;
        top: 6px;
        right: 8px;
        z-index: 5;
        display: flex;
        gap: 6px;
    }

    .btn-chip {
        background: rgba(30, 34, 40, 0.88);
        color: #cbd5e1;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        padding: 3px 8px;
        font-size: 10.5px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
        font-family: var(--nexa-fonts-body, "IBM Plex Sans", system-ui, sans-serif);
    }

    .btn-chip:hover { background: rgba(50, 56, 65, 0.98); color: #fff; }

    .menu-wrap {
        position: relative;
        display: inline-flex;
    }

    .btn-menu {
        background: transparent;
        color: var(--fg-muted, #6f6f6f);
        border: 1px solid transparent;
        border-radius: var(--r, 4px);
        width: 24px;
        height: 24px;
        padding: 0;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
    }

    .btn-menu:hover, .btn-menu.open {
        background: var(--panel-bg-subtle, rgba(127, 127, 127, 0.14));
        color: var(--fg, #161616);
    }

    .menu-dropdown {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        min-width: 140px;
        background: var(--panel, #fff);
        border: 1px solid var(--bd, #e0e0e0);
        border-radius: var(--r, 4px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
        padding: 4px 0;
        z-index: 25;
        display: flex;
        flex-direction: column;
    }

    .menu-item {
        background: none;
        border: none;
        padding: 6px 12px;
        color: var(--fg, #161616);
        font-size: 12px;
        font-family: var(--nexa-fonts-body, "IBM Plex Sans", system-ui, sans-serif);
        text-align: left;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
        transition: background 0.1s, color 0.1s;
    }

    .menu-item:hover {
        background: var(--panel-bg-subtle, rgba(127, 127, 127, 0.14));
        color: var(--fg, #161616);
    }

    .menu-icon {
        font-size: 12px;
        opacity: 0.85;
    }

    .legend {
        flex: 0 0 auto;
        display: flex;
        flex-wrap: wrap;
        gap: 2px 14px;
        padding: 4px 10px 6px 52px;
        font-size: 11px;
        line-height: 1.4;
        color: var(--fg-muted, #a0aec0);
        max-height: 40%;
        overflow-y: auto;
    }

    .lg-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 1px 2px;
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
        cursor: pointer;
        white-space: nowrap;
    }

    .lg-item:hover .lg-name { color: var(--fg, #fff); }
    .lg-item.off { opacity: 0.38; }

    .lg-swatch {
        width: 12px;
        height: 3px;
        border-radius: 2px;
        flex-shrink: 0;
    }

    .lg-val {
        font-family: var(--nexa-fonts-body, "IBM Plex Sans", system-ui, sans-serif);
        color: var(--fg, #fff);
        font-variant-numeric: tabular-nums;
    }

    /* the legend part (legend.js): around the plot (.c-main holds left / plot / right), inside it,
       or a table */
    .c-main { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: row; }
    .c-main > .plot { flex: 1 1 auto; min-width: 0; }
    .legend .lg-item { font-size: var(--lg-size, 11px); }
    .lg-swatch.sw-sq { width: 10px; height: 10px; border-radius: 2px; }
    .lg-swatch.sw-dot { width: 9px; height: 9px; border-radius: 50%; }
    .legend.v { padding: 8px 10px; max-height: none; max-width: 40%; flex-direction: column; flex-wrap: nowrap; align-items: stretch; overflow: auto; }
    .legend.inside {
        position: absolute; z-index: 4; max-width: 60%; max-height: 60%; padding: 4px 8px;
        background: color-mix(in srgb, var(--panel, #181b1f) 88%, transparent);
        border: 1px solid var(--bd, #2c3235); border-radius: var(--r, 4px);
    }
    .legend.inside.tl { left: var(--lg-l, 52px); top: var(--lg-t, 20px); }
    .legend.inside.tr { right: calc(var(--lg-r, 14px) + 28px); top: var(--lg-t, 20px); }
    .legend.inside.bl { left: var(--lg-l, 52px); bottom: var(--lg-b, 50px); }
    .legend.inside.br { right: var(--lg-r, 14px); bottom: var(--lg-b, 50px); }
    .legend.table { display: block; padding: 4px 10px 6px; }
    .legend.v.table { max-width: 50%; }
    .legend.table.inside { padding: 2px 4px; }
    .lg-table { border-collapse: collapse; font-size: var(--lg-size, 11px); width: auto; }
    .legend.table:not(.inside):not(.v) .lg-table { width: 100%; }
    .lg-table th {
        font-weight: 600; color: var(--fg-muted, #a0aec0); text-align: right; padding: 2px 6px;
        border-bottom: 1px solid var(--bd, #2c3235); white-space: nowrap;
    }
    .lg-table th.lg-th-name { text-align: left; }
    .lg-table td { padding: 2px 6px; white-space: nowrap; }
    .lg-table td.lg-val { text-align: right; }
    .lg-row { display: table-row; cursor: pointer; }
    .lg-row:hover { background: var(--panel-bg-subtle, rgba(127, 127, 127, 0.12)); }
    .lg-row:hover .lg-name { color: var(--fg, #fff); }
    .lg-row.off { opacity: 0.38; }
    .lg-name-cell { display: inline-flex; align-items: center; gap: 6px; }

    /* the range buttons above a time chart (time-chart.js) */
    .range-bar { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 6px 10px 0; min-width: 0; }
    .rb-group { display: inline-flex; border: 1px solid var(--bd, #2c3235); border-radius: var(--r, 4px); overflow: hidden; flex-shrink: 1; min-width: 0; }
    .rb-btn {
        border: 0; border-right: 1px solid var(--bd, #2c3235); background: none; color: var(--fg-muted, #a0aec0);
        font: 500 11px/1 var(--nexa-fonts-body, "IBM Plex Sans", system-ui, sans-serif);
        padding: 5px 9px; cursor: pointer; white-space: nowrap; font-variant-numeric: tabular-nums;
    }
    .rb-group .rb-btn:last-child { border-right: 0; }
    .rb-btn:hover { background: var(--panel-bg-subtle, rgba(127, 127, 127, 0.12)); color: var(--fg, #fff); }
    .rb-btn.on { background: var(--cp-solid, #0f62fe); color: var(--cp-contrast, #fff); }
    .rb-fill { flex: 1 1 auto; }
    .rb-now { border: 1px solid var(--bd, #2c3235); border-radius: var(--r, 4px); color: var(--fg, #fff); }
    .rb-live { display: inline-flex; align-items: center; gap: 5px; font: 500 11px/1 var(--nexa-fonts-body, "IBM Plex Sans", system-ui, sans-serif); color: var(--fg-muted, #a0aec0); padding: 0 2px; }

    .tooltip-rows {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .tooltip-name { color: #94a3b8; }
    .tooltip-text { color: #e2e8f0; }

    canvas {
        display: block;
        width: 100%;
        height: 100%;
    }

    .empty {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--fg-subtle, #8e8e8e);
        font-size: var(--fs-label, 12px);
        pointer-events: none;
        gap: 6px;
    }

    .tooltip {
        position: absolute;
        pointer-events: none;
        background: #181b1f;
        color: #fff;
        border: 1px solid var(--bd, #3e444a);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        border-radius: 4px;
        padding: 8px 12px;
        font-size: 11px;
        line-height: 1.4;
        white-space: nowrap;
        z-index: 10;
        transform: translate(12px, -50%);
        font-family: var(--nexa-fonts-body, "IBM Plex Sans", system-ui, sans-serif);
        display: none;
    }

    .tooltip-time {
        color: #a0aec0;
        font-size: 10px;
        margin-bottom: 4px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 3px;
    }

    .tooltip-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .tooltip-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .tooltip-val {
        font-weight: 600;
        color: #fff;
    }

    .btn-reset-zoom {
        background: rgba(30, 34, 40, 0.9);
        color: #cbd5e1;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        padding: 4px 9px;
        font-size: 10px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
        transition: all 0.15s ease;
        font-family: var(--nexa-fonts-body, "IBM Plex Sans", system-ui, sans-serif);
    }

    .btn-reset-zoom:hover {
        background: rgba(50, 56, 65, 0.98);
        color: #fff;
        border-color: rgba(255, 255, 255, 0.35);
    }

    .live-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #10b981;
        display: inline-block;
        box-shadow: 0 0 6px #10b981;
    }
`;

export class ChartElement extends UIElement {
    static styles = [BASE_CSS, CHART_CSS];

    canvas = null;
    ctx = null;
    resizeObserver = null;
    intersectionObserver = null;
    _lastDpr = 1;
    _rafPending = false;
    _menuOpen = false;
    _docPointerDown = null;

    // a chart's own: its data from its props (every change of a prop, one by one), its drawing
    prepareData() {}
    draw() {}

        firstUpdated(changed) {
            super.firstUpdated?.(changed);
            this.setupCanvas();
            this.setupResizeObserver();
            this.setupIntersectionObserver();
            this.prepareData();
            if (this.resizeCanvas()) this.draw();
        }

        connectedCallback() {
            super.connectedCallback();
            if (!this.canvas) this.setupCanvas();
            this.setupResizeObserver();
            this.setupIntersectionObserver();
            this.prepareData();
            this._docPointerDown = (e) => {
                if (this._menuOpen) {
                    const menuWrap = this.renderRoot?.querySelector(".menu-wrap");
                    if (!menuWrap || !e.composedPath().includes(menuWrap)) {
                        this._menuOpen = false;
                        this.requestUpdate();
                    }
                }
            };
            window.addEventListener("pointerdown", this._docPointerDown);
            // print / Export PDF: redrawn sharp, in the colours of the moment (a theme set for paper)
            this._onPrint = (e) => { this._printing = e.type === "beforeprint"; if (this.resizeCanvas()) this.draw(); };
            window.addEventListener("beforeprint", this._onPrint);
            window.addEventListener("afterprint", this._onPrint);
            requestAnimationFrame(() => { if (this.resizeCanvas()) this.draw(); });
        }

        disconnectedCallback() {
            if (this._docPointerDown) {
                window.removeEventListener("pointerdown", this._docPointerDown);
                this._docPointerDown = null;
            }
            if (this._onPrint) {
                window.removeEventListener("beforeprint", this._onPrint);
                window.removeEventListener("afterprint", this._onPrint);
                this._onPrint = null;
            }
            if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
            if (this.intersectionObserver) { this.intersectionObserver.disconnect(); this.intersectionObserver = null; }
            super.disconnectedCallback();
        }

        scheduleDraw() {
            if (this._rafPending) return;
            this._rafPending = true;
            requestAnimationFrame(() => {
                this._rafPending = false;
                if (this.resizeCanvas()) this.draw();
            });
        }

        updated(changed) {
            super.updated?.(changed);
            if (!this.canvas) this.setupCanvas();
            this.scheduleDraw();
        }

        // ---- canvas ----------------------------------------------------------------------------
        _plotEl() { return this.renderRoot?.querySelector(".plot") || null; }

        setupCanvas() {
            this.canvas = this.renderRoot.querySelector("canvas");
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext("2d");
            if (this.canvas.style.width || this.canvas.style.height) { this.canvas.style.width = ""; this.canvas.style.height = ""; }
            this.resizeCanvas();
        }

        setupResizeObserver() {
            if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
            const plot = this._plotEl();
            if (!plot) return;
            this.resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const cr = entry.contentRect;
                    if (cr && cr.width > 0 && cr.height > 0 && this.resizeCanvas()) this.draw();
                }
            });
            this.resizeObserver.observe(plot);
            this.resizeObserver.observe(this);
        }

        setupIntersectionObserver() {
            if (this.intersectionObserver) { this.intersectionObserver.disconnect(); this.intersectionObserver = null; }
            if (typeof IntersectionObserver === "function") {
                this.intersectionObserver = new IntersectionObserver((entries) => {
                    for (const entry of entries) {
                        this._inView = entry.isIntersecting;
                        if (entry.isIntersecting && entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0 && this.resizeCanvas()) this.draw();
                    }
                });
                this.intersectionObserver.observe(this);
            }
        }

        // The plot's size in layout px (clientWidth / clientHeight), never getBoundingClientRect: the
        // editor zooms its canvas with a CSS transform, so the measured box is scaled (at 50 % the
        // chart was drawn at half its size and stretched back: big text, a squashed plot). The
        // zoom only sharpens the backing store.
        _layoutSize() {
            const box = this._plotEl() || this;
            return { box, w: box.clientWidth, h: box.clientHeight };
        }

        resizeCanvas() {
            if (!this.canvas) return false;
            const { box, w, h } = this._layoutSize();
            if (w <= 0 || h <= 0) return false;   // tabs / hidden containers: never collapse the canvas
            const rect = box.getBoundingClientRect();
            const zoom = rect.width > 0 ? Math.max(0.25, Math.min(4, rect.width / w)) : 1;
            const rawDpr = window.devicePixelRatio || 1;
            const base = w >= 1200 ? Math.min(rawDpr, 1.0) : (w >= 800 ? Math.min(rawDpr, 1.25) : Math.min(rawDpr, 1.5));
            // printing: drawn sharp for paper (3x), then back to the screen's resolution
            const dpr = this._printing ? 3 : Math.round(base * zoom * 100) / 100;
            const pixelW = Math.max(1, Math.floor(w * dpr)), pixelH = Math.max(1, Math.floor(h * dpr));
            if (this.canvas.style.width || this.canvas.style.height) { this.canvas.style.width = ""; this.canvas.style.height = ""; }
            if (this.canvas.width === pixelW && this.canvas.height === pixelH && this._lastDpr === dpr) return true;
            this._lastDpr = dpr;
            this.canvas.width = pixelW;
            this.canvas.height = pixelH;
            if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            return true;
        }

        _colors() {
            const cs = getComputedStyle(this);
            return {
                grid: cs.getPropertyValue("--bd").trim() || "rgba(255, 255, 255, 0.08)",
                text: cs.getPropertyValue("--fg-muted").trim() || "rgba(255, 255, 255, 0.55)",
                strong: cs.getPropertyValue("--fg").trim() || "#e5e7eb",
                band: cs.getPropertyValue("--panel-bg-subtle").trim() || "rgba(127, 127, 127, 0.12)",
                accent: cs.getPropertyValue("--cp-solid").trim() || "#3b82f6",
                // the canvas text is the theme's body font (Carbon charts: Plex Sans)
                font: cs.getPropertyValue("--nexa-fonts-body").trim() || '"IBM Plex Sans", system-ui, sans-serif'
            };
        }

        /** Series i's colour: the theme's colors.chart.(i mod 14), so a theme change restyles every chart. */
        seriesColor(i) {
            const n = ((Math.max(0, Math.floor(i) || 0)) % SERIES_PALETTE.length) + 1;
            return getComputedStyle(this).getPropertyValue("--nexa-colors-chart-" + n).trim() || SERIES_PALETTE[n - 1];
        }

        // a colour as saved: a hex / rgb as it is, a {token:colors.…} as the theme's value now (the host resolves the
        // chart's own props, not the fields of the items inside a list: a series' or a threshold's colour comes here)
        _tok(v) {
            if (typeof v !== "string") return "";
            const m = /^\s*\{token:([^}]+)\}\s*$/.exec(v);
            if (!m) return v.trim();
            const r = theme.token(m[1].trim());
            return typeof r === "string" ? r : "";
        }

        /** A status colour from the theme (error / warning / success / info / neutral): thresholds, states, alarms. */
        statusColor(kind) {
            const k = STATUS_VAR[kind] ? kind : "neutral";
            return getComputedStyle(this).getPropertyValue("--nexa-colors-" + STATUS_VAR[k] + "-solid").trim() || STATUS_FALLBACK[k];
        }

        // a fresh canvas for a draw. Printing: the chart's own background painted in, since the browser prints a canvas's
        // transparent pixels as white paper (on screen they show what is behind). EVERY chart clears through this, never clearRect.
        _clearCanvas(ctx, w, h) {
            ctx.clearRect(0, 0, w, h);
            if (!this._printing || this._exporting) return;
            const bg = this._backgroundColor();
            if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
        }

        // the colour the chart is seen on: its container's, else the first opaque one around it
        _backgroundColor() {
            const opaque = (c) => c && c !== "transparent" && !/rgba\(.*,\s*0\)$/.test(c);
            // the chart's own box: .chart-container, or (Pie, Gauge, Sparkline, Histogram) the first element of its shadow root
            const rr = this.renderRoot;
            let el = rr && (rr.querySelector(".chart-container, [part=container]") || Array.from(rr.children).filter((n) => n.tagName !== "STYLE" && n.tagName !== "SCRIPT")[0]);
            let c = el && getComputedStyle(el).backgroundColor;
            for (el = this; !opaque(c) && el; el = el.parentElement || (el.getRootNode && el.getRootNode().host)) c = getComputedStyle(el).backgroundColor;
            return opaque(c) ? c : "";
        }

        // black or white text on a colour (a hex or an rgb), whichever reads better
        _onColor(color) {
            const m = /rgba?\(([^)]+)\)/.exec(this.hexToRgba(color, 1));
            const [r, g, b] = m ? m[1].split(",").map((x) => Number(x)) : [0, 0, 0];
            return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#161616" : "#ffffff";
        }

        hexToRgba(hexOrRgb, alpha) {
            if (!hexOrRgb) return `rgba(59, 130, 246, ${alpha})`;
            if (hexOrRgb.startsWith("rgb")) return hexOrRgb.replace(/rgba?\(([^)]+)\)/, (m, val) => `rgba(${val.split(",").slice(0, 3).map((s) => s.trim()).join(",")}, ${alpha})`);
            let hex = hexOrRgb.replace("#", "");
            if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
            const num = parseInt(hex, 16);
            if (isNaN(num)) return `rgba(59, 130, 246, ${alpha})`;
            return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
        }

        // a hint over the ruler, on its own dark plate (it never mixes with the labels under it)
        _hint(ctx, text, right, top, c) {
            ctx.font = "9.5px " + c.font;
            const tw = ctx.measureText(text).width;
            ctx.fillStyle = "rgba(0, 0, 0, 0.66)";
            ctx.fillRect(right - tw - 8, top, tw + 8, 13);
            ctx.fillStyle = "#fff";
            ctx.textAlign = "right";
            ctx.textBaseline = "top";
            ctx.fillText(text, right - 4, top + 2);
        }

        // ---- numbers & times -------------------------------------------------------------------
        _seriesSpec(s) {
            return {
                notation: notationOf(s && s.notation), decimals: (s && s.decimals) || "auto",
                separators: (s && s.separators) || "locale", thousands: !(s && s.thousands === false)
            };
        }

        _tf() { return { utc: this.p.timeZone === "utc", h12: this.p.timeFormat === "12h", rel: this.p.timeFormat === "relative" }; }

        // a tick's time; dateShown: the ruler has its date row, so no date here (it would be twice)
        fmtTick(ts, step, dateShown) {
            const f = this._tf();
            if (f.rel && this._newest !== undefined) return relative(ts - this._newest);
            const p = parts(ts, f.utc);
            if (step < 1000) return pad2(p.s) + "." + String(p.ms).padStart(3, "0");
            if (step >= 86400000) return p.d + " " + MONTHS[p.mo];
            // hours apart over several days: the day too ("3 Oct 19:00"), unless a date row says it
            if (step >= 6 * 3600000 && !dateShown) return p.d + " " + MONTHS[p.mo] + " " + clock(p, f.h12, false);
            return clock(p, f.h12, step < 60000);
        }

        // the date, shorter (when the full one does not fit a day's width)
        fmtDateShort(ts) {
            const p = parts(ts, this._tf().utc);
            const fmt = this.p.dateFormat || "default";
            if (fmt === "iso") return pad2(p.mo + 1) + "-" + pad2(p.d);
            if (fmt === "dmy") return pad2(p.d) + "/" + pad2(p.mo + 1);
            if (fmt === "mdy") return pad2(p.mo + 1) + "/" + pad2(p.d);
            return pad2(p.d) + " " + MONTHS[p.mo];
        }

        fmtDate(ts) {
            const p = parts(ts, this._tf().utc);
            const fmt = this.p.dateFormat || "default";
            if (fmt === "iso") return p.y + "-" + pad2(p.mo + 1) + "-" + pad2(p.d);
            if (fmt === "dmy") return pad2(p.d) + "/" + pad2(p.mo + 1) + "/" + p.y;
            if (fmt === "mdy") return pad2(p.mo + 1) + "/" + pad2(p.d) + "/" + p.y;
            return DAYS[p.wd] + " " + pad2(p.d) + " " + MONTHS[p.mo] + " " + p.y;
        }

        fmtTime(ts) {
            const f = this._tf();
            const p = parts(ts, f.utc);
            const base = p.y + "-" + pad2(p.mo + 1) + "-" + pad2(p.d) + " " + clock(p, f.h12, true) + "." + String(p.ms).padStart(3, "0") + (f.utc ? " UTC" : "");
            return f.rel && this._newest !== undefined ? base + "  (" + relative(ts - this._newest) + ")" : base;
        }

        // a prop's text as saved (not resolved: its {tokens} are the chart's own, not page variables)
        _rawText(key) {
            const r = this.raw && this.raw[key];
            return typeof r === "string" ? r : (typeof this.p[key] === "string" ? this.p[key] : "");
        }

        _exportTitle() { return String(this.p.exportTitle || this.p.title || this.p.name || ""); }

        // the export's options: Logic's params, else the Properties
        _exportOpts(params) {
            const P = params && typeof params === "object" ? params : {};
            const pick = (k, prop) => (P[k] !== undefined ? P[k] : this.p[prop]);
            return {
                format: P.format === "xlsx" || P.format === "png" ? P.format : P.format === "csv" ? "csv" : "csv",
                range: (pick("range", "exportRange") || "visible") === "all" ? "all" : "visible",
                annotations: pick("annotations", "exportAnnotations") !== false,
                thresholds: pick("thresholds", "exportThresholds") !== false
            };
        }

        _getExportFileName(format, range = "visible") {
            const utc = this.p.timeZone === "utc";
            const q = parts(Date.now(), utc);
            const dateStr = q.y + "-" + pad2(q.mo + 1) + "-" + pad2(q.d);
            const timeStr = pad2(q.h) + "-" + pad2(q.mi) + "-" + pad2(q.s);
            const title = String(this._exportTitle() || this.p.exportName || "chart").replace(/[/\\?%*:|"<>]/g, "_");
            // the raw text: its {date} / {title}… are the chart's tokens, never variables of the page
            const expr = this._rawText("exportFilename").trim();

            if (expr) {
                const vars = {
                    title,
                    name: title,
                    date: dateStr,
                    time: timeStr,
                    year: q.y,
                    month: pad2(q.mo + 1),
                    day: pad2(q.d),
                    hour: pad2(q.h),
                    minute: pad2(q.mi),
                    second: pad2(q.s),
                    format,
                    range
                };
                let val = null;
                try {
                    val = evaluateExpression(expr, (src, ref) => {
                        const key = ref || src;
                        return key in vars ? vars[key] : (ref in vars ? vars[ref] : (src in vars ? vars[src] : ""));
                    });
                } catch (_) {}
                if (val !== null && val !== undefined && String(val).trim()) {
                    let res = String(val).trim().replace(/[/\\?%*:|"<>]/g, "_");
                    if (!res.toLowerCase().endsWith("." + format)) res += "." + format;
                    return res;
                }
                let replaced = expr;
                for (const [k, v] of Object.entries(vars)) {
                    replaced = replaced.split("{" + k + "}").join(String(v));
                }
                replaced = replaced.replace(/[/\\?%*:|"<>]/g, "_").trim();
                if (replaced) {
                    if (!replaced.toLowerCase().endsWith("." + format)) replaced += "." + format;
                    return replaced;
                }
            }

            return (this.p.exportName || "chart") + "-" + q.y + pad2(q.mo + 1) + pad2(q.d) + "-" + pad2(q.h) + pad2(q.mi) + "." + format;
        }

        _download(blob, name) {
            if (this.isEditor) return;
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = name;
            this.renderRoot.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        }

        /**
         * Download: { format: "csv" | "xlsx" | "png", range: "visible" | "all", annotations, thresholds }
         * (each optional: the Properties' Export settings). The shown series only. CSV / Excel: a
         * row per time, a column per series, an Annotation column; Excel: values past a limit in its
         * colour, an Info sheet. -> rows written (PNG: a Promise of { name, blob }).
         */

    // the ⋮ menu: the formats the Properties allow (exportCsv / exportXlsx / exportPng)
    _renderMenu() {
        if (this.p.exportButton === false || (this.p.exportCsv === false && this.p.exportXlsx === false && this.p.exportPng === false)) return "";
        return html`
                                                            <div class="menu-wrap">
                                    <button type="button" class="btn-menu ${this._menuOpen ? "open" : ""}"
                                        title="Download"
                                        @click=${(e) => { e.stopPropagation(); this._menuOpen = !this._menuOpen; this.requestUpdate(); }}>
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                            <circle cx="8" cy="3" r="1.5"/>
                                            <circle cx="8" cy="8" r="1.5"/>
                                            <circle cx="8" cy="13" r="1.5"/>
                                        </svg>
                                    </button>
                                    ${this._menuOpen ? html`
                                        <div class="menu-dropdown">
                                            ${[["csv", "exportCsv", "⤓", "Download CSV"], ["xlsx", "exportXlsx", "⤓", "Download Excel"], ["png", "exportPng", "📷", "Download PNG"]]
                                                .filter((x) => this.p[x[1]] !== false).map((x) => html`
                                                <button type="button" class="menu-item" @click=${(e) => { e.stopPropagation(); this._menuOpen = false; this.requestUpdate(); this.exportData({ format: x[0] }); }}>
                                                    <span class="menu-icon">${x[2]}</span> ${x[3]}
                                                </button>`)}
                                        </div>` : ""}
                                </div>`;
    }
}
