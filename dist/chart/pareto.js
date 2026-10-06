// Nexa UI — Pareto: which causes to fix FIRST (downtime by reason, defects by type, scrap by cause).
//
// The rules of a Pareto are built in: the bars largest first (else the cumulative line means nothing), "Others" last
// whatever its size, the cumulative % on its own axis 0 – 100 % ending EXACTLY at 100 % (computed from the sum of the
// values, the last point forced to 1: no rounding drift), a cut-off line (80 % by default: the chart shows the real split,
// it does not assume 80/20) with "4 of 12 causes = 80 %", the VITAL FEW (up to the cut-off) strong and the trivial many
// faded. The left axis can be ALIGNED to the right one (0 .. the total = 0 .. 100 %), as the classic Pareto.
// DATA without any DAX: ROWS from a query ([{ reason, minutes }]) added up per category, or an EVENT LOG ([{ time,
// defect }]) counted per category, over a window (this shift, 24 h, 7 days) when the rows have a time; or the categories
// as items of the shared value model (readout.js: Logic targets, live values). A field splits a bar into its parts (a
// STACKED Pareto: the defects per shift); a field gives a Pareto per group side by side in the SAME category order
// (BEFORE / AFTER: last week and this week).
import { html, css, formatValue } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, part, defineUI } from "../core.js";
import { chartCommon, DASHES } from "./core.js";
import { exportProps } from "./props.js";
import { legendProps, legendTemplate, legendPlace } from "./legend.js";
import { ReadoutElement, STATUSES, readoutFields, itemsProp, opt, numOr } from "./readout.js";
import { niceTicks } from "./stack.js";
import { monotoneSegments } from "./curves.js";
import { toMs } from "./rows.js";
import { spanMs } from "./time.js";
import { xlsxBlob } from "./export.js";

const all = readoutFields("category");
const CAT_FIELDS = {};
["name", "id", "visible", "live", "reduceBy", "window", "maxPoints", "unit", "notation", "decimals", "color"].forEach((k) => { CAT_FIELDS[k] = all[k]; });
CAT_FIELDS.status = { type: "enum", section: "Colour", label: "Or a status colour", default: "", options: opt([["", "None"]].concat(STATUSES.filter((s) => s[0] !== "custom"))) };
const catsProp = itemsProp({ group: "Categories", label: "Categories", noun: "category", prefix: "c", fields: CAT_FIELDS, click: "click",
    help: "Optional: a category of its own (a Logic target with a live value), or one that styles the rows' category of its name (its colour / status). Most Paretos only need Rows." });
catsProp.default = [];
const SAMPLE = [["Jam", 142], ["Changeover", 96], ["No material", 61], ["Maintenance", 44], ["Quality hold", 18], ["Operator break", 9], ["Sensor fault", 6], ["Label printer", 4]];

export const pareto = defineUI({
    ...chartCommon,
    id: PREFIX + "pareto",
    label: "Pareto",
    icon: "fa fa-sort-amount-desc",
    size: { w: 620, h: 320 },
    help: "Which causes to fix first: the bars largest first, the cumulative % to exactly 100 %, an 80 % cut-off, the vital few strong. From rows (added up or an event log counted, over a window), stacked by a field, before / after side by side.",
    version: 1,

    groups: ["Data", "Categories", "Rules", "Bars", "Line", "Axes", "Labels", "Legend", "General", "Export"],

    properties: {
        rows: { type: "json", group: "Data", label: "Rows", default: [], help: "From a query or a variable: [{ \"reason\": \"Jam\", \"minutes\": 42 }], or an event log [{ \"time\": 1727852400000, \"defect\": \"Scratch\" }]. Logic's Set rows / Append rows." },
        catField: { type: "string", group: "Data", label: "Category field", default: "name", bindable: false },
        valueField: { type: "string", group: "Data", label: "Value field", default: "value", bindable: false, help: "Empty: count the rows (an event log: one row per defect)." },
        timeField: { type: "string", group: "Data", label: "Time field", default: "", bindable: false, help: "With a time, the rows can be limited to a window (this shift, 24 h …)." },
        window: { type: "enum", group: "Data", label: "Over", default: "", options: opt([["", "Every row"], ["1h", "The last hour"], ["8h", "The last 8 hours (a shift)"], ["24h", "The last 24 hours"], ["7d", "The last 7 days"], ["30d", "The last 30 days"]]), visibleWhen: (p) => !!p.timeField },
        windowButtons: { type: "boolean", group: "Data", label: "Window buttons above the chart", default: false, visibleWhen: (p) => !!p.timeField, help: "The viewer picks the window (8h, 24h, 7d, 30d, all)." },
        stackField: { type: "string", group: "Data", label: "Split a bar by (field)", default: "", bindable: false, help: "A stacked Pareto: each bar in parts (the defects per shift, per machine)." },
        groupField: { type: "string", group: "Data", label: "A Pareto per (field)", default: "", bindable: false, help: "Before / after: a Pareto per value of this field side by side, in the same category order (the first group's)." },

        categories: catsProp,

        topN: { type: "number", group: "Rules", label: "Categories shown (the rest: Others)", default: 10, min: 0, max: 200, step: 1, help: "0 = every category. Others always last." },
        othersName: { type: "string", group: "Rules", label: "Others is called", default: "Others" },
        cutoff: { type: "number", group: "Rules", label: "Cut-off line", default: 80, min: 0, max: 100, step: 1, unit: "%", help: "0 = none. The vital few: the categories up to it." },
        cutoffLabel: { type: "boolean", group: "Rules", label: "Say where it is cut (\"4 of 12 causes = 80 %\")", default: true },
        vitalFew: { type: "boolean", group: "Rules", label: "The vital few strong, the rest faded", default: true },

        orientation: { type: "enum", group: "Bars", label: "Direction", default: "vertical", options: opt([["vertical", "Vertical (columns)"], ["horizontal", "Horizontal (long names)"]]) },
        barColor: { type: "color", group: "Bars", label: "Bar colour", default: "", tokens: "colors", help: "Empty: the theme's first chart colour. A stacked Pareto: the palette per part." },
        fadedColor: { type: "color", group: "Bars", label: "The trivial many", default: "", tokens: "colors", help: "Empty: the bar colour, faded." },
        othersColor: { type: "color", group: "Bars", label: "Others", default: "", tokens: "colors", help: "Empty: the theme's neutral grey." },
        gap: { type: "number", group: "Bars", label: "Space between bars", default: 25, min: 0, max: 80, step: 5, unit: "%" },
        radius: { type: "number", group: "Bars", label: "Corner radius", default: 2, min: 0, max: 12, unit: "px" },

        line: { type: "enum", group: "Line", label: "The cumulative line", default: "linear", options: opt([["linear", "Straight"], ["smooth", "Smooth"], ["step", "Step"], ["none", "None"]]) },
        lineColor: { type: "color", group: "Line", label: "Colour", default: "", tokens: "colors", help: "Empty: the theme's text colour." },
        lineWidth: { type: "number", group: "Line", label: "Width", default: 2, min: 0.5, max: 8, step: 0.5, unit: "px" },
        lineArea: { type: "boolean", group: "Line", label: "An area under it", default: false },
        lineMarkers: { type: "boolean", group: "Line", label: "Markers", default: true },
        lineLabels: { type: "boolean", group: "Line", label: "The cumulative % at each point", default: false },

        aligned: { type: "boolean", group: "Axes", label: "Align the axes (left 0 – total = right 0 – 100 %)", default: true, help: "The classic Pareto: a bar can be read on the % scale. Off: the left axis fits the largest bar." },
        unit: { type: "string", group: "Axes", label: "Unit", default: "", help: "The values' (min, pcs, €)." },
        decimals: { type: "enum", group: "Axes", label: "Decimals", default: "auto", options: opt([["auto", "Automatic"], ["0", "0"], ["1", "1"], ["2", "2"]]) },
        leftTitle: { type: "string", group: "Axes", label: "Left axis title", default: "" },
        rightTitle: { type: "string", group: "Axes", label: "Right axis title", default: "Cumulative %" },
        grid: { type: "boolean", group: "Axes", label: "Gridlines", default: true },

        labels: { type: "enum", group: "Labels", label: "On a bar", default: "none", options: opt([["none", "Nothing"], ["value", "The value"], ["percent", "Its %"], ["both", "The value and its %"]]) },
        labelSize: { type: "number", group: "Labels", label: "Size", default: 11, min: 7, max: 24, unit: "px" },

        ...legendProps({ at: "bottom", value: "none", stats: [["value", "Total", "Total"]], what: "part" }),

        title: { type: "string", group: "General", label: "Title", default: "" },
        background: { type: "color", group: "General", label: "Background", default: "", tokens: "colors" },
        border: { type: "boolean", group: "General", label: "Border", default: true },
        tooltip: { type: "boolean", group: "General", label: "Tooltip", default: true },
        ...exportProps({ thresholds: false })
    },

    parts: { chart: part("Chart container", "chart"), legend: part("Legend", "legend") },

    events: {
        barClick: { label: "On Bar Click", payload: { name: "string", value: "number", percent: "number", cumulative: "number", rank: "number", group: "string" }, help: "A click on a bar: drill down to that cause (its events, its trend)." }
    },
    actions: {
        setRows: { label: "Set rows", help: "Replaces the rows.", example: "[{ \"name\": \"Jam\", \"value\": 42 }, …]" },
        appendRows: { label: "Append rows", help: "Adds rows (a new event of the log).", example: "{ \"time\": 1727852400000, \"name\": \"Scratch\" }" },
        setWindow: { label: "Set the window", params: { window: "string" }, example: "{ \"window\": \"24h\" }  (\"\" = every row)" },
        clearAll: { label: "Clear" },
        exportData: { label: "Export (download)", params: { format: "string" }, example: "{ \"format\": \"xlsx\" }  (csv | xlsx | png)" }
    },

    view: class extends ReadoutElement {
        static styles = [...ReadoutElement.styles, css`
            .pa-wrap { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden;
                border-radius: var(--r, 4px); background: var(--panel, #181b1f); border: 1px solid var(--bd, #2c3235); }
            .pa-wrap.borderless { border-color: transparent; }
            .pa-head { flex: 0 0 auto; padding: 10px 14px 0; font-size: 14px; font-weight: 600; color: var(--fg); }
            .pa-wrap .plot.over-item { cursor: pointer; }
            .pa-tip { position: absolute; pointer-events: none; z-index: 6; display: none; padding: 6px 9px; border-radius: 4px; background: var(--panel, #181b1f); border: 1px solid var(--bd, #2c3235);
                color: var(--fg, #fff); font: 12px/1.45 var(--nexa-fonts-body, sans-serif); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); white-space: nowrap; }
        `];

        _rowsData = null;       // rows from Set / Append rows (else the Rows prop)
        _win = null;            // the viewer's window (a button / Set the window), else the prop
        _paretos = [];          // drawn: [{ group, bars: [{ x, y, w, h, b }] }]
        _hover = null;

        get itemsKey() { return "categories"; }
        get itemFields() { return CAT_FIELDS; }
        get clickEvent() { return "click"; }

        setRows(params) { const r = Array.isArray(params) ? params : params && Array.isArray(params.rows) ? params.rows : null; if (r) { this._rowsData = r.slice(); this.scheduleDraw(); this.requestUpdate(); } }
        appendRows(params) {
            const r = Array.isArray(params) ? params : params && typeof params === "object" ? [params] : [];
            this._rowsData = (this._rowsData || (Array.isArray(this.p.rows) ? this.p.rows.slice() : [])).concat(r);
            this.scheduleDraw(); this.requestUpdate();
        }
        setWindow(params) { this._win = String(params && typeof params === "object" ? params.window || "" : params || ""); this.scheduleDraw(); this.requestUpdate(); }
        clearAll() { super.clearAll(); this._rowsData = []; this.scheduleDraw(); this.requestUpdate(); }

        _rows() { const r = this._rowsData || this.p.rows; return Array.isArray(r) ? r : []; }
        _hasData() { return super._hasData() || this._rows().length > 0; }
        _window() { return this._win !== null ? this._win : this.p.window || ""; }
        _editor() { return !!(this._ctx && this._ctx.mode === "editor"); }
        _sample() { return this._editor() && !this._hasData(); }

        // the data: [{ group, cats: Map(name -> { total, parts: Map(part -> v), t }) }]
        _data() {
            const p = this.p;
            let rows = this._rows();
            if (!rows.length && this._sample()) rows = SAMPLE.map(([name, value]) => ({ name, value }));
            const out = new Map(), add = (g, name, part, v, t) => {
                if (!out.has(g)) out.set(g, new Map());
                const m = out.get(g), e = m.get(name) || { total: 0, parts: new Map(), t: t || this._itemFor(name) };
                e.total += v; e.parts.set(part, (e.parts.get(part) || 0) + v); m.set(name, e);
            };
            if (rows.length) {
                const cf = rows === this._rows() ? p.catField || "name" : "name", vf = rows === this._rows() ? p.valueField : "value", tf = p.timeField, sf = p.stackField, gf = p.groupField;
                const ms = spanMs(this._window()), from = tf && ms > 0 ? Date.now() - ms : -Infinity;
                for (const r of rows) {
                    if (!r || typeof r !== "object") continue;
                    const name = r[cf] === undefined || r[cf] === null ? "" : String(r[cf]);
                    if (!name) continue;
                    if (from > -Infinity) { const t = toMs(r[tf]); if (!(t >= from)) continue; }
                    const v = vf ? Number(r[vf]) : 1;
                    if (!Number.isFinite(v)) continue;
                    add(gf ? String(r[gf] === undefined || r[gf] === null ? "" : r[gf]) : "", name, sf ? String(r[sf] === undefined || r[sf] === null ? "" : r[sf]) : "", v);
                }
            } else {
                for (const t of this.itemList()) { if (t.visible === false) continue; const v = this._figure(t, this._state(t)).v; if (Number.isFinite(v)) add("", t.name || t.id, "", v, t); }
            }
            return Array.from(out.entries()).map(([group, cats]) => ({ group, cats }));
        }

        _itemFor(name) { return this.itemList().find((t) => t.id === name || t.name === name) || null; }

        /**
         * A group's Pareto: { bars: [{ name, value, parts, pct, cum, rank, vital, others, t }], total, vitalCount, n }. The bars
         * largest first (or the order given, before / after), the rest past the top N as Others last; cum from the running SUM
         * over the total, the last forced to exactly 1.
         */
        _plan(g, order) {
            const p = this.p;
            let list = Array.from(g.cats.entries()).map(([name, e]) => ({ name, value: e.total, parts: e.parts, t: e.t })).filter((b) => b.value > 0);
            if (order) { const at = new Map(order.map((n, i) => [n, i])); list.sort((a, b) => (at.has(a.name) ? at.get(a.name) : 1e9) - (at.has(b.name) ? at.get(b.name) : 1e9) || b.value - a.value); }
            else list.sort((a, b) => b.value - a.value || String(a.name).localeCompare(String(b.name)));
            const n = list.length, N = Math.floor(numOr(p.topN, 10));
            if (N > 0 && list.length > N) {
                const rest = list.slice(N), parts = new Map();
                rest.forEach((b) => b.parts.forEach((v, k) => parts.set(k, (parts.get(k) || 0) + v)));
                list = list.slice(0, N).concat([{ name: p.othersName || "Others", value: rest.reduce((a, b) => a + b.value, 0), parts, others: rest }]);
            }
            const total = list.reduce((a, b) => a + b.value, 0), cut = numOr(p.cutoff, 80) / 100;
            let run = 0, vitalCount = 0, reached = false;
            list.forEach((b, i) => {
                run += b.value;
                b.pct = total > 0 ? b.value / total : 0;
                b.cum = i === list.length - 1 ? 1 : total > 0 ? run / total : 0;
                b.rank = i + 1;
                // the vital few: up to (and with) the bar that reaches the cut-off; Others is never one of them
                b.vital = !reached && !b.others;
                if (!b.others && !reached) vitalCount++;
                if (cut > 0 && b.cum >= cut - 1e-9) reached = true;
            });
            if (!(cut > 0)) list.forEach((b) => { b.vital = true; });
            return { bars: list, total, vitalCount: cut > 0 ? vitalCount : list.length, n };
        }

        _fmt(v) { return formatValue(v, { decimals: this.p.decimals || "auto" }, this.p.unit || ""); }
        // a tick of the aligned left axis (a fifth of the total): whole numbers when the total is large
        _tick(v, total) { const d = this.p.decimals && this.p.decimals !== "auto" ? this.p.decimals : total >= 50 ? "0" : total >= 5 ? "1" : "auto"; return formatValue(v, { decimals: d }, this.p.unit || ""); }
        _pct(x, d) { return formatValue(x * 100, { decimals: d === undefined ? "0" : d }, "") + " %"; }

        _barColor(b, part, k) {
            const p = this.p;
            if (b.others) return this._tok(p.othersColor) || this.statusColor("neutral");
            if (part !== null && p.stackField) return this.seriesColor(k);
            if (b.t && this._tok(b.t.color)) return this._tok(b.t.color);
            if (b.t && b.t.status) return this.statusColor(b.t.status);
            return this._tok(p.barColor) || this.seriesColor(0);
        }

        // the parts of every bar, in a fixed order (the legend's)
        _partNames(groups) {
            if (!this.p.stackField) return [];
            const seen = new Map();
            groups.forEach((g) => g.cats.forEach((e) => e.parts.forEach((v, k) => seen.set(k, (seen.get(k) || 0) + v))));
            return Array.from(seen.entries()).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
        }

        _drawInto(ctx, w, h) {
            this._fresh(ctx, w, h);
            const groups = this._data();
            this._paretos = [];
            this._rects = [];
            if (!groups.length) return;
            const parts = this._partNames(groups);
            // before / after: every group in the first one's order
            const first = this._plan(groups[0]), order = groups.length > 1 ? first.bars.filter((b) => !b.others).map((b) => b.name) : null;
            const boxes = this._grid(groups.length, w, h, groups.length, 16, 200);
            groups.forEach((g, i) => this._drawPareto(ctx, g, i === 0 && !order ? first : this._plan(g, order), boxes[i], parts, groups.length > 1));
        }

        _drawPareto(ctx, g, plan, box, parts, titled) {
            const p = this.p, c = this._colors(), font = c.font, fs = 11, horizontal = p.orientation === "horizontal";
            const bars = plan.bars, n = bars.length;
            const pareto = { group: g.group, plan, bars: [] };
            this._paretos.push(pareto);
            if (!n) return;
            // (room for the ⋮ menu over the right axis)
            let top = box.y + (this.p.exportButton !== false ? 28 : 8);
            if (titled) { ctx.font = "600 12px " + font; ctx.fillStyle = c.strong; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(g.group || "—", box.x + box.w / 2, box.y + 2); top += 16; }
            // the left scale: aligned (0 .. the total) or nice over the largest bar
            const max = bars.reduce((m, b) => Math.max(m, b.value), 0);
            const aligned = p.aligned !== false;
            const hi = aligned ? plan.total : niceTicks(0, max, 5).max;
            const leftTicks = aligned ? [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => f * plan.total) : niceTicks(0, hi, 5).ticks;
            const pctTicks = [0, 0.2, 0.4, 0.6, 0.8, 1];
            ctx.font = fs + "px " + font;
            const tickText = (v) => (aligned ? this._tick(v, plan.total) : this._fmt(v));
            const leftW = Math.max(...leftTicks.map((v) => ctx.measureText(tickText(v)).width)) + 10 + (p.leftTitle ? fs + 6 : 0);
            const rightW = ctx.measureText("100 %").width + 10 + (p.rightTitle ? fs + 6 : 0);
            const names = bars.map((b) => String(b.name));
            const nameW = Math.min(box.w * 0.35, Math.max(...names.map((s) => ctx.measureText(s).width)) + 10);
            let px, py, pw, ph, rotate = false;
            if (!horizontal) {
                const slot0 = (box.w - leftW - rightW) / n, widest = Math.max(...names.map((s) => ctx.measureText(s).width));
                rotate = widest + 6 > slot0;
                const xLab = rotate ? Math.min(90, widest * 0.72) + fs : fs + 8;
                px = box.x + leftW; pw = Math.max(20, box.w - leftW - rightW); py = top + 6; ph = Math.max(20, box.y + box.h - py - xLab - 6);
            } else {
                px = box.x + nameW + 6; pw = Math.max(20, box.w - nameW - 6 - 12); py = top + fs + 10; ph = Math.max(20, box.y + box.h - py - fs - 12);
            }
            const catLen = horizontal ? ph : pw, valLen = horizontal ? pw : ph;
            const slot = catLen / n, bw = Math.max(2, slot * (1 - Math.max(0, Math.min(0.8, numOr(p.gap, 25) / 100))));
            const cpos = (i) => i * slot + slot / 2, vpos = (v) => (hi > 0 ? (v / hi) * valLen : 0), ppos = (f) => f * valLen;
            const xy = (cc, vv) => (horizontal ? [px + vv, py + cc] : [px + cc, py + ph - vv]);
            // the grid and the two scales
            ctx.save();
            ctx.lineWidth = 1;
            ctx.font = fs + "px " + font; ctx.fillStyle = c.text;
            (aligned ? pctTicks.map((f) => [f, f * plan.total]) : leftTicks.map((v) => [v / (hi || 1), v])).forEach(([f, v]) => {
                const [x, y] = xy(0, f * valLen);
                if (p.grid !== false) { ctx.strokeStyle = c.grid; ctx.beginPath(); if (horizontal) { ctx.moveTo(Math.round(x) + 0.5, py); ctx.lineTo(Math.round(x) + 0.5, py + ph); } else { ctx.moveTo(px, Math.round(y) + 0.5); ctx.lineTo(px + pw, Math.round(y) + 0.5); } ctx.stroke(); }
                if (horizontal) { ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(tickText(v), x, py + ph + 4); }
                else { ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(tickText(v), px - 6, y); }
            });
            pctTicks.forEach((f) => {
                const [x, y] = xy(0, ppos(f));
                if (horizontal) { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(this._pct(f), x, py - 4); }
                else { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(this._pct(f), px + pw + 6, y); }
            });
            if (!horizontal) {
                ctx.font = "600 " + fs + "px " + font;
                if (p.leftTitle) { ctx.save(); ctx.translate(box.x + fs / 2 + 2, py + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.leftTitle, 0, 0); ctx.restore(); }
                if (p.rightTitle) { ctx.save(); ctx.translate(box.x + box.w - fs / 2 - 2, py + ph / 2); ctx.rotate(Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.rightTitle, 0, 0); ctx.restore(); }
            }
            ctx.restore();
            // the bars (stacked parts); the vital few strong, the rest faded
            const rad = numOr(p.radius, 2);
            bars.forEach((b, i) => {
                const cc = cpos(i) - bw / 2;
                const segs = p.stackField ? parts.map((k, j) => [k, j, b.parts.get(k) || 0]).filter((x) => x[2] > 0) : [[null, 0, b.value]];
                let base = 0;
                const hov = this._hover && this._hover.group === g.group && this._hover.i === i;
                segs.forEach(([k, j, v], si) => {
                    let col = this._barColor(b, k, j);
                    const faded = p.vitalFew !== false && !b.vital && !b.others;
                    ctx.save();
                    if (faded) { const own = this._tok(p.fadedColor); if (own) col = own; else ctx.globalAlpha = 0.35; }
                    if (hov) ctx.globalAlpha = Math.min(1, ctx.globalAlpha + 0.25);
                    ctx.fillStyle = col;
                    const [x0, y0] = xy(cc, vpos(base)), [x1, y1] = xy(cc + bw, vpos(base + v));
                    const rx = Math.min(x0, x1), ry = Math.min(y0, y1), rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
                    ctx.beginPath();
                    const last = si === segs.length - 1, r = last ? Math.min(rad, rw / 2, rh / 2) : 0;
                    if (r > 0 && ctx.roundRect) ctx.roundRect(rx, ry, rw, rh, horizontal ? [0, r, r, 0] : [r, r, 0, 0]); else ctx.rect(rx, ry, rw, rh);
                    ctx.fill();
                    ctx.restore();
                    base += v;
                });
                const [bx0, by0] = xy(cc, 0), [bx1, by1] = xy(cc + bw, vpos(b.value));
                const rect = { x: Math.min(bx0, bx1), y: Math.min(by0, by1), w: Math.abs(bx1 - bx0), h: Math.abs(by1 - by0) };
                pareto.bars.push(Object.assign({ b, i }, rect));
                this._rects.push({ t: b.t || null, x: rect.x, y: rect.y, w: rect.w, h: rect.h, b, group: g.group, i });
                // its label (value / % / both)
                if (p.labels && p.labels !== "none") {
                    const text = p.labels === "value" ? this._fmt(b.value) : p.labels === "percent" ? this._pct(b.pct, "1") : this._fmt(b.value) + " · " + this._pct(b.pct, "1");
                    ctx.font = numOr(p.labelSize, 11) + "px " + font; ctx.fillStyle = c.strong;
                    if (horizontal) { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, rect.x + rect.w + 4, rect.y + rect.h / 2); }
                    else { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(text, rect.x + rect.w / 2, rect.y - 3); }
                }
                // its name
                ctx.font = fs + "px " + font; ctx.fillStyle = b.others ? c.text : c.strong;
                if (horizontal) { ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(this._fit(ctx, String(b.name), nameW - 8), px - 6, py + cpos(i)); }
                else if (rotate) { ctx.save(); ctx.translate(px + cpos(i), py + ph + 6); ctx.rotate(Math.PI / 4); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(this._fit(ctx, String(b.name), 120), 0, 0); ctx.restore(); }
                else { ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(String(b.name), px + cpos(i), py + ph + 6); }
            });
            // the cut-off: a dashed line at its % and where the vital few end
            const cut = numOr(p.cutoff, 80) / 100;
            if (cut > 0) {
                const col = this.statusColor("error");
                ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash(DASHES.dashed);
                const [a0, b0] = xy(0, ppos(cut)), [a1, b1] = xy(catLen, ppos(cut));
                ctx.beginPath(); ctx.moveTo(a0, b0); ctx.lineTo(a1, b1); ctx.stroke();
                if (plan.vitalCount > 0 && plan.vitalCount < n) {
                    const edge = plan.vitalCount * slot, [e0, f0] = xy(edge, 0), [e1, f1] = xy(edge, valLen);
                    ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(e0, f0); ctx.lineTo(e1, f1); ctx.stroke();
                }
                ctx.restore();
                if (p.cutoffLabel !== false) {
                    const reached = bars[Math.max(0, plan.vitalCount - 1)];
                    const text = plan.vitalCount + " of " + plan.n + " causes = " + this._pct(reached ? reached.cum : cut);
                    ctx.font = "600 " + fs + "px " + font; ctx.fillStyle = col; ctx.textBaseline = "bottom";
                    if (horizontal) { ctx.textAlign = "right"; ctx.fillText(text, a1 - 4, py + ph - 4); } else { ctx.textAlign = "right"; ctx.fillText(text, a1 - 4, b1 - 4); }
                }
            }
            // the cumulative line, ending at exactly 100 %
            if (p.line !== "none") {
                const pts = bars.map((b, i) => xy(cpos(i), ppos(b.cum)));
                const col = this._tok(p.lineColor) || c.strong, lw = numOr(p.lineWidth, 2);
                const trace = () => {
                    if (p.line === "step") { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) { if (horizontal) ctx.lineTo(pts[i - 1][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); } }
                    else if (p.line === "smooth" && pts.length > 2 && !horizontal) {
                        const xs = Float64Array.from(pts, (q) => q[0]), ys = Float64Array.from(pts, (q) => q[1]), seg = monotoneSegments(xs, ys, pts.length);
                        ctx.moveTo(xs[0], ys[0]); for (let k = 0; k < pts.length - 1; k++) { const o = k * 6; ctx.bezierCurveTo(seg[o], seg[o + 1], seg[o + 2], seg[o + 3], seg[o + 4], seg[o + 5]); }
                    } else { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
                };
                ctx.save();
                if (p.lineArea && !horizontal) {
                    const gr = ctx.createLinearGradient(0, py, 0, py + ph); gr.addColorStop(0, this.hexToRgba(col, 0.18)); gr.addColorStop(1, this.hexToRgba(col, 0.01));
                    ctx.fillStyle = gr; ctx.beginPath(); trace(); ctx.lineTo(pts[pts.length - 1][0], py + ph); ctx.lineTo(pts[0][0], py + ph); ctx.closePath(); ctx.fill();
                }
                ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.beginPath(); trace(); ctx.stroke();
                if (p.lineMarkers !== false) pts.forEach((q) => { ctx.beginPath(); ctx.fillStyle = col; ctx.arc(q[0], q[1], Math.max(2.5, lw + 1), 0, Math.PI * 2); ctx.fill(); });
                if (p.lineLabels) {
                    ctx.font = "500 10px " + font; ctx.fillStyle = col; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
                    bars.forEach((b, i) => ctx.fillText(this._pct(b.cum), pts[i][0] + (horizontal ? 14 : 0), pts[i][1] - 6));
                }
                ctx.restore();
            }
        }

        // ---- the pointer ------------------------------------------------------------------------------
        _barAt(e) {
            const plot = this._plotEl();
            if (!plot) return null;
            const rr = plot.getBoundingClientRect(), k = rr.width / (plot.clientWidth || 1) || 1;
            const x = (e.clientX - rr.left) / k, y = (e.clientY - rr.top) / k;
            return this._rects.find((q) => x >= q.x - 2 && x <= q.x + q.w + 2 && y >= q.y - 2 && y <= q.y + q.h + 2) || null;
        }
        _move(e) {
            const q = this._barAt(e), plot = this._plotEl(), key = q ? q.group + "\u0001" + q.i : "";
            if (plot) plot.classList.toggle("over-item", !!q && !this.isEditor);
            if (key !== (this._hover ? this._hover.group + "\u0001" + this._hover.i : "")) { this._hover = q ? { group: q.group, i: q.i } : null; this.draw(); }
            const tip = this.renderRoot.querySelector(".pa-tip");
            if (!tip) return;
            if (!q || this.p.tooltip === false) { tip.style.display = "none"; return; }
            const b = q.b, esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
            const partsTxt = this.p.stackField ? Array.from(b.parts.entries()).filter((x) => x[1] > 0).map(([k2, v]) => "<br>" + esc(k2 || "—") + ": " + esc(this._fmt(v))).join("") : "";
            const inOthers = b.others ? "<br>" + b.others.slice(0, 8).map((o) => esc(o.name) + ": " + esc(this._fmt(o.value))).join("<br>") + (b.others.length > 8 ? "<br>…" : "") : "";
            tip.innerHTML = "<b>" + esc(b.name) + "</b>" + (b.others ? "" : "  #" + b.rank) + "<br>" + esc(this._fmt(b.value)) + " · " + esc(this._pct(b.pct, "1")) + "<br>Cumulative " + esc(this._pct(b.cum, "1")) + partsTxt + inOthers;
            const pr = plot.getBoundingClientRect(), k = pr.width / (plot.clientWidth || 1) || 1;
            tip.style.display = "block";
            tip.style.left = Math.min(plot.clientWidth - tip.offsetWidth - 4, (e.clientX - pr.left) / k + 12) + "px";
            tip.style.top = Math.max(4, (e.clientY - pr.top) / k - tip.offsetHeight - 8) + "px";
        }
        _leave() { if (this._hover) { this._hover = null; this.draw(); } const tip = this.renderRoot.querySelector(".pa-tip"); if (tip) tip.style.display = "none"; }
        _click(e) {
            if (this.isEditor) return;
            const q = this._barAt(e);
            if (!q) return;
            const b = q.b;
            this.emit("barClick", { name: b.name, value: b.value, percent: Math.round(b.pct * 10000) / 100, cumulative: Math.round(b.cum * 10000) / 100, rank: b.rank, group: q.group });
            if (b.t) this.emit("click", { value: b.value, name: b.name }, this._target(b.t));
        }

        exportData(params) {
            const o = this._exportOpts(params);
            if (o.format === "png") return this.exportPNG();
            const head = ["Group", "Rank", "Category", "Value", "%", "Cumulative %", "Vital few"], rows = [];
            const groups = this._data(), first = groups.length ? this._plan(groups[0]) : null, order = groups.length > 1 ? first.bars.filter((b) => !b.others).map((b) => b.name) : null;
            groups.forEach((g, gi) => { const plan = gi === 0 && !order ? first : this._plan(g, order); plan.bars.forEach((b) => rows.push([g.group, b.rank, b.name, b.value, Math.round(b.pct * 10000) / 100, Math.round(b.cum * 10000) / 100, b.vital ? "yes" : ""])); });
            let blob;
            if (o.format === "xlsx") blob = xlsxBlob(head, rows, false, { textCols: [0, 2, 6] });
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
            const p = this.p, bg = this._tok(p.background), sample = this._sample();
            const groups = this._data(), parts = this._partNames(groups);
            const { at, inside } = legendPlace(p);
            const legend = parts.length ? legendTemplate(Object.assign({}, p, { legendMode: "list", legendValue: "none" }), parts.map((k, i) => ({ key: k, name: k || "—", color: this.seriesColor(i), off: false, swatch: "square" })), () => {}, {}) : "";
            const win = this._window(), choices = [["8h", "8h"], ["24h", "24h"], ["7d", "7d"], ["30d", "30d"], ["", "All"]];
            const bar = p.windowButtons && p.timeField ? html`<div class="range-bar"><div class="rb-group">${choices.map(([v, l]) => html`<button type="button" class="rb-btn ${win === v ? "on" : ""}" @click=${() => this.setWindow(v)}>${l}</button>`)}</div></div>` : "";
            return html`
                <div class="pa-wrap ${p.border === false ? "borderless" : ""}" part="chart" style=${bg ? "background:" + bg : ""}>
                    ${p.title ? html`<div class="pa-head">${p.title}</div>` : ""}
                    ${bar}
                    ${at === "top" ? legend : ""}
                    <div class="c-main">
                        ${at === "left" ? legend : ""}
                        <div class="plot" @pointermove=${(e) => this._move(e)} @pointerleave=${() => this._leave()} @click=${(e) => this._click(e)}>
                            <canvas></canvas>
                            <div class="corner" style="right:8px">${this._renderMenu()}</div>
                            <div class="pa-tip"></div>
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
