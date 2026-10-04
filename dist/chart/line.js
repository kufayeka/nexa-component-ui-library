import { html, asBinding, formatValue, formatParts, evaluateExpression } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, paletteProp, part, defineUI } from "../core.js";
import { chartCommon, SERIES_PALETTE, opt, NOTATIONS, DECIMALS, DASHES, notationOf, numOr, niceNum } from "./core.js";
import { getNiceTimeStep, parseTimeWindow, SPANS, WINDOWS, spanMs, timeOf, parts, pad2, clock, relative, DAYS, MONTHS } from "./time.js";
import { TimeSeriesRingBuffer, lowerBoundRing, upperBoundRing, M4Decimator } from "./buffer.js";
import { xlsxBlob } from "./export.js";
import { TimeChartElement } from "./time-chart.js";
import { timeProps, zoomProps, annotationProps, exportProps, timeEvents, timeActions } from "./props.js";

const common = chartCommon;

// =============================================================================
// Nexa Line Chart Component Definition (v3: series are Logic targets)
// =============================================================================
//
// In Logic, a chart is:
//   - ONE "Update chart" node: the chart's own props (time range, time axis, axes, tooltip,
//     legend, thresholds, zoom & pan, export…) and its actions (Follow live, Show a range, Export);
//   - per series, its OWN Update node (its props + Append / Replace / Clear / Show / Hide) and its
//     OWN message: a series field bound to Message reads what ITS node got (two series can both
//     read msg.payload, each from its own node);
//   - events of the chart (range change, live / paused, hover, click, range select, legend) and of
//     each series (point click, threshold crossed, stale, resume).
// A series' data: its Live value (a tag / a variable: every new value is a point, x = now) and/or its
// Update node's Append / Replace. Every point kept (Float64), drawn at pixel accuracy (M4 + LOD).

const SERIES_FIELDS = {
    name: { type: "string", label: "Name", default: "Series" },
    id: {
        type: "string", label: "Id", default: "", bindable: false,
        help: "Fixed (renaming the series keeps it): its Update node and events find the series by it."
    },
    visible: { type: "boolean", label: "Visible", default: true },
    legend: { type: "boolean", label: "In the legend", default: true },

    live: {
        type: "tag", access: "read", section: "Data", label: "Live value",
        help: "A tag or a variable: every new value is one more point (its time = now). A {x, y} or a list of them is added as it is. Points from Logic: this series' Update node (Append / Replace)."
    },
    xField: { type: "string", section: "Data", label: "Time field (x)", default: "x", bindable: false, help: "In the points a message brings: [{x, y}, …]." },
    yField: { type: "string", section: "Data", label: "Value field (y)", default: "y", bindable: false },
    maxPoints: {
        type: "number", section: "Data", label: "Points kept", default: 10000, min: 50, max: 2000000, step: 500,
        help: "A ring: past it, the oldest go. 16 bytes a point (1 000 000 = 16 MB)."
    },
    gapAfter: {
        type: "number", section: "Data", label: "Break the line after (ms without data)", default: 0, min: 0, step: 1000,
        help: "0 = always connected. A longer silence draws a gap: a sensor offline is not a straight line."
    },
    staleAfter: {
        type: "number", section: "Data", label: "Stale after (ms without data)", default: 0, min: 0, step: 1000,
        help: "0 = never. No new point for this long: the series fires On Stale (and On Resume when data comes back)."
    },
    timeShift: {
        type: "enum", section: "Data", label: "Time shift", default: "",
        options: opt([["", "None"], ["1h", "+1 hour"], ["1d", "+1 day (yesterday over today)"], ["7d", "+1 week"], ["30d", "+30 days"]]),
        help: "Draws the series later by this much: yesterday's curve over today's, to compare."
    },

    variant: {
        type: "enum", section: "Line", label: "Line style", default: "",
        options: opt([["", "The chart's default line style"], ["line", "Line"], ["step", "Step (Digital)"], ["smooth", "Smooth (Curved)"], ["bars", "Bars"], ["points", "Points only"]]),
        help: "How points are joined. 'Step' is ideal for digital signals (ON/OFF) and state transitions."
    },
    step: {
        type: "enum", section: "Line", label: "Step at", default: "after", options: opt([["after", "After the point (Standard)"], ["before", "Before the point"], ["center", "Half way"]]),
        visibleWhen: (s, p) => (s.variant || s.interpolation || (p && p.defaultInterpolation)) === "step"
    },
    color: { type: "color", section: "Line", label: "Colour", default: "", help: "Empty: the next colour of the palette." },
    width: { type: "number", section: "Line", label: "Width", default: 2, min: 0.5, max: 10, step: 0.5, unit: "px" },
    dash: { type: "enum", section: "Line", label: "Dash", default: "solid", options: opt([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]) },
    opacity: { type: "number", section: "Line", label: "Opacity", default: 1, min: 0, max: 1, step: 0.05 },

    fill: { type: "enum", section: "Fill", label: "Fill", default: "none", options: opt([["none", "None"], ["gradient", "Gradient"], ["solid", "Solid"]]) },
    fillOpacity: { type: "number", section: "Fill", label: "Fill opacity", default: 0.25, min: 0, max: 1, step: 0.05, visibleWhen: (s) => s.fill && s.fill !== "none" },

    points: { type: "boolean", section: "Points", label: "Show the points", default: false },
    pointShape: { type: "enum", section: "Points", label: "Shape", default: "circle", options: opt([["circle", "Circle"], ["square", "Square"], ["diamond", "Diamond"]]) },
    pointRadius: { type: "number", section: "Points", label: "Size", default: 3, min: 1, max: 12, unit: "px" },

    // ---- its own Y axis (every series has one; Hidden: not drawn, its scale is still its own) ----
    axis: {
        type: "enum", section: "Axis", label: "Position", default: "left",
        options: opt([["left", "Left"], ["right", "Right"], ["off", "Hidden (no axis drawn)"]]),
        help: "Every series has its own Y axis and scale. Several on one side stand side by side: the first series in the list is closest to the chart."
    },
    axisTitle: { type: "string", section: "Axis", label: "Title", default: "", help: "Above the axis. Empty: its unit." },
    axisTitleColor: { type: "color", section: "Axis", label: "Title colour", default: "", help: "Empty: the series' colour (a single axis: the text colour)." },
    unit: { type: "string", section: "Axis", label: "Unit (°C, kW, %)", default: "", help: "In the tooltip and the legend, and above the axis when it has no title." },

    softMin: { type: "number", section: "Axis/Range", label: "Soft min (grows with the data)", default: "" },
    softMax: { type: "number", section: "Axis/Range", label: "Soft max (grows with the data)", default: "" },
    min: { type: "number", section: "Axis/Range", label: "Hard min (fixed, clips)", default: "" },
    max: { type: "number", section: "Axis/Range", label: "Hard max (fixed, clips)", default: "" },
    zeroCenter: {
        type: "boolean", section: "Axis/Range", label: "Zero in the middle (− and +)", default: false,
        help: "The axis is symmetric around 0 (a deviation, a flow in and out), with a line at 0. Hard min / max still win."
    },

    notation: { type: "enum", section: "Axis/Numbers", label: "Notation", default: "standard", options: opt(NOTATIONS) },
    decimals: { type: "enum", section: "Axis/Numbers", label: "Decimals", default: "auto", options: opt(DECIMALS) },
    separators: {
        type: "enum", section: "Axis/Numbers", label: "Separators", default: "locale",
        options: opt([["locale", "The page's language"], ["dot", "1,234.5"], ["comma", "1.234,5"]])
    },
    thousands: { type: "boolean", section: "Axis/Numbers", label: "Thousands separator", default: true },

    axisLine: { type: "boolean", section: "Axis/Spine", label: "Show the spine and ticks", default: true },
    axisLineColor: {
        type: "color", section: "Axis/Spine", label: "Colour", default: "",
        help: "Empty: the series' colour (a single axis: the grid colour).", visibleWhen: (s) => s.axisLine !== false
    },
    axisLineWidth: { type: "number", section: "Axis/Spine", label: "Width", default: 1, min: 0.5, max: 6, step: 0.5, unit: "px", visibleWhen: (s) => s.axisLine !== false },
    axisLineDash: {
        type: "enum", section: "Axis/Spine", label: "Style", default: "solid",
        options: opt([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]), visibleWhen: (s) => s.axisLine !== false
    },

    tooltip: { type: "boolean", section: "Tooltip", label: "In the tooltip", default: true },
    tooltipMode: { type: "enum", section: "Tooltip", label: "Text", default: "simple", options: opt([["simple", "Simple"], ["expression", "Expression"]]) },
    tooltipLabel: { type: "string", section: "Tooltip", label: "Label", default: "", help: "Empty: the name.", visibleWhen: (s) => s.tooltipMode !== "expression" },
    prefix: { type: "string", section: "Tooltip", label: "Before the value", default: "", visibleWhen: (s) => s.tooltipMode !== "expression" },
    suffix: { type: "string", section: "Tooltip", label: "After the value", default: "", help: "The unit follows it.", visibleWhen: (s) => s.tooltipMode !== "expression" },
    expression: {
        type: "string", section: "Tooltip", label: "Expression", bindable: false, default: "{name}: fmt({value}) \" \" {unit}", visibleWhen: (s) => s.tooltipMode === "expression",
        help: "{value} {name} {unit} {time} {delta} (from the point before) {min} {max} {avg} (shown); [series]{s2} = another series at that time. fmt(x, \"compact\" | \"si\", decimals, unit), round(x, 2). Example: {name} \": \" fmt({value}) \" (Δ \" fixed({delta}, 1) \")\""
    }
};

function seriesDefaults() {
    const o = {};
    Object.keys(SERIES_FIELDS).forEach((k) => { o[k] = SERIES_FIELDS[k].default; });
    delete o.live;
    return o;
}

const THRESHOLD_FIELDS = {
    value: { type: "number", label: "Value", default: 0 },
    kind: {
        type: "enum", label: "Kind", default: "line",
        options: opt([["line", "Line only (a setpoint)"], ["upper", "Upper limit (at or above it: past it)"], ["lower", "Lower limit (at or below it: past it)"]]),
        help: "A limit colours the values past it in an Excel export (its colour)."
    },
    label: { type: "string", label: "Label", default: "" },
    series: {
        type: "enum", label: "On the scale of", default: "",
        options: (p) => [{ value: "", label: "The first series" }].concat((Array.isArray(p && p.series) ? p.series : [])
            .filter((x) => x && x.id).map((x) => ({ value: x.id, label: (x.name || x.id) + " (" + x.id + ")" }))),
        help: "The series whose Y axis the line follows; that series fires On Threshold Crossed."
    },
    color: { type: "color", label: "Colour", default: "#ef4444" },
    dash: { type: "enum", label: "Dash", default: "dashed", options: opt([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]) }
};

export const lineChart = defineUI({
    ...common,
    id: PREFIX + "line-chart",
    label: "Line Chart",
    icon: "fa fa-line-chart",
    size: { w: 600, h: 320 },
    help: "Time-series chart. The chart has one Update node (its own props); every series has its own Update node, message and events. Every point kept, drawn at pixel accuracy.",
    version: 4,

    migrate(p, from) {
        const has = (v) => v !== undefined && v !== null && v !== "";
        // v1: one series in flat props -> series[0] (props that already have series: not a v1 chart)
        if (from < 2 && !Array.isArray(p.series)) {
            const fb = p.__fallback || {};
            const s = Object.assign(seriesDefaults(), { id: "s1", name: p.label || "Series 1", fill: p.areaFill === false ? "none" : "gradient" });
            if (p.unit) s.unit = p.unit;
            if (p.lineColor) s.color = p.lineColor;
            if (p.lineWidth !== undefined) s.width = p.lineWidth;
            if (p.showPoints) s.points = true;
            if (p.pointRadius !== undefined) s.pointRadius = p.pointRadius;
            if (p.xField) s.xField = p.xField;
            if (p.yField) s.yField = p.yField;
            if (p.maxPoints !== undefined) s.maxPoints = p.maxPoints;
            if (has(p.inputData)) s.data = asBinding(p.inputData, fb.inputData);
            if (has(p.inputPoint)) s.point = asBinding(p.inputPoint, fb.inputPoint);
            p.series = [s];
            ["data", "inputData", "inputPoint", "label", "unit", "lineColor", "lineWidth", "areaFill", "showPoints", "pointRadius", "xField", "yField", "maxPoints"].forEach((k) => { delete p[k]; });
            if (p.__fallback) {
                delete p.__fallback.inputData;
                delete p.__fallback.inputPoint;
                if (!Object.keys(p.__fallback).length) delete p.__fallback;
            }
        }
        // v2: a series' Data / Point -> its Live value (Point first); fixed axis ranges -> hard min / max;
        // tooltip decimals -> its number format
        if (from < 3) {
            (Array.isArray(p.series) ? p.series : []).forEach((s, i) => {
                if (!s || typeof s !== "object") return;
                const live = has(s.point) && !(s.point && s.point.$bind && !s.point.$bind.length) ? s.point : has(s.data) && s.data && !(s.data.$bind && !s.data.$bind.length) ? s.data : undefined;
                if (live !== undefined) s.live = live;
                delete s.point;
                delete s.data;
                if (!s.id) s.id = "s" + (i + 1);
            });
            if (p.tooltipMode === "shared" || p.tooltipMode === "nearest" || p.tooltipMode === "off") { p.tooltipShows = p.tooltipMode; delete p.tooltipMode; }
        }
        // v3: the chart's left / right axis settings -> each series on that side; scale / group gone
        // (every series has its own axis); a threshold's side -> the first series on that side
        if (from < 4) {
            const list = Array.isArray(p.series) ? p.series : [];
            const sideOf = (x) => (x && x.axis === "right" ? "right" : x && (x.axis === "off" || x.axis === "none") ? "off" : "left");
            const firstOn = {};
            list.forEach((x) => {
                if (!x || typeof x !== "object") return;
                const side = sideOf(x);
                if (side === "off") x.axis = "off";
                if (!firstOn[side]) firstOn[side] = x;
                const sd = side === "off" ? null : side;
                if (sd) {
                    if (has(p[sd + "SoftMin"]) && !has(x.softMin)) x.softMin = p[sd + "SoftMin"];
                    if (has(p[sd + "SoftMax"]) && !has(x.softMax)) x.softMax = p[sd + "SoftMax"];
                    if (has(p[sd + "Min"]) && !has(x.min)) x.min = p[sd + "Min"];
                    if (has(p[sd + "Max"]) && !has(x.max)) x.max = p[sd + "Max"];
                    if ((!x.notation || x.notation === "axis") && has(p[sd + "Notation"])) x.notation = p[sd + "Notation"];
                    if ((!x.decimals || x.decimals === "axis") && has(p[sd + "Decimals"])) x.decimals = p[sd + "Decimals"];
                }
                if (x.notation) x.notation = notationOf(x.notation);
                if (x.decimals === "axis") x.decimals = "auto";
                if (has(p.separators) && !has(x.separators)) x.separators = p.separators;
                if (typeof p.thousands === "boolean" && typeof x.thousands !== "boolean") x.thousands = p.thousands;
                if (!has(x.variant) && has(x.interpolation)) x.variant = x.interpolation;
                delete x.interpolation;
                delete x.axisScale;
                delete x.axisGroup;
            });
            ["left", "right"].forEach((side) => {
                const first = firstOn[side];
                if (first && has(p[side + "Title"]) && !has(first.axisTitle)) first.axisTitle = p[side + "Title"];
                ["Title", "Notation", "Decimals", "SoftMin", "SoftMax", "Min", "Max"].forEach((k) => { delete p[side + k]; });
            });
            delete p.separators;
            delete p.thousands;
            (Array.isArray(p.thresholds) ? p.thresholds : []).forEach((t) => {
                if (!t || typeof t !== "object" || t.series !== undefined) return;
                const on = firstOn[t.axis === "right" ? "right" : "left"];
                t.series = on && on !== list[0] && on.id ? on.id : "";
                delete t.axis;
            });
            if (Array.isArray(p.annotations)) p.annotations = p.annotations.filter((a) => a && typeof a === "object");
        }
        return p;
    },

    groups: ["Series", "Data", "Time axis", "Tooltip", "Legend", "Thresholds", "Annotations", "Zoom & pan", "Export", "Style", "Behaviour"],

    properties: {
        ...timeProps(),
        ...zoomProps(),
        ...exportProps({ thresholds: true }),
        ...annotationProps(),
        series: {
            type: "list", group: "Series", label: "Series", noun: "series",
            help: "Each series has its own Update node, message and events in Logic (Events tab). The order is the layer order: the first is drawn under the others.",
            default: [Object.assign(seriesDefaults(), { id: "s1", name: "Series 1" })],
            item: {
                fields: SERIES_FIELDS, noun: "series",
                // a Logic target of its own: its Update node, its message, its actions and events
                target: true,
                // a new series: the next number, a fixed Id (s1, s2 … never reused)
                create: (items) => {
                    let n = items.length + 1;
                    const ids = new Set(items.map((x) => x && x.id));
                    while (ids.has("s" + n)) n++;
                    return Object.assign(seriesDefaults(), { id: "s" + n, name: "Series " + n });
                },
                actions: {
                    appendPoints: {
                        label: "Append points", help: "Adds points to this series (any order: a late point goes in its place).",
                        example: "{ \"x\": 1727852400000, \"y\": 21.5 }  or  [{x, y}, …]  or  21.5 (time = now)"
                    },
                    replacePoints: {
                        label: "Replace points", help: "Replaces everything the series holds: a query result, a batch's history.",
                        example: "[{ \"x\": 1727852400000, \"y\": 21.5 }, …]"
                    },
                    clear: { label: "Clear", help: "Empties this series." },
                    show: { label: "Show", help: "Shows this series (as its legend entry would)." },
                    hide: { label: "Hide", help: "Hides this series; its data is kept." }
                },
                events: {
                    pointClick: { label: "On Point Click", payload: { x: "number", y: "number" }, help: "A click on one of its points: the time and the value." },
                    thresholdCross: {
                        label: "On Threshold Crossed", payload: { direction: "string", value: "number", threshold: "number", label: "string" },
                        help: "A new value crossed a threshold of its axis: direction \"up\" / \"down\". An alarm without a script."
                    },
                    stale: { label: "On Stale", payload: { since: "number" }, help: "No new point for longer than its Stale after: a sensor that went quiet." },
                    resume: { label: "On Resume", payload: { gap: "number" }, help: "Data again after On Stale: how long it was quiet (ms)." }
                }
            }
        },



        tooltipShows: {
            type: "enum", group: "Tooltip", label: "Shows", default: "shared",
            options: opt([["shared", "Together: every series with a point at that time"], ["nearest", "Alone: only the series under the cursor"], ["off", "Nothing"]]),
            help: "Together: one tooltip lists every series that has a point at the cursor's time, whatever its axis. Alone: only the line nearest to the cursor."
        },
        matchWithin: {
            type: "number", group: "Tooltip", label: "Together when their times are within (ms)", default: 0, min: 0, step: 100,
            help: "How far from the cursor's time a series' point may be to join the tooltip. 0 = automatic (each series' own spacing: a slow series still shows next to a fast one).",
            visibleWhen: (p) => p.tooltipShows !== "nearest" && p.tooltipShows !== "off"
        },

        legend: { type: "enum", group: "Legend", label: "Legend", default: "bottom", options: opt([["bottom", "Below"], ["top", "Above"], ["none", "None"]]) },
        legendValue: {
            type: "enum", group: "Legend", label: "Value in the legend", default: "last",
            options: opt([["none", "None"], ["last", "Last"], ["min", "Min (shown)"], ["max", "Max (shown)"], ["avg", "Average (shown)"]])
        },

        thresholds: {
            type: "list", group: "Thresholds", label: "Thresholds", noun: "threshold", default: [],
            help: "Horizontal lines: a limit, a setpoint. A series crossing one fires its On Threshold Crossed.", item: { fields: THRESHOLD_FIELDS, noun: "threshold" }
        },



        colorPalette: paletteProp("primary"),
        showGrid: { type: "boolean", default: true, group: "Style", label: "Grid" },
        axisGap: {
            type: "number", group: "Style", label: "Axis gap", default: 8, min: 0, max: 60, step: 1, unit: "px",
            help: "Spacing between adjacent Y-axis columns when multiple axes are shown."
        },
        defaultInterpolation: {
            type: "enum", group: "Style", label: "Default line style", default: "line",
            options: opt([["line", "Line"], ["step", "Step (Digital)"], ["smooth", "Smooth (Curved)"]]),
            help: "Default line style for series that do not specify their own variant."
        }
    },

    parts: {
        chart: part("Chart canvas container", "chart"),
        legend: part("Legend", "legend")
    },

    events: {
        ...timeEvents(),
        hover: { label: "On Hover", payload: { time: "number", values: "object" }, help: "The time under the cursor and each series' value there: share a crosshair with other charts through a variable." },
        click: { label: "On Click", payload: { time: "number", values: "object" }, help: "A click in the chart (not a drag): its time and the values there." },
        seriesToggle: { label: "On Series Toggle", payload: { series: "string", visible: "boolean" }, help: "The viewer showed / hid a series in the legend." }
    },

    actions: {
        ...timeActions(),
        clearAll: { label: "Clear every series" }
    },

    view: class extends TimeChartElement {

        decimator = new M4Decimator(2048);
        _navDecimator = new M4Decimator(1024);
        _series = new Map();      // key -> { buf, lastLive, dx, dy, n, demo, lastAt, stale }
        _hidden = new Set();

        get ringBuffer() { const l = this.seriesList(); return l.length ? this._state(l[0]).buf : new TimeSeriesRingBuffer(50); }

        // a series gone quiet: On Stale (checked every second; live pages only: the mode is known
        // when it ticks, not yet when mounted)
        mounted() {
            this.every(1000, () => { if (!this.isEditor) this._checkStale(); });
        }

        // every change of a prop, one by one: a live value is taken here (not in updated(): Lit batches)
        propsChanged() { this.prepareData(); }

        // ---- series ----------------------------------------------------------------------------
        // the series with their defaults (cached while the props are the same)
        seriesList() {
            const raw = Array.isArray(this.p && this.p.series) ? this.p.series : [];
            const defInterp = (this.p && this.p.defaultInterpolation) || "line";
            const c = this._sl;
            if (c && c.raw === raw && c.defInterp === defInterp) return c.list;
            const d = seriesDefaults();
            const list = raw.map((s, i) => {
                const o = Object.assign({}, d, s && typeof s === "object" ? s : {});
                o.variant = o.variant || o.interpolation || defInterp;
                o.notation = notationOf(o.notation);
                o._i = i;
                o._key = String(o.id || "#" + i);
                o._shift = spanMs(o.timeShift);
                o._side = o.axis === "right" ? "right" : o.axis === "off" || o.axis === "none" ? "off" : "left";
                return o;
            });
            this._sl = { raw, defInterp, list };
            return list;
        }

        _state(s) {
            let st = this._series.get(s._key);
            if (!st) {
                st = { buf: new TimeSeriesRingBuffer(Math.max(50, numOr(s.maxPoints, 10000))), lastLive: undefined, dx: null, dy: null, n: 0, demo: false, lastAt: 0, stale: false };
                this._series.set(s._key, st);
            }
            return st;
        }

        _target(s) { return { list: "series", id: s.id || s._key }; }

        /** A series by its Id, its name or its index (none: the first). */
        findSeries(ref) {
            const list = this.seriesList();
            if (ref && typeof ref === "object" && ref.id !== undefined) ref = ref.id;
            if (ref === undefined || ref === null || ref === "") return list[0] || null;
            const byIndex = typeof ref === "number" || /^\d+$/.test(String(ref)) ? list[Number(ref)] : null;
            return list.find((s) => s.id && s.id === String(ref)) || list.find((s) => s.name === String(ref)) || byIndex || null;
        }

        prepareData() {
            const list = this.seriesList();
            const live = new Set();
            let dirty = false;
            for (const s of list) {
                live.add(s._key);
                const st = this._state(s);
                const cap = Math.max(50, numOr(s.maxPoints, 10000));
                if (st.buf.capacity !== cap) { st.buf.setCapacity(cap); dirty = true; }
                // the live value: every new value is a point (the same value object again is not)
                const v = s.live;
                if (v !== undefined && v !== null && v !== "" && v !== "???" && v !== st.lastLive && !(typeof v === "object" && v.$bind)) {
                    st.lastLive = v;
                    if (this._add(s, st, Array.isArray(v) ? v : [v])) dirty = true;
                }
                // (only once the host said it is the editor: before that, the mode is not known)
                if (this._ctx && this._ctx.mode === "editor" && st.buf.count === 0) { this._demo(st, s._i); dirty = true; }
            }
            for (const k of Array.from(this._series.keys())) if (!live.has(k)) { this._series.delete(k); dirty = true; }
            if (dirty) this.scheduleDraw();
        }

        // points into a series: {x, y} / a number (time = now); the newest one is checked against the
        // thresholds (On Threshold Crossed) and wakes a stale series (On Resume)
        _add(s, st, pts) {
            if (st.demo) { st.buf.clear(); st.demo = false; }
            const xf = s.xField || "x", yf = s.yField || "y";
            let added = 0, prevY = st.buf.count ? st.buf.getY(st.buf.count - 1) : NaN, lastY = NaN;
            for (const p of pts) {
                if (p === null || p === undefined) continue;
                let x, y;
                if (typeof p === "object") { x = Number(p[xf]); y = Number(p[yf]); }
                else { x = Date.now(); y = Number(p); }
                if (Number.isFinite(x) && Number.isFinite(y) && st.buf.push(x, y)) { added++; lastY = y; }
            }
            if (added && !this.isEditor) {
                const now = Date.now();
                if (st.stale) { this.emit("resume", { gap: now - st.lastAt }, this._target(s)); st.stale = false; }
                st.lastAt = now;
                if (Number.isFinite(prevY)) this._crossings(s, prevY, lastY);
            }
            return added;
        }

        // the series a threshold follows: its id, or the first series
        _thresholdOf(t) {
            const list = this.seriesList();
            return t && t.series ? list.find((x) => x.id === t.series) || null : list[0] || null;
        }

        _crossings(s, from, to) {
            for (const t of Array.isArray(this.p.thresholds) ? this.p.thresholds : []) {
                const on = this._thresholdOf(t);
                if (!on || on._key !== s._key) continue;
                const v = numOr(t.value, NaN);
                if (!Number.isFinite(v)) continue;
                if (from < v && to >= v) this.emit("thresholdCross", { direction: "up", value: to, threshold: v, label: t.label || "" }, this._target(s));
                else if (from >= v && to < v) this.emit("thresholdCross", { direction: "down", value: to, threshold: v, label: t.label || "" }, this._target(s));
            }
        }

        _checkStale() {
            const now = Date.now();
            for (const s of this.seriesList()) {
                const after = numOr(s.staleAfter, 0), st = this._state(s);
                if (after > 0 && st.lastAt && !st.stale && now - st.lastAt > after) {
                    st.stale = true;
                    this.emit("stale", { since: st.lastAt }, this._target(s));
                }
            }
        }

        _demo(st, i) {
            const now = Date.now(), n = 240;
            for (let k = 0; k < n; k++) st.buf.push(now - (n - k) * 500, Math.round((50 + i * 15 + 18 * Math.sin(k / 18 + i * 1.3) + 6 * Math.sin(k / 5 + i)) * 10) / 10);
            st.demo = true;
        }

        // ---- the actions of ONE series (its own Update node): (params = msg.payload, target) ----
        _pointsOf(params) {
            if (params && typeof params === "object" && !Array.isArray(params) && Array.isArray(params.points)) return params.points;
            return Array.isArray(params) ? params : params === undefined || params === null || params === "" ? [] : [params];
        }

        appendPoints(params, target) {
            const s = this.findSeries(target || (params && params.series));
            if (!s) return 0;
            const added = this._add(s, this._state(s), this._pointsOf(params));
            if (added) { this.scheduleDraw(); this.requestUpdate(); }
            return added;
        }

        replacePoints(params, target) {
            const s = this.findSeries(target || (params && params.series));
            if (!s) return 0;
            const st = this._state(s);
            st.demo = false;
            st.buf.loadArray(this._pointsOf(params), s.xField || "x", s.yField || "y");
            st.lastAt = Date.now();
            this.scheduleDraw();
            this.requestUpdate();
            return st.buf.count;
        }

        clear(params, target) {
            const s = this.findSeries(target || (params && params.series));
            if (!s) return;
            this._state(s).buf.clear();
            this.scheduleDraw();
            this.requestUpdate();
        }

        show(params, target) { this._setVisible(target || (params && params.series), true); }
        hide(params, target) { this._setVisible(target || (params && params.series), false); }

        _setVisible(ref, on) {
            const s = this.findSeries(ref);
            if (!s) return;
            if (on) this._hidden.delete(s._key); else this._hidden.add(s._key);
            this.scheduleDraw();
            this.requestUpdate();
        }

        clearAll() {
            for (const st of this._series.values()) st.buf.clear();
            this.viewRange = null;
            this.hover = null;
            this.scheduleDraw();
            this.requestUpdate();
        }

        // kept for v1 / v2 flows: the chart's Update node appending to a series named in params
        clearPoints() { this.clearAll(); }

        // the threshold a value is past (upper / lower limits of its series; the most extreme one)
        _pastLimit(s, v) {
            let best = null;
            for (const t of Array.isArray(this.p.thresholds) ? this.p.thresholds : []) {
                if (!t || (t.kind !== "upper" && t.kind !== "lower")) continue;
                const on = this._thresholdOf(t), tv = numOr(t.value, NaN);
                if (!on || on._key !== s._key || !Number.isFinite(tv)) continue;
                if (t.kind === "upper" && v >= tv && (!best || best.kind !== "upper" || tv > numOr(best.value, -Infinity))) best = t;
                if (t.kind === "lower" && v <= tv && (!best || (best.kind === "lower" && tv < numOr(best.value, Infinity)))) best = t;
            }
            return best;
        }

        exportData(params) {
            const o = this._exportOpts(params);
            if (o.format === "png") return this.exportPNG(params);
            // an Annotation column when the chart has annotations at all (the same columns every time)
            if (o.annotations && !this._allAnnotations().length) o.annotations = false;
            const { list, from, to } = this._exportSpan(o.range);
            const utc = this.p.timeZone === "utc";
            const stamp = (ts) => { const q = parts(ts, utc); return q.y + "-" + pad2(q.mo + 1) + "-" + pad2(q.d) + " " + pad2(q.h) + ":" + pad2(q.mi) + ":" + pad2(q.s) + "." + String(q.ms).padStart(3, "0"); };
            // a row per time: [time, …a value per series (null: no point then), annotation]
            const times = new Map(), n = list.length;
            const rowAt = (x) => { let r = times.get(x); if (!r) { r = new Array(n + 1).fill(null); times.set(x, r); } return r; };
            list.forEach((s, c) => {
                const buf = this._state(s).buf;
                for (let i = 0; i < buf.count; i++) {
                    const x = buf.getX(i) + s._shift;
                    if (x >= from && x <= to) rowAt(x)[c] = buf.getY(i);
                }
            });
            if (o.annotations) {
                for (const a of this._allAnnotations()) {
                    if (a.time < from || a.time > to) continue;
                    const r = rowAt(a.time), text = a.label + (a.description ? " · " + a.description : "");
                    r[n] = r[n] ? r[n] + " | " + text : text;
                }
            }
            const xs = Array.from(times.keys()).sort((a, b) => a - b);
            const rows = xs.map((x) => [x].concat(times.get(x).slice(0, n), o.annotations ? [times.get(x)[n]] : []));
            const header = ["Time"].concat(list.map((s) => (s.name || s.id) + (s.unit ? " (" + s.unit + ")" : "")), o.annotations ? ["Annotation"] : []);
            let blob;
            if (o.format === "xlsx") {
                // a value past a limit: the limit's colour
                const fills = o.thresholds ? rows.map((r) => r.map((v, c) => (c >= 1 && c <= n && v !== null ? ((this._pastLimit(list[c - 1], v) || {}).color || null) : null))) : null;
                const lims = (Array.isArray(this.p.thresholds) ? this.p.thresholds : []).filter((t) => t && (t.kind === "upper" || t.kind === "lower"));
                const zone = utc ? "UTC" : ((() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return "local"; } })());
                const info = [["Chart", this._exportTitle() || "Line chart"], ["From", stamp(from)], ["To", stamp(to)], ["Range", o.range === "all" ? "Everything it holds" : "What was shown"],
                    ["Time zone", zone], ["Exported", stamp(Date.now())]]
                    .concat(list.map((s) => ["Series", (s.name || s.id) + (s.unit ? " (" + s.unit + ")" : "") + " — Id " + s.id]))
                    .concat(o.thresholds ? lims.map((t) => { const on = this._thresholdOf(t); return ["Threshold", (t.label ? t.label + ": " : "") + (t.kind === "upper" ? "≥ " : "≤ ") + t.value + (on ? " on " + (on.name || on.id) : "") + " (" + (t.color || "#ef4444") + ")"]; }) : []);
                blob = xlsxBlob(header, rows, utc, { fills, info, textCols: o.annotations ? [n + 1] : [] });
            } else {
                // a comma as the decimal separator: ";" between the columns (as Excel there expects)
                const comma = formatValue(1.5, { separators: (list[0] && list[0].separators) || "locale", thousands: false }).indexOf(",") !== -1;
                const sep = comma ? ";" : ",";
                const q = (t) => '"' + String(t).replace(/"/g, '""') + '"';
                const cell = (v) => (v === null ? "" : comma ? String(v).replace(".", ",") : String(v));
                const lines = [header.map(q).join(sep)];
                rows.forEach((r) => lines.push([stamp(r[0])].concat(r.slice(1, n + 1).map(cell), o.annotations ? [r[n + 1] ? q(r[n + 1]) : ""] : []).join(sep)));
                blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
            }
            const name = this._getExportFileName(o.format, o.range);
            this._download(blob, name);
            this._lastExport = { name, rows: rows.length, columns: header.length, blob };
            this.scheduleDraw();
            return rows.length;
        }

        _visible() {
            return this.seriesList().filter((s) => s.visible !== false && !this._hidden.has(s._key) && this._state(s).buf.count > 0);
        }

        _bounds(list) {
            let minX = Infinity, maxX = -Infinity;
            for (const s of list) {
                const b = this._state(s).buf.getBounds();
                if (!b) continue;
                if (b.minX + s._shift < minX) minX = b.minX + s._shift;
                if (b.maxX + s._shift > maxX) maxX = b.maxX + s._shift;
            }
            return Number.isFinite(minX) ? { minX, maxX } : null;
        }

        _axisTitle(s) { return String(s.axisTitle || s.unit || ""); }

        // the plot's top and height: the ruler below it, the axis titles above it
        _vertical(height, titled) {
            const rh = this._rulerHeight(height), rulerGap = rh ? 6 : 0;
            const plotY = titled ? 24 : 14, padBottom = rh ? 6 : 8;
            return { plotY, plotH: Math.max(1, height - plotY - padBottom - rh - rulerGap), rh, rulerGap };
        }

        /**
         * layout = { left: [col], right: [col] }, a col per series axis ({ s, w, ticks, labels, title }),
         * innermost first. Without one: the last drawn (the pointer uses what is on the screen).
         */
        getPlotMetrics(width, height, layout) {
            const L = layout || (this._scale && this._scale.layout) || { left: [], right: [] };
            const gap = Math.max(0, numOr(this.p && this.p.axisGap, 8));
            const side = (cols) => (cols.length ? cols.reduce((a, c) => a + c.w, 0) + gap * (cols.length - 1) + 4 : 14);
            const padLeft = side(L.left), padRight = side(L.right);
            const v = this._vertical(height, L.left.concat(L.right).some((c) => c.title));
            const plotW = Math.max(1, width - padLeft - padRight);
            return {
                plotX: padLeft, plotY: v.plotY, plotW, plotH: v.plotH, padLeft, padRight, axisGap: gap,
                rulerX: padLeft, rulerY: v.plotY + v.plotH + v.rulerGap, rulerW: plotW, rulerH: v.rh
            };
        }

        _usesRight() {
            return this.seriesList().some((s) => s._side === "right" && s.visible !== false && !this._hidden.has(s._key));
        }

        colorOf(s) {
            if (s.color && typeof s.color === "string" && s.color.trim()) return s.color.trim();
            if (s._i === 0) {
                const cs = getComputedStyle(this);
                return cs.getPropertyValue("--cp-solid").trim() || cs.getPropertyValue("--nexa-colors-primary-solid").trim() || SERIES_PALETTE[0];
            }
            return SERIES_PALETTE[s._i % SERIES_PALETTE.length];
        }

        fmtValue(s, y) { return formatValue(y, this._seriesSpec(s), s.unit || ""); }

        // ---- drawing ---------------------------------------------------------------------------
        _decimate(dec, s, vMinX, vMaxX, w, into) {
            const st = this._state(s), buf = st.buf, sh = s._shift;
            const startIdx = Math.max(0, lowerBoundRing(buf, vMinX - sh) - 1);
            const endIdx = Math.min(buf.count, upperBoundRing(buf, vMaxX - sh) + 1);
            const n = dec.decimate(buf, startIdx, endIdx, Math.max(1, Math.floor(w)), vMinX - sh, vMaxX - sh);
            const t = into || st;
            if (!t.dx || t.dx.length < n) { t.dx = new Float64Array(Math.max(n, 256)); t.dy = new Float64Array(Math.max(n, 256)); }
            for (let i = 0; i < n; i++) { t.dx[i] = dec.outX[i] + sh; t.dy[i] = dec.outY[i]; }
            t.n = n;
            return t;
        }

        // a series' Y range in the time shown (its points just outside too: the line runs to them),
        // its soft limits (the range covers them), its hard limits (fixed)
        _seriesRange(s, vMinX, vMaxX) {
            const buf = this._state(s).buf, sh = s._shift;
            let lo = Infinity, hi = -Infinity;
            if (buf.count) {
                const i0 = Math.max(0, lowerBoundRing(buf, vMinX - sh) - 1), i1 = Math.min(buf.count, upperBoundRing(buf, vMaxX - sh) + 1);
                if (i1 > i0) {
                    const o = this._mm || (this._mm = { min: 0, max: 0, minAt: 0, maxAt: 0 });
                    buf.rangeMinMax(i0, i1, o);
                    lo = o.min; hi = o.max;
                }
            }
            if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
            const sMin = numOr(s.softMin, NaN), sMax = numOr(s.softMax, NaN);
            if (Number.isFinite(sMin) && sMin < lo) lo = sMin;
            if (Number.isFinite(sMax) && sMax > hi) hi = sMax;
            if (lo === hi) { const pad = Math.abs(lo) * 0.1 || 1; lo -= pad; hi += pad; }
            else {
                const pad = (hi - lo) * 0.08;
                if (!(Number.isFinite(sMin) && lo === sMin)) lo -= pad;
                if (!(Number.isFinite(sMax) && hi === sMax)) hi += pad;
            }
            if (s.zeroCenter) { const mm = Math.max(Math.abs(lo), Math.abs(hi)) || 1; lo = -mm; hi = mm; }
            const hMin = numOr(s.min, NaN), hMax = numOr(s.max, NaN);
            if (Number.isFinite(hMin)) lo = hMin;
            if (Number.isFinite(hMax)) hi = hMax;
            if (hi <= lo) hi = lo + 1;
            return { lo, hi };
        }

        _ticks(r, ph) {
            const n = Math.max(3, Math.min(6, Math.floor(ph / 45)));
            const step = niceNum((r.hi - r.lo) / n, false);
            const values = [];
            if (!(step > 0) || !Number.isFinite(step)) return values;
            for (let v = Math.ceil(r.lo / step) * step, k = 0; v <= r.hi + step * 1e-9 && k < 60; v += step, k++) values.push(Math.abs(v) < step * 1e-9 ? 0 : v);
            return values;
        }

        _drawInto(ctx, width, height, range) {
            ctx.clearRect(0, 0, width, height);
            const list = this._visible();
            if (!list.length) { this._scale = null; if (!this._exporting) this._updateLegend(null); return; }
            const fb = this._bounds(list);
            if (!fb) return;
            this._full = fb;
            this._newest = fb.maxX;
            const { vMinX, vMaxX } = range || this.getEffectiveTimeRange(fb);
            if (!Number.isFinite(vMinX) || !Number.isFinite(vMaxX)) return;

            // every series its own scale; an axis per series not hidden, innermost = first in the list
            const yr = {};
            for (const s of list) yr[s._key] = this._seriesRange(s, vMinX, vMaxX);
            const onSide = (side) => list.filter((s) => s._side === side);
            const titled = list.some((s) => s._side !== "off" && this._axisTitle(s));
            const plotH0 = this._vertical(height, titled).plotH;
            const c = this._colors();
            ctx.font = "10px " + c.mono;
            const col = (s) => {
                const ticks = this._ticks(yr[s._key], plotH0), spec = this._seriesSpec(s);
                const labels = ticks.map((v) => formatValue(v, spec));
                const title = this._axisTitle(s);
                let w = 0;
                for (const l of labels) w = Math.max(w, ctx.measureText(l).width);
                if (title) w = Math.max(w, ctx.measureText(title).width - 2);
                return { s, ticks, labels, title, w: Math.max(26, Math.ceil(w) + 10) };
            };
            const layout = { left: onSide("left").map(col), right: onSide("right").map(col) };
            const m = this.getPlotMetrics(width, height, layout);
            const { plotX, plotY, plotW, plotH } = m;

            for (const s of list) this._decimate(this.decimator, s, vMinX, vMaxX, plotW);
            const xSpan = Math.max(1, vMaxX - vMinX);
            const toX = (x) => plotX + ((x - vMinX) / xSpan) * plotW;
            const toY = (y, key) => { const r = yr[key]; return r ? plotY + plotH - ((y - r.lo) / (r.hi - r.lo)) * plotH : plotY + plotH; };
            this._scale = { vMinX, vMaxX, toX, toY, m, yr, layout };

            this.drawAxesAndGrid(ctx, m, vMinX, vMaxX, yr, layout);
            ctx.save();
            ctx.beginPath();
            ctx.rect(plotX, plotY, plotW, plotH);
            ctx.clip();
            if (this._selection) {
                const a = toX(Math.min(this._selection.from, this._selection.to)), b = toX(Math.max(this._selection.from, this._selection.to));
                ctx.fillStyle = "rgba(59, 130, 246, 0.14)";
                ctx.fillRect(a, plotY, b - a, plotH);
            }
            for (const s of list) this._drawSeries(ctx, s, toX, toY, plotY, plotH);
            const ex = this._exporting;
            if (!(ex && ex.noThresholds)) this._drawThresholds(ctx, toY, plotX, plotW);
            if (!(ex && ex.noAnnotations)) this._drawAnnotations(ctx, toX, plotX, plotY, plotW, plotH, vMinX, vMaxX);
            this._drawHover(ctx, toX, toY, plotY, plotH);
            ctx.restore();
            this._drawRuler(ctx, m, vMinX, vMaxX, list);
            if (!ex) this._updateLegend(list, vMinX, vMaxX);
        }

        _runs(st, gapAfter) {
            const runs = [];
            let start = 0;
            for (let i = 1; i < st.n; i++) if (gapAfter > 0 && st.dx[i] - st.dx[i - 1] > gapAfter) { runs.push(start, i); start = i; }
            if (st.n) runs.push(start, st.n);
            return runs;
        }

        _tracePath(ctx, st, a, b, s, toX, toY) {
            const X = (i) => toX(st.dx[i]), Y = (i) => toY(st.dy[i], s._key);
            const variant = s.variant;
            ctx.moveTo(X(a), Y(a));
            if (variant === "step") {
                const stepMode = s.step || "after";
                for (let i = a + 1; i < b; i++) {
                    if (stepMode === "before") ctx.lineTo(X(i - 1), Y(i));
                    else if (stepMode === "center") { const mx = (X(i - 1) + X(i)) / 2; ctx.lineTo(mx, Y(i - 1)); ctx.lineTo(mx, Y(i)); }
                    else ctx.lineTo(X(i), Y(i - 1));
                    ctx.lineTo(X(i), Y(i));
                }
                return;
            }
            if (variant === "smooth" && b - a > 2) {
                // monotone cubic (Fritsch–Carlson): smooth, never overshoots a peak
                const n = b - a, xs = new Float64Array(n), ys = new Float64Array(n), d = new Float64Array(n), t = new Float64Array(n);
                for (let k = 0; k < n; k++) { xs[k] = X(a + k); ys[k] = Y(a + k); }
                for (let k = 0; k < n - 1; k++) { const h = xs[k + 1] - xs[k]; d[k] = h ? (ys[k + 1] - ys[k]) / h : 0; }
                t[0] = d[0]; t[n - 1] = d[n - 2];
                for (let k = 1; k < n - 1; k++) t[k] = d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
                for (let k = 0; k < n - 1; k++) {
                    if (d[k] === 0) { t[k] = 0; t[k + 1] = 0; continue; }
                    const al = t[k] / d[k], be = t[k + 1] / d[k], q = al * al + be * be;
                    if (q > 9) { const tau = 3 / Math.sqrt(q); t[k] = tau * al * d[k]; t[k + 1] = tau * be * d[k]; }
                }
                for (let k = 0; k < n - 1; k++) {
                    const h = (xs[k + 1] - xs[k]) / 3;
                    ctx.bezierCurveTo(xs[k] + h, ys[k] + t[k] * h, xs[k + 1] - h, ys[k + 1] - t[k + 1] * h, xs[k + 1], ys[k + 1]);
                }
                return;
            }
            for (let i = a + 1; i < b; i++) ctx.lineTo(X(i), Y(i));
        }

        _drawSeries(ctx, s, toX, toY, plotY, plotH) {
            const st = this._state(s);
            if (!st.n) return;
            const variant = s.variant;
            const color = this.colorOf(s), axis = s._key, lw = numOr(s.width, 2);
            const runs = this._runs(st, numOr(s.gapAfter, 0)), base = plotY + plotH;
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, numOr(s.opacity, 1)));
            if (variant === "bars") {
                const w = Math.max(1, Math.min(24, ((toX(st.dx[st.n - 1]) - toX(st.dx[0])) / Math.max(1, st.n)) * 0.7));
                const r = this._scale.yr[axis];
                const zero = toY(Math.max(r.lo, Math.min(r.hi, 0)), axis);
                ctx.fillStyle = color;
                for (let i = 0; i < st.n; i++) { const x = toX(st.dx[i]), y = toY(st.dy[i], axis); ctx.fillRect(x - w / 2, Math.min(y, zero), w, Math.max(1, Math.abs(zero - y))); }
                ctx.restore();
                return;
            }
            if (s.fill && s.fill !== "none" && variant !== "points" && st.n > 1) {
                const fo = Math.max(0, Math.min(1, numOr(s.fillOpacity, 0.25)));
                let style;
                if (s.fill === "gradient") {
                    style = ctx.createLinearGradient(0, plotY, 0, base);
                    style.addColorStop(0, this.hexToRgba(color, fo));
                    style.addColorStop(1, this.hexToRgba(color, 0.01));
                } else style = this.hexToRgba(color, fo);
                ctx.fillStyle = style;
                for (let r = 0; r < runs.length; r += 2) {
                    const a = runs[r], b = runs[r + 1];
                    if (b - a < 2) continue;
                    ctx.beginPath();
                    this._tracePath(ctx, st, a, b, s, toX, toY);
                    ctx.lineTo(toX(st.dx[b - 1]), base);
                    ctx.lineTo(toX(st.dx[a]), base);
                    ctx.closePath();
                    ctx.fill();
                }
            }
            if (variant !== "points") {
                ctx.strokeStyle = color;
                ctx.lineWidth = lw;
                ctx.lineJoin = "round";
                ctx.lineCap = "round";
                ctx.setLineDash(DASHES[s.dash] || []);
                for (let r = 0; r < runs.length; r += 2) {
                    const a = runs[r], b = runs[r + 1];
                    if (b - a === 1) {
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(toX(st.dx[a]), toY(st.dy[a], axis), Math.max(3, lw * 1.5), 0, Math.PI * 2);
                        ctx.fill();
                        continue;
                    }
                    ctx.beginPath();
                    this._tracePath(ctx, st, a, b, s, toX, toY);
                    ctx.stroke();
                }
                ctx.setLineDash([]);
            }
            if (s.points || variant === "points") {
                ctx.fillStyle = color;
                const pr = numOr(s.pointRadius, 3);
                for (let i = 0; i < st.n; i++) this._marker(ctx, s.pointShape, toX(st.dx[i]), toY(st.dy[i], axis), pr);
            }
            ctx.restore();
        }

        _marker(ctx, shape, x, y, r) {
            ctx.beginPath();
            if (shape === "square") ctx.rect(x - r, y - r, r * 2, r * 2);
            else if (shape === "diamond") { ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r * 1.3, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r * 1.3, y); ctx.closePath(); }
            else ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        _drawThresholds(ctx, toY, plotX, plotW) {
            const list = Array.isArray(this.p.thresholds) ? this.p.thresholds : [];
            if (!list.length) return;
            const cs = getComputedStyle(this);
            ctx.save();
            ctx.font = "10px " + (cs.getPropertyValue("--mono") || "monospace");
            ctx.textAlign = "right";
            ctx.textBaseline = "bottom";
            for (const t of list) {
                const v = numOr(t && t.value, NaN), on = this._thresholdOf(t);
                // on the scale of its series (not drawn while that series is hidden)
                if (!Number.isFinite(v) || !on || !this._scale.yr[on._key]) continue;
                const y = Math.round(toY(v, on._key)) + 0.5;
                ctx.strokeStyle = (t && t.color) || "#ef4444";
                ctx.lineWidth = 1;
                ctx.setLineDash(DASHES[t && t.dash] || DASHES.dashed);
                ctx.beginPath();
                ctx.moveTo(plotX, y);
                ctx.lineTo(plotX + plotW, y);
                ctx.stroke();
                if (t && t.label) { ctx.fillStyle = (t && t.color) || "#ef4444"; ctx.fillText(String(t.label), plotX + plotW - 4, y - 2); }
            }
            ctx.setLineDash([]);
            ctx.restore();
        }

        _drawHover(ctx, toX, toY, plotY, plotH) {
            const h = this.hover;
            if (!h || !h.hits.length) return;
            const hx = toX(h.time);
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
            ctx.lineWidth = 1;
            ctx.moveTo(hx, plotY);
            ctx.lineTo(hx, plotY + plotH);
            ctx.stroke();
            ctx.setLineDash([]);
            for (const hit of h.hits) {
                ctx.beginPath();
                ctx.fillStyle = this.colorOf(hit.s);
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2;
                ctx.arc(toX(hit.x), toY(hit.y, hit.s._key), 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        }

        drawAxesAndGrid(ctx, m, minX, maxX, yr, layout) {
            const { plotX: px, plotY: py, plotW: pw, plotH: ph, axisGap: gap } = m;
            const c = this._colors();
            const many = layout.left.length + layout.right.length > 1;
            const gridCol = layout.left[0] || layout.right[0] || null;
            ctx.save();
            ctx.font = "10px " + c.mono;
            const drawCol = (col, edge, side) => {
                const s = col.s, r = yr[s._key], range = r.hi - r.lo || 1;
                const color = many ? this.colorOf(s) : c.text;
                const showLine = s.axisLine !== false;
                const lineColor = s.axisLineColor || (many ? color : c.grid);
                const lineWidth = numOr(s.axisLineWidth, 1) > 0 ? numOr(s.axisLineWidth, 1) : 1;
                const sx = Math.round(edge) + 0.5;
                if (showLine) {
                    ctx.save();
                    ctx.strokeStyle = lineColor;
                    ctx.lineWidth = lineWidth;
                    ctx.setLineDash(s.axisLineDash === "dashed" ? [4, 4] : s.axisLineDash === "dotted" ? [2, 2] : []);
                    ctx.beginPath();
                    ctx.moveTo(sx, py);
                    ctx.lineTo(sx, py + ph);
                    ctx.stroke();
                    ctx.restore();
                }
                ctx.textAlign = side === "left" ? "right" : "left";
                ctx.textBaseline = "middle";
                const labelX = side === "left" ? edge - 6 : edge + 6;
                // zero in the middle: a line at 0 across the plot
                if (s.zeroCenter && r.lo < 0 && r.hi > 0) {
                    const zy = Math.round(py + ph - ((0 - r.lo) / range) * ph) + 0.5;
                    ctx.save();
                    ctx.strokeStyle = many ? this.colorOf(s) : c.text;
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(px, zy);
                    ctx.lineTo(px + pw, zy);
                    ctx.stroke();
                    ctx.restore();
                }
                col.ticks.forEach((v, i) => {
                    const ty = py + ph - ((v - r.lo) / range) * ph;
                    if (ty < py - 0.5 || ty > py + ph + 0.5) return;
                    if (col === gridCol && this.p.showGrid) {
                        ctx.beginPath();
                        ctx.strokeStyle = c.grid;
                        ctx.lineWidth = 1;
                        ctx.moveTo(px, Math.round(ty) + 0.5);
                        ctx.lineTo(px + pw, Math.round(ty) + 0.5);
                        ctx.stroke();
                    }
                    if (showLine) {
                        ctx.beginPath();
                        ctx.strokeStyle = lineColor;
                        ctx.lineWidth = Math.min(lineWidth, 2);
                        ctx.moveTo(sx, ty);
                        ctx.lineTo(sx + (side === "left" ? -4 : 4), ty);
                        ctx.stroke();
                    }
                    ctx.fillStyle = color;
                    ctx.fillText(col.labels[i], labelX, ty);
                });
                if (col.title) {
                    ctx.textBaseline = "bottom";
                    ctx.fillStyle = s.axisTitleColor || color;
                    ctx.fillText(col.title, labelX, py - 6);
                }
            };
            // left: from the chart outwards; right: the same, to the right
            let edge = px;
            for (const col of layout.left) { drawCol(col, edge, "left"); edge -= col.w + gap; }
            edge = px + pw;
            for (const col of layout.right) { drawCol(col, edge, "right"); edge += col.w + gap; }

            // vertical grid at the ruler's major ticks
            if (this.p.showGrid) {
                const span = Math.max(1, maxX - minX), step = this._timeStep(span, pw);
                ctx.beginPath();
                ctx.strokeStyle = c.grid;
                ctx.lineWidth = 1;
                for (let t = Math.ceil(minX / step) * step; t <= maxX; t += step) {
                    const sx = Math.round(px + ((t - minX) / span) * pw) + 0.5;
                    ctx.moveTo(sx, py);
                    ctx.lineTo(sx, py + ph);
                }
                ctx.stroke();
            }
            ctx.restore();
        }

        // ---- legend ----------------------------------------------------------------------------
        _statsOf(s) {
            const st = this._state(s);
            let mn = Infinity, mx = -Infinity, sum = 0;
            for (let i = 0; i < st.n; i++) { const y = st.dy[i]; if (y < mn) mn = y; if (y > mx) mx = y; sum += y; }
            return { min: mn, max: mx, avg: st.n ? sum / st.n : NaN };
        }

        _updateLegend(list) {
            const el = this.renderRoot && this.renderRoot.querySelector(".legend");
            if (!el || !list) return;
            const mode = this.p.legendValue || "last";
            for (const s of list) {
                const v = el.querySelector(`.lg-item[data-key="${CSS.escape(s._key)}"] .lg-val`);
                if (!v) continue;
                const buf = this._state(s).buf;
                let y = NaN;
                if (mode === "last" && buf.count) y = buf.getY(buf.count - 1);
                else if (mode !== "none") y = this._statsOf(s)[mode];
                v.textContent = mode === "none" || !Number.isFinite(y) ? "" : this.fmtValue(s, y);
            }
        }

        _toggle(s, e) {
            const solo = e && (e.altKey || e.metaKey);
            if (solo) {
                const others = this.seriesList().filter((x) => x._key !== s._key);
                const alone = others.every((x) => this._hidden.has(x._key)) && !this._hidden.has(s._key);
                others.forEach((x) => { if (alone) this._hidden.delete(x._key); else this._hidden.add(x._key); });
                this._hidden.delete(s._key);
            } else if (this._hidden.has(s._key)) this._hidden.delete(s._key);
            else this._hidden.add(s._key);
            this.emit("seriesToggle", { series: s.id || s.name, visible: !this._hidden.has(s._key) });
            this.hover = null;
            this.requestUpdate();
            this.scheduleDraw();
        }

        // ---- tooltip ---------------------------------------------------------------------------
        _hits(px, py, time) {
            const sc = this._scale;
            if (!sc) return [];
            const span = sc.vMaxX - sc.vMinX, fixedWithin = numOr(this.p.matchWithin, 0), nearest = this.p.tooltipShows === "nearest";
            const hits = [];
            for (const s of this._visible()) {
                if (s.tooltip === false && !nearest) continue;
                const buf = this._state(s).buf, t = time - s._shift;
                const idx = buf.findClosestIndex(t);
                if (idx < 0) continue;
                const x = buf.getX(idx), y = buf.getY(idx);
                let within = fixedWithin;
                if (!(within > 0)) {
                    const n = Math.max(1, upperBoundRing(buf, sc.vMaxX - s._shift) - lowerBoundRing(buf, sc.vMinX - s._shift));
                    within = Math.max(span * 0.01, (span / n) * 0.75);
                }
                if (Math.abs(x - t) > within) continue;
                hits.push({ s, x: x + s._shift, y, idx, d: Math.hypot(sc.toX(x + s._shift) - px, sc.toY(y, s._key) - py) });
            }
            if (nearest && hits.length) { hits.sort((a, b) => a.d - b.d); return [hits[0]]; }
            return hits;
        }

        // a series' tooltip text: simple (label: before value after unit) or its expression
        tooltipText(hit, hits) {
            const s = hit.s;
            const rawS = this.raw && Array.isArray(this.raw.series) ? this.raw.series[s._i] : null;
            const expression = rawS && typeof rawS.expression === "string" ? rawS.expression : s.expression;
            if (s.tooltipMode === "expression" && expression) {
                const buf = this._state(s).buf, stats = this._statsOf(s);
                const prev = hit.idx > 0 ? buf.getY(hit.idx - 1) : NaN;
                const vars = { value: hit.y, name: s.name || s.id, unit: s.unit || "", time: hit.x, delta: Number.isFinite(prev) ? hit.y - prev : null, min: stats.min, max: stats.max, avg: stats.avg };
                const v = evaluateExpression(expression, (src, ref) => {
                    if (src === "series") { const o = hits.find((h) => h.s.id === ref || h.s.name === ref); return o ? o.y : null; }
                    return Object.prototype.hasOwnProperty.call(vars, ref) ? vars[ref] : null;
                }, { format: this._seriesSpec(s) });
                return v === null || v === undefined ? (s.name || s.id) + ": —" : String(v);
            }
            // the unit as shown (engineering notation scales it: 1 500 kW -> 1.5 MW)
            const f = formatParts(hit.y, this._seriesSpec(s), s.unit || "");
            return (s.tooltipLabel || s.name || "Value") + ": " + (s.prefix || "") + f.text + (s.suffix || "") + (f.unit ? " " + f.unit : "");
        }

        _values(hits) {
            const values = {};
            hits.forEach((h) => { values[h.s.id || h.s.name] = h.y; });
            return values;
        }

        // ---- TimeChartElement's hooks -----------------------------------------------------------
        _fullBounds() { return this._bounds(this._visible()); }
        _hasData() { return this._visible().length > 0; }

        _pngLegend(span) {
            const mode = this.p.legendValue || "last";
            return span.list.filter((s) => s.legend !== false).map((s) => {
                const buf = this._state(s).buf;
                let y = NaN;
                if (mode === "last" && buf.count) y = buf.getY(buf.count - 1);
                else if (mode !== "none") y = this._statsOf(s)[mode];
                return { color: this.colorOf(s), text: (s.name || s.id) + (mode !== "none" && Number.isFinite(y) ? "  " + this.fmtValue(s, y) : "") };
            });
        }

        _navTraces(ctx, g, list) {
            const { y, w, h } = g;
            // the series, small
            const tmp = {};
            for (const s of list) {
                this._decimate(this._navDecimator, s, g.full.minX, g.full.maxX, w / 2, tmp);
                let lo = Infinity, hi = -Infinity;
                for (let i = 0; i < tmp.n; i++) { if (tmp.dy[i] < lo) lo = tmp.dy[i]; if (tmp.dy[i] > hi) hi = tmp.dy[i]; }
                if (!tmp.n || !Number.isFinite(lo)) continue;
                const r = hi - lo || 1;
                ctx.beginPath();
                ctx.strokeStyle = this.hexToRgba(this.colorOf(s), 0.8);
                ctx.lineWidth = 1;
                for (let i = 0; i < tmp.n; i++) { const sx = g.toX(tmp.dx[i]), sy = y + h - 3 - ((tmp.dy[i] - lo) / r) * (h - 6); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }
                ctx.stroke();
            }
        }

        _plotHover(L, time) {
            const { px, py } = L;
            const hits = this._hits(px, py, time);
            let at = time, best = Infinity;
            for (const h of hits) if (Math.abs(h.x - time) < best) { best = Math.abs(h.x - time); at = h.x; }
            this.hover = { time: at, px, py, hits };
            this.draw();
            this._showTooltip(px, py, L.rect.width);
            const now = Date.now();
            if (now - this._lastHoverEmit > 100) {
                this._lastHoverEmit = now;
                this.emit("hover", { time: this.hover.time, values: this._values(hits) });
            }
        }

        _plotClick(L, time) {
            const hits = this._hits(L.px, L.py, time);
            this.emit("click", { time, values: this._values(hits) });
            const near = hits.slice().sort((a, b) => a.d - b.d)[0];
            if (near && near.d <= 12) this.emit("pointClick", { x: near.x, y: near.y }, this._target(near.s));
        }

        _showHitsTooltip(px, py, rectW) {
            const tip = this.renderRoot.querySelector(".tooltip");
            if (!tip) return;
            const h = this.hover;
            const rows = h ? h.hits.filter((x) => x.s.tooltip !== false || this.p.tooltipShows === "nearest") : [];
            if (!rows.length || this.p.tooltipShows === "off") { tip.style.display = "none"; return; }
            tip.querySelector(".tooltip-time").textContent = this.fmtTime(h.time);
            const body = tip.querySelector(".tooltip-rows");
            while (body.children.length > rows.length) body.removeChild(body.lastChild);
            rows.forEach((hit, i) => {
                let row = body.children[i];
                if (!row) {
                    row = document.createElement("div");
                    row.className = "tooltip-row";
                    row.appendChild(document.createElement("span")).className = "tooltip-dot";
                    row.appendChild(document.createElement("span")).className = "tooltip-text";
                    body.appendChild(row);
                }
                row.children[0].style.background = this.colorOf(hit.s);
                row.children[1].textContent = this.tooltipText(hit, rows);
            });
            const flip = px > rectW - 200;
            tip.style.display = "block";
            tip.style.left = `${Math.round(flip ? px - 12 : px + 12)}px`;
            tip.style.top = `${Math.round(py)}px`;
            tip.style.transform = flip ? "translate(-100%, -50%)" : "translate(0, -50%)";
        }

        // what an export covers: the shown series, the time shown or all they hold
        _exportSpan(range) {
            const list = this._visible();
            const fb = this._bounds(list);
            if (range === "visible" && this._scale) return { list, from: this._scale.vMinX, to: this._scale.vMaxX };
            return { list, from: fb ? fb.minX : 0, to: fb ? fb.maxX : 0 };
        }

        render() {
            const all = this.seriesList();
            const hasData = all.some((s) => this._state(s).buf.count > 0);
            const legendAt = this.p.legend || "bottom";
            const legendList = all.filter((s) => s.legend !== false);
            const legend = legendAt === "none" || !legendList.length ? "" : html`
                <div class="legend" part="legend">
                    ${legendList.map((s) => html`
                        <button type="button" class="lg-item ${this._hidden.has(s._key) || s.visible === false ? "off" : ""}" data-key="${s._key}"
                            title="Click: show / hide. Alt+click: only this one." @click=${(e) => this._toggle(s, e)}>
                            <span class="lg-swatch" style="background:${this.colorOf(s)}"></span>
                            <span class="lg-name">${s.name || "Series " + (s._i + 1)}</span>
                            <span class="lg-val"></span>
                        </button>`)}
                </div>`;
            return html`
                <div class="chart-container" part="chart">
                    ${legendAt === "top" ? legend : ""}
                    <div class="plot"
                        @wheel=${(e) => this.onWheel(e)}
                        @pointerdown=${(e) => this.onPointerDown(e)}
                        @pointermove=${(e) => this.onPointerMove(e)}
                        @pointerup=${(e) => this.onPointerUp(e)}
                        @pointercancel=${(e) => this.onPointerCancel(e)}
                        @pointerleave=${(e) => this.onPointerLeave(e)}
                        @dblclick=${() => this.followLive()}>
                        <canvas></canvas>
                        <div class="corner" style="right:${this._scale && this._scale.m ? this._scale.m.padRight + 6 : (this._usesRight() ? 60 : 20)}px">
                            ${this.viewRange ? html`
                                <button class="btn-chip btn-reset-zoom" @click=${() => this.followLive()} title="Follow the newest data again (or double click the chart)">
                                    <span class="live-dot"></span> Reset Zoom
                                </button>` : ""}
                            ${this._renderMenu()}
                        </div>
                        <div class="tooltip"><div class="tooltip-time"></div><div class="tooltip-rows"></div></div>
                        ${!hasData ? html`
                            <div class="empty">
                                <i class="fa fa-line-chart" style="font-size: 24px; opacity: 0.4;"></i>
                                <span>No data received</span>
                            </div>` : ""}
                    </div>
                    ${legendAt !== "top" ? legend : ""}
                </div>
            `;
        }
    }
});
