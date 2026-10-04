import { html, asBinding, formatValue, formatParts, evaluateExpression } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, part, defineUI } from "../core.js";
import { chartCommon, SERIES_PALETTE, opt, NOTATIONS, DECIMALS, DASHES, notationOf, numOr, niceNum } from "./core.js";
import { getNiceTimeStep, parseTimeWindow, SPANS, WINDOWS, spanMs, timeOf, parts, pad2, clock, relative, DAYS, MONTHS } from "./time.js";
import { xlsxBlob } from "./export.js";
import { TimeChartElement } from "./time-chart.js";
import { timeProps, refreshProps, zoomProps, annotationProps, exportProps, timeEvents, timeActions } from "./props.js";

const common = chartCommon;

const SERIES_FIELDS = {
    name: { type: "string", label: "Name", default: "Series" },
    id: {
        type: "string", label: "Id", default: "", bindable: false,
        help: "Fixed (renaming the series keeps it): its Update node and events find the series by it."
    },
    visible: { type: "boolean", label: "Visible", default: true },
    inLegend: { type: "boolean", label: "In the legend", default: true },

    live: {
        type: "tag", access: "read", section: "Data", label: "Live value / data",
        help: "A tag or variable: a number (x = now), an object { category, value } / { x, y }, or an array of them. Data from Logic: this series' Update node (Set data / Append point)."
    },
    xField: { type: "string", section: "Data", label: "Category / Time field (x)", default: "x", bindable: false, help: "Key in objects: [{category, value}, …] or [{x, y}, …]." },
    yField: { type: "string", section: "Data", label: "Value field (y)", default: "y", bindable: false },

    color: { type: "color", section: "Style", label: "Colour", default: "", help: "Empty: the next colour from the theme palette." },
    colorMode: {
        type: "enum", section: "Style", label: "Colour mode", default: "solid",
        options: opt([["solid", "Solid colour (same for all bars)"], ["byCategory", "By category (palette per bar)"]]),
        help: "By category: gives each bar a distinct colour from the palette (ideal for single-series or Pareto)."
    },
    borderRadius: { type: "number", section: "Style", label: "Corner radius", default: 4, min: 0, max: 20, step: 1, unit: "px" },
    opacity: { type: "number", section: "Style", label: "Opacity", default: 1, min: 0.1, max: 1, step: 0.05 },

    showDataLabels: {
        type: "enum", section: "Labels", label: "Data labels", default: "none",
        options: opt([["none", "None"], ["value", "Value"], ["percent", "Percent (%)"], ["both", "Value & Percent"]]),
        help: "Display numeric values directly on or above each bar."
    },
    dataLabelPos: {
        type: "enum", section: "Labels", label: "Label position", default: "outside",
        options: opt([["outside", "Outside bar"], ["inside-end", "Inside (top / end)"], ["inside-center", "Inside (center)"]]),
        visibleWhen: (s) => s.showDataLabels && s.showDataLabels !== "none"
    }
};

function seriesDefaults() {
    const o = {};
    Object.keys(SERIES_FIELDS).forEach((k) => { o[k] = SERIES_FIELDS[k].default; });
    delete o.live;
    return o;
}

export class BarChartElement extends TimeChartElement {
    _series = new Map();
    _sl = null;
    _hidden = new Set();
    _dynamicCategories = null;
    _activeCategories = [];
    _hoverBar = null;
    _hitBoxes = [];

    seriesList() {
        const raw = Array.isArray(this.p && this.p.series) ? this.p.series : [];
        const c = this._sl;
        if (c && c.raw === raw) return c.list;
        const d = seriesDefaults();
        const list = raw.map((s, i) => {
            const o = Object.assign({}, d, s && typeof s === "object" ? s : {});
            o._i = i;
            o._key = String(o.id || "#" + i);
            return o;
        });
        this._sl = { raw, list };
        return list;
    }

    _state(s) {
        let st = this._series.get(s._key);
        if (!st) {
            st = {
                categoryMap: new Map(),
                timePoints: [],
                lastLive: undefined,
                demo: false
            };
            this._series.set(s._key, st);
        }
        return st;
    }

    _target(s) { return { list: "series", id: s.id || s._key }; }

    findSeries(ref) {
        const list = this.seriesList();
        if (ref && typeof ref === "object" && ref.id !== undefined) ref = ref.id;
        if (ref === undefined || ref === null || ref === "") return list[0] || null;
        const byIndex = typeof ref === "number" || /^\d+$/.test(String(ref)) ? list[Number(ref)] : null;
        return list.find((s) => s.id && s.id === String(ref)) || list.find((s) => s.name === String(ref)) || byIndex || null;
    }

    colorOf(s, barIndex) {
        if (s.colorMode === "byCategory" && Number.isFinite(barIndex)) {
            return SERIES_PALETTE[barIndex % SERIES_PALETTE.length];
        }
        if (s.color && typeof s.color === "string" && s.color.trim()) return s.color.trim();
        const cs = getComputedStyle(this);
        if (s._i === 0) {
            return cs.getPropertyValue("--cp-solid").trim() || cs.getPropertyValue("--nexa-colors-primary-solid").trim() || SERIES_PALETTE[0];
        }
        return SERIES_PALETTE[s._i % SERIES_PALETTE.length];
    }

    _seriesSpec() {
        return {
            notation: notationOf(this.p.notation),
            decimals: this.p.decimals === "auto" ? undefined : numOr(this.p.decimals, 0)
        };
    }

    fmtValue(val) {
        if (!Number.isFinite(val)) return "—";
        return formatValue(val, this._seriesSpec(), this.p.valueUnit || "");
    }

    _loadSeriesData(s, st, data) {
        if (!data) return false;
        const xField = s.xField || "x", yField = s.yField || "y";
        st.demo = false;
        let dirty = false;

        const parseItem = (item, idx) => {
            if (typeof item === "number") {
                if (this.p.xType === "time") {
                    st.timePoints.push({ x: this._now() + idx * 3600000, y: item });
                } else {
                    const catName = this._activeCategories[idx] || ("Cat " + (idx + 1));
                    st.categoryMap.set(catName, item);
                }
                dirty = true;
            } else if (Array.isArray(item) && item.length >= 2) {
                if (this.p.xType === "time") {
                    st.timePoints.push({ x: timeOf(item[0]) || this._now(), y: numOr(item[1], 0) });
                } else {
                    st.categoryMap.set(String(item[0]), numOr(item[1], 0));
                }
                dirty = true;
            } else if (item && typeof item === "object") {
                const catVal = item.category !== undefined ? item.category : item[xField];
                const numVal = numOr(item.value !== undefined ? item.value : item[yField], 0);
                if (this.p.xType === "time") {
                    const t = timeOf(catVal !== undefined ? catVal : item.time);
                    if (Number.isFinite(t)) {
                        st.timePoints.push({ x: t, y: numVal });
                        dirty = true;
                    }
                } else if (catVal !== undefined && catVal !== null) {
                    st.categoryMap.set(String(catVal), numVal);
                    dirty = true;
                }
            }
        };

        if (Array.isArray(data)) {
            data.forEach((it, idx) => parseItem(it, idx));
        } else if (typeof data === "object") {
            Object.keys(data).forEach((k) => {
                if (this.p.xType === "time") {
                    const t = timeOf(k);
                    if (Number.isFinite(t)) st.timePoints.push({ x: t, y: numOr(data[k], 0) });
                } else {
                    st.categoryMap.set(String(k), numOr(data[k], 0));
                }
                dirty = true;
            });
        }
        if (this.p.xType === "time" && dirty) {
            st.timePoints.sort((a, b) => a.x - b.x);
        }
        return dirty;
    }

    prepareData() {
        const list = this.seriesList();
        let dirty = false;

        // 1. Determine categories
        let catList = [];
        if (this._dynamicCategories && Array.isArray(this._dynamicCategories) && this._dynamicCategories.length) {
            catList = this._dynamicCategories.map(String);
        } else if (Array.isArray(this.p.categories) && this.p.categories.length) {
            catList = this.p.categories.map((c) => (c && typeof c === "object" ? String(c.name || "Category") : String(c)));
        } else {
            catList = ["Cat A", "Cat B", "Cat C", "Cat D"];
        }
        this._activeCategories = catList;

        const liveKeys = new Set();
        for (const s of list) {
            liveKeys.add(s._key);
            const st = this._state(s);
            const v = s.live;
            if (v !== undefined && v !== null && v !== "" && v !== "???" && v !== st.lastLive && !(typeof v === "object" && v.$bind)) {
                st.lastLive = v;
                if (typeof v === "number") {
                    if (this.p.xType === "time") {
                        st.timePoints.push({ x: this._now(), y: v });
                        dirty = true;
                    } else {
                        const targetCat = catList[0] || "Default";
                        st.categoryMap.set(targetCat, v);
                        dirty = true;
                    }
                } else {
                    if (this._loadSeriesData(s, st, v)) dirty = true;
                }
            }
            if (this.isEditor && !st.categoryMap.size && !st.timePoints.length && !st.demo) {
                this._demo(st, s._i);
                dirty = true;
            }
        }
        for (const k of Array.from(this._series.keys())) {
            if (!liveKeys.has(k)) { this._series.delete(k); dirty = true; }
        }
        if (dirty) this.scheduleDraw();
    }

    _demo(st, seriesIdx) {
        st.demo = true;
        const cats = this._activeCategories && this._activeCategories.length ? this._activeCategories : ["Cat A", "Cat B", "Cat C", "Cat D"];
        if (this.p.xType === "time") {
            const now = this._now();
            const step = 3600000;
            const vals = [32, 45, 28, 62, 54, 75, 48, 68];
            vals.forEach((v, idx) => {
                const shift = (seriesIdx * 8 + idx * 3) % 20;
                st.timePoints.push({ x: now - (vals.length - idx) * step, y: v + shift });
            });
        } else if (this.p.mode === "pareto") {
            const paretoVals = [140, 85, 45, 20, 10];
            cats.slice(0, 5).forEach((c, idx) => {
                st.categoryMap.set(c, paretoVals[idx] || 10);
            });
        } else {
            const baseVals = [45, 68, 32, 85, 50, 72];
            cats.forEach((c, idx) => {
                const offset = (seriesIdx * 15 + idx * 10) % 30;
                st.categoryMap.set(c, (baseVals[idx % baseVals.length] || 40) + offset);
            });
        }
    }

    // ---- Actions ---------------------------------------------------------------------------
    setCategories(params) {
        const list = Array.isArray(params) ? params : (params && Array.isArray(params.categories) ? params.categories : []);
        if (list.length) {
            this._dynamicCategories = list.map(String);
            this._activeCategories = this._dynamicCategories;
            this.scheduleDraw();
            this.requestUpdate();
        }
    }

    setChartData(params) {
        if (!params) return;

        // DIRECT ARRAY: e.g. [{ category: "Line 1", s1: 120, s2: 110 }, …]
        // or [{ time: 1728000000000, s1: 45, s2: 30 }, …]
        // or [["Line 1", 120, 110], ["Line 2", 185, 170]]
        if (Array.isArray(params)) {
            const isTime = this.p.xType === "time";
            const visibleSeries = this.seriesList();
            const cats = [];

            for (const s of visibleSeries) {
                const st = this._state(s);
                st.categoryMap.clear();
                st.timePoints = [];
                st.demo = false;
            }

            for (const row of params) {
                if (!row) continue;
                if (Array.isArray(row)) {
                    const xVal = row[0];
                    if (isTime) {
                        const t = timeOf(xVal);
                        if (Number.isFinite(t)) {
                            visibleSeries.forEach((s, idx) => {
                                if (row[idx + 1] !== undefined) {
                                    this._state(s).timePoints.push({ x: t, y: numOr(row[idx + 1], 0) });
                                }
                            });
                        }
                    } else {
                        const cat = String(xVal);
                        cats.push(cat);
                        visibleSeries.forEach((s, idx) => {
                            if (row[idx + 1] !== undefined) {
                                this._state(s).categoryMap.set(cat, numOr(row[idx + 1], 0));
                            }
                        });
                    }
                } else if (typeof row === "object") {
                    let xKey = null;
                    if (isTime) {
                        xKey = ["time", "x", "timestamp", "t", "date"].find((k) => k in row);
                    } else {
                        xKey = ["category", "cat", "name", "label", "x", "line", "item"].find((k) => k in row);
                        if (!xKey) {
                            xKey = Object.keys(row).find((k) => typeof row[k] === "string" && isNaN(Number(row[k])));
                        }
                    }

                    const xVal = xKey ? row[xKey] : null;
                    const catName = xVal !== null && xVal !== undefined ? String(xVal) : ("Row " + (cats.length + 1));
                    if (!isTime) cats.push(catName);
                    const t = isTime ? (timeOf(xVal) || this._now()) : 0;

                    let matchedAny = false;
                    Object.keys(row).forEach((k) => {
                        if (k === xKey) return;
                        const s = this.findSeries(k);
                        if (s) {
                            const val = numOr(row[k], 0);
                            const st = this._state(s);
                            if (isTime) st.timePoints.push({ x: t, y: val });
                            else st.categoryMap.set(catName, val);
                            matchedAny = true;
                        }
                    });

                    if (!matchedAny && (row.value !== undefined || row.y !== undefined)) {
                        const val = numOr(row.value !== undefined ? row.value : row.y, 0);
                        const s = visibleSeries[0];
                        if (s) {
                            const st = this._state(s);
                            if (isTime) st.timePoints.push({ x: t, y: val });
                            else st.categoryMap.set(catName, val);
                        }
                    }
                }
            }

            if (!isTime && cats.length) {
                this._dynamicCategories = cats;
                this._activeCategories = cats;
            }
            if (isTime) {
                for (const s of visibleSeries) {
                    this._state(s).timePoints.sort((a, b) => a.x - b.x);
                }
            }
            this.scheduleDraw();
            this.requestUpdate();
            return;
        }

        if (Array.isArray(params.categories)) {
            this._dynamicCategories = params.categories.map(String);
            this._activeCategories = this._dynamicCategories;
        }
        if (params.series && typeof params.series === "object") {
            Object.keys(params.series).forEach((k) => {
                const s = this.findSeries(k);
                if (s) {
                    const st = this._state(s);
                    st.categoryMap.clear();
                    st.timePoints = [];
                    this._loadSeriesData(s, st, params.series[k]);
                }
            });
        }
        this.scheduleDraw();
        this.requestUpdate();
    }

    clearAll() {
        for (const s of this.seriesList()) {
            const st = this._state(s);
            st.categoryMap.clear();
            st.timePoints = [];
            st.demo = false;
        }
        this.scheduleDraw();
        this.requestUpdate();
    }

    setData(params, target) {
        const s = this.findSeries(target || (params && params.series));
        if (!s) return 0;
        const st = this._state(s);
        st.categoryMap.clear();
        st.timePoints = [];
        const raw = params && params.data !== undefined ? params.data : params;
        this._loadSeriesData(s, st, raw);
        this.scheduleDraw();
        this.requestUpdate();
        return this.p.xType === "time" ? st.timePoints.length : st.categoryMap.size;
    }

    setPoint(params, target) {
        const s = this.findSeries(target || (params && params.series));
        if (!s || !params) return;
        const st = this._state(s);
        st.demo = false;
        if (this.p.xType === "time") {
            const t = timeOf(params.x !== undefined ? params.x : params.time);
            const val = numOr(params.y !== undefined ? params.y : params.value, 0);
            if (Number.isFinite(t)) {
                const existing = st.timePoints.find((p) => p.x === t);
                if (existing) existing.y = val;
                else { st.timePoints.push({ x: t, y: val }); st.timePoints.sort((a, b) => a.x - b.x); }
            }
        } else {
            const cat = String(params.category !== undefined ? params.category : params.x);
            const val = numOr(params.value !== undefined ? params.value : params.y, 0);
            if (cat) st.categoryMap.set(cat, val);
        }
        this.scheduleDraw();
        this.requestUpdate();
    }

    appendPoint(params, target) {
        const s = this.findSeries(target || (params && params.series));
        if (!s) return;
        const st = this._state(s);
        st.demo = false;
        if (typeof params === "number") {
            st.timePoints.push({ x: this._now(), y: params });
        } else if (params && typeof params === "object") {
            const t = timeOf(params.x !== undefined ? params.x : params.time) || this._now();
            const val = numOr(params.y !== undefined ? params.y : params.value, 0);
            st.timePoints.push({ x: t, y: val });
        }
        st.timePoints.sort((a, b) => a.x - b.x);
        this.scheduleDraw();
        this.requestUpdate();
    }

    clear(params, target) {
        const s = this.findSeries(target || (params && params.series));
        if (!s) return;
        const st = this._state(s);
        st.categoryMap.clear();
        st.timePoints = [];
        st.demo = false;
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
        this.emit("legendToggle", { id: s.id, visible: on });
    }

    _toggle(s, e) {
        if (e && e.altKey) {
            const all = this.seriesList();
            const onlyThis = this._hidden.size === all.length - 1 && !this._hidden.has(s._key);
            if (onlyThis) this._hidden.clear();
            else { this._hidden.clear(); all.forEach((x) => { if (x._key !== s._key) this._hidden.add(x._key); }); }
        } else {
            if (this._hidden.has(s._key)) this._hidden.delete(s._key);
            else this._hidden.add(s._key);
        }
        this.scheduleDraw();
        this.requestUpdate();
        this.emit("legendToggle", { id: s.id, visible: !this._hidden.has(s._key) });
    }

    // ---- Metrics & Layout ------------------------------------------------------------------
    _fullBounds() {
        if (this.p.xType !== "time") return { minX: 0, maxX: Math.max(1, this._activeCategories.length) };
        let minX = Infinity, maxX = -Infinity;
        for (const s of this.seriesList()) {
            if (s.visible === false || this._hidden.has(s._key)) continue;
            const pts = this._state(s).timePoints;
            if (pts.length) {
                if (pts[0].x < minX) minX = pts[0].x;
                if (pts[pts.length - 1].x > maxX) maxX = pts[pts.length - 1].x;
            }
        }
        if (!Number.isFinite(minX)) {
            const now = this._now();
            return { minX: now - 3600000 * 6, maxX: now };
        }
        if (maxX - minX < 1000) { minX -= 500; maxX += 500; }
        return { minX, maxX };
    }

    _hasData() {
        for (const s of this.seriesList()) {
            if (s.visible === false || this._hidden.has(s._key)) continue;
            const st = this._state(s);
            if (st.categoryMap.size > 0 || st.timePoints.length > 0) return true;
        }
        return false;
    }

    getPlotMetrics(w, h) {
        const isTime = this.p.xType === "time";
        const isPareto = !isTime && this.p.mode === "pareto";
        const isH = this.p.orientation === "horizontal";

        let padLeft = isH ? 80 : 54;
        let padRight = isPareto ? 54 : 16;
        let rh = isTime ? this._rulerHeight(h) : 0;
        let padBottom = isTime ? (rh ? 6 : 8) : (isH ? 32 : 36);
        let plotY = 18;

        const plotW = Math.max(1, w - padLeft - padRight);
        const plotH = Math.max(1, h - plotY - padBottom - rh);

        return {
            plotX: padLeft, plotY, plotW, plotH, padLeft, padRight, padBottom,
            rulerX: padLeft, rulerY: plotY + plotH + 6, rulerW: plotW, rulerH: rh
        };
    }

    // ---- Drawing ---------------------------------------------------------------------------
    _drawInto(ctx, w, h, range) {
        this._clearCanvas(ctx, w, h);
        const m = this.getPlotMetrics(w, h);
        const c = this._colors();
        const mono = c.mono;
        const font = c.font;

        const isTime = this.p.xType === "time";
        const isPareto = !isTime && this.p.mode === "pareto";
        const isH = this.p.orientation === "horizontal";
        const isStacked100 = this.p.mode === "stacked100";
        const isStacked = this.p.mode === "stacked" || isStacked100;
        const isGrouped = this.p.mode === "grouped" && !isPareto;

        const visibleSeries = this.seriesList().filter((s) => s.visible !== false && !this._hidden.has(s._key));

        // 1. Gather slots & categories
        let slots = [];
        let totalVal = 0;

        if (isTime) {
            const { vMinX, vMaxX } = range || this.getEffectiveTimeRange(this._fullBounds());
            // Extract distinct timestamps within view range
            const timeSet = new Set();
            for (const s of visibleSeries) {
                const pts = this._state(s).timePoints;
                for (const p of pts) {
                    if (p.x >= vMinX && p.x <= vMaxX) timeSet.add(p.x);
                }
            }
            const sortedTimes = Array.from(timeSet).sort((a, b) => a - b);
            slots = sortedTimes.map((t) => {
                const seriesVals = {};
                let sum = 0;
                for (const s of visibleSeries) {
                    const pt = this._state(s).timePoints.find((p) => p.x === t);
                    const val = pt ? pt.y : 0;
                    seriesVals[s._key] = val;
                    sum += val;
                }
                return { key: t, label: this.fmtTime(t), time: t, values: seriesVals, sum };
            });
        } else {
            // Category mode
            let cats = this._activeCategories.slice();
            slots = cats.map((cat, idx) => {
                const seriesVals = {};
                let sum = 0;
                for (const s of visibleSeries) {
                    const val = numOr(this._state(s).categoryMap.get(cat), 0);
                    seriesVals[s._key] = val;
                    sum += val;
                }
                totalVal += sum;
                return { key: cat, label: cat, index: idx, values: seriesVals, sum };
            });

            if (isPareto) {
                if (this.p.autoSort !== false) {
                    slots.sort((a, b) => b.sum - a.sum);
                }
                // Calculate cumulative percent
                let running = 0;
                slots.forEach((slot) => {
                    running += slot.sum;
                    slot.cumPercent = totalVal > 0 ? (running / totalVal) * 100 : 0;
                });
            }
        }

        // 2. Compute Value Scale (Min & Max)
        let minVal = 0, maxVal = 0;
        if (isStacked100) {
            minVal = 0;
            maxVal = 100;
        } else {
            for (const slot of slots) {
                if (isStacked) {
                    if (slot.sum > maxVal) maxVal = slot.sum;
                    if (slot.sum < minVal) minVal = slot.sum;
                } else {
                    for (const s of visibleSeries) {
                        const v = slot.values[s._key] || 0;
                        if (v > maxVal) maxVal = v;
                        if (v < minVal) minVal = v;
                    }
                }
            }
            if (this.p.zeroBaseline !== false) minVal = Math.min(0, minVal);
            if (numOr(this.p.min, NaN) !== undefined && Number.isFinite(numOr(this.p.min, NaN))) minVal = numOr(this.p.min, 0);
            if (numOr(this.p.max, NaN) !== undefined && Number.isFinite(numOr(this.p.max, NaN))) maxVal = numOr(this.p.max, 100);
            if (numOr(this.p.softMax, NaN) !== undefined && Number.isFinite(numOr(this.p.softMax, NaN))) maxVal = Math.max(maxVal, numOr(this.p.softMax, 0));
            if (maxVal <= minVal) maxVal = minVal + 10;
        }

        const niceRange = niceNum(maxVal - minVal, false);
        const valStep = niceNum(niceRange / 5, true) || 1;
        const tickMin = Math.floor(minVal / valStep) * valStep;
        const tickMax = Math.ceil(maxVal / valStep) * valStep;
        const valSpan = Math.max(1, tickMax - tickMin);

        // Helper mapping
        const valToCoord = (v) => {
            const ratio = (v - tickMin) / valSpan;
            return isH ? m.plotX + ratio * m.plotW : m.plotY + m.plotH - ratio * m.plotH;
        };
        const zeroCoord = valToCoord(0);

        // 3. Draw Grid & Value Ticks
        ctx.save();
        ctx.strokeStyle = c.grid;
        ctx.lineWidth = 1;
        ctx.fillStyle = c.text;
        ctx.font = "10px " + mono;

        for (let tv = tickMin; tv <= tickMax; tv += valStep) {
            const coord = valToCoord(tv);
            ctx.beginPath();
            if (isH) {
                ctx.moveTo(Math.round(coord) + 0.5, m.plotY);
                ctx.lineTo(Math.round(coord) + 0.5, m.plotY + m.plotH);
                ctx.stroke();
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillText(formatValue(tv, this._seriesSpec(), this.p.valueUnit || ""), coord, m.plotY + m.plotH + 6);
            } else {
                ctx.moveTo(m.plotX, Math.round(coord) + 0.5);
                ctx.lineTo(m.plotX + m.plotW, Math.round(coord) + 0.5);
                ctx.stroke();
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                ctx.fillText(formatValue(tv, this._seriesSpec(), this.p.valueUnit || ""), m.plotX - 6, coord);
            }
        }

        // Pareto Right Axis (0% - 100%)
        if (isPareto && !isH) {
            ctx.textAlign = "left";
            for (let pct = 0; pct <= 100; pct += 20) {
                const py = m.plotY + m.plotH - (pct / 100) * m.plotH;
                ctx.fillText(pct + "%", m.plotX + m.plotW + 6, py);
            }
            if (this.p.secondaryAxisTitle) {
                ctx.save();
                ctx.font = "10px " + font;
                ctx.fillStyle = c.strong;
                ctx.translate(m.plotX + m.plotW + 38, m.plotY + m.plotH / 2);
                ctx.rotate(Math.PI / 2);
                ctx.textAlign = "center";
                ctx.fillText(this.p.secondaryAxisTitle, 0, 0);
                ctx.restore();
            }
        }
        ctx.restore();

        // 4. Threshold Lines
        const thresholds = Array.isArray(this.p.thresholds) ? this.p.thresholds : [];
        if (thresholds.length) {
            ctx.save();
            ctx.font = "10px " + mono;
            for (const t of thresholds) {
                if (!t || !Number.isFinite(t.value)) continue;
                const coord = valToCoord(t.value);
                const color = t.color || "#ef4444";
                ctx.strokeStyle = color;
                ctx.setLineDash(DASHES[t.dash || "dashed"] || DASHES.dashed);
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                if (isH) {
                    ctx.moveTo(Math.round(coord) + 0.5, m.plotY);
                    ctx.lineTo(Math.round(coord) + 0.5, m.plotY + m.plotH);
                } else {
                    ctx.moveTo(m.plotX, Math.round(coord) + 0.5);
                    ctx.lineTo(m.plotX + m.plotW, Math.round(coord) + 0.5);
                }
                ctx.stroke();
                ctx.setLineDash([]);
                if (t.label) {
                    ctx.fillStyle = color;
                    ctx.textAlign = isH ? "center" : "left";
                    ctx.textBaseline = isH ? "bottom" : "bottom";
                    if (isH) ctx.fillText(t.label, coord, m.plotY - 3);
                    else ctx.fillText(t.label, m.plotX + 6, coord - 3);
                }
            }
            ctx.restore();
        }

        // 5. Draw Bars
        const slotCount = Math.max(1, slots.length);
        const groupGapRatio = Math.max(0, Math.min(0.7, numOr(this.p.groupGap, 20) / 100));
        const barGapRatio = isGrouped ? Math.max(0, Math.min(0.5, numOr(this.p.barGap, 10) / 100)) : 0;
        const maxBw = numOr(this.p.maxBarWidth, 60);

        this._hitBoxes = [];

        slots.forEach((slot, slotIdx) => {
            const slotSpan = isH ? m.plotH / slotCount : m.plotW / slotCount;
            const slotStart = isH ? m.plotY + slotIdx * slotSpan : m.plotX + slotIdx * slotSpan;
            const groupSpan = slotSpan * (1 - groupGapRatio);
            const groupStart = slotStart + (slotSpan - groupSpan) / 2;

            if (isGrouped) {
                const sCount = Math.max(1, visibleSeries.length);
                const totalGap = (sCount - 1) * (groupSpan * barGapRatio);
                const rawBw = (groupSpan - totalGap) / sCount;
                const bw = Math.min(maxBw, Math.max(2, rawBw));
                const actualGroupSpan = bw * sCount + totalGap;
                const actualGroupStart = slotStart + (slotSpan - actualGroupSpan) / 2;

                visibleSeries.forEach((s, sIdx) => {
                    const val = slot.values[s._key] || 0;
                    const bStart = actualGroupStart + sIdx * (bw + groupSpan * barGapRatio);
                    const color = this.colorOf(s, slotIdx);
                    const radius = numOr(s.borderRadius, 4);

                    let bx, by, bwPx, bhPx;
                    if (isH) {
                        const targetCoord = valToCoord(val);
                        bx = Math.min(zeroCoord, targetCoord);
                        by = bStart;
                        bwPx = Math.max(1, Math.abs(targetCoord - zeroCoord));
                        bhPx = bw;
                    } else {
                        const targetCoord = valToCoord(val);
                        bx = bStart;
                        by = Math.min(zeroCoord, targetCoord);
                        bwPx = bw;
                        bhPx = Math.max(1, Math.abs(targetCoord - zeroCoord));
                    }

                    this._drawSingleBar(ctx, bx, by, bwPx, bhPx, color, radius, isH, val >= 0);
                    this._hitBoxes.push({
                        box: { x: bx, y: by, w: bwPx, h: bhPx },
                        slot, series: s, value: val, percent: slot.sum > 0 ? (val / slot.sum) * 100 : 0
                    });

                    // Data Label
                    this._drawDataLabel(ctx, s, val, bx, by, bwPx, bhPx, isH, c);
                });
            } else if (isStacked) {
                const bw = Math.min(maxBw, Math.max(2, groupSpan));
                const bPos = slotStart + (slotSpan - bw) / 2;
                let currentPos = zeroCoord;

                visibleSeries.forEach((s) => {
                    const rawVal = slot.values[s._key] || 0;
                    const val = isStacked100 && slot.sum > 0 ? (rawVal / slot.sum) * 100 : rawVal;
                    const length = Math.abs(valToCoord(val) - zeroCoord);
                    const color = this.colorOf(s, slotIdx);
                    const radius = numOr(s.borderRadius, 0);

                    let bx, by, bwPx, bhPx;
                    if (isH) {
                        bx = currentPos;
                        by = bPos;
                        bwPx = length;
                        bhPx = bw;
                        currentPos += length;
                    } else {
                        bx = bPos;
                        by = currentPos - length;
                        bwPx = bw;
                        bhPx = length;
                        currentPos -= length;
                    }

                    this._drawSingleBar(ctx, bx, by, bwPx, bhPx, color, radius, isH, true);
                    this._hitBoxes.push({
                        box: { x: bx, y: by, w: bwPx, h: bhPx },
                        slot, series: s, value: rawVal, percent: slot.sum > 0 ? (rawVal / slot.sum) * 100 : 0
                    });
                });
            } else if (isPareto) {
                // Pareto single bar per category (primary series or sum)
                const bw = Math.min(maxBw, Math.max(2, groupSpan));
                const bPos = slotStart + (slotSpan - bw) / 2;
                const primarySeries = visibleSeries[0] || { _key: "s1", name: "Count" };
                const val = slot.sum;
                const color = this.colorOf(primarySeries, slotIdx);
                const targetCoord = valToCoord(val);

                const bx = bPos;
                const by = Math.min(zeroCoord, targetCoord);
                const bwPx = bw;
                const bhPx = Math.max(1, Math.abs(targetCoord - zeroCoord));

                this._drawSingleBar(ctx, bx, by, bwPx, bhPx, color, 4, false, true);
                this._hitBoxes.push({
                    box: { x: bx, y: by, w: bwPx, h: bhPx },
                    slot, series: primarySeries, value: val, percent: totalVal > 0 ? (val / totalVal) * 100 : 0
                });
                this._drawDataLabel(ctx, primarySeries, val, bx, by, bwPx, bhPx, false, c);
            }

            // Draw Category Axis Label
            ctx.save();
            ctx.fillStyle = c.text;
            ctx.font = "11px " + font;
            if (isH) {
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                ctx.fillText(slot.label, m.plotX - 8, slotStart + slotSpan / 2);
            } else if (!isTime) {
                const rot = this.p.axisLabelRotation || "auto";
                const cx = slotStart + slotSpan / 2;
                const cy = m.plotY + m.plotH + 16;
                if (rot === "45" || (rot === "auto" && slotCount > 6)) {
                    ctx.translate(cx, cy);
                    ctx.rotate((Math.PI / 180) * 45);
                    ctx.textAlign = "left";
                    ctx.fillText(slot.label, 0, 0);
                } else if (rot === "90") {
                    ctx.translate(cx, cy);
                    ctx.rotate(Math.PI / 2);
                    ctx.textAlign = "left";
                    ctx.fillText(slot.label, 0, 0);
                } else {
                    ctx.textAlign = "center";
                    ctx.fillText(slot.label, cx, cy);
                }
            }
            ctx.restore();
        });

        // 6. Pareto Cumulative Curve & 80% Cutoff Line
        if (isPareto && !isH && slots.length) {
            const lineColor = this.p.cumulativeColor || "#f59e0b";
            const lineWidth = numOr(this.p.cumulativeLineWidth, 2);

            // Cutoff Line
            if (this.p.showCutoffLine !== false) {
                const cutoff = numOr(this.p.cutoffPercent, 80);
                const cy = m.plotY + m.plotH - (cutoff / 100) * m.plotH;
                ctx.save();
                ctx.strokeStyle = this.p.cutoffColor || "#ef4444";
                ctx.lineWidth = 1.2;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(m.plotX, cy);
                ctx.lineTo(m.plotX + m.plotW, cy);
                ctx.stroke();
                ctx.setLineDash([]);

                // Cutoff Badge
                ctx.fillStyle = this.p.cutoffColor || "#ef4444";
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(m.plotX + m.plotW + 2, cy - 8, 30, 16, 3);
                else ctx.rect(m.plotX + m.plotW + 2, cy - 8, 30, 16);
                ctx.fill();
                ctx.fillStyle = "#fff";
                ctx.font = "bold 9.5px " + mono;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(cutoff + "%", m.plotX + m.plotW + 17, cy);
                ctx.restore();
            }

            // Cumulative Line
            if (this.p.showCumulativeLine !== false) {
                ctx.save();
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = lineWidth;
                ctx.beginPath();
                const points = [];
                slots.forEach((slot, idx) => {
                    const slotSpan = m.plotW / slotCount;
                    const cx = m.plotX + idx * slotSpan + slotSpan / 2;
                    const cy = m.plotY + m.plotH - (slot.cumPercent / 100) * m.plotH;
                    points.push({ cx, cy, slot });
                    if (idx === 0) ctx.moveTo(cx, cy);
                    else ctx.lineTo(cx, cy);
                });
                ctx.stroke();

                // Draw Dots
                points.forEach((p) => {
                    ctx.fillStyle = lineColor;
                    ctx.beginPath();
                    ctx.arc(p.cx, p.cy, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = "#181b1f";
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                });
                ctx.restore();
            }
        }

        // 7. Time Ruler & Annotations (Timeseries mode)
        if (isTime) {
            const { vMinX, vMaxX } = range || this.getEffectiveTimeRange(this._fullBounds());
            const toX = (t) => m.plotX + ((t - vMinX) / (vMaxX - vMinX)) * m.plotW;
            this._drawRuler(ctx, m, vMinX, vMaxX, visibleSeries);
            this._drawAnnotations(ctx, toX, m.plotX, m.plotY, m.plotW, m.plotH, vMinX, vMaxX);
        }

        this._scale = {
            m, vMinX: isTime ? (range ? range.vMinX : 0) : 0,
            vMaxX: isTime ? (range ? range.vMaxX : slots.length) : slots.length
        };
    }

    _drawSingleBar(ctx, x, y, w, h, color, radius, isH, isPos) {
        if (w <= 0 || h <= 0) return;
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        const r = Math.min(radius, Math.min(w / 2, h / 2));
        if (ctx.roundRect && r > 0) {
            // Apply rounded corners only on the outer edge
            if (!isH) {
                const radii = isPos ? [r, r, 0, 0] : [0, 0, r, r];
                ctx.roundRect(x, y, w, h, radii);
            } else {
                const radii = isPos ? [0, r, r, 0] : [r, 0, 0, r];
                ctx.roundRect(x, y, w, h, radii);
            }
        } else {
            ctx.rect(x, y, w, h);
        }
        ctx.fill();
        ctx.restore();
    }

    _drawDataLabel(ctx, s, val, bx, by, bwPx, bhPx, isH, c) {
        const mode = s.showDataLabels;
        if (!mode || mode === "none") return;
        const text = mode === "percent" ? Math.round(val) + "%" : this.fmtValue(val);
        const mono = c.mono;

        ctx.save();
        ctx.font = "9.5px " + mono;
        const pos = s.dataLabelPos || "outside";

        if (!isH) {
            ctx.textAlign = "center";
            if (pos === "outside") {
                ctx.fillStyle = c.strong;
                ctx.textBaseline = "bottom";
                ctx.fillText(text, bx + bwPx / 2, by - 2);
            } else if (pos === "inside-end") {
                ctx.fillStyle = "#fff";
                ctx.textBaseline = "top";
                if (bhPx > 16) ctx.fillText(text, bx + bwPx / 2, by + 3);
            } else {
                ctx.fillStyle = "#fff";
                ctx.textBaseline = "middle";
                if (bhPx > 14) ctx.fillText(text, bx + bwPx / 2, by + bhPx / 2);
            }
        } else {
            ctx.textBaseline = "middle";
            if (pos === "outside") {
                ctx.fillStyle = c.strong;
                ctx.textAlign = "left";
                ctx.fillText(text, bx + bwPx + 4, by + bhPx / 2);
            } else {
                ctx.fillStyle = "#fff";
                ctx.textAlign = "right";
                if (bwPx > 25) ctx.fillText(text, bx + bwPx - 4, by + bhPx / 2);
            }
        }
        ctx.restore();
    }

    // ---- Pointer & Hover -------------------------------------------------------------------
    _plotHover(L) {
        const { px, py } = L;
        let hit = null;
        if (this._hitBoxes && this._hitBoxes.length) {
            for (const h of this._hitBoxes) {
                const b = h.box;
                if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
                    hit = h;
                    break;
                }
            }
        }
        if (hit) {
            this._hoverBar = hit;
            this._showBarTooltip(L, hit);
            const now = Date.now();
            if (now - (this._lastHoverEmit || 0) > 100) {
                this._lastHoverEmit = now;
                this.emit("hover", {
                    category: hit.slot.label,
                    time: hit.slot.time || 0,
                    values: hit.slot.values
                });
            }
        } else {
            this._hoverBar = null;
            const tip = this.renderRoot.querySelector(".tooltip");
            if (tip) tip.style.display = "none";
        }
    }

    _plotClick(L) {
        if (!this._hitBoxes || !this._hitBoxes.length) return;
        const { px, py } = L;
        for (const h of this._hitBoxes) {
            const b = h.box;
            if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
                const payload = {
                    category: h.slot.label,
                    time: h.slot.time || 0,
                    seriesId: h.series.id,
                    seriesName: h.series.name,
                    value: h.value,
                    percent: Math.round(h.percent * 10) / 10,
                    cumulativePercent: h.slot.cumPercent !== undefined ? Math.round(h.slot.cumPercent * 10) / 10 : undefined,
                    index: h.slot.index !== undefined ? h.slot.index : 0
                };
                this.emit("barClick", payload);
                this.emit("barClick", payload, this._target(h.series));
                break;
            }
        }
    }

    _showBarTooltip(L, hit) {
        if (this.p.showTooltip === false) return;
        const tip = this.renderRoot.querySelector(".tooltip");
        if (!tip) return;
        const timeEl = tip.querySelector(".tooltip-time");
        const rowsEl = tip.querySelector(".tooltip-rows");
        if (timeEl) timeEl.textContent = hit.slot.label;
        if (rowsEl) {
            const color = this.colorOf(hit.series, hit.slot.index);
            let rowsHtml = `<div class="tooltip-row">
                <span class="tooltip-dot" style="background:${color}"></span>
                <span class="tooltip-name">${hit.series.name || "Series"}:</span>
                <span class="tooltip-val">${this.fmtValue(hit.value)}</span>
            </div>`;
            if (hit.slot.cumPercent !== undefined) {
                rowsHtml += `<div class="tooltip-row" style="margin-top:2px; font-size:10px; color:#f59e0b">
                    <span>Cumulative:</span>
                    <span style="font-weight:bold; margin-left:auto">${Math.round(hit.slot.cumPercent * 10) / 10}%</span>
                </div>`;
            }
            rowsEl.innerHTML = rowsHtml;
        }
        tip.style.display = "block";
        const tx = Math.min(L.px + 12, L.rect.width - 160);
        const ty = Math.max(10, Math.min(L.py, L.rect.height - 50));
        tip.style.left = tx + "px";
        tip.style.top = ty + "px";
    }

    // ---- Export & Helpers ------------------------------------------------------------------
    _pngLegend() {
        return this.seriesList().filter((s) => s.inLegend !== false).map((s) => ({
            color: this.colorOf(s, 0),
            text: s.name || s.id
        }));
    }

    exportData(format) {
        const fmt = (format || "csv").toLowerCase();
        const isTime = this.p.xType === "time";
        const isPareto = !isTime && this.p.mode === "pareto";
        const vSeries = this.seriesList().filter((s) => s.visible !== false && !this._hidden.has(s._key));

        const header = [isTime ? "Time" : "Category"].concat(vSeries.map((s) => s.name || s.id));
        if (isPareto) header.push("Cumulative %");

        const rows = [];
        if (isTime) {
            const { vMinX, vMaxX } = this.getEffectiveTimeRange(this._fullBounds());
            const timeSet = new Set();
            for (const s of vSeries) {
                for (const p of this._state(s).timePoints) {
                    if (p.x >= vMinX && p.x <= vMaxX) timeSet.add(p.x);
                }
            }
            Array.from(timeSet).sort((a, b) => a - b).forEach((t) => {
                const r = [this.fmtTime(t)];
                for (const s of vSeries) {
                    const pt = this._state(s).timePoints.find((p) => p.x === t);
                    r.push(pt ? pt.y : 0);
                }
                rows.push(r);
            });
        } else {
            this._activeCategories.forEach((cat) => {
                const r = [cat];
                for (const s of vSeries) {
                    r.push(numOr(this._state(s).categoryMap.get(cat), 0));
                }
                rows.push(r);
            });
        }

        let blob;
        if (fmt === "xlsx") {
            const timeCols = isTime ? [0] : [];
            blob = xlsxBlob(header, rows, false, { timeCols });
        } else {
            const q = (t) => '"' + String(t).replace(/"/g, '""') + '"';
            const lines = [header.map(q).join(",")];
            rows.forEach((r) => lines.push(r.map(q).join(",")));
            blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        }

        const name = this._getExportFileName(fmt, "all");
        this._download(blob, name);
        this._lastExport = { name, blob, rows: rows.length };
        return rows.length;
    }

    render() {
        const all = this.seriesList();
        const legendAt = this.p.legend || "bottom";
        const legendList = all.filter((s) => s.inLegend !== false);
        const legend = legendAt === "none" || !legendList.length ? "" : html`
            <div class="legend" part="legend">
                ${legendList.map((s) => html`
                    <button type="button" class="lg-item ${this._hidden.has(s._key) || s.visible === false ? "off" : ""}" data-key="${s._key}"
                        title="Click: show / hide. Alt+click: only this one." @click=${(e) => this._toggle(s, e)}>
                        <span class="lg-swatch" style="background:${this.colorOf(s, 0)}"></span>
                        <span class="lg-name">${s.name || "Series " + (s._i + 1)}</span>
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
                    <div class="corner" style="right:${this._scale && this._scale.m ? this._scale.m.padRight + 6 : 20}px">
                        ${this.viewRange ? html`
                            <button class="btn-chip btn-reset-zoom" @click=${() => this.followLive()} title="Reset zoom">
                                <span class="live-dot"></span> Reset Zoom
                            </button>` : ""}
                        ${this._renderMenu()}
                    </div>
                    <div class="tooltip"><div class="tooltip-time"></div><div class="tooltip-rows"></div></div>
                </div>
                ${legendAt !== "top" ? legend : ""}
            </div>
        `;
    }
}

export const barChart = defineUI({
    ...common,
    id: PREFIX + "bar-chart",
    label: "Bar / Column Chart",
    icon: "fa fa-bar-chart",
    size: { w: 640, h: 320 },
    help: "Bar & column chart supporting grouped (dempet / side-by-side), stacked, 100% stacked, and Pareto analysis (descending ranking + 80% cumulative curve) across categories or time-series. Every series has its own Update node and click events in Logic.",
    version: 1,

    groups: ["Series", "Categories", "Time axis", "Mode & Layout", "Value Axis", "Pareto", "Thresholds", "Tooltip", "Legend", "Annotations", "Zoom & pan", "Export", "Style", "Behaviour"],

    properties: {
        series: {
            type: "list", group: "Series", label: "Series", noun: "series",
            help: "The bar sets to display. Each has its own Update node, data stream and events in Logic (Events tab).",
            default: [
                Object.assign(seriesDefaults(), { id: "s1", name: "Series 1" })
            ],
            item: {
                fields: SERIES_FIELDS, noun: "series", target: true,
                create: (items) => {
                    let n = items.length + 1;
                    const ids = new Set(items.map((x) => x && x.id));
                    while (ids.has("s" + n)) n++;
                    const s = seriesDefaults();
                    s.id = "s" + n;
                    s.name = "Series " + n;
                    s.color = SERIES_PALETTE[(n - 1) % SERIES_PALETTE.length];
                    return s;
                },
                actions: {
                    setData: {
                        label: "Set data",
                        help: "Replaces this series' data. Can be a list of numbers [10, 20, 30], objects [{category, value}, …], or [{x: timestamp, y: value}, …].",
                        example: "[12, 28, 45, 18]  or  [{ \"category\": \"Mesin 1\", \"value\": 45 }, …]  or  [{ \"x\": 1728000000000, \"y\": 32 }]"
                    },
                    setPoint: {
                        label: "Set point / bar",
                        help: "Updates or inserts a single category bar or timestamp point in this series.",
                        example: "{ \"category\": \"Mesin 1\", \"value\": 52 }  or  { \"x\": 1728000000000, \"y\": 52 }"
                    },
                    appendPoint: {
                        label: "Append point",
                        help: "Appends a point (timeseries mode): { x, y } or a number (time = now).",
                        example: "{ \"x\": 1728000000000, \"y\": 52 }  or  52"
                    },
                    clear: { label: "Clear", help: "Clears data for this series." },
                    show: { label: "Show", help: "Makes this series visible." },
                    hide: { label: "Hide", help: "Hides this series." }
                },
                events: {
                    barClick: {
                        label: "On Bar Click",
                        payload: { category: "string", time: "number", value: "number", percent: "number", index: "number" },
                        help: "Fired when a bar belonging to this series is clicked."
                    }
                }
            }
        },

        xType: {
            type: "enum", group: "Mode & Layout", label: "X-Axis Type", default: "category",
            options: opt([["category", "Category (discrete categories)"], ["time", "Time series (along time)"]]),
            help: "Category: discrete labels (Machine names, defect types, months). Time series: timestamps along the time ruler with zoom/pan."
        },
        mode: {
            type: "enum", group: "Mode & Layout", label: "Mode", default: "grouped",
            options: (p) => (p && p.xType === "time"
                ? opt([["grouped", "Dempet / Grouped (side-by-side)"], ["stacked", "Stacked (bertumpuk)"], ["stacked100", "100% Stacked (proportional)"]])
                : opt([["grouped", "Dempet / Grouped (side-by-side)"], ["stacked", "Stacked (bertumpuk)"], ["stacked100", "100% Stacked (proportional)"], ["pareto", "Pareto (ranking + 80% cumulative curve)"]])),
            help: "Grouped: series sit side-by-side within each category/time slot. Stacked: series sum on top of each other. 100% Stacked: proportion of each series up to 100%. Pareto: sorted descending + dual axis with 80% cumulative line."
        },
        orientation: {
            type: "enum", group: "Mode & Layout", label: "Orientation", default: "vertical",
            options: opt([["vertical", "Vertical (Columns)"], ["horizontal", "Horizontal (Bars)"]]),
            help: "Vertical: standard vertical columns. Horizontal: horizontal bars extending to the right."
        },
        groupGap: {
            type: "number", group: "Mode & Layout", label: "Category gap", default: 20, min: 0, max: 70, step: 5, unit: "%",
            help: "Spacing between category groups."
        },
        barGap: {
            type: "number", group: "Mode & Layout", label: "Bar gap", default: 10, min: 0, max: 50, step: 5, unit: "%",
            help: "Spacing between bars within the same category group (grouped mode).",
            visibleWhen: (p) => p.mode === "grouped"
        },
        maxBarWidth: {
            type: "number", group: "Mode & Layout", label: "Max bar width", default: 60, min: 6, max: 200, step: 2, unit: "px",
            help: "Limits the maximum thickness of bars when there are few categories."
        },

        // ---- Categories (visible when xType !== 'time') ----
        categories: {
            type: "list", group: "Categories", label: "Categories", noun: "category",
            default: ["Cat A", "Cat B", "Cat C", "Cat D"],
            item: {
                fields: { name: { type: "string", label: "Name", default: "Category" } },
                noun: "category"
            },
            help: "Default category labels. Can also be inferred automatically from series data keys or set via Logic action setCategories.",
            visibleWhen: (p) => (p.xType || "category") === "category"
        },
        axisLabelRotation: {
            type: "enum", group: "Categories", label: "Label rotation", default: "auto",
            options: opt([["auto", "Auto"], ["0", "Horizontal (0°)"], ["45", "Slanted (45°)"], ["90", "Vertical (90°)"], ["-45", "Slanted (-45°)"]]),
            help: "Rotation angle for category labels to prevent overlapping.",
            visibleWhen: (p) => (p.xType || "category") === "category"
        },

        // ---- Time axis (visible when xType === 'time') ----
        ...timeProps(),
        timeInterval: {
            type: "enum", group: "Time axis", label: "Time slot interval", default: "auto",
            options: opt([["auto", "Auto (from points)"], ["1m", "1 minute"], ["5m", "5 minutes"], ["15m", "15 minutes"], ["1h", "1 hour"], ["1d", "1 day"], ["1w", "1 week"]]),
            help: "Width of each time bucket slot.",
            visibleWhen: (p) => p.xType === "time"
        },

        // ---- Value Axis ----
        valueTitle: { type: "string", group: "Value Axis", label: "Axis title", default: "", help: "Title label alongside value axis." },
        valueUnit: { type: "string", group: "Value Axis", label: "Unit", default: "", help: "Unit string (e.g. kW, %, pcs) displayed on axis and tooltips." },
        softMin: { type: "number", group: "Value Axis", label: "Soft min", default: 0 },
        softMax: { type: "number", group: "Value Axis", label: "Soft max", default: "" },
        min: { type: "number", group: "Value Axis", label: "Hard min", default: "" },
        max: { type: "number", group: "Value Axis", label: "Hard max", default: "" },
        zeroBaseline: { type: "boolean", group: "Value Axis", label: "Include zero baseline", default: true, help: "Always include 0 in the value axis scale." },
        notation: { type: "enum", group: "Value Axis", label: "Notation", default: "standard", options: opt(NOTATIONS) },
        decimals: { type: "enum", group: "Value Axis", label: "Decimals", default: "auto", options: opt(DECIMALS) },

        // ---- Pareto (visible when xType === 'category' && mode === 'pareto') ----
        showCumulativeLine: {
            type: "boolean", group: "Pareto", label: "Show cumulative line", default: true,
            visibleWhen: (p) => (p.xType || "category") === "category" && p.mode === "pareto"
        },
        cumulativeColor: {
            type: "color", group: "Pareto", label: "Cumulative line colour", default: "#f59e0b",
            visibleWhen: (p) => (p.xType || "category") === "category" && p.mode === "pareto"
        },
        cumulativeLineWidth: {
            type: "number", group: "Pareto", label: "Line width", default: 2, min: 1, max: 6, step: 0.5, unit: "px",
            visibleWhen: (p) => (p.xType || "category") === "category" && p.mode === "pareto"
        },
        showCutoffLine: {
            type: "boolean", group: "Pareto", label: "Show cutoff line (80%)", default: true,
            visibleWhen: (p) => (p.xType || "category") === "category" && p.mode === "pareto"
        },
        cutoffPercent: {
            type: "number", group: "Pareto", label: "Cutoff percentage", default: 80, min: 1, max: 99, step: 1, unit: "%",
            visibleWhen: (p) => (p.xType || "category") === "category" && p.mode === "pareto"
        },
        cutoffColor: {
            type: "color", group: "Pareto", label: "Cutoff line colour", default: "#ef4444",
            visibleWhen: (p) => (p.xType || "category") === "category" && p.mode === "pareto"
        },
        autoSort: {
            type: "boolean", group: "Pareto", label: "Auto-sort descending", default: true,
            help: "Automatically sorts categories descending by total value (standard Pareto principle).",
            visibleWhen: (p) => (p.xType || "category") === "category" && p.mode === "pareto"
        },
        secondaryAxisTitle: {
            type: "string", group: "Pareto", label: "Secondary axis title", default: "% Cumulative",
            visibleWhen: (p) => (p.xType || "category") === "category" && p.mode === "pareto"
        },

        // ---- Thresholds ----
        thresholds: {
            type: "list", group: "Thresholds", label: "Threshold lines", noun: "threshold", default: [],
            item: {
                noun: "threshold",
                fields: {
                    label: { type: "string", label: "Label", default: "Target" },
                    value: { type: "number", label: "Value", default: 0 },
                    color: { type: "color", label: "Colour", default: "#ef4444" },
                    dash: { type: "enum", label: "Style", default: "dashed", options: opt([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]) }
                }
            },
            help: "Horizontal target or limit reference lines across the value scale."
        },

        // ---- Tooltip & Legend ----
        showTooltip: { type: "boolean", group: "Tooltip", label: "Show tooltip", default: true },
        legend: {
            type: "enum", group: "Legend", label: "Legend position", default: "bottom",
            options: opt([["bottom", "Bottom"], ["top", "Top"], ["none", "Hidden"]])
        },

        // ---- Refresh, Zoom/Pan, Annotations, Export ----
        ...refreshProps("data"),
        ...zoomProps(),
        ...annotationProps(),
        ...exportProps({ thresholds: true })
    },

    actions: {
        setCategories: {
            label: "Set categories",
            help: "Replaces the active category list in category mode.",
            example: "[\"Line 1\", \"Line 2\", \"Line 3\"]"
        },
        setChartData: {
            label: "Set chart data (bulk)",
            help: "Sets both categories/timestamps and data for all series at once.",
            example: "{\n  \"categories\": [\"A\", \"B\", \"C\"],\n  \"series\": {\n    \"s1\": [10, 20, 30],\n    \"s2\": [15, 25, 35]\n  }\n}"
        },
        clearAll: { label: "Clear all", help: "Clears data from all series." },
        ...timeActions()
    },

    events: {
        barClick: {
            label: "On Bar Click",
            payload: { category: "string", time: "number", seriesId: "string", seriesName: "string", value: "number", percent: "number", cumulativePercent: "number", index: "number" },
            help: "Fired when any bar on the chart is clicked. Ideal for drilldown interactions."
        },
        hover: {
            label: "On Hover",
            payload: { category: "string", time: "number", values: "any" },
            help: "Fired when hovering over a category slot or bar."
        },
        hoverEnd: { label: "On Hover End", help: "Fired when pointer leaves the plot." },
        legendToggle: {
            label: "On Legend Toggle",
            payload: { id: "string", visible: "boolean" },
            help: "Fired when a series is toggled on/off in the legend."
        },
        ...timeEvents()
    },

    view: BarChartElement
});
