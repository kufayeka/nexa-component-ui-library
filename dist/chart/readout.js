// Nexa UI — ReadoutElement: the base of a chart that shows VALUES (KPI / Stat, Gauge, Bar Gauge).
// What they share:
//   - ITEMS (tiles, gauges, bars): each a Logic target with its own Update node (Set value / Set history / Clear) and
//     events (On Click, On State Change, On Stale / Resume); its value from a live tag or Logic, its history in a Float64
//     ring; the fields every item has: readoutFields() (data, numbers, delta, context);
//   - the figure shown: the last value, or one over a window (average / min / max / sum / change / count);
//   - its text: auto-fit (as big as the box allows) or a size, the unit after it, value texts (0 = Off);
//   - a delta against the previous value, the same figure some time ago, or the target (▲ ▼, up is good or bad);
//   - threshold STEPS "from this value on" with a theme status colour (success / warning / error / info / neutral) or
//     their own colour, for one item or every item; the step a value is in (On State Change);
//   - a scale: min / max (soft: it grows with the data) and its ticks (automatic, a step, or a list);
//   - stale: no data for N ms; the editor's sample (decoration, never data: the sample-data rule).
// A chart says which list holds its items (`itemsKey`) and draws them (_drawInto(ctx, w, h)); the data side is here.
import { formatValue } from "../../../nexa-sdk/nexa-component-sdk.js";
import { ChartElement, opt, numOr, NOTATIONS, DECIMALS } from "./core.js";
import { TimeSeriesRingBuffer, lowerBoundRing, upperBoundRing } from "./buffer.js";
import { xlsxBlob } from "./export.js";
import { niceTicks } from "./stack.js";
import { spanMs } from "./time.js";

export const STATUSES = [["success", "Good (green)"], ["warning", "Warning (yellow)"], ["error", "Alarm (red)"], ["info", "Info (blue)"], ["neutral", "Neutral (grey)"], ["custom", "Its own colour"]];
export const REDUCERS = [["last", "The last value"], ["avg", "Average"], ["min", "Minimum"], ["max", "Maximum"], ["sum", "Sum"], ["delta", "Change (last − first)"], ["count", "Count of values"]];
export const WINDOWS = [["", "Everything kept"], ["1m", "The last minute"], ["15m", "The last 15 minutes"], ["1h", "The last hour"], ["8h", "The last 8 hours (a shift)"], ["24h", "The last 24 hours"], ["7d", "The last 7 days"]];

/** "0=Off, 1=Run" -> Map (null: none). */
export function parseValueMap(text) {
    if (typeof text !== "string" || !text.trim()) return null;
    const m = new Map();
    for (const part of text.split(/[,;\n]+/)) {
        const i = part.indexOf("=");
        if (i < 1) continue;
        const v = Number(part.slice(0, i).trim()), t = part.slice(i + 1).trim();
        if (Number.isFinite(v) && t) m.set(v, t);
    }
    return m.size ? m : null;
}

/**
 * One figure from a ring's points in [from, to] (to: the newest when left out): last / avg / min / max / sum / delta /
 * count (NaN: none).
 */
export function reduce(buf, how, from, to) {
    if (!buf || !buf.count) return NaN;
    const i0 = Number.isFinite(from) ? Math.max(0, lowerBoundRing(buf, from)) : 0;
    const n = Number.isFinite(to) ? Math.min(buf.count, upperBoundRing(buf, to)) : buf.count;
    if (i0 >= n) return how === "count" ? 0 : NaN;
    if (how === "last" || !how) return buf.getY(n - 1);
    if (how === "count") return n - i0;
    if (how === "delta") return buf.getY(n - 1) - buf.getY(i0);
    let sum = 0, mn = Infinity, mx = -Infinity;
    for (let i = i0; i < n; i++) { const y = buf.getY(i); sum += y; if (y < mn) mn = y; if (y > mx) mx = y; }
    return how === "avg" ? sum / (n - i0) : how === "min" ? mn : how === "max" ? mx : sum;
}

/** The step a value is in: thresholds sorted by `from`; below the first: the base (null). */
export function stepOf(v, steps) {
    let at = null;
    for (const s of steps) if (Number.isFinite(s.from) && v >= s.from) at = s;
    return at;
}

/** The ticks of a scale: a list ("0, 25, 80, 100"), a step, or nice ones (about `target`); in [min, max]. */
export function scaleTicks(min, max, step, list, target) {
    if (typeof list === "string" && list.trim()) {
        return list.split(/[,;\s]+/).map(Number).filter((v) => Number.isFinite(v) && v >= Math.min(min, max) && v <= Math.max(min, max)).sort((a, b) => a - b);
    }
    if (step > 0 && (max - min) / step <= 200) {
        const out = [];
        for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Math.round(v / step) * step);
        return out;
    }
    return niceTicks(min, max, target || 5).ticks.filter((t) => t >= min - 1e-9 && t <= max + 1e-9);
}

// ---- the fields of an item (a tile, a gauge, a bar), the steps, its actions and events ----------------------------
const listOf = (key) => (p) => (Array.isArray(p && p[key]) ? p[key] : []);

/** The fields every item has. noun: "tile" / "gauge" / "bar" (the help texts). */
export function readoutFields(noun) {
    return {
        name: { type: "string", label: "Name", default: "Value" },
        id: { type: "string", label: "Id", default: "", bindable: false, help: "Fixed (renaming the " + noun + " keeps it): its Update node, its events and a threshold find the " + noun + " by it." },
        visible: { type: "boolean", label: "Visible", default: true },

        live: { type: "tag", access: "read", section: "Data", label: "Live value", help: "A tag or a variable: every new value is a point (its time = now). From Logic: this " + noun + "'s Update node (Set value / Set history)." },
        reduceBy: { type: "enum", section: "Data", label: "The figure shown", default: "last", options: opt(REDUCERS), help: "Over the window below: the last value, or the average / min / max / sum / change of the values in it." },
        window: { type: "enum", section: "Data", label: "Over", default: "", options: opt(WINDOWS) },
        maxPoints: { type: "number", section: "Data", label: "Values kept", default: 5000, min: 10, max: 1000000, step: 100, help: "A ring: the oldest go past it." },
        staleAfter: { type: "number", section: "Data", label: "Stale after (ms without data)", default: 0, min: 0, step: 1000, help: "0 = never. No new value for this long: it fades with \"Stale\" and how long (On Stale / On Resume)." },

        unit: { type: "string", section: "Numbers", label: "Unit (kWh, °C, %)", default: "" },
        notation: { type: "enum", section: "Numbers", label: "Notation", default: "standard", options: opt(NOTATIONS) },
        decimals: { type: "enum", section: "Numbers", label: "Decimals", default: "auto", options: opt(DECIMALS) },
        valueMap: { type: "string", section: "Numbers", label: "Value texts", default: "", bindable: false, help: "A text for a value: 0=Off, 1=Run, 2=Fault." },

        deltaFrom: {
            type: "enum", section: "Delta", label: "Compare with", default: "none",
            options: opt([["none", "Nothing"], ["previous", "The previous value"], ["ago", "The same figure some time ago"], ["target", "The target"]])
        },
        deltaAgo: { type: "enum", section: "Delta", label: "How long ago", default: "1h", options: opt([["1m", "1 minute"], ["15m", "15 minutes"], ["1h", "1 hour"], ["8h", "8 hours (a shift)"], ["24h", "24 hours"], ["7d", "7 days"]]), visibleWhen: (t) => t.deltaFrom === "ago" },
        deltaAs: { type: "enum", section: "Delta", label: "As", default: "percent", options: opt([["percent", "A %"], ["value", "A value"]]), visibleWhen: (t) => t.deltaFrom && t.deltaFrom !== "none" },
        upIsGood: { type: "boolean", section: "Delta", label: "Up is good (green); off: up is bad (red)", default: true, visibleWhen: (t) => t.deltaFrom && t.deltaFrom !== "none" },

        target: { type: "number", section: "Context", label: "Target", default: "", help: "The plan (a marker; a Compare with: The target)." },
        setpoint: { type: "number", section: "Context", label: "Setpoint", default: "" },
        normalLow: { type: "number", section: "Context", label: "Normal from", default: "", help: "The normal band (low – high); a value outside it is a warning (without thresholds)." },
        normalHigh: { type: "number", section: "Context", label: "Normal to", default: "" },

        color: { type: "color", section: "Colour", label: "Colour", default: "", tokens: "colors", help: "A hex colour, or a theme token (◆). Empty: the theme's chart palette." }
    };
}

/** The min / max fields of an item with a scale (a gauge, a bar). */
export function scaleFields() {
    return {
        min: { type: "number", section: "Scale", label: "Min", default: 0 },
        max: { type: "number", section: "Scale", label: "Max", default: 100 },
        softMin: { type: "boolean", section: "Scale", label: "Min grows with the data (soft)", default: false, help: "A value below Min moves Min down (to a round number)." },
        softMax: { type: "boolean", section: "Scale", label: "Max grows with the data (soft)", default: false },
        showPeak: { type: "boolean", section: "Scale", label: "The lowest / highest over the window (ghost)", default: false, help: "A faint mark where the value was lowest and highest over the window: the peak a value now hides." }
    };
}

export function itemDefaults(fields) {
    const o = {};
    Object.keys(fields).forEach((k) => { o[k] = fields[k].default; });
    delete o.live;
    return o;
}

/** The threshold steps (a list at the chart): `key` the items' list, `noun` an item. */
export function stepsProp(key, noun, help) {
    const options = (p) => [{ value: "", label: "Every " + noun }].concat(listOf(key)(p).filter((t) => t && t.id).map((t) => ({ value: t.id, label: (t.name || t.id) + " (" + t.id + ")" })));
    return {
        type: "list", group: "Thresholds", label: "Steps", noun: "step", default: [],
        help: help || "From a value on, a status (a theme colour) or its own colour: 0 = Good, 80 = Warning, 95 = Alarm. A step for one " + noun + " or every " + noun + ".",
        item: {
            noun: "step",
            fields: {
                from: { type: "number", label: "From (≥)", default: 0, help: "The value from which this step applies (up to the next step)." },
                status: { type: "enum", label: "Status", default: "warning", options: opt(STATUSES), help: "Its colour comes from the theme (Theme & Styling)." },
                color: { type: "color", label: "Colour", default: "", tokens: "colors", visibleWhen: (s) => s.status === "custom" },
                label: { type: "string", label: "Label", default: "", help: "On the scale, in On State Change and the export (High, Alarm…)." },
                tile: { type: "enum", label: "For", default: "", options }
            }
        }
    };
}

/** The list of items: its fields, a new one's id (prefix + n), its actions and events. */
export function itemsProp(o) {
    return {
        type: "list", group: o.group, label: o.label, noun: o.noun, help: o.help,
        default: [Object.assign(itemDefaults(o.fields), { id: o.prefix + "1", name: o.first || "Value 1" })],
        item: {
            fields: o.fields, noun: o.noun, target: true,
            create: (items) => {
                let n = items.length + 1;
                const ids = new Set(items.map((x) => x && x.id));
                while (ids.has(o.prefix + n)) n++;
                return Object.assign(itemDefaults(o.fields), { id: o.prefix + n, name: "Value " + n });
            },
            actions: {
                setValue: { label: "Set value", help: "A new value (its time = now), or { x, y } at its time.", example: "21.5  or  { \"x\": 1727852400000, \"y\": 21.5 }" },
                setHistory: { label: "Set history", help: "Replaces the values kept: [{ x, y }] (a query: the last 24 h).", example: "[{ \"x\": 1727852400000, \"y\": 21.5 }, …]" },
                clear: { label: "Clear", help: "Empties this " + o.noun + "." }
            },
            events: {
                [o.click]: { label: "On " + o.noun[0].toUpperCase() + o.noun.slice(1) + " Click", payload: { value: "number", name: "string" }, help: "A click on the " + o.noun + ": drill down to its trend, its alarms." },
                stateChange: { label: "On State Change", payload: { from: "string", to: "string", value: "number" }, help: "Its value moved into another threshold step (normal -> warning -> alarm)." },
                stale: { label: "On Stale", payload: { since: "number" }, help: "No new value for longer than its Stale after." },
                resume: { label: "On Resume", payload: { gap: "number" }, help: "A value again after On Stale: how long it was quiet (ms)." }
            }
        }
    };
}

export class ReadoutElement extends ChartElement {
    _items = new Map();     // key -> { buf, lastLive, demo, lastAt, stale, state }
    _rects = [];            // [{ t, x, y, w, h }] drawn (the pointer)

    /** The list (prop) that holds the items, its fields and the click event's name: a chart says. */
    get itemsKey() { return "items"; }
    get itemFields() { return readoutFields("item"); }
    get clickEvent() { return "itemClick"; }

    mounted() { this.every(1000, () => { if (!this.isEditor) this._checkStale(); }); }
    propsChanged() { this.prepareData(); }

    itemList() {
        const raw = Array.isArray(this.p && this.p[this.itemsKey]) ? this.p[this.itemsKey] : [];
        const c = this._il;
        if (c && c.raw === raw) return c.list;
        const d = itemDefaults(this.itemFields);
        const list = raw.map((t, i) => { const o = Object.assign({}, d, t && typeof t === "object" ? t : {}); o._i = i; o._key = String(o.id || "#" + i); o._map = parseValueMap(o.valueMap); return o; });
        this._il = { raw, list };
        return list;
    }

    _state(t) {
        // (the host may call propsChanged() before the fields are set up)
        if (!this._items) this._items = new Map();
        let st = this._items.get(t._key);
        if (!st) { st = { buf: new TimeSeriesRingBuffer(Math.max(10, numOr(t.maxPoints, 5000))), lastLive: undefined, demo: false, lastAt: 0, stale: false, state: undefined }; this._items.set(t._key, st); }
        return st;
    }

    _target(t) { return { list: this.itemsKey, id: t.id || t._key }; }

    findItem(ref) {
        const list = this.itemList();
        if (ref && typeof ref === "object" && ref.id !== undefined) ref = ref.id;
        if (ref === undefined || ref === null || ref === "") return list[0] || null;
        return list.find((t) => t.id === String(ref)) || list.find((t) => t.name === String(ref)) || (/^\d+$/.test(String(ref)) ? list[Number(ref)] : null) || null;
    }

    /** Real data in an item (the editor's sample is not). */
    _hasData() { return this.itemList().some((t) => { const st = this._state(t); return st.buf.count > 0 && !st.demo; }); }

    // ---- data ---------------------------------------------------------------------------------
    prepareData() {
        if (!this._items) this._items = new Map();
        const list = this.itemList(), live = new Set();
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
            // the editor's sample: decoration for the item, never data (only once the host said it is the editor)
            if (this._ctx && this._ctx.mode === "editor" && st.buf.count === 0) { this._demo(st, t); dirty = true; }
        }
        for (const k of Array.from(this._items.keys())) if (!live.has(k)) { this._items.delete(k); dirty = true; }
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

    // a sample in the item's own range (a gauge 0 – 100: around 60 %)
    _demo(st, t) {
        const now = Date.now(), n = 60, i = t._i;
        const lo = numOr(t.min, NaN), hi = numOr(t.max, NaN), span = Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? hi - lo : 0;
        st.buf.clear();
        for (let k = 0; k < n; k++) {
            const w = 0.55 + 0.12 * Math.sin(k / 9 + i) + 0.05 * Math.sin(k / 3 + i * 2) + i * 0.06;
            st.buf.push(now - (n - k) * 60000, Math.round((span ? lo + w * span : 60 + i * 12 + (w - 0.55) * 100) * 10) / 10);
        }
        st.demo = true;
    }

    _checkStale() {
        const now = Date.now();
        let changed = false;
        for (const t of this.itemList()) {
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

    // ---- an item's actions (its own Update node) ------------------------------------------------
    setValue(params, target) {
        const t = this.findItem(target);
        if (!t) return 0;
        const n = this._add(t, this._state(t), Array.isArray(params) ? params : [params]);
        if (n) { this.scheduleDraw(); this.requestUpdate(); }
        return n;
    }

    setHistory(params, target) {
        const t = this.findItem(target);
        if (!t) return 0;
        const st = this._state(t);
        st.demo = false;
        st.buf.loadArray(Array.isArray(params) ? params : params && Array.isArray(params.points) ? params.points : [], "x", "y");
        st.lastAt = Date.now();
        if (!this.isEditor) this._checkState(t, st);
        this.scheduleDraw(); this.requestUpdate();
        return st.buf.count;
    }

    clear(params, target) { const t = this.findItem(target); if (!t) return; this._state(t).buf.clear(); this.scheduleDraw(); this.requestUpdate(); }
    clearAll() { for (const st of this._items.values()) { st.buf.clear(); st.demo = false; } this.scheduleDraw(); this.requestUpdate(); }

    // ---- figures ----------------------------------------------------------------------------------
    _spec(t) { return { notation: t.notation || "standard", decimals: t.decimals || "auto", separators: "locale", thousands: true }; }

    // the figure shown: { v, from } (from: where the window starts)
    _figure(t, st) {
        const from = this._windowFrom(t.window, st.buf.count ? Math.max(Date.now(), st.buf.getX(st.buf.count - 1)) : Date.now());
        return { v: reduce(st.buf, t.reduceBy || "last", from), from };
    }

    // the lowest and highest value over the window (the ghost)
    _peak(t, st) {
        const from = this._figure(t, st).from;
        return { lo: reduce(st.buf, "min", from), hi: reduce(st.buf, "max", from) };
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

    // the colour of an item's state (null: the base: the text colour, or Below the first step's status)
    _stateColor(t, v) {
        const s = this._stepFor(t, v);
        if (s) return this._statusColor(s.status, s.color);
        const base = this.p.baseStatus;
        return base && base !== "neutral" ? this.statusColor(base) : null;
    }

    _refValue(t, st) {
        const how = t.deltaFrom;
        if (how === "target") return numOr(t.target, NaN);
        const b = st.buf;
        if (how === "previous") return b.count > 1 ? b.getY(b.count - 2) : NaN;
        // some time ago: the SAME figure (a sum over 24 h: the sum over the 24 h before) with its window shifted back
        if (how === "ago" && b.count) {
            const ago = spanMs(t.deltaAgo || "1h"), end = Math.max(Date.now(), b.getX(b.count - 1)) - ago;
            if (b.getX(0) > end) return NaN;
            const f = this._figure(t, st).from;
            return reduce(b, t.reduceBy || "last", Number.isFinite(f) ? f - ago : -Infinity, end);
        }
        return NaN;
    }

    /** An item's scale: { lo, hi } from its min / max, soft ends grown to the data (round numbers). */
    _range(t, st, v) {
        let lo = numOr(t.min, 0), hi = numOr(t.max, 100);
        if (!(hi > lo)) hi = lo + 1;
        const pk = t.softMin || t.softMax ? this._peak(t, st) : null;
        const grow = (x) => { const nt = niceTicks(Math.min(lo, x), Math.max(hi, x), 5); return nt; };
        if (t.softMin) { const m = Math.min(Number.isFinite(v) ? v : lo, pk && Number.isFinite(pk.lo) ? pk.lo : lo); if (m < lo) lo = grow(m).min; }
        if (t.softMax) { const m = Math.max(Number.isFinite(v) ? v : hi, pk && Number.isFinite(pk.hi) ? pk.hi : hi); if (m > hi) hi = grow(m).max; }
        return { lo, hi };
    }

    // ---- look helpers ---------------------------------------------------------------------------------
    // a status (success / warning / …) or "custom" with its own colour (a hex or a token) -> a colour
    _statusColor(status, own) {
        if (status === "custom") return this._tok(own) || this.statusColor("neutral");
        return this.statusColor(status || "neutral");
    }

    // the text of a value: its value text, else the number in its format (the unit apart: drawn smaller)
    _valueText(v, spec, map) {
        if (!Number.isFinite(v)) return "—";
        if (map && map.has(v)) return map.get(v);
        return formatValue(v, spec || {}, "");
    }

    // the largest font size (px) at which `text` fits w x h, between min and max
    _fitSize(ctx, text, w, h, weight, font, min, max) {
        ctx.font = (weight || "600") + " 100px " + font;
        const k = ctx.measureText(text).width / 100 || 0.6;
        return Math.max(min || 8, Math.min(max || 200, h * 0.9, w / Math.max(k, 0.01)));
    }

    // a delta: { text, up, good } against a reference (NaN: none); as a % or a value
    _delta(cur, ref, asPercent, upIsGood, spec, unit) {
        if (!Number.isFinite(cur) || !Number.isFinite(ref)) return null;
        const d = cur - ref, up = d > 0, flat = d === 0;
        let text;
        if (asPercent) text = ref === 0 ? "—" : formatValue(Math.abs(d / ref) * 100, { decimals: "1", separators: (spec && spec.separators) || "locale" }, "") + " %";
        else text = formatValue(Math.abs(d), spec || {}, unit || "");
        return { text: (flat ? "■ " : up ? "▲ " : "▼ ") + text, up, flat, good: flat ? null : up === (upIsGood !== false) };
    }

    _windowFrom(window, now) { const ms = spanMs(window); return ms > 0 ? now - ms : -Infinity; }

    // the theme's panel colour (an item is a card on it)
    _panel() { return getComputedStyle(this).getPropertyValue("--panel").trim() || this._backgroundColor() || "#ffffff"; }

    _fit(ctx, s, w) {
        if (ctx.measureText(s).width <= w) return s;
        let t = s;
        while (t.length > 1 && ctx.measureText(t + "…").width > w) t = t.slice(0, -1);
        return t + "…";
    }

    // a grid of n boxes in w x h: `columns` (0 = as many as fit, each at least minW), `gap`
    _grid(n, w, h, columns, gap, minW) {
        gap = Math.max(0, numOr(gap, 8));
        let cols = Math.floor(numOr(columns, 0));
        if (!(cols > 0)) cols = Math.max(1, Math.min(n, Math.floor((w + gap) / ((minW || 180) + gap))));
        cols = Math.min(cols, Math.max(1, n));
        const rows = Math.ceil(n / cols), tw = (w - gap * (cols - 1)) / cols, th = (h - gap * (rows - 1)) / rows;
        const out = [];
        for (let i = 0; i < n; i++) out.push({ x: (i % cols) * (tw + gap), y: Math.floor(i / cols) * (th + gap), w: tw, h: th });
        return out;
    }

    // ---- the drawing, the pointer, the export ------------------------------------------------------------
    draw() {
        if (!this.ctx || !this.canvas) return;
        const { w, h } = this._layoutSize();
        if (w <= 0 || h <= 0) return;
        this._drawInto(this.ctx, w, h);
    }
    _drawInto() {}

    _itemAt(e) {
        const plot = this._plotEl();
        if (!plot) return null;
        const r = plot.getBoundingClientRect(), k = r.width / (plot.clientWidth || 1) || 1;
        const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
        return this._rects.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) || null;
    }
    _move(e) { const plot = this._plotEl(); if (plot) plot.classList.toggle("over-item", !!this._itemAt(e) && !this.isEditor); }
    _click(e) {
        if (this.isEditor) return;
        const q = this._itemAt(e);
        if (!q) return;
        const v = this._figure(q.t, this._state(q.t)).v;
        this.emit(this.clickEvent, { value: Number.isFinite(v) ? v : null, name: q.t.name || q.t.id }, this._target(q.t));
    }

    // a row per item (CSV / Excel), or the picture (PNG)
    exportData(params) {
        const o = this._exportOpts(params);
        if (o.format === "png") return this.exportPNG();
        const head = ["Name", "Value", "Unit", "State", "Shown", "Values kept"];
        const rows = this.itemList().map((t) => {
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
        ctx.fillStyle = this._backgroundColor() || this._panel();
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

    // a fresh canvas (a PNG is drawn onto its own background)
    _fresh(ctx, w, h) { if (!(this._exporting && this._exporting.png)) this._clearCanvas(ctx, w, h); }
}

export { opt, numOr };
