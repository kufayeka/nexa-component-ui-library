'use strict';

// The pure parts of the Data Grid (dist/data-grid/*.js): Excel addressing, cell types, populate, the sheet (values, rules, styles, view area),
// layout (merges, freeze, borders, locks), the virtual-scroll arithmetic, staged edits, selection, the Edit grid dialog's operations.
// No browser.   node test/data-grid-pure.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// The modules are plain ES modules. They are loaded without a bundler: each one in its own function scope, an `import { a } from "./x.js"`
// becoming a destructuring of what x.js exported (so the order below is the order of the imports).
const ORDER = ['address.js', 'sizes.js', 'cell-types.js', 'populate.js', 'sheet.js', 'clipboard.js', 'layout.js', 'window.js', 'stage.js', 'selection.js', 'design.js', 'fill.js', 'sort.js', 'xlvalue.js', 'xlsx.js', 'xlfuncs.js', 'formula.js', 'calc.js', 'sheets.js', 'xlsx-read.js'];
const M = {};
ORDER.forEach((file) => {
    let src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'data-grid', file), 'utf8');
    const names = [...src.matchAll(/^export (?:var|let|const|(?:async )?function|class) (\w+)/gm)].map((m) => m[1]);
    src = src.replace(/^import \{([^}]*)\} from "\.\/([\w-]+\.js)";?\s*$/gm, (all, list, from) => 'const {' + list + '} = __m["' + from + '"];');
    src = src.replace(/^export /gm, '');
    M[file] = new Function('__m', src + '\nreturn {' + names.join(',') + '};')(M);
});
const Z = M['sizes.js'], A = M['address.js'], T = M['cell-types.js'], P = M['populate.js'], S = M['sheet.js'], L = M['layout.js'], W = M['window.js'], St = M['stage.js'], Sel = M['selection.js'], D = M['design.js'];

let passed = 0;
function ok(label, fn) { fn(); passed++; console.log('✔ ' + label); }

// ---- addressing -------------------------------------------------------------------------------------------

ok('colName / colIndex: A … Z, AA … ZZ, both ways', () => {
    assert.deepStrictEqual([0, 1, 25, 26, 27, 51, 52, 701].map(A.colName), ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ']);
    for (let i = 0; i < A.MAX_COLS; i++) assert.strictEqual(A.colIndex(A.colName(i)), i, 'column ' + i);
    assert.strictEqual(A.colIndex('a'), 0, 'any case');
    assert.strictEqual(A.colIndex('1'), -1);
    assert.strictEqual(A.colIndex(''), -1);
    assert.strictEqual(A.colName(-1), '');
});

ok('parseAddress / addressOf: B7 is row 6, column 1; $ signs and case do not matter; nonsense is null', () => {
    assert.deepStrictEqual(A.parseAddress('B7'), { r: 6, c: 1 });
    assert.deepStrictEqual(A.parseAddress('$b$7'), { r: 6, c: 1 });
    assert.deepStrictEqual(A.parseAddress('ZZ1000'), { r: 999, c: 701 });
    assert.strictEqual(A.parseAddress('A0'), null);
    assert.strictEqual(A.parseAddress('7B'), null);
    assert.strictEqual(A.parseAddress('B'), null);
    assert.strictEqual(A.parseAddress(null), null);
    assert.strictEqual(A.addressOf(6, 1), 'B7');
    assert.strictEqual(A.addressOf(0, 26), 'AA1');
});

ok('parseRange / rangeText: corners put in order, one cell, round trip', () => {
    assert.deepStrictEqual(A.parseRange('A1:C3'), { r1: 0, c1: 0, r2: 2, c2: 2 });
    assert.deepStrictEqual(A.parseRange('C3:A1'), { r1: 0, c1: 0, r2: 2, c2: 2 }, 'swapped');
    assert.deepStrictEqual(A.parseRange('B2'), { r1: 1, c1: 1, r2: 1, c2: 1 });
    assert.strictEqual(A.parseRange('A1:B2:C3'), null);
    assert.strictEqual(A.parseRange('A1:??'), null);
    assert.strictEqual(A.parseRange(''), null);
    assert.strictEqual(A.rangeText({ r1: 0, c1: 0, r2: 2, c2: 2 }), 'A1:C3');
    assert.strictEqual(A.rangeText({ r1: 1, c1: 1, r2: 1, c2: 1 }), 'B2');
    assert.strictEqual(A.rangeText(A.parseRange('AA10:AB12')), 'AA10:AB12');
});

ok('whole columns and rows: B:B, A:C, 2:5 as in a sheet; rangeLabel picks the shortest text', () => {
    assert.deepStrictEqual(A.clampRange(A.parseRange('B:C'), 100, 26), { r1: 0, c1: 1, r2: 99, c2: 2 });
    assert.deepStrictEqual(A.clampRange(A.parseRange('C:A'), 100, 26), { r1: 0, c1: 0, r2: 99, c2: 2 }, 'swapped');
    assert.deepStrictEqual(A.clampRange(A.parseRange('2:5'), 100, 26), { r1: 1, c1: 0, r2: 4, c2: 25 });
    assert.strictEqual(A.parseRange('A:'), null);
    assert.strictEqual(A.parseRange('0:3'), null);
    assert.strictEqual(A.rangeLabel({ r1: 0, c1: 1, r2: 99, c2: 2 }, 100, 26), 'B:C');
    assert.strictEqual(A.rangeLabel({ r1: 1, c1: 0, r2: 4, c2: 25 }, 100, 26), '2:5');
    assert.strictEqual(A.rangeLabel({ r1: 1, c1: 1, r2: 4, c2: 3 }, 100, 26), 'B2:D5');
    assert.strictEqual(A.rangeLabel({ r1: 0, c1: 0, r2: 0, c2: 0 }, 1, 1), 'A:A', 'a one-row sheet: its column is whole');
});

ok('clampRange keeps a range inside the sheet; sizeOf clamps the size', () => {
    assert.deepStrictEqual(A.clampRange({ r1: 0, c1: 0, r2: 500, c2: 500 }, 100, 26), { r1: 0, c1: 0, r2: 99, c2: 25 });
    assert.strictEqual(A.clampRange({ r1: 200, c1: 0, r2: 300, c2: 3 }, 100, 26), null, 'nothing inside');
    assert.deepStrictEqual(A.sizeOf(5000, 5000), { rows: 1000, cols: 702 });
    assert.deepStrictEqual(A.sizeOf(undefined, 'x'), { rows: 100, cols: 26 });
    assert.deepStrictEqual(A.sizeOf(0, -3), { rows: 100, cols: 26 });
    assert.deepStrictEqual(A.sizeOf(10.7, 4), { rows: 10, cols: 4 });
});

// ---- sizes ----------------------------------------------------------------------------------------------------

ok('parseColumns / parseRows / columnsText / rowsText: the text of column and row rules, both ways', () => {
    assert.deepStrictEqual(Z.parseColumns('B'), { c1: 1, c2: 1 });
    assert.deepStrictEqual(Z.parseColumns('d:b'), { c1: 1, c2: 3 }, 'swapped, any case');
    assert.strictEqual(Z.parseColumns('B2'), null);
    assert.strictEqual(Z.parseColumns(''), null);
    assert.deepStrictEqual(Z.parseRows('3'), { r1: 2, r2: 2 });
    assert.deepStrictEqual(Z.parseRows('5:2'), { r1: 1, r2: 4 });
    assert.strictEqual(Z.parseRows('0'), null);
    assert.strictEqual(Z.parseRows('A'), null);
    assert.deepStrictEqual([Z.columnsText(1, 1), Z.columnsText(1, 3), Z.rowsText(2, 2), Z.rowsText(1, 4)], ['B', 'B:D', '3', '2:5']);
});

ok('colSizes: the grid\'s width, a rule over columns, the later rule wins per field, the width kept between its own limits', () => {
    const d = { width: 110, min: 30, max: 600, adjustable: true };
    const rules = Z.parseColRules([
        { columns: 'B:C', width: 200 },
        { columns: 'C', maxWidth: 150, adjustable: false },
        { columns: 'D', width: 5000 },
        { columns: 'E', width: 10 },
        { columns: 'Z', width: 90 },
        { columns: 'nonsense', width: 1 }, null
    ], 5);
    assert.strictEqual(rules.length, 4, 'a rule outside the sheet and an unreadable one are left out');
    const s = Z.colSizes(rules, 5, d);
    assert.deepStrictEqual(s[0], { width: 110, min: 30, max: 600, adjustable: true });
    assert.strictEqual(s[1].width, 200);
    assert.deepStrictEqual([s[2].width, s[2].max, s[2].adjustable], [150, 150, false], 'C: the later rule\'s max cuts the earlier width, and it is not adjustable');
    assert.strictEqual(s[3].width, 600, 'D: kept at the grid\'s largest');
    assert.strictEqual(s[4].width, 30, 'E: kept at the smallest');
});

ok('rowSizes: only the rows a rule talks about; the height, the limits, adjustable and fit; the grid\'s for the others', () => {
    const d = { height: 28, min: 18, max: 400, adjustable: true, fit: true };
    const rules = Z.parseRowRules([{ rows: '2:3', height: 60 }, { rows: '3', fit: false, maxHeight: 50 }, { rows: '9', height: 5 }, { rows: '500', height: 9 }, { rows: 'x' }], 10);
    const m = Z.rowSizes(rules, d);
    assert.deepStrictEqual([...m.keys()].sort((a, b) => a - b), [1, 2, 8], 'rows 2, 3 and 9 (from 0: 1, 2, 8)');
    assert.deepStrictEqual(m.get(1), { height: 60, min: 18, max: 400, adjustable: true, fit: true });
    assert.deepStrictEqual([m.get(2).height, m.get(2).fit], [50, false], 'row 3: its own max cuts the height; it does not fit its content');
    assert.strictEqual(m.get(8).height, 18, 'kept at the smallest');
    assert.strictEqual(Z.rowSizeAt(m, 5, d).height, 28, 'a row no rule talks about');
    assert.strictEqual(Z.rowSizeAt(m, 1, d).height, 60);
});

ok('clampSize keeps a size between limits; setColSize / setRowSize fold into the last rule of the same range and start a new rule for another', () => {
    assert.strictEqual(Z.clampSize(5, 10, 20), 10);
    assert.strictEqual(Z.clampSize(50, 10, 20), 20);
    assert.strictEqual(Z.clampSize(15, undefined, undefined), 15);
    assert.strictEqual(Z.clampSize('x', 1, 2), 'x');
    let c = Z.setColSize([], 1, 2, { width: 120 });
    c = Z.setColSize(c, 1, 2, { maxWidth: 300 });
    assert.deepStrictEqual(c, [{ columns: 'B:C', width: 120, maxWidth: 300 }]);
    c = Z.setColSize(c, 3, 3, { width: 80 });
    assert.deepStrictEqual(c[1], { columns: 'D', width: 80 });
    const r = Z.setRowSize(Z.setRowSize([], 1, 1, { height: 40 }), 1, 1, { height: 50 });
    assert.deepStrictEqual(r, [{ rows: '2', height: 50 }]);
    const frozen = JSON.stringify(c);
    Z.setColSize(c, 9, 9, { width: 1 });
    assert.strictEqual(JSON.stringify(c), frozen, 'the input is untouched');
});

// ---- cell types ---------------------------------------------------------------------------------------------

ok('displayText: numbers with decimals and suffix, dates, option labels, booleans, buttons', () => {
    const c = (o) => S.cellSpec(o);
    assert.strictEqual(T.displayText(c({ type: 'number', decimals: 1, suffix: ' °C' }), 21.456), '21.5 °C');
    assert.strictEqual(T.displayText(c({ type: 'number' }), 3), '3');
    assert.strictEqual(T.displayText(c({ type: 'number', decimals: 2 }), 'abc'), 'abc', 'text in a number cell is shown as it is');
    assert.strictEqual(T.displayText(c({ type: 'select', options: 'on:Running, off:Stopped' }), 'on'), 'Running');
    assert.strictEqual(T.displayText(c({ type: 'select', options: 'on:Running' }), 'zzz'), 'zzz');
    assert.strictEqual(T.displayText(c({ type: 'boolean' }), 1), 'true');
    assert.strictEqual(T.displayText(c({ type: 'button', buttonLabel: 'Start' }), null), '', 'a null value shows nothing');
    assert.strictEqual(T.displayText(c({ type: 'button', buttonLabel: 'Start' }), 'x'), 'Start');
    assert.strictEqual(T.displayText(c({ type: 'date', dateFormat: 'date' }), new Date(2026, 9, 18, 13, 5, 9).getTime()), '2026-10-18');
    assert.strictEqual(T.displayText(c({ type: 'date', dateFormat: 'time' }), new Date(2026, 9, 18, 13, 5, 9).getTime()), '13:05:09');
    assert.strictEqual(T.displayText(c({ type: 'date' }), 'not a date'), 'not a date');
    assert.strictEqual(T.displayText(c({}), { a: 1 }), '{"a":1}', 'an object shows as JSON');
});

ok('badgePalette and options: "value:Label:palette"', () => {
    const spec = S.cellSpec({ type: 'badge', options: 'ok:Good:green, bad:Bad:red, mid' });
    assert.strictEqual(T.badgePalette(spec, 'ok'), 'green');
    assert.strictEqual(T.badgePalette(spec, 'mid'), '');
    assert.strictEqual(T.displayText(spec, 'bad'), 'Bad');
});

ok('coerceEdit: nothing is rejected: a number cell keeps a non-number as typed; boolean and text coerce simply', () => {
    const c = (type) => S.cellSpec({ type });
    assert.strictEqual(T.coerceEdit(c('number'), '12,5'), 12.5);
    assert.strictEqual(T.coerceEdit(c('number'), 'abc'), 'abc');
    assert.strictEqual(T.coerceEdit(c('number'), ''), null);
    assert.strictEqual(T.coerceEdit(c('boolean'), 'true'), true);
    assert.strictEqual(T.coerceEdit(c('boolean'), false), false);
    assert.strictEqual(T.coerceEdit(c('text'), 5), '5');
    assert.strictEqual(T.coerceEdit(c('text'), '12'), '12', 'the type text keeps what looks like a number as text');
    // general (no type): a number when it looks like one
    assert.strictEqual(T.coerceEdit(c('general'), '12'), 12);
    assert.strictEqual(T.coerceEdit(c('general'), ' -3,5 '), -3.5);
    assert.strictEqual(T.coerceEdit(c('general'), '0.25'), 0.25);
    assert.strictEqual(T.coerceEdit(c('general'), '0123'), '0123', 'a zero-padded code stays text');
    assert.strictEqual(T.coerceEdit(c('general'), '1e5'), '1e5');
    assert.strictEqual(T.coerceEdit(c('general'), 'abc'), 'abc');
    assert.strictEqual(T.coerceEdit(c('general'), ''), '');
    assert.strictEqual(T.coerceEdit(c('general'), 7), 7);
    assert.strictEqual(T.coerceEdit(c('general'), true), true);
    assert.strictEqual(T.coerceEdit(c('date'), '2026-10-18'), '2026-10-18');
    assert.strictEqual(T.coerceEdit(c('date'), ''), null);
});

ok('defaultAlign: numbers right, checkboxes and buttons in the middle, the rest left', () => {
    assert.deepStrictEqual(['number', 'boolean', 'button', 'text', 'badge'].map(T.defaultAlign), ['right', 'center', 'center', 'left', 'left']);
});

// ---- populate -----------------------------------------------------------------------------------------------

const at = (text) => A.parseAddress(text);
const LIM = { rows: 100, cols: 26 };
const grid = (done) => Object.fromEntries(done.cells.map((x) => [A.addressOf(x.r, x.c), x.v]));

ok('populate: one value goes in one cell; undefined leaves the cell alone, null empties it', () => {
    assert.deepStrictEqual(grid(P.expandPopulate(42, { at: at('B2') }, LIM)), { B2: 42 });
    assert.deepStrictEqual(grid(P.expandPopulate('x', { at: at('B2') }, LIM)), { B2: 'x' });
    assert.deepStrictEqual(P.expandPopulate(undefined, { at: at('B2') }, LIM).cells, []);
    assert.deepStrictEqual(grid(P.expandPopulate(null, { at: at('B2') }, LIM)), { B2: null });
    assert.deepStrictEqual(grid(P.expandPopulate([1, undefined, 3], { at: at('A1') }, LIM)), { A1: 1, A3: 3 }, 'a hole is skipped');
});

ok('populate: a list goes down or to the right from its cell', () => {
    assert.deepStrictEqual(grid(P.expandPopulate([10, 20, 30], { at: at('C2'), direction: 'down' }, LIM)), { C2: 10, C3: 20, C4: 30 });
    assert.deepStrictEqual(grid(P.expandPopulate([10, 20, 30], { at: at('C2'), direction: 'right' }, LIM)), { C2: 10, D2: 20, E2: 30 });
    const r = P.expandPopulate([10, 20, 30], { at: at('C2'), direction: 'down' }, LIM);
    assert.deepStrictEqual(r.range, { r1: 1, c1: 2, r2: 3, c2: 2 }, 'the box it filled');
});

ok('populate: a list of lists is a block (an inner list is a row going down, a column going right)', () => {
    const v = [[1, 2, 3], [4, 5, 6]];
    assert.deepStrictEqual(grid(P.expandPopulate(v, { at: at('A1'), direction: 'down' }, LIM)), { A1: 1, B1: 2, C1: 3, A2: 4, B2: 5, C2: 6 });
    assert.deepStrictEqual(grid(P.expandPopulate(v, { at: at('A1'), direction: 'right' }, LIM)), { A1: 1, A2: 2, A3: 3, B1: 4, B2: 5, B3: 6 });
});

ok('populate: a list of objects is a table: a column per field, in order; the named fields; a first row with the names when asked', () => {
    const rows = [{ id: 1, t: 5 }, { id: 2, t: 6, z: 9 }];
    assert.deepStrictEqual(grid(P.expandPopulate(rows, { at: at('A1'), direction: 'down' }, LIM)), { A1: 1, B1: 5, A2: 2, B2: 6, C2: 9 });
    assert.deepStrictEqual(grid(P.expandPopulate(rows, { at: at('A1'), fields: ['t', 'id'] }, LIM)), { A1: 5, B1: 1, A2: 6, B2: 2 });
    assert.deepStrictEqual(grid(P.expandPopulate(rows, { at: at('A1'), fields: ['id', 't'], header: true }, LIM)), { A1: 'id', B1: 't', A2: 1, B2: 5, A3: 2, B3: 6 });
    assert.deepStrictEqual(grid(P.expandPopulate(rows, { at: at('A1'), fields: ['id', 't'], header: true, direction: 'right' }, LIM)), { A1: 'id', A2: 't', B1: 1, B2: 5, C1: 2, C2: 6 }, 'to the right: the table turned over');
    assert.deepStrictEqual(grid(P.expandPopulate({ id: 7, t: 8 }, { at: at('A1') }, LIM)), { A1: 7, B1: 8 }, 'one object is one row');
    assert.deepStrictEqual(P.parseFields(' id, t ,,z'), ['id', 't', 'z']);
});

ok('populate: a nested value becomes JSON text; what falls outside the sheet is dropped; a limit caps the cells', () => {
    assert.deepStrictEqual(grid(P.expandPopulate([{ a: { b: 1 }, c: [1, 2] }], { at: at('A1') }, LIM)), { A1: '{"b":1}', B1: '[1,2]' });
    assert.deepStrictEqual(grid(P.expandPopulate([1, 2, 3, 4], { at: at('A99'), direction: 'down' }, { rows: 100, cols: 26 })), { A99: 1, A100: 2 });
    assert.deepStrictEqual(grid(P.expandPopulate([1, 2, 3, 4], { at: at('Y1'), direction: 'right' }, { rows: 100, cols: 26 })), { Y1: 1, Z1: 2 });
    assert.deepStrictEqual(grid(P.expandPopulate([1, 2, 3, 4], { at: at('A1'), limit: 3 }, LIM)), { A1: 1, A2: 2, A3: 3 });
    assert.deepStrictEqual(P.expandPopulate([], { at: at('A1') }, LIM).cells, []);
    assert.strictEqual(P.expandPopulate([], { at: at('A1') }, LIM).range, null);
    assert.deepStrictEqual(P.expandPopulate([1], {}, LIM), { cells: [], range: null }, 'no cell to start from: nothing');
});

const KEYS = ['type', 'fill', 'bold', 'color'];
const withStyles = (done) => done.cells.map((x) => [A.addressOf(x.r, x.c), x.v, x.f]);

ok('cell objects: a value with the fields it overrides, in a list, a block, or a field of a table row; a plain object with a "value" among other data is data', () => {
    assert.ok(P.isCellObject({ value: 1, fill: 'red' }, KEYS));
    assert.ok(P.isCellObject({ value: null }, KEYS));
    assert.ok(!P.isCellObject({ value: 1, id: 7 }, KEYS), 'a field the rules do not know: data');
    assert.ok(!P.isCellObject({ fill: 'red' }, KEYS), 'no value');
    assert.ok(!P.isCellObject([1], KEYS) && !P.isCellObject('x', KEYS) && !P.isCellObject(null, KEYS));
    const spec = { at: at('A1'), cellKeys: KEYS };
    assert.deepStrictEqual(withStyles(P.expandPopulate([{ value: 12, fill: 'red' }, { value: 'x' }, 7], spec, LIM)),
        [['A1', 12, { fill: 'red' }], ['A2', 'x', {}], ['A3', 7, undefined]], 'a list of cell objects (and a plain value among them)');
    assert.deepStrictEqual(withStyles(P.expandPopulate([[{ value: 1, bold: true }, 2], [3, { value: 4, type: 'number' }]], spec, LIM)).map((x) => [x[0], x[1], x[2]]),
        [['A1', 1, { bold: true }], ['B1', 2, undefined], ['A2', 3, undefined], ['B2', 4, { type: 'number' }]], 'in a block');
    const table = withStyles(P.expandPopulate([{ id: 'a', temp: { value: 71, fill: 'orange' } }, { id: 'b', temp: 20 }], Object.assign({ fields: ['id', 'temp'] }, spec), LIM));
    assert.deepStrictEqual(table.map((x) => [x[0], x[1]]), [['A1', 'a'], ['B1', 71], ['A2', 'b'], ['B2', 20]], 'a field of a table row');
    assert.deepStrictEqual(table[1][2], { fill: 'orange' });
    assert.deepStrictEqual(withStyles(P.expandPopulate({ value: 5, fill: 'blue' }, spec, LIM)), [['A1', 5, { fill: 'blue' }]], 'one cell object');
    assert.deepStrictEqual(withStyles(P.expandPopulate([{ value: undefined, fill: 'red' }], spec, LIM)), [['A1', undefined, { fill: 'red' }]], 'a style without a value');
});

ok('shape: a list of objects is a table unless they are all cells; the rule can force it', () => {
    const rows = [{ value: 1, fill: 'red' }, { value: 2 }];
    const spec = (shape) => ({ at: at('A1'), cellKeys: KEYS, shape });
    assert.deepStrictEqual(withStyles(P.expandPopulate(rows, spec('auto'), LIM)).map((x) => x[1]), [1, 2], 'auto: all cells');
    assert.deepStrictEqual(withStyles(P.expandPopulate(rows, spec('table'), LIM)).map((x) => [x[0], x[1]]), [['A1', 1], ['B1', 'red'], ['A2', 2]].filter((x) => x[1] !== undefined).concat([]), 'table: a row per object, a column per field');
    const mixed = [{ value: 1, name: 'x' }, { value: 2, name: 'y' }];
    assert.deepStrictEqual(withStyles(P.expandPopulate(mixed, spec('auto'), LIM)).map((x) => [x[0], x[1]]), [['A1', 1], ['B1', 'x'], ['A2', 2], ['B2', 'y']], 'auto: objects with other fields are a table');
    assert.deepStrictEqual(withStyles(P.expandPopulate(mixed, spec('list'), LIM)).map((x) => x[1]), ['{"value":1,"name":"x"}', '{"value":2,"name":"y"}'], 'list: each element is one cell, an object shows as JSON');
    assert.deepStrictEqual(withStyles(P.expandPopulate(rows, spec('cells'), LIM)).map((x) => x[1]), [1, 2]);
});

ok('populatedCells: the rule\'s type and style for the cells it fills; a cell object over it; a later rule covers an earlier one\'s style too', () => {
    const r = S.populatedCells([
        { at: 'A1', value: [{ value: 1, bold: false, fill: 'red' }, 2], bold: true, type: 'number', fill: 'blue' },
        { at: 'B1', value: [5, 6] },
        { at: 'A2', value: ['x'], direction: 'down' }
    ], 100, 26);
    assert.deepStrictEqual(r.styles.get(S.cellKey(0, 0)), { bold: false, type: 'number', fill: 'red' }, 'the cell object over the rule\'s defaults');
    assert.deepStrictEqual(r.styles.get(S.cellKey(1, 0)) || null, null, 'A2: the third rule covers the first one\'s value and its style (it has none)');
    assert.strictEqual(r.map.get(S.cellKey(1, 0)), 'x');
    assert.strictEqual(r.styles.has(S.cellKey(0, 1)), false, 'a rule with no type or style gives none');
    const plain = S.populatedCells([{ at: 'A1', value: [1], fill: '' }], 10, 10);
    assert.deepStrictEqual(plain.styles.get(S.cellKey(0, 0)), { fill: '' }, '"back to the default" is a value');
});

ok('populate: 100 000 values are laid down fast', () => {
    const big = [];
    for (let i = 0; i < 1000; i++) { const row = []; for (let j = 0; j < 100; j++) row.push(i * j); big.push(row); }
    const t0 = Date.now();
    const r = P.expandPopulate(big, { at: at('A1') }, { rows: 1000, cols: 702 });
    assert.strictEqual(r.cells.length, 100000);
    assert.ok(Date.now() - t0 < 1500, (Date.now() - t0) + ' ms');
});

// ---- the sheet: rules, values, view area -------------------------------------------------------------------------

ok('parseRules: only usable rules, only the fields a rule may have, inside the sheet; a later rule wins per field', () => {
    const rules = S.parseRules([
        { range: 'A1:C3', type: 'number', decimals: 1, bold: true, junk: 'x' },
        { range: 'B2', bold: false, fill: 'red' },
        { range: 'Z99:ZZ200', color: 'blue' },                  // partly outside a 10 x 5 sheet: dropped
        { range: 'nonsense', bold: true },
        { range: 'A1', color: null },                           // says nothing
        { range: 'C1', fill: '' },                              // "back to the default": it says something
        null
    ], 10, 5);
    assert.strictEqual(rules.length, 3);
    assert.deepStrictEqual(S.fieldsAt(S.parseRules([{ range: 'A1:B2', fill: 'red', bold: true }, { range: 'B2', fill: '' }], 10, 5), 1, 1), { fill: '', bold: true }, 'an empty value covers the earlier rule\'s');
    assert.deepStrictEqual(Object.keys(rules[0].fields).sort(), ['bold', 'decimals', 'type']);
    assert.deepStrictEqual(S.fieldsAt(rules, 1, 1), { type: 'number', decimals: 1, bold: false, fill: 'red' }, 'B2: the second rule over the first');
    assert.deepStrictEqual(S.fieldsAt(rules, 0, 0), { type: 'number', decimals: 1, bold: true });
    assert.deepStrictEqual(S.fieldsAt(rules, 5, 4), {}, 'outside every rule');
});

ok('cellSpec: defaults and clean values', () => {
    assert.deepStrictEqual(S.cellSpec({}), { type: 'general', decimals: -1, suffix: '', format: 'datetime', options: [], max: 100, buttonLabel: '', action: '', label: '' });
    const s = S.cellSpec({ type: 'progress', max: 50, decimals: 2, dateFormat: 'nope', options: 'a:A' });
    assert.strictEqual(s.max, 50);
    assert.strictEqual(s.decimals, 2);
    assert.strictEqual(s.format, 'datetime');
    assert.strictEqual(s.options[0].label, 'A');
});

ok('styleCss: text style and the cell box; alignment defaults by type; a colour that could carry more than a colour is refused', () => {
    const css = S.styleCss({ bold: true, italic: true, underline: true, strike: true, fontSize: 18, fontFamily: 'mono', color: '#ff0000', fill: 'primary', align: 'center', valign: 'bottom', wrap: true }, 'text');
    ['font-weight:700', 'font-style:italic', 'text-decoration:underline line-through', 'font-size:18px', 'font-family:var(--mono)', 'color:#ff0000', 'background:var(--cp-solid)', 'justify-content:center', 'align-items:safe flex-end', 'white-space:normal'].forEach((x) => assert.ok(css.includes(x), x + ' in ' + css));
    assert.ok(S.styleCss({}, 'number').includes('justify-content:flex-end'), 'a number is on the right by default');
    assert.ok(S.styleCss({ align: 'left' }, 'number').includes('justify-content:flex-start'), 'a rule wins over the default');
    assert.ok(!S.styleCss({ color: 'red; background:url(x)' }, 'text').includes('url'));
    assert.ok(!S.styleCss({ fontSize: 5000 }, 'text').includes('font-size'));
    assert.strictEqual(S.colorOf('rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
    assert.strictEqual(S.colorOf('}'), '');
    assert.strictEqual(S.colorOf(''), '');
});

ok('parseCells: the typed cells by address; addresses outside the sheet or unreadable are left out; null stays (an emptied cell)', () => {
    const m = S.parseCells({ A1: 'x', B2: 5, C3: null, ZZ1: 'far', nonsense: 1, A200: 'low', D4: undefined }, 100, 26);
    assert.strictEqual(m.get(S.cellKey(0, 0)), 'x');
    assert.strictEqual(m.get(S.cellKey(1, 1)), 5);
    assert.strictEqual(m.get(S.cellKey(2, 2)), null);
    assert.strictEqual(m.size, 3);
    assert.strictEqual(S.parseCells(null, 10, 10).size, 0);
    assert.strictEqual(S.parseCells([1, 2], 10, 10).size, 0);
});

ok('populatedCells: the rules in order, a later rule covers an earlier one; a disabled or unreadable rule fills nothing; each rule\'s box', () => {
    const r = S.populatedCells([
        { at: 'A1', value: [1, 2, 3] },
        { at: 'A2', value: ['x', 'y'], direction: 'down' },
        { at: 'E1', value: [1, 2], direction: 'right', enabled: false },
        { at: '??', value: 5 },
        { at: 'C1', value: [[1, 2], [3, 4]] }
    ], 100, 26);
    assert.strictEqual(r.map.get(S.cellKey(0, 0)), 1);
    assert.strictEqual(r.map.get(S.cellKey(1, 0)), 'x', 'the second rule covers the first at A2');
    assert.strictEqual(r.map.get(S.cellKey(2, 0)), 'y');
    assert.strictEqual(r.map.has(S.cellKey(0, 4)), false);
    assert.strictEqual(r.map.get(S.cellKey(1, 3)), 4);
    assert.deepStrictEqual(r.blocks, [{ r1: 0, c1: 0, r2: 2, c2: 0 }, { r1: 1, c1: 0, r2: 2, c2: 0 }, null, null, { r1: 0, c1: 2, r2: 1, c2: 3 }]);
    assert.strictEqual(S.populatedCells(null, 10, 10).map.size, 0);
});

ok('valueAt: a user edit over a populated value over the typed one; null when there is nothing', () => {
    const layers = { cells: new Map([['0,0', 'typed'], ['0,1', 'typed']]), populated: new Map([['0,1', 'populated'], ['0,2', 'populated']]), edits: new Map([['0,2', 'edited']]) };
    assert.strictEqual(S.valueAt(layers, 0, 0), 'typed');
    assert.strictEqual(S.valueAt(layers, 0, 1), 'populated');
    assert.strictEqual(S.valueAt(layers, 0, 2), 'edited');
    assert.strictEqual(S.valueAt(layers, 5, 5), null);
    assert.strictEqual(S.valueAt({ cells: new Map(), populated: new Map([['1,1', null]]) }, 1, 1), null, 'a null of populate is an empty cell');
    assert.strictEqual(S.valueAt({}, 1, 1), null);
});

ok('viewAreaOf: the area, kept inside the sheet; the whole sheet when empty or not usable', () => {
    assert.deepStrictEqual(S.viewAreaOf('B2:D5', 100, 26), { r1: 1, c1: 1, r2: 4, c2: 3 });
    assert.deepStrictEqual(S.viewAreaOf('', 100, 26), { r1: 0, c1: 0, r2: 99, c2: 25 });
    assert.deepStrictEqual(S.viewAreaOf('junk', 100, 26), { r1: 0, c1: 0, r2: 99, c2: 25 });
    assert.deepStrictEqual(S.viewAreaOf('A1:ZZ9999', 100, 26), { r1: 0, c1: 0, r2: 99, c2: 25 });
    assert.deepStrictEqual(S.viewAreaOf('A200:B300', 100, 26), { r1: 0, c1: 0, r2: 99, c2: 25 }, 'wholly outside: the sheet');
});

ok('mergesFromProps / rangedFromProps: Excel text to numbers; unusable entries left out', () => {
    assert.deepStrictEqual(S.mergesFromProps(['A1:B2', 'zz', { range: 'C3:D4' }, null]), [{ r1: 0, c1: 0, r2: 1, c2: 1 }, { r1: 2, c1: 2, r2: 3, c2: 3 }]);
    const b = S.rangedFromProps([{ range: 'A1:B2', sides: 'outer', width: 2 }, { range: 'bad' }, null]);
    assert.strictEqual(b.length, 1);
    assert.deepStrictEqual([b[0].r1, b[0].c2, b[0].sides, b[0].width], [0, 1, 'outer', 2]);
    assert.deepStrictEqual(S.mergesFromProps(null), []);
});

// ---- layout ---------------------------------------------------------------------------------------------------

ok('normalizeFreeze keeps at least one row / column scrolling', () => {
    assert.deepStrictEqual(L.normalizeFreeze(2, 1, 10, 5), { rows: 2, cols: 1 });
    assert.deepStrictEqual(L.normalizeFreeze(99, 99, 10, 5), { rows: 9, cols: 4 });
    assert.deepStrictEqual(L.normalizeFreeze(-1, 'x', 10, 5), { rows: 0, cols: 0 });
    assert.deepStrictEqual(L.normalizeFreeze(3, 3, 0, 0), { rows: 0, cols: 0 });
});

ok('normalizeMerges: swapped corners fixed; one cell, outside, overlap and crossing a frozen line are dropped with a reason', () => {
    const r = L.normalizeMerges([
        { r1: 3, c1: 2, r2: 1, c2: 0 }, { r1: 0, c1: 0, r2: 0, c2: 0 }, { r1: 8, c1: 0, r2: 12, c2: 1 }, { r1: 2, c1: 1, r2: 5, c2: 3 },
        { r1: 0, c1: 3, r2: 1, c2: 4 }, { r1: 4, c1: 0, r2: 5, c2: 0 }, null
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
        { r1: 0, c1: 0, r2: 0, c2: 0, sides: 'bogus' },
        { r1: 'x' }
    ]);
    assert.strictEqual(rules.length, 3);
    const e = L.buildEdges(rules);
    const top = L.boxBorders(e, 1, 1, 1, 1, 6, 6);
    assert.strictEqual(top.borderTop, '3px dashed red', 'the later rule wins the shared edge');
    assert.strictEqual(top.borderLeft, '1px solid var(--bd)');
    assert.strictEqual(top.borderBottom, undefined, 'the line below belongs to the next row');
    assert.strictEqual(L.boxBorders(e, 2, 1, 2, 1, 6, 6).borderTop, '1px solid var(--bd)', 'the inner line between rows 1 and 2');
    assert.strictEqual(L.boxBorders(e, 3, 1, 3, 1, 6, 6).borderTop, '1px solid var(--bd)', 'the line under the range is the top of the row after it');
    const last = L.buildEdges(L.normalizeBorders([{ r1: 4, c1: 4, r2: 5, c2: 5, sides: 'outer' }]));
    const corner = L.boxBorders(last, 5, 5, 5, 5, 6, 6);
    assert.ok(corner.borderBottom && corner.borderRight, 'at the grid end the box draws its own bottom / right');
    const merged = L.boxBorders(last, 4, 4, 5, 5, 6, 6);
    assert.ok(merged.borderTop && merged.borderLeft && merged.borderBottom && merged.borderRight, 'a merged box takes the edges of its whole range');
    assert.strictEqual(L.resolveColor('bd-strong'), 'var(--bd-strong)');
    assert.strictEqual(L.resolveColor('#f00'), '#f00');
    assert.strictEqual(L.resolveColor(''), 'var(--bd-strong)');
});

ok('a border rule of style "none" paints over the lines of the earlier rules', () => {
    const e = L.buildEdges(L.normalizeBorders([{ r1: 0, c1: 0, r2: 3, c2: 3, sides: 'all' }, { r1: 1, c1: 1, r2: 2, c2: 2, sides: 'all', style: 'none' }]));
    assert.ok(e.h.has('0:0') && e.v.has('0:0'), 'the outside stays');
    assert.ok(!e.h.has('1:1') && !e.h.has('2:1') && !e.h.has('3:1') && !e.v.has('1:1') && !e.v.has('1:3'), 'inside the cleared range: none');
    assert.ok(e.h.has('1:0') && e.h.has('1:3'), 'a line outside the cleared columns stays');
});

ok('cellEditable: read-only wins over everything; editable: a cell can be edited unless a rule locks it; the last rule wins', () => {
    const locks = L.normalizeLocks([{ r1: 0, c1: 0, r2: 9, c2: 0, locked: true }, { r1: 2, c1: 0, r2: 2, c2: 0, locked: false }, { r1: 3, c1: 1, r2: 3, c2: 1 }]);
    assert.strictEqual(L.cellEditable('readonly', [{ r1: 0, c1: 0, r2: 0, c2: 0, locked: false }], 0, 0), false, 'a read-only grid edits nothing, an open cell too');
    assert.strictEqual(L.cellEditable('editable', [], 5, 5), true);
    assert.strictEqual(L.cellEditable('editable', locks, 1, 0), false, 'a locked range');
    assert.strictEqual(L.cellEditable('editable', locks, 2, 0), true, 'one open cell in a locked range');
    assert.strictEqual(L.cellEditable('editable', locks, 3, 1), false, '"locked" is the default of a rule');
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
    assert.deepStrictEqual(W.visibleRange(a, 3000, 300, 2, 0), { from: 98, to: 113 });
    assert.strictEqual(W.visibleRange(a, 0, 300, 2, 0).from, 0);
    assert.strictEqual(W.visibleRange(a, 0, 300, 5, 3).from, 3, 'rows 0..2 are frozen: drawn in their own pane');
    assert.deepStrictEqual(W.visibleRange(a, 0, 0, 2, 0), { from: 0, to: 0 });
    assert.strictEqual(W.scrollToShow(a, 50, 0, 300, 0), 1500 + 30 - 300, 'below: its bottom at the bottom edge');
    assert.strictEqual(W.scrollToShow(a, 5, 600, 300, 0), 150, 'above: its top at the top edge');
    assert.strictEqual(W.scrollToShow(a, 25, 600, 300, 0), 600, 'already in view: unchanged');
    const big = W.uniformAxis(1000000, 28, { 5: 80 });
    const bv = W.visibleRange(big, 14000000, 600, 6, 0);
    assert.ok(bv.to - bv.from < 40, (bv.to - bv.from) + ' rows');
});

// ---- staged edits (by address) --------------------------------------------------------------------------------------

ok('stage: set / value / has; a value equal to the original is no change; the changes as cells; clear / drop', () => {
    const st = St.createStage();
    St.stageSet(st, '0,0', 'v', 5, 1);
    St.stageSet(st, '0,1', 'v', 'x', 'y');
    St.stageSet(st, '1,1', 'v', 2, 2);
    assert.strictEqual(St.stageCount(st), 2, 'the cell equal to its original: nothing staged');
    assert.strictEqual(St.stageValue(st, '0,0', 'v', 1), 5);
    assert.strictEqual(St.stageValue(st, '0,0', 'other', 'own'), 'own');
    assert.ok(St.stageHas(st, '0,1', 'v') && !St.stageHas(st, '1,1', 'v'));
    St.stageSet(st, '0,0', 'v', 1, 1);
    assert.strictEqual(St.stageHas(st, '0,0', 'v'), false, 'edited back to the original: taken out');
    St.stageDrop(st, '0,1');
    assert.strictEqual(St.stageCount(st), 0);
    St.stageSet(st, '2,2', 'v', 1, 0);
    St.stageClear(st);
    assert.strictEqual(St.stageCount(st), 0);
});

// ---- selection ---------------------------------------------------------------------------------------------------------

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
    assert.deepStrictEqual(Sel.moveFocus(Sel.selectCell(0, 0), -1, -1, 10, 5, [], false).focus, { r: 0, c: 0 }, 'clamped');
    assert.deepStrictEqual(Sel.moveFocus(Sel.selectCell(9, 4), 1, 1, 10, 5, [], false).focus, { r: 9, c: 4 });
    f = Sel.moveFocus(Sel.selectCell(1, 1), 2, 0, 10, 5, [], true);
    assert.deepStrictEqual(Sel.rangeOf(f), { r1: 1, c1: 1, r2: 3, c2: 1 }, 'shift keeps the anchor');
    assert.deepStrictEqual(Sel.growToMerges({ r1: 4, c1: 0, r2: 4, c2: 1 }, m), { r1: 3, c1: 0, r2: 4, c2: 2 }, 'a range that touches a merge takes all of it');
});

ok('rangeToTsv: tab between cells, new line between rows, a cell with a tab / new line in quotes', () => {
    const v = (r, c) => (r === 0 && c === 1 ? 'a\tb\nc' : r + ',' + c);
    assert.strictEqual(Sel.rangeToTsv({ r1: 0, c1: 0, r2: 1, c2: 1 }, v), '0,0\t"a\tb\nc"\n1,0\t1,1');
    assert.strictEqual(Sel.rangeToTsv(null, v), '');
});

// ---- the Edit grid dialog's operations ------------------------------------------------------------------------

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

ok('design: crossesFreeze, freezeAt, describeRange (by address), sameRange', () => {
    assert.strictEqual(D.crossesFreeze({ r1: 0, c1: 0, r2: 2, c2: 0 }, { rows: 1, cols: 0 }), true);
    assert.strictEqual(D.crossesFreeze({ r1: 1, c1: 0, r2: 2, c2: 3 }, { rows: 1, cols: 0 }), false);
    assert.strictEqual(D.crossesFreeze({ r1: 0, c1: 0, r2: 0, c2: 5 }, { rows: 0, cols: 2 }), true);
    assert.deepStrictEqual(D.freezeAt({ r1: 1, c1: 2, r2: 3, c2: 4 }, 'rows'), { rows: 4, cols: undefined });
    assert.deepStrictEqual(D.freezeAt({ r1: 1, c1: 2, r2: 3, c2: 4 }, 'cols'), { rows: undefined, cols: 5 });
    assert.strictEqual(D.describeRange({ r1: 1, c1: 0, r2: 3, c2: 2 }), 'A2:C4 (9 cells)');
    assert.strictEqual(D.describeRange({ r1: 0, c1: 0, r2: 0, c2: 0 }), 'A1 (1 cell)');
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

const Cb = M['clipboard.js'], F = M['fill.js'], So = M['sort.js'], X = M['xlsx.js'];

ok('clipboard: formatTsv / parseTsv round-trip a matrix, with quotes as Excel writes them (a tab, a new line and a quote inside a cell)', () => {
    const m = [['a', 'b\tc', 'line1\nline2'], ['say "hi"', '', null], [1, 2.5, true]];
    const text = Cb.formatTsv(m);
    assert.strictEqual(text, 'a\t"b\tc"\t"line1\nline2"\n"say ""hi"""\t\t\n1\t2.5\ttrue');
    assert.deepStrictEqual(Cb.parseTsv(text), [['a', 'b\tc', 'line1\nline2'], ['say "hi"', '', ''], ['1', '2.5', 'true']]);
    assert.deepStrictEqual(Cb.parseTsv('x\ty\r\n1\t2\r\n'), [['x', 'y'], ['1', '2']], 'Windows line ends, a final line end is not a row');
    assert.deepStrictEqual(Cb.parseTsv('only'), [['only']]);
    assert.deepStrictEqual(Cb.parseTsv(''), []);
    assert.deepStrictEqual(Cb.parseTsv('a\t\tb'), [['a', '', 'b']], 'an empty cell between tabs');
    assert.deepStrictEqual(Cb.parseTsv('"unterminated'), [['unterminated']], 'a quote never closed does not lose the text');
});

ok('clipboard: packCells / unpackCells carry values and styles; text that is not a copy is null; pasteTargets lays a copy at a cell, cut at the sheet, or fills a selection with one cell', () => {
    const cells = [[{ v: 1, f: { bold: true } }, { v: 'x', f: {} }]];
    assert.deepStrictEqual(Cb.unpackCells(Cb.packCells(cells)), cells);
    assert.strictEqual(Cb.unpackCells('a\tb'), null);
    assert.strictEqual(Cb.unpackCells('{"v":2}'), null);
    assert.strictEqual(Cb.unpackCells('{"v":1,"cells":[1]}'), null);
    const lim = { rows: 10, cols: 5 };
    assert.deepStrictEqual(Cb.pasteTargets({ r: 8, c: 4 }, 3, 2, null, lim), [{ r: 8, c: 4, i: 0, j: 0 }, { r: 9, c: 4, i: 1, j: 0 }], 'cut at the sheet\'s edge');
    const sel = { r1: 1, c1: 1, r2: 2, c2: 2 };
    assert.deepStrictEqual(Cb.pasteTargets({ r: 1, c: 1 }, 1, 1, sel, lim).map((t) => [t.r, t.c, t.i, t.j]), [[1, 1, 0, 0], [1, 2, 0, 0], [2, 1, 0, 0], [2, 2, 0, 0]], 'one cell fills the selection');
    assert.strictEqual(Cb.pasteTargets({ r: 1, c: 1 }, 2, 2, sel, lim).length, 4, 'a bigger copy goes where it is: the selection does not matter');
});

ok('rangeToTsv quotes what needs it (the copy of a wrapped cell)', () => {
    assert.strictEqual(Sel.rangeToTsv({ r1: 0, c1: 0, r2: 0, c2: 1 }, (r, c) => (c === 0 ? 'two\nlines' : 'x')), '"two\nlines"\tx');
});

ok('fill: numbers go on by the step of the selection (one number: by 1); text that ends in a number too; the rest repeats; Ctrl copies; backwards goes before', () => {
    assert.deepStrictEqual(F.seriesValues([5], 3), [6, 7, 8]);
    assert.deepStrictEqual(F.seriesValues([1, 3], 3), [5, 7, 9], 'a step of 2');
    assert.deepStrictEqual(F.seriesValues([10, 20, 30], 2), [40, 50]);
    assert.deepStrictEqual(F.seriesValues([0.1, 0.2], 2), [0.3, 0.4], 'no float noise');
    assert.deepStrictEqual(F.seriesValues([5], 3, { copy: true }), [5, 5, 5]);
    assert.deepStrictEqual(F.seriesValues([5, 7], 3, { backward: true }), [3, 1, -1], 'above the selection');
    assert.deepStrictEqual(F.seriesValues(['Item 1'], 3), ['Item 2', 'Item 3', 'Item 4']);
    assert.deepStrictEqual(F.seriesValues(['A007'], 2), ['A008', 'A009'], 'zero padding is kept');
    assert.deepStrictEqual(F.seriesValues(['Pump 2', 'Pump 4'], 2), ['Pump 6', 'Pump 8']);
    assert.deepStrictEqual(F.seriesValues(['Pump 3'], 2, { backward: true }), ['Pump 2', 'Pump 1']);
    assert.deepStrictEqual(F.seriesValues(['a', 'b'], 5), ['a', 'b', 'a', 'b', 'a'], 'text repeats');
    assert.deepStrictEqual(F.seriesValues(['a', 'b'], 3, { backward: true }), ['b', 'a', 'b'], 'above: the end of the selection comes first');
    assert.deepStrictEqual(F.seriesValues(['A 1', 'B 2'], 2), ['A 1', 'B 2'], 'different prefixes: repeat');
    assert.deepStrictEqual(F.seriesValues([1, 'x'], 3), [1, 'x', 1], 'mixed: repeat');
    assert.deepStrictEqual(F.seriesValues([], 3), []);
    assert.deepStrictEqual(F.seriesValues([1], 0), []);
});

ok('fill: the cells a drag adds are in the direction it went furthest, kept in the sheet; a drag inside the selection adds none', () => {
    const lim = { rows: 20, cols: 10 }, src = { r1: 2, c1: 2, r2: 3, c2: 3 };
    assert.deepStrictEqual(F.fillTarget(src, { r: 8, c: 3 }, lim), { dir: 'down', target: { r1: 4, c1: 2, r2: 8, c2: 3 } });
    assert.deepStrictEqual(F.fillTarget(src, { r: 0, c: 2 }, lim), { dir: 'up', target: { r1: 0, c1: 2, r2: 1, c2: 3 } });
    assert.deepStrictEqual(F.fillTarget(src, { r: 3, c: 7 }, lim), { dir: 'right', target: { r1: 2, c1: 4, r2: 3, c2: 7 } });
    assert.deepStrictEqual(F.fillTarget(src, { r: 2, c: 0 }, lim), { dir: 'left', target: { r1: 2, c1: 0, r2: 3, c2: 1 } });
    assert.strictEqual(F.fillTarget(src, { r: 3, c: 3 }, lim), null, 'inside');
    assert.strictEqual(F.fillTarget(src, { r: 2, c: 2 }, lim), null);
    assert.strictEqual(F.fillTarget(src, { r: 50, c: 3 }, lim).target.r2, 19, 'kept in the sheet');
    assert.strictEqual(F.fillTarget(src, { r: 9, c: 6 }, lim).dir, 'down', 'the axis it went further along (7 rows against 3 columns)');
});

ok('sort: numbers by size before text, text in natural order, booleans after; empty values last in both directions; equal values keep their order', () => {
    const col = [10, 'item10', 2, null, 'Item2', true, '', 'b', 1.5, 'A'];
    const names = (dir) => So.sortPerm(col.length, (i) => col[i], dir).map((i) => col[i]);
    assert.deepStrictEqual(names('asc'), [1.5, 2, 10, 'A', 'b', 'item10'.length ? 'Item2' : '', 'item10', true, null, ''].filter((x) => x !== undefined), 'ascending');
    assert.deepStrictEqual(names('desc'), [true, 'item10', 'Item2', 'b', 'A', 10, 2, 1.5, null, ''], 'descending: the empty ones are still last');
    // a sort twice is a sort once; equal values keep their order
    const eq = [3, 1, 3, 1, 3];
    assert.deepStrictEqual(So.sortPerm(5, (i) => eq[i], 'asc'), [1, 3, 0, 2, 4]);
    assert.deepStrictEqual(So.sortPerm(5, (i) => eq[i], 'desc'), [0, 2, 4, 1, 3]);
    assert.deepStrictEqual(So.sortPerm(0, () => 1, 'asc'), []);
    assert.ok(So.compareValues('9', 10) < 0, 'a number written as text sorts as a number');
});

ok('sort: inversePerm; sortRangeCells moves the typed cells of the rows of a range by one column and leaves the rest alone', () => {
    assert.deepStrictEqual(So.inversePerm([2, 0, 1]), [1, 2, 0]);
    const cells = { A1: 'z', B1: 3, A2: 'x', B2: 1, A3: 'y', C1: 'out of the range', A9: 'far', B3: 2 };
    const sorted = So.sortRangeCells(cells, { r1: 0, c1: 0, r2: 2, c2: 1 }, 1, 'asc', A.addressOf);
    assert.deepStrictEqual(sorted, { A1: 'x', B1: 1, A2: 'y', B2: 2, A3: 'z', B3: 3, C1: 'out of the range', A9: 'far' });
    const down = So.sortRangeCells(cells, { r1: 0, c1: 0, r2: 2, c2: 1 }, 0, 'desc', A.addressOf);
    assert.deepStrictEqual([down.A1, down.A2, down.A3], ['z', 'y', 'x']);
    assert.deepStrictEqual([down.B1, down.B2, down.B3], [3, 2, 1], 'a row moves as one');
    const gaps = So.sortRangeCells({ A1: 'b', A3: 'a' }, { r1: 0, c1: 0, r2: 2, c2: 0 }, 0, 'asc', A.addressOf);
    assert.deepStrictEqual(gaps, { A1: 'a', A2: 'b' }, 'an empty row goes last');
    assert.deepStrictEqual(cells.A1, 'z', 'the input is untouched');
});

ok('find: the cells that hold a text, in reading order; case on request; next and previous go round', () => {
    const items = [{ r: 2, c: 0, text: 'Pump 2' }, { r: 0, c: 3, text: 'pump' }, { r: 0, c: 1, text: 'Mixer' }, { r: 1, c: 0, text: 'PUMP B' }];
    assert.deepStrictEqual(So.findMatches(items, 'pump', false), [{ r: 0, c: 3 }, { r: 1, c: 0 }, { r: 2, c: 0 }]);
    assert.deepStrictEqual(So.findMatches(items, 'pump', true), [{ r: 0, c: 3 }]);
    assert.deepStrictEqual(So.findMatches(items, '', false), []);
    assert.deepStrictEqual(So.findMatches(items, 'zzz', false), []);
    assert.deepStrictEqual([So.nextMatch(3, -1), So.nextMatch(3, 0), So.nextMatch(3, 2), So.nextMatch(3, 0, true), So.nextMatch(3, -1, true), So.nextMatch(0, 0)], [0, 1, 0, 2, 2, -1]);
});

ok('xlsx: colours as ARGB (hex, rgb, names, the short names of the grid); a theme variable or nothing has no colour', () => {
    assert.strictEqual(X.cssToArgb('#f00'), 'FFFF0000');
    assert.strictEqual(X.cssToArgb('#00ff7f'), 'FF00FF7F');
    assert.strictEqual(X.cssToArgb('rgb(255, 0, 128)'), 'FFFF0080');
    assert.strictEqual(X.cssToArgb('rgba(0, 0, 255, 0.5)'), 'FF0000FF');
    assert.strictEqual(X.cssToArgb('Red'), 'FFFF0000');
    assert.strictEqual(X.cssToArgb('primary'), 'FF0F62FF');
    assert.deepStrictEqual(['', 'transparent', 'inherit', 'var(--unknown)', 'nonsense', null].map(X.cssToArgb), [null, null, null, null, null, null]);
    assert.strictEqual(X.cssToArgb('var(--bd-strong)'), 'FF8D8D8D', 'a theme variable of the grid, as its light colour');
    assert.strictEqual(X.cssToArgb('var(--cp-solid, #123456)'), 'FF0F62FF');
});

ok('xlsx: sizes, dates and number formats as Excel keeps them', () => {
    assert.strictEqual(X.pxToChars(110), 15);
    assert.strictEqual(X.pxToPoints(28), 21);
    assert.strictEqual(X.excelSerial(new Date(2026, 0, 1)), 46023, 'midnight of 2026-01-01, in any time zone');
    assert.strictEqual(X.excelSerial(new Date(2026, 0, 1, 12, 0, 0)), 46023.5, 'noon is half a day');
    assert.strictEqual(X.excelSerial('junk'), null);
    assert.deepStrictEqual([X.numberFormat(1, ' °C'), X.numberFormat(2, ''), X.numberFormat(0, ''), X.numberFormat(-1, ''), X.numberFormat(-1, ' kg')], ['0.0" °C"', '0.00', '0', '', 'General" kg"']);
});

ok('xlsx: the package: the six files, the cells with their styles, the merges, the widths and heights, the frozen panes; every style once', () => {
    const files = X.buildXlsxFiles({
        name: 'Plant: A/B', defaultCol: 110, defaultRow: 28,
        cells: [
            { r: 0, c: 0, kind: 's', v: 'Name <&> "x"', font: { b: true, sz: 12, color: 'FFFF0000' }, fill: 'FFD0E2FF', align: { h: 'center', v: 'top', wrap: true }, border: { t: { style: 'solid', width: 2, color: 'primary' }, l: { style: 'dashed', width: 1, color: '' } } },
            { r: 0, c: 1, kind: 'n', v: 71.4, fmt: '0.0" °C"' },
            { r: 1, c: 0, kind: 'b', v: true },
            { r: 1, c: 1, kind: 's', v: 'second', font: { b: true, sz: 12, color: 'FFFF0000' }, fill: 'FFD0E2FF', align: { h: 'center', v: 'top', wrap: true }, border: { t: { style: 'solid', width: 2, color: 'primary' }, l: { style: 'dashed', width: 1, color: '' } } },
            { r: 2, c: 2, kind: null, fill: 'FF00FF00' },
            { r: 2, c: 0, kind: 's', v: 'tab\tand\u0001control' }
        ],
        cols: { 0: 200, 3: 50 }, rows: { 1: 60, 2: 28 }, merges: [{ r1: 3, c1: 1, r2: 4, c2: 2 }], freeze: { rows: 1, cols: 2 }
    });
    assert.deepStrictEqual(files.map((x) => x.name), ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']);
    const by = Object.fromEntries(files.map((x) => [x.name, x.text]));
    assert.ok(by['xl/workbook.xml'].includes('name="Plant  A B"'), 'a sheet name Excel accepts');
    const sheet = by['xl/worksheets/sheet1.xml'];
    assert.ok(sheet.includes('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Name &lt;&amp;&gt; &quot;x&quot;</t></is></c>'), 'text escaped');
    assert.ok(sheet.includes('<c r="B1" s="2"><v>71.4</v></c>'), 'a number with its format');
    assert.ok(sheet.includes('<c r="A2" t="b"><v>1</v></c>'), 'a boolean with the default style');
    assert.ok(sheet.includes('<c r="B2" s="1" t="inlineStr">'), 'the same style is the same style');
    assert.ok(sheet.includes('<c r="C3" s="3"/>'), 'a styled empty cell');
    assert.ok(sheet.includes('tab\tand'), 'a tab stays');
    assert.ok(!sheet.includes('\u0001'), 'a control character does not');
    assert.ok(sheet.includes('<row r="2" ht="45" customHeight="1">'), 'a row of its own height (60 px = 45 pt)');
    assert.ok(!sheet.includes('<row r="3" ht='), 'a row of the default height says nothing');
    assert.ok(sheet.includes('<col min="1" max="1" width="27.86" customWidth="1"/>') && sheet.includes('<col min="4" max="4" width="6.43" customWidth="1"/>'), 'column widths');
    assert.ok(sheet.includes('<mergeCell ref="B4:C5"/>') && sheet.includes('<mergeCells count="1">'));
    assert.ok(sheet.includes('<pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/>'), 'frozen panes');
    assert.ok(sheet.includes('<dimension ref="A1:C3"/>'));
    const styles = by['xl/styles.xml'];
    assert.ok(styles.includes('<numFmt numFmtId="164" formatCode="0.0&quot; °C&quot;"/>'), 'the custom number format');
    assert.ok(styles.includes('<b/>') && styles.includes('<sz val="12"/>') && styles.includes('<color rgb="FFFF0000"/>'), 'the font');
    assert.ok(styles.includes('<fgColor rgb="FFD0E2FF"/>'), 'the fill');
    assert.ok(styles.includes('<top style="medium"><color rgb="FF0F62FF"/></top>') && styles.includes('<left style="dashed">'), 'the borders');
    assert.ok(styles.includes('<alignment horizontal="center" vertical="top" wrapText="1"/>'), 'the alignment');
    assert.ok(styles.includes('<fills count="4">') && styles.includes('<cellXfs count="4">'), 'the two default fills first, then each style once: ' + styles.slice(styles.indexOf('<cellXfs'), styles.indexOf('<cellXfs') + 30));
    const only = X.buildXlsxFiles({ cells: [], merges: [], cols: {}, rows: {} });
    assert.ok(only[5].text.includes('<sheetData></sheetData>') && !only[5].text.includes('<dimension'), 'an empty sheet is a valid one');
});

ok('design: rulesFromCells: the styles of a block as short rules (neighbours and identical rows become one range); a plain cell over a styled one resets it', () => {
    const keys = ['bold', 'fill', 'type'];
    const bold = { bold: true }, red = { fill: 'red' };
    const rules = D.rulesFromCells([[bold, bold, red], [bold, bold, red], [{}, {}, {}]], { r: 1, c: 1 }, () => ({}), keys);
    assert.deepStrictEqual(rules, [{ range: 'B2:C3', bold: true }, { range: 'D2:D3', fill: 'red' }]);
    // over a cell that has a fill, a plain copy resets it
    const reset = D.rulesFromCells([[{}]], { r: 0, c: 0 }, (r, c) => (r === 0 && c === 0 ? { fill: 'blue', bold: true } : {}), keys);
    assert.deepStrictEqual(reset, [{ range: 'A1', bold: '', fill: '' }]);
    // what the rules say once read back
    const parsed = S.parseRules(D.rulesFromCells([[bold, red]], { r: 4, c: 4 }, () => ({}), keys), 20, 20);
    assert.deepStrictEqual(S.fieldsAt(parsed, 4, 4), { bold: true });
    assert.deepStrictEqual(S.fieldsAt(parsed, 4, 5), { fill: 'red' });
    assert.deepStrictEqual(D.rulesFromCells([[{}, {}]], { r: 0, c: 0 }, () => ({}), keys), [], 'plain over plain: nothing to say');
});

ok('design: toTextMerges / toTextRules store ranges as Excel text (whole columns and rows in their short form) and drop the numbers', () => {
    assert.deepStrictEqual(D.toTextMerges([{ r1: 0, c1: 0, r2: 1, c2: 1 }, { r1: 4, c1: 2, r2: 5, c2: 3 }]), ['A1:B2', 'C5:D6']);
    const t = D.toTextRules([{ r1: 0, c1: 1, r2: 99, c2: 2, locked: true }, { r1: 1, c1: 0, r2: 3, c2: 25, sides: 'all', width: 2 }, { r1: 2, c1: 2, r2: 4, c2: 4, locked: false }], 100, 26);
    assert.deepStrictEqual(t, [{ range: 'B:C', locked: true }, { range: '2:4', sides: 'all', width: 2 }, { range: 'C3:E5', locked: false }]);
    // and back: what the props read
    assert.strictEqual(S.rangedFromProps(t)[0].r2, 701 === 701 ? 999 : 0, 'B:C reads as the whole column');
});

ok('design: addRule folds a change into the last rule of the same range (Bold on, off) and starts a new rule for another range; an empty value is kept', () => {
    let r = D.addRule([], 'B2:C3', { bold: true });
    r = D.addRule(r, 'B2:C3', { fill: 'red' });
    assert.deepStrictEqual(r, [{ range: 'B2:C3', bold: true, fill: 'red' }]);
    r = D.addRule(r, 'B2:C3', { bold: false });
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].bold, false);
    r = D.addRule(r, 'C3', { fill: '' });
    assert.deepStrictEqual(r[1], { range: 'C3', fill: '' });
    const parsed = S.parseRules(r, 10, 10);
    assert.deepStrictEqual(S.fieldsAt(parsed, 2, 2), { bold: false, fill: '' }, 'the empty fill covers the red one at C3');
    const frozen = JSON.stringify(r);
    D.addRule(r, 'A1', { bold: true });
    assert.strictEqual(JSON.stringify(r), frozen, 'the input is untouched');
});

ok('design: commonFields: what the selected cells have in common, nothing for a field they differ in', () => {
    const rules = S.parseRules([{ range: 'A1:C3', bold: true, fill: 'red' }, { range: 'B2', fill: 'blue' }, { range: 'A1:A3', type: 'number' }], 10, 10);
    assert.deepStrictEqual(D.commonFields(rules, { r1: 0, c1: 0, r2: 0, c2: 0 }, ['bold', 'fill', 'type']), { bold: true, fill: 'red', type: 'number' });
    assert.deepStrictEqual(D.commonFields(rules, { r1: 0, c1: 0, r2: 2, c2: 2 }, ['bold', 'fill', 'type']), { bold: true }, 'fill and type differ in the range');
    assert.deepStrictEqual(D.commonFields(rules, { r1: 5, c1: 5, r2: 6, c2: 6 }, ['bold']), {}, 'no rule: nothing');
    const big = S.parseRules([{ range: '1:1000', italic: true }], 1000, 26);
    assert.deepStrictEqual(D.commonFields(big, { r1: 0, c1: 0, r2: 999, c2: 25 }, ['italic']), { italic: true }, 'a whole sheet is sampled, fast');
});

// ---- formulas ---------------------------------------------------------------------------------------------

const Fm = M['formula.js'], C = M['calc.js'], V = M['xlvalue.js'];
// a sheet from { A1: 5, B1: "=A1*2" } -> a function that gives the value of an address
function sheet(cells, extra) {
    const calc = C.createCalc((s, r, c) => { const v = cells[A.addressOf(r, c)]; return v === undefined ? null : v; }, extra);
    return (addr) => { const a = A.parseAddress(addr); const v = calc.value(0, a.r, a.c); return V.isError(v) ? v.code : v; };
}
const calcOf = (formula, cells) => sheet(Object.assign({ Z1: formula }, cells || {}))('Z1');
function serialOf(y, m, d) { return Math.floor(V.dateToSerial(new Date(y, m - 1, d))); }

ok('formulas: arithmetic with Excel precedence (^ left to right, minus before ^, % behind)', () => {
    assert.strictEqual(calcOf('=1+2*3'), 7);
    assert.strictEqual(calcOf('=(1+2)*3'), 9);
    assert.strictEqual(calcOf('=2^3^2'), 64, 'left to right');
    assert.strictEqual(calcOf('=-2^2'), 4, 'a minus in front binds tighter');
    assert.strictEqual(calcOf('=50%'), 0.5);
    assert.strictEqual(calcOf('=200*10%'), 20);
    assert.strictEqual(calcOf('=0.1+0.2'), 0.3, '15 digits, like Excel');
    assert.strictEqual(calcOf('=1/0'), '#DIV/0!');
    assert.strictEqual(calcOf('="a"&"b"&1'), 'ab1');
    assert.strictEqual(calcOf('="a"+1'), '#VALUE!');
    assert.strictEqual(calcOf('="3"+1'), 4, 'a text that is a number counts');
});

ok('formulas: comparisons, booleans, errors as values', () => {
    assert.strictEqual(calcOf('=2>1'), true);
    assert.strictEqual(calcOf('="a"="A"'), true, 'case does not matter');
    assert.strictEqual(calcOf('=1<>2'), true);
    assert.strictEqual(calcOf('=TRUE'), true);
    assert.strictEqual(calcOf('=#N/A'), '#N/A');
    assert.strictEqual(calcOf('=NOSUCH(1)'), '#NAME?');
    assert.strictEqual(calcOf('=1+'), '#NAME?', 'a formula that cannot be read');
});

ok('formulas: references, ranges, whole columns and rows, $ signs, ; as separator', () => {
    const cells = { A1: 1, A2: 2, A3: 3, B1: 10, B2: 20 };
    assert.strictEqual(calcOf('=SUM(A1:A3)', cells), 6);
    assert.strictEqual(calcOf('=SUM(A:A)', cells), 6);
    assert.strictEqual(calcOf('=SUM(2:2)', cells), 22, 'a whole row (the formula itself is in row 1, so not row 1)');
    assert.strictEqual(calcOf('=SUM($A$1:$B$2)', cells), 33);
    assert.strictEqual(calcOf('=SUM(A1;A2;5)', cells), 8);
    assert.strictEqual(calcOf('=A1+B2', cells), 21);
    assert.strictEqual(calcOf('=A5+1', cells), 1, 'an empty cell is 0');
    assert.strictEqual(calcOf('=AVERAGE(A1:A3)', cells), 2);
    assert.strictEqual(calcOf('=MAX(A1:B2)-MIN(A1:B2)', cells), 19);
    assert.strictEqual(calcOf('=COUNT(A1:B3)', cells), 5);
});

ok('formulas: a cell that uses another formula; a cycle is #CYCLE!; a long chain does not overflow', () => {
    assert.strictEqual(sheet({ A1: 2, A2: '=A1*2', A3: '=A2+A1' })('A3'), 6);
    assert.strictEqual(sheet({ A1: 5, A2: '=A1*2', A3: '=A2+A1' })('A3'), 15, 'a new calculator reads the new values');
    const loop = sheet({ A1: '=B1+1', B1: '=A1+1', C1: '=C1' });
    assert.strictEqual(loop('A1'), '#CYCLE!');
    assert.strictEqual(loop('B1'), '#CYCLE!');
    assert.strictEqual(loop('C1'), '#CYCLE!');
    assert.strictEqual(sheet({ A1: '=IFERROR(A1,7)' })('A1'), 7, 'IFERROR can catch it');
    const chain = { A1: 1 };
    for (let i = 2; i <= 900; i++) chain['A' + i] = '=A' + (i - 1) + '+1';
    assert.strictEqual(sheet(chain)('A900'), 900);
});

ok('functions: logic is lazy (the branch not taken is never worked out), IFS, SWITCH, AND, OR, NOT', () => {
    assert.strictEqual(calcOf('=IF(1>2,1/0,"ok")'), 'ok');
    assert.strictEqual(calcOf('=IF(A1>10,"high","low")', { A1: 11 }), 'high');
    assert.strictEqual(calcOf('=IF(FALSE,1)'), false);
    assert.strictEqual(calcOf('=IFERROR(1/0,"none")'), 'none');
    assert.strictEqual(calcOf('=IFERROR(4,"none")'), 4);
    assert.strictEqual(calcOf('=IFS(A1<5,"a",A1<10,"b",TRUE,"c")', { A1: 7 }), 'b');
    assert.strictEqual(calcOf('=IFS(FALSE,1)'), '#N/A');
    assert.strictEqual(calcOf('=SWITCH(A1,1,"one",2,"two","many")', { A1: 2 }), 'two');
    assert.strictEqual(calcOf('=SWITCH(A1,1,"one","many")', { A1: 9 }), 'many');
    assert.strictEqual(calcOf('=AND(A1>1,A2>1)', { A1: 2, A2: 3 }), true);
    assert.strictEqual(calcOf('=OR(FALSE,A1>1)', { A1: 0 }), false);
    assert.strictEqual(calcOf('=NOT(TRUE)'), false);
    assert.strictEqual(calcOf('=CHOOSE(2,"a","b","c")'), 'b');
    assert.strictEqual(calcOf('=IF(A1="","empty","full")'), 'empty');
});

ok('functions: math (rounding as Excel, MOD with the sign of the divisor, CEILING, POWER ...)', () => {
    assert.strictEqual(calcOf('=ROUND(2.5,0)'), 3);
    assert.strictEqual(calcOf('=ROUND(-2.5,0)'), -3, 'away from zero');
    assert.strictEqual(calcOf('=ROUND(1.2345,2)'), 1.23);
    assert.strictEqual(calcOf('=ROUND(1234,-2)'), 1200);
    assert.strictEqual(calcOf('=ROUNDUP(1.21,1)'), 1.3);
    assert.strictEqual(calcOf('=ROUNDDOWN(-1.29,1)'), -1.2);
    assert.strictEqual(calcOf('=INT(-1.5)'), -2);
    assert.strictEqual(calcOf('=TRUNC(-1.5)'), -1);
    assert.strictEqual(calcOf('=MOD(-3,2)'), 1);
    assert.strictEqual(calcOf('=MOD(5,0)'), '#DIV/0!');
    assert.strictEqual(calcOf('=ABS(-4)+SIGN(-9)'), 3);
    assert.strictEqual(calcOf('=SQRT(16)'), 4);
    assert.strictEqual(calcOf('=SQRT(-1)'), '#NUM!');
    assert.strictEqual(calcOf('=POWER(2,10)'), 1024);
    assert.strictEqual(calcOf('=CEILING(4.2,0.5)'), 4.5);
    assert.strictEqual(calcOf('=FLOOR(4.7,0.5)'), 4.5);
    assert.strictEqual(calcOf('=PRODUCT(2,3,4)'), 24);
    assert.strictEqual(calcOf('=LOG(100,10)'), 2);
    assert.strictEqual(calcOf('=LN(1)'), 0);
    assert.strictEqual(calcOf('=PI()>3.14'), true);
});

ok('functions: SUM leaves text and booleans in a range alone but counts the ones written as arguments; errors travel', () => {
    const cells = { A1: 1, A2: 'x', A3: true, A4: 4 };
    assert.strictEqual(calcOf('=SUM(A1:A4)', cells), 5);
    assert.strictEqual(calcOf('=SUM(A1,"3",TRUE)', cells), 5);
    assert.strictEqual(calcOf('=SUM(A1,"x")', cells), '#VALUE!');
    assert.strictEqual(calcOf('=SUM(A1,1/0)', cells), '#DIV/0!');
    assert.strictEqual(calcOf('=AVERAGE(A2:A3)', cells), '#DIV/0!');
    assert.strictEqual(calcOf('=COUNTA(A1:A5)', cells), 4);
    assert.strictEqual(calcOf('=COUNTBLANK(A1:A5)', cells), 1);
    assert.strictEqual(calcOf('=COUNT(A1:A4)', cells), 2);
});

ok('functions: text', () => {
    assert.strictEqual(calcOf('=LEN("hello")'), 5);
    assert.strictEqual(calcOf('=LEFT("hello",2)&RIGHT("hello",3)'), 'hello');
    assert.strictEqual(calcOf('=MID("hello",2,3)'), 'ell');
    assert.strictEqual(calcOf('=UPPER("ab")&LOWER("CD")'), 'ABcd');
    assert.strictEqual(calcOf('=PROPER("hello world-x")'), 'Hello World-X');
    assert.strictEqual(calcOf('=TRIM("  a   b ")'), 'a b');
    assert.strictEqual(calcOf('=CONCAT("a",1,TRUE)'), 'a1TRUE');
    assert.strictEqual(calcOf('=TEXTJOIN("-",TRUE,"a","","b")'), 'a-b');
    assert.strictEqual(calcOf('=TEXTJOIN("-",FALSE,"a","","b")'), 'a--b');
    assert.strictEqual(calcOf('=FIND("l","hello")'), 3);
    assert.strictEqual(calcOf('=FIND("L","hello")'), '#VALUE!', 'FIND cares about case');
    assert.strictEqual(calcOf('=SEARCH("L","hello")'), 3, 'SEARCH does not');
    assert.strictEqual(calcOf('=SEARCH("l?o","hello")'), 3, 'and knows wildcards');
    assert.strictEqual(calcOf('=SUBSTITUTE("a-b-c","-","+")'), 'a+b+c');
    assert.strictEqual(calcOf('=SUBSTITUTE("a-b-c","-","+",2)'), 'a-b+c');
    assert.strictEqual(calcOf('=REPLACE("hello",1,1,"J")'), 'Jello');
    assert.strictEqual(calcOf('=REPT("ab",3)'), 'ababab');
    assert.strictEqual(calcOf('=VALUE("12.5")+1'), 13.5);
    assert.strictEqual(calcOf('=EXACT("a","A")'), false);
    assert.strictEqual(calcOf('=TEXT(1234.5,"#,##0.00")'), '1,234.50');
    assert.strictEqual(calcOf('=TEXT(0.256,"0%")'), '26%');
    assert.strictEqual(calcOf('=TEXT(5,"000")'), '005');
    assert.strictEqual(calcOf('=TEXT(DATE(2026,3,7),"yyyy-mm-dd")'), '2026-03-07');
    assert.strictEqual(calcOf('=TEXT(DATE(2026,3,7),"dd mmm yyyy")'), '07 Mar 2026');
    assert.strictEqual(calcOf('=TEXT(TIME(14,5,9),"hh:mm:ss")'), '14:05:09');
});

ok('functions: date and time work on serial numbers; NOW and TODAY are volatile', () => {
    assert.strictEqual(calcOf('=DATE(2026,1,31)'), serialOf(2026, 1, 31));
    assert.strictEqual(calcOf('=YEAR(DATE(2026,3,7))&"-"&MONTH(DATE(2026,3,7))&"-"&DAY(DATE(2026,3,7))'), '2026-3-7');
    assert.strictEqual(calcOf('=DATE(2026,14,1)'), serialOf(2027, 2, 1), 'month 14 rolls over');
    assert.strictEqual(calcOf('=DATE(2026,3,7)+30-DATE(2026,3,7)'), 30);
    assert.strictEqual(calcOf('=WEEKDAY(DATE(2026,3,7))'), 7, 'a Saturday');
    assert.strictEqual(calcOf('=WEEKDAY(DATE(2026,3,7),2)'), 6);
    assert.strictEqual(calcOf('=EDATE(DATE(2026,1,31),1)'), serialOf(2026, 2, 28), 'the end of the month');
    assert.strictEqual(calcOf('=DATEDIF(DATE(2026,1,15),DATE(2026,3,14),"M")'), 1);
    assert.strictEqual(calcOf('=DATEDIF(DATE(2020,1,1),DATE(2026,3,14),"Y")'), 6);
    assert.strictEqual(calcOf('=DATEDIF(DATE(2026,1,1),DATE(2026,1,31),"D")'), 30);
    assert.strictEqual(calcOf('=HOUR(TIME(14,5,9))*100+MINUTE(TIME(14,5,9))'), 1405);
    const noon = new Date(2026, 5, 1, 12, 0, 0);
    assert.strictEqual(sheet({ A1: '=TODAY()' }, { now: noon })('A1'), serialOf(2026, 6, 1));
    assert.strictEqual(sheet({ A1: '=NOW()-TODAY()' }, { now: noon })('A1'), 0.5);
    const calc = C.createCalc((s, r, c) => (r === 0 && c === 0 ? '=NOW()' : 1));
    assert.strictEqual(calc.volatile, false);
    calc.value(0, 0, 0);
    assert.strictEqual(calc.volatile, true);
    const plainCalc = C.createCalc(() => '=1+1');
    plainCalc.value(0, 0, 0);
    assert.strictEqual(plainCalc.volatile, false, 'a plain formula is not volatile');
});

ok('functions: lookup (VLOOKUP exact and approximate, HLOOKUP, XLOOKUP, INDEX, MATCH, ROW, COLUMN)', () => {
    const t = { A1: 'a', B1: 10, A2: 'b', B2: 20, A3: 'c', B3: 30 };
    assert.strictEqual(calcOf('=VLOOKUP("b",A1:B3,2,FALSE)', t), 20);
    assert.strictEqual(calcOf('=VLOOKUP("z",A1:B3,2,FALSE)', t), '#N/A');
    assert.strictEqual(calcOf('=VLOOKUP("B",A1:B3,2,0)', t), 20, 'case does not matter');
    assert.strictEqual(calcOf('=VLOOKUP("b",A1:B3,3,FALSE)', t), '#REF!');
    const g = { A1: 0, B1: 'low', A2: 50, B2: 'mid', A3: 90, B3: 'high' };
    assert.strictEqual(calcOf('=VLOOKUP(75,A1:B3,2)', g), 'mid', 'approximate: the largest not above');
    assert.strictEqual(calcOf('=VLOOKUP(-1,A1:B3,2)', g), '#N/A');
    assert.strictEqual(calcOf('=HLOOKUP("y",A1:C2,2,FALSE)', { A1: 'x', B1: 'y', C1: 'z', A2: 1, B2: 2, C2: 3 }), 2);
    assert.strictEqual(calcOf('=XLOOKUP("c",A1:A3,B1:B3)', t), 30);
    assert.strictEqual(calcOf('=XLOOKUP("q",A1:A3,B1:B3,"none")', t), 'none');
    assert.strictEqual(calcOf('=XLOOKUP("q",A1:A3,B1:B3)', t), '#N/A');
    assert.strictEqual(calcOf('=XLOOKUP(25,B1:B3,A1:A3,"x",-1)', t), 'b', 'the next smaller');
    assert.strictEqual(calcOf('=INDEX(B1:B3,2)', t), 20);
    assert.strictEqual(calcOf('=INDEX(A1:B3,3,2)', t), 30);
    assert.strictEqual(calcOf('=INDEX(A1:B3,4,1)', t), '#REF!');
    assert.strictEqual(calcOf('=MATCH("c",A1:A3,0)', t), 3);
    assert.strictEqual(calcOf('=MATCH(25,B1:B3,1)', t), 2);
    assert.strictEqual(calcOf('=MATCH("z",A1:A3,0)', t), '#N/A');
    assert.strictEqual(calcOf('=INDEX(B1:B3,MATCH("b",A1:A3,0))', t), 20, 'composed');
    assert.strictEqual(calcOf('=ROW()'), 1);
    assert.strictEqual(calcOf('=COLUMN()'), 26);
    assert.strictEqual(calcOf('=ROW(C5)*100+COLUMN(C5)'), 503);
    assert.strictEqual(calcOf('=ROWS(A1:B3)*10+COLUMNS(A1:B3)'), 32);
});

ok('functions: SUMIF / COUNTIF / AVERAGEIF and the IFS ones: operators, wildcards, several conditions', () => {
    const t = { A1: 'apple', B1: 10, C1: 'x', A2: 'banana', B2: 20, C2: 'y', A3: 'apricot', B3: 30, C3: 'x', A4: 'cherry', B4: 40, C4: 'x' };
    assert.strictEqual(calcOf('=COUNTIF(A1:A4,"ap*")', t), 2);
    assert.strictEqual(calcOf('=COUNTIF(B1:B4,">15")', t), 3);
    assert.strictEqual(calcOf('=COUNTIF(B1:B4,20)', t), 1);
    assert.strictEqual(calcOf('=COUNTIF(C1:C4,"<>x")', t), 1);
    assert.strictEqual(calcOf('=SUMIF(C1:C4,"x",B1:B4)', t), 80);
    assert.strictEqual(calcOf('=SUMIF(B1:B4,">=20")', t), 90, 'without a sum range, the range itself');
    assert.strictEqual(calcOf('=AVERAGEIF(C1:C4,"x",B1:B4)', t), 26.6666666666667, '15 digits');
    assert.strictEqual(calcOf('=SUMIFS(B1:B4,C1:C4,"x",B1:B4,">10")', t), 70);
    assert.strictEqual(calcOf('=COUNTIFS(C1:C4,"x",A1:A4,"a*")', t), 2);
    assert.strictEqual(calcOf('=MAXIFS(B1:B4,C1:C4,"x")', t), 40);
    assert.strictEqual(calcOf('=MINIFS(B1:B4,C1:C4,"x")', t), 10);
    assert.strictEqual(calcOf('=AVERAGEIFS(B1:B4,C1:C4,"nothing")', t), '#DIV/0!');
    assert.strictEqual(calcOf('=COUNTIF(A1:A4,A2)', t), 1, 'a reference as the criterion');
    assert.strictEqual(calcOf('=SUMIF(A1:A4,"b*",B1:B4)*2', t), 40, 'composed');
});

ok('functions: statistics (MEDIAN, STDEV, VAR, LARGE, SMALL, RANK) and information (ISNUMBER, ISBLANK, ISERROR ...)', () => {
    const t = { A1: 2, A2: 4, A3: 4, A4: 4, A5: 5, A6: 5, A7: 7, A8: 9 };
    assert.strictEqual(calcOf('=MEDIAN(A1:A8)', t), 4.5);
    assert.strictEqual(calcOf('=STDEV.P(A1:A8)', t), 2);
    assert.strictEqual(calcOf('=VAR.P(A1:A8)', t), 4);
    assert.strictEqual(Math.round(calcOf('=STDEV(A1:A8)', t) * 1e4), 21381);
    assert.strictEqual(calcOf('=LARGE(A1:A8,2)', t), 7);
    assert.strictEqual(calcOf('=SMALL(A1:A8,1)', t), 2);
    assert.strictEqual(calcOf('=LARGE(A1:A8,9)', t), '#NUM!');
    assert.strictEqual(calcOf('=RANK(7,A1:A8)', t), 2);
    assert.strictEqual(calcOf('=RANK(7,A1:A8,1)', t), 7);
    assert.strictEqual(calcOf('=ISNUMBER(A1)&ISTEXT(A1)&ISBLANK(Q9)', t), 'TRUEFALSETRUE');
    assert.strictEqual(calcOf('=ISERROR(1/0)'), true);
    assert.strictEqual(calcOf('=ISNA(#N/A)'), true);
    assert.strictEqual(calcOf('=ISERROR(5)'), false);
});

ok('shiftFormula: relative references move, $ ones stay, ranges and whole columns move, off the sheet is #REF!', () => {
    assert.strictEqual(Fm.shiftFormula('=A1+$B$1', 1, 0), '=A2+$B$1');
    assert.strictEqual(Fm.shiftFormula('=A1+B$2+$C3', 2, 1), '=B3+C$2+$C5');
    assert.strictEqual(Fm.shiftFormula('=SUM(A1:B2)', 0, 1), '=SUM(B1:C2)');
    assert.strictEqual(Fm.shiftFormula('=SUM(A:B)', 0, 2), '=SUM(C:D)');
    assert.strictEqual(Fm.shiftFormula('=SUM(2:3)', 1, 0), '=SUM(3:4)');
    assert.strictEqual(Fm.shiftFormula('=A1', -1, 0), '=#REF!');
    assert.strictEqual(Fm.shiftFormula('="A1"&A1', 1, 0), '="A1"&A2', 'a text is left alone');
    assert.strictEqual(Fm.shiftFormula('=IF(A1>1;"x";B1)', 1, 1), '=IF(B2>1;"x";C2)');
    assert.strictEqual(Fm.shiftFormula('=LOG10(A1)', 1, 0), '=LOG10(A2)', 'LOG10 is a function, not a cell');
    assert.strictEqual(Fm.shiftFormula('plain', 1, 1), 'plain');
});

ok('xlvalue: compare order, criteria, 15-digit numbers, dates round trip', () => {
    assert.ok(V.compare(1, 'a') < 0 && V.compare('a', true) < 0, 'numbers < text < booleans');
    assert.strictEqual(V.compare(null, 0), 0);
    assert.strictEqual(V.compare(null, ''), 0);
    assert.strictEqual(V.compare('ABC', 'abc'), 0);
    assert.strictEqual(V.toNumber('50%'), 0.5);
    assert.ok(V.isError(V.toNumber('abc')));
    assert.strictEqual(V.toText(0.1 + 0.2), '0.3');
    const d = new Date(2026, 2, 7, 13, 30, 0);
    assert.strictEqual(V.serialToDate(V.dateToSerial(d)).getTime(), d.getTime());
    assert.ok(V.criterion('>5')(6) && !V.criterion('>5')(5) && V.criterion('a*')('Apple') && V.criterion('<>a')('b'));
});

// a workbook: { "Sheet1": { A1: 1 }, "My Data": { ... } } -> the value of a cell by (sheet name, address)
function book(sheets, extra) {
    const names = Object.keys(sheets);
    const calc = C.createCalc((s, r, c) => { const v = sheets[names[s]][A.addressOf(r, c)]; return v === undefined ? null : v; },
        Object.assign({ sheetIndex: (n) => names.findIndex((x) => x.toLowerCase() === String(n).toLowerCase()), size: () => ({ rows: 100, cols: 26 }) }, extra));
    return (name, addr) => { const a = A.parseAddress(addr); const v = calc.value(names.indexOf(name), a.r, a.c); return V.isError(v) ? v.code : v; };
}

ok('sheets: a formula reads another sheet: Sheet2!A1, a name with spaces in quotes, ranges, whole columns, any case; no sheet is the formula\'s own', () => {
    const v = book({ Sheet1: { A1: '=Sheet2!A1*2', A2: "='My Data'!B1+1", A3: '=SUM(Sheet2!A1:A3)', A4: '=SUM(sheet2!A:A)', A5: '=A1+Sheet2!A1', A6: '=Nope!A1', A7: "=SUM('My Data'!B1:B2)" },
        Sheet2: { A1: 5, A2: 6, A3: 7 }, 'My Data': { B1: 10, B2: 20 } });
    assert.strictEqual(v('Sheet1', 'A1'), 10);
    assert.strictEqual(v('Sheet1', 'A2'), 11);
    assert.strictEqual(v('Sheet1', 'A3'), 18);
    assert.strictEqual(v('Sheet1', 'A4'), 18, 'whole column, any case of the name');
    assert.strictEqual(v('Sheet1', 'A5'), 15, 'A1 is of Sheet1 (=Sheet2!A1*2 = 10), Sheet2!A1 is 5');
    assert.strictEqual(v('Sheet1', 'A6'), '#REF!', 'a sheet that is not there');
    assert.strictEqual(v('Sheet1', 'A7'), 30);
});

ok('sheets: a formula in another sheet reads its own sheet by default; a loop across sheets is #CYCLE!', () => {
    const v = book({ A: { A1: '=B!A1+1', A2: '=A1' }, B: { A1: '=A!A1+1', A2: '=A1*10', A3: '=A!A2' } });
    assert.strictEqual(v('A', 'A1'), '#CYCLE!');
    assert.strictEqual(v('B', 'A1'), '#CYCLE!');
    const w = book({ A: { A1: 3, A2: '=B!A2' }, B: { A1: 4, A2: '=A1*10' } });
    assert.strictEqual(w('A', 'A2'), 40, 'B!A2 is =A1*10 in B: its own A1 (4), not the A1 of A');
});

ok('sheets: shiftFormula moves the references and leaves the sheet name alone; the tokenizer reads quoted names with a quote in them', () => {
    assert.strictEqual(Fm.shiftFormula('=Sheet2!A1+B1', 1, 0), '=Sheet2!A2+B2');
    assert.strictEqual(Fm.shiftFormula("='My Data'!$A1:B2", 1, 1), "='My Data'!$A2:C3");
    const t = Fm.tokenize("'It''s'!A1");
    assert.deepStrictEqual([t.tokens[0].type, t.tokens[0].text, t.tokens[1].type], ['sheet', "It's", 'cell']);
    assert.ok(!Fm.parseFormula('=Sheet2!5').ast, 'a sheet name must be followed by a cell or a range');
});

const Sh = M['sheets.js'];

ok('sheets: names are clean (31 characters, none of []:*?/\\), different from each other in any case, at least one sheet; a good list is kept as it is', () => {
    assert.deepStrictEqual(Sh.normalizeSheets(undefined), [{ name: 'Sheet1' }]);
    assert.deepStrictEqual(Sh.normalizeSheets([]), [{ name: 'Sheet1' }]);
    const good = [{ name: 'A' }, { name: 'B', visible: false }];
    const out = Sh.normalizeSheets(good);
    assert.strictEqual(out[0], good[0], 'the same object when nothing needed changing');
    assert.deepStrictEqual(Sh.normalizeSheets([{ name: 'Data' }, { name: 'data' }, { name: '' }, { name: 'x/y:z' }, 5, null]).map((s) => s.name), ['Data', 'data (2)', 'Sheet3', 'x_y_z']);
    assert.strictEqual(Sh.cleanName('a'.repeat(40)).length, 31);
    assert.strictEqual(Sh.cleanName("'quoted'"), 'quoted');
    assert.strictEqual(Sh.uniqueName('Sheet1', ['sheet1', 'Sheet1 (2)']), 'Sheet1 (3)');
});

ok('sheets: active sheet by name (any case), else the first one that is shown; the visible tabs; add, remove (never the last), move, duplicate, rename', () => {
    const list = [{ name: 'Hidden', visible: false }, { name: 'Main' }, { name: 'Other' }];
    assert.strictEqual(Sh.activeIndex(list, 'other'), 2);
    assert.strictEqual(Sh.activeIndex(list, 'nothing'), 1, 'the first one that is shown');
    assert.strictEqual(Sh.activeIndex(list, 'Hidden'), 0, 'a hidden sheet can still be the active one: a message asked for it');
    assert.deepStrictEqual(Sh.visibleIndexes(list), [1, 2]);
    assert.deepStrictEqual(Sh.addSheet(list).map((s) => s.name), ['Hidden', 'Main', 'Other', 'Sheet4']);
    assert.deepStrictEqual(Sh.addSheet(list, 0).map((s) => s.name), ['Hidden', 'Sheet4', 'Main', 'Other'], 'after a sheet');
    assert.deepStrictEqual(Sh.removeSheet(list, 1).map((s) => s.name), ['Hidden', 'Other']);
    assert.strictEqual(Sh.removeSheet([{ name: 'Only' }], 0).length, 1, 'the last sheet stays');
    assert.deepStrictEqual(Sh.moveSheet(list, 2, -1).map((s) => s.name), ['Hidden', 'Other', 'Main']);
    assert.strictEqual(Sh.moveSheet(list, 0, -1), list, 'cannot move past the end');
    const dup = Sh.duplicateSheet([{ name: 'A', cells: { A1: 1 } }], 0);
    assert.deepStrictEqual(dup.map((s) => s.name), ['A', 'A (2)']);
    dup[1].cells.A1 = 9;
    assert.strictEqual(dup[0].cells.A1, 1, 'a copy, not the same cells');
    const r = Sh.renameSheet(list, 1, 'Other');
    assert.strictEqual(r.name, 'Other (2)', 'a name another sheet has');
    assert.strictEqual(Sh.renameSheet(list, 1, '').name, 'Main', 'an empty name changes nothing');
});

ok('sheets: renameInFormula writes the new name where a formula read the old one (quotes when needed, any case), and leaves the rest', () => {
    assert.strictEqual(Fm.renameInFormula('=Data!A1+B1', 'data', 'Raw'), '=Raw!A1+B1');
    assert.strictEqual(Fm.renameInFormula('=Data!A1+B1', 'Data', 'My data'), "='My data'!A1+B1");
    assert.strictEqual(Fm.renameInFormula("=SUM('My data'!A1:A3)+Other!B1", 'my data', "It's"), "=SUM('It''s'!A1:A3)+Other!B1");
    assert.strictEqual(Fm.renameInFormula('=Data!A1', 'Data', 'A1'), "='A1'!A1", 'a name that looks like a cell is quoted');
    assert.strictEqual(Fm.renameInFormula('="Data!A1"&A1', 'Data', 'X'), '="Data!A1"&A1', 'a text is not a reference');
    assert.strictEqual(Fm.renameInFormula('plain', 'Data', 'X'), 'plain');
    assert.strictEqual(Fm.formulaProblem('=SUM(A1:A3)*2'), '');
    assert.strictEqual(Fm.formulaProblem('=FOO(A1)'), 'FOO');
    assert.strictEqual(Fm.formulaProblem('=Total*2'), 'a name');
    assert.strictEqual(Fm.formulaProblem('=1+'), 'a formula it cannot read');
});

ok('sheets: mergeContent puts the cells of an imported file in the sheets of the same name and leaves their types, styles and sizes; a new name is added; the others stay', () => {
    const mine = [{ name: 'Main', rows: 30, cells: { A1: 'old' }, cellRules: [{ range: 'A1', bold: true }], merges: ['A1:B1'], freezeRows: 1 }, { name: 'Keep', cells: { A1: 'k' } }];
    const file = [{ name: 'main', rows: 80, cols: 40, cells: { A1: 'new', B2: 5 }, cellRules: [{ range: 'B2', fill: 'red' }], merges: ['C1:D1'] }, { name: 'Extra', visible: false, rows: 50, cols: 10, cells: { A1: 'x' }, cellRules: [{ range: 'A1', bold: true }] }];
    const out = Sh.mergeContent(mine, file);
    assert.deepStrictEqual(out.map((s) => s.name), ['Main', 'Keep', 'Extra']);
    assert.deepStrictEqual(out[0].cells, { A1: 'new', B2: 5 }, 'the cells of the file');
    assert.deepStrictEqual(out[0].cellRules, [{ range: 'A1', bold: true }], 'its own styles, not the file\'s');
    assert.deepStrictEqual([out[0].merges, out[0].freezeRows], [['A1:B1'], 1], 'merges and freeze stay');
    assert.deepStrictEqual([out[0].rows, out[0].cols], [80, 40], 'as big as the content needs');
    assert.deepStrictEqual(out[1], mine[1], 'a sheet the file does not have is untouched');
    assert.deepStrictEqual(out[2], { name: 'Extra', rows: 50, cols: 10, cells: { A1: 'x' }, visible: false }, 'a new sheet: content, size, hidden; no styles');
    assert.deepStrictEqual(mine[0].cells, { A1: 'old' }, 'the input is not changed');
    assert.strictEqual(Sh.mergeContent([{ name: 'S', rows: 200 }], [{ name: 'S', rows: 80, cells: {} }])[0].rows, 200, 'never smaller');
});

// ---- reading Excel files ------------------------------------------------------------------------------------------------------------------------
const zlib = require('zlib');
const Xr = M['xlsx-read.js'], Xw = M['xlsx.js'];
const later = [];
function okLater(label, fn) { later.push([label, fn]); }

// a zip made here, to read it back: files = { name: text }, deflated or stored
function makeZip(files, deflate) {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    Object.keys(files).forEach((name) => {
        const raw = Buffer.from(enc.encode(files[name]));
        const body = deflate ? zlib.deflateRawSync(raw) : raw;
        const nm = Buffer.from(name), crc = zlib.crc32(raw);
        const head = Buffer.alloc(30);
        head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6); head.writeUInt16LE(deflate ? 8 : 0, 8);
        head.writeUInt32LE(crc >>> 0, 14); head.writeUInt32LE(body.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(nm.length, 26);
        parts.push(head, nm, body);
        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(deflate ? 8 : 0, 10);
        c.writeUInt32LE(crc >>> 0, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(offset, 42);
        central.push(c, nm);
        offset += head.length + nm.length + body.length;
    });
    const dir = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
    return new Uint8Array(Buffer.concat(parts.concat([dir, end])));
}
const asFiles = (list) => { const o = {}; list.forEach((f) => { o[f.name] = f.text; }); return o; };

ok('xlsx read: the XML reader: attributes, entities, CDATA, self-closing, prefixes, comments', () => {
    const root = Xr.parseXml('<?xml version="1.0"?><!-- c --><a:r xmlns:a="x" a:id="rId1" n=\'q&amp;r\'><t xml:space="preserve"> a &lt;b&gt; &#65;&#x42;</t><e/><![CDATA[<raw>]]></a:r>');
    const r = root.children[0];
    assert.strictEqual(r.name, 'r');
    assert.strictEqual(r.attrs.id, 'rId1', 'the prefix is dropped');
    assert.strictEqual(r.attrs.n, 'q&r');
    assert.strictEqual(r.children[0].text, ' a <b> AB');
    assert.strictEqual(r.children[1].name, 'e');
    assert.strictEqual(r.text, '<raw>');
});

ok('xlsx read: number formats mean decimals, a unit, a date, a time, text; percents and the rest are general', () => {
    assert.deepStrictEqual(Xr.formatFields('0.00'), { type: 'number', decimals: 2, suffix: '' });
    assert.deepStrictEqual(Xr.formatFields('#,##0'), { type: 'number', decimals: 0, suffix: '' });
    assert.deepStrictEqual(Xr.formatFields('0.0" °C"'), { type: 'number', decimals: 1, suffix: ' °C' });
    assert.deepStrictEqual(Xr.formatFields('0" kg"'), { type: 'number', decimals: 0, suffix: ' kg' });
    assert.deepStrictEqual(Xr.formatFields('yyyy-mm-dd'), { type: 'date', dateFormat: 'date' });
    assert.deepStrictEqual(Xr.formatFields('hh:mm:ss'), { type: 'date', dateFormat: 'time' });
    assert.deepStrictEqual(Xr.formatFields('yyyy-mm-dd hh:mm'), { type: 'date', dateFormat: '' });
    assert.deepStrictEqual(Xr.formatFields('@'), { type: 'text' });
    assert.deepStrictEqual(Xr.formatFields('0%'), {});
    assert.deepStrictEqual(Xr.formatFields('General'), {});
    assert.deepStrictEqual(Xr.formatFields('"Total: "0'), { type: 'number', decimals: 0, suffix: '' });
});

ok('xlsx read: boxesOf makes a few ranges of many cells, exactly covering them', () => {
    const keys = ['0,0', '0,1', '1,0', '1,1', '2,0', '0,3', '5,5'];
    const boxes = Xr.boxesOf(keys);
    assert.deepStrictEqual(boxes, [{ r1: 0, c1: 0, r2: 1, c2: 1 }, { r1: 0, c1: 3, r2: 0, c2: 3 }, { r1: 2, c1: 0, r2: 2, c2: 0 }, { r1: 5, c1: 5, r2: 5, c2: 5 }]);
    const covered = new Set();
    boxes.forEach((b) => { for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) covered.add(r + ',' + c); });
    assert.deepStrictEqual([...covered].sort(), keys.slice().sort(), 'the same cells, no more');
});

okLater('xlsx read: a zip, stored or deflated, is unpacked; a file that is not a zip is refused with a word', async () => {
    const files = { 'a.txt': 'hello', 'dir/b.xml': '<x>' + 'y'.repeat(5000) + '</x>' };
    for (const deflate of [false, true]) {
        const out = await Xr.unzip(makeZip(files, deflate));
        assert.strictEqual(new TextDecoder().decode(out.get('a.txt')), 'hello');
        assert.strictEqual(out.get('dir/b.xml').length, 5007);
    }
    await assert.rejects(() => Xr.readXlsx(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23])), /not an Excel file/);
    await assert.rejects(() => Xr.readXlsx(makeZip({ 'x.txt': 'no workbook' }, false)), /not an Excel workbook/);
});

okLater('xlsx read: what the grid writes it reads back: values, formulas, formats, styles, merges, sizes, freeze, borders, two sheets (one hidden)', async () => {
    const font = (o) => Object.assign({ b: false, i: false, u: false, s: false, sz: 0, color: null, name: '' }, o);
    const one = {
        name: 'Plant', defaultCol: 110, defaultRow: 28, freeze: { rows: 1, cols: 0 }, merges: [{ r1: 0, c1: 3, r2: 0, c2: 4 }], cols: { 0: 200 }, rows: { 2: 60 },
        cells: [
            { r: 0, c: 0, kind: 's', v: 'Machine', fmt: '', font: font({ b: true, color: 'FFFF0000' }), fill: 'FFD0E2FF', border: { b: { style: 'solid', width: 2, color: '#0f62fe' } }, align: { h: 'center', v: 'center', wrap: true } },
            { r: 1, c: 0, kind: 's', v: 'Mixer', fmt: '', font: font({}), fill: null, border: {}, align: {} },
            { r: 1, c: 1, kind: 'n', v: 71.456, fmt: '0.0" °C"', font: font({}), fill: null, border: {}, align: {} },
            { r: 2, c: 1, kind: 'n', v: 12, fmt: '', font: font({}), fill: null, border: {}, align: {} },
            { r: 3, c: 1, kind: 'n', v: 83.456, fmt: '', formula: '=B2+B3', font: font({}), fill: null, border: {}, align: {} },
            { r: 1, c: 2, kind: 'b', v: true, fmt: '', font: font({}), fill: null, border: {}, align: {} },
            { r: 1, c: 3, kind: 'n', v: 46023.5, fmt: 'yyyy-mm-dd', font: font({}), fill: null, border: {}, align: {} },
            { r: 4, c: 1, kind: 'e', v: '#DIV/0!', formula: '=1/0', fmt: '', font: font({}), fill: null, border: {}, align: {} }
        ]
    };
    const two = { name: 'Notes', hidden: true, cells: [{ r: 0, c: 0, kind: 's', v: 'see Plant', fmt: '', font: font({}), fill: null, border: {}, align: {} }], defaultCol: 110, defaultRow: 28 };
    const out = await Xr.readXlsx(makeZip(asFiles(Xw.buildXlsxFiles({ sheets: [one, two], active: 1 })), true));
    assert.deepStrictEqual(out.sheets.map((s) => s.name), ['Plant', 'Notes']);
    assert.strictEqual(out.active, 1);
    const p = out.sheets[0], n = out.sheets[1];
    assert.strictEqual(n.visible, false, 'the hidden sheet');
    assert.strictEqual(p.visible, undefined);
    assert.strictEqual(p.cells.A1, 'Machine');
    assert.strictEqual(p.cells.B3, 12);
    assert.strictEqual(p.cells.B4, '=B2+B3', 'a formula stays a formula');
    assert.strictEqual(p.cells.B5, '=1/0', 'a formula that gives an error is still the formula');
    assert.strictEqual(p.cells.C2, true);
    assert.strictEqual(p.cells.D2, '2026-01-01', 'a date-only format: the day, as text the date cell reads');
    const rule = (range) => p.cellRules.filter((r) => r.range === range);
    assert.ok(rule('A1').some((r) => r.bold === true && r.fill === '#d0e2ff' && r.color === '#ff0000' && r.align === 'center' && r.wrap === true), 'bold, colours, alignment, wrap: ' + JSON.stringify(p.cellRules));
    assert.ok(p.cellRules.some((r) => /B2/.test(r.range) && r.type === 'number' && r.decimals === 1 && r.suffix === ' °C'), 'number format: decimals and a unit');
    assert.ok(p.cellRules.some((r) => /D2/.test(r.range) && r.type === 'date' && r.dateFormat === 'date'), 'a date format');
    assert.ok(p.cellRules.some((r) => /C2/.test(r.range) && r.type === 'boolean'), 'a boolean cell');
    assert.deepStrictEqual(p.merges, ['D1:E1']);
    assert.strictEqual(p.freezeRows, 1);
    assert.ok(p.colRules.some((r) => r.columns === 'A' && r.width === 200), 'the width of A');
    assert.ok(p.rowRules.some((r) => r.rows === '3' && r.height === 60), 'the height of row 3');
    assert.ok(p.borders.some((b) => b.range === 'A1' && b.sides === 'bottom' && b.width === 2 && b.color === '#0f62fe'), 'the border: ' + JSON.stringify(p.borders));
    assert.deepStrictEqual(out.warnings, []);
    // and the grid takes it back as it is: the formulas work
    const cells = p.cells;
    const calc = C.createCalc((s, r, c) => { const v = cells[A.addressOf(r, c)]; return v === undefined ? null : v; });
    assert.strictEqual(calc.value(0, 3, 1), 83.456, 'B2+B3 worked out by the grid: 71.456 + 12');
});

okLater('xlsx read: a file as Excel writes it: shared strings, rich text, shared formulas, formulas the grid has not (the value stays), errors, booleans, an inline string, a hidden sheet, the open sheet', async () => {
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const files = {
        '[Content_Types].xml': head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
        'xl/workbook.xml': head + '<workbook ' + ns + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="1"/></bookViews><sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="Calc" sheetId="2" state="hidden" r:id="rId2"/></sheets><definedNames><definedName name="Total">Data!$A$1</definedName></definedNames></workbook>',
        'xl/_rels/workbook.xml.rels': head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x/worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
        'xl/sharedStrings.xml': head + '<sst ' + ns + ' count="3" uniqueCount="3"><si><t>Name</t></si><si><r><t>Rich </t></r><r><rPr><b/></rPr><t>text</t></r></si><si><t>Tom &amp; Jerry</t></si></sst>',
        'xl/styles.xml': head + '<styleSheet ' + ns + '><numFmts count="1"><numFmt numFmtId="164" formatCode="0.00&quot; kg&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF00AA00"/><name val="Consolas"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="164" fontId="1" fillId="2" borderId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>',
        'xl/worksheets/sheet1.xml': head + '<worksheet ' + ns + '><sheetFormatPr defaultRowHeight="15"/><sheetData>'
            + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="inlineStr"><is><t>inline</t></is></c></row>'
            + '<row r="2"><c r="A2"><v>5</v></c><c r="B2" s="1"><f t="shared" ref="B2:B4" si="0">A2*2</f><v>10</v></c><c r="C2" t="b"><v>1</v></c><c r="D2" s="2"><v>45000</v></c><c r="E2" t="e"><v>#N/A</v></c></row>'
            + '<row r="3"><c r="A3"><v>6</v></c><c r="B3" s="1"><f t="shared" si="0"/><v>12</v></c><c r="C3"><f>FOO(A3)</f><v>99</v></c><c r="D3"><f>SUMPRODUCT(A2:A3,A2:A3)</f><v>61</v></c></row>'
            + '<row r="4"><c r="A4"><v>7</v></c><c r="B4" s="1"><f t="shared" si="0"/><v>14</v></c><c r="C4"><f>Total*2</f><v>2</v></c></row>'
            + '</sheetData></worksheet>',
        'xl/worksheets/sheet2.xml': head + '<worksheet ' + ns + '><sheetData><row r="1"><c r="A1"><f>Data!A2+1</f><v>6</v></c></row></sheetData><drawing r:id="rId9" xmlns:r="x"/></worksheet>'
    };
    const out = await Xr.readXlsx(makeZip(files, true));
    const d = out.sheets[0];
    assert.strictEqual(d.cells.A1, 'Name');
    assert.strictEqual(d.cells.B1, 'Rich text', 'rich text is its runs together');
    assert.strictEqual(d.cells.C1, 'Tom & Jerry');
    assert.strictEqual(d.cells.D1, 'inline');
    assert.deepStrictEqual([d.cells.B2, d.cells.B3, d.cells.B4], ['=A2*2', '=A3*2', '=A4*2'], 'a shared formula is each cell\'s own, its references moved');
    assert.strictEqual(d.cells.C2, true);
    assert.ok(/^2023-03-15/.test(d.cells.D2), 'a serial under a date format is a date: ' + d.cells.D2);
    assert.strictEqual(d.cells.E2, '=#N/A');
    assert.strictEqual(d.cells.C3, 99, 'a function the grid has not: the value stays');
    assert.strictEqual(d.cells.D3, 61);
    assert.strictEqual(d.cells.C4, 2, 'a name from the workbook: the value stays');
    assert.ok(d.cellRules.some((r) => r.type === 'number' && r.decimals === 2 && r.suffix === ' kg' && r.bold === true && r.fill === '#ffff00' && r.fontFamily === 'mono' && r.fontSize === 19 && r.color === '#00aa00'), 'font, fill and number format of a style: ' + JSON.stringify(d.cellRules));
    assert.strictEqual(d.rowHeight, 20, 'Excel\'s 15 points');
    assert.strictEqual(d.colWidth, 64, 'and its default column');
    assert.strictEqual(out.sheets[1].visible, false);
    assert.strictEqual(out.sheets[1].cells.A1, '=Data!A2+1', 'a formula across sheets is kept');
    assert.strictEqual(out.active, 1);
    assert.ok(out.warnings.some((w) => /FOO/.test(w) && /SUMPRODUCT/.test(w)), 'the warnings name the functions: ' + JSON.stringify(out.warnings));
    assert.ok(out.warnings.some((w) => /named ranges/.test(w)));
    assert.ok(out.warnings.some((w) => /pictures/.test(w)), 'and what was not taken');
});

// the tests that wait for something (the inflating of a zip) run one after the other at the end
(async () => {
    for (const [label, fn] of later) { await fn(); passed++; console.log('✔ ' + label); }
    console.log('\n' + passed + ' passed');
})().catch((e) => { console.error(e); process.exit(1); });

