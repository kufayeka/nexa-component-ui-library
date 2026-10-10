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
import { valueOrNaN, gapSpec, splitRuns, bridgesOf, missingProps, missingFields } from "./gaps.js";

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
    ...missingFields(),

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

    // the runs of a series' points (./gaps.js): cut where a value was missing and after a silence, as the chart and the series say.
    // -> { spec, xs: the times, runs: [start, end, ...] }
    _runsOf(s) {
        const buf = this._state(s).buf, n = buf.length, spec = gapSpec(this.p, s);
        const xs = new Float64Array(n);
        for (let i = 0; i < n; i++) xs[i] = buf.timeAt(i);
        return { spec, xs, runs: splitRuns(xs, n, spec.after, spec.nulls ? buf.breaksKept() : null, 0) };
    }

    // a thin dashed line across each hole (Gap with a dashed bridge): pts(i) -> [x, y] of point i; clipped to the plot
    _drawBridges(ctx, runs, pts, color, lw, plot) {
        const list = bridgesOf(runs);
        if (!list.length) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(plot.x, plot.y, plot.w, plot.h);
        ctx.clip();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, lw / 2);
        ctx.globalAlpha = 0.85;
        for (const [i, j] of list) {
            const a = pts(i), b = pts(j);
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.stroke();
        }
        ctx.restore();
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

    // ---- the live value and the actions of ONE series: the Line Chart's, so a flow means the same on both ----
    // (the live value (a tag) and every Logic action of a series take (params = msg.payload, target))
    // every change of a prop, one by one: a live value is taken here (not in updated(): Lit batches)
    propsChanged() { this.prepareData(); }

    prepareData() {
        const live = new Set();
        let dirty = false;
        for (const s of this.seriesList()) {
            live.add(s._key);
            const st = this._state(s);
            const cap = Math.max(50, numOr(s.maxPoints, 10000));
            if (st.buf.capacity !== cap) { st.buf.setCapacity(cap); dirty = true; }
            // the live value: every new value is a point (the same value object again is not)
            const v = s.live;
            if (v === null || (v === undefined && st.lastLive !== undefined)) {
                // null / undefined after a value: the value is MISSING now (a 0 would be a value); once, until a value comes again
                if (st.lastLive !== undefined && st.lastLive !== null) {
                    st.lastLive = null;
                    if (this._add(s, st, [null]).gone) dirty = true;
                }
            } else if (v !== undefined && v !== "" && v !== "???" && v !== st.lastLive && !(typeof v === "object" && v.$bind)) {
                st.lastLive = v;
                if (this._add(s, st, Array.isArray(v) ? v : [v]).added) dirty = true;
            }
        }
        for (const k of Array.from(this._series.keys())) if (!live.has(k)) { this._series.delete(k); dirty = true; }
        if (dirty) { this.scheduleDraw(); this.requestUpdate(); }
    }

    // points into a series: {x, y} / a number (time = now). A value that is null / undefined / "" / not a number is MISSING, never a
    // 0: no point, a break (./gaps.js). -> { added: points, gone: breaks }
    _add(s, st, pts) {
        if (st.demo) { st.buf.clear(); st.demo = false; }
        let added = 0, gone = 0;
        for (const pt of pts) {
            let x, y;
            if (pt === null || pt === undefined) { x = Date.now(); y = NaN; }
            else if (typeof pt === "object") {
                x = timeOf(pt[s.xField || "x"] !== undefined ? pt[s.xField || "x"] : (pt.time !== undefined ? pt.time : Date.now()));
                y = valueOrNaN(pt[s.yField || "y"] !== undefined ? pt[s.yField || "y"] : pt.val);
            } else { x = Date.now(); y = valueOrNaN(pt); }
            if (!Number.isFinite(x)) continue;
            if (!Number.isFinite(y)) { if (st.buf.markBreak(x)) gone++; continue; }
            if (st.buf.push(x, y)) added++;
        }
        return { added, gone };
    }

    _pointsOf(params) {
        if (params && typeof params === "object" && !Array.isArray(params) && Array.isArray(params.points)) return params.points;
        return Array.isArray(params) ? params : params === undefined || params === null || params === "" ? [] : [params];
    }

    appendPoints(params, target) {
        const s = this.findSeries(target || (params && params.series));
        if (!s) return 0;
        const { added, gone } = this._add(s, this._state(s), this._pointsOf(params));
        if (added || gone) { this.scheduleDraw(); this.requestUpdate(); }
        return added;
    }

    replacePoints(params, target) {
        const s = this.findSeries(target || (params && params.series));
        if (!s) return 0;
        const st = this._state(s);
        st.buf.clear();
        st.demo = false;
        const { added } = this._add(s, st, this._pointsOf(params));
        this.scheduleDraw();
        this.requestUpdate();
        return added;
    }

    clear(params, target) {
        const s = this.findSeries(target || (params && params.series));
        if (!s) return;
        const st = this._state(s);
        st.buf.clear();
        st.demo = false;
        this.scheduleDraw();
        this.requestUpdate();
    }

    show(params, target) { this._setVisible(target || (params && params.series), true); }
    hide(params, target) { this._setVisible(target || (params && params.series), false); }

    _setVisible(ref, on) {
        const s = this.findSeries(ref);
        if (!s) return;
        if (on) this._hidden.delete(s._key); else this._hidden.add(s._key);
        this.scheduleDraw();
        this.requestUpdate();
    }

    clearAll() {
        for (const s of this.seriesList()) {
            const st = this._state(s);
            st.buf.clear();
            st.demo = false;
        }
        this.scheduleDraw();
    }

    // kept for flows that used the old name: the chart's Update node clearing every series
    clearPoints() { this.clearAll(); }

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
        const plot = { x: plotX, y: plotY, w: plotW, h: plotH };
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
                const K = timeKeys.length;

                // Baselines stack array initialized at 0
                let baselineVals = new Array(K).fill(0);

                vSeries.forEach((s) => {
                    const buf = this._state(s).buf;
                    const color = this.colorOf(s);
                    const opacity = numOr(s.fillOpacity, 0.45);
                    const upperVals = new Array(K);

                    // Gap / Bridge: a series has no value where its data is missing (it adds nothing to the stack there), and its band
                    // is cut. Connect keeps the nearest value everywhere, as it always did.
                    const info = this._runsOf(s), spec = info.spec;
                    let present = null;
                    if (spec.mode !== "connect") {
                        present = new Uint8Array(K);
                        for (let r = 0; r < info.runs.length; r += 2) {
                            const t0 = info.xs[info.runs[r]], t1 = info.xs[info.runs[r + 1] - 1];
                            for (let k = 0; k < K; k++) if (timeKeys[k] >= t0 && timeKeys[k] <= t1) present[k] = 1;
                        }
                    }

                    for (let i = 0; i < K; i++) {
                        const t = timeKeys[i];
                        const ptVal = present && !present[i] ? 0 : Math.max(0, buf.valAtTime ? buf.valAtTime(t) : 0);
                        upperVals[i] = baselineVals[i] + ptVal;
                    }

                    // the stretches of keys the series has data at (all of them for Connect)
                    const segs = [];
                    for (let i = 0; i < K; i++) {
                        if (present && !present[i]) continue;
                        const last = segs[segs.length - 1];
                        if (last && last[1] === i - 1) last[1] = i; else segs.push([i, i]);
                    }
                    const lw = numOr(s.lineWidth, 2);
                    ctx.save();
                    for (const [i0, i1] of segs) {
                        if (i1 === i0 && present) {            // one key: a dot
                            ctx.fillStyle = color;
                            ctx.beginPath();
                            ctx.arc(toScreenX(timeKeys[i0]), toScreenY(upperVals[i0]), Math.max(3, lw * 1.5), 0, Math.PI * 2);
                            ctx.fill();
                            continue;
                        }
                        // Render polygon: baseline curve forward, upper curve backward
                        ctx.beginPath();
                        // Upper edge
                        for (let i = i0; i <= i1; i++) {
                            const sx = toScreenX(timeKeys[i]);
                            const sy = toScreenY(upperVals[i]);
                            if (i === i0) ctx.moveTo(sx, sy);
                            else ctx.lineTo(sx, sy);
                        }
                        // Lower edge (in reverse)
                        for (let i = i1; i >= i0; i--) {
                            const sx = toScreenX(timeKeys[i]);
                            const sy = toScreenY(baselineVals[i]);
                            ctx.lineTo(sx, sy);
                        }
                        ctx.closePath();

                        ctx.fillStyle = this.hexToRgba(color, opacity);
                        ctx.fill();

                        // Top stroke line
                        ctx.beginPath();
                        for (let i = i0; i <= i1; i++) {
                            const sx = toScreenX(timeKeys[i]);
                            const sy = toScreenY(upperVals[i]);
                            if (i === i0) ctx.moveTo(sx, sy);
                            else ctx.lineTo(sx, sy);
                        }
                        ctx.strokeStyle = color;
                        ctx.lineWidth = lw;
                        ctx.stroke();
                    }
                    ctx.restore();
                    if (spec.mode === "bridge" && segs.length > 1) {
                        const flat = [];
                        segs.forEach(([i0, i1]) => flat.push(i0, i1 + 1));
                        this._drawBridges(ctx, flat, (i) => [toScreenX(timeKeys[i]), toScreenY(upperVals[i])], color, lw, plot);
                    }

                    // Advance baseline
                    baselineVals = upperVals;
                });
            } else {
                // Standard Area (each fills to bottom), run by run: a run is cut where data is missing (./gaps.js)
                vSeries.forEach((s) => {
                    const buf = this._state(s).buf;
                    const len = buf.length;
                    if (!len) return;

                    const color = this.colorOf(s);
                    const opacity = numOr(s.fillOpacity, 0.35);
                    const lw = numOr(s.lineWidth, 2);
                    const info = this._runsOf(s), base = plotY + plotH;
                    const sx = (i) => toScreenX(buf.timeAt(i)), sy = (i) => toScreenY(buf.valAt(i));

                    ctx.save();
                    let fill;
                    if (s.fillType === "gradient") {
                        fill = ctx.createLinearGradient(0, plotY, 0, base);
                        fill.addColorStop(0, this.hexToRgba(color, opacity));
                        fill.addColorStop(1, this.hexToRgba(color, 0.02));
                    } else {
                        fill = this.hexToRgba(color, opacity);
                    }
                    for (let r = 0; r < info.runs.length; r += 2) {
                        // the points of this run in the time shown
                        let first = -1, last = -1;
                        for (let i = info.runs[r]; i < info.runs[r + 1]; i++) {
                            const t = info.xs[i];
                            if (t < vMinX || t > vMaxX) continue;
                            if (first < 0) first = i;
                            last = i;
                        }
                        if (first < 0) continue;
                        if (first === last) {
                            if (info.spec.mode !== "connect") {        // one point between two holes: a dot
                                ctx.fillStyle = color;
                                ctx.beginPath();
                                ctx.arc(sx(first), sy(first), Math.max(3, lw * 1.5), 0, Math.PI * 2);
                                ctx.fill();
                            }
                            continue;
                        }
                        // the polygon down to the baseline
                        ctx.beginPath();
                        ctx.moveTo(sx(first), sy(first));
                        for (let i = first + 1; i <= last; i++) ctx.lineTo(sx(i), sy(i));
                        ctx.lineTo(sx(last), base);
                        ctx.lineTo(sx(first), base);
                        ctx.closePath();
                        ctx.fillStyle = fill;
                        ctx.fill();

                        // Top stroke
                        ctx.beginPath();
                        ctx.moveTo(sx(first), sy(first));
                        for (let i = first + 1; i <= last; i++) ctx.lineTo(sx(i), sy(i));
                        ctx.strokeStyle = color;
                        ctx.lineWidth = lw;
                        ctx.stroke();
                    }
                    ctx.restore();
                    if (info.spec.mode === "bridge") this._drawBridges(ctx, info.runs, (i) => [sx(i), sy(i)], color, lw, plot);
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
                if (s) this.replacePoints(pts, s);
            }
        } else if (Array.isArray(data)) {
            // Array of [{ time, s1, s2 }] or [{ x, y }]
            if (list[0]) this.replacePoints(data, list[0]);
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
                    appendPoints: {
                        label: "Append points", help: "Adds points to this series (any order: a late point goes in its place).",
                        example: "{ \"x\": 1727852400000, \"y\": 25.5 }  or  [{x, y}, …]  or  25.5 (time = now)"
                    },
                    replacePoints: {
                        label: "Replace points", help: "Replaces everything the series holds: a query result, a batch's history.",
                        example: "[{ \"x\": 1727852400000, \"y\": 25.5 }, …]"
                    },
                    clear: { label: "Clear", help: "Empties this series." },
                    show: { label: "Show", help: "Shows this series (as its legend entry would)." },
                    hide: { label: "Hide", help: "Hides this series; its data is kept." }
                }
            }
        },

        legend: {
            type: "enum", group: "Legend", label: "Legend position", default: "bottom",
            options: opt([["bottom", "Bottom"], ["top", "Top"], ["none", "Hidden"]])
        },

        ...timeProps(),
        ...missingProps("Series"),
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
