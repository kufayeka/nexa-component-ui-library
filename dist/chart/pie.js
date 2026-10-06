// Nexa UI — Pie / Donut: parts of a whole (downtime by reason, energy by area, output by product).
//
// The rules of a good pie are its defaults (each can be turned off): it starts at 12 o'clock and runs clockwise, the
// largest slice first; past the top N (or below a %) the rest is ONE grey "Others" slice, always last (a click opens it);
// a donut's centre says the total (or a slice, or a text; the slice under the pointer while hovered); a slice is never
// left without its label: inside when it fits, else outside on a leader line, the labels on each side moved apart so they
// never overlap (a radius made room for them first: the labels are measured, then the pie is sized).
// DATA: SLICES, the items of the shared value model (readout.js: a Logic target each, a live tag, the figure over a
// window, stale), and/or ROWS from a query ([{ reason, minutes }]) mapped to a name and a value, split into several pies
// side by side by a field (small multiples). A listed slice styles the row of the same name (its colour, its status).
import { html, css, formatValue } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, part, defineUI } from "../core.js";
import { chartCommon } from "./core.js";
import { exportProps } from "./props.js";
import { legendProps, legendTemplate, legendPlace, fillLegend } from "./legend.js";
import { ReadoutElement, STATUSES, readoutFields, itemsProp, itemDefaults, opt, numOr } from "./readout.js";
import { xlsxBlob } from "./export.js";

const TAU = Math.PI * 2;
const all = readoutFields("slice");
// a slice: a name, its value (live / Logic / a row), its number format, its colour or status
const SLICE_FIELDS = {};
["name", "id", "visible", "live", "reduceBy", "window", "maxPoints", "staleAfter", "unit", "notation", "decimals", "color"].forEach((k) => { SLICE_FIELDS[k] = all[k]; });
SLICE_FIELDS.status = { type: "enum", section: "Colour", label: "Or a status colour", default: "", options: opt([["", "None (the colour above / the palette)"]].concat(STATUSES.filter((s) => s[0] !== "custom"))), help: "Running green, Stopped red: the theme's status colours." };
const PIE_STATS = [["value", "Value", "Value"], ["percent", "% of the whole", "%"]];

const slicesProp = itemsProp({ group: "Slices", label: "Slices", noun: "slice", prefix: "s", fields: SLICE_FIELDS, click: "click",
    help: "Each slice its own Update node, live value and events; or leave them out and give Rows. A slice whose name (or Id) is a row's name styles that row (its colour, its status)." });
slicesProp.default = ["Running", "Idle", "Stopped", "Setup"].map((n, i) => Object.assign(itemDefaults(SLICE_FIELDS), { id: "s" + (i + 1), name: n }));

export const pie = defineUI({
    ...chartCommon,
    id: PREFIX + "pie",
    label: "Pie / Donut",
    icon: "fa fa-pie-chart",
    size: { w: 420, h: 280 },
    help: "Parts of a whole: from the top clockwise, the largest first, the small ones as Others (a click opens it), a label for every slice (outside on a leader when it does not fit), a donut's centre for the total. Slices from Logic or rows from a query; several pies side by side.",
    version: 1,

    groups: ["Slices", "Data", "Order", "Shape", "Labels", "Centre", "Legend", "Colour", "General", "Export"],

    properties: {
        slices: slicesProp,

        rows: { type: "json", group: "Data", label: "Rows", default: [], help: "An array of objects from a query or a variable: [{ \"reason\": \"Jam\", \"minutes\": 42 }]. Logic's Set rows does the same." },
        nameField: { type: "string", group: "Data", label: "Name field", default: "name", bindable: false },
        valueField: { type: "string", group: "Data", label: "Value field", default: "value", bindable: false },
        groupField: { type: "string", group: "Data", label: "A pie per (field)", default: "", bindable: false, help: "Several pies side by side, one per value of this field (the downtime of each machine)." },
        aggregate: { type: "enum", group: "Data", label: "Rows with the same name", default: "sum", options: opt([["sum", "Add up"], ["avg", "Average"], ["max", "Maximum"], ["last", "The last"], ["count", "Count"]]) },

        sort: { type: "enum", group: "Order", label: "Order", default: "desc", options: opt([["desc", "Largest first (recommended)"], ["asc", "Smallest first"], ["none", "As they come"]]) },
        startAngle: { type: "number", group: "Order", label: "Start at", default: 0, min: -180, max: 360, step: 5, unit: "°", help: "0 = 12 o'clock (recommended); clockwise." },
        topN: { type: "number", group: "Order", label: "Slices shown (the rest: Others)", default: 6, min: 0, max: 100, step: 1, help: "0 = every slice. 5 – 7 read well." },
        othersBelow: { type: "number", group: "Order", label: "Also into Others: below", default: 0, min: 0, max: 50, step: 0.5, unit: "%", help: "A slice smaller than this share joins Others too. 0 = none." },
        othersName: { type: "string", group: "Order", label: "Its name", default: "Others" },
        othersColor: { type: "color", group: "Order", label: "Its colour", default: "", tokens: "colors", help: "Empty: the theme's neutral grey." },
        othersOpen: { type: "boolean", group: "Order", label: "A click on Others shows what is in it", default: true },

        kind: { type: "enum", group: "Shape", label: "Shape", default: "donut", options: opt([["donut", "Donut"], ["pie", "Pie"]]) },
        ringWidth: { type: "number", group: "Shape", label: "Ring width", default: 34, min: 8, max: 90, unit: "% of the radius", visibleWhen: (p) => p.kind !== "pie" },
        half: { type: "boolean", group: "Shape", label: "A half (180°, opening down)", default: false },
        padAngle: { type: "number", group: "Shape", label: "Space between slices", default: 1, min: 0, max: 10, step: 0.5, unit: "°" },
        radius: { type: "number", group: "Shape", label: "Corner radius", default: 2, min: 0, max: 20, unit: "px" },
        hoverLift: { type: "boolean", group: "Shape", label: "A hovered slice moves out a little", default: true },
        columns: { type: "number", group: "Shape", label: "Pies side by side: columns", default: 0, min: 0, max: 12, step: 1, help: "0 = as many as fit.", visibleWhen: (p) => !!p.groupField },

        labelShow: {
            type: "enum", group: "Labels", label: "A label shows", default: "name-percent",
            options: opt([["name-percent", "The name and the %"], ["percent", "The %"], ["value", "The value"], ["percent-value", "The % and the value"], ["name", "The name"], ["all", "The name, the % and the value"], ["none", "Nothing"]])
        },
        labelPlace: { type: "enum", group: "Labels", label: "Where", default: "auto", options: opt([["auto", "Inside when it fits, else outside on a line"], ["outside", "Outside on a line"], ["inside", "Inside (only where it fits)"]]) },
        labelSize: { type: "number", group: "Labels", label: "Size", default: 11, min: 7, max: 24, unit: "px" },
        percentDecimals: { type: "enum", group: "Labels", label: "% decimals", default: "1", options: opt([["0", "0"], ["1", "1"], ["2", "2"]]) },

        center: { type: "enum", group: "Centre", label: "The donut's centre", default: "total", options: opt([["total", "The total"], ["slice", "A slice (its %)"], ["text", "A text"], ["none", "Nothing"]]), visibleWhen: (p) => p.kind !== "pie" },
        centerSlice: { type: "string", group: "Centre", label: "The slice (name or Id)", default: "", bindable: false, visibleWhen: (p) => p.kind !== "pie" && p.center === "slice" },
        centerText: { type: "string", group: "Centre", label: "The text", default: "", visibleWhen: (p) => p.kind !== "pie" && p.center === "text" },
        centerLabel: { type: "string", group: "Centre", label: "A line under it", default: "Total", visibleWhen: (p) => p.kind !== "pie" && p.center !== "none" },
        centerHover: { type: "boolean", group: "Centre", label: "The slice under the pointer while hovered", default: true, visibleWhen: (p) => p.kind !== "pie" },
        unit: { type: "string", group: "Centre", label: "Unit (rows)", default: "", help: "The values' unit when they come from rows (a slice has its own)." },

        ...legendProps({ at: "right", value: "percent", stats: PIE_STATS, what: "slice" }),

        tooltip: { type: "boolean", group: "Colour", label: "Tooltip", default: true },

        background: { type: "color", group: "General", label: "Background", default: "", tokens: "colors", help: "Empty: the theme's panel." },
        border: { type: "boolean", group: "General", label: "Border", default: true },
        title: { type: "string", group: "General", label: "Title", default: "" },
        ...exportProps({ thresholds: false })
    },

    parts: { chart: part("Chart container", "chart"), legend: part("Legend", "legend") },

    events: {
        sliceClick: { label: "On Slice Click", payload: { name: "string", value: "number", percent: "number", group: "string", id: "string" }, help: "A click on any slice (a listed one also fires its own On Click): drill down to that reason, that area." },
        sliceToggle: { label: "On Slice Toggle", payload: { name: "string", visible: "boolean" }, help: "The viewer hid / showed a slice in the legend." }
    },
    actions: {
        setRows: { label: "Set rows", help: "Replaces the rows: [{ name, value }] (the Data fields map them).", example: "[{ \"name\": \"Jam\", \"value\": 42 }, { \"name\": \"Setup\", \"value\": 18 }]" },
        clearAll: { label: "Clear every slice" },
        exportData: { label: "Export (download)", params: { format: "string" }, example: "{ \"format\": \"xlsx\" }  (csv | xlsx | png)" }
    },

    view: class extends ReadoutElement {
        static styles = [...ReadoutElement.styles, css`
            .pie-wrap { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden;
                border-radius: var(--r, 4px); background: var(--panel, #181b1f); border: 1px solid var(--bd, #2c3235); }
            .pie-wrap.borderless { border-color: transparent; }
            .pie-head { flex: 0 0 auto; padding: 10px 14px 0; font-size: 14px; font-weight: 600; color: var(--fg); }
            .pie-wrap .plot { cursor: default; }
            .pie-wrap .plot.over-item { cursor: pointer; }
            .back-chip { position: absolute; right: 34px; top: 6px; z-index: 5; }
            .pie-tip { position: absolute; pointer-events: none; z-index: 6; display: none; padding: 6px 9px; border-radius: 4px; background: var(--panel, #181b1f); border: 1px solid var(--bd, #2c3235);
                color: var(--fg, #fff); font: 12px/1.4 var(--nexa-fonts-body, sans-serif); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); white-space: nowrap; }
            .pie-tip b { font-weight: 600; }
        `];

        _rowsData = null;       // rows from Set rows (else the Rows prop)
        _hiddenSlices = new Set();
        _hover = null;          // { pie, key }
        _open = null;           // a pie's Others opened: its group
        _pies = [];             // drawn: [{ group, cx, cy, r, ri, slices: [{ key, a0, a1, … }] }]

        get itemsKey() { return "slices"; }
        get itemFields() { return SLICE_FIELDS; }
        get clickEvent() { return "click"; }

        setRows(params) { const r = Array.isArray(params) ? params : params && Array.isArray(params.rows) ? params.rows : null; if (r) { this._rowsData = r; this.scheduleDraw(); this.requestUpdate(); } }
        clearAll() { super.clearAll(); this._rowsData = []; this.scheduleDraw(); this.requestUpdate(); }

        _rows() { const r = this._rowsData || this.p.rows; return Array.isArray(r) ? r : []; }
        _hasData() { return super._hasData() || this._rows().length > 0; }

        // the item a name styles (by Id or name)
        _itemFor(name) { return this.itemList().find((t) => t.id === name || t.name === name) || null; }

        // the pies: [{ group, slices: [{ key, name, value, t }] }], from the rows (grouped) or else the slices' values
        _groups() {
            const rows = this._rows(), p = this.p;
            if (rows.length) {
                const nf = p.nameField || "name", vf = p.valueField || "value", gf = p.groupField || "", how = p.aggregate || "sum";
                const groups = new Map();
                for (const r of rows) {
                    if (!r || typeof r !== "object") continue;
                    const g = gf ? String(r[gf] === undefined || r[gf] === null ? "" : r[gf]) : "", n = String(r[nf] === undefined || r[nf] === null ? "" : r[nf]), v = Number(r[vf]);
                    if (!n || (how !== "count" && !Number.isFinite(v))) continue;
                    if (!groups.has(g)) groups.set(g, new Map());
                    const m = groups.get(g), e = m.get(n) || { sum: 0, n: 0, max: -Infinity, last: NaN };
                    if (Number.isFinite(v)) { e.sum += v; e.max = Math.max(e.max, v); e.last = v; }
                    e.n++;
                    m.set(n, e);
                }
                return Array.from(groups.entries()).map(([group, m]) => ({ group, slices: Array.from(m.entries()).map(([name, e]) => {
                    const t = this._itemFor(name);
                    return { key: name, name: t && t.name ? t.name : name, value: how === "avg" ? e.sum / e.n : how === "max" ? e.max : how === "last" ? e.last : how === "count" ? e.n : e.sum, t };
                }) }));
            }
            const slices = this.itemList().filter((t) => t.visible !== false).map((t) => ({ key: t._key, name: t.name || t.id, value: this._figure(t, this._state(t)).v, t }));
            return [{ group: "", slices }];
        }

        // a slice's colour: its own (hex / token), its status, else the palette by its place in the list (a listed slice keeps its own place)
        _sliceColor(s, i) {
            if (s.others) return this._tok(this.p.othersColor) || this.statusColor("neutral");
            const t = s.t;
            if (t && this._tok(t.color)) return this._tok(t.color);
            if (t && t.status) return this.statusColor(t.status);
            return this.seriesColor(t ? t._i : i);
        }

        // what a pie shows: positive values, sorted, the top N and below a % folded into Others (last); hidden ones out
        _plan(group) {
            const p = this.p;
            let list = group.slices.filter((s) => Number.isFinite(s.value) && s.value > 0 && !this._hiddenSlices.has(s.key));
            const order = new Map(group.slices.map((s, i) => [s.key, i]));
            if (p.sort === "desc") list.sort((a, b) => b.value - a.value);
            else if (p.sort === "asc") list.sort((a, b) => a.value - b.value);
            const total = list.reduce((a, s) => a + s.value, 0);
            if (this._open !== group.group) {
                const N = Math.floor(numOr(p.topN, 6)), below = numOr(p.othersBelow, 0) / 100;
                const keep = [], rest = [];
                // the largest N stay (in the order chosen); a share below the limit joins Others
                const big = new Set(list.slice().sort((a, b) => b.value - a.value).slice(0, N > 0 ? N : list.length).map((s) => s.key));
                list.forEach((s) => ((big.has(s.key) && !(below > 0 && total > 0 && s.value / total < below)) ? keep : rest).push(s));
                if (rest.length > 1 || (rest.length === 1 && N > 0 && list.length > N)) list = keep.concat([{ key: "\u0000others", name: p.othersName || "Others", value: rest.reduce((a, s) => a + s.value, 0), others: rest }]);
                else list = keep.concat(rest);
            }
            list.forEach((s) => { s.color = this._sliceColor(s, order.has(s.key) ? order.get(s.key) : 0); s.percent = total > 0 ? s.value / total : 0; });
            return { list, total };
        }

        _fmtValue(s) { const t = s.t; return formatValue(s.value, t ? this._spec(t) : {}, (t && t.unit) || this.p.unit || ""); }
        _fmtPct(x) { return formatValue(x * 100, { decimals: this.p.percentDecimals || "1" }, "") + " %"; }

        // a slice's label (as Labels › A label shows)
        _labelOf(s) {
            const how = this.p.labelShow || "name-percent", pc = this._fmtPct(s.percent), v = this._fmtValue(s);
            return how === "none" ? "" : how === "name" ? s.name : how === "percent" ? pc : how === "value" ? v : how === "percent-value" ? pc + " · " + v : how === "all" ? s.name + " · " + pc + " · " + v : s.name + " " + pc;
        }

        _drawInto(ctx, w, h) {
            this._fresh(ctx, w, h);
            const groups = this._groups().filter((g) => g.slices.length);
            this._pies = [];
            this._rects = [];
            if (!groups.length) return;
            const boxes = this._grid(groups.length, w, h, this.p.columns, 12, 200);
            groups.forEach((g, i) => this._drawPie(ctx, g, boxes[i]));
            if (!this._exporting) {
                const first = this._pies[0];
                fillLegend(this.renderRoot, (key, k) => {
                    const list = first ? first.plan.list : [], inOthers = list.filter((x) => x.others).reduce((a, x) => a.concat(x.others), []);
                    const s = list.find((x) => x.key === key) || inOthers.find((x) => x.key === key);
                    if (s && !Number.isFinite(s.percent)) s.percent = first.plan.total > 0 ? s.value / first.plan.total : 0;
                    return !s ? "" : k === "percent" ? this._fmtPct(s.percent) : this._fmtValue(s);
                });
            }
        }

        _drawPie(ctx, g, b) {
            const p = this.p, c = this._colors(), font = c.font, plan = this._plan(g), list = plan.list;
            const ls = numOr(p.labelSize, 11), lineH = ls + 4, multi = !!(p.groupField && this._rows().length);
            const titleH = multi ? ls + 8 : 0;
            if (multi) { ctx.font = "600 " + (ls + 1) + "px " + font; ctx.fillStyle = c.strong; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(this._fit(ctx, g.group || "—", b.w), b.x + b.w / 2, b.y + 2); }
            if (!list.length || !(plan.total > 0)) return;
            // the labels first: the widest outside label sets the room around the pie
            ctx.font = "500 " + ls + "px " + font;
            const labels = list.map((s) => this._labelOf(s)), place = p.labelPlace || "auto";
            const half = !!p.half, start = (numOr(p.startAngle, 0) - 90) * Math.PI / 180, sweep = half ? Math.PI : TAU;
            const a0 = half ? Math.PI : start;
            const outW = place === "inside" || p.labelShow === "none" ? 0 : Math.min(b.w * 0.32, Math.max(0, ...labels.map((l) => ctx.measureText(l).width)) + 22);
            const availW = b.w - outW * 2 - 8, availH = (b.h - titleH - (outW ? lineH * 2 : 8)) / (half ? 1 : 2);
            const r = Math.max(10, Math.min(availW / 2, half ? availH : availH));
            const cx = b.x + b.w / 2, cy = half ? b.y + titleH + (b.h - titleH) / 2 + r / 2 : b.y + titleH + (b.h - titleH) / 2;
            const donut = p.kind !== "pie", ri = donut ? r * (1 - Math.max(0.08, Math.min(0.9, numOr(p.ringWidth, 34) / 100))) : 0;
            const pad = (numOr(p.padAngle, 1) * Math.PI) / 180, rad = numOr(p.radius, 2);
            const pie = { group: g.group, cx, cy, r, ri, plan, slices: [] };
            this._pies.push(pie);
            // the slices
            let a = a0;
            list.forEach((s, i) => {
                const span = s.percent * sweep, s0 = a, s1 = a + span;
                a = s1;
                const hov = this._hover && this._hover.pie === g.group && this._hover.key === s.key;
                const lift = hov && p.hoverLift !== false ? Math.min(8, r * 0.05) : 0, mid = (s0 + s1) / 2;
                const ox = Math.cos(mid) * lift, oy = Math.sin(mid) * lift;
                const p0 = s0 + Math.min(pad / 2, span / 4), p1 = s1 - Math.min(pad / 2, span / 4);
                ctx.save();
                ctx.fillStyle = s.color;
                if (this._hover && !hov) ctx.globalAlpha = 0.75;
                this._sector(ctx, cx + ox, cy + oy, r, ri, p0, Math.max(p0 + 0.002, p1), rad);
                ctx.fill();
                ctx.restore();
                pie.slices.push({ key: s.key, s, a0: s0, a1: s1 });
            });
            // the labels: inside where they fit; else outside on a leader, each side moved apart
            if (p.labelShow !== "none") {
                const outside = [];
                ctx.font = "500 " + ls + "px " + font;
                pie.slices.forEach((q, i) => {
                    const text = labels[i];
                    if (!text) return;
                    const mid = (q.a0 + q.a1) / 2, rm = donut ? (r + ri) / 2 : r * 0.62, arc = (q.a1 - q.a0) * rm, tw = ctx.measureText(text).width;
                    const band = donut ? r - ri : r * 0.55;
                    const fits = arc > tw + 6 && band > ls + 4 && tw + 6 < band * 1.9 * Math.max(0.55, Math.abs(Math.sin(mid)) + (donut ? 0 : 0.6));
                    if (place === "inside" ? fits : place === "auto" && fits) {
                        ctx.fillStyle = this._onColor(q.s.color); ctx.textAlign = "center"; ctx.textBaseline = "middle";
                        ctx.fillText(text, cx + Math.cos(mid) * rm, cy + Math.sin(mid) * rm);
                    } else if (place !== "inside") outside.push({ q, text, mid, side: Math.cos(mid) >= 0 ? 1 : -1, y: cy + Math.sin(mid) * (r + 12) });
                });
                [1, -1].forEach((side) => {
                    const mine = outside.filter((o) => o.side === side).sort((x, y) => x.y - y.y);
                    // apart: each at least a line under the one before, then the column moved up when it runs past the box
                    const top = b.y + titleH + lineH / 2 + 2;
                    let prev = top - lineH;
                    mine.forEach((o) => { o.ly = Math.max(o.y, prev + lineH); prev = o.ly; });
                    const bottom = b.y + b.h - lineH / 2;
                    let over = prev - bottom;
                    for (let k = mine.length - 1; k >= 0 && over > 0; k--) { mine[k].ly = Math.max(top, mine[k].ly - over); over = k > 0 ? mine[k - 1].ly + lineH - mine[k].ly : 0; }
                    mine.forEach((o) => {
                        const ax = cx + Math.cos(o.mid) * (r + 2), ay = cy + Math.sin(o.mid) * (r + 2), ex = cx + side * (r + 12), lx = cx + side * (r + 16);
                        ctx.strokeStyle = this.hexToRgba(o.q.s.color, 0.9); ctx.lineWidth = 1;
                        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, o.ly); ctx.lineTo(lx, o.ly); ctx.stroke();
                        ctx.fillStyle = c.strong; ctx.textAlign = side > 0 ? "left" : "right"; ctx.textBaseline = "middle";
                        ctx.fillText(this._fit(ctx, o.text, outW - 20), lx + side * 3, o.ly);
                    });
                });
            }
            // the donut's centre: the total, a slice, a text; the hovered slice while hovered
            if (donut && p.center !== "none" && ri > 20) {
                let big = "", small = "";
                const hov = p.centerHover !== false && this._hover && this._hover.pie === g.group ? list.find((s) => s.key === this._hover.key) : null;
                if (hov) { big = this._fmtPct(hov.percent); small = hov.name + " · " + this._fmtValue(hov); }
                else if (p.center === "slice") { const s = list.find((x) => x.key === p.centerSlice || x.name === p.centerSlice) || list[0]; big = this._fmtPct(s.percent); small = p.centerLabel || s.name; }
                else if (p.center === "text") { big = p.centerText || ""; small = p.centerLabel || ""; }
                else { const t0 = list.find((s) => s.t) ; big = formatValue(plan.total, t0 && t0.t ? this._spec(t0.t) : {}, (t0 && t0.t && t0.t.unit) || p.unit || ""); small = p.centerLabel || ""; }
                const boxW = ri * 1.6, size = this._fitSize(ctx, big, boxW, ri * (small ? 0.55 : 0.8), "600", font, 9, 64);
                const cyy = half ? cy - size * 0.6 : cy - (small ? size * 0.25 : 0);
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.font = "600 " + size + "px " + font; ctx.fillStyle = c.strong; ctx.fillText(big, cx, cyy);
                if (small) { ctx.font = "500 " + Math.max(9, Math.round(size * 0.36)) + "px " + font; ctx.fillStyle = c.text; ctx.fillText(this._fit(ctx, small, boxW), cx, cyy + size * 0.62); }
            }
            this._rects.push({ t: null, x: b.x, y: b.y, w: b.w, h: b.h, pie });
        }

        // a ring sector (a pie slice when ri = 0), the outer corners rounded a little
        _sector(ctx, cx, cy, r, ri, a0, a1, rad) {
            ctx.beginPath();
            const cr = Math.min(rad, (a1 - a0) * r / 3, (r - ri) / 3);
            if (cr > 0.5 && ctx.arcTo) {
                ctx.moveTo(cx + Math.cos(a0) * (ri || 0), cy + Math.sin(a0) * (ri || 0));
                const o0x = cx + Math.cos(a0) * r, o0y = cy + Math.sin(a0) * r;
                const aIn = a0 + cr / r, aOut = a1 - cr / r;
                ctx.lineTo(cx + Math.cos(a0) * (r - cr), cy + Math.sin(a0) * (r - cr));
                ctx.arcTo(o0x, o0y, cx + Math.cos(aIn) * r, cy + Math.sin(aIn) * r, cr);
                ctx.arc(cx, cy, r, aIn, Math.max(aIn, aOut));
                const o1x = cx + Math.cos(a1) * r, o1y = cy + Math.sin(a1) * r;
                ctx.arcTo(o1x, o1y, cx + Math.cos(a1) * (r - cr), cy + Math.sin(a1) * (r - cr), cr);
            } else {
                ctx.moveTo(cx + Math.cos(a0) * (ri || 0), cy + Math.sin(a0) * (ri || 0));
                ctx.arc(cx, cy, r, a0, a1);
            }
            if (ri > 0) ctx.arc(cx, cy, ri, a1, a0, true); else ctx.lineTo(cx, cy);
            ctx.closePath();
        }

        // the slice under a point: { pie, slice }
        _sliceAt(e) {
            const plot = this._plotEl();
            if (!plot) return null;
            const rr = plot.getBoundingClientRect(), k = rr.width / (plot.clientWidth || 1) || 1;
            const x = (e.clientX - rr.left) / k, y = (e.clientY - rr.top) / k;
            for (const pie of this._pies) {
                const dx = x - pie.cx, dy = y - pie.cy, d = Math.hypot(dx, dy);
                if (d > pie.r + 6 || d < pie.ri - 2) continue;
                let a = Math.atan2(dy, dx);
                for (const q of pie.slices) { let t = a; while (t < q.a0) t += TAU; while (t > q.a0 + TAU) t -= TAU; if (t >= q.a0 && t <= q.a1) return { pie, q }; }
            }
            return null;
        }

        _move(e) {
            const hit = this._sliceAt(e), plot = this._plotEl(), key = hit ? hit.pie.group + "\u0001" + hit.q.key : "";
            if (plot) plot.classList.toggle("over-item", !!hit && !this.isEditor);
            if (key !== (this._hover ? this._hover.pie + "\u0001" + this._hover.key : "")) { this._hover = hit ? { pie: hit.pie.group, key: hit.q.key } : null; this.draw(); }
            const tip = this.renderRoot.querySelector(".pie-tip");
            if (!tip) return;
            if (!hit || this.p.tooltip === false) { tip.style.display = "none"; return; }
            const s = hit.q.s, rank = hit.pie.plan.list.filter((x) => !x.others).indexOf(s) + 1;
            const inside = s.others ? "<br>" + s.others.slice(0, 8).map((o) => this._esc(o.name) + ": " + this._esc(this._fmtValue(o))).join("<br>") + (s.others.length > 8 ? "<br>…" : "") : "";
            tip.innerHTML = "<b>" + this._esc(s.name) + "</b> · " + this._esc(this._fmtPct(s.percent)) + "<br>" + this._esc(this._fmtValue(s)) + (rank > 0 ? "  (#" + rank + ")" : "") + inside;
            const plotR = plot.getBoundingClientRect(), k = plotR.width / (plot.clientWidth || 1) || 1;
            tip.style.display = "block";
            tip.style.left = Math.min(plot.clientWidth - tip.offsetWidth - 4, (e.clientX - plotR.left) / k + 12) + "px";
            tip.style.top = Math.max(4, (e.clientY - plotR.top) / k - tip.offsetHeight - 8) + "px";
        }
        _leave() { if (this._hover) { this._hover = null; this.draw(); } const tip = this.renderRoot.querySelector(".pie-tip"); if (tip) tip.style.display = "none"; }
        _esc(t) { return String(t === undefined || t === null ? "" : t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]); }

        _click(e) {
            const hit = this._sliceAt(e);
            if (!hit) return;
            const s = hit.q.s;
            // Others: opened (its slices shown), even in the editor
            if (s.others && this.p.othersOpen !== false) { this._open = hit.pie.group; this._hover = null; this.draw(); this.requestUpdate(); return; }
            if (this.isEditor) return;
            const payload = { name: s.name, value: s.value, percent: Math.round(s.percent * 10000) / 100, group: hit.pie.group, id: s.t ? s.t.id || "" : "" };
            this.emit("sliceClick", payload);
            if (s.t) this.emit("click", { value: s.value, name: s.name }, this._target(s.t));
        }
        _closeOthers() { this._open = null; this.draw(); this.requestUpdate(); }

        _toggleSlice(key, ev) {
            const first = this._groups()[0], names = first ? first.slices.map((s) => s.key) : [];
            if (ev && (ev.altKey || ev.metaKey)) {
                const alone = names.every((k) => k === key || this._hiddenSlices.has(k)) && !this._hiddenSlices.has(key);
                names.forEach((k) => { if (k !== key) { if (alone) this._hiddenSlices.delete(k); else this._hiddenSlices.add(k); } });
                this._hiddenSlices.delete(key);
            } else if (this._hiddenSlices.has(key)) this._hiddenSlices.delete(key); else this._hiddenSlices.add(key);
            if (!this.isEditor) this.emit("sliceToggle", { name: key, visible: !this._hiddenSlices.has(key) });
            this.draw(); this.requestUpdate();
        }

        exportData(params) {
            const o = this._exportOpts(params);
            if (o.format === "png") return this.exportPNG();
            const head = ["Group", "Slice", "Value", "%"], rows = [];
            for (const g of this._groups()) { const plan = this._plan(g); for (const s of plan.list) rows.push([g.group, s.name, s.value, Math.round(s.percent * 10000) / 100]); }
            let blob;
            if (o.format === "xlsx") blob = xlsxBlob(head, rows, false, { textCols: [0, 1] });
            else {
                const q = (x) => '"' + String(x).replace(/"/g, '""') + '"';
                blob = new Blob(["﻿" + [head.map(q).join(",")].concat(rows.map((r) => r.map((x) => (typeof x === "number" ? String(x) : q(x))).join(","))).join("\r\n")], { type: "text/csv;charset=utf-8" });
            }
            const name = this._getExportFileName(o.format, "all");
            this._download(blob, name);
            this._lastExport = { name, blob, rows: rows.length };
            return rows.length;
        }

        render() {
            const p = this.p, bg = this._tok(p.background), demo = this.itemList().some((t) => this._state(t).demo) && !this._rows().length;
            const first = this._groups()[0];
            const entries = first ? first.slices.map((s, i) => ({ key: s.key, name: s.name, color: this._sliceColor(s, i), off: this._hiddenSlices.has(s.key), swatch: "square" })) : [];
            const { at, inside } = legendPlace(p);
            const legend = legendTemplate(p, entries, (e, ev) => this._toggleSlice(e.key, ev), { stats: PIE_STATS, head: "Slice" });
            return html`
                <div class="pie-wrap ${p.border === false ? "borderless" : ""}" part="chart" style=${bg ? "background:" + bg : ""}>
                    ${p.title ? html`<div class="pie-head">${p.title}</div>` : ""}
                    ${at === "top" ? legend : ""}
                    <div class="c-main">
                        ${at === "left" ? legend : ""}
                        <div class="plot" @pointermove=${(e) => this._move(e)} @pointerleave=${() => this._leave()} @click=${(e) => this._click(e)}>
                            <canvas></canvas>
                            ${this._open !== null ? html`<button class="btn-chip back-chip" @click=${(e) => { e.stopPropagation(); this._closeOthers(); }}>‹ ${p.othersName || "Others"}</button>` : ""}
                            <div class="corner" style="right:8px">${this._renderMenu()}</div>
                            <div class="pie-tip"></div>
                            ${inside ? legend : ""}
                            ${this._renderSampleBadge(demo)}
                        </div>
                        ${at === "right" ? legend : ""}
                    </div>
                    ${at === "bottom" ? legend : ""}
                </div>`;
        }
    }
});
