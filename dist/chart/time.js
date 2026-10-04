// Nexa UI — time for charts: nice tick steps, time windows ("5m", "24h"), the parts of a time
// (UTC or local), a clock, a relative time, an annotation's time (ms, text, epoch seconds).

export const TIME_STEPS = [
    10, 20, 50, 100, 200, 500,
    1000, 2000, 5000, 10000, 15000, 30000,
    60000, 120000, 300000, 600000, 900000, 1800000,
    3600000, 7200000, 10800000, 21600000, 43200000,
    86400000, 172800000, 604800000, 1209600000,
    2592000000, 7776000000, 31536000000
];

export function getNiceTimeStep(spanMs, targetTicks) {
    const rawStep = spanMs / Math.max(1, targetTicks);
    for (let i = 0; i < TIME_STEPS.length; i++) {
        if (TIME_STEPS[i] >= rawStep) {
            return TIME_STEPS[i];
        }
    }
    return TIME_STEPS[TIME_STEPS.length - 1];
}

export function parseTimeWindow(tw) {
    if (!tw || tw === "auto") return 0;
    const match = String(tw).match(/^(\d+)([smhdMy])$/);
    if (!match) return 0;
    const val = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === "s") return val * 1000;
    if (unit === "m") return val * 60000;
    if (unit === "h") return val * 3600000;
    if (unit === "d") return val * 86400000;
    if (unit === "M") return val * 30 * 86400000;
    if (unit === "y") return val * 365 * 86400000;
    return 0;
}

export const SPANS = [["", "No limit"], ["100ms", "100 ms"], ["1s", "1 second"], ["10s", "10 seconds"], ["1m", "1 minute"], ["10m", "10 minutes"], ["1h", "1 hour"],
["6h", "6 hours"], ["24h", "24 hours"], ["7d", "7 days"], ["30d", "30 days"], ["1y", "1 year"]];
export const WINDOWS = [["auto", "Everything it holds"], ["30s", "Last 30 seconds"], ["1m", "Last 1 minute"], ["5m", "Last 5 minutes"], ["15m", "Last 15 minutes"],
["30m", "Last 30 minutes"], ["1h", "Last 1 hour"], ["3h", "Last 3 hours"], ["6h", "Last 6 hours"], ["12h", "Last 12 hours"], ["24h", "Last 24 hours"],
["7d", "Last 7 days"], ["14d", "Last 14 days"], ["1M", "Last month (30 days)"], ["3M", "Last 3 months"], ["6M", "Last 6 months"], ["1y", "Last year"]];

// "10s" / "5m" / "100ms" -> ms (0: none)
export function spanMs(v) {
    if (v === undefined || v === null || v === "" || v === "auto") return 0;
    if (typeof v === "number") return v;
    const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|M|y)$/.exec(String(v).trim());
    if (!m) return 0;
    const n = Number(m[1]);
    return n * ({ ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, M: 2592000000, y: 31536000000 })[m[2]];
}

// an annotation's time: ms, a numeric text, or a date text ("2026-10-04 08:00"); epoch seconds -> ms
export function timeOf(v) {
    let t = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : v ? new Date(v).getTime() : NaN;
    // epoch seconds (2001…5138): to ms; a smaller number is ms already
    if (Number.isFinite(t) && t >= 1e9 && t < 1e11) t *= 1000;
    return t;
}

// ---- a time, the way the chart's Time axis says ----------------------------------------------
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const pad2 = (n) => (n < 10 ? "0" + n : String(n));
export function parts(ts, utc) {
    const d = new Date(ts);
    return utc
        ? { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds() }
        : { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), wd: d.getDay(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds() };
}
export function clock(p, h12, withSec) {
    let h = p.h, ap = "";
    if (h12) { ap = h < 12 ? " AM" : " PM"; h = h % 12 || 12; }
    return (h12 ? String(h) : pad2(h)) + ":" + pad2(p.mi) + (withSec ? ":" + pad2(p.s) : "") + ap;
}
export function relative(ms) {
    const a = Math.abs(ms), sign = ms < 0 ? "−" : ms > 0 ? "+" : "";
    if (a < 1000) return sign + Math.round(a) + "ms";
    if (a < 60000) return sign + (Math.round(a / 100) / 10) + "s";
    if (a < 3600000) return sign + (Math.round(a / 6000) / 10) + "m";
    if (a < 86400000) return sign + (Math.round(a / 360000) / 10) + "h";
    return sign + (Math.round(a / 8640000) / 10) + "d";
}
