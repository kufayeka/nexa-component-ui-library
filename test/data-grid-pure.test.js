'use strict';

// The pure parts of the Data Grid (dist/data-grid/*.js): Excel addressing, cell types, populate, the sheet (values, rules, styles, view area),
// layout (merges, freeze, borders, locks), the virtual-scroll arithmetic, staged edits, selection, the Edit grid dialog's operations.
// No browser.   node test/data-grid-pure.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// The modules are plain ES modules. They are loaded without a bundler: each one in its own function scope, an `import { a } from "./x.js"`
// becoming a destructuring of what x.js exported (so the order below is the order of the imports).
const ORDER = ['address.js', 'sizes.js', 'cell-types.js', 'populate.js', 'sheet.js', 'clipboard.js', 'layout.js', 'window.js', 'stage.js', 'selection.js', 'design.js', 'fill.js', 'sort.js'];
const M = {};
ORDER.forEach((file) => {
    let src = fs.readFileSync(path.join(__dirname, '..', 'dist', 'data-grid', file), 'utf8');
    const names = [...src.matchAll(/^export (?:var|let|const|function|class) (\w+)/gm)].map((m) => m[1]);
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

const Cb = M['clipboard.js'], F = M['fill.js'], So = M['sort.js'];

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

console.log('\n' + passed + ' passed');
