// Nexa UI — Radar (spider): several measures of one thing at a glance, and where it leans: a line's OEE / availability /
// performance / quality, a shift against a target, production per tariff period.
//
// The rules that make a radar honest are built in:
//   - the axes in YOUR order (the order changes the shape: never sorted to look better);
//   - a fixed scale from 0 by default (Power BI's most asked-for fix: a radar that rescales itself lies);
//   - each axis its own min / max when the units differ (kWh, pcs, %), and "lower is better" axes turned round so that
//     OUTWARD = GOOD on every axis (scrap, downtime);
//   - a target (a dashed polygon) or a good band per axis, the points short of it marked;
//   - more than 3 series overlaid stop being readable: small multiples, a radar per series.
// Data: rows wide ([{ "line": "L11", "OEE": 82, "Quality": 97 }], a series per row, an axis per field) or long
// ({ series, axis, value }), Set series from Logic, or live tags on the axes (one "Live" series).
import { html, css, formatValue } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, part, defineUI } from "../core.js";
import { ChartElement, chartCommon, opt, numOr, DASHES } from "./core.js";
import { exportProps } from "./props.js";
import { legendProps, legendTemplate, legendPlace, fillLegend } from "./legend.js";
import { niceTicks } from "./stack.js";
import { xlsxBlob } from "./export.js";

const RD_STATS = [["avg", "Average of its axes (% of each scale)", "Avg %"], ["short", "Axes short of the target", "Short"]];
const AXIS_FIELDS = {
    name: { type: "string", label: "Name", default: "Axis" },
    field: { type: "string", label: "Field / key", default: "", help: "The rows' field (wide) or axis name (long). Empty: the name." },
    min: { type: "number", label: "Min", default: "", help: "Empty: 0 (or the shared scale)." },
    max: { type: "number", label: "Max", default: "", help: "Empty: the data's, rounded up (or the shared scale)." },
    better: { type: "enum", label: "Better is", default: "higher", options: opt([["higher", "Higher (outward)"], ["lower", "Lower (turned round: outward = good)"]]) },
    target: { type: "number", label: "Target", default: "" },
    bandLow: { type: "number", label: "Good from", default: "" },
    bandHigh: { type: "number", label: "Good to", default: "" },
    unit: { type: "string", label: "Unit", default: "" },
    decimals: { type: "number", label: "Decimals", default: "", min: 0, max: 6 },
    tag: { type: "tag", access: "read", label: "Live value", help: "Its value in the Live series." }
};

export const radar = defineUI({
    ...chartCommon,
    id: PREFIX + "radar",
    label: "Radar",
    icon: "fa fa-certificate",
    size: { w: 480, h: 380 },
    help: "Several measures at a glance and where it leans (OEE parts, a shift against its target). Axes in your order, a fixed scale from 0, each axis its own scale when units differ, lower-is-better axes turned round, a target polygon or good band, small multiples past 3 series.",
    version: 1,

    groups: ["Data", "Axes", "Scale", "Series", "Target", "Grid", "Layout", "Legend", "General", "Export"],

    properties: {
        rows: { type: "json", group: "Data", label: "Rows", default: [], help: "Wide: [{ \"line\": \"L11\", \"OEE\": 82, \"Quality\": 97 }] (a series per row). Long: [{ \"series\": \"L11\", \"axis\": \"OEE\", \"value\": 82 }]. Logic: Set rows / Set series." },
        shape: { type: "enum", group: "Data", label: "The rows are", default: "wide", options: opt([["wide", "Wide: a series per row, an axis per field"], ["long", "Long: a row per value"]]) },
        seriesField: { type: "string", group: "Data", label: "Series field", default: "series", bindable: false, help: "Wide: the row's name. Long: the series." },
        axisField: { type: "string", group: "Data", label: "Axis field", default: "axis", bindable: false, visibleWhen: (p) => p.shape === "long" },
        valueField: { type: "string", group: "Data", label: "Value field", default: "value", bindable: false, visibleWhen: (p) => p.shape === "long" },
        liveName: { type: "string", group: "Data", label: "The live series", default: "Live", help: "The axes' live tags make one series of this name." },

        axes: { type: "list", group: "Axes", label: "Axes", noun: "axis", default: [], help: "In the order they go round, clockwise from the top. Empty: the rows' numeric fields (wide) or axis names (long), in their order. 5 – 10 read best.", item: { fields: AXIS_FIELDS, noun: "axis" } },
        axisLabels: { type: "enum", group: "Axes", label: "At each axis' end", default: "name", options: opt([["name", "Its name"], ["name-value", "Its name and the first series' value"], ["none", "Nothing"]]) },
        labelSize: { type: "number", group: "Axes", label: "Label size", default: 11, min: 8, max: 20, unit: "px" },

        scale: { type: "enum", group: "Scale", label: "Scale", default: "shared", options: opt([["shared", "One for every axis (same units)"], ["axis", "Each axis its own (different units)"]]) },
        min: { type: "number", group: "Scale", label: "Min", default: 0, help: "From 0: a radar not from 0 exaggerates the differences.", visibleWhen: (p) => p.scale !== "axis" },
        max: { type: "number", group: "Scale", label: "Max", default: "", help: "Empty: the data's, rounded up. 100 for percentages: a fixed scale.", visibleWhen: (p) => p.scale !== "axis" },
        unit: { type: "string", group: "Scale", label: "Unit", default: "", visibleWhen: (p) => p.scale !== "axis" },
        decimals: { type: "number", group: "Scale", label: "Decimals", default: "", min: 0, max: 6 },

        lineStyle: { type: "enum", group: "Series", label: "Lines", default: "straight", options: opt([["straight", "Straight (a polygon)"], ["smooth", "Smooth"], ["none", "None (points only)"]]) },
        fillOpacity: { type: "number", group: "Series", label: "Fill", default: 0.18, min: 0, max: 1, step: 0.05 },
        lineWidth: { type: "number", group: "Series", label: "Line width", default: 2, min: 0.5, max: 6, step: 0.5, unit: "px" },
        markers: { type: "boolean", group: "Series", label: "Points at the axes", default: true },
        valueLabels: { type: "boolean", group: "Series", label: "Their values", default: false },
        colors: { type: "string", group: "Series", label: "Colours", default: "", help: "Comma separated, in the series' order. Empty: the theme's chart palette." },

        target: { type: "number", group: "Target", label: "A target on every axis", default: "", help: "A dashed polygon (85 for an OEE of 85 %). An axis' own target wins." },
        targetSeries: { type: "string", group: "Target", label: "Or a series is the target", default: "", help: "Its name: drawn dashed, not filled, and the others compared to it." },
        markShort: { type: "boolean", group: "Target", label: "Mark the points short of the target", default: true },
        band: { type: "boolean", group: "Target", label: "The axes' good bands", default: true, help: "Good from / to on an axis: a green band between them." },

        grid: { type: "enum", group: "Grid", label: "Grid", default: "polygon", options: opt([["polygon", "Polygons"], ["circle", "Circles"], ["none", "None"]]) },
        rings: { type: "number", group: "Grid", label: "Rings", default: 4, min: 1, max: 10 },
        ringLabels: { type: "enum", group: "Grid", label: "Ring values", default: "first", options: opt([["first", "On the first axis"], ["all", "On every axis (each its own scale)"], ["none", "None"]]) },
        gridFill: { type: "boolean", group: "Grid", label: "Alternate ring shading", default: true },

        layout: { type: "enum", group: "Layout", label: "Series", default: "auto", options: opt([["auto", "Overlaid, up to 3; past that a radar each"], ["overlay", "Overlaid"], ["multiples", "A radar each (small multiples)"]]) },
        columns: { type: "number", group: "Layout", label: "Columns", default: 0, min: 0, max: 12, help: "0: as many as fit.", visibleWhen: (p) => p.layout !== "overlay" },

        ...legendProps({ at: "bottom", value: "none", stats: RD_STATS, what: "series" }),

        title: { type: "string", group: "General", label: "Title", default: "" },
        background: { type: "color", group: "General", label: "Background", default: "", tokens: "colors" },
        border: { type: "boolean", group: "General", label: "Border", default: true },
        tooltip: { type: "boolean", group: "General", label: "Tooltip", default: true },
        ...exportProps({ thresholds: false })
    },

    parts: { chart: part("Chart container", "chart"), legend: part("Legend", "legend") },

    events: {
        pointClick: { label: "On Point Click", payload: { series: "string", axis: "string", value: "number", percent: "number", target: "number", short: "boolean" }, help: "A click near an axis: the series and its value there (drill down to that line, that measure)." },
        seriesToggle: { label: "On Series Toggle", payload: { name: "string", visible: "boolean" } }
    },
    actions: {
        setRows: { label: "Set rows", example: "[{ \"series\": \"L11\", \"OEE\": 82, \"Quality\": 97 }]" },
        setSeries: { label: "Set series", params: { name: "string", values: "object" }, example: "{ \"name\": \"Shift A\", \"values\": { \"OEE\": 82, \"Quality\": 97 } }" },
        removeSeries: { label: "Remove a series", params: { name: "string" } },
        clearAll: { label: "Clear" },
        exportData: { label: "Export (download)", params: { format: "string" }, example: "{ \"format\": \"xlsx\" }  (csv | xlsx | png)" }
    },

    view: class extends ChartElement {
        static styles = [...ChartElement.styles, css`
            .rd-wrap { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden;
                border-radius: var(--r, 4px); background: var(--panel, #181b1f); border: 1px solid var(--bd, #2c3235); }
            .rd-wrap.borderless { border-color: transparent; }
            .rd-head { flex: 0 0 auto; padding: 10px 14px 0; font-size: 14px; font-weight: 600; color: var(--fg); }
            .sc-tip { position: absolute; pointer-events: none; z-index: 6; display: none; padding: 6px 9px; border-radius: 4px; background: var(--panel, #181b1f); border: 1px solid var(--bd, #2c3235);
                color: var(--fg, #fff); font: 12px/1.5 var(--nexa-fonts-body, sans-serif); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); white-space: nowrap; }
        `];

        _rowsData = null;
        _set = null;          // Set series: Map name -> { axis: value }
        _hidden = new Set();
        _hover = null;        // { radar, axis }
        _radars = [];

        // ---- data -------------------------------------------------------------------------------------
        _rows() { const r = this._rowsData || this.p.rows; return Array.isArray(r) ? r : []; }
        _editor() { return !!(this._ctx && this._ctx.mode === "editor"); }
        _live() { return (Array.isArray(this.p.axes) ? this.p.axes : []).some((a) => a && Number.isFinite(Number(a.tag)) && a.tag !== "" && a.tag !== null && typeof a.tag !== "object"); }
        _hasData() { return !!(this._rows().length || (this._set && this._set.size) || this._live()); }
        _sample() { return this._editor() && !this._hasData(); }

        setRows(params) { const r = Array.isArray(params) ? params : params && Array.isArray(params.rows) ? params.rows : null; if (r) { this._rowsData = r.slice(); this.scheduleDraw(); this.requestUpdate(); } }
        setSeries(params) {
            if (!params || typeof params !== "object" || !params.name) return;
            if (!this._set) this._set = new Map();
            this._set.set(String(params.name), Object.assign({}, this._set.get(String(params.name)) || {}, params.values || {}));
            this.scheduleDraw(); this.requestUpdate();
        }
        removeSeries(params) { const n = String(params && typeof params === "object" ? params.name : params); if (this._set) this._set.delete(n); this.scheduleDraw(); this.requestUpdate(); }
        clearAll() { this._rowsData = []; this._set = null; this.scheduleDraw(); this.requestUpdate(); }

        // -> { axes: [{ name, key, min, max, better, target, lo, hi, unit, dec }], series: [{ name, values: Map key -> number }] }
        _model() {
            const p = this.p, sample = this._sample();
            let rows = this._rows();
            if (sample) rows = [{ series: "Line A", OEE: 78, Availability: 88, Performance: 84, Quality: 96, "On-time": 72, Safety: 90 }, { series: "Line B", OEE: 64, Availability: 70, Performance: 92, Quality: 89, "On-time": 85, Safety: 75 }];
            const sf = sample ? "series" : p.seriesField || "series", long = !sample && p.shape === "long";
            const series = new Map(), order = [];
            const put = (name, key, v) => { if (!series.has(name)) series.set(name, new Map()); if (Number.isFinite(v)) series.get(name).set(key, v); if (!order.includes(key)) order.push(key); };
            rows.forEach((r, i) => {
                if (!r || typeof r !== "object") return;
                if (long) { put(String(r[sf] === undefined || r[sf] === null ? "" : r[sf]), String(r[p.axisField || "axis"]), Number(r[p.valueField || "value"])); return; }
                const name = String(r[sf] === undefined || r[sf] === null ? "Row " + (i + 1) : r[sf]);
                Object.keys(r).forEach((k) => { if (k !== sf && typeof r[k] === "number") put(name, k, r[k]); });
            });
            if (this._set) this._set.forEach((vals, name) => Object.keys(vals).forEach((k) => put(name, k, Number(vals[k]))));
            const list = Array.isArray(p.axes) && p.axes.length && !sample ? p.axes : order.map((k) => ({ name: k }));
            const axes = list.map((a) => ({ name: String(a.name || a.field || ""), key: String(a.field || a.name || ""), min: numOr(a.min, NaN), max: numOr(a.max, NaN), better: a.better === "lower" ? "lower" : "higher",
                target: numOr(a.target, numOr(p.target, NaN)), lo: numOr(a.bandLow, NaN), hi: numOr(a.bandHigh, NaN), unit: a.unit || "", dec: a.decimals, tag: a.tag }));
            // the live series from the axes' tags
            axes.forEach((a) => { const v = a.tag; if (v !== "" && v !== null && v !== undefined && typeof v !== "object" && typeof v !== "boolean" && Number.isFinite(Number(v))) put(p.liveName || "Live", a.key, Number(v)); });
            // the scales: per axis or shared; from 0 unless set
            const all = (key) => { const out = []; series.forEach((m) => { if (m.has(key)) out.push(m.get(key)); }); return out; };
            const nice = (hi) => (hi > 0 ? niceTicks(0, hi, 4).max : 1);
            if (p.scale === "axis") axes.forEach((a) => {
                const v = all(a.key).concat([a.target, a.hi].filter(Number.isFinite));
                if (!Number.isFinite(a.min)) a.min = Math.min(0, ...v);
                if (!Number.isFinite(a.max)) a.max = nice(Math.max(...v, a.min + 1));
            });
            else {
                const v = []; axes.forEach((a) => v.push(...all(a.key), ...[a.target, a.hi].filter(Number.isFinite)));
                const lo = numOr(p.min, 0), hi = numOr(p.max, NaN), top = Number.isFinite(hi) ? hi : nice(Math.max(...v, lo + 1));
                axes.forEach((a) => { if (!Number.isFinite(a.min)) a.min = lo; if (!Number.isFinite(a.max)) a.max = top; });
            }
            const names = [...series.keys()];
            return { axes, series: names.map((n, k) => ({ name: n, values: series.get(n), k })), sample };
        }

        // 0 .. 1 along an axis: outward = better (a lower-is-better axis turned round)
        _t(a, v) { const t = (v - a.min) / (a.max - a.min || 1); return Math.max(0, Math.min(1.08, a.better === "lower" ? 1 - t : t)); }
        _short(a, tv, v) { return Number.isFinite(tv) && Number.isFinite(v) && (a.better === "lower" ? v > tv : v < tv); }
        _fmt(a, v) { const d = a.dec !== "" && a.dec !== undefined && a.dec !== null ? a.dec : this.p.decimals; return formatValue(v, { decimals: d === "" || d === undefined || d === null ? "auto" : String(d) }, a.unit || (this.p.scale !== "axis" ? this.p.unit || "" : "")); }
        _colorOf(s) { const list = String(this.p.colors || "").split(",").map((x) => x.trim()).filter(Boolean); return this._tok(list[s.k] || "") || this.seriesColor(s.k); }

        // ---- the drawing ------------------------------------------------------------------------------
        draw() { if (!this.ctx || !this.canvas) return; const { w, h } = this._layoutSize(); if (w > 0 && h > 0) this._drawInto(this.ctx, w, h); }

        _drawInto(ctx, w, h) {
            this._clearCanvas(ctx, w, h);
            const p = this.p, m = this._model(), c = this._colors();
            this._radars = []; this._m = m;
            if (m.axes.length < 3) {
                ctx.fillStyle = c.text; ctx.font = "12px " + c.font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(m.axes.length ? "A radar needs 3 axes or more" : "", w / 2, h / 2);
                return;
            }
            const tgt = p.targetSeries ? m.series.find((s) => s.name === p.targetSeries) : null;
            const shown = m.series.filter((s) => s !== tgt && !this._hidden.has(s.name));
            const multi = p.layout === "multiples" || (p.layout !== "overlay" && shown.length > 3);
            const groups = multi ? shown.map((s) => [s]) : [shown];
            const n = groups.length, top = (p.exportButton !== false ? 22 : 4) + (m.sample ? 14 : 0);
            let cols = Math.round(numOr(p.columns, 0));
            if (!(cols > 0)) {
                // the columns that give the largest radar (a label's room on each side, a caption on top)
                const ls = numOr(p.labelSize, 11), side = p.axisLabels === "none" ? 8 : ls * 6;
                let best = 1, bestR = -1;
                for (let k = 1; k <= n; k++) { const rr = Math.min(w / k - side * 2, (h - top) / Math.ceil(n / k) - (ls + 8) * 3) / 2; if (rr > bestR) { bestR = rr; best = k; } }
                cols = best;
            }
            const rowsN = Math.ceil(n / cols), cw = w / cols, ch = (h - top) / rowsN;
            groups.forEach((list, i) => this._radar(ctx, { x: (i % cols) * cw, y: top + Math.floor(i / cols) * ch, w: cw, h: ch }, m, list, tgt, multi ? list[0].name : "", c));
            if (!this._exporting) fillLegend(this.renderRoot, (key, k) => {
                const s = m.series.find((x) => x.name === key);
                if (!s) return "";
                if (k === "avg") { const ts = m.axes.map((a) => s.values.get(a.key)).map((v, j) => (Number.isFinite(v) ? this._t(m.axes[j], v) : NaN)).filter(Number.isFinite); return ts.length ? Math.round((ts.reduce((x, y) => x + y, 0) / ts.length) * 100) + " %" : "–"; }
                return String(m.axes.filter((a) => this._short(a, this._targetOf(a, tgt), s.values.get(a.key))).length);
            });
        }

        _targetOf(a, tgt) { return tgt && tgt.values.has(a.key) ? tgt.values.get(a.key) : a.target; }

        _radar(ctx, b, m, list, tgt, caption, c) {
            const p = this.p, A = m.axes, N = A.length, ls = numOr(p.labelSize, 11), font = c.font;
            ctx.font = "500 " + ls + "px " + font;
            const capH = caption ? ls + 10 : 0;
            const labW = p.axisLabels === "none" ? 8 : Math.min(b.w * 0.28, Math.max(...A.map((a) => ctx.measureText(a.name).width)) + 12);
            const R = Math.max(20, Math.min((b.w - labW * 2) / 2, (b.h - capH - (ls + 8) * 2 - (p.axisLabels === "name-value" ? ls * 2 : 0)) / 2));
            const cx = b.x + b.w / 2, cy = b.y + capH + (b.h - capH) / 2 + (p.axisLabels === "name-value" ? ls / 2 : 0);
            const ang = (j) => -Math.PI / 2 + (j / N) * Math.PI * 2;
            const at = (j, t) => [cx + Math.cos(ang(j)) * R * t, cy + Math.sin(ang(j)) * R * t];
            const rd = { cx, cy, R, list, tgt, ang };
            this._radars.push(rd);
            if (caption) { ctx.font = "600 " + (ls + 1) + "px " + font; ctx.fillStyle = c.strong; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(caption, cx, b.y + 4); }
            // the grid: rings (polygons or circles), shaded alternately; the spokes
            const rings = Math.max(1, Math.round(numOr(p.rings, 4))), poly = (t) => { ctx.beginPath(); for (let j = 0; j < N; j++) { const [x, y] = at(j, t); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); };
            if (p.grid !== "none") {
                for (let k = rings; k >= 1; k--) {
                    const t = k / rings;
                    if (p.grid === "circle") { ctx.beginPath(); ctx.arc(cx, cy, R * t, 0, Math.PI * 2); } else poly(t);
                    if (p.gridFill !== false) { ctx.fillStyle = k % 2 ? this.hexToRgba(c.strong, 0.035) : this._panelColor(); ctx.fill(); }
                    ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.stroke();
                }
            }
            for (let j = 0; j < N; j++) { const [x, y] = at(j, 1); ctx.strokeStyle = this._hover && this._hover.rd === this._radars.length - 1 && this._hover.axis === j ? c.strong : c.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); }
            // the good bands: a thick green stroke along each axis that has one (not a polygon: an axis without one has none)
            if (p.band !== false) A.forEach((a, j) => {
                if (!Number.isFinite(a.lo) && !Number.isFinite(a.hi)) return;
                const t0 = this._t(a, Number.isFinite(a.lo) ? a.lo : a.min), t1 = this._t(a, Number.isFinite(a.hi) ? a.hi : a.max), [x0, y0] = at(j, Math.min(t0, t1)), [x1, y1] = at(j, Math.min(1, Math.max(t0, t1)));
                ctx.strokeStyle = this.hexToRgba(this.statusColor("success"), 0.35); ctx.lineWidth = 8; ctx.lineCap = "round";
                ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.lineCap = "butt";
            });
            // the ring values
            if (p.ringLabels !== "none" && R >= 60 && !p.valueLabels) {
                ctx.font = "10px " + font; ctx.fillStyle = c.text; ctx.textBaseline = "middle";
                (p.ringLabels === "all" ? A.map((a, j) => j) : [0]).forEach((j) => {
                    const a = A[j];
                    for (let k = 1; k <= rings; k++) { const t = k / rings, v = a.better === "lower" ? a.max - t * (a.max - a.min) : a.min + t * (a.max - a.min), [x, y] = at(j, t); ctx.textAlign = "left"; ctx.fillText(this._fmt(a, v), x + 4, y - (j === 0 ? 0 : 6)); }
                });
            }
            // the target: a dashed polygon
            const tv = A.map((a) => this._targetOf(a, tgt));
            if (tv.some(Number.isFinite)) {
                ctx.strokeStyle = c.strong; ctx.lineWidth = 1.5; ctx.setLineDash(DASHES.dashed); ctx.beginPath();
                let first = true;
                for (let j = 0; j <= N; j++) { const v = tv[j % N]; if (!Number.isFinite(v)) { first = true; continue; } const [x, y] = at(j % N, this._t(A[j % N], v)); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
                ctx.stroke(); ctx.setLineDash([]);
            }
            // the series
            const hov = this._hover && this._hover.rd === this._radars.length - 1 ? this._hover : null;
            list.forEach((s) => {
                const col = this._colorOf(s), pts = A.map((a, j) => { const v = s.values.get(a.key); return Number.isFinite(v) ? at(j, this._t(a, v)) : null; });
                const path = () => {
                    ctx.beginPath();
                    const ok = pts.filter(Boolean);
                    if (p.lineStyle === "smooth" && ok.length === N) {
                        // a closed Catmull-Rom through the points
                        for (let j = 0; j < N; j++) {
                            const p0 = pts[(j - 1 + N) % N], p1 = pts[j], p2 = pts[(j + 1) % N], p3 = pts[(j + 2) % N];
                            if (!j) ctx.moveTo(p1[0], p1[1]);
                            ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
                        }
                    } else ok.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
                    ctx.closePath();
                };
                if (p.lineStyle !== "none") {
                    path();
                    ctx.fillStyle = this.hexToRgba(col, Math.max(0, Math.min(1, numOr(p.fillOpacity, 0.18)))); ctx.fill();
                    ctx.strokeStyle = col; ctx.lineWidth = numOr(p.lineWidth, 2); ctx.lineJoin = "round"; ctx.stroke();
                }
                pts.forEach((q, j) => {
                    if (!q) return;
                    const v = s.values.get(A[j].key), short = p.markShort !== false && this._short(A[j], tv[j], v);
                    if (p.markers !== false || short || (hov && hov.axis === j)) {
                        ctx.beginPath(); ctx.arc(q[0], q[1], short ? 4.5 : hov && hov.axis === j ? 4.5 : 3, 0, Math.PI * 2);
                        ctx.fillStyle = short ? this.statusColor("error") : col; ctx.fill(); ctx.strokeStyle = this._panelColor(); ctx.lineWidth = 1.2; ctx.stroke();
                    }
                    if (p.valueLabels) { ctx.font = "600 10px " + font; ctx.fillStyle = short ? this.statusColor("error") : this._colors().strong; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(this._fmt(A[j], v), q[0], q[1] - 5); }
                });
            });
            // the axis names (and the first series' value)
            if (p.axisLabels !== "none") {
                A.forEach((a, j) => {
                    const an = ang(j), x = cx + Math.cos(an) * (R + 8), y = cy + Math.sin(an) * (R + 8), cos = Math.cos(an), sin = Math.sin(an);
                    ctx.textAlign = Math.abs(cos) < 0.2 ? "center" : cos > 0 ? "left" : "right";
                    ctx.textBaseline = Math.abs(sin) < 0.2 ? "middle" : sin > 0 ? "top" : "bottom";
                    ctx.font = "600 " + ls + "px " + font; ctx.fillStyle = hov && hov.axis === j ? c.accent : c.strong;
                    const name = this._fitText(ctx, a.name, labW - 6);
                    if (p.axisLabels === "name-value" && list[0]) {
                        const v = list[0].values.get(a.key), dy = sin > 0.2 ? 0 : sin < -0.2 ? -(ls + 3) : -(ls + 3) / 2;
                        ctx.textBaseline = "top";
                        ctx.fillText(name, x, y + dy - (sin > 0.2 ? 0 : 0));
                        ctx.font = "500 " + ls + "px " + font; ctx.fillStyle = this._short(a, tv[j], v) ? this.statusColor("error") : c.text;
                        ctx.fillText(Number.isFinite(v) ? this._fmt(a, v) : "–", x, y + dy + ls + 2);
                    } else ctx.fillText(name, x, y);
                });
            }
        }

        _fitText(ctx, t, w) { if (ctx.measureText(t).width <= w) return t; let s = t; while (s.length > 1 && ctx.measureText(s + "…").width > w) s = s.slice(0, -1); return s + "…"; }
        _panelColor() { return getComputedStyle(this).getPropertyValue("--panel").trim() || "#ffffff"; }

        // ---- the pointer: the nearest axis of the radar under it ---------------------------------------
        _hit(e) {
            const pl = this._plotEl();
            if (!pl || !this._m) return null;
            const r = pl.getBoundingClientRect(), k = r.width / (pl.clientWidth || 1) || 1, x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
            for (let i = 0; i < this._radars.length; i++) {
                const rd = this._radars[i], dx = x - rd.cx, dy = y - rd.cy, d = Math.hypot(dx, dy);
                if (d > rd.R + 24) continue;
                const N = this._m.axes.length, a = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2), j = Math.round(a / (Math.PI * 2 / N)) % N;
                // the series whose point there is nearest the pointer
                let best = null, bd = Infinity;
                rd.list.forEach((s) => { const A = this._m.axes[j], v = s.values.get(A.key); if (!Number.isFinite(v)) return; const t = this._t(A, v), dd = Math.abs(d - t * rd.R); if (dd < bd) { bd = dd; best = s; } });
                return { rd: i, axis: j, series: best, x, y };
            }
            return null;
        }
        _move(e) {
            const h = this._hit(e), key = h ? h.rd + ":" + h.axis : "";
            if (key !== (this._hover ? this._hover.rd + ":" + this._hover.axis : "")) { this._hover = h; this.draw(); }
            const tip = this.renderRoot.querySelector(".sc-tip");
            if (!tip) return;
            if (!h || this.p.tooltip === false) { tip.style.display = "none"; return; }
            const A = this._m.axes[h.axis], rd = this._radars[h.rd], tv = this._targetOf(A, rd.tgt), esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
            tip.innerHTML = "<b>" + esc(A.name) + "</b>" + (A.better === "lower" ? " <span style='opacity:.6'>(lower is better)</span>" : "")
                + rd.list.map((s) => { const v = s.values.get(A.key), short = this._short(A, tv, v); return "<br><span style='color:" + this._colorOf(s) + "'>●</span> " + esc(s.name) + ": <b" + (short ? " style='color:" + this.statusColor("error") + "'" : "") + ">" + esc(Number.isFinite(v) ? this._fmt(A, v) : "–") + "</b>" + (Number.isFinite(tv) && Number.isFinite(v) ? " <span style='opacity:.6'>(" + (v - tv >= 0 ? "+" : "") + esc(this._fmt(A, v - tv)) + ")</span>" : ""); }).join("")
                + (Number.isFinite(tv) ? "<br><span style='opacity:.7'>Target " + esc(this._fmt(A, tv)) + "</span>" : "");
            tip.style.display = "block";
            const pl = this._plotEl();
            tip.style.left = Math.max(4, Math.min(pl.clientWidth - tip.offsetWidth - 4, h.x + 12)) + "px";
            tip.style.top = Math.max(4, h.y - tip.offsetHeight - 8) + "px";
        }
        _leave() { if (this._hover) { this._hover = null; this.draw(); } const t = this.renderRoot.querySelector(".sc-tip"); if (t) t.style.display = "none"; }
        _click(e) {
            const h = this._hit(e);
            if (!h || !h.series || this.isEditor) return;
            const A = this._m.axes[h.axis], v = h.series.values.get(A.key), tv = this._targetOf(A, this._radars[h.rd].tgt);
            this.emit("pointClick", { series: h.series.name, axis: A.name, value: v, percent: Math.round(this._t(A, v) * 1000) / 10, target: tv, short: this._short(A, tv, v) });
        }
        _toggle(key, ev) {
            const names = this._model().series.map((s) => s.name);
            if (ev && (ev.altKey || ev.metaKey)) { names.forEach((k) => { if (k !== key) this._hidden.add(k); }); this._hidden.delete(key); }
            else if (this._hidden.has(key)) this._hidden.delete(key); else this._hidden.add(key);
            if (!this.isEditor) this.emit("seriesToggle", { name: key, visible: !this._hidden.has(key) });
            this.draw(); this.requestUpdate();
        }

        exportData(params) {
            const o = this._exportOpts(params);
            if (o.format === "png") return this.exportPNG();
            const m = this._model(), head = ["Series"].concat(m.axes.map((a) => a.name + (a.unit ? " (" + a.unit + ")" : "")));
            const rows = m.series.map((s) => [s.name].concat(m.axes.map((a) => (Number.isFinite(s.values.get(a.key)) ? s.values.get(a.key) : ""))));
            const scale = m.axes.map((a) => [a.name, a.min, a.max, a.better, Number.isFinite(a.target) ? a.target : ""]);
            let blob;
            if (o.format === "xlsx") blob = xlsxBlob(head, rows, false, { timeCols: [], textCols: [0], sheets: [{ name: "Axes", header: ["Axis", "Min", "Max", "Better is", "Target"], rows: scale, timeCols: [], textCols: [0, 3] }] });
            else { const q = (x) => '"' + String(x).replace(/"/g, '""') + '"'; blob = new Blob(["﻿" + [head.map(q).join(",")].concat(rows.map((r) => r.map((x) => (typeof x === "number" ? String(x) : q(x))).join(","))).join("\r\n")], { type: "text/csv;charset=utf-8" }); }
            const name = this._getExportFileName(o.format, "all");
            this._download(blob, name);
            this._lastExport = { name, blob, rows: rows.length };
            return rows.length;
        }

        exportPNG() {
            const { w, h } = this._layoutSize();
            if (!(w > 0 && h > 0)) return Promise.resolve(null);
            const out = document.createElement("canvas"), S = 2;
            out.width = w * S; out.height = h * S;
            const ctx = out.getContext("2d");
            ctx.setTransform(S, 0, 0, S, 0, 0);
            ctx.fillStyle = this._backgroundColor() || this._panelColor(); ctx.fillRect(0, 0, w, h);
            const clear = this._clearCanvas;
            this._clearCanvas = () => {}; this._exporting = { png: true };
            try { this._drawInto(ctx, w, h); } finally { this._clearCanvas = clear; this._exporting = null; }
            return new Promise((resolve) => out.toBlob((blob) => { if (!blob) { resolve(null); return; } const name = this._getExportFileName("png", "all"); this._download(blob, name); this._lastExport = { name, blob, width: out.width }; resolve(this._lastExport); }, "image/png"));
        }

        render() {
            const p = this.p, bg = this._tok(p.background), m = this._model(), { at, inside } = legendPlace(p);
            const tgt = p.targetSeries ? m.series.find((s) => s.name === p.targetSeries) : null;
            const entries = m.series.filter((s) => s !== tgt).map((s) => ({ key: s.name, name: s.name, color: this._colorOf(s), off: this._hidden.has(s.name), swatch: "square" }));
            const legend = entries.length > 1 ? legendTemplate(p, entries, (e, ev) => this._toggle(e.key, ev), { stats: RD_STATS, head: "Series" }) : "";
            return html`
                <div class="rd-wrap ${p.border === false ? "borderless" : ""}" part="chart" style=${bg ? "background:" + bg : ""}>
                    ${p.title ? html`<div class="rd-head">${p.title}</div>` : ""}
                    ${at === "top" ? legend : ""}
                    <div class="c-main">
                        ${at === "left" ? legend : ""}
                        <div class="plot" @pointermove=${(e) => this._move(e)} @pointerleave=${() => this._leave()} @click=${(e) => this._click(e)}>
                            <canvas></canvas>
                            <div class="corner" style="right:8px">${this._renderMenu()}</div>
                            <div class="sc-tip"></div>
                            ${inside ? legend : ""}
                            ${this._renderSampleBadge(m.sample)}
                        </div>
                        ${at === "right" ? legend : ""}
                    </div>
                    ${at === "bottom" ? legend : ""}
                </div>`;
        }
    }
});
