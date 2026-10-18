'use strict';

// The pure parts of the Data Grid (dist/data-grid/*.js): columns, rows (store, sort, filter), layout (merges, freeze, borders, locks),
// the virtual-scroll arithmetic, staged edits, selection. No browser.   node test/data-grid-pure.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// the modules are plain ES modules without imports: load them without a bundler
function load(file) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'data-grid', file), 'utf8');
    const names = [...src.matchAll(/^export (?:var|let|const|function|class) (\w+)/gm)].map((m) => m[1]);
    return new Function(src.replace(/^export /gm, '') + '\nreturn {' + names.join(',') + '};')();
}
const Col = load('columns.js'), Rows = load('rows.js'), L = load('layout.js'), W = load('window.js'), St = load('stage.js'), Sel = load('selection.js'), D = load('design.js');

let passed = 0;
function ok(label, fn) { fn(); passed++; console.log('✔ ' + label); }

// ---- columns ----------------------------------------------------------------------------------------------

ok('columnsOf: an empty list is derived from the data (keys in order, labels from the names, types from the values)', () => {
    const cols = Col.columnsOf([], [{ id: 1, createdAt: '2026-01-01', ok: true, name: 'A' }, { id: 2, extra: 'x' }]);
    assert.deepStrictEqual(cols.map((c) => c.key), ['id', 'createdAt', 'ok', 'name', 'extra']);
    assert.deepStrictEqual(cols.map((c) => c.label), ['Id', 'Created at', 'Ok', 'Name', 'Extra']);
    assert.deepStrictEqual(cols.map((c) => c.type), ['number', 'text', 'boolean', 'text', 'text']);
    assert.strictEqual(cols[0].align, 'right', 'a number is right-aligned');
});

ok('columnsOf: a saved list is completed (defaults), an unknown type is text, a column without a key is dropped', () => {
    const cols = Col.columnsOf([{ key: 'a', type: 'nonsense', width: 'x' }, { type: 'text' }, { key: 'b', type: 'number', decimals: 2, editable: false, label: 'B!' }], [{ z: 1 }]);
    assert.strictEqual(cols.length, 2);
    assert.strictEqual(cols[0].type, 'text');
    assert.strictEqual(cols[0].width, 140);
    assert.strictEqual(cols[1].decimals, 2);
    assert.strictEqual(cols[1].editable, false);
    assert.strictEqual(cols[1].label, 'B!');
    assert.strictEqual(cols[0].hidden, false);
});

ok('displayText: numbers with decimals and suffix, dates, option labels, booleans, buttons', () => {
    const c = (o) => Col.columnsOf([Object.assign({ key: 'k' }, o)], [])[0];
    assert.strictEqual(Col.displayText(c({ type: 'number', decimals: 1, suffix: ' °C' }), 21.456), '21.5 °C');
    assert.strictEqual(Col.displayText(c({ type: 'number' }), 3), '3');
    assert.strictEqual(Col.displayText(c({ type: 'number', decimals: 2 }), 'abc'), 'abc', 'text in a number column is shown as it is');
    assert.strictEqual(Col.displayText(c({ type: 'select', options: 'on:Running, off:Stopped' }), 'on'), 'Running');
    assert.strictEqual(Col.displayText(c({ type: 'select', options: 'on:Running' }), 'zzz'), 'zzz');
    assert.strictEqual(Col.displayText(c({ type: 'boolean' }), 1), 'true');
    assert.strictEqual(Col.displayText(c({ type: 'button', buttonLabel: 'Start' }), null), '', 'a null value shows nothing');
    assert.strictEqual(Col.displayText(c({ type: 'button', buttonLabel: 'Start' }), 'x'), 'Start');
    assert.strictEqual(Col.displayText(c({ type: 'date', format: 'date' }), new Date(2026, 9, 18, 13, 5, 9).getTime()), '2026-10-18');
    assert.strictEqual(Col.displayText(c({ type: 'date', format: 'time' }), new Date(2026, 9, 18, 13, 5, 9).getTime()), '13:05:09');
    assert.strictEqual(Col.displayText(c({ type: 'date' }), 'not a date'), 'not a date');
});

ok('badgePalette and options: "value:Label:palette"', () => {
    const col = Col.columnsOf([{ key: 's', type: 'badge', options: 'ok:Good:green, bad:Bad:red, mid' }], [])[0];
    assert.strictEqual(Col.badgePalette(col, 'ok'), 'green');
    assert.strictEqual(Col.badgePalette(col, 'mid'), '');
    assert.strictEqual(Col.displayText(col, 'bad'), 'Bad');
});

ok('coerceEdit: nothing is rejected: a number column keeps a non-number as typed; boolean and text coerce simply', () => {
    const c = (type) => Col.columnsOf([{ key: 'k', type }], [])[0];
    assert.strictEqual(Col.coerceEdit(c('number'), '12,5'), 12.5);
    assert.strictEqual(Col.coerceEdit(c('number'), 'abc'), 'abc');
    assert.strictEqual(Col.coerceEdit(c('number'), ''), null);
    assert.strictEqual(Col.coerceEdit(c('boolean'), 'true'), true);
    assert.strictEqual(Col.coerceEdit(c('boolean'), false), false);
    assert.strictEqual(Col.coerceEdit(c('text'), 5), '5');
    assert.strictEqual(Col.coerceEdit(c('date'), '2026-10-18'), '2026-10-18');
    assert.strictEqual(Col.coerceEdit(c('date'), ''), null);
});

// ---- rows -------------------------------------------------------------------------------------------------

ok('normalizeData: array of objects, array of arrays (first row = names), one object, nothing', () => {
    assert.deepStrictEqual(Rows.normalizeData([{ a: 1 }, null, { a: 2 }]), [{ a: 1 }, { a: 2 }]);
    assert.deepStrictEqual(Rows.normalizeData([['a', 'b'], [1, 2], [3]]), [{ a: 1, b: 2 }, { a: 3, b: undefined }]);
    assert.deepStrictEqual(Rows.normalizeData({ a: 1 }), [{ a: 1 }]);
    assert.deepStrictEqual(Rows.normalizeData(null), []);
    assert.deepStrictEqual(Rows.normalizeData(5), []);
    assert.deepStrictEqual(Rows.normalizeData([]), []);
});

ok('store: keys by rowKey (or position), a duplicate key stays reachable, patch / upsert / remove by key', () => {
    const s = Rows.createStore([{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'a', v: 3 }], 'id');
    assert.deepStrictEqual(s.keys, ['a', 'b', 'a#2']);
    assert.strictEqual(Rows.positionOf(s, 'b'), 1);
    const before = s.rows[1], v0 = s.version;
    assert.strictEqual(Rows.storePatch(s, 'b', { v: 20, w: 1 }), 1);
    assert.deepStrictEqual(s.rows[1], { id: 'b', v: 20, w: 1 });
    assert.deepStrictEqual(before, { id: 'b', v: 2 }, 'the row the caller holds is not changed behind its back');
    assert.ok(s.version > v0);
    assert.strictEqual(Rows.storePatch(s, 'zzz', { v: 1 }), -1, 'an unknown key is ignored');
    const r = Rows.storeUpsert(s, [{ id: 'b', v: 21 }, { id: 'c', v: 9 }]);
    assert.deepStrictEqual(r, { added: 1, changed: 1 });
    assert.strictEqual(s.rows[1].v, 21);
    assert.strictEqual(s.rows[1].w, 1, 'upsert merges into the row');
    assert.strictEqual(Rows.positionOf(s, 'c'), 3);
    assert.strictEqual(Rows.storeRemove(s, 'a'), true);
    assert.deepStrictEqual(s.keys, ['b', 'a', 'c'], 'the keys are rebuilt: the second "a" is the only one now, so it is plain "a"');
    assert.strictEqual(Rows.storeRemove(s, 'a'), true);
    assert.strictEqual(Rows.storeRemove(s, 'a'), false);
    assert.deepStrictEqual(s.rows.map((x) => x.v), [21, 9]);
});

ok('store without rowKey: the position is the key; append returns the new key', () => {
    const s = Rows.createStore([{ x: 1 }, { x: 2 }]);
    assert.deepStrictEqual(s.keys, ['0', '1']);
    assert.strictEqual(Rows.storeAppend(s, { x: 3 }), '2');
    assert.strictEqual(s.rows.length, 3);
});

ok('compareValues: numbers by size (not as text), natural order in text, empty values last, booleans, dates', () => {
    assert.ok(Rows.compareValues(2, 10, 'number') < 0);
    assert.ok(Rows.compareValues('2', '10', 'number') < 0);
    assert.ok(Rows.compareValues('item2', 'item10', 'text') < 0, 'natural order');
    assert.ok(Rows.compareValues('b', 'A', 'text') > 0, 'case-insensitive');
    assert.ok(Rows.compareValues(null, 1, 'number') > 0);
    assert.ok(Rows.compareValues(false, true, 'boolean') < 0);
    assert.ok(Rows.compareValues('2026-01-01', '2026-02-01', 'date') < 0);
});

ok('viewIndex: sort asc / desc, empty values last in both, ties keep data order; filters combine; the store is not reordered', () => {
    const s = Rows.createStore([{ n: 3, t: 'c' }, { n: null, t: 'z' }, { n: 1, t: 'a' }, { n: 3, t: 'b' }]);
    const colOf = (k) => ({ n: { type: 'number' }, t: { type: 'text' } })[k];
    assert.deepStrictEqual(Rows.viewIndex(s, colOf, [{ key: 'n', dir: 'asc' }], null), [2, 0, 3, 1]);
    assert.deepStrictEqual(Rows.viewIndex(s, colOf, [{ key: 'n', dir: 'desc' }], null), [0, 3, 2, 1]);
    assert.deepStrictEqual(Rows.viewIndex(s, colOf, [{ key: 'n', dir: 'asc' }, { key: 't', dir: 'desc' }], null), [2, 0, 3, 1].map((x) => x), 'a second key breaks ties');
    const f = { t: Rows.compileFilter('B', 'text', String) };
    assert.deepStrictEqual(Rows.viewIndex(s, colOf, null, f), [3]);
    assert.deepStrictEqual(s.rows.map((r) => r.t), ['c', 'z', 'a', 'b']);
});

ok('viewIndex sorts by a staged value when the caller gives valueOf', () => {
    const s = Rows.createStore([{ n: 1 }, { n: 2 }]);
    const idx = Rows.viewIndex(s, () => ({ type: 'number' }), [{ key: 'n', dir: 'asc' }], null, (row, key) => (row === s.rows[0] ? 99 : row[key]));
    assert.deepStrictEqual(idx, [1, 0]);
});

ok('compileFilter: contains (case-insensitive); a number column takes > >= < <= = != ; empty = no test', () => {
    const text = Rows.compileFilter('ab', 'text', String);
    assert.ok(text('xABy') && !text('xay'));
    const gt = Rows.compileFilter('> 5', 'number', String);
    assert.ok(gt(6) && !gt(5) && !gt(null) && gt('7'));
    assert.ok(Rows.compileFilter('<= 5', 'number', String)(5));
    assert.ok(Rows.compileFilter('!= 5', 'number', String)(4));
    assert.ok(Rows.compileFilter('= 2,5', 'number', String)(2.5));
    assert.ok(Rows.compileFilter('12', 'number', String)(123), 'a plain number is "contains"');
    assert.strictEqual(Rows.compileFilter('  ', 'text', String), null);
});

ok('nextSort: asc, desc, none; another column starts at asc and replaces the sort', () => {
    let s = Rows.nextSort([], 'a');
    assert.deepStrictEqual(s, [{ key: 'a', dir: 'asc' }]);
    s = Rows.nextSort(s, 'a');
    assert.deepStrictEqual(s, [{ key: 'a', dir: 'desc' }]);
    assert.deepStrictEqual(Rows.nextSort(s, 'a'), []);
    assert.deepStrictEqual(Rows.nextSort(s, 'b'), [{ key: 'b', dir: 'asc' }]);
});

ok('100 000 rows: store, sort and filter stay fast (a guard against an accidental O(n²))', () => {
    const data = [];
    for (let i = 0; i < 100000; i++) data.push({ id: 'r' + i, n: (i * 7919) % 100003, t: 'row ' + i });
    const t0 = Date.now();
    const s = Rows.createStore(data, 'id');
    const idx = Rows.viewIndex(s, (k) => ({ type: k === 'n' ? 'number' : 'text' }), [{ key: 'n', dir: 'asc' }], { t: Rows.compileFilter('9', 'text', String) });
    for (let i = 0; i < 1000; i++) Rows.storePatch(s, 'r' + i * 50, { n: i });
    const ms = Date.now() - t0;
    assert.ok(idx.length > 0 && idx.length < 100000);
    assert.ok(ms < 3000, ms + ' ms');
});

// ---- layout -----------------------------------------------------------------------------------------------

ok('normalizeFreeze keeps at least one row / column scrolling', () => {
    assert.deepStrictEqual(L.normalizeFreeze(2, 1, 10, 5), { rows: 2, cols: 1 });
    assert.deepStrictEqual(L.normalizeFreeze(99, 99, 10, 5), { rows: 9, cols: 4 });
    assert.deepStrictEqual(L.normalizeFreeze(-1, 'x', 10, 5), { rows: 0, cols: 0 });
    assert.deepStrictEqual(L.normalizeFreeze(3, 3, 0, 0), { rows: 0, cols: 0 });
});

ok('normalizeMerges: swapped corners fixed; one cell, outside, overlap and crossing a frozen line are dropped with a reason', () => {
    const r = L.normalizeMerges([
        { r1: 3, c1: 2, r2: 1, c2: 0 },       // swapped: ok -> 1..3 x 0..2
        { r1: 0, c1: 0, r2: 0, c2: 0 },       // one cell
        { r1: 8, c1: 0, r2: 12, c2: 1 },      // outside
        { r1: 2, c1: 1, r2: 5, c2: 3 },       // overlaps the first
        { r1: 0, c1: 3, r2: 1, c2: 4 },       // crosses the frozen row line (freeze rows 1)
        { r1: 4, c1: 0, r2: 5, c2: 0 },       // ok
        null
    ], 10, 5, { rows: 1, cols: 0 });
    assert.deepStrictEqual(r.merges, [{ r1: 1, c1: 0, r2: 3, c2: 2 }, { r1: 4, c1: 0, r2: 5, c2: 0 }]);
    assert.deepStrictEqual(r.dropped.map((d) => d.reason), ['one cell', 'outside the grid', 'overlaps another merge', 'crosses a frozen line', 'not a merge']);
});

ok('mergeOf / isCovered / mergesInWindow', () => {
    const m = [{ r1: 1, c1: 1, r2: 2, c2: 3 }];
    assert.strictEqual(L.mergeOf(m, 2, 3), m[0]);
    assert.strictEqual(L.mergeOf(m, 0, 0), null);
    assert.strictEqual(L.isCovered(m, 1, 1), false, 'the top-left is drawn');
    assert.strictEqual(L.isCovered(m, 2, 2), true);
    assert.strictEqual(L.mergesInWindow(m, 5, 9, 0, 9).length, 0);
    assert.strictEqual(L.mergesInWindow(m, 2, 9, 3, 9).length, 1, 'a merge partly in the window counts');
});

ok('borders: rules cleaned; outer + inner edges; a later rule wins; a box draws above / left, and below / right only at the grid end', () => {
    const rules = L.normalizeBorders([
        { r1: 1, c1: 1, r2: 2, c2: 2, sides: 'all', color: 'bd' },
        { r1: 1, c1: 1, r2: 1, c2: 1, sides: ['top'], color: 'red', width: 3, style: 'dashed' },
        { r1: 0, c1: 0, r2: 0, c2: 0, sides: 'bogus' },        // an unknown side: kept but draws nothing
        { r1: 'x' }
    ]);
    assert.strictEqual(rules.length, 3);
    const e = L.buildEdges(rules);
    const top = L.boxBorders(e, 1, 1, 1, 1, 6, 6);
    assert.strictEqual(top.borderTop, '3px dashed red', 'the later rule wins the shared edge');
    assert.strictEqual(top.borderLeft, '1px solid var(--bd)');
    assert.strictEqual(top.borderBottom, undefined, 'the line below belongs to the next row');
    const next = L.boxBorders(e, 2, 1, 2, 1, 6, 6);
    assert.strictEqual(next.borderTop, '1px solid var(--bd)', 'the inner line between rows 1 and 2');
    const below = L.boxBorders(e, 3, 1, 3, 1, 6, 6);
    assert.strictEqual(below.borderTop, '1px solid var(--bd)', 'the line under the range is the top of the row after it');
    const last = L.buildEdges(L.normalizeBorders([{ r1: 4, c1: 4, r2: 5, c2: 5, sides: 'outer' }]));
    const corner = L.boxBorders(last, 5, 5, 5, 5, 6, 6);
    assert.ok(corner.borderBottom && corner.borderRight, 'at the grid end the box draws its own bottom / right');
    const merged = L.boxBorders(last, 4, 4, 5, 5, 6, 6);
    assert.ok(merged.borderTop && merged.borderLeft && merged.borderBottom && merged.borderRight, 'a merged box takes the edges of its whole range');
    assert.strictEqual(L.resolveColor('bd-strong'), 'var(--bd-strong)');
    assert.strictEqual(L.resolveColor('#f00'), '#f00');
    assert.strictEqual(L.resolveColor(''), 'var(--bd-strong)');
});

ok('cellEditable: read-only wins over everything; editable: range rule > row lock > column > grid', () => {
    const locks = L.normalizeLocks([{ r1: 0, c1: 0, r2: 9, c2: 0, locked: true }, { r1: 2, c1: 0, r2: 2, c2: 0, locked: false }, { r1: 3, c1: 1, r2: 3, c2: 1 }]);
    assert.strictEqual(L.cellEditable('readonly', true, false, [{ r1: 0, c1: 0, r2: 0, c2: 0, locked: false }], 0, 0), false, 'a read-only grid edits nothing, an open cell too');
    assert.strictEqual(L.cellEditable('editable', true, false, [], 0, 0), true);
    assert.strictEqual(L.cellEditable('editable', false, false, [], 0, 0), false, 'a locked column');
    assert.strictEqual(L.cellEditable('editable', true, true, [], 0, 0), false, 'a locked row');
    assert.strictEqual(L.cellEditable('editable', true, false, locks, 1, 0), false, 'a range lock');
    assert.strictEqual(L.cellEditable('editable', false, true, locks, 2, 0), true, 'one open cell in a locked column and row');
    assert.strictEqual(L.cellEditable('editable', true, false, locks, 3, 1), false, '"locked" is the default of a rule');
    assert.strictEqual(L.lockRuleAt(locks, 5, 5), undefined);
});

// ---- the virtual window -----------------------------------------------------------------------------------

ok('uniformAxis: offsets, total and indexAt with a few taller rows; indexAt and offsetOf agree for every row', () => {
    const a = W.uniformAxis(1000, 30, { 2: 60, 10: 90, 500: 31 });
    assert.strictEqual(a.offsetOf(0), 0);
    assert.strictEqual(a.offsetOf(2), 60);
    assert.strictEqual(a.offsetOf(3), 120);
    assert.strictEqual(a.total, 1000 * 30 + 30 + 60 + 1);
    for (let i = 0; i < 1000; i += 7) {
        assert.strictEqual(a.indexAt(a.offsetOf(i)), i, 'start of ' + i);
        assert.strictEqual(a.indexAt(a.offsetOf(i) + a.sizeOf(i) - 1), i, 'end of ' + i);
    }
    assert.strictEqual(a.indexAt(-5), 0);
    assert.strictEqual(a.indexAt(1e9), 999);
    const none = W.uniformAxis(0, 30, {});
    assert.strictEqual(none.total, 0);
    assert.strictEqual(none.indexAt(10), 0);
});

ok('sizesAxis for columns', () => {
    const a = W.sizesAxis([100, 50, 200]);
    assert.strictEqual(a.total, 350);
    assert.strictEqual(a.offsetOf(2), 150);
    assert.strictEqual(a.indexAt(149), 1);
    assert.strictEqual(a.indexAt(150), 2);
    assert.strictEqual(a.indexAt(9999), 2);
});

ok('visibleRange: the rows in view plus overscan, never the skipped (frozen) ones; scrollToShow brings a row into view', () => {
    const a = W.uniformAxis(1000, 30, {});
    const v = W.visibleRange(a, 3000, 300, 2, 0);
    assert.deepStrictEqual(v, { from: 98, to: 113 });
    const top = W.visibleRange(a, 0, 300, 2, 0);
    assert.strictEqual(top.from, 0);
    const frozen = W.visibleRange(a, 0, 300, 5, 3);
    assert.strictEqual(frozen.from, 3, 'rows 0..2 are frozen: drawn in their own pane');
    assert.deepStrictEqual(W.visibleRange(a, 0, 0, 2, 0), { from: 0, to: 0 });
    assert.strictEqual(W.scrollToShow(a, 50, 0, 300, 0), 1500 + 30 - 300, 'below: its bottom at the bottom edge');
    assert.strictEqual(W.scrollToShow(a, 5, 600, 300, 0), 150, 'above: its top at the top edge');
    assert.strictEqual(W.scrollToShow(a, 25, 600, 300, 0), 600, 'already in view: unchanged');
    // a million rows: still only a screenful
    const big = W.uniformAxis(1000000, 28, { 5: 80 });
    const bv = W.visibleRange(big, 14000000, 600, 6, 0);
    assert.ok(bv.to - bv.from < 40, (bv.to - bv.from) + ' rows');
});

// ---- staged edits -----------------------------------------------------------------------------------------

ok('stage: set / value / has; a value equal to the original is no change; rows with the changes; clear / drop', () => {
    const st = St.createStage();
    St.stageSet(st, 'a', 'n', 5, 1);
    St.stageSet(st, 'a', 't', 'x', 'y');
    St.stageSet(st, 'b', 'n', 2, 2);
    assert.strictEqual(St.stageCount(st), 2, 'b: equal to the original, nothing staged');
    assert.strictEqual(St.stageValue(st, 'a', 'n', 1), 5);
    assert.strictEqual(St.stageValue(st, 'a', 'z', 'own'), 'own');
    assert.ok(St.stageHas(st, 'a', 't') && !St.stageHas(st, 'b', 'n'));
    St.stageSet(st, 'a', 'n', 1, 1);
    assert.strictEqual(St.stageHas(st, 'a', 'n'), false, 'edited back to the original: taken out');
    const rows = St.stageRows(st, (k) => (k === 'a' ? { id: 'a', n: 1, t: 'y' } : null));
    assert.deepStrictEqual(rows, [{ key: 'a', changed: { t: 'x' }, row: { id: 'a', n: 1, t: 'x' } }]);
    St.stageDrop(st, 'a');
    assert.strictEqual(St.stageCount(st), 0);
    St.stageSet(st, 'q', 'n', 1, 0);
    St.stageClear(st);
    assert.strictEqual(St.stageCount(st), 0);
});

// ---- selection --------------------------------------------------------------------------------------------

ok('selection: rangeOf, extendTo, moveFocus clamps, steps over merges, extends with shift', () => {
    let s = Sel.selectCell(2, 2);
    assert.deepStrictEqual(Sel.rangeOf(s), { r1: 2, c1: 2, r2: 2, c2: 2 });
    s = Sel.extendTo(s, 0, 4);
    assert.deepStrictEqual(Sel.rangeOf(s), { r1: 0, c1: 2, r2: 2, c2: 4 });
    assert.strictEqual(Sel.rangeOf(Sel.noSelection()), null);
    const m = [{ r1: 3, c1: 1, r2: 4, c2: 2 }];
    let f = Sel.moveFocus(Sel.selectCell(2, 1), 1, 0, 10, 5, m, false);
    assert.deepStrictEqual(f.focus, { r: 3, c: 1 }, 'into a merge: its top-left');
    f = Sel.moveFocus(f, 1, 0, 10, 5, m, false);
    assert.deepStrictEqual(f.focus, { r: 5, c: 1 }, 'out of a merge: past its last row');
    f = Sel.moveFocus(Sel.selectCell(0, 0), -1, -1, 10, 5, [], false);
    assert.deepStrictEqual(f.focus, { r: 0, c: 0 }, 'clamped');
    f = Sel.moveFocus(Sel.selectCell(9, 4), 1, 1, 10, 5, [], false);
    assert.deepStrictEqual(f.focus, { r: 9, c: 4 });
    f = Sel.moveFocus(Sel.selectCell(1, 1), 2, 0, 10, 5, [], true);
    assert.deepStrictEqual(Sel.rangeOf(f), { r1: 1, c1: 1, r2: 3, c2: 1 }, 'shift keeps the anchor');
    assert.deepStrictEqual(Sel.growToMerges({ r1: 4, c1: 0, r2: 4, c2: 1 }, m), { r1: 3, c1: 0, r2: 4, c2: 2 }, 'a range that touches a merge takes all of it');
});

ok('rangeToTsv: tab between cells, new line between rows, tabs / new lines inside a value become spaces', () => {
    const v = (r, c) => (r === 0 && c === 1 ? 'a\tb\nc' : r + ',' + c);
    assert.strictEqual(Sel.rangeToTsv({ r1: 0, c1: 0, r2: 1, c2: 1 }, v), '0,0\ta b c\n1,0\t1,1');
    assert.strictEqual(Sel.rangeToTsv(null, v), '');
});

// ---- the Edit grid dialog's operations ------------------------------------------------------------------------

ok('sampleRows: a value of each column type, deterministic, matching the options of a select / badge', () => {
    const cols = Col.columnsOf([{ key: 'a' }, { key: 'n', type: 'number' }, { key: 'b', type: 'boolean' }, { key: 's', type: 'badge', options: 'x:X:green, y:Y' }, { key: 'd', type: 'date' }, { key: 'p', type: 'progress' }, { key: 'l', type: 'link' }], []);
    const rows = Col.sampleRows(cols, 5);
    assert.strictEqual(rows.length, 5);
    assert.ok(typeof rows[0].n === 'number' && typeof rows[0].b === 'boolean' && /^https:/.test(rows[0].l) && rows[0].p >= 0 && rows[0].p < 100);
    assert.ok(rows.every((r) => ['x', 'y'].indexOf(r.s) !== -1), 'the badge values are among its options');
    assert.ok(!isNaN(new Date(rows[0].d).getTime()));
    assert.deepStrictEqual(Col.sampleRows(cols, 5), rows, 'the same every time');
    assert.strictEqual(Col.sampleRows(cols).length, 8);
});

ok('a border rule of style "none" paints over the lines of the earlier rules', () => {
    const e = L.buildEdges(L.normalizeBorders([{ r1: 0, c1: 0, r2: 3, c2: 3, sides: 'all' }, { r1: 1, c1: 1, r2: 2, c2: 2, sides: 'all', style: 'none' }]));
    assert.ok(e.h.has('0:0') && e.v.has('0:0'), 'the outside stays');
    assert.ok(!e.h.has('1:1') && !e.h.has('2:1') && !e.h.has('3:1') && !e.v.has('1:1') && !e.v.has('1:3'), 'inside the cleared range: none');
    assert.ok(e.h.has('1:0') && e.h.has('1:3'), 'a line outside the cleared columns stays');
});

ok('design: merge replaces the merges it overlaps, a single cell merges nothing, unmerge takes the touched ones; nothing given is changed', () => {
    const m0 = [{ r1: 0, c1: 0, r2: 1, c2: 1 }, { r1: 5, c1: 5, r2: 6, c2: 6 }];
    const frozen = JSON.stringify(m0);
    const m1 = D.mergeRange(m0, { r1: 1, c1: 1, r2: 2, c2: 2 });
    assert.deepStrictEqual(m1, [{ r1: 5, c1: 5, r2: 6, c2: 6 }, { r1: 1, c1: 1, r2: 2, c2: 2 }]);
    assert.strictEqual(JSON.stringify(m0), frozen, 'the input is untouched');
    assert.deepStrictEqual(D.mergeRange(m0, { r1: 3, c1: 3, r2: 3, c2: 3 }), m0, 'one cell: nothing');
    assert.deepStrictEqual(D.unmergeRange(m1, { r1: 2, c1: 2, r2: 2, c2: 2 }), [{ r1: 5, c1: 5, r2: 6, c2: 6 }]);
    assert.strictEqual(D.mergesTouching(m1, { r1: 0, c1: 0, r2: 9, c2: 9 }).length, 2);
});

ok('design: crossesFreeze, freezeAt, describeRange, sameRange', () => {
    assert.strictEqual(D.crossesFreeze({ r1: 0, c1: 0, r2: 2, c2: 0 }, { rows: 1, cols: 0 }), true);
    assert.strictEqual(D.crossesFreeze({ r1: 1, c1: 0, r2: 2, c2: 3 }, { rows: 1, cols: 0 }), false);
    assert.strictEqual(D.crossesFreeze({ r1: 0, c1: 0, r2: 0, c2: 5 }, { rows: 0, cols: 2 }), true);
    assert.deepStrictEqual(D.freezeAt({ r1: 1, c1: 2, r2: 3, c2: 4 }, 'rows'), { rows: 4, cols: undefined });
    assert.deepStrictEqual(D.freezeAt({ r1: 1, c1: 2, r2: 3, c2: 4 }, 'cols'), { rows: undefined, cols: 5 });
    assert.strictEqual(D.describeRange({ r1: 1, c1: 0, r2: 3, c2: 2 }), 'Rows 2-4, columns 1-3 (9 cells)');
    assert.strictEqual(D.describeRange({ r1: 0, c1: 0, r2: 0, c2: 0 }), 'Row 1, column 1 (1 cell)');
    assert.ok(/Nothing selected/.test(D.describeRange(null)));
    assert.ok(D.sameRange({ r1: 1, c1: 1, r2: 2, c2: 2 }, { r1: 1, c1: 1, r2: 2, c2: 2 }) && !D.sameRange(null, null));
});

ok('design: addBorder keeps the list as short as what the user did (an "all" over a range drops the rules inside it); clearBorders paints none', () => {
    const spec = { style: 'solid', width: 1, color: 'bd' };
    let b = D.addBorder([], { r1: 1, c1: 1, r2: 1, c2: 1 }, 'top', spec);
    b = D.addBorder(b, { r1: 2, c1: 2, r2: 2, c2: 2 }, ['left', 'right'], spec);
    assert.strictEqual(b.length, 2);
    b = D.addBorder(b, { r1: 0, c1: 0, r2: 5, c2: 5 }, 'all', spec);
    assert.strictEqual(b.length, 1, 'the two earlier rules were painted over');
    b = D.clearBorders(b, { r1: 1, c1: 1, r2: 2, c2: 2 });
    assert.strictEqual(b.length, 2);
    assert.strictEqual(b[1].style, 'none');
    const e = L.buildEdges(L.normalizeBorders(b));
    assert.ok(e.h.has('0:0') && !e.h.has('1:1'), 'drawn, then cleared inside');
});

ok('design: addLock overrides the rules inside the range; resetLocks forgets them; lockState says locked / open / mixed / default', () => {
    let l = D.addLock([], { r1: 0, c1: 0, r2: 0, c2: 0 }, true);
    l = D.addLock(l, { r1: 0, c1: 0, r2: 4, c2: 0 }, false);
    assert.strictEqual(l.length, 1, 'the cell rule was inside the new range');
    assert.strictEqual(l[0].locked, false);
    l = D.addLock(l, { r1: 2, c1: 0, r2: 2, c2: 0 }, true);
    const ruleAt = (r, c) => L.lockRuleAt(L.normalizeLocks(l), r, c);
    assert.strictEqual(D.lockState({ r1: 2, c1: 0, r2: 2, c2: 0 }, ruleAt), 'locked');
    assert.strictEqual(D.lockState({ r1: 3, c1: 0, r2: 3, c2: 0 }, ruleAt), 'open');
    assert.strictEqual(D.lockState({ r1: 1, c1: 0, r2: 3, c2: 0 }, ruleAt), 'mixed');
    assert.strictEqual(D.lockState({ r1: 7, c1: 7, r2: 8, c2: 8 }, ruleAt), 'default');
    assert.strictEqual(D.resetLocks(l, { r1: 0, c1: 0, r2: 9, c2: 9 }).length, 0);
});

ok('design: dropColumn takes the rules of that column, narrows the ones that span it, moves the later ones left; moveColumn maps the rules to where the columns went', () => {
    const draft = { merges: [{ r1: 0, c1: 1, r2: 1, c2: 2 }, { r1: 0, c1: 3, r2: 1, c2: 3 }], borders: [{ r1: 0, c1: 2, r2: 0, c2: 2, sides: 'all', style: 'solid', width: 1, color: '' }], locks: [{ r1: 0, c1: 0, r2: 0, c2: 4, locked: true }] };
    const d = D.dropColumn(draft, 2);
    assert.deepStrictEqual(d.merges, [{ r1: 0, c1: 1, r2: 1, c2: 1 }, { r1: 0, c1: 2, r2: 1, c2: 2 }]);
    assert.deepStrictEqual(d.borders, [], 'a rule only on that column goes');
    assert.strictEqual(d.locks[0].c2, 3);
    const m = D.moveColumn({ merges: [], borders: [], locks: [{ r1: 0, c1: 1, r2: 0, c2: 1, locked: true }] }, 1, 3);
    assert.strictEqual(m.locks[0].c1, 3, 'the locked cell is in the column that moved');
    const m2 = D.moveColumn({ merges: [], borders: [], locks: [{ r1: 0, c1: 2, r2: 0, c2: 2, locked: true }] }, 1, 3);
    assert.strictEqual(m2.locks[0].c1, 1, 'a column between them shifts one place');
});

console.log('\n' + passed + ' passed');
