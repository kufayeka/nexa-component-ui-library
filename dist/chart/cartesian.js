// Nexa UI — Chart: the Cartesian chart (columns, bars, lines, steps, areas, points, any mix, any number of series).
//
// One engine for what Power BI calls a clustered / stacked / 100 % column and bar, a line, an area, a combo, a scatter:
//   - DATA: rows from Logic ([{ time, floor, kwh }]) mapped to x / y / "split by" (a series per value of a field), or per series
//     (its Update node: Set data / Set point / Append point). The x is a category, a number or a time (detected).
//   - MARKS per series (column, line, step, area, points), on a left or a right axis; stacked / 100 % / clustered, in piles by group.
//   - The look is a Power BI style format pane: Title, Legend, X axis, Y axis, Secondary Y axis, Data labels, Tooltip,
//     Reference lines. A colour is a hex OR a theme token ({token:colors.…}); the default is the theme's palette (colors.chart.N).
// What it does NOT do yet (the next slices): zoom / pan / the time ruler / live follow, the ring buffers + LOD for 10^6 points
// (a million-point trend stays on the Line Chart until then), readouts, SPC. See .agents/CHART_FAMILIES_DESIGN.md.
import { html, css, formatValue, theme } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, part, defineUI } from "../core.js";
import { ChartElement, chartCommon, opt, NOTATIONS, DECIMALS, DASHES, numOr } from "./core.js";
import { xlsxBlob } from "./export.js";
import { buildFrame } from "./rows.js";
import { stackColumns, niceTicks, logTicks, extent } from "./stack.js";
import { getNiceTimeStep } from "./time.js";

const MARKS = [["column", "Column / bar"], ["line", "Line"], ["step", "Step line"], ["area", "Area"], ["point", "Points (scatter)"]];
const STACKINGS = [["clustered", "Clustered (side by side)"], ["stacked", "Stacked"], ["percent", "100 % stacked"], ["none", "Overlapping"]];
const LEGEND_AT = [["bottom", "Bottom"], ["top", "Top"], ["left", "Left"], ["right", "Right"], ["inside-tl", "Inside, top left"], ["inside-tr", "Inside, top right"], ["inside-bl", "Inside, bottom left"], ["inside-br", "Inside, bottom right"], ["none", "None"]];
const dashOf = (d) => DASHES[d] || [];

// ---- the series' fields (a Power BI "Visual / Series" card, per series) ------------------------------------------
const SERIES_FIELDS = {
    name: { type: "string", label: "Name", default: "Series" },
    id: { type: "string", label: "Id", default: "", bindable: false, help: "Fixed: its Update node and events find the series by it. It is also the value of the split field it styles (e.g. \"Floor 3\")." },
    visible: { type: "boolean", label: "Visible", default: true },
    legend: { type: "boolean", label: "In the legend", default: true },

    field: { type: "string", section: "Data", label: "Row field (y)", default: "", bindable: false, help: "Wide form: the field of each row this series takes. Empty: the series of that Id / name." },

    mark: { type: "enum", section: "Mark", label: "Mark", default: "", options: opt([["", "The chart's default"]].concat(MARKS)) },
    axis: { type: "enum", section: "Mark", label: "Axis", default: "left", options: opt([["left", "Left"], ["right", "Right (secondary)"]]) },
    stackGroup: { type: "string", section: "Mark", label: "Pile (stack group)", default: "", help: "Series with the same pile name stack on each other; piles stand side by side. Empty: the chart's stacking." },

    color: { type: "color", section: "Colour", label: "Colour", default: "", tokens: "colors", help: "A hex colour, or a theme token (◆). Empty: the next colour of the theme's chart palette." },
    opacity: { type: "number", section: "Colour", label: "Opacity", default: 1, min: 0, max: 1, step: 0.05 },

    width: { type: "number", section: "Line", label: "Width", default: "", min: 0.5, max: 12, step: 0.5, unit: "px", help: "Empty: the chart's line width." },
    dash: { type: "enum", section: "Line", label: "Dash", default: "solid", options: opt([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]) },
    fillOpacity: { type: "number", section: "Line", label: "Area fill opacity", default: "", min: 0, max: 1, step: 0.05, help: "Empty: the chart's." },

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
    return o;
}

const REFERENCE_FIELDS = {
    kind: { type: "enum", label: "Kind", default: "line", options: opt([["line", "Line (a limit, a target)"], ["band", "Band (from – to)"]]) },
    axis: { type: "enum", label: "On the axis", default: "left", options: opt([["left", "Left"], ["right", "Right"]]) },
    value: { type: "number", label: "Value (from)", default: 0 },
    to: { type: "number", label: "To", default: "", visibleWhen: (r) => r.kind === "band" },
    label: { type: "string", label: "Label", default: "" },
    color: { type: "color", label: "Colour", default: "", tokens: "colors", help: "Empty: the error colour of the theme." },
    dash: { type: "enum", label: "Dash", default: "dashed", options: opt([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]), visibleWhen: (r) => r.kind !== "band" },
    width: { type: "number", label: "Width", default: 1.5, min: 0.5, max: 8, step: 0.5, unit: "px", visibleWhen: (r) => r.kind !== "band" },
    opacity: { type: "number", label: "Opacity", default: "", min: 0, max: 1, step: 0.05, help: "Empty: 1 for a line, 0.12 for a band." }
};

// the Y axes: a Power BI "Y axis" card each (left, and the secondary one on the right)
function axisProps(side, group, title) {
    const k = (n) => side + n;
    const only = (p) => p[k("Show")] !== false;
    return {
        [k("Show")]: { type: "boolean", group, label: title, default: true, help: side === "y" ? "" : "The right axis exists when a series is on it (a series' Axis: Right)." },
        [k("Title")]: { type: "string", group, label: "Title", default: "", visibleWhen: only },
        [k("Scale")]: { type: "enum", group, label: "Scale", default: "linear", options: opt([["linear", "Linear"], ["log", "Logarithmic"]]), visibleWhen: only },
        [k("SoftMin")]: { type: "number", group, section: "Range", label: "Soft min (grows with the data)", default: "", visibleWhen: only },
        [k("SoftMax")]: { type: "number", group, section: "Range", label: "Soft max (grows with the data)", default: "", visibleWhen: only },
        [k("Min")]: { type: "number", group, section: "Range", label: "Hard min (fixed, clips)", default: "", visibleWhen: only },
        [k("Max")]: { type: "number", group, section: "Range", label: "Hard max (fixed, clips)", default: "", visibleWhen: only },
        [k("Notation")]: { type: "enum", group, section: "Labels", label: "Notation", default: "standard", options: opt(NOTATIONS), visibleWhen: only },
        [k("Decimals")]: { type: "enum", group, section: "Labels", label: "Decimals", default: "auto", options: opt(DECIMALS), visibleWhen: only },
        [k("Grid")]: { type: "boolean", group, section: "Labels", label: "Gridlines", default: side === "y", visibleWhen: only },
        [k("LabelColor")]: { type: "color", group, section: "Labels", label: "Label colour", default: "", tokens: "colors", help: "Empty: the theme's muted text.", visibleWhen: only }
    };
}

export const cartesianChart = defineUI({
    ...chartCommon,
    id: PREFIX + "chart",
    label: "Chart",
    icon: "fa fa-bar-chart",
    size: { w: 600, h: 320 },
    help: "Columns, bars, lines, areas and points on one or two axes, stacked or side by side. Data from rows (a field to split into series) or per series from Logic.",
    version: 1,

    groups: ["Data", "Series", "Visual", "Title", "Legend", "X axis", "Y axis", "Secondary Y axis", "Data labels", "Tooltip", "Reference lines", "General", "Export"],

    properties: {
        // ---- Data: the fields well of Power BI ----
        rows: { type: "json", group: "Data", label: "Rows", default: [], help: "An array of objects, e.g. from a message ({msg.payload}) or a variable: [{ \"floor\": \"F3\", \"hour\": \"10:00\", \"kwh\": 41.2 }]. Logic's Set rows does the same." },
        xField: { type: "string", group: "Data", label: "X field", default: "x", bindable: false, help: "The field of a row that is the x: a category, a number or a time (epoch ms / seconds, an ISO text)." },
        yField: { type: "string", group: "Data", label: "Y field(s)", default: "y", bindable: false, help: "The field with the value. Several, comma separated (kwh_f1, kwh_f2): one series each (wide form)." },
        splitField: { type: "string", group: "Data", label: "Split into series by", default: "", bindable: false, help: "The field whose every value is a series (the floor, the machine, the room). Needs one Y field. Style one by adding a series with its value as Id." },
        xType: { type: "enum", group: "Data", label: "X is", default: "auto", options: opt([["auto", "Detected"], ["category", "A category (words)"], ["number", "A number"], ["time", "A time"]]) },
        aggregate: { type: "enum", group: "Data", label: "Rows with the same x and series", default: "sum", options: opt([["sum", "Add up"], ["avg", "Average"], ["last", "The last"], ["min", "Minimum"], ["max", "Maximum"], ["count", "Count"]]) },
        categoryOrder: { type: "enum", group: "Data", label: "Category order", default: "data", options: opt([["data", "As they come"], ["asc", "A – Z"], ["desc", "Z – A"]]), visibleWhen: (p) => p.xType !== "number" && p.xType !== "time" },
        maxCategories: { type: "number", group: "Data", label: "Most categories", default: 2000, min: 1, max: 100000, step: 100 },

        // ---- Series ----
        series: {
            type: "list", group: "Series", label: "Series", noun: "series", default: [],
            help: "Optional: one per series you want to style, name, put on the right axis or drive from Logic. Series that come from the data and are not listed take the chart's defaults and the palette. Each has its own Update node and events (Events tab).",
            item: {
                fields: SERIES_FIELDS, noun: "series", target: true,
                create: (items) => {
                    let n = items.length + 1;
                    const ids = new Set(items.map((x) => x && x.id));
                    while (ids.has("s" + n)) n++;
                    return Object.assign(seriesDefaults(), { id: "s" + n, name: "Series " + n });
                },
                actions: {
                    setData: { label: "Set data", help: "Replaces the series' data: values in the order of the categories, an object { category: value }, or [{ x, y }].", example: "[12, 18, 9]  or  { \"Floor 1\": 12, \"Floor 2\": 18 }  or  [{ \"x\": 1727852400000, \"y\": 21.5 }]" },
                    setPoint: { label: "Set a point", help: "Sets the value at one category / x.", params: { x: "string", y: "number" }, example: "{ \"x\": \"Floor 2\", \"y\": 18 }" },
                    appendPoint: { label: "Append a point", help: "Adds a point (a new category / x, or one more at the same x: they are aggregated).", params: { x: "string", y: "number" }, example: "{ \"x\": 1727852400000, \"y\": 21.5 }  or  21.5 (the next x)" },
                    clear: { label: "Clear", help: "Empties this series." },
                    show: { label: "Show", help: "Shows this series." },
                    hide: { label: "Hide", help: "Hides this series; its data is kept." }
                },
                events: {
                    pointClick: { label: "On Point Click", payload: { x: "string", y: "number", index: "number" }, help: "A click on one of its columns / points: the category or x, and the value." }
                }
            }
        },

        // ---- Visual: the defaults of every series ----
        mark: { type: "enum", group: "Visual", label: "Default mark", default: "column", options: opt(MARKS), help: "What a series is drawn as unless it says otherwise: a mix is a combo chart." },
        stacking: { type: "enum", group: "Visual", label: "Columns and areas", default: "clustered", options: opt(STACKINGS) },
        orientation: { type: "enum", group: "Visual", label: "Direction", default: "vertical", options: opt([["vertical", "Vertical (columns)"], ["horizontal", "Horizontal (bars; columns only)"]]), help: "Horizontal: a category or number x, the left axis only." },
        gap: { type: "number", group: "Visual", section: "Columns", label: "Space between categories", default: 30, min: 0, max: 90, step: 5, unit: "%" },
        barGap: { type: "number", group: "Visual", section: "Columns", label: "Space between columns", default: 2, min: 0, max: 20, step: 1, unit: "px", visibleWhen: (p) => p.stacking === "clustered" },
        maxBarWidth: { type: "number", group: "Visual", section: "Columns", label: "Widest column", default: 0, min: 0, max: 400, step: 5, unit: "px", help: "0 = no limit." },
        radius: { type: "number", group: "Visual", section: "Columns", label: "Corner radius", default: 2, min: 0, max: 20, unit: "px" },
        lineWidth: { type: "number", group: "Visual", section: "Lines", label: "Line width", default: 2, min: 0.5, max: 12, step: 0.5, unit: "px" },
        fillOpacity: { type: "number", group: "Visual", section: "Lines", label: "Area fill opacity", default: 0.3, min: 0, max: 1, step: 0.05 },
        markers: { type: "boolean", group: "Visual", section: "Points", label: "Markers on lines", default: false },
        pointSize: { type: "number", group: "Visual", section: "Points", label: "Marker size", default: 4, min: 1, max: 20, unit: "px" },

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
        xLabelRotate: { type: "enum", group: "X axis", section: "Labels", label: "Label angle", default: "auto", options: opt([["auto", "Automatic"], ["0", "Horizontal"], ["45", "45°"], ["90", "Vertical"]]), visibleWhen: (p) => p.xShow !== false },
        xLabelColor: { type: "color", group: "X axis", section: "Labels", label: "Label colour", default: "", tokens: "colors", visibleWhen: (p) => p.xShow !== false },
        timeZone: { type: "enum", group: "X axis", section: "Time", label: "Time zone", default: "local", options: opt([["local", "The viewer's (local)"], ["utc", "UTC"]]), visibleWhen: (p) => p.xType === "time" || p.xType === "auto" },
        timeFormat: { type: "enum", group: "X axis", section: "Time", label: "Time format", default: "24h", options: opt([["24h", "24 hours (14:05)"], ["12h", "12 hours (2:05 PM)"]]), visibleWhen: (p) => p.xType === "time" || p.xType === "auto" },
        ...axisProps("y", "Y axis", "Show the Y axis"),
        ...axisProps("y2", "Secondary Y axis", "Show the secondary axis"),

        // ---- Data labels ----
        labels: { type: "boolean", group: "Data labels", label: "Data labels", default: false },
        labelPos: { type: "enum", group: "Data labels", label: "Position", default: "auto", options: opt([["auto", "Automatic"], ["outside", "Outside end"], ["inside", "Inside end"], ["center", "Centre"]]), visibleWhen: (p) => p.labels },
        labelSize: { type: "number", group: "Data labels", label: "Size", default: 11, min: 8, max: 24, unit: "px", visibleWhen: (p) => p.labels },
        labelColor: { type: "color", group: "Data labels", label: "Colour", default: "", tokens: "colors", help: "Empty: the text colour (white on a dark column).", visibleWhen: (p) => p.labels },

        // ---- Tooltip ----
        tooltipShows: { type: "enum", group: "Tooltip", label: "Shows", default: "shared", options: opt([["shared", "Every series at that category / x"], ["single", "Only the one under the cursor"], ["off", "Nothing"]]) },
        crosshair: { type: "enum", group: "Tooltip", label: "Highlight", default: "band", options: opt([["band", "A band behind the category"], ["line", "A line"], ["none", "None"]]), visibleWhen: (p) => p.tooltipShows !== "off" },

        // ---- Reference lines ----
        references: {
            type: "list", group: "Reference lines", label: "Reference lines and bands", noun: "reference", default: [],
            help: "A limit, a target, or a band (from – to) on an axis.", item: { fields: REFERENCE_FIELDS, noun: "reference" }
        },

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
        exportTitle: { type: "string", group: "Export", label: "Title", default: "", help: "{title} in the file name. Empty: the chart's title." },
        exportFilename: { type: "string", group: "Export", label: "File name expression", default: "", bindable: false, help: "Variables: {title}, {date}, {time}, {year}, {month}, {day}, {format}." }
    },

    parts: { chart: part("Chart container", "chart"), legend: part("Legend", "legend") },

    events: {
        hover: { label: "On Hover", payload: { x: "string", values: "object" }, help: "The category / x under the cursor and each series' value there." },
        legendToggle: { label: "On Series Toggle", payload: { series: "string", visible: "boolean" }, help: "The viewer showed / hid a series in the legend." }
    },

    actions: {
        setRows: { label: "Set rows", help: "Replaces the data with rows: an array of objects, mapped by the Data fields (x, y, split).", example: "[{ \"floor\": \"F1\", \"hour\": \"10:00\", \"kwh\": 12 }, …]" },
        appendRows: { label: "Append rows", help: "Adds rows to the data (the same x and series are aggregated).", example: "[{ \"floor\": \"F1\", \"hour\": \"11:00\", \"kwh\": 14 }]" },
        clearAll: { label: "Clear every series" },
        exportData: { label: "Export (download)", params: { format: "string" }, help: "Downloads the data: csv | xlsx | png.", example: "{ \"format\": \"xlsx\" }" },
        exportPNG: { label: "Export PNG", help: "Downloads the chart as an image." }
    },

    view: class extends ChartElement {
        static styles = [...ChartElement.styles, css`
            .c-head { flex: 0 0 auto; padding: 10px 14px 0; min-width: 0; }
            .c-title { font-size: var(--ct-size, 14px); font-weight: 600; color: var(--fg); line-height: 1.3; }
            .c-sub { font-size: 12px; color: var(--fg-muted); margin-top: 2px; }
            .c-main { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: row; min-width: 0; }
            .c-main > .plot { flex: 1 1 auto; min-width: 0; }
            .legend.v { flex-direction: column; align-items: stretch; flex-wrap: nowrap; overflow: auto; max-width: 40%; }
            .legend.inside { position: absolute; z-index: 4; padding: 4px 8px; background: var(--panel); border: 1px solid var(--bd); border-radius: var(--r, 4px); max-width: 60%; }
            .legend.inside.tl { left: 10px; top: 8px; } .legend.inside.tr { right: 36px; top: 8px; }
            .legend.inside.bl { left: 10px; bottom: 8px; } .legend.inside.br { right: 10px; bottom: 8px; }
            .lg-item { font-size: var(--lg-size, 12px); }
            .legend { padding-left: 14px; }
            .legend.v { padding: 8px 10px; max-height: none; }
            .lg-item .lg-swatch.sw-sq { width: 10px; height: 10px; border-radius: 2px; }
            .lg-item .lg-swatch.sw-dot { width: 9px; height: 9px; border-radius: 50%; }
            .lg-item.off { opacity: 0.45; }
            .tooltip .tt-x { color: var(--fg-muted); font-size: 11px; margin-bottom: 4px; }
        `];

        _canon = [];            // the data, as canonical rows { x, y, s }
        _frame = { xType: "category", cats: [], series: [] };
        _hidden = new Set();
        _geo = null;
        _hoverAt = null;        // { i, key } under the cursor
        _sl = null;
        _aligned = null;
        // declared HERE on purpose: the host calls propsChanged() while the base constructor runs, and the field initialisers run
        // after it: anything the first call set and is not declared would survive them while the declared fields are reset
        _sig = "";
        _demoDone = false;
        _lastHover = 0;

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

        prepareData() {
            const rows = this.p.rows;
            const print = this._rowsPrint(rows) + "|" + [this.p.xField, this.p.yField, this.p.splitField].join("|");
            if (print !== this._sig) {
                const had = this._sig !== "" && this._sig !== undefined && !/^\|/.test(this._sig);
                this._sig = print;
                // a typed / bound list of rows is the data: a change of it replaces what a Set rows from Logic put in; an empty one that
                // stays empty touches nothing (the editor's sample data, rows from Logic)
                if (Array.isArray(rows) && (rows.length || had)) this._canon = this._normalize(rows);
            }
            this._ensureDemo();
            this._rebuild();
        }

        // the editor shows sample data on an empty chart (it is known to be the editor only once the host has set it up: also checked at draw)
        _ensureDemo() {
            if (this.isEditor && !this._canon.length && !this._demoDone && !(Array.isArray(this.p.rows) && this.p.rows.length)) { this._demoDone = true; this._canon = this._demoRows(); return true; }
            return false;
        }

        _demoRows() {
            const rows = [], cats = ["Floor 1", "Floor 2", "Floor 3", "Floor 4"], v = [[42, 55, 38, 61], [30, 41, 47, 39]];
            ["Lighting", "HVAC"].forEach((name, si) => cats.forEach((c, i) => rows.push({ x: c, y: v[si][i], s: name })));
            return rows;
        }

        _rebuild() {
            const f = buildFrame(this._canon, { x: "x", y: "y", split: "s" }, { xType: this.p.xType, aggregate: this.p.aggregate, order: this.p.categoryOrder, maxCategories: this.p.maxCategories });
            this._frame = f;
            this._sl = null;
            this._aligned = null;
            this.requestUpdate();
            this.scheduleDraw();
        }

        // every series on the same x positions: category i, or the sorted union of the x values (a number / a time)
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

        // ---- the series ---------------------------------------------------------------------------
        seriesList() {
            if (this._sl) return this._sl;
            const items = (Array.isArray(this.p.series) ? this.p.series : []).filter((s) => s && typeof s === "object");
            const frame = this._frame.series, claimed = new Set();
            const out = [];
            const resolve = (o, data, i) => {
                const x = Object.assign({}, seriesDefaults(), o);
                x._i = i; x._key = String(x.id || x.name || "#" + i); x._data = data || null;
                return x;
            };
            items.forEach((it) => {
                const hit = frame.filter((d) => d.key === it.id || d.key === it.name || (it.field && d.key === it.field))[0] || null;
                if (hit) claimed.add(hit.key);
                out.push(resolve(it, hit, out.length));
            });
            frame.forEach((d) => { if (!claimed.has(d.key)) out.push(resolve({ id: d.key, name: d.name }, d, out.length)); });
            return (this._sl = out);
        }

        findSeries(ref) {
            const list = this.seriesList();
            if (ref && typeof ref === "object" && ref.id !== undefined) ref = ref.id;
            if (ref === undefined || ref === null || ref === "") return list[0] || null;
            return list.find((s) => s.id && s.id === String(ref)) || list.find((s) => s.name === String(ref)) || (/^\d+$/.test(String(ref)) ? list[Number(ref)] : null) || null;
        }

        _target(s) { return { list: "series", id: s.id || s._key }; }

        colorOf(s) {
            const own = s ? this._tok(s.color) : "";
            return own || this.seriesColor(s ? s._i : 0);
        }
        _markOf(s) { const m = s.mark || this.p.mark || "column"; return m === "bar" ? "column" : m; }
        _num(v, d) { return numOr(v, d); }

        // a colour as saved: a hex / rgb as it is, a {token:colors.…} as the theme's value now (the host resolves the props of the
        // chart itself, not the fields of the items inside a list)
        _tok(v) {
            if (typeof v !== "string") return "";
            const m = /^\s*\{token:([^}]+)\}\s*$/.exec(v);
            if (!m) return v.trim();
            const r = theme.token(m[1].trim());
            return typeof r === "string" ? r : "";
        }

        // the series' values on the aligned x positions (null: no data)
        _col(s) {
            const a = this._align();
            return s._data ? a.cols.get(s._data.key) || null : null;
        }

        _visible() { return this.seriesList().filter((s) => s.visible !== false && !this._hidden.has(s._key) && this._col(s)); }

        // ---- actions ------------------------------------------------------------------------------
        setRows(params) {
            const rows = Array.isArray(params) ? params : params && Array.isArray(params.rows) ? params.rows : params && Array.isArray(params.payload) ? params.payload : null;
            if (!rows) return;
            this._canon = this._normalize(rows);
            this._rebuild();
        }

        appendRows(params) {
            const rows = Array.isArray(params) ? params : params && Array.isArray(params.rows) ? params.rows : params && typeof params === "object" ? [params] : null;
            if (!rows) return;
            this._canon = this._canon.concat(this._normalize(rows));
            this._rebuild();
        }

        clearAll() { this._canon = []; this._demoDone = true; this._rebuild(); }

        _own(s) { return s.id || s._key; }
        _dropSeries(key) { this._canon = this._canon.filter((r) => r.s !== key); }

        setData(params, target) {
            const s = this.findSeries(target); if (!s) return;
            const key = this._own(s), rows = [];
            let v = params && !Array.isArray(params) && typeof params === "object" && params.data !== undefined ? params.data : params;
            if (Array.isArray(v)) {
                v.forEach((p, i) => {
                    if (p && typeof p === "object") rows.push({ x: p.x !== undefined ? p.x : p.category !== undefined ? p.category : p.name, y: p.y !== undefined ? p.y : p.value, s: key });
                    else rows.push({ x: this._frame.cats[i] !== undefined ? this._frame.cats[i] : String(i + 1), y: p, s: key });
                });
            } else if (v && typeof v === "object") Object.keys(v).forEach((k) => rows.push({ x: k, y: v[k], s: key }));
            else return;
            this._dropSeries(key);
            this._canon = this._canon.concat(rows);
            this._rebuild();
        }

        setPoint(params, target) {
            const s = this.findSeries(target); if (!s || !params || typeof params !== "object") return;
            const key = this._own(s), x = params.x !== undefined ? params.x : params.category !== undefined ? params.category : params.name;
            const y = params.y !== undefined ? params.y : params.value;
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
            const key = this._own(s);
            if (params !== null && typeof params === "object" && !Array.isArray(params)) {
                const x = params.x !== undefined ? params.x : params.category !== undefined ? params.category : params.name;
                this._canon.push({ x, y: params.y !== undefined ? params.y : params.value, s: key });
            } else if (Array.isArray(params)) params.forEach((p) => this.appendPoint(p, target));
            else if (Number.isFinite(Number(params))) this._canon.push({ x: String(this._frame.cats.length + 1), y: Number(params), s: key });
            else return;
            this._rebuild();
        }

        clear(params, target) { const s = this.findSeries(target); if (!s) return; this._dropSeries(this._own(s)); this._rebuild(); }
        show(params, target) { const s = this.findSeries(target); if (!s) return; this._hidden.delete(s._key); this.requestUpdate(); this.scheduleDraw(); }
        hide(params, target) { const s = this.findSeries(target); if (!s) return; this._hidden.add(s._key); this.requestUpdate(); this.scheduleDraw(); }

        // ---- numbers ------------------------------------------------------------------------------
        _spec(o) { return { notation: o.notation || "standard", decimals: o.decimals || "auto", separators: o.separators || "locale", thousands: o.thousands !== false }; }
        _fmt(v, s) { return formatValue(v, this._spec(s || {}), (s && s.unit) || ""); }
        _axisSpec(side) { return { notation: this.p[side + "Notation"] || "standard", decimals: this.p[side + "Decimals"] || "auto" }; }
        _textColor() { return this._tok(this.p.textColor); }

        _xLabel(i, step) {
            const f = this._frame, xs = this._align().xs;
            if (f.xType === "category") return f.cats[i] === undefined ? "" : String(f.cats[i]);
            if (f.xType === "time") return this.fmtTick(xs[i], step || 86400000, false);
            return formatValue(xs[i], { notation: "standard", decimals: "auto" }, "");
        }

        // ---- the legend ---------------------------------------------------------------------------
        _legendValue(s) {
            const how = this.p.legendValue;
            if (!how || how === "none") return "";
            const y = this._col(s);
            if (!y) return "";
            let n = 0, sum = 0, last = NaN, mn = Infinity, mx = -Infinity;
            for (let i = 0; i < y.length; i++) { const v = y[i]; if (v === v) { n++; sum += v; last = v; if (v < mn) mn = v; if (v > mx) mx = v; } }
            if (!n) return "";
            return this._fmt(how === "sum" ? sum : how === "avg" ? sum / n : how === "min" ? mn : how === "max" ? mx : last, s);
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
            this._hoverAt = null;
            this.requestUpdate();
            this.scheduleDraw();
        }

        // ---- the drawing --------------------------------------------------------------------------
        // The geometry is made in "logical" terms: c along the categories (0 = the plot's start), v along the values; _xy(c, v)
        // puts them on the canvas for a vertical or a horizontal chart.
        draw() {
            if (!this.ctx || !this.canvas) return;
            const { w, h } = this._layoutSize();
            if (w <= 0 || h <= 0) return;
            const ctx = this.ctx;
            if (this._ensureDemo()) this._rebuild();
            this._clearCanvas(ctx, w, h);
            this._geo = null;
            const vis = this._visible();
            const f = this._frame, al = this._align(), n = al.xs.length;
            if (!vis.length || !n) return;
            const c = this._colors(), font = c.font, fs = numOr(this.p.fontSize, 11);
            const txt = this._textColor() || c.text, strong = this._textColor() || c.strong;
            const horizontal = this.p.orientation === "horizontal" && f.xType !== "time" && vis.some((s) => this._markOf(s) === "column");
            const sideOf = (s) => (horizontal ? "left" : s.axis === "right" ? "right" : "left");
            const stackMode = this.p.stacking || "clustered";

            // -- stacks: columns and areas pile up (by mode); the others plot their own values
            const stackable = vis.filter((s) => { const m = this._markOf(s); return m === "column" || m === "area"; });
            const stackBy = (side) => stackable.filter((s) => sideOf(s) === side);
            const stackOf = new Map();
            ["left", "right"].forEach((side) => {
                const list = stackBy(side);
                if (!list.length) return;
                const res = stackColumns(list.map((s) => ({ y: this._col(s), group: s.stackGroup || "" })), n, stackMode === "none" ? "none" : stackMode);
                list.forEach((s, i) => stackOf.set(s._key, res[i]));
            });
            // areas never sit side by side: a "clustered" area is an overlapping one
            vis.forEach((s) => { if (this._markOf(s) === "area" && stackMode === "clustered") { const y = this._col(s); stackOf.set(s._key, { lo: new Float64Array(n).map((_, i) => (y[i] === y[i] ? 0 : NaN)), hi: y, slot: 0, slots: 1 }); } });

            // -- the value axes
            const axes = {};
            ["left", "right"].forEach((side) => {
                const mine = vis.filter((s) => sideOf(s) === side);
                if (!mine.length) return;
                const p = (k) => this.p[(side === "left" ? "y" : "y2") + k];
                const arrays = [];
                let zero = false;
                mine.forEach((s) => {
                    const st = stackOf.get(s._key), m = this._markOf(s);
                    if (st) { arrays.push(st.lo, st.hi); zero = true; } else arrays.push(this._col(s));
                    if (m === "column" || m === "area") zero = true;
                });
                this._references().filter((r) => (r.axis === "right" ? "right" : "left") === side).forEach((r) => { arrays.push([r.value]); if (r.kind === "band" && Number.isFinite(r.to)) arrays.push([r.to]); });
                let { min, max } = extent(arrays);
                if (!Number.isFinite(min)) return;
                const log = p("Scale") === "log";
                if (zero && !log) { if (min > 0) min = 0; if (max < 0) max = 0; }
                const sMin = numOr(p("SoftMin"), NaN), sMax = numOr(p("SoftMax"), NaN), hMin = numOr(p("Min"), NaN), hMax = numOr(p("Max"), NaN);
                if (Number.isFinite(sMin) && sMin < min) min = sMin;
                if (Number.isFinite(sMax) && sMax > max) max = sMax;
                if (stackMode === "percent" && mine.some((s) => stackOf.has(s._key))) { min = Math.min(min, 0); max = Math.max(max, 100); }
                if (Number.isFinite(hMin)) min = hMin;
                if (Number.isFinite(hMax)) max = hMax;
                let ticks, lo, hi;
                if (log) { const pos = Math.max(min, 1e-9); ticks = logTicks(pos, Math.max(max, pos * 10)); lo = ticks[0] || pos; hi = ticks[ticks.length - 1] || max; if (Number.isFinite(hMin)) lo = hMin; if (Number.isFinite(hMax)) hi = hMax; }
                else {
                    const nt = niceTicks(min, max, 5);
                    lo = Number.isFinite(hMin) ? hMin : nt.min; hi = Number.isFinite(hMax) ? hMax : nt.max;
                    ticks = nt.ticks.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9);
                }
                axes[side] = { side, lo, hi, ticks, log, show: side === "left" ? this.p.yShow !== false : this.p.y2Show !== false,
                    title: p("Title") || "", grid: p("Grid") !== false && (side === "left" || p("Grid") === true), spec: this._axisSpec(side === "left" ? "y" : "y2"),
                    color: this._tok(p("LabelColor")) || txt };
            });
            const showRight = !!(axes.right && axes.right.show && !horizontal);

            // -- margins from the labels
            ctx.font = `${fs}px ${font}`;
            const tickText = (ax, v) => formatValue(v, ax.spec, "");
            const valLabelW = (ax) => (ax ? Math.max(...ax.ticks.map((t) => ctx.measureText(tickText(ax, t)).width), 8) : 0);
            const titleH = fs + 6;
            const catLabels = [];
            let step = 1;
            if (f.xType === "time") step = getNiceTimeStep((al.xs[n - 1] - al.xs[0]) || 1, 6);
            for (let i = 0; i < n; i++) catLabels.push(this._xLabel(i, step));
            const widest = (a) => a.reduce((m, t) => Math.max(m, ctx.measureText(t).width), 0);
            let padL = 8, padR = 10, padT = 10, padB = 8;
            const ax = axes.left;
            const xTitle = this.p.xTitle || "";
            const showCat = this.p.xShow !== false;
            const valShow = !!(ax && ax.show);
            let xRot = 0;
            if (!horizontal) {
                if (valShow) padL += valLabelW(ax) + 8 + (ax.title ? titleH : 0);
                if (showRight) padR += valLabelW(axes.right) + 8 + (axes.right.title ? titleH : 0);
                if (showCat) {
                    const slot = (w - padL - padR) / Math.max(1, f.xType === "category" ? n : Math.min(n, 8));
                    const rotate = this.p.xLabelRotate || "auto", lw = widest(catLabels);
                    xRot = rotate === "auto" ? (lw + 6 > slot && f.xType === "category" ? 45 : 0) : Number(rotate) || 0;
                    const lh = xRot ? Math.sin((xRot * Math.PI) / 180) * Math.min(lw, 140) + fs : fs + 4;
                    padB += lh + 8 + (xTitle ? titleH : 0);
                }
            } else {
                if (showCat) padL += Math.min(widest(catLabels), (w * 0.4)) + 10 + (xTitle ? titleH : 0);
                if (valShow) padB += fs + 12 + (ax.title ? titleH : 0);
            }
            const plotX = padL, plotY = padT, plotW = Math.max(10, w - padL - padR), plotH = Math.max(10, h - padT - padB);
            const catLen = horizontal ? plotH : plotW, valLen = horizontal ? plotW : plotH;
            const xy = (cc, vv) => (horizontal ? [plotX + vv, plotY + cc] : [plotX + cc, plotY + plotH - vv]);
            const vpos = (axis, v) => {
                if (axis.log) { const a = Math.log10(Math.max(axis.lo, 1e-9)), b = Math.log10(Math.max(axis.hi, axis.lo * 1.0001)); return ((Math.log10(Math.max(v, 1e-9)) - a) / (b - a)) * valLen; }
                return ((v - axis.lo) / (axis.hi - axis.lo || 1)) * valLen;
            };

            // -- the category scale
            const hasColumn = vis.some((s) => this._markOf(s) === "column");
            let cpos, slotLen, xLo = 0, xHi = 1;
            if (f.xType === "category") {
                slotLen = catLen / n;
                cpos = (i) => (i + 0.5) * slotLen;
            } else {
                xLo = al.xs[0]; xHi = al.xs[n - 1];
                let minD = Infinity;
                for (let i = 1; i < n; i++) minD = Math.min(minD, al.xs[i] - al.xs[i - 1]);
                const pad = hasColumn ? (Number.isFinite(minD) ? minD / 2 : 0.5) : 0;
                if (xHi === xLo) { xLo -= 1; xHi += 1; }
                xLo -= pad; xHi += pad;
                const k = catLen / (xHi - xLo);
                cpos = (i) => (al.xs[i] - xLo) * k;
                slotLen = Number.isFinite(minD) ? minD * k : catLen / 2;
            }

            // -- the grid
            ctx.save();
            ctx.lineWidth = 1;
            ctx.font = `${fs}px ${font}`;
            const gridCol = c.grid;
            [axes.left, showRight ? axes.right : null].forEach((a) => {
                if (!a || !a.show) return;
                a.ticks.forEach((t) => {
                    const vp = vpos(a, t);
                    if (vp < -0.5 || vp > valLen + 0.5) return;
                    const [x, y] = xy(0, vp);
                    if (a.grid) {
                        ctx.strokeStyle = gridCol; ctx.setLineDash([]);
                        ctx.beginPath();
                        if (horizontal) { ctx.moveTo(x, plotY); ctx.lineTo(x, plotY + plotH); } else { ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW, y); }
                        ctx.stroke();
                    }
                    ctx.fillStyle = a.color;
                    const text = tickText(a, t);
                    if (horizontal) { ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(text, x, plotY + plotH + 6); }
                    else if (a.side === "left") { ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(text, plotX - 6, y); }
                    else { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, plotX + plotW + 6, y); }
                });
            });
            ctx.restore();
            // the axis line at the base of the values (0)
            ctx.save();
            ctx.strokeStyle = c.grid; ctx.lineWidth = 1;
            if (axes.left) {
                const base = vpos(axes.left, Math.max(axes.left.lo, Math.min(0, axes.left.hi)));
                const [bx, by] = xy(0, base);
                ctx.strokeStyle = this._textColor() || c.text;
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                if (horizontal) { ctx.moveTo(bx, plotY); ctx.lineTo(bx, plotY + plotH); } else { ctx.moveTo(plotX, by); ctx.lineTo(plotX + plotW, by); }
                ctx.stroke();
            }
            ctx.restore();

            // -- reference bands (under the marks)
            const refs = this._references();
            const refColor = (r) => this._tok(r.color) || this.statusColor("error");
            refs.filter((r) => r.kind === "band").forEach((r) => {
                const a = axes[r.axis === "right" ? "right" : "left"] || axes.left;
                if (!a || !Number.isFinite(r.to)) return;
                const v0 = vpos(a, Math.min(r.value, r.to)), v1 = vpos(a, Math.max(r.value, r.to));
                const [x0, y0] = xy(0, v0), [x1, y1] = xy(catLen, v1);
                ctx.save();
                ctx.globalAlpha = Number.isFinite(r.opacity) ? r.opacity : 0.12;
                ctx.fillStyle = refColor(r);
                ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
                ctx.restore();
                if (r.label) { ctx.save(); ctx.fillStyle = refColor(r); ctx.font = `${fs}px ${font}`; ctx.textAlign = "left"; ctx.textBaseline = "top"; const [lx, ly] = xy(4, v1); ctx.fillText(r.label, horizontal ? Math.min(x0, x1) + 4 : lx, horizontal ? plotY + 4 : Math.min(y0, y1) + 3); ctx.restore(); }
            });

            // -- the hover band / line (behind the marks)
            const hi = this._hoverAt;
            if (hi && this.p.tooltipShows !== "off" && hi.i >= 0 && hi.i < n && this.p.crosshair !== "none") {
                const cc = cpos(hi.i);
                ctx.save();
                if (this.p.crosshair === "line") { ctx.strokeStyle = txt; ctx.globalAlpha = 0.5; ctx.setLineDash([4, 3]); ctx.beginPath(); const [a1, b1] = xy(cc, 0), [a2, b2] = xy(cc, valLen); ctx.moveTo(a1, b1); ctx.lineTo(a2, b2); ctx.stroke(); }
                else { ctx.fillStyle = c.band; ctx.globalAlpha = 0.9; const [a1, b1] = xy(cc - slotLen / 2, 0), [a2, b2] = xy(cc + slotLen / 2, valLen); ctx.fillRect(Math.min(a1, a2), Math.min(b1, b2), Math.abs(a2 - a1), Math.abs(b2 - b1)); }
                ctx.restore();
            }

            // -- the marks, in the order of the series (the first under the others)
            const colSeries = vis.filter((s) => this._markOf(s) === "column");
            const slots = (() => {
                if (stackMode === "clustered") return colSeries.length || 1;
                const groups = new Set(colSeries.map((s) => s.stackGroup || "")); return groups.size || 1;
            })();
            const labelsOn = (s) => (s.labels === "on" ? true : s.labels === "off" ? false : !!this.p.labels);
            const labelDraw = [];
            const catGap = Math.max(0, Math.min(0.9, numOr(this.p.gap, 30) / 100));
            const maxBar = numOr(this.p.maxBarWidth, 0);
            // a column with the end away from the base rounded (positive: up / right; negative: down / left)
            const rectPath = (x, y, ww, hh, r, positive) => {
                r = Math.max(0, Math.min(r, Math.abs(ww) / 2, Math.abs(hh) / 2));
                ctx.beginPath();
                if (!r || !ctx.roundRect) { ctx.rect(x, y, ww, hh); return; }
                const radii = horizontal ? (positive ? [0, r, r, 0] : [r, 0, 0, r]) : (positive ? [r, r, 0, 0] : [0, 0, r, r]);
                ctx.roundRect(x, y, ww, hh, radii);
            };
            const geoSeries = [];
            let colIndex = 0;
            vis.forEach((s) => {
                const m = this._markOf(s), color = this.colorOf(s), a = axes[sideOf(s)] || axes.left, y = this._col(s), st = stackOf.get(s._key);
                const alpha = this._num(s.opacity, 1);
                ctx.save();
                ctx.globalAlpha = alpha;
                if (m === "column") {
                    let slot = 0;
                    if (stackMode === "clustered") slot = colIndex++;
                    else if (st && st.slots > 1) slot = st.slot;
                    const nSlots = stackMode === "clustered" ? slots : (st && st.slots > 1 ? st.slots : 1);
                    const inner = stackMode === "clustered" ? numOr(this.p.barGap, 2) : 2;
                    const cat = slotLen * (1 - catGap);
                    let each = (cat - inner * (nSlots - 1)) / nSlots;
                    if (maxBar > 0) each = Math.min(each, maxBar);
                    const groupW = each * nSlots + inner * (nSlots - 1);
                    const rad = this._num(s.radius, this._num(this.p.radius, 2));
                    ctx.fillStyle = color;
                    for (let i = 0; i < n; i++) {
                        if (!(y[i] === y[i])) continue;
                        const lo = st ? st.lo[i] : 0, hiV = st ? st.hi[i] : y[i];
                        if (!(lo === lo) || !(hiV === hiV)) continue;
                        const c0 = cpos(i) - groupW / 2 + slot * (each + inner);
                        const v0 = vpos(a, Math.max(a.lo, Math.min(lo, hiV))), v1 = vpos(a, Math.min(a.hi, Math.max(lo, hiV)));
                        const [x0, y0] = xy(c0, v0), [x1, y1] = xy(c0 + each, v1);
                        const bx = Math.min(x0, x1), by = Math.min(y0, y1), bw = Math.abs(x1 - x0), bh = Math.abs(y1 - y0);
                        if (bw <= 0 || bh <= 0) continue;
                        // only the end of a pile (or a lone column) is rounded
                        const top = !st || stackMode === "none" || stackMode === "clustered" || this._isTop(stackBy(sideOf(s)), s, i, stackOf, hiV);
                        rectPath(bx, by, bw, bh, top ? rad : 0, hiV >= 0);
                        ctx.fill();
                        if (labelsOn(s)) labelDraw.push({ s, i, x: bx, y: by, w: bw, h: bh, v: y[i], color, stacked: !!st && stackMode !== "clustered" && stackMode !== "none" });
                    }
                } else if (m === "area" || m === "line" || m === "step") {
                    const lw = this._num(s.width, numOr(this.p.lineWidth, 2));
                    const pts = [];
                    for (let i = 0; i < n; i++) { const v = st && m === "area" ? st.hi[i] : y[i]; if (v === v) pts.push({ i, c: cpos(i), v: vpos(a, v), lo: st && m === "area" ? vpos(a, st.lo[i]) : vpos(a, Math.max(a.lo, Math.min(0, a.hi))) }); }
                    const connect = f.xType !== "category";
                    const runs = [];
                    let cur = [];
                    pts.forEach((p, k) => { if (k && !connect && p.i !== pts[k - 1].i + 1) { runs.push(cur); cur = []; } cur.push(p); });
                    if (cur.length) runs.push(cur);
                    const trace = (run, fwd) => {
                        const seq = fwd ? run : run.slice().reverse();
                        seq.forEach((p, k) => {
                            const [x, yy] = xy(p.c, fwd ? p.v : p.lo);
                            if (k === 0) { if (!fwd) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); return; }
                            if (m === "step") { const prev = seq[k - 1]; const [px, py] = xy(p.c, fwd ? prev.v : prev.lo); ctx.lineTo(px, py); }
                            ctx.lineTo(x, yy);
                        });
                    };
                    if (m === "area") {
                        ctx.fillStyle = this.hexToRgba(color, this._num(s.fillOpacity, numOr(this.p.fillOpacity, 0.3)));
                        runs.forEach((run) => { if (run.length < 1) return; ctx.beginPath(); trace(run, true); trace(run, false); ctx.closePath(); ctx.fill(); });
                    }
                    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.setLineDash(dashOf(s.dash));
                    runs.forEach((run) => { ctx.beginPath(); trace(run, true); ctx.stroke(); });
                    ctx.setLineDash([]);
                    const showPts = s.points === "on" || (s.points !== "off" && !!this.p.markers);
                    if (showPts) pts.forEach((p) => { const [x, yy] = xy(p.c, p.v); this._marker(ctx, s.pointShape, x, yy, this._num(s.pointSize, numOr(this.p.pointSize, 4)), color); });
                    if (labelsOn(s)) pts.forEach((p) => { const [x, yy] = xy(p.c, p.v); labelDraw.push({ s, i: p.i, x, y: yy, w: 0, h: 0, v: y[p.i], color, line: true }); });
                } else if (m === "point") {
                    const size = this._num(s.pointSize, numOr(this.p.pointSize, 4)) + 1;
                    for (let i = 0; i < n; i++) { if (!(y[i] === y[i])) continue; const [x, yy] = xy(cpos(i), vpos(a, y[i])); this._marker(ctx, s.pointShape, x, yy, size, color); if (labelsOn(s)) labelDraw.push({ s, i, x, y: yy, w: 0, h: 0, v: y[i], color, line: true }); }
                }
                ctx.restore();
                geoSeries.push({ s, m, a });
            });

            // -- reference lines (over the marks)
            refs.filter((r) => r.kind !== "band").forEach((r) => {
                const a = axes[r.axis === "right" ? "right" : "left"] || axes.left;
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

            // -- data labels
            if (labelDraw.length) {
                const ls = numOr(this.p.labelSize, 11), lc = this._tok(this.p.labelColor);
                ctx.save();
                ctx.font = `${ls}px ${font}`;
                labelDraw.forEach((d) => {
                    const text = this._fmt(d.v, d.s);
                    let pos = this.p.labelPos || "auto";
                    if (pos === "auto") pos = d.stacked ? "center" : d.line ? "outside" : "outside";
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

            // -- the category axis labels and the axis titles
            ctx.save();
            ctx.font = `${fs}px ${font}`;
            const xCol = this._tok(this.p.xLabelColor) || txt;
            ctx.fillStyle = xCol;
            if (showCat) {
                const every = this._labelEvery(catLabels, ctx, catLen, horizontal, xRot, f.xType === "category" ? 1 : 0);
                for (let i = 0; i < n; i += every) {
                    const t = catLabels[i];
                    if (!t) continue;
                    const cc = cpos(i);
                    if (cc < 0 || cc > catLen) continue;
                    if (horizontal) { const [x, yy] = xy(cc, 0); ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillText(this._clip(ctx, t, plotX - 12), plotX - 6, yy); }
                    else {
                        const [x] = xy(cc, 0);
                        if (xRot) { ctx.save(); ctx.translate(x, plotY + plotH + 8); ctx.rotate((xRot * Math.PI) / 180); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(t, 0, 0); ctx.restore(); }
                        else { ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(t, x, plotY + plotH + 6); }
                    }
                }
                if (xTitle) { ctx.fillStyle = txt; ctx.font = `600 ${fs}px ${font}`; if (horizontal) { ctx.save(); ctx.translate(12, plotY + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(xTitle, 0, 0); ctx.restore(); } else { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(xTitle, plotX + plotW / 2, h - 4); } }
            }
            [axes.left, showRight ? axes.right : null].forEach((a) => {
                if (!a || !a.show || !a.title) return;
                ctx.fillStyle = txt; ctx.font = `600 ${fs}px ${font}`;
                if (horizontal) { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(a.title, plotX + plotW / 2, h - 4); }
                else { ctx.save(); ctx.translate(a.side === "left" ? 12 : w - 12, plotY + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(a.title, 0, 0); ctx.restore(); }
            });
            ctx.restore();

            // what a pointer needs
            this._geo = { w, h, plotX, plotY, plotW, plotH, horizontal, n, cpos, slotLen, vis, stackOf, axes, step, catLabels, al, xy, vpos, catLen };
        }

        _references() {
            return (Array.isArray(this.p.references) ? this.p.references : []).filter((r) => r && typeof r === "object")
                .map((r) => ({ kind: r.kind === "band" ? "band" : "line", axis: r.axis === "right" ? "right" : "left", value: numOr(r.value, NaN), to: numOr(r.to, NaN), label: r.label || "", color: r.color, dash: r.dash, width: numOr(r.width, 1.5), opacity: numOr(r.opacity, NaN) }))
                .filter((r) => Number.isFinite(r.value));
        }

        // the end of a pile in category i: no other series of the same pile reaches further out (its end is the rounded one)
        _isTop(list, s, i, stackOf, hiV) {
            const mine = stackOf.get(s._key);
            if (!mine) return true;
            return !list.some((o) => {
                if (o._key === s._key) return false;
                const st = stackOf.get(o._key);
                if (!st || st.slot !== mine.slot || !(st.hi[i] === st.hi[i]) || st.hi[i] === st.lo[i]) return false;
                return hiV >= 0 ? st.hi[i] > mine.hi[i] + 1e-9 : st.lo[i] < mine.lo[i] - 1e-9;
            });
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
        _labelEvery(labels, ctx, len, horizontal, rot, cat) {
            if (!labels.length) return 1;
            const widest = labels.reduce((m, t) => Math.max(m, ctx.measureText(t).width), 0);
            const need = horizontal ? (numOr(this.p.fontSize, 11) + 6) : (rot ? numOr(this.p.fontSize, 11) + 6 : widest + 10);
            const have = len / labels.length;
            return Math.max(1, Math.ceil(need / Math.max(1, have)));
        }

        // ---- the pointer: tooltip, highlight, click -----------------------------------------------
        _local(e) {
            const plot = this._plotEl(), r = plot.getBoundingClientRect(), sx = r.width / (plot.clientWidth || 1) || 1, sy = r.height / (plot.clientHeight || 1) || 1;
            return { x: (e.clientX - r.left) / sx, y: (e.clientY - r.top) / sy };
        }

        _indexAt(L) {
            const g = this._geo;
            if (!g || L.x < g.plotX || L.x > g.plotX + g.plotW || L.y < g.plotY || L.y > g.plotY + g.plotH) return -1;
            const c = g.horizontal ? L.y - g.plotY : L.x - g.plotX;
            let best = -1, bd = Infinity;
            for (let i = 0; i < g.n; i++) { const d = Math.abs(g.cpos(i) - c); if (d < bd) { bd = d; best = i; } }
            return best;
        }

        // the series whose mark is under the pointer in category i (nearest in value)
        _seriesAt(L, i) {
            const g = this._geo;
            let best = null, bd = Infinity;
            g.vis.forEach((s) => {
                const y = this._col(s)[i]; if (!(y === y)) return;
                const st = g.stackOf.get(s._key), a = g.axes[g.horizontal ? "left" : s.axis === "right" ? "right" : "left"] || g.axes.left;
                const v = st ? (st.lo[i] + st.hi[i]) / 2 : y;
                const p = g.xy(g.cpos(i), g.vpos(a, v)), d = g.horizontal ? Math.abs(p[0] - L.x) : Math.abs(p[1] - L.y);
                if (d < bd) { bd = d; best = s; }
            });
            return best;
        }

        onPointerMove(e) {
            if (!this._geo) return;
            const L = this._local(e), i = this._indexAt(L);
            if (i < 0) { this.onPointerLeave(); return; }
            const single = this.p.tooltipShows === "single" ? this._seriesAt(L, i) : null;
            const key = single ? single._key : "";
            if (!this._hoverAt || this._hoverAt.i !== i || this._hoverAt.key !== key) { this._hoverAt = { i, key }; this.draw(); this._emitHover(i); }
            this._showTooltip(L, i, single);
        }

        onPointerLeave() {
            if (this._hoverAt) { this._hoverAt = null; this.draw(); }
            const tip = this.renderRoot.querySelector(".tooltip"); if (tip) tip.style.display = "none";
        }

        _emitHover(i) {
            const now = Date.now();
            if (now - (this._lastHover || 0) < 100 || this.isEditor) return;
            this._lastHover = now;
            const values = {};
            this._visible().forEach((s) => { const v = this._col(s)[i]; if (v === v) values[s.id || s.name] = v; });
            this.emit("hover", { x: this._frame.xType === "category" ? this._frame.cats[i] : this._align().xs[i], values });
        }

        _showTooltip(L, i, single) {
            const tip = this.renderRoot.querySelector(".tooltip");
            if (!tip) return;
            if (this.p.tooltipShows === "off") { tip.style.display = "none"; return; }
            const g = this._geo, f = this._frame;
            const xText = f.xType === "category" ? this._xLabel(i) : f.xType === "time" ? this.fmtTime(g.al.xs[i]) : this._xLabel(i);
            const list = single ? [single] : g.vis;
            let total = 0;
            const rows = list.map((s) => {
                const v = this._col(s)[i];
                if (!(v === v)) return null;
                total += v;
                return `<div class="tooltip-row"><span class="tooltip-dot" style="background:${this.colorOf(s)}"></span><span class="tooltip-name">${this._esc(s.name || s.id)}</span><span class="tooltip-val">${this._esc(this._fmt(v, s))}</span></div>`;
            }).filter(Boolean);
            if (!rows.length) { tip.style.display = "none"; return; }
            const stacked = (this.p.stacking === "stacked") && rows.length > 1;
            tip.innerHTML = `<div class="tt-x">${this._esc(xText)}</div><div class="tooltip-rows">${rows.join("")}${stacked ? `<div class="tooltip-row" style="border-top:1px solid var(--bd);margin-top:3px;padding-top:3px"><span class="tooltip-name">Total</span><span class="tooltip-val">${this._esc(this._fmt(total, list[0]))}</span></div>` : ""}</div>`;
            tip.style.display = "block";
            const tw = tip.offsetWidth, th = tip.offsetHeight, plot = this._plotEl();
            let tx = L.x + 14, ty = L.y + 14;
            if (tx + tw > plot.clientWidth - 4) tx = L.x - tw - 14;
            if (ty + th > plot.clientHeight - 4) ty = Math.max(4, plot.clientHeight - th - 4);
            tip.style.left = Math.max(4, tx) + "px"; tip.style.top = Math.max(4, ty) + "px";
        }

        _esc(t) { return String(t === undefined || t === null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

        onPlotClick(e) {
            if (!this._geo || this.isEditor) return;
            const L = this._local(e), i = this._indexAt(L);
            if (i < 0) return;
            const s = this._seriesAt(L, i);
            if (!s) return;
            const f = this._frame;
            this.emit("pointClick", { x: f.xType === "category" ? f.cats[i] : this._align().xs[i], y: this._col(s)[i], index: i, series: s.id || s.name }, this._target(s));
        }

        // ---- export -------------------------------------------------------------------------------
        _table() {
            const f = this._frame, al = this._align(), vis = this.seriesList().filter((s) => s.visible !== false && !this._hidden.has(s._key) && this._col(s));
            const head = [f.xType === "time" ? "Time" : (this.p.xField || "x")].concat(vis.map((s) => s.name || s.id));
            const rows = [];
            for (let i = 0; i < al.xs.length; i++) rows.push([f.xType === "category" ? f.cats[i] : f.xType === "time" ? new Date(al.xs[i]).toISOString() : al.xs[i]].concat(vis.map((s) => { const v = this._col(s)[i]; return v === v ? v : ""; })));
            return { head, rows };
        }

        exportData(params) {
            const fmt = String((params && typeof params === "object" ? params.format : params) || "csv").toLowerCase();
            const { head, rows } = this._table();
            let blob;
            if (fmt === "png") return this.exportPNG();
            if (fmt === "xlsx") blob = xlsxBlob(head, rows, false, { textCols: [0] });
            else {
                const q = (t) => '"' + String(t).replace(/"/g, '""') + '"';
                blob = new Blob(["﻿" + [head.map(q).join(",")].concat(rows.map((r) => r.map((v) => (typeof v === "number" ? String(v) : q(v))).join(","))).join("\r\n")], { type: "text/csv;charset=utf-8" });
            }
            const name = this._getExportFileName(fmt === "xlsx" ? "xlsx" : "csv", "all");
            this._download(blob, name);
            this._lastExport = { name, blob, rows: rows.length };
            return rows.length;
        }

        exportPNG() {
            if (!this.canvas) return Promise.resolve(null);
            return new Promise((resolve) => this.canvas.toBlob((b) => {
                const name = this._getExportFileName("png", "all");
                this._download(b, name);
                this._lastExport = { name, blob: b };
                resolve({ name, blob: b });
            }));
        }

        // ---- the view -----------------------------------------------------------------------------
        render() {
            const p = this.p, at = p.legend || "bottom";
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
            const empty = !this._frame.series.length;
            return html`
                <div class="chart-container" part="chart" style=${style}>
                    ${p.title || p.subtitle ? html`<div class="c-head" style="text-align:${p.titleAlign || "left"}">${p.title ? html`<div class="c-title">${p.title}</div>` : ""}${p.subtitle ? html`<div class="c-sub">${p.subtitle}</div>` : ""}</div>` : ""}
                    ${at === "top" ? legend : ""}
                    <div class="c-main">
                        ${at === "left" ? legend : ""}
                        <div class="plot" @pointermove=${(e) => this.onPointerMove(e)} @pointerleave=${() => this.onPointerLeave()} @click=${(e) => this.onPlotClick(e)}>
                            <canvas></canvas>
                            <div class="corner">${this._renderMenu()}</div>
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
