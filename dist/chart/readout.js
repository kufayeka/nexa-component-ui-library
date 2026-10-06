// Nexa UI — ReadoutElement: the base of a chart that shows a VALUE (KPI / Stat now; the Gauge and the Bar gauge next).
// What they share:
//   - the value's history in a Float64 ring (a sparkline, a delta, a value over a window), reduced to one figure
//     (last / average / min / max / sum / change / count);
//   - its text: auto-fit (as big as the box allows) or a size, the unit after it, value texts (0 = Off);
//   - a delta against the previous value, a value some time ago or a target (▲ ▼, up is good or bad);
//   - thresholds: steps "from this value on" with a theme status colour (success / warning / error / info / neutral)
//     or their own colour; the state a value is in (On State Change);
//   - stale: no data for N ms.
// Pure helpers are exported for the tests; the view's helpers take the chart's theme colours.
import { formatValue } from "../../../nexa-sdk/nexa-component-sdk.js";
import { ChartElement, opt, numOr } from "./core.js";
import { lowerBoundRing, upperBoundRing } from "./buffer.js";
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

export class ReadoutElement extends ChartElement {
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
}

export { opt, numOr };
