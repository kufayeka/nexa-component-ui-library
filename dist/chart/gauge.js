// Nexa UI — Gauge: a dial per value (pressure, temperature, speed, load), several side by side.
//
// A GAUGE is an item of the shared value model (readout.js: a Logic target, its live value and history, the figure over a
// window, value texts, delta, target / setpoint / normal band, threshold steps, stale, a soft min / max, the ghost of
// the lowest / highest over the window). What the dial adds:
//   - its shape: an arc of any sweep (180° half, 240°, 270°, a full 360° ring), its thickness, rounded ends;
//   - the pointer, in any mix: a FILL running along the arc, a NEEDLE (a line, a tapered blade, an arrow) with its hub,
//     a triangle MARKER running along the arc, outside or inside it;
//   - the scale: major ticks (automatic, a step, or a list of values) and minor ticks between them, inside / outside /
//     across the track, their length, width and colour, labels inside or outside (value texts too);
//   - the threshold zones: colouring the track, or a ring outside / inside it, with their labels;
//   - the value in the middle (auto-fit), its unit and its delta; the name above or below.
// Everything on one canvas (sharp in print and PNG). It replaces the old Gauge & Meter (its linear mode: the Bar Gauge).
import { html, css } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, part, defineUI } from "../core.js";
import { chartCommon, DASHES } from "./core.js";
import { exportProps } from "./props.js";
import { ReadoutElement, STATUSES, readoutFields, scaleFields, itemsProp, stepsProp, scaleTicks, opt, numOr } from "./readout.js";
import { fmtDuration } from "./state.js";

const DEG = Math.PI / 180;
const GAUGE_FIELDS = Object.assign({}, readoutFields("gauge"), scaleFields());

export const gauge = defineUI({
    ...chartCommon,
    id: PREFIX + "gauge",
    label: "Gauge",
    icon: "fa fa-dashboard",
    size: { w: 280, h: 240 },
    help: "A dial per value: an arc (half, 240°, a full ring), a fill / a needle / a triangle marker, ticks you set, threshold zones, a target and a normal band, the peak over a window. Each gauge has its own Update node and events.",
    version: 2,
    // v1 (the old Gauge & Meter: one value in flat props) is not carried over: a new chart (the user, 2026-10-06)
    migrate(p) { return p; },

    groups: ["Gauges", "Dial", "Pointer", "Scale", "Value", "Layout", "Thresholds", "General", "Export"],

    properties: {
        gauges: itemsProp({ group: "Gauges", label: "Gauges", noun: "gauge", prefix: "g", fields: GAUGE_FIELDS, click: "gaugeClick",
            help: "One dial per value, side by side. Each has its own Update node, message and events in Logic." }),

        // ---- the dial ----
        sweep: { type: "number", group: "Dial", label: "Sweep", default: 240, min: 90, max: 360, step: 10, unit: "°", help: "180 = a half circle, 240 / 270 = a classic dial, 360 = a ring." },
        thickness: { type: "number", group: "Dial", label: "Track thickness", default: 12, min: 2, max: 50, unit: "% of the radius" },
        rounded: { type: "boolean", group: "Dial", label: "Rounded ends", default: true },
        trackColor: { type: "color", group: "Dial", label: "Track colour", default: "", tokens: "colors", help: "Empty: the theme's subtle band." },
        zones: {
            type: "enum", group: "Dial", label: "Threshold zones", default: "ring",
            options: opt([["ring", "A thin ring outside the track"], ["inner", "A thin ring inside the track"], ["track", "Colour the track itself"], ["none", "None"]])
        },
        zoneWidth: { type: "number", group: "Dial", label: "Zone ring width", default: 4, min: 1, max: 20, unit: "px", visibleWhen: (p) => p.zones === "ring" || p.zones === "inner" },
        zoneLabels: { type: "boolean", group: "Dial", label: "The steps' labels on the dial", default: false },

        // ---- the pointer ----
        fill: { type: "boolean", group: "Pointer", label: "Fill along the arc", default: true, help: "The arc filled from the start to the value." },
        fillColor: { type: "color", group: "Pointer", label: "Fill colour", default: "", tokens: "colors", help: "Empty: the colour of the step the value is in (else the gauge's colour)." },
        needle: { type: "enum", group: "Pointer", label: "Needle", default: "none", options: opt([["none", "None"], ["line", "A line"], ["tapered", "A tapered blade"], ["arrow", "An arrow"]]) },
        needleLength: { type: "number", group: "Pointer", label: "Needle length", default: 85, min: 30, max: 110, unit: "% of the radius", visibleWhen: (p) => p.needle && p.needle !== "none" },
        needleWidth: { type: "number", group: "Pointer", label: "Needle width", default: 4, min: 1, max: 20, unit: "px", visibleWhen: (p) => p.needle && p.needle !== "none" },
        needleColor: { type: "color", group: "Pointer", label: "Needle colour", default: "", tokens: "colors", help: "Empty: the theme's text.", visibleWhen: (p) => p.needle && p.needle !== "none" },
        hub: { type: "boolean", group: "Pointer", label: "Hub (the needle's centre)", default: true, visibleWhen: (p) => p.needle && p.needle !== "none" },
        hubSize: { type: "number", group: "Pointer", label: "Hub size", default: 7, min: 2, max: 30, unit: "px", visibleWhen: (p) => p.needle && p.needle !== "none" && p.hub !== false },
        marker: { type: "enum", group: "Pointer", label: "Triangle marker", default: "none", options: opt([["none", "None"], ["outside", "Outside the arc (pointing in)"], ["inside", "Inside the arc (pointing out)"]]), help: "A triangle that runs along the arc to the value." },
        markerSize: { type: "number", group: "Pointer", label: "Marker size", default: 10, min: 4, max: 40, unit: "px", visibleWhen: (p) => p.marker && p.marker !== "none" },
        markerColor: { type: "color", group: "Pointer", label: "Marker colour", default: "", tokens: "colors", help: "Empty: the colour of the step the value is in.", visibleWhen: (p) => p.marker && p.marker !== "none" },

        // ---- the scale ----
        ticks: { type: "boolean", group: "Scale", label: "Ticks", default: true },
        tickStep: { type: "number", group: "Scale", label: "Major tick every", default: 0, min: 0, help: "0 = automatic (about 5). A list below wins.", visibleWhen: (p) => p.ticks !== false },
        tickList: { type: "string", group: "Scale", label: "Major ticks at (a list)", default: "", bindable: false, help: "0, 25, 50, 80, 100 — exactly these.", visibleWhen: (p) => p.ticks !== false },
        minorTicks: { type: "number", group: "Scale", label: "Minor ticks between two majors", default: 4, min: 0, max: 20, visibleWhen: (p) => p.ticks !== false },
        tickPlace: { type: "enum", group: "Scale", label: "Ticks", default: "inside", options: opt([["inside", "Inside the track"], ["outside", "Outside the track"], ["across", "Across the track"]]), visibleWhen: (p) => p.ticks !== false },
        tickLength: { type: "number", group: "Scale", section: "Look", label: "Major length", default: 8, min: 2, max: 40, unit: "px", visibleWhen: (p) => p.ticks !== false },
        minorLength: { type: "number", group: "Scale", section: "Look", label: "Minor length", default: 4, min: 1, max: 30, unit: "px", visibleWhen: (p) => p.ticks !== false },
        tickWidth: { type: "number", group: "Scale", section: "Look", label: "Width", default: 1.5, min: 0.5, max: 6, step: 0.5, unit: "px", visibleWhen: (p) => p.ticks !== false },
        tickColor: { type: "color", group: "Scale", section: "Look", label: "Colour", default: "", tokens: "colors", help: "Empty: the theme's muted text.", visibleWhen: (p) => p.ticks !== false },
        labels: { type: "boolean", group: "Scale", label: "Tick labels", default: true },
        labelPlace: { type: "enum", group: "Scale", label: "Labels", default: "inside", options: opt([["inside", "Inside"], ["outside", "Outside"]]), visibleWhen: (p) => p.labels !== false },
        labelSize: { type: "number", group: "Scale", label: "Label size", default: 10, min: 7, max: 24, unit: "px", visibleWhen: (p) => p.labels !== false },

        // ---- the value ----
        showValue: { type: "boolean", group: "Value", label: "Show the value", default: true },
        valueSize: { type: "number", group: "Value", label: "Value size", default: 0, min: 0, max: 150, unit: "px", help: "0 = as big as the dial allows." },
        valueWeight: { type: "enum", group: "Value", label: "Weight", default: "600", options: opt([["400", "Normal"], ["600", "Semibold"], ["700", "Bold"]]) },
        valueColor: { type: "enum", group: "Value", label: "Colour", default: "text", options: opt([["text", "The text colour"], ["state", "The step's colour"]]) },
        showDelta: { type: "boolean", group: "Value", label: "The delta under it", default: true },

        // ---- the layout ----
        columns: { type: "number", group: "Layout", label: "Columns", default: 0, min: 0, max: 12, step: 1, help: "0 = as many as fit (a gauge at least 160 px wide)." },
        gap: { type: "number", group: "Layout", label: "Space between gauges", default: 8, min: 0, max: 40, unit: "px" },
        showName: { type: "boolean", group: "Layout", label: "Show the name", default: true },
        namePlace: { type: "enum", group: "Layout", label: "The name", default: "top", options: opt([["top", "Above the dial"], ["bottom", "Below the dial"]]) },
        nameSize: { type: "number", group: "Layout", label: "Name size", default: 12, min: 8, max: 32, unit: "px" },
        frame: { type: "boolean", group: "Layout", label: "A frame around each gauge", default: false },

        thresholds: stepsProp("gauges", "gauge"),
        baseStatus: { type: "enum", group: "Thresholds", label: "Below the first step", default: "neutral", options: opt([["neutral", "The gauge's colour"]].concat(STATUSES.filter((s) => s[0] !== "custom" && s[0] !== "neutral"))) },

        background: { type: "color", group: "General", label: "Background", default: "", tokens: "colors", help: "Empty: transparent (the page)." },
        ...exportProps({ thresholds: false })
    },

    parts: { chart: part("Chart container", "chart") },
    events: {},
    actions: {
        clearAll: { label: "Clear every gauge" },
        exportData: { label: "Export (download)", params: { format: "string" }, example: "{ \"format\": \"xlsx\" }  (csv | xlsx | png)" }
    },

    view: class extends ReadoutElement {
        static styles = [...ReadoutElement.styles, css`
            .gauge-wrap { position: relative; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; border-radius: var(--r, 4px); }
            .gauge-wrap .plot { position: absolute; inset: 0; cursor: default; }
            .gauge-wrap .plot.over-item { cursor: pointer; }
            .gauge-wrap .corner { top: 4px; right: 4px; opacity: 0; transition: opacity 0.15s; }
            .gauge-wrap:hover .corner { opacity: 1; }
        `];

        get itemsKey() { return "gauges"; }
        get itemFields() { return GAUGE_FIELDS; }
        get clickEvent() { return "gaugeClick"; }

        _drawInto(ctx, w, h) {
            this._fresh(ctx, w, h);
            const list = this.itemList().filter((t) => t.visible !== false);
            const boxes = this._grid(list.length, w, h, this.p.columns, this.p.gap, 160);
            this._rects = [];
            list.forEach((t, i) => { this._rects.push(Object.assign({ t }, boxes[i])); this._drawGauge(ctx, t, boxes[i]); });
        }

        // the arc's geometry in a box: { cx, cy, r, a0, a1 } (angles in radians, clockwise from east; the gap at the bottom)
        _geometry(b, top, bottom, outerPad) {
            const sweep = Math.max(90, Math.min(360, numOr(this.p.sweep, 240)));
            // the gap at the bottom; a full ring starts at the top (12 o'clock)
            const a0 = (sweep >= 360 ? -90 : 90 + (360 - sweep) / 2) * DEG, a1 = a0 + sweep * DEG;
            // the arc's extent on a unit circle (and its centre, where the value sits)
            let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
            for (let k = 0; k <= 64; k++) { const a = a0 + ((a1 - a0) * k) / 64; x0 = Math.min(x0, Math.cos(a)); x1 = Math.max(x1, Math.cos(a)); y0 = Math.min(y0, Math.sin(a)); y1 = Math.max(y1, Math.sin(a)); }
            // a half dial: room under the centre for the value
            if (sweep <= 200) y1 = Math.max(y1, this.p.needle && this.p.needle !== "none" && this.p.showValue !== false ? 0.5 : 0.32);
            const aw = b.w - outerPad * 2, ah = b.h - top - bottom - outerPad * 2;
            const r = Math.max(10, Math.min(aw / (x1 - x0), ah / (y1 - y0)));
            // the drawn extent centred in the area
            const cx = b.x + outerPad + (aw - r * (x1 - x0)) / 2 - x0 * r, cy = b.y + top + outerPad + (ah - r * (y1 - y0)) / 2 - y0 * r;
            return { cx, cy, r, a0, a1, sweep };
        }

        _drawGauge(ctx, t, b) {
            const c = this._colors(), p = this.p, font = c.font, st = this._state(t);
            const fig = this._figure(t, st), v = fig.v, sc = this._range(t, st, v), state = this._stateColor(t, v);
            const own = this._tok(t.color) || this.seriesColor(t._i), stale = st.stale && !st.demo;
            const at = (x) => { const k = Math.max(0, Math.min(1, (x - sc.lo) / (sc.hi - sc.lo))); return g.a0 + (g.a1 - g.a0) * k; };
            ctx.save();
            if (p.frame) {
                ctx.fillStyle = this._panel(); ctx.strokeStyle = c.grid; ctx.lineWidth = 1;
                ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 4); else ctx.rect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
                ctx.fill(); ctx.stroke();
            }
            if (stale) ctx.globalAlpha = 0.5;
            // the name's room, the room outside the arc (labels / ticks / markers / a zone ring outside)
            const ns = numOr(p.nameSize, 12), nameH = p.showName !== false && t.name ? ns + 6 : 0;
            const lab = p.labels !== false ? numOr(p.labelSize, 10) : 0;
            // the widest text outside the arc (a tick label outside, a step's label) sets the room around it
            ctx.font = "500 " + lab + "px " + font;
            const wideOf = (texts) => texts.reduce((m, s) => Math.max(m, ctx.measureText(s).width), 0);
            const scale0 = this._range(t, st, v);
            const outLabels = p.labels !== false && p.labelPlace === "outside" ? wideOf(scaleTicks(scale0.lo, scale0.hi, numOr(p.tickStep, 0), p.tickList, 5).map((m) => this._valueText(m, this._spec(t), t._map))) + lab * 0.9 + 6 + (p.ticks !== false && p.tickPlace === "outside" ? numOr(p.tickLength, 8) : 0) : 0;
            const outZones = p.zoneLabels ? wideOf(this._steps(t).map((s) => s.label || "")) + 6 : 0;
            const outside = Math.max(outLabels, outZones, p.ticks !== false && p.tickPlace === "outside" ? numOr(p.tickLength, 8) + 2 : 0,
                p.marker === "outside" ? numOr(p.markerSize, 10) + 2 : 0, p.zones === "ring" ? numOr(p.zoneWidth, 4) + 3 : 0, Number.isFinite(numOr(t.target, NaN)) ? 8 : 0) + 4;
            const top = p.namePlace === "bottom" ? 0 : nameH, bottom = p.namePlace === "bottom" ? nameH : 0;
            const g = this._geometry(b, top, bottom, outside + 2);
            const r = g.r, thick = Math.max(2, (r * Math.max(2, Math.min(50, numOr(p.thickness, 12)))) / 100), rm = r - thick / 2;
            ctx.lineCap = p.rounded !== false ? "round" : "butt";
            // the track
            const steps = this._steps(t);
            const zoneOf = (s) => this._statusColor(s.status, s.color);
            ctx.lineWidth = thick;
            ctx.strokeStyle = this._tok(p.trackColor) || c.band;
            ctx.beginPath(); ctx.arc(g.cx, g.cy, rm, g.a0, g.a1); ctx.stroke();
            // the zones: the track coloured, or a thin ring outside / inside it
            if (steps.length && p.zones !== "none") {
                const zw = p.zones === "track" ? thick : Math.max(1, numOr(p.zoneWidth, 4)), zr = p.zones === "track" ? rm : p.zones === "inner" ? r - thick - zw / 2 - 2 : r + zw / 2 + 2;
                ctx.save(); ctx.lineCap = "butt"; ctx.lineWidth = zw;
                if (p.zones === "track") ctx.globalAlpha *= 0.35;
                steps.forEach((s, i) => {
                    const from = Math.max(sc.lo, s.from), to = i + 1 < steps.length ? Math.min(sc.hi, steps[i + 1].from) : sc.hi;
                    if (to <= from) return;
                    ctx.strokeStyle = zoneOf(s); ctx.beginPath(); ctx.arc(g.cx, g.cy, zr, at(from), at(to)); ctx.stroke();
                });
                ctx.restore();
                if (p.zoneLabels) {
                    ctx.save(); ctx.font = "500 " + Math.max(8, lab - 1) + "px " + font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    steps.forEach((s, i) => {
                        if (!s.label) return;
                        const to = i + 1 < steps.length ? steps[i + 1].from : sc.hi, mid = at((Math.max(sc.lo, s.from) + Math.min(sc.hi, to)) / 2);
                        const lr = r + (p.zones === "ring" ? numOr(p.zoneWidth, 4) + 4 : 4) + (p.labelPlace === "outside" ? lab * 1.6 : 0) + ctx.measureText(s.label).width / 2 + 2;
                        ctx.fillStyle = zoneOf(s); ctx.fillText(s.label, g.cx + Math.cos(mid) * lr, g.cy + Math.sin(mid) * lr);
                    });
                    ctx.restore();
                }
            }
            // the normal band: a faint ring just inside the track
            const nl = numOr(t.normalLow, NaN), nh = numOr(t.normalHigh, NaN);
            if (Number.isFinite(nl) || Number.isFinite(nh)) {
                ctx.save(); ctx.lineCap = "butt"; ctx.lineWidth = 3; ctx.strokeStyle = this.hexToRgba(this.statusColor("success"), 0.6);
                ctx.beginPath(); ctx.arc(g.cx, g.cy, r - thick - 3, at(Number.isFinite(nl) ? nl : sc.lo), at(Number.isFinite(nh) ? nh : sc.hi)); ctx.stroke(); ctx.restore();
            }
            // the ghost: the lowest .. highest over the window, faint on the track
            if (t.showPeak && st.buf.count > 1) {
                const pk = this._peak(t, st);
                if (Number.isFinite(pk.lo) && Number.isFinite(pk.hi)) {
                    ctx.save(); ctx.lineCap = "butt"; ctx.lineWidth = thick; ctx.strokeStyle = this.hexToRgba(state || own, 0.22);
                    ctx.beginPath(); ctx.arc(g.cx, g.cy, rm, at(pk.lo), Math.max(at(pk.hi), at(pk.lo) + 0.01)); ctx.stroke();
                    ctx.lineWidth = 2; ctx.strokeStyle = this.hexToRgba(state || own, 0.8);
                    [pk.lo, pk.hi].forEach((q) => { const a = at(q); ctx.beginPath(); ctx.moveTo(g.cx + Math.cos(a) * (r - thick), g.cy + Math.sin(a) * (r - thick)); ctx.lineTo(g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r); ctx.stroke(); });
                    ctx.restore();
                }
            }
            // the fill along the arc
            const fillColor = this._tok(p.fillColor) || state || own;
            if (p.fill !== false && Number.isFinite(v)) {
                ctx.lineWidth = thick; ctx.strokeStyle = fillColor;
                ctx.beginPath(); ctx.arc(g.cx, g.cy, rm, g.a0, Math.max(at(v), g.a0 + 0.001)); ctx.stroke();
            }
            // the ticks and their labels
            const tickColor = this._tok(p.tickColor) || c.text;
            const majors = scaleTicks(sc.lo, sc.hi, numOr(p.tickStep, 0), p.tickList, Math.max(3, Math.round(g.sweep / 50)));
            if (p.ticks !== false) {
                const place = p.tickPlace || "inside", L = numOr(p.tickLength, 8), l = numOr(p.minorLength, 4), minor = Math.max(0, Math.floor(numOr(p.minorTicks, 4)));
                const radial = (val, len) => {
                    const a = at(val);
                    const r0 = place === "outside" ? r + 2 : place === "across" ? r - thick - 1 : r - thick - 2 - len, r1 = place === "outside" ? r + 2 + len : place === "across" ? r + 1 : r - thick - 2;
                    ctx.beginPath(); ctx.moveTo(g.cx + Math.cos(a) * r0, g.cy + Math.sin(a) * r0); ctx.lineTo(g.cx + Math.cos(a) * r1, g.cy + Math.sin(a) * r1); ctx.stroke();
                };
                ctx.save(); ctx.strokeStyle = tickColor; ctx.lineCap = "butt";
                ctx.lineWidth = numOr(p.tickWidth, 1.5);
                majors.forEach((m) => radial(m, place === "across" ? 0 : L));
                ctx.lineWidth = Math.max(0.5, numOr(p.tickWidth, 1.5) * 0.6);
                if (minor > 0) for (let k = 0; k + 1 < majors.length; k++) { const d = (majors[k + 1] - majors[k]) / (minor + 1); for (let j = 1; j <= minor; j++) radial(majors[k] + d * j, place === "across" ? 0 : l); }
                ctx.restore();
            }
            if (p.labels !== false) {
                ctx.save(); ctx.font = "500 " + lab + "px " + font; ctx.fillStyle = tickColor; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                const inner = p.ticks !== false && (p.tickPlace || "inside") === "inside" ? numOr(p.tickLength, 8) + 2 : 0;
                const lr = p.labelPlace === "outside" ? r + (p.tickPlace === "outside" && p.ticks !== false ? numOr(p.tickLength, 8) + 4 : 4) + lab * 0.9 : r - thick - inner - lab * 0.9 - 2;
                // a label's centre moves out (or in) by half its width where the dial runs up and down (its sides)
                const outward = p.labelPlace === "outside" ? 1 : -1;
                majors.forEach((m) => {
                    const a = at(m), txt = this._valueText(m, this._spec(t), t._map), rr = lr + outward * (ctx.measureText(txt).width / 2) * Math.abs(Math.cos(a));
                    ctx.fillText(txt, g.cx + Math.cos(a) * rr, g.cy + Math.sin(a) * rr);
                });
                ctx.restore();
            }
            // the target (a bar across the track and a small triangle outside), the setpoint (dashed across the track)
            const tgt = numOr(t.target, NaN), spv = numOr(t.setpoint, NaN);
            if (Number.isFinite(tgt)) {
                const a = at(tgt);
                ctx.save(); ctx.strokeStyle = c.strong; ctx.fillStyle = c.strong; ctx.lineWidth = 2.5; ctx.lineCap = "butt";
                ctx.beginPath(); ctx.moveTo(g.cx + Math.cos(a) * (r - thick - 2), g.cy + Math.sin(a) * (r - thick - 2)); ctx.lineTo(g.cx + Math.cos(a) * (r + 2), g.cy + Math.sin(a) * (r + 2)); ctx.stroke();
                this._triangle(ctx, g, a, r + 3, 6, true);
                ctx.restore();
            }
            if (Number.isFinite(spv)) {
                const a = at(spv);
                ctx.save(); ctx.strokeStyle = c.strong; ctx.lineWidth = 1.5; ctx.setLineDash(DASHES.dotted);
                ctx.beginPath(); ctx.moveTo(g.cx + Math.cos(a) * (r - thick - 4), g.cy + Math.sin(a) * (r - thick - 4)); ctx.lineTo(g.cx + Math.cos(a) * (r + 3), g.cy + Math.sin(a) * (r + 3)); ctx.stroke();
                ctx.restore();
            }
            // the triangle marker running along the arc
            if (p.marker && p.marker !== "none" && Number.isFinite(v)) {
                const a = at(v), ms = numOr(p.markerSize, 10);
                ctx.save(); ctx.fillStyle = this._tok(p.markerColor) || state || c.strong;
                if (p.marker === "outside") this._triangle(ctx, g, a, r + 2, ms, true); else this._triangle(ctx, g, a, r - thick - 2, ms, false);
                ctx.restore();
            }
            // the value in the middle, its unit and delta (above the needle's hub when there is a needle)
            const hasNeedle = p.needle && p.needle !== "none";
            if (p.showValue !== false) {
                const vt = this._valueText(v, this._spec(t), t._map), unit = t._map && t._map.has(v) ? "" : (t.unit || "");
                const half = g.sweep <= 200;
                const boxW = (r - thick) * (half ? 1.5 : 1.25), boxH = half ? r * 0.42 : (r - thick) * 0.55;
                const weight = p.valueWeight || "600";
                let size = numOr(p.valueSize, 0);
                if (!(size > 0)) size = this._fitSize(ctx, vt + (unit ? "  " + unit : ""), boxW, boxH, weight, font, 9, 120);
                const deltaRef = p.showDelta !== false && t.deltaFrom && t.deltaFrom !== "none" ? this._refValue(t, st) : NaN;
                const delta = Number.isFinite(deltaRef) ? this._delta(v, deltaRef, t.deltaAs !== "value", t.upIsGood, this._spec(t), t.unit) : null;
                // where: a half dial above its centre; a full dial in its middle (below the hub with a needle)
                let vy = half ? g.cy - size * 0.15 : hasNeedle ? g.cy + r * 0.38 : g.cy - (delta ? size * 0.2 : 0);
                // a half dial with a needle: the value under the hub
                if (hasNeedle && half) { size = Math.min(size, r * 0.22); vy = g.cy + numOr(p.hubSize, 7) + 6 + size * 0.55; }
                ctx.save();
                ctx.textAlign = "left"; ctx.textBaseline = "middle";
                ctx.font = weight + " " + size + "px " + font;
                const vw = ctx.measureText(vt).width;
                ctx.font = "500 " + Math.round(size * 0.45) + "px " + font;
                const uw = unit ? ctx.measureText(" " + unit).width : 0;
                const x0 = g.cx - (vw + uw) / 2;
                ctx.font = weight + " " + size + "px " + font;
                ctx.fillStyle = p.valueColor === "state" && state ? state : c.strong;
                ctx.fillText(vt, x0, vy);
                if (unit) { ctx.font = "500 " + Math.round(size * 0.45) + "px " + font; ctx.fillStyle = c.text; ctx.fillText(" " + unit, x0 + vw, vy + size * 0.12); }
                if (delta) {
                    ctx.font = "500 11px " + font; ctx.textAlign = "center";
                    ctx.fillStyle = delta.flat ? c.text : this.statusColor(delta.good ? "success" : "error");
                    ctx.fillText(delta.text, g.cx, vy + size * 0.5 + 9);
                }
                ctx.restore();
            }
            // the needle and its hub
            if (hasNeedle && Number.isFinite(v)) {
                const a = at(v), len = (r * Math.max(30, Math.min(110, numOr(p.needleLength, 85)))) / 100, nw = numOr(p.needleWidth, 4);
                const col = this._tok(p.needleColor) || c.strong;
                const tx = g.cx + Math.cos(a) * len, ty = g.cy + Math.sin(a) * len, px = -Math.sin(a), py = Math.cos(a);
                ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = col;
                if (p.needle === "line") { ctx.lineWidth = nw; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(tx, ty); ctx.stroke(); }
                else if (p.needle === "tapered") {
                    const tail = len * 0.12;
                    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(g.cx + px * nw, g.cy + py * nw); ctx.lineTo(g.cx - Math.cos(a) * tail, g.cy - Math.sin(a) * tail); ctx.lineTo(g.cx - px * nw, g.cy - py * nw); ctx.closePath(); ctx.fill();
                } else {
                    const head = Math.max(8, nw * 3), bx = g.cx + Math.cos(a) * (len - head), by = g.cy + Math.sin(a) * (len - head);
                    ctx.lineWidth = Math.max(1.5, nw * 0.6); ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(bx, by); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx + px * head * 0.5, by + py * head * 0.5); ctx.lineTo(bx - px * head * 0.5, by - py * head * 0.5); ctx.closePath(); ctx.fill();
                }
                if (p.hub !== false) { ctx.beginPath(); ctx.arc(g.cx, g.cy, numOr(p.hubSize, 7), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = this._panel(); ctx.beginPath(); ctx.arc(g.cx, g.cy, Math.max(1, numOr(p.hubSize, 7) * 0.4), 0, Math.PI * 2); ctx.fill(); }
                ctx.restore();
            }
            // the name
            if (nameH) {
                ctx.font = "500 " + ns + "px " + font; ctx.fillStyle = c.text; ctx.textAlign = "center"; ctx.textBaseline = "top";
                ctx.fillText(this._fit(ctx, t.name, b.w - 8), b.x + b.w / 2, p.namePlace === "bottom" ? b.y + b.h - ns - 2 : b.y + 2);
            }
            ctx.restore();
            if (stale) {
                ctx.save(); ctx.font = "600 10px " + font;
                const s = "Stale · " + fmtDuration(Date.now() - st.lastAt), sw = ctx.measureText(s).width + 10;
                ctx.fillStyle = this.statusColor("neutral");
                ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(b.x + b.w / 2 - sw / 2, b.y + b.h - 18, sw, 16, 8); else ctx.rect(b.x + b.w / 2 - sw / 2, b.y + b.h - 18, sw, 16); ctx.fill();
                ctx.fillStyle = this._onColor(this.statusColor("neutral")); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(s, b.x + b.w / 2, b.y + b.h - 10);
                ctx.restore();
            }
        }

        // a triangle at angle a on radius rr, pointing to the centre (inward) or away from it
        _triangle(ctx, g, a, rr, size, inward) {
            const tipR = inward ? rr : rr, baseR = inward ? rr + size : rr - size, half = size * 0.6;
            const px = -Math.sin(a), py = Math.cos(a);
            const tx = g.cx + Math.cos(a) * tipR, ty = g.cy + Math.sin(a) * tipR, bx = g.cx + Math.cos(a) * baseR, by = g.cy + Math.sin(a) * baseR;
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx + px * half, by + py * half); ctx.lineTo(bx - px * half, by - py * half); ctx.closePath(); ctx.fill();
        }

        render() {
            const p = this.p, bg = this._tok(p.background), demo = this.itemList().some((t) => this._state(t).demo);
            return html`
                <div class="gauge-wrap" part="chart" style=${bg ? "background:" + bg : ""}>
                    <div class="plot" @pointermove=${(e) => this._move(e)} @click=${(e) => this._click(e)}>
                        <canvas></canvas>
                        <div class="corner">${this._renderMenu()}</div>
                        ${this._renderSampleBadge(demo)}
                    </div>
                </div>`;
        }
    }
});
