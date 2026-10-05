// Nexa UI — TimeChartElement: a chart along time (the Line Chart, the State Timeline, a time Bar
// chart). What it does for them: the time shown (live, a window, zoom / pan within limits), the
// time ruler (band, comb, labels, navigator) and the drag / wheel on it, the annotations (static,
// from Logic; hover, click), the export of a PNG, the pointer (zones, drags, Shift+drag select)
// and the events Range Change / Live / Hover End / Range Select / Annotation Click.
// A time chart gives (hooks):
//   _fullBounds()            { minX, maxX } of what it shows (null: nothing)
//   _hasData()               anything to draw
//   _drawInto(ctx, w, h, range)  its drawing; sets this._scale = { vMinX, vMaxX, m, … }
//   getPlotMetrics(w, h)     m = { plotX, plotY, plotW, plotH, rulerX, rulerY, rulerW, rulerH, padRight }
//   _plotHover(L, time) / _plotClick(L, time)   the pointer in its plot (this.hover, tooltip, events)
//   _showHitsTooltip(px, py, w)  its tooltip (an annotation's is drawn here)
//   _navTraces(ctx, g, list)  its miniature in the navigator; _pngLegend(span)  its PNG legend
//   _exportSpan(range)       { list, from, to } an export covers
import { ChartElement, numOr } from "./core.js";
import { getNiceTimeStep, parseTimeWindow, spanMs, timeOf, parts } from "./time.js";

export class TimeChartElement extends ChartElement {
    viewRange = null;         // null = live
    drag = null;              // { kind: "pan" | "ruler" | "nav" | "navL" | "navR" | "select" | "click", x0, min0, max0, moved }
    hover = null;
    _selection = null;        // { from, to } (Shift + drag)
    _lastHoverEmit = 0;
    _lastRangeEmit = 0;
    _wasLive = true;
    _dynamicAnnotations = [];
    _annotationHits = [];
    _hoverAnnotation = null;

    // "now" of a live chart: frozen between data and refresh ticks, so a hover, a zoom or a resize
    // redraws the same picture (it never moves under the pointer)
    _clock = 0;
    _lastTick = 0;
    _now() { return this._clock || (this._clock = Date.now()); }
    _tickClock() { this._clock = Date.now(); }

    // the Refresh prop: "data" (redraw when data comes in) or an interval (min 100 ms); ticks only
    // while live, on screen and not hovered / dragged, on a page (not the editor)
    refreshMs() {
        const v = this.p.refresh;
        if (!v || v === "data") return 0;
        return Math.max(100, spanMs(v) || 0);
    }
    _startRefresh() { this.every(100, () => this._refreshTick()); }
    _refreshTick() {
        const ms = this.refreshMs();
        if (!ms || this.isEditor || this.viewRange || this.drag || this.hover || this._inView === false || document.hidden) return;
        const now = Date.now();
        if (now - this._lastTick < ms) return;
        this._lastTick = now;
        this._tickClock();
        this.draw();
    }

    _fullBounds() { return null; }
    _hasData() { return false; }
    _plotHover() {}
    _plotClick() {}
    _showHitsTooltip() { const tip = this.renderRoot.querySelector(".tooltip"); if (tip) tip.style.display = "none"; }
    _navTraces() {}
    _pngLegend() { return []; }

    // ---- the chart's actions (its Update node) ---------------------------------------------
    followLive() {
        this.viewRange = null;
        this._tickClock();
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

    _drawAnnotations(ctx, toX, plotX, plotY, plotW, plotH, vMinX, vMaxX) {
        const list = this._allAnnotations();
        this._annotationHits = [];
        if (!list.length) return;
        const cs = getComputedStyle(this);
        const mono = cs.getPropertyValue("--nexa-fonts-body").trim() || "sans-serif";

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

    /**
     * The chart as an image, 2× sharp: a title and the time span above, the legend below. "visible":
     * what is shown; "all": everything the shown series hold. Hidden series are left out.
     */
    exportPNG(params) {
        const o = this._exportOpts(Object.assign({}, params || {}, { format: "png" }));
        const { w, h } = this._layoutSize();
        if (!(w > 0 && h > 0) || !this._hasData()) return Promise.resolve(null);
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
        const legend = this.p.legend === "none" ? [] : this._pngLegend(span);
        const meas = document.createElement("canvas").getContext("2d");
        meas.font = "11px " + c.font;
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
        ctx.font = "10.5px " + c.font;
        ctx.fillStyle = c.text;
        ctx.fillText(this.fmtTime(drawn.vMinX) + "  →  " + this.fmtTime(drawn.vMaxX), 12, title ? 26 : 7);
        ctx.drawImage(chart, 0, headH, w, h);
        ctx.font = "11px " + c.font;
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
            ctx.font = "10px " + c.font;
            ctx.fillStyle = c.text;
            if (showTime) this._timeRow(ctx, toX, minX, maxX, step, x, w, top, showDate);
            if (showDate) {
                ctx.font = "600 9.5px " + c.font;
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
            ctx.font = "10px " + c.font;
            ctx.fillStyle = c.strong;
            this._timeRow(ctx, toX, minX, maxX, step, x, w, top, showDate, 12);
        }
        if (showDate) {
            ctx.font = "600 9.5px " + c.font;
            ctx.fillStyle = c.text;
            const dy = showTime ? top + 13 : top;
            this._dateRow(ctx, toX, minX, maxX, x, w, dy, showTime ? top + 12 : y, y + h, c.text);
        }
        // the drag affordance: a grip at the bottom middle, arrows at both ends
        const cx = x + w / 2, gy = y + h - 3;
        ctx.fillStyle = hot ? c.accent : c.text;
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(cx + k * 5, gy, 1.2, 0, Math.PI * 2); ctx.fill(); }
        ctx.font = "11px " + c.font;
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
        this._navTraces(ctx, g, list);
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
                ctx.font = "9.5px " + c.font;
                ctx.fillStyle = c.text;
                this._timeRow(ctx, g.toX, g.full.minX, g.full.maxX, step, x, w, top, showDate);
            }
            if (showDate) {
                ctx.font = "600 9.5px " + c.font;
                ctx.fillStyle = c.text;
                this._dateRow(ctx, g.toX, g.full.minX, g.full.maxX, x, w, showTime ? top + 12 : top, 0, 0, c.grid);
            }
        }
        if (this._hoverRuler) this._hint(ctx, "drag the window ⇆ · its edges resize", x + w - 4, y + 2, c);
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
        this._showHitsTooltip(px, py, rectW);
    }

    // ---- gestures: page first (default) or chart first -------------------------------------
    _pageFirst() { return this.p.gestures !== "chart"; }

    updated(changed) {
        super.updated(changed);
        const box = this._plotEl();
        if (box) {
            box.style.touchAction = this._pageFirst() ? "pan-x pan-y" : "none";
            if (!box.__nexaTouch) { box.__nexaTouch = true; this._setupTouch(box); }
        }
    }

    connectedCallback() {
        super.connectedCallback();
        // a tooltip shown by a tap goes on a tap elsewhere
        this._tapAway = (e) => { if (this._tapHover && !e.composedPath().includes(this)) this._clearHover(); };
        window.addEventListener("pointerdown", this._tapAway);
    }

    disconnectedCallback() {
        if (this._tapAway) window.removeEventListener("pointerdown", this._tapAway);
        super.disconnectedCallback();
    }

    // a short note over the chart: how to zoom when a plain wheel / one finger moved the page
    _gestureHint(text) {
        const box = this._plotEl();
        if (!box || !this.p.enableZoomPan) return;
        let h = box.querySelector(".gesture-hint");
        if (!h) { h = document.createElement("div"); h.className = "gesture-hint"; box.appendChild(h); }
        h.textContent = text;
        h.classList.add("on");
        clearTimeout(this._hintTimer);
        this._hintTimer = setTimeout(() => h.classList.remove("on"), 1500);
    }

    _clearHover() {
        this._tapHover = false;
        if (this.hover) { this.hover = null; this.draw(); this.emit("hoverEnd", {}); }
        this._showTooltip(0, 0, 0);
    }

    // two fingers on a page-first chart: pinch zooms, moving pans (one finger is the page's)
    _setupTouch(box) {
        let g = null;
        const two = (e) => {
            const a = e.touches[0], b = e.touches[1];
            return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1 };
        };
        box.addEventListener("touchstart", (e) => {
            if (!this._pageFirst() || !this.p.enableZoomPan || e.touches.length !== 2 || !this._scale) { g = null; return; }
            const p = two(e), L = this._local({ clientX: p.x, clientY: p.y });
            if (!L) return;
            const { vMinX, vMaxX } = this._scale, m = L.m;
            g = { d: p.d, x: p.x, sx: L.sx, min: vMinX, max: vMaxX, at: Math.max(0, Math.min(1, (L.px - m.plotX) / m.plotW)) };
            this._clearHover();
        }, { passive: true });
        box.addEventListener("touchmove", (e) => {
            if (!g || e.touches.length !== 2 || !this._scale) return;
            e.preventDefault();
            const p = two(e), m = this._scale.m, span0 = g.max - g.min;
            const span = span0 * (g.d / p.d);
            const shift = ((p.x - g.x) * g.sx / m.plotW) * span;
            const at = g.min + g.at * span0 - shift;
            this.viewRange = this.clampViewRange(at - g.at * span, at + (1 - g.at) * span, this._fullBounds());
            g.moved = true;
            this.draw();
        }, { passive: false });
        const end = (e) => {
            if (!g || e.touches.length >= 2) return;
            if (g.moved) { this.requestUpdate(); this._rangeChanged("pinch"); }
            g = null;
        };
        box.addEventListener("touchend", end);
        box.addEventListener("touchcancel", end);
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
        // page first: a finger is the page's (scroll); lifted where it went down, it is a tap
        if (e.pointerType === "touch" && this._pageFirst()) { this._tap = { x: e.clientX, y: e.clientY }; return; }
        // the corner's buttons (Live, the export menu) are not a click / drag on the chart
        if (e.composedPath().some((n) => n.classList && (n.classList.contains("corner") || n.classList.contains("menu-dropdown")))) return;
        const L = this._local(e);
        if (!L) return;
        const zone = this._zone(L);
        if (zone === "none") return;
        const fb = this._fullBounds();
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
        if (e.pointerType === "touch" && this._pageFirst()) return;
        const L = this._local(e);
        if (!L || !this.canvas) return;
        const { m, px, py, box } = L;
        const d = this.drag;
        if (d) {
            const dx = (e.clientX - d.x0) * (d.sx || 1);
            if (Math.abs(dx) > 3) d.moved = true;
            if (!d.moved || d.kind === "click") return;
            const fb = this._fullBounds();
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
        this._plotHover(L, sc.vMinX + ((px - m.plotX) / m.plotW) * (sc.vMaxX - sc.vMinX));
    }

    onPointerCancel(e) {
        // the browser took a finger to scroll the page: say how to move the chart (now and then)
        if (this._tap && e && e.pointerType === "touch" && Date.now() - (this._lastTouchHint || 0) > 10000) {
            this._lastTouchHint = Date.now();
            this._gestureHint("Use two fingers to zoom or pan");
        }
        this._tap = null;
        this.drag = null;
        const box = this._plotEl();
        if (box) box.classList.remove("dragging", "scrubbing", "selecting");
    }

    // a tap on a page-first chart: the tooltip there (until a tap elsewhere), and a click
    _onTap(e) {
        const t = this._tap;
        this._tap = null;
        if (!t || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) return;
        const L = this._local(e);
        if (!L || !this._scale || this._zone(L) !== "plot") return;
        const sc = this._scale, m = L.m, time = sc.vMinX + ((L.px - m.plotX) / m.plotW) * (sc.vMaxX - sc.vMinX);
        this._tapHover = true;
        this._plotHover(L, time);
        this._plotClick(L, time);
    }

    onPointerUp(e) {
        if (e.pointerType === "touch" && this._pageFirst()) { this._onTap(e); return; }
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
            this._plotClick(L, sc.vMinX + ((L.px - m.plotX) / m.plotW) * (sc.vMaxX - sc.vMinX));
            this.draw();
        }
    }

    onWheel(e) {
        if (!this.p.enableZoomPan || !this.canvas) return;
        // page first: a plain wheel scrolls the page; Ctrl / ⌘ + wheel (a trackpad pinch sends ctrlKey) zooms
        if (this._pageFirst() && !e.ctrlKey && !e.metaKey) {
            this._gestureHint(/Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘ + scroll to zoom" : "Ctrl + scroll to zoom");
            return;
        }
        const L = this._local(e);
        if (!L || !this._scale) return;
        const zone = this._zone(L);
        if (zone === "none") return;
        e.preventDefault();
        const { m, px } = L;
        const fb = this._fullBounds();
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

    onPointerLeave(e) {
        // a finger lifted: a tapped tooltip stays (a tap elsewhere clears it)
        if (e && e.pointerType === "touch") return;
        this._hoverAnnotation = null;
        if (this.hover) { this.hover = null; this.draw(); this.emit("hoverEnd", {}); }
        this._showTooltip(0, 0, 0);
        if (this._hoverRuler) { this._hoverRuler = false; this.draw(); }
        const box = this._plotEl();
        if (box) box.classList.remove("hover-ruler", "hover-edge", "hover-ann");
    }
}
