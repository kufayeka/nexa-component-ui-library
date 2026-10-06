// Nexa UI — Bar Gauge: a bar per value, many at once (the level of 12 tanks, the load of every motor, a line's OEE parts).
//
// A BAR is an item of the shared value model (readout.js: a Logic target, its live value and history, the figure over a
// window, value texts, delta, target / setpoint / normal band, threshold steps, stale, soft min / max, the peak ghost).
// What the bar gauge adds:
//   - horizontal (the name left, the value right) or vertical (a tank: the name under it, the value above);
//   - three looks (Grafana's): BASIC (a bar in its step's colour), GRADIENT (the steps' colours along the bar up to the
//     value), LCD (lit segments, each in the colour of the step it is in);
//   - the track (the part not reached), a zone strip along it (the steps), ticks (automatic, a step, a list) and their
//     labels on a shared scale; the target and the setpoint across the bar, the peak over the window;
//   - sorted by value or name, the top N.
// One canvas (sharp in print and PNG). With the Gauge it replaces the old Gauge & Meter (its linear mode).
import { html, css, formatValue } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, part, defineUI } from "../core.js";
import { chartCommon, DASHES } from "./core.js";
import { exportProps } from "./props.js";
import { ReadoutElement, STATUSES, readoutFields, scaleFields, itemsProp, stepsProp, scaleTicks, opt, numOr } from "./readout.js";

const BAR_FIELDS = Object.assign({}, readoutFields("bar"), scaleFields());

export const barGauge = defineUI({
    ...chartCommon,
    id: PREFIX + "bar-gauge",
    label: "Bar Gauge",
    icon: "fa fa-tasks",
    size: { w: 420, h: 220 },
    help: "A bar per value, many at once (tanks, motors, lines): basic, gradient or LCD segments, horizontal or vertical, ticks, threshold zones, a target and the peak. Each bar has its own Update node and events.",
    version: 1,

    groups: ["Bars", "Look", "Scale", "Value", "Order", "Thresholds", "General", "Export"],

    properties: {
        bars: itemsProp({ group: "Bars", label: "Bars", noun: "bar", prefix: "b", fields: BAR_FIELDS, click: "barClick",
            help: "One bar per value. Each has its own Update node, message and events in Logic." }),

        // ---- the look ----
        orientation: { type: "enum", group: "Look", label: "Direction", default: "horizontal", options: opt([["horizontal", "Horizontal (the name left, the value right)"], ["vertical", "Vertical (a tank: the name under it)"]]) },
        mode: {
            type: "enum", group: "Look", label: "Mode", default: "gradient",
            options: opt([["basic", "Basic (the colour of its step)"], ["gradient", "Gradient (the steps' colours along the bar)"], ["lcd", "LCD (lit segments)"]])
        },
        barSize: { type: "number", group: "Look", label: "Bar thickness", default: 0, min: 0, max: 120, unit: "px", help: "0 = as thick as the room allows (at most 40 px)." },
        gap: { type: "number", group: "Look", label: "Space between bars", default: 10, min: 0, max: 60, unit: "px" },
        radius: { type: "number", group: "Look", label: "Corner radius", default: 2, min: 0, max: 20, unit: "px" },
        lcdSize: { type: "number", group: "Look", label: "Segment size", default: 6, min: 2, max: 40, unit: "px", visibleWhen: (p) => p.mode === "lcd" },
        lcdGap: { type: "number", group: "Look", label: "Space between segments", default: 2, min: 1, max: 10, unit: "px", visibleWhen: (p) => p.mode === "lcd" },
        track: { type: "boolean", group: "Look", label: "The track (the part not reached)", default: true },
        trackColor: { type: "color", group: "Look", label: "Track colour", default: "", tokens: "colors", help: "Empty: the theme's subtle band.", visibleWhen: (p) => p.track !== false },
        zoneStrip: { type: "boolean", group: "Look", label: "A zone strip along each bar (the steps)", default: false },

        // ---- the scale ----
        ticks: { type: "boolean", group: "Scale", label: "Ticks on the bars", default: false },
        tickStep: { type: "number", group: "Scale", label: "A tick every", default: 0, min: 0, help: "0 = automatic. A list below wins." },
        tickList: { type: "string", group: "Scale", label: "Ticks at (a list)", default: "", bindable: false, help: "0, 25, 50, 80, 100" },
        axis: { type: "boolean", group: "Scale", label: "A scale under the bars", default: true, help: "The labels of the ticks (when every bar has the same min / max); else each bar's min and max at its ends." },
        labelSize: { type: "number", group: "Scale", label: "Label size", default: 10, min: 7, max: 24, unit: "px" },
        tickColor: { type: "color", group: "Scale", label: "Colour", default: "", tokens: "colors", help: "Empty: the theme's muted text." },

        // ---- the value ----
        showName: { type: "boolean", group: "Value", label: "Show the names", default: true },
        nameSize: { type: "number", group: "Value", label: "Name size", default: 12, min: 8, max: 32, unit: "px" },
        nameWidth: { type: "number", group: "Value", label: "Name column (horizontal)", default: 0, min: 0, max: 60, unit: "%", help: "0 = as wide as the longest name (at most 35 %)." },
        showValue: { type: "boolean", group: "Value", label: "Show the values", default: true },
        valueSize: { type: "number", group: "Value", label: "Value size", default: 14, min: 8, max: 48, unit: "px" },
        valueColor: { type: "enum", group: "Value", label: "Value colour", default: "state", options: opt([["state", "The step's colour"], ["text", "The text colour"]]) },

        // ---- the order ----
        sort: { type: "enum", group: "Order", label: "Order", default: "none", options: opt([["none", "As listed"], ["value-desc", "Largest first"], ["value-asc", "Smallest first"], ["name", "By name"]]) },
        topN: { type: "number", group: "Order", label: "Show the top", default: 0, min: 0, max: 200, step: 1, help: "0 = every bar." },

        thresholds: stepsProp("bars", "bar"),
        baseStatus: { type: "enum", group: "Thresholds", label: "Below the first step", default: "neutral", options: opt([["neutral", "The bar's colour"]].concat(STATUSES.filter((s) => s[0] !== "custom" && s[0] !== "neutral"))) },

        background: { type: "color", group: "General", label: "Background", default: "", tokens: "colors", help: "Empty: transparent (the page)." },
        ...exportProps({ thresholds: false })
    },

    parts: { chart: part("Chart container", "chart") },
    events: {},
    actions: {
        clearAll: { label: "Clear every bar" },
        exportData: { label: "Export (download)", params: { format: "string" }, example: "{ \"format\": \"xlsx\" }  (csv | xlsx | png)" }
    },

    view: class extends ReadoutElement {
        static styles = [...ReadoutElement.styles, css`
            .bg-wrap { position: relative; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; border-radius: var(--r, 4px); }
            .bg-wrap .plot { position: absolute; inset: 0; cursor: default; }
            .bg-wrap .plot.over-item { cursor: pointer; }
            .bg-wrap .corner { top: 4px; right: 4px; opacity: 0; transition: opacity 0.15s; }
            .bg-wrap:hover .corner { opacity: 1; }
        `];

        get itemsKey() { return "bars"; }
        get itemFields() { return BAR_FIELDS; }
        get clickEvent() { return "barClick"; }

        // the bars drawn: visible, in the order chosen, the top N
        _ordered() {
            let list = this.itemList().filter((t) => t.visible !== false).map((t) => { const st = this._state(t); return { t, st, v: this._figure(t, st).v }; });
            const sort = this.p.sort, val = (x) => (Number.isFinite(x.v) ? x.v : -Infinity);
            if (sort === "value-desc") list.sort((a, b) => val(b) - val(a));
            else if (sort === "value-asc") list.sort((a, b) => val(a) - val(b));
            else if (sort === "name") list.sort((a, b) => String(a.t.name).localeCompare(String(b.t.name)));
            const n = Math.floor(numOr(this.p.topN, 0));
            if (n > 0) list = list.slice(0, n);
            return list;
        }

        _drawInto(ctx, w, h) {
            this._fresh(ctx, w, h);
            const p = this.p, c = this._colors(), font = c.font, list = this._ordered();
            this._rects = [];
            if (!list.length) return;
            const vertical = p.orientation === "vertical";
            const ns = numOr(p.nameSize, 12), vs = numOr(p.valueSize, 14), lab = numOr(p.labelSize, 10), gap = Math.max(0, numOr(p.gap, 10));
            const ranges = list.map((x) => this._range(x.t, x.st, x.v));
            const shared = ranges.every((r) => r.lo === ranges[0].lo && r.hi === ranges[0].hi);
            const axis = p.axis !== false && shared;
            ctx.font = "500 " + ns + "px " + font;
            const nameW = p.showName === false ? 0 : numOr(p.nameWidth, 0) > 0 ? (w * Math.min(60, numOr(p.nameWidth, 0))) / 100 : Math.min(w * 0.35, Math.max(...list.map((x) => ctx.measureText(x.t.name || "").width)) + 12);
            ctx.font = "600 " + vs + "px " + font;
            const valueW = p.showValue === false ? 0 : Math.max(...list.map((x) => ctx.measureText(this._valueLabel(x.t, x.v)).width)) + 10;
            const n = list.length;
            if (!vertical) {
                // a row per bar: the name | the bar | the value; the scale under the last row
                const axisH = axis ? lab + 8 + (p.zoneStrip ? 6 : 0) : 0;
                const x0 = nameW + (nameW ? 4 : 0), x1 = w - valueW - 4, bw = Math.max(20, x1 - x0);
                const rowH = (h - axisH - gap * (n - 1)) / n, thick = Math.max(4, Math.min(numOr(p.barSize, 0) > 0 ? numOr(p.barSize, 0) : 40, rowH - (shared ? 0 : lab + 2)));
                list.forEach((x, i) => {
                    const y = i * (rowH + gap), r = ranges[i], by = y + (rowH - thick) / 2;
                    const box = { x: x0, y: by, w: bw, h: thick, horizontal: true };
                    this._rects.push({ t: x.t, x: 0, y, w, h: rowH });
                    this._bar(ctx, x, r, box, c);
                    if (nameW) { ctx.font = "500 " + ns + "px " + font; ctx.fillStyle = c.strong; ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(this._fit(ctx, x.t.name || "", nameW - 8), nameW - 4, by + thick / 2); }
                    if (valueW) { ctx.font = "600 " + vs + "px " + font; ctx.fillStyle = this._valueColor(x, c); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(this._valueLabel(x.t, x.v), x1 + 8, by + thick / 2); }
                    if (!shared && p.axis !== false) this._ends(ctx, x.t, r, box, lab, c, false);
                });
                if (axis) this._axis(ctx, list[0].t, ranges[0], { x: x0, y: h - axisH + 2, w: bw }, lab, c, false);
            } else {
                // a column per bar: the value above, the bar, the name under it; the scale on the left
                const axisW = axis ? Math.max(...scaleTicks(ranges[0].lo, ranges[0].hi, numOr(p.tickStep, 0), p.tickList, 5).map((v) => { ctx.font = "500 " + lab + "px " + font; return ctx.measureText(this._valueText(v, this._spec(list[0].t), list[0].t._map)).width; })) + 8 : 0;
                const top = p.showValue === false ? 4 : vs + 8, bottom = p.showName === false ? 4 : ns + 8;
                const colW = (w - axisW - gap * (n - 1)) / n, thick = Math.max(4, Math.min(numOr(p.barSize, 0) > 0 ? numOr(p.barSize, 0) : 40, colW));
                const bh = Math.max(20, h - top - bottom);
                list.forEach((x, i) => {
                    const cx = axisW + i * (colW + gap), bx = cx + (colW - thick) / 2, r = ranges[i];
                    const box = { x: bx, y: top, w: thick, h: bh, horizontal: false };
                    this._rects.push({ t: x.t, x: cx, y: 0, w: colW, h });
                    this._bar(ctx, x, r, box, c);
                    if (p.showValue !== false) { ctx.font = "600 " + vs + "px " + font; ctx.fillStyle = this._valueColor(x, c); ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(this._fit(ctx, this._valueLabel(x.t, x.v), colW + gap), cx + colW / 2, top - 4); }
                    if (p.showName !== false) { ctx.font = "500 " + ns + "px " + font; ctx.fillStyle = c.strong; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(this._fit(ctx, x.t.name || "", colW + gap - 2), cx + colW / 2, top + bh + 4); }
                    if (!shared && p.axis !== false) this._ends(ctx, x.t, r, box, lab, c, true);
                });
                if (axis) this._axis(ctx, list[0].t, ranges[0], { x: axisW - 4, y: top, h: bh }, lab, c, true);
            }
        }

        _valueLabel(t, v) { const u = t._map && t._map.has(v) ? "" : t.unit ? " " + t.unit : ""; return this._valueText(v, this._spec(t), t._map) + (Number.isFinite(v) ? u : ""); }
        _valueColor(x, c) { return this.p.valueColor === "text" ? c.strong : this._stateColor(x.t, x.v) || c.strong; }

        // one bar in its box: the track, the zone strip, the fill (basic / gradient / LCD), ticks, target / setpoint / peak
        _bar(ctx, x, r, box, c) {
            const p = this.p, t = x.t, st = x.st, v = x.v, stale = st.stale && !st.demo;
            const span = r.hi - r.lo || 1, frac = (q) => Math.max(0, Math.min(1, (q - r.lo) / span));
            // a point along the bar (0 = its start: left, or the bottom of a vertical bar)
            const pos = (q) => (box.horizontal ? box.x + frac(q) * box.w : box.y + box.h - frac(q) * box.h);
            const len = box.horizontal ? box.w : box.h;
            const steps = this._steps(t), own = this._tok(t.color) || this.seriesColor(t._i);
            const colorAt = (q) => { const s = steps.length ? steps.filter((z) => q >= z.from).pop() : null; return s ? this._statusColor(s.status, s.color) : (this._stateColor(t, q) || own); };
            const rad = Math.min(numOr(p.radius, 2), (box.horizontal ? box.h : box.w) / 2);
            const rect = (x0, y0, ww, hh) => { ctx.beginPath(); if (ctx.roundRect && rad > 0) ctx.roundRect(x0, y0, ww, hh, rad); else ctx.rect(x0, y0, ww, hh); };
            ctx.save();
            if (stale) ctx.globalAlpha = 0.5;
            if (p.track !== false && p.mode !== "lcd") { ctx.fillStyle = this._tok(p.trackColor) || c.band; rect(box.x, box.y, box.w, box.h); ctx.fill(); }
            // the zone strip: the steps along the bar (under a horizontal bar, left of a vertical one)
            if (p.zoneStrip && steps.length) {
                steps.forEach((s, i) => {
                    const a = Math.max(r.lo, s.from), z = i + 1 < steps.length ? Math.min(r.hi, steps[i + 1].from) : r.hi;
                    if (z <= a) return;
                    ctx.fillStyle = this._statusColor(s.status, s.color);
                    if (box.horizontal) ctx.fillRect(pos(a), box.y + box.h + 2, pos(z) - pos(a), 3); else ctx.fillRect(box.x - 5, pos(z), 3, pos(a) - pos(z));
                });
            }
            // the peak over the window: a faint reach and a mark at the highest
            if (t.showPeak && st.buf.count > 1) {
                const pk = this._peak(t, st);
                if (Number.isFinite(pk.hi)) {
                    ctx.fillStyle = this.hexToRgba(this._stateColor(t, pk.hi) || own, 0.18);
                    if (box.horizontal) ctx.fillRect(box.x, box.y, pos(pk.hi) - box.x, box.h); else ctx.fillRect(box.x, pos(pk.hi), box.w, box.y + box.h - pos(pk.hi));
                    ctx.fillStyle = this._stateColor(t, pk.hi) || own;
                    if (box.horizontal) ctx.fillRect(pos(pk.hi) - 1, box.y - 2, 2, box.h + 4); else ctx.fillRect(box.x - 2, pos(pk.hi) - 1, box.w + 4, 2);
                }
            }
            // the fill
            if (Number.isFinite(v)) {
                const reach = frac(v) * len;
                if (p.mode === "lcd") {
                    const seg = Math.max(2, numOr(p.lcdSize, 6)), sg = Math.max(1, numOr(p.lcdGap, 2)), count = Math.max(1, Math.floor((len + sg) / (seg + sg)));
                    const each = (len - sg * (count - 1)) / count;
                    for (let k = 0; k < count; k++) {
                        const from = k * (each + sg), lit = from + each / 2 <= reach, q = r.lo + ((from + each / 2) / len) * span;
                        const col = colorAt(q);
                        ctx.fillStyle = lit ? col : p.track !== false ? this.hexToRgba(col, 0.15) : "transparent";
                        if (box.horizontal) ctx.fillRect(box.x + from, box.y, each, box.h); else ctx.fillRect(box.x, box.y + box.h - from - each, box.w, each);
                    }
                } else {
                    let fill;
                    if (p.mode === "gradient" && steps.length) {
                        const g = box.horizontal ? ctx.createLinearGradient(box.x, 0, box.x + box.w, 0) : ctx.createLinearGradient(0, box.y + box.h, 0, box.y);
                        g.addColorStop(0, colorAt(r.lo));
                        // each step's colour at its start: they blend into each other (Grafana's gradient)
                        steps.forEach((s) => { const f = frac(s.from); if (f > 0 && f < 1) g.addColorStop(f, colorAt(s.from)); });
                        g.addColorStop(1, colorAt(r.hi));
                        fill = g;
                    } else if (p.mode === "gradient") {
                        const col = colorAt(v), g = box.horizontal ? ctx.createLinearGradient(box.x, 0, box.x + reach, 0) : ctx.createLinearGradient(0, box.y + box.h, 0, box.y + box.h - reach);
                        g.addColorStop(0, this.hexToRgba(col, 0.35)); g.addColorStop(1, col); fill = g;
                    } else fill = colorAt(v);
                    ctx.fillStyle = fill;
                    if (reach > 0) { if (box.horizontal) rect(box.x, box.y, reach, box.h); else rect(box.x, box.y + box.h - reach, box.w, reach); ctx.fill(); }
                }
            }
            // ticks across the bar
            if (p.ticks) {
                ctx.strokeStyle = this.hexToRgba(this._tok(p.tickColor) || c.text, 0.7); ctx.lineWidth = 1;
                scaleTicks(r.lo, r.hi, numOr(p.tickStep, 0), p.tickList, 5).forEach((q) => {
                    const at = Math.round(pos(q)) + 0.5;
                    ctx.beginPath();
                    if (box.horizontal) { ctx.moveTo(at, box.y + box.h - Math.min(6, box.h / 2)); ctx.lineTo(at, box.y + box.h); } else { ctx.moveTo(box.x, at); ctx.lineTo(box.x + Math.min(6, box.w / 2), at); }
                    ctx.stroke();
                });
            }
            // the target (solid) and the setpoint (dotted) across the bar; the normal band as a thin strip
            const nl = numOr(t.normalLow, NaN), nh = numOr(t.normalHigh, NaN);
            if (Number.isFinite(nl) || Number.isFinite(nh)) {
                ctx.fillStyle = this.hexToRgba(this.statusColor("success"), 0.7);
                const a = pos(Number.isFinite(nl) ? nl : r.lo), z = pos(Number.isFinite(nh) ? nh : r.hi);
                if (box.horizontal) ctx.fillRect(a, box.y - 4, z - a, 2); else ctx.fillRect(box.x + box.w + 2, z, 2, a - z);
            }
            [[numOr(t.target, NaN), []], [numOr(t.setpoint, NaN), DASHES.dotted]].forEach(([q, dash]) => {
                if (!Number.isFinite(q)) return;
                ctx.strokeStyle = c.strong; ctx.lineWidth = 2; ctx.setLineDash(dash);
                const at = pos(q);
                ctx.beginPath();
                if (box.horizontal) { ctx.moveTo(at, box.y - 4); ctx.lineTo(at, box.y + box.h + 4); } else { ctx.moveTo(box.x - 4, at); ctx.lineTo(box.x + box.w + 4, at); }
                ctx.stroke(); ctx.setLineDash([]);
            });
            ctx.restore();
        }

        // the shared scale: the tick labels under the bars (horizontal) or left of them (vertical)
        _axis(ctx, t, r, a, lab, c, vertical) {
            const ticks = scaleTicks(r.lo, r.hi, numOr(this.p.tickStep, 0), this.p.tickList, vertical ? 5 : Math.max(3, Math.floor(a.w / 70)));
            ctx.save(); ctx.font = "500 " + lab + "px " + c.font; ctx.fillStyle = this._tok(this.p.tickColor) || c.text;
            const span = r.hi - r.lo || 1;
            ticks.forEach((q) => {
                const txt = this._valueText(q, this._spec(t), t._map), f = (q - r.lo) / span;
                if (vertical) { ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(txt, a.x, a.y + a.h - f * a.h); }
                else { ctx.textBaseline = "top"; ctx.textAlign = f <= 0.001 ? "left" : f >= 0.999 ? "right" : "center"; ctx.fillText(txt, a.x + f * a.w, a.y); }
            });
            ctx.restore();
        }

        // a bar's own min and max at its ends (bars on different scales)
        _ends(ctx, t, r, box, lab, c, vertical) {
            ctx.save(); ctx.font = "500 " + Math.max(7, lab - 1) + "px " + c.font; ctx.fillStyle = c.text;
            const lo = this._valueText(r.lo, this._spec(t), t._map), hi = this._valueText(r.hi, this._spec(t), t._map);
            if (vertical) { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(hi, box.x + box.w + 3, box.y + 4); ctx.fillText(lo, box.x + box.w + 3, box.y + box.h - 4); }
            else { ctx.textBaseline = "top"; ctx.textAlign = "left"; ctx.fillText(lo, box.x, box.y + box.h + 1); ctx.textAlign = "right"; ctx.fillText(hi, box.x + box.w, box.y + box.h + 1); }
            ctx.restore();
        }

        render() {
            const p = this.p, bg = this._tok(p.background), demo = this.itemList().some((t) => this._state(t).demo);
            return html`
                <div class="bg-wrap" part="chart" style=${bg ? "background:" + bg : ""}>
                    <div class="plot" @pointermove=${(e) => this._move(e)} @click=${(e) => this._click(e)}>
                        <canvas></canvas>
                        <div class="corner">${this._renderMenu()}</div>
                        ${this._renderSampleBadge(demo)}
                    </div>
                </div>`;
        }
    }
});
