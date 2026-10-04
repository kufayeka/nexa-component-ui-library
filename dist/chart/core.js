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
import { html, css, evaluateExpression } from "../../../nexa-sdk/nexa-component-sdk.js";
import { BASE_CSS, UIElement } from "../core.js";
import { parts, pad2, clock, relative, MONTHS, DAYS } from "./time.js";

export const CATEGORY_CHART = "UI · Charts";

export const CHART_CAPS = { resizable: true, rotatable: false, flippable: false, lockable: true };

/** The defineUI fields every chart shares. */
export const chartCommon = { category: CATEGORY_CHART, capabilities: CHART_CAPS, css: "" };

export const SERIES_PALETTE = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];

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
        touch-action: none;
    }

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
        font-family: var(--nexa-fonts-mono, monospace);
    }

    .btn-chip:hover { background: rgba(50, 56, 65, 0.98); color: #fff; }

    .menu-wrap {
        position: relative;
        display: inline-flex;
    }

    .btn-menu {
        background: rgba(30, 34, 40, 0.88);
        color: #94a3b8;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 4px;
        width: 22px;
        height: 22px;
        padding: 0;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
    }

    .btn-menu:hover, .btn-menu.open {
        background: rgba(50, 56, 65, 0.98);
        color: #fff;
        border-color: rgba(255, 255, 255, 0.35);
    }

    .menu-dropdown {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        min-width: 140px;
        background: #1e2228;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 4px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
        padding: 4px 0;
        z-index: 25;
        display: flex;
        flex-direction: column;
    }

    .menu-item {
        background: none;
        border: none;
        padding: 6px 12px;
        color: #cbd5e1;
        font-size: 11px;
        font-family: var(--nexa-fonts-mono, monospace);
        text-align: left;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
        transition: background 0.1s, color 0.1s;
    }

    .menu-item:hover {
        background: rgba(59, 130, 246, 0.18);
        color: #fff;
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
        font-family: var(--mono, monospace);
        color: var(--fg, #fff);
        font-variant-numeric: tabular-nums;
    }

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
        font-family: var(--nexa-fonts-mono, monospace);
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
        font-family: var(--nexa-fonts-mono, monospace);
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
            requestAnimationFrame(() => { if (this.resizeCanvas()) this.draw(); });
        }

        disconnectedCallback() {
            if (this._docPointerDown) {
                window.removeEventListener("pointerdown", this._docPointerDown);
                this._docPointerDown = null;
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
            const dpr = Math.round(base * zoom * 100) / 100;
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
                mono: cs.getPropertyValue("--mono") || "monospace"
            };
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
            ctx.font = "9.5px " + c.mono;
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
