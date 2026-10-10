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

export class TimeSeriesRingBuffer {
    constructor(capacity = 10000) {
        this.capacity = Math.max(50, capacity);
        this.x = new Float64Array(this.capacity);
        this.y = new Float64Array(this.capacity);
        this.head = 0;
        this.count = 0;
        // The times a value was MISSING (null / undefined: a sensor with nothing to say, not a 0): not points, only places where a
        // chart may cut its line (./gaps.js). Ascending, none before the oldest point; kept even when the chart connects, so a chart
        // that is switched to "gap" shows them for the data it already has.
        this.breaks = [];
        this._allocLod();
    }

    /** A value was missing at x: remembered when a point came before it (a gap needs a line to cut). -> whether it was added. */
    markBreak(x) {
        if (!Number.isFinite(x) || !this.count || x < this.getX(0)) return false;
        const b = this.breaks;
        let i = b.length;
        if (i && x <= b[i - 1]) {
            if (x === b[i - 1]) return false;
            let lo = 0, hi = i;                       // late: into its place
            while (lo < hi) { const m = (lo + hi) >> 1; if (b[m] < x) lo = m + 1; else hi = m; }
            if (b[lo] === x) return false;
            b.splice(lo, 0, x);
        } else b.push(x);
        if (b.length > this.capacity) b.splice(0, b.length - this.capacity);
        return true;
    }

    /** The breaks that still have a point before them (the oldest ones go as the ring drops its points). */
    breaksKept() {
        const b = this.breaks;
        if (b.length && this.count) {
            const first = this.getX(0);
            let k = 0;
            while (k < b.length && b[k] < first) k++;
            if (k) b.splice(0, k);
        }
        return b;
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
        this.breaks.length = 0;
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
        const xs = [], ys = [], gone = [];
        let sorted = true;
        for (let i = 0; i < arr.length; i++) {
            const item = arr[i];
            if (!item || typeof item !== "object") continue;
            const x = Number(item[xField]);
            const raw = item[yField];
            // null / undefined / "" is a value that is missing (never a 0); the time it was missing is a break
            const y = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
            if (!Number.isFinite(x)) continue;
            if (!Number.isFinite(y)) { gone.push(x); continue; }
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
        for (const x of gone) this.markBreak(x);
    }

    getX(i) {
        return this.x[this._at(i)];
    }

    getY(i) {
        return this.y[this._at(i)];
    }

    get length() {
        return this.count;
    }

    timeAt(i) {
        return this.getX(i);
    }

    valAt(i) {
        return this.getY(i);
    }

    valAtTime(targetX) {
        if (this.count === 0) return 0;
        const idx = this.findClosestIndex(targetX);
        if (idx === -1) return 0;
        return this.getY(idx);
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
export function lowerBoundRing(buf, targetX) {
    let lo = 0;
    let hi = buf.count;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (buf.getX(mid) < targetX) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

export function upperBoundRing(buf, targetX) {
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

export class M4Decimator {
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
