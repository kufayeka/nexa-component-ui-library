// Nexa UI — fits for a scatter: least squares lines and curves, R², a confidence band, a group's ellipse and hull.
// Pure: no DOM, no SDK (tested on its own, test/chart-pure.test.js).
//
//   fit(xs, ys, n, model) -> { model, coef, r2, n, f(x), text, band?(x) } | null
//     model: "linear" (y = a + b·x), "poly2" (y = a + b·x + c·x²), "exp" (y = a·e^(b·x), y > 0), "log" (y = a + b·ln x, x > 0)
//     band (linear only): the 95 % confidence band of the mean, ± its half width at x
//   ellipse(xs, ys, idx) -> { cx, cy, rx, ry, angle } (2 standard deviations: about 86 % of a normal cloud)
//   hull(xs, ys, idx) -> [[x, y], …] the convex hull (monotone chain), counter-clockwise

const fmt = (v) => {
    const a = Math.abs(v);
    if (a !== 0 && (a < 0.001 || a >= 1e6)) return v.toExponential(3);
    return String(Math.round(v * 1e4) / 1e4);
};

// R² of a prediction against the data: 1 − SSE / SST
function rSquared(xs, ys, n, f) {
    let my = 0, k = 0;
    for (let i = 0; i < n; i++) { const y = ys[i]; if (y === y && xs[i] === xs[i]) { my += y; k++; } }
    if (k < 2) return NaN;
    my /= k;
    let sse = 0, sst = 0;
    for (let i = 0; i < n; i++) {
        const x = xs[i], y = ys[i];
        if (!(y === y) || !(x === x)) continue;
        const p = f(x);
        if (!(p === p)) continue;
        sse += (y - p) * (y - p); sst += (y - my) * (y - my);
    }
    return sst > 0 ? 1 - sse / sst : 1;
}

// the least squares line of (u, v) where keep(i): { a, b, n, mu, suu, s } (s: the residual standard deviation)
function line(xs, ys, n, tu, tv, keep) {
    let k = 0, su = 0, sv = 0;
    for (let i = 0; i < n; i++) { if (!keep(i)) continue; su += tu(xs[i]); sv += tv(ys[i]); k++; }
    if (k < 2) return null;
    const mu = su / k, mv = sv / k;
    let suu = 0, suv = 0;
    for (let i = 0; i < n; i++) { if (!keep(i)) continue; const du = tu(xs[i]) - mu; suu += du * du; suv += du * (tv(ys[i]) - mv); }
    if (!(suu > 0)) return null;
    const b = suv / suu, a = mv - b * mu;
    let sse = 0;
    for (let i = 0; i < n; i++) { if (!keep(i)) continue; const r = tv(ys[i]) - (a + b * tu(xs[i])); sse += r * r; }
    return { a, b, n: k, mu, suu, s: k > 2 ? Math.sqrt(sse / (k - 2)) : 0 };
}

const finite = (xs, ys) => (i) => xs[i] === xs[i] && ys[i] === ys[i] && Number.isFinite(xs[i]) && Number.isFinite(ys[i]);

export function fit(xs, ys, n, model) {
    const ok = finite(xs, ys), id = (v) => v;
    if (model === "linear") {
        const L = line(xs, ys, n, id, id, ok);
        if (!L) return null;
        const f = (x) => L.a + L.b * x;
        // the 95 % band of the mean (t ≈ 1.96 for a large n; a little wider for a small one)
        const t = L.n > 30 ? 1.96 : L.n > 10 ? 2.2 : 2.6;
        return { model, coef: [L.a, L.b], n: L.n, f, r2: rSquared(xs, ys, n, f), text: "y = " + fmt(L.b) + "x " + (L.a < 0 ? "− " : "+ ") + fmt(Math.abs(L.a)),
            band: (x) => t * L.s * Math.sqrt(1 / L.n + ((x - L.mu) * (x - L.mu)) / L.suu) };
    }
    if (model === "exp") {
        const L = line(xs, ys, n, id, (y) => Math.log(y), (i) => ok(i) && ys[i] > 0);
        if (!L) return null;
        const a = Math.exp(L.a), b = L.b, f = (x) => a * Math.exp(b * x);
        return { model, coef: [a, b], n: L.n, f, r2: rSquared(xs, ys, n, f), text: "y = " + fmt(a) + "·e^(" + fmt(b) + "x)" };
    }
    if (model === "log") {
        const L = line(xs, ys, n, (x) => Math.log(x), id, (i) => ok(i) && xs[i] > 0);
        if (!L) return null;
        const f = (x) => (x > 0 ? L.a + L.b * Math.log(x) : NaN);
        return { model, coef: [L.a, L.b], n: L.n, f, r2: rSquared(xs, ys, n, f), text: "y = " + fmt(L.a) + (L.b < 0 ? " − " : " + ") + fmt(Math.abs(L.b)) + "·ln x" };
    }
    if (model === "poly2") {
        // the normal equations of y = a + b x + c x², x centred (better conditioned)
        let k = 0, mx = 0;
        for (let i = 0; i < n; i++) if (ok(i)) { mx += xs[i]; k++; }
        if (k < 3) return null;
        mx /= k;
        let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
        for (let i = 0; i < n; i++) {
            if (!ok(i)) continue;
            const u = xs[i] - mx, u2 = u * u, y = ys[i];
            s0++; s1 += u; s2 += u2; s3 += u2 * u; s4 += u2 * u2; t0 += y; t1 += u * y; t2 += u2 * y;
        }
        const M = [[s0, s1, s2, t0], [s1, s2, s3, t1], [s2, s3, s4, t2]];
        for (let c = 0; c < 3; c++) {
            let piv = c;
            for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
            if (Math.abs(M[piv][c]) < 1e-12) return null;
            [M[c], M[piv]] = [M[piv], M[c]];
            for (let r = 0; r < 3; r++) { if (r === c) continue; const q = M[r][c] / M[c][c]; for (let j = c; j < 4; j++) M[r][j] -= q * M[c][j]; }
        }
        const A = M[0][3] / M[0][0], B = M[1][3] / M[1][1], C = M[2][3] / M[2][2];
        // back to x: a + b (x − m) + c (x − m)²
        const a = A - B * mx + C * mx * mx, b = B - 2 * C * mx, c = C;
        const f = (x) => a + b * x + c * x * x;
        return { model, coef: [a, b, c], n: k, f, r2: rSquared(xs, ys, n, f), text: "y = " + fmt(c) + "x² " + (b < 0 ? "− " : "+ ") + fmt(Math.abs(b)) + "x " + (a < 0 ? "− " : "+ ") + fmt(Math.abs(a)) };
    }
    return null;
}

/** A group's ellipse of 2 standard deviations (its covariance): { cx, cy, rx, ry, angle } (null: fewer than 3). */
export function ellipse(xs, ys, idx) {
    const k = idx.length;
    if (k < 3) return null;
    let mx = 0, my = 0;
    for (const i of idx) { mx += xs[i]; my += ys[i]; }
    mx /= k; my /= k;
    let sxx = 0, syy = 0, sxy = 0;
    for (const i of idx) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    sxx /= k - 1; syy /= k - 1; sxy /= k - 1;
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
    const angle = Math.abs(sxy) > 1e-15 ? Math.atan2(l1 - sxx, sxy) : sxx >= syy ? 0 : Math.PI / 2;
    return { cx: mx, cy: my, rx: 2 * Math.sqrt(l1), ry: 2 * Math.sqrt(l2), angle };
}

/** The convex hull of a group's points (monotone chain), counter-clockwise: [[x, y], …]. */
export function hull(xs, ys, idx) {
    const pts = idx.map((i) => [xs[i], ys[i]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    upper.pop(); lower.pop();
    return lower.concat(upper);
}
