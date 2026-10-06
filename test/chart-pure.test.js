'use strict';

// The pure parts of the Cartesian chart (dist/chart/rows.js, stack.js): rows -> columns, stacking, nice ticks.
// No browser.   node test/chart-pure.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// the modules are plain ES modules without imports: load them without a bundler
function load(file) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'chart', file), 'utf8');
    const names = [...src.matchAll(/^export (?:var|let|const|function) (\w+)/gm)].map((m) => m[1]);
    return new Function(src.replace(/^export /gm, '') + '\nreturn {' + names.join(',') + '};')();
}
const R = load('rows.js'), S = load('stack.js'), C = load('curves.js'), F = load('fit.js'), Q = load('spc-core.js');

let passed = 0;
function ok(label, fn) { fn(); passed++; console.log('✔ ' + label); }
const arr = (a) => Array.from(a, (v) => (Number.isNaN(v) ? null : v));

const T0 = 1727852400000;

ok('detectXType: epoch ms and seconds, Dates and ISO strings are time; numbers are numbers; words are categories', () => {
    assert.strictEqual(R.detectXType([T0, T0 + 1000]), 'time');
    assert.strictEqual(R.detectXType([1727852400, 1727852460]), 'time', 'seconds');
    assert.strictEqual(R.detectXType(['2026-10-03T10:00:00Z', '2026-10-03T11:00:00Z']), 'time');
    assert.strictEqual(R.detectXType([new Date(T0)]), 'time');
    assert.strictEqual(R.detectXType([1, 2, 3.5]), 'number');
    assert.strictEqual(R.detectXType(['Floor 1', 'Floor 2']), 'category');
    assert.strictEqual(R.detectXType([1, 'a']), 'category');
    assert.strictEqual(R.detectXType([]), 'category');
    assert.strictEqual(R.toMs(1727852400), 1727852400000);
    assert.strictEqual(R.toMs(T0), T0);
    assert.ok(Number.isNaN(R.toMs('x')));
});

ok('long form: a split field makes a series per value; categories in the order of the data; a missing value is NaN', () => {
    const rows = [
        { floor: 'F1', hour: 'h1', kwh: 10 }, { floor: 'F2', hour: 'h1', kwh: 20 },
        { floor: 'F1', hour: 'h2', kwh: 15 }, { floor: 'F2', hour: 'h3', kwh: 5 }
    ];
    const f = R.buildFrame(rows, { x: 'hour', y: 'kwh', split: 'floor' });
    assert.strictEqual(f.xType, 'category');
    assert.deepStrictEqual(f.cats, ['h1', 'h2', 'h3']);
    assert.deepStrictEqual(f.series.map((s) => s.name), ['F1', 'F2']);
    assert.deepStrictEqual(arr(f.series[0].y), [10, 15, null]);
    assert.deepStrictEqual(arr(f.series[1].y), [20, null, 5]);
});

ok('wide form: several y fields, a series each; one y and no split: one series named after the field', () => {
    const rows = [{ t: 'a', p: 1, q: 2 }, { t: 'b', p: 3, q: 4 }];
    const w = R.buildFrame(rows, { x: 't', y: ['p', 'q'] });
    assert.deepStrictEqual(w.series.map((s) => s.name), ['p', 'q']);
    assert.deepStrictEqual(arr(w.series[1].y), [2, 4]);
    const one = R.buildFrame(rows, { x: 't', y: 'p' });
    assert.deepStrictEqual(one.series.map((s) => s.name), ['p']);
});

ok('duplicates of one x are aggregated (sum, avg, last, min, max, count); strings that are numbers count', () => {
    const rows = [{ c: 'a', v: 1 }, { c: 'a', v: '3' }, { c: 'b', v: 10 }, { c: 'a', v: 5 }];
    const get = (how) => arr(R.buildFrame(rows, { x: 'c', y: 'v' }, { aggregate: how }).series[0].y);
    assert.deepStrictEqual(get('sum'), [9, 10]);
    assert.deepStrictEqual(get('avg'), [3, 10]);
    assert.deepStrictEqual(get('last'), [5, 10]);
    assert.deepStrictEqual(get('min'), [1, 10]);
    assert.deepStrictEqual(get('max'), [5, 10]);
    assert.deepStrictEqual(get('count'), [3, 1]);
});

ok('a time x: sorted pairs per series (Float64: exact), seconds converted, bad rows skipped', () => {
    const rows = [
        { t: T0 + 2000, w: 'a', y: 3 }, { t: T0, w: 'a', y: 1.25 }, { t: T0 + 1000, w: 'a', y: 2 },
        { t: 'garbage', w: 'a', y: 99 }, { t: T0, w: 'b', y: 7 }, null, 5
    ];
    const f = R.buildFrame(rows, { x: 't', y: 'y', split: 'w' });
    assert.strictEqual(f.xType, 'category', 'a column with garbage in it is not time');
    const g = R.buildFrame(rows.filter((r) => r && typeof r === 'object' && r.t !== 'garbage'), { x: 't', y: 'y', split: 'w' });
    assert.strictEqual(g.xType, 'time');
    assert.deepStrictEqual(Array.from(g.series[0].x), [T0, T0 + 1000, T0 + 2000]);
    assert.deepStrictEqual(Array.from(g.series[0].y), [1.25, 2, 3]);
    assert.strictEqual(g.series[0].x instanceof Float64Array, true);
    const sec = R.buildFrame([{ t: 1727852400, y: 1 }, { t: 1727852401, y: 2 }], { x: 't', y: 'y' });
    assert.deepStrictEqual(Array.from(sec.series[0].x), [1727852400000, 1727852401000]);
});

ok('category order: data, asc, desc; maxCategories caps them', () => {
    const rows = [{ c: 'b', y: 1 }, { c: 'c', y: 2 }, { c: 'a', y: 3 }];
    assert.deepStrictEqual(R.buildFrame(rows, { x: 'c', y: 'y' }).cats, ['b', 'c', 'a']);
    assert.deepStrictEqual(R.buildFrame(rows, { x: 'c', y: 'y' }, { order: 'asc' }).cats, ['a', 'b', 'c']);
    assert.deepStrictEqual(R.buildFrame(rows, { x: 'c', y: 'y' }, { order: 'desc' }).cats, ['c', 'b', 'a']);
    assert.deepStrictEqual(R.buildFrame(rows, { x: 'c', y: 'y' }, { maxCategories: 2 }).cats, ['b', 'c']);
    assert.deepStrictEqual(R.buildFrame(null, {}).series, []);
});

ok('stackColumns: stacked piles (positives and negatives apart), percent to 100, clustered slots, none from 0', () => {
    const y = (...v) => Float64Array.from(v);
    const st = S.stackColumns([{ y: y(1, 2, -1) }, { y: y(2, 3, -2) }], 3, 'stacked');
    assert.deepStrictEqual([arr(st[0].lo), arr(st[0].hi)], [[0, 0, -1], [1, 2, 0]], 'lo is always the lower end');
    assert.deepStrictEqual([arr(st[1].lo), arr(st[1].hi)], [[1, 2, -3], [3, 5, -1]], 'the second sits on the first; negatives go down');
    const pc = S.stackColumns([{ y: y(1, 0) }, { y: y(3, 0) }], 2, 'percent');
    assert.deepStrictEqual(arr(pc[1].hi), [100, 0]);
    assert.deepStrictEqual(arr(pc[0].hi), [25, 0]);
    const cl = S.stackColumns([{ y: y(1) }, { y: y(2) }, { y: y(3) }], 1, 'clustered');
    assert.deepStrictEqual(cl.map((o) => [o.slot, o.slots]), [[0, 3], [1, 3], [2, 3]]);
    assert.deepStrictEqual(arr(cl[2].hi), [3]);
    const none = S.stackColumns([{ y: y(5, NaN) }], 2, 'none');
    assert.deepStrictEqual([arr(none[0].lo), arr(none[0].hi)], [[0, null], [5, null]]);
});

ok('piles by group: series of one group stack, the groups stand side by side', () => {
    const y = (...v) => Float64Array.from(v);
    const st = S.stackColumns([{ y: y(1), group: 'floors' }, { y: y(2), group: 'floors' }, { y: y(10), group: 'solar' }], 1, 'stacked');
    assert.deepStrictEqual(st.map((o) => [o.slot, o.slots, o.lo[0], o.hi[0]]), [[0, 2, 0, 1], [0, 2, 1, 3], [1, 2, 0, 10]]);
});

ok('niceTicks: 1 / 2 / 5 steps, the ends rounded outwards; a flat range still has an axis; logTicks: decades', () => {
    assert.deepStrictEqual(S.niceTicks(0, 87, 5), { min: 0, max: 100, step: 20, ticks: [0, 20, 40, 60, 80, 100] });
    assert.deepStrictEqual(S.niceTicks(3, 3, 4).ticks.length > 1, true);
    const t = S.niceTicks(-0.3, 0.7, 5);
    assert.ok(t.min <= -0.3 && t.max >= 0.7 && t.ticks.indexOf(0) !== -1, JSON.stringify(t));
    assert.deepStrictEqual(S.logTicks(1, 1000).filter((t) => t === 1 || t === 10 || t === 100 || t === 1000), [1, 10, 100, 1000]);
    assert.ok(S.logTicks(1, 10000).indexOf(100) !== -1 && S.logTicks(1, 10000).indexOf(2) === -1, 'decades only when wide');
    assert.deepStrictEqual(S.extent([Float64Array.from([3, NaN, 1]), [Infinity, 9]]), { min: 1, max: 9 });
});

ok('monotoneSegments: ends at the points, never overshoots a peak or a valley (a flat run stays flat); stepPoints: after / before / center', () => {
    const xs = [0, 1, 2, 3, 4], ys = [0, 0, 10, 10, 0];
    const seg = C.monotoneSegments(xs, ys, 5);
    assert.strictEqual(seg.length, 24);
    for (let k = 0; k < 4; k++) {
        assert.strictEqual(seg[k * 6 + 4], xs[k + 1]); assert.strictEqual(seg[k * 6 + 5], ys[k + 1]);
        [1, 3].forEach((o) => assert.ok(seg[k * 6 + o] >= -1e-9 && seg[k * 6 + o] <= 10 + 1e-9, 'a control point stays within the data: ' + seg[k * 6 + o]));
    }
    [seg[0] - 1 / 3, seg[1], seg[2] - 2 / 3, seg[3]].forEach((v) => assert.ok(Math.abs(v) < 1e-12, 'the flat start stays flat'));
    assert.strictEqual(C.monotoneSegments([0], [1], 1).length, 0);
    assert.deepStrictEqual(C.stepPoints([0, 10, 20], [1, 2, 3], 3, 'after'), [0, 1, 10, 1, 10, 2, 20, 2, 20, 3]);
    assert.deepStrictEqual(C.stepPoints([0, 10], [1, 2], 2, 'before'), [0, 1, 0, 2, 10, 2]);
    assert.deepStrictEqual(C.stepPoints([0, 10], [1, 2], 2, 'center'), [0, 1, 5, 1, 5, 2, 10, 2]);
});

ok('fit: a line, a parabola, exponential and logarithmic recover their coefficients with R2 = 1; the band is narrowest at the mean; too few points: null', () => {
    const xs = Float64Array.from([1, 2, 3, 4, 5, 6, 7, 8]), near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, msg + ': ' + a + ' vs ' + b);
    const lin = F.fit(xs, xs.map((x) => 2 * x + 1), 8, 'linear');
    near(lin.coef[0], 1, 'a'); near(lin.coef[1], 2, 'b'); near(lin.r2, 1, 'r2'); assert.strictEqual(lin.text, 'y = 2x + 1');
    const p2 = F.fit(xs, xs.map((x) => x * x - 3 * x + 2), 8, 'poly2');
    near(p2.coef[0], 2, 'a'); near(p2.coef[1], -3, 'b'); near(p2.coef[2], 1, 'c'); near(p2.r2, 1, 'r2');
    const ex = F.fit(xs, xs.map((x) => 3 * Math.exp(0.5 * x)), 8, 'exp');
    near(ex.coef[0], 3, 'a'); near(ex.coef[1], 0.5, 'b');
    const lg = F.fit(xs, xs.map((x) => 1 + 2 * Math.log(x)), 8, 'log');
    near(lg.coef[0], 1, 'a'); near(lg.coef[1], 2, 'b');
    const noisy = F.fit(xs, Float64Array.from([3, 5.5, 6.8, 9.4, 10.6, 13.3, 15.1, 16.8]), 8, 'linear');
    assert.ok(noisy.r2 > 0.98 && noisy.r2 < 1, 'a noisy line');
    assert.ok(noisy.band(4.5) < noisy.band(1) && noisy.band(4.5) < noisy.band(8), 'the band widens away from the mean');
    assert.strictEqual(F.fit(Float64Array.from([1]), Float64Array.from([1]), 1, 'linear'), null);
    assert.strictEqual(F.fit(Float64Array.from([2, 2, 2]), Float64Array.from([1, 2, 3]), 3, 'linear'), null, 'every x the same');
    assert.strictEqual(F.fit(xs, xs.map((x) => -x), 8, 'exp'), null, 'exp needs y > 0');
    const nan = F.fit(Float64Array.from([1, 2, NaN, 3]), Float64Array.from([2, 4, 5, 6]), 4, 'linear');
    assert.strictEqual(nan.n, 3, 'NaN points skipped');
});

ok('ellipse: a cloud along y = x leans 45 degrees, centred at the means; hull: the corners only, counter-clockwise', () => {
    const xs = [0, 1, 2, 3, 4, 5], ys = [0.1, 0.9, 2.1, 2.9, 4.1, 4.9], idx = [0, 1, 2, 3, 4, 5];
    const e = F.ellipse(xs, ys, idx);
    assert.ok(Math.abs(e.cx - 2.5) < 1e-9 && Math.abs(e.cy - 2.5) < 1e-9);
    assert.ok(Math.abs(e.angle - Math.PI / 4) < 0.05, 'angle ' + e.angle);
    assert.ok(e.rx > e.ry * 5, 'long and thin');
    assert.strictEqual(F.ellipse(xs, ys, [0, 1]), null);
    const hx = [0, 4, 4, 0, 2, 1], hy = [0, 0, 4, 4, 2, 3];
    assert.deepStrictEqual(F.hull(hx, hy, [0, 1, 2, 3, 4, 5]), [[0, 0], [4, 0], [4, 4], [0, 4]]);
});

ok('SPC constants: d2 / d3 / c4 and the textbook A2, D3, D4, A3, B3, B4', () => {
    const near = (a, b, e, m) => assert.ok(Math.abs(a - b) < (e || 1e-3), m + ': ' + a + ' vs ' + b);
    const k5 = Q.constants(5);
    near(k5.A2, 0.577, 1e-3, 'A2(5)'); near(k5.D4, 2.114, 1e-3, 'D4(5)'); assert.strictEqual(k5.D3, 0);
    near(k5.c4, 0.9400, 1e-4, 'c4(5)'); near(k5.A3, 1.427, 1e-3, 'A3(5)'); near(k5.B4, 2.089, 1e-3, 'B4(5)');
    near(Q.constants(7).D3, 0.076, 1e-3, 'D3(7)'); near(Q.c4(2), 0.7979, 1e-4, 'c4(2)'); near(Q.c4(25), 0.9896, 1e-4, 'c4(25)');
    near(Q.constants(2).D4, 3.267, 2e-3, 'D4(2), the MR chart');
});

ok('SPC subgroups: each its own, every N (never across a phase), by a field, per interval; autoType', () => {
    const v = (arr, extra) => arr.map((x, i) => Object.assign({ t: 1000 * i, v: x }, extra ? extra(i) : {}));
    assert.deepStrictEqual(Q.subgroups(v([1, 2, 3]), { by: 'none' }).map((g) => g.vals), [[1], [2], [3]]);
    assert.deepStrictEqual(Q.subgroups(v([1, 2, 3, 4, 5, 6, 7]), { by: 'size', size: 3 }).map((g) => g.vals), [[1, 2, 3], [4, 5, 6], [7]]);
    assert.deepStrictEqual(Q.subgroups(v([1, 2, 3, 4], (i) => ({ phase: i < 2 ? 'A' : 'B' })), { by: 'size', size: 3 }).map((g) => [g.phase, g.vals]), [['A', [1, 2]], ['B', [3, 4]]]);
    assert.deepStrictEqual(Q.subgroups(v([1, 2, 3], (i) => ({ key: i < 2 ? 'L1' : 'L2' })), { by: 'field' }).map((g) => [g.key, g.vals]), [['L1', [1, 2]], ['L2', [3]]]);
    assert.deepStrictEqual(Q.subgroups(v([1, 2, 3, 4, 5]), { by: 'time', interval: 2000 }).map((g) => [g.t, g.vals]), [[0, [1, 2]], [2000, [3, 4]], [4000, [5]]]);
    assert.strictEqual(Q.subgroups([{ v: 'x' }, { v: NaN }, { v: 2 }], { by: 'none' }).length, 1, 'non-numbers skipped');
    assert.strictEqual(Q.autoType([{ vals: [1] }], 'measure'), 'imr');
    assert.strictEqual(Q.autoType([{ vals: [1, 2, 3, 4, 5] }], 'measure'), 'xbar-r');
    assert.strictEqual(Q.autoType([{ vals: new Array(12).fill(1) }], 'measure'), 'xbar-s');
    assert.strictEqual(Q.autoType([{ n: 50 }, { n: 50 }], 'count', 'defectives'), 'np');
    assert.strictEqual(Q.autoType([{ n: 50 }, { n: 80 }], 'count', 'defectives'), 'p');
    assert.strictEqual(Q.autoType([{ n: 1 }, { n: 1 }], 'count', 'defects'), 'c');
    assert.strictEqual(Q.autoType([{ n: 4 }, { n: 6 }], 'count', 'defects'), 'u');
});

ok('SPC limits: I-MR = mean +- 2.66 MR-bar, MR UCL 3.267 MR-bar; X-bar-R = A2 R-bar; X-bar-S = A3 S-bar; p steps with n; c; an excluded point is out of the limits', () => {
    const near = (a, b, m) => assert.ok(Math.abs(a - b) < 2e-3, m + ': ' + a + ' vs ' + b);
    const g1 = [10, 12, 11, 13, 12].map((x, i) => ({ key: String(i), vals: [x] }));
    const P = Q.analyse(g1, { type: 'imr' }).points;
    near(P[0].cl, 11.6, 'centre'); near(P[0].ucl, 11.6 + 2.66 * 1.5, 'UCL'); near(P[0].lcl, 11.6 - 2.66 * 1.5, 'LCL');
    assert.ok(Number.isNaN(P[0].y)); near(P[1].y, 2, 'MR'); near(P[1].cl2, 1.5, 'MR-bar'); assert.ok(Math.abs(P[1].ucl2 - 3.267 * 1.5) < 5e-3, 'MR UCL');
    const sg = [[10, 11, 9, 10, 12], [11, 10, 10, 9, 11], [9, 10, 12, 11, 10]].map((vals, i) => ({ key: String(i), vals }));
    const r = Q.analyse(sg, { type: 'xbar-r' }).points, rbar = (3 + 2 + 3) / 3, xbb = (10.4 + 10.2 + 10.4) / 3;
    near(r[0].ucl, xbb + 0.577 * rbar, 'X-bar UCL = A2 R-bar'); near(r[0].ucl2, 2.114 * rbar, 'R UCL = D4 R-bar'); assert.strictEqual(r[0].lcl2, 0);
    const s = Q.analyse(sg, { type: 'xbar-s' }).points;
    const sbar = (Math.sqrt(1.3) + Math.sqrt(0.7) + Math.sqrt(1.3)) / 3;
    near(s[0].ucl, xbb + 1.427 * sbar, 'X-bar UCL = A3 S-bar'); near(s[0].ucl2, 2.089 * sbar, 'S UCL = B4 S-bar');
    const pc = Q.analyse([{ key: 'a', count: 2, n: 100 }, { key: 'b', count: 3, n: 200 }, { key: 'c', count: 1, n: 100 }], { type: 'p' }).points;
    near(pc[0].cl, 0.015, 'p-bar'); near(pc[0].ucl, 0.015 + 3 * Math.sqrt(0.015 * 0.985 / 100), 'UCL n 100'); assert.ok(pc[1].ucl < pc[0].ucl, 'a larger n: tighter'); assert.strictEqual(pc[0].lcl, 0);
    const cc = Q.analyse([4, 6, 5].map((c, i) => ({ key: String(i), count: c, n: 1 })), { type: 'c' }).points;
    near(cc[0].ucl, 5 + 3 * Math.sqrt(5), 'c UCL');
    const ex = Q.analyse([10, 10, 10, 10, 50].map((x, i) => ({ key: String(i), vals: [x], excluded: i === 4 })), { type: 'imr' }).points;
    near(ex[0].cl, 10, 'the excluded 50 is not in the centre'); assert.deepStrictEqual(ex[4].rules, [], 'nor flagged');
});

ok('SPC baselines and phases: limits from the first N (locked), a time range, manual; each phase its own limits', () => {
    const vals = [10, 11, 10, 11, 10, 11, 20, 21, 20, 21];
    const g = vals.map((x, i) => ({ key: String(i), t: i, vals: [x], phase: i < 6 ? 'Before' : 'After' }));
    const a = Q.analyse(g, { type: 'imr' });
    assert.deepStrictEqual(a.segments.map((s) => [s.phase, s.from, s.to, s.center]), [['Before', 0, 5, 10.5], ['After', 6, 9, 20.5]]);
    const flat = vals.map((x, i) => ({ key: String(i), t: i, vals: [x] }));
    const f = Q.analyse(flat, { type: 'imr', baseline: { mode: 'first', count: 4 } });
    assert.strictEqual(f.points[9].cl, 10.5, 'the first 4 only: the later shift does not move the centre');
    assert.ok(f.points[8].rules.includes('N1'), 'so the shift is flagged');
    assert.deepStrictEqual(f.points.map((p) => p.base), [true, true, true, true, false, false, false, false, false, false]);
    assert.strictEqual(Q.analyse(flat, { type: 'imr', baseline: { mode: 'range', from: 6, to: 9 } }).points[0].cl, 20.5);
    const m = Q.analyse(flat, { type: 'imr', baseline: { mode: 'manual', mean: 12, sigma: 2 } }).points[0];
    assert.deepStrictEqual([m.cl, m.ucl, m.lcl], [12, 18, 6]);
});

ok('SPC rules: each Nelson pattern at the point that completes it; Western Electric 4 = 8 on a side', () => {
    const all = Q.RULE_SETS.nelson.concat(['WE4']), at = (z, rule) => Q.checkRules(z, all).map((r, i) => (r.includes(rule) ? i : -1)).filter((i) => i >= 0);
    assert.deepStrictEqual(at([0, 0, 0, 4, -3.5], 'N1'), [3, 4]);
    assert.deepStrictEqual(at(new Array(10).fill(0.5), 'N2'), [8, 9]);
    assert.deepStrictEqual(at(new Array(9).fill(-0.5), 'WE4'), [7, 8]);
    assert.deepStrictEqual(at([-1, -0.5, 0, 0.5, 1, 1.5], 'N3'), [5]);
    assert.deepStrictEqual(at([2, 1.5, 1, 0.5, 0, -0.5, -1], 'N3'), [5, 6]);
    const alt = Array.from({ length: 15 }, (_, i) => (i % 2 ? 0.1 : -0.1));
    assert.deepStrictEqual(at(alt, 'N4'), [13, 14]);
    assert.deepStrictEqual(at(alt, 'N7'), [14]);
    assert.deepStrictEqual(at([0, 2.5, 0, 2.5], 'N5'), [3]);
    assert.deepStrictEqual(at([0, 2.5, -2.5, 0], 'N5'), [], 'opposite sides');
    assert.deepStrictEqual(at([1.5, 1.5, 0, 1.5, 1.5], 'N6'), [4]);
    assert.deepStrictEqual(at(Array.from({ length: 8 }, (_, i) => (i % 2 ? 1.5 : -1.5)), 'N8'), [7]);
    assert.deepStrictEqual(Q.checkRules([4], ['N2']), [[]], 'only the enabled rules');
});

ok('SPC capability: Cp, Cpk (within), Pp, Ppk (overall), one-sided, the expected PPM', () => {
    const v = [9, 10, 11, 9, 10, 11, 9, 10, 11];
    const c = Q.capability(v, { usl: 13, lsl: 7, sigmaWithin: 1 });
    assert.strictEqual(c.n, 9); assert.ok(Math.abs(c.mean - 10) < 1e-12);
    assert.ok(Math.abs(c.cp - 1) < 1e-9 && Math.abs(c.cpk - 1) < 1e-9, 'within: Cp = Cpk = 1');
    assert.ok(Math.abs(c.pp - 6 / (6 * c.sdOverall)) < 1e-9 && c.ppk > 1);
    const one = Q.capability(v, { usl: 12, sigmaWithin: 1 });
    assert.ok(Number.isNaN(one.cp) && Math.abs(one.cpk - 2 / 3) < 1e-9, 'one-sided: Cpk = CPU');
    assert.ok(Math.abs(Q.normCdf(1.96) - 0.975) < 1e-4 && Math.abs(Q.normCdf(0) - 0.5) < 1e-7);
    const shifted = Q.capability([12, 12.5, 13, 13.5, 14], { usl: 13, lsl: 7 });
    assert.strictEqual(shifted.outAbove, 2); assert.ok(shifted.ppm > 400000);
});

console.log(`\n${passed} passed\nALL OK`);
