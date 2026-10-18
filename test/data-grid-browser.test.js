'use strict';

// The Data Grid (a sheet like Excel) in a REAL browser (headless Chrome) through the Nexa SDK testkit: addressing and headers, 1000 rows x 702 columns with
// only the cells in view drawn, typed cells and styles per range, populate from messages (down / to the right), typing in the cells, locks, staged edits,
// frozen panes, merges, borders, the area shown, selection and the keyboard, the events and the actions Logic calls.
//   node test/data-grid-browser.test.js        (skipped when Chrome is not installed)

const assert = require('assert');
const path = require('path');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');

let passed = 0;
const onlyAt = process.argv.indexOf('--only'), only = onlyAt !== -1 ? new RegExp(process.argv[onlyAt + 1] || '.', 'i') : null;
async function ok(label, fn) { if (only && !only.test(label)) return; await fn(); passed++; console.log('✔ ' + label); }

const ID = 'data-grid';
const bind = (ref) => ({ $bind: [{ src: 'msg', ref }] });     // a populate rule's value from the message

withHarness({
    mounts: { '/nexa-component-ui-library/vendor': path.join(__dirname, '..', 'dist') },
    modules: ['/nexa-component-ui-library/vendor/ui-library.js'],
    width: 1400, height: 900
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
    const message = async (n, msg) => { await js(`NexaTest.setMessage(${JSON.stringify(n)}, ${JSON.stringify(msg)})`); await settle(); await wait(80); };
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
        const code = { Enter: 13, Tab: 9, Escape: 27, ArrowDown: 40, ArrowUp: 38, ArrowRight: 39, ArrowLeft: 37, F2: 113, Delete: 46 }[k];
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, windowsVirtualKeyCode: code, modifiers: mods || 0 });
        if (k === 'Enter') await send('Input.dispatchKeyEvent', { type: 'char', text: '\r', key: 'Enter' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, windowsVirtualKeyCode: code });
        await settle(); await wait(40);
    };
    const typeText = async (s) => { for (const ch of s) { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); } await settle(); };
    const heads = (n) => js(qa(n, '.head[data-hc]') + '.map(function (e) { return e.textContent; })');
    const rowHeads = (n) => js(qa(n, '.head[data-hr]') + '.map(function (e) { return e.textContent; })');

    await ok('it registers in its own category; a new sheet is blank, with the column letters and the row numbers, and no sample data', async () => {
        const d = await js('(function () { var d = NEXA.getComponent("nexa-ui-data-grid"); return d ? d.category : null; })()');
        assert.strictEqual(d, 'UI · Data');
        await js(`NexaTest.mount("ed", "nexa-ui-${ID}", {}, { width: 700, height: 300, design: true })`); await settle(); await wait(60);
        const h = await heads('ed');
        assert.deepStrictEqual(h.slice(0, 5), ['A', 'B', 'C', 'D', 'E']);
        assert.deepStrictEqual((await rowHeads('ed')).slice(0, 3), ['1', '2', '3']);
        assert.strictEqual(await js(qa('ed', '.cell .t') + '.filter(function (e) { return e.textContent.trim() !== ""; }).length'), 0, 'every cell is empty');
        assert.strictEqual(await js(q('ed', '.sample-badge') + ' ? 1 : 0'), 0, 'no sample data any more');
        assert.deepStrictEqual(await events('ed', 'cellChange'), [], 'a design canvas fires nothing');
    });

    await ok('1000 rows x 702 columns: a screenful of cells is drawn; the scroll size is the whole sheet; the last row and the column ZZ are reached', async () => {
        await mount('big', { rows: 1000, cols: 702, colWidth: 100, rowHeight: 28 }, { width: 700, height: 300 });
        const cells = await js(qa('big', '[data-r][data-c]') + '.length');
        assert.ok(cells > 0 && cells < 400, 'cells in the DOM: ' + cells);
        assert.strictEqual(await js(q('big', '.sizer') + '.offsetHeight'), 1000 * 28, 'all the rows');
        assert.strictEqual(await js(q('big', '[data-hr="999"]') + ' ? 1 : 0'), 0, 'row 1000 is not drawn before it is scrolled to');
        await js(`(function () { var s = ${q('big', '[data-scroller]')}; s.scrollTop = s.scrollHeight; s.scrollLeft = s.scrollWidth; })()`); await wait(200); await settle();
        assert.strictEqual(await js(q('big', '[data-hr="999"]') + ' ? 1 : 0'), 1, 'the last row is drawn');
        assert.strictEqual(await js(q('big', '[data-hr="999"]') + '.textContent'), '1000');
        assert.strictEqual(await js(q('big', '[data-hc="701"]') + '.textContent'), 'ZZ', 'the last column');
        assert.ok((await js(qa('big', '[data-r][data-c]') + '.length')) < 400, 'still a screenful');
        assert.strictEqual(await js(q('big', '[data-hc="0"]') + ' ? 1 : 0'), 0, 'A is far to the left now');
    });

    await ok('typed cells show; a number, a checkbox, a badge, a bar, a link and a button by the rules of their range', async () => {
        await mount('ty', {
            cells: { A1: 'Hello', B1: 21.456, C1: true, D1: 'run', E1: 40, F1: 'https://example.com', G1: 'x', B2: 'abc' },
            cellRules: [
                { range: 'B1:B2', type: 'number', decimals: 1, suffix: ' °C' },
                { range: 'C1', type: 'boolean' },
                { range: 'D1', type: 'badge', options: 'run:Running:green, stop:Stopped:gray' },
                { range: 'E1', type: 'progress' },
                { range: 'F1', type: 'link' },
                { range: 'G1', type: 'button', buttonLabel: 'Start', action: 'go' }
            ]
        });
        assert.strictEqual(await text('ty', 0, 0), 'Hello');
        assert.strictEqual(await text('ty', 0, 1), '21.5 °C');
        assert.strictEqual(await text('ty', 1, 1), 'abc', 'text in a number cell is shown as typed');
        assert.ok(await js(q('ty', '[data-r="0"][data-c="2"] .cb.on') + ' ? true : false'), 'a checkbox, on');
        assert.strictEqual(await text('ty', 0, 3), 'Running', 'a badge shows its label');
        assert.ok((await js(q('ty', '[data-r="0"][data-c="3"] .badge') + '.getAttribute("style")')).includes('--nexa-colors-green-subtle'), 'in its palette');
        assert.strictEqual(await js(q('ty', '[data-r="0"][data-c="4"] .bar > i') + '.style.width'), '40%', 'a bar');
        assert.strictEqual(await js(q('ty', '[data-r="0"][data-c="5"] a') + '.rel'), 'noopener noreferrer', 'a link');
        assert.strictEqual(await text('ty', 0, 6), 'Start', 'a button');
        assert.strictEqual(await js(`getComputedStyle(${cell('ty', 0, 1)}).justifyContent`), 'flex-end', 'a number is on the right');
    });

    await ok('styles by range: bold, italic, underline, size, font, colours, fill, alignment, wrap; the later rule wins per field', async () => {
        await mount('st', {
            cells: { A1: 'Styled', B2: 'Later' },
            cellRules: [
                { range: 'A1:B2', bold: true, italic: true, underline: true, fontSize: 20, fontFamily: 'mono', color: '#ff0000', fill: '#00ff00', align: 'center', valign: 'bottom', wrap: true },
                { range: 'B2', bold: false, color: '#0000ff' }
            ]
        });
        const s = (r, c) => js(`(function () { var e = ${cell('st', r, c)}; var s = getComputedStyle(e); return { w: s.fontWeight, i: s.fontStyle, u: s.textDecorationLine, size: s.fontSize, color: s.color, bg: s.backgroundColor, jc: s.justifyContent, ai: s.alignItems, ws: s.whiteSpace }; })()`);
        const a = await s(0, 0), b = await s(1, 1);
        assert.deepStrictEqual([a.w, a.i, a.u, a.size, a.color, a.bg, a.jc, a.ai, a.ws], ['700', 'italic', 'underline', '20px', 'rgb(255, 0, 0)', 'rgb(0, 255, 0)', 'center', 'flex-end', 'normal']);
        assert.strictEqual(b.w, '400', 'the later rule: not bold');
        assert.strictEqual(b.color, 'rgb(0, 0, 255)');
        assert.strictEqual(b.i, 'italic', 'what the later rule does not say stays');
    });

    await ok('populate: a message fills cells from a cell on: one value, a list down, a list to the right, a table with its field names, a block', async () => {
        await mount('pop', {
            populate: [
                { at: 'A1', value: bind('one') },
                { at: 'A3', value: bind('list'), direction: 'down' },
                { at: 'C3', value: bind('list'), direction: 'right' },
                { at: 'A8', value: bind('table'), header: true, fields: 'id, temp' },
                { at: 'F1', value: bind('block') }
            ]
        });
        assert.strictEqual(await text('pop', 0, 0), '', 'nothing before the message');
        await message('pop', { one: 'Total', list: [10, 20, 30], table: [{ id: 'a', temp: 1.5, z: 9 }, { id: 'b', temp: 2 }], block: [[1, 2], [3, 4]] });
        assert.strictEqual(await text('pop', 0, 0), 'Total');
        assert.deepStrictEqual([await text('pop', 2, 0), await text('pop', 3, 0), await text('pop', 4, 0)], ['10', '20', '30'], 'down');
        assert.deepStrictEqual([await text('pop', 2, 2), await text('pop', 2, 3), await text('pop', 2, 4)], ['10', '20', '30'], 'to the right');
        assert.deepStrictEqual([await text('pop', 7, 0), await text('pop', 7, 1), await text('pop', 8, 0), await text('pop', 9, 1)], ['id', 'temp', 'a', '2'], 'a table: names, then a row per object');
        assert.strictEqual(await text('pop', 7, 2), '', 'only the named fields');
        assert.deepStrictEqual([await text('pop', 0, 5), await text('pop', 0, 6), await text('pop', 1, 5), await text('pop', 1, 6)], ['1', '2', '3', '4'], 'a block');
        // a new message replaces what the rule filled
        await message('pop', { one: 'Again', list: [1], table: [], block: [] });
        assert.strictEqual(await text('pop', 0, 0), 'Again');
        assert.strictEqual(await text('pop', 3, 0), '', 'the list got shorter');
    });

    await ok('populate fills typed cells: what was typed in the design is under it; a disabled rule fills nothing', async () => {
        await mount('pop2', { cells: { A1: 'typed', A2: 'typed too' }, populate: [{ at: 'A1', value: bind('v'), enabled: true }, { at: 'A2', value: bind('v'), enabled: false }] });
        await message('pop2', { v: 'from message' });
        assert.strictEqual(await text('pop2', 0, 0), 'from message');
        assert.strictEqual(await text('pop2', 1, 0), 'typed too', 'the disabled rule leaves the typed cell alone');
    });

    await ok('read-only (the default): nothing can be edited; a button still acts', async () => {
        await mount('ro', { cells: { A1: 'x', B1: 'go' }, cellRules: [{ range: 'B1', type: 'button', buttonLabel: 'Go', action: 'start' }] });
        await clickAt(cell('ro', 0, 0), 2);
        assert.strictEqual(await js(q('ro', '[data-edit]') + ' ? 1 : 0'), 0, 'no edit box');
        await clickAt(q('ro', '[data-r="0"][data-c="1"] .btn'));
        const b = await events('ro', 'buttonClick');
        assert.deepStrictEqual([b[0].address, b[0].action, b[0].value], ['B1', 'start', 'go']);
    });

    await ok('editable: type straight into the cells like a sheet; Enter commits and moves down; Escape cancels; the event has the address; a number is coerced; the value stays', async () => {
        await mount('ed1', { mode: 'editable', cells: { A1: 'old' }, cellRules: [{ range: 'B1:B3', type: 'number' }, { range: 'C1', type: 'boolean' }] });
        await clickAt(cell('ed1', 0, 0), 2);
        assert.strictEqual(await js(q('ed1', '[data-edit]') + ' ? 1 : 0'), 1, 'double-click: the edit box is open');
        assert.strictEqual(await js(q('ed1', '[data-edit]') + '.value'), 'old');
        await typeText('er'); await press('Enter');
        assert.strictEqual(await text('ed1', 0, 0), 'older');
        const ch = await events('ed1', 'cellChange');
        assert.deepStrictEqual([ch[0].address, ch[0].old, ch[0].new, ch[0].staged], ['A1', 'old', 'older', false]);
        // Enter moved down: typing now writes into A2 without opening anything first (a typed character starts the edit)
        await typeText('x'); await press('Enter');
        assert.strictEqual(await text('ed1', 1, 0), 'x', 'typed straight into the next cell');
        // Escape cancels
        await clickAt(cell('ed1', 2, 0), 2); await typeText('Q'); await press('Escape');
        assert.strictEqual(await text('ed1', 2, 0), '');
        // a number: "12,5" becomes 12.5; text is kept as typed (no validation)
        await clickAt(cell('ed1', 0, 1), 2);
        await js(`(function () { var i = ${q('ed1', '[data-edit]')}; i.value = "12,5"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
        await press('Enter');
        assert.strictEqual((await events('ed1', 'cellChange')).pop().new, 12.5);
        await clickAt(cell('ed1', 1, 1), 2);
        await js(`(function () { var i = ${q('ed1', '[data-edit]')}; i.value = "abc"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
        await press('Enter');
        assert.strictEqual((await events('ed1', 'cellChange')).pop().new, 'abc', 'accepted as typed');
        // a checkbox toggles with a click; Delete empties
        await clickAt(q('ed1', '[data-r="0"][data-c="2"] .cb'));
        assert.strictEqual((await events('ed1', 'cellChange')).pop().new, true);
        await clickAt(cell('ed1', 0, 0)); await press('Delete');
        assert.strictEqual(await text('ed1', 0, 0), '', 'Delete empties the cell');
        // a message fills a cell the user typed in: the message wins
        await js(`NexaTest.setProps("ed1", { populate: [{ at: "A2", value: ${JSON.stringify(bind('v'))} }] })`); await settle();
        await message('ed1', { v: 'msg' });
        assert.strictEqual(await text('ed1', 1, 0), 'msg', 'a message covers what the user typed in the cell it fills');
    });

    await ok('locks: a locked range cannot be edited, an open rule opens a cell of it, a read-only grid wins over all', async () => {
        await mount('lk', { mode: 'editable', cells: { A1: 'a', A2: 'b', A3: 'c', B1: 'd' }, locks: [{ range: 'A1:A3', locked: true }, { range: 'A2', locked: false }] });
        const can = async (r, c) => { await clickAt(cell('lk', r, c), 2); const open = await js(q('lk', '[data-edit]') + ' ? 1 : 0'); if (open) await press('Escape'); return !!open; };
        assert.strictEqual(await can(0, 0), false, 'a locked cell');
        assert.strictEqual(await can(1, 0), true, 'an open rule over a locked range');
        assert.strictEqual(await can(2, 0), false);
        assert.strictEqual(await can(0, 1), true, 'a cell no rule talks about');
        await js('NexaTest.setProps("lk", { mode: "readonly" })'); await settle();
        assert.strictEqual(await can(1, 0), false, 'read-only: even the open cell');
    });

    await ok('staged edits: a change waits (marked), Save sends only the changed cells and makes it final, Discard throws it away', async () => {
        await mount('stg', { mode: 'editable', editMode: 'staged', cells: { A1: 'one', A2: 'two' } });
        await clickAt(cell('stg', 0, 0), 2); await typeText('!'); await press('Enter');
        await clickAt(cell('stg', 2, 0), 2); await typeText('?'); await press('Enter');
        assert.strictEqual(await text('stg', 0, 0), 'one!');
        assert.ok((await js(cell('stg', 0, 0) + '.className')).includes('dirty'), 'marked');
        assert.strictEqual((await events('stg', 'cellChange')).length, 2);
        assert.ok((await js(q('stg', '.staged') + '.textContent')).includes('2 unsaved'));
        await clickAt(q('stg', '[data-staged="save"]'));
        const s = await events('stg', 'save');
        assert.deepStrictEqual(s[0].cells.map((x) => [x.address, x.old, x.new]), [['A1', 'one', 'one!'], ['A3', null, '?']]);
        assert.strictEqual(await text('stg', 0, 0), 'one!');
        assert.ok(!(await js(cell('stg', 0, 0) + '.className')).includes('dirty'));
        await clickAt(cell('stg', 1, 0), 2); await typeText('#'); await press('Enter');
        await clickAt(q('stg', '[data-staged="discard"]'));
        assert.strictEqual(await text('stg', 1, 0), 'two', 'discarded');
        assert.strictEqual((await events('stg', 'discard'))[0].count, 1);
    });

    await ok('merged cells: one box over its range, the cells under it are not drawn; a merge that does not fit is not drawn', async () => {
        await mount('mg', { cells: { B2: 'Merged', B3: 'hidden' }, merges: ['B2:C3', 'A1', 'B2:B9'] });
        const box = await js(`(function () { var e = ${cell('mg', 1, 1)}; return { w: e.offsetWidth, h: e.offsetHeight }; })()`);
        assert.deepStrictEqual(box, { w: 220, h: 56 }, 'two columns (110) and two rows (28) wide / tall');
        assert.strictEqual(await text('mg', 1, 1), 'Merged');
        assert.strictEqual(await js(q('mg', '[data-r="2"][data-c="1"]') + ' ? 1 : 0'), 0, 'covered');
        assert.strictEqual(await js(q('mg', '[data-r="1"][data-c="2"]') + ' ? 1 : 0'), 0, 'covered');
        assert.strictEqual(await js(`${cell('mg', 0, 0)}.offsetWidth`), 110, 'a one-cell "merge" changes nothing');
    });

    await ok('frozen rows and columns stay while the rest scrolls', async () => {
        await mount('fz', { rows: 200, cols: 40, freezeRows: 2, freezeCols: 2 }, { width: 420, height: 260 });
        const pos = (r, c) => js(`(function () { var e = ${cell('fz', r, c)}; if (!e) return null; var b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top) }; })()`);
        const before = { corner: await pos(0, 0), scrolling: await pos(5, 2) };
        await js(`(function () { var s = ${q('fz', '[data-scroller]')}; s.scrollTop = 180; s.scrollLeft = 150; })()`); await wait(150); await settle();
        assert.deepStrictEqual(await pos(0, 0), before.corner, 'the corner cell (A1) did not move');
        assert.ok(/translateY\(-180px\)/.test(await js(`${q('fz', '[data-pane="bl"]')}.style.transform`)), 'the frozen columns follow the vertical scroll');
        assert.ok(/translateX\(-150px\)/.test(await js(`${q('fz', '[data-pane="tr"]')}.style.transform`)), 'the frozen rows follow the horizontal scroll');
        assert.strictEqual(await js(q('fz', '[data-hr="0"]') + '.textContent'), '1', 'the row numbers of the frozen rows stay');
        assert.strictEqual(await js(q('fz', '[data-hc="0"]') + '.textContent'), 'A', 'the letters of the frozen columns stay');
        assert.ok(before.corner && before.scrolling);
    });

    await ok('borders: a rule draws its lines (above / left of the box, the colour and style of the rule, a later rule on top)', async () => {
        await mount('bd', { borders: [{ range: 'B2:C3', sides: 'outer', width: 2, color: '#ff0000' }, { range: 'B2', sides: 'top', style: 'dashed', width: 3, color: 'primary' }] });
        const b = (r, c) => js(`(function () { var s = getComputedStyle(${cell('bd', r, c)}); return { top: s.borderTopStyle + " " + s.borderTopWidth, left: s.borderLeftStyle + " " + s.borderLeftWidth + " " + s.borderLeftColor }; })()`);
        const tl = await b(1, 1);
        assert.strictEqual(tl.top, 'dashed 3px', 'the later rule is on top of the shared edge');
        assert.strictEqual(tl.left, 'solid 2px rgb(255, 0, 0)');
        assert.ok((await b(3, 1)).top.startsWith('solid 2px'), 'the line under the range is the top of the next row');
    });

    await ok('the area shown: only B2:D5 is drawn, with its own letters and numbers; the rest of the sheet is not', async () => {
        await mount('area', { rows: 50, cols: 26, viewArea: 'B2:D5', cells: { A1: 'out', B2: 'in', D5: 'corner', E5: 'out' } });
        assert.deepStrictEqual(await heads('area'), ['B', 'C', 'D']);
        assert.deepStrictEqual(await rowHeads('area'), ['2', '3', '4', '5']);
        assert.strictEqual(await text('area', 1, 1), 'in');
        assert.strictEqual(await text('area', 4, 3), 'corner');
        assert.strictEqual(await js(q('area', '[data-r="0"][data-c="0"]') + ' ? 1 : 0'), 0, 'A1 is outside');
        assert.strictEqual(await js(q('area', '[data-r="4"][data-c="4"]') + ' ? 1 : 0'), 0, 'E5 is outside');
        await js('NexaTest.setProps("area", { viewArea: "" })'); await settle();
        assert.ok((await heads('area')).length > 3, 'empty: the whole sheet again');
        await js('NexaTest.setProps("area", { viewArea: "nonsense" })'); await settle();
        assert.ok((await heads('area')).length > 3, 'an unreadable area: the whole sheet');
    });

    await ok('headers and lines can be hidden', async () => {
        await mount('nh', { showHeaders: false, showGridLines: false, cells: { A1: 'x' } });
        assert.strictEqual(await js(qa('nh', '.head') + '.length'), 0);
        assert.strictEqual(await text('nh', 0, 0), 'x');
        assert.ok((await js(q('nh', '.grid') + '.classList.contains("nolines")')));
    });

    await ok('selection: a click selects a cell (and tells Logic its address), arrows move it, shift extends a range, a letter selects the column, a number the row; "none" selects nothing', async () => {
        await mount('sl', { selection: 'range', rows: 20, cols: 10, cells: { B2: 'a', C2: 'b', B3: 'c', C3: 'd' } });
        await clickAt(cell('sl', 1, 1));
        assert.ok((await js(cell('sl', 1, 1) + '.className')).includes('focus'));
        let ev = await events('sl', 'selectionChange');
        assert.deepStrictEqual([ev[0].range, ev[0].address, JSON.stringify(ev[0].values)], ['B2', 'B2', '[["a"]]']);
        await js(`${q('sl', '.grid')}.focus()`); await press('ArrowDown'); await press('ArrowRight');
        assert.ok((await js(cell('sl', 2, 2) + '.className')).includes('focus'), 'the arrows moved the focus to C3');
        await press('ArrowUp', 8); await press('ArrowLeft', 8);   // shift
        ev = await events('sl', 'selectionChange');
        const last = ev.pop();
        assert.deepStrictEqual([last.range, JSON.stringify(last.values)], ['B2:C3', '[["a","b"],["c","d"]]'], 'shift extends');
        await clickAt(q('sl', '[data-hc="2"]'));
        assert.strictEqual((await events('sl', 'selectionChange')).pop().range, 'C1:C20', 'a letter: the whole column');
        assert.ok((await js(q('sl', '[data-hc="2"]') + '.classList.contains("act")')), 'its letter is lit');
        await clickAt(q('sl', '[data-hr="3"]'));
        assert.strictEqual((await events('sl', 'selectionChange')).pop().range, 'A4:J4', 'a number: the whole row');
        await mount('sln', { selection: 'none', cells: { A1: 'x' } });
        await clickAt(cell('sln', 0, 0));
        assert.deepStrictEqual(await events('sln', 'selectionChange'), []);
        assert.ok(!(await js(cell('sln', 0, 0) + '.className')).includes('focus'));
    });

    await ok('a click tells Logic: cellClick has the address and the value', async () => {
        await mount('clk', { cells: { C3: 'hello' } });
        await clickAt(cell('clk', 2, 2));
        const c = (await events('clk', 'cellClick')).pop();
        assert.deepStrictEqual([c.address, c.value], ['C3', 'hello']);
    });

    await ok('actions: setCell, setRange (a list, a table), clearRange, selectCell, scrollToCell, getData', async () => {
        await mount('act', { rows: 500, cols: 26, cells: { A1: 'typed', B1: 'typed too' } });
        await js('NexaTest.invoke("act", "setCell", { address: "C3", value: 42 })'); await settle();
        assert.strictEqual(await text('act', 2, 2), '42');
        await js('NexaTest.invoke("act", "setRange", { at: "A5", values: [[1, 2], [3, 4]] })'); await settle();
        assert.deepStrictEqual([await text('act', 4, 0), await text('act', 4, 1), await text('act', 5, 0), await text('act', 5, 1)], ['1', '2', '3', '4']);
        await js('NexaTest.invoke("act", "setRange", { at: "E1", values: [{ a: 1, b: 2 }, { a: 3, b: 4 }], header: true, direction: "right" })'); await settle();
        assert.deepStrictEqual([await text('act', 0, 4), await text('act', 1, 4), await text('act', 0, 5), await text('act', 1, 5)], ['a', 'b', '1', '2'], 'to the right: the table turned over');
        await js('NexaTest.invoke("act", "clearRange", "A1:B1")'); await settle();
        assert.strictEqual(await text('act', 0, 0), '', 'emptied');
        assert.strictEqual(await text('act', 0, 1), '');
        await js('NexaTest.invoke("act", "selectCell", "C3")'); await settle();
        assert.ok((await js(cell('act', 2, 2) + '.className')).includes('focus'));
        await js('NexaTest.invoke("act", "scrollToCell", { address: "A400" })'); await wait(200); await settle();
        assert.strictEqual(await js(q('act', '[data-hr="399"]') + ' ? 1 : 0'), 1, 'row 400 is in view');
        await js('NexaTest.invoke("act", "getData")'); await settle();
        const got = (await events('act', 'data'))[0];
        assert.strictEqual(got.cells.C3, 42);
        assert.strictEqual(got.cells.A5, 1);
        assert.strictEqual(got.cells.A1, undefined, 'an emptied cell is not data');
        assert.ok(/^[A-Z]+\d+:[A-Z]+\d+$/.test(got.range), 'a range of what has values: ' + got.range);
    });

    await ok('the Edit grid dialog: the kit tree and properties; select cells on the real grid, type in them, merge, bold, lock a column, populate; Apply sets only what changed, Cancel nothing', async () => {
        const dlg = (sel) => `document.querySelector("nexa-data-grid-editor ${sel}")`;
        const prev = () => `${dlg('.dge-prev')}.firstElementChild.shadowRoot`;
        const pcell = (r, c) => `${prev()}.querySelector('[data-r="${r}"][data-c="${c}"]')`;
        const btn = (title) => `Array.from(document.querySelectorAll("nexa-data-grid-editor button")).filter(function (b) { return b.title === ${JSON.stringify(title)}; })[0]`;
        const open = async (props) => {
            await js(`window.__sets = []; NEXA.getComponent("nexa-ui-data-grid").nexa.props.editGrid.buttons[0].run(${JSON.stringify(props)}, { set: function (k, v) { window.__sets.push([k, v]); } })`);
            await settle(); await wait(300);
        };
        const sets = async () => Object.fromEntries(await js('window.__sets'));
        const foot = async (label) => { await clickAt(`Array.from(document.querySelectorAll(".nx-dialog-foot button")).filter(function (b) { return b.textContent.trim() === ${JSON.stringify(label)}; })[0]`); await wait(120); };
        const drag = async (from, to) => {
            const a = await js(`(function () { var b = ${from}.getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 }; })()`);
            const b = await js(`(function () { var b = ${to}.getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 }; })()`);
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, buttons: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
            await settle(); await wait(150);
        };
        const status = () => js(dlg('.dge-status') + '.textContent');

        await open({ cells: { A1: 'x' }, freezeRows: 0 });
        assert.strictEqual(await js(dlg('.dge-prev') + ' ? 1 : 0'), 1, 'the dialog is open');
        const tree = await js(dlg('.dge-form') + '.textContent');
        for (const l of ['Selection', 'Sheet', 'Populate from messages', 'Types and styles', 'Merged cells', 'Borders', 'Locked / open cells', 'Search properties']) assert.ok(tree.includes(l) || (l === 'Search properties' && (await js(dlg('.dge-form input') + '.placeholder')).includes(l)), 'the property tree has ' + l);
        assert.deepStrictEqual((await js(`Array.from(${prev()}.querySelectorAll(".head[data-hc]")).slice(0, 3).map(function (e) { return e.textContent; })`)), ['A', 'B', 'C'], 'the real grid, with its letters');
        assert.ok((await status()).includes('Nothing selected'));
        assert.ok(await js(btn('One box over the selected cells') + '.disabled'), 'no selection: Merge is off');

        // type in a cell of the preview, like a sheet: it is the design's content
        await clickAt(pcell(0, 1), 2);
        await js(`(function () { var i = ${prev()}.querySelector("[data-edit]"); i.value = "Hi"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
        await press('Enter');
        assert.strictEqual(await js(`${pcell(0, 1)}.textContent.trim()`), 'Hi', 'the typed value is in the grid');
        // select B2:C3 and merge
        await drag(pcell(1, 1), pcell(2, 2));
        assert.ok((await status()).includes('B2:C3 (4 cells)'), await status());
        await clickAt(btn('One box over the selected cells'));
        assert.deepStrictEqual(await js(`(function () { var e = ${pcell(1, 1)}; return { w: e.offsetWidth, h: e.offsetHeight }; })()`), { w: 220, h: 56 }, 'the preview draws the merge');
        // bold on A1: a rule over A1; the property row says so; a second click turns it off in the same rule
        await drag(pcell(0, 0), pcell(0, 0));
        await clickAt(btn('Bold'));
        assert.strictEqual(await js(`getComputedStyle(${pcell(0, 0)}).fontWeight`), '700');
        await clickAt(btn('Bold'));
        assert.strictEqual(await js(`getComputedStyle(${pcell(0, 0)}).fontWeight`), '400');
        await clickAt(btn('Bold'));
        // a property of the Selection through the tree's own path: a size for A1
        await js(`document.querySelector("nexa-data-grid-editor")._setProp("sel_fontSize", 20)`); await settle(); await wait(100);
        assert.strictEqual(await js(`getComputedStyle(${pcell(0, 0)}).fontSize`), '20px', 'a Selection property styles the selected cells');
        // a whole column: a letter, then lock it
        await clickAt(`${prev()}.querySelector('[data-hc="3"]')`);
        assert.ok((await status()).includes('D1:D100 (100 cells)'), await status());
        await clickAt(btn("These cells cannot be edited (the page's editable mode)"));
        assert.strictEqual(await js(`${pcell(2, 3)}.classList.contains("hatch")`), true, 'locked cells are hatched');
        // a populate rule through the tree's path: its marker shows
        await js(`document.querySelector("nexa-data-grid-editor")._setProp("populate", [{ at: "F2", direction: "right", enabled: true }])`); await settle(); await wait(100);
        assert.strictEqual(await js(`${pcell(1, 5)}.classList.contains("pop")`), true, 'the cell a rule starts at is marked');
        // freezing through a merge takes it apart, and says so
        await drag(pcell(0, 3), pcell(0, 3));
        await js(`${btn("Keep the rows down to the selection's last row in place")}.click()`); await settle(); await wait(100);
        assert.strictEqual(await js(`${pcell(1, 1)}.offsetWidth`), 220, 'freezing above the merge leaves it whole');
        await foot('Apply');
        const s = await sets();
        assert.deepStrictEqual(Object.keys(s).sort(), ['cellRules', 'cells', 'freezeRows', 'locks', 'merges', 'populate'].sort(), 'only what changed is set: ' + Object.keys(s).join(','));
        assert.deepStrictEqual(s.cells, { A1: 'x', B1: 'Hi' });
        assert.deepStrictEqual(s.locks, [{ range: 'D:D', locked: true }]);
        assert.deepStrictEqual(s.populate.map((x) => [x.at, x.direction]), [['F2', 'right']]);
        assert.ok(s.cellRules.some((r) => r.range === 'A1' && r.bold === true && r.fontSize === 20), 'one rule for A1: ' + JSON.stringify(s.cellRules));
        assert.strictEqual(await js(dlg('.dge-prev') + ' ? 1 : 0'), 0, 'the dialog is closed');

        // Cancel sets nothing
        await open({ cells: { A1: 'x' } });
        await drag(pcell(1, 1), pcell(2, 2));
        await clickAt(btn('One box over the selected cells'));
        await foot('Cancel');
        assert.deepStrictEqual(await sets(), {}, 'Cancel changes nothing');
    });

    await ok('the Edit grid row of the inspector says what the sheet has', async () => {
        const r = await js(`(function () { var p = NEXA.getComponent("nexa-ui-data-grid").nexa.props.editGrid; return [p.info({ rows: 50, cols: 10, cells: { A1: 1, B1: 2 }, cellRules: [{}], merges: ["A1:B2"], populate: [{}, {}], locks: [{}] }), p.info({})]; })()`);
        assert.strictEqual(r[0], '50 rows x 10 columns, 2 cells typed, 1 type / style rule, 2 populate rules, 1 merged, 1 lock rule');
        assert.strictEqual(r[1], '100 rows x 26 columns');
    });

    await ok('the inspector: the groups and every setting of the sheet are there', async () => {
        const r = await js(`(async function () {
            var t = NexaTest.inspector("nexa-ui-${ID}", { populate: [{ at: "B2", direction: "right" }] });
            await new Promise(function (r) { setTimeout(r, 250); });
            var labels = NexaTest.rows(t.box).map(function (x) { return x.label; });
            t.destroy();
            return labels;
        })()`);
        for (const l of ['Rows', 'Columns', 'Column width', 'Row height', 'Area shown', 'Frozen rows', 'Frozen columns', 'Populate from messages', 'Mode', 'Edits', 'Show the column letters and row numbers', 'Show the grid lines', 'Selection']) assert.ok(r.includes(l), 'inspector: ' + l + ' in ' + r.join(' | '));
    });

    await ok('light and dark: the grid reads the theme (no fixed colours), and a screenshot of it', async () => {
        await mount('look', {
            mode: 'editable', freezeRows: 1, selection: 'range', rows: 30, cols: 12,
            cells: { A1: 'Machine', B1: 'State', C1: 'Temp', D1: 'Load', A2: 'Mixer 1', B2: 'ok', C2: 71.4, D2: 64, A3: 'Mixer 2', B3: 'stop', C3: 24.9, D3: 0, A4: 'Pump', B4: 'bad', C4: 93.8, D4: 12 },
            cellRules: [{ range: '1:1', bold: true, fill: '#d0e2ff', color: '#001d6c' }, { range: 'B2:B4', type: 'badge', options: 'ok:Running:green, stop:Stopped:gray, bad:Fault:red' }, { range: 'C2:C4', type: 'number', decimals: 1, suffix: ' °C' }, { range: 'D2:D4', type: 'progress' }],
            merges: ['F2:G3'], borders: [{ range: 'A1:D4', sides: 'outer', color: 'primary', width: 2 }]
        }, { width: 760, height: 260 });
        await clickAt(cell('look', 1, 0));
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
