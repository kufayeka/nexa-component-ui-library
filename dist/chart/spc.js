// Nexa UI — SPC / Control Chart: is the process stable, and is it capable? I-MR, X̄-R, X̄-S, p, np, c, u (or the one that
// fits the data), the limits from the process (all, the first N locked, a time range, or manual), a phase each its own
// limits, zones A / B / C, Nelson / Western Electric rules marked on the points that break them, the spec, a capability
// panel (Cp, Cpk, Pp, Ppk, PPM). Notes and exclusions come from the DB through Logic: On Point Click / On Violation ->
// Logic saves -> the notes / excluded props (or Set notes / Set excluded) bring them back. The chart keeps nothing.
// The maths are in spc-core.js (pure, tested on its own).
import { html, css, formatValue } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, part, defineUI } from "../core.js";
import { ChartElement, chartCommon, opt, numOr, DASHES } from "./core.js";
import { exportProps } from "./props.js";
import { niceTicks } from "./stack.js";
import { toMs } from "./rows.js";
import { spanMs } from "./time.js";
import { xlsxBlob } from "./export.js";
import { subgroups, autoType, analyse, capability, RULES, RULE_SETS, TYPES, isVariable } from "./spc-core.js";

const measure = (p) => p.dataKind !== "count";
const count = (p) => p.dataKind === "count";
const CL_NAME = { imr: "X̄", "xbar-r": "X̿", "xbar-s": "X̿", p: "p̄", np: "np̄", c: "c̄", u: "ū" };
const STAT_NAME = { imr: "Value", "xbar-r": "Mean", "xbar-s": "Mean", p: "Proportion", np: "Defectives", c: "Defects", u: "Defects per unit" };
const LOWER_NAME = { imr: "MR", "xbar-r": "Range", "xbar-s": "Std dev" };
const LOWER_CL = { imr: "MR̄", "xbar-r": "R̄", "xbar-s": "S̄" };
const CUSTOM = ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "WE4"];

export const spc = defineUI({
    ...chartCommon,
    id: PREFIX + "spc",
    label: "SPC / Control Chart",
    icon: "fa fa-line-chart",
    size: { w: 760, h: 380 },
    help: "Statistical process control: I-MR, X̄-R, X̄-S, p, np, c, u; limits from the process (or locked from a baseline), phases, zones, Nelson / Western Electric rules, the spec and a capability panel (Cp, Cpk, Pp, Ppk). Notes and exclusions from the DB through Logic.",
    version: 1,

    groups: ["Data", "Chart", "Limits", "Rules", "Spec & capability", "Notes", "General", "Export"],

    properties: {
        dataKind: { type: "enum", group: "Data", label: "The data", default: "measure", options: opt([["measure", "Measurements (a value per part / reading)"], ["count", "Counts (defectives or defects per sample)"]]) },
        rows: { type: "json", group: "Data", label: "Rows", default: [], help: "From a query: [{ \"time\": …, \"value\": 10.02 }] or, for counts, [{ \"time\": …, \"defects\": 3, \"n\": 200 }]. Logic: Set rows / Append rows / Append value." },
        valueField: { type: "string", group: "Data", label: "Value field", default: "value", bindable: false, visibleWhen: measure },
        countField: { type: "string", group: "Data", label: "Count field", default: "defects", bindable: false, visibleWhen: count },
        sizeField: { type: "string", group: "Data", label: "Sample size field", default: "n", bindable: false, help: "Empty: the sample size below for every row.", visibleWhen: count },
        sampleSize: { type: "number", group: "Data", label: "Sample size", default: 1, min: 1, visibleWhen: (p) => count(p) && !p.sizeField },
        countKind: { type: "enum", group: "Data", label: "Counted", default: "defectives", options: opt([["defectives", "Defective parts (p / np)"], ["defects", "Defects (c / u)"]]), visibleWhen: count },
        timeField: { type: "string", group: "Data", label: "Time field", default: "time", bindable: false },
        idField: { type: "string", group: "Data", label: "ID field", default: "", bindable: false, help: "A sample's key in the events, notes and exclusions (a sample / batch id). Empty: its time, else its number." },
        subgroupBy: { type: "enum", group: "Data", label: "Subgroups", default: "none", options: opt([["none", "Each reading its own (I-MR)"], ["size", "Every N readings"], ["field", "By a field"], ["time", "Per interval"]]), visibleWhen: measure },
        subgroupSize: { type: "number", group: "Data", label: "N", default: 5, min: 2, max: 50, visibleWhen: (p) => measure(p) && p.subgroupBy === "size" },
        subgroupField: { type: "string", group: "Data", label: "Subgroup field", default: "", bindable: false, visibleWhen: (p) => measure(p) && p.subgroupBy === "field" },
        interval: { type: "enum", group: "Data", label: "Interval", default: "1h", options: opt([["1m", "1 minute"], ["5m", "5 minutes"], ["15m", "15 minutes"], ["1h", "1 hour"], ["8h", "8 hours (a shift)"], ["24h", "1 day"]]), visibleWhen: (p) => measure(p) && p.subgroupBy === "time" },
        phaseField: { type: "string", group: "Data", label: "Phase field", default: "", bindable: false, help: "Each phase gets its own limits (before / after a change). Or the Phases list under Limits." },
        excludeField: { type: "string", group: "Data", label: "Excluded field", default: "", bindable: false, help: "A row with this field true is left out of the limits (a known cause)." },
        tag: { type: "tag", access: "read", group: "Data", section: "Live", label: "Live value", help: "A reading each time it changes. A part measured twice with the same value: use Append value from Logic.", visibleWhen: measure },
        maxValues: { type: "number", group: "Data", section: "Live", label: "Readings kept (live)", default: 5000, min: 50, max: 200000, visibleWhen: measure },

        chartType: { type: "enum", group: "Chart", label: "Chart", default: "auto", options: opt([["auto", "Automatic (fits the data)"], ["imr", "I-MR (individuals)"], ["xbar-r", "X̄-R (subgroups 2 – 9)"], ["xbar-s", "X̄-S (subgroups 10+)"], ["p", "p (proportion defective)"], ["np", "np (defectives, fixed n)"], ["c", "c (defects, fixed unit)"], ["u", "u (defects per unit)"]]) },
        lowerChart: { type: "boolean", group: "Chart", label: "The MR / R / S chart under it", default: true },
        visible: { type: "number", group: "Chart", label: "Subgroups shown", default: 50, min: 0, max: 5000, help: "The latest ones (0: all). Drag pans, Ctrl + wheel zooms, a double click resets." },
        decimals: { type: "number", group: "Chart", label: "Decimals", default: "", min: 0, max: 8, help: "Empty: automatic." },
        unit: { type: "string", group: "Chart", label: "Unit", default: "" },

        limitsFrom: { type: "enum", group: "Limits", label: "Limits from", default: "all", options: opt([["all", "Every subgroup (they move with the data)"], ["first", "The first N (locked)"], ["range", "A time range (locked)"], ["manual", "Set values (historical)"]]) },
        baselineCount: { type: "number", group: "Limits", label: "First N subgroups", default: 25, min: 2, visibleWhen: (p) => p.limitsFrom === "first" },
        baselineFrom: { type: "string", group: "Limits", label: "From", default: "", help: "2026-10-01 06:00, or ms.", visibleWhen: (p) => p.limitsFrom === "range" },
        baselineTo: { type: "string", group: "Limits", label: "To", default: "", visibleWhen: (p) => p.limitsFrom === "range" },
        manualMean: { type: "number", group: "Limits", label: "Process mean", default: "", visibleWhen: (p) => p.limitsFrom === "manual" && measure(p) },
        manualSigma: { type: "number", group: "Limits", label: "Process σ", default: "", visibleWhen: (p) => p.limitsFrom === "manual" && measure(p) },
        manualCenter: { type: "number", group: "Limits", label: "Centre (p̄ / c̄ / ū)", default: "", visibleWhen: (p) => p.limitsFrom === "manual" && count(p) },
        phases: { type: "list", group: "Limits", label: "Phases", noun: "phase", default: [], help: "A phase from a time on, each with its own limits (or a Phase field in the rows).",
            item: { noun: "phase", fields: { name: { type: "string", label: "Name", default: "Phase" }, from: { type: "string", label: "From", default: "", help: "2026-10-01 06:00, or ms." } } } },
        zones: { type: "boolean", group: "Limits", label: "Zones A / B / C", default: true },
        sigmaLines: { type: "boolean", group: "Limits", label: "±1σ and ±2σ lines", default: false },
        limitLabels: { type: "boolean", group: "Limits", label: "Their values at the right", default: true },

        ruleSet: { type: "enum", group: "Rules", label: "Rules", default: "we", options: opt([["basic", "Beyond the limits only"], ["we", "Western Electric (4)"], ["nelson", "Nelson (8)"], ["custom", "Pick them"]]) },
        ...Object.fromEntries(CUSTOM.map((r) => ["rule" + r, { type: "boolean", group: "Rules", section: "Custom", label: r + ": " + RULES[r], default: r === "N1", visibleWhen: (p) => p.ruleSet === "custom" }])),
        ruleNumbers: { type: "boolean", group: "Rules", label: "The rule's number on the point", default: true },
        violationColor: { type: "color", group: "Rules", label: "A point that breaks a rule", default: "", tokens: "colors", help: "Empty: the theme's error colour." },

        usl: { type: "number", group: "Spec & capability", label: "USL", default: "" },
        lsl: { type: "number", group: "Spec & capability", label: "LSL", default: "" },
        target: { type: "number", group: "Spec & capability", label: "Target", default: "" },
        specLines: { type: "boolean", group: "Spec & capability", label: "Spec lines on the individuals chart", default: true, help: "Only on I-MR: a mean of a subgroup is not a part, against the spec it misleads." },
        capability: { type: "boolean", group: "Spec & capability", label: "Capability panel", default: true },
        capabilityWidth: { type: "number", group: "Spec & capability", label: "Its width", default: 240, min: 160, max: 480, unit: "px", visibleWhen: (p) => p.capability !== false },
        cpkGood: { type: "number", group: "Spec & capability", label: "Cpk good from", default: 1.33, step: 0.01, visibleWhen: (p) => p.capability !== false },
        cpkMin: { type: "number", group: "Spec & capability", label: "Cpk acceptable from", default: 1, step: 0.01, visibleWhen: (p) => p.capability !== false },

        notes: { type: "json", group: "Notes", label: "Notes", default: [], help: "From the DB: [{ \"key\": \"B-1042\" (or \"time\"), \"text\": \"Tool changed\" }]. A flag on the point; On Note Click." },
        excluded: { type: "json", group: "Notes", label: "Excluded", default: [], help: "From the DB: the keys (or times) of the subgroups left out of the limits. A hollow point." },
        noteColor: { type: "color", group: "Notes", label: "Note flag", default: "", tokens: "colors" },

        title: { type: "string", group: "General", label: "Title", default: "" },
        background: { type: "color", group: "General", label: "Background", default: "", tokens: "colors" },
        border: { type: "boolean", group: "General", label: "Border", default: true },
        tooltip: { type: "boolean", group: "General", label: "Tooltip", default: true },
        ...exportProps({ thresholds: false })
    },

    parts: { chart: part("Chart container", "chart") },

    events: {
        pointClick: { label: "On Point Click", payload: { key: "string", time: "number", phase: "string", value: "number", lower: "number", n: "number", cl: "number", ucl: "number", lcl: "number", rules: "array", excluded: "boolean", note: "string" }, help: "A click on a subgroup: save a note or an exclusion to the DB, then bring it back (notes / excluded)." },
        violation: { label: "On Violation", payload: { key: "string", time: "number", phase: "string", value: "number", chart: "string", rules: "array" }, help: "A NEW point breaks a rule (not the ones already there when the chart loaded): an alarm, an andon, a mail." },
        noteClick: { label: "On Note Click", payload: { key: "string", time: "number", text: "string", note: "object" } }
    },
    actions: {
        setRows: { label: "Set rows", example: "[{ \"time\": …, \"value\": 10.02 }, …]" },
        appendRows: { label: "Append rows", example: "{ \"time\": …, \"value\": 10.02 }  or  [ … ]" },
        appendValue: { label: "Append value", params: { value: "number", time: "number" }, example: "{ \"value\": 10.02 }" },
        setNotes: { label: "Set notes", example: "[{ \"key\": \"B-1042\", \"text\": \"Tool changed\" }]" },
        setExcluded: { label: "Set excluded", example: "[\"B-1042\"]" },
        resetZoom: { label: "Reset the zoom" },
        clearAll: { label: "Clear" },
        exportData: { label: "Export (download)", params: { format: "string" }, example: "{ \"format\": \"xlsx\" }  (csv | xlsx | png)" }
    },

    view: class extends ChartElement {
        static styles = [...ChartElement.styles, css`
            .spc-wrap { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden;
                border-radius: var(--r, 4px); background: var(--panel, #181b1f); border: 1px solid var(--bd, #2c3235); }
            .spc-wrap.borderless { border-color: transparent; }
            .spc-head { flex: 0 0 auto; display: flex; gap: 10px; align-items: baseline; padding: 10px 14px 0; font-size: 14px; font-weight: 600; color: var(--fg); }
            .spc-head .sub { font-size: 12px; font-weight: 400; color: var(--fg-muted); }
            .spc-wrap .plot { cursor: default; flex: 1 1 auto; position: relative; }
            .spc-wrap .plot.panning { cursor: grabbing; }
            .sc-tip { position: absolute; pointer-events: none; z-index: 6; display: none; padding: 6px 9px; border-radius: 4px; background: var(--panel, #181b1f); border: 1px solid var(--bd, #2c3235);
                color: var(--fg, #fff); font: 12px/1.45 var(--nexa-fonts-body, sans-serif); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); max-width: 320px; }
            .zoom-chip { position: absolute; right: 34px; top: 6px; z-index: 5; }
        `];

        _rowsData = null;
        _notesData = null;
        _exclData = null;
        _live = null;
        _lastLive;
        _m = null;
        _mKey = null;
        _view = null;
        _geo = null;
        _hover = -1;
        _drag = null;
        _seen = null;

        propsChanged() { this._takeLive(); }

        // ---- data -------------------------------------------------------------------------------------
        _rows() { const r = this._rowsData || this.p.rows; return Array.isArray(r) ? r : []; }
        _editor() { return !!(this._ctx && this._ctx.mode === "editor"); }
        _sample() { return this._editor() && !this._rows().length && !(this._live && this._live.length); }
        _hasData() { return !!(this._rows().length || (this._live && this._live.length)); }
        _changed() { this._m = null; this.scheduleDraw(); this.requestUpdate(); }

        setRows(params) { const r = Array.isArray(params) ? params : params && Array.isArray(params.rows) ? params.rows : null; if (r) { this._rowsData = r.slice(); this._changed(); } }
        appendRows(params) { const add = Array.isArray(params) ? params : params && typeof params === "object" ? [params] : []; this._rowsData = this._rows().concat(add); this._changed(); }
        appendValue(params) {
            const v = Number(params && typeof params === "object" ? params.value : params);
            if (!Number.isFinite(v)) return;
            const t = params && typeof params === "object" && params.time !== undefined ? toMs(params.time) : Date.now();
            this._pushLive(v, t);
        }
        setNotes(params) { this._notesData = Array.isArray(params) ? params : params && Array.isArray(params.notes) ? params.notes : []; this._changed(); }
        setExcluded(params) { this._exclData = Array.isArray(params) ? params : params && Array.isArray(params.excluded) ? params.excluded : []; this._changed(); }
        resetZoom() { this._view = null; this.scheduleDraw(); this.requestUpdate(); }
        clearAll() { this._rowsData = []; this._live = null; this._seen = null; this._view = null; this._changed(); }

        _takeLive() {
            const p = this.p || {}, v = p.tag;
            if (v === "" || v === null || v === undefined || typeof v === "object" || typeof v === "boolean") return;
            const n = Number(v);
            if (!Number.isFinite(n) || n === this._lastLive) return;
            this._lastLive = n;
            this._pushLive(n, Date.now());
        }
        _pushLive(v, t) {
            const cap = Math.max(50, numOr(this.p.maxValues, 5000));
            if (!this._live) this._live = [];
            this._live.push({ t, v });
            if (this._live.length > cap) this._live.splice(0, this._live.length - cap);
            this._changed();
        }

        _phaseOf(t) {
            const list = (Array.isArray(this.p.phases) ? this.p.phases : []).map((x) => ({ name: String(x.name || ""), from: toMs(/^\d+$/.test(String(x.from)) ? Number(x.from) : x.from) })).filter((x) => Number.isFinite(x.from)).sort((a, b) => a.from - b.from);
            let name = "";
            for (const x of list) if (t >= x.from) name = x.name;
            return name;
        }

        // the editor's sample: decoration (a stable process, then a shift the rules catch)
        _sampleGroups(kind, type) {
            let seed = 11;
            const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }, g = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u - 3; };
            const t0 = Date.UTC(2026, 9, 1, 6), out = [];
            for (let i = 0; i < 40; i++) {
                const shift = i >= 30 ? 0.9 : 0;
                if (kind === "count") { const n = 200; out.push({ key: String(i + 1), t: t0 + i * 36e5, phase: "", n, count: Math.max(0, Math.round(6 + g() * 2.2 + (i >= 30 ? 6 : 0))) }); continue; }
                const m = type === "xbar-r" ? 5 : type === "xbar-s" ? 10 : 1, vals = [];
                for (let k = 0; k < m; k++) vals.push(Math.round((10 + shift + g() * 0.35) * 1000) / 1000);
                out.push({ key: String(i + 1), t: t0 + i * 36e5, phase: "", vals });
            }
            return out;
        }

        // rows / live -> subgroups -> the analysis (cached on what it depends on)
        _model() {
            const p = this.p, rows = this._rows(), sample = this._sample(), notes = this._notesData || p.notes, excl = this._exclData || p.excluded;
            const key = [rows, this._live && this._live.length, notes, excl, sample, p.dataKind, p.valueField, p.countField, p.sizeField, p.sampleSize, p.countKind, p.timeField, p.idField, p.subgroupBy, p.subgroupSize, p.subgroupField, p.interval, p.phaseField, p.excludeField,
                p.chartType, p.limitsFrom, p.baselineCount, p.baselineFrom, p.baselineTo, p.manualMean, p.manualSigma, p.manualCenter, p.phases, p.ruleSet, ...CUSTOM.map((r) => p["rule" + r])];
            if (this._m && this._mKey && key.length === this._mKey.length && key.every((v, i) => v === this._mKey[i])) return this._m;
            this._mKey = key;
            const kind = count(p) ? "count" : "measure";
            const tf = p.timeField, idf = p.idField, pf = p.phaseField, ef = p.excludeField;
            const timeOf = (r) => (tf && r[tf] !== undefined ? toMs(r[tf]) : NaN);
            const keyOf = (r, t) => (idf && r[idf] !== undefined && r[idf] !== null && r[idf] !== "" ? String(r[idf]) : Number.isFinite(t) ? String(t) : undefined);
            const phaseOf = (r, t) => (pf ? String(r[pf] === undefined || r[pf] === null ? "" : r[pf]) : this._phaseOf(t));
            let groups;
            const pre = p.chartType && p.chartType !== "auto" ? p.chartType : null;
            if (sample) groups = this._sampleGroups(kind, pre || (kind === "count" ? "p" : "imr"));
            else if (kind === "count") {
                groups = [];
                rows.forEach((r, i) => {
                    if (!r || typeof r !== "object") return;
                    const c = Number(r[p.countField || "defects"]), n = p.sizeField ? Number(r[p.sizeField]) : numOr(p.sampleSize, 1);
                    if (!Number.isFinite(c) || !(n > 0)) return;
                    const t = timeOf(r);
                    groups.push({ key: keyOf(r, t) || String(i + 1), t, phase: phaseOf(r, t), count: c, n, excluded: !!(ef && r[ef]) });
                });
            } else {
                const vf = p.valueField || "value", vals = [];
                rows.forEach((r) => {
                    if (!r || typeof r !== "object") return;
                    const t = timeOf(r);
                    vals.push({ t, v: Number(r[vf]), key: p.subgroupBy === "field" ? r[p.subgroupField] : keyOf(r, t), phase: phaseOf(r, t), excluded: !!(ef && r[ef]) });
                });
                if (this._live) this._live.forEach((x) => vals.push({ t: x.t, v: x.v, key: String(x.t), phase: this._phaseOf(x.t) }));
                groups = subgroups(vals, { by: p.subgroupBy || "none", size: numOr(p.subgroupSize, 5), interval: spanMs(p.interval || "1h") });
            }
            const ex = new Set((Array.isArray(excl) ? excl : []).map((x) => String(x && typeof x === "object" ? x.key !== undefined ? x.key : toMs(x.time) : x)));
            groups.forEach((g) => { if (ex.has(String(g.key)) || (Number.isFinite(g.t) && ex.has(String(g.t)))) g.excluded = true; });
            let type = pre && (isVariable(pre) === (kind === "measure")) ? pre : autoType(groups, kind, p.countKind);
            if (type === "imr") groups = groups.map((g) => (g.vals && g.vals.length > 1 ? Object.assign({}, g, { vals: [g.vals.reduce((a, b) => a + b, 0) / g.vals.length] }) : g));
            const rules = p.ruleSet === "custom" ? CUSTOM.filter((r) => p["rule" + r]) : RULE_SETS[p.ruleSet] || RULE_SETS.we;
            const bt = (v) => toMs(/^\d+$/.test(String(v)) ? Number(v) : v);
            const baseline = { mode: p.limitsFrom || "all", count: numOr(p.baselineCount, 25), from: bt(p.baselineFrom), to: bt(p.baselineTo), mean: numOr(p.manualMean, NaN), sigma: numOr(p.manualSigma, NaN), center: numOr(p.manualCenter, NaN) };
            const a = analyse(groups, { type, baseline, rules });
            // notes on their points
            const noteAt = new Map();
            (Array.isArray(notes) ? notes : []).forEach((nt) => {
                if (!nt || typeof nt !== "object") return;
                const k = nt.key !== undefined ? String(nt.key) : null, t = nt.time !== undefined ? toMs(nt.time) : NaN;
                const i = a.points.findIndex((P) => (k !== null && String(P.key) === k) || (Number.isFinite(t) && P.t === t));
                if (i >= 0) { if (!noteAt.has(i)) noteAt.set(i, []); noteAt.get(i).push(nt); }
            });
            const m = { kind, type, a, groups, noteAt, sample };
            this._m = m;
            if (!sample && !this._editor()) this._emitNew(m);
            return m;
        }

        // On Violation for points that break a rule NOW (the ones there when it loaded are only remembered)
        _emitNew(m) {
            const fresh = [], seen = this._seen || new Set(), first = !this._seen;
            m.a.points.forEach((P) => {
                [["upper", P.rules], ["lower", P.rules2]].forEach(([chart, list]) => list.forEach((r) => {
                    const id = P.key + "|" + chart + "|" + r;
                    if (seen.has(id)) return;
                    seen.add(id);
                    if (!first) fresh.push({ P, chart, r });
                }));
            });
            this._seen = seen;
            const by = new Map();
            fresh.forEach((f) => { const k = f.P.key + "|" + f.chart; if (!by.has(k)) by.set(k, { P: f.P, chart: f.chart, rules: [] }); by.get(k).rules.push(f.r); });
            by.forEach(({ P, chart, rules }) => queueMicrotask(() => this.emit("violation", { key: P.key, time: P.t, phase: P.phase, value: chart === "upper" ? P.x : P.y, chart, rules: rules.map((r) => ({ rule: r, text: RULES[r] })) })));
        }

        // ---- the drawing ------------------------------------------------------------------------------
        _fmt(v) { const d = this.p.decimals; return formatValue(v, { decimals: d === "" || d === undefined || d === null ? "auto" : String(d) }, ""); }
        _lim(v, ticks) {
            const d = this.p.decimals;
            if (d !== "" && d !== undefined && d !== null) return this._fmt(v);
            const st = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : Math.abs(v) || 1;
            return v.toFixed(Math.max(0, Math.min(8, 1 - Math.floor(Math.log10(st)))));
        }
        _vcol() { return this._tok(this.p.violationColor) || this.statusColor("error"); }
        _panelColor() { return getComputedStyle(this).getPropertyValue("--panel").trim() || "#ffffff"; }

        draw() {
            if (!this.ctx || !this.canvas) return;
            const { w, h } = this._layoutSize();
            if (w > 0 && h > 0) this._drawInto(this.ctx, w, h);
        }

        _drawInto(ctx, w, h) {
            this._clearCanvas(ctx, w, h);
            const p = this.p, m = this._model(), P = m.a.points, c = this._colors(), fs = 11, font = c.font;
            this._geo = null;
            if (!P.length) return;
            const N = P.length, cnt = this._view ? this._view.count : p.visible > 0 ? Math.min(N, Math.round(p.visible)) : N;
            const start = this._view ? Math.max(0, Math.min(N - cnt, this._view.start)) : N - cnt;
            const capW = p.capability !== false ? Math.min(Math.max(160, numOr(p.capabilityWidth, 240)), w * 0.45) : 0;
            const lower = p.lowerChart !== false && isVariable(m.type);
            const px0 = 8, pr = p.limitLabels !== false ? 72 : 12, top = p.exportButton !== false ? 26 : 10, xh = fs + 10;
            const avail = h - top - xh - 4, upH = lower ? avail * 0.64 : avail, loH = lower ? avail - upH - 14 : 0;
            ctx.font = fs + "px " + font;
            const span = (lo, hi) => { const pad = (hi - lo) * 0.08 || Math.abs(lo) * 0.1 || 1; return [lo - pad, hi + pad]; };
            const ext = (keys, also) => { let lo = Infinity, hi = -Infinity; for (let i = start; i < start + cnt; i++) for (const k of keys) { const v = P[i][k]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } } (also || []).forEach((v) => { if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); return lo === Infinity ? [0, 1] : span(lo, hi); };
            const spec = m.type === "imr" && p.specLines !== false ? [numOr(p.usl, NaN), numOr(p.lsl, NaN), numOr(p.target, NaN)] : [];
            const [u0, u1] = ext(["x", "ucl", "lcl"], spec), [l0, l1] = lower ? ext(["y", "ucl2", "lcl2"]) : [0, 1];
            const ut = niceTicks(u0, u1, Math.max(3, Math.floor(upH / 40))).ticks.filter((v) => v >= u0 && v <= u1), lt = lower ? niceTicks(l0, l1, Math.max(2, Math.floor(loH / 40))).ticks.filter((v) => v >= l0 && v <= l1) : [];
            const yw = Math.max(...ut.concat(lt).map((v) => ctx.measureText(this._fmt(v)).width), 10);
            const px = px0 + yw + 6, pw = Math.max(40, w - capW - px - pr), cw = pw / cnt;
            const X = (i) => px + (i - start + 0.5) * cw;
            const up = { py: top, ph: upH, Y: (v) => top + upH - ((v - u0) / (u1 - u0 || 1)) * upH, ticks: ut };
            const lo = lower ? { py: top + upH + 14, ph: loH, Y: (v) => top + upH + 14 + loH - ((v - l0) / (l1 - l0 || 1)) * loH, ticks: lt } : null;
            this._geo = { px, pw, cw, start, cnt, up, lo, X, m };
            // gridlines and the axis labels
            ctx.save();
            ctx.strokeStyle = c.grid; ctx.fillStyle = c.text; ctx.lineWidth = 1; ctx.textAlign = "right"; ctx.textBaseline = "middle";
            [up, lo].filter(Boolean).forEach((pl) => pl.ticks.forEach((v) => { const y = Math.round(pl.Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke(); ctx.fillText(this._fmt(v), px - 6, y); }));
            const last = lo || up, timeAll = P.every((q) => Number.isFinite(q.t)), daySpan = timeAll && P[start + cnt - 1].t - P[start].t > 864e5;
            const pad2 = (n) => String(n).padStart(2, "0"), lab = (q) => { if (!Number.isFinite(q.t)) return "#" + q.key; const d = new Date(q.t); return (daySpan ? pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + " " : "") + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); };
            const every = Math.max(1, Math.ceil(cnt / Math.max(2, Math.floor(pw / (daySpan ? 90 : 56)))));
            ctx.textAlign = "center"; ctx.textBaseline = "top";
            for (let i = start; i < start + cnt; i += every) ctx.fillText(timeAll ? lab(P[i]) : "#" + P[i].key, X(i), last.py + last.ph + 5);
            ctx.restore();
            this._plot(ctx, up, P, start, cnt, X, cw, c, fs, font, "upper", m, px, pw);
            if (lo) this._plot(ctx, lo, P, start, cnt, X, cw, c, fs, font, "lower", m, px, pw);
            // phases: a divider and the name
            ctx.save();
            m.a.segments.forEach((s) => {
                if (s.to < start || s.from >= start + cnt) return;
                const x = Math.max(px, X(Math.max(s.from, start)) - cw / 2);
                if (s.from > start) { ctx.strokeStyle = c.strong; ctx.setLineDash(DASHES.dashed); ctx.beginPath(); ctx.moveTo(x + 0.5, up.py); ctx.lineTo(x + 0.5, last.py + last.ph); ctx.stroke(); ctx.setLineDash([]); }
                if (s.phase) { ctx.font = "600 " + fs + "px " + font; ctx.fillStyle = c.strong; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(s.phase, x + 4, up.py + 2); }
            });
            ctx.restore();
            if (capW) this._capPanel(ctx, w - capW, top, capW - 10, h - top - 8, m, c, fs, font);
        }

        // one chart: zones, limits (stepped where n varies), the spec, the line, the points, the labels
        _plot(ctx, pl, P, start, cnt, X, cw, c, fs, font, which, m, px, pw) {
            const p = this.p, up = which === "upper", V = up ? "x" : "y", CL = up ? "cl" : "cl2", UCL = up ? "ucl" : "ucl2", LCL = up ? "lcl" : "lcl2", R = up ? "rules" : "rules2";
            const end = start + cnt, vcol = this._vcol(), Y = pl.Y;
            ctx.save();
            ctx.beginPath(); ctx.rect(px, pl.py, pw, pl.ph); ctx.clip();
            if (up && p.zones !== false) {
                const zc = [this.statusColor("success"), this.statusColor("warning"), this.statusColor("error")];
                for (let i = start; i < end; i++) {
                    const q = P[i];
                    if (!(q.s > 0)) continue;
                    const x0 = X(i) - cw / 2;
                    for (let k = 0; k < 3; k++) {
                        ctx.fillStyle = this.hexToRgba(zc[k], 0.07);
                        const a = Y(q.cl + (k + 1) * q.s), b = Y(q.cl + k * q.s), a2 = Y(q.cl - k * q.s), b2 = Y(q.cl - (k + 1) * q.s);
                        ctx.fillRect(x0, a, cw + 0.5, b - a); ctx.fillRect(x0, a2, cw + 0.5, b2 - a2);
                    }
                }
            }
            const step = (key, col, dash, width) => {
                ctx.strokeStyle = col; ctx.lineWidth = width || 1.5; ctx.setLineDash(dash || []); ctx.beginPath();
                let on = false, prevPhase = null;
                for (let i = start; i < end; i++) {
                    const v = typeof key === "function" ? key(P[i]) : P[i][key];
                    if (!Number.isFinite(v) || P[i].phase !== prevPhase) on = false;
                    prevPhase = P[i].phase;
                    if (!Number.isFinite(v)) continue;
                    const x0 = X(i) - cw / 2, y = Y(v);
                    if (on) ctx.lineTo(x0, y); else { ctx.moveTo(x0, y); on = true; }
                    ctx.lineTo(x0 + cw, y);
                }
                ctx.stroke(); ctx.setLineDash([]);
            };
            if (up && p.sigmaLines) [1, 2, -1, -2].forEach((k) => step((q) => q.cl + k * q.s, this.hexToRgba(c.strong, 0.35), DASHES.dotted, 1));
            step(UCL, this.statusColor("error")); step(LCL, this.statusColor("error")); step(CL, this.statusColor("success"));
            const specs = up && m.type === "imr" && p.specLines !== false ? [["USL", numOr(p.usl, NaN)], ["LSL", numOr(p.lsl, NaN)], ["Target", numOr(p.target, NaN)]].filter((s) => Number.isFinite(s[1])) : [];
            specs.forEach(([, v]) => { ctx.strokeStyle = c.strong; ctx.lineWidth = 1; ctx.setLineDash(DASHES.dashed); ctx.beginPath(); ctx.moveTo(px, Y(v)); ctx.lineTo(px + pw, Y(v)); ctx.stroke(); ctx.setLineDash([]); });
            // the line (broken at a phase), the points
            const col = this.seriesColor(0);
            ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
            let on = false;
            for (let i = start; i < end; i++) { const v = P[i][V]; if (!Number.isFinite(v) || (i > start && P[i].phase !== P[i - 1].phase)) on = false; if (!Number.isFinite(v)) continue; if (on) ctx.lineTo(X(i), Y(v)); else { ctx.moveTo(X(i), Y(v)); on = true; } }
            ctx.stroke();
            const r = Math.max(2, Math.min(4, cw / 3));
            for (let i = start; i < end; i++) {
                const q = P[i], v = q[V];
                if (!Number.isFinite(v)) continue;
                const bad = q[R].length > 0, x = X(i), y = Y(v);
                ctx.beginPath(); ctx.arc(x, y, bad ? r + 1.5 : r, 0, Math.PI * 2);
                if (q.excluded) { ctx.fillStyle = this._panelColor(); ctx.fill(); ctx.strokeStyle = c.text; ctx.lineWidth = 1.5; ctx.stroke(); }
                else { ctx.fillStyle = bad ? vcol : col; ctx.fill(); }
                if (i === this._hover) { ctx.strokeStyle = c.strong; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke(); }
                if (bad && p.ruleNumbers !== false) { ctx.font = "600 10px " + font; ctx.fillStyle = vcol; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(q[R].map((k) => k.replace(/^N/, "").replace("WE4", "W4").replace("L1", "")).filter(Boolean).join(","), x, y - r - 3); }
                if (up && m.noteAt.has(i)) { const nc = this._tok(p.noteColor) || c.accent; ctx.fillStyle = nc; ctx.beginPath(); ctx.moveTo(x, pl.py + 2); ctx.lineTo(x + 8, pl.py + 6); ctx.lineTo(x, pl.py + 10); ctx.closePath(); ctx.fill(); ctx.fillRect(x - 0.75, pl.py + 2, 1.5, 12); }
            }
            ctx.restore();
            // the limit values at the right
            if (p.limitLabels !== false) {
                const q = P[end - 1];
                ctx.save(); ctx.font = fs + "px " + font; ctx.textAlign = "left"; ctx.textBaseline = "middle";
                const name = up ? CL_NAME[m.type] : LOWER_CL[m.type] || "";
                const lines = [["UCL", q[UCL], this.statusColor("error")], [name, q[CL], this.statusColor("success")], ["LCL", q[LCL], this.statusColor("error")]].concat(specs.map(([n, v]) => [n, v, c.strong]));
                const used = [];
                lines.filter((l) => Number.isFinite(l[1]) && !(l[0] === "LCL" && !up && !(q[LCL] > 0))).sort((a, b) => Y(a[1]) - Y(b[1])).forEach(([n, v, cc]) => {
                    let y = Math.max(pl.py + 6, Math.min(pl.py + pl.ph - 6, Y(v)));
                    used.forEach((u) => { if (Math.abs(u - y) < fs + 2) y = u + fs + 2; });
                    used.push(y);
                    ctx.fillStyle = cc; ctx.fillText(n + " " + this._lim(v, pl.ticks), px + pw + 6, y);
                });
                ctx.restore();
            }
        }

        // capability (measurements) or a summary (counts), for the latest phase
        _capPanel(ctx, x0, y0, w, h, m, c, fs, font) {
            const p = this.p, seg = m.a.segments[m.a.segments.length - 1], P = m.a.points;
            ctx.save();
            ctx.fillStyle = this.hexToRgba(c.strong, 0.04); ctx.fillRect(x0, y0, w, h);
            ctx.font = "600 12px " + font; ctx.fillStyle = c.strong; ctx.textAlign = "left"; ctx.textBaseline = "top";
            ctx.fillText((isVariable(m.type) ? "Capability" : "Summary") + (seg.phase ? " · " + seg.phase : ""), x0 + 10, y0 + 8);
            const rows = [];
            const col = (v) => (!Number.isFinite(v) ? c.text : v >= numOr(p.cpkGood, 1.33) ? this.statusColor("success") : v >= numOr(p.cpkMin, 1) ? this.statusColor("warning") : this.statusColor("error"));
            let histTop = y0 + 28, histH = 0;
            if (isVariable(m.type)) {
                const vals = [];
                for (let i = seg.from; i <= seg.to; i++) if (!P[i].excluded) (m.groups[i].vals || []).forEach((v) => vals.push(v));
                const usl = numOr(p.usl, NaN), lsl = numOr(p.lsl, NaN), tg = numOr(p.target, NaN);
                const cap = capability(vals, { usl, lsl, sigmaWithin: seg.sigma });
                this._cap = cap;
                histH = Math.max(40, Math.min(h * 0.42, 140));
                // the histogram, the within (solid) and overall (dashed) curves, the spec
                let lo = Math.min(...vals), hi = Math.max(...vals);
                [usl, lsl, tg].forEach((v) => { if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
                if (vals.length > 1 && hi > lo) {
                    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
                    const nb = Math.max(5, Math.min(30, Math.ceil(Math.sqrt(vals.length)))), bw = (hi - lo) / nb, bins = new Array(nb).fill(0);
                    vals.forEach((v) => bins[Math.min(nb - 1, Math.floor((v - lo) / bw))]++);
                    const peak = (sd) => (sd > 0 ? vals.length * bw / (sd * Math.sqrt(2 * Math.PI)) : 0), mx = Math.max(...bins, peak(cap.sdWithin), peak(cap.sdOverall)), hx = x0 + 10, hw = w - 20, HX = (v) => hx + ((v - lo) / (hi - lo)) * hw, HY = (k) => histTop + histH - (k / (mx * 1.15)) * histH;
                    ctx.fillStyle = this.hexToRgba(this.seriesColor(0), 0.45);
                    bins.forEach((k, j) => ctx.fillRect(HX(lo + j * bw) + 0.5, HY(k), hw / nb - 1, histTop + histH - HY(k)));
                    const curve = (sd, dash) => { if (!(sd > 0)) return; ctx.strokeStyle = c.strong; ctx.lineWidth = 1.5; ctx.setLineDash(dash); ctx.beginPath(); for (let s = 0; s <= 60; s++) { const v = lo + (s / 60) * (hi - lo), d = vals.length * bw * Math.exp(-0.5 * ((v - cap.mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI)); if (s) ctx.lineTo(HX(v), HY(d)); else ctx.moveTo(HX(v), HY(d)); } ctx.stroke(); ctx.setLineDash([]); };
                    curve(cap.sdWithin, []); curve(cap.sdOverall, DASHES.dashed);
                    [["LSL", lsl, this.statusColor("error")], ["USL", usl, this.statusColor("error")], ["T", tg, c.strong]].forEach(([n, v, cc]) => { if (!Number.isFinite(v)) return; ctx.strokeStyle = cc; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(HX(v), histTop); ctx.lineTo(HX(v), histTop + histH); ctx.stroke(); ctx.font = "10px " + font; ctx.fillStyle = cc; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(n, HX(v), histTop); });
                    histTop += 10;
                }
                const two = (v) => (Number.isFinite(v) ? v.toFixed(2) : "–");
                rows.push(["n", String(cap.n)], ["Mean", this._fmt(cap.mean)], ["σ within", this._fmt(cap.sdWithin)], ["σ overall", this._fmt(cap.sdOverall)]);
                if (Number.isFinite(usl) || Number.isFinite(lsl)) rows.push(["Cp", two(cap.cp), col(cap.cp)], ["Cpk", two(cap.cpk), col(cap.cpk)], ["Pp", two(cap.pp), col(cap.pp)], ["Ppk", two(cap.ppk), col(cap.ppk)], ["PPM out (expected)", Math.round(cap.ppm).toLocaleString()], ["Out of spec", String(cap.outBelow + cap.outAbove)]);
                else rows.push(["Cp / Cpk", "set USL / LSL"]);
            } else {
                let sc = 0, sn = 0, k = 0;
                for (let i = seg.from; i <= seg.to; i++) if (!P[i].excluded) { sc += P[i].count; sn += P[i].n; k++; }
                const rate = sc / sn;
                this._cap = { subgroups: k, inspected: sn, counted: sc, rate };
                rows.push(["Subgroups", String(k)], ["Inspected", sn.toLocaleString()], [p.countKind === "defects" ? "Defects" : "Defectives", sc.toLocaleString()]);
                if (p.countKind === "defects") rows.push(["Per unit (DPU)", this._fmt(rate)], ["DPMO (1 chance)", Math.round(rate * 1e6).toLocaleString()]);
                else rows.push(["% defective", (rate * 100).toFixed(2) + " %"], ["PPM", Math.round(rate * 1e6).toLocaleString()], ["Yield", ((1 - rate) * 100).toFixed(2) + " %"]);
            }
            let y = histTop + histH + 8;
            ctx.font = fs + "px " + font;
            rows.forEach(([a, b, cc]) => { if (y > y0 + h - fs) return; ctx.textAlign = "left"; ctx.fillStyle = c.text; ctx.fillText(a, x0 + 10, y); ctx.textAlign = "right"; ctx.font = "600 " + fs + "px " + font; ctx.fillStyle = cc || c.strong; ctx.fillText(b, x0 + w - 10, y); ctx.font = fs + "px " + font; y += fs + 7; });
            ctx.restore();
        }

        // ---- the pointer ------------------------------------------------------------------------------
        _local(e) { const pl = this._plotEl(), r = pl.getBoundingClientRect(), k = r.width / (pl.clientWidth || 1) || 1; return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; }
        _at(L) { const g = this._geo; if (!g || L.x < g.px || L.x > g.px + g.pw) return -1; const i = g.start + Math.floor((L.x - g.px) / g.cw); return i >= g.start && i < g.start + g.cnt ? i : -1; }
        _down(e) { if (e.button !== 0 || !this._geo) return; const L = this._local(e); this._drag = { x: L.x, start: this._geo.start, cnt: this._geo.cnt, moved: false }; try { e.target.setPointerCapture(e.pointerId); } catch (_) { } }
        _move(e) {
            const L = this._local(e), d = this._drag, g = this._geo;
            if (d && g) {
                const di = Math.round((L.x - d.x) / g.cw);
                if (Math.abs(L.x - d.x) > 3) d.moved = true;
                if (d.moved && di) { this._view = { start: Math.max(0, d.start - di), count: d.cnt }; this._plotEl().classList.add("panning"); this.draw(); }
                return;
            }
            const i = this._at(L);
            if (i !== this._hover) { this._hover = i; this.draw(); }
            this._tip(L, i);
        }
        _up(e) {
            const d = this._drag; this._drag = null;
            const pl = this._plotEl(); if (pl) pl.classList.remove("panning");
            if (!d || d.moved) { if (d) this.requestUpdate(); return; }
            const L = this._local(e), i = this._at(L), g = this._geo;
            if (i < 0 || !g || this.isEditor) return;
            const q = g.m.a.points[i], notes = g.m.noteAt.get(i) || [];
            if (notes.length && L.y < g.up.py + 16) { this.emit("noteClick", { key: q.key, time: q.t, text: notes.map((n) => n.text).join("\n"), note: notes[0] }); return; }
            this.emit("pointClick", { key: q.key, time: q.t, phase: q.phase, value: q.x, lower: q.y, n: q.n, cl: q.cl, ucl: q.ucl, lcl: q.lcl,
                rules: q.rules.concat(q.rules2).map((r) => ({ rule: r, text: RULES[r] })), excluded: q.excluded, note: notes.map((n) => n.text).join("\n") });
        }
        _wheel(e) {
            if (!e.ctrlKey && !e.metaKey) return;
            const g = this._geo; if (!g) return;
            e.preventDefault();
            const N = g.m.a.points.length, k = e.deltaY < 0 ? 0.8 : 1.25, cnt = Math.max(5, Math.min(N, Math.round(g.cnt * k)));
            const at = this._at(this._local(e)), mid = at >= 0 ? at : g.start + g.cnt / 2, f = (mid - g.start) / g.cnt;
            this._view = { start: Math.max(0, Math.min(N - cnt, Math.round(mid - f * cnt))), count: cnt };
            this.draw(); this.requestUpdate();
        }
        _leave() { if (this._hover >= 0) { this._hover = -1; this.draw(); } const t = this.renderRoot.querySelector(".sc-tip"); if (t) t.style.display = "none"; }
        _tip(L, i) {
            const tip = this.renderRoot.querySelector(".sc-tip");
            if (!tip) return;
            if (i < 0 || this.p.tooltip === false) { tip.style.display = "none"; return; }
            const g = this._geo, m = g.m, q = m.a.points[i], esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]), f = (v) => esc(this._fmt(v));
            const notes = m.noteAt.get(i) || [], rules = q.rules.concat(q.rules2);
            tip.innerHTML = "<b>" + esc(q.key) + "</b>" + (Number.isFinite(q.t) ? " · " + esc(new Date(q.t).toLocaleString()) : "") + (q.phase ? "<br>" + esc(q.phase) : "")
                + "<br>" + esc(STAT_NAME[m.type]) + ": <b>" + f(q.x) + "</b>" + (this.p.unit ? " " + esc(this.p.unit) : "") + (Number.isFinite(q.y) ? "<br>" + esc(LOWER_NAME[m.type] || "") + ": " + f(q.y) : "") + (Number.isFinite(q.n) && m.type !== "imr" ? "<br>n: " + q.n : "")
                + "<br>UCL " + f(q.ucl) + " · " + esc(CL_NAME[m.type]) + " " + f(q.cl) + " · LCL " + f(q.lcl)
                + rules.map((r) => '<br><span style="color:' + this._vcol() + '">' + esc((r === "L1" ? (LOWER_NAME[m.type] || "") + " " : r + ": ") + RULES[r]) + "</span>").join("")
                + (q.excluded ? "<br><i>Left out of the limits</i>" : q.base && this.p.limitsFrom !== "all" ? "<br><i>In the baseline</i>" : "")
                + notes.map((n) => "<br>✎ " + esc(n.text || "")).join("");
            tip.style.display = "block";
            const pl = this._plotEl();
            tip.style.left = Math.max(4, Math.min(pl.clientWidth - tip.offsetWidth - 4, L.x + 12)) + "px";
            tip.style.top = Math.max(4, L.y - tip.offsetHeight - 8) + "px";
        }

        exportData(params) {
            const o = this._exportOpts(params);
            if (o.format === "png") return this.exportPNG();
            const m = this._model(), t = m.type, lw = LOWER_NAME[t];
            const head = ["Subgroup", "Time", "Phase", "n", STAT_NAME[t], "CL", "UCL", "LCL"].concat(lw ? [lw, lw + " CL", lw + " UCL", lw + " LCL"] : []).concat(["Rules", "Excluded", "Note"]);
            const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : "");
            const rows = m.a.points.map((q, i) => [String(q.key), Number.isFinite(q.t) ? new Date(q.t).toISOString() : "", q.phase, q.n, r4(q.x), r4(q.cl), r4(q.ucl), r4(q.lcl)]
                .concat(lw ? [r4(q.y), r4(q.cl2), r4(q.ucl2), r4(q.lcl2)] : []).concat([q.rules.concat(q.rules2).join(" "), q.excluded ? "yes" : "", (m.noteAt.get(i) || []).map((n) => n.text).join(" / ")]));
            const n = head.length;
            let blob;
            if (o.format === "xlsx") {
                if (!this._cap) this.draw();
                const cap = Object.entries(this._cap || {}).map(([k, v]) => [k, typeof v === "number" ? r4(v) : String(v)]);
                const used = [...new Set(m.a.points.flatMap((q) => q.rules.concat(q.rules2)))].map((r) => [r, RULES[r]]);
                blob = xlsxBlob(head, rows, false, { timeCols: [], textCols: [0, 1, 2, n - 3, n - 2, n - 1], sheets: [{ name: "Capability", header: ["Statistic", "Value"], rows: [["Chart", TYPES[t]]].concat(cap), timeCols: [], textCols: [0] }, { name: "Rules", header: ["Rule", "Meaning"], rows: used, timeCols: [], textCols: [0, 1] }] });
            } else {
                const qt = (x) => '"' + String(x).replace(/"/g, '""') + '"';
                blob = new Blob(["﻿" + [head.map(qt).join(",")].concat(rows.map((r) => r.map((x) => (typeof x === "number" ? String(x) : qt(x))).join(","))).join("\r\n")], { type: "text/csv;charset=utf-8" });
            }
            const name = this._getExportFileName(o.format, "all");
            this._download(blob, name);
            this._lastExport = { name, blob, rows: rows.length };
            return rows.length;
        }

        exportPNG() {
            const { w, h } = this._layoutSize();
            if (!(w > 0 && h > 0)) return Promise.resolve(null);
            const out = document.createElement("canvas"), S = 2;
            out.width = w * S; out.height = h * S;
            const ctx = out.getContext("2d");
            ctx.setTransform(S, 0, 0, S, 0, 0);
            ctx.fillStyle = this._backgroundColor() || this._panelColor(); ctx.fillRect(0, 0, w, h);
            const clear = this._clearCanvas;
            this._clearCanvas = () => {};
            try { this._drawInto(ctx, w, h); } finally { this._clearCanvas = clear; }
            return new Promise((resolve) => out.toBlob((blob) => { if (!blob) { resolve(null); return; } const name = this._getExportFileName("png", "all"); this._download(blob, name); this._lastExport = { name, blob, width: out.width }; resolve(this._lastExport); }, "image/png"));
        }

        render() {
            const p = this.p, bg = this._tok(p.background), m = this._model(), viol = m.a.points.filter((q) => q.rules.length || q.rules2.length).length;
            return html`
                <div class="spc-wrap ${p.border === false ? "borderless" : ""}" part="chart" style=${bg ? "background:" + bg : ""}>
                    <div class="spc-head">${p.title || ""}<span class="sub">${TYPES[m.type]} chart${m.a.points.length ? " · " + m.a.points.length + " subgroups" : ""}${viol ? html` · <span style="color:${this._vcol()}">${viol} out of control</span>` : ""}</span></div>
                    <div class="plot" @pointerdown=${(e) => this._down(e)} @pointermove=${(e) => this._move(e)} @pointerup=${(e) => this._up(e)} @pointerleave=${() => this._leave()}
                        @wheel=${(e) => this._wheel(e)} @dblclick=${() => this.resetZoom()}>
                        <canvas></canvas>
                        ${this._view ? html`<button class="btn-chip zoom-chip" @click=${(e) => { e.stopPropagation(); this.resetZoom(); }}>Reset zoom</button>` : ""}
                        <div class="corner" style="right:8px">${this._renderMenu()}</div>
                        <div class="sc-tip"></div>
                        ${this._renderSampleBadge(m.sample)}
                    </div>
                </div>`;
        }
    }
});
