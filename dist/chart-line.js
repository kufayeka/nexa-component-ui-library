import { html, css, asBinding } from "../../nexa-sdk/nexa-component-sdk.js";
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
        cursor: crosshair;
        touch-action: none;
    }

    .plot.hover-comb {
        cursor: ew-resize;
    }

    .plot.dragging {
        cursor: grabbing !important;
    }

    .plot.scrubbing {
        cursor: ew-resize !important;
    }

    .legend {
        flex: 0 0 auto;
        display: flex;
        flex-wrap: wrap;
        gap: 2px 14px;
        padding: 4px 10px 6px 52px;
        font-size: 11px;
        line-height: 1.4;
        color: var(--fg-muted, #a0aec0);
        max-height: 40%;
        overflow-y: auto;
    }

    .lg-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 1px 2px;
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
        cursor: pointer;
        white-space: nowrap;
    }

    .lg-item:hover .lg-name { color: var(--fg, #fff); }
    .lg-item.off { opacity: 0.38; }

    .lg-swatch {
        width: 12px;
        height: 3px;
        border-radius: 2px;
        flex-shrink: 0;
    }

    .lg-val {
        font-family: var(--mono, monospace);
        color: var(--fg, #fff);
        font-variant-numeric: tabular-nums;
    }

    .tooltip-rows {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .tooltip-name { color: #94a3b8; }

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
// 16 bytes a point: 1 M points = 16 MB (+ the LOD below: 0.8 MB).
//
// LOD: the min and max of every block of 32 slots (and where they are), so the min / max of a long
// range is its blocks' plus the few points at its two ends: a column of 1 000 points costs ~95
// steps, not 1 000. A write only marks its block dirty (push stays O(1)); a dirty block is summed
// again when a draw needs it.
const LOD_SHIFT = 5;
const LOD_BLOCK = 1 << LOD_SHIFT;

class TimeSeriesRingBuffer {
    constructor(capacity = 10000) {
        this.capacity = Math.max(50, capacity);
        this.x = new Float64Array(this.capacity);
        this.y = new Float64Array(this.capacity);
        this.head = 0;
        this.count = 0;
        this._allocLod();
    }

    _allocLod() {
        const n = Math.ceil(this.capacity / LOD_BLOCK);
        this.bMin = new Float64Array(n);
        this.bMax = new Float64Array(n);
        this.bMinAt = new Int32Array(n);
        this.bMaxAt = new Int32Array(n);
        this.bDirty = new Uint8Array(n).fill(1);
    }

    // a block's min / max again (the earliest slot on a tie: what a scan in time order finds)
    _fixBlock(b) {
        const start = b << LOD_SHIFT, end = Math.min(start + LOD_BLOCK, this.capacity);
        let mn = Infinity, mx = -Infinity, mnAt = start, mxAt = start;
        for (let p = start; p < end; p++) {
            const y = this.y[p];
            if (y < mn) { mn = y; mnAt = p; }
            if (y > mx) { mx = y; mxAt = p; }
        }
        this.bMin[b] = mn; this.bMax[b] = mx; this.bMinAt[b] = mnAt; this.bMaxAt[b] = mxAt;
        this.bDirty[b] = 0;
    }

    /**
     * The min and max of the points [i0, i1) (oldest = 0), the earliest on a tie, into
     * out = { min, minAt, max, maxAt } (minAt / maxAt: point indices). Whole blocks from the LOD.
     */
    rangeMinMax(i0, i1, out) {
        let mn = Infinity, mx = -Infinity, mnAt = -1, mxAt = -1;
        let s = this._at(i0), len = i1 - i0;
        while (len > 0) {
            const segEnd = Math.min(this.capacity, s + len);   // the ring's end splits a range in two
            let p = s;
            while (p < segEnd) {
                const b = p >> LOD_SHIFT, bStart = b << LOD_SHIFT, bEnd = Math.min(bStart + LOD_BLOCK, this.capacity);
                if (p === bStart && bEnd <= segEnd) {
                    if (this.bDirty[b]) this._fixBlock(b);
                    if (this.bMin[b] < mn) { mn = this.bMin[b]; mnAt = this.bMinAt[b]; }
                    if (this.bMax[b] > mx) { mx = this.bMax[b]; mxAt = this.bMaxAt[b]; }
                    p = bEnd;
                } else {
                    const stop = Math.min(bEnd, segEnd);
                    for (; p < stop; p++) {
                        const y = this.y[p];
                        if (y < mn) { mn = y; mnAt = p; }
                        if (y > mx) { mx = y; mxAt = p; }
                    }
                }
            }
            len -= segEnd - s;
            s = 0;
        }
        const oldest = this._at(0), cap = this.capacity;
        out.min = mn; out.max = mx;
        out.minAt = (mnAt - oldest + cap) % cap;
        out.maxAt = (mxAt - oldest + cap) % cap;
        return out;
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
        this._allocLod();
    }

    clear() {
        this.head = 0;
        this.count = 0;
        this.bDirty.fill(1);
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
        this.bDirty[this.head >> LOD_SHIFT] = 1;
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
            this.bDirty[to >> LOD_SHIFT] = 1;
        }
        const at = this._at(lo);
        this.bDirty[at >> LOD_SHIFT] = 1;
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
        this.bDirty.fill(1);
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
        this.useLod = true;                 // false: the plain scan (tests compare both)
        this._mm = { min: 0, minAt: 0, max: 0, maxAt: 0 };
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

        // Many points a column: each column's first / last by binary search on the SAME column
        // formula as the scan (monotonic in time), its min / max from the buffer's LOD.
        // Pixel-identical to the scan, in ~pw · (log n + 95) steps instead of n.
        if (this.useLod && typeof buf.rangeMinMax === "function" && count >= pw * 8) {
            const colOf = (i) => {
                const c = Math.floor(((buf.getX(i) - vMinX) / range) * pw);
                return c < 0 ? 0 : c >= pw ? pw - 1 : c;
            };
            const mm = this._mm;
            let outCount = 0, prevIdx = -1, i0 = startIdx;
            while (i0 < endIdx) {
                const col = colOf(i0);
                let lo = i0 + 1, hi = endIdx;
                while (lo < hi) {
                    const mid = (lo + hi) >> 1;
                    if (colOf(mid) <= col) lo = mid + 1; else hi = mid;
                }
                buf.rangeMinMax(i0, lo, mm);
                let a = i0, b = mm.minAt, c = mm.maxAt, d = lo - 1;
                if (a > b) { const t = a; a = b; b = t; }
                if (c > d) { const t = c; c = d; d = t; }
                if (a > c) { const t = a; a = c; c = t; }
                if (b > d) { const t = b; b = d; d = t; }
                if (b > c) { const t = b; b = c; c = t; }
                if (a !== prevIdx) { this.outX[outCount] = buf.getX(a); this.outY[outCount] = buf.getY(a); outCount++; prevIdx = a; }
                if (b !== prevIdx) { this.outX[outCount] = buf.getX(b); this.outY[outCount] = buf.getY(b); outCount++; prevIdx = b; }
                if (c !== prevIdx) { this.outX[outCount] = buf.getX(c); this.outY[outCount] = buf.getY(c); outCount++; prevIdx = c; }
                if (d !== prevIdx) { this.outX[outCount] = buf.getX(d); this.outY[outCount] = buf.getY(d); outCount++; prevIdx = d; }
                i0 = lo;
            }
            return outCount;
        }

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
// Nexa Line Chart Component Definition (multi-series)
// =============================================================================
//
// Series is a list (like Tabs): each one its own data (a binding: an array that replaces, a point
// that appends), ring buffer + LOD, variant, style, axis, tooltip and legend. The list's order is
// the layer order: the first is drawn first (under the others). Logic targets a series by its Id,
// its name or its index (appendPoints / setPoints / clearSeries / setVisible), and hears the chart
// (hover, rangeChange, seriesToggle, pointClick). Data never goes into the props, only the setup.

// a series' colour when it has none of its own: the theme palette for the first, then these
const SERIES_PALETTE = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];

const opt = (list) => list.map((x) => (Array.isArray(x) ? { value: x[0], label: x[1] } : { value: x, label: x }));

const SERIES_FIELDS = {
    name: { type: "string", label: "Name", default: "Series" },
    id: { type: "string", label: "Id (Logic finds it by this)", default: "", bindable: false,
        help: "Fixed: Logic actions name the series by it (or by its name / index). Renaming the series keeps it." },
    visible: { type: "boolean", label: "Visible", default: true },
    legend: { type: "boolean", label: "In the legend", default: true },

    data: { type: "tag", access: "read", section: "Data", label: "Data (an array: replaces what it holds)",
        help: "[{x, y}, …], x = a time (ms). A binding: a message path, a tag, a variable… The static value is the initial data." },
    point: { type: "tag", access: "read", section: "Data", label: "Point (appends)",
        help: "{x, y}, a list of them, or a number (its time = now). Every change is one more point." },
    xField: { type: "string", section: "Data", label: "X field", default: "x", bindable: false },
    yField: { type: "string", section: "Data", label: "Y field", default: "y", bindable: false },
    maxPoints: { type: "number", section: "Data", label: "Points kept", default: 10000, min: 50, max: 2000000, step: 500,
        help: "A ring: past it, the oldest go. 16 bytes a point (1 000 000 = 16 MB)." },
    gapAfter: { type: "number", section: "Data", label: "Break the line after (ms without data)", default: 0, min: 0, step: 1000,
        help: "0 = always connected. A longer silence than this draws a gap (a sensor offline is not a straight line)." },

    variant: { type: "enum", section: "Line", label: "Variant", default: "line",
        options: opt([["line", "Line"], ["step", "Step"], ["smooth", "Smooth"], ["bars", "Bars"], ["points", "Points only"]]) },
    step: { type: "enum", section: "Line", label: "Step at", default: "after", options: opt([["after", "After the point"], ["before", "Before the point"], ["center", "Half way"]]),
        visibleWhen: (s) => s.variant === "step" },
    color: { type: "color", section: "Line", label: "Colour", default: "", help: "Empty: the next colour of the palette." },
    width: { type: "number", section: "Line", label: "Width", default: 2, min: 0.5, max: 10, step: 0.5, unit: "px" },
    dash: { type: "enum", section: "Line", label: "Dash", default: "solid", options: opt([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]) },
    opacity: { type: "number", section: "Line", label: "Opacity", default: 1, min: 0, max: 1, step: 0.05 },

    fill: { type: "enum", section: "Fill", label: "Fill", default: "none", options: opt([["none", "None"], ["gradient", "Gradient"], ["solid", "Solid"]]) },
    fillOpacity: { type: "number", section: "Fill", label: "Fill opacity", default: 0.25, min: 0, max: 1, step: 0.05, visibleWhen: (s) => s.fill && s.fill !== "none" },

    points: { type: "boolean", section: "Points", label: "Show the points", default: false },
    pointShape: { type: "enum", section: "Points", label: "Shape", default: "circle", options: opt([["circle", "Circle"], ["square", "Square"], ["diamond", "Diamond"]]) },
    pointRadius: { type: "number", section: "Points", label: "Size", default: 3, min: 1, max: 12, unit: "px" },

    axis: { type: "enum", section: "Axis", label: "Y axis", default: "left", options: opt([["left", "Left"], ["right", "Right"]]) },
    unit: { type: "string", section: "Axis", label: "Unit (°C, kW, %)", default: "" },

    tooltip: { type: "boolean", section: "Tooltip", label: "In the tooltip", default: true },
    tooltipLabel: { type: "string", section: "Tooltip", label: "Label", default: "", help: "Empty: the name." },
    decimals: { type: "enum", section: "Tooltip", label: "Decimals", default: "auto", options: opt([["auto", "As it is"], "0", "1", "2", "3", "4"]) },
    prefix: { type: "string", section: "Tooltip", label: "Before the value", default: "" },
    suffix: { type: "string", section: "Tooltip", label: "After the value", default: "", help: "The unit follows it." }
};

function seriesDefaults() {
    const o = {};
    Object.keys(SERIES_FIELDS).forEach((k) => { o[k] = SERIES_FIELDS[k].default; });
    return o;
}

const THRESHOLD_FIELDS = {
    value: { type: "number", label: "Value", default: 0 },
    label: { type: "string", label: "Label", default: "" },
    axis: { type: "enum", label: "Axis", default: "left", options: opt([["left", "Left"], ["right", "Right"]]) },
    color: { type: "color", label: "Colour", default: "#ef4444" },
    dash: { type: "enum", label: "Dash", default: "dashed", options: opt([["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]) }
};

const DASHES = { solid: [], dashed: [6, 4], dotted: [2, 3] };

function numOr(v, d) {
    const n = typeof v === "number" ? v : v === "" || v === null || v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : d;
}

// a value for the tooltip / legend: as it is, or with fixed decimals
function fmtValue(y, decimals) {
    if (!Number.isFinite(y)) return "—";
    if (decimals === "auto" || decimals === undefined || decimals === "") return String(Math.round(y * 1e6) / 1e6);
    return y.toFixed(Number(decimals));
}

export const lineChart = defineUI({
    ...common,
    id: PREFIX + "line-chart",
    label: "Line Chart",
    icon: "fa fa-line-chart",
    size: { w: 600, h: 320 },
    help: "Time-series chart: many series, each its own data, variant, style, axis and tooltip. Every point kept (Float64), drawn at pixel accuracy (M4 + LOD), driven by Logic.",
    version: 2,

    // v1: one series in flat props (data / inputData / inputPoint, label, unit, lineColor…) -> series[0]
    migrate(p, from) {
        if (from < 2) {
            const fb = p.__fallback || {};
            const s = Object.assign(seriesDefaults(), { id: "s1", name: p.label || "Series 1", fill: p.areaFill === false ? "none" : "gradient" });
            if (p.unit) s.unit = p.unit;
            if (p.lineColor) s.color = p.lineColor;
            if (p.lineWidth !== undefined) s.width = p.lineWidth;
            if (p.showPoints) s.points = true;
            if (p.pointRadius !== undefined) s.pointRadius = p.pointRadius;
            if (p.xField) s.xField = p.xField;
            if (p.yField) s.yField = p.yField;
            if (p.maxPoints !== undefined) s.maxPoints = p.maxPoints;
            const has = (v) => v !== undefined && v !== null && v !== "";
            if (has(p.inputData)) s.data = asBinding(p.inputData, fb.inputData);
            else if (Array.isArray(p.data) && p.data.length) s.data = { $bind: [], static: p.data };
            if (has(p.inputPoint)) s.point = asBinding(p.inputPoint, fb.inputPoint);
            p.series = [s];
            ["data", "inputData", "inputPoint", "label", "unit", "lineColor", "lineWidth", "areaFill", "showPoints", "pointRadius", "xField", "yField", "maxPoints"].forEach((k) => { delete p[k]; });
            if (p.__fallback) {
                delete p.__fallback.inputData;
                delete p.__fallback.inputPoint;
                if (!Object.keys(p.__fallback).length) delete p.__fallback;
            }
        }
        return p;
    },

    groups: ["Series", "Data", "Axes", "Tooltip", "Legend", "Thresholds", "Style", "Behaviour"],

    properties: {
        series: {
            type: "list", group: "Series", label: "Series", noun: "series",
            help: "Each series: its own data, look, axis and tooltip. The order is the layer order (the first is drawn under the others): drag to change it.",
            default: [Object.assign(seriesDefaults(), { id: "s1", name: "Series 1" })],
            item: {
                fields: SERIES_FIELDS, noun: "series",
                // a new series: the next number, a fixed Id Logic can name (s1, s2 … never reused)
                create: (items) => {
                    let n = items.length + 1;
                    const ids = new Set(items.map((x) => x && x.id));
                    while (ids.has("s" + n)) n++;
                    return Object.assign(seriesDefaults(), { id: "s" + n, name: "Series " + n });
                }
            }
        },
        timeWindow: {
            type: "enum",
            default: "auto",
            options: [
                { value: "auto", label: "Everything it holds" },
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
            label: "Time range",
            help: "A live window that follows the newest point. Zoom / pan stops following; Live (or a double click) follows again."
        },

        leftTitle: { type: "string", group: "Axes", section: "Left", label: "Title", default: "" },
        leftMin: { type: "number", group: "Axes", section: "Left", label: "Min (empty: auto)", default: "" },
        leftMax: { type: "number", group: "Axes", section: "Left", label: "Max (empty: auto)", default: "" },
        rightTitle: { type: "string", group: "Axes", section: "Right", label: "Title", default: "", help: "The right axis shows when a series uses it." },
        rightMin: { type: "number", group: "Axes", section: "Right", label: "Min (empty: auto)", default: "" },
        rightMax: { type: "number", group: "Axes", section: "Right", label: "Max (empty: auto)", default: "" },

        tooltipMode: { type: "enum", group: "Tooltip", label: "Shows", default: "shared",
            options: opt([["shared", "Every series at that time"], ["nearest", "The nearest series"], ["off", "Nothing"]]) },
        matchWithin: { type: "number", group: "Tooltip", label: "A series' point counts within (ms)", default: 0, min: 0, step: 100,
            help: "Series sampled at different rates: a point this close to the cursor's time is shown. 0 = automatic (about each series' own spacing)." },

        legend: { type: "enum", group: "Legend", label: "Legend", default: "bottom", options: opt([["bottom", "Below"], ["top", "Above"], ["none", "None"]]) },
        legendValue: { type: "enum", group: "Legend", label: "Value in the legend", default: "last",
            options: opt([["none", "None"], ["last", "Last"], ["min", "Min (shown)"], ["max", "Max (shown)"]]) },

        thresholds: { type: "list", group: "Thresholds", label: "Thresholds", noun: "threshold", default: [],
            help: "Horizontal lines: a limit, a setpoint.", item: { fields: THRESHOLD_FIELDS, noun: "threshold" } },

        colorPalette: paletteProp("primary"),
        showGrid: { type: "boolean", default: true, group: "Style", label: "Grid" },

        showTimeComb: { type: "boolean", default: true, group: "Behaviour", label: "Time ruler (drag to scrub)" },
        enableZoomPan: { type: "boolean", default: true, group: "Behaviour", label: "Zoom (wheel) and pan (drag)" }
    },

    parts: {
        chart: part("Chart canvas container", "chart"),
        legend: part("Legend", "legend")
    },

    events: {
        hover: { label: "On Hover (the time under the cursor)", payload: { time: "number", values: "object" } },
        rangeChange: { label: "On Range Change (zoom / pan / live)", payload: { from: "number", to: "number", live: "boolean" } },
        seriesToggle: { label: "On Series Toggle (legend)", payload: { series: "string", visible: "boolean" } },
        pointClick: { label: "On Point Click", payload: { series: "string", x: "number", y: "number" } }
    },

    // Logic (Update Component): `series` = its Id, its name or its index (none: the first)
    actions: {
        appendPoints: { label: "Append points", params: { series: "string", points: "array" }, help: "Adds [{x, y}, …] (any order) to a series; returns how many were added." },
        setPoints: { label: "Set points", params: { series: "string", points: "array" }, help: "Replaces what a series holds." },
        clearSeries: { label: "Clear a series", params: { series: "string" } },
        clearPoints: { label: "Clear every series" },
        setVisible: { label: "Show / hide a series", params: { series: "string", visible: "boolean" } },
        setRange: { label: "Show a time range", params: { from: "number", to: "number" }, help: "Stops following live; resetZoom follows again." },
        resetZoom: { label: "Follow live again" }
    },

    view: class extends UIElement {
        static styles = [BASE_CSS, LINE_CHART_CSS];

        canvas = null;
        ctx = null;
        resizeObserver = null;
        intersectionObserver = null;
        _lastDpr = 1;
        _rafPending = false;

        decimator = new M4Decimator(2048);
        _series = new Map();      // key -> { buf, lastRaw, lastText, lastPoint, staticLoaded, dx, dy, n, demo }
        _hidden = new Set();      // series keys hidden from the legend (the page only)

        viewRange = null;         // null = live
        isScrubbing = false;
        isPanning = false;
        dragStartX = 0;
        dragStartMinX = 0;
        dragStartMaxX = 0;
        _moved = false;
        isHoverComb = false;
        hover = null;             // { time, px, py, hits: [{ s, x, y }] }
        _lastHoverEmit = 0;
        _lastRangeEmit = 0;

        // the first series' buffer (tests, simple uses)
        get ringBuffer() { const l = this.seriesList(); return l.length ? this._state(l[0]).buf : new TimeSeriesRingBuffer(50); }

        firstUpdated(changed) {
            super.firstUpdated?.(changed);
            this.setupCanvas();
            this.setupResizeObserver();
            this.setupIntersectionObserver();
            this.prepareData();
            if (this.resizeCanvas()) this.draw();
        }

        connectedCallback() {
            super.connectedCallback();
            if (!this.canvas) this.setupCanvas();
            this.setupResizeObserver();
            this.setupIntersectionObserver();
            this.prepareData();
            requestAnimationFrame(() => { if (this.resizeCanvas()) this.draw(); });
        }

        disconnectedCallback() {
            if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
            if (this.intersectionObserver) { this.intersectionObserver.disconnect(); this.intersectionObserver = null; }
            super.disconnectedCallback();
        }

        scheduleDraw() {
            if (this._rafPending) return;
            this._rafPending = true;
            requestAnimationFrame(() => {
                this._rafPending = false;
                if (this.resizeCanvas()) this.draw();
            });
        }

        // Called by the SDK for EVERY change of a prop, one by one: a point is taken here, never in
        // updated() (Lit batches it: points arriving in one tick would be lost).
        propsChanged() {
            this.prepareData();
        }

        updated(changed) {
            super.updated?.(changed);
            if (!this.canvas) this.setupCanvas();
            this.scheduleDraw();
        }

        // ---- series ----------------------------------------------------------------------------
        seriesList() {
            const raw = Array.isArray(this.p && this.p.series) ? this.p.series : [];
            const d = seriesDefaults();
            return raw.map((s, i) => {
                const o = Object.assign({}, d, s && typeof s === "object" ? s : {});
                o._i = i;
                o._key = String(o.id || o.name || "#" + i);
                return o;
            });
        }

        _state(s) {
            let st = this._series.get(s._key);
            if (!st) {
                st = { buf: new TimeSeriesRingBuffer(Math.max(50, numOr(s.maxPoints, 10000))), lastRaw: null, lastText: null, lastPoint: undefined, staticLoaded: false, dx: null, dy: null, n: 0, demo: false };
                this._series.set(s._key, st);
            }
            return st;
        }

        /** A series by its Id, its name or its index (none: the first). */
        findSeries(ref) {
            const list = this.seriesList();
            if (ref === undefined || ref === null || ref === "") return list[0] || null;
            const byIndex = typeof ref === "number" || /^\d+$/.test(String(ref)) ? list[Number(ref)] : null;
            return list.find((s) => s.id && s.id === String(ref)) || list.find((s) => s.name === String(ref)) || byIndex || null;
        }

        // the stored (unresolved) static value of a series' field: loaded once, not again every time
        // a binding falls through to it
        _rawStatic(i, field) {
            const rs = this.raw && Array.isArray(this.raw.series) ? this.raw.series[i] : null;
            const v = rs && rs[field];
            return v && typeof v === "object" && Array.isArray(v.$bind) ? v.static : undefined;
        }

        prepareData() {
            const list = this.seriesList();
            const live = new Set();
            let dirty = false;
            for (const s of list) {
                live.add(s._key);
                const st = this._state(s);
                const cap = Math.max(50, numOr(s.maxPoints, 10000));
                if (st.buf.capacity !== cap) { st.buf.setCapacity(cap); dirty = true; }
                const xf = s.xField || "x", yf = s.yField || "y";

                // data: an array replaces what the series holds
                let raw = s.data;
                if (typeof raw === "string") {
                    if (raw === st.lastText) raw = st.lastRaw;
                    else {
                        st.lastText = raw;
                        const t = raw.trim();
                        if (t.charAt(0) === "[") { try { raw = JSON.parse(t); } catch (_) { raw = null; } }
                        else raw = null;
                    }
                }
                const stat = this._rawStatic(s._i, "data");
                const isStatic = raw !== null && raw !== undefined && (raw === stat || (typeof stat === "string" && st.lastText === stat));
                if (Array.isArray(raw) && raw !== st.lastRaw && !(isStatic && st.staticLoaded)) {
                    st.lastRaw = raw;
                    if (isStatic) st.staticLoaded = true;
                    st.demo = false;
                    st.buf.loadArray(raw, xf, yf);
                    dirty = true;
                }

                // point: appends ({x, y}, a list of them, or a number = now)
                const pt = s.point;
                if (pt !== undefined && pt !== null && pt !== "" && pt !== "???" && pt !== st.lastPoint && pt !== this._rawStatic(s._i, "point")) {
                    st.lastPoint = pt;
                    if (st.demo) { st.buf.clear(); st.demo = false; }
                    if (this._appendTo(st, Array.isArray(pt) ? pt : [pt], xf, yf)) dirty = true;
                }

                // the canvas: a series with no data shows a sample wave (never saved)
                if (this.isEditor && st.buf.count === 0) { this._demo(st, s._i); dirty = true; }
            }
            for (const k of Array.from(this._series.keys())) if (!live.has(k)) { this._series.delete(k); dirty = true; }
            if (dirty) this.scheduleDraw();
        }

        _appendTo(st, pts, xf, yf) {
            let added = 0;
            for (const p of pts) {
                if (p === null || p === undefined) continue;
                let x, y;
                if (typeof p === "object") { x = Number(p[xf]); y = Number(p[yf]); }
                else { x = Date.now(); y = Number(p); }
                if (Number.isFinite(x) && Number.isFinite(y) && st.buf.push(x, y)) added++;
            }
            return added;
        }

        _demo(st, i) {
            const now = Date.now(), n = 240;
            for (let k = 0; k < n; k++) {
                const t = now - (n - k) * 500;
                st.buf.push(t, Math.round((50 + i * 15 + 18 * Math.sin(k / 18 + i * 1.3) + 6 * Math.sin(k / 5 + i)) * 10) / 10);
            }
            st.demo = true;
        }

        // ---- actions (Logic) -------------------------------------------------------------------
        appendPoints(params) {
            const s = this.findSeries(params && params.series);
            if (!s) return 0;
            const st = this._state(s);
            if (st.demo) { st.buf.clear(); st.demo = false; }
            const added = this._appendTo(st, params && Array.isArray(params.points) ? params.points : [], s.xField || "x", s.yField || "y");
            if (added) { this.scheduleDraw(); this.requestUpdate(); }
            return added;
        }

        setPoints(params) {
            const s = this.findSeries(params && params.series);
            if (!s) return 0;
            const st = this._state(s);
            st.demo = false;
            st.buf.loadArray(params && Array.isArray(params.points) ? params.points : [], s.xField || "x", s.yField || "y");
            this.scheduleDraw();
            this.requestUpdate();
            return st.buf.count;
        }

        clearSeries(params) {
            const s = this.findSeries(params && params.series);
            if (!s) return;
            const st = this._state(s);
            st.buf.clear();
            st.lastRaw = null;
            st.lastText = null;
            this.scheduleDraw();
            this.requestUpdate();
        }

        clearPoints() {
            for (const st of this._series.values()) { st.buf.clear(); st.lastRaw = null; st.lastText = null; }
            this.viewRange = null;
            this.hover = null;
            this.scheduleDraw();
            this.requestUpdate();
        }

        setVisible(params) {
            const s = this.findSeries(params && params.series);
            if (!s) return;
            const on = !(params && (params.visible === false || params.visible === "false" || params.visible === 0));
            if (on) this._hidden.delete(s._key); else this._hidden.add(s._key);
            this.scheduleDraw();
            this.requestUpdate();
        }

        setRange(params) {
            const from = numOr(params && params.from, NaN), to = numOr(params && params.to, NaN);
            if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;
            this.viewRange = { minX: from, maxX: to };
            this.scheduleDraw();
            this.requestUpdate();
        }

        resetZoom() {
            this.viewRange = null;
            this.draw();
            this.requestUpdate();
            this._emitRange(true);
        }

        // ---- canvas ----------------------------------------------------------------------------
        _plotEl() { return this.renderRoot?.querySelector(".plot") || null; }

        setupCanvas() {
            this.canvas = this.renderRoot.querySelector("canvas");
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext("2d");
            if (this.canvas.style.width || this.canvas.style.height) { this.canvas.style.width = ""; this.canvas.style.height = ""; }
            this.resizeCanvas();
        }

        setupResizeObserver() {
            if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
            const plot = this._plotEl();
            if (!plot) return;
            this.resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const cr = entry.contentRect;
                    if (cr && cr.width > 0 && cr.height > 0 && this.resizeCanvas()) this.draw();
                }
            });
            this.resizeObserver.observe(plot);
            this.resizeObserver.observe(this);
        }

        setupIntersectionObserver() {
            if (this.intersectionObserver) { this.intersectionObserver.disconnect(); this.intersectionObserver = null; }
            if (typeof IntersectionObserver === "function") {
                this.intersectionObserver = new IntersectionObserver((entries) => {
                    for (const entry of entries) {
                        if (entry.isIntersecting && entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0 && this.resizeCanvas()) this.draw();
                    }
                });
                this.intersectionObserver.observe(this);
            }
        }

        resizeCanvas() {
            if (!this.canvas) return false;
            const box = this._plotEl() || this;
            const rect = box.getBoundingClientRect();
            const w = Math.floor(rect.width), h = Math.floor(rect.height);
            // tabs / hidden containers: 0 x 0 never collapses the canvas
            if (w <= 0 || h <= 0) return false;
            // a capped DPR on big screens (Smart TV / HMI SoCs): the backing store stays small
            const rawDpr = window.devicePixelRatio || 1;
            const dpr = w >= 1200 ? Math.min(rawDpr, 1.0) : (w >= 800 ? Math.min(rawDpr, 1.25) : Math.min(rawDpr, 1.5));
            const pixelW = Math.floor(w * dpr), pixelH = Math.floor(h * dpr);
            if (this.canvas.style.width || this.canvas.style.height) { this.canvas.style.width = ""; this.canvas.style.height = ""; }
            if (this.canvas.width === pixelW && this.canvas.height === pixelH && this._lastDpr === dpr) return true;
            this._lastDpr = dpr;
            this.canvas.width = pixelW;
            this.canvas.height = pixelH;
            if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            return true;
        }

        _visible() {
            return this.seriesList().filter((s) => s.visible !== false && !this._hidden.has(s._key) && this._state(s).buf.count > 0);
        }

        _bounds(list) {
            let minX = Infinity, maxX = -Infinity;
            for (const s of list) {
                const b = this._state(s).buf.getBounds();
                if (!b) continue;
                if (b.minX < minX) minX = b.minX;
                if (b.maxX > maxX) maxX = b.maxX;
            }
            return Number.isFinite(minX) ? { minX, maxX } : null;
        }

        getPlotMetrics(width, height) {
            const showComb = this.p.showTimeComb !== false;
            const combHeight = showComb ? 30 : 0;
            const right = this._usesRight();
            const titled = !!(this.p.leftTitle || (right && this.p.rightTitle));
            const padLeft = 52, padRight = right ? 52 : 16, padTop = titled ? 22 : 14, padBottom = showComb ? 4 : 26;
            const plotX = padLeft, plotY = padTop;
            const plotW = Math.max(1, width - padLeft - padRight);
            const plotH = Math.max(1, height - padTop - padBottom - combHeight);
            return { padLeft, padRight, padTop, padBottom, plotX, plotY, plotW, plotH, combX: padLeft, combY: plotY + plotH + (showComb ? 4 : 0), combW: plotW, combH: combHeight, showComb };
        }

        _usesRight() {
            return this.seriesList().some((s) => s.axis === "right" && s.visible !== false && !this._hidden.has(s._key));
        }

        colorOf(s) {
            if (s.color && typeof s.color === "string" && s.color.trim()) return s.color.trim();
            if (s._i === 0) {
                const cs = getComputedStyle(this);
                return cs.getPropertyValue("--cp-solid").trim() || cs.getPropertyValue("--nexa-colors-primary-solid").trim() || SERIES_PALETTE[0];
            }
            return SERIES_PALETTE[s._i % SERIES_PALETTE.length];
        }

        clampViewRange(minX, maxX, fullBounds) {
            if (!fullBounds) return { minX, maxX };
            const span = Math.max(10, maxX - minX), margin = span * 0.1;
            let cMin = minX, cMax = maxX;
            if (cMin < fullBounds.minX - margin) { cMin = fullBounds.minX - margin; cMax = cMin + span; }
            if (cMax > fullBounds.maxX + margin) { cMax = fullBounds.maxX + margin; cMin = cMax - span; }
            return { minX: cMin, maxX: cMax };
        }

        getEffectiveTimeRange(fullBounds) {
            if (!fullBounds) return { vMinX: 0, vMaxX: 1 };
            if (this.viewRange) {
                const c = this.clampViewRange(this.viewRange.minX, this.viewRange.maxX, fullBounds);
                return { vMinX: c.minX, vMaxX: c.maxX };
            }
            const windowMs = parseTimeWindow(this.p.timeWindow);
            if (windowMs > 0) return { vMinX: Math.max(fullBounds.minX, fullBounds.maxX - windowMs), vMaxX: fullBounds.maxX };
            return { vMinX: fullBounds.minX, vMaxX: fullBounds.maxX };
        }

        // the decimated points of a series in [vMinX, vMaxX], kept in its own arrays (the decimator's are reused)
        _decimate(s, vMinX, vMaxX, plotW) {
            const st = this._state(s), buf = st.buf;
            const startIdx = Math.max(0, lowerBoundRing(buf, vMinX) - 1);
            const endIdx = Math.min(buf.count, upperBoundRing(buf, vMaxX) + 1);
            const n = this.decimator.decimate(buf, startIdx, endIdx, Math.floor(plotW), vMinX, vMaxX);
            if (!st.dx || st.dx.length < n) { st.dx = new Float64Array(Math.max(n, 256)); st.dy = new Float64Array(Math.max(n, 256)); }
            st.dx.set(this.decimator.outX.subarray(0, n));
            st.dy.set(this.decimator.outY.subarray(0, n));
            st.n = n;
            return st;
        }

        _yRange(list, axis) {
            let lo = Infinity, hi = -Infinity;
            for (const s of list) {
                if ((s.axis === "right" ? "right" : "left") !== axis) continue;
                const st = this._state(s);
                for (let i = 0; i < st.n; i++) { const y = st.dy[i]; if (y < lo) lo = y; if (y > hi) hi = y; }
            }
            if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
            if (lo === hi) { const pad = Math.abs(lo) * 0.1 || 1; lo -= pad; hi += pad; }
            else { const pad = (hi - lo) * 0.08; lo -= pad; hi += pad; }
            const fMin = numOr(this.p[axis + "Min"], NaN), fMax = numOr(this.p[axis + "Max"], NaN);
            if (Number.isFinite(fMin)) lo = fMin;
            if (Number.isFinite(fMax)) hi = fMax;
            if (hi <= lo) hi = lo + 1;
            return { lo, hi };
        }

        draw() {
            if (!this.canvas || !this.ctx) return;
            const box = this._plotEl() || this.canvas;
            const rect = box.getBoundingClientRect();
            const width = rect.width, height = rect.height;
            if (width <= 0 || height <= 0) return;
            if (!this.resizeCanvas()) return;

            const ctx = this.ctx;
            ctx.clearRect(0, 0, width, height);
            const list = this._visible();
            this._updateLegend(null);
            if (!list.length) return;

            const fullBounds = this._bounds(list);
            if (!fullBounds) return;
            const { vMinX, vMaxX } = this.getEffectiveTimeRange(fullBounds);
            if (!Number.isFinite(vMinX) || !Number.isFinite(vMaxX)) return;
            const m = this.getPlotMetrics(width, height);
            const { plotX, plotY, plotW, plotH } = m;

            for (const s of list) this._decimate(s, vMinX, vMaxX, plotW);
            const yr = { left: this._yRange(list, "left"), right: this._usesRight() ? this._yRange(list, "right") : null };

            const xSpan = Math.max(1, vMaxX - vMinX);
            const toX = (x) => plotX + ((x - vMinX) / xSpan) * plotW;
            const toY = (y, axis) => { const r = yr[axis] || yr.left; return plotY + plotH - ((y - r.lo) / (r.hi - r.lo)) * plotH; };
            this._scale = { vMinX, vMaxX, toX, toY, m, yr };

            this.drawAxesAndGrid(ctx, plotX, plotY, plotW, plotH, vMinX, vMaxX, yr, m.showComb);

            ctx.save();
            ctx.beginPath();
            ctx.rect(plotX, plotY, plotW, plotH);
            ctx.clip();
            // the list's order is the layer order: the first is drawn first (under the others)
            for (const s of list) this._drawSeries(ctx, s, toX, toY, plotY, plotH);
            this._drawThresholds(ctx, toY, plotX, plotW);
            this._drawHover(ctx, toX, toY, plotY, plotH);
            ctx.restore();

            if (m.showComb) this.drawTimeComb(ctx, vMinX, vMaxX, m.combX, m.combY, m.combW, m.combH);
            this._updateLegend(list, vMinX, vMaxX);
        }

        // the runs of a series between gaps (a silence longer than gapAfter): [start, end) pairs
        _runs(st, gapAfter) {
            const runs = [];
            let start = 0;
            for (let i = 1; i < st.n; i++) {
                if (gapAfter > 0 && st.dx[i] - st.dx[i - 1] > gapAfter) { runs.push(start, i); start = i; }
            }
            if (st.n) runs.push(start, st.n);
            return runs;
        }

        // the path of one run, by variant (line / step / smooth)
        _tracePath(ctx, st, a, b, s, toX, toY) {
            const axis = s.axis === "right" ? "right" : "left";
            const X = (i) => toX(st.dx[i]), Y = (i) => toY(st.dy[i], axis);
            ctx.moveTo(X(a), Y(a));
            if (s.variant === "step") {
                for (let i = a + 1; i < b; i++) {
                    if (s.step === "before") ctx.lineTo(X(i - 1), Y(i));
                    else if (s.step === "center") { const mx = (X(i - 1) + X(i)) / 2; ctx.lineTo(mx, Y(i - 1)); ctx.lineTo(mx, Y(i)); }
                    else ctx.lineTo(X(i), Y(i - 1));
                    ctx.lineTo(X(i), Y(i));
                }
                return;
            }
            if (s.variant === "smooth" && b - a > 2) {
                // monotone cubic (Fritsch–Carlson): smooth, never overshoots a peak
                const n = b - a, xs = new Float64Array(n), ys = new Float64Array(n), d = new Float64Array(n), t = new Float64Array(n);
                for (let k = 0; k < n; k++) { xs[k] = X(a + k); ys[k] = Y(a + k); }
                for (let k = 0; k < n - 1; k++) { const h = xs[k + 1] - xs[k]; d[k] = h ? (ys[k + 1] - ys[k]) / h : 0; }
                t[0] = d[0]; t[n - 1] = d[n - 2];
                for (let k = 1; k < n - 1; k++) t[k] = d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
                for (let k = 0; k < n - 1; k++) {
                    if (d[k] === 0) { t[k] = 0; t[k + 1] = 0; continue; }
                    const al = t[k] / d[k], be = t[k + 1] / d[k], q = al * al + be * be;
                    if (q > 9) { const tau = 3 / Math.sqrt(q); t[k] = tau * al * d[k]; t[k + 1] = tau * be * d[k]; }
                }
                for (let k = 0; k < n - 1; k++) {
                    const h = (xs[k + 1] - xs[k]) / 3;
                    ctx.bezierCurveTo(xs[k] + h, ys[k] + t[k] * h, xs[k + 1] - h, ys[k + 1] - t[k + 1] * h, xs[k + 1], ys[k + 1]);
                }
                return;
            }
            for (let i = a + 1; i < b; i++) ctx.lineTo(X(i), Y(i));
        }

        _drawSeries(ctx, s, toX, toY, plotY, plotH) {
            const st = this._state(s);
            if (!st.n) return;
            const color = this.colorOf(s);
            const axis = s.axis === "right" ? "right" : "left";
            const lw = numOr(s.width, 2);
            const runs = this._runs(st, numOr(s.gapAfter, 0));
            const base = plotY + plotH;
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, numOr(s.opacity, 1)));

            if (s.variant === "bars") {
                const w = Math.max(1, Math.min(24, ((toX(st.dx[st.n - 1]) - toX(st.dx[0])) / Math.max(1, st.n)) * 0.7));
                const r = (this._scale.yr[axis] || this._scale.yr.left);
                const zero = toY(Math.max(r.lo, Math.min(r.hi, 0)), axis);
                ctx.fillStyle = color;
                for (let i = 0; i < st.n; i++) {
                    const x = toX(st.dx[i]), y = toY(st.dy[i], axis);
                    ctx.fillRect(x - w / 2, Math.min(y, zero), w, Math.max(1, Math.abs(zero - y)));
                }
                ctx.restore();
                return;
            }

            // fill under the line, per run
            if (s.fill && s.fill !== "none" && s.variant !== "points" && st.n > 1) {
                const fo = Math.max(0, Math.min(1, numOr(s.fillOpacity, 0.25)));
                let style;
                if (s.fill === "gradient") {
                    style = ctx.createLinearGradient(0, plotY, 0, base);
                    style.addColorStop(0, this.hexToRgba(color, fo));
                    style.addColorStop(1, this.hexToRgba(color, 0.01));
                } else style = this.hexToRgba(color, fo);
                ctx.fillStyle = style;
                for (let r = 0; r < runs.length; r += 2) {
                    const a = runs[r], b = runs[r + 1];
                    if (b - a < 2) continue;
                    ctx.beginPath();
                    this._tracePath(ctx, st, a, b, s, toX, toY);
                    ctx.lineTo(toX(st.dx[b - 1]), base);
                    ctx.lineTo(toX(st.dx[a]), base);
                    ctx.closePath();
                    ctx.fill();
                }
            }

            // the line
            if (s.variant !== "points") {
                ctx.strokeStyle = color;
                ctx.lineWidth = lw;
                ctx.lineJoin = "round";
                ctx.lineCap = "round";
                ctx.setLineDash(DASHES[s.dash] || []);
                for (let r = 0; r < runs.length; r += 2) {
                    const a = runs[r], b = runs[r + 1];
                    if (b - a === 1) {
                        // a lone point (between gaps / the only one): a dot
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(toX(st.dx[a]), toY(st.dy[a], axis), Math.max(3, lw * 1.5), 0, Math.PI * 2);
                        ctx.fill();
                        continue;
                    }
                    ctx.beginPath();
                    this._tracePath(ctx, st, a, b, s, toX, toY);
                    ctx.stroke();
                }
                ctx.setLineDash([]);
            }

            // the points
            if (s.points || s.variant === "points") {
                ctx.fillStyle = color;
                const pr = numOr(s.pointRadius, 3);
                for (let i = 0; i < st.n; i++) this._marker(ctx, s.pointShape, toX(st.dx[i]), toY(st.dy[i], axis), pr);
            }
            ctx.restore();
        }

        _marker(ctx, shape, x, y, r) {
            ctx.beginPath();
            if (shape === "square") ctx.rect(x - r, y - r, r * 2, r * 2);
            else if (shape === "diamond") { ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r * 1.3, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r * 1.3, y); ctx.closePath(); }
            else ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        _drawThresholds(ctx, toY, plotX, plotW) {
            const list = Array.isArray(this.p.thresholds) ? this.p.thresholds : [];
            if (!list.length) return;
            const cs = getComputedStyle(this);
            ctx.save();
            ctx.font = "10px " + (cs.getPropertyValue("--mono") || "monospace");
            ctx.textAlign = "right";
            ctx.textBaseline = "bottom";
            for (const t of list) {
                const v = numOr(t && t.value, NaN);
                const axis = t && t.axis === "right" && this._scale.yr.right ? "right" : "left";
                if (!Number.isFinite(v)) continue;
                const y = Math.round(toY(v, axis)) + 0.5;
                ctx.strokeStyle = (t && t.color) || "#ef4444";
                ctx.lineWidth = 1;
                ctx.setLineDash(DASHES[t && t.dash] || DASHES.dashed);
                ctx.beginPath();
                ctx.moveTo(plotX, y);
                ctx.lineTo(plotX + plotW, y);
                ctx.stroke();
                if (t && t.label) {
                    ctx.fillStyle = (t && t.color) || "#ef4444";
                    ctx.fillText(String(t.label), plotX + plotW - 4, y - 2);
                }
            }
            ctx.setLineDash([]);
            ctx.restore();
        }

        _drawHover(ctx, toX, toY, plotY, plotH) {
            const h = this.hover;
            if (!h || !h.hits.length) return;
            const hx = toX(h.time);
            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
            ctx.lineWidth = 1;
            ctx.moveTo(hx, plotY);
            ctx.lineTo(hx, plotY + plotH);
            ctx.stroke();
            ctx.setLineDash([]);
            for (const hit of h.hits) {
                ctx.beginPath();
                ctx.fillStyle = this.colorOf(hit.s);
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 2;
                ctx.arc(toX(hit.x), toY(hit.y, hit.s.axis === "right" ? "right" : "left"), 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        }

        _tick(v) {
            let s = Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.abs(v) < 1 ? v.toFixed(2) : v.toFixed(1);
            if (s.endsWith(".0")) s = s.slice(0, -2);
            if (s.endsWith(".0k")) s = s.slice(0, -3) + "k";
            return s;
        }

        drawAxesAndGrid(ctx, px, py, pw, ph, minX, maxX, yr, showComb) {
            ctx.save();
            const cs = getComputedStyle(this);
            const gridColor = cs.getPropertyValue("--bd").trim() || "rgba(255, 255, 255, 0.08)";
            const textColor = cs.getPropertyValue("--fg-muted").trim() || "rgba(255, 255, 255, 0.5)";
            ctx.font = "10px " + (cs.getPropertyValue("--mono") || "monospace");
            const yTicksCount = Math.max(3, Math.min(6, Math.floor(ph / 45)));

            const axisTicks = (r, side) => {
                const range = r.hi - r.lo;
                const step = niceNum(range / yTicksCount, false);
                ctx.textAlign = side === "left" ? "right" : "left";
                ctx.textBaseline = "middle";
                for (let v = Math.ceil(r.lo / step) * step; v <= r.hi; v += step) {
                    const sy = py + ph - ((v - r.lo) / range) * ph;
                    if (sy < py || sy > py + ph) continue;
                    if (side === "left" && this.p.showGrid) {
                        ctx.beginPath();
                        ctx.strokeStyle = gridColor;
                        ctx.lineWidth = 1;
                        ctx.moveTo(px, sy);
                        ctx.lineTo(px + pw, sy);
                        ctx.stroke();
                    }
                    ctx.fillStyle = textColor;
                    ctx.fillText(this._tick(v), side === "left" ? px - 6 : px + pw + 6, sy);
                }
            };
            axisTicks(yr.left, "left");
            if (yr.right) axisTicks(yr.right, "right");

            // axis titles, above their ticks
            ctx.textBaseline = "top";
            ctx.fillStyle = textColor;
            if (this.p.leftTitle) { ctx.textAlign = "left"; ctx.fillText(String(this.p.leftTitle), 4, 3); }
            if (yr.right && this.p.rightTitle) { ctx.textAlign = "right"; ctx.fillText(String(this.p.rightTitle), px + pw + 48, 3); }

            // x ticks without the time ruler
            if (!showComb) {
                const xTicksCount = Math.max(2, Math.min(6, Math.floor(pw / 100)));
                const xSpan = maxX - minX;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                for (let i = 0; i <= xTicksCount; i++) {
                    const ratio = i / xTicksCount, tx = minX + ratio * xSpan, sx = px + ratio * pw;
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

            ctx.fillStyle = combBg;
            ctx.fillRect(px, py, pw, ph);
            ctx.beginPath();
            ctx.strokeStyle = tickColor;
            ctx.lineWidth = 1;
            ctx.moveTo(px, py);
            ctx.lineTo(px + pw, py);
            ctx.stroke();

            const isMajorAt = (t) => { const rem = Math.abs(t % majorStep); return rem < (minorStep * 0.2) || Math.abs(rem - majorStep) < (minorStep * 0.2); };
            if (this.p.showGrid) {
                ctx.beginPath();
                ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
                ctx.lineWidth = 1;
                for (let t = firstMinor; t <= maxX + minorStep; t += minorStep) {
                    const sx = px + ((t - minX) / span) * pw;
                    if (sx < px || sx > px + pw) continue;
                    if (isMajorAt(t)) { ctx.moveTo(sx, 14); ctx.lineTo(sx, py); }
                }
                ctx.stroke();
            }

            ctx.beginPath();
            ctx.strokeStyle = tickColor;
            ctx.lineWidth = 1;
            const majorList = [];
            for (let t = firstMinor; t <= maxX + minorStep; t += minorStep) {
                const sx = px + ((t - minX) / span) * pw;
                if (sx < px || sx > px + pw) continue;
                if (isMajorAt(t)) majorList.push({ x: sx, time: t });
                else { ctx.moveTo(sx, py); ctx.lineTo(sx, py + 4); }
            }
            ctx.stroke();

            ctx.beginPath();
            ctx.strokeStyle = majorColor;
            ctx.lineWidth = 1.2;
            for (const item of majorList) { ctx.moveTo(item.x, py); ctx.lineTo(item.x, py + 8); }
            ctx.stroke();

            ctx.font = "10px " + (cs.getPropertyValue("--mono") || "monospace");
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = textColor;
            for (const item of majorList) ctx.fillText(formatCombTick(item.time, span, majorStep), item.x, py + 12);
            ctx.restore();
        }

        hexToRgba(hexOrRgb, alpha) {
            if (!hexOrRgb) return `rgba(59, 130, 246, ${alpha})`;
            if (hexOrRgb.startsWith("rgb")) {
                return hexOrRgb.replace(/rgba?\(([^)]+)\)/, (m, val) => `rgba(${val.split(",").slice(0, 3).map((s) => s.trim()).join(",")}, ${alpha})`);
            }
            let hex = hexOrRgb.replace("#", "");
            if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
            const num = parseInt(hex, 16);
            if (isNaN(num)) return `rgba(59, 130, 246, ${alpha})`;
            return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
        }

        // ---- legend (DOM, updated in place: no Lit render per frame) -----------------------------
        _updateLegend(list, vMinX, vMaxX) {
            const el = this.renderRoot && this.renderRoot.querySelector(".legend");
            if (!el || !list) return;
            const mode = this.p.legendValue || "last";
            const out = { min: 0, max: 0, minAt: 0, maxAt: 0 };
            for (const s of list) {
                const v = el.querySelector(`.lg-item[data-key="${CSS.escape(s._key)}"] .lg-val`);
                if (!v) continue;
                const buf = this._state(s).buf;
                let y = NaN;
                if (mode === "last" && buf.count) y = buf.getY(buf.count - 1);
                else if ((mode === "min" || mode === "max") && buf.count) {
                    const i0 = Math.max(0, lowerBoundRing(buf, vMinX)), i1 = Math.min(buf.count, upperBoundRing(buf, vMaxX));
                    if (i1 > i0) { buf.rangeMinMax(i0, i1, out); y = mode === "min" ? out.min : out.max; }
                }
                v.textContent = mode === "none" || !Number.isFinite(y) ? "" : (s.prefix || "") + fmtValue(y, s.decimals) + (s.suffix || "") + (s.unit ? " " + s.unit : "");
            }
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
            this.emit("seriesToggle", { series: s.id || s.name, visible: !this._hidden.has(s._key) });
            this.hover = null;
            this.requestUpdate();
            this.scheduleDraw();
        }

        // ---- pointer ---------------------------------------------------------------------------
        getHitZone(clientX, clientY) {
            const box = this._plotEl();
            if (!box) return "none";
            const rect = box.getBoundingClientRect();
            const x = clientX - rect.left, y = clientY - rect.top;
            const m = this.getPlotMetrics(rect.width, rect.height);
            if (m.showComb && x >= m.combX && x <= m.combX + m.combW && y >= m.combY && y <= m.combY + m.combH) return "comb";
            if (x >= m.plotX && x <= m.plotX + m.plotW && y >= m.plotY && y <= m.plotY + m.plotH) return "plot";
            return "none";
        }

        onPointerDown(e) {
            if (e.button !== 0 || !this.canvas) return;
            const zone = this.getHitZone(e.clientX, e.clientY);
            if (zone === "none") return;
            const fullBounds = this._bounds(this._visible());
            if (!fullBounds) return;
            const { vMinX, vMaxX } = this.getEffectiveTimeRange(fullBounds);
            this.dragStartX = e.clientX;
            this.dragStartMinX = vMinX;
            this.dragStartMaxX = vMaxX;
            this._moved = false;
            const box = this._plotEl();
            if (zone === "comb") {
                this.isScrubbing = true;
                if (box) box.classList.add("scrubbing");
                try { e.target.setPointerCapture(e.pointerId); } catch (_) { }
            } else if (zone === "plot") {
                this._downAt = { x: e.clientX, y: e.clientY };
                if (this.p.enableZoomPan) {
                    this.isPanning = true;
                    if (box) box.classList.add("dragging");
                    try { e.target.setPointerCapture(e.pointerId); } catch (_) { }
                }
            }
        }

        // what is under the cursor: each series' point closest to its time (shared), or the
        // nearest one on the screen (nearest)
        _hits(px, py, time) {
            const sc = this._scale;
            if (!sc) return [];
            const span = sc.vMaxX - sc.vMinX;
            const fixed = numOr(this.p.matchWithin, 0);
            const hits = [];
            for (const s of this._visible()) {
                if (s.tooltip === false && this.p.tooltipMode !== "nearest") continue;
                const buf = this._state(s).buf;
                // automatic: about this series' own spacing in view (a slow series still shows next to a fast one)
                let within = fixed;
                if (!(within > 0)) {
                    const n = Math.max(1, upperBoundRing(buf, sc.vMaxX) - lowerBoundRing(buf, sc.vMinX));
                    within = Math.max(span * 0.01, (span / n) * 0.75);
                }
                const idx = buf.findClosestIndex(time);
                if (idx < 0) continue;
                const x = buf.getX(idx), y = buf.getY(idx);
                if (Math.abs(x - time) > within) continue;
                hits.push({ s, x, y, d: Math.hypot(sc.toX(x) - px, sc.toY(y, s.axis === "right" ? "right" : "left") - py) });
            }
            if (this.p.tooltipMode === "nearest" && hits.length) {
                hits.sort((a, b) => a.d - b.d);
                return [hits[0]];
            }
            return hits;
        }

        _showTooltip(px, py, rectW) {
            const tip = this.renderRoot.querySelector(".tooltip");
            if (!tip) return;
            const h = this.hover;
            const rows = h ? h.hits.filter((x) => x.s.tooltip !== false) : [];
            if (!rows.length || this.p.tooltipMode === "off") { tip.style.display = "none"; return; }
            tip.querySelector(".tooltip-time").textContent = formatTooltipTime(h.time);
            const body = tip.querySelector(".tooltip-rows");
            while (body.children.length > rows.length) body.removeChild(body.lastChild);
            rows.forEach((hit, i) => {
                let row = body.children[i];
                if (!row) {
                    row = document.createElement("div");
                    row.className = "tooltip-row";
                    row.innerHTML = '<span class="tooltip-dot"></span><span class="tooltip-name"></span><span class="tooltip-val"></span>';
                    body.appendChild(row);
                }
                const s = hit.s;
                row.children[0].style.background = this.colorOf(s);
                row.children[1].textContent = (s.tooltipLabel || s.name || "Value") + ":";
                row.children[2].textContent = (s.prefix || "") + fmtValue(hit.y, s.decimals) + (s.suffix || "") + (s.unit ? " " + s.unit : "");
            });
            const flip = px > rectW - 170;
            tip.style.display = "block";
            tip.style.left = `${Math.round(flip ? px - 12 : px + 12)}px`;
            tip.style.top = `${Math.round(py)}px`;
            tip.style.transform = flip ? "translate(-100%, -50%)" : "translate(0, -50%)";
        }

        onPointerMove(e) {
            const box = this._plotEl();
            if (!this.canvas || !box) return;
            const rect = box.getBoundingClientRect();
            const m = this.getPlotMetrics(rect.width, rect.height);
            const px = e.clientX - rect.left, py = e.clientY - rect.top;

            if (this.isScrubbing || this.isPanning) {
                const dx = e.clientX - this.dragStartX;
                if (Math.abs(dx) > 3) this._moved = true;
                if (!this._moved) return;
                const timeDelta = (dx / m.plotW) * (this.dragStartMaxX - this.dragStartMinX);
                this.viewRange = this.clampViewRange(this.dragStartMinX - timeDelta, this.dragStartMaxX - timeDelta, this._bounds(this._visible()));
                this.draw();
                return;
            }

            const overComb = m.showComb && px >= m.combX && px <= m.combX + m.combW && py >= m.combY && py <= m.combY + m.combH;
            if (overComb !== this.isHoverComb) {
                this.isHoverComb = overComb;
                box.classList.toggle("hover-comb", overComb);
            }
            if (overComb || px < m.plotX || px > m.plotX + m.plotW || py < m.plotY || py > m.plotY + m.plotH || !this._scale) {
                if (this.hover) { this.hover = null; this.draw(); }
                this._showTooltip(0, 0, 0);
                return;
            }
            const sc = this._scale;
            const time = sc.vMinX + ((px - m.plotX) / m.plotW) * (sc.vMaxX - sc.vMinX);
            const hits = this._hits(px, py, time);
            this.hover = { time: hits.length ? hits[0].x : time, px, py, hits };
            this.draw();
            this._showTooltip(px, py, rect.width);
            // Logic hears it (a shared crosshair through a variable, …), at most 10 times a second
            const now = Date.now();
            if (now - this._lastHoverEmit > 100) {
                this._lastHoverEmit = now;
                const values = {};
                hits.forEach((h) => { values[h.s.id || h.s.name] = h.y; });
                this.emit("hover", { time: this.hover.time, values });
            }
        }

        _emitRange(live) {
            const sc = this._scale;
            if (!sc) return;
            this.emit("rangeChange", { from: sc.vMinX, to: sc.vMaxX, live: !!live || !this.viewRange });
        }

        onPointerUp(e) {
            const box = this._plotEl();
            const dragged = this._moved;
            if (this.isScrubbing || this.isPanning) {
                try { e.target.releasePointerCapture(e.pointerId); } catch (_) { }
                this.isScrubbing = false;
                this.isPanning = false;
                if (box) { box.classList.remove("scrubbing"); box.classList.remove("dragging"); }
                if (dragged) { this.requestUpdate(); this._emitRange(false); }
            }
            // a click (no drag) on a point
            if (!dragged && this._downAt && this.hover && this.hover.hits.length) {
                const hit = this.hover.hits.slice().sort((a, b) => a.d - b.d)[0];
                if (hit.d <= 12) this.emit("pointClick", { series: hit.s.id || hit.s.name, x: hit.x, y: hit.y });
            }
            this._downAt = null;
        }

        onWheel(e) {
            if (!this.p.enableZoomPan || !this.canvas) return;
            e.preventDefault();
            const box = this._plotEl();
            if (!box) return;
            const rect = box.getBoundingClientRect();
            const m = this.getPlotMetrics(rect.width, rect.height);
            const cursorX = e.clientX - rect.left, cursorY = e.clientY - rect.top;
            const fullBounds = this._bounds(this._visible());
            if (!fullBounds) return;
            const { vMinX, vMaxX } = this.getEffectiveTimeRange(fullBounds);
            const curSpan = vMaxX - vMinX;
            const overComb = m.showComb && cursorX >= m.combX && cursorX <= m.combX + m.combW && cursorY >= m.combY && cursorY <= m.combY + m.combH;

            if (overComb && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
                const scrollDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
                const shift = (scrollDelta / m.plotW) * curSpan * 0.4;
                this.viewRange = this.clampViewRange(vMinX + shift, vMaxX + shift, fullBounds);
            } else {
                if (cursorX < m.plotX || cursorX > m.plotX + m.plotW) return;
                const ratio = (cursorX - m.plotX) / m.plotW;
                const cursorTime = vMinX + ratio * curSpan;
                const newSpan = curSpan * (e.deltaY < 0 ? 0.75 : 1.33);
                if (newSpan < 10 && e.deltaY < 0) return;
                this.viewRange = this.clampViewRange(cursorTime - ratio * newSpan, cursorTime + (1 - ratio) * newSpan, fullBounds);
            }
            this.draw();
            this.requestUpdate();
            const now = Date.now();
            if (now - this._lastRangeEmit > 150) { this._lastRangeEmit = now; this._emitRange(false); }
        }

        onPointerLeave() {
            if (this.hover) { this.hover = null; this.draw(); }
            this._showTooltip(0, 0, 0);
            this.isHoverComb = false;
            const box = this._plotEl();
            if (box) box.classList.remove("hover-comb");
        }

        render() {
            const all = this.seriesList();
            const hasData = all.some((s) => this._state(s).buf.count > 0);
            const legendAt = this.p.legend || "bottom";
            const legendList = all.filter((s) => s.legend !== false);
            const legend = legendAt === "none" || !legendList.length ? "" : html`
                <div class="legend" part="legend">
                    ${legendList.map((s) => html`
                        <button type="button" class="lg-item ${this._hidden.has(s._key) || s.visible === false ? "off" : ""}" data-key="${s._key}"
                            title="Click: show / hide. Alt+click: only this one."
                            @click=${(e) => this._toggle(s, e)}>
                            <span class="lg-swatch" style="background:${this.colorOf(s)}"></span>
                            <span class="lg-name">${s.name || "Series " + (s._i + 1)}</span>
                            <span class="lg-val"></span>
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
                        @pointerleave=${() => this.onPointerLeave()}
                        @dblclick=${() => this.resetZoom()}>
                        <canvas></canvas>
                        ${this.viewRange ? html`
                            <button class="btn-reset-zoom" @click=${() => this.resetZoom()} title="Double click the chart or click here to follow live again">
                                <i class="fa fa-undo"></i> Reset zoom / <span class="live-dot"></span> Live
                            </button>` : ""}
                        <div class="tooltip"><div class="tooltip-time"></div><div class="tooltip-rows"></div></div>
                        ${!hasData ? html`
                            <div class="empty">
                                <i class="fa fa-line-chart" style="font-size: 24px; opacity: 0.4;"></i>
                                <span>No data received</span>
                            </div>` : ""}
                    </div>
                    ${legendAt !== "top" ? legend : ""}
                </div>
            `;
        }
    }
});
