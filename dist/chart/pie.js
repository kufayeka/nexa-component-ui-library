// Nexa UI — Pie & Donut Chart
// Categorical proportions of a whole, designed to avoid the classic pitfalls of industrial pie charts:
//   - Smart anti-collision labels (inside, outside with clean leader lines, or legend-only; auto-hides for tiny slices)
//   - Automatic "Others" grouping (collapses slices < X% or beyond top N into a single expandable category)
//   - Donut center metric / KPI (Total sum, average, count, or custom text)
//   - Responsive legend with interactive toggle (mute/solo slices)
//   - HMI drilldown: On Slice Click event { id, name, value, percent, index, isOther } and Logic slice targeting
//   - Robust zero / negative handling with elegant empty states
//   - Direct flat payload ingestion (array of objects, tuples, or key-value map)
//   - Full export to CSV, Excel (.xlsx), and PNG
import { html, css } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, defineUI } from "../core.js";
import { chartCommon, opt, NOTATIONS, DECIMALS, notationOf, numOr } from "./core.js";
import { xlsxBlob } from "./export.js";
import { ChartElement } from "./core.js";

const common = chartCommon;

const PIE_CSS = css`
    .chart-container.legend-right {
        flex-direction: row;
    }
    .chart-container.legend-right .plot {
        flex: 1 1 auto;
    }
    .chart-container.legend-right .legend {
        flex: 0 0 auto;
        flex-direction: column;
        flex-wrap: nowrap;
        max-height: 100%;
        max-width: 42%;
        padding: 12px 14px;
        overflow-y: auto;
        justify-content: center;
        gap: 6px;
    }
    .chart-container.legend-top {
        flex-direction: column-reverse;
    }
    .chart-container.legend-top .legend {
        padding: 6px 12px 2px 12px;
    }
    .legend {
        justify-content: center;
        padding: 4px 10px 8px 10px;
    }
    .lg-pct {
        font-family: var(--nexa-fonts-body, "IBM Plex Sans", system-ui, sans-serif);
        opacity: 0.75;
        font-size: 10px;
        margin-left: 2px;
    }
    .lg-swatch {
        width: 10px;
        height: 10px;
        border-radius: 50%;
    }
    .plot {
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: default;
    }
    .plot.hovering {
        cursor: pointer;
    }
    .tooltip-pct {
        font-weight: 600;
        color: var(--accent, #3b82f6);
        margin-left: 4px;
    }
    .tooltip-others {
        margin-top: 4px;
        padding-top: 4px;
        border-top: 1px dashed rgba(255, 255, 255, 0.18);
        font-size: 10px;
        color: #94a3b8;
    }
    .tooltip-other-row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        line-height: 1.3;
    }
`;

const SLICE_FIELDS = {
    name: { type: "string", label: "Name", default: "Slice" },
    id: { type: "string", label: "Id", default: "", bindable: false, help: "Fixed id for Logic targeting." },
    value: { type: "number", label: "Value", default: 10 },
    color: { type: "color", label: "Colour", default: "", help: "Empty: picks next colour from palette." },
    visible: { type: "boolean", label: "Visible", default: true },
    inLegend: { type: "boolean", label: "In legend", default: true },
    live: { type: "tag", access: "read", section: "Data", label: "Live value" }
};

function sliceDefaults() {
    const o = {};
    Object.keys(SLICE_FIELDS).forEach((k) => { o[k] = SLICE_FIELDS[k].default; });
    delete o.live;
    return o;
}

export class PieChartElement extends ChartElement {
    static styles = [...ChartElement.styles, PIE_CSS];

    _hiddenSlices = new Set();
    _dynamicSlices = null;
    _hoverIndex = null;
    _hitSlices = [];
    _preparedSlices = [];
    _totalValue = 0;
    _lastHoverEmit = 0;

    sliceList() {
        if (this._dynamicSlices) return this._dynamicSlices;
        const raw = Array.isArray(this.p && this.p.slices) ? this.p.slices : [];
        const d = sliceDefaults();
        return raw.map((s, i) => {
            const o = Object.assign({}, d, s && typeof s === "object" ? s : {});
            o._i = i;
            o._key = String(o.id || "#" + i);
            return o;
        });
    }

    _seriesSpec() {
        return {
            notation: notationOf(this.p && this.p.notation),
            decimals: this.p && this.p.decimals === "auto" ? undefined : numOr(this.p && this.p.decimals, 0)
        };
    }

    _fmtVal(val) {
        if (!Number.isFinite(val)) return "0";
        const spec = this._seriesSpec();
        let s;
        if (spec.notation === "compact") {
            s = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: spec.decimals !== undefined ? spec.decimals : 1 }).format(val);
        } else if (spec.notation === "scientific") {
            s = val.toExponential(spec.decimals !== undefined ? spec.decimals : 2);
        } else if (spec.decimals !== undefined) {
            s = val.toFixed(spec.decimals);
        } else {
            s = String(Math.round(val * 100) / 100);
        }
        const unit = (this.p && this.p.valueUnit ? " " + this.p.valueUnit : "");
        return s + unit;
    }

    colorOf(slice, index) {
        if (slice.color && typeof slice.color === "string" && slice.color.trim()) return slice.color.trim();
        return this.seriesColor(index);
    }

    prepareData() {
        const rawList = this.sliceList();
        const active = [];

        // 1. Gather positive and visible slices
        rawList.forEach((s, idx) => {
            const val = numOr(s.value, 0);
            const key = s._key || String(s.id || "#" + idx);
            if (s.visible === false || this._hiddenSlices.has(key)) return;
            if (val <= 0) return; // Ignore negative or zero values
            active.push({
                _key: key,
                _origIndex: idx,
                id: s.id || key,
                name: String(s.name || "Slice " + (idx + 1)),
                value: val,
                color: this.colorOf(s, idx),
                inLegend: s.inLegend !== false,
                isOther: false
            });
        });

        const total = active.reduce((sum, s) => sum + s.value, 0);
        this._totalValue = total;

        if (total <= 0 || !active.length) {
            this._preparedSlices = [];
            return;
        }

        // 2. Sorting
        const sortMode = (this.p && this.p.sort) || "descending";
        if (sortMode === "descending") {
            active.sort((a, b) => b.value - a.value);
        } else if (sortMode === "ascending") {
            active.sort((a, b) => a.value - b.value);
        }

        // 3. "Others" Grouping (Threshold & Max Slices)
        const thresholdPct = numOr(this.p && this.p.groupThresholdPercent, 0);
        const maxSlices = numOr(this.p && this.p.maxSlices, 0);
        let finalSlices = [];
        const toGroup = [];

        active.forEach((s, i) => {
            const pct = (s.value / total) * 100;
            const exceedsMax = maxSlices > 0 && i >= (maxSlices - 1);
            const belowThreshold = thresholdPct > 0 && pct < thresholdPct;

            if (exceedsMax || belowThreshold) {
                toGroup.push(s);
            } else {
                finalSlices.push(s);
            }
        });

        // Combine into "Others" if 2 or more slices qualify, or if maxSlices mandated it
        if (toGroup.length >= 2 || (maxSlices > 0 && toGroup.length >= 1 && finalSlices.length >= maxSlices - 1)) {
            const othersVal = toGroup.reduce((sum, s) => sum + s.value, 0);
            if (othersVal > 0) {
                finalSlices.push({
                    _key: "_others",
                    id: "others",
                    name: (this.p && this.p.othersLabel) || "Others",
                    value: othersVal,
                    color: (this.p && this.p.othersColor) || "#64748b",
                    inLegend: true,
                    isOther: true,
                    subSlices: toGroup
                });
            }
        } else {
            // Keep original slices unbundled if not enough for a group
            finalSlices = active;
        }

        // 4. Calculate angles and percentages
        let currentAngle = (numOr(this.p && this.p.startAngle, -90) * Math.PI) / 180;
        const padDeg = numOr(this.p && this.p.padAngle, 1.5);
        const padRad = (padDeg * Math.PI) / 180;

        finalSlices.forEach((s) => {
            const frac = s.value / total;
            const span = frac * Math.PI * 2;
            s.pct = frac * 100;
            s.start = currentAngle;
            s.span = span;
            s.effectiveSpan = finalSlices.length > 1 ? Math.max(0.005, span - padRad) : span;
            s.end = s.start + s.effectiveSpan;
            s.mid = s.start + span / 2;
            currentAngle += span;
        });

        this._preparedSlices = finalSlices;
    }

    draw() {
        if (!this.ctx || !this.canvas) return;
        const { w, h } = this._layoutSize();
        if (w <= 0 || h <= 0) return;

        const ctx = this.ctx;
        this._clearCanvas(ctx, w, h);

        const colors = this._colors();
        const slices = this._preparedSlices;
        const total = this._totalValue;
        const cx = w / 2, cy = h / 2;
        const isDonut = ((this.p && this.p.mode) || "donut") === "donut";

        // Layout margins: leave room for outside leader labels if active
        const labelsPos = (this.p && this.p.labelsPosition) || "outside";
        const margin = labelsPos === "outside" ? Math.min(64, Math.max(34, Math.min(w, h) * 0.16)) : 16;
        const R = Math.max(20, Math.min(cx, cy) - margin);
        const rInner = isDonut ? Math.round(R * Math.min(0.9, Math.max(0.1, numOr(this.p && this.p.innerRadius, 0.6)))) : 0;

        this._hitSlices = [];

        // Empty state check
        if (total <= 0 || !slices.length) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            if (rInner > 0) ctx.arc(cx, cy, rInner, 0, Math.PI * 2, true);
            ctx.strokeStyle = colors.grid;
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
            return;
        }

        // Draw slices
        slices.forEach((s, idx) => {
            const isHovered = this._hoverIndex === idx;
            const explodeDist = isHovered ? 6 : 0;
            const dx = explodeDist * Math.cos(s.mid);
            const dy = explodeDist * Math.sin(s.mid);

            ctx.save();
            ctx.beginPath();
            ctx.arc(cx + dx, cy + dy, R, s.start, s.end);
            if (rInner > 0) {
                ctx.arc(cx + dx, cy + dy, rInner, s.end, s.start, true);
            } else {
                ctx.lineTo(cx + dx, cy + dy);
            }
            ctx.closePath();

            ctx.fillStyle = s.color;
            ctx.fill();
            ctx.strokeStyle = colors.band || "rgba(0,0,0,0.25)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();

            this._hitSlices.push({
                index: idx,
                slice: s,
                cx, cy,
                R, rInner,
                start: s.start,
                end: s.start + s.span, // full span for hit testing
                mid: s.mid,
                pct: s.pct,
                dx, dy
            });
        });

        // Draw Donut Center KPI
        if (isDonut && rInner >= 26) {
            const statMode = (this.p && this.p.centerStat) || "total";
            if (statMode !== "none") {
                let statVal = "";
                if (statMode === "total") statVal = this._fmtVal(total);
                else if (statMode === "average") statVal = this._fmtVal(total / (slices.length || 1));
                else if (statMode === "count") statVal = String(slices.length);
                else if (statMode === "custom") statVal = String((this.p && this.p.centerValue) || "");

                const statLabel = String((this.p && this.p.centerLabel) || "Total");

                ctx.save();
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                // Number
                const numFontSize = Math.min(24, Math.max(12, Math.round(rInner * 0.38)));
                ctx.font = `600 ${numFontSize}px ${colors.font || "sans-serif"}`;
                ctx.fillStyle = colors.strong;
                ctx.fillText(statVal, cx, cy - (statLabel ? 6 : 0));

                // Label
                if (statLabel) {
                    const lblFontSize = Math.min(11, Math.max(9, Math.round(rInner * 0.2)));
                    ctx.font = `500 ${lblFontSize}px var(--nexa-fonts-body, sans-serif)`;
                    ctx.fillStyle = colors.text;
                    ctx.fillText(statLabel, cx, cy + numFontSize * 0.6);
                }
                ctx.restore();
            }
        }

        // Draw Data Labels
        if (labelsPos === "inside" || labelsPos === "outside") {
            const minAngleDeg = numOr(this.p && this.p.minAngleForLabel, 10);
            const minAngleRad = (minAngleDeg * Math.PI) / 180;
            const contentMode = (this.p && this.p.labelContent) || "namePercent";

            slices.forEach((s) => {
                if (s.span < minAngleRad) return; // Smart anti-collision: hide label for tiny slices

                let labelText = "";
                const pctStr = (Math.round(s.pct * 10) / 10) + "%";
                const valStr = this._fmtVal(s.value);
                if (contentMode === "namePercent") labelText = `${s.name} ${pctStr}`;
                else if (contentMode === "percent") labelText = pctStr;
                else if (contentMode === "value") labelText = valStr;
                else if (contentMode === "name") labelText = s.name;
                else if (contentMode === "both") labelText = `${s.name}: ${valStr} (${pctStr})`;

                if (!labelText) return;

                if (labelsPos === "inside") {
                    const rMid = (R + rInner) / 2;
                    const lx = cx + Math.cos(s.mid) * rMid;
                    const ly = cy + Math.sin(s.mid) * rMid;

                    ctx.save();
                    ctx.font = `600 11px ${colors.font || "sans-serif"}`;
                    ctx.fillStyle = "#ffffff";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.shadowColor = "rgba(0,0,0,0.6)";
                    ctx.shadowBlur = 3;
                    ctx.fillText(labelText, lx, ly);
                    ctx.restore();
                } else if (labelsPos === "outside") {
                    const p0x = cx + Math.cos(s.mid) * R;
                    const p0y = cy + Math.sin(s.mid) * R;
                    const p1x = cx + Math.cos(s.mid) * (R + 10);
                    const p1y = cy + Math.sin(s.mid) * (R + 10);
                    const isRight = Math.cos(s.mid) >= 0;
                    const p2x = p1x + (isRight ? 12 : -12);
                    const p2y = p1y;

                    ctx.save();
                    // Leader line
                    ctx.beginPath();
                    ctx.moveTo(p0x, p0y);
                    ctx.lineTo(p1x, p1y);
                    ctx.lineTo(p2x, p2y);
                    ctx.strokeStyle = colors.text;
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // Text
                    ctx.font = `11px ${colors.font || "sans-serif"}`;
                    ctx.fillStyle = colors.strong;
                    ctx.textAlign = isRight ? "left" : "right";
                    ctx.textBaseline = "middle";
                    ctx.fillText(labelText, p2x + (isRight ? 4 : -4), p2y);
                    ctx.restore();
                }
            });
        }
    }

    _findHit(px, py) {
        if (!this._hitSlices.length) return null;
        const { w, h } = this._layoutSize();
        const cx = w / 2, cy = h / 2;
        const dx = px - cx, dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const first = this._hitSlices[0];
        if (dist < (first.rInner - 3) || dist > (first.R + 14)) return null;

        let angle = Math.atan2(dy, dx);
        // Normalize angle to match startAngle domain
        const startDeg = numOr(this.p && this.p.startAngle, -90);
        const startRad = (startDeg * Math.PI) / 180;
        let norm = angle - startRad;
        while (norm < 0) norm += Math.PI * 2;
        while (norm >= Math.PI * 2) norm -= Math.PI * 2;
        const target = startRad + norm;

        return this._hitSlices.find((h) => {
            let sStart = h.start;
            let sEnd = h.end;
            while (sStart < 0) { sStart += Math.PI * 2; sEnd += Math.PI * 2; }
            let testAngle = target;
            while (testAngle < sStart) testAngle += Math.PI * 2;
            return testAngle >= sStart && testAngle <= sEnd;
        }) || null;
    }

    _showTooltipFor(hit, px, py, plotRect) {
        const tip = this.renderRoot?.querySelector(".tooltip");
        if (!tip) return;
        if (this.p.showTooltip === false || !hit) {
            tip.style.display = "none";
            return;
        }

        const s = hit.slice;
        const timeHeader = tip.querySelector(".tooltip-time");
        if (timeHeader) timeHeader.textContent = s.name;

        const body = tip.querySelector(".tooltip-rows");
        if (body) {
            const valStr = this._fmtVal(s.value);
            const pctStr = (Math.round(hit.pct * 10) / 10) + "%";
            let htmlContent = `
                <div class="tooltip-row">
                    <span class="tooltip-dot" style="background:${s.color}"></span>
                    <span class="tooltip-name">${s.name}:</span>
                    <span class="tooltip-val">${valStr}</span>
                    <span class="tooltip-pct">(${pctStr})</span>
                </div>
            `;

            if (s.isOther && Array.isArray(s.subSlices) && s.subSlices.length) {
                htmlContent += `<div class="tooltip-others"><span>Grouped items:</span>`;
                s.subSlices.forEach((sub) => {
                    const subPct = ((sub.value / this._totalValue) * 100).toFixed(1) + "%";
                    htmlContent += `
                        <div class="tooltip-other-row">
                            <span>${sub.name}</span>
                            <span>${this._fmtVal(sub.value)} (${subPct})</span>
                        </div>
                    `;
                });
                htmlContent += `</div>`;
            }

            body.innerHTML = htmlContent;
        }

        const flip = px > (plotRect ? plotRect.width - 200 : 200);
        tip.style.display = "block";
        tip.style.left = `${Math.round(flip ? px - 12 : px + 12)}px`;
        tip.style.top = `${Math.round(py)}px`;
        tip.style.transform = flip ? "translate(-100%, -50%)" : "translate(0, -50%)";
    }

    onPointerMove(e) {
        const plot = this._plotEl();
        if (!plot) return;
        const rect = plot.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        const hit = this._findHit(px, py);
        if (hit) {
            plot.classList.add("hovering");
            if (this._hoverIndex !== hit.index) {
                this._hoverIndex = hit.index;
                this.draw();
                const now = Date.now();
                if (now - this._lastHoverEmit > 100) {
                    this._lastHoverEmit = now;
                    this.emit("hover", {
                        id: hit.slice.id,
                        name: hit.slice.name,
                        value: hit.slice.value,
                        percent: Math.round(hit.pct * 10) / 10,
                        index: hit.index
                    });
                }
            }
            this._showTooltipFor(hit, px, py, rect);
        } else {
            plot.classList.remove("hovering");
            if (this._hoverIndex !== null) {
                this._hoverIndex = null;
                this.draw();
                this.emit("hoverEnd", {});
            }
            const tip = this.renderRoot?.querySelector(".tooltip");
            if (tip) tip.style.display = "none";
        }
    }

    onPointerLeave() {
        const plot = this._plotEl();
        if (plot) plot.classList.remove("hovering");
        if (this._hoverIndex !== null) {
            this._hoverIndex = null;
            this.draw();
            this.emit("hoverEnd", {});
        }
        const tip = this.renderRoot?.querySelector(".tooltip");
        if (tip) tip.style.display = "none";
    }

    onPlotClick(e) {
        const plot = this._plotEl();
        if (!plot) return;
        const rect = plot.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        const hit = this._findHit(px, py);
        if (hit) {
            const payload = {
                id: hit.slice.id,
                name: hit.slice.name,
                value: hit.slice.value,
                percent: Math.round(hit.pct * 10) / 10,
                index: hit.index,
                isOther: !!hit.slice.isOther
            };
            this.emit("sliceClick", payload);
            if (hit.slice.id) {
                this.emitTarget({ list: "slices", id: hit.slice.id }, "click", payload);
            }
        }
    }

    _toggleSlice(slice, e) {
        const key = slice._key;
        if (e && e.altKey) {
            // Solo this slice: hide all others
            const all = this.sliceList();
            this._hiddenSlices.clear();
            all.forEach((s) => {
                if (s._key !== key) this._hiddenSlices.add(s._key);
            });
        } else {
            if (this._hiddenSlices.has(key)) {
                this._hiddenSlices.delete(key);
            } else {
                this._hiddenSlices.add(key);
            }
        }
        this.prepareData();
        this.draw();
        this.requestUpdate();
        this.emit("legendToggle", { id: slice.id, name: slice.name, visible: !this._hiddenSlices.has(key) });
    }

    // ---- Logic Actions ---------------------------------------------------------------------
    setChartData(data) {
        if (!data) return;
        let list = [];
        if (Array.isArray(data)) {
            list = data.map((item, idx) => {
                if (Array.isArray(item)) {
                    // [name, value]
                    return { id: "s" + idx, name: String(item[0]), value: numOr(item[1], 0) };
                }
                if (item && typeof item === "object") {
                    return {
                        id: item.id || "s" + idx,
                        name: String(item.name || item.label || item.category || "Slice " + (idx + 1)),
                        value: numOr(item.value !== undefined ? item.value : (item.val !== undefined ? item.val : item.y), 0),
                        color: item.color || ""
                    };
                }
                if (typeof item === "number") {
                    return { id: "s" + idx, name: "Slice " + (idx + 1), value: item };
                }
                return null;
            }).filter(Boolean);
        } else if (typeof data === "object") {
            // Check if wrapper { payload: ... }
            if (data.payload) {
                return this.setChartData(data.payload);
            }
            // Key-value map: { "Running": 100, "Idle": 40 }
            let i = 0;
            for (const [k, v] of Object.entries(data)) {
                list.push({ id: "s" + i, name: k, value: numOr(v, 0) });
                i++;
            }
        }

        const d = sliceDefaults();
        this._dynamicSlices = list.map((s, idx) => {
            const o = Object.assign({}, d, s);
            o._i = idx;
            o._key = String(o.id || "#" + idx);
            return o;
        });

        this.prepareData();
        if (this.resizeCanvas()) this.draw();
        this.requestUpdate();
    }

    setSliceValue(params) {
        if (!params || typeof params !== "object") return;
        const targetId = String(params.id || params.name || "");
        const val = numOr(params.value, 0);
        const list = this.sliceList();
        const s = list.find((x) => x.id === targetId || x.name === targetId || x._key === targetId);
        if (s) {
            s.value = val;
            this.prepareData();
            if (this.resizeCanvas()) this.draw();
            this.requestUpdate();
        }
    }

    clearAll() {
        this._dynamicSlices = null;
        if (Array.isArray(this.p && this.p.slices)) {
            this.p.slices.forEach((s) => { s.value = 0; });
        }
        this._hiddenSlices.clear();
        this.prepareData();
        if (this.resizeCanvas()) this.draw();
        this.requestUpdate();
    }

    exportData(format) {
        const fmt = (format || "csv").toLowerCase();
        const header = ["Name", "Value", "Percentage"];
        const rows = this._preparedSlices.map((s) => [
            s.name,
            s.value,
            (Math.round(s.pct * 10) / 10) + "%"
        ]);

        let blob;
        if (fmt === "xlsx") {
            blob = xlsxBlob(header, rows, false, { textCols: [0, 2] });
        } else if (fmt === "png") {
            if (this.canvas) {
                this.canvas.toBlob((b) => {
                    const name = this._getExportFileName("png", "all");
                    this._download(b, name);
                    this._lastExport = { name, blob: b, rows: rows.length };
                });
                return rows.length;
            }
        } else {
            const q = (t) => '"' + String(t).replace(/"/g, '""') + '"';
            const lines = [header.map(q).join(",")];
            rows.forEach((r) => lines.push(r.map(q).join(",")));
            blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        }

        const name = this._getExportFileName(fmt, "all");
        if (blob) {
            this._download(blob, name);
            this._lastExport = { name, blob, rows: rows.length };
        }
        return rows.length;
    }

    render() {
        const all = this.sliceList();
        const legendAt = (this.p && this.p.legend) || "bottom";
        const legendList = all.filter((s) => s.inLegend !== false);
        const showVal = this.p && this.p.legendShowValue !== false;
        const showPct = this.p && this.p.legendShowPercent !== false;
        const total = this._totalValue;

        const legend = legendAt === "none" || !legendList.length ? "" : html`
            <div class="legend" part="legend">
                ${legendList.map((s, idx) => {
                    const key = s._key || String(s.id || "#" + idx);
                    const isOff = this._hiddenSlices.has(key) || s.visible === false;
                    const pctStr = total > 0 ? ` (${((numOr(s.value, 0) / total) * 100).toFixed(1)}%)` : "";
                    return html`
                        <button type="button" class="lg-item ${isOff ? "off" : ""}" data-key="${key}"
                            title="Click: toggle slice. Alt+click: solo this slice."
                            @click=${(e) => this._toggleSlice(s, e)}>
                            <span class="lg-swatch" style="background:${this.colorOf(s, idx)}"></span>
                            <span class="lg-name">${s.name || "Slice " + (idx + 1)}</span>
                            ${showVal ? html`<span class="lg-val">${this._fmtVal(s.value)}</span>` : ""}
                            ${showPct ? html`<span class="lg-pct">${pctStr}</span>` : ""}
                        </button>
                    `;
                })}
            </div>
        `;

        const hasData = total > 0 && this._preparedSlices.length > 0;
        const containerClasses = `chart-container ${legendAt === "right" ? "legend-right" : (legendAt === "top" ? "legend-top" : "")}`;

        return html`
            <div class="${containerClasses}" part="chart">
                ${legendAt === "top" ? legend : ""}
                <div class="plot"
                    @pointermove=${(e) => this.onPointerMove(e)}
                    @pointerleave=${() => this.onPointerLeave()}
                    @click=${(e) => this.onPlotClick(e)}>
                    <canvas></canvas>
                    <div class="corner" style="right: 14px; top: 10px;">
                        ${this._renderMenu()}
                    </div>
                    <div class="tooltip"><div class="tooltip-time"></div><div class="tooltip-rows"></div></div>
                    ${!hasData ? html`<div class="empty"><span>${(this.p && this.p.emptyText) || "No data to display"}</span></div>` : ""}
                </div>
                ${legendAt !== "top" ? legend : ""}
            </div>
        `;
    }
}

export const pieChart = defineUI({
    ...common,
    id: PREFIX + "pie-chart",
    label: "Pie / Donut Chart",
    icon: "fa fa-pie-chart",
    size: { w: 480, h: 320 },
    help: "Pie and Donut chart for categorical proportions with smart anti-collision labels, automatic 'Others' small-slice grouping, center KPI metric, interactive slice click events for HMI drilldowns, and full export.",
    version: 1,

    groups: ["Chart", "Center KPI", "Others Grouping", "Labels", "Legend", "Slices", "Value & Unit", "Tooltip", "Export", "Style", "Behaviour"],

    properties: {
        mode: {
            type: "enum", group: "Chart", label: "Type / Mode", default: "donut",
            options: opt([["donut", "Donut (hollow center)"], ["pie", "Pie (solid)"]]),
            help: "Donut shows a center cutout for KPI metrics. Pie is a classic solid circle."
        },
        innerRadius: {
            type: "number", group: "Chart", label: "Donut inner radius", default: 0.6,
            min: 0.1, max: 0.9, step: 0.05, unit: "ratio",
            visibleWhen: (p) => (p.mode || "donut") === "donut",
            help: "Ratio of inner hole relative to outer radius (0.6 = 60%)."
        },
        padAngle: {
            type: "number", group: "Chart", label: "Slice gap (pad angle)", default: 1.5,
            min: 0, max: 10, step: 0.5, unit: "°",
            help: "Subtle gap between slices for visual separation."
        },
        startAngle: {
            type: "number", group: "Chart", label: "Start angle", default: -90,
            min: -360, max: 360, step: 15, unit: "°",
            help: "Start angle in degrees (-90° starts at top / 12 o'clock)."
        },
        sort: {
            type: "enum", group: "Chart", label: "Sort slices", default: "descending",
            options: opt([["descending", "Descending (largest first)"], ["ascending", "Ascending (smallest first)"], ["none", "As defined (no sort)"]]),
            help: "Sorting largest slices first improves visual comprehension."
        },

        // ---- Center KPI (Donut) ----
        centerStat: {
            type: "enum", group: "Center KPI", label: "Center statistic", default: "total",
            options: opt([["total", "Total Sum (∑)"], ["average", "Average (mean)"], ["count", "Count of slices"], ["custom", "Custom value"], ["none", "None (blank)"]]),
            visibleWhen: (p) => (p.mode || "donut") === "donut"
        },
        centerLabel: {
            type: "string", group: "Center KPI", label: "Center subtitle label", default: "Total",
            visibleWhen: (p) => (p.mode || "donut") === "donut" && p.centerStat !== "none"
        },
        centerValue: {
            type: "string", group: "Center KPI", label: "Custom center text", default: "",
            visibleWhen: (p) => (p.mode || "donut") === "donut" && p.centerStat === "custom"
        },

        // ---- "Others" Grouping ----
        groupThresholdPercent: {
            type: "number", group: "Others Grouping", label: "Threshold percentage", default: 0,
            min: 0, max: 25, step: 0.5, unit: "%",
            help: "Automatically bundles slices smaller than this percentage into an 'Others' category (0 = disabled)."
        },
        maxSlices: {
            type: "number", group: "Others Grouping", label: "Max top slices", default: 0,
            min: 0, max: 30, step: 1,
            help: "Keeps top N slices and groups remaining slices into 'Others' (0 = unlimited)."
        },
        othersLabel: {
            type: "string", group: "Others Grouping", label: "Others slice label", default: "Others",
            visibleWhen: (p) => (p.groupThresholdPercent > 0 || p.maxSlices > 0)
        },
        othersColor: {
            type: "color", group: "Others Grouping", label: "Others slice colour", default: "#64748b",
            visibleWhen: (p) => (p.groupThresholdPercent > 0 || p.maxSlices > 0)
        },

        // ---- Labels & Anti-Collision ----
        labelsPosition: {
            type: "enum", group: "Labels", label: "Data labels", default: "outside",
            options: opt([["outside", "Outside (leader lines)"], ["inside", "Inside slices"], ["legend", "Legend only"], ["none", "Hidden"]]),
            help: "Where to render numeric / name labels."
        },
        labelContent: {
            type: "enum", group: "Labels", label: "Label content", default: "namePercent",
            options: opt([["namePercent", "Name & Percent (e.g. Running 45%)"], ["percent", "Percent only (45%)"], ["value", "Value only (150)"], ["name", "Name only"], ["both", "Name, Value & %"]]),
            visibleWhen: (p) => p.labelsPosition === "outside" || p.labelsPosition === "inside"
        },
        minAngleForLabel: {
            type: "number", group: "Labels", label: "Min slice angle for label", default: 10,
            min: 0, max: 45, step: 1, unit: "°",
            visibleWhen: (p) => p.labelsPosition === "outside" || p.labelsPosition === "inside",
            help: "Prevents text collision: slices smaller than this angle will not draw crowded canvas labels."
        },

        // ---- Legend ----
        legend: {
            type: "enum", group: "Legend", label: "Legend position", default: "bottom",
            options: opt([["bottom", "Bottom"], ["right", "Right side"], ["top", "Top"], ["none", "Hidden"]])
        },
        legendShowValue: {
            type: "boolean", group: "Legend", label: "Show numeric value in legend", default: true,
            visibleWhen: (p) => p.legend !== "none"
        },
        legendShowPercent: {
            type: "boolean", group: "Legend", label: "Show percentage (%) in legend", default: true,
            visibleWhen: (p) => p.legend !== "none"
        },

        // ---- Slices list ----
        slices: {
            type: "list", group: "Slices", label: "Configured slices", noun: "slice",
            help: "Predefined slices. Can also be populated dynamically via setChartData or tag binding.",
            default: [
                { id: "s1", name: "Category A", value: 45, color: "#3b82f6", visible: true, inLegend: true },
                { id: "s2", name: "Category B", value: 30, color: "#10b981", visible: true, inLegend: true },
                { id: "s3", name: "Category C", value: 25, color: "#f59e0b", visible: true, inLegend: true }
            ],
            item: {
                noun: "slice",
                target: true,
                fields: SLICE_FIELDS
            }
        },

        // ---- Value & Unit ----
        valueUnit: { type: "string", group: "Value & Unit", label: "Unit", default: "", help: "Unit displayed alongside numbers (e.g. kW, %, pcs)." },
        notation: { type: "enum", group: "Value & Unit", label: "Notation", default: "standard", options: opt(NOTATIONS) },
        decimals: { type: "enum", group: "Value & Unit", label: "Decimals", default: "auto", options: opt(DECIMALS) },

        // ---- Tooltip & Empty ----
        showTooltip: { type: "boolean", group: "Tooltip", label: "Show tooltip", default: true },
        emptyText: { type: "string", group: "Chart", label: "Empty text", default: "No data to display" },

        // ---- Export ----
        exportButton: { type: "boolean", group: "Export", label: "Export menu on the chart (⋮)", default: true },
        exportCsv: { type: "boolean", group: "Export", label: "Menu: CSV", default: true, visibleWhen: (p) => p.exportButton !== false },
        exportXlsx: { type: "boolean", group: "Export", label: "Menu: Excel", default: true, visibleWhen: (p) => p.exportButton !== false },
        exportPng: { type: "boolean", group: "Export", label: "Menu: PNG", default: true, visibleWhen: (p) => p.exportButton !== false },
        exportTitle: { type: "string", group: "Export", label: "Title", default: "", help: "Title in export files; {title} in filename." },
        exportFilename: { type: "string", group: "Export", label: "File name expression", default: "", bindable: false }
    },

    actions: {
        setChartData: {
            label: "Set chart data (bulk)",
            help: "Sets slices dynamically from array of objects, array of [name, value] tuples, or key-value object.",
            example: "[\n  { \"name\": \"Running\", \"value\": 45 },\n  { \"name\": \"Idle\", \"value\": 30 },\n  { \"name\": \"Fault\", \"value\": 15 }\n]"
        },
        setSliceValue: {
            label: "Set slice value",
            help: "Updates a single slice value by id or name.",
            example: "{\n  \"id\": \"s1\",\n  \"value\": 120\n}"
        },
        clearAll: { label: "Clear all", help: "Clears all slice data." },
        exportData: {
            label: "Export",
            help: "Downloads data in CSV, Excel (.xlsx) or PNG format.",
            example: "{\n  \"format\": \"csv\"\n}"
        }
    },

    events: {
        sliceClick: {
            label: "On Slice Click",
            payload: { id: "string", name: "string", value: "number", percent: "number", index: "number", isOther: "boolean" },
            help: "Fired when user clicks any slice or legend item. Ideal for HMI drilldowns and filters."
        },
        hover: {
            label: "On Hover",
            payload: { id: "string", name: "string", value: "number", percent: "number", index: "number" },
            help: "Fired when pointer hovers over a slice."
        },
        hoverEnd: { label: "On Hover End", help: "Fired when pointer leaves the slice." },
        legendToggle: {
            label: "On Legend Toggle",
            payload: { id: "string", name: "string", visible: "boolean" },
            help: "Fired when a slice is shown or hidden via legend."
        }
    },

    view: PieChartElement
});
