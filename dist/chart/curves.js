// Nexa UI — chart curves. Pure: no DOM, no SDK (tested on its own, test/chart-pure.test.js).
//
//   monotoneSegments(xs, ys, n) -> Float64Array(6 * (n - 1)): for each segment k (from point k to k + 1)
//     c1x, c1y, c2x, c2y, x1, y1 — the two control points and the end of a cubic Bezier; the start is the point k.
//   A monotone cubic (Fritsch–Carlson): smooth, and it never overshoots a peak or a valley (a smoothed 0 / 100 signal
//   does not dip below 0), the curve Grafana's "smooth" and the Line Chart draw.
//   Forwards:  ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x1, y1)
//   Backwards (the lower edge of an area): ctx.bezierCurveTo(c2x, c2y, c1x, c1y, x0, y0), the segments from the last to the first.

export function monotoneSegments(xs, ys, n) {
    n = n === undefined ? xs.length : n;
    const out = new Float64Array(Math.max(0, n - 1) * 6);
    if (n < 2) return out;
    const d = new Float64Array(n), t = new Float64Array(n);
    for (let k = 0; k < n - 1; k++) { const h = xs[k + 1] - xs[k]; d[k] = h ? (ys[k + 1] - ys[k]) / h : 0; }
    t[0] = d[0]; t[n - 1] = d[n - 2];
    for (let k = 1; k < n - 1; k++) t[k] = d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
    for (let k = 0; k < n - 1; k++) {
        if (d[k] === 0) { t[k] = 0; t[k + 1] = 0; continue; }
        const al = t[k] / d[k], be = t[k + 1] / d[k], q = al * al + be * be;
        if (q > 9) { const tau = 3 / Math.sqrt(q); t[k] = tau * al * d[k]; t[k + 1] = tau * be * d[k]; }
    }
    for (let k = 0; k < n - 1; k++) {
        const h = (xs[k + 1] - xs[k]) / 3, o = k * 6;
        out[o] = xs[k] + h; out[o + 1] = ys[k] + t[k] * h;
        out[o + 2] = xs[k + 1] - h; out[o + 3] = ys[k + 1] - t[k + 1] * h;
        out[o + 4] = xs[k + 1]; out[o + 5] = ys[k + 1];
    }
    return out;
}

/**
 * The corners of a step line through n points (x ascending): [x, y, x, y …] flat.
 * mode "after" (the value holds until the next point), "before" (it holds from the previous one), "center" (half way).
 */
export function stepPoints(xs, ys, n, mode) {
    n = n === undefined ? xs.length : n;
    const out = [];
    if (n < 1) return out;
    out.push(xs[0], ys[0]);
    for (let i = 1; i < n; i++) {
        if (mode === "before") out.push(xs[i - 1], ys[i]);
        else if (mode === "center") { const m = (xs[i - 1] + xs[i]) / 2; out.push(m, ys[i - 1], m, ys[i]); }
        else out.push(xs[i], ys[i - 1]);
        out.push(xs[i], ys[i]);
    }
    return out;
}
