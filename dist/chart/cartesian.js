// Nexa UI — Chart: the Cartesian chart (columns, bars, lines, steps, areas, points, any mix, any number of series).
//
// A LAYER model. A series is a layer: its own mark (column, line, step, area, points), axis, colour, curve, fill, markers, labels
// and number format; a chart-level setting is only the DEFAULT of a series that leaves its field empty. What belongs to
// several series lives in a list of its own:
//   - AXES   (`axes`): any number; a series (or a stack) picks one by id.
//   - STACKS (`stacks`): a stack owns a mode (stacked / 100 % / side by side / overlapping), an axis and its place beside
//     the other stacks; a series picks the stack it is in; the order of the series is the order of the pile. Stacking is a
//     transform of the data (lo / hi per member): the mark only decides how the band is drawn — a column is a rectangle, an
//     area a band, a line / points sit at the cumulative top ("the total so far"). Any marks may stack together.
// The look is the Line Chart's (smooth monotone curves, gradient fills, the dashed crosshair, the time ruler) in a Power BI
// style format pane. A colour is a hex OR a theme token ({token:colors.…}); the default is the theme's palette (colors.chart.N).
//
// DATA: rows from Logic ([{ time, floor, kwh }]) mapped to x / y / "split by" (a series per value of a field), per series
// (its Update node), or a live tag per series. The x is a category, a number or a TIME. A time x keeps every point in
// Float64 ring buffers (the Line Chart's: M4 + LOD), drawn at pixel accuracy (10^6 points a series); columns and stacks group
// the points into columns of the width the screen allows. The time ruler, zoom / pan, Live, annotations and the refresh
// ticker are TimeChartElement's. See .agents/CHART_FAMILIES_DESIGN.md.
import { html, css, formatValue, theme } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, part, defineUI } from "../core.js";
import { chartCommon, opt, NOTATIONS, DECIMALS, DASHES, numOr } from "./core.js";
import { xlsxBlob } from "./export.js";
import { buildFrame, detectXType, toMs } from "./rows.js";
import { stackColumns, niceTicks, logTicks, extent } from "./stack.js";
import { monotoneSegments, stepPoints } from "./curves.js";
import { TimeSeriesRingBuffer, lowerBoundRing, upperBoundRing, M4Decimator } from "./buffer.js";
import { TimeChartElement } from "./time-chart.js";
import { timeProps, refreshProps, zoomProps, annotationProps, timeEvents, timeActions } from "./props.js";

const MARKS = [["column", "Column / bar"], ["line", "Line"], ["step", "Step line"], ["area", "Area"], ["point", "Points (scatter)"]];
const STACKINGS = [["clustered", "Side by side"], ["stacked", "Stacked"], ["percent", "100 % stacked"], ["none", "Overlapping"]];
const LEGEND_AT = [["bottom", "Bottom"], ["top", "Top"], ["left", "Left"], ["right", "Right"], ["inside-tl", "Inside, top left"], ["inside-tr", "Inside, top right"], ["inside-bl", "Inside, bottom left"], ["inside-br", "Inside, bottom right"], ["none", "None"]];
const dashOf = (d) => DASHES[d] || [];
const timeish = (p) => p.xType === "time" || p.xType === "auto" || p.xType === undefined;
// the time cards (Time axis, Zoom & pan, Annotations, the time range, Refresh) show when the x is, or may be, a time
const onTime = (props) => {
    const out = {};
    Object.keys(props).forEach((k) => { const q = props[k], prev = q.visibleWhen; out[k] = Object.assign({}, q, { visibleWhen: (p, ...r) => timeish(p) && (!prev || prev(p, ...r)) }); });
    return out;
};

const DEFAULT_AXES = [
    { id: "y", side: "left", title: "", show: true, scale: "linear", grid: true },
    { id: "y2", side: "right", title: "", show: true, scale: "linear", grid: false }
];
const axisOptions = (p) => [{ value: "", label: "The first axis" }].concat((Array.isArray(p && p.axes) ? p.axes : DEFAULT_AXES).filter((a) => a && a.id).map((a) => ({ value: a.id, label: (a.title || a.id) + " (" + (a.side === "right" ? "right" : "left") + ")" })));
const stackOptions = (p) => [{ value: "", label: "None (the chart's default)" }].concat((Array.isArray(p && p.stacks) ? p.stacks : []).filter((g) => g && g.id).map((g) => ({ value: g.id, label: g.name || g.id })));

// ---- the series' fields (a Power BI "Visual / Series" card, per series; an empty field takes the chart's default) ---
const SERIES_FIELDS = {
    name: { type: "string", label: "Name", default: "Series" },
    id: { type: "string", label: "Id", default: "", bindable: false, help: "Fixed: its Update node and events find the series by it. It is also the value of the split field it styles (e.g. \"Floor 3\")." },
    visible: { type: "boolean", label: "Visible", default: true },
    legend: { type: "boolean", label: "In the legend", default: true },

    live: { type: "tag", access: "read", section: "Data", label: "Live value", help: "A tag or a variable: every new value is one more point (a time x: its time = now). A {x, y} or a list of them is added as it is." },
    field: { type: "string", section: "Data", label: "Row field (y)", default: "", bindable: false, help: "Wide form: the field of each row this series takes. Empty: the series of that Id / name." },
    gapAfter: { type: "number", section: "Data", label: "Break the line after (ms without data)", default: 0, min: 0, step: 1000, help: "A time x: 0 = always connected. A longer silence draws a gap: a sensor offline is not a straight line." },

    mark: { type: "enum", section: "Mark", label: "Mark", default: "", options: opt([["", "The chart's default"]].concat(MARKS)) },
    axis: { type: "enum", section: "Mark", label: "Axis", default: "", options: axisOptions, help: "From the Axes list. In a stack, the stack's axis wins." },
    stack: { type: "enum", section: "Mark", label: "Stack", default: "", options: stackOptions, help: "From the Stacks list: the pile this series is in (the order of the series is the order of the pile)." },

    color: { type: "color", section: "Colour", label: "Colour", default: "", tokens: "colors", help: "A hex colour, or a theme token (◆). Empty: the next colour of the theme's chart palette." },
    opacity: { type: "number", section: "Colour", label: "Opacity", default: 1, min: 0, max: 1, step: 0.05 },

    curve: { type: "enum", section: "Line", label: "Curve", default: "", options: opt([["", "The chart's default"], ["linear", "Straight"], ["smooth", "Smooth (never overshoots)"]]) },
    width: { type: "number", section: "Line", label: "Width", default: "", min: 0.5, max: 12, step: 0.5, unit: "px", help: "Empty: the chart's line width." },
    dash: { type: "enum", section: "Line", label: "Dash", default: "solid", options: opt([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]) },
    fill: { type: "enum", section: "Line", label: "Fill under the line", default: "", options: opt([["", "The mark's default (an area: the chart's)"], ["none", "None"], ["gradient", "Gradient (fades to the axis)"], ["solid", "Solid"]]) },
    fillOpacity: { type: "number", section: "Line", label: "Fill opacity", default: "", min: 0, max: 1, step: 0.05, help: "Empty: the chart's." },

    points: { type: "enum", section: "Points", label: "Markers", default: "", options: opt([["", "The chart's default"], ["on", "Show"], ["off", "Hide"]]) },
    pointShape: { type: "enum", section: "Points", label: "Shape", default: "circle", options: opt([["circle", "Circle"], ["square", "Square"], ["diamond", "Diamond"], ["triangle", "Triangle"]]) },
    pointSize: { type: "number", section: "Points", label: "Size", default: "", min: 1, max: 20, unit: "px", help: "Empty: the chart's." },

    radius: { type: "number", section: "Columns", label: "Corner radius", default: "", min: 0, max: 20, unit: "px", help: "Empty: the chart's." },
    labels: { type: "enum", section: "Data labels", label: "Data labels", default: "", options: opt([["", "The chart's default"], ["on", "Show"], ["off", "Hide"]]) },

    unit: { type: "string", section: "Numbers", label: "Unit (kWh, °C, %)", default: "", help: "In the tooltip, the legend and the data labels." },
    notation: { type: "enum", section: "Numbers", label: "Notation", default: "standard", options: opt(NOTATIONS) },
    decimals: { type: "enum", section: "Numbers", label: "Decimals", default: "auto", options: opt(DECIMALS) }
};

function seriesDefaults() {
    const o = {};
    Object.keys(SERIES_FIELDS).forEach((k) => { o[k] = SERIES_FIELDS[k].default; });
    delete o.live;
    return o;
}

const STACK_FIELDS = {
    name: { type: "string", label: "Name", default: "Stack" },
    id: { type: "string", label: "Id", default: "", bindable: false, help: "Fixed: a series says which stack it is in by this." },
    mode: { type: "enum", label: "Mode", default: "stacked", options: opt(STACKINGS), help: "Side by side: each series its own column. Overlapping: all from the base." },
    axis: { type: "enum", label: "On the axis", default: "", options: axisOptions, help: "Every series of the stack is on this axis: a sum is only meaningful on one scale." },
    placement: { type: "enum", label: "Place", default: "beside", options: opt([["beside", "Beside the other stacks"], ["overlay", "Over the others (a narrower column, a target)"]]) },
    width: { type: "number", label: "Width", default: 100, min: 10, max: 100, step: 5, unit: "%", help: "Of its place. A target column over an actual one: 50 %." },
    includeRest: { type: "boolean", label: "Also every other series of the data", default: false, help: "The series that come from the split field and are listed nowhere (no Stack of their own) join this stack: the floors of a building, however many." }
};

const AXIS_FIELDS = {
    id: { type: "string", label: "Id", default: "", bindable: false, help: "Fixed: a series, a stack and a reference line pick the axis by it." },
    side: { type: "enum", label: "Side", default: "left", options: opt([["left", "Left"], ["right", "Right"]]), help: "Several on one side stand side by side, the first nearest to the plot." },
    show: { type: "boolean", label: "Show", default: true },
    title: { type: "string", label: "Title", default: "" },
    scale: { type: "enum", label: "Scale", default: "linear", options: opt([["linear", "Linear"], ["log", "Logarithmic"]]) },
    softMin: { type: "number", section: "Range", label: "Soft min (grows with the data)", default: "" },
    softMax: { type: "number", section: "Range", label: "Soft max (grows with the data)", default: "" },
    min: { type: "number", section: "Range", label: "Hard min (fixed, clips)", default: "" },
    max: { type: "number", section: "Range", label: "Hard max (fixed, clips)", default: "" },
    notation: { type: "enum", section: "Labels", label: "Notation", default: "standard", options: opt(NOTATIONS) },
    decimals: { type: "enum", section: "Labels", label: "Decimals", default: "auto", options: opt(DECIMALS) },
    grid: { type: "boolean", section: "Labels", label: "Gridlines", default: false },
    labelColor: { type: "color", section: "Labels", label: "Label colour", default: "", tokens: "colors", help: "Empty: the theme's muted text." }
};

const REFERENCE_FIELDS = {
    kind: { type: "enum", label: "Kind", default: "line", options: opt([["line", "Line (a limit, a target)"], ["band", "Band (from – to)"]]) },
    axis: { type: "enum", label: "On the axis", default: "", options: axisOptions },
    value: { type: "number", label: "Value (from)", default: 0 },
    to: { type: "number", label: "To", default: "", visibleWhen: (r) => r.kind === "band" },
    label: { type: "string", label: "Label", default: "" },
    color: { type: "color", label: "Colour", default: "", tokens: "colors", help: "Empty: the error colour of the theme." },
    dash: { type: "enum", label: "Dash", default: "dashed", options: opt([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]), visibleWhen: (r) => r.kind !== "band" },
    width: { type: "number", label: "Width", default: 1.5, min: 0.5, max: 8, step: 0.5, unit: "px", visibleWhen: (r) => r.kind !== "band" },
    opacity: { type: "number", label: "Opacity", default: "", min: 0, max: 1, step: 0.05, help: "Empty: 1 for a line, 0.12 for a band." }
};

export const cartesianChart = defineUI({
    ...chartCommon,
    id: PREFIX + "chart",
    label: "Chart",
    icon: "fa fa-bar-chart",
    size: { w: 600, h: 320 },
    help: "Layers: each series is a column, line, area or points chart of its own, on any axis, stacked in the stacks you make. A time x keeps every point (millions) with the time ruler, zoom and Live. Data from rows (a field to split into series), a tag, or per series from Logic.",
    version: 1,

    groups: ["Data", "Series", "Stacks", "Axes", "Visual", "Title", "Legend", "X axis", "Time axis", "Data labels", "Tooltip", "Reference lines", "Zoom & pan", "Annotations", "General", "Export"],

    properties: {
        // ---- Data: the fields well of Power BI ----
        rows: { type: "json", group: "Data", label: "Rows", default: [], help: "An array of objects, e.g. from a message ({msg.payload}) or a variable: [{ \"floor\": \"F3\", \"hour\": \"10:00\", \"kwh\": 41.2 }]. Logic's Set rows does the same." },
        xField: { type: "string", group: "Data", label: "X field", default: "x", bindable: false, help: "The field of a row that is the x: a category, a number or a time (epoch ms / seconds, an ISO text)." },
        yField: { type: "string", group: "Data", label: "Y field(s)", default: "y", bindable: false, help: "The field with the value. Several, comma separated (kwh_f1, kwh_f2): one series each (wide form)." },
        splitField: { type: "string", group: "Data", label: "Split into series by", default: "", bindable: false, help: "The field whose every value is a series (the floor, the machine, the room). Needs one Y field. Style one by adding a series with its value as Id." },
        xType: { type: "enum", group: "Data", label: "X is", default: "auto", options: opt([["auto", "Detected"], ["category", "A category (words)"], ["number", "A number"], ["time", "A time"]]) },
        aggregate: { type: "enum", group: "Data", label: "Rows with the same x and series", default: "sum", options: opt([["sum", "Add up"], ["avg", "Average"], ["last", "The last"], ["min", "Minimum"], ["max", "Maximum"], ["count", "Count"]]), visibleWhen: (p) => p.xType !== "time" },
        categoryOrder: { type: "enum", group: "Data", label: "Category order", default: "data", options: opt([["data", "As they come"], ["asc", "A – Z"], ["desc", "Z – A"]]), visibleWhen: (p) => p.xType !== "number" && p.xType !== "time" },
        maxCategories: { type: "number", group: "Data", label: "Most categories", default: 2000, min: 1, max: 100000, step: 100, visibleWhen: (p) => p.xType !== "time" },
        maxPoints: { type: "number", group: "Data", label: "Points kept per series", default: 100000, min: 50, max: 2000000, step: 5000, visibleWhen: timeish, help: "A time x: a ring, the oldest go past it. 16 bytes a point (1 000 000 = 16 MB). A bigger load of rows keeps all its points (to 2 000 000 a series)." },
        bucketBy: { type: "enum", group: "Data", label: "Many points in one column", default: "avg", options: opt([["avg", "Average"], ["sum", "Add up"], ["min", "Minimum"], ["max", "Maximum"], ["last", "The last"]]), visibleWhen: timeish, help: "A time x: columns and stacks group the points the screen cannot show apart into one column of the width it allows." },
        ...onTime({ timeWindow: timeProps().timeWindow }),
        ...onTime(refreshProps("data")),

        // ---- Series: the layers ----
        series: {
            type: "list", group: "Series", label: "Series", noun: "series", default: [],
            help: "Optional: one per series you want to style, name, put on an axis or in a stack, or drive from Logic. Series that come from the data and are not listed take the chart's defaults and the palette. Each has its own Update node and events (Events tab).",
            item: {
                fields: SERIES_FIELDS, noun: "series", target: true,
                create: (items) => {
                    let n = items.length + 1;
                    const ids = new Set(items.map((x) => x && x.id));
                    while (ids.has("s" + n)) n++;
                    return Object.assign(seriesDefaults(), { id: "s" + n, name: "Series " + n });
                },
                actions: {
                    setData: { label: "Set data", help: "Replaces the series' data: values in the order of the categories, an object { category: value }, or [{ x, y }] (a time x: x in ms).", example: "[12, 18, 9]  or  { \"Floor 1\": 12, \"Floor 2\": 18 }  or  [{ \"x\": 1727852400000, \"y\": 21.5 }]" },
                    setPoint: { label: "Set a point", help: "Sets the value at one category / x.", params: { x: "string", y: "number" }, example: "{ \"x\": \"Floor 2\", \"y\": 18 }" },
                    appendPoint: { label: "Append a point", help: "Adds a point (a new category / x; a time x: 21.5 alone is a point now).", params: { x: "string", y: "number" }, example: "{ \"x\": 1727852400000, \"y\": 21.5 }  or  [{x, y}, …]  or  21.5" },
                    clear: { label: "Clear", help: "Empties this series." },
                    show: { label: "Show", help: "Shows this series." },
                    hide: { label: "Hide", help: "Hides this series; its data is kept." }
                },
                events: {
                    pointClick: { label: "On Point Click", payload: { x: "string", y: "number", index: "number" }, help: "A click on one of its columns / points: the category or x, and the value." }
                }
            }
        },

        // ---- Stacks: the piles ----
        stacks: {
            type: "list", group: "Stacks", label: "Stacks", noun: "stack", default: [],
            help: "A stack gathers series: add one, then pick it in each series' Stack field. Its mode (stacked, 100 %, side by side, overlapping) and its axis belong to the stack; the order of the series is the order of the pile (the first at the bottom). Any marks may stack together: a column is a rectangle from its base to its top, an area a band, a line the total so far.",
            item: {
                fields: STACK_FIELDS, noun: "stack",
                create: (items) => {
                    let n = items.length + 1;
                    const ids = new Set(items.map((x) => x && x.id));
                    while (ids.has("k" + n)) n++;
                    return { id: "k" + n, name: "Stack " + n, mode: "stacked", axis: "", placement: "beside", width: 100, includeRest: false };
                }
            }
        },

        // ---- Axes ----
        axes: {
            type: "list", group: "Axes", label: "Axes", noun: "axis", default: DEFAULT_AXES.map((a) => Object.assign({}, a)),
            help: "As many as you need, left or right. A series, a stack or a reference line picks one by its Id. The right axis is drawn when a series is on it.",
            item: {
                fields: AXIS_FIELDS, noun: "axis",
                create: (items) => {
                    let n = items.length + 1;
                    const ids = new Set(items.map((x) => x && x.id));
                    while (ids.has("y" + n)) n++;
                    return { id: "y" + n, side: "right", show: true, title: "", scale: "linear", grid: false };
                }
            }
        },

        // ---- Visual: the defaults of every series ----
        mark: { type: "enum", group: "Visual", label: "Default mark", default: "column", options: opt(MARKS), help: "What a series is drawn as unless it says otherwise: a mix is a combo chart." },
        stacking: { type: "enum", group: "Visual", label: "Series in no stack", default: "clustered", options: opt(STACKINGS), help: "What columns and areas that are in no Stack do: side by side, or one pile (a quick stacked chart without making a Stack)." },
        orientation: { type: "enum", group: "Visual", label: "Direction", default: "vertical", options: opt([["vertical", "Vertical (columns)"], ["horizontal", "Horizontal (bars; columns only)"]]), help: "Horizontal: a category or number x, the first axis only." },
        curve: { type: "enum", group: "Visual", section: "Lines", label: "Curve", default: "smooth", options: opt([["smooth", "Smooth (never overshoots)"], ["linear", "Straight"]]), help: "A monotone curve: smooth, and it never dips below a 0 or above a peak the data does not have." },
        lineWidth: { type: "number", group: "Visual", section: "Lines", label: "Line width", default: 2, min: 0.5, max: 12, step: 0.5, unit: "px" },
        areaFill: { type: "enum", group: "Visual", section: "Lines", label: "Area fill", default: "gradient", options: opt([["gradient", "Gradient (fades to the axis)"], ["solid", "Solid"], ["none", "None (a line)"]]) },
        fillOpacity: { type: "number", group: "Visual", section: "Lines", label: "Fill opacity", default: 0.3, min: 0, max: 1, step: 0.05 },
        markers: { type: "boolean", group: "Visual", section: "Points", label: "Markers on lines", default: false },
        pointSize: { type: "number", group: "Visual", section: "Points", label: "Marker size", default: 4, min: 1, max: 20, unit: "px" },
        gap: { type: "number", group: "Visual", section: "Columns", label: "Space between categories", default: 30, min: 0, max: 90, step: 5, unit: "%" },
        barGap: { type: "number", group: "Visual", section: "Columns", label: "Space between columns", default: 2, min: 0, max: 20, step: 1, unit: "px" },
        maxBarWidth: { type: "number", group: "Visual", section: "Columns", label: "Widest column", default: 0, min: 0, max: 400, step: 5, unit: "px", help: "0 = no limit." },
        radius: { type: "number", group: "Visual", section: "Columns", label: "Corner radius", default: 2, min: 0, max: 20, unit: "px" },

        // ---- Title ----
        title: { type: "string", group: "Title", label: "Title", default: "" },
        subtitle: { type: "string", group: "Title", label: "Subtitle", default: "" },
        titleAlign: { type: "enum", group: "Title", label: "Alignment", default: "left", options: opt([["left", "Left"], ["center", "Centre"], ["right", "Right"]]) },
        titleSize: { type: "number", group: "Title", label: "Title size", default: 14, min: 8, max: 40, unit: "px" },

        // ---- Legend ----
        legend: { type: "enum", group: "Legend", label: "Position", default: "bottom", options: opt(LEGEND_AT) },
        legendValue: { type: "enum", group: "Legend", label: "Value next to the name", default: "none", options: opt([["none", "None"], ["last", "Last"], ["sum", "Total"], ["avg", "Average"], ["min", "Minimum"], ["max", "Maximum"]]), visibleWhen: (p) => p.legend !== "none" },
        legendSize: { type: "number", group: "Legend", label: "Text size", default: 12, min: 8, max: 24, unit: "px", visibleWhen: (p) => p.legend !== "none" },

        // ---- X axis ----
        xShow: { type: "boolean", group: "X axis", label: "Show the X axis", default: true },
        xTitle: { type: "string", group: "X axis", label: "Title", default: "", visibleWhen: (p) => p.xShow !== false },
        xGrid: { type: "boolean", group: "X axis", section: "Labels", label: "Gridlines", default: false, visibleWhen: (p) => p.xShow !== false },
        xLabelRotate: { type: "enum", group: "X axis", section: "Labels", label: "Label angle", default: "auto", options: opt([["auto", "Automatic"], ["0", "Horizontal"], ["45", "45°"], ["90", "Vertical"]]), visibleWhen: (p) => p.xShow !== false && p.xType !== "time" },
        xLabelColor: { type: "color", group: "X axis", section: "Labels", label: "Label colour", default: "", tokens: "colors", visibleWhen: (p) => p.xShow !== false },
        ...onTime(Object.fromEntries(Object.entries(timeProps()).filter(([k]) => k !== "timeWindow"))),

        // ---- Data labels ----
        labels: { type: "boolean", group: "Data labels", label: "Data labels", default: false },
        labelPos: { type: "enum", group: "Data labels", label: "Position", default: "auto", options: opt([["auto", "Automatic"], ["outside", "Outside end"], ["inside", "Inside end"], ["center", "Centre"]]), visibleWhen: (p) => p.labels },
        labelSize: { type: "number", group: "Data labels", label: "Size", default: 11, min: 8, max: 24, unit: "px", visibleWhen: (p) => p.labels },
        labelColor: { type: "color", group: "Data labels", label: "Colour", default: "", tokens: "colors", help: "Empty: the text colour (white on a dark column).", visibleWhen: (p) => p.labels },

        // ---- Tooltip ----
        tooltipShows: { type: "enum", group: "Tooltip", label: "Shows", default: "shared", options: opt([["shared", "Every series at that category / x"], ["single", "Only the one under the cursor"], ["off", "Nothing"]]) },
        crosshair: { type: "enum", group: "Tooltip", label: "Highlight", default: "band", options: opt([["band", "A band behind the column"], ["line", "A dashed line"], ["none", "None"]]), visibleWhen: (p) => p.tooltipShows !== "off" },

        // ---- Reference lines ----
        references: {
            type: "list", group: "Reference lines", label: "Reference lines and bands", noun: "reference", default: [],
            help: "A limit, a target, or a band (from – to) on an axis.", item: { fields: REFERENCE_FIELDS, noun: "reference" }
        },

        // ---- Zoom & pan, Annotations (a time x) ----
        ...onTime(zoomProps()),
        ...onTime(annotationProps()),

        // ---- General: the panel ----
        background: { type: "color", group: "General", label: "Background", default: "", tokens: "colors", help: "Empty: the theme's panel." },
        border: { type: "boolean", group: "General", label: "Border", default: true },
        textColor: { type: "color", group: "General", label: "Text colour", default: "", tokens: "colors", help: "Empty: the theme's text." },
        fontSize: { type: "number", group: "General", label: "Axis text size", default: 11, min: 8, max: 24, unit: "px" },
        emptyText: { type: "string", group: "General", label: "Text when there is no data", default: "No data to display" },

        // ---- Export ----
        exportButton: { type: "boolean", group: "Export", label: "Export menu on the chart (⋮)", default: true },
        exportCsv: { type: "boolean", group: "Export", label: "Menu: CSV", default: true, visibleWhen: (p) => p.exportButton !== false },
        exportXlsx: { type: "boolean", group: "Export", label: "Menu: Excel", default: true, visibleWhen: (p) => p.exportButton !== false },
        exportPng: { type: "boolean", group: "Export", label: "Menu: PNG", default: true, visibleWhen: (p) => p.exportButton !== false },
        exportRange: { type: "enum", group: "Export", label: "A time x exports", default: "visible", options: opt([["visible", "What is shown (zoom applied)"], ["all", "Everything it holds"]]), visibleWhen: timeish },
        exportTitle: { type: "string", group: "Export", label: "Title", default: "", help: "{title} in the file name. Empty: the chart's title." },
        exportFilename: { type: "string", group: "Export", label: "File name expression", default: "", bindable: false, help: "Variables: {title}, {date}, {time}, {year}, {month}, {day}, {format}." }
    },

    parts: { chart: part("Chart container", "chart"), legend: part("Legend", "legend") },

    events: {
        ...timeEvents(),
        hover: { label: "On Hover", payload: { x: "string", values: "object" }, help: "The category / x (a time: ms) under the cursor and each series' value there." },
        legendToggle: { label: "On Series Toggle", payload: { series: "string", visible: "boolean" }, help: "The viewer showed / hid a series in the legend." }
    },

    actions: {
        ...timeActions(),
        setRows: { label: "Set rows", help: "Replaces the data with rows: an array of objects, mapped by the Data fields (x, y, split).", example: "[{ \"floor\": \"F1\", \"hour\": \"10:00\", \"kwh\": 12 }, …]" },
        appendRows: { label: "Append rows", help: "Adds rows to the data (a time x: in order or late; the same category and series are aggregated).", example: "[{ \"floor\": \"F1\", \"hour\": \"11:00\", \"kwh\": 14 }]" },
        clearAll: { label: "Clear every series" }
    },

    view: class extends TimeChartElement {
        static styles = [...TimeChartElement.styles, css`
            .c-head { flex: 0 0 auto; padding: 10px 14px 0; min-width: 0; }
            .c-title { font-size: var(--ct-size, 14px); font-weight: 600; color: var(--fg); line-height: 1.3; }
            .c-sub { font-size: 12px; color: var(--fg-muted); margin-top: 2px; }
            .c-main { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: row; min-width: 0; }
            .c-main > .plot { flex: 1 1 auto; min-width: 0; }
            .legend { padding-left: 14px; }
            .legend.v { padding: 8px 10px; max-height: none; flex-direction: column; align-items: stretch; flex-wrap: nowrap; overflow: auto; max-width: 40%; }
            .legend.inside { position: absolute; z-index: 4; padding: 4px 8px; background: var(--panel); border: 1px solid var(--bd); border-radius: var(--r, 4px); max-width: 60%; }
            .legend.inside.tl { left: 10px; top: 8px; } .legend.inside.tr { right: 36px; top: 8px; }
            .legend.inside.bl { left: 10px; bottom: 8px; } .legend.inside.br { right: 10px; bottom: 8px; }
            .lg-item { font-size: var(--lg-size, 12px); }
            .lg-item .lg-swatch.sw-sq { width: 10px; height: 10px; border-radius: 2px; }
            .lg-item .lg-swatch.sw-dot { width: 9px; height: 9px; border-radius: 50%; }
            .lg-item.off { opacity: 0.45; }
            .empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--fg-muted); font-size: 12px; pointer-events: none; }
        `];

        // ---- state. Declared HERE on purpose: the host calls propsChanged() while the base constructor runs, and the field
        // initialisers run after it: anything the first call set and is not declared would survive them while the declared
        // fields are reset
        _canon = [];            // a category / number x: the data, as canonical rows { x, y, s }
        _frame = { xType: "category", cats: [], series: [] };
        _tser = new Map();      // a time x: key -> { name, buf (Float64 ring) }
        _xt = "category";       // the x of the data now: category | number | time
        _sig = "";
        _hidden = new Set();
        _geo = null;
        _hoverAt = null;        // category / number x: { i, key } under the cursor
        _sl = null;
        _aligned = null;
        _demoDone = false;
        _lastHover = 0;
        _lastLive = new Map();
        decimator = new M4Decimator(2048);
        _navDecimator = new M4Decimator(1024);
        _mm = { min: 0, max: 0, minAt: 0, maxAt: 0 };
        _statCache = new Map();

        mounted() { if (this.refreshMs && this.refreshMs()) this._startRefresh(); }

        _time() { return this._xt === "time"; }

        // ---- data ---------------------------------------------------------------------------------
        propsChanged() { this.prepareData(); }

        _map() {
            const ys = String(this.p.yField || "y").split(",").map((s) => s.trim()).filter(Boolean);
            return { x: this.p.xField || "x", y: ys.length > 1 ? ys : (ys[0] || "y"), split: this.p.splitField || "" };
        }

        // rows as the user maps them -> canonical rows { x, y, s }
        _normalize(rows) {
            const m = this._map(), ys = Array.isArray(m.y) ? m.y : [m.y], out = [];
            for (const r of Array.isArray(rows) ? rows : []) {
                if (!r || typeof r !== "object") continue;
                const x = r[m.x];
                if (m.split && ys.length === 1) out.push({ x, y: r[ys[0]], s: r[m.split] === undefined || r[m.split] === null ? "" : String(r[m.split]) });
                else for (const yk of ys) out.push({ x, y: r[yk], s: yk });
            }
            return out;
        }

        // a cheap fingerprint of the rows prop: the host hands a new array object at every change of any prop, with the same content
        _rowsPrint(rows) {
            if (!Array.isArray(rows) || !rows.length) return "";
            let a = "", z = "";
            try { a = JSON.stringify(rows[0]); z = JSON.stringify(rows[rows.length - 1]); } catch (e) { /* not serialisable */ }
            return rows.length + "|" + a + "|" + z;
        }

        _hasAny() { return this._canon.length > 0 || Array.from(this._tser.values()).some((t) => t.buf.count > 0); }

        _typeOf(rows) {
            if (this.p.xType && this.p.xType !== "auto") return this.p.xType;
            const m = this._map(), sample = [];
            for (let i = 0; i < rows.length && sample.length < 200; i++) if (rows[i] && typeof rows[i] === "object") sample.push(rows[i][m.x]);
            return detectXType(sample);
        }

        _resetData() { this._canon = []; this._tser.clear(); this._frame = { xType: "category", cats: [], series: [] }; this._statCache.clear(); }

        // rows into the data. replace: they ARE the data (the x type is read again); else added to it
        _load(rows, replace) {
            rows = Array.isArray(rows) ? rows : [];
            const had = this._hasAny();
            const xt = replace || !had ? this._typeOf(rows) : this._xt;
            if (replace || xt !== this._xt) this._resetData();
            this._xt = xt;
            if (xt === "time") this._ingestTime(rows);
            else this._canon = this._canon.concat(this._normalize(rows));
            this._rebuild();
        }

        _tbuf(key, name, need) {
            let t = this._tser.get(key);
            const cap = Math.min(2000000, Math.max(50, numOr(this.p.maxPoints, 100000), need || 0));
            if (!t) { t = { name: name || key, buf: new TimeSeriesRingBuffer(cap) }; this._tser.set(key, t); }
            else if (t.buf.capacity < cap) t.buf.setCapacity(cap);
            return t;
        }

        // a time x: every row's point straight into its series' Float64 ring (no objects kept)
        _ingestTime(rows) {
            const m = this._map(), ys = Array.isArray(m.y) ? m.y : [m.y];
            const keyOf = (r, yk) => (m.split && ys.length === 1 ? (r[m.split] === undefined || r[m.split] === null ? "" : String(r[m.split])) : yk);
            const count = new Map();
            for (const r of rows) { if (!r || typeof r !== "object") continue; for (const yk of ys) { const k = keyOf(r, yk); count.set(k, (count.get(k) || 0) + 1); } }
            const bufs = new Map();
            count.forEach((n, k) => bufs.set(k, this._tbuf(k, k, n + (this._tser.get(k) ? this._tser.get(k).buf.count : 0)).buf));
            for (const r of rows) {
                if (!r || typeof r !== "object") continue;
                const x = toMs(r[m.x]);
                if (!Number.isFinite(x)) continue;
                for (const yk of ys) {
                    const v = r[yk], y = typeof v === "number" ? v : v === null || v === undefined || v === "" ? NaN : Number(v);
                    if (Number.isFinite(y)) bufs.get(keyOf(r, yk)).push(x, y);
                }
            }
        }

        prepareData() {
            const rows = this.p.rows;
            const print = this._rowsPrint(rows) + "|" + [this.p.xField, this.p.yField, this.p.splitField, this.p.xType].join("|");
            if (print !== this._sig) {
                const had = this._sig !== "" && this._sig !== undefined && !/^\|/.test(this._sig);
                this._sig = print;
                // a typed / bound list of rows is the data: a change of it replaces what a Set rows from Logic put in; an empty one that
                // stays empty touches nothing (the editor's sample data, rows from Logic)
                if (Array.isArray(rows) && (rows.length || had)) this._load(rows, true);
            }
            this._liveValues();
            this._ensureDemo();
            this._sl = null;
            if (this._time()) { this.scheduleDraw(); this.requestUpdate(); } else this._rebuild();
        }

        // a series' live value (a tag): every new value is a point
        _liveValues() {
            for (const it of Array.isArray(this.p.series) ? this.p.series : []) {
                if (!it || typeof it !== "object") continue;
                const v = it.live, key = String(it.id || it.name || "");
                if (v === undefined || v === null || v === "" || v === "???" || (typeof v === "object" && !Array.isArray(v) && v.$bind) || v === this._lastLive.get(key)) continue;
                this._lastLive.set(key, v);
                const pts = Array.isArray(v) ? v : [v];
                if (!this._hasAny() || this._time()) { this._xt = "time"; this._pushTime(key, it.name, pts); }
                else this.appendPoint(pts, { list: "series", id: key });
            }
        }

        // a time series' points: {x, y} (x in ms / seconds / an ISO text), or a number (now)
        _pushTime(key, name, pts) {
            const t = this._tbuf(key, name), m = this._map();
            let added = 0;
            for (const p of pts) {
                if (p === null || p === undefined) continue;
                let x, y;
                if (typeof p === "object") { x = toMs(p.x !== undefined ? p.x : p[m.x]); y = Number(p.y !== undefined ? p.y : p.value !== undefined ? p.value : p[Array.isArray(m.y) ? m.y[0] : m.y]); }
                else { x = Date.now(); y = Number(p); }
                if (Number.isFinite(x) && Number.isFinite(y) && t.buf.push(x, y)) added++;
            }
            if (added) { if (!this.isEditor) this._tickClock(); this._sl = null; this.scheduleDraw(); this.requestUpdate(); }
            return added;
        }

        // the editor shows sample data on an empty chart (it is known to be the editor only once the host has set it up: also checked at draw)
        _ensureDemo() {
            if (this.isEditor && !this._hasAny() && !this._demoDone && !(Array.isArray(this.p.rows) && this.p.rows.length)) {
                this._demoDone = true;
                if (this.p.xType === "time") {
                    this._xt = "time";
                    const now = Date.now(), n = 240;
                    ["Series 1", "Series 2"].forEach((name, si) => { const t = this._tbuf(name, name, n); for (let k = 0; k < n; k++) t.buf.push(now - (n - k) * 30000, Math.round((50 + si * 15 + 18 * Math.sin(k / 18 + si * 1.3) + 6 * Math.sin(k / 5 + si)) * 10) / 10); });
                } else { this._xt = "category"; this._canon = this._demoRows(); }
                return true;
            }
            return false;
        }

        _demoRows() {
            const rows = [], cats = ["Floor 1", "Floor 2", "Floor 3", "Floor 4"], v = [[42, 55, 38, 61], [30, 41, 47, 39]];
            ["Lighting", "HVAC"].forEach((name, si) => cats.forEach((c, i) => rows.push({ x: c, y: v[si][i], s: name })));
            return rows;
        }

        _rebuild() {
            this._frame = this._time() ? { xType: "time", cats: [], series: [] }
                : buildFrame(this._canon, { x: "x", y: "y", split: "s" }, { xType: this.p.xType, aggregate: this.p.aggregate, order: this.p.categoryOrder, maxCategories: this.p.maxCategories });
            this._sl = null;
            this._aligned = null;
            this.requestUpdate();
            this.scheduleDraw();
        }

        // every series on the same x positions: category i, or the sorted union of the x values (a number)
        _align() {
            if (this._aligned) return this._aligned;
            const f = this._frame;
            let xs;
            if (f.xType === "category") xs = Float64Array.from(f.cats, (_, i) => i);
            else {
                const set = new Set();
                f.series.forEach((s) => { for (let i = 0; i < s.x.length; i++) set.add(s.x[i]); });
                xs = Float64Array.from(Array.from(set).sort((a, b) => a - b));
            }
            const at = new Map();
            xs.forEach((v, i) => at.set(v, i));
            const cols = new Map();
            f.series.forEach((s) => {
                if (f.xType === "category") cols.set(s.key, s.y);
                else { const y = new Float64Array(xs.length).fill(NaN); for (let i = 0; i < s.x.length; i++) y[at.get(s.x[i])] = s.y[i]; cols.set(s.key, y); }
            });
            return (this._aligned = { xs, cols });
        }

        // ---- the series, the axes, the stacks ------------------------------------------------------
        seriesList() {
            if (this._sl) return this._sl;
            const items = (Array.isArray(this.p.series) ? this.p.series : []).filter((s) => s && typeof s === "object");
            const time = this._time();
            const data = time ? Array.from(this._tser.entries()).map(([key, t]) => ({ key, name: t.name, t })) : this._frame.series;
            const claimed = new Set(), out = [];
            const resolve = (o, d, i, auto) => {
                const x = Object.assign({}, seriesDefaults(), o);
                x._i = i; x._key = String(x.id || x.name || "#" + i); x._data = d || null; x._auto = !!auto;
                return x;
            };
            items.forEach((it) => {
                const hit = data.filter((d) => d.key === it.id || d.key === it.name || (it.field && d.key === it.field))[0] || null;
                if (hit) claimed.add(hit.key);
                out.push(resolve(it, hit, out.length, false));
            });
            data.forEach((d) => { if (!claimed.has(d.key)) out.push(resolve({ id: d.key, name: d.name }, d, out.length, true)); });
            return (this._sl = out);
        }

        findSeries(ref) {
            const list = this.seriesList();
            if (ref && typeof ref === "object" && ref.id !== undefined) ref = ref.id;
            if (ref === undefined || ref === null || ref === "") return list[0] || null;
            return list.find((s) => s.id && s.id === String(ref)) || list.find((s) => s.name === String(ref)) || (/^\d+$/.test(String(ref)) ? list[Number(ref)] : null) || null;
        }

        _target(s) { return { list: "series", id: s.id || s._key }; }

        // the axes the user made (or the two defaults), by id
        _axisDefs() {
            const raw = Array.isArray(this.p.axes) && this.p.axes.some((a) => a && a.id) ? this.p.axes : DEFAULT_AXES;
            return raw.filter((a) => a && typeof a === "object" && a.id).map((a) => ({ id: String(a.id), side: a.side === "right" ? "right" : "left", show: a.show !== false, title: a.title || "", scale: a.scale === "log" ? "log" : "linear",
                softMin: numOr(a.softMin, NaN), softMax: numOr(a.softMax, NaN), min: numOr(a.min, NaN), max: numOr(a.max, NaN), notation: a.notation || "standard", decimals: a.decimals || "auto", grid: !!a.grid, labelColor: a.labelColor }));
        }

        // the axis a series (or stack) names: by id; "left" / "right" (older / quick) the first axis on that side; empty: the first
        _axisIdOf(name, defs) {
            defs = defs || this._axisDefs();
            if (name) {
                const byId = defs.filter((a) => a.id === name)[0];
                if (byId) return byId.id;
                const side = defs.filter((a) => a.side === name)[0];
                if (side) return side.id;
            }
            return defs[0] ? defs[0].id : "y";
        }

        _stackDefs() {
            const m = new Map();
            (Array.isArray(this.p.stacks) ? this.p.stacks : []).forEach((g) => {
                if (!g || typeof g !== "object" || !g.id) return;
                m.set(String(g.id), { id: String(g.id), name: g.name || g.id, mode: ["stacked", "percent", "clustered", "none"].indexOf(g.mode) !== -1 ? g.mode : "stacked", axis: g.axis || "", placement: g.placement === "overlay" ? "overlay" : "beside",
                    width: Math.max(0.1, Math.min(1, numOr(g.width, 100) / 100)), rest: !!g.includeRest });
            });
            return m;
        }

        // the stack a series is in: its own, else (a series from the data that is listed nowhere) the one that takes the rest, else none
        _stackOf(s, defs) {
            defs = defs || this._stackDefs();
            if (s.stack && defs.get(String(s.stack))) return defs.get(String(s.stack));
            if (!s.stack && s._auto) { for (const g of defs.values()) if (g.rest) return g; }
            return null;
        }

        _modeOf(s) { const g = this._stackOf(s); return g ? g.mode : (this.p.stacking || "clustered"); }

        // a colour as saved: a hex / rgb as it is, a {token:colors.…} as the theme's value now (the host resolves the props of the
        // chart itself, not the fields of the items inside a list)
        _tok(v) {
            if (typeof v !== "string") return "";
            const m = /^\s*\{token:([^}]+)\}\s*$/.exec(v);
            if (!m) return v.trim();
            const r = theme.token(m[1].trim());
            return typeof r === "string" ? r : "";
        }

        colorOf(s) {
            const own = s ? this._tok(s.color) : "";
            return own || this.seriesColor(s ? s._i : 0);
        }
        _markOf(s) { const m = s.mark || this.p.mark || "column"; return m === "bar" ? "column" : m; }
        _num(v, d) { return numOr(v, d); }
        _curveOf(s) { return s.curve || this.p.curve || "smooth"; }

        // does this series sit on the shared slots (columns; a member of a stacked / 100 % stack; everything on a category / number x)?
        _slotted(s) {
            if (!this._time()) return true;
            const mode = this._modeOf(s);
            return this._markOf(s) === "column" || mode === "stacked" || mode === "percent";
        }

        // a category / number series' values on the aligned x
        _col(s) {
            if (this._time()) return null;
            const a = this._align();
            return s._data ? a.cols.get(s._data.key) || null : null;
        }
        _buf(s) { return this._time() && s._data && s._data.t ? s._data.t.buf : null; }
        _has(s) { return this._time() ? !!(this._buf(s) && this._buf(s).count > 0) : !!this._col(s); }
        _visible() { return this.seriesList().filter((s) => s.visible !== false && !this._hidden.has(s._key) && this._has(s)); }

        // ---- actions ------------------------------------------------------------------------------
        setRows(params) {
            const rows = Array.isArray(params) ? params : params && Array.isArray(params.rows) ? params.rows : params && Array.isArray(params.payload) ? params.payload : null;
            if (rows) this._load(rows, true);
        }

        appendRows(params) {
            const rows = Array.isArray(params) ? params : params && Array.isArray(params.rows) ? params.rows : params && typeof params === "object" ? [params] : null;
            if (rows) this._load(rows, false);
        }

        clearAll() { this._resetData(); this._demoDone = true; this.viewRange = null; this.hover = null; this._rebuild(); }

        _own(s) { return s.id || s._key; }
        _dropSeries(key) { this._canon = this._canon.filter((r) => r.s !== key); this._tser.delete(key); }

        _looksTime(points) {
            const xs = points.map((p) => (p && typeof p === "object" ? (p.x !== undefined ? p.x : p.category) : undefined)).filter((v) => v !== undefined);
            return xs.length > 0 && detectXType(xs) === "time";
        }

        setData(params, target) {
            const s = this.findSeries(target); if (!s) return;
            const key = this._own(s);
            const v = params && !Array.isArray(params) && typeof params === "object" && params.data !== undefined ? params.data : params;
            if (Array.isArray(v) && (this._time() || (!this._hasAny() && this._looksTime(v)))) {
                if (!this._time()) { this._resetData(); this._xt = "time"; }
                this._tser.delete(key);
                this._pushTime(key, s.name, v);
                this._rebuild();
                return;
            }
            const rows = [];
            if (Array.isArray(v)) {
                v.forEach((p, i) => {
                    if (p && typeof p === "object") rows.push({ x: p.x !== undefined ? p.x : p.category !== undefined ? p.category : p.name, y: p.y !== undefined ? p.y : p.value, s: key });
                    else rows.push({ x: this._frame.cats[i] !== undefined ? this._frame.cats[i] : String(i + 1), y: p, s: key });
                });
            } else if (v && typeof v === "object") Object.keys(v).forEach((k) => rows.push({ x: k, y: v[k], s: key }));
            else return;
            if (this._time()) { this._resetData(); this._xt = "category"; }
            this._dropSeries(key);
            this._canon = this._canon.concat(rows);
            this._rebuild();
        }

        setPoint(params, target) {
            const s = this.findSeries(target); if (!s || !params || typeof params !== "object") return;
            const key = this._own(s), x = params.x !== undefined ? params.x : params.category !== undefined ? params.category : params.name;
            const y = params.y !== undefined ? params.y : params.value;
            if (this._time()) { this._pushTime(key, s.name, [{ x, y }]); return; }
            // in place: the category keeps its position (the order of the first appearance); a new x goes last
            let placed = false;
            this._canon = this._canon.reduce((out, r) => {
                if (r.s === key && String(r.x) === String(x)) { if (!placed) { out.push({ x, y, s: key }); placed = true; } return out; }
                out.push(r); return out;
            }, []);
            if (!placed) this._canon.push({ x, y, s: key });
            this._rebuild();
        }

        appendPoint(params, target) {
            const s = this.findSeries(target); if (!s) return;
            const key = this._own(s), pts = Array.isArray(params) ? params : [params];
            if (this._time() || (!this._hasAny() && (this._looksTime(pts) || (typeof params === "number" && this.p.xType === "time")))) {
                if (!this._time()) { this._resetData(); this._xt = "time"; }
                this._pushTime(key, s.name, pts);
                this._rebuild();
                return;
            }
            pts.forEach((p) => {
                if (p !== null && typeof p === "object") this._canon.push({ x: p.x !== undefined ? p.x : p.category !== undefined ? p.category : p.name, y: p.y !== undefined ? p.y : p.value, s: key });
                else if (Number.isFinite(Number(p))) this._canon.push({ x: String(this._frame.cats.length + 1), y: Number(p), s: key });
            });
            this._rebuild();
        }

        clear(params, target) { const s = this.findSeries(target); if (!s) return; this._dropSeries(this._own(s)); this._statCache.clear(); this._rebuild(); }
        show(params, target) { const s = this.findSeries(target); if (!s) return; this._hidden.delete(s._key); this.requestUpdate(); this.scheduleDraw(); }
        hide(params, target) { const s = this.findSeries(target); if (!s) return; this._hidden.add(s._key); this.requestUpdate(); this.scheduleDraw(); }

        // ---- numbers ------------------------------------------------------------------------------
        _spec(o) { return { notation: o.notation || "standard", decimals: o.decimals || "auto", separators: o.separators || "locale", thousands: o.thousands !== false }; }
        _fmt(v, s) { return formatValue(v, this._spec(s || {}), (s && s.unit) || ""); }
        _textColor() { return this._tok(this.p.textColor); }

        _xLabel(i) {
            const f = this._frame;
            if (f.xType === "category") return f.cats[i] === undefined ? "" : String(f.cats[i]);
            return formatValue(this._align().xs[i], { notation: "standard", decimals: "auto" }, "");
        }

        // ---- the legend ---------------------------------------------------------------------------
        // min / max / avg / sum / last of a series (a time x: from its ring; the min and max from the LOD)
        _statsOf(s) {
            const buf = this._buf(s);
            if (buf) {
                const c = this._statCache.get(s._key);
                const last = buf.count ? buf.getY(buf.count - 1) : NaN;
                if (c && c.count === buf.count && c.last === last && c.want === this.p.legendValue) return c;
                let sum = 0, mn = NaN, mx = NaN;
                if (buf.count) { const o = this._mm; buf.rangeMinMax(0, buf.count, o); mn = o.min; mx = o.max; }
                if (this.p.legendValue === "avg" || this.p.legendValue === "sum") for (let i = 0; i < buf.count; i++) sum += buf.getY(i);
                const st = { count: buf.count, want: this.p.legendValue, last, min: mn, max: mx, sum, avg: buf.count ? sum / buf.count : NaN, n: buf.count };
                this._statCache.set(s._key, st);
                return st;
            }
            const y = this._col(s);
            if (!y) return { n: 0 };
            let n = 0, sum = 0, last = NaN, mn = Infinity, mx = -Infinity;
            for (let i = 0; i < y.length; i++) { const v = y[i]; if (v === v) { n++; sum += v; last = v; if (v < mn) mn = v; if (v > mx) mx = v; } }
            return { n, sum, last, min: mn, max: mx, avg: n ? sum / n : NaN };
        }

        _legendValue(s) {
            const how = this.p.legendValue;
            if (!how || how === "none") return "";
            const st = this._statsOf(s);
            if (!st.n || !Number.isFinite(st[how])) return "";
            return this._fmt(st[how], s);
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
            this.emit("legendToggle", { series: s.id || s.name, visible: !this._hidden.has(s._key) });
            this._hoverAt = null; this.hover = null;
            this.requestUpdate();
            this.scheduleDraw();
        }

        // ---- TimeChartElement's hooks -------------------------------------------------------------
        _fullBounds() {
            if (!this._time()) return null;
            let minX = Infinity, maxX = -Infinity;
            for (const s of this._visible()) { const b = this._buf(s).getBounds(); if (!b) continue; if (b.minX < minX) minX = b.minX; if (b.maxX > maxX) maxX = b.maxX; }
            return Number.isFinite(minX) ? { minX, maxX } : null;
        }
        _hasData() { return this._visible().length > 0; }

        _pngLegend(span) {
            const how = this.p.legendValue;
            return span.list.filter((s) => s.legend !== false).map((s) => ({ color: this.colorOf(s), text: (s.name || s.id) + (how && how !== "none" ? "  " + this._legendValue(s) : "") }));
        }

        _exportSpan(range) {
            const list = this._visible(), fb = this._fullBounds();
            if (range === "visible" && this._scale) return { list, from: this._scale.vMinX, to: this._scale.vMaxX };
            return { list, from: fb ? fb.minX : 0, to: fb ? fb.maxX : 0 };
        }

        // the miniature of the navigator: the series, small
        _navTraces(ctx, g, list) {
            const { y, w, h } = g;
            for (const s of list) {
                const ln = this._decimate(this._navDecimator, s, g.full.minX, g.full.maxX, w / 2);
                if (!ln || !ln.n) continue;
                let lo = Infinity, hi = -Infinity;
                for (let i = 0; i < ln.n; i++) { if (ln.y[i] < lo) lo = ln.y[i]; if (ln.y[i] > hi) hi = ln.y[i]; }
                const r = hi - lo || 1;
                ctx.beginPath();
                ctx.strokeStyle = this.hexToRgba(this.colorOf(s), 0.8);
                ctx.lineWidth = 1;
                for (let i = 0; i < ln.n; i++) { const sx = g.toX(ln.x[i]), sy = y + h - 3 - ((ln.y[i] - lo) / r) * (h - 6); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }
                ctx.stroke();
            }
        }

        // a time series in the time shown, at pixel accuracy: { x, y, n } (M4: the first, last, min and max of every pixel column)
        _decimate(dec, s, vMinX, vMaxX, w) {
            const buf = this._buf(s);
            if (!buf || !buf.count) return null;
            const i0 = Math.max(0, lowerBoundRing(buf, vMinX) - 1), i1 = Math.min(buf.count, upperBoundRing(buf, vMaxX) + 1);
            const n = dec.decimate(buf, i0, i1, Math.max(1, Math.floor(w)), vMinX, vMaxX);
            const x = new Float64Array(n), y = new Float64Array(n);
            for (let i = 0; i < n; i++) { x[i] = dec.outX[i]; y[i] = dec.outY[i]; }
            return { x, y, n };
        }

        // the time shown cut into columns of the width the screen allows: the points of every slotted series grouped per column
        // (or, when they are few, a column at each x they have). -> { xs, width, cols: Map(key -> Float64Array), n }
        _timeSlots(list, dom, estW) {
            const mine = list.filter((s) => this._slotted(s));
            if (!mine.length) return { xs: new Float64Array(0), width: 1, cols: new Map(), n: 0 };
            const maxCols = Math.max(8, Math.floor(estW / 6));
            const win = mine.map((s) => { const b = this._buf(s); return { s, b, i0: Math.max(0, lowerBoundRing(b, dom.lo)), i1: Math.min(b.count, upperBoundRing(b, dom.hi)) }; });
            const biggest = win.reduce((m, o) => Math.max(m, o.i1 - o.i0), 0);
            const cols = new Map();
            if (biggest <= maxCols) {
                // a column at each x the series have
                const set = new Set();
                win.forEach((o) => { for (let i = o.i0; i < o.i1; i++) set.add(o.b.getX(i)); });
                const xs = Float64Array.from(Array.from(set).sort((a, b) => a - b));
                const at = new Map(); xs.forEach((v, i) => at.set(v, i));
                win.forEach((o) => { const y = new Float64Array(xs.length).fill(NaN); for (let i = o.i0; i < o.i1; i++) y[at.get(o.b.getX(i))] = o.b.getY(i); cols.set(o.s._data.key, y); });
                let minD = Infinity;
                for (let i = 1; i < xs.length; i++) minD = Math.min(minD, xs[i] - xs[i - 1]);
                return { xs, width: Number.isFinite(minD) ? minD : (dom.hi - dom.lo) / maxCols, cols, n: xs.length };
            }
            const B = maxCols, bw = (dom.hi - dom.lo) / B, how = this.p.bucketBy || "avg";
            const xs = new Float64Array(B);
            for (let k = 0; k < B; k++) xs[k] = dom.lo + (k + 0.5) * bw;
            win.forEach((o) => {
                const sum = new Float64Array(B), cnt = new Float64Array(B), mn = new Float64Array(B).fill(Infinity), mx = new Float64Array(B).fill(-Infinity), last = new Float64Array(B).fill(NaN);
                for (let i = o.i0; i < o.i1; i++) {
                    const x = o.b.getX(i);
                    let k = Math.floor((x - dom.lo) / bw);
                    if (k < 0 || k >= B) { if (x === dom.hi && k === B) k = B - 1; else continue; }
                    const y = o.b.getY(i);
                    sum[k] += y; cnt[k]++; last[k] = y; if (y < mn[k]) mn[k] = y; if (y > mx[k]) mx[k] = y;
                }
                const y = new Float64Array(B);
                for (let k = 0; k < B; k++) y[k] = !cnt[k] ? NaN : how === "sum" ? sum[k] : how === "min" ? mn[k] : how === "max" ? mx[k] : how === "last" ? last[k] : sum[k] / cnt[k];
                cols.set(o.s._data.key, y);
            });
            return { xs, width: bw, cols, n: B };
        }

        // the stacks of what is drawn: [{ id, mode, axis (id), placement, width, members: [series, in order] }], the ones with a name first
        // in the order of their first member; series in no stack form the default one (id "") with the chart's mode
        _plan(vis, axisDefs) {
            const defs = this._stackDefs(), groups = new Map();
            vis.forEach((s) => {
                const sd = this._stackOf(s, defs), key = sd ? sd.id : "";
                let g = groups.get(key);
                if (!g) {
                    g = sd ? Object.assign({}, sd, { members: [] }) : { id: "", name: "", mode: this.p.stacking || "clustered", axis: "", placement: "beside", width: 1, rest: false, members: [] };
                    groups.set(key, g);
                }
                g.members.push(s);
            });
            const list = Array.from(groups.values()).sort((a, b) => a.members[0]._i - b.members[0]._i);
            list.forEach((g) => { g.axisId = this._axisIdOf(g.axis || (g.members[0] && g.members[0].axis), axisDefs); });
            return list;
        }

        // ---- the drawing --------------------------------------------------------------------------
        // The geometry is made in "logical" terms: c along the categories (0 = the plot's start), v along the values; xy(c, v)
        // puts them on the canvas for a vertical or a horizontal chart.
        _drawInto(ctx, w, h, range) {
            if (this._ensureDemo()) this._rebuild();
            this._clearCanvas(ctx, w, h);
            const vis = this._visible();
            if (!vis.length) { this._scale = null; this._geo = null; return; }
            const time = this._time(), f = this._frame;
            const c = this._colors(), font = c.font, fs = numOr(this.p.fontSize, 11);
            const txt = this._textColor() || c.text, strong = this._textColor() || c.strong;
            const horizontal = !time && this.p.orientation === "horizontal" && vis.some((s) => this._markOf(s) === "column");
            const axisDefs = this._axisDefs();
            const groups = this._plan(vis, axisDefs);
            const axisOf = new Map();          // series key -> axis id
            groups.forEach((g) => g.members.forEach((s) => axisOf.set(s._key, horizontal ? axisDefs[0].id : (g.id ? g.axisId : this._axisIdOf(s.axis, axisDefs)))));
            const groupOf = new Map();
            groups.forEach((g) => g.members.forEach((s) => groupOf.set(s._key, g)));

            // -- the x domain and what sits on it
            let dom, slots, al = null, n = 0, fb = null;
            const estW = Math.max(60, w - 90);
            if (time) {
                fb = this._fullBounds();
                if (!fb) { this._scale = null; this._geo = null; return; }
                this._full = fb; this._newest = fb.maxX;
                const r = range || this.getEffectiveTimeRange(fb);
                if (!Number.isFinite(r.vMinX) || !Number.isFinite(r.vMaxX) || !(r.vMaxX > r.vMinX)) return;
                dom = { lo: r.vMinX, hi: r.vMaxX };
                slots = this._timeSlots(vis, dom, estW);
                n = slots.n;
            } else {
                al = this._align(); n = al.xs.length;
                if (!n) { this._geo = null; return; }
                if (f.xType === "category") { dom = { lo: -0.5, hi: n - 0.5 }; slots = { xs: al.xs, width: 1, cols: al.cols, n }; }
                else {
                    let minD = Infinity;
                    for (let i = 1; i < n; i++) minD = Math.min(minD, al.xs[i] - al.xs[i - 1]);
                    const hasCol = vis.some((s) => this._markOf(s) === "column");
                    let lo = al.xs[0], hi = al.xs[n - 1];
                    const pad = hasCol ? (Number.isFinite(minD) ? minD / 2 : 0.5) : (hi === lo ? 1 : 0);
                    lo -= pad; hi += pad;
                    dom = { lo, hi };
                    slots = { xs: al.xs, width: Number.isFinite(minD) ? minD : (hi - lo) / 2, cols: al.cols, n };
                }
            }

            // -- the stacks: lo / hi of every slotted member (the marks decide how the band is drawn)
            const colOf = (s) => slots.cols.get(s._data.key);
            const stackOf = new Map();
            groups.forEach((g) => {
                const mem = g.members.filter((s) => this._slotted(s) && slots.cols.has(s._data.key));
                if (!mem.length || !slots.n) return;
                const mode = g.mode === "clustered" ? "none" : g.mode;
                const res = stackColumns(mem.map((s) => ({ y: colOf(s) })), slots.n, mode);
                mem.forEach((s, i) => stackOf.set(s._key, res[i]));
            });

            // -- the lines: a time x, each from its own pixel columns (a member of a stack: from the shared columns, at the cumulative
            // top); a category / number x, from the aligned values
            const lines = new Map();
            vis.forEach((s) => {
                const mk = this._markOf(s);
                if (mk === "column" || (mk === "area" && stackOf.has(s._key))) return;
                if (this._slotted(s) && slots.cols.has(s._data.key)) {
                    const st = stackOf.get(s._key), y = st ? st.hi : colOf(s);
                    lines.set(s._key, { x: slots.xs, y, n: slots.n });
                } else if (time) { const ln = this._decimate(this.decimator, s, dom.lo, dom.hi, estW); if (ln && ln.n) lines.set(s._key, ln); }
            });

            // -- the value axes: the ones a drawn series is on
            const axes = new Map();
            axisDefs.forEach((def) => {
                const mine = vis.filter((s) => axisOf.get(s._key) === def.id);
                if (!mine.length) return;
                const arrays = [];
                let zero = false, percent = false;
                mine.forEach((s) => {
                    const st = stackOf.get(s._key), mk = this._markOf(s), ln = lines.get(s._key);
                    if (st && (mk === "column" || mk === "area")) { arrays.push(st.lo, st.hi); zero = true; }
                    if (ln) arrays.push(ln.y.subarray ? ln.y.subarray(0, ln.n) : ln.y);
                    if (mk === "column" || mk === "area") zero = true;
                    if (groupOf.get(s._key).mode === "percent" && st) percent = true;
                });
                this._references().filter((r) => this._axisIdOf(r.axis, axisDefs) === def.id).forEach((r) => { arrays.push([r.value]); if (r.kind === "band" && Number.isFinite(r.to)) arrays.push([r.to]); });
                let { min, max } = extent(arrays);
                if (!Number.isFinite(min)) return;
                const log = def.scale === "log";
                if (zero && !log) { if (min > 0) min = 0; if (max < 0) max = 0; }
                else if (!zero && !log) { const padv = (max - min) * 0.08 || Math.abs(min) * 0.1 || 1; min -= padv; max += padv; }
                if (Number.isFinite(def.softMin) && def.softMin < min) min = def.softMin;
                if (Number.isFinite(def.softMax) && def.softMax > max) max = def.softMax;
                if (percent) { min = Math.min(min, 0); max = Math.max(max, 100); }
                if (Number.isFinite(def.min)) min = def.min;
                if (Number.isFinite(def.max)) max = def.max;
                let ticks, lo, hi;
                if (log) { const pos = Math.max(min, 1e-9); ticks = logTicks(pos, Math.max(max, pos * 10)); lo = ticks[0] || pos; hi = ticks[ticks.length - 1] || max; if (Number.isFinite(def.min)) lo = def.min; if (Number.isFinite(def.max)) hi = def.max; }
                else {
                    const nt = niceTicks(min, max, 5);
                    lo = Number.isFinite(def.min) ? def.min : (zero ? nt.min : min); hi = Number.isFinite(def.max) ? def.max : (zero ? nt.max : max);
                    ticks = niceTicks(lo, hi, 5).ticks.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9);
                }
                axes.set(def.id, { id: def.id, side: horizontal ? "left" : def.side, lo, hi, ticks, log, show: def.show, title: def.title, grid: def.grid, spec: { notation: def.notation, decimals: def.decimals }, color: this._tok(def.labelColor) || txt, percent, w: 0, off: 0 });
            });
            const axisList = Array.from(axes.values());
            // the first axis draws the grid when none asks for it (a chart always has its horizontal lines of the main scale)
            if (axisList.length && !axisList.some((a) => a.grid && a.show) && !(this._axisDefs().some((d) => d.grid === false && false))) { const first = axisList.filter((a) => a.show)[0]; if (first && axisDefs.every((d) => !d.grid)) first.grid = false; }

            // -- margins from the labels
            ctx.font = `${fs}px ${font}`;
            const tickText = (ax, v) => formatValue(v, ax.spec, "");
            const titleH = fs + 6, gapAx = 8;
            const catLabels = [];
            if (!time) for (let i = 0; i < n; i++) catLabels.push(this._xLabel(i));
            const widest = (a) => a.reduce((m, t) => Math.max(m, ctx.measureText(t).width), 0);
            axisList.forEach((a) => { a.w = a.show ? Math.max(...a.ticks.map((t) => ctx.measureText(tickText(a, t)).width), 8) + 8 + (a.title ? titleH : 0) : 0; });
            const sideAxes = (side) => axisList.filter((a) => a.side === side && a.show);
            let padL = 8, padR = 10, padT = 10, padB = 8;
            const xTitle = this.p.xTitle || "";
            const showCat = this.p.xShow !== false;
            let xRot = 0, rh = 0, rulerGap = 0;
            if (!horizontal) {
                let o = 0; sideAxes("left").forEach((a) => { a.off = o; o += a.w + gapAx; });
                padL += sideAxes("left").length ? o - gapAx + 2 : 0;
                o = 0; sideAxes("right").forEach((a) => { a.off = o; o += a.w + gapAx; });
                padR += sideAxes("right").length ? o - gapAx + 2 : 0;
                if (time) {
                    rh = showCat ? this._rulerHeight(h) : 0; rulerGap = rh ? 6 : 0;
                    padB += rh + rulerGap + (xTitle ? titleH : 0);
                } else if (showCat) {
                    const slot = (w - padL - padR) / Math.max(1, f.xType === "category" ? n : Math.min(n, 8));
                    const rotate = this.p.xLabelRotate || "auto", lw = widest(catLabels.length ? catLabels : [""]);
                    xRot = rotate === "auto" ? (lw + 6 > slot && f.xType === "category" ? 45 : 0) : Number(rotate) || 0;
                    const lh = xRot ? Math.sin((xRot * Math.PI) / 180) * Math.min(lw, 140) + fs : fs + 4;
                    padB += lh + 8 + (xTitle ? titleH : 0);
                }
            } else {
                if (showCat) padL += Math.min(widest(catLabels), (w * 0.4)) + 10 + (xTitle ? titleH : 0);
                const a0 = axisList[0];
                if (a0 && a0.show) padB += fs + 12 + (a0.title ? titleH : 0);
            }
            const plotX = padL, plotY = padT, plotW = Math.max(10, w - padL - padR), plotH = Math.max(10, h - padT - padB);
            const catLen = horizontal ? plotH : plotW, valLen = horizontal ? plotW : plotH;
            const xy = (cc, vv) => (horizontal ? [plotX + vv, plotY + cc] : [plotX + cc, plotY + plotH - vv]);
            const vpos = (axis, v) => {
                if (axis.log) { const a = Math.log10(Math.max(axis.lo, 1e-9)), b = Math.log10(Math.max(axis.hi, axis.lo * 1.0001)); return ((Math.log10(Math.max(v, 1e-9)) - a) / (b - a)) * valLen; }
                return ((v - axis.lo) / (axis.hi - axis.lo || 1)) * valLen;
            };
            const kx = catLen / (dom.hi - dom.lo || 1);
            const cpos = (xv) => (xv - dom.lo) * kx;
            const slotLen = slots.width * kx;
            const m = time ? { plotX, plotY, plotW, plotH, padLeft: padL, padRight: padR, axisGap: 8, rulerX: plotX, rulerY: plotY + plotH + rulerGap, rulerW: plotW, rulerH: rh } : null;
            this._scale = time ? { vMinX: dom.lo, vMaxX: dom.hi, toX: (x) => plotX + ((x - dom.lo) / (dom.hi - dom.lo)) * plotW, m } : null;
            const axisFor = (s) => axes.get(axisOf.get(s._key)) || axisList[0];

            // -- the grid and the value labels
            ctx.save();
            ctx.lineWidth = 1;
            ctx.font = `${fs}px ${font}`;
            axisList.forEach((a) => {
                if (!a.show) return;
                const edge = a.side === "left" ? plotX - a.off : plotX + plotW + a.off;
                a.ticks.forEach((t) => {
                    const vp = vpos(a, t);
                    if (vp < -0.5 || vp > valLen + 0.5) return;
                    const [x, y] = xy(0, vp);
                    if (a.grid) {
                        ctx.strokeStyle = c.grid; ctx.setLineDash([]);
                        ctx.beginPath();
                        if (horizontal) { ctx.moveTo(x, plotY); ctx.lineTo(x, plotY + plotH); } else { ctx.moveTo(plotX, Math.round(y) + 0.5); ctx.lineTo(plotX + plotW, Math.round(y) + 0.5); }
                        ctx.stroke();
                    }
                    ctx.fillStyle = a.color;
                    const text = tickText(a, t);
                    if (horizontal) { ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(text, x, plotY + plotH + 6); }
                    else if (a.side === "left") { ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(text, edge - 6, y); }
                    else { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, edge + 6, y); }
                });
            });
            // a time x: the vertical grid at the ruler's ticks
            if (time && this.p.xGrid) {
                const step = this._timeStep(dom.hi - dom.lo, plotW);
                ctx.beginPath(); ctx.strokeStyle = c.grid;
                for (let t = Math.ceil(dom.lo / step) * step; t <= dom.hi; t += step) { const sx = Math.round(plotX + cpos(t)) + 0.5; ctx.moveTo(sx, plotY); ctx.lineTo(sx, plotY + plotH); }
                ctx.stroke();
            }
            ctx.restore();
            // the line at the base of the values (0) of the first axis
            const a0 = axisList.filter((a) => a.show)[0] || axisList[0];
            if (a0) {
                ctx.save();
                const base = vpos(a0, Math.max(a0.lo, Math.min(0, a0.hi)));
                const [bx, by] = xy(0, base);
                ctx.strokeStyle = this._textColor() || c.text; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
                ctx.beginPath();
                if (horizontal) { ctx.moveTo(bx, plotY); ctx.lineTo(bx, plotY + plotH); } else { ctx.moveTo(plotX, by); ctx.lineTo(plotX + plotW, by); }
                ctx.stroke();
                ctx.restore();
            }

            // everything in the plot is clipped to it (a time x: the decimated line runs a little beyond)
            ctx.save();
            ctx.beginPath(); ctx.rect(plotX, plotY, plotW, plotH); ctx.clip();
            if (time && this._selection) {
                const a = plotX + cpos(Math.min(this._selection.from, this._selection.to)), b2 = plotX + cpos(Math.max(this._selection.from, this._selection.to));
                ctx.fillStyle = "rgba(59, 130, 246, 0.14)"; ctx.fillRect(a, plotY, b2 - a, plotH);
            }

            // -- reference bands (under the marks)
            const refs = this._references();
            const refColor = (r) => this._tok(r.color) || this.statusColor("error");
            const refAxis = (r) => axes.get(this._axisIdOf(r.axis, axisDefs)) || axisList[0];
            refs.filter((r) => r.kind === "band").forEach((r) => {
                const a = refAxis(r);
                if (!a || !Number.isFinite(r.to)) return;
                const v0 = vpos(a, Math.min(r.value, r.to)), v1 = vpos(a, Math.max(r.value, r.to));
                const [x0, y0] = xy(0, v0), [x1, y1] = xy(catLen, v1);
                ctx.save();
                ctx.globalAlpha = Number.isFinite(r.opacity) ? r.opacity : 0.12;
                ctx.fillStyle = refColor(r);
                ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
                ctx.restore();
                if (r.label) { ctx.save(); ctx.fillStyle = refColor(r); ctx.font = `${fs}px ${font}`; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(r.label, horizontal ? Math.min(x0, x1) + 4 : plotX + 4, horizontal ? plotY + 4 : Math.min(y0, y1) + 3); ctx.restore(); }
            });

            // -- the hover highlight (behind the marks): a band behind the column, or a dashed line
            const hv = this._hoverShape(slots, time);
            if (hv && this.p.tooltipShows !== "off" && this.p.crosshair !== "none") {
                const cc = cpos(hv.x);
                ctx.save();
                if (this.p.crosshair === "line" || (time && !hv.slot)) {
                    ctx.strokeStyle = txt; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath();
                    const [a1, b1] = xy(cc, 0), [a2, b2] = xy(cc, valLen); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); ctx.stroke();
                } else {
                    ctx.fillStyle = c.band; ctx.globalAlpha = 0.9;
                    const [a1, b1] = xy(cc - slotLen / 2, 0), [a2, b2] = xy(cc + slotLen / 2, valLen);
                    ctx.fillRect(Math.min(a1, a2), Math.min(b1, b2), Math.abs(a2 - a1), Math.abs(b2 - b1));
                }
                ctx.restore();
            }

            // -- columns: the places. Stacks beside each other take a place each (a side-by-side stack one a series); an overlay stack
            // takes the whole place, narrower. A column's width: the place minus the space between categories, shared by the places.
            const colSeries = vis.filter((s) => this._markOf(s) === "column" && stackOf.has(s._key));
            const beside = groups.filter((g) => g.placement !== "overlay" && g.members.some((s) => colSeries.indexOf(s) !== -1));
            let nPlaces = 0;
            const place = new Map();
            beside.forEach((g) => {
                const cols = g.members.filter((s) => colSeries.indexOf(s) !== -1);
                if (g.mode === "clustered") cols.forEach((s) => place.set(s._key, nPlaces++)); else { cols.forEach((s) => place.set(s._key, nPlaces)); nPlaces++; }
            });
            nPlaces = Math.max(1, nPlaces);
            const labelsOn = (s) => (s.labels === "on" ? true : s.labels === "off" ? false : !!this.p.labels);
            const labelDraw = [];
            const catGap = Math.max(0, Math.min(0.9, numOr(this.p.gap, 30) / 100));
            const maxBar = numOr(this.p.maxBarWidth, 0), inner = numOr(this.p.barGap, 2);
            // a column with the end away from the base rounded (positive: up / right; negative: down / left)
            const rectPath = (x, y, ww, hh, r, positive) => {
                r = Math.max(0, Math.min(r, Math.abs(ww) / 2, Math.abs(hh) / 2));
                ctx.beginPath();
                if (!r || !ctx.roundRect) { ctx.rect(x, y, ww, hh); return; }
                ctx.roundRect(x, y, ww, hh, horizontal ? (positive ? [0, r, r, 0] : [r, 0, 0, r]) : (positive ? [r, r, 0, 0] : [0, 0, r, r]));
            };

            // -- the marks, in the order of the series (the first under the others)
            vis.forEach((s) => {
                const mk = this._markOf(s), color = this.colorOf(s), a = axisFor(s), st = stackOf.get(s._key), g = groupOf.get(s._key);
                ctx.save();
                ctx.globalAlpha = this._num(s.opacity, 1);
                if (mk === "column" && st) {
                    const y = colOf(s), overlay = g.placement === "overlay";
                    const cat = slotLen * (1 - catGap);
                    const nP = overlay ? 1 : nPlaces, pl = overlay ? 0 : (place.get(s._key) || 0);
                    let each = (cat - inner * (nP - 1)) / nP;
                    if (overlay) each = cat * g.width;
                    if (maxBar > 0) each = Math.min(each, maxBar);
                    each = Math.max(1, each);
                    const groupW = each * nP + inner * (nP - 1);
                    const rad = this._num(s.radius, this._num(this.p.radius, 2));
                    ctx.fillStyle = color;
                    for (let i = 0; i < slots.n; i++) {
                        if (!(y[i] === y[i])) continue;
                        const lo = st.lo[i], hiV = st.hi[i];
                        if (!(lo === lo) || !(hiV === hiV)) continue;
                        const c0 = cpos(slots.xs[i]) - groupW / 2 + pl * (each + inner);
                        const v0 = vpos(a, Math.max(a.lo, Math.min(lo, hiV))), v1 = vpos(a, Math.min(a.hi, Math.max(lo, hiV)));
                        const [x0, y0] = xy(c0, v0), [x1, y1] = xy(c0 + each, v1);
                        const bx = Math.min(x0, x1), by = Math.min(y0, y1), bw = Math.abs(x1 - x0), bh = Math.abs(y1 - y0);
                        if (bw <= 0 || bh <= 0) continue;
                        const piled = g.mode === "stacked" || g.mode === "percent";
                        const top = !piled || this._isTop(g.members.filter((x) => stackOf.has(x._key) && (this._markOf(x) === "column" || this._markOf(x) === "area")), s, i, stackOf, hiV);
                        rectPath(bx, by, bw, bh, top ? rad : 0, hiV >= 0);
                        ctx.fill();
                        if (labelsOn(s)) labelDraw.push({ s, x: bx, y: by, w: bw, h: bh, v: y[i], color, stacked: piled });
                    }
                } else if (mk === "area" && st) {
                    this._drawStackedArea(ctx, s, st, slots, cpos, vpos, xy, a, color, g.mode);
                } else if (lines.has(s._key)) {
                    this._drawLine(ctx, s, lines.get(s._key), mk === "column" ? "line" : mk, { cpos, vpos, xy, a, color, plotY, plotH, labelDraw, labelsOn, time, horizontal });
                }
                ctx.restore();
            });

            // -- reference lines (over the marks), the annotations of a time x, the hover dots
            refs.filter((r) => r.kind !== "band").forEach((r) => {
                const a = refAxis(r);
                if (!a || !Number.isFinite(r.value)) return;
                const vp = vpos(a, r.value);
                if (vp < 0 || vp > valLen) return;
                const [x0, y0] = xy(0, vp), [x1, y1] = xy(catLen, vp);
                ctx.save();
                ctx.strokeStyle = refColor(r); ctx.lineWidth = this._num(r.width, 1.5); ctx.setLineDash(dashOf(r.dash || "dashed")); ctx.globalAlpha = Number.isFinite(r.opacity) ? r.opacity : 1;
                ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
                ctx.setLineDash([]);
                if (r.label) { ctx.fillStyle = refColor(r); ctx.font = `${fs}px ${font}`; ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(r.label, horizontal ? x0 - 4 : x1 - 4, horizontal ? plotY + 12 : y0 - 3); }
                ctx.restore();
            });
            if (time) {
                const ex = this._exporting;
                if (!(ex && ex.noAnnotations)) this._drawAnnotations(ctx, this._scale.toX, plotX, plotY, plotW, plotH, dom.lo, dom.hi);
            }
            if (hv && hv.dots) hv.dots.forEach((d) => {
                const a = axes.get(d.axis) || axisList[0], [x, y] = xy(cpos(d.x), vpos(a, d.v));
                ctx.beginPath(); ctx.fillStyle = d.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            });

            // -- data labels
            if (labelDraw.length) {
                const ls = numOr(this.p.labelSize, 11), lc = this._tok(this.p.labelColor);
                ctx.save();
                ctx.font = `${ls}px ${font}`;
                labelDraw.forEach((d) => {
                    const text = this._fmt(d.v, d.s);
                    let pos = this.p.labelPos || "auto";
                    if (pos === "auto") pos = d.stacked ? "center" : "outside";
                    let tx, ty, inside = false;
                    if (d.line) { tx = d.x; ty = d.y - 8; ctx.textAlign = "center"; ctx.textBaseline = "middle"; }
                    else if (horizontal) {
                        if (pos === "outside") { tx = d.x + d.w + 4; ctx.textAlign = "left"; } else if (pos === "inside") { tx = d.x + d.w - 4; ctx.textAlign = "right"; inside = true; } else { tx = d.x + d.w / 2; ctx.textAlign = "center"; inside = true; }
                        ty = d.y + d.h / 2; ctx.textBaseline = "middle";
                    } else {
                        tx = d.x + d.w / 2; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                        if (pos === "outside") ty = d.y - 8; else if (pos === "inside") { ty = d.y + 9; inside = true; } else { ty = d.y + d.h / 2; inside = true; }
                    }
                    if (inside && (horizontal ? d.w : d.h) < ls + 4) return;
                    ctx.fillStyle = lc || (inside ? this._contrast(d.color) : strong);
                    ctx.fillText(text, tx, ty);
                });
                ctx.restore();
            }
            ctx.restore();   // the clip

            // -- the category axis labels / the time ruler, and the axis titles
            ctx.save();
            ctx.font = `${fs}px ${font}`;
            if (time) {
                if (showCat && rh) this._drawRuler(ctx, m, dom.lo, dom.hi, vis);
                if (xTitle) { ctx.fillStyle = txt; ctx.font = `600 ${fs}px ${font}`; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(xTitle, plotX + plotW / 2, h - 4); }
            } else if (showCat) {
                ctx.fillStyle = this._tok(this.p.xLabelColor) || txt;
                const every = this._labelEvery(catLabels, ctx, catLen, horizontal, xRot);
                if (f.xType === "category") {
                    for (let i = 0; i < n; i += every) {
                        const t = catLabels[i];
                        if (!t) continue;
                        const cc = cpos(al.xs[i]);
                        if (cc < 0 || cc > catLen) continue;
                        if (horizontal) { const [, yy] = xy(cc, 0); ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(this._clip(ctx, t, plotX - 12), plotX - 6, yy); }
                        else {
                            const [x] = xy(cc, 0);
                            if (xRot) { ctx.save(); ctx.translate(x, plotY + plotH + 8); ctx.rotate((xRot * Math.PI) / 180); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(t, 0, 0); ctx.restore(); }
                            else {
                                // the first / last label stays inside the chart
                                const tw = ctx.measureText(t).width;
                                ctx.textBaseline = "top";
                                if (x - tw / 2 < 0) { ctx.textAlign = "left"; ctx.fillText(t, 2, plotY + plotH + 6); }
                                else if (x + tw / 2 > w) { ctx.textAlign = "right"; ctx.fillText(t, w - 2, plotY + plotH + 6); }
                                else { ctx.textAlign = "center"; ctx.fillText(t, x, plotY + plotH + 6); }
                            }
                        }
                    }
                } else {
                    // a number x: nice ticks over the domain
                    const nt = niceTicks(dom.lo, dom.hi, Math.max(2, Math.floor(plotW / 80)));
                    nt.ticks.forEach((t) => {
                        if (t < dom.lo || t > dom.hi) return;
                        const x = plotX + cpos(t);
                        if (this.p.xGrid) { ctx.save(); ctx.strokeStyle = c.grid; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, plotY); ctx.lineTo(Math.round(x) + 0.5, plotY + plotH); ctx.stroke(); ctx.restore(); }
                        ctx.fillStyle = this._tok(this.p.xLabelColor) || txt; ctx.textAlign = "center"; ctx.textBaseline = "top";
                        ctx.fillText(formatValue(t, { notation: "standard", decimals: "auto" }, ""), x, plotY + plotH + 6);
                    });
                }
                if (xTitle) { ctx.fillStyle = txt; ctx.font = `600 ${fs}px ${font}`; if (horizontal) { ctx.save(); ctx.translate(12, plotY + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(xTitle, 0, 0); ctx.restore(); } else { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(xTitle, plotX + plotW / 2, h - 4); } }
            }
            axisList.forEach((a) => {
                if (!a.show || !a.title) return;
                ctx.fillStyle = txt; ctx.font = `600 ${fs}px ${font}`;
                if (horizontal) { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(a.title, plotX + plotW / 2, h - 4); }
                else {
                    const cx = a.side === "left" ? plotX - a.off - a.w + titleH / 2 : plotX + plotW + a.off + a.w - titleH / 2;
                    ctx.save(); ctx.translate(cx, plotY + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(a.title, 0, 0); ctx.restore();
                }
            });
            ctx.restore();

            // what a pointer needs
            this._geo = { w, h, plotX, plotY, plotW, plotH, horizontal, time, n: slots.n, dom, kx, cpos, slotLen, vis, stackOf, axes, axisOf, groupOf, slots, lines, catLabels, xy, vpos, catLen, al, valLen };
        }

        // the highlight under the pointer: { x (data units), slot (a column), dots: [{ x, v, axis, color }] }
        _hoverShape(slots, time) {
            if (time) {
                const h = this.hover;
                if (!h || !h.hits || !h.hits.length) return null;
                const g = this._geo;
                return { x: h.time, slot: h.hits.some((x) => x.slot), dots: h.hits.filter((x) => !x.slot).map((x) => ({ x: x.x, v: x.y, axis: g ? g.axisOf.get(x.s._key) : "", color: this.colorOf(x.s) })) };
            }
            const hi = this._hoverAt;
            if (!hi || hi.i < 0 || hi.i >= slots.n) return null;
            return { x: slots.xs[hi.i], slot: true, dots: [] };
        }

        // a stacked / overlapping area: gradient (or solid) fill between its two edges, its top edge as the line
        _drawStackedArea(ctx, s, st, slots, cpos, vpos, xy, a, color, mode) {
            const lw = this._num(s.width, numOr(this.p.lineWidth, 2)), curve = this._curveOf(s);
            const top = [], low = [];
            for (let i = 0; i < slots.n; i++) {
                if (!(st.hi[i] === st.hi[i]) || !(st.lo[i] === st.lo[i])) continue;
                top.push(xy(cpos(slots.xs[i]), vpos(a, st.hi[i]))); low.push(xy(cpos(slots.xs[i]), vpos(a, st.lo[i])));
            }
            if (top.length < 1) return;
            const tx = Float64Array.from(top, (p) => p[0]), ty = Float64Array.from(top, (p) => p[1]), lx = Float64Array.from(low, (p) => p[0]), ly = Float64Array.from(low, (p) => p[1]);
            const stacked = mode === "stacked" || mode === "percent";
            const fillKind = s.fill || (stacked ? "solid" : (this.p.areaFill || "gradient"));
            if (fillKind !== "none" && top.length > 1) {
                const fo = this._num(s.fillOpacity, numOr(this.p.fillOpacity, 0.3));
                if (fillKind === "gradient" && !stacked) {
                    const gr = ctx.createLinearGradient(0, Math.min(...ty), 0, Math.max(...ly));
                    gr.addColorStop(0, this.hexToRgba(color, fo)); gr.addColorStop(1, this.hexToRgba(color, 0.01));
                    ctx.fillStyle = gr;
                } else ctx.fillStyle = this.hexToRgba(color, stacked ? Math.max(fo, 0.6) : fo);
                ctx.beginPath();
                this._edge(ctx, tx, ty, top.length, curve, false);
                this._edge(ctx, lx, ly, low.length, curve, true);
                ctx.closePath(); ctx.fill();
            }
            ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash(dashOf(s.dash));
            ctx.beginPath(); this._edge(ctx, tx, ty, top.length, curve, false); ctx.stroke(); ctx.setLineDash([]);
        }

        // an edge of points as a path: straight or a monotone curve, forwards (moveTo first) or backwards (the lower edge of an area)
        _edge(ctx, xs, ys, n, curve, backwards) {
            if (!n) return;
            if (!backwards) ctx.moveTo(xs[0], ys[0]); else ctx.lineTo(xs[n - 1], ys[n - 1]);
            if (n < 2) return;
            if (curve === "smooth" && n > 2) {
                const seg = monotoneSegments(xs, ys, n);
                if (!backwards) for (let k = 0; k < n - 1; k++) { const o = k * 6; ctx.bezierCurveTo(seg[o], seg[o + 1], seg[o + 2], seg[o + 3], seg[o + 4], seg[o + 5]); }
                else for (let k = n - 2; k >= 0; k--) { const o = k * 6; ctx.bezierCurveTo(seg[o + 2], seg[o + 3], seg[o], seg[o + 1], xs[k], ys[k]); }
            } else if (!backwards) for (let i = 1; i < n; i++) ctx.lineTo(xs[i], ys[i]);
            else for (let i = n - 2; i >= 0; i--) ctx.lineTo(xs[i], ys[i]);
        }

        // a line / step / area / points series from its own points (data units): { x, y, n }
        _drawLine(ctx, s, ln, mk, g) {
            const { cpos, vpos, xy, a, color, plotY, plotH, labelDraw, labelsOn, time, horizontal } = g;
            const lw = this._num(s.width, numOr(this.p.lineWidth, 2)), curve = mk === "step" ? "step" : this._curveOf(s);
            // points -> canvas, runs broken at a NaN (a category x) or a gap (a time x: gapAfter)
            const gap = time ? numOr(s.gapAfter, 0) : 0, connect = time || this._frame.xType !== "category";
            const runs = [];
            let cur = null;
            for (let i = 0; i < ln.n; i++) {
                const yv = ln.y[i];
                if (!(yv === yv)) { if (!connect) cur = null; continue; }
                const p = xy(cpos(ln.x[i]), vpos(a, yv));
                if (!cur || (gap > 0 && ln.x[i] - cur.lastX > gap)) { cur = { xs: [], ys: [], vs: [], lastX: 0 }; runs.push(cur); }
                cur.xs.push(p[0]); cur.ys.push(p[1]); cur.vs.push(yv); cur.lastX = ln.x[i];
            }
            const baseV = vpos(a, Math.max(a.lo, Math.min(0, a.hi)));
            const fillKind = mk === "point" ? "none" : (s.fill || (mk === "area" ? (this.p.areaFill || "gradient") : "none"));
            const trace = (r, fwd) => {
                if (curve === "step") { const pts = stepPoints(r.xs, r.ys, r.xs.length, "after"); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); }
                else this._edge(ctx, Float64Array.from(r.xs), Float64Array.from(r.ys), r.xs.length, curve, false);
            };
            if (fillKind !== "none" && !horizontal) {
                const fo = this._num(s.fillOpacity, numOr(this.p.fillOpacity, 0.3));
                const base = plotY + plotH - baseV;
                if (fillKind === "gradient") { const gr = ctx.createLinearGradient(0, plotY, 0, plotY + plotH); gr.addColorStop(0, this.hexToRgba(color, fo)); gr.addColorStop(1, this.hexToRgba(color, 0.01)); ctx.fillStyle = gr; }
                else ctx.fillStyle = this.hexToRgba(color, fo);
                runs.forEach((r) => {
                    if (r.xs.length < 2) return;
                    ctx.beginPath(); trace(r);
                    ctx.lineTo(r.xs[r.xs.length - 1], base); ctx.lineTo(r.xs[0], base); ctx.closePath(); ctx.fill();
                });
            }
            if (mk !== "point") {
                ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash(dashOf(s.dash));
                runs.forEach((r) => {
                    if (r.xs.length === 1) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(r.xs[0], r.ys[0], Math.max(3, lw * 1.5), 0, Math.PI * 2); ctx.fill(); return; }
                    ctx.beginPath(); trace(r); ctx.stroke();
                });
                ctx.setLineDash([]);
            }
            const showPts = mk === "point" || s.points === "on" || (s.points !== "off" && !!this.p.markers);
            const size = this._num(s.pointSize, numOr(this.p.pointSize, 4)) + (mk === "point" ? 1 : 0);
            if (showPts && ln.n <= 5000) runs.forEach((r) => r.xs.forEach((x, i) => this._marker(ctx, s.pointShape, x, r.ys[i], size, color)));
            if (labelsOn(s) && ln.n <= 400) runs.forEach((r) => r.xs.forEach((x, i) => labelDraw.push({ s, x, y: r.ys[i], w: 0, h: 0, v: r.vs[i], color, line: true })));
        }

        // the end of a pile in category i: no other series of the same pile reaches further out (its end is the rounded one)
        _isTop(list, s, i, stackOf, hiV) {
            const mine = stackOf.get(s._key);
            if (!mine) return true;
            return !list.some((o) => {
                if (o._key === s._key) return false;
                const st = stackOf.get(o._key);
                if (!st || !(st.hi[i] === st.hi[i]) || st.hi[i] === st.lo[i]) return false;
                return hiV >= 0 ? st.hi[i] > mine.hi[i] + 1e-9 : st.lo[i] < mine.lo[i] - 1e-9;
            });
        }

        _references() {
            return (Array.isArray(this.p.references) ? this.p.references : []).filter((r) => r && typeof r === "object")
                .map((r) => ({ kind: r.kind === "band" ? "band" : "line", axis: r.axis || "", value: numOr(r.value, NaN), to: numOr(r.to, NaN), label: r.label || "", color: r.color, dash: r.dash, width: numOr(r.width, 1.5), opacity: numOr(r.opacity, NaN) }))
                .filter((r) => Number.isFinite(r.value));
        }

        _marker(ctx, shape, x, y, r, color) {
            ctx.fillStyle = color; ctx.strokeStyle = this._backgroundColor() || "#fff"; ctx.lineWidth = 1;
            ctx.beginPath();
            if (shape === "square") ctx.rect(x - r, y - r, r * 2, r * 2);
            else if (shape === "diamond") { ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r * 1.3, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r * 1.3, y); ctx.closePath(); }
            else if (shape === "triangle") { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.2, y + r); ctx.lineTo(x - r * 1.2, y + r); ctx.closePath(); }
            else ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
        }

        // black or white text on a colour (the data label inside a column)
        _contrast(color) {
            const m = /^#?([0-9a-f]{6})$/i.exec(String(color || "").trim());
            let r = 0, g = 0, b = 0;
            if (m) { const n = parseInt(m[1], 16); r = n >> 16 & 255; g = n >> 8 & 255; b = n & 255; }
            else { const c = String(color).match(/\d+/g); if (c) { r = +c[0]; g = +c[1]; b = +c[2]; } }
            return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#161616" : "#ffffff";
        }

        _clip(ctx, t, maxW) {
            if (ctx.measureText(t).width <= maxW) return t;
            let s = t;
            while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
            return s + "…";
        }

        // labels every k-th so they do not touch
        _labelEvery(labels, ctx, len, horizontal, rot) {
            if (!labels.length) return 1;
            const widest = labels.reduce((m, t) => Math.max(m, ctx.measureText(t).width), 0);
            const need = horizontal ? (numOr(this.p.fontSize, 11) + 6) : (rot ? numOr(this.p.fontSize, 11) + 6 : widest + 10);
            return Math.max(1, Math.ceil(need / Math.max(1, len / labels.length)));
        }

        // ---- the pointer ---------------------------------------------------------------------------
        // A time x: TimeChartElement's (drag, wheel, ruler, navigator, Live) with our hooks below.
        // A category / number x: hover and click only.
        _loc(e) {
            const plot = this._plotEl(), r = plot.getBoundingClientRect(), sx = r.width / (plot.clientWidth || 1) || 1, sy = r.height / (plot.clientHeight || 1) || 1;
            return { x: (e.clientX - r.left) / sx, y: (e.clientY - r.top) / sy };
        }

        _indexAt(L) {
            const g = this._geo;
            if (!g || L.x < g.plotX || L.x > g.plotX + g.plotW || L.y < g.plotY || L.y > g.plotY + g.plotH) return -1;
            const c = g.horizontal ? L.y - g.plotY : L.x - g.plotX;
            let best = -1, bd = Infinity;
            for (let i = 0; i < g.n; i++) { const d = Math.abs(g.cpos(g.slots.xs[i]) - c); if (d < bd) { bd = d; best = i; } }
            return best;
        }

        // the series whose mark is under the pointer in slot i (nearest in value)
        _seriesAt(L, i) {
            const g = this._geo;
            let best = null, bd = Infinity;
            g.vis.forEach((s) => {
                const ycol = g.slots.cols.get(s._data.key); if (!ycol) return;
                const y = ycol[i]; if (!(y === y)) return;
                const st = g.stackOf.get(s._key), a = g.axes.get(g.axisOf.get(s._key)); if (!a) return;
                const v = st ? (st.lo[i] + st.hi[i]) / 2 : y;
                const p = g.xy(g.cpos(g.slots.xs[i]), g.vpos(a, v)), d = g.horizontal ? Math.abs(p[0] - L.x) : Math.abs(p[1] - L.y);
                if (d < bd) { bd = d; best = s; }
            });
            return best;
        }

        _ptrMove(e) {
            if (!this._geo || this._time()) return;
            const L = this._loc(e), i = this._indexAt(L);
            if (i < 0) { this._ptrLeave(); return; }
            const single = this.p.tooltipShows === "single" ? this._seriesAt(L, i) : null;
            const key = single ? single._key : "";
            if (!this._hoverAt || this._hoverAt.i !== i || this._hoverAt.key !== key) { this._hoverAt = { i, key }; this.draw(); this._emitHover(i); }
            this._showPlain(L, i, single);
        }

        _ptrLeave() {
            if (this._hoverAt) { this._hoverAt = null; this.draw(); }
            const tip = this.renderRoot.querySelector(".tooltip"); if (tip) tip.style.display = "none";
        }

        _emitHover(i) {
            const now = Date.now();
            if (now - this._lastHover < 100 || this.isEditor) return;
            this._lastHover = now;
            const g = this._geo, values = {};
            this._visible().forEach((s) => { const y = g.slots.cols.get(s._data.key); if (y && y[i] === y[i]) values[s.id || s.name] = y[i]; });
            this.emit("hover", { x: this._frame.xType === "category" ? this._frame.cats[i] : g.slots.xs[i], values });
        }

        // the tooltip of a category / number x
        _showPlain(L, i, single) {
            const g = this._geo, f = this._frame;
            const xText = f.xType === "category" ? this._xLabel(i) : formatValue(g.slots.xs[i], { notation: "standard", decimals: "auto" }, "");
            const list = single ? [single] : g.vis;
            const piled = !single && g.groups_piled !== false && Array.from(g.groupOf.values()).some((x) => x.mode === "stacked" || x.mode === "percent");
            this._fillTooltip(L.x, L.y, xText, list.map((s) => ({ s, v: g.slots.cols.get(s._data.key)[i] })), piled);
        }

        // rows [{ s, v }] into the tooltip (a Line Chart tooltip: its time / label line, a swatch + text per series)
        _fillTooltip(px, py, title, rows, total) {
            const tip = this.renderRoot.querySelector(".tooltip");
            if (!tip) return;
            const shown = rows.filter((r) => r.v === r.v);
            if (!shown.length || this.p.tooltipShows === "off") { tip.style.display = "none"; return; }
            let sum = 0;
            const body = shown.map((r) => { sum += r.v; return `<div class="tooltip-row"><span class="tooltip-dot" style="background:${this.colorOf(r.s)}"></span><span class="tooltip-name">${this._esc(r.s.name || r.s.id)}</span><span class="tooltip-val">${this._esc(this._fmt(r.v, r.s))}</span></div>`; }).join("");
            tip.innerHTML = `<div class="tooltip-time">${this._esc(title)}</div><div class="tooltip-rows">${body}${total && shown.length > 1 ? `<div class="tooltip-row" style="border-top:1px solid var(--bd);margin-top:3px;padding-top:3px"><span class="tooltip-name">Total</span><span class="tooltip-val">${this._esc(this._fmt(sum, shown[0].s))}</span></div>` : ""}</div>`;
            tip.style.display = "block";
            const plot = this._plotEl(), tw = tip.offsetWidth, th = tip.offsetHeight;
            let tx = px + 14, ty = py + 14;
            if (tx + tw > plot.clientWidth - 4) tx = px - tw - 14;
            if (ty + th > plot.clientHeight - 4) ty = Math.max(4, plot.clientHeight - th - 4);
            tip.style.transform = "none";
            tip.style.left = Math.max(4, tx) + "px"; tip.style.top = Math.max(4, ty) + "px";
        }

        _esc(t) { return String(t === undefined || t === null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

        onPlotClick(e) {
            if (!this._geo || this.isEditor || this._time()) return;
            const L = this._loc(e), i = this._indexAt(L);
            if (i < 0) return;
            const s = this._seriesAt(L, i);
            if (!s) return;
            const f = this._frame;
            this.emit("pointClick", { x: f.xType === "category" ? f.cats[i] : this._geo.slots.xs[i], y: this._geo.slots.cols.get(s._data.key)[i], index: i, series: s.id || s.name }, this._target(s));
        }

        // a time x ------------------------------------------------------------------------------------
        // the points under the pointer's time: a slotted series' column, another's nearest point (as the Line Chart's tooltip)
        _hitsAt(time) {
            const g = this._geo;
            if (!g) return [];
            const hits = [], span = g.dom.hi - g.dom.lo;
            let si = -1;
            if (g.n) { let bd = Infinity; for (let i = 0; i < g.n; i++) { const d = Math.abs(g.slots.xs[i] - time); if (d < bd) { bd = d; si = i; } } if (bd > g.slots.width * 0.75) si = -1; }
            const single = this.p.tooltipShows === "single";
            g.vis.forEach((s) => {
                if (g.slots.cols.has(s._data.key)) {
                    if (si < 0) return;
                    const y = g.slots.cols.get(s._data.key)[si], st = g.stackOf.get(s._key);
                    if (y === y) hits.push({ s, x: g.slots.xs[si], y, top: st ? st.hi[si] : y, slot: true });
                    return;
                }
                const buf = this._buf(s); if (!buf) return;
                const idx = buf.findClosestIndex(time); if (idx < 0) return;
                const x = buf.getX(idx), y = buf.getY(idx);
                const n = Math.max(1, upperBoundRing(buf, g.dom.hi) - lowerBoundRing(buf, g.dom.lo));
                if (Math.abs(x - time) > Math.max(span * 0.01, (span / n) * 0.75)) return;
                hits.push({ s, x, y, idx, d: Math.abs(x - time) });
            });
            if (single && hits.length) { hits.sort((a, b) => (a.d === undefined ? 0 : a.d) - (b.d === undefined ? 0 : b.d)); return [hits[0]]; }
            return hits;
        }

        _plotHover(L, time) {
            const hits = this._hitsAt(time);
            let at = time, best = Infinity;
            for (const h of hits) if (Math.abs(h.x - time) < best) { best = Math.abs(h.x - time); at = h.x; }
            this.hover = { time: at, px: L.px, py: L.py, hits };
            this.draw();
            this._showTooltip(L.px, L.py, L.rect.width);
            const now = Date.now();
            if (now - this._lastHoverEmit > 100) {
                this._lastHoverEmit = now;
                const values = {}; hits.forEach((h) => { values[h.s.id || h.s.name] = h.y; });
                this.emit("hover", { x: this.hover.time, values });
            }
        }

        _plotClick(L, time) {
            const hits = this._hitsAt(time);
            const near = hits.slice().sort((a, b) => Math.abs(a.x - time) - Math.abs(b.x - time))[0];
            if (near) this.emit("pointClick", { x: near.x, y: near.y, index: near.idx === undefined ? -1 : near.idx, series: near.s.id || near.s.name }, this._target(near.s));
        }

        _showHitsTooltip(px, py, rectW) {
            const tip = this.renderRoot.querySelector(".tooltip");
            if (!tip) return;
            const h = this.hover, g = this._geo;
            if (!h || !h.hits.length || this.p.tooltipShows === "off") { tip.style.display = "none"; return; }
            const piled = g && h.hits.length > 1 && h.hits.every((x) => x.slot) && h.hits.some((x) => { const gr = g.groupOf.get(x.s._key); return gr && (gr.mode === "stacked" || gr.mode === "percent"); });
            this._fillTooltip(px, py, this.fmtTime(h.time), h.hits.map((x) => ({ s: x.s, v: x.y })), piled);
            // beside the cursor, flipped near the right edge (as the Line Chart's)
            const flip = px > rectW - 200;
            tip.style.left = `${Math.round(flip ? px - 12 : px + 12)}px`;
            tip.style.top = `${Math.round(py)}px`;
            tip.style.transform = flip ? "translate(-100%, -50%)" : "translate(0, -50%)";
        }

        // ---- export -------------------------------------------------------------------------------
        _table(range) {
            const vis = this.seriesList().filter((s) => s.visible !== false && !this._hidden.has(s._key) && this._has(s));
            if (this._time()) {
                const span = this._exportSpan(range || this.p.exportRange || "visible");
                const set = new Set();
                vis.forEach((s) => { const b = this._buf(s); for (let i = 0; i < b.count; i++) { const x = b.getX(i); if (x >= span.from && x <= span.to) set.add(x); } });
                const xs = Array.from(set).sort((a, b) => a - b), at = new Map();
                xs.forEach((x, i) => at.set(x, i));
                const cols = vis.map((s) => { const y = new Array(xs.length).fill(""); const b = this._buf(s); for (let i = 0; i < b.count; i++) { const k = at.get(b.getX(i)); if (k !== undefined) y[k] = b.getY(i); } return y; });
                return { head: ["Time"].concat(vis.map((s) => s.name || s.id)), rows: xs.map((x, i) => [new Date(x).toISOString()].concat(cols.map((c) => c[i]))) };
            }
            const f = this._frame, al = this._align();
            const head = [this.p.xField || "x"].concat(vis.map((s) => s.name || s.id));
            const rows = [];
            for (let i = 0; i < al.xs.length; i++) rows.push([f.xType === "category" ? f.cats[i] : al.xs[i]].concat(vis.map((s) => { const v = this._col(s)[i]; return v === v ? v : ""; })));
            return { head, rows };
        }

        exportData(params) {
            const P = params && typeof params === "object" ? params : { format: params };
            const fmt = String(P.format || "csv").toLowerCase();
            if (fmt === "png") return this.exportPNG(P);
            const { head, rows } = this._table(P.range);
            let blob;
            if (fmt === "xlsx") blob = xlsxBlob(head, rows, this.p.timeZone === "utc", { textCols: [0] });
            else {
                const q = (t) => '"' + String(t).replace(/"/g, '""') + '"';
                blob = new Blob(["﻿" + [head.map(q).join(",")].concat(rows.map((r) => r.map((v) => (typeof v === "number" ? String(v) : q(v))).join(","))).join("\r\n")], { type: "text/csv;charset=utf-8" });
            }
            const name = this._getExportFileName(fmt === "xlsx" ? "xlsx" : "csv", P.range || "all");
            this._download(blob, name);
            this._lastExport = { name, blob, rows: rows.length };
            return rows.length;
        }

        // ---- the view -----------------------------------------------------------------------------
        render() {
            const p = this.p, at = p.legend || "bottom", time = this._time();
            const list = this.seriesList().filter((s) => s.legend !== false && (s._data || (Array.isArray(p.series) && p.series.length)));
            const inside = at.indexOf("inside") === 0, vertical = at === "left" || at === "right";
            const legend = at === "none" || !list.length ? "" : html`
                <div class="legend ${vertical ? "v" : ""} ${inside ? "inside " + at.slice(7) : ""}" part="legend" style="--lg-size:${numOr(p.legendSize, 12)}px">
                    ${list.map((s) => html`<button type="button" class="lg-item ${this._hidden.has(s._key) || s.visible === false ? "off" : ""}" title="Click: show / hide. Alt+click: only this one." @click=${(e) => this._toggle(s, e)}>
                        <span class="lg-swatch ${this._markOf(s) === "column" || this._markOf(s) === "area" ? "sw-sq" : this._markOf(s) === "point" ? "sw-dot" : ""}" style="background:${this.colorOf(s)}"></span><span class="lg-name">${s.name || s.id}</span>${p.legendValue && p.legendValue !== "none" ? html`<span class="lg-val">${this._legendValue(s)}</span>` : ""}
                    </button>`)}
                </div>`;
            const bg = this._tok(p.background);
            const style = `${bg ? "background:" + bg + ";" : ""}${p.border === false ? "border-color:transparent;" : ""}${this._textColor() ? "--fg:" + this._textColor() + ";" : ""}--ct-size:${numOr(p.titleSize, 14)}px`;
            const empty = !this._hasAny() && !(this._frame.series.length);
            return html`
                <div class="chart-container" part="chart" style=${style}>
                    ${p.title || p.subtitle ? html`<div class="c-head" style="text-align:${p.titleAlign || "left"}">${p.title ? html`<div class="c-title">${p.title}</div>` : ""}${p.subtitle ? html`<div class="c-sub">${p.subtitle}</div>` : ""}</div>` : ""}
                    ${at === "top" ? legend : ""}
                    <div class="c-main">
                        ${at === "left" ? legend : ""}
                        <div class="plot"
                            @wheel=${(e) => { if (time) this.onWheel(e); }}
                            @pointerdown=${(e) => { if (time) this.onPointerDown(e); }}
                            @pointermove=${(e) => { if (time) this.onPointerMove(e); else this._ptrMove(e); }}
                            @pointerup=${(e) => { if (time) this.onPointerUp(e); }}
                            @pointercancel=${(e) => { if (time) this.onPointerCancel(e); }}
                            @pointerleave=${(e) => { if (time) this.onPointerLeave(e); else this._ptrLeave(); }}
                            @dblclick=${() => { if (time) this.followLive(); }}
                            @click=${(e) => this.onPlotClick(e)}>
                            <canvas></canvas>
                            <div class="corner" style="right:${this._scale && this._scale.m ? this._scale.m.padRight + 6 : 14}px">
                                ${time && this.viewRange ? html`<button class="btn-chip btn-reset-zoom" @click=${() => this.followLive()} title="Follow the newest data again (or double click the chart)"><span class="live-dot"></span> Reset Zoom</button>` : ""}
                                ${this._renderMenu()}
                            </div>
                            <div class="tooltip" style="display:none"></div>
                            ${inside ? legend : ""}
                            ${empty ? html`<div class="empty"><span>${p.emptyText || "No data to display"}</span></div>` : ""}
                        </div>
                        ${at === "right" ? legend : ""}
                    </div>
                    ${at === "bottom" ? legend : ""}
                </div>`;
        }
    }
});
