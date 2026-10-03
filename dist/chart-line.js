import { html, css } from "../../nexa-sdk/nexa-component-sdk.js";
import {
    PREFIX,
    BASE_CSS,
    UIElement,
    CSS_GROUP,
    paletteProp,
    part, defineUI
} from "./core.js";

export const CATEGORY_CHART = "UI · Charts";

const CAPS = {
    resizable: true,
    rotatable: false,
    flippable: false,
    lockable: true
};

const common = {
    category: CATEGORY_CHART,
    capabilities: CAPS,
    css: ""
};

const SAMPLE_DATA = [

];

const LINE_CHART_CSS = css`
    :host {
        display: block;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        user-select: none;
        box-sizing: border-box;
    }

    .chart-container {
        position: relative;
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        background: var(--panel, #181b1f);
        border: 1px solid var(--bd, #2c3235);
        border-radius: var(--r, 4px);
        box-sizing: border-box;
        cursor: crosshair;
        touch-action: none;
    }

    .chart-container.hover-comb {
        cursor: ew-resize;
    }

    .chart-container.dragging {
        cursor: grabbing !important;
    }

    .chart-container.scrubbing {
        cursor: ew-resize !important;
    }

    canvas {
        display: block;
        width: 100%;
        height: 100%;
    }

    .empty {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--fg-subtle, #8e8e8e);
        font-size: var(--fs-label, 12px);
        pointer-events: none;
        gap: 6px;
    }

    .tooltip {
        position: absolute;
        pointer-events: none;
        background: #181b1f;
        color: #fff;
        border: 1px solid var(--bd, #3e444a);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        border-radius: 4px;
        padding: 8px 12px;
        font-size: 11px;
        line-height: 1.4;
        white-space: nowrap;
        z-index: 10;
        transform: translate(12px, -50%);
        font-family: var(--nexa-fonts-mono, monospace);
        display: none;
    }

    .tooltip-time {
        color: #a0aec0;
        font-size: 10px;
        margin-bottom: 4px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 3px;
    }

    .tooltip-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .tooltip-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .tooltip-val {
        font-weight: 600;
        color: #fff;
    }

    .btn-reset-zoom {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 5;
        background: rgba(30, 34, 40, 0.9);
        color: #cbd5e1;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        padding: 4px 9px;
        font-size: 10px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
        transition: all 0.15s ease;
        font-family: var(--nexa-fonts-mono, monospace);
    }

    .btn-reset-zoom:hover {
        background: rgba(50, 56, 65, 0.98);
        color: #fff;
        border-color: rgba(255, 255, 255, 0.35);
    }

    .live-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #10b981;
        display: inline-block;
        box-shadow: 0 0 6px #10b981;
    }
`;

// =============================================================================
// Zero-GC Time Series Ring Buffer (TypedArray Float64)
// =============================================================================

// Every point kept, in time order, up to `capacity` (then the oldest go). Float64 for x AND y:
// a value is shown as it came (no Float32 rounding: 23.4 stays 23.4, a counter past 16 M stays exact).
// 16 bytes a point: 1 M points = 16 MB.
class TimeSeriesRingBuffer {
    constructor(capacity = 10000) {
        this.capacity = Math.max(50, capacity);
        this.x = new Float64Array(this.capacity);
        this.y = new Float64Array(this.capacity);
        this.head = 0;
        this.count = 0;
    }

    // the physical slot of the i-th point (0 = the oldest)
    _at(i) {
        return (this.head - this.count + i + this.capacity) % this.capacity;
    }

    setCapacity(newCapacity) {
        newCapacity = Math.max(50, newCapacity);
        if (newCapacity === this.capacity) return;
        const newX = new Float64Array(newCapacity);
        const newY = new Float64Array(newCapacity);
        const n = Math.min(this.count, newCapacity);
        const skip = this.count - n;              // smaller: the NEWEST n stay
        for (let i = 0; i < n; i++) {
            const oldIdx = this._at(skip + i);
            newX[i] = this.x[oldIdx];
            newY[i] = this.y[oldIdx];
        }
        this.x = newX;
        this.y = newY;
        this.capacity = newCapacity;
        this.head = n % newCapacity;
        this.count = n;
    }

    clear() {
        this.head = 0;
        this.count = 0;
    }

    /**
     * Adds a point where its time belongs. In order (the usual case): O(1). Late (a reconnect,
     * a batch sent out of order): moved into place, O(points after it). The same sample twice
     * in a row (the same x and y as the newest) is one point. -> whether it was added.
     */
    push(x, y) {
        if (this.count > 0) {
            const lastIdx = this._at(this.count - 1);
            const lastX = this.x[lastIdx];
            if (x === lastX && y === this.y[lastIdx]) return false;
            if (x < lastX) return this._insert(x, y);
        }
        this.x[this.head] = x;
        this.y[this.head] = y;
        this.head = (this.head + 1) % this.capacity;
        if (this.count < this.capacity) this.count++;
        return true;
    }

    _insert(x, y) {
        // the first point later than x (equal times keep their arrival order)
        let lo = 0, hi = this.count;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.x[this._at(mid)] <= x) lo = mid + 1; else hi = mid;
        }
        if (this.count === this.capacity) {
            // full: the oldest goes; older than everything kept = it would go at once
            if (lo === 0) return false;
            // dropping the oldest = one step of the ring; the insert point moves one back
            this.head = (this.head + 1) % this.capacity;
            lo--;
        } else {
            this.head = (this.head + 1) % this.capacity;
            this.count++;
        }
        // only the points after it move one slot on (a late point is near the end: few moves)
        for (let i = this.count - 1; i > lo; i--) {
            const to = this._at(i), from = this._at(i - 1);
            this.x[to] = this.x[from];
            this.y[to] = this.y[from];
        }
        const at = this._at(lo);
        this.x[at] = x;
        this.y[at] = y;
        return true;
    }

    /** Replaces everything with `arr` ([{x, y}], any order): the newest `capacity` points kept. */
    loadArray(arr, xField = "x", yField = "y") {
        this.clear();
        if (!Array.isArray(arr) || !arr.length) return;
        const xs = [], ys = [];
        let sorted = true;
        for (let i = 0; i < arr.length; i++) {
            const item = arr[i];
            if (!item || typeof item !== "object") continue;
            const x = Number(item[xField]);
            const y = Number(item[yField]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (xs.length && x < xs[xs.length - 1]) sorted = false;
            xs.push(x);
            ys.push(y);
        }
        let order = null;
        if (!sorted) {
            order = xs.map((_, i) => i);
            order.sort((a, b) => xs[a] - xs[b] || a - b);
        }
        const n = xs.length;
        const start = n > this.capacity ? n - this.capacity : 0;
        for (let k = start; k < n; k++) {
            const i = order ? order[k] : k;
            this.x[this.head] = xs[i];
            this.y[this.head] = ys[i];
            this.head = (this.head + 1) % this.capacity;
            this.count++;
        }
    }

    getX(i) {
        return this.x[this._at(i)];
    }

    getY(i) {
        return this.y[this._at(i)];
    }

    /** The time span held: O(1) (the points are in order). */
    getBounds() {
        if (this.count === 0) return null;
        return { minX: this.getX(0), maxX: this.getX(this.count - 1) };
    }

    findClosestIndex(targetX) {
        if (this.count === 0) return -1;
        let lo = 0;
        let hi = this.count - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const midX = this.getX(mid);
            if (midX < targetX) lo = mid + 1;
            else if (midX > targetX) hi = mid - 1;
            else return mid;
        }
        if (lo >= this.count) return this.count - 1;
        if (lo === 0) return 0;
        const prev = lo - 1;
        return Math.abs(this.getX(prev) - targetX) < Math.abs(this.getX(lo) - targetX) ? prev : lo;
    }
}

// Binary search on ring buffer
function lowerBoundRing(buf, targetX) {
    let lo = 0;
    let hi = buf.count;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (buf.getX(mid) < targetX) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function upperBoundRing(buf, targetX) {
    let lo = 0;
    let hi = buf.count;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (buf.getX(mid) <= targetX) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

// =============================================================================
// Zero-GC M4 Decimator with Pre-allocated Scratch Buffers
// =============================================================================

class M4Decimator {
    constructor(initialPixelWidth = 2048) {
        this.alloc(initialPixelWidth);
    }

    alloc(size) {
        this.size = Math.max(128, size);
        this.first = new Int32Array(this.size);
        this.last = new Int32Array(this.size);
        this.minIdx = new Int32Array(this.size);
        this.maxIdx = new Int32Array(this.size);
        this.minVal = new Float64Array(this.size);
        this.maxVal = new Float64Array(this.size);
        this.outX = new Float64Array(this.size * 4);
        this.outY = new Float64Array(this.size * 4);
    }

    decimate(buf, startIdx, endIdx, pixelWidth, vMinX, vMaxX) {
        if (startIdx >= endIdx || buf.count === 0) return 0;
        const count = endIdx - startIdx;
        if (count <= 0) return 0;

        if (pixelWidth > this.size) {
            this.alloc(Math.max(pixelWidth, this.size * 2));
        }

        const pw = Math.max(1, pixelWidth);

        // When points are few, copy directly
        if (count <= pw * 2) {
            let outCount = 0;
            for (let i = startIdx; i < endIdx; i++) {
                this.outX[outCount] = buf.getX(i);
                this.outY[outCount] = buf.getY(i);
                outCount++;
            }
            return outCount;
        }

        const range = vMaxX - vMinX || 1;
        this.first.fill(-1, 0, pw);
        this.minVal.fill(Infinity, 0, pw);
        this.maxVal.fill(-Infinity, 0, pw);

        for (let i = startIdx; i < endIdx; i++) {
            const x = buf.getX(i);
            const y = buf.getY(i);
            let px = Math.floor(((x - vMinX) / range) * pw);
            if (px < 0) px = 0;
            else if (px >= pw) px = pw - 1;

            if (this.first[px] === -1) {
                this.first[px] = i;
                this.last[px] = i;
                this.minIdx[px] = i;
                this.maxIdx[px] = i;
                this.minVal[px] = y;
                this.maxVal[px] = y;
            } else {
                this.last[px] = i;
                if (y < this.minVal[px]) {
                    this.minVal[px] = y;
                    this.minIdx[px] = i;
                }
                if (y > this.maxVal[px]) {
                    this.maxVal[px] = y;
                    this.maxIdx[px] = i;
                }
            }
        }

        let outCount = 0;
        let prevIdx = -1;

        for (let px = 0; px < pw; px++) {
            const f = this.first[px];
            if (f === -1) continue;

            const mn = this.minIdx[px];
            const mx = this.maxIdx[px];
            const l = this.last[px];

            let a = f, b = mn, c = mx, d = l;
            if (a > b) { const t = a; a = b; b = t; }
            if (c > d) { const t = c; c = d; d = t; }
            if (a > c) { const t = a; a = c; c = t; }
            if (b > d) { const t = b; b = d; d = t; }
            if (b > c) { const t = b; b = c; c = t; }

            // first / min / max / last of the column, in time order, each once (no array per pixel)
            if (a !== prevIdx) { this.outX[outCount] = buf.getX(a); this.outY[outCount] = buf.getY(a); outCount++; prevIdx = a; }
            if (b !== prevIdx) { this.outX[outCount] = buf.getX(b); this.outY[outCount] = buf.getY(b); outCount++; prevIdx = b; }
            if (c !== prevIdx) { this.outX[outCount] = buf.getX(c); this.outY[outCount] = buf.getY(c); outCount++; prevIdx = c; }
            if (d !== prevIdx) { this.outX[outCount] = buf.getX(d); this.outY[outCount] = buf.getY(d); outCount++; prevIdx = d; }
        }

        return outCount;
    }
}

// =============================================================================
// Time Comb & Axis Snapping Helpers
// =============================================================================

const TIME_STEPS = [
    10, 20, 50, 100, 200, 500,
    1000, 2000, 5000, 10000, 15000, 30000,
    60000, 120000, 300000, 600000, 900000, 1800000,
    3600000, 7200000, 10800000, 21600000, 43200000,
    86400000, 172800000, 604800000, 1209600000,
    2592000000, 7776000000, 31536000000
];

function getNiceTimeStep(spanMs, targetTicks) {
    const rawStep = spanMs / Math.max(1, targetTicks);
    for (let i = 0; i < TIME_STEPS.length; i++) {
        if (TIME_STEPS[i] >= rawStep) {
            return TIME_STEPS[i];
        }
    }
    return TIME_STEPS[TIME_STEPS.length - 1];
}

function parseTimeWindow(tw) {
    if (!tw || tw === "auto") return 0;
    const match = String(tw).match(/^(\d+)([smhdMy])$/);
    if (!match) return 0;
    const val = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === "s") return val * 1000;
    if (unit === "m") return val * 60000;
    if (unit === "h") return val * 3600000;
    if (unit === "d") return val * 86400000;
    if (unit === "M") return val * 30 * 86400000;
    if (unit === "y") return val * 365 * 86400000;
    return 0;
}

function formatCombTick(ts, spanMs, stepMs) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => (n < 10 ? "0" + n : String(n));

    if (spanMs > 86400000 * 3) {
        return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    if (stepMs < 1000) {
        const ms = d.getMilliseconds();
        const padMs = ms < 10 ? "00" + ms : ms < 100 ? "0" + ms : String(ms);
        return `${pad(d.getSeconds())}.${padMs}`;
    }
    if (stepMs >= 60000) {
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatTooltipTime(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    const pad = (n) => (n < 10 ? "0" + n : String(n));
    const padMs = (n) => (n < 10 ? "00" + n : n < 100 ? "0" + n : String(n));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${padMs(d.getMilliseconds())}`;
}

function niceNum(range, round) {
    const exponent = Math.floor(Math.log10(range));
    const fraction = range / Math.pow(10, exponent);
    let niceFraction;
    if (round) {
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3) niceFraction = 2;
        else if (fraction < 7) niceFraction = 5;
        else niceFraction = 10;
    } else {
        if (fraction <= 1) niceFraction = 1;
        else if (fraction <= 2) niceFraction = 2;
        else if (fraction <= 5) niceFraction = 5;
        else niceFraction = 10;
    }
    return niceFraction * Math.pow(10, exponent);
}

// =============================================================================
// Nexa Line Chart Component Definition
// =============================================================================

export const lineChart = defineUI({
    ...common,
    id: PREFIX + "line-chart",
    label: "Line Chart",
    icon: "fa fa-line-chart",
    size: { w: 600, h: 320 },
    help: "High-performance zero-GC time-series chart with interactive horizontal time comb, sliding window, and crosshair.",

    inputs: {
        data: { type: "array", label: "Data Array [{x, y}, ...]" },
        point: { type: "object", label: "Append Point {x, y}" }
    },

    properties: {
        data: {
            type: "array",
            default: SAMPLE_DATA,
            group: "Data",
            label: "Default / Initial Data",
            help: "Array of points: [{ x: timestamp, y: number }, ...]"
        },
        xField: {
            type: "string",
            default: "x",
            group: "Data",
            label: "X Field Name"
        },
        yField: {
            type: "string",
            default: "y",
            group: "Data",
            label: "Y Field Name"
        },
        timeWindow: {
            type: "enum",
            default: "auto",
            options: [
                { value: "auto", label: "Auto (Full Data Span)" },
                { value: "30s", label: "Last 30 seconds" },
                { value: "1m", label: "Last 1 minute" },
                { value: "5m", label: "Last 5 minutes" },
                { value: "15m", label: "Last 15 minutes" },
                { value: "30m", label: "Last 30 minutes" },
                { value: "1h", label: "Last 1 hour" },
                { value: "3h", label: "Last 3 hours" },
                { value: "6h", label: "Last 6 hours" },
                { value: "12h", label: "Last 12 hours" },
                { value: "24h", label: "Last 24 hours" },
                { value: "7d", label: "Last 7 days" },
                { value: "14d", label: "Last 14 days" },
                { value: "1M", label: "Last month (30 days)" },
                { value: "2M", label: "Last 2 months (60 days)" },
                { value: "3M", label: "Last 3 months (90 days)" },
                { value: "6M", label: "Last 6 months (180 days)" },
                { value: "1y", label: "Last year (365 days)" },
                { value: "2y", label: "Last 2 years" }
            ],
            group: "Data",
            label: "Time Range (Last X)",
            help: "Sliding live time window (Grafana style). When streaming data arrives, chart follows the latest tail."
        },
        maxPoints: {
            type: "number",
            default: 10000,
            min: 50,
            max: 200000,
            step: 500,
            group: "Data",
            label: "Max Points Retention",
            help: "Points kept in the page (a ring: past it, the oldest go). 16 bytes a point: 1 000 000 points = 16 MB. Every point is kept; the drawing shows them all at pixel accuracy (M4)."
        },
        label: {

            type: "string",
            default: "Metric",
            group: "Data",
            label: "Series Label"
        },
        unit: {
            type: "string",
            default: "",
            group: "Data",
            label: "Unit (e.g. °C, kW, %)"
        },
        colorPalette: paletteProp("primary"),
        lineColor: {
            type: "color",
            default: "",
            group: "Style",
            label: "Line Color Override",
            help: "Leave empty to use the active theme palette color."
        },
        lineWidth: {
            type: "number",
            default: 2,
            min: 0.5,
            max: 8,
            step: 0.5,
            group: "Style",
            label: "Line Width"
        },
        areaFill: {
            type: "boolean",
            default: true,
            group: "Style",
            label: "Area Gradient Fill"
        },
        showGrid: {
            type: "boolean",
            default: true,
            group: "Style",
            label: "Show Grid"
        },
        showPoints: {
            type: "boolean",
            default: false,
            group: "Style",
            label: "Show Point Dots"
        },
        pointRadius: {
            type: "number",
            default: 3,
            min: 1,
            max: 8,
            group: "Style",
            label: "Point Radius"
        },
        showTimeComb: {
            type: "boolean",
            default: true,
            group: "Behaviour",
            label: "Show Time Comb (Scrubber Ruler)",
            help: "Interactive horizontal time ruler at bottom with drag-scrub and wheel-zoom."
        },
        enableZoomPan: {
            type: "boolean",
            default: true,
            group: "Behaviour",
            label: "Enable Zoom & Pan (Wheel & Drag)"
        }
    },

    parts: {
        chart: part("Chart canvas container", "chart")
    },

    // Logic (Update Component): a batch in one call; nothing lost, one redraw
    actions: {
        appendPoints: { label: "Append points", params: { points: "array" }, help: "Adds [{x, y}, ...] (any order) to what the chart holds; returns how many were added." },
        clearPoints: { label: "Clear points", help: "Empties the chart (Default / Initial Data and the Data input load again on their next change)." }
    },

    view: class extends UIElement {
        static styles = [BASE_CSS, LINE_CHART_CSS];

        canvas = null;
        ctx = null;
        resizeObserver = null;
        intersectionObserver = null;
        _lastDpr = 1;
        _rafPending = false;

        // Zero-GC memory structures
        ringBuffer = new TimeSeriesRingBuffer(10000);
        decimator = new M4Decimator(2048);
        lastRawData = null;
        _lastPoint = null;

        // Viewport bounds (null = live auto view)
        viewRange = null;

        // Interaction state
        isScrubbing = false;
        isPanning = false;
        dragStartX = 0;
        dragStartMinX = 0;
        dragStartMaxX = 0;
        isHoverComb = false;

        // Hover / Crosshair state
        hover = null; // { x, y, cursorClientX, cursorClientY }

        firstUpdated(changed) {
            super.firstUpdated?.(changed);
            this.setupCanvas();
            this.setupResizeObserver();
            this.setupIntersectionObserver();
            this.syncCapacity();
            this.prepareData();
            if (this.resizeCanvas()) {
                this.draw();
            }
        }

        connectedCallback() {
            super.connectedCallback();
            if (!this.canvas) this.setupCanvas();
            this.setupResizeObserver();
            this.setupIntersectionObserver();
            this.syncCapacity();
            this.prepareData();
            requestAnimationFrame(() => {
                if (this.resizeCanvas()) {
                    this.draw();
                }
            });
        }

        disconnectedCallback() {
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
                this.resizeObserver = null;
            }
            if (this.intersectionObserver) {
                this.intersectionObserver.disconnect();
                this.intersectionObserver = null;
            }
            super.disconnectedCallback();
        }

        scheduleDraw() {
            if (this._rafPending) return;
            this._rafPending = true;
            requestAnimationFrame(() => {
                this._rafPending = false;
                if (this.resizeCanvas()) {
                    this.draw();
                }
            });
        }

        // Called by the SDK for EVERY change of a prop / input, one by one: a point is taken here,
        // never in updated() (Lit batches it: points arriving in one tick would be lost).
        propsChanged() {
            this.syncCapacity();
            this.prepareData();
        }

        updated(changed) {
            super.updated?.(changed);
            if (!this.canvas) this.setupCanvas();
            this.scheduleDraw();
        }

        syncCapacity() {
            const cap = Math.max(50, Number(this.p.maxPoints) || 10000);
            if (this.ringBuffer.capacity !== cap) {
                this.ringBuffer.setCapacity(cap);
            }
        }

        setupCanvas() {
            this.canvas = this.renderRoot.querySelector("canvas");
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext("2d");
            if (this.canvas.style.width || this.canvas.style.height) {
                this.canvas.style.width = "";
                this.canvas.style.height = "";
            }
            this.resizeCanvas();
        }

        setupResizeObserver() {
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
                this.resizeObserver = null;
            }
            const container = this.renderRoot?.querySelector(".chart-container");
            if (!container) return;

            this.resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const cr = entry.contentRect;
                    if (cr && cr.width > 0 && cr.height > 0) {
                        if (this.resizeCanvas()) {
                            this.draw();
                        }
                    }
                }
            });
            this.resizeObserver.observe(container);
            this.resizeObserver.observe(this);
        }

        setupIntersectionObserver() {
            if (this.intersectionObserver) {
                this.intersectionObserver.disconnect();
                this.intersectionObserver = null;
            }
            if (typeof IntersectionObserver === "function") {
                this.intersectionObserver = new IntersectionObserver((entries) => {
                    for (const entry of entries) {
                        if (entry.isIntersecting && entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0) {
                            if (this.resizeCanvas()) {
                                this.draw();
                            }
                        }
                    }
                });
                this.intersectionObserver.observe(this);
            }
        }

        resizeCanvas() {
            if (!this.canvas) return false;
            const container = this.renderRoot?.querySelector(".chart-container") || this;
            const rect = container.getBoundingClientRect();
            const w = Math.floor(rect.width);
            const h = Math.floor(rect.height);

            // Crucial for tabs / hidden containers: if dimensions are 0, do not collapse canvas to 1x1!
            if (w <= 0 || h <= 0) {
                return false;
            }

            // Smart TV & Embedded Memory / GPU Optimization:
            // High DPI (DPR >= 1.5 - 2.0 on 4K/1080p Smart TVs) multiplies canvas backing store memory by 4x.
            // On a 4K TV, DPR 2 consumes 50MB+ VRAM per canvas and saturates memory bus bandwidth.
            // Capping DPR for large screens saves up to 40MB+ of RAM/VRAM and eliminates GPU stutter on TV SoCs.
            const rawDpr = window.devicePixelRatio || 1;
            const dpr = w >= 1200 ? Math.min(rawDpr, 1.0) : (w >= 800 ? Math.min(rawDpr, 1.25) : Math.min(rawDpr, 1.5));
            const pixelW = Math.floor(w * dpr);
            const pixelH = Math.floor(h * dpr);

            // Always ensure inline styles are cleared so CSS width:100% / height:100% remains active
            if (this.canvas.style.width || this.canvas.style.height) {
                this.canvas.style.width = "";
                this.canvas.style.height = "";
            }

            if (this.canvas.width === pixelW && this.canvas.height === pixelH && this._lastDpr === dpr) {
                return true;
            }

            this._lastDpr = dpr;
            this.canvas.width = pixelW;
            this.canvas.height = pixelH;

            if (this.ctx) {
                this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
            return true;
        }

        prepareData() {
            // 1. Full array data input (check this first, never blocked by point binding)
            let raw = null;
            if (this.in && this.in.data !== undefined && this.in.data !== null) {
                raw = this.in.data;
            } else if (this.p && this.p.inputData !== undefined && this.p.inputData !== null && this.p.inputData !== "") {
                raw = this.p.inputData;
            } else if (this.p && this.p.data !== undefined && this.p.data !== null) {
                raw = this.p.data;
            }

            if (typeof raw === "string" && raw.trim().startsWith("[")) {
                try { raw = JSON.parse(raw); } catch (_) { }
            }

            if (Array.isArray(raw) && raw.length > 0 && raw !== this.lastRawData) {
                this.lastRawData = raw;
                this.ringBuffer.loadArray(raw, this.p.xField || "x", this.p.yField || "y");
                this.scheduleDraw();
            }

            // 2. Streaming single point append
            const hasPointInput = this.in && this.in.point !== undefined && this.in.point !== null;
            const rawPoint = hasPointInput ? this.in.point : (this.p && typeof this.p.inputPoint === "object" ? this.p.inputPoint : null);

            if (rawPoint && rawPoint !== this._lastPoint) {
                this._lastPoint = rawPoint;
                const px = Number(rawPoint[this.p.xField || "x"]);
                const py = Number(rawPoint[this.p.yField || "y"]);
                if (Number.isFinite(px) && Number.isFinite(py) && this.ringBuffer.push(px, py)) this.scheduleDraw();
            }
        }

        /** Action: adds [{x, y}, ...] (any order); -> how many were added. One redraw. */
        appendPoints(params) {
            const pts = params && Array.isArray(params.points) ? params.points : [];
            const xf = this.p.xField || "x", yf = this.p.yField || "y";
            let added = 0;
            for (let i = 0; i < pts.length; i++) {
                const pt = pts[i];
                if (!pt || typeof pt !== "object") continue;
                const x = Number(pt[xf]), y = Number(pt[yf]);
                if (Number.isFinite(x) && Number.isFinite(y) && this.ringBuffer.push(x, y)) added++;
            }
            if (added) { this.scheduleDraw(); this.requestUpdate(); }
            return added;
        }

        /** Action: empties the chart. */
        clearPoints() {
            this.ringBuffer.clear();
            this.lastRawData = null;
            this.viewRange = null;
            this.hover = null;
            this.scheduleDraw();
            this.requestUpdate();
        }

        getPlotMetrics(width, height) {
            const showComb = this.p.showTimeComb !== false;
            const combHeight = showComb ? 30 : 0;

            const padLeft = 52;
            const padRight = 16;
            const padTop = 14;
            const padBottom = showComb ? 4 : 26;

            const plotX = padLeft;
            const plotY = padTop;
            const plotW = Math.max(1, width - padLeft - padRight);
            const plotH = Math.max(1, height - padTop - padBottom - combHeight);

            const combX = padLeft;
            const combY = plotY + plotH + (showComb ? 4 : 0);
            const combW = plotW;
            const combH = combHeight;

            return { padLeft, padRight, padTop, padBottom, plotX, plotY, plotW, plotH, combX, combY, combW, combH, showComb };
        }

        getActiveColor() {
            if (this.p.lineColor && typeof this.p.lineColor === "string" && this.p.lineColor.trim()) {
                return this.p.lineColor.trim();
            }
            return getComputedStyle(this).getPropertyValue("--cp-solid").trim() ||
                getComputedStyle(this).getPropertyValue("--nexa-colors-primary-solid").trim() ||
                "#3b82f6";
        }

        clampViewRange(minX, maxX, fullBounds) {
            if (!fullBounds) return { minX, maxX, vMinX: minX, vMaxX: maxX };
            const span = Math.max(10, maxX - minX);
            const margin = span * 0.1;

            let cMin = minX;
            let cMax = maxX;

            if (cMin < fullBounds.minX - margin) {
                cMin = fullBounds.minX - margin;
                cMax = cMin + span;
            }
            if (cMax > fullBounds.maxX + margin) {
                cMax = fullBounds.maxX + margin;
                cMin = cMax - span;
            }

            return { minX: cMin, maxX: cMax, vMinX: cMin, vMaxX: cMax };
        }

        getEffectiveTimeRange(fullBounds) {
            if (!fullBounds) return { vMinX: 0, vMaxX: 1, minX: 0, maxX: 1 };
            if (this.viewRange) {
                const c = this.clampViewRange(this.viewRange.minX, this.viewRange.maxX, fullBounds);
                return { vMinX: c.minX, vMaxX: c.maxX, minX: c.minX, maxX: c.maxX };
            }

            const windowMs = parseTimeWindow(this.p.timeWindow);
            if (windowMs > 0) {
                const vMaxX = fullBounds.maxX;
                const vMinX = Math.max(fullBounds.minX, vMaxX - windowMs);
                return { vMinX, vMaxX, minX: vMinX, maxX: vMaxX };
            }

            return { vMinX: fullBounds.minX, vMaxX: fullBounds.maxX, minX: fullBounds.minX, maxX: fullBounds.maxX };
        }

        draw() {
            if (!this.canvas || !this.ctx) return;
            const container = this.renderRoot?.querySelector(".chart-container") || this.canvas;
            const rect = container.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            if (width <= 0 || height <= 0) return;

            if (!this.resizeCanvas()) return;   // the capped DPR lives there; same size = nothing done

            const ctx = this.ctx;
            ctx.clearRect(0, 0, width, height);

            const buf = this.ringBuffer;
            if (buf.count === 0) return;

            const fullBounds = buf.getBounds();
            if (!fullBounds) return;

            const { vMinX, vMaxX } = this.getEffectiveTimeRange(fullBounds);
            if (!Number.isFinite(vMinX) || !Number.isFinite(vMaxX)) return;

            const { plotX, plotY, plotW, plotH, combX, combY, combW, combH, showComb } = this.getPlotMetrics(width, height);

            // Virtualized slicing via binary search on ring buffer
            const startIdx = Math.max(0, lowerBoundRing(buf, vMinX) - 1);
            const endIdx = Math.min(buf.count, upperBoundRing(buf, vMaxX) + 1);

            // Zero-GC M4 decimation
            const decCount = this.decimator.decimate(buf, startIdx, endIdx, Math.floor(plotW), vMinX, vMaxX);
            const dX = this.decimator.outX;
            const dY = this.decimator.outY;

            // Y follows what is SHOWN (zoomed in: its own scale), from the decimated points (they hold
            // every column's min and max): no scan of the whole buffer per frame
            let vMinY = Infinity, vMaxY = -Infinity;
            for (let i = 0; i < decCount; i++) {
                const y = dY[i];
                if (y < vMinY) vMinY = y;
                if (y > vMaxY) vMaxY = y;
            }
            if (!Number.isFinite(vMinY)) { vMinY = 0; vMaxY = 1; }
            if (vMinY === vMaxY) {
                const pad = Math.abs(vMinY) * 0.1 || 1;
                vMinY -= pad; vMaxY += pad;
            } else {
                const pad = (vMaxY - vMinY) * 0.08;
                vMinY -= pad; vMaxY += pad;
            }

            const xSpan = Math.max(1, vMaxX - vMinX);
            const ySpan = Math.max(1e-6, vMaxY - vMinY);
            const toScreenX = (x) => plotX + ((x - vMinX) / xSpan) * plotW;
            const toScreenY = (y) => plotY + plotH - ((y - vMinY) / ySpan) * plotH;

            // 1. Draw Grid and Y-Axis Ticks
            this.drawAxesAndGrid(ctx, plotX, plotY, plotW, plotH, vMinX, vMaxX, vMinY, vMaxY, showComb);

            // 2. Clip to plot area for line and fill
            ctx.save();
            ctx.beginPath();
            ctx.rect(plotX, plotY, plotW, plotH);
            ctx.clip();

            const lineColor = this.getActiveColor();

            // 3. Area gradient fill
            if (this.p.areaFill && decCount > 1) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(toScreenX(dX[0]), plotY + plotH);
                for (let i = 0; i < decCount; i++) {
                    ctx.lineTo(toScreenX(dX[i]), toScreenY(dY[i]));
                }
                ctx.lineTo(toScreenX(dX[decCount - 1]), plotY + plotH);
                ctx.closePath();

                const grad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
                grad.addColorStop(0, this.hexToRgba(lineColor, 0.28));
                grad.addColorStop(1, this.hexToRgba(lineColor, 0.01));
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.restore();
            }

            // 4. Line stroke
            if (decCount > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = lineColor;
                ctx.lineWidth = Number(this.p.lineWidth) || 2;
                ctx.lineJoin = "round";
                ctx.lineCap = "round";

                if (decCount === 1) {
                    // Single point in viewport: draw visible circle marker
                    const sx = toScreenX(dX[0]);
                    const sy = toScreenY(dY[0]);
                    const pr = Math.max(4, Number(this.p.pointRadius) || 4);
                    ctx.fillStyle = lineColor;
                    ctx.beginPath();
                    ctx.arc(sx, sy, pr, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    for (let i = 0; i < decCount; i++) {
                        const sx = toScreenX(dX[i]);
                        const sy = toScreenY(dY[i]);
                        if (i === 0) ctx.moveTo(sx, sy);
                        else ctx.lineTo(sx, sy);
                    }
                    ctx.stroke();

                    // Optional Point dots
                    if (this.p.showPoints) {
                        const pr = Number(this.p.pointRadius) || 3;
                        ctx.fillStyle = lineColor;
                        for (let i = 0; i < decCount; i++) {
                            ctx.beginPath();
                            ctx.arc(toScreenX(dX[i]), toScreenY(dY[i]), pr, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }
                ctx.restore();
            }

            // 5. Crosshair line & hover point highlight
            if (this.hover && this.hover.x >= vMinX && this.hover.x <= vMaxX) {
                const hx = toScreenX(this.hover.x);
                const hy = toScreenY(this.hover.y);

                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
                ctx.lineWidth = 1;
                ctx.moveTo(hx, plotY);
                ctx.lineTo(hx, plotY + plotH);
                ctx.stroke();

                ctx.beginPath();
                ctx.setLineDash([]);
                ctx.fillStyle = lineColor;
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2;
                ctx.arc(hx, hy, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }

            ctx.restore(); // end clip

            // 6. Draw Interactive Timestamp Comb (Bottom Scrubber Ruler)
            if (showComb) {
                this.drawTimeComb(ctx, vMinX, vMaxX, combX, combY, combW, combH);
            }
        }

        drawAxesAndGrid(ctx, px, py, pw, ph, minX, maxX, minY, maxY, showComb) {
            ctx.save();
            const cs = getComputedStyle(this);
            const gridColor = cs.getPropertyValue("--bd").trim() || "rgba(255, 255, 255, 0.08)";
            const textColor = cs.getPropertyValue("--fg-muted").trim() || "rgba(255, 255, 255, 0.5)";

            ctx.font = "10px " + (cs.getPropertyValue("--mono") || "monospace");

            // --- Y Axis Ticks & Grid ---
            const yTicksCount = Math.max(3, Math.min(6, Math.floor(ph / 45)));
            const yRange = maxY - minY;
            const yStep = niceNum(yRange / yTicksCount, false);
            const startY = Math.ceil(minY / yStep) * yStep;

            ctx.textAlign = "right";
            ctx.textBaseline = "middle";

            for (let yVal = startY; yVal <= maxY; yVal += yStep) {
                const sy = py + ph - ((yVal - minY) / yRange) * ph;
                if (sy < py || sy > py + ph) continue;

                if (this.p.showGrid) {
                    ctx.beginPath();
                    ctx.strokeStyle = gridColor;
                    ctx.lineWidth = 1;
                    ctx.moveTo(px, sy);
                    ctx.lineTo(px + pw, sy);
                    ctx.stroke();
                }

                let formatted = yVal >= 1000 ? (yVal / 1000).toFixed(1) + "k" : Math.abs(yVal) < 1 ? yVal.toFixed(2) : yVal.toFixed(1);
                if (formatted.endsWith(".0")) formatted = formatted.slice(0, -2);
                ctx.fillStyle = textColor;
                ctx.fillText(formatted, px - 6, sy);
            }

            // --- Fallback X Axis Ticks (only if comb is disabled) ---
            if (!showComb) {
                const xTicksCount = Math.max(2, Math.min(6, Math.floor(pw / 100)));
                const xSpan = maxX - minX;

                ctx.textAlign = "center";
                ctx.textBaseline = "top";

                for (let i = 0; i <= xTicksCount; i++) {
                    const ratio = i / xTicksCount;
                    const tx = minX + ratio * xSpan;
                    const sx = px + ratio * pw;

                    if (this.p.showGrid) {
                        ctx.beginPath();
                        ctx.strokeStyle = gridColor;
                        ctx.lineWidth = 1;
                        ctx.moveTo(sx, py);
                        ctx.lineTo(sx, py + ph);
                        ctx.stroke();
                    }

                    ctx.fillStyle = textColor;
                    ctx.fillText(formatCombTick(tx, xSpan, xSpan / xTicksCount), sx, py + ph + 6);
                }
            }

            ctx.restore();
        }

        drawTimeComb(ctx, minX, maxX, px, py, pw, ph) {
            const span = Math.max(1, maxX - minX);
            const targetMajor = Math.max(2, Math.min(8, Math.floor(pw / 85)));
            const majorStep = getNiceTimeStep(span, targetMajor);
            let minorStep = majorStep / 5;
            if (majorStep <= 20) minorStep = majorStep / 2;

            const firstMinor = Math.floor(minX / minorStep) * minorStep;

            ctx.save();
            const cs = getComputedStyle(this);
            const combBg = cs.getPropertyValue("--panel-bg-subtle").trim() || "rgba(0, 0, 0, 0.22)";
            const tickColor = cs.getPropertyValue("--bd").trim() || "rgba(255, 255, 255, 0.16)";
            const majorColor = cs.getPropertyValue("--fg-muted").trim() || "rgba(255, 255, 255, 0.6)";
            const textColor = cs.getPropertyValue("--fg-muted").trim() || "rgba(255, 255, 255, 0.65)";

            // 1. Comb Background Container
            ctx.fillStyle = combBg;
            ctx.fillRect(px, py, pw, ph);

            // 2. Top divider line
            ctx.beginPath();
            ctx.strokeStyle = tickColor;
            ctx.lineWidth = 1;
            ctx.moveTo(px, py);
            ctx.lineTo(px + pw, py);
            ctx.stroke();

            // 3. Grid line pass (vertical grid lines into main plot)
            if (this.p.showGrid) {
                ctx.beginPath();
                ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
                ctx.lineWidth = 1;
                for (let t = firstMinor; t <= maxX + minorStep; t += minorStep) {
                    const sx = px + ((t - minX) / span) * pw;
                    if (sx < px || sx > px + pw) continue;
                    const rem = Math.abs(t % majorStep);
                    if (rem < (minorStep * 0.2) || Math.abs(rem - majorStep) < (minorStep * 0.2)) {
                        ctx.moveTo(sx, 14);
                        ctx.lineTo(sx, py);
                    }
                }
                ctx.stroke();
            }

            // 4. Minor teeth
            ctx.beginPath();
            ctx.strokeStyle = tickColor;
            ctx.lineWidth = 1;

            const majorList = [];
            for (let t = firstMinor; t <= maxX + minorStep; t += minorStep) {
                const sx = px + ((t - minX) / span) * pw;
                if (sx < px || sx > px + pw) continue;

                const rem = Math.abs(t % majorStep);
                const isMajor = rem < (minorStep * 0.2) || Math.abs(rem - majorStep) < (minorStep * 0.2);

                if (isMajor) {
                    majorList.push({ x: sx, time: t });
                } else {
                    ctx.moveTo(sx, py);
                    ctx.lineTo(sx, py + 4);
                }
            }
            ctx.stroke();

            // 5. Major teeth
            ctx.beginPath();
            ctx.strokeStyle = majorColor;
            ctx.lineWidth = 1.2;
            for (let i = 0; i < majorList.length; i++) {
                const sx = majorList[i].x;
                ctx.moveTo(sx, py);
                ctx.lineTo(sx, py + 8);
            }
            ctx.stroke();

            // 6. Labels
            ctx.font = "10px " + (cs.getPropertyValue("--mono") || "monospace");
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = textColor;

            for (let i = 0; i < majorList.length; i++) {
                const item = majorList[i];
                ctx.fillText(formatCombTick(item.time, span, majorStep), item.x, py + 12);
            }

            ctx.restore();
        }

        hexToRgba(hexOrRgb, alpha) {
            if (!hexOrRgb) return `rgba(59, 130, 246, ${alpha})`;
            if (hexOrRgb.startsWith("rgb")) {
                return hexOrRgb.replace(/rgba?\(([^)]+)\)/, (m, val) => {
                    const parts = val.split(",").slice(0, 3).map((s) => s.trim());
                    return `rgba(${parts.join(",")}, ${alpha})`;
                });
            }
            let hex = hexOrRgb.replace("#", "");
            if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
            const num = parseInt(hex, 16);
            if (isNaN(num)) return `rgba(59, 130, 246, ${alpha})`;
            return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
        }

        // =========================================================================
        // Pointer & Interaction Handling (Zero-GC, Direct DOM Tooltip, Clamped Scrub)
        // =========================================================================

        getHitZone(clientX, clientY) {
            if (!this.canvas) return "none";
            const container = this.renderRoot?.querySelector(".chart-container") || this.canvas;
            const rect = container.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            const { plotX, plotY, plotW, plotH, combX, combY, combW, combH, showComb } = this.getPlotMetrics(rect.width, rect.height);

            if (showComb && x >= combX && x <= combX + combW && y >= combY && y <= combY + combH) {
                return "comb";
            }
            if (x >= plotX && x <= plotX + plotW && y >= plotY && y <= plotY + plotH) {
                return "plot";
            }
            return "none";
        }

        onPointerDown(e) {
            if (e.button !== 0 || !this.canvas) return;
            const zone = this.getHitZone(e.clientX, e.clientY);
            if (zone === "none") return;

            const fullBounds = this.ringBuffer.getBounds();
            if (!fullBounds) return;

            const { vMinX, vMaxX } = this.getEffectiveTimeRange(fullBounds);
            this.dragStartX = e.clientX;
            this.dragStartMinX = vMinX;
            this.dragStartMaxX = vMaxX;

            const container = this.renderRoot.querySelector(".chart-container");

            if (zone === "comb") {
                this.isScrubbing = true;
                if (container) container.classList.add("scrubbing");
                try { e.target.setPointerCapture(e.pointerId); } catch (_) { }
            } else if (zone === "plot" && this.p.enableZoomPan) {
                this.isPanning = true;
                if (container) container.classList.add("dragging");
                try { e.target.setPointerCapture(e.pointerId); } catch (_) { }
            }
        }

        onPointerMove(e) {
            if (!this.canvas || !this.ringBuffer.count) return;
            const container = this.renderRoot?.querySelector(".chart-container") || this.canvas;
            const rect = container.getBoundingClientRect();
            const { plotX, plotY, plotW, plotH, combX, combY, combW, combH, showComb } = this.getPlotMetrics(rect.width, rect.height);

            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;

            // 1. Handling Comb Scrubbing (Horizontal Drag)
            if (this.isScrubbing || this.isPanning) {
                const dx = e.clientX - this.dragStartX;
                const currentSpan = this.dragStartMaxX - this.dragStartMinX;
                const timeDelta = (dx / plotW) * currentSpan;

                const fullBounds = this.ringBuffer.getBounds();
                const rawMin = this.dragStartMinX - timeDelta;
                const rawMax = this.dragStartMaxX - timeDelta;

                // Clamped so line NEVER flies off into empty space
                this.viewRange = this.clampViewRange(rawMin, rawMax, fullBounds);
                this.draw();
                return;
            }

            // 2. Hover detection (Comb vs Plot)
            const isOverComb = showComb && px >= combX && px <= combX + combW && py >= combY && py <= combY + combH;

            if (isOverComb !== this.isHoverComb) {
                this.isHoverComb = isOverComb;
                if (container) {
                    if (isOverComb) container.classList.add("hover-comb");
                    else container.classList.remove("hover-comb");
                }
            }

            const tip = this.renderRoot.querySelector(".tooltip");

            if (isOverComb || px < plotX || px > plotX + plotW || py < plotY || py > plotY + plotH) {
                if (this.hover) {
                    this.hover = null;
                    this.draw();
                }
                if (tip) tip.style.display = "none";
                return;
            }

            const fullBounds = this.ringBuffer.getBounds();
            if (!fullBounds) return;

            const { vMinX, vMaxX } = this.getEffectiveTimeRange(fullBounds);
            const timeAtCursor = vMinX + ((px - plotX) / plotW) * (vMaxX - vMinX);

            const closestIdx = this.ringBuffer.findClosestIndex(timeAtCursor);
            if (closestIdx < 0) return;

            const closestX = this.ringBuffer.getX(closestIdx);
            const closestY = this.ringBuffer.getY(closestIdx);

            this.hover = {
                x: closestX,
                y: closestY,
                cursorClientX: px,
                cursorClientY: py
            };

            // Direct 60 FPS canvas redraw (crosshair & hover point)
            this.draw();

            // Direct DOM update of tooltip (zero Lit re-render!)
            if (tip) {
                const timeEl = tip.querySelector(".tooltip-time");
                const valEl = tip.querySelector(".tooltip-val");
                if (timeEl) timeEl.textContent = formatTooltipTime(closestX);
                if (valEl) valEl.textContent = `${closestY} ${this.p.unit || ""}`;

                const xSpan = Math.max(1, vMaxX - vMinX);
                const sx = plotX + ((closestX - vMinX) / xSpan) * plotW;
                const flip = sx > rect.width - 150;
                const left = flip ? sx - 12 : sx + 12;
                const transform = flip ? "translate(-100%, -50%)" : "translate(0, -50%)";

                tip.style.display = "block";
                tip.style.left = `${Math.round(left)}px`;
                tip.style.top = `${Math.round(py)}px`;
                tip.style.transform = transform;
            }
        }

        onPointerUp(e) {
            const container = this.renderRoot.querySelector(".chart-container");
            if (this.isScrubbing || this.isPanning) {
                try { e.target.releasePointerCapture(e.pointerId); } catch (_) { }
                this.isScrubbing = false;
                this.isPanning = false;
                if (container) {
                    container.classList.remove("scrubbing");
                    container.classList.remove("dragging");
                }
                // Only requestUpdate here to show/hide the reset button if viewRange changed
                this.requestUpdate();
            }
        }

        onWheel(e) {
            if (!this.p.enableZoomPan || !this.canvas) return;
            e.preventDefault();

            const container = this.renderRoot?.querySelector(".chart-container") || this.canvas;
            const rect = container.getBoundingClientRect();
            const { plotX, plotW, combX, combW, combY, combH, showComb } = this.getPlotMetrics(rect.width, rect.height);
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;

            const fullBounds = this.ringBuffer.getBounds();
            if (!fullBounds) return;

            const { vMinX, vMaxX } = this.getEffectiveTimeRange(fullBounds);
            const curSpan = vMaxX - vMinX;

            const isOverComb = showComb && cursorX >= combX && cursorX <= combX + combW && cursorY >= combY && cursorY <= combY + combH;

            // Horizontal wheel scroll in comb bar = pan time
            if (isOverComb && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
                const scrollDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
                const timeShift = (scrollDelta / plotW) * curSpan * 0.4;
                const rawMin = vMinX + timeShift;
                const rawMax = vMaxX + timeShift;
                this.viewRange = this.clampViewRange(rawMin, rawMax, fullBounds);
                this.draw();
                this.requestUpdate();
                return;
            }

            // Normal wheel zoom centered at cursor time
            if (cursorX < plotX || cursorX > plotX + plotW) return;
            const ratio = (cursorX - plotX) / plotW;
            const cursorTime = vMinX + ratio * curSpan;

            const zoomFactor = e.deltaY < 0 ? 0.75 : 1.33;
            const newSpan = curSpan * zoomFactor;

            if (newSpan < 10 && e.deltaY < 0) return;

            const rawMin = cursorTime - ratio * newSpan;
            const rawMax = cursorTime + (1 - ratio) * newSpan;

            this.viewRange = this.clampViewRange(rawMin, rawMax, fullBounds);
            this.draw();
            this.requestUpdate();
        }

        onPointerLeave() {
            if (this.hover) {
                this.hover = null;
                this.draw();
            }
            const tip = this.renderRoot.querySelector(".tooltip");
            if (tip) tip.style.display = "none";

            this.isHoverComb = false;
            const container = this.renderRoot.querySelector(".chart-container");
            if (container) container.classList.remove("hover-comb");
        }

        onDoubleClick() {
            this.resetZoom();
        }

        resetZoom() {
            this.viewRange = null;
            this.draw();
            this.requestUpdate();
        }

        render() {
            const hasData = this.ringBuffer && this.ringBuffer.count > 0;
            const lineColor = this.getActiveColor();

            return html`
                <div
                    class="chart-container"
                    part="chart"
                    @wheel=${(e) => this.onWheel(e)}
                    @pointerdown=${(e) => this.onPointerDown(e)}
                    @pointermove=${(e) => this.onPointerMove(e)}
                    @pointerup=${(e) => this.onPointerUp(e)}
                    @pointerleave=${() => this.onPointerLeave()}
                    @dblclick=${() => this.onDoubleClick()}
                >
                    <canvas></canvas>

                    ${this.viewRange ? html`
                        <button class="btn-reset-zoom" @click=${() => this.resetZoom()} title="Double click canvas or click here to resume live auto-follow">
                            <i class="fa fa-undo"></i> Reset zoom / <span class="live-dot"></span> Live
                        </button>
                    ` : ""}

                    <div class="tooltip">
                        <div class="tooltip-time"></div>
                        <div class="tooltip-row">
                            <span class="tooltip-dot" style="background: ${lineColor};"></span>
                            <span style="color: #94a3b8;">${this.p.label || "Value"}:</span>
                            <span class="tooltip-val"></span>
                        </div>
                    </div>

                    ${!hasData ? html`
                        <div class="empty">
                            <i class="fa fa-line-chart" style="font-size: 24px; opacity: 0.4;"></i>
                            <span>No data received</span>
                        </div>
                    ` : ""}
                </div>
            `;
        }
    }
});