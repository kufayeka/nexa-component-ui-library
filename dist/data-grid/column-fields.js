// Data Grid: what a column is made of, as the schema the inspector's Columns list and the Edit grid dialog both use.
// One definition, so the two can never disagree about a column's fields.
import { COLUMN_TYPES } from "./columns.js";

export const COLUMN_FIELDS = {
    key: { type: "string", label: "Field (key)", default: "", bindable: false, help: "The field of each row this column shows." },
    label: { type: "string", label: "Title", default: "" },
    type: { type: "enum", label: "Cell type", default: "text", options: COLUMN_TYPES.map((t) => ({ value: t, label: t })), style: "select", bindable: false },
    width: { type: "number", label: "Width", default: 140, min: 30, unit: "px", section: "Layout" },
    align: { type: "enum", label: "Align", default: "left", options: ["left", "center", "right"], style: "segmented", section: "Layout" },
    editable: { type: "boolean", label: "Can be edited (when the grid is editable)", default: true, section: "Behaviour" },
    sortable: { type: "boolean", label: "Can be sorted", default: true, section: "Behaviour" },
    filterable: { type: "boolean", label: "Can be filtered", default: true, section: "Behaviour" },
    hidden: { type: "boolean", label: "Hidden", default: false, section: "Behaviour" },
    decimals: { type: "number", label: "Decimals", default: "", min: 0, max: 10, section: "Format", visibleWhen: (c) => c.type === "number" },
    suffix: { type: "string", label: "Unit / suffix", default: "", section: "Format", visibleWhen: (c) => c.type === "number" },
    format: { type: "enum", label: "Date format", default: "datetime", options: ["datetime", "date", "time"], section: "Format", visibleWhen: (c) => c.type === "date" },
    options: { type: "string", label: "Options", default: "", section: "Format", visibleWhen: (c) => c.type === "select" || c.type === "badge",
        help: "Comma separated: value, or value:Label, or (badge) value:Label:palette. Example: on:Running:green, off:Stopped:gray" },
    max: { type: "number", label: "Full bar at", default: 100, min: 1, section: "Format", visibleWhen: (c) => c.type === "progress" },
    buttonLabel: { type: "string", label: "Button text", default: "", section: "Format", visibleWhen: (c) => c.type === "button" },
    action: { type: "string", label: "Action name", default: "", section: "Format", visibleWhen: (c) => c.type === "button",
        help: "Sent with On Button Click; empty = the field name." }
};
