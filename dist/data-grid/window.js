// Data Grid: the arithmetic of virtual scrolling. Pure.
//
// Only the rows and columns that can be seen (plus a little around them) are drawn. For that the view needs, for a scroll position:
// which row is at the top, where each row starts, how tall everything is. An "axis" answers those for rows or for columns.

/**
 * An axis of `count` equal cells of `size` px, where a few cells (`overrides`: { index: size }) have their own size. The offset of a cell
 * is found without walking all of them: the overrides are sorted once, with the running sum of what each adds, and a binary search
 * finds how many come before the cell.
 */
export function uniformAxis(count, size, overrides) {
    const idx = Object.keys(overrides || {}).map(Number).filter((i) => i >= 0 && i < count && isFinite(overrides[i]) && overrides[i] >= 0).sort((a, b) => a - b);
    const extra = [];                                       // extra[k] = what the overrides 0..k add to the plain size, in total
    let sum = 0;
    idx.forEach((i, k) => { sum += overrides[i] - size; extra[k] = sum; });
    const before = (i) => { let lo = 0, hi = idx.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (idx[mid] < i) lo = mid + 1; else hi = mid; } return lo; };   // overrides with index < i
    const offsetOf = (i) => { const k = before(i); return i * size + (k ? extra[k - 1] : 0); };
    const sizeOf = (i) => (overrides && overrides[i] !== undefined && isFinite(overrides[i]) && overrides[i] >= 0 ? overrides[i] : size);
    const total = count * size + (extra.length ? extra[extra.length - 1] : 0);
    const indexAt = (px) => {
        if (count === 0) return 0;
        if (px <= 0) return 0;
        if (px >= total) return count - 1;
        let lo = 0, hi = count - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (offsetOf(mid) <= px) lo = mid; else hi = mid - 1; }
        return lo;
    };
    return { count, total, offsetOf, sizeOf, indexAt };
}

/** An axis whose cells all have their own size (the columns). */
export function sizesAxis(sizes) {
    const starts = new Array(sizes.length + 1);
    starts[0] = 0;
    for (let i = 0; i < sizes.length; i++) starts[i + 1] = starts[i] + sizes[i];
    const indexAt = (px) => {
        if (!sizes.length || px <= 0) return 0;
        if (px >= starts[sizes.length]) return sizes.length - 1;
        let lo = 0, hi = sizes.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= px) lo = mid; else hi = mid - 1; }
        return lo;
    };
    return { count: sizes.length, total: starts[sizes.length], offsetOf: (i) => starts[i], sizeOf: (i) => sizes[i], indexAt };
}

/**
 * The cells to draw for a scroll position: from `from` (inclusive) to `to` (exclusive), with `overscan` extra cells each side so a fast
 * scroll shows no blank. `start` is the scroll offset within the axis and `length` the visible length, both in px. `skip` cells at the
 * start (the frozen ones, drawn elsewhere) are never part of the range.
 */
export function visibleRange(axis, start, length, overscan, skip) {
    const first = skip || 0;
    if (axis.count <= first || length <= 0) return { from: first, to: first };
    const base = axis.offsetOf(first);
    const a = axis.indexAt(base + Math.max(0, start));
    const b = axis.indexAt(base + Math.max(0, start) + length);
    const from = Math.max(first, a - overscan);
    const to = Math.min(axis.count, b + 1 + overscan);
    return { from, to: Math.max(from, to) };
}

/** The scroll offset that brings cell `i` fully into view, from the current offset (unchanged when it already is). */
export function scrollToShow(axis, i, start, length, skip) {
    const base = axis.offsetOf(skip || 0);
    const top = axis.offsetOf(i) - base, bottom = top + axis.sizeOf(i);
    if (top < start) return top;
    if (bottom > start + length) return Math.max(0, bottom - length);
    return start;
}
