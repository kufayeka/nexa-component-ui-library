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
import { chartCommon, NOTATIONS, DECIMALS, DASHES } from "./core.js";
import { TimeSeriesRingBuffer, M4Decimator, lowerBoundRing } from "./buffer.js";
import { xlsxBlob } from "./export.js";
import { spanMs } from "./time.js";
import { exportProps } from "./props.js";
import { ReadoutElement, STATUSES, REDUCERS, WINDOWS, parseValueMap, reduce, stepOf, opt, numOr } from "./readout.js";
import { fmtDuration } from "./state.js";

const SPARKS = [["", "The chart's default"], ["area", "Area"], ["line", "Line"], ["bars", "Bars"], ["off", "None"]];
const tileOptions = (p) => [{ value: "", label: "Every tile" }].concat((Array.isArray(p && p.tiles) ? p.tiles : []).filter((t) => t && t.id).map((t) => ({ value: t.id, label: (t.name || t.id) + " (" + t.id + ")" })));

const TILE_FIELDS = {
    name: { type: "string", label: "Name", default: "Value" },
    id: { type: "string", label: "Id", default: "", bindable: false, help: "Fixed (renaming the tile keeps it): its Update node, its events and a threshold find the tile by it." },
    visible: { type: "boolean", label: "Visible", default: true },
    subtitle: { type: "string", label: "Subtitle", default: "", help: "A line under the value (the line, the period, a note)." },

    live: { type: "tag", access: "read", section: "Data", label: "Live value", help: "A tag or a variable: every new value is a point (its time = now). From Logic: this tile's Update node (Set value / Set history)." },
    reduceBy: { type: "enum", section: "Data", label: "The figure shown", default: "last", options: opt(REDUCERS), help: "Over the window below: the last value, or the average / min / max / sum / change of the values in it." },
    window: { type: "enum", section: "Data", label: "Over", default: "", options: opt(WINDOWS), help: "Also the time the sparkline shows." },
    maxPoints: { type: "number", section: "Data", label: "Values kept", default: 5000, min: 10, max: 1000000, step: 100, help: "A ring: the oldest go past it." },
    staleAfter: { type: "number", section: "Data", label: "Stale after (ms without data)", default: 0, min: 0, step: 1000, help: "0 = never. No new value for this long: the tile greys out with \"Stale\" and how long (On Stale / On Resume)." },

    unit: { type: "string", section: "Numbers", label: "Unit (kWh, °C, %)", default: "" },
    notation: { type: "enum", section: "Numbers", label: "Notation", default: "standard", options: opt(NOTATIONS) },
    decimals: { type: "enum", section: "Numbers", label: "Decimals", default: "auto", options: opt(DECIMALS) },
    valueMap: { type: "string", section: "Numbers", label: "Value texts", default: "", bindable: false, help: "A text for a value: 0=Off, 1=Run, 2=Fault." },

    deltaFrom: {
        type: "enum", section: "Delta", label: "Compare with", default: "none",
        options: opt([["none", "Nothing"], ["previous", "The previous value"], ["ago", "The value some time ago"], ["target", "The target"]])
    },
    deltaAgo: { type: "enum", section: "Delta", label: "How long ago", default: "1h", options: opt([["1m", "1 minute"], ["15m", "15 minutes"], ["1h", "1 hour"], ["8h", "8 hours (a shift)"], ["24h", "24 hours"], ["7d", "7 days"]]), visibleWhen: (t) => t.deltaFrom === "ago" },
    deltaAs: { type: "enum", section: "Delta", label: "As", default: "percent", options: opt([["percent", "A %"], ["value", "A value"]]), visibleWhen: (t) => t.deltaFrom && t.deltaFrom !== "none" },
    upIsGood: { type: "boolean", section: "Delta", label: "Up is good (green); off: up is bad (red)", default: true, visibleWhen: (t) => t.deltaFrom && t.deltaFrom !== "none" },

    target: { type: "number", section: "Context", label: "Target", default: "", help: "The plan: a progress bar (82 % of the target) and a Compare with: The target." },
    showProgress: { type: "boolean", section: "Context", label: "Progress bar to the target", default: true },
    setpoint: { type: "number", section: "Context", label: "Setpoint", default: "", help: "A dashed line on the sparkline." },
    normalLow: { type: "number", section: "Context", label: "Normal from", default: "", help: "The normal band (low – high): shaded on the sparkline; a value outside it is a warning (without thresholds)." },
    normalHigh: { type: "number", section: "Context", label: "Normal to", default: "" },

    spark: { type: "enum", section: "Sparkline", label: "Sparkline", default: "", options: opt(SPARKS) },
    sparkMin: { type: "number", section: "Sparkline", label: "Scale from (fixed)", default: "", help: "Empty: from the data. A fixed scale (0 – 100 for a %) shows a small change as small." },
    sparkMax: { type: "number", section: "Sparkline", label: "Scale to (fixed)", default: "" },
    color: { type: "color", section: "Sparkline", label: "Colour", default: "", tokens: "colors", help: "The sparkline's (and the value's, without thresholds). Empty: the theme's chart palette." }
};

function tileDefaults() {
    const o = {};
    Object.keys(TILE_FIELDS).forEach((k) => { o[k] = TILE_FIELDS[k].default; });
    delete o.live;
    return o;
}

const STEP_FIELDS = {
    from: { type: "number", label: "From (≥)", default: 0, help: "The value from which this step applies (up to the next step)." },
    status: { type: "enum", label: "Status", default: "warning", options: opt(STATUSES), help: "Its colour comes from the theme (Theme & Styling)." },
    color: { type: "color", label: "Colour", default: "", tokens: "colors", visibleWhen: (s) => s.status === "custom" },
    label: { type: "string", label: "Label", default: "", help: "In On State Change and the export (High, Alarm…)." },
    tile: { type: "enum", label: "For", default: "", options: tileOptions }
};

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
        tiles: {
            type: "list", group: "Tiles", label: "Tiles", noun: "tile",
            help: "One per value. Each has its own Update node, message and events in Logic.",
            default: [Object.assign(tileDefaults(), { id: "k1", name: "Value 1" })],
            item: {
                fields: TILE_FIELDS, noun: "tile", target: true,
                create: (items) => {
                    let n = items.length + 1;
                    const ids = new Set(items.map((x) => x && x.id));
                    while (ids.has("k" + n)) n++;
                    return Object.assign(tileDefaults(), { id: "k" + n, name: "Value " + n });
                },
                actions: {
                    setValue: { label: "Set value", help: "A new value (its time = now), or { x, y } at its time.", example: "21.5  or  { \"x\": 1727852400000, \"y\": 21.5 }" },
                    setHistory: { label: "Set history", help: "Replaces the values kept: [{ x, y }] (a query: the last 24 h).", example: "[{ \"x\": 1727852400000, \"y\": 21.5 }, …]" },
                    clear: { label: "Clear", help: "Empties this tile." }
                },
                events: {
                    tileClick: { label: "On Tile Click", payload: { value: "number", name: "string" }, help: "A click on the tile: drill down to its trend, its alarms." },
                    stateChange: { label: "On State Change", payload: { from: "string", to: "string", value: "number" }, help: "Its value moved into another threshold step (normal -> warning -> alarm)." },
                    stale: { label: "On Stale", payload: { since: "number" }, help: "No new value for longer than its Stale after." },
                    resume: { label: "On Resume", payload: { gap: "number" }, help: "A value again after On Stale: how long it was quiet (ms)." }
                }
            }
        },

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

        thresholds: {
            type: "list", group: "Thresholds", label: "Steps", noun: "step", default: [],
            help: "From a value on, a status (a theme colour) or its own colour: 0 = Good, 80 = Warning, 95 = Alarm. A step for one tile or every tile.",
            item: { fields: STEP_FIELDS, noun: "step" }
        },

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
            .kpi-container .plot.over-tile { cursor: pointer; }
            .kpi-container .corner { top: 4px; right: 4px; opacity: 0; transition: opacity 0.15s; }
            .kpi-container:hover .corner { opacity: 1; }
        `];

        _tiles = new Map();     // key -> { buf, lastLive, demo, lastAt, stale, state }
        _rects = [];            // [{ t, x, y, w, h }] drawn
        _dec = new M4Decimator(512);

        mounted() { this.every(1000, () => { if (!this.isEditor) this._checkStale(); }); }
        propsChanged() { this.prepareData(); }

        tileList() {
            const raw = Array.isArray(this.p && this.p.tiles) ? this.p.tiles : [];
            const c = this._tl;
            if (c && c.raw === raw) return c.list;
            const d = tileDefaults();
            const list = raw.map((t, i) => { const o = Object.assign({}, d, t && typeof t === "object" ? t : {}); o._i = i; o._key = String(o.id || "#" + i); o._map = parseValueMap(o.valueMap); return o; });
            this._tl = { raw, list };
            return list;
        }

        _state(t) {
            let st = this._tiles.get(t._key);
            if (!st) { st = { buf: new TimeSeriesRingBuffer(Math.max(10, numOr(t.maxPoints, 5000))), lastLive: undefined, demo: false, lastAt: 0, stale: false, state: undefined }; this._tiles.set(t._key, st); }
            return st;
        }

        _target(t) { return { list: "tiles", id: t.id || t._key }; }

        /** Real data in a tile (the editor's sample is not). */
        _hasData() { return this.tileList().some((t) => { const st = this._state(t); return st.buf.count > 0 && !st.demo; }); }

        findTile(ref) {
            const list = this.tileList();
            if (ref && typeof ref === "object" && ref.id !== undefined) ref = ref.id;
            if (ref === undefined || ref === null || ref === "") return list[0] || null;
            return list.find((t) => t.id === String(ref)) || list.find((t) => t.name === String(ref)) || (/^\d+$/.test(String(ref)) ? list[Number(ref)] : null) || null;
        }

        // ---- data -----------------------------------------------------------------------------
        prepareData() {
            const list = this.tileList(), live = new Set();
            let dirty = false;
            for (const t of list) {
                live.add(t._key);
                const st = this._state(t), cap = Math.max(10, numOr(t.maxPoints, 5000));
                if (st.buf.capacity !== cap) { st.buf.setCapacity(cap); dirty = true; }
                const v = t.live;
                if (v !== undefined && v !== null && v !== "" && v !== "???" && v !== st.lastLive && !(typeof v === "object" && v.$bind)) {
                    st.lastLive = v;
                    if (this._add(t, st, Array.isArray(v) ? v : [v])) dirty = true;
                }
                // the editor's sample: decoration for the tile, never data (only once the host said it is the editor)
                if (this._ctx && this._ctx.mode === "editor" && st.buf.count === 0) { this._demo(st, t._i); dirty = true; }
            }
            for (const k of Array.from(this._tiles.keys())) if (!live.has(k)) { this._tiles.delete(k); dirty = true; }
            if (dirty) { this.scheduleDraw(); this.requestUpdate(); }
        }

        _add(t, st, pts) {
            if (st.demo) { st.buf.clear(); st.demo = false; }
            let added = 0;
            for (const p of pts) {
                if (p === null || p === undefined) continue;
                let x, y;
                if (typeof p === "object") { x = Number(p.x !== undefined ? p.x : p.time); y = Number(p.y !== undefined ? p.y : p.value); }
                else { x = Date.now(); y = typeof p === "boolean" ? (p ? 1 : 0) : Number(p); }
                if (Number.isFinite(x) && Number.isFinite(y) && st.buf.push(x, y)) added++;
            }
            if (added && !this.isEditor) {
                const now = Date.now();
                if (st.stale) { this.emit("resume", { gap: now - st.lastAt }, this._target(t)); st.stale = false; }
                st.lastAt = now;
                this._checkState(t, st);
            }
            return added;
        }

        _demo(st, i) {
            const now = Date.now(), n = 60;
            st.buf.clear();
            for (let k = 0; k < n; k++) st.buf.push(now - (n - k) * 60000, Math.round((60 + i * 12 + 14 * Math.sin(k / 9 + i) + 5 * Math.sin(k / 3 + i * 2)) * 10) / 10);
            st.demo = true;
        }

        _checkStale() {
            const now = Date.now();
            let changed = false;
            for (const t of this.tileList()) {
                const after = numOr(t.staleAfter, 0), st = this._state(t);
                if (after > 0 && st.lastAt && !st.stale && now - st.lastAt > after) { st.stale = true; changed = true; this.emit("stale", { since: st.lastAt }, this._target(t)); }
                if (st.stale) changed = true;   // its "Stale · 5m" grows
            }
            if (changed) this.scheduleDraw();
        }

        // On State Change: the step the figure is in now, against the one before
        _checkState(t, st) {
            const v = this._figure(t, st).v, step = this._stepFor(t, v), name = step ? step.label || step.status : "base";
            if (st.state !== undefined && st.state !== name) this.emit("stateChange", { from: st.state, to: name, value: v }, this._target(t));
            st.state = name;
        }

        // ---- a tile's actions (its own Update node) ----------------------------------------------
        setValue(params, target) {
            const t = this.findTile(target);
            if (!t) return 0;
            const n = this._add(t, this._state(t), Array.isArray(params) ? params : [params]);
            if (n) { this.scheduleDraw(); this.requestUpdate(); }
            return n;
        }

        setHistory(params, target) {
            const t = this.findTile(target);
            if (!t) return 0;
            const st = this._state(t);
            st.demo = false;
            st.buf.loadArray(Array.isArray(params) ? params : params && Array.isArray(params.points) ? params.points : [], "x", "y");
            st.lastAt = Date.now();
            if (!this.isEditor) this._checkState(t, st);
            this.scheduleDraw(); this.requestUpdate();
            return st.buf.count;
        }

        clear(params, target) { const t = this.findTile(target); if (!t) return; this._state(t).buf.clear(); this.scheduleDraw(); this.requestUpdate(); }
        clearAll() { for (const st of this._tiles.values()) { st.buf.clear(); st.demo = false; } this.scheduleDraw(); this.requestUpdate(); }

        // ---- figures -----------------------------------------------------------------------------
        _spec(t) { return { notation: t.notation || "standard", decimals: t.decimals || "auto", separators: "locale", thousands: true }; }

        // the figure shown: { v, from } (from: where the window starts)
        _figure(t, st) {
            const from = this._windowFrom(t.window, st.buf.count ? Math.max(Date.now(), st.buf.getX(st.buf.count - 1)) : Date.now());
            return { v: reduce(st.buf, t.reduceBy || "last", from), from };
        }

        _steps(t) {
            return (Array.isArray(this.p.thresholds) ? this.p.thresholds : []).filter((s) => s && typeof s === "object" && (!s.tile || s.tile === t.id))
                .map((s) => ({ from: numOr(s.from, NaN), status: s.status || "warning", color: s.color, label: s.label || "" })).filter((s) => Number.isFinite(s.from)).sort((a, b) => a.from - b.from);
        }

        _stepFor(t, v) {
            if (!Number.isFinite(v)) return null;
            const steps = this._steps(t);
            if (steps.length) return stepOf(v, steps);
            // no steps: outside its normal band is a warning
            const lo = numOr(t.normalLow, NaN), hi = numOr(t.normalHigh, NaN);
            if ((Number.isFinite(lo) && v < lo) || (Number.isFinite(hi) && v > hi)) return { status: "warning", label: "Outside the normal band" };
            return null;
        }

        // the colour of a tile's state (null: the base, the text colour)
        _stateColor(t, v) {
            const s = this._stepFor(t, v);
            if (s) return this._statusColor(s.status, s.color);
            const base = this.p.baseStatus;
            return base && base !== "neutral" ? this.statusColor(base) : null;
        }

        _refValue(t, st, v) {
            const how = t.deltaFrom;
            if (how === "target") return numOr(t.target, NaN);
            const b = st.buf;
            if (how === "previous") return b.count > 1 ? b.getY(b.count - 2) : NaN;
            // some time ago: the SAME figure (a sum over 24 h: the sum over the 24 h before) with its window shifted back
            if (how === "ago" && b.count) {
                const ago = spanMs(t.deltaAgo || "1h"), end = Math.max(Date.now(), b.getX(b.count - 1)) - ago;
                if (b.getX(0) > end) return NaN;
                const from = Number.isFinite(this._figure(t, st).from) ? this._figure(t, st).from - ago : -Infinity;
                return reduce(b, t.reduceBy || "last", from, end);
            }
            return NaN;
        }

        // ---- the drawing ---------------------------------------------------------------------------
        _grid(n, w, h) {
            const gap = Math.max(0, numOr(this.p.gap, 8));
            let cols = Math.floor(numOr(this.p.columns, 0));
            if (!(cols > 0)) cols = Math.max(1, Math.min(n, Math.floor((w + gap) / (180 + gap))));
            cols = Math.min(cols, Math.max(1, n));
            const rows = Math.ceil(n / cols), tw = (w - gap * (cols - 1)) / cols, th = (h - gap * (rows - 1)) / rows;
            const out = [];
            for (let i = 0; i < n; i++) out.push({ x: (i % cols) * (tw + gap), y: Math.floor(i / cols) * (th + gap), w: tw, h: th });
            return out;
        }

        draw() {
            if (!this.ctx || !this.canvas) return;
            const { w, h } = this._layoutSize();
            if (w <= 0 || h <= 0) return;
            this._drawInto(this.ctx, w, h);
        }

        _drawInto(ctx, w, h) {
            // (a PNG is drawn onto its own background)
            if (!(this._exporting && this._exporting.png)) this._clearCanvas(ctx, w, h);
            const list = this.tileList().filter((t) => t.visible !== false);
            const boxes = this._grid(list.length, w, h);
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

        // the theme's panel colour (a tile is a card on it)
        _panel() { return getComputedStyle(this).getPropertyValue("--panel").trim() || this._backgroundColor() || "#ffffff"; }

        _fit(ctx, s, w) {
            if (ctx.measureText(s).width <= w) return s;
            let t = s;
            while (t.length > 1 && ctx.measureText(t + "…").width > w) t = t.slice(0, -1);
            return t + "…";
        }

        // ---- the pointer: a click on a tile ----------------------------------------------------------
        _tileAt(e) {
            const plot = this._plotEl();
            if (!plot) return null;
            const r = plot.getBoundingClientRect(), k = r.width / (plot.clientWidth || 1) || 1;
            const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
            return this._rects.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) || null;
        }
        _move(e) { const plot = this._plotEl(); if (plot) plot.classList.toggle("over-tile", !!this._tileAt(e) && !this.isEditor); }
        _click(e) {
            if (this.isEditor) return;
            const q = this._tileAt(e);
            if (!q) return;
            const v = this._figure(q.t, this._state(q.t)).v;
            this.emit("tileClick", { value: Number.isFinite(v) ? v : null, name: q.t.name || q.t.id }, this._target(q.t));
        }

        // ---- export: a row per tile (CSV / Excel), or the picture (PNG) ------------------------------
        exportData(params) {
            const o = this._exportOpts(params);
            if (o.format === "png") return this.exportPNG();
            const head = ["Tile", "Value", "Unit", "State", "Shown", "Values kept"];
            const rows = this.tileList().map((t) => {
                const st = this._state(t), v = this._figure(t, st).v, step = this._stepFor(t, v);
                return [t.name || t.id, Number.isFinite(v) ? v : "", t.unit || "", step ? step.label || step.status : "", (t.reduceBy || "last") + (t.window ? " over " + t.window : ""), st.demo ? 0 : st.buf.count];
            });
            let blob;
            if (o.format === "xlsx") blob = xlsxBlob(head, rows, false, { textCols: [0, 2, 3, 4] });
            else {
                const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
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
            ctx.fillStyle = this._backgroundColor() || getComputedStyle(this).getPropertyValue("--panel").trim() || "#ffffff";
            ctx.fillRect(0, 0, w, h);
            this._exporting = { png: true };
            try { this._drawInto(ctx, w, h); } finally { this._exporting = null; }
            return new Promise((resolve) => out.toBlob((blob) => {
                if (!blob) { resolve(null); return; }
                const name = this._getExportFileName("png", "all");
                this._download(blob, name);
                this._lastExport = { name, blob, width: out.width, height: out.height };
                resolve(this._lastExport);
            }, "image/png"));
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
