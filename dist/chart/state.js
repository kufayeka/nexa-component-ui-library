// Nexa UI — State Timeline: what each machine / line / order was doing, along time.
//
// In Logic:
//   - per row (a machine…), its OWN Update node: its props, and Set states (a history: changes or
//     intervals) / Append change / Clear; its OWN message (a row's Live state bound to Message
//     reads what ITS node got); its own event On State Change { from, to, time };
//   - the chart's Update node: its props, Show a range / Follow live / annotations / Export;
//   - the chart's events: On Segment Click { row, state, start, end, duration }, On Hover, the
//     time events (range change, live / paused, range select, annotation click).
// A row's data: its Live state (a tag / a variable: every new value is a change, at now) and its
// node's actions. A state lasts until the next change (the last one until now); a null state is
// a gap (an interval's end).
// The states (Properties): a value (or a range of numbers) -> a label and a colour.
// Layout: a lane per row (its states one after another) or a lane per row AND state (each state on
// its own line). Statistics per lane (optional): % of the time, total time, times entered, first
// start, last end, the current state and since when — over the time shown.
import { html, formatValue } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, part, defineUI } from "../core.js";
import { chartCommon, opt, numOr, SERIES_PALETTE } from "./core.js";
import { timeOf, parts, pad2, clock } from "./time.js";
import { xlsxBlob } from "./export.js";
import { TimeChartElement } from "./time-chart.js";
import { timeProps, refreshProps, zoomProps, annotationProps, exportProps, timeEvents, timeActions } from "./props.js";

const UNKNOWN = ["#9ca3af", "#a8a29e", "#94a3b8", "#a1a1aa"];

const ROW_FIELDS = {
    name: { type: "string", label: "Name", default: "Row" },
    id: { type: "string", label: "Id", default: "", bindable: false, help: "Fixed (renaming the row keeps it): its Update node and events find the row by it." },
    visible: { type: "boolean", label: "Visible", default: true },
    live: {
        type: "tag", access: "read", section: "Data", label: "Live state",
        help: "A tag or a variable: every new value is a change of state, now. A history from Logic: this row's Update node (Set states / Append change)."
    },
    maxChanges: { type: "number", section: "Data", label: "Changes kept", default: 5000, min: 50, max: 500000, step: 100, help: "The oldest go past it." }
};

const STATE_FIELDS = {
    label: { type: "string", label: "Label", default: "State" },
    match: { type: "enum", label: "Matches", default: "value", options: opt([["value", "A value"], ["range", "A range of numbers"]]) },
    value: { type: "string", label: "Value", default: "", help: "The value of the live state / of a change: 1, \"RUN\", true…", visibleWhen: (s) => s.match !== "range" },
    min: { type: "number", label: "From (≥)", default: "", visibleWhen: (s) => s.match === "range" },
    max: { type: "number", label: "To (<)", default: "", visibleWhen: (s) => s.match === "range" },
    color: { type: "color", label: "Colour", default: "#10b981" }
};

function rowDefaults() {
    const o = {};
    Object.keys(ROW_FIELDS).forEach((k) => { o[k] = ROW_FIELDS[k].default; });
    delete o.live;
    return o;
}

/** 350 ms · 12.5 s · 12m 05s · 6h 12m · 2d 3h */
export function fmtDuration(ms) {
    if (!Number.isFinite(ms)) return "";
    const a = Math.max(0, ms);
    if (a < 1000) return Math.round(a) + " ms";
    if (a < 60000) return (Math.round(a / 100) / 10) + " s";
    if (a < 3600000) return Math.floor(a / 60000) + "m " + pad2(Math.floor((a % 60000) / 1000)) + "s";
    if (a < 86400000) return Math.floor(a / 3600000) + "h " + pad2(Math.floor((a % 3600000) / 60000)) + "m";
    return Math.floor(a / 86400000) + "d " + Math.floor((a % 86400000) / 3600000) + "h";
}

const STATS = [["statsPercent", "%"], ["statsDuration", "Time"], ["statsCount", "Count"], ["statsFirst", "First"], ["statsLast", "Last"], ["statsCurrent", "Now"]];

export const stateTimeline = defineUI({
    ...chartCommon,
    id: PREFIX + "state-timeline",
    label: "State Timeline",
    icon: "fa fa-tasks",
    size: { w: 640, h: 260 },
    help: "What each machine / line / order was doing, along time: a lane per row (or per row and state), the states and their colours in the Properties, statistics per lane. Every row has its own Update node, message and events.",
    version: 1,

    groups: ["Rows", "States", "Layout", "Statistics", "Data", "Time axis", "Tooltip", "Legend", "Annotations", "Zoom & pan", "Export", "Style"],

    properties: {
        rows: {
            type: "list", group: "Rows", label: "Rows", noun: "row",
            help: "A machine, a line, an order… Each has its own Update node, message and events in Logic (Events tab).",
            default: [Object.assign(rowDefaults(), { id: "r1", name: "Machine 1" })],
            item: {
                fields: ROW_FIELDS, noun: "row", target: true,
                create: (items) => {
                    let n = items.length + 1;
                    const ids = new Set(items.map((x) => x && x.id));
                    while (ids.has("r" + n)) n++;
                    return Object.assign(rowDefaults(), { id: "r" + n, name: "Row " + n });
                },
                actions: {
                    setStates: {
                        label: "Set states", help: "Replaces this row's history: its changes ({time, state}) or intervals ({start, end, state}); a note each, if any.",
                        example: "[{ \"time\": 1727852400000, \"state\": 1 }, …]  or  [{ \"start\": …, \"end\": …, \"state\": \"RUN\", \"note\": \"Batch 104\" }, …]"
                    },
                    appendChange: {
                        label: "Append change", help: "A change of state: now (a value) or at its time (any order: a late one goes in its place).",
                        example: "1  or  { \"time\": 1727852400000, \"state\": 2, \"note\": \"Jam\" }  or  [ … ]"
                    },
                    clear: { label: "Clear", help: "Empties this row." }
                },
                events: {
                    stateChange: { label: "On State Change", payload: { from: "any", to: "any", time: "number", label: "string" }, help: "Its state changed (live or appended): from / to (values), the new state's label." }
                }
            }
        },
        states: {
            type: "list", group: "States", label: "States", noun: "state",
            help: "A value (or a range of numbers) -> a label and a colour. A value with no state: grey, its own text.",
            default: [{ label: "Running", match: "value", value: "1", color: "#10b981" }, { label: "Stopped", match: "value", value: "0", color: "#ef4444" }, { label: "Idle", match: "value", value: "2", color: "#f59e0b" }],
            item: {
                fields: STATE_FIELDS, noun: "state",
                create: (items) => ({ label: "State " + (items.length + 1), match: "value", value: String(items.length), color: SERIES_PALETTE[items.length % SERIES_PALETTE.length] })
            }
        },

        lanes: {
            type: "enum", group: "Layout", label: "Lanes", default: "combined",
            options: opt([["combined", "A lane per row (its states one after another)"], ["split", "A lane per row and state (each state on its own line)"]])
        },
        rowHeight: { type: "number", group: "Layout", label: "Lane height", default: 0, min: 0, max: 200, unit: "px", help: "0: the lanes share the height." },
        laneGap: { type: "number", group: "Layout", label: "Gap between lanes", default: 4, min: 0, max: 40, unit: "px" },
        showLabels: { type: "boolean", group: "Layout", label: "The state's label in its bar (when it fits)", default: true },

        showStats: { type: "boolean", group: "Statistics", label: "Statistics column", default: true, help: "Over the time shown (zoom / pan): what each lane did." },
        statsState: {
            type: "enum", group: "Statistics", label: "For the state", default: "",
            options: (p) => [{ value: "", label: "The first state (" + ((p && Array.isArray(p.states) && p.states[0] && p.states[0].label) || "—") + ")" }]
                .concat((Array.isArray(p && p.states) ? p.states : []).map((s) => ({ value: s.label, label: s.label }))),
            help: "A lane per row: the statistics of this state (e.g. Running: availability). A lane per state: its own.",
            visibleWhen: (p) => p.showStats !== false && p.lanes !== "split"
        },
        statsPercent: { type: "boolean", group: "Statistics", label: "% of the time", default: true, visibleWhen: (p) => p.showStats !== false },
        statsDuration: { type: "boolean", group: "Statistics", label: "Total time", default: true, visibleWhen: (p) => p.showStats !== false },
        statsCount: { type: "boolean", group: "Statistics", label: "Times entered", default: false, visibleWhen: (p) => p.showStats !== false },
        statsFirst: { type: "boolean", group: "Statistics", label: "First start", default: false, visibleWhen: (p) => p.showStats !== false },
        statsLast: { type: "boolean", group: "Statistics", label: "Last end", default: false, visibleWhen: (p) => p.showStats !== false },
        statsCurrent: { type: "boolean", group: "Statistics", label: "Its state now, since when", default: false, visibleWhen: (p) => p.showStats !== false },

        tooltip: { type: "boolean", group: "Tooltip", label: "Tooltip", default: true },
        legend: { type: "enum", group: "Legend", label: "Legend", default: "bottom", options: opt([["bottom", "Below"], ["top", "Above"], ["none", "None"]]) },
        showGrid: { type: "boolean", default: true, group: "Style", label: "Grid" },

        ...timeProps(),
        ...refreshProps("data"),
        ...zoomProps(),
        ...exportProps({ thresholds: false }),
        ...annotationProps()
    },

    parts: {
        chart: part("Chart canvas container", "chart"),
        legend: part("Legend", "legend")
    },

    events: {
        ...timeEvents(),
        segmentClick: { label: "On Segment Click", payload: { row: "string", state: "string", value: "any", start: "number", end: "number", duration: "number", note: "string" }, help: "A click on a state's bar: drill down (its batch, its alarms…)." },
        hover: { label: "On Hover", payload: { time: "number", row: "string", state: "string" }, help: "The time and the lane under the cursor: share a crosshair with other charts." }
    },

    actions: {
        ...timeActions(),
        clearAll: { label: "Clear every row" }
    },

    view: class extends TimeChartElement {
        _rows = new Map();   // key -> { ch: [{ t, v, note }] sorted, lastLive, demo }

        // the last state lasts until now: it grows on the Refresh ticker (or when data comes in)
        mounted() { this._startRefresh(); }

        propsChanged() { this.prepareData(); }

        // ---- rows & states ----------------------------------------------------------------------
        rowList() {
            const raw = Array.isArray(this.p && this.p.rows) ? this.p.rows : [];
            const c = this._rl;
            if (c && c.raw === raw) return c.list;
            const d = rowDefaults();
            const list = raw.map((r, i) => { const o = Object.assign({}, d, r && typeof r === "object" ? r : {}); o._i = i; o._key = String(o.id || "#" + i); return o; });
            this._rl = { raw, list };
            return list;
        }

        stateList() { return Array.isArray(this.p.states) ? this.p.states.filter((s) => s && typeof s === "object") : []; }

        /** The state a value is: { label, color, def } (a value no state matches: grey, its text; null: a gap). */
        stateOf(v) {
            if (v === null || v === undefined) return null;
            const sv = String(v), nv = Number(v);
            for (const s of this.stateList()) {
                if (s.match === "range") {
                    const lo = numOr(s.min, -Infinity), hi = numOr(s.max, Infinity);
                    if (Number.isFinite(nv) && nv >= lo && nv < hi) return { label: s.label || sv, color: s.color || "#10b981", def: s };
                } else if (String(s.value) === sv) return { label: s.label || sv, color: s.color || "#10b981", def: s };
            }
            let h = 0;
            for (let i = 0; i < sv.length; i++) h = (h * 31 + sv.charCodeAt(i)) | 0;
            return { label: sv, color: UNKNOWN[Math.abs(h) % UNKNOWN.length], def: null };
        }

        _row(r) {
            let st = this._rows.get(r._key);
            if (!st) { st = { ch: [], lastLive: undefined, demo: false }; this._rows.set(r._key, st); }
            return st;
        }

        _target(r) { return { list: "rows", id: r.id || r._key }; }

        findRow(ref) {
            const list = this.rowList();
            if (ref && typeof ref === "object" && ref.id !== undefined) ref = ref.id;
            if (ref === undefined || ref === null || ref === "") return list[0] || null;
            const byIndex = typeof ref === "number" || /^\d+$/.test(String(ref)) ? list[Number(ref)] : null;
            return list.find((r) => r.id && r.id === String(ref)) || list.find((r) => r.name === String(ref)) || byIndex || null;
        }

        // a change of state into a row, in time order (an equal time replaces); -> whether it is the newest
        _insert(st, t, v, note, cap) {
            const ch = st.ch;
            let i = ch.length;
            while (i > 0 && ch[i - 1].t > t) i--;
            const c = { t, v, note: note || "" };
            if (i > 0 && ch[i - 1].t === t) ch[i - 1] = c; else ch.splice(i, 0, c);
            if (ch.length > cap) ch.splice(0, ch.length - cap);
            return i >= ch.length - 1;
        }

        // a change / a list of them / an interval / a value (now) -> [{ t, v, note }] (intervals: their end a gap)
        _changesOf(x) {
            const out = [];
            const one = (c) => {
                if (c === null || c === undefined || c === "" || c === "???") return;
                if (typeof c !== "object") { out.push({ t: Date.now(), v: c }); return; }
                if (c.start !== undefined) {
                    const a = timeOf(c.start), b = c.end === undefined || c.end === null || c.end === "" ? NaN : timeOf(c.end);
                    if (!Number.isFinite(a)) return;
                    out.push({ t: a, v: c.state !== undefined ? c.state : c.value, note: c.note });
                    if (Number.isFinite(b) && b > a) out.push({ t: b, v: null, end: true });
                    return;
                }
                const t = c.time !== undefined ? timeOf(c.time) : c.t !== undefined ? timeOf(c.t) : c.x !== undefined ? timeOf(c.x) : Date.now();
                const v = c.state !== undefined ? c.state : c.value !== undefined ? c.value : c.v !== undefined ? c.v : c.y;
                if (Number.isFinite(t) && v !== undefined) out.push({ t, v, note: c.note });
            };
            (Array.isArray(x) ? x : [x]).forEach(one);
            return out;
        }

        // changes into a row: a gap is kept only where no state starts at the same time
        _addChanges(r, st, list, fire) {
            this._tickClock();
            if (st.demo) { st.ch = []; st.demo = false; }
            const cap = Math.max(50, numOr(r.maxChanges, 5000));
            let n = 0;
            const starts = new Set(list.filter((c) => !c.end).map((c) => c.t));
            for (const c of list) {
                if (c.end && starts.has(c.t)) continue;
                const before = st.ch.length ? st.ch[st.ch.length - 1].v : undefined;
                const newest = this._insert(st, c.t, c.v, c.note, cap);
                n++;
                if (fire && newest && !c.end && !this.isEditor && String(before) !== String(c.v)) {
                    const s = this.stateOf(c.v);
                    this.emit("stateChange", { from: before === undefined ? null : before, to: c.v, time: c.t, label: s ? s.label : "" }, this._target(r));
                }
            }
            return n;
        }

        prepareData() {
            const list = this.rowList(), live = new Set();
            let dirty = false;
            for (const r of list) {
                live.add(r._key);
                const st = this._row(r);
                const v = r.live;
                if (v !== undefined && v !== null && v !== "" && v !== "???" && v !== st.lastLive && !(typeof v === "object" && !Array.isArray(v) && v.$bind)) {
                    st.lastLive = v;
                    const last = st.ch.length ? st.ch[st.ch.length - 1].v : undefined;
                    const chs = this._changesOf(v);
                    // a plain value equal to the state it is in: no change
                    if (!(typeof v !== "object" && last !== undefined && String(last) === String(v))) {
                        if (this._addChanges(r, st, chs, true)) dirty = true;
                    }
                }
                if (this._ctx && this._ctx.mode === "editor" && st.ch.length === 0) { this._demo(st, r._i); dirty = true; }
            }
            for (const k of Array.from(this._rows.keys())) if (!live.has(k)) { this._rows.delete(k); dirty = true; }
            if (dirty) { this.scheduleDraw(); this.requestUpdate(); }
        }

        _demo(st, i) {
            const states = this.stateList();
            const vals = states.length ? states.map((s) => (s.match === "range" ? numOr(s.min, 0) : s.value)) : [1, 0, 2];
            const now = Date.now();
            let t = now - 4 * 3600000, k = i;
            st.ch = [];
            while (t < now) { st.ch.push({ t, v: vals[k % vals.length], note: "" }); t += (20 + ((k * 37 + i * 11) % 50)) * 60000; k++; }
            st.demo = true;
            this._tickClock();
        }

        // ---- a row's actions (its own Update node): (params = msg.payload, target) ----------------
        setStates(params, target) {
            const r = this.findRow(target || (params && params.row));
            if (!r) return 0;
            const st = this._row(r);
            st.ch = [];
            st.demo = false;
            const list = Array.isArray(params) ? params : params && Array.isArray(params.states) ? params.states : [];
            const n = this._addChanges(r, st, this._changesOf(list), false);
            this.scheduleDraw();
            this.requestUpdate();
            return n;
        }

        appendChange(params, target) {
            const r = this.findRow(target || (params && !Array.isArray(params) && typeof params === "object" && params.row));
            if (!r) return 0;
            const n = this._addChanges(r, this._row(r), this._changesOf(params), true);
            if (n) { this.scheduleDraw(); this.requestUpdate(); }
            return n;
        }

        clear(params, target) {
            this._tickClock();
            const r = this.findRow(target || (params && params.row));
            if (!r) return;
            this._row(r).ch = [];
            this.scheduleDraw();
            this.requestUpdate();
        }

        clearAll() {
            this._tickClock();
            for (const st of this._rows.values()) st.ch = [];
            this.viewRange = null;
            this.hover = null;
            this.scheduleDraw();
            this.requestUpdate();
        }

        // ---- segments, lanes, statistics ---------------------------------------------------------
        _visible() { return this.rowList().filter((r) => r.visible !== false && this._row(r).ch.length > 0); }

        _open() { return this._visible().some((r) => { const ch = this._row(r).ch; return ch.length && ch[ch.length - 1].v !== null; }); }

        // a row's segments within [a, b]: { start, end, v, note } (clipped), gaps left out
        segmentsOf(r, a, b) {
            const ch = this._row(r).ch, out = [], now = this._now();
            for (let i = 0; i < ch.length; i++) {
                const c = ch[i];
                if (c.v === null) continue;
                const end = i + 1 < ch.length ? ch[i + 1].t : Math.max(now, c.t);
                if (end <= a || c.t >= b) continue;
                out.push({ start: Math.max(c.t, a), end: Math.min(end, b), v: c.v, note: c.note, fullStart: c.t, fullEnd: end });
            }
            return out;
        }

        _fullBounds() {
            let lo = Infinity, hi = -Infinity;
            const now = this._now();
            for (const r of this._visible()) {
                const ch = this._row(r).ch;
                if (!ch.length) continue;
                lo = Math.min(lo, ch[0].t);
                hi = Math.max(hi, ch[ch.length - 1].v === null ? ch[ch.length - 1].t : Math.max(now, ch[ch.length - 1].t));
            }
            return Number.isFinite(lo) ? { minX: lo, maxX: hi > lo ? hi : lo + 1000 } : null;
        }

        _hasData() { return this._visible().length > 0; }

        // the lanes: a row each, or a row and state each (the defined states, then the values seen)
        lanes() {
            const rows = this._visible();
            if (this.p.lanes !== "split") return rows.map((r) => ({ row: r, key: r._key, label: r.name || r.id, state: null }));
            const out = [];
            for (const r of rows) {
                const seen = new Map();
                for (const s of this.stateList()) seen.set(s.label, { label: s.label, color: s.color, def: s });
                for (const c of this._row(r).ch) { const s = this.stateOf(c.v); if (s && !seen.has(s.label)) seen.set(s.label, s); }
                for (const s of seen.values()) out.push({ row: r, key: r._key + "|" + s.label, label: (r.name || r.id) + " · " + s.label, state: s });
            }
            return out;
        }

        // the state a lane's statistics are about (a lane per state: its own)
        _statsStateOf(lane) {
            if (lane.state) return lane.state.label;
            const want = this.p.statsState;
            const first = this.stateList()[0];
            return want || (first ? first.label : null);
        }

        /** A lane's statistics over [a, b]: { pct, ms, count, first, last, now, since } of its state. */
        statsOf(lane, a, b) {
            const label = this._statsStateOf(lane);
            const segs = this.segmentsOf(lane.row, a, b);
            let covered = 0, ms = 0, count = 0, first = null, last = null;
            for (const s of segs) {
                covered += s.end - s.start;
                const st = this.stateOf(s.v);
                if (!st || st.label !== label) continue;
                ms += s.end - s.start;
                count++;
                if (first === null) first = s.start;
                last = s.end;
            }
            const ch = this._row(lane.row).ch, lastC = ch[ch.length - 1];
            const cur = lastC && lastC.v !== null ? this.stateOf(lastC.v) : null;
            return { label, pct: covered > 0 ? ms / covered : NaN, ms, count, first, last, now: cur ? cur.label : "—", since: cur ? lastC.t : null };
        }

        _statCols() { return this.p.showStats === false ? [] : STATS.filter(([k]) => this.p[k] === true || (this.p[k] !== false && (k === "statsPercent" || k === "statsDuration"))); }

        _statText(k, st, span) {
            const t = (x) => (x === null ? "—" : span >= 86400000 ? this.fmtDateShort(x) + " " + clock(parts(x, this._tf().utc), this._tf().h12, false) : clock(parts(x, this._tf().utc), this._tf().h12, true));
            if (k === "statsPercent") return Number.isFinite(st.pct) ? formatValue(st.pct * 100, { decimals: 1, separators: "dot" }) + "%" : "—";
            if (k === "statsDuration") return fmtDuration(st.ms);
            if (k === "statsCount") return String(st.count) + "×";
            if (k === "statsFirst") return t(st.first);
            if (k === "statsLast") return t(st.last);
            return st.now + (st.since !== null ? " · " + fmtDuration(this._now() - st.since) : "");
        }

        // ---- geometry ------------------------------------------------------------------------------
        getPlotMetrics(width, height, layout) {
            const L = layout || (this._scale && this._scale.layout) || { labelW: 80, statsW: 0, lanes: 1 };
            const rh = this._rulerHeight(height), rulerGap = rh ? 6 : 0;
            const head = L.statsW ? 18 : 6;
            const plotX = L.labelW + 8, plotY = head;
            const plotW = Math.max(1, width - plotX - (L.statsW ? L.statsW + 12 : 12));
            const plotH = Math.max(1, height - plotY - rh - rulerGap - 6);
            return { plotX, plotY, plotW, plotH, padRight: width - plotX - plotW, rulerX: plotX, rulerY: plotY + plotH + rulerGap, rulerW: plotW, rulerH: rh, statsX: plotX + plotW + 12 };
        }

        _laneBoxes(m, lanes) {
            const gap = Math.max(0, numOr(this.p.laneGap, 4)), n = lanes.length || 1;
            const fixed = numOr(this.p.rowHeight, 0);
            const h = fixed > 0 ? Math.min(fixed, (m.plotH - gap * (n - 1)) / n) : (m.plotH - gap * (n - 1)) / n;
            return lanes.map((l, i) => ({ lane: l, y: m.plotY + i * (h + gap), h: Math.max(2, h) }));
        }

        // ---- drawing ----------------------------------------------------------------------------------
        _drawInto(ctx, width, height, range) {
            ctx.clearRect(0, 0, width, height);
            const lanes = this.lanes();
            if (!lanes.length) { this._scale = null; return; }
            const fb = this._fullBounds();
            if (!fb) return;
            this._full = fb;
            this._newest = fb.maxX;
            const { vMinX, vMaxX } = range || this.getEffectiveTimeRange(fb);
            const c = this._colors();
            // the label column and the statistics column: as wide as their texts
            ctx.font = "11px " + c.mono;
            let labelW = 40;
            for (const l of lanes) labelW = Math.max(labelW, Math.ceil(ctx.measureText(l.label).width));
            labelW = Math.min(labelW, Math.round(width * 0.3));
            const cols = this._statCols(), span = vMaxX - vMinX;
            const stats = lanes.map((l) => this.statsOf(l, vMinX, vMaxX));
            const colW = cols.map(([k, title], j) => {
                let w = ctx.measureText(j === 0 && k === "statsPercent" && this.p.lanes !== "split" ? "% " + (stats[0] && stats[0].label || "") : title).width;
                stats.forEach((st) => { w = Math.max(w, ctx.measureText(this._statText(k, st, span)).width); });
                return Math.ceil(w) + 12;
            });
            const statsW = colW.reduce((a, b) => a + b, 0);
            const layout = { labelW, statsW, colW, cols };
            const m = this.getPlotMetrics(width, height, layout);
            const { plotX, plotY, plotW, plotH } = m;
            const xSpan = Math.max(1, vMaxX - vMinX);
            const toX = (t) => plotX + ((t - vMinX) / xSpan) * plotW;
            const boxes = this._laneBoxes(m, lanes);
            this._scale = { vMinX, vMaxX, toX, m, layout, boxes, stats };
            // the corner (Live, ⋮) at the plot's top-right, not over the statistics
            const corner = !this._exporting && this.renderRoot && this.renderRoot.querySelector(".corner");
            if (corner) corner.style.right = (m.padRight + 6) + "px";

            // the time grid, the lanes' backgrounds
            if (this.p.showGrid !== false) {
                const step = this._timeStep(xSpan, plotW);
                ctx.beginPath();
                ctx.strokeStyle = c.grid;
                ctx.lineWidth = 1;
                for (let t = Math.ceil(vMinX / step) * step; t <= vMaxX; t += step) { const sx = Math.round(toX(t)) + 0.5; ctx.moveTo(sx, plotY); ctx.lineTo(sx, plotY + plotH); }
                ctx.stroke();
            }
            ctx.textBaseline = "middle";
            for (const b of boxes) {
                ctx.fillStyle = c.band;
                ctx.fillRect(plotX, b.y, plotW, b.h);
                ctx.fillStyle = c.strong;
                ctx.textAlign = "right";
                ctx.font = "11px " + c.mono;
                ctx.fillText(this._fit(ctx, b.lane.label, labelW), plotX - 8, b.y + b.h / 2);
            }

            // the segments
            ctx.save();
            ctx.beginPath();
            ctx.rect(plotX, plotY, plotW, plotH);
            ctx.clip();
            if (this._selection) {
                const a = toX(Math.min(this._selection.from, this._selection.to)), z = toX(Math.max(this._selection.from, this._selection.to));
                ctx.fillStyle = "rgba(59, 130, 246, 0.14)";
                ctx.fillRect(a, plotY, z - a, plotH);
            }
            const hov = this.hover && this.hover.seg;
            for (const b of boxes) {
                for (const s of this.segmentsOf(b.lane.row, vMinX, vMaxX)) {
                    const st = this.stateOf(s.v);
                    if (!st || (b.lane.state && st.label !== b.lane.state.label)) continue;
                    const x0 = toX(s.start), x1 = Math.max(toX(s.end), x0 + 1);
                    ctx.fillStyle = st.color;
                    ctx.fillRect(x0, b.y, x1 - x0, b.h);
                    if (hov && hov.lane === b.lane.key && hov.fullStart === s.fullStart) {
                        ctx.strokeStyle = c.strong;
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x0 + 1, b.y + 1, x1 - x0 - 2, b.h - 2);
                    }
                    if (this.p.showLabels !== false && b.h >= 12) {
                        ctx.font = "10.5px " + c.mono;
                        const text = st.label, tw = ctx.measureText(text).width;
                        if (tw + 8 < x1 - x0) {
                            ctx.fillStyle = this._contrast(st.color);
                            ctx.textAlign = "left";
                            ctx.fillText(text, Math.max(x0, plotX) + 4, b.y + b.h / 2);
                        }
                    }
                }
            }
            if (!(this._exporting && this._exporting.noAnnotations)) this._drawAnnotations(ctx, toX, plotX, plotY, plotW, plotH, vMinX, vMaxX);
            if (this.hover && this.hover.time >= vMinX && this.hover.time <= vMaxX) {
                const hx = Math.round(toX(this.hover.time)) + 0.5;
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = c.text;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(hx, plotY);
                ctx.lineTo(hx, plotY + plotH);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.restore();

            // the statistics: a header, a column per figure, a row per lane
            if (cols.length) {
                ctx.font = "10px " + c.mono;
                ctx.textAlign = "right";
                let x = m.statsX;
                cols.forEach(([k, title], j) => {
                    x += colW[j];
                    ctx.fillStyle = c.text;
                    const head = k === "statsPercent" && this.p.lanes !== "split" ? "% " + (stats[0] ? stats[0].label : "") : title;
                    ctx.fillText(head, x - 4, plotY - 9);
                    boxes.forEach((b, i) => {
                        ctx.fillStyle = c.strong;
                        ctx.fillText(this._statText(k, stats[i], span), x - 4, b.y + b.h / 2);
                    });
                });
            }
            this._drawRuler(ctx, m, vMinX, vMaxX, boxes);
        }

        _fit(ctx, text, w) {
            if (ctx.measureText(text).width <= w) return text;
            let t = text;
            while (t.length > 1 && ctx.measureText(t + "…").width > w) t = t.slice(0, -1);
            return t + "…";
        }

        // text on a colour: dark on light, light on dark
        _contrast(color) {
            const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim().length === 4 ? String(color).replace(/^#?(.)(.)(.)$/, "#$1$1$2$2$3$3") : String(color).trim());
            if (!m) return "#fff";
            const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
            return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111827" : "#ffffff";
        }

        // the navigator: every lane, small
        _navTraces(ctx, g, boxes) {
            const lanes = (boxes || []).map((b) => b.lane);
            if (!lanes.length) return;
            const lh = (g.h - 4) / lanes.length;
            lanes.forEach((l, i) => {
                for (const s of this.segmentsOf(l.row, g.full.minX, g.full.maxX)) {
                    const st = this.stateOf(s.v);
                    if (!st || (l.state && st.label !== l.state.label)) continue;
                    ctx.fillStyle = this.hexToRgba(st.color, 0.85);
                    const a = g.toX(s.start);
                    ctx.fillRect(a, g.y + 2 + i * lh, Math.max(1, g.toX(s.end) - a), Math.max(1, lh - 1));
                }
            });
        }

        // ---- the pointer in the plot ----------------------------------------------------------------
        _hitAt(px, py, time) {
            const sc = this._scale;
            if (!sc) return null;
            const b = sc.boxes.find((x) => py >= x.y && py <= x.y + x.h);
            if (!b) return null;
            const s = this.segmentsOf(b.lane.row, sc.vMinX, sc.vMaxX).find((x) => {
                const st = this.stateOf(x.v);
                return time >= x.start && time <= x.end && st && (!b.lane.state || st.label === b.lane.state.label);
            });
            return s ? Object.assign({ lane: b.lane.key, row: b.lane.row, stateInfo: this.stateOf(s.v) }, s) : { lane: b.lane.key, row: b.lane.row, stateInfo: null };
        }

        _plotHover(L, time) {
            const hit = this._hitAt(L.px, L.py, time);
            this.hover = { time, px: L.px, py: L.py, seg: hit && hit.stateInfo ? hit : null };
            this.draw();
            this._showTooltip(L.px, L.py, L.rect.width);
            const now = Date.now();
            if (now - this._lastHoverEmit > 100) {
                this._lastHoverEmit = now;
                this.emit("hover", { time, row: hit ? hit.row.id || hit.row.name : "", state: hit && hit.stateInfo ? hit.stateInfo.label : "" });
            }
        }

        _plotClick(L, time) {
            const hit = this._hitAt(L.px, L.py, time);
            if (!hit || !hit.stateInfo) return;
            this.emit("segmentClick", { row: hit.row.id || hit.row.name, state: hit.stateInfo.label, value: hit.v, start: hit.fullStart, end: hit.fullEnd, duration: hit.fullEnd - hit.fullStart, note: hit.note || "" });
        }

        _showHitsTooltip(px, py, rectW) {
            const tip = this.renderRoot.querySelector(".tooltip");
            if (!tip) return;
            const s = this.hover && this.hover.seg;
            if (!s || this.p.tooltip === false) { tip.style.display = "none"; return; }
            tip.querySelector(".tooltip-time").textContent = (s.row.name || s.row.id) + " — " + s.stateInfo.label;
            const body = tip.querySelector(".tooltip-rows");
            const lines = [[s.stateInfo.color, this.fmtTime(s.fullStart) + "  →  " + (s.fullEnd >= this._now() - 1500 ? this.fmtTime(s.fullEnd) + " (now)" : this.fmtTime(s.fullEnd))],
                [null, "Duration: " + fmtDuration(s.fullEnd - s.fullStart)]];
            if (s.note) lines.push([null, s.note]);
            if (String(s.v) !== s.stateInfo.label) lines.push([null, "Value: " + String(s.v)]);
            while (body.children.length > lines.length) body.removeChild(body.lastChild);
            lines.forEach(([color, text], i) => {
                let row = body.children[i];
                if (!row) {
                    row = document.createElement("div");
                    row.className = "tooltip-row";
                    row.appendChild(document.createElement("span")).className = "tooltip-dot";
                    row.appendChild(document.createElement("span")).className = "tooltip-text";
                    body.appendChild(row);
                }
                row.children[0].style.background = color || "transparent";
                row.children[1].textContent = text;
            });
            const flip = px > rectW - 240;
            tip.style.display = "block";
            tip.style.left = `${Math.round(flip ? px - 12 : px + 12)}px`;
            tip.style.top = `${Math.round(py)}px`;
            tip.style.transform = flip ? "translate(-100%, -50%)" : "translate(0, -50%)";
        }

        // ---- export ---------------------------------------------------------------------------------
        _exportSpan(range) {
            const fb = this._fullBounds();
            if (range === "visible" && this._scale) return { list: this._visible(), from: this._scale.vMinX, to: this._scale.vMaxX };
            return { list: this._visible(), from: fb ? fb.minX : 0, to: fb ? fb.maxX : 0 };
        }

        _legendStates() {
            const seen = new Map();
            for (const s of this.stateList()) seen.set(s.label, { label: s.label, color: s.color });
            for (const r of this._visible()) for (const c of this._row(r).ch) { const s = this.stateOf(c.v); if (s && !seen.has(s.label)) seen.set(s.label, s); }
            return Array.from(seen.values());
        }

        _pngLegend() { return this._legendStates().map((s) => ({ color: s.color, text: s.label })); }

        /**
         * Download: { format: "csv" | "xlsx" | "png", range, annotations }. A row per state's segment
         * (row, state, value, start, end, seconds, note); Excel: the state's colour, a Summary sheet
         * (each lane: its states' time, %, count, first, last), an Annotations sheet, an Info sheet.
         */
        exportData(params) {
            const o = this._exportOpts(params);
            if (o.format === "png") return this.exportPNG(params);
            const { from, to } = this._exportSpan(o.range);
            const utc = this.p.timeZone === "utc";
            const stamp = (ts) => { const q = parts(ts, utc); return q.y + "-" + pad2(q.mo + 1) + "-" + pad2(q.d) + " " + pad2(q.h) + ":" + pad2(q.mi) + ":" + pad2(q.s) + "." + String(q.ms).padStart(3, "0"); };
            const rows = [], fills = [];
            for (const r of this._visible()) {
                for (const s of this.segmentsOf(r, from, to)) {
                    const st = this.stateOf(s.v);
                    rows.push([r.name || r.id, st.label, s.v === null ? "" : (typeof s.v === "number" ? s.v : String(s.v)), s.start, s.end, Math.round(s.end - s.start) / 1000, s.note || ""]);
                    fills.push([null, st.color, null, null, null, null, null]);
                }
            }
            rows.sort((a, b) => a[3] - b[3] || String(a[0]).localeCompare(String(b[0])));
            const header = ["Row", "State", "Value", "Start", "End", "Duration (s)", "Note"];
            const anns = o.annotations ? this._allAnnotations().filter((a) => a.time >= from && a.time <= to) : [];
            let blob;
            if (o.format === "xlsx") {
                // the summary: each row (and state), each state's time, %, count, first, last
                const sum = [];
                for (const r of this._visible()) {
                    const segs = this.segmentsOf(r, from, to);
                    const covered = segs.reduce((a, s) => a + (s.end - s.start), 0);
                    const by = new Map();
                    for (const s of segs) {
                        const st = this.stateOf(s.v), e = by.get(st.label) || { ms: 0, n: 0, first: s.start, last: s.end };
                        e.ms += s.end - s.start; e.n++; e.last = s.end;
                        by.set(st.label, e);
                    }
                    for (const [label, e] of by) sum.push([r.name || r.id, label, Math.round(e.ms) / 1000, covered ? Math.round((e.ms / covered) * 10000) / 100 : 0, e.n, e.first, e.last]);
                }
                const sheets = [{ name: "Summary", header: ["Row", "State", "Time (s)", "%", "Count", "First start", "Last end"], rows: sum, timeCols: [5, 6], textCols: [0, 1] }];
                if (anns.length) sheets.push({ name: "Annotations", header: ["Time", "Label", "Description"], rows: anns.map((a) => [a.time, a.label, a.description || ""]), timeCols: [0], textCols: [1, 2] });
                const zone = utc ? "UTC" : ((() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return "local"; } })());
                const info = [["Chart", this._exportTitle() || "State timeline"], ["From", stamp(from)], ["To", stamp(to)], ["Range", o.range === "all" ? "Everything it holds" : "What was shown"], ["Time zone", zone], ["Exported", stamp(Date.now())]]
                    .concat(this._legendStates().map((s) => ["State", s.label + " (" + s.color + ")"]));
                blob = xlsxBlob(header, rows, utc, { timeCols: [3, 4], textCols: [0, 1, 6], fills, sheets, info });
            } else {
                const q = (t) => '"' + String(t).replace(/"/g, '""') + '"';
                const lines = [header.map(q).join(",")];
                rows.forEach((r) => lines.push([q(r[0]), q(r[1]), q(r[2]), stamp(r[3]), stamp(r[4]), r[5], q(r[6])].join(",")));
                anns.forEach((a) => lines.push([q("Annotation"), q(a.label), "", stamp(a.time), "", "", q(a.description || "")].join(",")));
                blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
            }
            const name = this._getExportFileName(o.format, o.range);
            this._download(blob, name);
            this._lastExport = { name, rows: rows.length, blob };
            this.scheduleDraw();
            return rows.length;
        }

        render() {
            const legendAt = this.p.legend || "bottom";
            const states = this._legendStates();
            const legend = legendAt === "none" || !states.length ? "" : html`
                <div class="legend" part="legend">
                    ${states.map((s) => html`<span class="lg-item"><span class="lg-swatch" style="background:${s.color};height:10px;width:10px"></span><span class="lg-name">${s.label}</span></span>`)}
                </div>`;
            return html`
                <div class="chart-container" part="chart">
                    ${legendAt === "top" ? legend : ""}
                    <div class="plot"
                        @wheel=${(e) => this.onWheel(e)}
                        @pointerdown=${(e) => this.onPointerDown(e)}
                        @pointermove=${(e) => this.onPointerMove(e)}
                        @pointerup=${(e) => this.onPointerUp(e)}
                        @pointerleave=${() => this.onPointerLeave()}
                        @dblclick=${() => this.followLive()}>
                        <canvas></canvas>
                        <div class="corner" style="right:${this._scale && this._scale.m ? this._scale.m.padRight + 6 : 20}px">
                            ${this.viewRange ? html`
                                <button class="btn-chip btn-reset-zoom" @click=${() => this.followLive()} title="Follow the newest data again (or double click the chart)">
                                    <span class="live-dot"></span> Reset Zoom
                                </button>` : ""}
                            ${this._renderMenu()}
                        </div>
                        <div class="tooltip"><div class="tooltip-time"></div><div class="tooltip-rows"></div></div>
                        ${!this._hasData() ? html`<div class="empty"><i class="fa fa-tasks" style="font-size: 24px; opacity: 0.4;"></i><span>No data received</span></div>` : ""}
                    </div>
                    ${legendAt !== "top" ? legend : ""}
                </div>`;
        }
    }
});
