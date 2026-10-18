'use strict';

// The Data Grid in a REAL browser (headless Chrome) through the Nexa SDK testkit: it draws the data it is given, draws only what is in
// view, edits and locks, staged edits, sorting / filtering, frozen panes, merges, borders, selection, the keyboard, the events and the
// actions Logic calls.   node test/data-grid-browser.test.js        (skipped when Chrome is not installed)

const assert = require('assert');
const path = require('path');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');

let passed = 0;
const onlyAt = process.argv.indexOf('--only'), only = onlyAt !== -1 ? new RegExp(process.argv[onlyAt + 1] || '.', 'i') : null;
async function ok(label, fn) { if (only && !only.test(label)) return; await fn(); passed++; console.log('✔ ' + label); }

const ID = 'data-grid';
const ROWS = [
    { id: 'a', name: 'Alpha', temp: 21.5, on: true, state: 'run', load: 40, link: 'https://example.com', locked: false },
    { id: 'b', name: 'Bravo', temp: 9, on: false, state: 'stop', load: 80, link: '', locked: true },
    { id: 'c', name: 'Charlie', temp: 100, on: true, state: 'run', load: 10, link: '', locked: false },
    { id: 'd', name: 'Delta', temp: null, on: false, state: 'fault', load: 0, link: '', locked: false }
];
const COLS = [
    { key: 'id', label: 'Id', width: 50, editable: false },
    { key: 'name', label: 'Name', width: 90 },
    { key: 'temp', label: 'Temp', type: 'number', decimals: 1, suffix: ' °C', width: 80 },
    { key: 'on', label: 'On', type: 'boolean', width: 50 },
    { key: 'state', label: 'State', type: 'badge', options: 'run:Running:green, stop:Stopped:gray, fault:Fault:red', width: 90 },
    { key: 'load', label: 'Load', type: 'progress', width: 90 },
    { key: 'link', label: 'Link', type: 'link', width: 120 },
    { key: 'go', label: 'Go', type: 'button', buttonLabel: 'Start', action: 'start', width: 80 }
];

withHarness({
    mounts: { '/nexa-component-ui-library/vendor': path.join(__dirname, '..', 'dist') },
    modules: ['/nexa-component-ui-library/vendor/ui-library.js']
}, async ({ js, send, logs }) => {
    const settle = () => js('NexaTest.settle()');
    const wait = (ms) => js(`new Promise(function (r) { setTimeout(r, ${ms}); })`);
    const root = (n) => `NexaTest.wc(${JSON.stringify(n)}).renderRoot`;
    const q = (n, sel) => `${root(n)}.querySelector(${JSON.stringify(sel)})`;
    const qa = (n, sel) => `Array.from(${root(n)}.querySelectorAll(${JSON.stringify(sel)}))`;
    const cell = (n, r, c) => q(n, `[data-r="${r}"][data-c="${c}"]`);
    const text = (n, r, c) => js(`(function () { var e = ${cell(n, r, c)}; return e ? e.textContent.trim() : null; })()`);
    const events = (n, name) => js(`NexaTest.item(${JSON.stringify(n)}).events.filter(function (e) { return e[0] === ${JSON.stringify(name)}; }).map(function (e) { return e[1]; })`);
    const mount = async (name, props, opts) => {
        await js(`NexaTest.mount(${JSON.stringify(name)}, "nexa-ui-${ID}", ${JSON.stringify(props || {})}, ${JSON.stringify(opts || { width: 700, height: 300 })})`);
        await settle(); await wait(60);
    };
    const setData = async (rows) => { await js(`NexaTest.setVariable("rows", ${JSON.stringify(rows)})`); await settle(); await wait(80); };
    const clickAt = async (sel, count) => {
        // the components mounted before this one are still on the page: bring this grid (not the cell: that would scroll its own cells) to the middle
        const r = await js(`(function () { var e = ${sel}; var host = e.getRootNode().host; if (host) host.scrollIntoView({ block: "center" }); var b = e.getBoundingClientRect(); return { x: b.left + Math.min(b.width / 2, 40), y: b.top + b.height / 2 }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
        for (let i = 1; i <= (count || 1); i++) {
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: i });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: i });
        }
        await settle(); await wait(40);
    };
    const press = async (k, mods) => {
        const code = { Enter: 13, Tab: 9, Escape: 27, ArrowDown: 40, ArrowUp: 38, ArrowRight: 39, ArrowLeft: 37, F2: 113 }[k];
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, windowsVirtualKeyCode: code, modifiers: mods || 0 });
        if (k === 'Enter') await send('Input.dispatchKeyEvent', { type: 'char', text: '\r', key: 'Enter' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, windowsVirtualKeyCode: code });
        await settle(); await wait(40);
    };
    const typeText = async (s) => { for (const ch of s) { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); } await settle(); };
    const base = { columns: COLS, rowKey: 'id', inputData: '{rows}' };

    await ok('it registers in its own category, and mounts in the editor with sample data and a chip that says so', async () => {
        const d = await js('(function () { var d = NEXA.getComponent("nexa-ui-data-grid"); return d ? d.category : null; })()');
        assert.strictEqual(d, 'UI · Data');
        await js(`NexaTest.mount("ed", "nexa-ui-${ID}", {}, { width: 640, height: 300, design: true })`); await settle(); await wait(60);
        assert.ok((await js(q('ed', '.sample-badge') + ' ? 1 : 0')) === 1, 'the chip');
        assert.ok((await js(qa('ed', '[data-r][data-c]') + '.length')) > 10, 'sample cells are drawn');
        assert.ok((await js(qa('ed', '.head') + '.length')) >= 5, 'columns derived from the sample');
        assert.deepStrictEqual(await events('ed', 'cellChange'), [], 'a design canvas fires nothing');
    });

    await ok('on a page with no data it is empty (the empty text), no sample rows, no chip', async () => {
        await mount('empty', { emptyText: 'Nothing here' });
        assert.strictEqual(await js(qa('empty', '[data-r][data-c]') + '.length'), 0);
        assert.strictEqual(await js(q('empty', '.sample-badge') + ' ? 1 : 0'), 0);
        assert.ok((await js(q('empty', '.empty') + '.textContent')).includes('Nothing here'));
    });

    await ok('it draws the data of the Data input with every cell type, the header, and formats', async () => {
        await mount('g1', base);
        await setData(ROWS);
        assert.deepStrictEqual(await js(qa('g1', '.head .hl .t') + '.map(function (e) { return e.textContent; })'), ['Id', 'Name', 'Temp', 'On', 'State', 'Load', 'Link', 'Go']);
        assert.strictEqual(await text('g1', 0, 1), 'Alpha');
        assert.strictEqual(await text('g1', 0, 2), '21.5 °C', 'a number with its decimals and suffix');
        assert.strictEqual(await text('g1', 3, 2), '', 'a null shows nothing');
        assert.strictEqual(await text('g1', 0, 4), 'Running', 'a badge shows its label');
        assert.ok((await js(q('g1', '[data-r="0"][data-c="4"] .badge') + '.getAttribute("style")')).includes('--nexa-colors-green-subtle'), 'in its palette');
        assert.ok(await js(q('g1', '[data-r="0"][data-c="3"] .cb.on') + ' ? true : false'), 'a checkbox: on');
        assert.ok(await js(q('g1', '[data-r="1"][data-c="3"] .cb') + ' && !' + q('g1', '[data-r="1"][data-c="3"] .cb.on') + ' ? true : false'), 'a checkbox: off');
        assert.strictEqual(await js(q('g1', '[data-r="1"][data-c="5"] .bar > i') + '.style.width'), '80%', 'a progress bar');
        const a = await js(q('g1', '[data-r="0"][data-c="6"] a') + '.getAttribute("href") + "|" + ' + q('g1', '[data-r="0"][data-c="6"] a') + '.rel');
        assert.strictEqual(a, 'https://example.com|noopener noreferrer', 'a link');
        assert.strictEqual(await text('g1', 0, 7), 'Start', 'a button');
        assert.ok((await js(cell('g1', 0, 2) + '.className')).includes('right'), 'a number is right-aligned');
    });

    await ok('virtual scrolling: 50 000 rows draw a screenful of cells, the scroll height is the whole, and scrolling to the end draws the last rows', async () => {
        const big = [];
        for (let i = 0; i < 50000; i++) big.push({ id: 'r' + i, name: 'Row ' + i, temp: i % 100, on: i % 2 === 0, state: 'run', load: i % 100, link: '', locked: false });
        await mount('big', base, { width: 640, height: 300 });
        const t0 = Date.now();
        await setData(big);
        await wait(120);
        const cells = await js(qa('big', '[data-r][data-c]') + '.length');
        assert.ok(cells > 0 && cells < 400, 'cells in the DOM: ' + cells);
        assert.strictEqual(await js(q('big', '.sizer') + '.offsetHeight'), 50000 * 36, 'the scroll height is all the rows');
        assert.ok(Date.now() - t0 < 5000, 'drawn in ' + (Date.now() - t0) + ' ms');
        await js(`(function () { var s = ${q('big', '[data-scroller]')}; s.scrollTop = s.scrollHeight; })()`); await wait(150); await settle();
        assert.strictEqual(await text('big', 49999, 1), 'Row 49999', 'the last row is drawn');
        assert.strictEqual(await js(q('big', '[data-r="0"]') + ' ? 1 : 0'), 0, 'the first rows are not');
        assert.ok((await js(qa('big', '[data-r][data-c]') + '.length')) < 400, 'still a screenful');
        await js(`(function () { var s = ${q('big', '[data-scroller]')}; s.scrollTop = 36 * 20000; s.scrollLeft = 0; })()`); await wait(150);
        assert.strictEqual(await text('big', 20000, 0), 'r20000', 'the middle');
        await js('NexaTest.setVariable("rows", [])'); await settle();
    });

    await ok('actions: patch one row, upsert by key, remove, append, clear, set a cell, get data; the page keeps the rest', async () => {
        await mount('act', base);
        await setData(ROWS);
        await js('NexaTest.invoke("act", "patchRow", { id: "a", temp: 70, name: "Alpha 2" })'); await settle();
        assert.strictEqual(await text('act', 0, 2), '70.0 °C');
        assert.strictEqual(await text('act', 0, 1), 'Alpha 2');
        assert.strictEqual(await text('act', 1, 1), 'Bravo', 'the others stay');
        await js('NexaTest.invoke("act", "patchRow", { key: "b", fields: { temp: 5 } })'); await settle();
        assert.strictEqual(await text('act', 1, 2), '5.0 °C');
        await js('NexaTest.invoke("act", "upsertRows", [{ id: "c", name: "Charlie 2" }, { id: "e", name: "Echo", temp: 1 }])'); await settle();
        assert.strictEqual(await text('act', 2, 1), 'Charlie 2');
        assert.strictEqual(await text('act', 4, 1), 'Echo', 'a new key is added at the end');
        await js('NexaTest.invoke("act", "removeRow", "a")'); await settle();
        assert.strictEqual(await text('act', 0, 1), 'Bravo');
        await js('NexaTest.invoke("act", "appendRow", { id: "z", name: "Zulu" })'); await settle();
        assert.strictEqual(await text('act', 4, 1), 'Zulu');
        await js('NexaTest.invoke("act", "setCell", { key: "z", col: "name", value: "Zulu 2" })'); await settle();
        assert.strictEqual(await text('act', 4, 1), 'Zulu 2');
        await js('NexaTest.invoke("act", "getData")'); await settle();
        const got = await events('act', 'data');
        assert.strictEqual(got[0].count, 5);
        assert.strictEqual(got[0].rows[0].name, 'Bravo');
        await js('NexaTest.invoke("act", "clear")'); await settle();
        assert.strictEqual(await js(qa('act', '[data-r][data-c]') + '.length'), 0);
    });

    await ok('read-only (the default): nothing can be edited; a button and a link still work; the Mode can be bound', async () => {
        await mount('ro', base);
        await setData(ROWS);
        await clickAt(cell('ro', 0, 1), 2);
        assert.strictEqual(await js(q('ro', '[data-edit]') + ' ? 1 : 0'), 0, 'no edit box');
        await clickAt(cell('ro', 0, 3));
        assert.deepStrictEqual(await events('ro', 'cellChange'), [], 'a checkbox does not toggle');
        await clickAt(q('ro', '[data-r="0"][data-c="7"] .btn'));
        const b = await events('ro', 'buttonClick');
        assert.deepStrictEqual([b[0].rowKey, b[0].action, b[0].col], ['a', 'start', 'go'], 'a button acts also in a read-only grid');
        assert.strictEqual(b[0].row.name, 'Alpha');
    });

    await ok('editable: double-click edits, Enter commits and moves down, Escape cancels; the events carry what changed; a number is coerced', async () => {
        await mount('ed1', Object.assign({ mode: 'editable' }, base));
        await setData(ROWS);
        await clickAt(cell('ed1', 0, 1), 2);
        assert.strictEqual(await js(q('ed1', '[data-edit]') + ' ? 1 : 0'), 1, 'the edit box is open');
        assert.strictEqual(await js(q('ed1', '[data-edit]') + '.value'), 'Alpha');
        await typeText('X'); await press('Enter');
        assert.strictEqual(await text('ed1', 0, 1), 'AlphaX');
        const ch = await events('ed1', 'cellChange');
        assert.deepStrictEqual([ch[0].rowKey, ch[0].col, ch[0].old, ch[0].new, ch[0].staged], ['a', 'name', 'Alpha', 'AlphaX', false]);
        assert.strictEqual(ch[0].row.name, 'AlphaX');
        const rc = await events('ed1', 'rowChange');
        assert.deepStrictEqual(rc[0].changed, { name: 'AlphaX' });
        // Escape cancels
        await clickAt(cell('ed1', 1, 1), 2); await typeText('Q'); await press('Escape');
        assert.strictEqual(await text('ed1', 1, 1), 'Bravo');
        assert.strictEqual((await events('ed1', 'cellChange')).length, 1);
        // a number: typed text becomes a number; text in a number column is kept as typed (no validation)
        await clickAt(cell('ed1', 2, 2), 2);
        await js(`(function () { var i = ${q('ed1', '[data-edit]')}; i.value = "12,5"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
        await press('Enter');
        assert.strictEqual(await text('ed1', 2, 2), '12.5 °C');
        assert.strictEqual((await events('ed1', 'cellChange')).pop().new, 12.5);
        await clickAt(cell('ed1', 2, 2), 2);
        await js(`(function () { var i = ${q('ed1', '[data-edit]')}; i.value = "abc"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
        await press('Enter');
        assert.strictEqual((await events('ed1', 'cellChange')).pop().new, 'abc', 'accepted as typed');
        // a checkbox toggles with a click
        await clickAt(q('ed1', '[data-r="1"][data-c="3"] .cb'));
        assert.strictEqual((await events('ed1', 'cellChange')).pop().new, true);
        assert.ok(await js(q('ed1', '[data-r="1"][data-c="3"] .cb.on') + ' ? true : false'));
        // the keyboard: F2 edits, typing a character starts an edit with it
        await clickAt(cell('ed1', 3, 1)); await press('F2');
        assert.strictEqual(await js(q('ed1', '[data-edit]') + ' ? 1 : 0'), 1, 'F2 opens the edit box');
        await press('Escape');
    });

    await ok('locks: a column, a row (lock field), a range rule that opens one cell, a read-only grid wins over all', async () => {
        const cols = COLS.map((c) => (c.key === 'temp' ? Object.assign({}, c, { editable: false }) : c));
        await mount('lk', { columns: cols, rowKey: 'id', inputData: '{rows}', mode: 'editable', lockField: 'locked', locks: [{ r1: 2, c1: 2, r2: 2, c2: 2, locked: false }, { r1: 0, c1: 1, r2: 0, c2: 1, locked: true }] });
        await setData(ROWS);
        const editable = async (r, c) => { await clickAt(cell('lk', r, c), 2); const open = await js(q('lk', '[data-edit]') + ' ? 1 : 0'); if (open) await press('Escape'); return !!open; };
        assert.strictEqual(await editable(2, 1), true, 'an ordinary cell');
        assert.strictEqual(await editable(1, 1), false, 'a locked row (Bravo)');
        assert.strictEqual(await editable(3, 2), false, 'a locked column (Temp)');
        assert.strictEqual(await editable(2, 2), true, 'a range rule opens one cell of a locked column');
        assert.strictEqual(await editable(0, 1), false, 'a range rule locks one cell');
        assert.strictEqual(await editable(0, 0), false, 'the Id column is not editable');
        await js('NexaTest.setProps("lk", { mode: "readonly" })'); await settle();
        assert.strictEqual(await editable(2, 2), false, 'read-only: even the open cell');
    });

    await ok('staged edits: a change waits (marked), Save sends only the changed rows and makes it final, Discard throws it away', async () => {
        await mount('stg', Object.assign({ mode: 'editable', editMode: 'staged' }, base));
        await setData(ROWS);
        await clickAt(cell('stg', 0, 1), 2); await typeText('!'); await press('Enter');
        await clickAt(cell('stg', 2, 1), 2); await typeText('?'); await press('Enter');
        assert.strictEqual(await text('stg', 0, 1), 'Alpha!');
        assert.ok((await js(cell('stg', 0, 1) + '.className')).includes('dirty'), 'marked');
        assert.deepStrictEqual(await events('stg', 'rowChange'), [], 'no row change before Save');
        assert.strictEqual((await events('stg', 'cellChange')).length, 2);
        assert.ok((await js(q('stg', '.staged') + '.textContent')).includes('2 unsaved'));
        await clickAt(q('stg', '[data-staged="save"]'));
        const s = await events('stg', 'save');
        assert.strictEqual(s.length, 1);
        assert.deepStrictEqual(s[0].rows.map((r) => [r.rowKey, JSON.stringify(r.changed)]), [['a', '{"name":"Alpha!"}'], ['c', '{"name":"Charlie?"}']]);
        assert.strictEqual(await text('stg', 0, 1), 'Alpha!');
        assert.ok(!(await js(cell('stg', 0, 1) + '.className')).includes('dirty'));
        await clickAt(cell('stg', 1, 1), 2); await typeText('#'); await press('Enter');
        await clickAt(q('stg', '[data-staged="discard"]'));
        assert.strictEqual(await text('stg', 1, 1), 'Bravo', 'discarded');
        assert.strictEqual((await events('stg', 'discard'))[0].count, 1);
    });

    await ok('sorting: a click on a title sorts asc, desc, none; numbers by size, empty last; the sort event; filtering with text and with a comparison', async () => {
        await mount('srt', Object.assign({ filterable: true }, base));
        await setData(ROWS);
        const names = () => js(qa('srt', '[data-r][data-c="1"]') + '.sort(function (a, b) { return a.dataset.r - b.dataset.r; }).map(function (e) { return e.textContent.trim(); })');
        await clickAt(q('srt', '[data-hc="2"] .hl'));
        assert.deepStrictEqual(await names(), ['Bravo', 'Alpha', 'Charlie', 'Delta'], 'asc by temperature: 9, 21.5, 100, empty last');
        await clickAt(q('srt', '[data-hc="2"] .hl'));
        assert.deepStrictEqual(await names(), ['Charlie', 'Alpha', 'Bravo', 'Delta'], 'desc: the empty one is still last');
        await clickAt(q('srt', '[data-hc="2"] .hl'));
        assert.deepStrictEqual(await names(), ['Alpha', 'Bravo', 'Charlie', 'Delta'], 'none: the data order');
        assert.strictEqual((await events('srt', 'sortChange')).length, 3);
        await js(`(function () { var i = ${q('srt', '[data-filter="name"]')}; i.value = "ha"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`); await settle(); await wait(60);
        assert.deepStrictEqual(await names(), ['Alpha', 'Charlie']);
        await js(`(function () { var i = ${q('srt', '[data-filter="name"]')}; i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); var t = ${q('srt', '[data-filter="temp"]')}; t.value = "> 10"; t.dispatchEvent(new Event("input", { bubbles: true })); })()`); await settle(); await wait(60);
        assert.deepStrictEqual(await names(), ['Alpha', 'Charlie'], 'a comparison on a number column');
        assert.strictEqual((await events('srt', 'filterChange')).length, 3);
    });

    await ok('merged cells: one box over its range, the cells under it are not drawn; sorting and filtering switch off', async () => {
        await mount('mg', Object.assign({ merges: [{ r1: 0, c1: 1, r2: 1, c2: 2 }], filterable: true, sortable: true }, base));
        await setData(ROWS);
        const box = await js(`(function () { var e = ${cell('mg', 0, 1)}; return { w: e.offsetWidth, h: e.offsetHeight }; })()`);
        assert.deepStrictEqual(box, { w: 170, h: 72 }, 'Name + Temp wide, two rows tall');
        assert.strictEqual(await js(q('mg', '[data-r="0"][data-c="2"]') + ' ? 1 : 0'), 0, 'covered');
        assert.strictEqual(await js(q('mg', '[data-r="1"][data-c="1"]') + ' ? 1 : 0'), 0, 'covered');
        assert.strictEqual(await js(q('mg', '.flt') + ' ? 1 : 0'), 0, 'no filter boxes while a body merge pins the rows');
        assert.strictEqual(await js(q('mg', '.head.sortable') + ' ? 1 : 0'), 0, 'no sorting');
        // a merge that is not valid (overlapping, a single cell, crossing the frozen line) is not drawn
        await js('NexaTest.setProps("mg", { merges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }], freezeRows: 1 })'); await settle();
        assert.strictEqual(await js(qa('mg', '[data-r="0"]') + '.length'), 8, 'a one-cell merge changes nothing');
    });

    await ok('frozen rows and columns stay while the rest scrolls', async () => {
        const big = [];
        for (let i = 0; i < 200; i++) big.push({ id: 'r' + i, name: 'Row ' + i, temp: i, on: true, state: 'run', load: i % 100, link: '', locked: false });
        await mount('fz', Object.assign({ freezeRows: 2, freezeCols: 2, showRowNumbers: true }, base), { width: 420, height: 260 });
        await setData(big);
        const pos = (r, c) => js(`(function () { var e = ${cell('fz', r, c)}; if (!e) return null; var b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top) }; })()`);
        const before = { frozen: await pos(0, 0), frozenCol: await pos(10, 0), frozenRow: await pos(0, 4), scrolling: await pos(5, 4) };
        await js(`(function () { var s = ${q('fz', '[data-scroller]')}; s.scrollTop = 180; s.scrollLeft = 150; })()`); await wait(150); await settle();
        const frozenAfter = await pos(0, 0);
        assert.deepStrictEqual(frozenAfter, before.frozen, 'a frozen row and column: the corner cell did not move');
        const colRow = await js(`(function () { var e = ${q('fz', '[data-pane="bl"]')}; return e.style.transform; })()`);
        assert.ok(/translateY\(-180px\)/.test(colRow), 'the frozen columns follow the vertical scroll: ' + colRow);
        const topRow = await js(`(function () { var e = ${q('fz', '[data-pane="tr"]')}; return e.style.transform; })()`);
        assert.ok(/translateX\(-150px\)/.test(topRow), 'the frozen rows follow the horizontal scroll: ' + topRow);
        assert.strictEqual(await text('fz', 0, 1), 'Row 0', 'a frozen row is still drawn after the scroll');
        assert.strictEqual(await js(q('fz', '[data-r="100"][data-rn]') + ' ? 1 : 0'), 0, 'row 100 is far out of view');
        assert.strictEqual(await js(q('fz', '[data-r="9"][data-rn]') + ' ? 1 : 0'), 1, 'row 9 is the one scrolled into view');
        assert.strictEqual(await js(q('fz', '[data-r="0"][data-rn]') + '.textContent'), '1', 'row numbers in the frozen corner');
        assert.ok(before.frozen && before.frozenRow && before.scrolling, 'the cells of every pane were drawn before the scroll');
    });

    await ok('borders: a rule draws its lines (above / left of the box, the colour and style of the rule, a later rule on top)', async () => {
        await mount('bd', Object.assign({ borders: [{ r1: 1, c1: 1, r2: 2, c2: 2, sides: 'outer', width: 2, color: '#ff0000' }, { r1: 1, c1: 1, r2: 1, c2: 1, sides: ['top'], style: 'dashed', width: 3, color: 'primary' }] }, base));
        await setData(ROWS);
        const b = (r, c) => js(`(function () { var s = getComputedStyle(${cell('bd', r, c)}); return { top: s.borderTopStyle + " " + s.borderTopWidth, left: s.borderLeftStyle + " " + s.borderLeftWidth + " " + s.borderLeftColor }; })()`);
        const tl = await b(1, 1);
        assert.strictEqual(tl.top, 'dashed 3px', 'the later rule is on top of the shared edge');
        assert.strictEqual(tl.left, 'solid 2px rgb(255, 0, 0)');
        const under = await b(3, 1);
        assert.ok(under.top.startsWith('solid 2px'), 'the line under the range is the top of the next row: ' + under.top);
    });

    await ok('selection: click selects a cell (and tells Logic), arrows move it, shift-drag / shift-arrow extends a range, row mode selects the row; "none" selects nothing', async () => {
        await mount('sl', Object.assign({ selection: 'range' }, base));
        await setData(ROWS);
        await clickAt(cell('sl', 1, 1));
        assert.ok((await js(cell('sl', 1, 1) + '.className')).includes('focus'));
        let ev = await events('sl', 'selectionChange');
        assert.deepStrictEqual([ev[0].cell.rowKey, ev[0].cell.col], ['b', 'name']);
        await js(`${q('sl', '.grid')}.focus()`); await press('ArrowDown'); await press('ArrowRight');
        assert.ok((await js(cell('sl', 2, 2) + '.className')).includes('focus'), 'the arrows moved the focus');
        await press('ArrowDown', 8);   // shift
        ev = await events('sl', 'selectionChange');
        assert.deepStrictEqual(ev.pop().range, { r1: 2, c1: 2, r2: 3, c2: 2 }, 'shift extends');
        assert.ok((await js(cell('sl', 3, 2) + '.className')).includes('sel'));
        await mount('slr', Object.assign({ selection: 'row' }, base));
        await setData(ROWS);
        await clickAt(cell('slr', 2, 1));
        const r = (await events('slr', 'selectionChange')).pop();
        assert.deepStrictEqual(r.rowKeys, ['c']);
        assert.strictEqual(r.rows[0].name, 'Charlie');
        assert.ok((await js(cell('slr', 2, 5) + '.className')).includes('sel'), 'the whole row is selected');
        await mount('sln', Object.assign({ selection: 'none' }, base));
        await setData(ROWS);
        await clickAt(cell('sln', 1, 1));
        assert.deepStrictEqual(await events('sln', 'selectionChange'), []);
        assert.ok(!(await js(cell('sln', 1, 1) + '.className')).includes('focus'));
    });

    await ok('events of a click: cellClick and rowClick carry the key, the column and the row', async () => {
        await mount('clk', base);
        await setData(ROWS);
        await clickAt(cell('clk', 2, 1));
        const c = (await events('clk', 'cellClick')).pop(), r = (await events('clk', 'rowClick')).pop();
        assert.deepStrictEqual([c.rowKey, c.col, c.value, c.row.temp], ['c', 'name', 'Charlie', 100]);
        assert.strictEqual(r.rowKey, 'c');
    });

    await ok('data as an array of arrays (first row = names) and columns derived from the data; a Columns input overrides the list', async () => {
        await mount('arr', { inputData: '{rows}' });
        await setData([['name', 'qty'], ['A', 1], ['B', 2]]);
        assert.deepStrictEqual(await js(qa('arr', '.head .hl .t') + '.map(function (e) { return e.textContent; })'), ['Name', 'Qty']);
        assert.strictEqual(await text('arr', 1, 1), '2');
        await js('NexaTest.setVariable("cols", [{ key: "name", label: "Who" }])'); await settle();
        await js('NexaTest.setProps("arr", { inputColumns: "{cols}" })'); await settle(); await wait(60);
        assert.deepStrictEqual(await js(qa('arr', '.head .hl .t') + '.map(function (e) { return e.textContent; })'), ['Who']);
    });

    await ok('the inspector: the groups, the Columns list (each column its fields, the format ones only for their type), every setting there', async () => {
        const r = await js(`(async function () {
            var t = NexaTest.inspector("nexa-ui-${ID}", { columns: ${JSON.stringify(COLS)} });
            await new Promise(function (r) { setTimeout(r, 250); });
            await t.field("columns#2.decimals");
            var rows = NexaTest.rows(t.box);
            var labels = rows.map(function (x) { return x.label; });
            var ids = rows.map(function (x) { return x.id; });
            t.destroy();
            return { labels: labels, ids: ids };
        })()`);
        for (const l of ['Columns', 'Row key (field)', 'Mode', 'Edits', 'Locked-row field', 'Frozen rows', 'Frozen columns', 'Row height', 'Show row numbers', 'Selection', 'Filtering (a box under each title)', 'Text when there is no data']) assert.ok(r.labels.includes(l), 'inspector: ' + l + ' in ' + r.labels.join(' | '));
        assert.ok(r.ids.some((id) => /^columns#2/.test(id)), 'a column is a row of the list');
    });

    await ok('light and dark: the grid reads the theme (no fixed colours), and a screenshot of it', async () => {
        await mount('look', Object.assign({ mode: 'editable', freezeRows: 1, showRowNumbers: true, selection: 'range', borders: [{ r1: 0, c1: 0, r2: 3, c2: 3, sides: 'outer', color: 'primary', width: 2 }], merges: [{ r1: 2, c1: 4, r2: 3, c2: 5 }] }, base), { width: 760, height: 260 });
        await setData(ROWS);
        await clickAt(cell('look', 1, 1));
        const light = await js(`getComputedStyle(${q('look', '.grid')}).backgroundColor`);
        await js('NexaTest.setMode("dark"); document.body.style.background = "#161616"; NexaTest.wc("look").scrollIntoView({ block: "center" }); 1'); await settle(); await wait(200);
        const dark = await js(`getComputedStyle(${q('look', '.grid')}).backgroundColor`);
        assert.notStrictEqual(light, dark, 'the background follows the mode: ' + light + ' / ' + dark);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        require('fs').writeFileSync(path.join(require('os').tmpdir(), 'data-grid-dark.png'), Buffer.from(shot.result.data, 'base64'));
        await js('NexaTest.setMode("light"); document.body.style.background = "#ffffff"; 1'); await settle(); await wait(200);
        const shot2 = await send('Page.captureScreenshot', { format: 'png' });
        require('fs').writeFileSync(path.join(require('os').tmpdir(), 'data-grid-light.png'), Buffer.from(shot2.result.data, 'base64'));
    });

    await ok('no JavaScript errors in the page', async () => {
        const errs = logs.filter((l) => /error|exception|uncaught/i.test(l) && !/favicon|net::ERR/i.test(l));
        assert.deepStrictEqual(errs.slice(0, 5), []);
    });

    console.log('\n' + passed + ' passed');
}).then((r) => { if (r === null) console.log('SKIP: no Chrome'); }).catch((e) => { console.error(e); process.exit(1); });
