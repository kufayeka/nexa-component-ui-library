// Nexa UI — Scatter: how two variables move together (a motor's power against its temperature, the oven's temperature
// against the reject rate, pressure against flow) and where the process window is.
//
// EVERY point is kept and drawn (Float64 arrays, no object per point): hundreds of thousands to millions, not a sample of
// 3 500 (Power BI) that may miss the outlier. Past a density limit the cloud is drawn as its DENSITY (a count per pixel
// cell) and the points in sparse cells, the outliers, still as points. A Shift+drag box selects every row inside it, not
// only what is drawn (On Select). A fit per group or for all: linear, a parabola, exponential, logarithmic, with its
// equation and R² (and a 95 % band for a line); reference lines / bands on either axis, quadrants (at the means or at set
// values) with their names, a group's ellipse or hull. Colour by group, by a value (a gradient) or by TIME (the old points
// fade into the new ones: a drifting process shows its trail). Data from rows (x, y, group, size, colour, label, time)
// over a window, or two live tags: a point each time they change.
import { html, css, formatValue } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, part, defineUI } from "../core.js";
import { ChartElement, chartCommon, opt, numOr, DASHES } from "./core.js";
import { exportProps } from "./props.js";
import { legendProps, legendTemplate, legendPlace, fillLegend } from "./legend.js";
import { niceTicks, logTicks } from "./stack.js";
import { toMs } from "./rows.js";
import { spanMs } from "./time.js";
import { fit, ellipse, hull } from "./fit.js";
import { xlsxBlob } from "./export.js";

const SC_STATS = [["count", "Points", "N"], ["r2", "R² of its fit", "R²"]];
const REF_FIELDS = {
    axis: { type: "enum", label: "On", default: "x", options: opt([["x", "The X axis (a vertical line)"], ["y", "The Y axis (a horizontal line)"]]) },
    kind: { type: "enum", label: "Kind", default: "line", options: opt([["line", "A line"], ["band", "A band (from Value to To)"]]) },
    value: { type: "number", label: "Value", default: 0 },
    to: { type: "number", label: "To", default: "", visibleWhen: (r) => r.kind === "band" },
    label: { type: "string", label: "Label", default: "" },
    color: { type: "color", label: "Colour", default: "", tokens: "colors", help: "Empty: the theme's status colour (a line: error; a band: success, the good window)." }
};

export const scatter = defineUI({
    ...chartCommon,
    id: PREFIX + "scatter",
    label: "Scatter",
    icon: "fa fa-braille",
    size: { w: 560, h: 340 },
    help: "Two variables together: every point (millions: a density with the outliers as points), a fit with its equation and R², quadrants, reference lines, colour by group / value / time, a box selects every row inside it. From rows or two live tags.",
    version: 1,

    groups: ["Data", "Points", "Density", "Fit", "Reference lines", "Quadrants", "Axes", "Legend", "General", "Export"],

    properties: {
        rows: { type: "json", group: "Data", label: "Rows", default: [], help: "[{ \"temp\": 182, \"reject\": 1.2, \"machine\": \"Oven 1\", \"time\": … }] from a query or a variable. Logic's Set rows / Append rows." },
        xField: { type: "string", group: "Data", label: "X field", default: "x", bindable: false },
        yField: { type: "string", group: "Data", label: "Y field", default: "y", bindable: false },
        groupField: { type: "string", group: "Data", label: "Group by (field)", default: "", bindable: false, help: "A colour (and a fit, a legend entry) per machine, shift, product." },
        sizeField: { type: "string", group: "Data", label: "Size by (field)", default: "", bindable: false, help: "A bubble chart: the point's area from this value." },
        colorField: { type: "string", group: "Data", label: "Colour value (field)", default: "", bindable: false, help: "For Colour by: A value (a gradient)." },
        labelField: { type: "string", group: "Data", label: "Label (field)", default: "", bindable: false, help: "In the tooltip (a batch, a serial number)." },
        timeField: { type: "string", group: "Data", label: "Time field", default: "", bindable: false, help: "For a window and for Colour by: Time." },
        window: { type: "enum", group: "Data", label: "Over", default: "", options: opt([["", "Every row"], ["1h", "The last hour"], ["8h", "The last 8 hours"], ["24h", "The last 24 hours"], ["7d", "The last 7 days"], ["30d", "The last 30 days"]]), visibleWhen: (p) => !!p.timeField },
        windowButtons: { type: "boolean", group: "Data", label: "Window buttons above the chart", default: false, visibleWhen: (p) => !!p.timeField },
        liveX: { type: "tag", access: "read", group: "Data", section: "Live", label: "Live X", help: "With Live Y: a point each time one of them changes (power and temperature of a motor, now)." },
        liveY: { type: "tag", access: "read", group: "Data", section: "Live", label: "Live Y" },
        liveName: { type: "string", group: "Data", section: "Live", label: "Their group", default: "Live" },
        maxPoints: { type: "number", group: "Data", section: "Live", label: "Points kept (live)", default: 100000, min: 100, max: 5000000, step: 1000 },

        colorBy: { type: "enum", group: "Points", label: "Colour by", default: "group", options: opt([["group", "The group (the palette)"], ["value", "A value (a gradient)"], ["time", "Time (old → new)"]]) },
        colorLow: { type: "color", group: "Points", label: "Gradient from", default: "", tokens: "colors", help: "Empty: the palette's first colour, faded.", visibleWhen: (p) => p.colorBy === "value" || p.colorBy === "time" },
        colorHigh: { type: "color", group: "Points", label: "Gradient to", default: "", tokens: "colors", help: "Empty: the palette's first colour.", visibleWhen: (p) => p.colorBy === "value" || p.colorBy === "time" },
        shape: { type: "enum", group: "Points", label: "Shape", default: "circle", options: opt([["circle", "Circle"], ["square", "Square"], ["triangle", "Triangle"], ["group", "One per group"]]) },
        pointSize: { type: "number", group: "Points", label: "Size", default: 4, min: 1, max: 20, step: 0.5, unit: "px" },
        sizeMin: { type: "number", group: "Points", label: "Bubble from", default: 3, min: 1, max: 40, unit: "px", visibleWhen: (p) => !!p.sizeField },
        sizeMax: { type: "number", group: "Points", label: "Bubble to", default: 14, min: 2, max: 80, unit: "px", visibleWhen: (p) => !!p.sizeField },
        opacity: { type: "number", group: "Points", label: "Opacity", default: 0.7, min: 0.05, max: 1, step: 0.05, help: "Lower: crowded points show their density." },
        newest: { type: "boolean", group: "Points", label: "Mark the newest point", default: true },

        density: { type: "enum", group: "Density", label: "A dense cloud as its density", default: "auto", options: opt([["auto", "Automatic (past the limit)"], ["on", "Always"], ["off", "Never (every point a dot)"]]) },
        densityLimit: { type: "number", group: "Density", label: "Limit (points)", default: 20000, min: 1000, max: 2000000, step: 1000, visibleWhen: (p) => p.density !== "off" && p.density !== "on" },
        outliers: { type: "boolean", group: "Density", label: "The sparse points (outliers) still as dots", default: true, visibleWhen: (p) => p.density !== "off" },

        fit: { type: "enum", group: "Fit", label: "A fit", default: "none", options: opt([["none", "None"], ["linear", "A line"], ["poly2", "A parabola (order 2)"], ["exp", "Exponential"], ["log", "Logarithmic"]]) },
        fitPer: { type: "enum", group: "Fit", label: "For", default: "group", options: opt([["group", "Each group"], ["all", "All the points"]]), visibleWhen: (p) => p.fit && p.fit !== "none" },
        fitEquation: { type: "boolean", group: "Fit", label: "Its equation and R²", default: true, visibleWhen: (p) => p.fit && p.fit !== "none" },
        fitBand: { type: "boolean", group: "Fit", label: "Its 95 % confidence band (a line)", default: false, visibleWhen: (p) => p.fit === "linear" },
        shapeAround: { type: "enum", group: "Fit", label: "Around each group", default: "none", options: opt([["none", "Nothing"], ["ellipse", "Its ellipse (2 σ)"], ["hull", "Its hull"]]) },

        references: { type: "list", group: "Reference lines", label: "Lines and bands", noun: "reference", default: [], help: "A spec limit on X or Y, a target, the good window (a band).", item: { fields: REF_FIELDS, noun: "reference" } },

        quadrants: { type: "enum", group: "Quadrants", label: "Quadrants", default: "none", options: opt([["none", "None"], ["mean", "At the means"], ["fixed", "At set values"]]) },
        quadX: { type: "number", group: "Quadrants", label: "Split X at", default: 0, visibleWhen: (p) => p.quadrants === "fixed" },
        quadY: { type: "number", group: "Quadrants", label: "Split Y at", default: 0, visibleWhen: (p) => p.quadrants === "fixed" },
        quadNames: { type: "string", group: "Quadrants", label: "Their names", default: "", help: "Top right, top left, bottom left, bottom right, comma separated (High temp / high reject, …).", visibleWhen: (p) => p.quadrants && p.quadrants !== "none" },

        xTitle: { type: "string", group: "Axes", label: "X title", default: "" },
        yTitle: { type: "string", group: "Axes", label: "Y title", default: "" },
        xLog: { type: "boolean", group: "Axes", label: "X logarithmic", default: false },
        yLog: { type: "boolean", group: "Axes", label: "Y logarithmic", default: false },
        xMin: { type: "number", group: "Axes", section: "Range", label: "X min", default: "" },
        xMax: { type: "number", group: "Axes", section: "Range", label: "X max", default: "" },
        yMin: { type: "number", group: "Axes", section: "Range", label: "Y min", default: "" },
        yMax: { type: "number", group: "Axes", section: "Range", label: "Y max", default: "" },
        xUnit: { type: "string", group: "Axes", label: "X unit", default: "" },
        yUnit: { type: "string", group: "Axes", label: "Y unit", default: "" },
        grid: { type: "boolean", group: "Axes", label: "Gridlines", default: true },

        ...legendProps({ at: "bottom", value: "none", stats: SC_STATS, what: "group" }),

        title: { type: "string", group: "General", label: "Title", default: "" },
        background: { type: "color", group: "General", label: "Background", default: "", tokens: "colors" },
        border: { type: "boolean", group: "General", label: "Border", default: true },
        tooltip: { type: "boolean", group: "General", label: "Tooltip", default: true },
        ...exportProps({ thresholds: false })
    },

    parts: { chart: part("Chart container", "chart"), legend: part("Legend", "legend") },

    events: {
        pointClick: { label: "On Point Click", payload: { x: "number", y: "number", group: "string", label: "string", index: "number", row: "object" }, help: "A click on a point: its row (drill down to the batch)." },
        select: { label: "On Select", payload: { count: "number", x0: "number", x1: "number", y0: "number", y1: "number", rows: "array" }, help: "Shift + drag a box: EVERY row inside it (not only the ones drawn), the first 1 000 in rows." }
    },
    actions: {
        setRows: { label: "Set rows", example: "[{ \"x\": 182, \"y\": 1.2, \"group\": \"Oven 1\" }, …]" },
        appendRows: { label: "Append rows", example: "{ \"x\": 183, \"y\": 1.4 }  or  [ … ]" },
        setWindow: { label: "Set the window", params: { window: "string" }, example: "{ \"window\": \"24h\" }" },
        resetZoom: { label: "Reset the zoom" },
        clearAll: { label: "Clear" },
        exportData: { label: "Export (download)", params: { format: "string" }, example: "{ \"format\": \"xlsx\" }  (csv | xlsx | png)" }
    },

    view: class extends ChartElement {
        static styles = [...ChartElement.styles, css`
            .sc-wrap { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden;
                border-radius: var(--r, 4px); background: var(--panel, #181b1f); border: 1px solid var(--bd, #2c3235); }
            .sc-wrap.borderless { border-color: transparent; }
            .sc-head { flex: 0 0 auto; padding: 10px 14px 0; font-size: 14px; font-weight: 600; color: var(--fg); }
            .sc-wrap .plot { cursor: crosshair; touch-action: pan-x pan-y; }
            .sc-wrap .plot.panning { cursor: grabbing; }
            .sc-tip { position: absolute; pointer-events: none; z-index: 6; display: none; padding: 6px 9px; border-radius: 4px; background: var(--panel, #181b1f); border: 1px solid var(--bd, #2c3235);
                color: var(--fg, #fff); font: 12px/1.45 var(--nexa-fonts-body, sans-serif); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); white-space: nowrap; }
            .zoom-chip { position: absolute; right: 34px; top: 6px; z-index: 5; }
        `];

        // ---- state (declared: the host calls propsChanged() during the base constructor)
        _d = null;              // { n, x, y, s, c, t, g, row: Int32Array, groups: [name], rows }
        _sig = "";
        _rowsData = null;
        _live = null;           // live points: { n, x, y, t }
        _lastLive = [undefined, undefined];
        _win = null;
        _view = null;           // zoom: { x0, x1, y0, y1 } (null: everything)
        _geo = null;
        _hover = -1;
        _drag = null;
        _hidden = new Set();

        propsChanged() { this._takeLive(); }

        // ---- data ---------------------------------------------------------------------------------
        _rows() { const r = this._rowsData || this.p.rows; return Array.isArray(r) ? r : []; }
        _editor() { return !!(this._ctx && this._ctx.mode === "editor"); }
        _sample() { return this._editor() && !this._rows().length && !(this._live && this._live.n); }
        _hasData() { return !!(this._rows().length || (this._live && this._live.n)); }

        setRows(params) { const r = Array.isArray(params) ? params : params && Array.isArray(params.rows) ? params.rows : null; if (r) { this._rowsData = r.slice(); this._sig = ""; this.scheduleDraw(); this.requestUpdate(); } }
        appendRows(params) {
            const add = Array.isArray(params) ? params : params && typeof params === "object" ? [params] : [];
            this._rowsData = (this._rowsData || this._rows().slice()).concat(add);
            this._sig = ""; this.scheduleDraw(); this.requestUpdate();
        }
        setWindow(params) { this._win = String(params && typeof params === "object" ? params.window || "" : params || ""); this.scheduleDraw(); this.requestUpdate(); }
        resetZoom() { this._view = null; this.scheduleDraw(); this.requestUpdate(); }
        clearAll() { this._rowsData = []; this._live = null; this._sig = ""; this._view = null; this.scheduleDraw(); this.requestUpdate(); }
        _window() { return this._win !== null ? this._win : this.p.window || ""; }

        // two live tags: a point each time one of them changes (both known)
        _takeLive() {
            const p = this.p || {}, blank = (v) => v === "" || v === null || v === undefined || typeof v === "object" || typeof v === "boolean";
            if (blank(p.liveX) || blank(p.liveY)) return;
            const lx = Number(p.liveX), ly = Number(p.liveY);
            if (!Number.isFinite(lx) || !Number.isFinite(ly) || typeof p.liveX === "object" || typeof p.liveY === "object") return;
            if (lx === this._lastLive[0] && ly === this._lastLive[1]) return;
            this._lastLive = [lx, ly];
            const cap = Math.max(100, numOr(p.maxPoints, 100000));
            let L = this._live;
            if (!L) L = this._live = { n: 0, x: new Float64Array(1024), y: new Float64Array(1024), t: new Float64Array(1024) };
            if (L.n >= cap) { const k = Math.floor(cap / 10); L.x.copyWithin(0, k, L.n); L.y.copyWithin(0, k, L.n); L.t.copyWithin(0, k, L.n); L.n -= k; }
            if (L.n >= L.x.length) { const grow = (a) => { const b = new Float64Array(Math.min(cap, a.length * 2)); b.set(a); return b; }; L.x = grow(L.x); L.y = grow(L.y); L.t = grow(L.t); }
            L.x[L.n] = lx; L.y[L.n] = ly; L.t[L.n] = Date.now(); L.n++;
            this._sig = ""; this.scheduleDraw();
        }

        // rows -> typed arrays (rebuilt when the rows or the fields change); the live points as their own group
        _data() {
            const p = this.p, rows = this._sample() ? this._sampleRows() : this._rows();
            const sample = this._sample();
            const sig = (rows.length + "|" + (rows[0] ? JSON.stringify(rows[0]) : "") + "|" + (rows.length ? JSON.stringify(rows[rows.length - 1]) : "")) + [p.xField, p.yField, p.groupField, p.sizeField, p.colorField, p.timeField, p.labelField, this._live ? this._live.n : 0, sample].join("|");
            if (this._d && this._sig === sig) return this._d;
            const L = this._live, n = rows.length + (L ? L.n : 0);
            const xf = sample ? "x" : p.xField || "x", yf = sample ? "y" : p.yField || "y", gf = sample ? "g" : p.groupField, sf = p.sizeField, cf = p.colorField, tf = p.timeField;
            const d = { n: 0, x: new Float64Array(n), y: new Float64Array(n), s: sf ? new Float64Array(n) : null, c: cf ? new Float64Array(n) : null, t: new Float64Array(n).fill(NaN), g: new Uint16Array(n), row: new Int32Array(n), groups: [], rows };
            const gi = new Map(), groupOf = (name) => { let k = gi.get(name); if (k === undefined) { k = d.groups.length; d.groups.push(name); gi.set(name, k); } return k; };
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                if (!r || typeof r !== "object") continue;
                const x = Number(r[xf]), y = Number(r[yf]);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                const k = d.n++;
                d.x[k] = x; d.y[k] = y; d.row[k] = i;
                d.g[k] = groupOf(gf ? String(r[gf] === undefined || r[gf] === null ? "" : r[gf]) : "");
                if (d.s) d.s[k] = Number(r[sf]);
                if (d.c) d.c[k] = Number(r[cf]);
                if (tf) d.t[k] = toMs(r[tf]);
            }
            if (L) for (let i = 0; i < L.n; i++) { const k = d.n++; d.x[k] = L.x[i]; d.y[k] = L.y[i]; d.t[k] = L.t[i]; d.row[k] = -1; d.g[k] = groupOf(p.liveName || "Live"); if (d.s) d.s[k] = NaN; if (d.c) d.c[k] = NaN; }
            this._sig = sig;
            return (this._d = d);
        }

        // the editor's sample (decoration, never data): two clouds with a trend
        _sampleRows() {
            if (this._sampleCache) return this._sampleCache;
            let seed = 7;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
            const out = [];
            ["Line A", "Line B"].forEach((g, k) => { for (let i = 0; i < 120; i++) { const x = 160 + rnd() * 40; out.push({ x: Math.round(x * 10) / 10, y: Math.round(((x - 160) * (0.05 + k * 0.03) + 0.4 + (rnd() - 0.5) * 0.8) * 100) / 100, g }); } });
            return (this._sampleCache = out);
        }

        // the indices drawn: in the window, not hidden
        _shown(d) {
            const ms = spanMs(this._window()), from = this.p.timeField && ms > 0 ? Date.now() - ms : -Infinity;
            const hidden = this._hidden, out = new Int32Array(d.n);
            let k = 0;
            for (let i = 0; i < d.n; i++) { if (from > -Infinity && !(d.t[i] >= from)) continue; if (hidden.size && hidden.has(d.groups[d.g[i]])) continue; out[k++] = i; }
            return out.subarray(0, k);
        }

        // ---- colours --------------------------------------------------------------------------------
        _rgb(col) { const m = /rgba?\(([^)]+)\)/.exec(this.hexToRgba(col, 1)); return m ? m[1].split(",").slice(0, 3).map(Number) : [0, 0, 0]; }
        _gradient() {
            const hi = this._tok(this.p.colorHigh) || this.seriesColor(0), lo = this._tok(this.p.colorLow) || this.hexToRgba(hi, 0.15);
            return [this._rgb(lo), this._rgb(hi), this._tok(this.p.colorLow) ? 1 : 0.15];
        }

        // ---- the drawing --------------------------------------------------------------------------
        draw() {
            if (!this.ctx || !this.canvas) return;
            const { w, h } = this._layoutSize();
            if (w > 0 && h > 0) this._drawInto(this.ctx, w, h);
        }

        _drawInto(ctx, w, h) {
            this._clearCanvas(ctx, w, h);
            const p = this.p, c = this._colors(), font = c.font, fs = 11, d = this._data(), idx = this._shown(d);
            this._geo = null;
            if (!idx.length) return;
            // the ranges (the zoom wins; fixed min / max next; else the data's)
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
            for (const i of idx) { const x = d.x[i], y = d.y[i]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            const refs = (Array.isArray(p.references) ? p.references : []).filter((r) => r && Number.isFinite(numOr(r.value, NaN)));
            refs.forEach((r) => { const v = numOr(r.value, NaN), t = numOr(r.to, NaN); if (r.axis === "y") { y0 = Math.min(y0, v, Number.isFinite(t) ? t : v); y1 = Math.max(y1, v, Number.isFinite(t) ? t : v); } else { x0 = Math.min(x0, v, Number.isFinite(t) ? t : v); x1 = Math.max(x1, v, Number.isFinite(t) ? t : v); } });
            const padx = (x1 - x0) * 0.05 || Math.abs(x0) * 0.1 || 1, pady = (y1 - y0) * 0.08 || Math.abs(y0) * 0.1 || 1;
            if (!p.xLog) { x0 -= padx; x1 += padx; }
            if (!p.yLog) { y0 -= pady; y1 += pady; }
            const fx = (k, v) => (Number.isFinite(numOr(p[k], NaN)) ? numOr(p[k], NaN) : v);
            x0 = fx("xMin", x0); x1 = fx("xMax", x1); y0 = fx("yMin", y0); y1 = fx("yMax", y1);
            if (this._view) ({ x0, x1, y0, y1 } = this._view);
            const xt = p.xLog ? logTicks(Math.max(x0, 1e-9), Math.max(x1, 1e-8)) : niceTicks(x0, x1, Math.max(3, Math.floor(w / 90))).ticks.filter((v) => v >= x0 && v <= x1);
            const yt = p.yLog ? logTicks(Math.max(y0, 1e-9), Math.max(y1, 1e-8)) : niceTicks(y0, y1, Math.max(3, Math.floor(h / 55))).ticks.filter((v) => v >= y0 && v <= y1);
            const fmtX = (v) => formatValue(v, { decimals: "auto" }, ""), fmtY = fmtX;
            ctx.font = fs + "px " + font;
            const yw = Math.max(...yt.map((v) => ctx.measureText(fmtY(v)).width), 10);
            const px = 10 + yw + (p.yTitle ? fs + 8 : 0), py = this.p.exportButton !== false ? 26 : 10, pw = Math.max(20, w - px - 14), ph = Math.max(20, h - py - fs - 14 - (p.xTitle ? fs + 6 : 0));
            const lx0 = p.xLog ? Math.log10(Math.max(x0, 1e-9)) : x0, lx1 = p.xLog ? Math.log10(Math.max(x1, 1e-8)) : x1, ly0 = p.yLog ? Math.log10(Math.max(y0, 1e-9)) : y0, ly1 = p.yLog ? Math.log10(Math.max(y1, 1e-8)) : y1;
            const X = (v) => px + (((p.xLog ? Math.log10(Math.max(v, 1e-9)) : v) - lx0) / (lx1 - lx0 || 1)) * pw;
            const Y = (v) => py + ph - (((p.yLog ? Math.log10(Math.max(v, 1e-9)) : v) - ly0) / (ly1 - ly0 || 1)) * ph;
            const invX = (sx) => { const v = lx0 + ((sx - px) / pw) * (lx1 - lx0); return p.xLog ? Math.pow(10, v) : v; }, invY = (sy) => { const v = ly0 + ((py + ph - sy) / ph) * (ly1 - ly0); return p.yLog ? Math.pow(10, v) : v; };
            this._geo = { px, py, pw, ph, X, Y, invX, invY, x0, x1, y0, y1, idx, d };
            // the grid, the labels, the titles
            ctx.save();
            ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.fillStyle = c.text; ctx.font = fs + "px " + font;
            xt.forEach((v) => { const sx = Math.round(X(v)) + 0.5; if (p.grid !== false) { ctx.beginPath(); ctx.moveTo(sx, py); ctx.lineTo(sx, py + ph); ctx.stroke(); } ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(fmtX(v), sx, py + ph + 4); });
            yt.forEach((v) => { const sy = Math.round(Y(v)) + 0.5; if (p.grid !== false) { ctx.beginPath(); ctx.moveTo(px, sy); ctx.lineTo(px + pw, sy); ctx.stroke(); } ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(fmtY(v), px - 6, sy); });
            ctx.font = "600 " + fs + "px " + font;
            if (p.xTitle) { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(p.xTitle + (p.xUnit ? " (" + p.xUnit + ")" : ""), px + pw / 2, h - 2); }
            if (p.yTitle) { ctx.save(); ctx.translate(10, py + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(p.yTitle + (p.yUnit ? " (" + p.yUnit + ")" : ""), 0, 0); ctx.restore(); }
            ctx.restore();
            ctx.save();
            ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
            // the quadrants
            let qx = NaN, qy = NaN;
            if (p.quadrants === "mean") { let sx = 0, sy = 0; for (const i of idx) { sx += d.x[i]; sy += d.y[i]; } qx = sx / idx.length; qy = sy / idx.length; }
            else if (p.quadrants === "fixed") { qx = numOr(p.quadX, NaN); qy = numOr(p.quadY, NaN); }
            if (Number.isFinite(qx) && Number.isFinite(qy)) {
                ctx.strokeStyle = this.hexToRgba(c.strong, 0.5); ctx.setLineDash(DASHES.dashed); ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(X(qx), py); ctx.lineTo(X(qx), py + ph); ctx.moveTo(px, Y(qy)); ctx.lineTo(px + pw, Y(qy)); ctx.stroke(); ctx.setLineDash([]);
                const names = String(p.quadNames || "").split(",").map((s) => s.trim());
                ctx.font = "600 " + fs + "px " + font; ctx.fillStyle = this.hexToRgba(c.strong, 0.55);
                [[px + pw - 6, py + 4, "right", "top"], [px + 6, py + 4, "left", "top"], [px + 6, py + ph - 4, "left", "bottom"], [px + pw - 6, py + ph - 4, "right", "bottom"]].forEach(([tx, ty, al, bl], k) => { if (names[k]) { ctx.textAlign = al; ctx.textBaseline = bl; ctx.fillText(names[k], tx, ty); } });
            }
            // the reference bands and lines
            refs.forEach((r) => {
                const v = numOr(r.value, NaN), t = numOr(r.to, NaN), band = r.kind === "band" && Number.isFinite(t);
                const col = this._tok(r.color) || this.statusColor(band ? "success" : "error");
                if (band) { ctx.fillStyle = this.hexToRgba(col, 0.12); if (r.axis === "y") ctx.fillRect(px, Math.min(Y(v), Y(t)), pw, Math.abs(Y(t) - Y(v))); else ctx.fillRect(Math.min(X(v), X(t)), py, Math.abs(X(t) - X(v)), ph); }
                else { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash(DASHES.dashed); ctx.beginPath(); if (r.axis === "y") { ctx.moveTo(px, Y(v)); ctx.lineTo(px + pw, Y(v)); } else { ctx.moveTo(X(v), py); ctx.lineTo(X(v), py + ph); } ctx.stroke(); ctx.setLineDash([]); }
                if (r.label) { ctx.font = fs + "px " + font; ctx.fillStyle = col; ctx.textAlign = r.axis === "y" ? "right" : "left"; ctx.textBaseline = "top"; ctx.fillText(r.label, r.axis === "y" ? px + pw - 4 : X(v) + 4, r.axis === "y" ? Math.min(Y(v), band ? Y(t) : Y(v)) + 3 : py + 4); }
            });
            // the points: every one, or the density with the outliers as points
            const many = p.density === "on" || (p.density !== "off" && idx.length > numOr(p.densityLimit, 20000));
            this._drawPoints(ctx, d, idx, X, Y, many, { px, py, pw, ph });
            // around each group, the fits
            this._fits = this._drawFits(ctx, d, idx, X, Y, invX, { px, py, pw, ph, font, fs, c });
            // the hovered point, the newest, the selection box
            if (this._hover >= 0 && this._hover < d.n) { const i = this._hover; ctx.strokeStyle = c.strong; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(d.x[i]), Y(d.y[i]), this._sizeOf(d, i) + 3, 0, Math.PI * 2); ctx.stroke(); }
            if (p.newest !== false && (this._live && this._live.n)) { const i = d.n - 1; ctx.fillStyle = this.statusColor("error"); ctx.beginPath(); ctx.arc(X(d.x[i]), Y(d.y[i]), 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = this._panel(); ctx.lineWidth = 1.5; ctx.stroke(); }
            if (this._drag && this._drag.kind === "box" && this._drag.moved) { const b = this._drag; ctx.fillStyle = this.hexToRgba(c.accent, 0.12); ctx.strokeStyle = c.accent; ctx.lineWidth = 1; ctx.fillRect(Math.min(b.ax, b.bx), Math.min(b.ay, b.by), Math.abs(b.bx - b.ax), Math.abs(b.by - b.ay)); ctx.strokeRect(Math.min(b.ax, b.bx) + 0.5, Math.min(b.ay, b.by) + 0.5, Math.abs(b.bx - b.ax), Math.abs(b.by - b.ay)); }
            ctx.restore();
            if (!this._exporting) {
                const counts = new Map();
                for (const i of idx) { const g = d.groups[d.g[i]]; counts.set(g, (counts.get(g) || 0) + 1); }
                fillLegend(this.renderRoot, (key, k) => (k === "count" ? String(counts.get(key) || 0) : (this._fits || []).filter((f) => f.group === key).map((f) => formatValue(f.r2, { decimals: "3" }, "")).join("") || ""));
            }
        }

        _panel() { return getComputedStyle(this).getPropertyValue("--panel").trim() || "#ffffff"; }

        _sizeRange(d) {
            if (!d.s) return null;
            if (this._sr && this._sr.d === d) return this._sr;
            let lo = Infinity, hi = -Infinity;
            for (let i = 0; i < d.n; i++) { const v = d.s[i]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
            return (this._sr = { d, lo, hi });
        }
        _sizeOf(d, i) {
            const p = this.p, r = this._sizeRange(d);
            if (!r || !(d.s[i] === d.s[i]) || !(r.hi > r.lo)) return numOr(p.pointSize, 4);
            const a = numOr(p.sizeMin, 3), b = numOr(p.sizeMax, 18), k = Math.sqrt((d.s[i] - r.lo) / (r.hi - r.lo));
            return a + (b - a) * k;
        }

        // the points: a colour per group / a gradient by value or time; past the limit a density raster + the sparse ones
        _drawPoints(ctx, d, idx, X, Y, dense, box) {
            const p = this.p, op = Math.max(0.05, Math.min(1, numOr(p.opacity, 0.7))), by = p.colorBy || "group";
            const groupCol = d.groups.map((g, k) => this.seriesColor(k));
            let lo = Infinity, hi = -Infinity;
            const src = by === "value" ? d.c : by === "time" ? d.t : null;
            if (src) for (const i of idx) { const v = src[i]; if (v === v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
            const [ga, gb, ga0] = this._gradient();
            const colorOf = (i) => {
                if (!src || !(hi > lo) || !(src[i] === src[i])) return groupCol[d.g[i]];
                const k = (src[i] - lo) / (hi - lo);
                return "rgba(" + Math.round(ga[0] + (gb[0] - ga[0]) * k) + "," + Math.round(ga[1] + (gb[1] - ga[1]) * k) + "," + Math.round(ga[2] + (gb[2] - ga[2]) * k) + "," + (ga0 + (1 - ga0) * k) + ")";
            };
            this._colorOf = colorOf;
            const shapes = ["circle", "square", "triangle"];
            const dot = (i, r, col) => {
                const x = X(d.x[i]), y = Y(d.y[i]), sh = p.shape === "group" ? shapes[d.g[i] % 3] : p.shape || "circle";
                ctx.fillStyle = col;
                if (sh === "square") ctx.fillRect(x - r, y - r, r * 2, r * 2);
                else if (sh === "triangle") { ctx.beginPath(); ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.1, y + r * 0.8); ctx.lineTo(x - r * 1.1, y + r * 0.8); ctx.closePath(); ctx.fill(); }
                else if (r <= 1.5) ctx.fillRect(x - r, y - r, r * 2, r * 2);
                else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
            };
            if (!dense) {
                ctx.globalAlpha = op;
                for (const i of idx) dot(i, this._sizeOf(d, i), colorOf(i));
                ctx.globalAlpha = 1;
                this._dense = false;
                return;
            }
            // a count per 2 px cell -> an image (the theme's first chart colour, its opacity by the log of the count)
            const cs = 2, gw = Math.ceil(box.pw / cs), gh = Math.ceil(box.ph / cs), grid = new Uint32Array(gw * gh);
            let max = 0;
            for (const i of idx) {
                const cx = Math.floor((X(d.x[i]) - box.px) / cs), cy = Math.floor((Y(d.y[i]) - box.py) / cs);
                if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue;
                const v = ++grid[cy * gw + cx]; if (v > max) max = v;
            }
            const col = this._rgb(this._tok(p.colorHigh) || this.seriesColor(0)), img = ctx.createImageData(gw, gh), lm = Math.log(max + 1);
            for (let k = 0; k < grid.length; k++) {
                const v = grid[k];
                if (!v) continue;
                const a = 0.15 + 0.85 * (Math.log(v + 1) / lm), o = k * 4;
                img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = Math.round(a * 255);
            }
            const tmp = document.createElement("canvas");
            tmp.width = gw; tmp.height = gh;
            tmp.getContext("2d").putImageData(img, 0, 0);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(tmp, box.px, box.py, gw * cs, gh * cs);
            ctx.imageSmoothingEnabled = true;
            // the outliers: points with (almost) nothing within ~10 px (the 5 × 5 cells around them), not the cloud's rim
            const lonely = (cx, cy) => {
                let sum = 0;
                for (let yy = Math.max(0, cy - 2); yy <= Math.min(gh - 1, cy + 2); yy++) for (let xx = Math.max(0, cx - 2); xx <= Math.min(gw - 1, cx + 2); xx++) { sum += grid[yy * gw + xx]; if (sum > 2) return false; }
                return true;
            };
            if (p.outliers !== false) {
                ctx.globalAlpha = 1;
                for (const i of idx) {
                    const cx = Math.floor((X(d.x[i]) - box.px) / cs), cy = Math.floor((Y(d.y[i]) - box.py) / cs);
                    if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue;
                    if (grid[cy * gw + cx] <= 2 && max > 8 && lonely(cx, cy)) dot(i, Math.max(2, numOr(p.pointSize, 4) * 0.7), colorOf(i));
                }
            }
            this._dense = true;
        }

        // the fits (per group or all) with their equations, a band; the ellipses / hulls
        _drawFits(ctx, d, idx, X, Y, invX, g) {
            const p = this.p, out = [];
            const byGroup = new Map();
            for (const i of idx) { const k = d.g[i]; if (!byGroup.has(k)) byGroup.set(k, []); byGroup.get(k).push(i); }
            if (p.shapeAround && p.shapeAround !== "none") {
                byGroup.forEach((list, k) => {
                    const col = this.seriesColor(k), sample = list.length > 20000 ? list.filter((_, j) => j % Math.ceil(list.length / 20000) === 0) : list;
                    ctx.strokeStyle = col; ctx.fillStyle = this.hexToRgba(col, 0.06); ctx.lineWidth = 1.5;
                    if (p.shapeAround === "ellipse") {
                        const e = ellipse(d.x, d.y, sample);
                        if (!e) return;
                        // drawn through points of the data-space ellipse (axes may differ in scale)
                        ctx.beginPath();
                        for (let a = 0; a <= 64; a++) { const t = (a / 64) * Math.PI * 2, ex = e.cx + e.rx * Math.cos(t) * Math.cos(e.angle) - e.ry * Math.sin(t) * Math.sin(e.angle), ey = e.cy + e.rx * Math.cos(t) * Math.sin(e.angle) + e.ry * Math.sin(t) * Math.cos(e.angle); if (a) ctx.lineTo(X(ex), Y(ey)); else ctx.moveTo(X(ex), Y(ey)); }
                        ctx.closePath(); ctx.fill(); ctx.stroke();
                    } else {
                        const hl = hull(d.x, d.y, sample);
                        if (hl.length < 3) return;
                        ctx.beginPath(); hl.forEach(([hx, hy], j) => (j ? ctx.lineTo(X(hx), Y(hy)) : ctx.moveTo(X(hx), Y(hy)))); ctx.closePath(); ctx.fill(); ctx.stroke();
                    }
                });
            }
            if (!p.fit || p.fit === "none") return out;
            const sets = p.fitPer === "all" ? [[-1, Array.from(idx)]] : Array.from(byGroup.entries());
            let row = 0;
            sets.forEach(([k, list]) => {
                const xs = new Float64Array(list.length), ys = new Float64Array(list.length);
                list.forEach((i, j) => { xs[j] = d.x[i]; ys[j] = d.y[i]; });
                const F = fit(xs, ys, list.length, p.fit);
                if (!F) return;
                const col = k < 0 ? g.c.strong : this.seriesColor(k), name = k < 0 ? "" : d.groups[k];
                out.push({ group: name, model: F.model, coef: F.coef, r2: F.r2, text: F.text, n: F.n });
                const steps = 80;
                if (F.band && p.fitBand) {
                    ctx.fillStyle = this.hexToRgba(col, 0.12); ctx.beginPath();
                    for (let s = 0; s <= steps; s++) { const sx = g.px + (s / steps) * g.pw, x = invX(sx), v = F.f(x) + F.band(x); if (s) ctx.lineTo(sx, Y(v)); else ctx.moveTo(sx, Y(v)); }
                    for (let s = steps; s >= 0; s--) { const sx = g.px + (s / steps) * g.pw, x = invX(sx); ctx.lineTo(sx, Y(F.f(x) - F.band(x))); }
                    ctx.closePath(); ctx.fill();
                }
                ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(k < 0 ? [] : [6, 3]); ctx.beginPath();
                let on = false;
                for (let s = 0; s <= steps; s++) { const sx = g.px + (s / steps) * g.pw, v = F.f(invX(sx)); if (!Number.isFinite(v)) { on = false; continue; } if (on) ctx.lineTo(sx, Y(v)); else { ctx.moveTo(sx, Y(v)); on = true; } }
                ctx.stroke(); ctx.setLineDash([]);
                if (p.fitEquation !== false) {
                    const text = (name ? name + ": " : "") + F.text + "   R² = " + formatValue(F.r2, { decimals: "3" }, "");
                    ctx.font = "600 " + g.fs + "px " + g.font; ctx.textAlign = "left"; ctx.textBaseline = "top";
                    const tw = ctx.measureText(text).width;
                    // the theme's text (readable on any background), a swatch in the group's colour
                    const ty = g.py + 6 + row * (g.fs + 6);
                    ctx.fillStyle = this.hexToRgba(this._panel(), 0.85); ctx.fillRect(g.px + 6, ty, tw + 22, g.fs + 4);
                    ctx.fillStyle = col; ctx.fillRect(g.px + 10, ty + (g.fs + 4) / 2 - 1.5, 10, 3);
                    ctx.fillStyle = g.c.strong; ctx.fillText(text, g.px + 24, ty + 2);
                    row++;
                }
            });
            return out;
        }

        // ---- the pointer: hover, click, Shift+drag a box (select), drag (pan), Ctrl+wheel (zoom), double click (reset) ------
        _local(e) { const plot = this._plotEl(), r = plot.getBoundingClientRect(), k = r.width / (plot.clientWidth || 1) || 1; return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; }
        _nearest(L) {
            const g = this._geo;
            if (!g) return -1;
            let best = -1, bd = 12 * 12;
            for (const i of g.idx) { const dx = g.X(g.d.x[i]) - L.x, dy = g.Y(g.d.y[i]) - L.y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = i; } }
            return best;
        }
        _down(e) {
            if (e.button !== 0 || !this._geo) return;
            const L = this._local(e);
            this._drag = { kind: e.shiftKey ? "box" : "pan", ax: L.x, ay: L.y, bx: L.x, by: L.y, view: this._view || { x0: this._geo.x0, x1: this._geo.x1, y0: this._geo.y0, y1: this._geo.y1 }, moved: false };
            try { e.target.setPointerCapture(e.pointerId); } catch (_) { }
        }
        _move(e) {
            const L = this._local(e), dr = this._drag, g = this._geo;
            if (dr && g) {
                dr.bx = L.x; dr.by = L.y;
                if (Math.hypot(dr.bx - dr.ax, dr.by - dr.ay) > 3) dr.moved = true;
                if (dr.moved && dr.kind === "pan" && !this.p.xLog && !this.p.yLog) {
                    const dx = ((dr.bx - dr.ax) / g.pw) * (dr.view.x1 - dr.view.x0), dy = ((dr.by - dr.ay) / g.ph) * (dr.view.y1 - dr.view.y0);
                    this._view = { x0: dr.view.x0 - dx, x1: dr.view.x1 - dx, y0: dr.view.y0 + dy, y1: dr.view.y1 + dy };
                    this._plotEl().classList.add("panning");
                }
                this.draw();
                return;
            }
            const i = this._nearest(L);
            if (i !== this._hover) { this._hover = i; this.draw(); }
            this._tip(e, i);
        }
        _up(e) {
            const dr = this._drag, g = this._geo;
            this._drag = null;
            const plot = this._plotEl();
            if (plot) plot.classList.remove("panning");
            if (!dr || !g) return;
            if (dr.kind === "box" && dr.moved) {
                // every row inside the box (not only the drawn ones)
                const xa = g.invX(Math.min(dr.ax, dr.bx)), xb = g.invX(Math.max(dr.ax, dr.bx)), ya = g.invY(Math.max(dr.ay, dr.by)), yb = g.invY(Math.min(dr.ay, dr.by));
                const d = g.d, rows = [];
                let count = 0;
                for (const i of g.idx) { const x = d.x[i], y = d.y[i]; if (x >= xa && x <= xb && y >= ya && y <= yb) { count++; if (rows.length < 1000) rows.push(d.row[i] >= 0 ? d.rows[d.row[i]] : { x, y, group: d.groups[d.g[i]], time: d.t[i] }); } }
                this._lastSelect = { count, x0: xa, x1: xb, y0: ya, y1: yb, rows };
                if (!this.isEditor) this.emit("select", this._lastSelect);
                this.draw();
                return;
            }
            if (dr.moved) { this.requestUpdate(); return; }
            // a click: the point there
            const i = this._nearest(this._local(e));
            if (i >= 0 && !this.isEditor) {
                const d = g.d;
                this.emit("pointClick", { x: d.x[i], y: d.y[i], group: d.groups[d.g[i]], label: this._labelOf(d, i), index: d.row[i], row: d.row[i] >= 0 ? d.rows[d.row[i]] : null });
            }
        }
        _wheel(e) {
            if (!e.ctrlKey && !e.metaKey) return;   // page first: a plain wheel scrolls the page
            const g = this._geo;
            if (!g || this.p.xLog || this.p.yLog) return;
            e.preventDefault();
            const L = this._local(e), k = e.deltaY < 0 ? 0.8 : 1.25, cx = g.invX(L.x), cy = g.invY(L.y), v = this._view || { x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1 };
            this._view = { x0: cx - (cx - v.x0) * k, x1: cx + (v.x1 - cx) * k, y0: cy - (cy - v.y0) * k, y1: cy + (v.y1 - cy) * k };
            this.draw(); this.requestUpdate();
        }
        _leave() { if (this._hover >= 0) { this._hover = -1; this.draw(); } const t = this.renderRoot.querySelector(".sc-tip"); if (t) t.style.display = "none"; }

        _labelOf(d, i) { const lf = this.p.labelField; return lf && d.row[i] >= 0 && d.rows[d.row[i]] ? String(d.rows[d.row[i]][lf] === undefined ? "" : d.rows[d.row[i]][lf]) : ""; }
        _tip(e, i) {
            const tip = this.renderRoot.querySelector(".sc-tip");
            if (!tip) return;
            if (i < 0 || this.p.tooltip === false) { tip.style.display = "none"; return; }
            const d = this._geo.d, p = this.p, esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
            const lab = this._labelOf(d, i), grp = d.groups[d.g[i]];
            const time = d.t[i] === d.t[i] ? new Date(d.t[i]).toLocaleString() : "";
            tip.innerHTML = (lab ? "<b>" + esc(lab) + "</b><br>" : grp ? "<b>" + esc(grp) + "</b><br>" : "") + esc((p.xTitle || "X") + ": " + formatValue(d.x[i], { decimals: "auto" }, p.xUnit || "")) + "<br>" + esc((p.yTitle || "Y") + ": " + formatValue(d.y[i], { decimals: "auto" }, p.yUnit || "")) + (lab && grp ? "<br>" + esc(grp) : "") + (time ? "<br>" + esc(time) : "");
            const plot = this._plotEl(), L = this._local(e);
            tip.style.display = "block";
            tip.style.left = Math.min(plot.clientWidth - tip.offsetWidth - 4, L.x + 12) + "px";
            tip.style.top = Math.max(4, L.y - tip.offsetHeight - 8) + "px";
        }

        _toggle(key, ev) {
            const d = this._data(), names = d.groups;
            if (ev && (ev.altKey || ev.metaKey)) { const alone = names.every((k) => k === key || this._hidden.has(k)) && !this._hidden.has(key); names.forEach((k) => { if (k !== key) { if (alone) this._hidden.delete(k); else this._hidden.add(k); } }); this._hidden.delete(key); }
            else if (this._hidden.has(key)) this._hidden.delete(key); else this._hidden.add(key);
            this.draw(); this.requestUpdate();
        }

        exportData(params) {
            const o = this._exportOpts(params);
            if (o.format === "png") return this.exportPNG();
            const d = this._data(), idx = this._shown(d), p = this.p;
            const head = [p.xTitle || p.xField || "x", p.yTitle || p.yField || "y", "Group"].concat(p.timeField ? ["Time"] : []);
            const rows = Array.from(idx, (i) => [d.x[i], d.y[i], d.groups[d.g[i]]].concat(p.timeField ? [d.t[i] === d.t[i] ? new Date(d.t[i]).toISOString() : ""] : []));
            const fits = (this._fits || []).map((f) => [f.group || "All", f.model, f.text, Math.round(f.r2 * 10000) / 10000, f.n]);
            let blob;
            if (o.format === "xlsx") blob = xlsxBlob(head, rows, false, { textCols: [2, 3], sheets: fits.length ? [{ name: "Fit", header: ["Group", "Model", "Equation", "R²", "Points"], rows: fits, textCols: [0, 1, 2] }] : [] });
            else {
                const q = (x) => '"' + String(x).replace(/"/g, '""') + '"';
                blob = new Blob(["﻿" + [head.map(q).join(",")].concat(rows.map((r) => r.map((x) => (typeof x === "number" ? String(x) : q(x))).join(","))).join("\r\n")], { type: "text/csv;charset=utf-8" });
            }
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
            ctx.fillStyle = this._backgroundColor() || this._panel(); ctx.fillRect(0, 0, w, h);
            this._exporting = { png: true };
            const clear = this._clearCanvas;
            this._clearCanvas = () => {};
            try { this._drawInto(ctx, w, h); } finally { this._exporting = null; this._clearCanvas = clear; }
            return new Promise((resolve) => out.toBlob((blob) => { if (!blob) { resolve(null); return; } const name = this._getExportFileName("png", "all"); this._download(blob, name); this._lastExport = { name, blob, width: out.width }; resolve(this._lastExport); }, "image/png"));
        }

        render() {
            const p = this.p, bg = this._tok(p.background), d = this._data(), sample = this._sample();
            const { at, inside } = legendPlace(p);
            const groups = d.groups.filter((g) => g !== "" || d.groups.length > 1);
            const legend = groups.length > 1 || (groups.length === 1 && groups[0]) ? legendTemplate(p, groups.map((g) => ({ key: g, name: g || "—", color: this.seriesColor(d.groups.indexOf(g)), off: this._hidden.has(g), swatch: "dot" })), (e, ev) => this._toggle(e.key, ev), { stats: SC_STATS, head: "Group" }) : "";
            const win = this._window(), choices = [["1h", "1h"], ["8h", "8h"], ["24h", "24h"], ["7d", "7d"], ["", "All"]];
            const bar = p.windowButtons && p.timeField ? html`<div class="range-bar"><div class="rb-group">${choices.map(([v, l]) => html`<button type="button" class="rb-btn ${win === v ? "on" : ""}" @click=${() => this.setWindow(v)}>${l}</button>`)}</div></div>` : "";
            return html`
                <div class="sc-wrap ${p.border === false ? "borderless" : ""}" part="chart" style=${bg ? "background:" + bg : ""}>
                    ${p.title ? html`<div class="sc-head">${p.title}</div>` : ""}
                    ${bar}
                    ${at === "top" ? legend : ""}
                    <div class="c-main">
                        ${at === "left" ? legend : ""}
                        <div class="plot" @pointerdown=${(e) => this._down(e)} @pointermove=${(e) => this._move(e)} @pointerup=${(e) => this._up(e)} @pointerleave=${() => this._leave()}
                            @wheel=${(e) => this._wheel(e)} @dblclick=${() => this.resetZoom()}>
                            <canvas></canvas>
                            ${this._view ? html`<button class="btn-chip zoom-chip" @click=${(e) => { e.stopPropagation(); this.resetZoom(); }}>Reset zoom</button>` : ""}
                            <div class="corner" style="right:8px">${this._renderMenu()}</div>
                            <div class="sc-tip"></div>
                            ${inside ? legend : ""}
                            ${this._renderSampleBadge(sample)}
                        </div>
                        ${at === "right" ? legend : ""}
                    </div>
                    ${at === "bottom" ? legend : ""}
                </div>`;
        }
    }
});
