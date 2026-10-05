// Nexa UI — Radial & Linear Gauge
// Industrial gauge and meter component inspired by Power BI and SCADA standards:
//   - Dual Modes: Radial Dial (speedometer / arc meter) and Linear (horizontal / vertical bar)
//   - Min / Max bounds (batas bawah & batas atas) with soft limits
//   - Pointer / needle customization: sharp needle, filled progress track, marker notch, or combo
//   - Threshold ranges / color zones (Normal, Warning, Critical) on track and pointer
//   - Target goal marker (Power BI feature)
//   - High-contrast IBM Carbon typography (Plex Mono readout + unit)
//   - Logic binding, actions (setValue, setTarget), and On Threshold Crossed events
//   - Export to CSV, Excel (.xlsx), and PNG
import { html, css } from "../../../nexa-sdk/nexa-component-sdk.js";
import { PREFIX, defineUI } from "../core.js";
import { chartCommon, opt, NOTATIONS, DECIMALS, notationOf, numOr } from "./core.js";
import { xlsxBlob } from "./export.js";
import { ChartElement } from "./core.js";

const common = chartCommon;

const GAUGE_CSS = css`
    .gauge-container {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: var(--panel, #181b1f);
        border: 1px solid var(--bd, #2c3235);
        border-radius: var(--r, 4px);
        box-sizing: border-box;
    }
    .plot {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .gauge-title {
        position: absolute;
        top: 8px;
        left: 12px;
        font-size: 11px;
        font-weight: 500;
        color: var(--fg-muted, #a0aec0);
        letter-spacing: 0.02em;
        pointer-events: none;
        z-index: 2;
    }
`;

const THRESHOLD_FIELDS = {
    label: { type: "string", label: "Label", default: "Normal" },
    value: { type: "number", label: "Upper value", default: 60 },
    color: { type: "color", label: "Colour", default: "#10b981" }
};

function defaultThresholds() {
    return [
        { label: "Normal", value: 60, color: "#10b981" },
        { label: "Warning", value: 85, color: "#f59e0b" },
        { label: "Critical", value: 100, color: "#ef4444" }
    ];
}

export class GaugeElement extends ChartElement {
    static styles = [...ChartElement.styles, GAUGE_CSS];

    _lastVal = 0;
    _lastZoneIndex = -1;

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
        return s;
    }

    _thresholdList() {
        const raw = Array.isArray(this.p && this.p.thresholds) ? this.p.thresholds : defaultThresholds();
        return raw.slice().sort((a, b) => numOr(a.value, 0) - numOr(b.value, 0));
    }

    _activeZone(val) {
        const list = this._thresholdList();
        for (let i = 0; i < list.length; i++) {
            if (val <= numOr(list[i].value, Infinity)) {
                return { zone: list[i], index: i };
            }
        }
        const last = list[list.length - 1];
        return { zone: last || null, index: list.length - 1 };
    }

    prepareData() {
        const v = numOr(this.p && this.p.value, 0);
        const { zone, index } = this._activeZone(v);
        if (this._lastZoneIndex !== -1 && this._lastZoneIndex !== index && zone) {
            this.emit("thresholdCrossed", { value: v, threshold: zone.label, color: zone.color });
        }
        this._lastZoneIndex = index;
        this._lastVal = v;
    }

    draw() {
        if (!this.ctx || !this.canvas) return;
        const { w, h } = this._layoutSize();
        if (w <= 0 || h <= 0) return;

        const ctx = this.ctx;
        this._clearCanvas(ctx, w, h);

        const mode = (this.p && this.p.mode) || "radial";
        if (mode === "linear") {
            this._drawLinear(w, h);
        } else {
            this._drawRadial(w, h);
        }
    }

    _drawRadial(w, h) {
        const ctx = this.ctx;
        const colors = this._colors();

        const min = numOr(this.p && this.p.min, 0);
        const max = Math.max(min + 0.001, numOr(this.p && this.p.max, 100));
        let val = numOr(this.p && this.p.value, 0);
        if (this.p && this.p.softMax && val > max) val = max;
        if (this.p && this.p.softMin && val < min) val = min;

        const frac = Math.max(0, Math.min(1, (val - min) / (max - min)));

        const arcDeg = numOr(this.p && this.p.arcAngle, 240);
        const startDeg = numOr(this.p && this.p.startAngle, 150);
        const startRad = (startDeg * Math.PI) / 180;
        const arcRad = (arcDeg * Math.PI) / 180;
        const endRad = startRad + arcRad;
        const valRad = startRad + frac * arcRad;

        const cx = w / 2;
        // Position center slightly lower for half/wide gauges
        const cy = arcDeg <= 200 ? h * 0.72 : (arcDeg <= 270 ? h * 0.55 : h / 2);
        const pad = Math.min(w, h) * 0.12;
        const R = Math.max(24, Math.min(cx, cy) - pad);
        const thickness = Math.max(4, Math.min(36, numOr(this.p && this.p.thickness, 16)));

        const thList = this._thresholdList();
        const { zone } = this._activeZone(val);
        const colorMode = (this.p && this.p.colorMode) || "zones";
        const pointerType = (this.p && this.p.pointerType) || "needleAndArc";

        // 1. Draw Background Track or Threshold Zones
        if (colorMode === "zones" && thList.length) {
            // Draw discrete colored zones on the track
            let prevRad = startRad;
            thList.forEach((th) => {
                const thVal = Math.min(max, Math.max(min, numOr(th.value, max)));
                const thFrac = (thVal - min) / (max - min);
                const thEndRad = startRad + thFrac * arcRad;

                if (thEndRad > prevRad) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(cx, cy, R, prevRad, thEndRad);
                    ctx.strokeStyle = this.hexToRgba(th.color, 0.28);
                    ctx.lineWidth = thickness;
                    ctx.lineCap = "butt";
                    ctx.stroke();
                    ctx.restore();
                    prevRad = thEndRad;
                }
            });
            // If zones didn't reach max
            if (prevRad < endRad) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, R, prevRad, endRad);
                ctx.strokeStyle = colors.grid;
                ctx.lineWidth = thickness;
                ctx.stroke();
                ctx.restore();
            }
        } else {
            // Solid subtle background track
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, R, startRad, endRad);
            ctx.strokeStyle = colors.grid;
            ctx.lineWidth = thickness;
            ctx.lineCap = "round";
            ctx.stroke();
            ctx.restore();
        }

        // 2. Active Arc / Progress Bar Fill
        if (pointerType === "arc" || pointerType === "needleAndArc") {
            const activeColor = colorMode === "threshold" && zone ? zone.color : (this.p.needleColor || colors.accent);
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, R, startRad, valRad);
            ctx.strokeStyle = activeColor;
            ctx.lineWidth = thickness;
            ctx.lineCap = "round";
            ctx.stroke();
            ctx.restore();
        }

        // 3. Ticks and Min/Max scale
        if (this.p && this.p.showTicks !== false) {
            const tickCount = Math.max(2, numOr(this.p && this.p.tickCount, 5));
            for (let i = 0; i <= tickCount; i++) {
                const tFrac = i / tickCount;
                const tRad = startRad + tFrac * arcRad;
                const innerR = R - thickness / 2 - 2;
                const outerR = innerR - 6;
                const x1 = cx + Math.cos(tRad) * innerR;
                const y1 = cy + Math.sin(tRad) * innerR;
                const x2 = cx + Math.cos(tRad) * outerR;
                const y2 = cy + Math.sin(tRad) * outerR;

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = colors.text;
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.restore();
            }
        }

        // Min & Max Labels
        if (this.p && this.p.showMinMax !== false) {
            ctx.save();
            ctx.font = `10px ${colors.font || "sans-serif"}`;
            ctx.fillStyle = colors.text;

            const startX = cx + Math.cos(startRad) * (R - thickness / 2 - 14);
            const startY = cy + Math.sin(startRad) * (R - thickness / 2 - 14);
            ctx.textAlign = Math.cos(startRad) >= 0 ? "left" : "right";
            ctx.textBaseline = "middle";
            ctx.fillText(this._fmtVal(min), startX, startY);

            const endX = cx + Math.cos(endRad) * (R - thickness / 2 - 14);
            const endY = cy + Math.sin(endRad) * (R - thickness / 2 - 14);
            ctx.textAlign = Math.cos(endRad) >= 0 ? "left" : "right";
            ctx.fillText(this._fmtVal(max), endX, endY);
            ctx.restore();
        }

        // 4. Target Marker (Power BI Feature)
        if (this.p && this.p.showTarget) {
            const targetVal = numOr(this.p.targetValue, (min + max) / 2);
            const tFrac = Math.max(0, Math.min(1, (targetVal - min) / (max - min)));
            const tRad = startRad + tFrac * arcRad;
            const tIn = R - thickness / 2 - 3;
            const tOut = R + thickness / 2 + 5;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(tRad) * tIn, cy + Math.sin(tRad) * tIn);
            ctx.lineTo(cx + Math.cos(tRad) * tOut, cy + Math.sin(tRad) * tOut);
            ctx.strokeStyle = this.p.targetColor || "#3b82f6";
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.restore();
        }

        // 5. Needle (Jarum Penunjuk)
        if (pointerType === "needle" || pointerType === "needleAndArc") {
            const needleColor = this.p && this.p.needleColor ? this.p.needleColor : (colorMode === "threshold" && zone ? zone.color : colors.strong);
            const nLen = R * Math.min(1.0, Math.max(0.4, numOr(this.p && this.p.needleLength, 0.82)));
            const nWidth = Math.max(1, numOr(this.p && this.p.needleWidth, 3));

            const tipX = cx + Math.cos(valRad) * nLen;
            const tipY = cy + Math.sin(valRad) * nLen;

            const perpRad = valRad + Math.PI / 2;
            const baseL_X = cx + Math.cos(perpRad) * nWidth;
            const baseL_Y = cy + Math.sin(perpRad) * nWidth;
            const baseR_X = cx - Math.cos(perpRad) * nWidth;
            const baseR_Y = cy - Math.sin(perpRad) * nWidth;
            const tailX = cx - Math.cos(valRad) * (nWidth * 3);
            const tailY = cy - Math.sin(valRad) * (nWidth * 3);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(baseL_X, baseL_Y);
            ctx.lineTo(tipX, tipY);
            ctx.lineTo(baseR_X, baseR_Y);
            ctx.closePath();

            ctx.fillStyle = needleColor;
            ctx.shadowColor = "rgba(0,0,0,0.4)";
            ctx.shadowBlur = 4;
            ctx.fill();

            // Center pivot cap
            if (this.p && this.p.needleCap !== false) {
                const capSize = Math.max(4, numOr(this.p.needleCapSize, 10));
                ctx.beginPath();
                ctx.arc(cx, cy, capSize / 2, 0, Math.PI * 2);
                ctx.fillStyle = colors.band || "#2c3235";
                ctx.fill();
                ctx.strokeStyle = needleColor;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            ctx.restore();
        }

        // 6. Center / Bottom Digital Readout
        if (this.p && this.p.showReadout !== false) {
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const valStr = this._fmtVal(val);
            const unit = this.p && this.p.unit ? " " + this.p.unit : "";
            const textToDraw = valStr + unit;

            // Scaled font size
            const fs = Math.min(32, Math.max(16, Math.round(R * 0.32)));
            ctx.font = `600 ${fs}px ${colors.font || "sans-serif"}`;
            ctx.fillStyle = colors.strong;

            const textY = arcDeg <= 200 ? cy - R * 0.15 : cy + R * 0.45;
            ctx.fillText(textToDraw, cx, Math.min(h - 14, textY));
            ctx.restore();
        }
    }

    _drawLinear(w, h) {
        const ctx = this.ctx;
        const colors = this._colors();
        const orientation = (this.p && this.p.orientation) || "horizontal";
        const isHoriz = orientation === "horizontal";

        const min = numOr(this.p && this.p.min, 0);
        const max = Math.max(min + 0.001, numOr(this.p && this.p.max, 100));
        let val = numOr(this.p && this.p.value, 0);
        if (this.p && this.p.softMax && val > max) val = max;
        if (this.p && this.p.softMin && val < min) val = min;

        const frac = Math.max(0, Math.min(1, (val - min) / (max - min)));

        const thList = this._thresholdList();
        const { zone } = this._activeZone(val);
        const colorMode = (this.p && this.p.colorMode) || "zones";

        if (isHoriz) {
            // Horizontal Bar
            const padX = 24, padY = h / 2;
            const barW = Math.max(40, w - padX * 2);
            const barH = Math.max(8, Math.min(32, numOr(this.p && this.p.thickness, 18)));
            const barX = padX;
            const barY = padY - barH / 2;

            // 1. Background / Zones
            if (colorMode === "zones" && thList.length) {
                let curX = barX;
                thList.forEach((th) => {
                    const thVal = Math.min(max, Math.max(min, numOr(th.value, max)));
                    const thFrac = (thVal - min) / (max - min);
                    const thEndX = barX + thFrac * barW;
                    const segW = thEndX - curX;
                    if (segW > 0) {
                        ctx.fillStyle = this.hexToRgba(th.color, 0.25);
                        ctx.fillRect(curX, barY, segW, barH);
                        curX = thEndX;
                    }
                });
            } else {
                ctx.fillStyle = colors.grid;
                ctx.fillRect(barX, barY, barW, barH);
            }

            // 2. Active Fill
            const fillW = frac * barW;
            const activeColor = colorMode === "threshold" && zone ? zone.color : (this.p.needleColor || colors.accent);
            ctx.fillStyle = activeColor;
            ctx.fillRect(barX, barY, fillW, barH);

            // Bar Border
            ctx.strokeStyle = colors.band || "#3e444a";
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barW, barH);

            // 3. Target Line
            if (this.p && this.p.showTarget) {
                const targetVal = numOr(this.p.targetValue, (min + max) / 2);
                const tFrac = Math.max(0, Math.min(1, (targetVal - min) / (max - min)));
                const tx = barX + tFrac * barW;
                ctx.strokeStyle = this.p.targetColor || "#3b82f6";
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(tx, barY - 4);
                ctx.lineTo(tx, barY + barH + 4);
                ctx.stroke();
            }

            // 4. Pointer Marker (Notch)
            const pointerX = barX + fillW;
            ctx.fillStyle = activeColor;
            ctx.beginPath();
            ctx.moveTo(pointerX, barY + barH + 2);
            ctx.lineTo(pointerX - 5, barY + barH + 9);
            ctx.lineTo(pointerX + 5, barY + barH + 9);
            ctx.closePath();
            ctx.fill();

            // 5. Min / Max / Readout
            ctx.font = `11px ${colors.font || "sans-serif"}`;
            ctx.fillStyle = colors.text;
            ctx.textAlign = "left";
            ctx.fillText(this._fmtVal(min), barX, barY - 8);
            ctx.textAlign = "right";
            ctx.fillText(this._fmtVal(max), barX + barW, barY - 8);

            if (this.p && this.p.showReadout !== false) {
                ctx.textAlign = "center";
                ctx.font = `600 16px ${colors.font || "sans-serif"}`;
                ctx.fillStyle = colors.strong;
                ctx.fillText(this._fmtVal(val) + (this.p.unit ? " " + this.p.unit : ""), barX + barW / 2, barY - 8);
            }
        } else {
            // Vertical Bar (Tank / Thermometer)
            const padY = 24, padX = w / 2;
            const barH = Math.max(40, h - padY * 2);
            const barW = Math.max(8, Math.min(32, numOr(this.p && this.p.thickness, 18)));
            const barX = padX - barW / 2;
            const barY = padY;

            // Background
            ctx.fillStyle = colors.grid;
            ctx.fillRect(barX, barY, barW, barH);

            // Active fill from bottom up
            const fillH = frac * barH;
            const fillY = barY + barH - fillH;
            const activeColor = colorMode === "threshold" && zone ? zone.color : (this.p.needleColor || colors.accent);
            ctx.fillStyle = activeColor;
            ctx.fillRect(barX, fillY, barW, fillH);

            // Border
            ctx.strokeStyle = colors.band || "#3e444a";
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barW, barH);

            // Readout
            if (this.p && this.p.showReadout !== false) {
                ctx.font = `600 13px ${colors.font || "sans-serif"}`;
                ctx.fillStyle = colors.strong;
                ctx.textAlign = "center";
                ctx.fillText(this._fmtVal(val) + (this.p.unit ? " " + this.p.unit : ""), padX, h - 8);
            }
        }
    }

    // ---- Logic Actions ---------------------------------------------------------------------
    setValue(params) {
        let v = typeof params === "number" ? params : (params && typeof params === "object" ? params.value : 0);
        v = numOr(v, 0);
        if (this.p) this.p.value = v;
        this.prepareData();
        if (this.resizeCanvas()) this.draw();
        this.requestUpdate();
        this.emit("change", { value: v, unit: this.p && this.p.unit ? this.p.unit : "" });
    }

    setTarget(params) {
        let t = typeof params === "number" ? params : (params && typeof params === "object" ? params.target : 0);
        if (this.p) this.p.targetValue = numOr(t, 0);
        this.scheduleDraw();
        this.requestUpdate();
    }

    exportData(format) {
        const fmt = (format || "csv").toLowerCase();
        const min = numOr(this.p && this.p.min, 0);
        const max = numOr(this.p && this.p.max, 100);
        const val = numOr(this.p && this.p.value, 0);
        const unit = this.p && this.p.unit ? this.p.unit : "";
        const title = this._exportTitle() || "Gauge";
        const { zone } = this._activeZone(val);

        const header = ["Metric", "Value", "Unit", "Min", "Max", "Threshold", "Target"];
        const rows = [
            [title, val, unit, min, max, zone ? zone.label : "", this.p && this.p.showTarget ? this.p.targetValue : ""]
        ];

        let blob;
        if (fmt === "xlsx") {
            blob = xlsxBlob(header, rows, false, { textCols: [0, 2, 5] });
        } else if (fmt === "png") {
            if (this.canvas) {
                this.canvas.toBlob((b) => {
                    const name = this._getExportFileName("png", "all");
                    this._download(b, name);
                    this._lastExport = { name, blob: b, rows: 1 };
                });
                return 1;
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
            this._lastExport = { name, blob, rows: 1 };
        }
        return 1;
    }

    render() {
        const title = this.p && this.p.title ? this.p.title : "";
        return html`
            <div class="gauge-container" part="gauge">
                ${title ? html`<div class="gauge-title">${title}</div>` : ""}
                <div class="plot">
                    <canvas></canvas>
                    <div class="corner" style="right: 10px; top: 8px;">
                        ${this._renderMenu()}
                    </div>
                </div>
            </div>
        `;
    }
}

export const gauge = defineUI({
    ...common,
    id: PREFIX + "gauge",
    label: "Gauge & Meter",
    icon: "fa fa-dashboard",
    size: { w: 320, h: 240 },
    help: "Industrial radial dial and linear bar gauge with customizable needle, min/max bounds, threshold warning zones, target goal marker, and live tag binding.",
    version: 1,

    groups: ["Gauge", "Pointer & Needle", "Thresholds & Zones", "Target Goal", "Scale & Readout", "Export", "Style", "Behaviour"],

    properties: {
        mode: {
            type: "enum", group: "Gauge", label: "Mode", default: "radial",
            options: opt([["radial", "Radial (dial / speedometer)"], ["linear", "Linear (bar meter)"]]),
            help: "Radial displays a circular dial; Linear displays a horizontal or vertical bar."
        },
        orientation: {
            type: "enum", group: "Gauge", label: "Bar orientation", default: "horizontal",
            options: opt([["horizontal", "Horizontal"], ["vertical", "Vertical"]]),
            visibleWhen: (p) => p.mode === "linear"
        },
        arcAngle: {
            type: "number", group: "Gauge", label: "Dial sweep angle", default: 240,
            min: 90, max: 360, step: 15, unit: "°",
            visibleWhen: (p) => (p.mode || "radial") === "radial",
            help: "Total arc sweep in degrees: 180° = semi-circle, 240° = standard gauge, 270° = wide dial, 360° = full circle."
        },
        startAngle: {
            type: "number", group: "Gauge", label: "Start angle", default: 150,
            min: -360, max: 360, step: 15, unit: "°",
            visibleWhen: (p) => (p.mode || "radial") === "radial",
            help: "Start angle in degrees (150° with 240° sweep starts at bottom-left and ends at bottom-right)."
        },
        thickness: {
            type: "number", group: "Gauge", label: "Track thickness", default: 16,
            min: 4, max: 48, step: 2, unit: "px"
        },

        // ---- Value & Bounds ----
        value: {
            type: "number", group: "Gauge", label: "Value", default: 0,
            help: "Current gauge reading. Can be bound to a tag or variable."
        },
        min: { type: "number", group: "Gauge", label: "Min (batas bawah)", default: 0 },
        max: { type: "number", group: "Gauge", label: "Max (batas atas)", default: 100 },
        softMin: { type: "boolean", group: "Gauge", label: "Soft min (auto-expand below)", default: false },
        softMax: { type: "boolean", group: "Gauge", label: "Soft max (auto-expand above)", default: false },
        unit: { type: "string", group: "Gauge", label: "Unit", default: "", help: "Unit displayed alongside the value (e.g. °C, bar, rpm, kW, %)." },
        title: { type: "string", group: "Gauge", label: "Title", default: "", help: "Gauge header label." },

        // ---- Pointer & Needle ----
        pointerType: {
            type: "enum", group: "Pointer & Needle", label: "Pointer style", default: "needleAndArc",
            options: opt([
                ["needleAndArc", "Needle + Filled track (Combo)"],
                ["needle", "Needle only (classic dial)"],
                ["arc", "Filled arc / progress only"]
            ]),
            help: "How the current value is indicated."
        },
        needleColor: {
            type: "color", group: "Pointer & Needle", label: "Needle / pointer colour", default: "",
            help: "Custom pointer colour. Leave empty to use theme accent or active threshold colour."
        },
        needleWidth: {
            type: "number", group: "Pointer & Needle", label: "Needle thickness", default: 3,
            min: 1, max: 10, step: 0.5, unit: "px",
            visibleWhen: (p) => p.pointerType === "needle" || p.pointerType === "needleAndArc"
        },
        needleLength: {
            type: "number", group: "Pointer & Needle", label: "Needle length ratio", default: 0.82,
            min: 0.4, max: 1.0, step: 0.05,
            visibleWhen: (p) => p.pointerType === "needle" || p.pointerType === "needleAndArc"
        },
        needleCap: {
            type: "boolean", group: "Pointer & Needle", label: "Needle center pivot cap", default: true,
            visibleWhen: (p) => (p.mode || "radial") === "radial" && (p.pointerType === "needle" || p.pointerType === "needleAndArc")
        },
        needleCapSize: {
            type: "number", group: "Pointer & Needle", label: "Pivot cap size", default: 10,
            min: 4, max: 24, step: 2, unit: "px",
            visibleWhen: (p) => (p.mode || "radial") === "radial" && p.needleCap !== false
        },

        // ---- Thresholds & Zones ----
        colorMode: {
            type: "enum", group: "Thresholds & Zones", label: "Colour mode", default: "zones",
            options: opt([
                ["zones", "Color zones on track (green / amber / red)"],
                ["threshold", "Pointer adopts active threshold colour"],
                ["solid", "Solid (theme accent)"]
            ])
        },
        thresholds: {
            type: "list", group: "Thresholds & Zones", label: "Threshold zones", noun: "zone",
            default: defaultThresholds(),
            item: {
                noun: "zone",
                fields: THRESHOLD_FIELDS
            }
        },

        // ---- Target Goal (Power BI) ----
        showTarget: { type: "boolean", group: "Target Goal", label: "Show target goal marker", default: false },
        targetValue: {
            type: "number", group: "Target Goal", label: "Target value", default: 75,
            visibleWhen: (p) => p.showTarget === true
        },
        targetColor: {
            type: "color", group: "Target Goal", label: "Target marker colour", default: "#3b82f6",
            visibleWhen: (p) => p.showTarget === true
        },

        // ---- Scale & Readout ----
        showReadout: { type: "boolean", group: "Scale & Readout", label: "Show digital readout", default: true },
        showMinMax: { type: "boolean", group: "Scale & Readout", label: "Show min & max labels", default: true },
        showTicks: { type: "boolean", group: "Scale & Readout", label: "Show tick marks", default: true },
        tickCount: { type: "number", group: "Scale & Readout", label: "Major tick count", default: 5, min: 2, max: 20, step: 1 },
        notation: { type: "enum", group: "Scale & Readout", label: "Notation", default: "standard", options: opt(NOTATIONS) },
        decimals: { type: "enum", group: "Scale & Readout", label: "Decimals", default: "auto", options: opt(DECIMALS) },

        // ---- Export ----
        exportButton: { type: "boolean", group: "Export", label: "Export menu on the chart (⋮)", default: true },
        exportCsv: { type: "boolean", group: "Export", label: "Menu: CSV", default: true, visibleWhen: (p) => p.exportButton !== false },
        exportXlsx: { type: "boolean", group: "Export", label: "Menu: Excel", default: true, visibleWhen: (p) => p.exportButton !== false },
        exportPng: { type: "boolean", group: "Export", label: "Menu: PNG", default: true, visibleWhen: (p) => p.exportButton !== false },
        exportTitle: { type: "string", group: "Export", label: "Title", default: "", help: "Title in export files; {title} in filename." },
        exportFilename: { type: "string", group: "Export", label: "File name expression", default: "", bindable: false }
    },

    actions: {
        setValue: {
            label: "Set value",
            help: "Sets the gauge value directly or from a payload object { value }.",
            example: "{\n  \"value\": 78.5\n}"
        },
        setTarget: {
            label: "Set target goal",
            help: "Updates the target goal value.",
            example: "{\n  \"target\": 80\n}"
        },
        exportData: {
            label: "Export",
            help: "Downloads data in CSV, Excel (.xlsx) or PNG format.",
            example: "{\n  \"format\": \"csv\"\n}"
        }
    },

    events: {
        change: {
            label: "On Value Change",
            payload: { value: "number", unit: "string", threshold: "string" },
            help: "Fired when the gauge value updates."
        },
        thresholdCrossed: {
            label: "On Threshold Crossed",
            payload: { value: "number", threshold: "string", color: "string" },
            help: "Fired when the value enters a new warning or critical threshold zone."
        }
    },

    view: GaugeElement
});
