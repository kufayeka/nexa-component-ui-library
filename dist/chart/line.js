import { html, asBinding, formatValue, formatParts, evaluateExpression } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, paletteProp, part, defineUI } from "../core.js";
import { chartCommon, ChartElement, SERIES_PALETTE, opt, NOTATIONS, DECIMALS, DASHES, notationOf, numOr, niceNum } from "./core.js";
import { getNiceTimeStep, parseTimeWindow, SPANS, WINDOWS, spanMs, timeOf, parts, pad2, clock, relative, DAYS, MONTHS } from "./time.js";
import { TimeSeriesRingBuffer, lowerBoundRing, upperBoundRing, M4Decimator } from "./buffer.js";
import { xlsxBlob } from "./export.js";

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

        timeWindow: {
            type: "enum", default: "auto", options: opt(WINDOWS), group: "Data", label: "Time range",
            help: "A live window that follows the newest point. Zoom / pan pauses it; Live (or a double click) follows again."
        },

        ruler: {
            type: "enum", group: "Time axis", label: "Time ruler", default: "tworow",
            options: opt([["tworow", "Band (drag it)"], ["navigator", "Navigator: the whole history, a window to drag"], ["comb", "Comb (drag it)"], ["axis", "Labels only"], ["none", "None"]]),
            help: "The style of ruler. Show time and Show date checkboxes control whether time and/or date are displayed."
        },
        showTime: {
            type: "boolean", group: "Time axis", label: "Show time", default: true,
            help: "Shows time labels on the time axis."
        },
        showDate: {
            type: "boolean", group: "Time axis", label: "Show date", default: true,
            help: "Shows date labels on the time axis."
        },
        dateFormat: {
            type: "enum", group: "Time axis", label: "Date format", default: "default",
            options: opt([["default", "Day D Mon Y (Sat 03 Oct 2026)"], ["iso", "YYYY-MM-DD (2026-10-03)"], ["dmy", "DD/MM/YYYY (03/10/2026)"], ["mdy", "MM/DD/YYYY (10/03/2026)"]]),
            visibleWhen: (p) => p.showDate !== false
        },
        tickDensity: {
            type: "enum", group: "Time axis", label: "Tick spacing", default: "normal",
            options: opt([["loose", "Loose (Longgar)"], ["normal", "Normal (Sedang)"], ["dense", "Dense (Rapat)"]]),
            help: "Controls how many time labels appear across the ruler."
        },
        rulerHeight: {
            type: "number", group: "Time axis", label: "Ruler height", default: 0,
            min: 0, max: 50, step: 1, unit: "%",
            help: "0 = auto (~12 % of chart height). Can be set up to 50 %."
        },
        timeFormat: { type: "enum", group: "Time axis", label: "Time format", default: "24h", options: opt([["24h", "24 hours (14:05)"], ["12h", "12 hours (2:05 PM)"], ["relative", "Relative to the newest (−5m)"]]) },
        timeZone: { type: "enum", group: "Time axis", label: "Time zone", default: "local", options: opt([["local", "The viewer's (local)"], ["utc", "UTC"]]) },

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

        minSpan: { type: "enum", group: "Zoom & pan", label: "Zoom in to at most", default: "", options: opt(SPANS), help: "The shortest time the chart can show." },
        maxSpan: { type: "enum", group: "Zoom & pan", label: "Zoom out to at most", default: "", options: opt(SPANS), help: "The longest time the chart can show." },
        panLimit: {
            type: "enum", group: "Zoom & pan", label: "Move in time", default: "data",
            options: opt([["data", "Only where there is data"], ["window", "Only within the last…"], ["free", "Anywhere"]])
        },
        panWindow: { type: "enum", group: "Zoom & pan", label: "The last", default: "24h", options: opt(WINDOWS.slice(1)), visibleWhen: (p) => p.panLimit === "window" },
        futureMargin: {
            type: "enum", group: "Zoom & pan", label: "Room after the newest point", default: "0",
            options: opt([["0", "None"], ["0.02", "2 %"], ["0.05", "5 %"], ["0.1", "10 %"]]), help: "Live: the newest point is not glued to the right edge."
        },
        enableZoomPan: { type: "boolean", default: true, group: "Zoom & pan", label: "Zoom (wheel) and pan (drag)" },

        exportButton: { type: "boolean", group: "Export", label: "Export menu on the chart (⋮)", default: true, help: "A menu in the top-right corner: the formats below." },
        exportCsv: { type: "boolean", group: "Export", label: "Menu: CSV", default: true, visibleWhen: (p) => p.exportButton !== false },
        exportXlsx: { type: "boolean", group: "Export", label: "Menu: Excel", default: true, visibleWhen: (p) => p.exportButton !== false },
        exportPng: { type: "boolean", group: "Export", label: "Menu: PNG", default: true, visibleWhen: (p) => p.exportButton !== false },
        exportRange: {
            type: "enum", group: "Export", label: "What it exports", default: "visible",
            options: opt([["visible", "What is shown (zoom / pan applied)"], ["all", "Everything it holds"]]),
            help: "Hidden series (legend, Hide) are never exported. Logic's Export action can say otherwise: { range: \"all\" }."
        },
        exportAnnotations: {
            type: "boolean", group: "Export", label: "Annotations", default: true,
            help: "CSV / Excel: an Annotation column, its own row at its exact time. PNG: drawn."
        },
        exportThresholds: {
            type: "boolean", group: "Export", label: "Thresholds", default: true,
            help: "Excel: a value past an upper / lower limit gets the limit's colour (an Info sheet lists them). PNG: drawn."
        },
        exportTitle: { type: "string", group: "Export", label: "Title", default: "", help: "Above the PNG and in the Excel Info sheet; {title} in the file name. Empty: the chart's name." },
        exportFilename: {
            type: "string", group: "Export", label: "File name expression", default: "", bindable: false,
            help: "Expression or template for the download file name. Variables: {title}, {date}, {time}, {year}, {month}, {day}, {format}, {range}. Default: chart-YYYYMMDD-HHmm"
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
        },

        annotations: {
            type: "list", group: "Annotations", label: "Annotations", noun: "annotation", default: [],
            item: {
                noun: "annotation",
                fields: {
                    label: { type: "string", label: "Label", default: "Event" },
                    time: { type: "string", label: "Time", default: "", help: "A date and time (2026-10-04 08:00), or ms since 1970." },
                    color: { type: "color", label: "Colour", default: "#f59e0b" },
                    description: { type: "string", label: "Description", default: "", help: "In the tooltip, and On Annotation Click." }
                }
            },
            help: "Event markers (vertical lines with badges) on specific timestamps. From Logic: Add / Set / Clear annotations."
        },
        showAnnotations: { type: "boolean", default: true, group: "Annotations", label: "Show annotations", help: "Shows event marker annotations across the chart." }
    },

    parts: {
        chart: part("Chart canvas container", "chart"),
        legend: part("Legend", "legend")
    },

    events: {
        rangeChange: {
            label: "On Range Change", payload: { from: "number", to: "number", live: "boolean", cause: "string" },
            help: "The time shown changed (zoom, pan, ruler, navigator, Live): from / to (ms), live, cause. Load what is needed for it."
        },
        liveChange: { label: "On Live / Paused", payload: { live: "boolean" }, help: "The viewer stopped following the newest data (zoom / pan), or follows it again." },
        hover: { label: "On Hover", payload: { time: "number", values: "object" }, help: "The time under the cursor and each series' value there: share a crosshair with other charts through a variable." },
        hoverEnd: { label: "On Hover End", help: "The cursor left the chart." },
        click: { label: "On Click", payload: { time: "number", values: "object" }, help: "A click in the chart (not a drag): its time and the values there." },
        annotationClick: {
            label: "On Annotation Click", payload: { id: "string", time: "number", label: "string", color: "string", description: "string" },
            help: "The viewer clicked an annotation badge or vertical marker line."
        },
        rangeSelect: { label: "On Range Select", payload: { from: "number", to: "number" }, help: "Shift + drag selected a time range: statistics, export, zoom other charts." },
        seriesToggle: { label: "On Series Toggle", payload: { series: "string", visible: "boolean" }, help: "The viewer showed / hid a series in the legend." }
    },

    actions: {
        followLive: { label: "Follow live", help: "Shows the newest data again (as Live / a double click)." },
        setRange: {
            label: "Show a time range", params: { from: "number", to: "number" }, help: "Pauses live and shows that time.",
            example: "{ \"from\": 1727852400000, \"to\": 1727856000000 }"
        },
        clearAll: { label: "Clear every series" },
        addAnnotation: {
            label: "Add annotation",
            params: { time: "number", label: "string", color: "string" },
            help: "Adds an annotation { time, label, color } to the chart.",
            example: '{ "time": 1727852400000, "label": "Batch #104 Started", "color": "#10b981" }'
        },
        setAnnotations: {
            label: "Set annotations",
            help: "Replaces annotations with a new array [{ time, label, color }].",
            example: '[{ "time": 1727852400000, "label": "Pump Trip", "color": "#ef4444" }]'
        },
        clearAnnotations: {
            label: "Clear annotations", help: "Removes all annotations from the chart."
        },
        exportData: {
            label: "Export (download)", params: { format: "string", range: "string", annotations: "boolean", thresholds: "boolean" },
            help: "Downloads a file on the viewer's screen. Each option left out: the Properties' Export settings. Hidden series are never exported.",
            example: "{ \"format\": \"xlsx\", \"range\": \"visible\", \"annotations\": true, \"thresholds\": true }  (format: csv | xlsx | png, range: visible | all)"
        },
        exportPNG: {
            label: "Export PNG", params: { range: "string" }, help: "Downloads the chart as an image (2× sharp, a title, the time span, the legend).",
            example: "{ \"range\": \"all\" }  (visible | all)"
        }
    },

    view: class extends ChartElement {

        decimator = new M4Decimator(2048);
        _navDecimator = new M4Decimator(1024);
        _series = new Map();      // key -> { buf, lastLive, dx, dy, n, demo, lastAt, stale }
        _hidden = new Set();
        _dynamicAnnotations = [];
        _annotationHits = [];
        _hoverAnnotation = null;

        viewRange = null;         // null = live
        drag = null;              // { kind: "pan" | "ruler" | "nav" | "navL" | "navR" | "select", x0, min0, max0, moved }
        hover = null;
        _selection = null;        // { from, to } (Shift + drag)
        _lastHoverEmit = 0;
        _lastRangeEmit = 0;
        _wasLive = true;

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

        // ---- the chart's actions (its Update node) ---------------------------------------------
        followLive() {
            this.viewRange = null;
            this._selection = null;
            this.draw();
            this.requestUpdate();
            this._rangeChanged("live");
        }

        setRange(params) {
            const from = numOr(params && params.from, NaN), to = numOr(params && params.to, NaN);
            if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;
            this.viewRange = { minX: from, maxX: to };
            this.draw();
            this.requestUpdate();
            this._rangeChanged("action");
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

        // the time span an export covers: the time shown, or everything the shown series hold
        _exportSpan(range) {
            const list = this._visible();
            const fb = this._bounds(list);
            if (range === "visible" && this._scale) return { list, from: this._scale.vMinX, to: this._scale.vMaxX };
            return { list, from: fb ? fb.minX : 0, to: fb ? fb.maxX : 0 };
        }

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

        /**
         * The chart as an image, 2× sharp: a title and the time span above, the legend below. "visible":
         * what is shown; "all": everything the shown series hold. Hidden series are left out.
         */
        exportPNG(params) {
            const o = this._exportOpts(Object.assign({}, params || {}, { format: "png" }));
            const { w, h } = this._layoutSize();
            if (!(w > 0 && h > 0) || !this._visible().length) return Promise.resolve(null);
            const S = 2, c = this._colors();
            const span = this._exportSpan(o.range);
            const range = o.range === "all" ? { vMinX: span.from, vMaxX: span.to > span.from ? span.to : span.from + 10 } : null;
            // the chart, drawn again off the screen
            const chart = document.createElement("canvas");
            chart.width = w * S;
            chart.height = h * S;
            const cctx = chart.getContext("2d");
            if (!cctx) return Promise.resolve(null);
            cctx.setTransform(S, 0, 0, S, 0, 0);
            const drawn = this.draw({ ctx: cctx, width: w, height: h, range, noAnnotations: !o.annotations, noThresholds: !o.thresholds });
            this.scheduleDraw();
            if (!drawn) return Promise.resolve(null);
            // the legend: a swatch, the name, the value it shows
            const mode = this.p.legendValue || "last";
            const legend = this.p.legend === "none" ? [] : span.list.filter((s) => s.legend !== false).map((s) => {
                const buf = this._state(s).buf;
                let y = NaN;
                if (mode === "last" && buf.count) y = buf.getY(buf.count - 1);
                else if (mode !== "none") y = this._statsOf(s)[mode];
                return { color: this.colorOf(s), text: (s.name || s.id) + (mode !== "none" && Number.isFinite(y) ? "  " + this.fmtValue(s, y) : "") };
            });
            const meas = document.createElement("canvas").getContext("2d");
            meas.font = "11px " + c.mono;
            const lines = [[]];
            let lineW = 0;
            for (const it of legend) {
                const iw = 20 + meas.measureText(it.text).width + 16;
                if (lineW + iw > w - 24 && lines[lines.length - 1].length) { lines.push([]); lineW = 0; }
                lines[lines.length - 1].push(it);
                lineW += iw;
            }
            const title = this._exportTitle();
            const headH = title ? 40 : 24, legH = legend.length ? lines.length * 18 + 8 : 0;
            const out = document.createElement("canvas");
            out.width = w * S;
            out.height = (headH + h + legH) * S;
            const ctx = out.getContext("2d");
            ctx.setTransform(S, 0, 0, S, 0, 0);
            ctx.fillStyle = getComputedStyle(this).getPropertyValue("--panel").trim() || "#181b1f";
            ctx.fillRect(0, 0, w, headH + h + legH);
            ctx.textBaseline = "top";
            ctx.textAlign = "left";
            if (title) {
                ctx.font = "600 14px " + (getComputedStyle(this).getPropertyValue("--nexa-fonts-body") || "sans-serif");
                ctx.fillStyle = c.strong;
                ctx.fillText(title, 12, 8);
            }
            ctx.font = "10.5px " + c.mono;
            ctx.fillStyle = c.text;
            ctx.fillText(this.fmtTime(drawn.vMinX) + "  →  " + this.fmtTime(drawn.vMaxX), 12, title ? 26 : 7);
            ctx.drawImage(chart, 0, headH, w, h);
            ctx.font = "11px " + c.mono;
            lines.forEach((line, li) => {
                let x = 12;
                const y = headH + h + 4 + li * 18;
                for (const it of line) {
                    ctx.fillStyle = it.color;
                    ctx.fillRect(x, y + 6, 14, 3);
                    ctx.fillStyle = c.strong;
                    ctx.fillText(it.text, x + 20, y + 1);
                    x += 20 + ctx.measureText(it.text).width + 16;
                }
            });
            return new Promise((resolve) => {
                out.toBlob((blob) => {
                    if (!blob) { resolve(null); return; }
                    const name = this._getExportFileName("png", o.range);
                    this._download(blob, name);
                    this._lastExport = { name, blob, width: out.width, height: out.height };
                    resolve(this._lastExport);
                }, "image/png");
            });
        }

        // ---- annotations -----------------------------------------------------------------------
        _allAnnotations() {
            if (this.p.showAnnotations === false) return [];
            const staticList = Array.isArray(this.p.annotations) ? this.p.annotations : [];
            const res = [];
            for (const item of staticList) {
                if (!item) continue;
                const time = timeOf(item.time);
                if (!Number.isFinite(time)) continue;
                res.push({
                    id: item.id || ("ann-s-" + time + "-" + (item.label || "")),
                    time,
                    label: String(item.label || "Event"),
                    color: item.color || "#f59e0b",
                    description: item.description ? String(item.description) : ""
                });
            }
            return res.concat(this._dynamicAnnotations);
        }

        addAnnotation(params) {
            if (!params) return;
            const items = Array.isArray(params) ? params : [params];
            for (const item of items) {
                if (!item || typeof item !== "object") continue;
                const time = item.time === undefined || item.time === null || item.time === "" ? Date.now() : timeOf(item.time);
                if (!Number.isFinite(time)) continue;
                this._dynamicAnnotations.push({
                    id: item.id || ("ann-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6)),
                    time,
                    label: String(item.label || "Event"),
                    color: item.color || "#f59e0b",
                    description: item.description ? String(item.description) : ""
                });
            }
            this.draw();
            this.requestUpdate();
        }

        setAnnotations(params) {
            this._dynamicAnnotations = [];
            const list = Array.isArray(params) ? params : (params && Array.isArray(params.annotations) ? params.annotations : (params && Array.isArray(params.list) ? params.list : (params ? [params] : [])));
            for (const item of list) {
                if (!item || typeof item !== "object") continue;
                const time = item.time === undefined || item.time === null || item.time === "" ? Date.now() : timeOf(item.time);
                if (!Number.isFinite(time)) continue;
                this._dynamicAnnotations.push({
                    id: item.id || ("ann-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6)),
                    time,
                    label: String(item.label || "Event"),
                    color: item.color || "#f59e0b",
                    description: item.description ? String(item.description) : ""
                });
            }
            this.draw();
            this.requestUpdate();
        }

        clearAnnotations() {
            this._dynamicAnnotations = [];
            this._hoverAnnotation = null;
            this.draw();
            this.requestUpdate();
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

        _rulerHeight(chartH) {
            const kind = this.p.ruler || "tworow";
            if (kind === "none") return 0;
            const showDate = this.p.showDate !== false;
            const showTime = this.p.showTime !== false;
            const ch = chartH || this._layoutSize().h || 320;
            const rhp = numOr(this.p.rulerHeight, 0);
            const pct = rhp > 0 ? Math.min(50, Math.max(1, rhp)) : 0;

            if (pct > 0) {
                const targetH = Math.round((ch * pct) / 100);
                if (kind === "axis") {
                    if (!showDate && !showTime) return 0;
                    const minH = (!showDate || !showTime) ? 18 : 28;
                    return Math.max(minH, targetH);
                }
                if (kind === "navigator") {
                    const minH = (!showDate && !showTime) ? 36 : (!showDate || !showTime) ? 48 : 60;
                    return Math.max(minH, targetH);
                }
                // the band: ticks (10) + the rows + the grip (6)
                const minH = (!showDate && !showTime) ? 14 : (!showDate || !showTime) ? 28 : 40;
                return Math.max(minH, targetH);
            }

            if (kind === "tworow" || kind === "comb") {
                if (!showDate && !showTime) return 14;
                if (!showDate || !showTime) return 28;
                return 40;
            }
            if (kind === "axis") {
                if (!showDate && !showTime) return 0;
                if (showDate && showTime) return 30;
                return 20;
            }
            if (kind === "navigator") {
                if (!showDate && !showTime) return 38;
                if (!showDate || !showTime) return 54;
                return 68;
            }
            return 38;
        }

        _timeStep(span, w) {
            const density = this.p.tickDensity || "normal";
            const div = density === "loose" ? 150 : density === "dense" ? 60 : 90;
            const maxT = density === "loose" ? 5 : density === "dense" ? 12 : 8;
            return getNiceTimeStep(span, Math.max(2, Math.min(maxT, Math.floor(w / div))));
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

        // ---- time range & limits ---------------------------------------------------------------
        clampViewRange(minX, maxX, fb) {
            let span = maxX - minX;
            const lo = spanMs(this.p.minSpan) || 10, hi = spanMs(this.p.maxSpan) || Infinity;
            if (span < lo) { const c = (minX + maxX) / 2; minX = c - lo / 2; maxX = c + lo / 2; span = lo; }
            if (span > hi) { const c = (minX + maxX) / 2; minX = c - hi / 2; maxX = c + hi / 2; span = hi; }
            if (!fb || this.p.panLimit === "free") return { minX, maxX };
            let left = fb.minX, right = fb.maxX + span * numOr(this.p.futureMargin, 0);
            if (this.p.panLimit === "window") left = Math.max(left, fb.maxX - (spanMs(this.p.panWindow) || 86400000));
            if (span >= right - left) return { minX: left, maxX: left + span };
            if (minX < left) { minX = left; maxX = left + span; }
            if (maxX > right) { maxX = right; minX = right - span; }
            return { minX, maxX };
        }

        getEffectiveTimeRange(fb) {
            if (!fb) return { vMinX: 0, vMaxX: 1 };
            if (this.viewRange) {
                const c = this.clampViewRange(this.viewRange.minX, this.viewRange.maxX, fb);
                return { vMinX: c.minX, vMaxX: c.maxX };
            }
            const windowMs = parseTimeWindow(this.p.timeWindow);
            let vMinX = windowMs > 0 ? Math.max(fb.minX, fb.maxX - windowMs) : fb.minX, vMaxX = fb.maxX;
            const margin = numOr(this.p.futureMargin, 0);
            if (margin > 0) vMaxX += (vMaxX - vMinX) * margin;
            const hi = spanMs(this.p.maxSpan);
            if (hi && vMaxX - vMinX > hi) vMinX = vMaxX - hi;
            if (vMaxX - vMinX < 10) { vMinX -= 5; vMaxX += 5; }
            return { vMinX, vMaxX };
        }

        _rangeChanged(cause) {
            const live = !this.viewRange;
            if (live !== this._wasLive) { this._wasLive = live; this.emit("liveChange", { live }); }
            const sc = this._scale;
            if (!sc) return;
            const now = Date.now();
            if (cause === "wheel" && now - this._lastRangeEmit < 150) return;
            this._lastRangeEmit = now;
            this.emit("rangeChange", { from: sc.vMinX, to: sc.vMaxX, live, cause });
        }

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

        /**
         * Draws the chart on its canvas; with a target ({ ctx, width, height, range?, noAnnotations?,
         * noThresholds? }) into that one instead (an export): no hover, no selection, the screen's
         * state left as it was. -> { vMinX, vMaxX } drawn (a target), or nothing.
         */
        draw(target) {
            if (target) {
                const keep = { scale: this._scale, full: this._full, newest: this._newest, hover: this.hover, sel: this._selection, hr: this._hoverRuler, drag: this.drag, ha: this._hoverAnnotation, hits: this._annotationHits };
                this._exporting = target;
                this.hover = null; this._selection = null; this._hoverRuler = false; this.drag = null; this._hoverAnnotation = null;
                try {
                    this._drawInto(target.ctx, target.width, target.height, target.range || null);
                    return this._scale ? { vMinX: this._scale.vMinX, vMaxX: this._scale.vMaxX } : null;
                } finally {
                    this._exporting = null;
                    this._scale = keep.scale; this._full = keep.full; this._newest = keep.newest; this.hover = keep.hover; this._selection = keep.sel;
                    this._hoverRuler = keep.hr; this.drag = keep.drag; this._hoverAnnotation = keep.ha; this._annotationHits = keep.hits;
                }
            }
            if (!this.canvas || !this.ctx) return;
            const { w: width, h: height } = this._layoutSize();
            if (width <= 0 || height <= 0) return;
            if (!this.resizeCanvas()) return;
            this._drawInto(this.ctx, width, height, null);
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

        _drawAnnotations(ctx, toX, plotX, plotY, plotW, plotH, vMinX, vMaxX) {
            const list = this._allAnnotations();
            this._annotationHits = [];
            if (!list.length) return;
            const cs = getComputedStyle(this);
            const mono = cs.getPropertyValue("--mono") || "monospace";

            ctx.save();
            ctx.font = "9.5px " + mono;

            for (const ann of list) {
                if (ann.time < vMinX || ann.time > vMaxX) continue;
                const x = toX(ann.time);
                if (x < plotX - 25 || x > plotX + plotW + 25) continue;

                const color = ann.color || "#f59e0b";
                const isHovered = this._hoverAnnotation && this._hoverAnnotation.id === ann.id;

                // 1. Vertical marker line
                ctx.strokeStyle = color;
                ctx.lineWidth = isHovered ? 2 : 1.2;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(Math.round(x) + 0.5, plotY + 18);
                ctx.lineTo(Math.round(x) + 0.5, plotY + plotH);
                ctx.stroke();
                ctx.setLineDash([]);

                // 2. Badge pill at top
                const text = ann.label || "Event";
                const tw = ctx.measureText(text).width;
                const bw = Math.max(28, tw + 12);
                const bh = 17;
                const bx = Math.max(plotX + 2, Math.min(plotX + plotW - bw - 2, x - bw / 2));
                const by = plotY + 2;

                // Badge background & border
                ctx.fillStyle = isHovered ? color : "rgba(30, 34, 40, 0.92)";
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 3);
                else ctx.rect(bx, by, bw, bh);
                ctx.fill();
                ctx.stroke();

                // Small triangular pointer down to line
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(x - 3, by + bh);
                ctx.lineTo(x + 3, by + bh);
                ctx.lineTo(x, by + bh + 3);
                ctx.closePath();
                ctx.fill();

                // Text
                ctx.fillStyle = isHovered ? "#fff" : color;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(text, bx + bw / 2, by + bh / 2);

                this._annotationHits.push({
                    id: ann.id,
                    time: ann.time,
                    label: ann.label,
                    color: ann.color,
                    description: ann.description,
                    box: { x: bx, y: by, w: bw, h: bh + 4, lineX: x }
                });
            }

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

        // ---- the time ruler (every variant but "axis" / "none" can be dragged) ------------------
        // a row of times at the ticks (a label at an edge stays inside the ruler)
        _timeRow(ctx, toX, minX, maxX, step, x, w, ty, dateShown, inset) {
            const pad = inset || 2;
            ctx.textBaseline = "top";
            for (let t = Math.ceil(minX / step) * step, k = 0; t <= maxX && k < 200; t += step, k++) {
                const label = this.fmtTick(t, step, dateShown), tx = toX(t), tw = ctx.measureText(label).width;
                if (tx - tw / 2 < x + pad) { ctx.textAlign = "left"; ctx.fillText(label, x + pad, ty); }
                else if (tx + tw / 2 > x + w - pad) { ctx.textAlign = "right"; ctx.fillText(label, x + w - pad, ty); }
                else { ctx.textAlign = "center"; ctx.fillText(label, tx, ty); }
            }
        }

        // a row of dates: once per day, in the middle of the day's part of the ruler (shorter, or
        // none, when it does not fit); lineFrom / lineTo: a line where a day starts
        _dateRow(ctx, toX, minX, maxX, x, w, ty, lineFrom, lineTo, lineColor) {
            const utc = this._tf().utc;
            const dayStart = (t) => { const q = parts(t, utc); return utc ? Date.UTC(q.y, q.mo, q.d) : new Date(q.y, q.mo, q.d).getTime(); };
            ctx.textBaseline = "top";
            ctx.textAlign = "center";
            let d0 = dayStart(minX), guard = 0;
            while (d0 <= maxX && guard++ < 400) {
                const q = parts(d0 + 43200000, utc);
                const d1 = utc ? Date.UTC(q.y, q.mo, q.d + 1) : new Date(q.y, q.mo, q.d + 1).getTime();
                const a = Math.max(x, toX(d0)), b = Math.min(x + w, toX(d1)), room = b - a - 8;
                let label = this.fmtDate(d0 + 1000);
                if (ctx.measureText(label).width > room) label = this.fmtDateShort(d0 + 1000);
                if (ctx.measureText(label).width <= room) ctx.fillText(label, (a + b) / 2, ty);
                if (d0 > minX && lineTo > lineFrom) {
                    const lx = Math.round(toX(d0)) + 0.5;
                    ctx.save();
                    ctx.strokeStyle = lineColor;
                    ctx.beginPath();
                    ctx.moveTo(lx, lineFrom);
                    ctx.lineTo(lx, lineTo);
                    ctx.stroke();
                    ctx.restore();
                }
                d0 = d1;
            }
        }

        _drawRuler(ctx, m, minX, maxX, list) {
            const kind = this.p.ruler || "tworow";
            if (kind === "none") return;
            const c = this._colors();
            const { rulerX: x, rulerY: y, rulerW: w, rulerH: h } = m;
            if (!h) return;
            const span = Math.max(1, maxX - minX);
            const step = this._timeStep(span, w);
            const toX = (t) => x + ((t - minX) / span) * w;
            const hot = this._hoverRuler || (this.drag && this.drag.kind !== "pan" && this.drag.kind !== "select");
            const showDate = this.p.showDate !== false;
            // ticks a day (or more) apart: the date row already names them
            const showTime = this.p.showTime !== false && !(showDate && step >= 86400000);
            const both = showTime && showDate;
            ctx.save();

            if (kind === "navigator") { this._drawNavigator(ctx, m, minX, maxX, list, c); ctx.restore(); return; }

            if (kind === "axis") {
                // labels only: the rows centred in the ruler
                const rowsH = both ? 24 : 11, top = y + Math.max(2, Math.round((h - rowsH) / 2));
                ctx.font = "10px " + c.mono;
                ctx.fillStyle = c.text;
                if (showTime) this._timeRow(ctx, toX, minX, maxX, step, x, w, top, showDate);
                if (showDate) {
                    ctx.font = "600 9.5px " + c.mono;
                    this._dateRow(ctx, toX, minX, maxX, x, w, showTime ? top + 13 : top, y, y + h, c.grid);
                }
                ctx.restore();
                return;
            }

            // comb / band: a band that says "drag me"; ticks on top, then the time row, the date row
            ctx.fillStyle = hot ? this.hexToRgba(c.accent, 0.14) : c.band;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = hot ? c.accent : c.grid;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
            const minor = step <= 20 ? step / 2 : step / 5;
            ctx.beginPath();
            ctx.strokeStyle = c.grid;
            for (let t = Math.ceil(minX / minor) * minor, k = 0; t <= maxX && k < 1000; t += minor, k++) { const sx = Math.round(toX(t)) + 0.5; ctx.moveTo(sx, y); ctx.lineTo(sx, y + 4); }
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = c.text;
            for (let t = Math.ceil(minX / step) * step, k = 0; t <= maxX && k < 200; t += step, k++) { const sx = Math.round(toX(t)) + 0.5; ctx.moveTo(sx, y); ctx.lineTo(sx, y + 8); }
            ctx.stroke();

            // the rows start under the ticks (y + 10) and sit in the middle of what is left
            const rowsH = both ? 24 : (showTime || showDate) ? 11 : 0;
            const top = y + 10 + Math.max(0, Math.floor((h - 10 - 6 - rowsH) / 2));
            if (showTime) {
                ctx.font = "10px " + c.mono;
                ctx.fillStyle = c.strong;
                this._timeRow(ctx, toX, minX, maxX, step, x, w, top, showDate, 12);
            }
            if (showDate) {
                ctx.font = "600 9.5px " + c.mono;
                ctx.fillStyle = c.text;
                const dy = showTime ? top + 13 : top;
                this._dateRow(ctx, toX, minX, maxX, x, w, dy, showTime ? top + 12 : y, y + h, c.text);
            }
            // the drag affordance: a grip at the bottom middle, arrows at both ends
            const cx = x + w / 2, gy = y + h - 3;
            ctx.fillStyle = hot ? c.accent : c.text;
            for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(cx + k * 5, gy, 1.2, 0, Math.PI * 2); ctx.fill(); }
            ctx.font = "11px " + c.mono;
            ctx.textBaseline = "middle";
            ctx.textAlign = "left";
            ctx.fillText("‹", x + 3, y + h / 2);
            ctx.textAlign = "right";
            ctx.fillText("›", x + w - 3, y + h / 2);
            if (hot) this._hint(ctx, "drag ⇆ to move · wheel to zoom", x + w - 12, y + 1, c);
            ctx.restore();
        }

        // the navigator: every point the chart holds, small; a window (the time shown) to drag / resize
        _navGeom(m) {
            const full = this._full;
            if (!full || !this._scale) return null;
            const { rulerX: x, rulerY: y, rulerW: w, rulerH } = m;
            const span = Math.max(1, full.maxX - full.minX);
            const toX = (t) => x + ((t - full.minX) / span) * w;
            const a = Math.max(x, toX(this._scale.vMinX)), b = Math.min(x + w, toX(this._scale.vMaxX));
            const showTime = this.p.showTime !== false;
            const showDate = this.p.showDate !== false;
            const labelH = (showTime && showDate) ? 27 : (showTime || showDate) ? 15 : 0;
            const h = Math.max(24, (rulerH || 54) - labelH);
            return { x, y, w, h, a, b: Math.max(b, a + 6), span, full, toX };
        }

        _drawNavigator(ctx, m, minX, maxX, list, c) {
            const g = this._navGeom(m);
            if (!g) return;
            const { x, y, w, h } = g;
            ctx.fillStyle = c.band;
            ctx.fillRect(x, y, w, h);
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
            // outside the window: shaded; the window: a frame with two handles
            ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
            ctx.fillRect(x, y, g.a - x, h);
            ctx.fillRect(g.b, y, x + w - g.b, h);
            ctx.strokeStyle = c.accent;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(g.a + 0.5, y + 0.5, g.b - g.a - 1, h - 1);
            ctx.fillStyle = this.hexToRgba(c.accent, this._hoverRuler ? 0.18 : 0.08);
            ctx.fillRect(g.a, y, g.b - g.a, h);
            for (const hx of [g.a, g.b]) {
                ctx.fillStyle = c.accent;
                ctx.beginPath();
                const handleH = Math.min(22, Math.max(16, Math.round(h * 0.5)));
                ctx.roundRect ? ctx.roundRect(hx - 4, y + h / 2 - handleH / 2, 8, handleH, 3) : ctx.rect(hx - 4, y + h / 2 - handleH / 2, 8, handleH);
                ctx.fill();
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(hx - 1.5, y + h / 2 - 5); ctx.lineTo(hx - 1.5, y + h / 2 + 5);
                ctx.moveTo(hx + 1.5, y + h / 2 - 5); ctx.lineTo(hx + 1.5, y + h / 2 + 5);
                ctx.stroke();
            }
            // the whole history's times and dates under it
            const showDate = this.p.showDate !== false;
            if (this.p.showTime !== false || showDate) {
                const step = this._timeStep(g.span, w), top = y + h + 2;
                const showTime = this.p.showTime !== false && !(showDate && step >= 86400000);
                if (showTime) {
                    ctx.font = "9.5px " + c.mono;
                    ctx.fillStyle = c.text;
                    this._timeRow(ctx, g.toX, g.full.minX, g.full.maxX, step, x, w, top, showDate);
                }
                if (showDate) {
                    ctx.font = "600 9.5px " + c.mono;
                    ctx.fillStyle = c.text;
                    this._dateRow(ctx, g.toX, g.full.minX, g.full.maxX, x, w, showTime ? top + 12 : top, 0, 0, c.grid);
                }
            }
            if (this._hoverRuler) this._hint(ctx, "drag the window ⇆ · its edges resize", x + w - 4, y + 2, c);
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

        _showTooltip(px, py, rectW) {
            const tip = this.renderRoot.querySelector(".tooltip");
            if (!tip) return;
            if (!px && !py && !rectW) {
                tip.style.display = "none";
                return;
            }
            if (this._hoverAnnotation) {
                const ann = this._hoverAnnotation;
                tip.querySelector(".tooltip-time").textContent = this.fmtDate(ann.time) + " " + this.fmtTime(ann.time);
                const body = tip.querySelector(".tooltip-rows");
                while (body.children.length > 1) body.removeChild(body.lastChild);
                let row = body.children[0];
                if (!row) {
                    row = document.createElement("div");
                    row.className = "tooltip-row";
                    row.appendChild(document.createElement("span")).className = "tooltip-dot";
                    row.appendChild(document.createElement("span")).className = "tooltip-text";
                    body.appendChild(row);
                }
                row.children[0].style.background = ann.color || "#f59e0b";
                row.children[1].textContent = ann.label + (ann.description ? " · " + ann.description : "");
                const flip = px > rectW - 200;
                tip.style.display = "block";
                tip.style.left = `${Math.round(flip ? px - 12 : px + 12)}px`;
                tip.style.top = `${Math.round(py)}px`;
                tip.style.transform = flip ? "translate(-100%, -50%)" : "translate(0, -50%)";
                return;
            }
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

        // ---- pointer ---------------------------------------------------------------------------
        _local(e) {
            const { box, w, h } = this._layoutSize();
            if (!box || w <= 0 || h <= 0) return null;
            const rect = box.getBoundingClientRect();
            const sx = rect.width > 0 ? w / rect.width : 1, sy = rect.height > 0 ? h / rect.height : 1;
            const m = this._scale && this._scale.m ? this._scale.m : this.getPlotMetrics(w, h);
            return { box, rect: { width: w, height: h }, m, sx, px: (e.clientX - rect.left) * sx, py: (e.clientY - rect.top) * sy };
        }

        _zone(L) {
            const { m, px, py } = L;
            const kind = this.p.ruler || "tworow";
            if (m.rulerH && kind !== "axis" && px >= m.rulerX - 6 && px <= m.rulerX + m.rulerW + 6 && py >= m.rulerY && py <= m.rulerY + m.rulerH) {
                if (kind !== "navigator") return "ruler";
                const g = this._navGeom(m);
                if (!g || py > g.y + g.h) return "none";
                if (Math.abs(px - g.a) <= 7) return "navL";
                if (Math.abs(px - g.b) <= 7) return "navR";
                return px > g.a && px < g.b ? "nav" : "navJump";
            }
            if (px >= m.plotX && px <= m.plotX + m.plotW && py >= m.plotY && py <= m.plotY + m.plotH) return "plot";
            return "none";
        }

        onPointerDown(e) {
            if (e.button !== 0 || !this.canvas) return;
            // the corner's buttons (Live, the export menu) are not a click / drag on the chart
            if (e.composedPath().some((n) => n.classList && (n.classList.contains("corner") || n.classList.contains("menu-dropdown")))) return;
            const L = this._local(e);
            if (!L) return;
            const zone = this._zone(L);
            if (zone === "none") return;
            const fb = this._bounds(this._visible());
            if (!fb || !this._scale) return;
            const { vMinX, vMaxX } = this._scale;
            const base = { x0: e.clientX, sx: L.sx, min0: vMinX, max0: vMaxX, moved: false, down: { px: L.px, py: L.py } };
            if (zone === "navJump") {
                // a click beside the window: the window jumps there
                const g = this._navGeom(L.m), t = g.full.minX + ((L.px - g.x) / g.w) * g.span, half = (vMaxX - vMinX) / 2;
                this.viewRange = this.clampViewRange(t - half, t + half, fb);
                this.draw();
                this.requestUpdate();
                this._rangeChanged("navigator");
                return;
            }
            if (zone === "plot" && e.shiftKey) this.drag = Object.assign(base, { kind: "select" });
            else if (zone === "plot") this.drag = Object.assign(base, { kind: this.p.enableZoomPan ? "pan" : "click" });
            else this.drag = Object.assign(base, { kind: zone });
            L.box.classList.add(zone === "plot" ? (e.shiftKey ? "selecting" : "dragging") : "scrubbing");
            try { e.target.setPointerCapture(e.pointerId); } catch (_) { }
        }

        onPointerMove(e) {
            const L = this._local(e);
            if (!L || !this.canvas) return;
            const { m, px, py, box } = L;
            const d = this.drag;
            if (d) {
                const dx = (e.clientX - d.x0) * (d.sx || 1);
                if (Math.abs(dx) > 3) d.moved = true;
                if (!d.moved || d.kind === "click") return;
                const fb = this._bounds(this._visible());
                if (d.kind === "select") {
                    const sc = this._scale;
                    const t0 = d.min0 + ((d.down.px - m.plotX) / m.plotW) * (d.max0 - d.min0), t1 = d.min0 + ((px - m.plotX) / m.plotW) * (d.max0 - d.min0);
                    this._selection = { from: Math.min(t0, t1), to: Math.max(t0, t1) };
                    if (sc) this.draw();
                    return;
                }
                if (d.kind === "pan" || d.kind === "ruler") {
                    const delta = (dx / m.plotW) * (d.max0 - d.min0);
                    this.viewRange = this.clampViewRange(d.min0 - delta, d.max0 - delta, fb);
                } else {
                    // the navigator: its scale is the whole history
                    const g = this._navGeom(m);
                    if (!g) return;
                    const delta = (dx / g.w) * g.span;
                    if (d.kind === "nav") this.viewRange = this.clampViewRange(d.min0 + delta, d.max0 + delta, fb);
                    else if (d.kind === "navL") this.viewRange = this.clampViewRange(Math.min(d.min0 + delta, d.max0 - 10), d.max0, fb);
                    else this.viewRange = this.clampViewRange(d.min0, Math.max(d.max0 + delta, d.min0 + 10), fb);
                }
                this.draw();
                return;
            }

            // Check annotation hits
            let hitAnn = null;
            if (this._annotationHits && this._annotationHits.length) {
                for (const h of this._annotationHits) {
                    const b = h.box;
                    if ((px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) ||
                        (Math.abs(px - b.lineX) <= 6 && py >= m.plotY && py <= m.plotY + m.plotH)) {
                        hitAnn = h;
                        break;
                    }
                }
            }
            if (hitAnn !== this._hoverAnnotation) {
                this._hoverAnnotation = hitAnn;
                this.draw();
            }
            box.classList.toggle("hover-ann", !!hitAnn);
            if (hitAnn) {
                if (this.hover) { this.hover = null; this.draw(); this.emit("hoverEnd", {}); }
                this._showTooltip(px, py, L.rect.width);
                return;
            }

            const zone = this._zone(L);
            const onRuler = zone === "ruler" || zone === "nav" || zone === "navL" || zone === "navR" || zone === "navJump";
            if (onRuler !== !!this._hoverRuler) { this._hoverRuler = onRuler; this.draw(); }
            box.classList.toggle("hover-ruler", zone === "ruler" || zone === "nav");
            box.classList.toggle("hover-edge", zone === "navL" || zone === "navR");
            if (zone !== "plot" || !this._scale) {
                if (this.hover) { this.hover = null; this.draw(); this.emit("hoverEnd", {}); }
                this._showTooltip(0, 0, 0);
                return;
            }
            const sc = this._scale;
            const time = sc.vMinX + ((px - m.plotX) / m.plotW) * (sc.vMaxX - sc.vMinX);
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

        _values(hits) {
            const values = {};
            hits.forEach((h) => { values[h.s.id || h.s.name] = h.y; });
            return values;
        }

        onPointerUp(e) {
            const d = this.drag;
            this.drag = null;
            const L = this._local(e);
            if (L) L.box.classList.remove("dragging", "scrubbing", "selecting");
            try { e.target.releasePointerCapture(e.pointerId); } catch (_) { }
            if (!d) return;
            if (d.kind === "select") {
                if (d.moved && this._selection) this.emit("rangeSelect", { from: this._selection.from, to: this._selection.to });
                return;
            }
            if (d.moved && d.kind !== "click") {
                this.requestUpdate();
                this._rangeChanged(d.kind === "pan" ? "pan" : d.kind === "ruler" ? "ruler" : "navigator");
                return;
            }
            if ((d.kind === "pan" || d.kind === "click") && L && this._scale) {
                // a click (no drag): the chart's On Click; on a point, that series' On Point Click
                this._selection = null;
                if (this._hoverAnnotation) {
                    const ann = this._hoverAnnotation;
                    this.emit("annotationClick", { id: ann.id, time: ann.time, label: ann.label, color: ann.color, description: ann.description });
                }
                const sc = this._scale, m = L.m;
                const time = sc.vMinX + ((L.px - m.plotX) / m.plotW) * (sc.vMaxX - sc.vMinX);
                const hits = this._hits(L.px, L.py, time);
                this.emit("click", { time, values: this._values(hits) });
                const near = hits.slice().sort((a, b) => a.d - b.d)[0];
                if (near && near.d <= 12) this.emit("pointClick", { x: near.x, y: near.y }, this._target(near.s));
                this.draw();
            }
        }

        onWheel(e) {
            if (!this.p.enableZoomPan || !this.canvas) return;
            const L = this._local(e);
            if (!L || !this._scale) return;
            const zone = this._zone(L);
            if (zone === "none") return;
            e.preventDefault();
            const { m, px } = L;
            const fb = this._bounds(this._visible());
            const { vMinX, vMaxX } = this._scale;
            const cur = vMaxX - vMinX;
            if (zone !== "plot" && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
                const delta = ((e.deltaX !== 0 ? e.deltaX : e.deltaY) / m.plotW) * cur * 0.4;
                this.viewRange = this.clampViewRange(vMinX + delta, vMaxX + delta, fb);
            } else {
                const ratio = Math.max(0, Math.min(1, (px - m.plotX) / m.plotW));
                const at = vMinX + ratio * cur, span = cur * (e.deltaY < 0 ? 0.75 : 1.33);
                this.viewRange = this.clampViewRange(at - ratio * span, at + (1 - ratio) * span, fb);
            }
            this.draw();
            this.requestUpdate();
            this._rangeChanged("wheel");
        }

        onPointerLeave() {
            this._hoverAnnotation = null;
            if (this.hover) { this.hover = null; this.draw(); this.emit("hoverEnd", {}); }
            this._showTooltip(0, 0, 0);
            if (this._hoverRuler) { this._hoverRuler = false; this.draw(); }
            const box = this._plotEl();
            if (box) box.classList.remove("hover-ruler", "hover-edge", "hover-ann");
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
                        @pointerleave=${() => this.onPointerLeave()}
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
