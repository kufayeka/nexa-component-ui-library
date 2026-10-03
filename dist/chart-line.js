import { html, css, asBinding, formatValue, formatParts, evaluateExpression } from "../../nexa-sdk/nexa-component-sdk.js";
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

    /* the time ruler / navigator: it says it can be dragged */
    .plot.hover-ruler { cursor: grab; }
    .plot.hover-edge { cursor: ew-resize; }
    .plot.dragging { cursor: grabbing !important; }
    .plot.scrubbing { cursor: grabbing !important; }
    .plot.selecting { cursor: col-resize !important; }

    .corner {
        position: absolute;
        top: 6px;
        right: 8px;
        z-index: 5;
        display: flex;
        gap: 6px;
    }

    .btn-chip {
        background: rgba(30, 34, 40, 0.88);
        color: #cbd5e1;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        padding: 3px 8px;
        font-size: 10.5px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
        font-family: var(--nexa-fonts-mono, monospace);
    }

    .btn-chip:hover { background: rgba(50, 56, 65, 0.98); color: #fff; }

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
    .tooltip-text { color: #e2e8f0; }

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
// Nexa Line Chart Component Definition (v3: series are Logic targets)
// =============================================================================
//
// In Logic, a chart is:
//   - ONE "Update chart" node: the chart's own props (time range, time axis, axes, tooltip,
//     legend, thresholds, zoom & pan, export…) and its actions (Follow live, Show a range, Export);
//   - per series, its OWN Update node (its props + Append / Replace / Clear / Show / Hide) and its
//     OWN message: a series field bound to Message reads what ITS node got (two series can both
//     read msg.payload, each from its own node);
//   - events of the chart (range change, live / paused, hover, click, range select, legend) and of
//     each series (point click, threshold crossed, stale, resume).
// A series' data: its Live value (a tag / a variable: every new value is a point, x = now) and/or its
// Update node's Append / Replace. Every point kept (Float64), drawn at pixel accuracy (M4 + LOD).

const SERIES_PALETTE = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];

const opt = (list) => list.map((x) => (Array.isArray(x) ? { value: x[0], label: x[1] } : { value: x, label: String(x) }));

const NOTATIONS = [["standard", "As it is (1,234.5)"], ["compact", "Short (1.2K 3.4M 5B)"], ["si", "Engineering (1.5 MW, 2 ms)"], ["scientific", "Scientific (1.23e6)"]];
const DECIMALS = [["auto", "Automatic"], "0", "1", "2", "3", "4"];
const SPANS = [["", "No limit"], ["100ms", "100 ms"], ["1s", "1 second"], ["10s", "10 seconds"], ["1m", "1 minute"], ["10m", "10 minutes"], ["1h", "1 hour"],
    ["6h", "6 hours"], ["24h", "24 hours"], ["7d", "7 days"], ["30d", "30 days"], ["1y", "1 year"]];
const WINDOWS = [["auto", "Everything it holds"], ["30s", "Last 30 seconds"], ["1m", "Last 1 minute"], ["5m", "Last 5 minutes"], ["15m", "Last 15 minutes"],
    ["30m", "Last 30 minutes"], ["1h", "Last 1 hour"], ["3h", "Last 3 hours"], ["6h", "Last 6 hours"], ["12h", "Last 12 hours"], ["24h", "Last 24 hours"],
    ["7d", "Last 7 days"], ["14d", "Last 14 days"], ["1M", "Last month (30 days)"], ["3M", "Last 3 months"], ["6M", "Last 6 months"], ["1y", "Last year"]];

// "10s" / "5m" / "100ms" -> ms (0: none)
function spanMs(v) {
    if (v === undefined || v === null || v === "" || v === "auto") return 0;
    if (typeof v === "number") return v;
    const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|M|y)$/.exec(String(v).trim());
    if (!m) return 0;
    const n = Number(m[1]);
    return n * ({ ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, M: 2592000000, y: 31536000000 })[m[2]];
}

const SERIES_FIELDS = {
    name: { type: "string", label: "Name", default: "Series" },
    id: { type: "string", label: "Id", default: "", bindable: false,
        help: "Fixed (renaming the series keeps it): its Update node and events find the series by it." },
    visible: { type: "boolean", label: "Visible", default: true },
    legend: { type: "boolean", label: "In the legend", default: true },

    live: { type: "tag", access: "read", section: "Data", label: "Live value",
        help: "A tag or a variable: every new value is one more point (its time = now). A {x, y} or a list of them is added as it is. Points from Logic: this series' Update node (Append / Replace)." },
    xField: { type: "string", section: "Data", label: "Time field (x)", default: "x", bindable: false, help: "In the points a message brings: [{x, y}, …]." },
    yField: { type: "string", section: "Data", label: "Value field (y)", default: "y", bindable: false },
    maxPoints: { type: "number", section: "Data", label: "Points kept", default: 10000, min: 50, max: 2000000, step: 500,
        help: "A ring: past it, the oldest go. 16 bytes a point (1 000 000 = 16 MB)." },
    gapAfter: { type: "number", section: "Data", label: "Break the line after (ms without data)", default: 0, min: 0, step: 1000,
        help: "0 = always connected. A longer silence draws a gap: a sensor offline is not a straight line." },
    staleAfter: { type: "number", section: "Data", label: "Stale after (ms without data)", default: 0, min: 0, step: 1000,
        help: "0 = never. No new point for this long: the series fires On Stale (and On Resume when data comes back)." },
    timeShift: { type: "enum", section: "Data", label: "Time shift", default: "",
        options: opt([["", "None"], ["1h", "+1 hour"], ["1d", "+1 day (yesterday over today)"], ["7d", "+1 week"], ["30d", "+30 days"]]),
        help: "Draws the series later by this much: yesterday's curve over today's, to compare." },

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

    axis: { type: "enum", section: "Axis & numbers", label: "Y axis", default: "left", options: opt([["left", "Left"], ["right", "Right"]]) },
    unit: { type: "string", section: "Axis & numbers", label: "Unit (°C, kW, %)", default: "" },
    notation: { type: "enum", section: "Axis & numbers", label: "Number notation", default: "axis", options: opt([["axis", "Like its axis"]].concat(NOTATIONS)) },
    decimals: { type: "enum", section: "Axis & numbers", label: "Decimals", default: "axis", options: opt([["axis", "Like its axis"]].concat(DECIMALS)) },

    tooltip: { type: "boolean", section: "Tooltip", label: "In the tooltip", default: true },
    tooltipMode: { type: "enum", section: "Tooltip", label: "Text", default: "simple", options: opt([["simple", "Simple"], ["expression", "Expression"]]) },
    tooltipLabel: { type: "string", section: "Tooltip", label: "Label", default: "", help: "Empty: the name.", visibleWhen: (s) => s.tooltipMode !== "expression" },
    prefix: { type: "string", section: "Tooltip", label: "Before the value", default: "", visibleWhen: (s) => s.tooltipMode !== "expression" },
    suffix: { type: "string", section: "Tooltip", label: "After the value", default: "", help: "The unit follows it.", visibleWhen: (s) => s.tooltipMode !== "expression" },
    expression: { type: "string", section: "Tooltip", label: "Expression", default: "{name}: fmt({value}) \" \" {unit}", visibleWhen: (s) => s.tooltipMode === "expression",
        help: "{value} {name} {unit} {time} {delta} (from the point before) {min} {max} {avg} (shown); [series]{s2} = another series at that time. fmt(x, \"compact\" | \"si\", decimals, unit), round(x, 2). Example: {name} \": \" fmt({value}) \" (Δ \" fixed({delta}, 1) \")\"" }
};

function seriesDefaults() {
    const o = {};
    Object.keys(SERIES_FIELDS).forEach((k) => { o[k] = SERIES_FIELDS[k].default; });
    delete o.live;
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

// axis props: one set per side (left / right)
function axisProps(side, label) {
    const g = "Axes", sec = label;
    return {
        [side + "Title"]: { type: "string", group: g, section: sec, label: "Title", default: "", help: side === "right" ? "The right axis shows when a series uses it." : "" },
        [side + "Notation"]: { type: "enum", group: g, section: sec, label: "Number notation", default: "standard", options: opt(NOTATIONS) },
        [side + "Decimals"]: { type: "enum", group: g, section: sec, label: "Decimals", default: "auto", options: opt(DECIMALS) },
        [side + "SoftMin"]: { type: "number", group: g, section: sec, label: "Soft min (grows with the data)", default: "" },
        [side + "SoftMax"]: { type: "number", group: g, section: sec, label: "Soft max (grows with the data)", default: "" },
        [side + "Min"]: { type: "number", group: g, section: sec, label: "Hard min (clips)", default: "" },
        [side + "Max"]: { type: "number", group: g, section: sec, label: "Hard max (clips)", default: "" }
    };
}

// ---- a time, the way the chart's Time axis says ----------------------------------------------
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => (n < 10 ? "0" + n : String(n));
function parts(ts, utc) {
    const d = new Date(ts);
    return utc
        ? { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds() }
        : { y: d.getFullYear(), mo: d.getMonth(), d: d.getDate(), wd: d.getDay(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds() };
}
function clock(p, h12, withSec) {
    let h = p.h, ap = "";
    if (h12) { ap = h < 12 ? " AM" : " PM"; h = h % 12 || 12; }
    return (h12 ? String(h) : pad2(h)) + ":" + pad2(p.mi) + (withSec ? ":" + pad2(p.s) : "") + ap;
}
function relative(ms) {
    const a = Math.abs(ms), sign = ms < 0 ? "−" : ms > 0 ? "+" : "";
    if (a < 1000) return sign + Math.round(a) + "ms";
    if (a < 60000) return sign + (Math.round(a / 100) / 10) + "s";
    if (a < 3600000) return sign + (Math.round(a / 6000) / 10) + "m";
    if (a < 86400000) return sign + (Math.round(a / 360000) / 10) + "h";
    return sign + (Math.round(a / 8640000) / 10) + "d";
}

// ---- export: CSV and a real .xlsx (a stored zip, no library) -----------------------------------
let CRC_TABLE = null;
function crc32(bytes) {
    if (!CRC_TABLE) {
        CRC_TABLE = new Uint32Array(256);
        for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files) {
    const enc = new TextEncoder(), chunks = [], central = [];
    let offset = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const f of files) {
        const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
        const head = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
        chunks.push(new Uint8Array(head), name, data);
        central.push({ name, crc, size: data.length, offset });
        offset += head.length + name.length + data.length;
    }
    let cdSize = 0;
    for (const c of central) {
        const rec = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
        chunks.push(new Uint8Array(rec), c.name);
        cdSize += rec.length + c.name.length;
    }
    chunks.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(offset), u16(0))));
    return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
function colName(i) { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function xlsxBlob(header, rows, utc) {
    // time cells: Excel serial days, with a date-time format (style 1)
    const toSerial = (ts) => { const d = new Date(ts); const off = utc ? 0 : d.getTimezoneOffset() * 60000; return (ts - off) / 86400000 + 25569; };
    let sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="24" customWidth="1"/></cols><sheetData>';
    sheet += '<row r="1">' + header.map((h, i) => `<c r="${colName(i)}1" t="inlineStr"><is><t>${xmlEsc(h)}</t></is></c>`).join("") + "</row>";
    rows.forEach((r, ri) => {
        const n = ri + 2;
        sheet += `<row r="${n}"><c r="A${n}" s="1"><v>${toSerial(r[0])}</v></c>` + r.slice(1).map((v, i) => (v === null || v === undefined ? "" : `<c r="${colName(i + 1)}${n}"><v>${v}</v></c>`)).join("") + "</row>";
    });
    sheet += "</sheetData></worksheet>";
    return zipStore([
        { name: "[Content_Types].xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
        { name: "_rels/.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
        { name: "xl/workbook.xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>' },
        { name: "xl/_rels/workbook.xml.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
        { name: "xl/styles.xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss.000"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>' },
        { name: "xl/worksheets/sheet1.xml", text: sheet }
    ]);
}

export const lineChart = defineUI({
    ...common,
    id: PREFIX + "line-chart",
    label: "Line Chart",
    icon: "fa fa-line-chart",
    size: { w: 600, h: 320 },
    help: "Time-series chart. The chart has one Update node (its own props); every series has its own Update node, message and events. Every point kept, drawn at pixel accuracy.",
    version: 3,

    migrate(p, from) {
        const has = (v) => v !== undefined && v !== null && v !== "";
        // v1: one series in flat props -> series[0] (props that already have series: not a v1 chart)
        if (from < 2 && !Array.isArray(p.series)) {
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
            if (has(p.inputData)) s.data = asBinding(p.inputData, fb.inputData);
            if (has(p.inputPoint)) s.point = asBinding(p.inputPoint, fb.inputPoint);
            p.series = [s];
            ["data", "inputData", "inputPoint", "label", "unit", "lineColor", "lineWidth", "areaFill", "showPoints", "pointRadius", "xField", "yField", "maxPoints"].forEach((k) => { delete p[k]; });
            if (p.__fallback) {
                delete p.__fallback.inputData;
                delete p.__fallback.inputPoint;
                if (!Object.keys(p.__fallback).length) delete p.__fallback;
            }
        }
        // v2: a series' Data / Point -> its Live value (Point first); fixed axis ranges -> hard min / max;
        // tooltip decimals -> its number format
        if (from < 3) {
            (Array.isArray(p.series) ? p.series : []).forEach((s, i) => {
                if (!s || typeof s !== "object") return;
                const live = has(s.point) && !(s.point && s.point.$bind && !s.point.$bind.length) ? s.point : has(s.data) && s.data && !(s.data.$bind && !s.data.$bind.length) ? s.data : undefined;
                if (live !== undefined) s.live = live;
                delete s.point;
                delete s.data;
                if (!s.id) s.id = "s" + (i + 1);
            });
            if (p.tooltipMode === "shared" || p.tooltipMode === "nearest" || p.tooltipMode === "off") { p.tooltipShows = p.tooltipMode; delete p.tooltipMode; }
        }
        return p;
    },

    groups: ["Series", "Data", "Time axis", "Axes", "Tooltip", "Legend", "Thresholds", "Zoom & pan", "Export", "Style", "Behaviour"],

    properties: {
        series: {
            type: "list", group: "Series", label: "Series", noun: "series",
            help: "Each series has its own Update node, message and events in Logic (Events tab). The order is the layer order: the first is drawn under the others.",
            default: [Object.assign(seriesDefaults(), { id: "s1", name: "Series 1" })],
            item: {
                fields: SERIES_FIELDS, noun: "series",
                // a Logic target of its own: its Update node, its message, its actions and events
                target: true,
                // a new series: the next number, a fixed Id (s1, s2 … never reused)
                create: (items) => {
                    let n = items.length + 1;
                    const ids = new Set(items.map((x) => x && x.id));
                    while (ids.has("s" + n)) n++;
                    return Object.assign(seriesDefaults(), { id: "s" + n, name: "Series " + n });
                },
                actions: {
                    appendPoints: { label: "Append points", help: "Adds points to this series (any order: a late point goes in its place).",
                        example: "{ \"x\": 1727852400000, \"y\": 21.5 }  or  [{x, y}, …]  or  21.5 (time = now)" },
                    replacePoints: { label: "Replace points", help: "Replaces everything the series holds: a query result, a batch's history.",
                        example: "[{ \"x\": 1727852400000, \"y\": 21.5 }, …]" },
                    clear: { label: "Clear", help: "Empties this series." },
                    show: { label: "Show", help: "Shows this series (as its legend entry would)." },
                    hide: { label: "Hide", help: "Hides this series; its data is kept." }
                },
                events: {
                    pointClick: { label: "On Point Click", payload: { x: "number", y: "number" }, help: "A click on one of its points: the time and the value." },
                    thresholdCross: { label: "On Threshold Crossed", payload: { direction: "string", value: "number", threshold: "number", label: "string" },
                        help: "A new value crossed a threshold of its axis: direction \"up\" / \"down\". An alarm without a script." },
                    stale: { label: "On Stale", payload: { since: "number" }, help: "No new point for longer than its Stale after: a sensor that went quiet." },
                    resume: { label: "On Resume", payload: { gap: "number" }, help: "Data again after On Stale: how long it was quiet (ms)." }
                }
            }
        },

        timeWindow: { type: "enum", default: "auto", options: opt(WINDOWS), group: "Data", label: "Time range",
            help: "A live window that follows the newest point. Zoom / pan pauses it; Live (or a double click) follows again." },

        ruler: { type: "enum", group: "Time axis", label: "Time ruler", default: "tworow",
            options: opt([["tworow", "Two rows: time and date (drag it)"], ["navigator", "Navigator: the whole history, a window to drag"], ["comb", "Comb (drag it)"], ["axis", "Labels only"], ["none", "None"]]),
            help: "Every ruler but Labels only can be dragged to move in time; the wheel zooms." },
        timeFormat: { type: "enum", group: "Time axis", label: "Time format", default: "24h", options: opt([["24h", "24 hours (14:05)"], ["12h", "12 hours (2:05 PM)"], ["relative", "Relative to the newest (−5m)"]]) },
        timeZone: { type: "enum", group: "Time axis", label: "Time zone", default: "local", options: opt([["local", "The viewer's (local)"], ["utc", "UTC"]]) },

        ...axisProps("left", "Left"),
        ...axisProps("right", "Right"),
        separators: { type: "enum", group: "Axes", section: "Numbers", label: "Separators", default: "locale",
            options: opt([["locale", "The page's language"], ["dot", "1,234.5"], ["comma", "1.234,5"]]) },
        thousands: { type: "boolean", group: "Axes", section: "Numbers", label: "Thousands separator", default: true },

        tooltipShows: { type: "enum", group: "Tooltip", label: "Shows", default: "shared",
            options: opt([["shared", "Every series at that time"], ["nearest", "The nearest series"], ["off", "Nothing"]]) },
        matchWithin: { type: "number", group: "Tooltip", label: "A series' point counts within (ms)", default: 0, min: 0, step: 100,
            help: "0 = automatic (each series' own spacing: a slow series still shows next to a fast one)." },

        legend: { type: "enum", group: "Legend", label: "Legend", default: "bottom", options: opt([["bottom", "Below"], ["top", "Above"], ["none", "None"]]) },
        legendValue: { type: "enum", group: "Legend", label: "Value in the legend", default: "last",
            options: opt([["none", "None"], ["last", "Last"], ["min", "Min (shown)"], ["max", "Max (shown)"], ["avg", "Average (shown)"]]) },

        thresholds: { type: "list", group: "Thresholds", label: "Thresholds", noun: "threshold", default: [],
            help: "Horizontal lines: a limit, a setpoint. A series crossing one fires its On Threshold Crossed.", item: { fields: THRESHOLD_FIELDS, noun: "threshold" } },

        minSpan: { type: "enum", group: "Zoom & pan", label: "Zoom in to at most", default: "", options: opt(SPANS), help: "The shortest time the chart can show." },
        maxSpan: { type: "enum", group: "Zoom & pan", label: "Zoom out to at most", default: "", options: opt(SPANS), help: "The longest time the chart can show." },
        panLimit: { type: "enum", group: "Zoom & pan", label: "Move in time", default: "data",
            options: opt([["data", "Only where there is data"], ["window", "Only within the last…"], ["free", "Anywhere"]]) },
        panWindow: { type: "enum", group: "Zoom & pan", label: "The last", default: "24h", options: opt(WINDOWS.slice(1)), visibleWhen: (p) => p.panLimit === "window" },
        futureMargin: { type: "enum", group: "Zoom & pan", label: "Room after the newest point", default: "0",
            options: opt([["0", "None"], ["0.02", "2 %"], ["0.05", "5 %"], ["0.1", "10 %"]]), help: "Live: the newest point is not glued to the right edge." },
        enableZoomPan: { type: "boolean", default: true, group: "Zoom & pan", label: "Zoom (wheel) and pan (drag)" },

        exportButton: { type: "boolean", group: "Export", label: "Export button on the chart", default: false, help: "The viewer downloads what the chart holds (CSV or Excel)." },
        exportRange: { type: "enum", group: "Export", label: "The button exports", default: "visible", options: opt([["visible", "The time shown"], ["all", "Everything it holds"]]) },

        colorPalette: paletteProp("primary"),
        showGrid: { type: "boolean", default: true, group: "Style", label: "Grid" }
    },

    parts: {
        chart: part("Chart canvas container", "chart"),
        legend: part("Legend", "legend")
    },

    events: {
        rangeChange: { label: "On Range Change", payload: { from: "number", to: "number", live: "boolean", cause: "string" },
            help: "The time shown changed (zoom, pan, ruler, navigator, Live): from / to (ms), live, cause. Load what is needed for it." },
        liveChange: { label: "On Live / Paused", payload: { live: "boolean" }, help: "The viewer stopped following the newest data (zoom / pan), or follows it again." },
        hover: { label: "On Hover", payload: { time: "number", values: "object" }, help: "The time under the cursor and each series' value there: share a crosshair with other charts through a variable." },
        hoverEnd: { label: "On Hover End", help: "The cursor left the chart." },
        click: { label: "On Click", payload: { time: "number", values: "object" }, help: "A click in the chart (not a drag): its time and the values there." },
        rangeSelect: { label: "On Range Select", payload: { from: "number", to: "number" }, help: "Shift + drag selected a time range: statistics, export, zoom other charts." },
        seriesToggle: { label: "On Series Toggle", payload: { series: "string", visible: "boolean" }, help: "The viewer showed / hid a series in the legend." }
    },

    actions: {
        followLive: { label: "Follow live", help: "Shows the newest data again (as Live / a double click)." },
        setRange: { label: "Show a time range", params: { from: "number", to: "number" }, help: "Pauses live and shows that time.",
            example: "{ \"from\": 1727852400000, \"to\": 1727856000000 }" },
        clearAll: { label: "Clear every series" },
        exportData: { label: "Export (download)", params: { format: "string", range: "string" }, help: "Downloads a file on the viewer's screen: CSV or Excel, the time shown or everything.",
            example: "{ \"format\": \"xlsx\", \"range\": \"visible\" }  (format: csv | xlsx, range: visible | all)" }
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
        _navDecimator = new M4Decimator(1024);
        _series = new Map();      // key -> { buf, lastLive, dx, dy, n, demo, lastAt, stale }
        _hidden = new Set();

        viewRange = null;         // null = live
        drag = null;              // { kind: "pan" | "ruler" | "nav" | "navL" | "navR" | "select", x0, min0, max0, moved }
        hover = null;
        _selection = null;        // { from, to } (Shift + drag)
        _lastHoverEmit = 0;
        _lastRangeEmit = 0;
        _wasLive = true;

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

        // a series gone quiet: On Stale (checked every second; live pages only: the mode is known
        // when it ticks, not yet when mounted)
        mounted() {
            this.every(1000, () => { if (!this.isEditor) this._checkStale(); });
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

        // every change of a prop, one by one: a live value is taken here (not in updated(): Lit batches)
        propsChanged() { this.prepareData(); }

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
                o._key = String(o.id || "#" + i);
                o._shift = spanMs(o.timeShift);
                return o;
            });
        }

        _state(s) {
            let st = this._series.get(s._key);
            if (!st) {
                st = { buf: new TimeSeriesRingBuffer(Math.max(50, numOr(s.maxPoints, 10000))), lastLive: undefined, dx: null, dy: null, n: 0, demo: false, lastAt: 0, stale: false };
                this._series.set(s._key, st);
            }
            return st;
        }

        _target(s) { return { list: "series", id: s.id || s._key }; }

        /** A series by its Id, its name or its index (none: the first). */
        findSeries(ref) {
            const list = this.seriesList();
            if (ref && typeof ref === "object" && ref.id !== undefined) ref = ref.id;
            if (ref === undefined || ref === null || ref === "") return list[0] || null;
            const byIndex = typeof ref === "number" || /^\d+$/.test(String(ref)) ? list[Number(ref)] : null;
            return list.find((s) => s.id && s.id === String(ref)) || list.find((s) => s.name === String(ref)) || byIndex || null;
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
                // the live value: every new value is a point (the same value object again is not)
                const v = s.live;
                if (v !== undefined && v !== null && v !== "" && v !== "???" && v !== st.lastLive && !(typeof v === "object" && v.$bind)) {
                    st.lastLive = v;
                    if (this._add(s, st, Array.isArray(v) ? v : [v])) dirty = true;
                }
                // (only once the host said it is the editor: before that, the mode is not known)
                if (this._ctx && this._ctx.mode === "editor" && st.buf.count === 0) { this._demo(st, s._i); dirty = true; }
            }
            for (const k of Array.from(this._series.keys())) if (!live.has(k)) { this._series.delete(k); dirty = true; }
            if (dirty) this.scheduleDraw();
        }

        // points into a series: {x, y} / a number (time = now); the newest one is checked against the
        // thresholds (On Threshold Crossed) and wakes a stale series (On Resume)
        _add(s, st, pts) {
            if (st.demo) { st.buf.clear(); st.demo = false; }
            const xf = s.xField || "x", yf = s.yField || "y";
            let added = 0, prevY = st.buf.count ? st.buf.getY(st.buf.count - 1) : NaN, lastY = NaN;
            for (const p of pts) {
                if (p === null || p === undefined) continue;
                let x, y;
                if (typeof p === "object") { x = Number(p[xf]); y = Number(p[yf]); }
                else { x = Date.now(); y = Number(p); }
                if (Number.isFinite(x) && Number.isFinite(y) && st.buf.push(x, y)) { added++; lastY = y; }
            }
            if (added && !this.isEditor) {
                const now = Date.now();
                if (st.stale) { this.emit("resume", { gap: now - st.lastAt }, this._target(s)); st.stale = false; }
                st.lastAt = now;
                if (Number.isFinite(prevY)) this._crossings(s, prevY, lastY);
            }
            return added;
        }

        _crossings(s, from, to) {
            const axis = s.axis === "right" ? "right" : "left";
            for (const t of Array.isArray(this.p.thresholds) ? this.p.thresholds : []) {
                if (!t || (t.axis === "right" ? "right" : "left") !== axis) continue;
                const v = numOr(t.value, NaN);
                if (!Number.isFinite(v)) continue;
                if (from < v && to >= v) this.emit("thresholdCross", { direction: "up", value: to, threshold: v, label: t.label || "" }, this._target(s));
                else if (from >= v && to < v) this.emit("thresholdCross", { direction: "down", value: to, threshold: v, label: t.label || "" }, this._target(s));
            }
        }

        _checkStale() {
            const now = Date.now();
            for (const s of this.seriesList()) {
                const after = numOr(s.staleAfter, 0), st = this._state(s);
                if (after > 0 && st.lastAt && !st.stale && now - st.lastAt > after) {
                    st.stale = true;
                    this.emit("stale", { since: st.lastAt }, this._target(s));
                }
            }
        }

        _demo(st, i) {
            const now = Date.now(), n = 240;
            for (let k = 0; k < n; k++) st.buf.push(now - (n - k) * 500, Math.round((50 + i * 15 + 18 * Math.sin(k / 18 + i * 1.3) + 6 * Math.sin(k / 5 + i)) * 10) / 10);
            st.demo = true;
        }

        // ---- the actions of ONE series (its own Update node): (params = msg.payload, target) ----
        _pointsOf(params) {
            if (params && typeof params === "object" && !Array.isArray(params) && Array.isArray(params.points)) return params.points;
            return Array.isArray(params) ? params : params === undefined || params === null || params === "" ? [] : [params];
        }

        appendPoints(params, target) {
            const s = this.findSeries(target || (params && params.series));
            if (!s) return 0;
            const added = this._add(s, this._state(s), this._pointsOf(params));
            if (added) { this.scheduleDraw(); this.requestUpdate(); }
            return added;
        }

        replacePoints(params, target) {
            const s = this.findSeries(target || (params && params.series));
            if (!s) return 0;
            const st = this._state(s);
            st.demo = false;
            st.buf.loadArray(this._pointsOf(params), s.xField || "x", s.yField || "y");
            st.lastAt = Date.now();
            this.scheduleDraw();
            this.requestUpdate();
            return st.buf.count;
        }

        clear(params, target) {
            const s = this.findSeries(target || (params && params.series));
            if (!s) return;
            this._state(s).buf.clear();
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
        }

        // ---- the chart's actions (its Update node) ---------------------------------------------
        followLive() {
            this.viewRange = null;
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

        clearAll() {
            for (const st of this._series.values()) st.buf.clear();
            this.viewRange = null;
            this.hover = null;
            this.scheduleDraw();
            this.requestUpdate();
        }

        // kept for v1 / v2 flows: the chart's Update node appending to a series named in params
        clearPoints() { this.clearAll(); }

        /** Download what it holds: { format: "csv" | "xlsx", range: "visible" | "all" } -> rows written. */
        exportData(params) {
            const format = params && params.format === "xlsx" ? "xlsx" : "csv";
            const visible = !(params && params.range === "all");
            const list = this.seriesList().filter((s) => this._state(s).buf.count > 0);
            const sc = this._scale;
            const from = visible && sc ? sc.vMinX : -Infinity, to = visible && sc ? sc.vMaxX : Infinity;
            // one row per time, a column per series (a series without a point at that time: empty)
            const times = new Map();
            list.forEach((s, c) => {
                const buf = this._state(s).buf;
                for (let i = 0; i < buf.count; i++) {
                    const x = buf.getX(i) + s._shift;
                    if (x < from || x > to) continue;
                    let row = times.get(x);
                    if (!row) { row = new Array(list.length).fill(null); times.set(x, row); }
                    row[c] = buf.getY(i);
                }
            });
            const xs = Array.from(times.keys()).sort((a, b) => a - b);
            const rows = xs.map((x) => [x].concat(times.get(x)));
            const header = ["Time"].concat(list.map((s) => (s.name || s.id) + (s.unit ? " (" + s.unit + ")" : "")));
            const utc = this.p.timeZone === "utc";
            const stamp = (ts) => { const q = parts(ts, utc); return q.y + "-" + pad2(q.mo + 1) + "-" + pad2(q.d) + " " + pad2(q.h) + ":" + pad2(q.mi) + ":" + pad2(q.s) + "." + String(q.ms).padStart(3, "0"); };
            let blob;
            if (format === "xlsx") blob = xlsxBlob(header, rows, utc);
            else {
                // a comma as the decimal separator: ";" between the columns (as Excel there expects)
                const comma = formatValue(1.5, { separators: this.p.separators || "locale", thousands: false }).indexOf(",") !== -1;
                const sep = comma ? ";" : ",";
                const cell = (v) => (v === null ? "" : comma ? String(v).replace(".", ",") : String(v));
                const lines = [header.map((h) => '"' + String(h).replace(/"/g, '""') + '"').join(sep)];
                rows.forEach((r) => lines.push([stamp(r[0])].concat(r.slice(1).map(cell)).join(sep)));
                blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
            }
            const q = parts(Date.now(), utc);
            const name = (this.p.exportName || "chart") + "-" + q.y + pad2(q.mo + 1) + pad2(q.d) + "-" + pad2(q.h) + pad2(q.mi) + "." + format;
            if (!this.isEditor) {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = name;
                this.renderRoot.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            }
            this._lastExport = { name, rows: rows.length, columns: header.length, blob };
            return rows.length;
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
            if (w <= 0 || h <= 0) return false;   // tabs / hidden containers: never collapse the canvas
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
                if (b.minX + s._shift < minX) minX = b.minX + s._shift;
                if (b.maxX + s._shift > maxX) maxX = b.maxX + s._shift;
            }
            return Number.isFinite(minX) ? { minX, maxX } : null;
        }

        _rulerHeight() {
            return ({ tworow: 36, navigator: 54, comb: 30, axis: 20, none: 0 })[this.p.ruler || "tworow"] ?? 36;
        }

        getPlotMetrics(width, height) {
            const right = this._usesRight();
            const titled = !!(this.p.leftTitle || (right && this.p.rightTitle));
            const rh = this._rulerHeight();
            const padLeft = 56, padRight = right ? 56 : 16, padTop = titled ? 22 : 14, padBottom = rh ? 4 : 8;
            const plotX = padLeft, plotY = padTop;
            const plotW = Math.max(1, width - padLeft - padRight);
            const plotH = Math.max(1, height - padTop - padBottom - rh);
            return { plotX, plotY, plotW, plotH, rulerX: padLeft, rulerY: plotY + plotH + (rh ? 4 : 0), rulerW: plotW, rulerH: rh };
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

        // ---- numbers & times -------------------------------------------------------------------
        _axisSpec(axis) {
            return { notation: this.p[axis + "Notation"] || "standard", decimals: this.p[axis + "Decimals"] || "auto",
                thousands: this.p.thousands !== false, separators: this.p.separators || "locale" };
        }

        _seriesSpec(s) {
            const a = this._axisSpec(s.axis === "right" ? "right" : "left");
            if (s.notation && s.notation !== "axis") a.notation = s.notation;
            if (s.decimals && s.decimals !== "axis") a.decimals = s.decimals;
            return a;
        }

        fmtValue(s, y) { return formatValue(y, this._seriesSpec(s), s.unit || ""); }

        _tf() { return { utc: this.p.timeZone === "utc", h12: this.p.timeFormat === "12h", rel: this.p.timeFormat === "relative" }; }

        fmtTick(ts, step) {
            const f = this._tf();
            if (f.rel && this._newest !== undefined) return relative(ts - this._newest);
            const p = parts(ts, f.utc);
            if (step < 1000) return pad2(p.s) + "." + String(p.ms).padStart(3, "0");
            if (step >= 86400000) return p.d + " " + MONTHS[p.mo];
            // hours apart over several days: the day too ("3 Oct 19:00")
            if (step >= 6 * 3600000) return p.d + " " + MONTHS[p.mo] + " " + clock(p, f.h12, false);
            return clock(p, f.h12, step < 60000);
        }

        fmtDate(ts) {
            const p = parts(ts, this._tf().utc);
            return DAYS[p.wd] + " " + pad2(p.d) + " " + MONTHS[p.mo] + " " + p.y;
        }

        fmtTime(ts) {
            const f = this._tf();
            const p = parts(ts, f.utc);
            const base = p.y + "-" + pad2(p.mo + 1) + "-" + pad2(p.d) + " " + clock(p, f.h12, true) + "." + String(p.ms).padStart(3, "0") + (f.utc ? " UTC" : "");
            return f.rel && this._newest !== undefined ? base + "  (" + relative(ts - this._newest) + ")" : base;
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

        // ---- drawing ---------------------------------------------------------------------------
        _decimate(dec, s, vMinX, vMaxX, w, into) {
            const st = this._state(s), buf = st.buf, sh = s._shift;
            const startIdx = Math.max(0, lowerBoundRing(buf, vMinX - sh) - 1);
            const endIdx = Math.min(buf.count, upperBoundRing(buf, vMaxX - sh) + 1);
            const n = dec.decimate(buf, startIdx, endIdx, Math.max(1, Math.floor(w)), vMinX - sh, vMaxX - sh);
            const t = into || st;
            if (!t.dx || t.dx.length < n) { t.dx = new Float64Array(Math.max(n, 256)); t.dy = new Float64Array(Math.max(n, 256)); }
            for (let i = 0; i < n; i++) { t.dx[i] = dec.outX[i] + sh; t.dy[i] = dec.outY[i]; }
            t.n = n;
            return t;
        }

        _yRange(list, axis) {
            let lo = Infinity, hi = -Infinity;
            for (const s of list) {
                if ((s.axis === "right" ? "right" : "left") !== axis) continue;
                const st = this._state(s);
                for (let i = 0; i < st.n; i++) { const y = st.dy[i]; if (y < lo) lo = y; if (y > hi) hi = y; }
            }
            if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
            // soft limits: the range covers them, and grows with the data
            const sMin = numOr(this.p[axis + "SoftMin"], NaN), sMax = numOr(this.p[axis + "SoftMax"], NaN);
            if (Number.isFinite(sMin) && sMin < lo) lo = sMin;
            if (Number.isFinite(sMax) && sMax > hi) hi = sMax;
            if (lo === hi) { const pad = Math.abs(lo) * 0.1 || 1; lo -= pad; hi += pad; }
            else if (!(Number.isFinite(sMin) && lo === sMin && Number.isFinite(sMax) && hi === sMax)) { const pad = (hi - lo) * 0.08; if (!(Number.isFinite(sMin) && lo === sMin)) lo -= pad; if (!(Number.isFinite(sMax) && hi === sMax)) hi += pad; }
            // hard limits: fixed, the line clips
            const hMin = numOr(this.p[axis + "Min"], NaN), hMax = numOr(this.p[axis + "Max"], NaN);
            if (Number.isFinite(hMin)) lo = hMin;
            if (Number.isFinite(hMax)) hi = hMax;
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
            if (!list.length) { this._scale = null; this._updateLegend(null); return; }
            const fb = this._bounds(list);
            if (!fb) return;
            this._full = fb;
            this._newest = fb.maxX;
            const { vMinX, vMaxX } = this.getEffectiveTimeRange(fb);
            if (!Number.isFinite(vMinX) || !Number.isFinite(vMaxX)) return;
            const m = this.getPlotMetrics(width, height);
            const { plotX, plotY, plotW, plotH } = m;

            for (const s of list) this._decimate(this.decimator, s, vMinX, vMaxX, plotW);
            const yr = { left: this._yRange(list, "left"), right: this._usesRight() ? this._yRange(list, "right") : null };
            const xSpan = Math.max(1, vMaxX - vMinX);
            const toX = (x) => plotX + ((x - vMinX) / xSpan) * plotW;
            const toY = (y, axis) => { const r = yr[axis] || yr.left; return plotY + plotH - ((y - r.lo) / (r.hi - r.lo)) * plotH; };
            this._scale = { vMinX, vMaxX, toX, toY, m, yr };

            this.drawAxesAndGrid(ctx, m, vMinX, vMaxX, yr);
            ctx.save();
            ctx.beginPath();
            ctx.rect(plotX, plotY, plotW, plotH);
            ctx.clip();
            if (this._selection) {
                const a = toX(Math.min(this._selection.from, this._selection.to)), b = toX(Math.max(this._selection.from, this._selection.to));
                ctx.fillStyle = "rgba(59, 130, 246, 0.14)";
                ctx.fillRect(a, plotY, b - a, plotH);
            }
            for (const s of list) this._drawSeries(ctx, s, toX, toY, plotY, plotH);
            this._drawThresholds(ctx, toY, plotX, plotW);
            this._drawHover(ctx, toX, toY, plotY, plotH);
            ctx.restore();
            this._drawRuler(ctx, m, vMinX, vMaxX, list);
            this._updateLegend(list, vMinX, vMaxX);
        }

        _runs(st, gapAfter) {
            const runs = [];
            let start = 0;
            for (let i = 1; i < st.n; i++) if (gapAfter > 0 && st.dx[i] - st.dx[i - 1] > gapAfter) { runs.push(start, i); start = i; }
            if (st.n) runs.push(start, st.n);
            return runs;
        }

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
            const color = this.colorOf(s), axis = s.axis === "right" ? "right" : "left", lw = numOr(s.width, 2);
            const runs = this._runs(st, numOr(s.gapAfter, 0)), base = plotY + plotH;
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, numOr(s.opacity, 1)));
            if (s.variant === "bars") {
                const w = Math.max(1, Math.min(24, ((toX(st.dx[st.n - 1]) - toX(st.dx[0])) / Math.max(1, st.n)) * 0.7));
                const r = this._scale.yr[axis] || this._scale.yr.left;
                const zero = toY(Math.max(r.lo, Math.min(r.hi, 0)), axis);
                ctx.fillStyle = color;
                for (let i = 0; i < st.n; i++) { const x = toX(st.dx[i]), y = toY(st.dy[i], axis); ctx.fillRect(x - w / 2, Math.min(y, zero), w, Math.max(1, Math.abs(zero - y))); }
                ctx.restore();
                return;
            }
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
            if (s.variant !== "points") {
                ctx.strokeStyle = color;
                ctx.lineWidth = lw;
                ctx.lineJoin = "round";
                ctx.lineCap = "round";
                ctx.setLineDash(DASHES[s.dash] || []);
                for (let r = 0; r < runs.length; r += 2) {
                    const a = runs[r], b = runs[r + 1];
                    if (b - a === 1) {
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
                if (t && t.label) { ctx.fillStyle = (t && t.color) || "#ef4444"; ctx.fillText(String(t.label), plotX + plotW - 4, y - 2); }
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

        _colors() {
            const cs = getComputedStyle(this);
            return {
                grid: cs.getPropertyValue("--bd").trim() || "rgba(255, 255, 255, 0.08)",
                text: cs.getPropertyValue("--fg-muted").trim() || "rgba(255, 255, 255, 0.55)",
                strong: cs.getPropertyValue("--fg").trim() || "#e5e7eb",
                band: cs.getPropertyValue("--panel-bg-subtle").trim() || "rgba(127, 127, 127, 0.12)",
                accent: cs.getPropertyValue("--cp-solid").trim() || "#3b82f6",
                mono: cs.getPropertyValue("--mono") || "monospace"
            };
        }

        drawAxesAndGrid(ctx, m, minX, maxX, yr) {
            const { plotX: px, plotY: py, plotW: pw, plotH: ph } = m;
            const c = this._colors();
            ctx.save();
            ctx.font = "10px " + c.mono;
            const yTicksCount = Math.max(3, Math.min(6, Math.floor(ph / 45)));
            const axisTicks = (r, side) => {
                const range = r.hi - r.lo, step = niceNum(range / yTicksCount, false), spec = this._axisSpec(side);
                ctx.textAlign = side === "left" ? "right" : "left";
                ctx.textBaseline = "middle";
                for (let v = Math.ceil(r.lo / step) * step; v <= r.hi + step * 1e-9; v += step) {
                    const sy = py + ph - ((v - r.lo) / range) * ph;
                    if (sy < py - 0.5 || sy > py + ph + 0.5) continue;
                    if (side === "left" && this.p.showGrid) {
                        ctx.beginPath();
                        ctx.strokeStyle = c.grid;
                        ctx.lineWidth = 1;
                        ctx.moveTo(px, sy);
                        ctx.lineTo(px + pw, sy);
                        ctx.stroke();
                    }
                    ctx.fillStyle = c.text;
                    ctx.fillText(formatValue(Math.abs(v) < step * 1e-9 ? 0 : v, spec), side === "left" ? px - 6 : px + pw + 6, sy);
                }
            };
            axisTicks(yr.left, "left");
            if (yr.right) axisTicks(yr.right, "right");
            ctx.textBaseline = "top";
            ctx.fillStyle = c.text;
            if (this.p.leftTitle) { ctx.textAlign = "left"; ctx.fillText(String(this.p.leftTitle), 4, 3); }
            if (yr.right && this.p.rightTitle) { ctx.textAlign = "right"; ctx.fillText(String(this.p.rightTitle), px + pw + 52, 3); }
            // vertical grid at the ruler's major ticks
            if (this.p.showGrid) {
                const span = Math.max(1, maxX - minX), step = getNiceTimeStep(span, Math.max(2, Math.min(8, Math.floor(pw / 90))));
                ctx.beginPath();
                ctx.strokeStyle = c.grid;
                ctx.lineWidth = 1;
                for (let t = Math.ceil(minX / step) * step; t <= maxX; t += step) { const sx = Math.round(px + ((t - minX) / span) * pw) + 0.5; ctx.moveTo(sx, py); ctx.lineTo(sx, py + ph); }
                ctx.stroke();
            }
            ctx.restore();
        }

        // ---- the time ruler (every variant but "axis" / "none" can be dragged) ------------------
        _drawRuler(ctx, m, minX, maxX, list) {
            const kind = this.p.ruler || "tworow";
            if (kind === "none") return;
            const c = this._colors();
            const { rulerX: x, rulerY: y, rulerW: w, rulerH: h } = m;
            const span = Math.max(1, maxX - minX);
            const step = getNiceTimeStep(span, Math.max(2, Math.min(8, Math.floor(w / 90))));
            const toX = (t) => x + ((t - minX) / span) * w;
            const hot = this._hoverRuler || (this.drag && this.drag.kind !== "pan" && this.drag.kind !== "select");
            ctx.save();
            ctx.font = "10px " + c.mono;
            ctx.textBaseline = "top";
            ctx.textAlign = "center";

            if (kind === "axis") {
                ctx.fillStyle = c.text;
                for (let t = Math.ceil(minX / step) * step; t <= maxX; t += step) ctx.fillText(this.fmtTick(t, step), toX(t), y + 4);
                ctx.restore();
                return;
            }

            if (kind === "navigator") { this._drawNavigator(ctx, m, minX, maxX, list, c); ctx.restore(); return; }

            // comb / two rows: a band that says "drag me"
            ctx.fillStyle = hot ? this.hexToRgba(c.accent, 0.14) : c.band;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = hot ? c.accent : c.grid;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
            const minor = step <= 20 ? step / 2 : step / 5;
            ctx.beginPath();
            ctx.strokeStyle = c.grid;
            for (let t = Math.ceil(minX / minor) * minor; t <= maxX; t += minor) { const sx = Math.round(toX(t)) + 0.5; ctx.moveTo(sx, y); ctx.lineTo(sx, y + 4); }
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = c.text;
            for (let t = Math.ceil(minX / step) * step; t <= maxX; t += step) { const sx = Math.round(toX(t)) + 0.5; ctx.moveTo(sx, y); ctx.lineTo(sx, y + 8); }
            ctx.stroke();
            ctx.fillStyle = c.strong;
            for (let t = Math.ceil(minX / step) * step; t <= maxX; t += step) ctx.fillText(this.fmtTick(t, step), toX(t), y + 9);

            if (kind === "tworow") {
                // the second row: the date, one label per day shown, a line where a day starts
                const dayY = y + 21, utc = this._tf().utc;
                ctx.fillStyle = c.text;
                ctx.font = "600 9.5px " + c.mono;
                const dayStart = (t) => { const p = parts(t, utc); return utc ? Date.UTC(p.y, p.mo, p.d) : new Date(p.y, p.mo, p.d).getTime(); };
                let d0 = dayStart(minX);
                let guard = 0;
                while (d0 <= maxX && guard++ < 400) {
                    const p = parts(d0 + 43200000, utc);
                    const d1 = utc ? Date.UTC(p.y, p.mo, p.d + 1) : new Date(p.y, p.mo, p.d + 1).getTime();
                    const a = Math.max(x, toX(d0)), b = Math.min(x + w, toX(d1));
                    if (b - a > 40) ctx.fillText(this.fmtDate(d0 + 1000), (a + b) / 2, dayY);
                    if (d0 > minX) { ctx.beginPath(); ctx.strokeStyle = c.text; ctx.moveTo(Math.round(toX(d0)) + 0.5, y + 18); ctx.lineTo(Math.round(toX(d0)) + 0.5, y + h); ctx.stroke(); }
                    d0 = d1;
                }
            }
            // the drag affordance: a grip in the middle, arrows at both ends
            const cx = x + w / 2, gy = kind === "tworow" ? y + h - 7 : y + h - 6;
            ctx.fillStyle = hot ? c.accent : c.text;
            for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(cx + k * 5, gy, 1.3, 0, Math.PI * 2); ctx.fill(); }
            ctx.font = "11px " + c.mono;
            ctx.textAlign = "left";
            ctx.fillText("‹", x + 4, y + h / 2 - 6);
            ctx.textAlign = "right";
            ctx.fillText("›", x + w - 4, y + h / 2 - 6);
            if (hot) {
                ctx.font = "9.5px " + c.mono;
                ctx.textAlign = "right";
                ctx.fillStyle = c.accent;
                ctx.fillText("drag ⇆ to move · wheel to zoom", x + w - 14, kind === "tworow" ? y + 21 : y + 9);
            }
            ctx.restore();
        }

        // the navigator: every point the chart holds, small; a window (the time shown) to drag / resize
        _navGeom(m) {
            const full = this._full;
            if (!full || !this._scale) return null;
            const { rulerX: x, rulerY: y, rulerW: w } = m;
            const span = Math.max(1, full.maxX - full.minX);
            const toX = (t) => x + ((t - full.minX) / span) * w;
            const a = Math.max(x, toX(this._scale.vMinX)), b = Math.min(x + w, toX(this._scale.vMaxX));
            return { x, y, w, h: 38, a, b: Math.max(b, a + 6), span, full, toX };
        }

        _drawNavigator(ctx, m, minX, maxX, list, c) {
            const g = this._navGeom(m);
            if (!g) return;
            const { x, y, w, h } = g;
            ctx.fillStyle = c.band;
            ctx.fillRect(x, y, w, h);
            // the series, small
            const tmp = {};
            for (const s of list) {
                this._decimate(this._navDecimator, s, g.full.minX, g.full.maxX, w / 2, tmp);
                let lo = Infinity, hi = -Infinity;
                for (let i = 0; i < tmp.n; i++) { if (tmp.dy[i] < lo) lo = tmp.dy[i]; if (tmp.dy[i] > hi) hi = tmp.dy[i]; }
                if (!tmp.n || !Number.isFinite(lo)) continue;
                const r = hi - lo || 1;
                ctx.beginPath();
                ctx.strokeStyle = this.hexToRgba(this.colorOf(s), 0.8);
                ctx.lineWidth = 1;
                for (let i = 0; i < tmp.n; i++) { const sx = g.toX(tmp.dx[i]), sy = y + h - 3 - ((tmp.dy[i] - lo) / r) * (h - 6); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }
                ctx.stroke();
            }
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
                ctx.roundRect ? ctx.roundRect(hx - 4, y + h / 2 - 10, 8, 20, 3) : ctx.rect(hx - 4, y + h / 2 - 10, 8, 20);
                ctx.fill();
                ctx.strokeStyle = "#fff";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(hx - 1.5, y + h / 2 - 5); ctx.lineTo(hx - 1.5, y + h / 2 + 5);
                ctx.moveTo(hx + 1.5, y + h / 2 - 5); ctx.lineTo(hx + 1.5, y + h / 2 + 5);
                ctx.stroke();
            }
            // the whole history's times under it
            const step = getNiceTimeStep(g.span, Math.max(2, Math.min(8, Math.floor(w / 110))));
            ctx.fillStyle = c.text;
            ctx.font = "9.5px " + c.mono;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            for (let t = Math.ceil(g.full.minX / step) * step; t <= g.full.maxX; t += step) ctx.fillText(this.fmtTick(t, step), g.toX(t), y + h + 2);
            if (this._hoverRuler) {
                const hint = "drag the window ⇆ · its edges resize";
                ctx.font = "9.5px " + c.mono;
                const tw = ctx.measureText(hint).width;
                ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                ctx.fillRect(x + w - tw - 12, y + 2, tw + 8, 13);
                ctx.textAlign = "right";
                ctx.fillStyle = "#fff";
                ctx.fillText(hint, x + w - 8, y + 4);
            }
        }

        hexToRgba(hexOrRgb, alpha) {
            if (!hexOrRgb) return `rgba(59, 130, 246, ${alpha})`;
            if (hexOrRgb.startsWith("rgb")) return hexOrRgb.replace(/rgba?\(([^)]+)\)/, (m, val) => `rgba(${val.split(",").slice(0, 3).map((s) => s.trim()).join(",")}, ${alpha})`);
            let hex = hexOrRgb.replace("#", "");
            if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
            const num = parseInt(hex, 16);
            if (isNaN(num)) return `rgba(59, 130, 246, ${alpha})`;
            return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
        }

        // ---- legend ----------------------------------------------------------------------------
        _statsOf(s) {
            const st = this._state(s);
            let mn = Infinity, mx = -Infinity, sum = 0;
            for (let i = 0; i < st.n; i++) { const y = st.dy[i]; if (y < mn) mn = y; if (y > mx) mx = y; sum += y; }
            return { min: mn, max: mx, avg: st.n ? sum / st.n : NaN };
        }

        _updateLegend(list) {
            const el = this.renderRoot && this.renderRoot.querySelector(".legend");
            if (!el || !list) return;
            const mode = this.p.legendValue || "last";
            for (const s of list) {
                const v = el.querySelector(`.lg-item[data-key="${CSS.escape(s._key)}"] .lg-val`);
                if (!v) continue;
                const buf = this._state(s).buf;
                let y = NaN;
                if (mode === "last" && buf.count) y = buf.getY(buf.count - 1);
                else if (mode !== "none") y = this._statsOf(s)[mode];
                v.textContent = mode === "none" || !Number.isFinite(y) ? "" : this.fmtValue(s, y);
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

        // ---- tooltip ---------------------------------------------------------------------------
        _hits(px, py, time) {
            const sc = this._scale;
            if (!sc) return [];
            const span = sc.vMaxX - sc.vMinX, fixedWithin = numOr(this.p.matchWithin, 0), nearest = this.p.tooltipShows === "nearest";
            const hits = [];
            for (const s of this._visible()) {
                if (s.tooltip === false && !nearest) continue;
                const buf = this._state(s).buf, t = time - s._shift;
                const idx = buf.findClosestIndex(t);
                if (idx < 0) continue;
                const x = buf.getX(idx), y = buf.getY(idx);
                let within = fixedWithin;
                if (!(within > 0)) {
                    const n = Math.max(1, upperBoundRing(buf, sc.vMaxX - s._shift) - lowerBoundRing(buf, sc.vMinX - s._shift));
                    within = Math.max(span * 0.01, (span / n) * 0.75);
                }
                if (Math.abs(x - t) > within) continue;
                hits.push({ s, x: x + s._shift, y, idx, d: Math.hypot(sc.toX(x + s._shift) - px, sc.toY(y, s.axis === "right" ? "right" : "left") - py) });
            }
            if (nearest && hits.length) { hits.sort((a, b) => a.d - b.d); return [hits[0]]; }
            return hits;
        }

        // a series' tooltip text: simple (label: before value after unit) or its expression
        tooltipText(hit, hits) {
            const s = hit.s;
            if (s.tooltipMode === "expression" && s.expression) {
                const buf = this._state(s).buf, stats = this._statsOf(s);
                const prev = hit.idx > 0 ? buf.getY(hit.idx - 1) : NaN;
                const vars = { value: hit.y, name: s.name || s.id, unit: s.unit || "", time: hit.x, delta: Number.isFinite(prev) ? hit.y - prev : null, min: stats.min, max: stats.max, avg: stats.avg };
                const v = evaluateExpression(s.expression, (src, ref) => {
                    if (src === "series") { const o = hits.find((h) => h.s.id === ref || h.s.name === ref); return o ? o.y : null; }
                    return Object.prototype.hasOwnProperty.call(vars, ref) ? vars[ref] : null;
                }, { format: this._seriesSpec(s) });
                return v === null || v === undefined ? (s.name || s.id) + ": —" : String(v);
            }
            // the unit as shown (engineering notation scales it: 1 500 kW -> 1.5 MW)
            const f = formatParts(hit.y, this._seriesSpec(s), s.unit || "");
            return (s.tooltipLabel || s.name || "Value") + ": " + (s.prefix || "") + f.text + (s.suffix || "") + (f.unit ? " " + f.unit : "");
        }

        _showTooltip(px, py, rectW) {
            const tip = this.renderRoot.querySelector(".tooltip");
            if (!tip) return;
            const h = this.hover;
            const rows = h ? h.hits.filter((x) => x.s.tooltip !== false || this.p.tooltipShows === "nearest") : [];
            if (!rows.length || this.p.tooltipShows === "off") { tip.style.display = "none"; return; }
            tip.querySelector(".tooltip-time").textContent = this.fmtTime(h.time);
            const body = tip.querySelector(".tooltip-rows");
            while (body.children.length > rows.length) body.removeChild(body.lastChild);
            rows.forEach((hit, i) => {
                let row = body.children[i];
                if (!row) {
                    row = document.createElement("div");
                    row.className = "tooltip-row";
                    row.appendChild(document.createElement("span")).className = "tooltip-dot";
                    row.appendChild(document.createElement("span")).className = "tooltip-text";
                    body.appendChild(row);
                }
                row.children[0].style.background = this.colorOf(hit.s);
                row.children[1].textContent = this.tooltipText(hit, rows);
            });
            const flip = px > rectW - 200;
            tip.style.display = "block";
            tip.style.left = `${Math.round(flip ? px - 12 : px + 12)}px`;
            tip.style.top = `${Math.round(py)}px`;
            tip.style.transform = flip ? "translate(-100%, -50%)" : "translate(0, -50%)";
        }

        // ---- pointer ---------------------------------------------------------------------------
        _local(e) {
            const box = this._plotEl();
            if (!box) return null;
            const rect = box.getBoundingClientRect();
            const m = this.getPlotMetrics(rect.width, rect.height);
            return { box, rect, m, px: e.clientX - rect.left, py: e.clientY - rect.top };
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
            const L = this._local(e);
            if (!L) return;
            const zone = this._zone(L);
            if (zone === "none") return;
            const fb = this._bounds(this._visible());
            if (!fb || !this._scale) return;
            const { vMinX, vMaxX } = this._scale;
            const base = { x0: e.clientX, min0: vMinX, max0: vMaxX, moved: false, down: { px: L.px, py: L.py } };
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
            const L = this._local(e);
            if (!L || !this.canvas) return;
            const { m, px, py, box } = L;
            const d = this.drag;
            if (d) {
                const dx = e.clientX - d.x0;
                if (Math.abs(dx) > 3) d.moved = true;
                if (!d.moved || d.kind === "click") return;
                const fb = this._bounds(this._visible());
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
            const time = sc.vMinX + ((px - m.plotX) / m.plotW) * (sc.vMaxX - sc.vMinX);
            const hits = this._hits(px, py, time);
            this.hover = { time: hits.length ? hits[0].x : time, px, py, hits };
            this.draw();
            this._showTooltip(px, py, L.rect.width);
            const now = Date.now();
            if (now - this._lastHoverEmit > 100) {
                this._lastHoverEmit = now;
                this.emit("hover", { time: this.hover.time, values: this._values(hits) });
            }
        }

        _values(hits) {
            const values = {};
            hits.forEach((h) => { values[h.s.id || h.s.name] = h.y; });
            return values;
        }

        onPointerUp(e) {
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
                const sc = this._scale, m = L.m;
                const time = sc.vMinX + ((L.px - m.plotX) / m.plotW) * (sc.vMaxX - sc.vMinX);
                const hits = this._hits(L.px, L.py, time);
                this.emit("click", { time, values: this._values(hits) });
                const near = hits.slice().sort((a, b) => a.d - b.d)[0];
                if (near && near.d <= 12) this.emit("pointClick", { x: near.x, y: near.y }, this._target(near.s));
                this.draw();
            }
        }

        onWheel(e) {
            if (!this.p.enableZoomPan || !this.canvas) return;
            const L = this._local(e);
            if (!L || !this._scale) return;
            const zone = this._zone(L);
            if (zone === "none") return;
            e.preventDefault();
            const { m, px } = L;
            const fb = this._bounds(this._visible());
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

        onPointerLeave() {
            if (this.hover) { this.hover = null; this.draw(); this.emit("hoverEnd", {}); }
            this._showTooltip(0, 0, 0);
            if (this._hoverRuler) { this._hoverRuler = false; this.draw(); }
            const box = this._plotEl();
            if (box) box.classList.remove("hover-ruler", "hover-edge");
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
                            title="Click: show / hide. Alt+click: only this one." @click=${(e) => this._toggle(s, e)}>
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
                        @dblclick=${() => this.followLive()}>
                        <canvas></canvas>
                        <div class="corner" style="right:${this._usesRight() ? 60 : 20}px">
                            ${this.viewRange ? html`
                                <button class="btn-chip btn-reset-zoom" @click=${() => this.followLive()} title="Follow the newest data again (or double click the chart)">
                                    <span class="live-dot"></span> Live
                                </button>` : ""}
                            ${this.p.exportButton ? html`
                                <button class="btn-chip" title="Download what the chart shows" @click=${() => this.exportData({ format: "csv", range: this.p.exportRange || "visible" })}>⤓ CSV</button>
                                <button class="btn-chip" title="Download what the chart shows" @click=${() => this.exportData({ format: "xlsx", range: this.p.exportRange || "visible" })}>⤓ Excel</button>` : ""}
                        </div>
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
