// Nexa UI — the props, events and actions every time chart shares (the Line Chart, the State
// Timeline, the Bar chart): one definition, the same Inspector everywhere.
import { opt } from "./core.js";
import { SPANS, WINDOWS } from "./time.js";

/** The time shown and the Time axis (its ruler, its labels). */
export function timeProps() {
    return {
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
        timeZone: { type: "enum", group: "Time axis", label: "Time zone", default: "local", options: opt([["local", "The viewer's (local)"], ["utc", "UTC"]]) }
    };
}

/** Zoom & pan, and their limits. */
export function zoomProps() {
    return {
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
        enableZoomPan: { type: "boolean", default: true, group: "Zoom & pan", label: "Zoom (wheel) and pan (drag)" }
    };
}

/** Annotations: event markers at a time (static, and from Logic). */
export function annotationProps() {
    return {
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
    };
}

/** Export: the ⋮ menu, what it exports. o.thresholds: the chart has thresholds (their option). */
export function exportProps(o) {
    const p = {
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
    exportTitle: { type: "string", group: "Export", label: "Title", default: "", help: "Above the PNG and in the Excel Info sheet; {title} in the file name. Empty: the chart's name." },
    exportFilename: {
        type: "string", group: "Export", label: "File name expression", default: "", bindable: false,
        help: "Expression or template for the download file name. Variables: {title}, {date}, {time}, {year}, {month}, {day}, {format}, {range}. Default: chart-YYYYMMDD-HHmm"
    }
    };
    if (o && o.thresholds) {
        p.exportThresholds = {
        type: "boolean", group: "Export", label: "Thresholds", default: true,
        help: "Excel: a value past an upper / lower limit gets the limit's colour (an Info sheet lists them). PNG: drawn."
    };
    }
    // the order in the Inspector: the title and the file name last
    const { exportTitle, exportFilename, ...first } = p;
    return { ...first, exportTitle, exportFilename };
}

/** The events of a chart along time. */
export function timeEvents() {
    return {
        rangeChange: {
            label: "On Range Change", payload: { from: "number", to: "number", live: "boolean", cause: "string" },
            help: "The time shown changed (zoom, pan, ruler, navigator, Live): from / to (ms), live, cause. Load what is needed for it."
        },
        liveChange: { label: "On Live / Paused", payload: { live: "boolean" }, help: "The viewer stopped following the newest data (zoom / pan), or follows it again." },
        hoverEnd: { label: "On Hover End", help: "The cursor left the chart." },
        annotationClick: {
            label: "On Annotation Click", payload: { id: "string", time: "number", label: "string", color: "string", description: "string" },
            help: "The viewer clicked an annotation badge or vertical marker line."
        },
        rangeSelect: { label: "On Range Select", payload: { from: "number", to: "number" }, help: "Shift + drag selected a time range: statistics, export, zoom other charts." }
    };
}

/** The actions of a chart along time (its Update node). */
export function timeActions() {
    return {
        followLive: { label: "Follow live", help: "Shows the newest data again (as Live / a double click)." },
        setRange: {
            label: "Show a time range", params: { from: "number", to: "number" }, help: "Pauses live and shows that time.",
            example: "{ \"from\": 1727852400000, \"to\": 1727856000000 }"
        },
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
    };
}
