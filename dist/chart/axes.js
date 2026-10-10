// Shared Y axes: the pure part (no DOM, no imports; test/chart-pure.test.js).
//
// A chart has a list of AXES (props.axes: id, name, position, title, unit, limits, numbers, spine). A series picks one with its
// `yAxis` field (an axis Id), or none: "Own axis", the series' own scale and axis as it has always been. Series that pick the
// same axis are ONE group: one scale (it covers every member), one drawn axis. An axis the series names but the list no longer has
// is the same as none (the series falls back to its own).
//
// The fields an axis has are the fields the series' own axis has (same keys, same numbers, so one scale routine serves both): a
// series keeps them only while its Y axis is Own; Unit, the number format and Value texts stay on the series, they are what its
// tooltip and legend show.

// the keys of a series that describe its axis; an axis of the list has the same
export const AXIS_KEYS = ["axis", "axisTitle", "axisTitleColor", "unit", "softMin", "softMax", "min", "max", "zeroCenter",
    "notation", "decimals", "separators", "thousands", "valueMap", "axisLine", "axisLineColor", "axisLineWidth", "axisLineDash"];

// what a series does not need while it shares an axis: where it is, how it is titled, its limits, its spine
export const OWN_ONLY_KEYS = ["axis", "axisTitle", "axisTitleColor", "softMin", "softMax", "min", "max", "zeroCenter", "axisLine", "axisLineColor", "axisLineWidth", "axisLineDash"];

const num = (v) => {
    const n = typeof v === "number" ? v : v === "" || v === null || v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : NaN;
};

/** "left" (the default), "right", or "off" (its scale stays, nothing is drawn). */
export function sideOf(spec) {
    return spec && spec.axis === "right" ? "right" : spec && (spec.axis === "off" || spec.axis === "none") ? "off" : "left";
}

/**
 * The scale of an axis: the data range [lo, hi] (non-finite: no data, 0 .. 1), then its soft limits (the range covers them),
 * 8 % of padding (none past a soft limit), zero in the middle, and its hard limits (fixed, they clip).
 */
export function scaleRange(lo, hi, spec) {
    const s = spec || {};
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
    const sMin = num(s.softMin), sMax = num(s.softMax);
    if (Number.isFinite(sMin) && sMin < lo) lo = sMin;
    if (Number.isFinite(sMax) && sMax > hi) hi = sMax;
    if (lo === hi) { const pad = Math.abs(lo) * 0.1 || 1; lo -= pad; hi += pad; }
    else {
        const pad = (hi - lo) * 0.08;
        if (!(Number.isFinite(sMin) && lo === sMin)) lo -= pad;
        if (!(Number.isFinite(sMax) && hi === sMax)) hi += pad;
    }
    if (s.zeroCenter) { const mm = Math.max(Math.abs(lo), Math.abs(hi)) || 1; lo = -mm; hi = mm; }
    const hMin = num(s.min), hMax = num(s.max);
    if (Number.isFinite(hMin)) lo = hMin;
    if (Number.isFinite(hMax)) hi = hMax;
    if (hi <= lo) hi = lo + 1;
    return { lo, hi };
}

/** The range that covers every member's data range ({ lo, hi } or null for a series without one); null when none has. */
export function unionRange(ranges) {
    let lo = Infinity, hi = -Infinity;
    for (const r of ranges || []) {
        if (!r || !Number.isFinite(r.lo) || !Number.isFinite(r.hi)) continue;
        if (r.lo < lo) lo = r.lo;
        if (r.hi > hi) hi = r.hi;
    }
    return Number.isFinite(lo) ? { lo, hi } : null;
}

/**
 * The axes of the list by Id: { Id -> axis }, each with `defaults` under it, `_ax` (its key: "axis:<Id>"), `_side`, `_i` (its place
 * in the list) and what `normalize(axis)` adds. An item without an Id, or one whose Id is taken, is left out.
 */
export function resolveAxes(raw, defaults, normalize) {
    const map = new Map();
    (Array.isArray(raw) ? raw : []).forEach((a, i) => {
        if (!a || typeof a !== "object" || a.id === undefined || a.id === null || a.id === "") return;
        const id = String(a.id);
        if (map.has(id)) return;
        const o = Object.assign({}, defaults || {}, a);
        o.id = id;
        o._ax = "axis:" + id;
        o._side = sideOf(o);
        o._i = i;
        if (typeof normalize === "function") normalize(o);
        map.set(id, o);
    });
    return map;
}

/** The key of the axis a series is on ("axis:<Id>"), or null: Own (none picked, or one the list no longer has). */
export function axisKeyOf(s, axes) {
    const ax = s && s.yAxis !== undefined && s.yAxis !== null && s.yAxis !== "" && axes ? axes.get(String(s.yAxis)) : null;
    return ax ? ax._ax : null;
}

/**
 * The series (each with its own `_key`) in groups, by the axis they are on: [{ key, spec, members, shared }] in the order of the
 * first member. A group on an axis of the list is described by that axis; an Own one by its series, key = the series' key.
 */
export function groupByAxis(list, axes) {
    const groups = [], byKey = new Map();
    for (const s of list || []) {
        const ax = s && s.yAxis !== undefined && s.yAxis !== null && s.yAxis !== "" && axes ? axes.get(String(s.yAxis)) : null;
        const key = ax ? ax._ax : s._key;
        let g = byKey.get(key);
        if (!g) { g = { key, spec: ax || s, members: [], shared: !!ax }; byKey.set(key, g); groups.push(g); }
        g.members.push(s);
    }
    return groups;
}

/** A new axis for the list: a fixed Id (a1, a2 ... never one in use), a name, `defaults` under them. */
export function newAxis(items, defaults) {
    const list = Array.isArray(items) ? items : [];
    const ids = new Set(list.map((x) => (x && x.id !== undefined ? String(x.id) : "")));
    let n = list.length + 1;
    while (ids.has("a" + n)) n++;
    return Object.assign({}, defaults || {}, { id: "a" + n, name: "Axis " + n });
}

// ---- the inspector's fields -------------------------------------------------------------------------------------------------

/**
 * The fields of one axis of the list, from the series' own axis fields (`seriesFields`): Name, Id and Colour of its own, then the
 * axis fields with their section names without the "Axis/" prefix ("Axis/Range" -> "Range"; "Axis" -> at the top).
 */
export function axisFields(seriesFields) {
    const out = {
        name: { type: "string", label: "Name", default: "Axis", help: "What the series' Y axis choice shows." },
        id: { type: "string", label: "Id", default: "", bindable: false, help: "Fixed (renaming the axis keeps it): a series picks its axis by it." },
        color: {
            type: "color", label: "Colour", default: "", tokens: "colors",
            help: "Its ticks, title and spine. Empty: the colour of its series when it has one, else the text colour."
        }
    };
    AXIS_KEYS.forEach((k) => {
        const f = seriesFields && seriesFields[k];
        if (!f) return;
        const g = Object.assign({}, f);
        if (g.section === "Axis") delete g.section;
        else if (typeof g.section === "string") g.section = g.section.replace(/^Axis\//, "");
        out[k] = g;
    });
    return out;
}

// whether a series is on a real axis of the list (the chart's props say which exist)
function onSharedAxis(s, p) {
    return !!(s && s.yAxis && Array.isArray(p && p.axes) && p.axes.some((a) => a && a.id === s.yAxis));
}

/** A series' own-axis field: shown only while the series has its own axis (its rule, if it had one, still applies). */
export function ownAxisOnly(field) {
    const was = field.visibleWhen;
    return Object.assign({}, field, { visibleWhen: (s, p) => !onSharedAxis(s, p) && (typeof was === "function" ? was(s, p) : true) });
}

/** The series' choice of Y axis: its own, or one of the chart's axes. */
export function yAxisField() {
    return {
        type: "enum", section: "Axis", label: "Y axis", default: "",
        options: (p) => [{ value: "", label: "Own axis (its own scale)" }].concat((Array.isArray(p && p.axes) ? p.axes : [])
            .filter((a) => a && a.id).map((a) => ({ value: a.id, label: a.name || a.id }))),
        help: "Own axis: this series has its own scale and axis (set below). Or an axis of the Axes list: every series that picks the same one shares its scale and one drawn axis."
    };
}

/** The chart's list of axes (a props entry): spread it into `properties` with its fields from axisFields(). */
export function axesProp(fields, defaults) {
    return {
        type: "list", group: "Axes", label: "Y axes", noun: "axis", default: [],
        help: "Axes several series can share. A series picks one under Series > Axis > Y axis; series that pick the same axis share one scale and one drawn axis. A series that picks none has its own.",
        item: { fields, noun: "axis", create: (items) => newAxis(items, defaults) }
    };
}
