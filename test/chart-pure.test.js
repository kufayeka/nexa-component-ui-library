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
const R = load('rows.js'), S = load('stack.js');

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

console.log(`\n${passed} passed\nALL OK`);
