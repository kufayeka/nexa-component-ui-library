// Nexa UI — Date Time Picker: granular unit selection (Year, Month, Day, Hours, Minutes, Seconds),
// custom format templating / regex / expressions, and first-class UTC & Local timezone handling.
// Fully styled to Nexa UI / IBM Carbon specifications.
import { html, css, nothing } from "../../nexa-sdk/nexa-component-sdk.js";
import {
    CATEGORY_FORM, PREFIX, BASE_CSS, UIElement, field, FIELD_PROPS, FIELD_PARTS, CSS_GROUP, part,
    sizeProp, paletteProp, variantProp, radiusProp, disabledProp, icon, defineUI } from "./core.js";

const CAPS = { resizable: true, rotatable: false, flippable: false, lockable: true };
const common = { category: CATEGORY_FORM, capabilities: CAPS, css: "" };

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_FULL = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function pad2(n) {
    const s = String(n || 0);
    return s.length >= 2 ? s : "0" + s;
}

/**
 * Universal UTC and Date Parser.
 * Solves the universal developer UTC bug:
 * - Parses epoch ms, epoch seconds, ISO-8601 strings (with Z or offsets),
 *   and formatted date strings without unintended timezone shifts.
 */
function parseUniversalDate(val, customRegex) {
    if (val === null || val === undefined || val === "") return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

    if (typeof val === "number") {
        // If it's unix seconds (e.g. 1700000000), convert to ms
        const ms = val < 1e11 ? val * 1000 : val;
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
    }

    const str = String(val).trim();
    if (!str) return null;

    // Check if numeric string
    if (/^\d{9,15}$/.test(str)) {
        const num = Number(str);
        const ms = num < 1e11 ? num * 1000 : num;
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
    }

    // Try custom regex with named groups if provided: (?<year>\d{4})-(?<month>\d{2})...
    if (customRegex) {
        try {
            const rx = new RegExp(customRegex);
            const m = rx.exec(str);
            if (m && m.groups) {
                const g = m.groups;
                const y = parseInt(g.year || g.YYYY || g.yyyy || "1970", 10);
                const mo = parseInt(g.month || g.MM || g.mm || "1", 10) - 1;
                const d = parseInt(g.day || g.DD || g.dd || "1", 10);
                const h = parseInt(g.hour || g.HH || g.hh || "0", 10);
                const mi = parseInt(g.minute || g.mm || "0", 10);
                const s = parseInt(g.second || g.ss || "0", 10);
                const dt = new Date(Date.UTC(y, mo, d, h, mi, s));
                if (!isNaN(dt.getTime())) return dt;
            }
        } catch (e) {
            // ignore regex parse failure
        }
    }

    // Standard ISO 8601 / RFC 3339
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) return new Date(parsed);

    // Common fallback: YYYY-MM-DD or DD/MM/YYYY or YYYY/MM/DD
    const mIso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(str);
    if (mIso) {
        const y = parseInt(mIso[1], 10);
        const mo = parseInt(mIso[2], 10) - 1;
        const d = parseInt(mIso[3], 10);
        const h = mIso[4] ? parseInt(mIso[4], 10) : 0;
        const mi = mIso[5] ? parseInt(mIso[5], 10) : 0;
        const s = mIso[6] ? parseInt(mIso[6], 10) : 0;
        return new Date(Date.UTC(y, mo, d, h, mi, s));
    }

    const mEu = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(str);
    if (mEu) {
        const d = parseInt(mEu[1], 10);
        const mo = parseInt(mEu[2], 10) - 1;
        const y = parseInt(mEu[3], 10);
        const h = mEu[4] ? parseInt(mEu[4], 10) : 0;
        const mi = mEu[5] ? parseInt(mEu[5], 10) : 0;
        const s = mEu[6] ? parseInt(mEu[6], 10) : 0;
        return new Date(Date.UTC(y, mo, d, h, mi, s));
    }

    return null;
}

/**
 * Format date with support for UTC vs Local extraction and template tokens.
 */
function formatDateTemplate(date, format, isUtc) {
    if (!date || isNaN(date.getTime())) return "";

    const y = isUtc ? date.getUTCFullYear() : date.getFullYear();
    const mo = isUtc ? date.getUTCMonth() : date.getMonth();
    const d = isUtc ? date.getUTCDate() : date.getDate();
    const h = isUtc ? date.getUTCHours() : date.getHours();
    const mi = isUtc ? date.getUTCMinutes() : date.getMinutes();
    const s = isUtc ? date.getUTCSeconds() : date.getSeconds();

    const h12 = h % 12 || 12;
    const ampmUpper = h >= 12 ? "PM" : "AM";
    const ampmLower = h >= 12 ? "pm" : "am";

    let tzOffset = "";
    if (isUtc) {
        tzOffset = "Z";
    } else {
        const off = -date.getTimezoneOffset();
        const sign = off >= 0 ? "+" : "-";
        const offH = pad2(Math.floor(Math.abs(off) / 60));
        const offM = pad2(Math.abs(off) % 60);
        tzOffset = `${sign}${offH}:${offM}`;
    }

    const map = {
        "YYYY": String(y),
        "YY": String(y).slice(-2),
        "MMMM": MONTH_NAMES_FULL[mo] || "",
        "MMM": MONTH_NAMES_SHORT[mo] || "",
        "MM": pad2(mo + 1),
        "M": String(mo + 1),
        "DD": pad2(d),
        "D": String(d),
        "HH": pad2(h),
        "H": String(h),
        "hh": pad2(h12),
        "h": String(h12),
        "mm": pad2(mi),
        "m": String(mi),
        "ss": pad2(s),
        "s": String(s),
        "A": ampmUpper,
        "a": ampmLower,
        "Z": tzOffset
    };

    let res = format || "YYYY-MM-DD HH:mm:ss";
    // Sort keys descending so YYYY matches before YY, MMMM before MMM before MM before M, etc.
    const keys = Object.keys(map).sort((a, b) => b.length - a.length);
    for (const k of keys) {
        res = res.split(k).join(map[k]);
    }
    return res;
}

const DATETIME_CSS = css`
    .box {
        flex: 1 1 auto; min-height: 0; width: 100%; display: flex; align-items: center; gap: var(--gap); position: relative;
        padding: 0 var(--px); background: var(--bg-subtle); color: var(--fg); border: none; border-bottom: 1px solid var(--bd-strong);
        border-radius: var(--r) var(--r) 0 0; box-sizing: border-box;
        transition: background-color var(--t) var(--ease), box-shadow var(--t) var(--ease), border-color var(--t) var(--ease);
    }
    .box:hover:not(.disabled):not(.readonly):not(.focused) { background: var(--bg-muted); }
    :host([data-variant="outline"]) .box { background: var(--bg); border: 1px solid var(--bd-strong); border-radius: var(--r); }
    :host([data-variant="flushed"]) .box { background: transparent; padding-left: 0; padding-right: 0; border-radius: 0; }
    .box.focused, .box:focus-within { box-shadow: inset 0 0 0 2px var(--ring); border-bottom-color: transparent; }
    .box.invalid { box-shadow: inset 0 0 0 2px var(--err-bd); border-bottom-color: transparent; }
    .box.disabled { cursor: not-allowed; color: var(--fg-subtle); border-bottom-color: transparent; opacity: 0.6; }

    .input-field {
        flex: 1 1 auto; min-width: 0; width: 100%; height: 100%; border: none; outline: none; background: transparent;
        font: inherit; letter-spacing: inherit; color: inherit; padding: 0; margin: 0; cursor: pointer;
    }
    .input-field:focus-visible { outline: none; }
    .input-field::placeholder { color: var(--fg-subtle); }

    .tz-badge {
        flex: 0 0 auto; font-family: var(--mono); font-size: 10px; font-weight: 600; padding: 2px 6px;
        border-radius: 2px; text-transform: uppercase; letter-spacing: 0.5px;
        background: var(--bg-emph); color: var(--fg-muted); user-select: none;
    }
    .tz-badge.utc { background: var(--cp-subtle); color: var(--cp-fg); }

    .icon-btn {
        all: unset; flex: 0 0 auto; align-self: stretch; width: var(--h); max-width: 48px;
        margin-right: calc(var(--px) * -1); display: inline-flex; align-items: center; justify-content: center;
        color: var(--fg-muted); cursor: pointer; transition: background-color var(--t) var(--ease), color var(--t) var(--ease);
    }
    .icon-btn:hover { color: var(--fg); background: var(--bg-emph); }
    .icon-btn:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }

    .clear-btn {
        all: unset; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
        color: var(--fg-muted); cursor: pointer; width: calc(var(--icon) + 8px); height: calc(var(--icon) + 8px);
        border-radius: var(--r);
    }
    .clear-btn:hover { color: var(--fg); background: var(--bg-emph); }

    /* Popover flyout (Carbon style) */
    .popover {
        position: absolute; top: calc(100% + 4px); left: 0; z-index: 1000;
        background: var(--panel, #ffffff); border: 1px solid var(--bd); border-radius: var(--r);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16); padding: 16px; min-width: 290px;
        display: flex; flex-direction: column; gap: 12px; box-sizing: border-box;
        animation: nx-dt-fade 120ms cubic-bezier(0.2, 0, 0.38, 0.9);
    }
    @keyframes nx-dt-fade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

    .cal-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .cal-title { font-weight: 600; font-size: 14px; color: var(--fg); display: flex; align-items: center; gap: 6px; }
    .cal-nav-btn {
        all: unset; width: 28px; height: 28px; border-radius: var(--r); display: inline-flex; align-items: center;
        justify-content: center; color: var(--fg-muted); cursor: pointer; transition: background-color var(--t) var(--ease);
    }
    .cal-nav-btn:hover { background: var(--bg-emph); color: var(--fg); }
    .cal-nav-btn:focus-visible { outline: 2px solid var(--ring); }

    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
    .cal-wk { font-size: 11px; font-weight: 600; color: var(--fg-subtle); padding: 4px 0; }
    .cal-day {
        all: unset; height: 32px; display: inline-flex; align-items: center; justify-content: center;
        font-size: 13px; font-family: var(--mono); border-radius: var(--r); cursor: pointer; color: var(--fg);
        transition: background-color var(--t) var(--ease), color var(--t) var(--ease);
    }
    .cal-day:hover:not(.empty) { background: var(--bg-muted); }
    .cal-day.selected { background: var(--cp-solid) !important; color: var(--cp-contrast) !important; font-weight: 600; }
    .cal-day.today { border: 1px solid var(--cp-solid); }
    .cal-day.empty { cursor: default; }

    /* Time inputs */
    .time-strip {
        display: flex; align-items: center; justify-content: space-between; gap: 6px;
        padding-top: 8px; border-top: 1px solid var(--bd);
    }
    .time-label { font-size: 12px; font-weight: 500; color: var(--fg-muted); }
    .time-controls { display: flex; align-items: center; gap: 4px; font-family: var(--mono); }
    .time-input {
        width: 36px; height: 28px; text-align: center; border: 1px solid var(--bd); border-radius: 2px;
        background: var(--bg-subtle); color: var(--fg); font: inherit; font-size: 13px; outline: none; padding: 0;
    }
    .time-input:focus { border-color: var(--ring); box-shadow: inset 0 0 0 1px var(--ring); }
    .time-sep { font-weight: 600; color: var(--fg-muted); }

    /* Popover footer actions */
    .pop-footer {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding-top: 8px; border-top: 1px solid var(--bd);
    }
    .pop-footer button {
        all: unset; padding: 4px 10px; font-size: 12px; font-weight: 500; border-radius: 2px;
        cursor: pointer; transition: background-color var(--t) var(--ease);
    }
    .btn-subtle { background: var(--bg-emph); color: var(--fg); }
    .btn-subtle:hover { background: var(--bg-muted); }
    .btn-primary { background: var(--cp-solid); color: var(--cp-contrast); }
    .btn-primary:hover { filter: brightness(0.92); }
`;

export const dateTime = defineUI({
    ...common,
    id: PREFIX + "datetime",
    label: "Date Time",
    icon: "fa fa-calendar",
    size: { w: 260, h: 40 },
    help: "Date Time Picker with granular unit selection (Year, Month, Day, Hours, Minutes, Seconds), format templating/regex, and first-class UTC & Local timezone handling.",
    properties: Object.assign({}, FIELD_PROPS, {
        unitPreset: {
            type: "enum", default: "datetime", group: "Granularity", label: "Preset", style: "combobox",
            options: [
                { value: "datetime", label: "Date & Time (Y-M-D H:m)" },
                { value: "datetime-seconds", label: "Date & Time with Seconds (Y-M-D H:m:s)" },
                { value: "date-only", label: "Date Only (Y-M-D)" },
                { value: "time-only", label: "Time Only (H:m:s)" },
                { value: "year-month", label: "Year & Month (Y-M)" },
                { value: "custom", label: "Custom Units" }
            ]
        },
        showYear: { type: "boolean", default: true, group: "Granularity", label: "Year (YYYY)" },
        showMonth: { type: "boolean", default: true, group: "Granularity", label: "Month (MM)" },
        showDay: { type: "boolean", default: true, group: "Granularity", label: "Day (DD)" },
        showHours: { type: "boolean", default: true, group: "Granularity", label: "Hours (HH)" },
        showMinutes: { type: "boolean", default: true, group: "Granularity", label: "Minutes (mm)" },
        showSeconds: { type: "boolean", default: false, group: "Granularity", label: "Seconds (ss)" },

        format: {
            type: "string", default: "YYYY-MM-DD HH:mm:ss", group: "Format", label: "Display format template",
            help: "Tokens: YYYY, YY, MMMM, MMM, MM, M, DD, D, HH, H, hh, h, mm, m, ss, s, A (AM/PM), Z (offset)"
        },
        customRegex: {
            type: "string", default: "", group: "Format", label: "Parse regex (optional)",
            help: "Regex with capture groups (e.g. (?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})) to parse custom string inputs."
        },

        timezoneMode: {
            type: "enum", default: "utc", group: "Timezone / UTC", label: "Timezone handling", style: "segmented",
            options: [
                { value: "utc", label: "UTC" },
                { value: "local", label: "Local" }
            ],
            help: "UTC: stores & displays in UTC. Local: converts UTC timestamps to operator local time for human display and converts back on write."
        },
        outputType: {
            type: "enum", default: "iso", group: "Timezone / UTC", label: "Write output format", style: "combobox",
            options: [
                { value: "iso", label: "ISO-8601 string (e.g. 2026-09-30T08:54:15.000Z)" },
                { value: "timestamp-ms", label: "Unix timestamp (milliseconds)" },
                { value: "timestamp-s", label: "Unix timestamp (seconds)" },
                { value: "formatted", label: "Formatted template string" },
                { value: "utc-date", label: "Date only (YYYY-MM-DD)" },
                { value: "utc-time", label: "Time only (HH:mm:ss)" }
            ]
        },

        defaultValue: { type: "string", default: "", group: "Data", label: "Default value (unbound)", help: "Default date/time string or timestamp when unbound." },
        placeholder: { type: "string", default: "", group: "Display", label: "Placeholder" },
        clearable: { type: "boolean", default: true, group: "Display", label: "Clear button (×)" },
        variant: variantProp([{ value: "filled", label: "Filled" }, { value: "outline", label: "Outline" }, { value: "flushed", label: "Flushed" }], "filled"),
        size: sizeProp(),
        colorPalette: paletteProp(),
        radius: radiusProp("md"),
        disabled: disabledProp(),
        readonly: { type: "boolean", default: false, group: "Behaviour", label: "Read-only" }
    }),
    inputs: {
        value: { type: "any", label: "Value (read)", help: "Date object, ISO string, timestamp number (ms/s), or formatted date string." }
    },
    outputs: {
        value: { fallback: "value", label: "Value (write)", help: "Written back as ISO string, Unix timestamp, or formatted string based on outputType." }
    },
    events: {
        change: { label: "On Change", payload: { value: "any", iso: "string", timestamp: "number", text: "string", utc: "string" } },
        open: { label: "On Popover Open" },
        close: { label: "On Popover Close" }
    },
    actions: {
        setNow: { label: "Set to current time" },
        clear: { label: "Clear date time" }
    },
    parts: Object.assign({}, FIELD_PARTS, {
        box: part("Input box", "box"),
        popover: part("Calendar popover", "popover")
    }),
    view: class extends UIElement {
        static styles = [BASE_CSS, DATETIME_CSS];

        constructor() {
            super();
            this._isOpen = false;
            this._currentDate = null;
            this._navMonth = new Date().getUTCMonth();
            this._navYear = new Date().getUTCFullYear();
            this._onDocumentClick = this._onDocumentClick.bind(this);
        }

        connectedCallback() {
            super.connectedCallback();
            document.addEventListener("click", this._onDocumentClick);
        }

        disconnectedCallback() {
            super.disconnectedCallback();
            document.removeEventListener("click", this._onDocumentClick);
        }

        _onDocumentClick(e) {
            if (!this._isOpen) return;
            const path = e.composedPath ? e.composedPath() : [];
            if (!path.includes(this)) {
                this.closePopover();
            }
        }

        get isUtc() {
            return (this.p.timezoneMode || "utc") === "utc";
        }

        get activeUnits() {
            const p = this.p;
            switch (p.unitPreset) {
                case "date-only": return { y: true, mo: true, d: true, h: false, mi: false, s: false };
                case "time-only": return { y: false, mo: false, d: false, h: true, mi: true, s: true };
                case "year-month": return { y: true, mo: true, d: false, h: false, mi: false, s: false };
                case "datetime-seconds": return { y: true, mo: true, d: true, h: true, mi: true, s: true };
                case "custom":
                    return {
                        y: p.showYear !== false, mo: p.showMonth !== false, d: p.showDay !== false,
                        h: p.showHours !== false, mi: p.showMinutes !== false, s: !!p.showSeconds
                    };
                default: // datetime
                    return { y: true, mo: true, d: true, h: true, mi: true, s: !!p.showSeconds };
            }
        }

        get currentDate() {
            const st = this.status && this.status("value");
            const bound = st && st.bound;
            const raw = (bound && this.in.value !== undefined) ? this.in.value : (this._localValue !== undefined && this._localValue !== null ? this._localValue : (this.p.defaultValue || this.p.value || this.p.inputValue));
            if (raw !== null && raw !== undefined && raw !== "") {
                return parseUniversalDate(raw, this.p.customRegex);
            }
            return null;
        }

        _formatDisplay(date) {
            if (!date) return "";
            return formatDateTemplate(date, this.p.format || "YYYY-MM-DD HH:mm:ss", this.isUtc);
        }

        togglePopover(e) {
            if (e) e.stopPropagation();
            if (this.isEditor || this.p.disabled || this.p.readonly) return;
            if (this._isOpen) {
                this.closePopover();
            } else {
                this.openPopover();
            }
        }

        openPopover() {
            this._isOpen = true;
            const cur = this.currentDate || new Date();
            this._navMonth = this.isUtc ? cur.getUTCMonth() : cur.getMonth();
            this._navYear = this.isUtc ? cur.getUTCFullYear() : cur.getFullYear();
            this.emit("open");
            this.requestUpdate();
        }

        closePopover() {
            if (!this._isOpen) return;
            this._isOpen = false;
            this.emit("close");
            this.requestUpdate();
        }

        _commitDate(newDate) {
            if (!newDate || isNaN(newDate.getTime())) return;
            this._localValue = newDate;

            const p = this.p;
            let outVal = newDate.toISOString();
            switch (p.outputType) {
                case "timestamp-ms":
                    outVal = newDate.getTime();
                    break;
                case "timestamp-s":
                    outVal = Math.floor(newDate.getTime() / 1000);
                    break;
                case "formatted":
                    outVal = this._formatDisplay(newDate);
                    break;
                case "utc-date":
                    outVal = formatDateTemplate(newDate, "YYYY-MM-DD", true);
                    break;
                case "utc-time":
                    outVal = formatDateTemplate(newDate, "HH:mm:ss", true);
                    break;
                default:
                    outVal = newDate.toISOString();
            }

            if (this.out.canWrite("value")) {
                this.out.write("value", outVal).catch(() => { });
            }

            this.emit("change", {
                value: outVal,
                iso: newDate.toISOString(),
                timestamp: newDate.getTime(),
                text: this._formatDisplay(newDate),
                utc: formatDateTemplate(newDate, "YYYY-MM-DD HH:mm:ss [UTC]", true)
            });
            this.requestUpdate();
        }

        setNow() {
            this._commitDate(new Date());
            this.closePopover();
        }

        clear() {
            this._localValue = null;
            if (this.out.canWrite("value")) {
                this.out.write("value", null).catch(() => { });
            }
            this.emit("change", { value: null, iso: "", timestamp: null, text: "", utc: "" });
            this.closePopover();
            this.requestUpdate();
        }

        _pickDay(dayNumber) {
            const cur = this.currentDate || new Date();
            let d;
            if (this.isUtc) {
                d = new Date(Date.UTC(this._navYear, this._navMonth, dayNumber, cur.getUTCHours(), cur.getUTCMinutes(), cur.getUTCSeconds()));
            } else {
                d = new Date(this._navYear, this._navMonth, dayNumber, cur.getHours(), cur.getMinutes(), cur.getSeconds());
            }
            this._commitDate(d);
            const u = this.activeUnits;
            if (!u.h && !u.mi && !u.s) {
                this.closePopover();
            }
        }

        _updateTime(part, val) {
            const cur = this.currentDate || new Date();
            const n = Math.max(0, parseInt(val, 10) || 0);
            let d;
            if (this.isUtc) {
                let y = cur.getUTCFullYear(), mo = cur.getUTCMonth(), day = cur.getUTCDate();
                let h = cur.getUTCHours(), mi = cur.getUTCMinutes(), s = cur.getUTCSeconds();
                if (part === "h") h = Math.min(23, n);
                if (part === "m") mi = Math.min(59, n);
                if (part === "s") s = Math.min(59, n);
                d = new Date(Date.UTC(y, mo, day, h, mi, s));
            } else {
                let y = cur.getFullYear(), mo = cur.getMonth(), day = cur.getDate();
                let h = cur.getHours(), mi = cur.getMinutes(), s = cur.getSeconds();
                if (part === "h") h = Math.min(23, n);
                if (part === "m") mi = Math.min(59, n);
                if (part === "s") s = Math.min(59, n);
                d = new Date(y, mo, day, h, mi, s);
            }
            this._commitDate(d);
        }

        _prevMonth(e) {
            e.stopPropagation();
            if (this._navMonth === 0) {
                this._navMonth = 11;
                this._navYear--;
            } else {
                this._navMonth--;
            }
            this.requestUpdate();
        }

        _nextMonth(e) {
            e.stopPropagation();
            if (this._navMonth === 11) {
                this._navMonth = 0;
                this._navYear++;
            } else {
                this._navMonth++;
            }
            this.requestUpdate();
        }

        _renderCalendarGrid() {
            const cur = this.currentDate;
            const isUtc = this.isUtc;

            const firstDayOfMonth = new Date(Date.UTC(this._navYear, this._navMonth, 1)).getUTCDay();
            // Monday-first indexing: 0 = Mon, 6 = Sun
            const startDayIndex = (firstDayOfMonth + 6) % 7;
            const daysInMonth = new Date(Date.UTC(this._navYear, this._navMonth + 1, 0)).getUTCDate();

            const curY = cur ? (isUtc ? cur.getUTCFullYear() : cur.getFullYear()) : -1;
            const curMo = cur ? (isUtc ? cur.getUTCMonth() : cur.getMonth()) : -1;
            const curD = cur ? (isUtc ? cur.getUTCDate() : cur.getDate()) : -1;

            const now = new Date();
            const nowY = isUtc ? now.getUTCFullYear() : now.getFullYear();
            const nowMo = isUtc ? now.getUTCMonth() : now.getMonth();
            const nowD = isUtc ? now.getUTCDate() : now.getDate();

            const cells = [];
            for (let i = 0; i < startDayIndex; i++) {
                cells.push(html`<span class="cal-day empty"></span>`);
            }
            for (let day = 1; day <= daysInMonth; day++) {
                const isSelected = curY === this._navYear && curMo === this._navMonth && curD === day;
                const isToday = nowY === this._navYear && nowMo === this._navMonth && nowD === day;
                const cls = `cal-day ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`;
                cells.push(html`<button class="${cls}" type="button" @click="${() => this._pickDay(day)}">${day}</button>`);
            }
            return cells;
        }

        _renderPopover() {
            if (!this._isOpen) return nothing;
            const u = this.activeUnits;
            const hasDate = u.y || u.mo || u.d;
            const hasTime = u.h || u.mi || u.s;
            const cur = this.currentDate || new Date();
            const isUtc = this.isUtc;

            const curH = isUtc ? cur.getUTCHours() : cur.getHours();
            const curM = isUtc ? cur.getUTCMinutes() : cur.getMinutes();
            const curS = isUtc ? cur.getUTCSeconds() : cur.getSeconds();

            return html`<div class="popover" part="popover" @click="${(e) => e.stopPropagation()}">
                ${hasDate ? html`
                    <div class="cal-header">
                        <span class="cal-title">${MONTH_NAMES_FULL[this._navMonth]} ${this._navYear}</span>
                        <div style="display:flex;gap:2px;">
                            <button class="cal-nav-btn" type="button" title="Previous Month" @click="${this._prevMonth}">
                                ${icon("chevron-left")}
                            </button>
                            <button class="cal-nav-btn" type="button" title="Next Month" @click="${this._nextMonth}">
                                ${icon("chevron-right")}
                            </button>
                        </div>
                    </div>
                    <div class="cal-grid">
                        ${WEEKDAYS.map((w) => html`<span class="cal-wk">${w}</span>`)}
                        ${this._renderCalendarGrid()}
                    </div>
                ` : nothing}

                ${hasTime ? html`
                    <div class="time-strip">
                        <span class="time-label">${hasDate ? "Time" : "Pick Time"}</span>
                        <div class="time-controls">
                            ${u.h ? html`
                                <input class="time-input" type="number" min="0" max="23" .value="${pad2(curH)}"
                                    @change="${(e) => this._updateTime("h", e.target.value)}" title="Hours (00-23)" />
                            ` : nothing}
                            ${u.h && u.mi ? html`<span class="time-sep">:</span>` : nothing}
                            ${u.mi ? html`
                                <input class="time-input" type="number" min="0" max="59" .value="${pad2(curM)}"
                                    @change="${(e) => this._updateTime("m", e.target.value)}" title="Minutes (00-59)" />
                            ` : nothing}
                            ${u.mi && u.s ? html`<span class="time-sep">:</span>` : nothing}
                            ${u.s ? html`
                                <input class="time-input" type="number" min="0" max="59" .value="${pad2(curS)}"
                                    @change="${(e) => this._updateTime("s", e.target.value)}" title="Seconds (00-59)" />
                            ` : nothing}
                        </div>
                    </div>
                ` : nothing}

                <div class="pop-footer">
                    <button class="btn-subtle" type="button" @click="${this.setNow}">Now</button>
                    ${this.p.clearable ? html`<button class="btn-subtle" type="button" @click="${this.clear}">Clear</button>` : nothing}
                    <button class="btn-primary" type="button" @click="${this.closePopover}">Done</button>
                </div>
            </div>`;
        }

        render() {
            const p = this.p;
            const cur = this.currentDate;
            const displayStr = this._formatDisplay(cur);
            const u = this.activeUnits;
            const isTimeOnly = !u.y && !u.mo && !u.d;

            const box = html`<div class="box ${p.disabled ? "disabled" : ""}" part="box">
                <input class="input-field" type="text" readonly
                    placeholder="${p.placeholder || (this.isEditor ? (isTimeOnly ? "12:00:00" : "YYYY-MM-DD HH:mm") : "Select date/time...")}"
                    .value="${displayStr}"
                    ?disabled="${p.disabled}"
                    @click="${this.togglePopover}" />

                <span class="tz-badge ${this.isUtc ? "utc" : ""}" title="Timezone Mode: ${this.isUtc ? "UTC" : "Local"}">
                    ${this.isUtc ? "UTC" : "LOC"}
                </span>

                ${p.clearable && displayStr && !p.disabled && !p.readonly ? html`
                    <button class="clear-btn" type="button" title="Clear" tabindex="-1" @click="${(e) => { e.stopPropagation(); this.clear(); }}">
                        ${icon("x")}
                    </button>
                ` : nothing}

                <button class="icon-btn" type="button" title="Pick date time" aria-label="Pick date time" tabindex="-1"
                    ?disabled="${p.disabled}" @click="${this.togglePopover}">
                    ${icon(isTimeOnly ? "clock" : "calendar")}
                </button>

                ${this._renderPopover()}
            </div>`;

            return field(this, box);
        }
    }
});

// ==============================================================================================
// Date Range Picker (nexa-ui-daterange)
// Dual-month calendar, quick presets (Today, Last 7d, 30d, etc.), start/end bindings, UTC handling.
// ==============================================================================================

function toDateKey(d, isUtc) {
    if (!d || isNaN(d.getTime())) return "";
    const y = isUtc ? d.getUTCFullYear() : d.getFullYear();
    const m = isUtc ? d.getUTCMonth() + 1 : d.getMonth() + 1;
    const day = isUtc ? d.getUTCDate() : d.getDate();
    return `${y}-${pad2(m)}-${pad2(day)}`;
}

function getPresetRange(presetName, isUtc) {
    const now = new Date();
    let start, end;
    if (isUtc) {
        const y = now.getUTCFullYear();
        const m = now.getUTCMonth();
        const d = now.getUTCDate();
        switch (presetName) {
            case "today":
                start = new Date(Date.UTC(y, m, d, 0, 0, 0));
                end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
                break;
            case "yesterday":
                start = new Date(Date.UTC(y, m, d - 1, 0, 0, 0));
                end = new Date(Date.UTC(y, m, d - 1, 23, 59, 59, 999));
                break;
            case "last-7-days":
                start = new Date(Date.UTC(y, m, d - 6, 0, 0, 0));
                end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
                break;
            case "last-30-days":
                start = new Date(Date.UTC(y, m, d - 29, 0, 0, 0));
                end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
                break;
            case "this-month":
                start = new Date(Date.UTC(y, m, 1, 0, 0, 0));
                const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
                end = new Date(Date.UTC(y, m, lastDay, 23, 59, 59, 999));
                break;
            case "last-month":
                start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
                const lastDayPrev = new Date(Date.UTC(y, m, 0)).getUTCDate();
                end = new Date(Date.UTC(y, m - 1, lastDayPrev, 23, 59, 59, 999));
                break;
            case "year-to-date":
                start = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
                end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
                break;
            default:
                return null;
        }
    } else {
        const y = now.getFullYear();
        const m = now.getMonth();
        const d = now.getDate();
        switch (presetName) {
            case "today":
                start = new Date(y, m, d, 0, 0, 0);
                end = new Date(y, m, d, 23, 59, 59, 999);
                break;
            case "yesterday":
                start = new Date(y, m, d - 1, 0, 0, 0);
                end = new Date(y, m, d - 1, 23, 59, 59, 999);
                break;
            case "last-7-days":
                start = new Date(y, m, d - 6, 0, 0, 0);
                end = new Date(y, m, d, 23, 59, 59, 999);
                break;
            case "last-30-days":
                start = new Date(y, m, d - 29, 0, 0, 0);
                end = new Date(y, m, d, 23, 59, 59, 999);
                break;
            case "this-month":
                start = new Date(y, m, 1, 0, 0, 0);
                const lastDay = new Date(y, m + 1, 0).getDate();
                end = new Date(y, m, lastDay, 23, 59, 59, 999);
                break;
            case "last-month":
                start = new Date(y, m - 1, 1, 0, 0, 0);
                const lastDayPrev = new Date(y, m, 0).getDate();
                end = new Date(y, m - 1, lastDayPrev, 23, 59, 59, 999);
                break;
            case "year-to-date":
                start = new Date(y, 0, 1, 0, 0, 0);
                end = new Date(y, m, d, 23, 59, 59, 999);
                break;
            default:
                return null;
        }
    }
    return { start, end };
}

const PRESETS = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "last-7-days", label: "Last 7 Days" },
    { id: "last-30-days", label: "Last 30 Days" },
    { id: "this-month", label: "This Month" },
    { id: "last-month", label: "Last Month" },
    { id: "year-to-date", label: "Year to Date" }
];

const DATERANGE_CSS = css`
    .box {
        flex: 1 1 auto; min-height: 0; width: 100%; display: flex; align-items: center; gap: var(--gap); position: relative;
        padding: 0 var(--px); background: var(--bg-subtle); color: var(--fg); border: none; border-bottom: 1px solid var(--bd-strong);
        border-radius: var(--r) var(--r) 0 0; box-sizing: border-box; cursor: pointer; user-select: none;
        transition: background-color var(--t) var(--ease), box-shadow var(--t) var(--ease), border-color var(--t) var(--ease);
    }
    .box:hover:not(.disabled):not(.readonly):not(.focused) { background: var(--bg-muted); }
    :host([data-variant="outline"]) .box { background: var(--bg); border: 1px solid var(--bd-strong); border-radius: var(--r); }
    :host([data-variant="flushed"]) .box { background: transparent; padding-left: 0; padding-right: 0; border-radius: 0; }
    .box.focused, .box:focus-within { box-shadow: inset 0 0 0 2px var(--ring); border-bottom-color: transparent; }
    .box.invalid { box-shadow: inset 0 0 0 2px var(--err-bd); border-bottom-color: transparent; }
    .box.disabled { cursor: not-allowed; color: var(--fg-subtle); border-bottom-color: transparent; opacity: 0.6; }

    .range-display-segment {
        flex: 1 1 0; min-width: 0; font: inherit; color: inherit; user-select: none;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .range-display-segment.placeholder { color: var(--fg-subtle); }
    .range-arrow {
        flex: 0 0 auto; font-size: 13px; font-weight: 600; color: var(--fg-subtle); user-select: none; padding: 0 4px;
    }

    .tz-badge {
        flex: 0 0 auto; font-family: var(--mono); font-size: 10px; font-weight: 600; padding: 2px 6px;
        border-radius: 2px; text-transform: uppercase; letter-spacing: 0.5px;
        background: var(--bg-emph); color: var(--fg-muted); user-select: none;
    }
    .tz-badge.utc { background: var(--cp-subtle); color: var(--cp-fg); }

    .icon-btn {
        all: unset; flex: 0 0 auto; align-self: stretch; width: var(--h); max-width: 48px;
        margin-right: calc(var(--px) * -1); display: inline-flex; align-items: center; justify-content: center;
        color: var(--fg-muted); cursor: pointer; transition: background-color var(--t) var(--ease), color var(--t) var(--ease);
    }
    .icon-btn:hover { color: var(--fg); background: var(--bg-emph); }
    .icon-btn:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }

    .clear-btn {
        all: unset; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
        color: var(--fg-muted); cursor: pointer; width: calc(var(--icon) + 8px); height: calc(var(--icon) + 8px);
        border-radius: var(--r);
    }
    .clear-btn:hover { color: var(--fg); background: var(--bg-emph); }

    /* Popover flyout (Carbon style dual calendar) */
    .daterange-popover {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        z-index: 1000;

        background: var(--panel, #ffffff);
        border: 1px solid var(--bd);
        border-radius: var(--r);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);

        padding: 16px;

        display: flex;
        flex-direction: row;
        gap: 16px;

        width: max-content;
        max-width: 90vw;

        box-sizing: border-box;
        cursor: default;

        animation: nx-dt-fade 120ms cubic-bezier(0.2, 0, 0.38, 0.9);
    }

    .daterange-presets {
        display: flex;
        flex-direction: column;
        gap: 3px;

        padding-right: 14px;
        border-right: 1px solid var(--bd);

        min-width: 110px;
        user-select: none;
    }

    .daterange-preset-btn {
        all: unset;

        padding: 6px 10px;

        font-size: 12px;
        font-weight: 500;
        color: var(--fg-muted);

        border-radius: var(--r);
        cursor: pointer;
        text-align: left;
        white-space: nowrap;

        transition:
            background-color var(--t) var(--ease),
            color var(--t) var(--ease);
    }

    .daterange-preset-btn:hover {
        background: var(--bg-muted);
        color: var(--fg);
    }

    .daterange-main {
        display: flex;
        flex-direction: column;
        gap: 12px;

        width: max-content;
    }

    .daterange-panes {
        display: flex;
        flex-direction: row;

        gap: 20px;

        flex-wrap: nowrap;
    }

    .daterange-panes.vertical {
        flex-direction: column;
        gap: 16px;
    }

    .daterange-pane {
        display: flex;
        flex-direction: column;
        gap: 8px;

        width: 232px;
        flex: 0 0 232px;
    }
    .cal-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .cal-title { font-weight: 600; font-size: 13px; color: var(--fg); display: flex; align-items: center; gap: 6px; }
    .cal-nav-btn {
        all: unset; width: 26px; height: 26px; border-radius: var(--r); display: inline-flex; align-items: center;
        justify-content: center; color: var(--fg-muted); cursor: pointer; transition: background-color var(--t) var(--ease);
    }
    .cal-nav-btn:hover { background: var(--bg-emph); color: var(--fg); }
    .cal-nav-btn:focus-visible { outline: 2px solid var(--ring); }

    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
    .cal-wk { font-size: 11px; font-weight: 600; color: var(--fg-subtle); padding: 4px 0; }
    .cal-day {
        all: unset; height: 30px; display: inline-flex; align-items: center; justify-content: center;
        font-size: 12px; font-family: var(--mono); cursor: pointer; color: var(--fg); border-radius: 0;
        transition: background-color var(--t) var(--ease), color var(--t) var(--ease);
    }
    .cal-day:hover:not(.empty) { background: var(--bg-muted); }
    .cal-day.today { outline: 1px solid var(--cp-solid); outline-offset: -1px; }

    .cal-day.range-start {
        background: var(--cp-solid) !important; color: var(--cp-contrast) !important; font-weight: 600;
        border-top-left-radius: var(--r); border-bottom-left-radius: var(--r);
    }
    .cal-day.range-end {
        background: var(--cp-solid) !important; color: var(--cp-contrast) !important; font-weight: 600;
        border-top-right-radius: var(--r); border-bottom-right-radius: var(--r);
    }
    .cal-day.range-start.range-end { border-radius: var(--r) !important; }
    .cal-day.in-range { background: var(--cp-subtle) !important; color: var(--cp-fg) !important; border-radius: 0 !important; }
    .cal-day.in-range-preview { background: var(--bg-muted) !important; border-radius: 0 !important; }
    .cal-day.empty { cursor: default; }

    /* Time strip */
    .time-strip {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding-top: 8px; border-top: 1px solid var(--bd); flex-wrap: wrap;
    }
    .time-group { display: flex; align-items: center; gap: 6px; font-family: var(--mono); }
    .time-label { font-size: 12px; font-weight: 500; color: var(--fg-muted); }
    .time-input {
        width: 36px; height: 26px; text-align: center; border: 1px solid var(--bd); border-radius: 2px;
        background: var(--bg-subtle); color: var(--fg); font: inherit; font-size: 12px; outline: none; padding: 0;
    }
    .time-input:focus { border-color: var(--ring); box-shadow: inset 0 0 0 1px var(--ring); }
    .time-sep { font-weight: 600; color: var(--fg-muted); }

    /* Popover footer actions */
    .daterange-footer {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding-top: 10px; border-top: 1px solid var(--bd);
    }
    .daterange-summary { font-size: 12px; font-family: var(--mono); color: var(--fg-muted); }
    .daterange-footer-actions { display: flex; align-items: center; gap: 8px; }
    .daterange-footer-actions button {
        all: unset; padding: 4px 12px; font-size: 12px; font-weight: 500; border-radius: 2px;
        cursor: pointer; transition: background-color var(--t) var(--ease);
    }
    .btn-subtle { background: var(--bg-emph); color: var(--fg); }
    .btn-subtle:hover { background: var(--bg-muted); }
    .btn-primary { background: var(--cp-solid); color: var(--cp-contrast); }
    .btn-primary:hover { filter: brightness(0.92); }
`;

export const dateRange = defineUI({
    ...common,
    id: PREFIX + "daterange",
    label: "Date Range",
    icon: "fa fa-calendar",
    size: { w: 320, h: 40 },
    help: "Date Range Picker with dual calendar selection, quick presets (Today, Last 7d, 30d, Month, YTD), custom formatting, and UTC / Local timezone support.",
    properties: Object.assign({}, FIELD_PROPS, {
        format: {
            type: "string", default: "YYYY-MM-DD", group: "Format", label: "Display format template",
            help: "Tokens: YYYY, YY, MMMM, MMM, MM, M, DD, D, HH, H, hh, h, mm, m, ss, s, A (AM/PM), Z (offset)"
        },
        separator: {
            type: "string", default: "→", group: "Display", label: "Range separator"
        },
        startPlaceholder: {
            type: "string", default: "Start date", group: "Display", label: "Start placeholder"
        },
        endPlaceholder: {
            type: "string", default: "End date", group: "Display", label: "End placeholder"
        },
        presets: {
            type: "boolean", default: true, group: "Presets", label: "Show quick presets sidebar"
        },
        monthLayout: {
            type: "enum",
            default: "horizontal",
            group: "Display",
            label: "Calendar layout",
            style: "segmented",
            options: [
                { value: "horizontal", label: "Side by side" },
                { value: "vertical", label: "Stacked" }
            ]
        },
        enableTime: {
            type: "boolean", default: false, group: "Granularity", label: "Enable time selection (HH:mm)"
        },
        timezoneMode: {
            type: "enum", default: "utc", group: "Timezone / UTC", label: "Timezone handling", style: "segmented",
            options: [
                { value: "utc", label: "UTC" },
                { value: "local", label: "Local" }
            ],
            help: "UTC: stores & displays in UTC. Local: converts UTC timestamps to operator local time for human display and converts back on write."
        },
        outputType: {
            type: "enum", default: "iso", group: "Timezone / UTC", label: "Write output format", style: "combobox",
            options: [
                { value: "iso", label: "ISO-8601 string (e.g. 2026-09-30T00:00:00.000Z)" },
                { value: "timestamp-ms", label: "Unix timestamp (milliseconds)" },
                { value: "timestamp-s", label: "Unix timestamp (seconds)" },
                { value: "formatted", label: "Formatted template string" },
                { value: "utc-date", label: "Date only (YYYY-MM-DD)" }
            ]
        },
        defaultStart: { type: "string", default: "", group: "Data", label: "Default start date", help: "Default start date string or timestamp when unbound." },
        defaultEnd: { type: "string", default: "", group: "Data", label: "Default end date", help: "Default end date string or timestamp when unbound." },
        clearable: { type: "boolean", default: true, group: "Display", label: "Clear button (×)" },
        variant: variantProp([{ value: "filled", label: "Filled" }, { value: "outline", label: "Outline" }, { value: "flushed", label: "Flushed" }], "filled"),
        size: sizeProp(),
        colorPalette: paletteProp(),
        radius: radiusProp("md"),
        disabled: disabledProp(),
        readonly: { type: "boolean", default: false, group: "Behaviour", label: "Read-only" }
    }),
    inputs: {
        start: { type: "any", label: "Start Date (read)", help: "Date object, ISO string, timestamp number (ms/s), or formatted date string." },
        end: { type: "any", label: "End Date (read)", help: "Date object, ISO string, timestamp number (ms/s), or formatted date string." },
        range: { type: "any", label: "Range Object / Array (read)", help: "{ start, end } or [start, end]" }
    },
    outputs: {
        start: { fallback: "start", label: "Start Date (write)", help: "Written back as ISO string, Unix timestamp, or formatted string based on outputType." },
        end: { fallback: "end", label: "End Date (write)", help: "Written back as ISO string, Unix timestamp, or formatted string based on outputType." },
        range: { fallback: "range", label: "Range Object (write)", help: "Written back as { start, end } object with values formatted based on outputType." }
    },
    events: {
        change: { label: "On Change", payload: { start: "any", end: "any", range: "object", startIso: "string", endIso: "string", text: "string" } },
        open: { label: "On Popover Open" },
        close: { label: "On Popover Close" }
    },
    actions: {
        setPreset: { label: "Apply preset range", payload: { preset: "string" } },
        clear: { label: "Clear date range" }
    },
    parts: Object.assign({}, FIELD_PARTS, {
        box: part("Input box", "box"),
        popover: part("Range popover", "popover")
    }),
    view: class extends UIElement {
        static styles = [BASE_CSS, DATERANGE_CSS];

        constructor() {
            super();
            this._isOpen = false;
            this._tempStart = null;
            this._tempEnd = null;
            this._pickingEnd = false;
            this._hoverDate = null;
            this._localStart = null;
            this._localEnd = null;
            this._navMonth = new Date().getUTCMonth();
            this._navYear = new Date().getUTCFullYear();
            this._onDocumentClick = this._onDocumentClick.bind(this);
        }

        connectedCallback() {
            super.connectedCallback();
            document.addEventListener("click", this._onDocumentClick);
        }

        disconnectedCallback() {
            super.disconnectedCallback();
            document.removeEventListener("click", this._onDocumentClick);
        }

        _onDocumentClick(e) {
            if (!this._isOpen) return;
            const path = e.composedPath ? e.composedPath() : [];
            if (!path.includes(this)) {
                this.closePopover();
            }
        }

        get isUtc() {
            return (this.p.timezoneMode || "utc") === "utc";
        }

        get startDate() {
            const st = this.status && this.status("start");
            const bound = st && st.bound;
            let raw = (bound && this.in.start !== undefined) ? this.in.start : null;
            if (raw === null || raw === undefined || raw === "") {
                const rng = this.in && this.in.range;
                if (rng) {
                    if (Array.isArray(rng)) raw = rng[0];
                    else if (typeof rng === "object" && rng.start !== undefined) raw = rng.start;
                }
            }
            if (raw === null || raw === undefined || raw === "") {
                raw = this._localStart !== undefined && this._localStart !== null ? this._localStart : (this.p.defaultStart || this.p.start);
            }
            if (raw !== null && raw !== undefined && raw !== "") {
                return parseUniversalDate(raw, this.p.customRegex);
            }
            return null;
        }

        get endDate() {
            const st = this.status && this.status("end");
            const bound = st && st.bound;
            let raw = (bound && this.in.end !== undefined) ? this.in.end : null;
            if (raw === null || raw === undefined || raw === "") {
                const rng = this.in && this.in.range;
                if (rng) {
                    if (Array.isArray(rng)) raw = rng[1];
                    else if (typeof rng === "object" && rng.end !== undefined) raw = rng.end;
                }
            }
            if (raw === null || raw === undefined || raw === "") {
                raw = this._localEnd !== undefined && this._localEnd !== null ? this._localEnd : (this.p.defaultEnd || this.p.end);
            }
            if (raw !== null && raw !== undefined && raw !== "") {
                return parseUniversalDate(raw, this.p.customRegex);
            }
            return null;
        }

        togglePopover(e) {
            if (e) e.stopPropagation();
            if (this.isEditor || this.p.disabled || this.p.readonly) return;
            if (this._isOpen) {
                this.closePopover();
            } else {
                this.openPopover();
            }
        }

        openPopover() {
            this._isOpen = true;
            const cur = this.startDate || new Date();
            this._navMonth = this.isUtc ? cur.getUTCMonth() : cur.getMonth();
            this._navYear = this.isUtc ? cur.getUTCFullYear() : cur.getFullYear();
            this._tempStart = this.startDate;
            this._tempEnd = this.endDate;
            this._pickingEnd = false;
            this._hoverDate = null;
            this.emit("open");
            this.requestUpdate();
        }

        closePopover() {
            if (!this._isOpen) return;
            this._isOpen = false;
            this._hoverDate = null;
            this.emit("close");
            this.requestUpdate();
        }

        _formatOutput(date) {
            if (!date || isNaN(date.getTime())) return null;
            const p = this.p;
            switch (p.outputType) {
                case "timestamp-ms":
                    return date.getTime();
                case "timestamp-s":
                    return Math.floor(date.getTime() / 1000);
                case "formatted":
                    return formatDateTemplate(date, p.format || "YYYY-MM-DD", this.isUtc);
                case "utc-date":
                    return formatDateTemplate(date, "YYYY-MM-DD", true);
                case "iso":
                default:
                    return date.toISOString();
            }
        }

        _commitRange(startD, endD) {
            this._localStart = startD;
            this._localEnd = endD;

            const outStart = this._formatOutput(startD);
            const outEnd = this._formatOutput(endD);
            const outRange = (outStart !== null && outEnd !== null) ? { start: outStart, end: outEnd } : null;

            if (this.out.canWrite("start")) {
                this.out.write("start", outStart).catch(() => { });
            }
            if (this.out.canWrite("end")) {
                this.out.write("end", outEnd).catch(() => { });
            }
            if (this.out.canWrite("range")) {
                this.out.write("range", outRange).catch(() => { });
            }

            const fmt = this.p.format || (this.p.enableTime ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD");
            const startStr = startD ? formatDateTemplate(startD, fmt, this.isUtc) : "";
            const endStr = endD ? formatDateTemplate(endD, fmt, this.isUtc) : "";
            const text = startStr && endStr ? `${startStr} ${this.p.separator || "→"} ${endStr}` : (startStr || endStr);

            this.emit("change", {
                start: outStart,
                end: outEnd,
                range: outRange,
                startIso: startD ? startD.toISOString() : "",
                endIso: endD ? endD.toISOString() : "",
                text
            });
            this.requestUpdate();
        }

        applyPreset(presetId) {
            const range = getPresetRange(presetId, this.isUtc);
            if (!range) return;
            this._tempStart = range.start;
            this._tempEnd = range.end;
            this._pickingEnd = false;
            this._hoverDate = null;
            this._navMonth = this.isUtc ? range.start.getUTCMonth() : range.start.getMonth();
            this._navYear = this.isUtc ? range.start.getUTCFullYear() : range.start.getFullYear();
            this._commitRange(range.start, range.end);
            this.closePopover();
        }

        setPreset(presetId) {
            this.applyPreset(presetId);
        }

        clear() {
            this._localStart = null;
            this._localEnd = null;
            this._tempStart = null;
            this._tempEnd = null;
            this._pickingEnd = false;
            this._hoverDate = null;
            if (this.out.canWrite("start")) this.out.write("start", null).catch(() => { });
            if (this.out.canWrite("end")) this.out.write("end", null).catch(() => { });
            if (this.out.canWrite("range")) this.out.write("range", null).catch(() => { });
            this.emit("change", { start: null, end: null, range: null, startIso: "", endIso: "", text: "" });
            this.closePopover();
            this.requestUpdate();
        }

        _pickDay(y, mo, day) {
            let d;
            if (this.isUtc) {
                d = new Date(Date.UTC(y, mo, day, 0, 0, 0));
            } else {
                d = new Date(y, mo, day, 0, 0, 0);
            }

            if (!this._pickingEnd || !this._tempStart) {
                this._tempStart = d;
                this._tempEnd = null;
                this._pickingEnd = true;
                this._hoverDate = null;
                this.requestUpdate();
            } else {
                if (d.getTime() < this._tempStart.getTime()) {
                    this._tempEnd = this._tempStart;
                    this._tempStart = d;
                } else {
                    this._tempEnd = d;
                }
                this._pickingEnd = false;
                this._hoverDate = null;
                this._commitRange(this._tempStart, this._tempEnd);
                if (!this.p.enableTime) {
                    this.closePopover();
                }
            }
        }

        _onHoverDay(y, mo, day) {
            if (!this._pickingEnd || !this._tempStart) return;
            let d;
            if (this.isUtc) {
                d = new Date(Date.UTC(y, mo, day, 0, 0, 0));
            } else {
                d = new Date(y, mo, day, 0, 0, 0);
            }
            this._hoverDate = d;
            this.requestUpdate();
        }

        _updateTime(which, unit, val) {
            const isStart = which === "start";
            const cur = (isStart ? (this._tempStart || this.startDate) : (this._tempEnd || this.endDate)) || new Date();
            const n = Math.max(0, parseInt(val, 10) || 0);
            let d;
            if (this.isUtc) {
                let y = cur.getUTCFullYear(), mo = cur.getUTCMonth(), day = cur.getUTCDate();
                let h = cur.getUTCHours(), mi = cur.getUTCMinutes(), s = cur.getUTCSeconds();
                if (unit === "h") h = Math.min(23, n);
                if (unit === "m") mi = Math.min(59, n);
                d = new Date(Date.UTC(y, mo, day, h, mi, s));
            } else {
                let y = cur.getFullYear(), mo = cur.getMonth(), day = cur.getDate();
                let h = cur.getHours(), mi = cur.getMinutes(), s = cur.getSeconds();
                if (unit === "h") h = Math.min(23, n);
                if (unit === "m") mi = Math.min(59, n);
                d = new Date(y, mo, day, h, mi, s);
            }
            if (isStart) {
                this._tempStart = d;
            } else {
                this._tempEnd = d;
            }
            if (this._tempStart && this._tempEnd) {
                this._commitRange(this._tempStart, this._tempEnd);
            }
            this.requestUpdate();
        }

        _onDone() {
            if (this._tempStart && !this._tempEnd) {
                this._tempEnd = this._tempStart;
                this._commitRange(this._tempStart, this._tempEnd);
            }
            this.closePopover();
        }

        _prevMonth(e) {
            e.stopPropagation();
            if (this._navMonth === 0) {
                this._navMonth = 11;
                this._navYear--;
            } else {
                this._navMonth--;
            }
            this.requestUpdate();
        }

        _nextMonth(e) {
            e.stopPropagation();
            if (this._navMonth === 11) {
                this._navMonth = 0;
                this._navYear++;
            } else {
                this._navMonth++;
            }
            this.requestUpdate();
        }

        _renderCalendarGrid(year, month) {
            const isUtc = this.isUtc;
            const firstDayOfMonth = new Date(Date.UTC(year, month, 1)).getUTCDay();
            const startDayIndex = (firstDayOfMonth + 6) % 7;
            const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

            const startD = this._tempStart || this.startDate;
            const endD = this._tempEnd || this.endDate;

            const startKey = toDateKey(startD, isUtc);
            const endKey = toDateKey(endD, isUtc);

            let previewStartKey = "";
            let previewEndKey = "";
            if (this._pickingEnd && this._tempStart && this._hoverDate) {
                const k1 = toDateKey(this._tempStart, isUtc);
                const k2 = toDateKey(this._hoverDate, isUtc);
                if (k1 && k2) {
                    previewStartKey = k1 <= k2 ? k1 : k2;
                    previewEndKey = k1 <= k2 ? k2 : k1;
                }
            }

            const now = new Date();
            const nowY = isUtc ? now.getUTCFullYear() : now.getFullYear();
            const nowMo = isUtc ? now.getUTCMonth() : now.getMonth();
            const nowD = isUtc ? now.getUTCDate() : now.getDate();
            const todayKey = `${nowY}-${pad2(nowMo + 1)}-${pad2(nowD)}`;

            const cells = [];
            for (let i = 0; i < startDayIndex; i++) {
                cells.push(html`<span class="cal-day empty"></span>`);
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const dayKey = `${year}-${pad2(month + 1)}-${pad2(day)}`;
                const isStart = startKey && dayKey === startKey;
                const isEnd = endKey && dayKey === endKey;
                const isInRange = startKey && endKey && dayKey > startKey && dayKey < endKey;
                const isPreview = !endKey && previewStartKey && previewEndKey && dayKey >= previewStartKey && dayKey <= previewEndKey;
                const isToday = dayKey === todayKey;

                let cls = "cal-day";
                if (isStart && isEnd) cls += " range-start range-end";
                else if (isStart) cls += " range-start";
                else if (isEnd) cls += " range-end";
                else if (isInRange) cls += " in-range";
                else if (isPreview) cls += " in-range-preview";

                if (isToday) cls += " today";

                cells.push(html`<button class="${cls}" type="button"
                    @click="${(e) => { e.stopPropagation(); this._pickDay(year, month, day); }}"
                    @mouseenter="${() => this._onHoverDay(year, month, day)}">${day}</button>`);
            }
            return cells;
        }

        _renderPopover() {
            if (!this._isOpen) return nothing;
            const p = this.p;
            const hasPresets = p.presets !== false;
            const isUtc = this.isUtc;

            const m1 = this._navMonth;
            const y1 = this._navYear;
            const m2 = (this._navMonth + 1) % 12;
            const y2 = this._navMonth === 11 ? this._navYear + 1 : this._navYear;

            const startD = this._tempStart || this.startDate;
            const endD = this._tempEnd || this.endDate;

            const startH = startD ? (isUtc ? startD.getUTCHours() : startD.getHours()) : 0;
            const startM = startD ? (isUtc ? startD.getUTCMinutes() : startD.getMinutes()) : 0;
            const endH = endD ? (isUtc ? endD.getUTCHours() : endD.getHours()) : 23;
            const endM = endD ? (isUtc ? endD.getUTCMinutes() : endD.getMinutes()) : 59;

            const fmt = p.format || (p.enableTime ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD");
            let summary = "Select date range";
            if (startD && endD) {
                const diffMs = Math.abs(endD.getTime() - startD.getTime());
                const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
                summary = `${formatDateTemplate(startD, fmt, isUtc)} → ${formatDateTemplate(endD, fmt, isUtc)} (${days}d)`;
            } else if (startD) {
                summary = `From ${formatDateTemplate(startD, fmt, isUtc)} (select end date)`;
            }

            return html`<div class="daterange-popover" part="popover" @click="${(e) => e.stopPropagation()}">
                ${hasPresets ? html`
                    <div class="daterange-presets">
                        ${PRESETS.map((pr) => html`
                            <button class="daterange-preset-btn" type="button" @click="${() => this.applyPreset(pr.id)}">
                                ${pr.label}
                            </button>
                        `)}
                    </div>
                ` : nothing}

                <div class="daterange-main">
                    <div class="daterange-panes ${p.monthLayout === "vertical" ? "vertical" : ""}">
                        <div class="daterange-pane">
                            <div class="cal-header">
                                <button class="cal-nav-btn" type="button" title="Previous Month" @click="${this._prevMonth}">
                                    ${icon("chevron-left")}
                                </button>
                                <span class="cal-title">${MONTH_NAMES_FULL[m1]} ${y1}</span>
                                <span style="width:26px;"></span>
                            </div>
                            <div class="cal-grid">
                                ${WEEKDAYS.map((w) => html`<span class="cal-wk">${w}</span>`)}
                                ${this._renderCalendarGrid(y1, m1)}
                            </div>
                        </div>

                        <div class="daterange-pane">
                            <div class="cal-header">
                                <span style="width:26px;"></span>
                                <span class="cal-title">${MONTH_NAMES_FULL[m2]} ${y2}</span>
                                <button class="cal-nav-btn" type="button" title="Next Month" @click="${this._nextMonth}">
                                    ${icon("chevron-right")}
                                </button>
                            </div>
                            <div class="cal-grid">
                                ${WEEKDAYS.map((w) => html`<span class="cal-wk">${w}</span>`)}
                                ${this._renderCalendarGrid(y2, m2)}
                            </div>
                        </div>
                    </div>

                    ${p.enableTime ? html`
                        <div class="time-strip">
                            <div class="time-group">
                                <span class="time-label">Start:</span>
                                <input class="time-input" type="number" min="0" max="23" .value="${pad2(startH)}"
                                    @change="${(e) => this._updateTime("start", "h", e.target.value)}" title="Start Hour" />
                                <span class="time-sep">:</span>
                                <input class="time-input" type="number" min="0" max="59" .value="${pad2(startM)}"
                                    @change="${(e) => this._updateTime("start", "m", e.target.value)}" title="Start Minute" />
                            </div>
                            <div class="time-group">
                                <span class="time-label">End:</span>
                                <input class="time-input" type="number" min="0" max="23" .value="${pad2(endH)}"
                                    @change="${(e) => this._updateTime("end", "h", e.target.value)}" title="End Hour" />
                                <span class="time-sep">:</span>
                                <input class="time-input" type="number" min="0" max="59" .value="${pad2(endM)}"
                                    @change="${(e) => this._updateTime("end", "m", e.target.value)}" title="End Minute" />
                            </div>
                        </div>
                    ` : nothing}

                    <div class="daterange-footer">
                        <span class="daterange-summary">${summary}</span>
                        <div class="daterange-footer-actions">
                            ${p.clearable ? html`<button class="btn-subtle" type="button" @click="${this.clear}">Clear</button>` : nothing}
                            <button class="btn-primary" type="button" @click="${this._onDone}">Done</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        render() {
            const p = this.p;
            const startD = this.startDate;
            const endD = this.endDate;
            const fmt = p.format || (p.enableTime ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD");
            const startStr = startD ? formatDateTemplate(startD, fmt, this.isUtc) : "";
            const endStr = endD ? formatDateTemplate(endD, fmt, this.isUtc) : "";

            const box = html`<div class="box ${p.disabled ? "disabled" : ""} ${p.readonly ? "readonly" : ""}" part="box"
                @click="${this.togglePopover}">
                <span class="range-display-segment ${!startStr ? "placeholder" : ""}">
                    ${startStr || p.startPlaceholder || (this.isEditor ? "2026-09-01" : "Start date")}
                </span>
                <span class="range-arrow">${p.separator || "→"}</span>
                <span class="range-display-segment ${!endStr ? "placeholder" : ""}">
                    ${endStr || p.endPlaceholder || (this.isEditor ? "2026-09-30" : "End date")}
                </span>

                <span class="tz-badge ${this.isUtc ? "utc" : ""}" title="Timezone Mode: ${this.isUtc ? "UTC" : "Local"}">
                    ${this.isUtc ? "UTC" : "LOC"}
                </span>

                ${p.clearable && (startStr || endStr) && !p.disabled && !p.readonly ? html`
                    <button class="clear-btn" type="button" title="Clear range" tabindex="-1" @click="${(e) => { e.stopPropagation(); this.clear(); }}">
                        ${icon("x")}
                    </button>
                ` : nothing}

                <button class="icon-btn" type="button" title="Pick date range" aria-label="Pick date range" tabindex="-1"
                    ?disabled="${p.disabled}" @click="${this.togglePopover}">
                    ${icon("calendar")}
                </button>

                ${this._renderPopover()}
            </div>`;

            return field(this, box);
        }
    }
});

