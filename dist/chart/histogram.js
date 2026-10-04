// Nexa UI — Histogram Chart
// Distribution & Frequency visualization for Industrial SCADA, Quality Control (QC),
// and Six Sigma Statistical Process Control:
//   - Continuous numerical data binning (Automatic Freedman-Diaconis / Sturges, Fixed Count, Fixed Width)
//   - Pre-binned frequency inputs from SQL / API aggregations
//   - Normal Distribution (Gaussian Bell Curve) overlay to compare actual vs theoretical spread
//   - Quality Specification Limits (LSL, Target, USL) with out-of-spec reject highlighting
//   - Process Capability summary metrics (N, Mean, Std Dev, Cp, Cpk)
//   - Multi-series comparison (Shift vs Shift, Machine vs Machine)
//   - Rich Carbon tooltip and On Bin Click drilldowns for defect inspection
//   - Export to CSV, real Excel (.xlsx) with Statistics sheet, and 2× sharp PNG snapshot
import { html, css, evaluateExpression } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, defineUI } from "../core.js";
import { chartCommon, SERIES_PALETTE, opt, NOTATIONS, DECIMALS, notationOf, numOr, niceNum } from "./core.js";
import { xlsxBlob } from "./export.js";
import { ChartElement } from "./core.js";
import { exportProps } from "./props.js";

const common = chartCommon;

const HISTOGRAM_CSS = css`
    :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        user-select: none;
    }
    .hist-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        position: relative;
    }
    .hist-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 12px 2px 12px;
        flex-shrink: 0;
        gap: 8px;
    }
    .hist-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--fg, #e0e0e0);
        letter-spacing: 0.01em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .hist-stats-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: var(--mono, "IBM Plex Mono", monospace);
        font-size: 11px;
        color: var(--fg-muted, #a0aec0);
        overflow-x: auto;
        white-space: nowrap;
    }
    .stat-badge {
        display: inline-flex;
        align-items: baseline;
        gap: 4px;
    }
    .stat-badge strong {
        color: var(--fg, #ffffff);
        font-weight: 600;
    }
    .stat-badge.cpk-good strong {
        color: #10b981;
    }
    .stat-badge.cpk-warn strong {
        color: #f59e0b;
    }
    .stat-badge.cpk-bad strong {
        color: #ef4444;
    }
    .hist-canvas-wrap {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
        height: 100%;
    }
    canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: block;
    }
    .legend {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 4px 8px;
        flex-shrink: 0;
        background: transparent;
    }
    .lg-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--fg-muted, #a0aec0);
        cursor: pointer;
        background: transparent;
        border: none;
        padding: 2px 6px;
        border-radius: 3px;
        transition: opacity 0.15s ease, background 0.15s ease;
    }
    .lg-item:hover {
        background: rgba(255, 255, 255, 0.05);
        color: var(--fg, #ffffff);
    }
    .lg-item.off {
        opacity: 0.35;
        text-decoration: line-through;
    }
    .lg-swatch {
        width: 10px;
        height: 10px;
        border-radius: 2px;
        flex-shrink: 0;
    }
    .tooltip {
        position: absolute;
        pointer-events: none;
        display: none;
        background: var(--panel, #1e1e1e);
        border: 1px solid var(--bd, #333333);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        padding: 6px 10px;
        border-radius: 4px;
        font-size: 11px;
        color: var(--fg, #ffffff);
        z-index: 100;
        min-width: 140px;
        max-width: 260px;
    }
    .tip-range {
        font-weight: 600;
        color: var(--fg, #ffffff);
        font-family: var(--mono, "IBM Plex Mono", monospace);
        margin-bottom: 4px;
        border-bottom: 1px solid var(--bd, #333333);
        padding-bottom: 2px;
    }
    .tip-row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-top: 2px;
    }
    .tip-val {
        font-family: var(--mono, "IBM Plex Mono", monospace);
        font-weight: 500;
    }
    .tip-status {
        margin-top: 4px;
        font-size: 10px;
        font-weight: 600;
        text-align: right;
    }
    .tip-status.in-spec {
        color: #10b981;
    }
    .tip-status.out-of-spec {
        color: #ef4444;
    }
`;

const SERIES_FIELDS = {
    name: { type: "string", label: "Name", default: "Distribution" },
    id: { type: "string", label: "Id", default: "", bindable: false, help: "Fixed ID for Logic targeting." },
    visible: { type: "boolean", label: "Visible", default: true },
    color: { type: "color", label: "Colour", default: "", help: "Empty: next colour in theme palette." },
    live: {
        type: "tag", access: "read", section: "Data", label: "Live value",
        help: "Tag or variable: each number adds to the sliding buffer."
    },
    maxPoints: { type: "number", section: "Data", label: "Buffer capacity", default: 2000, min: 50, max: 50000, step: 250 }
};

export class HistogramElement extends ChartElement {
    static styles = [...ChartElement.styles, HISTOGRAM_CSS];

    constructor() {
        super();
        this._seriesData = new Map(); // series key -> number[]
        this._binnedData = null;      // pre-binned data override
        this._hidden = new Set();
        this._hover = null;
        this._scale = null;
        this._stats = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._onPointerMove = (e) => this._handlePointerMove(e);
        this._onPointerLeave = () => this._handlePointerLeave();
        this._onCanvasClick = (e) => this._handleCanvasClick(e);
    }

    _seriesState(s) {
        let st = this._seriesData.get(s._key);
        if (!st) {
            st = { data: [] };
            this._seriesData.set(s._key, st);
        }
        return st;
    }

    seriesList() {
        const raw = Array.isArray(this.p.series) ? this.p.series : [];
        if (!raw.length) {
            return [{
                _key: "s_default",
                id: "default",
                name: "Samples",
                color: "",
                visible: true,
                maxPoints: 2000
            }];
        }
        return raw.map((s, idx) => ({
            ...s,
            _key: s.id || `s_${idx}`,
            id: s.id || `s_${idx}`,
            name: s.name || `Series ${idx + 1}`
        }));
    }

    colorOf(s, index = 0) {
        if (s && s.color) return s.color;
        const pal = this.p.palette || SERIES_PALETTE;
        return pal[index % pal.length];
    }

    prepareData() {
        const list = this.seriesList();
        list.forEach((s) => {
            const st = this._seriesState(s);
            if (s.live !== undefined && s.live !== null && s.live !== "") {
                const val = numOr(s.live, NaN);
                if (Number.isFinite(val)) {
                    st.data.push(val);
                    const cap = numOr(s.maxPoints, 2000);
                    if (st.data.length > cap) {
                        st.data.shift();
                    }
                }
            }
        });
    }

    // ---- Binning and Statistics Engine -----------------------------------------------------
    _computeStats(arr) {
        if (!arr || !arr.length) return null;
        let sum = 0, mn = Infinity, mx = -Infinity;
        for (let i = 0; i < arr.length; i++) {
            const v = arr[i];
            sum += v;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
        }
        const n = arr.length;
        const mean = sum / n;
        let sumSq = 0;
        for (let i = 0; i < n; i++) {
            const d = arr[i] - mean;
            sumSq += d * d;
        }
        const stdDev = n > 1 ? Math.sqrt(sumSq / (n - 1)) : 0;

        // Quartiles for Freedman-Diaconis
        const sorted = arr.slice().sort((a, b) => a - b);
        const q1 = sorted[Math.floor(n * 0.25)];
        const q3 = sorted[Math.floor(n * 0.75)];
        const iqr = q3 - q1;

        // Process Capability Indices (Cp & Cpk)
        let cp = null, cpk = null;
        const lsl = numOr(this.p.lsl, NaN);
        const usl = numOr(this.p.usl, NaN);
        if (Number.isFinite(lsl) && Number.isFinite(usl) && usl > lsl && stdDev > 0) {
            cp = (usl - lsl) / (6 * stdDev);
            const cpu = (usl - mean) / (3 * stdDev);
            const cpl = (mean - lsl) / (3 * stdDev);
            cpk = Math.min(cpu, cpl);
        }

        return { n, mean, stdDev, min: mn, max: mx, iqr, cp, cpk };
    }

    _calculateBins(seriesList) {
        if (this._binnedData) {
            return this._binnedData;
        }

        // Collect all active series data
        let allValues = [];
        seriesList.forEach((s) => {
            if (s.visible === false || this._hidden.has(s._key)) return;
            const st = this._seriesState(s);
            allValues = allValues.concat(st.data);
        });

        if (!allValues.length) {
            if (this.isEditor) {
                // Generate demo bell curve data in editor
                allValues = this._generateDemoData();
            } else {
                return null;
            }
        }

        const stats = this._computeStats(allValues);
        this._stats = stats;
        if (!stats) return null;

        let bMin = numOr(this.p.binMin, stats.min);
        let bMax = numOr(this.p.binMax, stats.max);
        if (bMax <= bMin) {
            bMin -= 1;
            bMax += 1;
        }
        const range = bMax - bMin;

        // Determine bin width & count
        const mode = this.p.binMode || "auto";
        let binCount = 15;
        let binWidth = range / binCount;

        if (mode === "count") {
            binCount = Math.max(2, Math.min(100, Math.round(numOr(this.p.binCount, 15))));
            binWidth = range / binCount;
        } else if (mode === "width") {
            binWidth = Math.max(1e-5, numOr(this.p.binWidth, range / 15));
            binCount = Math.max(2, Math.min(100, Math.ceil(range / binWidth)));
            bMax = bMin + binCount * binWidth;
        } else {
            // Auto: Freedman-Diaconis rule with Sturges fallback
            if (stats.iqr > 0 && stats.n >= 10) {
                const fdWidth = 2 * stats.iqr * Math.pow(stats.n, -1 / 3);
                binWidth = fdWidth;
                binCount = Math.max(5, Math.min(50, Math.ceil(range / binWidth)));
                binWidth = range / binCount;
            } else {
                // Sturges rule
                binCount = Math.max(5, Math.min(50, Math.ceil(Math.log2(stats.n) + 1)));
                binWidth = range / binCount;
            }
        }

        // Create empty bins
        const bins = [];
        for (let i = 0; i < binCount; i++) {
            const start = bMin + i * binWidth;
            const end = start + binWidth;
            bins.push({
                index: i,
                binStart: start,
                binEnd: end,
                label: `${start.toFixed(1)} – ${end.toFixed(1)}`,
                seriesCounts: new Map(), // s._key -> count
                totalCount: 0
            });
        }

        // Populate bins per series
        seriesList.forEach((s) => {
            if (s.visible === false || this._hidden.has(s._key)) return;
            const st = this._seriesState(s);
            const data = (st.data.length ? st.data : (this.isEditor ? allValues : []));
            for (let i = 0; i < data.length; i++) {
                const v = data[i];
                let bIdx = Math.floor((v - bMin) / binWidth);
                if (bIdx < 0) bIdx = 0;
                if (bIdx >= binCount) bIdx = binCount - 1;
                const b = bins[bIdx];
                const cur = b.seriesCounts.get(s._key) || 0;
                b.seriesCounts.set(s._key, cur + 1);
                b.totalCount++;
            }
        });

        // Compute percentages and spec status
        const lsl = numOr(this.p.lsl, NaN);
        const usl = numOr(this.p.usl, NaN);
        bins.forEach((b) => {
            b.percent = stats.n > 0 ? (b.totalCount / stats.n) * 100 : 0;
            const outL = Number.isFinite(lsl) && b.binEnd <= lsl;
            const outU = Number.isFinite(usl) && b.binStart >= usl;
            b.outOfSpec = outL || outU;
        });

        return { bins, stats, bMin, bMax, binWidth, totalSamples: stats.n };
    }

    _generateDemoData() {
        const pts = [];
        const mean = 500, std = 2.5;
        for (let i = 0; i < 600; i++) {
            // Box-Muller normal distribution
            const u1 = Math.max(1e-6, Math.random());
            const u2 = Math.random();
            const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
            pts.push(mean + z * std);
        }
        return pts;
    }

    // ---- Drawing ---------------------------------------------------------------------------
    draw() {
        const cv = this.renderRoot.querySelector("canvas");
        if (!cv) return;
        const ctx = cv.getContext("2d");
        if (!ctx) return;

        const { w, h, dpr } = this.resizeCanvas(cv);
        if (w <= 0 || h <= 0) return;

        ctx.clearRect(0, 0, w, h);

        const seriesList = this.seriesList();
        const bResult = this._calculateBins(seriesList);

        if (!bResult || !bResult.bins.length) {
            ctx.font = "12px sans-serif";
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("No data for histogram", w / 2, h / 2);
            return;
        }

        const { bins, stats, bMin, bMax, binWidth, totalSamples } = bResult;
        const colors = this._colors();

        // Calculate plot metrics (margins for axes)
        const padL = 46, padR = 24, padT = 24, padB = 40;
        const plotX = padL;
        const plotY = padT;
        const plotW = Math.max(10, w - padL - padR);
        const plotH = Math.max(10, h - padT - padB);

        // Max Y count for scale
        let maxCount = 0;
        bins.forEach((b) => {
            if (b.totalCount > maxCount) maxCount = b.totalCount;
        });
        if (maxCount <= 0) maxCount = 10;
        const niceMaxY = niceNum(maxCount * 1.15, true);

        const toScreenX = (val) => plotX + ((val - bMin) / (bMax - bMin)) * plotW;
        const toScreenY = (count) => plotY + plotH - (count / niceMaxY) * plotH;

        this._scale = {
            plotX, plotY, plotW, plotH, bMin, bMax, binWidth,
            niceMaxY, toScreenX, toScreenY, bins, stats
        };

        // 1. Draw Grid lines
        ctx.save();
        ctx.strokeStyle = colors.grid || "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);

        const ySteps = 4;
        for (let i = 0; i <= ySteps; i++) {
            const cnt = (niceMaxY / ySteps) * i;
            const sy = toScreenY(cnt);
            ctx.beginPath();
            ctx.moveTo(plotX, sy);
            ctx.lineTo(plotX + plotW, sy);
            ctx.stroke();

            // Y Axis Label
            ctx.font = `10px ${colors.mono || "IBM Plex Mono, monospace"}`;
            ctx.fillStyle = colors.text || "rgba(255, 255, 255, 0.6)";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(String(Math.round(cnt)), plotX - 6, sy);
        }
        ctx.restore();

        // 2. Draw Histogram Bins
        const highlightOOS = this.p.highlightOutOfSpec !== false;
        const activeSeries = seriesList.filter((s) => s.visible !== false && !this._hidden.has(s._key));
        const numSeries = Math.max(1, activeSeries.length);

        bins.forEach((b) => {
            const x0 = toScreenX(b.binStart);
            const x1 = toScreenX(b.binEnd);
            const binW = Math.max(1, x1 - x0);

            if (numSeries === 1) {
                // Single series
                const s = activeSeries[0] || seriesList[0];
                const count = b.totalCount;
                const sy = toScreenY(count);
                const barH = (plotY + plotH) - sy;

                ctx.save();
                let fillCol = this.colorOf(s, 0);
                if (highlightOOS && b.outOfSpec) {
                    fillCol = "#ef4444"; // Red for reject
                }

                // Bar body with 1px border gap
                ctx.fillStyle = fillCol;
                ctx.globalAlpha = 0.75;
                ctx.fillRect(x0 + 0.5, sy, Math.max(1, binW - 1), barH);

                // Top stroke line
                ctx.globalAlpha = 1.0;
                ctx.strokeStyle = fillCol;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x0 + 0.5, sy, Math.max(1, binW - 1), barH);
                ctx.restore();
            } else {
                // Multi-series grouped/clustered
                const subW = Math.max(1, (binW - 1) / numSeries);
                activeSeries.forEach((s, sIdx) => {
                    const cnt = b.seriesCounts.get(s._key) || 0;
                    const sy = toScreenY(cnt);
                    const barH = (plotY + plotH) - sy;
                    const sx = x0 + sIdx * subW;

                    ctx.save();
                    const fillCol = this.colorOf(s, sIdx);
                    ctx.fillStyle = fillCol;
                    ctx.globalAlpha = 0.7;
                    ctx.fillRect(sx + 0.5, sy, Math.max(1, subW - 1), barH);

                    ctx.globalAlpha = 1.0;
                    ctx.strokeStyle = fillCol;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(sx + 0.5, sy, Math.max(1, subW - 1), barH);
                    ctx.restore();
                });
            }

            // X-axis bin label ticks
            ctx.font = `10px ${colors.mono || "IBM Plex Mono, monospace"}`;
            ctx.fillStyle = colors.text || "rgba(255, 255, 255, 0.6)";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            if (bins.length <= 15 || b.index % 2 === 0) {
                ctx.fillText(b.binStart.toFixed(1), x0, plotY + plotH + 6);
            }
        });

        // Last bin edge label
        if (bins.length) {
            const last = bins[bins.length - 1];
            ctx.font = `10px ${colors.mono || "IBM Plex Mono, monospace"}`;
            ctx.fillStyle = colors.text || "rgba(255, 255, 255, 0.6)";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(last.binEnd.toFixed(1), toScreenX(last.binEnd), plotY + plotH + 6);
        }

        // 3. Normal Distribution Curve (Gaussian Bell Curve Overlay)
        if (this.p.showNormalCurve !== false && stats && stats.stdDev > 0) {
            ctx.save();
            ctx.beginPath();
            const curveColor = this.p.normalCurveColor || "#38bdf8"; // Sky blue Carbon line
            ctx.strokeStyle = curveColor;
            ctx.lineWidth = 2.5;

            const steps = Math.min(200, plotW);
            for (let i = 0; i <= steps; i++) {
                const val = bMin + (i / steps) * (bMax - bMin);
                // Gaussian PDF: (1 / (sigma * sqrt(2*PI))) * exp(-0.5 * ((x - mu)/sigma)^2)
                const z = (val - stats.mean) / stats.stdDev;
                const pdf = (1 / (stats.stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
                // Scale PDF to bin count: Count = PDF * N * binWidth
                const expectedCount = pdf * totalSamples * binWidth;

                const sx = toScreenX(val);
                const sy = toScreenY(expectedCount);

                if (i === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            }
            ctx.stroke();

            // Label mean in bell curve peak
            const peakX = toScreenX(stats.mean);
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = curveColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(peakX, plotY);
            ctx.lineTo(peakX, plotY + plotH);
            ctx.stroke();

            ctx.restore();
        }

        // 4. Quality Specification Limits (LSL, Target, USL)
        const lsl = numOr(this.p.lsl, NaN);
        const usl = numOr(this.p.usl, NaN);
        const target = numOr(this.p.target, NaN);

        const drawSpecLine = (val, label, color) => {
            if (!Number.isFinite(val) || val < bMin || val > bMax) return;
            const sx = toScreenX(val);
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(sx, plotY);
            ctx.lineTo(sx, plotY + plotH);
            ctx.stroke();

            // Badge pill at top
            ctx.font = "bold 9px IBM Plex Mono, monospace";
            const text = `${label}: ${val}`;
            const tw = ctx.measureText(text).width + 8;
            ctx.fillStyle = color;
            ctx.fillRect(Math.max(plotX, sx - tw / 2), plotY - 14, tw, 14);
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, Math.max(plotX + tw / 2, sx), plotY - 7);
            ctx.restore();
        };

        drawSpecLine(lsl, "LSL", "#ef4444");
        drawSpecLine(target, "TARGET", "#10b981");
        drawSpecLine(usl, "USL", "#ef4444");

        // 5. Hover Crosshair / Highlight
        if (this._hover && this._hover.bin) {
            const hBin = this._hover.bin;
            const hx0 = toScreenX(hBin.binStart);
            const hx1 = toScreenX(hBin.binEnd);
            ctx.save();
            ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
            ctx.fillRect(hx0, plotY, hx1 - hx0, plotH);
            ctx.restore();
        }
    }

    // ---- Pointer & Hover Interactions ------------------------------------------------------
    _handlePointerMove(e) {
        if (!this._scale) return;
        const rect = this.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        const { plotX, plotY, plotW, plotH, bins, toScreenX } = this._scale;
        if (px < plotX || px > plotX + plotW || py < plotY || py > plotY + plotH) {
            this._handlePointerLeave();
            return;
        }

        // Find bin under pointer
        let found = null;
        for (let i = 0; i < bins.length; i++) {
            const b = bins[i];
            const x0 = toScreenX(b.binStart);
            const x1 = toScreenX(b.binEnd);
            if (px >= x0 && px <= x1) {
                found = b;
                break;
            }
        }

        if (found) {
            this._hover = { bin: found, px, py };
            this._showTooltip(found, px, py);
            this.scheduleDraw();
        } else {
            this._handlePointerLeave();
        }
    }

    _showTooltip(bin, px, py) {
        const tip = this.renderRoot.querySelector(".tooltip");
        if (!tip) return;

        const unit = this.p.unit || "";
        const uStr = unit ? ` ${unit}` : "";

        let statusHtml = "";
        if (bin.outOfSpec) {
            statusHtml = `<div class="tip-status out-of-spec">Out of Specification (Reject)</div>`;
        } else if (this.p.lsl !== undefined || this.p.usl !== undefined) {
            statusHtml = `<div class="tip-status in-spec">Within Specification</div>`;
        }

        tip.innerHTML = `
            <div class="tip-range">[${bin.binStart.toFixed(2)}${uStr} – ${bin.binEnd.toFixed(2)}${uStr}]</div>
            <div class="tip-row"><span>Count (Frequency):</span><span class="tip-val">${bin.totalCount}</span></div>
            <div class="tip-row"><span>Percentage:</span><span class="tip-val">${bin.percent.toFixed(1)}%</span></div>
            ${statusHtml}
        `;

        tip.style.display = "block";
        const tipW = tip.offsetWidth || 150;
        const tipH = tip.offsetHeight || 70;
        let left = px + 12;
        if (left + tipW > this.clientWidth - 10) left = px - tipW - 12;
        let top = py - tipH / 2;
        if (top < 10) top = 10;
        if (top + tipH > this.clientHeight - 10) top = this.clientHeight - tipH - 10;

        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
    }

    _handlePointerLeave() {
        this._hover = null;
        const tip = this.renderRoot.querySelector(".tooltip");
        if (tip) tip.style.display = "none";
        this.scheduleDraw();
    }

    _handleCanvasClick(e) {
        if (!this._hover || !this._hover.bin) return;
        const b = this._hover.bin;
        const payload = {
            binStart: b.binStart,
            binEnd: b.binEnd,
            count: b.totalCount,
            percent: b.percent,
            outOfSpec: !!b.outOfSpec
        };

        this.emit("binClick", payload);
        if (b.outOfSpec) {
            this.emit("outOfSpec", payload);
        }
    }

    // ---- Logic Actions ---------------------------------------------------------------------
    setData(data) {
        if (!data) return;
        this._binnedData = null;
        if (Array.isArray(data)) {
            // Raw numeric array [23.1, 24.5, ...]
            const list = this.seriesList();
            const s0 = list[0];
            const st = this._seriesState(s0);
            st.data = data.filter((v) => typeof v === "number" && Number.isFinite(v));
        } else if (typeof data === "object") {
            // Series map { s1: [...], s2: [...] }
            for (const [k, pts] of Object.entries(data)) {
                const s = this.seriesList().find((x) => x.id === k || x._key === k);
                if (s && Array.isArray(pts)) {
                    const st = this._seriesState(s);
                    st.data = pts.filter((v) => typeof v === "number" && Number.isFinite(v));
                }
            }
        }
        this.scheduleDraw();
        this.requestUpdate();
    }

    appendValue(params) {
        const val = typeof params === "number" ? params : numOr(params && params.value, NaN);
        if (!Number.isFinite(val)) return;

        const list = this.seriesList();
        const s = (params && params.seriesId ? list.find((x) => x.id === params.seriesId) : null) || list[0];
        const st = this._seriesState(s);
        st.data.push(val);
        const cap = numOr(s.maxPoints, 2000);
        if (st.data.length > cap) st.data.shift();

        // Check if out of spec
        const lsl = numOr(this.p.lsl, NaN);
        const usl = numOr(this.p.usl, NaN);
        if ((Number.isFinite(lsl) && val < lsl) || (Number.isFinite(usl) && val > usl)) {
            this.emit("outOfSpec", { value: val, lsl, usl, seriesId: s.id });
        }

        this.scheduleDraw();
        this.requestUpdate();
    }

    setBinnedData(bins) {
        if (!Array.isArray(bins)) return;
        this._binnedData = {
            bins: bins.map((b, i) => ({
                index: i,
                binStart: numOr(b.binStart, 0),
                binEnd: numOr(b.binEnd, 0),
                label: b.label || `${b.binStart} – ${b.binEnd}`,
                seriesCounts: new Map(),
                totalCount: numOr(b.count, 0),
                percent: numOr(b.percent, 0),
                outOfSpec: !!b.outOfSpec
            })),
            stats: null,
            bMin: bins[0] ? numOr(bins[0].binStart, 0) : 0,
            bMax: bins[bins.length - 1] ? numOr(bins[bins.length - 1].binEnd, 100) : 100,
            binWidth: bins[0] ? (bins[0].binEnd - bins[0].binStart) : 1,
            totalSamples: bins.reduce((acc, b) => acc + numOr(b.count, 0), 0)
        };
        this.scheduleDraw();
        this.requestUpdate();
    }

    setLimits(params) {
        if (!params || typeof params !== "object") return;
        if (params.lsl !== undefined) this.p.lsl = params.lsl;
        if (params.usl !== undefined) this.p.usl = params.usl;
        if (params.target !== undefined) this.p.target = params.target;
        this.scheduleDraw();
        this.requestUpdate();
    }

    clear() {
        this._seriesData.clear();
        this._binnedData = null;
        this.scheduleDraw();
        this.requestUpdate();
    }

    // ---- Export CSV / Excel / PNG ----------------------------------------------------------
    exportData(format) {
        const fmt = (format || "csv").toLowerCase();
        if (fmt === "png") {
            const cv = this.renderRoot.querySelector("canvas");
            if (!cv) return;
            const url = cv.toDataURL("image/png");
            const a = document.createElement("a");
            a.download = this._getExportFileName("png", "all");
            a.href = url;
            a.click();
            return;
        }

        const bResult = this._scale || this._calculateBins(this.seriesList());
        if (!bResult || !bResult.bins) return;

        const { bins, stats } = bResult;
        const header = ["Bin Index", "Bin Start", "Bin End", "Frequency (Count)", "Percentage (%)", "Status"];
        const rows = bins.map((b) => [
            b.index + 1,
            b.binStart,
            b.binEnd,
            b.totalCount,
            b.percent.toFixed(2),
            b.outOfSpec ? "Out of Specification (Reject)" : "In Spec"
        ]);

        let blob;
        if (fmt === "xlsx") {
            const info = [
                ["Chart", this.p.title || "Histogram"],
                ["Total Samples (N)", stats ? stats.n : rows.length],
                ["Mean", stats ? stats.mean.toFixed(3) : "-"],
                ["Std Deviation (σ)", stats ? stats.stdDev.toFixed(3) : "-"],
                ["Min", stats ? stats.min.toFixed(2) : "-"],
                ["Max", stats ? stats.max.toFixed(2) : "-"]
            ];
            if (stats && stats.cp !== null) {
                info.push(["Cp", stats.cp.toFixed(3)]);
                info.push(["Cpk", stats.cpk.toFixed(3)]);
            }
            if (this.p.lsl !== undefined) info.push(["LSL", this.p.lsl]);
            if (this.p.target !== undefined) info.push(["Target", this.p.target]);
            if (this.p.usl !== undefined) info.push(["USL", this.p.usl]);

            blob = xlsxBlob(header, rows, false, { info });
        } else {
            const q = (t) => '"' + String(t).replace(/"/g, '""') + '"';
            const lines = [header.map(q).join(",")];
            rows.forEach((r) => lines.push(r.map(q).join(",")));
            blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        }

        const name = this._getExportFileName(fmt, "all");
        this._download(blob, name);
        this._lastExport = { name, blob, rows: rows.length };
        return rows.length;
    }

    _toggle(s) {
        if (this._hidden.has(s._key)) this._hidden.delete(s._key);
        else this._hidden.add(s._key);
        this.scheduleDraw();
        this.requestUpdate();
    }

    render() {
        const stats = this._stats;
        const showStats = this.p.showStats !== false && stats;
        const all = this.seriesList();
        const legendAt = (this.p && this.p.legend) || "none";
        const legendList = all.length > 1 ? all : [];

        let cpkClass = "cpk-good";
        if (stats && stats.cpk !== null) {
            if (stats.cpk < 1.0) cpkClass = "cpk-bad";
            else if (stats.cpk < 1.33) cpkClass = "cpk-warn";
        }

        return html`
            <div class="hist-container" part="container">
                <div class="hist-header" part="header">
                    <div class="hist-title">${this.p.title || ""}</div>
                    ${showStats ? html`
                        <div class="hist-stats-bar" part="stats-bar">
                            <span class="stat-badge">N: <strong>${stats.n}</strong></span>
                            <span class="stat-badge">μ: <strong>${stats.mean.toFixed(2)}</strong></span>
                            <span class="stat-badge">σ: <strong>${stats.stdDev.toFixed(2)}</strong></span>
                            ${stats.cpk !== null ? html`
                                <span class="stat-badge ${cpkClass}">Cpk: <strong>${stats.cpk.toFixed(2)}</strong></span>
                            ` : ""}
                        </div>
                    ` : ""}
                </div>

                <div class="hist-canvas-wrap" part="canvas-wrap"
                    @pointermove=${this._onPointerMove}
                    @pointerleave=${this._onPointerLeave}
                    @click=${this._onCanvasClick}>
                    <canvas></canvas>
                    <div class="tooltip" part="tooltip"></div>
                </div>

                ${legendAt !== "none" && legendList.length ? html`
                    <div class="legend" part="legend">
                        ${legendList.map((s, idx) => html`
                            <button type="button" class="lg-item ${this._hidden.has(s._key) || s.visible === false ? "off" : ""}"
                                @click=${() => this._toggle(s)}>
                                <span class="lg-swatch" style="background:${this.colorOf(s, idx)}"></span>
                                <span>${s.name}</span>
                            </button>
                        `)}
                    </div>
                ` : ""}

                ${this._menuOpen ? html`
                    <div class="menu" style="top:28px;right:8px;" part="menu">
                        <button type="button" class="menu-item" @click=${() => { this._menuOpen = false; this.exportData("csv"); }}>Export CSV</button>
                        <button type="button" class="menu-item" @click=${() => { this._menuOpen = false; this.exportData("xlsx"); }}>Export Excel (.xlsx)</button>
                        <button type="button" class="menu-item" @click=${() => { this._menuOpen = false; this.exportData("png"); }}>Export PNG</button>
                    </div>
                ` : ""}
            </div>
        `;
    }
}

defineUI({
    ...common,
    id: PREFIX + "histogram",
    name: "Histogram",
    description: "Statistical distribution and frequency analysis with Freedman-Diaconis binning, normal Gaussian curve overlay, and Six Sigma Cp/Cpk quality tolerance limits.",
    icon: "chart-bar",
    version: 1,

    props: {
        title: { type: "string", group: "Settings", label: "Title", default: "" },
        unit: { type: "string", group: "Settings", label: "Value unit", default: "" },

        // Binning configuration
        binMode: {
            type: "enum", group: "Binning", label: "Binning mode", default: "auto",
            options: opt([
                ["auto", "Automatic (Freedman-Diaconis)"],
                ["count", "Fixed bin count"],
                ["width", "Fixed bin width"]
            ])
        },
        binCount: { type: "number", group: "Binning", label: "Number of bins", default: 15, min: 2, max: 100, step: 1 },
        binWidth: { type: "number", group: "Binning", label: "Bin interval width", default: 5, min: 0.001 },
        binMin: { type: "number", group: "Binning", label: "Manual min limit", default: "" },
        binMax: { type: "number", group: "Binning", label: "Manual max limit", default: "" },

        // Bell Curve Overlay
        showNormalCurve: { type: "boolean", group: "Statistics", label: "Show Gaussian bell curve", default: true },
        normalCurveColor: { type: "color", group: "Statistics", label: "Bell curve line colour", default: "" },
        showStats: { type: "boolean", group: "Statistics", label: "Show summary stats bar (N, μ, σ, Cpk)", default: true },

        // Quality Specification Limits
        lsl: { type: "number", group: "Quality (SPC)", label: "Lower Spec Limit (LSL)", default: "", help: "Lower tolerance boundary." },
        target: { type: "number", group: "Quality (SPC)", label: "Target Setpoint", default: "", help: "Ideal manufacturing target." },
        usl: { type: "number", group: "Quality (SPC)", label: "Upper Spec Limit (USL)", default: "", help: "Upper tolerance boundary." },
        highlightOutOfSpec: { type: "boolean", group: "Quality (SPC)", label: "Highlight defect bins in red", default: true },

        // Multi-Series
        series: {
            type: "list", group: "Series", label: "Series", target: true,
            noun: "series", fields: SERIES_FIELDS, default: []
        },

        legend: {
            type: "enum", group: "Style", label: "Legend", default: "none",
            options: opt([["none", "None"], ["bottom", "Bottom"]])
        },

        ...exportProps()
    },

    events: {
        binClick: { label: "On Bin Click", desc: "Fires when user clicks a histogram bin { binStart, binEnd, count, percent, outOfSpec }." },
        outOfSpec: { label: "On Out of Spec", desc: "Fires when a data value or clicked bin violates LSL or USL tolerances." }
    },

    actions: {
        setData: { label: "Set data", desc: "Replaces histogram raw data with array of numbers [23.1, 24.5, ...]." },
        appendValue: { label: "Append value", desc: "Appends single value to sliding buffer { value, seriesId }." },
        setBinnedData: { label: "Set binned data", desc: "Replaces bins with pre-calculated [{ binStart, binEnd, count }]." },
        setLimits: { label: "Set limits", desc: "Updates dynamic tolerance limits { lsl, target, usl }." },
        clear: { label: "Clear data", desc: "Clears all values." },
        export: { label: "Export", desc: "Exports histogram data to CSV, XLSX, or PNG." }
    },

    view: HistogramElement
});
