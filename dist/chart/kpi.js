// Nexa UI — KPI / Stat: big values with their context, one tile per value (a row of energy KPIs: kWh, peak kW, PF, cost).
//
// A TILE is a Logic target (its own Update node, message and events), like a series of the Line Chart:
//   - its value: a live tag (every new value is a point, kept in a Float64 ring) or its Update node (Set value / history);
//   - the figure shown: the last value, or the average / min / max / sum / change / count over a window (the last hour…);
//   - its context (ISA-101: a value is never shown alone): a delta ▲▼ (vs the previous value, some time ago, the target),
//     a target with a progress bar, a setpoint and a normal band (also on the sparkline), thresholds that colour it;
//   - a sparkline (line / area / bars) on a FIXED scale when asked (an auto-scaled % looks dramatic for nothing);
//   - stale: no data for N ms greys it out ("Stale · 5m").
// The tiles stand in a grid (columns automatic or fixed); a tile is the value beside its sparkline, above it, or over it
// (the sparkline as its background). Everything is drawn on one canvas (sharp in print and PNG). It replaces the old
// Sparkline (a KPI with the value hidden is a sparkline).
import { html, css, formatValue } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, part, defineUI } from "../core.js";
import { chartCommon, DASHES } from "./core.js";
import { M4Decimator, lowerBoundRing } from "./buffer.js";
import { exportProps } from "./props.js";
import { ReadoutElement, STATUSES, readoutFields, itemsProp, stepsProp, opt, numOr } from "./readout.js";
import { fmtDuration } from "./state.js";

const SPARKS = [["", "The chart's default"], ["area", "Area"], ["line", "Line"], ["bars", "Bars"], ["off", "None"]];

// a tile: the fields every value item has, and its own (a subtitle, a progress bar, its sparkline)
const shared = readoutFields("tile");
const TILE_FIELDS = Object.assign({}, shared, {
    subtitle: { type: "string", label: "Subtitle", default: "", help: "A line under the value (the line, the period, a note)." },
    showProgress: { type: "boolean", section: "Context", label: "Progress bar to the target", default: true },
    spark: { type: "enum", section: "Sparkline", label: "Sparkline", default: "", options: opt(SPARKS) },
    sparkMin: { type: "number", section: "Sparkline", label: "Scale from (fixed)", default: "", help: "Empty: from the data. A fixed scale (0 – 100 for a %) shows a small change as small." },
    sparkMax: { type: "number", section: "Sparkline", label: "Scale to (fixed)", default: "" }
});
// (the subtitle right after the name)
const ordered = {};
["name", "id", "visible", "subtitle"].concat(Object.keys(TILE_FIELDS).filter((k) => ["name", "id", "visible", "subtitle"].indexOf(k) === -1)).forEach((k) => { ordered[k] = TILE_FIELDS[k]; });

export const kpi = defineUI({
    ...chartCommon,
    id: PREFIX + "kpi",
    label: "KPI / Stat",
    icon: "fa fa-tachometer",
    size: { w: 520, h: 150 },
    help: "Big values with their context: a delta, a target, a normal band, thresholds, a sparkline. One tile per value, each with its own Update node and events.",
    version: 1,

    groups: ["Tiles", "Layout", "Value", "Colour", "Sparkline", "Thresholds", "General", "Export"],

    properties: {
        tiles: itemsProp({ group: "Tiles", label: "Tiles", noun: "tile", prefix: "k", fields: ordered, click: "tileClick",
            help: "One per value. Each has its own Update node, message and events in Logic." }),

        columns: { type: "number", group: "Layout", label: "Columns", default: 0, min: 0, max: 12, step: 1, help: "0 = as many as fit (a tile at least 180 px wide)." },
        gap: { type: "number", group: "Layout", label: "Space between tiles", default: 8, min: 0, max: 40, unit: "px" },
        arrangement: {
            type: "enum", group: "Layout", label: "A tile", default: "stack",
            options: opt([["stack", "The value above its sparkline"], ["side", "The value beside its sparkline"], ["background", "The sparkline behind the value"]])
        },
        align: { type: "enum", group: "Layout", label: "Text alignment", default: "left", options: opt([["left", "Left"], ["center", "Centre"]]) },
        tileBorder: { type: "boolean", group: "Layout", label: "A frame around each tile", default: true },

        valueSize: { type: "number", group: "Value", label: "Value size", default: 0, min: 0, max: 200, unit: "px", help: "0 = as big as the tile allows (auto-fit)." },
        valueWeight: { type: "enum", group: "Value", label: "Value weight", default: "600", options: opt([["400", "Normal"], ["600", "Semibold"], ["700", "Bold"]]) },
        nameSize: { type: "number", group: "Value", label: "Name size", default: 12, min: 8, max: 40, unit: "px" },
        showName: { type: "boolean", group: "Value", label: "Show the name", default: true },
        showValue: { type: "boolean", group: "Value", label: "Show the value", default: true, help: "Off: a sparkline only." },

        colorMode: {
            type: "enum", group: "Colour", label: "The threshold colour goes to", default: "value",
            options: opt([["value", "The value's text"], ["background", "The tile's background"], ["sparkline", "The sparkline only"], ["none", "Nothing"]])
        },
        baseStatus: { type: "enum", group: "Colour", label: "Below the first step", default: "neutral", options: opt([["neutral", "The text colour"]].concat(STATUSES.filter((s) => s[0] !== "custom" && s[0] !== "neutral"))) },

        spark: { type: "enum", group: "Sparkline", label: "Sparkline", default: "area", options: opt(SPARKS.slice(1)) },
        sparkWidth: { type: "number", group: "Sparkline", label: "Line width", default: 1.5, min: 0.5, max: 6, step: 0.5, unit: "px" },
        sparkHeight: { type: "number", group: "Sparkline", label: "Height (of the tile)", default: 40, min: 10, max: 80, unit: "%", help: "A tile with the value above it: the part the sparkline takes." },

        thresholds: stepsProp("tiles", "tile"),

        background: { type: "color", group: "General", label: "Background", default: "", tokens: "colors", help: "Empty: the theme's panel." },
        border: { type: "boolean", group: "General", label: "Border around the chart", default: false },
        ...exportProps({ thresholds: false })
    },

    parts: { chart: part("Chart container", "chart") },

    events: {},
    actions: {
        clearAll: { label: "Clear every tile" },
        exportData: { label: "Export (download)", params: { format: "string" }, example: "{ \"format\": \"xlsx\" }  (csv | xlsx | png)" }
    },

    view: class extends ReadoutElement {
        static styles = [...ReadoutElement.styles, css`
            .kpi-container { position: relative; width: 100%; height: 100%; box-sizing: border-box; border-radius: var(--r, 4px); overflow: hidden; }
            .kpi-container.framed { border: 1px solid var(--bd, #2c3235); background: var(--panel, #181b1f); }
            .kpi-container .plot { position: absolute; inset: 0; cursor: default; }
            .kpi-container .plot.over-item { cursor: pointer; }
            .kpi-container .corner { top: 4px; right: 4px; opacity: 0; transition: opacity 0.15s; }
            .kpi-container:hover .corner { opacity: 1; }
        `];

        _dec = new M4Decimator(512);

        get itemsKey() { return "tiles"; }
        get itemFields() { return ordered; }
        get clickEvent() { return "tileClick"; }
        tileList() { return this.itemList(); }
        findTile(ref) { return this.findItem(ref); }

        _drawInto(ctx, w, h) {
            // (a PNG is drawn onto its own background)
            this._fresh(ctx, w, h);
            const list = this.tileList().filter((t) => t.visible !== false);
            const boxes = this._grid(list.length, w, h, this.p.columns, this.p.gap, 180);
            this._rects = [];
            list.forEach((t, i) => { const b = boxes[i]; this._rects.push(Object.assign({ t }, b)); this._drawTile(ctx, t, b); });
        }

        _drawTile(ctx, t, b) {
            const c = this._colors(), st = this._state(t), p = this.p, font = c.font;
            const fig = this._figure(t, st), v = fig.v, state = this._stateColor(t, v), mode = p.colorMode || "value";
            const own = this._tok(t.color) || this.seriesColor(t._i);
            const stale = st.stale && !st.demo;
            const bgFill = mode === "background" && state ? state : null;
            const text = bgFill ? this._onColor(bgFill) : c.strong, muted = bgFill ? this.hexToRgba(this._onColor(bgFill), 0.75) : c.text;
            ctx.save();
            // the tile
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 4); else ctx.rect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
            if (bgFill) { ctx.fillStyle = bgFill; ctx.fill(); }
            else if (p.tileBorder !== false) { ctx.fillStyle = this._panel(); ctx.fill(); ctx.fillStyle = c.band; ctx.fill(); }
            if (p.tileBorder !== false && !bgFill) { ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.stroke(); }
            ctx.clip();
            // stale: what is in the tile faded (the tile itself stays opaque)
            if (stale) ctx.globalAlpha = 0.5;

            const pad = Math.max(8, Math.min(14, b.w * 0.05)), center = p.align === "center";
            const arr = p.arrangement || "stack";
            const sparkKind = t.spark || p.spark || "area";
            const showSpark = sparkKind !== "off" && st.buf.count > 1;
            // the areas: the text block and the sparkline
            let tx = b.x + pad, ty = b.y + pad, tw = b.w - pad * 2, th = b.h - pad * 2, sp = null;
            if (showSpark) {
                if (arr === "side") { const sw = tw * 0.45; sp = { x: b.x + b.w - pad - sw, y: b.y + pad, w: sw, h: th }; tw -= sw + pad; }
                else if (arr === "background") sp = { x: b.x, y: b.y + b.h * 0.35, w: b.w, h: b.h * 0.65 };
                else { const shh = Math.max(16, (b.h * Math.max(10, Math.min(80, numOr(p.sparkHeight, 40)))) / 100); sp = { x: b.x, y: b.y + b.h - shh, w: b.w, h: shh }; th -= shh - pad * 0.3; }
            }
            if (sp && arr === "background") this._drawSpark(ctx, t, st, sp, fig, mode === "sparkline" || mode === "value" ? state || own : bgFill ? this._onColor(bgFill) : own, 0.5);
            const ax = center ? tx + tw / 2 : tx;
            ctx.textAlign = center ? "center" : "left";
            ctx.textBaseline = "top";
            let y = ty;
            // the name, and Stale
            if (p.showName !== false && t.name) {
                const ns = numOr(p.nameSize, 12);
                ctx.font = "500 " + ns + "px " + font;
                ctx.fillStyle = muted;
                ctx.fillText(this._fit(ctx, t.name, tw - (stale ? 70 : 0)), ax, y);
                y += ns + 4;
            }
            if (stale) {
                ctx.save();
                ctx.globalAlpha = 1;
                ctx.font = "600 10px " + font;
                const s = "Stale · " + fmtDuration(Date.now() - st.lastAt), sw = ctx.measureText(s).width + 10;
                ctx.fillStyle = this.statusColor("neutral");
                ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(b.x + b.w - pad - sw, b.y + pad - 1, sw, 16, 8); else ctx.rect(b.x + b.w - pad - sw, b.y + pad - 1, sw, 16); ctx.fill();
                ctx.fillStyle = this._onColor(this.statusColor("neutral")); ctx.textAlign = "left";
                ctx.fillText(s, b.x + b.w - pad - sw + 5, b.y + pad + 2);
                ctx.restore();
                ctx.textAlign = center ? "center" : "left";
            }
            // the value (auto-fit, the unit smaller after it)
            const deltaRef = t.deltaFrom && t.deltaFrom !== "none" ? this._refValue(t, st, v) : NaN;
            const delta = Number.isFinite(deltaRef) ? this._delta(v, deltaRef, t.deltaAs !== "value", t.upIsGood, this._spec(t), t.unit) : null;
            const target = numOr(t.target, NaN), progress = Number.isFinite(target) && target !== 0 && t.showProgress !== false && Number.isFinite(v);
            const below = (delta || t.subtitle ? 16 : 0) + (progress ? 14 : 0);
            if (p.showValue !== false) {
                const vt = this._valueText(v, this._spec(t), t._map), unit = t._map && t._map.has(v) ? "" : (t.unit || "");
                const room = Math.max(12, th - (y - ty) - below);
                const weight = p.valueWeight || "600";
                let size = numOr(p.valueSize, 0);
                if (!(size > 0)) {
                    const whole = vt + (unit ? " " + unit : "");
                    size = this._fitSize(ctx, whole, tw, room, weight, font, 10, 96);
                    // the unit is drawn at half size: room for a bigger value
                    if (unit) { ctx.font = weight + " " + size + "px " + font; const k = tw / (ctx.measureText(vt).width + ctx.measureText(" " + unit).width * 0.5); if (k > 1) size = Math.min(size * k, room * 0.9, 96); }
                }
                ctx.font = weight + " " + size + "px " + font;
                const vw = ctx.measureText(vt).width;
                ctx.font = "500 " + Math.round(size * 0.5) + "px " + font;
                const uw = unit ? ctx.measureText(" " + unit).width : 0;
                const x0 = center ? ax - (vw + uw) / 2 : ax;
                ctx.textAlign = "left";
                ctx.font = weight + " " + size + "px " + font;
                ctx.fillStyle = mode === "value" && state ? state : text;
                ctx.fillText(vt, x0, y);
                if (unit) { ctx.font = "500 " + Math.round(size * 0.5) + "px " + font; ctx.fillStyle = muted; ctx.fillText(" " + unit, x0 + vw, y + size * 0.42); }
                y += size + 4;
                ctx.textAlign = center ? "center" : "left";
            }
            // the delta and the subtitle on one line
            if (delta || t.subtitle) {
                ctx.font = "500 11px " + font;
                let x = center ? ax : tx;
                const parts = [];
                if (delta) parts.push([delta.text, delta.flat || bgFill ? muted : this.statusColor(delta.good ? "success" : "error")]);
                if (t.subtitle) parts.push([(delta ? "  " : "") + t.subtitle, muted]);
                const total = parts.reduce((a, q) => a + ctx.measureText(q[0]).width, 0);
                if (center) x -= total / 2;
                ctx.textAlign = "left";
                parts.forEach(([s, col]) => { ctx.fillStyle = col; ctx.fillText(s, x, y); x += ctx.measureText(s).width; });
                y += 16;
                ctx.textAlign = center ? "center" : "left";
            }
            // the progress to the target
            if (progress) {
                const r = Math.max(0, v / target), bw = tw, bx = tx, by = y + 2, txt = formatValue(r * 100, { decimals: "0" }, "") + " % of " + formatValue(target, this._spec(t), t.unit || "");
                ctx.font = "500 10px " + font;
                const lw = ctx.measureText(txt).width + 8;
                ctx.fillStyle = bgFill ? this.hexToRgba(text, 0.25) : c.grid;
                ctx.fillRect(bx, by, Math.max(10, bw - lw), 5);
                ctx.fillStyle = bgFill ? text : (state || own);
                ctx.fillRect(bx, by, Math.max(0, Math.min(1, r)) * Math.max(10, bw - lw), 5);
                ctx.fillStyle = muted; ctx.textAlign = "right"; ctx.textBaseline = "middle";
                ctx.fillText(txt, bx + bw, by + 3);
                ctx.textBaseline = "top";
            }
            if (sp && arr !== "background") this._drawSpark(ctx, t, st, sp, fig, bgFill ? this._onColor(bgFill) : (mode === "sparkline" || mode === "value") && state ? state : own, 1);
            ctx.restore();
        }

        // a sparkline in a box: the window's points (M4 to the box's width), the normal band, the setpoint; a fixed scale when set
        _drawSpark(ctx, t, st, sp, fig, color, alpha) {
            const b = st.buf, kind = t.spark || this.p.spark || "area";
            const i0 = Number.isFinite(fig.from) ? Math.max(0, lowerBoundRing(b, fig.from)) : 0;
            if (b.count - i0 < 2) return;
            const x0 = b.getX(i0), x1 = b.getX(b.count - 1);
            const n = this._dec.decimate(b, i0, b.count, Math.max(2, Math.floor(sp.w)), x0, x1);
            let lo = Infinity, hi = -Infinity;
            for (let i = 0; i < n; i++) { const y = this._dec.outY[i]; if (y < lo) lo = y; if (y > hi) hi = y; }
            const nl = numOr(t.normalLow, NaN), nh = numOr(t.normalHigh, NaN), spv = numOr(t.setpoint, NaN);
            [nl, nh, spv].forEach((q) => { if (Number.isFinite(q)) { lo = Math.min(lo, q); hi = Math.max(hi, q); } });
            if (kind === "bars") lo = Math.min(lo, 0);
            if (Number.isFinite(numOr(t.sparkMin, NaN))) lo = numOr(t.sparkMin, lo);
            if (Number.isFinite(numOr(t.sparkMax, NaN))) hi = numOr(t.sparkMax, hi);
            if (hi === lo) { hi += 1; lo -= 1; }
            const padT = sp.h * 0.1, toX = (x) => sp.x + ((x - x0) / Math.max(1, x1 - x0)) * sp.w, toY = (y) => sp.y + padT + (1 - (y - lo) / (hi - lo)) * (sp.h - padT);
            ctx.save();
            ctx.globalAlpha = alpha;
            // the normal band, the setpoint
            if (Number.isFinite(nl) || Number.isFinite(nh)) {
                const a = toY(Number.isFinite(nh) ? Math.min(nh, hi) : hi), z = toY(Number.isFinite(nl) ? Math.max(nl, lo) : lo);
                ctx.fillStyle = this.hexToRgba(this.statusColor("success"), 0.12);
                ctx.fillRect(sp.x, a, sp.w, z - a);
            }
            if (Number.isFinite(spv)) {
                ctx.strokeStyle = this.hexToRgba(this._colors().strong, 0.6); ctx.lineWidth = 1; ctx.setLineDash(DASHES.dashed);
                ctx.beginPath(); ctx.moveTo(sp.x, toY(spv)); ctx.lineTo(sp.x + sp.w, toY(spv)); ctx.stroke(); ctx.setLineDash([]);
            }
            const lw = numOr(this.p.sparkWidth, 1.5);
            if (kind === "bars") {
                const bw = Math.max(1, sp.w / n * 0.7), base = toY(Math.max(lo, Math.min(hi, 0)));
                ctx.fillStyle = color;
                for (let i = 0; i < n; i++) { const x = toX(this._dec.outX[i]), y = toY(this._dec.outY[i]); ctx.fillRect(x - bw / 2, Math.min(y, base), bw, Math.max(1, Math.abs(base - y))); }
            } else {
                ctx.beginPath();
                for (let i = 0; i < n; i++) { const x = toX(this._dec.outX[i]), y = toY(this._dec.outY[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
                if (kind === "area") {
                    const g = ctx.createLinearGradient(0, sp.y, 0, sp.y + sp.h);
                    g.addColorStop(0, this.hexToRgba(color, 0.35)); g.addColorStop(1, this.hexToRgba(color, 0.02));
                    ctx.save(); ctx.lineTo(toX(this._dec.outX[n - 1]), sp.y + sp.h); ctx.lineTo(toX(this._dec.outX[0]), sp.y + sp.h); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.restore();
                    ctx.beginPath();
                    for (let i = 0; i < n; i++) { const x = toX(this._dec.outX[i]), y = toY(this._dec.outY[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
                }
                ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.stroke();
                // the newest point
                const lx = toX(this._dec.outX[n - 1]), ly = toY(this._dec.outY[n - 1]);
                ctx.fillStyle = color; ctx.beginPath(); ctx.arc(lx - 1, ly, Math.max(2, lw + 1), 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }

        render() {
            const p = this.p, bg = this._tok(p.background), demo = this.tileList().some((t) => this._state(t).demo);
            return html`
                <div class="kpi-container ${p.border ? "framed" : ""}" part="chart" style=${bg ? "background:" + bg : ""}>
                    <div class="plot" @pointermove=${(e) => this._move(e)} @click=${(e) => this._click(e)}>
                        <canvas></canvas>
                        <div class="corner">${this._renderMenu()}</div>
                        ${this._renderSampleBadge(demo)}
                    </div>
                </div>`;
        }
    }
});
