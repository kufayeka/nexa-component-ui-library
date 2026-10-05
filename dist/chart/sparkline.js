// Nexa UI — Sparkline
// Compact, lightweight trend visualization inspired by Line Chart:
//   - Ideal for tables, KPI cards, compact tiles, and status indicators
//   - Modes: Area (filled gradient), Line, or Mini Bar
//   - Auto trend color: green on uptrend, red on downtrend
//   - Glowing dot on latest value, optional min/max markers
//   - Interactive hover with compact floating tooltip
//   - Direct array ingestion: [10, 15, 8, 24, 30] or [{x, y}]
import { html, css } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, defineUI } from "../core.js";
import { chartCommon, opt, numOr } from "./core.js";
import { ChartElement } from "./core.js";

const common = chartCommon;

const SPARK_CSS = css`
    :host {
        display: inline-block;
        vertical-align: middle;
    }
    .spark-container {
        position: relative;
        display: flex;
        align-items: center;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: transparent;
        box-sizing: border-box;
    }
    .plot {
        position: relative;
        flex: 1 1 auto;
        width: 100%;
        height: 100%;
        cursor: crosshair;
    }
    .spark-readout {
        flex: 0 0 auto;
        padding-left: 8px;
        font-family: var(--nexa-fonts-body, "IBM Plex Sans", system-ui, sans-serif);
        font-size: 13px;
        font-weight: 600;
        color: var(--fg, #ffffff);
        white-space: nowrap;
    }
    .spark-tooltip {
        position: absolute;
        pointer-events: none;
        background: #181b1f;
        color: #fff;
        border: 1px solid var(--bd, #3e444a);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        border-radius: 3px;
        padding: 2px 6px;
        font-size: 10px;
        line-height: 1.2;
        font-family: var(--nexa-fonts-body, "IBM Plex Sans", system-ui, sans-serif);
        white-space: nowrap;
        z-index: 10;
        transform: translate(-50%, -120%);
        display: none;
    }
`;

export class SparklineElement extends ChartElement {
    static styles = [...ChartElement.styles, SPARK_CSS];

    _dynamicData = null;
    _hoverIndex = null;
    _points = [];

    _getData() {
        if (this._dynamicData) return this._dynamicData;
        const raw = this.p && this.p.data;
        if (Array.isArray(raw)) {
            return raw.map((item) => {
                if (typeof item === "number") return item;
                if (item && typeof item === "object") return numOr(item.value !== undefined ? item.value : item.y, 0);
                return numOr(item, 0);
            });
        }
        return [10, 15, 12, 22, 18, 28, 24, 35]; // Default demo sparkline
    }

    prepareData() {
        // Data parsed directly in _getData()
    }

    draw() {
        if (!this.ctx || !this.canvas) return;
        const { w, h } = this._layoutSize();
        if (w <= 0 || h <= 0) return;

        const ctx = this.ctx;
        this._clearCanvas(ctx, w, h);

        const data = this._getData();
        if (!data || data.length < 2) return;

        const colors = this._colors();
        const type = (this.p && this.p.type) || "area";
        const len = data.length;

        let minY = Infinity, maxY = -Infinity;
        for (const v of data) {
            if (v < minY) minY = v;
            if (v > maxY) maxY = v;
        }
        if (maxY <= minY) maxY = minY + 1;
        const rangeY = maxY - minY;

        // Auto trend color
        let color = this.p && this.p.color ? this.p.color : colors.accent;
        if (this.p && this.p.trendColor !== false && len >= 2) {
            const first = data[0], last = data[len - 1];
            if (last > first) color = "#10b981"; // Uptrend green
            else if (last < first) color = "#ef4444"; // Downtrend red
        }

        const padX = 6, padY = 6;
        const plotW = w - padX * 2, plotH = h - padY * 2;

        const pts = [];
        for (let i = 0; i < len; i++) {
            const x = padX + (i / (len - 1)) * plotW;
            const y = padY + plotH - ((data[i] - minY) / rangeY) * plotH;
            pts.push({ x, y, val: data[i], index: i });
        }
        this._points = pts;

        if (type === "bar") {
            // Mini Bar Sparkline
            const barW = Math.max(2, (plotW / len) * 0.7);
            ctx.save();
            ctx.fillStyle = color;
            pts.forEach((p) => {
                const bH = (p.val - minY) / rangeY * plotH;
                ctx.fillRect(p.x - barW / 2, padY + plotH - bH, barW, bH);
            });
            ctx.restore();
            return;
        }

        // Draw Area Fill (if type === "area")
        if (type === "area") {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[pts.length - 1].x, padY + plotH);
            ctx.lineTo(pts[0].x, padY + plotH);
            ctx.closePath();

            const grad = ctx.createLinearGradient(0, padY, 0, padY + plotH);
            const opacity = numOr(this.p && this.p.fillOpacity, 0.28);
            grad.addColorStop(0, this.hexToRgba(color, opacity));
            grad.addColorStop(1, this.hexToRgba(color, 0.02));
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.restore();
        }

        // Draw Stroke Line
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.strokeStyle = color;
        ctx.lineWidth = numOr(this.p && this.p.lineWidth, 1.5);
        ctx.stroke();
        ctx.restore();

        // Glowing dot on last point
        if (this.p && this.p.showLastDot !== false && pts.length) {
            const last = pts[pts.length - 1];
            ctx.save();
            // Glow halo
            ctx.beginPath();
            ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = this.hexToRgba(color, 0.35);
            ctx.fill();
            // Solid center
            ctx.beginPath();
            ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.restore();
        }

        // Min & Max dots
        if (this.p && this.p.showMinMax) {
            let minPt = pts[0], maxPt = pts[0];
            pts.forEach((p) => {
                if (p.val < minPt.val) minPt = p;
                if (p.val > maxPt.val) maxPt = p;
            });
            ctx.save();
            ctx.fillStyle = "#ef4444";
            ctx.beginPath(); ctx.arc(minPt.x, minPt.y, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#10b981";
            ctx.beginPath(); ctx.arc(maxPt.x, maxPt.y, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        // Hover marker
        if (this._hoverIndex !== null && pts[this._hoverIndex]) {
            const hPt = pts[this._hoverIndex];
            ctx.save();
            ctx.beginPath();
            ctx.arc(hPt.x, hPt.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        }
    }

    onPointerMove(e) {
        if (!this._points.length) return;
        const rect = this.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        let closest = null, minD = Infinity;

        this._points.forEach((p) => {
            const d = Math.abs(p.x - px);
            if (d < minD) { minD = d; closest = p; }
        });

        if (closest && minD < 20) {
            this._hoverIndex = closest.index;
            this.draw();

            const tip = this.renderRoot?.querySelector(".spark-tooltip");
            if (tip && this.p.showTooltip !== false) {
                tip.textContent = String(Math.round(closest.val * 100) / 100) + (this.p.unit ? " " + this.p.unit : "");
                tip.style.display = "block";
                tip.style.left = `${Math.round(closest.x)}px`;
                tip.style.top = `${Math.round(closest.y)}px`;
            }
            this.emit("hover", { index: closest.index, value: closest.val });
        } else {
            this.onPointerLeave();
        }
    }

    onPointerLeave() {
        if (this._hoverIndex !== null) {
            this._hoverIndex = null;
            this.draw();
        }
        const tip = this.renderRoot?.querySelector(".spark-tooltip");
        if (tip) tip.style.display = "none";
    }

    onPlotClick(e) {
        if (this._hoverIndex !== null && this._points[this._hoverIndex]) {
            const pt = this._points[this._hoverIndex];
            this.emit("pointClick", { index: pt.index, value: pt.val });
        }
    }

    // ---- Actions ---------------------------------------------------------------------------
    setData(data) {
        if (Array.isArray(data)) {
            this._dynamicData = data.map((x) => numOr(typeof x === "object" ? (x.value !== undefined ? x.value : x.y) : x, 0));
        } else {
            this._dynamicData = null;
        }
        if (this.resizeCanvas()) this.draw();
        this.requestUpdate();
    }

    appendPoint(val) {
        const d = this._getData().slice();
        d.push(numOr(val, 0));
        if (d.length > 50) d.shift();
        this._dynamicData = d;
        if (this.resizeCanvas()) this.draw();
        this.requestUpdate();
    }

    clear() {
        this._dynamicData = [];
        if (this.resizeCanvas()) this.draw();
        this.requestUpdate();
    }

    render() {
        const data = this._getData();
        const lastVal = data && data.length ? data[data.length - 1] : 0;
        const showReadout = this.p && this.p.showReadout;
        const unit = this.p && this.p.unit ? " " + this.p.unit : "";

        return html`
            <div class="spark-container" part="sparkline">
                <div class="plot"
                    @pointermove=${(e) => this.onPointerMove(e)}
                    @pointerleave=${() => this.onPointerLeave()}
                    @click=${(e) => this.onPlotClick(e)}>
                    <canvas></canvas>
                    <div class="spark-tooltip"></div>
                </div>
                ${showReadout ? html`<span class="spark-readout">${Math.round(lastVal * 100) / 100}${unit}</span>` : ""}
            </div>
        `;
    }
}

export const sparkline = defineUI({
    ...common,
    id: PREFIX + "sparkline",
    label: "Sparkline",
    icon: "fa fa-line-chart",
    size: { w: 160, h: 40 },
    help: "Ultra-compact mini trend sparkline (area, line, bar) with auto trend colouring, latest value glowing dot, and hover tooltip.",
    version: 1,

    groups: ["Sparkline", "Style", "Data", "Behaviour"],

    properties: {
        type: {
            type: "enum", group: "Sparkline", label: "Chart type", default: "area",
            options: opt([["area", "Area (filled gradient)"], ["line", "Line"], ["bar", "Mini Bar"]])
        },
        data: {
            type: "tag", access: "read", group: "Data", label: "Live data array",
            help: "Accepts an array of numbers [12, 18, 14, 25, 32] or [{x, y}]."
        },
        trendColor: {
            type: "boolean", group: "Style", label: "Auto trend colour (green up / red down)", default: true
        },
        color: {
            type: "color", group: "Style", label: "Line colour override", default: ""
        },
        lineWidth: {
            type: "number", group: "Style", label: "Line width", default: 1.5, min: 0.5, max: 4, step: 0.5, unit: "px"
        },
        fillOpacity: {
            type: "number", group: "Style", label: "Area fill opacity", default: 0.28, min: 0.05, max: 0.8, step: 0.05
        },
        showLastDot: {
            type: "boolean", group: "Style", label: "Show glowing dot on latest value", default: true
        },
        showMinMax: {
            type: "boolean", group: "Style", label: "Show min & max marker dots", default: false
        },
        showReadout: {
            type: "boolean", group: "Sparkline", label: "Show latest value readout text", default: false
        },
        unit: { type: "string", group: "Sparkline", label: "Unit", default: "" },
        showTooltip: { type: "boolean", group: "Sparkline", label: "Show hover tooltip", default: true }
    },

    actions: {
        setData: { label: "Set data", example: "[12, 18, 14, 25, 32, 28]" },
        appendPoint: { label: "Append point", example: "35.5" },
        clear: { label: "Clear" }
    },

    events: {
        hover: { label: "On Hover", payload: { index: "number", value: "number" } },
        pointClick: { label: "On Point Click", payload: { index: "number", value: "number" } }
    },

    view: SparklineElement
});
