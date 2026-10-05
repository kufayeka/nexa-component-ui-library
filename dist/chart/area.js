// Nexa UI — Area & Stacked Area Chart
// Continuous time-series area visualization built on TimeChartElement:
//   - Standard Area: filled region under each series curve with customizable gradient or solid fill
//   - Stacked Area: series stack cumulatively to visualize total volume, flow, or cumulative energy
//   - 100% Stacked Area: normalized stack to 100% distribution across time
//   - Ring buffers for streaming performance (M4 decimation / LOD)
//   - Series as Logic targets (target: true, Update node per series, append/replace/clear)
//   - Gestures (page-first / chart-first), time ruler, live ticker, annotations, and export
import { html, asBinding, evaluateExpression } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, defineUI } from "../core.js";
import { chartCommon, opt, NOTATIONS, DECIMALS, DASHES, notationOf, numOr, niceNum } from "./core.js";
import { getNiceTimeStep, parseTimeWindow, SPANS, WINDOWS, spanMs, timeOf, parts, pad2, clock, relative } from "./time.js";
import { TimeSeriesRingBuffer, lowerBoundRing, upperBoundRing, M4Decimator } from "./buffer.js";
import { xlsxBlob } from "./export.js";
import { TimeChartElement } from "./time-chart.js";
import { timeProps, zoomProps, annotationProps, exportProps, timeEvents, timeActions } from "./props.js";

const common = chartCommon;

const SERIES_FIELDS = {
    name: { type: "string", label: "Name", default: "Series" },
    id: { type: "string", label: "Id", default: "", bindable: false, help: "Fixed ID for Logic targeting." },
    visible: { type: "boolean", label: "Visible", default: true },
    legend: { type: "boolean", label: "In the legend", default: true },

    live: {
        type: "tag", access: "read", section: "Data", label: "Live value",
        help: "Tag or variable: each value adds a point at now. Objects {x, y} or arrays of them are also accepted."
    },
    xField: { type: "string", section: "Data", label: "Time field (x)", default: "x", bindable: false },
    yField: { type: "string", section: "Data", label: "Value field (y)", default: "y", bindable: false },
    maxPoints: { type: "number", section: "Data", label: "Points kept", default: 10000, min: 50, max: 1000000, step: 500 },

    color: { type: "color", section: "Style", label: "Colour", default: "", help: "Empty: next colour in theme palette." },
    lineWidth: { type: "number", section: "Style", label: "Top line width", default: 2, min: 0.5, max: 6, step: 0.5, unit: "px" },
    fillType: {
        type: "enum", section: "Style", label: "Fill type", default: "gradient",
        options: opt([["gradient", "Gradient (fade to baseline)"], ["solid", "Solid fill"]])
    },
    fillOpacity: { type: "number", section: "Style", label: "Fill opacity", default: 0.35, min: 0.05, max: 1, step: 0.05 },

    unit: { type: "string", section: "Axis", label: "Unit (°C, kW, %)", default: "" }
};

function seriesDefaults() {
    const o = {};
    Object.keys(SERIES_FIELDS).forEach((k) => { o[k] = SERIES_FIELDS[k].default; });
    delete o.live;
    return o;
}

export class AreaChartElement extends TimeChartElement {
    _series = new Map();
    _sl = null;
    _hidden = new Set();
    _scale = null;
    _hoverTime = null;
    _hoverY = null;

    seriesList() {
        const raw = Array.isArray(this.p && this.p.series) ? this.p.series : [];
        const c = this._sl;
        if (c && c.raw === raw) return c.list;
        const d = seriesDefaults();
        const list = raw.map((s, i) => {
            const o = Object.assign({}, d, s && typeof s === "object" ? s : {});
            o._i = i;
            o._key = String(o.id || "#" + i);
            return o;
        });
        this._sl = { raw, list };
        return list;
    }

    _state(s) {
        let st = this._series.get(s._key);
        if (!st) {
            st = {
                buf: new TimeSeriesRingBuffer(s.maxPoints || 10000),
                lastLive: undefined,
                demo: false
            };
            this._series.set(s._key, st);
        }
        return st;
    }

    _target(s) { return { list: "series", id: s.id || s._key }; }

    findSeries(ref) {
        const list = this.seriesList();
        if (ref && typeof ref === "object" && ref.id !== undefined) ref = ref.id;
        if (ref === undefined || ref === null || ref === "") return list[0] || null;
        const byIndex = typeof ref === "number" || /^\d+$/.test(String(ref)) ? list[Number(ref)] : null;
        return list.find((s) => s.id && s.id === String(ref)) || list.find((s) => s.name === String(ref)) || byIndex || null;
    }

    colorOf(s) {
        if (s.color && typeof s.color === "string" && s.color.trim()) return s.color.trim();
        return this.seriesColor(s._i);
    }

    _fullBounds() {
        let minX = Infinity, maxX = -Infinity, minY = 0, maxY = -Infinity;
        const isStacked = (this.p && (this.p.mode === "stacked" || this.p.mode === "stacked100"));

        for (const s of this.seriesList()) {
            if (s.visible === false || this._hidden.has(s._key)) continue;
            const buf = this._state(s).buf;
            const len = buf.length;
            if (!len) continue;
            const t0 = buf.timeAt(0), t1 = buf.timeAt(len - 1);
            if (t0 < minX) minX = t0;
            if (t1 > maxX) maxX = t1;
            for (let i = 0; i < len; i++) {
                const y = buf.valAt(i);
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }

        if (!Number.isFinite(minX)) {
            const now = this._now();
            return { minX: now - 3600000, maxX: now, minY: 0, maxY: 100 };
        }
        if (isStacked && maxY > 0) {
            // In stacked mode, rough upper bound is sum of series max
            const numVisible = this.seriesList().filter((s) => s.visible !== false && !this._hidden.has(s._key)).length;
            maxY = this.p.mode === "stacked100" ? 100 : maxY * Math.max(1, numVisible * 0.85);
        }
        if (maxY <= minY) maxY = minY + 10;
        return { minX, maxX, minY, maxY };
    }

    appendPoints(seriesRef, points) {
        const s = this.findSeries(seriesRef);
        if (!s) return;
        const st = this._state(s);
        if (st.demo) { st.buf.clear(); st.demo = false; }
        const arr = Array.isArray(points) ? points : [points];
        for (const pt of arr) {
            if (typeof pt === "number") {
                st.buf.push(this._now(), pt);
            } else if (pt && typeof pt === "object") {
                const x = timeOf(pt[s.xField || "x"] !== undefined ? pt[s.xField || "x"] : (pt.time !== undefined ? pt.time : this._now()));
                const y = numOr(pt[s.yField || "y"] !== undefined ? pt[s.yField || "y"] : pt.val, 0);
                if (Number.isFinite(x) && Number.isFinite(y)) st.buf.push(x, y);
            }
        }
        this.scheduleDraw();
    }

    replacePoints(seriesRef, points) {
        const s = this.findSeries(seriesRef);
        if (!s) return;
        const st = this._state(s);
        st.buf.clear();
        st.demo = false;
        this.appendPoints(s, points);
    }

    clearSeries(seriesRef) {
        const s = this.findSeries(seriesRef);
        if (!s) return;
        const st = this._state(s);
        st.buf.clear();
        st.demo = false;
        this.scheduleDraw();
    }

    clearAll() {
        for (const s of this.seriesList()) {
            const st = this._state(s);
            st.buf.clear();
            st.demo = false;
        }
        this.scheduleDraw();
    }

    draw() {
        if (!this.ctx || !this.canvas) return;
        const { w, h } = this._layoutSize();
        if (w <= 0 || h <= 0) return;

        const bounds = this._fullBounds();
        const { vMinX, vMaxX } = this.getEffectiveTimeRange(bounds);
        const ctx = this.ctx;
        const colors = this._colors();

        const rulerH = this._rulerHeight(h);
        const padL = 48, padR = 24, padT = 16, padB = rulerH + 8;
        const plotX = padL, plotY = padT, plotW = w - padL - padR, plotH = h - padT - padB;

        this._clearCanvas(ctx, w, h);
        if (plotW <= 0 || plotH <= 0) return;

        const mode = (this.p && this.p.mode) || "standard";
        const isStacked100 = mode === "stacked100";
        const isStacked = mode === "stacked" || isStacked100;

        const vSeries = this.seriesList().filter((s) => s.visible !== false && !this._hidden.has(s._key));

        // 1. Calculate Y scale
        let yMin = 0, yMax = isStacked100 ? 100 : (numOr(this.p && this.p.max, bounds.maxY) || 100);
        if (yMax <= yMin) yMax = 100;
        const niceYMax = isStacked100 ? 100 : niceNum(yMax - yMin, true);
        const effYMax = isStacked100 ? 100 : niceYMax;

        const toScreenX = (t) => plotX + ((t - vMinX) / (vMaxX - vMinX)) * plotW;
        const toScreenY = (val) => plotY + plotH - ((val - yMin) / (effYMax - yMin)) * plotH;

        this._scale = { vMinX, vMaxX, yMin, yMax: effYMax, plotX, plotY, plotW, plotH, toScreenX, toScreenY };

        // 2. Grid lines
        ctx.save();
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);

        const ySteps = 4;
        for (let i = 0; i <= ySteps; i++) {
            const yv = yMin + (i / ySteps) * (effYMax - yMin);
            const sy = toScreenY(yv);
            ctx.beginPath();
            ctx.moveTo(plotX, sy);
            ctx.lineTo(plotX + plotW, sy);
            ctx.stroke();

            // Y label
            ctx.font = `10px ${colors.font || "sans-serif"}`;
            ctx.fillStyle = colors.text;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(String(Math.round(yv)) + (isStacked100 ? "%" : ""), plotX - 6, sy);
        }
        ctx.restore();

        // 3. Draw Areas
        if (vSeries.length) {
            if (isStacked) {
                // Stacked Area logic: accumulate heights across time
                // Collect and sort all visible time keys in view
                const timeSet = new Set();
                vSeries.forEach((s) => {
                    const buf = this._state(s).buf;
                    for (let i = 0; i < buf.length; i++) {
                        const t = buf.timeAt(i);
                        if (t >= vMinX && t <= vMaxX) timeSet.add(t);
                    }
                });
                let timeKeys = Array.from(timeSet).sort((a, b) => a - b);
                if (timeKeys.length < 2) {
                    timeKeys = [vMinX, vMaxX];
                }

                // Baselines stack array initialized at 0
                let baselineVals = new Array(timeKeys.length).fill(0);

                vSeries.forEach((s) => {
                    const buf = this._state(s).buf;
                    const color = this.colorOf(s);
                    const opacity = numOr(s.fillOpacity, 0.45);
                    const upperVals = new Array(timeKeys.length);

                    for (let i = 0; i < timeKeys.length; i++) {
                        const t = timeKeys[i];
                        const ptVal = Math.max(0, buf.valAtTime ? buf.valAtTime(t) : 0);
                        upperVals[i] = baselineVals[i] + ptVal;
                    }

                    // Render polygon: baseline curve forward, upper curve backward
                    ctx.save();
                    ctx.beginPath();
                    // Upper edge
                    for (let i = 0; i < timeKeys.length; i++) {
                        const sx = toScreenX(timeKeys[i]);
                        const sy = toScreenY(upperVals[i]);
                        if (i === 0) ctx.moveTo(sx, sy);
                        else ctx.lineTo(sx, sy);
                    }
                    // Lower edge (in reverse)
                    for (let i = timeKeys.length - 1; i >= 0; i--) {
                        const sx = toScreenX(timeKeys[i]);
                        const sy = toScreenY(baselineVals[i]);
                        ctx.lineTo(sx, sy);
                    }
                    ctx.closePath();

                    ctx.fillStyle = this.hexToRgba(color, opacity);
                    ctx.fill();

                    // Top stroke line
                    ctx.beginPath();
                    for (let i = 0; i < timeKeys.length; i++) {
                        const sx = toScreenX(timeKeys[i]);
                        const sy = toScreenY(upperVals[i]);
                        if (i === 0) ctx.moveTo(sx, sy);
                        else ctx.lineTo(sx, sy);
                    }
                    ctx.strokeStyle = color;
                    ctx.lineWidth = numOr(s.lineWidth, 2);
                    ctx.stroke();
                    ctx.restore();

                    // Advance baseline
                    baselineVals = upperVals;
                });
            } else {
                // Standard Area (each fills to bottom)
                vSeries.forEach((s) => {
                    const buf = this._state(s).buf;
                    const len = buf.length;
                    if (!len) return;

                    const color = this.colorOf(s);
                    const opacity = numOr(s.fillOpacity, 0.35);

                    ctx.save();
                    ctx.beginPath();
                    let firstX = plotX, lastX = plotX;

                    for (let i = 0; i < len; i++) {
                        const t = buf.timeAt(i);
                        if (t < vMinX || t > vMaxX) continue;
                        const sx = toScreenX(t);
                        const sy = toScreenY(buf.valAt(i));
                        if (i === 0 || ctx.currentPathEmpty) {
                            ctx.moveTo(sx, sy);
                            firstX = sx;
                        } else {
                            ctx.lineTo(sx, sy);
                        }
                        lastX = sx;
                    }

                    // Complete polygon down to baseline
                    ctx.lineTo(lastX, plotY + plotH);
                    ctx.lineTo(firstX, plotY + plotH);
                    ctx.closePath();

                    if (s.fillType === "gradient") {
                        const grad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
                        grad.addColorStop(0, this.hexToRgba(color, opacity));
                        grad.addColorStop(1, this.hexToRgba(color, 0.02));
                        ctx.fillStyle = grad;
                    } else {
                        ctx.fillStyle = this.hexToRgba(color, opacity);
                    }
                    ctx.fill();

                    // Top stroke
                    ctx.beginPath();
                    for (let i = 0; i < len; i++) {
                        const t = buf.timeAt(i);
                        if (t < vMinX || t > vMaxX) continue;
                        const sx = toScreenX(t);
                        const sy = toScreenY(buf.valAt(i));
                        if (i === 0) ctx.moveTo(sx, sy);
                        else ctx.lineTo(sx, sy);
                    }
                    ctx.strokeStyle = color;
                    ctx.lineWidth = numOr(s.lineWidth, 2);
                    ctx.stroke();
                    ctx.restore();
                });
            }
        }

        // 4. Draw Time Ruler at bottom
        const m = {
            plotX, plotY, plotW, plotH,
            rulerX: plotX, rulerY: plotY + plotH + 4, rulerW: plotW, rulerH
        };
        this._drawRuler(ctx, m, vMinX, vMaxX, vSeries);
    }

    // ---- Logic Actions & Helpers -----------------------------------------------------------
    setChartData(data) {
        if (!data || typeof data !== "object") return;
        const list = this.seriesList();
        if (data.series && typeof data.series === "object") {
            for (const [k, pts] of Object.entries(data.series)) {
                const s = this.findSeries(k);
                if (s) this.replacePoints(s, pts);
            }
        } else if (Array.isArray(data)) {
            // Array of [{ time, s1, s2 }] or [{ x, y }]
            if (list[0]) this.replacePoints(list[0], data);
        }
        this.scheduleDraw();
    }

    fmtTime(ts) {
        const utc = this.p && this.p.timeZone === "utc";
        const q = parts(ts, utc);
        return q.y + "-" + pad2(q.mo + 1) + "-" + pad2(q.d) + " " + pad2(q.h) + ":" + pad2(q.mi) + ":" + pad2(q.s);
    }

    exportData(format) {
        const fmt = (format || "csv").toLowerCase();
        const vSeries = this.seriesList().filter((s) => s.visible !== false && !this._hidden.has(s._key));
        const header = ["Time"].concat(vSeries.map((s) => s.name || s.id));

        const timeSet = new Set();
        vSeries.forEach((s) => {
            const buf = this._state(s).buf;
            for (let i = 0; i < buf.length; i++) timeSet.add(buf.timeAt(i));
        });
        const sortedTimes = Array.from(timeSet).sort((a, b) => a - b);
        const rows = [];
        sortedTimes.forEach((t) => {
            const r = [this.fmtTime(t)];
            vSeries.forEach((s) => {
                const buf = this._state(s).buf;
                r.push(buf.valAtTime ? buf.valAtTime(t) : 0);
            });
            rows.push(r);
        });

        let blob;
        if (fmt === "xlsx") {
            blob = xlsxBlob(header, rows, false, { timeCols: [0] });
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
        const all = this.seriesList();
        const legendAt = (this.p && this.p.legend) || "bottom";
        const legendList = all.filter((s) => s.legend !== false);

        const legend = legendAt === "none" || !legendList.length ? "" : html`
            <div class="legend" part="legend">
                ${legendList.map((s) => html`
                    <button type="button" class="lg-item ${this._hidden.has(s._key) || s.visible === false ? "off" : ""}"
                        @click=${() => this._toggle(s)}>
                        <span class="lg-swatch" style="background:${this.colorOf(s)}"></span>
                        <span class="lg-name">${s.name || "Series " + (s._i + 1)}</span>
                    </button>
                `)}
            </div>
        `;

        return html`
            <div class="chart-container" part="chart">
                ${legendAt === "top" ? legend : ""}
                <div class="plot"
                    @wheel=${(e) => this.onWheel(e)}
                    @pointerdown=${(e) => this.onPointerDown(e)}
                    @pointermove=${(e) => this.onPointerMove(e)}
                    @pointerup=${(e) => this.onPointerUp(e)}
                    @pointercancel=${(e) => this.onPointerCancel(e)}
                    @pointerleave=${(e) => this.onPointerLeave(e)}
                    @dblclick=${() => this.followLive()}>
                    <canvas></canvas>
                    <div class="corner" style="right: 14px; top: 10px;">
                        ${this.viewRange ? html`
                            <button class="btn-chip btn-reset-zoom" @click=${() => this.followLive()} title="Reset zoom">
                                <span class="live-dot"></span> Reset Zoom
                            </button>` : ""}
                        ${this._renderMenu()}
                    </div>
                </div>
                ${legendAt !== "top" ? legend : ""}
            </div>
        `;
    }
}

export const areaChart = defineUI({
    ...common,
    id: PREFIX + "area-chart",
    label: "Area / Stacked Area Chart",
    icon: "fa fa-area-chart",
    size: { w: 600, h: 280 },
    help: "Time-series area and stacked area chart for cumulative flow, power volume, and capacity tracking. Extends TimeChartElement with full zoom/pan gestures, time ruler, and live stream.",
    version: 1,

    groups: ["Chart Mode", "Series", "Time axis", "Scale", "Legend", "Zoom & pan", "Annotations", "Export", "Style", "Behaviour"],

    properties: {
        mode: {
            type: "enum", group: "Chart Mode", label: "Mode", default: "standard",
            options: opt([["standard", "Standard Area (overlapped)"], ["stacked", "Stacked Area (cumulative volume)"], ["stacked100", "100% Stacked Area (distribution)"]]),
            help: "Standard fills down to baseline; Stacked accumulates series heights to show total."
        },

        // ---- Series ----
        series: {
            type: "list", group: "Series", label: "Series", noun: "series",
            default: [Object.assign(seriesDefaults(), { id: "s1", name: "Series 1" })],
            item: {
                fields: SERIES_FIELDS, noun: "series",
                target: true,
                actions: {
                    appendPoints: { label: "Append points", example: "{ \"x\": 1727852400000, \"y\": 25.5 }" },
                    replacePoints: { label: "Replace points", example: "[{ \"x\": 1727852400000, \"y\": 25.5 }]" },
                    clear: { label: "Clear" }
                }
            }
        },

        legend: {
            type: "enum", group: "Legend", label: "Legend position", default: "bottom",
            options: opt([["bottom", "Bottom"], ["top", "Top"], ["none", "Hidden"]])
        },

        ...timeProps(),
        ...zoomProps(),
        ...annotationProps(),
        ...exportProps({ thresholds: true })
    },

    actions: {
        setChartData: {
            label: "Set chart data (bulk)",
            help: "Updates data across all series at once.",
            example: "{\n  \"series\": {\n    \"s1\": [{ \"x\": 1727852400000, \"y\": 20 }],\n    \"s2\": [{ \"x\": 1727852400000, \"y\": 35 }]\n  }\n}"
        },
        clearAll: { label: "Clear all", help: "Clears all points across all series." },
        ...timeActions()
    },

    events: {
        ...timeEvents()
    },

    view: AreaChartElement
});
