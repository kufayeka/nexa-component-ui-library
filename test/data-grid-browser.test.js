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
    // a letter key with a modifier (2 = Ctrl, 8 = Shift): Ctrl+Z, Ctrl+Y
    const press2 = async (letter, mods) => {
        const code = letter.toUpperCase().charCodeAt(0);
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: letter, code: 'Key' + letter.toUpperCase(), windowsVirtualKeyCode: code, modifiers: mods || 0 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: letter, code: 'Key' + letter.toUpperCase(), windowsVirtualKeyCode: code });
        await settle(); await wait(60);
    };
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
        assert.deepStrictEqual([a.w, a.i, a.u, a.size, a.color, a.bg, a.jc, a.ai, a.ws], ['700', 'italic', 'underline', '20px', 'rgb(255, 0, 0)', 'rgb(0, 255, 0)', 'center', 'safe flex-end', 'normal']);
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

    await ok('the box typed in fills the whole cell, also in a wrapped cell and a merged one; an input cell too', async () => {
        await mount('fb', { mode: 'editable', cells: { A1: 'x', B2: 'y', C3: 'z', D1: 'in' }, cellRules: [{ range: 'B2', wrap: true }, { range: 'D1', type: 'input' }], merges: ['C3:D4'] }, { width: 700, height: 300 });
        const fits = (r, c, sel) => js(`(function () { var cell = ${cell('fb', r, c)}, f = cell.querySelector(${JSON.stringify(sel)}); if (!f) return null; var a = cell.getBoundingClientRect(), b = f.getBoundingClientRect(); return { dw: Math.round(a.width - b.width), dh: Math.round(a.height - b.height) }; })()`);
        await clickAt(cell('fb', 0, 0), 2);
        const input = await fits(0, 0, '[data-edit]');
        assert.ok(input && input.dw <= 2 && input.dh <= 2, 'an input: the cell minus its border only: ' + JSON.stringify(input));
        await press('Escape');
        await clickAt(cell('fb', 1, 1), 2);
        const area = await fits(1, 1, 'textarea[data-edit]');
        assert.ok(area && area.dw <= 2 && area.dh <= 2, 'a text area: ' + JSON.stringify(area));
        await press('Escape');
        await clickAt(cell('fb', 2, 2), 2);
        const merged = await fits(2, 2, '[data-edit]');
        assert.ok(merged && merged.dw <= 2 && merged.dh <= 2, 'a merged cell: ' + JSON.stringify(merged));
        await press('Escape');
        const always = await fits(0, 3, 'input[data-act="input"]');
        assert.ok(always && always.dw <= 2 && always.dh <= 2, 'an input cell: ' + JSON.stringify(always));
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
        await mount('stg', { mode: 'editable', saveMode: 'bar', cells: { A1: 'one', A2: 'two' } });
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

    // ---- sizes: rules, dragging, limits, fit to the wrapped text, a text area to type in ------------------------------------------------------------
    const size = (n, r, c) => js(`(function () { var e = ${cell(n, r, c)}; return { w: e.offsetWidth, h: e.offsetHeight }; })()`);
    const dragLine = async (n, kind, index, delta) => {
        const h = q(n, `[data-rz="${kind}"][data-i="${index}"]`);
        const p = await js(`(function () { var e = ${h}; var host = e.getRootNode().host; if (host) host.scrollIntoView({ block: "center" }); var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + (kind === 'c' ? delta : 0), y: p.y + (kind === 'r' ? delta : 0), buttons: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + (kind === 'c' ? delta : 0), y: p.y + (kind === 'r' ? delta : 0), button: 'left', buttons: 0, clickCount: 1 });
        await settle(); await wait(80);
    };

    await ok('sizes by rules: a width, a height, the smallest and largest, per range; the grid\'s own sizes for the rest', async () => {
        await mount('sz', { colWidth: 100, rowHeight: 30, colRules: [{ columns: 'B', width: 200 }, { columns: 'C', width: 5000, maxWidth: 260 }, { columns: 'D', width: 1 }], rowRules: [{ rows: '2', height: 60 }, { rows: '3', height: 1000 }] });
        assert.deepStrictEqual(await size('sz', 0, 0), { w: 100, h: 30 }, 'the grid\'s sizes');
        assert.strictEqual((await size('sz', 0, 1)).w, 200);
        assert.strictEqual((await size('sz', 0, 2)).w, 260, 'a width kept at the column\'s own largest');
        assert.strictEqual((await size('sz', 0, 3)).w, 30, 'and at the grid\'s smallest');
        assert.strictEqual((await size('sz', 1, 0)).h, 60);
        assert.strictEqual((await size('sz', 2, 0)).h, 400, 'a height kept at the grid\'s largest');
    });

    await ok('dragging the line between two letters changes the width within its limits, tells Logic, and stays until the page is reloaded; double-click fits the content', async () => {
        await mount('dr', { cells: { B1: 'a rather long text in column B' }, colRules: [{ columns: 'C', maxWidth: 140 }, { columns: 'D', adjustable: false }, { columns: 'A', minWidth: 80 }] });
        await dragLine('dr', 'c', 1, 50);
        assert.strictEqual((await size('dr', 0, 1)).w, 160, 'dragged 50 px wider');
        const e = await events('dr', 'columnResize');
        assert.deepStrictEqual([e[0].columns, e[0].width], [['B'], 160]);
        await dragLine('dr', 'c', 2, 300);
        assert.strictEqual((await size('dr', 0, 2)).w, 140, 'kept at the column\'s largest');
        await dragLine('dr', 'c', 0, -90);
        assert.strictEqual((await size('dr', 0, 0)).w, 80, 'kept at the column\'s smallest');
        assert.strictEqual(await js(q('dr', '[data-rz="c"][data-i="3"]') + ' ? 1 : 0'), 0, 'a column that cannot be adjusted has no handle');
        // double-click: the width of the widest text
        await js(`(function () { var h = ${q('dr', '[data-rz="c"][data-i="1"]')}; h.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true })); })()`); await settle(); await wait(100);
        const fitted = (await size('dr', 0, 1)).w;
        assert.ok(fitted > 160 && fitted <= 600, 'fitted to the text: ' + fitted);
        // the grid can say no for all, a rule can say yes for one
        await js('NexaTest.setProps("dr", { adjustCols: false, colRules: [{ columns: "B", adjustable: true }] })'); await settle(); await wait(60);
        assert.strictEqual(await js(q('dr', '[data-rz="c"][data-i="0"]') + ' ? 1 : 0'), 0, 'adjustCols off: no handle');
        assert.strictEqual(await js(q('dr', '[data-rz="c"][data-i="1"]') + ' ? 1 : 0'), 1, 'a rule that says yes');
    });

    await ok('dragging the line between two numbers changes the height; a row rule can forbid it; a selection of whole columns is resized together', async () => {
        await mount('dr2', { rows: 20, cols: 6, rowRules: [{ rows: '3', adjustable: false }], rowHeight: 30 });
        await dragLine('dr2', 'r', 0, 25);
        assert.strictEqual((await size('dr2', 0, 0)).h, 55);
        assert.deepStrictEqual((await events('dr2', 'rowResize'))[0], { rows: [1], height: 55 });
        assert.strictEqual(await js(q('dr2', '[data-rz="r"][data-i="2"]') + ' ? 1 : 0'), 0, 'row 3 cannot be adjusted');
        // whole columns B:C selected, B dragged: both follow
        await clickAt(q('dr2', '[data-hc="1"]'));
        await js(`${q('dr2', '.grid')}.focus()`); await press('ArrowRight', 8);
        await dragLine('dr2', 'c', 1, 30);
        assert.strictEqual((await size('dr2', 0, 1)).w, (await size('dr2', 0, 2)).w, 'the selected columns are the same width');
        assert.strictEqual((await size('dr2', 0, 1)).w, 140);
        assert.strictEqual((await size('dr2', 0, 3)).w, 110, 'the others are not touched');
    });

    await ok('read-only pages can still be resized by the user (it is the view); the design canvas cannot', async () => {
        await mount('dr3', { mode: 'readonly' });
        assert.strictEqual(await js(q('dr3', '[data-rz="c"][data-i="0"]') + ' ? 1 : 0'), 1);
        await js(`NexaTest.mount("dr4", "nexa-ui-${ID}", {}, { width: 500, height: 200, design: true })`); await settle(); await wait(60);
        assert.strictEqual(await js(q('dr4', '[data-rz]') + ' ? 1 : 0'), 0, 'the design canvas takes the mouse for selecting and moving the component');
    });

    await ok('wrap text: the row grows to fit the text up to its largest, then the text scrolls in the cell; a row that does not fit its text keeps its height', async () => {
        const text = 'word '.repeat(40);
        await mount('wr', { cells: { A1: text, A2: text, A3: text, A4: text }, cellRules: [{ range: 'A1:A4', wrap: true }], rowRules: [{ rows: '2', maxHeight: 90 }, { rows: '3', fit: false }, { rows: '4', adjustable: false }] });
        const h = async (r) => (await size('wr', r, 0)).h;
        assert.ok((await h(0)) > 120 && (await h(0)) <= 400, 'row 1 grew to its text: ' + await h(0));
        assert.strictEqual(await h(1), 90, 'row 2 stopped at its largest');
        assert.ok(await js(`(function () { var e = ${cell('wr', 1, 0)}; return e.scrollHeight > e.clientHeight; })()`), 'and its text scrolls in the cell');
        assert.strictEqual(await h(2), 28, 'row 3 does not fit its text');
        assert.strictEqual(await h(3), 28, 'a row that cannot be adjusted keeps its height');
        assert.ok(await js(`(function () { var e = ${cell('wr', 2, 0)}; return e.scrollHeight > e.clientHeight; })()`), 'its text scrolls in the cell');
        await js('NexaTest.setProps("wr", { autoFit: false })'); await settle(); await wait(100);
        assert.strictEqual(await h(0), 28, 'autoFit off: every row keeps its height');
    });

    await ok('typing in a wrapped cell: a text area (Enter is a new line, Ctrl+Enter commits), the row grows with the text', async () => {
        await mount('wt', { mode: 'editable', cells: { A1: 'x' }, cellRules: [{ range: 'A1', wrap: true }] });
        const h0 = (await size('wt', 0, 0)).h;
        await clickAt(cell('wt', 0, 0), 2);
        assert.strictEqual(await js(q('wt', 'textarea[data-edit]') + ' ? 1 : 0'), 1, 'a text area');
        await typeText('long'); await press('Enter'); await typeText('line two'); await press('Enter'); await typeText('three');
        assert.ok((await size('wt', 0, 0)).h > h0, 'the row grew while typing');
        assert.strictEqual(await js(q('wt', 'textarea[data-edit]') + ' ? 1 : 0'), 1, 'Enter did not commit');
        await press('Enter', 2);   // Ctrl+Enter
        const ch = await events('wt', 'cellChange');
        assert.strictEqual(ch[ch.length - 1].new, 'xlong\nline two\nthree');
        assert.ok((await size('wt', 0, 0)).h > h0, 'and the row stays tall');
        await mount('wt2', { mode: 'editable', cells: { A1: 'x' } });
        await clickAt(cell('wt2', 0, 0), 2);
        assert.strictEqual(await js(q('wt2', 'input[data-edit]') + ' ? 1 : 0'), 1, 'a cell without wrap is typed in an input');
        await press('Escape');
    });

    await ok('the Edit grid dialog: a line dragged in the preview is a size rule; Ctrl+Z and Ctrl+Y undo and redo every change', async () => {
        const dlg = (sel) => `document.querySelector("nexa-data-grid-editor ${sel}")`;
        const prev = () => `${dlg('.dge-prev')}.firstElementChild.shadowRoot`;
        await js(`window.__sets = []; NEXA.getComponent("nexa-ui-data-grid").nexa.props.editGrid.buttons[0].run({ cells: { A1: "x" } }, { set: function (k, v) { window.__sets.push([k, v]); } })`);
        await settle(); await wait(300);
        const handle = `${prev()}.querySelector('[data-rz="c"][data-i="1"]')`;
        const p = await js(`(function () { var b = ${handle}.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + 40, y: p.y, buttons: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + 40, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
        await settle(); await wait(150);
        assert.strictEqual(await js(`${prev()}.querySelector('[data-r="0"][data-c="1"]').offsetWidth`), 150, 'the preview shows the new width');
        // a second change, then undo twice, redo once
        await js(`document.querySelector("nexa-data-grid-editor")._setProp("rows", 50)`); await settle(); await wait(100);
        const rowsOf = () => js(`document.querySelector("nexa-data-grid-editor")._draft.rows`);
        const widthOf = () => js(`${prev()}.querySelector('[data-r="0"][data-c="1"]').offsetWidth`);
        assert.strictEqual(await rowsOf(), 50);
        await js(`${dlg('.dge-prev')}.firstElementChild.focus()`);
        await press2('z', 2);
        assert.strictEqual(await rowsOf(), 100, 'Ctrl+Z took the rows back');
        assert.strictEqual(await widthOf(), 150, 'the width is still there');
        await press2('z', 2);
        assert.strictEqual(await widthOf(), 110, 'the second Ctrl+Z took the width back');
        await press2('y', 2);
        assert.strictEqual(await widthOf(), 150, 'Ctrl+Y brought it back');
        await clickAt(`Array.from(document.querySelectorAll("nexa-data-grid-editor button")).filter(function (b) { return b.title === "Undo (Ctrl+Z)"; })[0]`);
        assert.strictEqual(await widthOf(), 110, 'the Undo button too');
        await clickAt(`Array.from(document.querySelectorAll("nexa-data-grid-editor button")).filter(function (b) { return b.title === "Redo (Ctrl+Y)"; })[0]`);
        await clickAt(`Array.from(document.querySelectorAll(".nx-dialog-foot button")).filter(function (b) { return b.textContent.trim() === "Apply"; })[0]`);
        await wait(120);
        const s = Object.fromEntries(await js('window.__sets'));
        assert.deepStrictEqual(Object.keys(s), ['colRules'], 'only the size rule: the rows went back to 100');
        assert.deepStrictEqual(s.colRules, [{ columns: 'B', width: 150 }]);
    });

    // ---- the clipboard and the fill handle ------------------------------------------------------------------------------------------------------
    const dragCells = async (n, from, to, mods) => {
        const a = await js(`(function () { var e = ${from}; var host = e.getRootNode().host; if (host) host.scrollIntoView({ block: "center" }); var b = e.getBoundingClientRect(); return { x: b.left + Math.min(12, b.width / 2), y: b.top + Math.min(8, b.height / 2) }; })()`);
        const b = await js(`(function () { var b = ${to}.getBoundingClientRect(); return { x: b.left + Math.min(12, b.width / 2), y: b.top + Math.min(8, b.height / 2) }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, buttons: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1, modifiers: mods || 0 });
        await settle(); await wait(100);
    };
    // a clipboard event on the grid: what the copy puts in the clipboard, or what the paste finds in it
    const clip = (n, type, data) => js(`(function () {
        var g = ${q(n, '.grid')}; var dt = new DataTransfer(); var d = ${JSON.stringify(data || {})};
        Object.keys(d).forEach(function (k) { dt.setData(k, d[k]); });
        g.dispatchEvent(new ClipboardEvent(${JSON.stringify(type)}, { clipboardData: dt, bubbles: true, cancelable: true, composed: true }));
        return { text: dt.getData("text/plain"), grid: dt.getData("application/x-nexa-grid") };
    })()`);

    await ok('copy: the cells as tab-separated text (Excel) and as a JSON of values and styles; cut empties the editable ones', async () => {
        await mount('cp', { mode: 'editable', cells: { A1: 'one', B1: 2, A2: 'two\nlines', B2: 4 }, cellRules: [{ range: 'A1', bold: true, fill: '#ff0000' }, { range: 'B1:B2', type: 'number', decimals: 1 }], locks: [{ range: 'B2', locked: true }] });
        await dragCells('cp', cell('cp', 0, 0), cell('cp', 1, 1));
        const out = await clip('cp', 'copy');
        assert.strictEqual(out.text, 'one\t2.0\n"two\nlines"\t4.0', 'the text as shown, with quotes for a new line');
        const g = JSON.parse(out.grid);
        assert.strictEqual(g.cells[0][0].v, 'one');
        assert.strictEqual(g.cells[0][1].v, 2, 'the value, not its text');
        assert.deepStrictEqual([g.cells[0][0].f.bold, g.cells[0][0].f.fill], [true, '#ff0000'], 'with its style');
        assert.strictEqual(g.cells[0][1].f.type, 'number');
        await clip('cp', 'cut');
        assert.strictEqual(await text('cp', 0, 0), '', 'cut empties');
        assert.strictEqual(await text('cp', 1, 1), '4.0', 'a locked cell is not emptied');
    });

    await ok('paste: text from Excel at the selected cell; one cell over a selection fills it; locked cells and a read-only grid are not touched; a copy of this grid brings its values', async () => {
        await mount('ps', { mode: 'editable', rows: 20, cols: 8, cellRules: [{ range: 'C1:C5', type: 'number' }], locks: [{ range: 'B2', locked: true }] });
        await clickAt(cell('ps', 0, 0));
        await clip('ps', 'paste', { 'text/plain': 'a\tb\tc\n1\t2\t3\r\nx\ty\tz\r\n' });
        assert.deepStrictEqual([await text('ps', 0, 0), await text('ps', 0, 1), await text('ps', 0, 2)], ['a', 'b', 'c']);
        assert.strictEqual(await text('ps', 1, 1), '', 'the locked cell B2 was not written');
        assert.deepStrictEqual([await text('ps', 1, 0), await text('ps', 1, 2), await text('ps', 2, 2)], ['1', '3', 'z']);
        const ev = await events('ps', 'cellChange');
        assert.ok(ev.some((x) => x.address === 'C2' && x.new === 3), 'a number cell took the text as a number');
        assert.ok(!ev.some((x) => x.address === 'B2'), 'and nothing was told of the locked one');
        // one cell over a selection fills it
        await dragCells('ps', cell('ps', 5, 4), cell('ps', 6, 5));
        await clip('ps', 'paste', { 'text/plain': 'same' });
        assert.deepStrictEqual([await text('ps', 5, 4), await text('ps', 5, 5), await text('ps', 6, 4), await text('ps', 6, 5)], ['same', 'same', 'same', 'same']);
        // a copy of this grid: values
        await dragCells('ps', cell('ps', 0, 0), cell('ps', 0, 2));
        const copied = await clip('ps', 'copy');
        await clickAt(cell('ps', 4, 0));
        await clip('ps', 'paste', { 'text/plain': copied.text, 'application/x-nexa-grid': copied.grid });
        assert.deepStrictEqual([await text('ps', 4, 0), await text('ps', 4, 1), await text('ps', 4, 2)], ['a', 'b', 'c']);
        // read only
        await js('NexaTest.setProps("ps", { mode: "readonly" })'); await settle();
        await clickAt(cell('ps', 7, 0));
        await clip('ps', 'paste', { 'text/plain': 'nope' });
        assert.strictEqual(await text('ps', 7, 0), '', 'a read-only grid takes no paste');
    });

    await ok('fill handle: the dot at the corner of the selection; dragged down it copies the value and numbers go up; Ctrl copies as it is; text that ends in a number goes up too', async () => {
        await mount('fh', { mode: 'editable', rows: 30, cols: 8, cells: { A1: 5, B1: 'Item 1', C1: 'same', D1: 10, D2: 20 } }, { width: 700, height: 700 });
        await clickAt(cell('fh', 0, 0));
        assert.strictEqual(await js(q('fh', '[data-r="0"][data-c="0"] [data-fill]') + ' ? 1 : 0'), 1, 'the handle is on the selection\'s corner cell');
        assert.strictEqual(await js(q('fh', '[data-r="1"][data-c="0"] [data-fill]') + ' ? 1 : 0'), 0, 'only there');
        await dragCells('fh', q('fh', '[data-r="0"][data-c="0"] [data-fill]'), cell('fh', 3, 0));
        assert.deepStrictEqual([await text('fh', 1, 0), await text('fh', 2, 0), await text('fh', 3, 0)], ['6', '7', '8'], 'a number goes up by one');
        // the selection grew over what was filled; the handle is now at A4
        assert.strictEqual(await js(q('fh', '[data-r="3"][data-c="0"] [data-fill]') + ' ? 1 : 0'), 1);
        await clickAt(cell('fh', 0, 1));
        await dragCells('fh', q('fh', '[data-r="0"][data-c="1"] [data-fill]'), cell('fh', 2, 1));
        assert.deepStrictEqual([await text('fh', 1, 1), await text('fh', 2, 1)], ['Item 2', 'Item 3']);
        await clickAt(cell('fh', 0, 2));
        await dragCells('fh', q('fh', '[data-r="0"][data-c="2"] [data-fill]'), cell('fh', 2, 2));
        assert.deepStrictEqual([await text('fh', 1, 2), await text('fh', 2, 2)], ['same', 'same'], 'text repeats');
        // two cells: the step between them
        await dragCells('fh', cell('fh', 0, 3), cell('fh', 1, 3));
        await dragCells('fh', q('fh', '[data-r="1"][data-c="3"] [data-fill]'), cell('fh', 3, 3));
        assert.deepStrictEqual([await text('fh', 2, 3), await text('fh', 3, 3)], ['30', '40'], 'by the step of the selection (10)');
        // Ctrl: as it is; across; upwards
        await clickAt(cell('fh', 10, 0)); await clip('fh', 'paste', { 'text/plain': '3' });
        await dragCells('fh', q('fh', '[data-r="10"][data-c="0"] [data-fill]'), cell('fh', 12, 0), 2);
        assert.deepStrictEqual([await text('fh', 11, 0), await text('fh', 12, 0)], ['3', '3'], 'Ctrl copies as it is');
        await clickAt(cell('fh', 15, 2));
        await clip('fh', 'paste', { 'text/plain': '1' });
        await dragCells('fh', q('fh', '[data-r="15"][data-c="2"] [data-fill]'), cell('fh', 15, 5));
        assert.deepStrictEqual([await text('fh', 15, 3), await text('fh', 15, 4), await text('fh', 15, 5)], ['2', '3', '4'], 'across, to the right');
        await clickAt(cell('fh', 20, 2));
        await clip('fh', 'paste', { 'text/plain': '10' });
        await dragCells('fh', q('fh', '[data-r="20"][data-c="2"] [data-fill]'), cell('fh', 18, 2));
        assert.deepStrictEqual([await text('fh', 19, 2), await text('fh', 18, 2)], ['9', '8'], 'upwards: before the selection, going down in value');
        // the events say what changed
        const ev = await events('fh', 'cellChange');
        assert.ok(ev.some((x) => x.address === 'A2' && x.old === null && x.new === 6));
        // no handle on a read-only grid
        await js('NexaTest.setProps("fh", { mode: "readonly" })'); await settle();
        await clickAt(cell('fh', 0, 0));
        assert.strictEqual(await js(q('fh', '[data-fill]') + ' ? 1 : 0'), 0, 'a read-only grid has no handle');
    });

    await ok('the Edit grid dialog: a paste and a fill bring values AND styles (as short rules), each one step of history', async () => {
        const dlg = (sel) => `document.querySelector("nexa-data-grid-editor ${sel}")`;
        const prev = () => `${dlg('.dge-prev')}.firstElementChild.shadowRoot`;
        const pcell = (r, c) => `${prev()}.querySelector('[data-r="${r}"][data-c="${c}"]')`;
        await js(`window.__sets = []; NEXA.getComponent("nexa-ui-data-grid").nexa.props.editGrid.buttons[0].run({ cells: { A1: 1 }, cellRules: [{ range: "A1", bold: true, fill: "#ff0000" }] }, { set: function (k, v) { window.__sets.push([k, v]); } })`);
        await settle(); await wait(300);
        const grid = `${dlg('.dge-prev')}.firstElementChild.shadowRoot.querySelector(".grid")`;
        const clipP = (type, data) => js(`(function () { var g = ${grid}; var dt = new DataTransfer(); var d = ${JSON.stringify(data || {})}; Object.keys(d).forEach(function (k) { dt.setData(k, d[k]); }); g.dispatchEvent(new ClipboardEvent(${JSON.stringify(type)}, { clipboardData: dt, bubbles: true, cancelable: true, composed: true })); return { text: dt.getData("text/plain"), grid: dt.getData("application/x-nexa-grid") }; })()`);
        const dragP = async (from, to) => {
            const a = await js(`(function () { var b = ${from}.getBoundingClientRect(); return { x: b.left + Math.min(12, b.width / 2), y: b.top + Math.min(8, b.height / 2) }; })()`);
            const b = await js(`(function () { var b = ${to}.getBoundingClientRect(); return { x: b.left + Math.min(12, b.width / 2), y: b.top + Math.min(8, b.height / 2) }; })()`);
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, buttons: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
            await settle(); await wait(150);
        };
        // copy A1 (a bold red 1), paste it at C3: the value and the style
        await dragP(pcell(0, 0), pcell(0, 0));
        const copied = await clipP('copy');
        await dragP(pcell(2, 2), pcell(2, 2));
        await clipP('paste', { 'text/plain': copied.text, 'application/x-nexa-grid': copied.grid });
        assert.strictEqual(await js(`${pcell(2, 2)}.textContent.trim()`), '1');
        assert.strictEqual(await js(`getComputedStyle(${pcell(2, 2)}).fontWeight`), '700', 'the style came with it');
        assert.strictEqual(await js(`getComputedStyle(${pcell(2, 2)}).backgroundColor`), 'rgb(255, 0, 0)');
        // fill A1 down three cells: values go up, the style repeats
        await dragP(pcell(0, 0), pcell(0, 0));
        await dragP(`${prev()}.querySelector('[data-r="0"][data-c="0"] [data-fill]')`, pcell(3, 0));
        assert.deepStrictEqual([await js(`${pcell(1, 0)}.textContent.trim()`), await js(`${pcell(3, 0)}.textContent.trim()`)], ['2', '4']);
        assert.strictEqual(await js(`getComputedStyle(${pcell(3, 0)}).fontWeight`), '700', 'the style repeats in the fill');
        // undo takes the fill back in one step
        await js(`document.querySelector("nexa-data-grid-editor")._undo()`); await settle(); await wait(100);
        assert.strictEqual(await js(`${pcell(1, 0)}.textContent.trim()`), '', 'one Undo: the whole fill');
        assert.strictEqual(await js(`${pcell(2, 2)}.textContent.trim()`), '1', 'the paste before it is still there');
        await js(`document.querySelector("nexa-data-grid-editor")._redo()`); await settle(); await wait(100);
        await clickAt(`Array.from(document.querySelectorAll(".nx-dialog-foot button")).filter(function (b) { return b.textContent.trim() === "Apply"; })[0]`);
        await wait(120);
        const s = Object.fromEntries(await js('window.__sets'));
        assert.deepStrictEqual(Object.keys(s).sort(), ['cellRules', 'cells']);
        assert.deepStrictEqual(s.cells, { A1: 1, A2: 2, A3: 3, A4: 4, C3: 1 });
        const rules = s.cellRules.filter((r) => r.range !== 'A1');
        assert.ok(rules.length <= 3, 'the styles are a few short rules: ' + JSON.stringify(rules));
        assert.ok(rules.some((r) => r.range === 'A2:A4' && r.bold === true), 'one range for the filled column: ' + JSON.stringify(rules));
    });

    // ---- sort (a view over an area) and find (Ctrl+F) ----------------------------------------------------------------------------------------------
    const colA = (n, from, to) => js(`(function () { var root = ${root(n)}; var out = []; for (var r = ${from}; r <= ${to}; r++) { var e = root.querySelector('[data-r="' + r + '"][data-c="0"]'); out.push(e ? e.textContent.trim() : null); } return out; })()`);

    await ok('sort on a page: a button on the letters of the area, ascending / descending / back; a view only: the heading stays, empty last, edits and events keep the cell\'s own address', async () => {
        await mount('so', {
            mode: 'editable', sortArea: 'A1:C6',
            cells: { A1: 'Name', B1: 'Qty', C1: 'Note', A2: 'pear', B2: 3, A3: 'apple', B3: 10, A4: 'fig', B4: 2, A5: 'kiwi', A6: 'date', B6: 7 }
        });
        assert.deepStrictEqual(await js(qa('so', '[data-sortc]') + '.map(function (e) { return e.dataset.sortc; })'), ['0', '1', '2'], 'a button on the letters of the area only');
        const names = () => colA('so', 0, 5);
        await clickAt(q('so', '[data-sortc="1"]'));
        assert.deepStrictEqual(await names(), ['Name', 'fig', 'pear', 'date', 'apple', 'kiwi'], 'by Qty, ascending; the heading stays; the empty one is last');
        assert.deepStrictEqual((await events('so', 'sortChange'))[0], { column: 'B', direction: 'asc' });
        await clickAt(q('so', '[data-sortc="1"]'));
        assert.deepStrictEqual(await names(), ['Name', 'apple', 'date', 'pear', 'fig', 'kiwi'], 'descending: the empty one is still last');
        // an edit on the sorted view goes to the cell's own row, and is told by its own address
        await clickAt(cell('so', 1, 0), 2); await typeText('!'); await press('Enter');
        assert.strictEqual((await events('so', 'cellChange')).pop().address, 'A3', 'apple is A3, wherever it is shown');
        await clickAt(q('so', '[data-sortc="1"]'));
        assert.deepStrictEqual(await names(), ['Name', 'pear', 'apple!', 'fig', 'kiwi', 'date'], 'the order of the sheet again, with the edit in apple\'s row');
        // Logic can sort too; getData is the sheet's own order
        await js('NexaTest.invoke("so", "sortColumn", { column: "A", direction: "asc" })'); await settle(); await wait(60);
        assert.deepStrictEqual((await names()).slice(1, 3), ['apple!', 'date']);
        assert.deepStrictEqual((await events('so', 'sortChange')).pop(), { column: 'A', direction: 'asc' });
        await js('NexaTest.invoke("so", "getData")'); await settle();
        assert.strictEqual((await events('so', 'data'))[0].cells.A3, 'apple!');
        // off
        await js('NexaTest.setProps("so", { sortable: false })'); await settle();
        assert.strictEqual(await js(q('so', '[data-sortc]') + ' ? 1 : 0'), 0);
        assert.deepStrictEqual((await names()).slice(1, 3), ['pear', 'apple!'], 'and the order is the sheet\'s');
        await js(`NexaTest.mount("so2", "nexa-ui-${ID}", { sortArea: "A1:C6" }, { width: 400, height: 200, design: true })`); await settle(); await wait(60);
        assert.strictEqual(await js(q('so2', '[data-sortc]') + ' ? 1 : 0'), 0, 'the design canvas has no sort button');
    });

    await ok('sort follows what a message fills: the new rows are sorted by the choice the user made', async () => {
        await mount('so3', { sortArea: 'A1:B9', sortHeader: false, populate: [{ at: 'A1', value: bind('rows'), header: false }] });
        await message('so3', { rows: [['c', 3], ['a', 1], ['b', 2]] });
        await clickAt(q('so3', '[data-sortc="0"]'));
        assert.deepStrictEqual(await colA('so3', 0, 2), ['a', 'b', 'c']);
        await message('so3', { rows: [['z', 9], ['y', 8], ['x', 7], ['w', 6]] });
        assert.deepStrictEqual(await colA('so3', 0, 3), ['w', 'x', 'y', 'z'], 'a new message, still sorted by A');
    });

    await ok('find: Ctrl+F opens a search box; the cells that hold the text are marked, Enter goes to the next (round), Shift+Enter back, a case box, Esc closes', async () => {
        await mount('fd', { rows: 20, cells: { A1: 'Pump 1', B2: 'pump', C5: 'Mixer', A7: 'PUMP B' } }, { width: 700, height: 360 });
        await clickAt(cell('fd', 4, 4));
        await press2('f', 2);
        assert.strictEqual(await js(q('fd', '.findbar') + ' ? 1 : 0'), 1, 'the search box is open');
        await typeText('pump');
        assert.strictEqual(await js(q('fd', '.findbar .fc') + '.textContent'), '1 / 3');
        assert.ok((await js(cell('fd', 0, 0) + '.className')).includes('foundcur'), 'the first match is the current one');
        assert.ok((await js(cell('fd', 1, 1) + '.className')).includes('found'));
        assert.ok(!(await js(cell('fd', 2, 2) + '.className')).includes('found'), 'Mixer does not match');
        assert.strictEqual((await events('fd', 'selectionChange')).pop().address, 'A1', 'the match is selected');
        await press('Enter');
        assert.ok((await js(cell('fd', 1, 1) + '.className')).includes('foundcur'), 'Enter: the next');
        await press('Enter'); await press('Enter');
        assert.ok((await js(cell('fd', 0, 0) + '.className')).includes('foundcur'), 'and round to the first');
        await press('Enter', 8);
        assert.strictEqual((await events('fd', 'selectionChange')).pop().address, 'A7', 'Shift+Enter: the one before the first is the last');
        assert.strictEqual(await js(q('fd', '.findbar .fc') + '.textContent'), '3 / 3');
        await clickAt(q('fd', '[data-findcase]'));
        assert.strictEqual(await js(q('fd', '.findbar .fc') + '.textContent'), '1 / 1', 'match case: only the cell that holds exactly pump');
        await press('Escape');
        assert.strictEqual(await js(q('fd', '.findbar') + ' ? 1 : 0'), 0, 'Esc closes it');
        assert.ok(!(await js(cell('fd', 0, 0) + '.className')).includes('found'), 'and the marks go');
        await js('NexaTest.setProps("fd", { findable: false })'); await settle();
        await clickAt(cell('fd', 4, 4)); await press2('f', 2);
        assert.strictEqual(await js(q('fd', '.findbar') + ' ? 1 : 0'), 0, 'findable off: Ctrl+F does nothing');
    });

    await ok('the Edit grid dialog: Sort A→Z / Z→A moves the typed cells of the selected rows (physical)', async () => {
        const dlg = (sel) => `document.querySelector("nexa-data-grid-editor ${sel}")`;
        const prev = () => `${dlg('.dge-prev')}.firstElementChild.shadowRoot`;
        await js(`window.__sets = []; NEXA.getComponent("nexa-ui-data-grid").nexa.props.editGrid.buttons[0].run({ cells: { A1: "b", B1: 2, A2: "a", B2: 1, A3: "c", B3: 3 } }, { set: function (k, v) { window.__sets.push([k, v]); } })`);
        await settle(); await wait(300);
        const pc = (r, c) => `${prev()}.querySelector('[data-r="${r}"][data-c="${c}"]')`;
        const a = await js(`(function () { var b = ${pc(0, 0)}.getBoundingClientRect(); return { x: b.left + 12, y: b.top + 8 }; })()`);
        const b = await js(`(function () { var b = ${pc(2, 1)}.getBoundingClientRect(); return { x: b.left + 12, y: b.top + 8 }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, buttons: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
        await settle(); await wait(150);
        await clickAt(`Array.from(document.querySelectorAll("nexa-data-grid-editor button")).filter(function (x) { return x.textContent.trim() === "A→Z"; })[0]`);
        assert.deepStrictEqual([await js(`${pc(0, 0)}.textContent.trim()`), await js(`${pc(0, 1)}.textContent.trim()`), await js(`${pc(2, 0)}.textContent.trim()`)], ['a', '1', 'c'], 'a row moved as one');
        await clickAt(`Array.from(document.querySelectorAll("nexa-data-grid-editor button")).filter(function (x) { return x.textContent.trim() === "Z→A"; })[0]`);
        assert.strictEqual(await js(`${pc(0, 0)}.textContent.trim()`), 'c');
        await clickAt(`Array.from(document.querySelectorAll(".nx-dialog-foot button")).filter(function (x) { return x.textContent.trim() === "Apply"; })[0]`);
        await wait(120);
        const s = Object.fromEntries(await js('window.__sets'));
        assert.deepStrictEqual(s.cells, { A1: 'c', B1: 3, A2: 'b', B2: 2, A3: 'a', B3: 1 });
    });

    await ok('saving: at once, On Save after each cell (a paste: once); with a message, the changes wait without a box until the action Save, and Discard throws them away', async () => {
        await mount('sv', { mode: 'editable', rows: 20, cells: { A1: 'one' } });
        await clickAt(cell('sv', 0, 0), 2); await typeText('!'); await press('Enter');
        let s = await events('sv', 'save');
        assert.deepStrictEqual(s.map((x) => x.cells.map((c) => [c.address, c.old, c.new])), [[['A1', 'one', 'one!']]], 'at once: one On Save for the cell');
        await clickAt(cell('sv', 2, 2));
        await clip('sv', 'paste', { 'text/plain': 'a\tb\nc\td' });
        s = await events('sv', 'save');
        assert.strictEqual(s.length, 2, 'a paste is one more On Save');
        assert.strictEqual(s[1].cells.length, 4, 'with all its cells');
        // by message
        await mount('sv2', { mode: 'editable', saveMode: 'message', cells: { A1: 'one' } });
        await clickAt(cell('sv2', 0, 0), 2); await typeText('?'); await press('Enter');
        assert.deepStrictEqual(await events('sv2', 'save'), [], 'nothing is saved yet');
        assert.strictEqual((await events('sv2', 'cellChange')).length, 1, 'but the change is told');
        assert.ok((await js(cell('sv2', 0, 0) + '.className')).includes('dirty'), 'and marked');
        assert.strictEqual(await js(q('sv2', '.staged') + ' ? 1 : 0'), 0, 'no box');
        await js('NexaTest.invoke("sv2", "save")'); await settle();
        assert.deepStrictEqual((await events('sv2', 'save'))[0].cells.map((c) => [c.address, c.old, c.new]), [['A1', 'one', 'one?']]);
        assert.ok(!(await js(cell('sv2', 0, 0) + '.className')).includes('dirty'));
        await clickAt(cell('sv2', 0, 0), 2); await typeText('#'); await press('Enter');
        await js('NexaTest.invoke("sv2", "discard")'); await settle();
        assert.strictEqual(await text('sv2', 0, 0), 'one?', 'discarded: what was saved is shown');
        assert.strictEqual((await events('sv2', 'discard'))[0].count, 1);
        // the small box: On Save only on the button
        await mount('sv3', { mode: 'editable', saveMode: 'bar', cells: { A1: 'one' } });
        await clickAt(cell('sv3', 0, 0), 2); await typeText('x'); await press('Enter');
        assert.deepStrictEqual(await events('sv3', 'save'), []);
        assert.strictEqual(await js(q('sv3', '.staged') + ' ? 1 : 0'), 1, 'the box');
    });

    await ok('populate with its own look: the rule gives the cells it fills a type and a style; a cell object in the message overrides them (in a list, a block, a field of a table row); wrapped text grows the row', async () => {
        const css = (n, r, c) => js(`(function () { var s = getComputedStyle(${cell(n, r, c)}); return { w: s.fontWeight, bg: s.backgroundColor, color: s.color, jc: s.justifyContent }; })()`);
        await mount('po', {
            rows: 40,
            populate: [
                { at: 'A1', value: bind('list'), type: 'number', decimals: 1, fill: '#ffe0b2', bold: true },
                { at: 'C1', value: bind('block') },
                { at: 'E1', value: bind('table'), fields: 'name, temp' },
                { at: 'G1', value: bind('note'), wrap: true }
            ]
        });
        await message('po', {
            list: [1.234, { value: 2.5, fill: '#ff0000', bold: false }, { value: 'text', type: 'text' }],
            block: [[{ value: 1, color: '#00ff00' }, 2], [3, { value: 4, fill: '#0000ff' }]],
            table: [{ name: 'Pump', temp: { value: 93, fill: '#ff0000' } }, { name: 'Mixer', temp: 20 }],
            note: 'word '.repeat(40)
        });
        assert.strictEqual(await text('po', 0, 0), '1.2', 'the rule\'s type: a number with one decimal');
        assert.deepStrictEqual(await css('po', 0, 0), { w: '700', bg: 'rgb(255, 224, 178)', color: await js(`getComputedStyle(${cell('po', 1, 2)}).color`), jc: 'flex-end' }, 'the rule\'s bold and fill, and a number on the right');
        const o = await css('po', 1, 0);
        assert.deepStrictEqual([await text('po', 1, 0), o.w, o.bg], ['2.5', '400', 'rgb(255, 0, 0)'], 'a cell object over the rule\'s defaults: its fill, not bold');
        assert.strictEqual(await text('po', 2, 0), 'text', 'and its own type');
        assert.strictEqual((await css('po', 0, 2)).color, 'rgb(0, 255, 0)', 'in a block');
        assert.strictEqual((await css('po', 1, 3)).bg, 'rgb(0, 0, 255)');
        assert.deepStrictEqual([await text('po', 0, 4), await text('po', 0, 5), await text('po', 1, 5)], ['Pump', '93', '20'], 'a table: its field that is a cell object');
        assert.strictEqual((await css('po', 0, 5)).bg, 'rgb(255, 0, 0)');
        assert.strictEqual((await css('po', 1, 5)).bg, 'rgb(255, 255, 255)', 'the other row has nothing');
        const h = (await size('po', 0, 6)).h;
        assert.ok(h > 100, 'the rule wrap made the row grow to fit: ' + h);
        // a new message replaces the values and the styles that came with them
        await message('po', { list: [9], block: [], table: [], note: 'short' });
        assert.deepStrictEqual([await text('po', 0, 0), await text('po', 1, 0)], ['9.0', ''], 'the new value');
        assert.strictEqual((await css('po', 1, 0)).bg, 'rgb(255, 255, 255)', 'and the fill of the old cell object is gone');
    });

    await ok('the shape of a value: a list of cell objects, a table of rows with a field value, the rule can force it; the action Fill cells takes cell objects too', async () => {
        await mount('sh', {
            rows: 20,
            populate: [{ at: 'A1', value: bind('a') }, { at: 'C1', value: bind('b'), shape: 'list' }, { at: 'E1', value: bind('b'), shape: 'table' }]
        });
        await message('sh', { a: [{ value: 'x', fill: '#ff0000' }, { value: 'y' }], b: [{ value: 1, id: 'p' }, { value: 2, id: 'q' }] });
        assert.deepStrictEqual([await text('sh', 0, 0), await text('sh', 1, 0)], ['x', 'y'], 'objects that are all cells: a list of cells');
        assert.deepStrictEqual([await text('sh', 0, 2), await text('sh', 0, 3)], ['{"value":1,"id":"p"}', ''], 'a list: each object is one cell, shown as JSON');
        assert.deepStrictEqual([await text('sh', 0, 4), await text('sh', 0, 5), await text('sh', 1, 5)], ['1', 'p', 'q'], 'a table: a column per field');
        await js(`NexaTest.invoke("sh", "setRange", { at: "A10", values: [{ value: 5, fill: "#00ff00" }, 6], direction: "right" })`); await settle(); await wait(60);
        assert.deepStrictEqual([await text('sh', 9, 0), await text('sh', 9, 1)], ['5', '6']);
        assert.strictEqual(await js(`getComputedStyle(${cell('sh', 9, 0)}).backgroundColor`), 'rgb(0, 255, 0)', 'the action sets the style too');
    });

    await ok('a populate rule has a tree of its own: Where, Data, Type, Text, Cell', async () => {
        const r = await js(`(async function () {
            var t = NexaTest.inspector("nexa-ui-${ID}", { populate: [{ at: "B2" }] });
            await new Promise(function (r) { setTimeout(r, 250); });
            await t.field("populate#0.fill");
            var ids = NexaTest.rows(t.box).map(function (x) { return x.id; }).filter(function (id) { return /^populate#0\\//.test(id); });
            t.destroy();
            return ids;
        })()`);
        for (const s of ['Where', 'Data', 'Type', 'Text', 'Cell']) assert.ok(r.indexOf('populate#0/' + s) !== -1, 'the section ' + s + ' in ' + r.join(' | '));
    });

    // ---- export to Excel ---------------------------------------------------------------------------------------------------------------------------
    // the file the page hands the browser (a link with a blob and a file name), read back here: a stored zip, its files, their CRC
    const hookDownload = () => js(`(function () {
        window.__dl = null;
        if (!window.__dlHooked) {
            window.__dlHooked = true;
            var click = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function () {
                var a = this;
                if (a.download && /^blob:/.test(a.href)) {
                    fetch(a.href).then(function (r) { return r.blob(); }).then(function (b) {
                        var rd = new FileReader();
                        rd.onload = function () { window.__dl = { name: a.download, data: String(rd.result).split(",")[1] }; };
                        rd.readAsDataURL(b);
                    });
                    return;
                }
                return click.apply(this, arguments);
            };
        }
        return true;
    })()`);
    const download = async () => { for (let i = 0; i < 40; i++) { const d = await js('window.__dl'); if (d) return d; await wait(100); } return null; };
    const readZip = (b64) => {
        const buf = Buffer.from(b64, 'base64'), files = {};
        let i = 0;
        while (buf.readUInt32LE(i) === 0x04034b50) {
            const method = buf.readUInt16LE(i + 8), crc = buf.readUInt32LE(i + 14), size = buf.readUInt32LE(i + 18), nameLen = buf.readUInt16LE(i + 26), extra = buf.readUInt16LE(i + 28);
            const name = buf.toString('utf8', i + 30, i + 30 + nameLen), start = i + 30 + nameLen + extra, data = buf.slice(start, start + size);
            assert.strictEqual(method, 0, name + ' is stored');
            assert.strictEqual(require('zlib').crc32(data), crc, name + ': the CRC is right');
            files[name] = data.toString('utf8');
            i = start + size;
        }
        return files;
    };

    await ok('export to Excel: the action and the corner button download an .xlsx with the values, formats, styles, merges, sizes and frozen panes of the sheet as it is shown', async () => {
        await mount('xl', {
            rows: 30, cols: 8, exportable: true, freezeRows: 1, sortArea: 'A1:B4',
            cells: { A1: 'Machine', B1: 'Temp', C1: 'On', D1: '2026-01-01T12:00:00', A2: 'Mixer <1>', B2: 71.456, C2: true, A3: 'Pump', B3: 12, A4: 'Fig', B4: 3, F6: 'far' },
            cellRules: [{ range: '1:1', bold: true, fill: '#d0e2ff', color: '#ff0000' }, { range: 'B2:B4', type: 'number', decimals: 1, suffix: ' °C' }, { range: 'C2', type: 'boolean' }, { range: 'D1', type: 'date', dateFormat: 'date' }, { range: 'A2', wrap: true, align: 'center' }],
            merges: ['E2:F3'], borders: [{ range: 'A1:B1', sides: 'bottom', width: 2, color: 'primary' }],
            colRules: [{ columns: 'A', width: 200 }], rowRules: [{ rows: '3', height: 60 }]
        });
        await hookDownload();
        await js('NexaTest.invoke("xl", "exportXlsx", { name: "plant" })');
        const d = await download();
        assert.ok(d, 'a file was handed to the browser');
        assert.strictEqual(d.name, 'plant.xlsx', 'the name gets .xlsx');
        const files = readZip(d.data);
        assert.deepStrictEqual(Object.keys(files), ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']);
        const sheet = files['xl/worksheets/sheet1.xml'], styles = files['xl/styles.xml'];
        assert.ok(sheet.includes('Mixer &lt;1&gt;'), 'text, escaped');
        assert.ok(/<c r="B2" s="\d+"><v>71.456<\/v><\/c>/.test(sheet), 'a number is a number, not its text');
        assert.ok(/<c r="C2" s="\d+" t="b"><v>1<\/v><\/c>/.test(sheet), 'a checkbox is a boolean');
        assert.ok(/<c r="D1" s="\d+"><v>46023\.5<\/v><\/c>/.test(sheet), 'a date is a serial number');
        assert.ok(sheet.includes('<mergeCell ref="E2:F3"/>'), 'the merge');
        assert.ok(sheet.includes('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'), 'the frozen row');
        assert.ok(sheet.includes('<col min="1" max="1" width="27.86" customWidth="1"/>'), 'the width of A (200 px)');
        assert.ok(sheet.includes('<row r="3" ht="45" customHeight="1">'), 'the height of row 3 (60 px)');
        assert.ok(styles.includes('formatCode="0.0&quot; °C&quot;"') && styles.includes('formatCode="yyyy-mm-dd"'), 'the number and date formats');
        assert.ok(styles.includes('<b/>') && styles.includes('<color rgb="FFFF0000"/>') && styles.includes('<fgColor rgb="FFD0E2FF"/>'), 'bold, the colour, the fill');
        assert.ok(styles.includes('<bottom style="medium"><color rgb="FF0F62FF"/></bottom>') || styles.includes('<top style="medium"><color rgb="FF0F62FF"/></top>'), 'the border');
        assert.ok(styles.includes('horizontal="center"') && styles.includes('wrapText="1"'), 'the alignment and the wrap');
        // every file is well-formed XML (Excel is strict)
        const bad = await js(`(function () { var f = ${JSON.stringify(files)}; return Object.keys(f).filter(function (n) { var d = new DOMParser().parseFromString(f[n], "application/xml"); return d.getElementsByTagName("parsererror").length > 0; }); })()`);
        assert.deepStrictEqual(bad, [], 'every file parses as XML');
        // what the view shows is what is exported: sorted descending by B, the rows under the heading change places
        await js('NexaTest.invoke("xl", "sortColumn", { column: "B", direction: "desc" })'); await settle(); await wait(60);
        await js('window.__dl = null'); await js('NexaTest.invoke("xl", "exportXlsx")');
        const sorted = readZip((await download()).data)['xl/worksheets/sheet1.xml'];
        assert.ok(sorted.indexOf('<v>71.456</v>') < sorted.indexOf('<v>12</v>') && sorted.indexOf('<v>12</v>') < sorted.indexOf('<v>3</v>'), 'the sorted order');
        // the corner button
        assert.strictEqual(await js(q('xl', '[data-xlsx]') + ' ? 1 : 0'), 1, 'the button in the corner');
        await js('window.__dl = null');
        await clickAt(q('xl', '[data-xlsx]'));
        assert.strictEqual((await download()).name, 'sheet.xlsx', 'the corner button downloads too');
        await mount('xl2', { exportable: false });
        assert.strictEqual(await js(q('xl2', '[data-xlsx]') + ' ? 1 : 0'), 0, 'no button unless asked for');
    });

    await ok('export to Excel: an empty sheet is a valid file; the Edit grid dialog exports what it shows; the design canvas does not', async () => {
        await mount('xl3', {});
        await hookDownload();
        await js('NexaTest.invoke("xl3", "exportXlsx", "empty.xlsx")');
        const e = await download();
        assert.strictEqual(e.name, 'empty.xlsx');
        assert.ok(readZip(e.data)['xl/worksheets/sheet1.xml'].includes('<sheetData></sheetData>'));
        await js(`NexaTest.mount("xl4", "nexa-ui-${ID}", { cells: { A1: "x" } }, { width: 400, height: 200, design: true })`); await settle(); await wait(60);
        await js('window.__dl = null'); await js('NexaTest.invoke("xl4", "exportXlsx")'); await wait(300);
        assert.strictEqual(await js('window.__dl'), null, 'the design canvas exports nothing');
        // the dialog
        await js(`window.__sets = []; NEXA.getComponent("nexa-ui-data-grid").nexa.props.editGrid.buttons[0].run({ cells: { A1: "typed", B2: 5 } }, { set: function () {} })`);
        await settle(); await wait(300);
        await js('window.__dl = null');
        await clickAt(`Array.from(document.querySelectorAll("nexa-data-grid-editor button")).filter(function (b) { return b.textContent.trim() === "Excel (.xlsx)"; })[0]`);
        const dd = await download();
        assert.strictEqual(dd.name, 'sheet.xlsx');
        const sheet = readZip(dd.data)['xl/worksheets/sheet1.xml'];
        assert.ok(sheet.includes('typed') && sheet.includes('<v>5</v>'), 'the design as the preview shows it');
        await clickAt(`Array.from(document.querySelectorAll(".nx-dialog-foot button")).filter(function (b) { return b.textContent.trim() === "Cancel"; })[0]`);
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
        for (const l of ['Rows', 'Columns', 'Column width', 'Row height', 'Area shown', 'Frozen rows', 'Frozen columns', 'Populate from messages', 'Mode', 'Saving', 'Show the column letters and row numbers', 'Show the grid lines', 'Selection']) assert.ok(r.includes(l), 'inspector: ' + l + ' in ' + r.join(' | '));
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

    // ---- formulas ----------------------------------------------------------------------------------------------------------------------------
    const formulasOf = async (n) => { await js(`NexaTest.invoke(${JSON.stringify(n)}, "getData")`); await settle(); return (await events(n, 'data')).pop(); };
    const typeInto = async (n, r, c, value) => {
        await clickAt(cell(n, r, c), 2);
        await js(`(function () { var i = ${q(n, '[data-edit]')}; i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
        await press('Enter');
    };

    await ok('formulas: a cell that starts with = shows its result; a change in a cell it reads changes it at once; an error shows as its code', async () => {
        await mount('fx', { mode: 'editable', cells: { A1: 5, A2: 7, A3: '=SUM(A1:A2)', B1: '=A1*2', B2: '=A1/0', B3: '=IF(A1>3,"big","small")', C1: '=A3&" units"', C2: '=A1>3', D1: '=A1+B1+C9' } });
        assert.deepStrictEqual([await text('fx', 2, 0), await text('fx', 0, 1), await text('fx', 1, 1), await text('fx', 2, 1)], ['12', '10', '#DIV/0!', 'big']);
        assert.strictEqual(await text('fx', 0, 2), '12 units', 'a formula over a formula');
        assert.strictEqual(await text('fx', 1, 2), 'TRUE', 'a boolean is the word, as in Excel');
        assert.strictEqual(await text('fx', 0, 3), '15', 'an empty cell is 0');
        assert.strictEqual(await js(q('fx', '[data-r="1"][data-c="1"] .err') + ' ? 1 : 0'), 1, 'an error is marked');
        // changing a cell it reads: every formula over it follows, no Enter on the formula
        await typeInto('fx', 0, 0, '10');
        assert.deepStrictEqual([await text('fx', 2, 0), await text('fx', 0, 1), await text('fx', 2, 1), await text('fx', 0, 2), await text('fx', 0, 3)], ['17', '20', 'big', '17 units', '30'], 'all follow at once');
        await typeInto('fx', 0, 0, '1');
        assert.strictEqual(await text('fx', 2, 1), 'small', 'the other branch');
    });

    await ok('formulas: typing = in any cell starts one; the edit box has the formula text; Enter keeps it; the event has the formula; Escape leaves it', async () => {
        await mount('fe', { mode: 'editable', cells: { A1: 4, A2: 6 } });
        await clickAt(cell('fe', 2, 0));
        await typeText('=A1*A2');
        assert.strictEqual(await js(q('fe', '[data-edit]') + '.value'), '=A1*A2', 'the typed text, an input: the formula is not worked out in the box');
        await press('Enter');
        assert.strictEqual(await text('fe', 2, 0), '24');
        const ch = (await events('fe', 'cellChange')).pop();
        assert.deepStrictEqual([ch.address, ch.new], ['A3', '=A1*A2'], 'what is kept is the formula');
        await clickAt(cell('fe', 2, 0), 2);
        assert.strictEqual(await js(q('fe', '[data-edit]') + '.value'), '=A1*A2', 'editing it again shows the formula, not 24');
        await typeText('+1'); await press('Escape');
        assert.strictEqual(await text('fe', 2, 0), '24', 'Escape leaves it as it was');
        const d = await formulasOf('fe');
        assert.strictEqual(d.cells.A3, 24, 'getData: the result');
        assert.strictEqual(d.formulas.A3, '=A1*A2', 'and the formula next to it');
        assert.ok(!('A1' in d.formulas), 'plain cells have no formula');
    });

    await ok('formulas: the result is drawn as the cell\'s type: a bar for progress, decimals for a number, a date for a date, a badge for a choice, a checkbox', async () => {
        await mount('ft', {
            cells: { A1: 40, A2: '=A1+10', B1: '=1/3', C1: '=DATE(2026,3,7)', D1: '=IF(A1>30,"hot","ok")', E1: '=A1>30', F1: '=A1*2' },
            cellRules: [{ range: 'A2', type: 'progress', max: 100 }, { range: 'B1', type: 'number', decimals: 2, suffix: ' x' }, { range: 'C1', type: 'date', dateFormat: 'date' },
                { range: 'D1', type: 'badge', options: 'hot:Hot,ok:Fine' }, { range: 'E1', type: 'boolean' }, { range: 'F1', type: 'progress', max: 50 }]
        });
        assert.strictEqual(await js(q('ft', '[data-r="1"][data-c="0"] .bar i') + '.style.width'), '50%', '=A1+10 is 50 and the bar is half');
        assert.strictEqual(await text('ft', 1, 0), '50%');
        assert.strictEqual(await text('ft', 0, 1), '0.33 x', 'decimals and suffix on the result');
        assert.strictEqual(await text('ft', 0, 2), '2026-03-07', 'a serial number in a date cell is a date');
        assert.strictEqual(await text('ft', 0, 3), 'Hot', 'a badge of the result');
        assert.strictEqual(await js(q('ft', '[data-r="0"][data-c="4"] .cb.on') + ' ? 1 : 0'), 1, 'TRUE is a ticked box');
        assert.strictEqual(await js(q('ft', '[data-r="0"][data-c="5"] .bar i') + '.style.width'), '100%', 'the bar is cut at its largest');
    });

    await ok('formulas: a date cell is a serial number to a formula; a message never makes a formula; an action does; a cycle is #CYCLE!', async () => {
        await mount('fd', { cells: { A1: '2026-03-01', B1: '=A1+30', C1: '=B1-A1', D1: '=YEAR(A1)&"/"&MONTH(A1)', E1: '=E1+1', F1: '=G1', G1: '=F1' }, cellRules: [{ range: 'A1:B1', type: 'date', dateFormat: 'date' }] });
        assert.strictEqual(await text('fd', 0, 1), '2026-03-31', 'a date plus 30 days');
        assert.strictEqual(await text('fd', 0, 2), '30');
        assert.strictEqual(await text('fd', 0, 3), '2026/3');
        assert.deepStrictEqual([await text('fd', 0, 4), await text('fd', 0, 5), await text('fd', 0, 6)], ['#CYCLE!', '#CYCLE!', '#CYCLE!']);
        await js(`NexaTest.setProps("fd", { populate: [{ at: "A5", value: ${JSON.stringify(bind('v'))} }] })`); await settle();
        await message('fd', { v: '=1+1' });
        assert.strictEqual(await text('fd', 4, 0), '=1+1', 'what a message brings is a text, whatever it starts with');
        await js('NexaTest.invoke("fd", "setCell", { address: "A6", value: "=2*21" })'); await settle(); await wait(60);
        assert.strictEqual(await text('fd', 5, 0), '42', 'an action may put in a formula');
    });

    await ok('formulas: copy and paste move the references (a cut does not); the fill handle moves them too; $ stays; a reference off the sheet is #REF!', async () => {
        await mount('fm', { mode: 'editable', rows: 30, cols: 8, cells: { A1: 1, A2: 2, A3: 3, B1: 10, B2: 20, B3: 30, D1: '=A1+$B$1', E1: '=A1' }, cellRules: [] }, { width: 700, height: 600 });
        await clickAt(cell('fm', 0, 3));
        const one = await clip('fm', 'copy');
        await clickAt(cell('fm', 1, 3));
        await clip('fm', 'paste', { 'text/plain': one.text, 'application/x-nexa-grid': one.grid });
        assert.strictEqual(await text('fm', 1, 3), '12', 'D2 is =A2+$B$1: 2 + 10');
        const d1 = await formulasOf('fm');
        assert.strictEqual(d1.formulas.D2, '=A2+$B$1', 'one row down: the relative part moved, the $ part did not');
        // a cut keeps pointing where it did
        await clickAt(cell('fm', 0, 4));
        const cut = await clip('fm', 'cut');
        await clickAt(cell('fm', 4, 4));
        await clip('fm', 'paste', { 'text/plain': cut.text, 'application/x-nexa-grid': cut.grid });
        const d2 = await formulasOf('fm');
        assert.strictEqual(d2.formulas.E5, '=A1', 'a cut formula is not moved');
        assert.ok(!('E1' in d2.formulas), 'and the cut cell is empty');
        // the fill handle: =A1+$B$1 down three rows
        await clickAt(cell('fm', 0, 3));
        await dragCells('fm', q('fm', '[data-r="0"][data-c="3"] [data-fill]'), cell('fm', 2, 3));
        const d3 = await formulasOf('fm');
        assert.deepStrictEqual([d3.formulas.D2, d3.formulas.D3], ['=A2+$B$1', '=A3+$B$1'], 'filled: each one reads its own row');
        assert.deepStrictEqual([await text('fm', 1, 3), await text('fm', 2, 3)], ['12', '13']);
        // pasted four rows up from E5 (=A1): the reference falls off the sheet
        await clickAt(cell('fm', 4, 4));
        const low = await clip('fm', 'copy');
        await clickAt(cell('fm', 0, 5));
        await clip('fm', 'paste', { 'text/plain': low.text, 'application/x-nexa-grid': low.grid });
        const d4 = await formulasOf('fm');
        assert.strictEqual(d4.formulas.F1, '=#REF!', 'A1 four rows up is above the sheet');
        assert.strictEqual(await text('fm', 0, 5), '#REF!');
    });

    await ok('formulas: a sort works on what the formulas give; a formula keeps reading the cells of the sheet, not of the view', async () => {
        await mount('fs', { rows: 20, cols: 6, sortArea: 'A1:B4', sortable: true, cells: { A1: 'Name', B1: 'Total', A2: 'x', B2: '=C2*2', A3: 'y', B3: '=C3*2', A4: 'z', B4: '=C4*2', C2: 5, C3: 1, C4: 3, E1: '=B2' } });
        await js('NexaTest.invoke("fs", "sortColumn", { column: "B", direction: "asc" })'); await settle(); await wait(60);
        assert.deepStrictEqual([await text('fs', 1, 0), await text('fs', 2, 0), await text('fs', 3, 0)], ['y', 'z', 'x'], 'ordered by the results 2, 6, 10');
        assert.deepStrictEqual([await text('fs', 1, 1), await text('fs', 2, 1), await text('fs', 3, 1)], ['2', '6', '10']);
        assert.strictEqual(await text('fs', 0, 4), '10', 'E1 reads B2 of the sheet (x: 10), not the second row of the view');
    });

    await ok('formulas: NOW() keeps ticking while it is on show; TODAY() is a whole day', async () => {
        await mount('fn', { cells: { A1: '=NOW()', A2: '=TODAY()', A3: '=A1-A2' } });
        const a = await text('fn', 0, 0);
        assert.ok(/^\d{5}\.\d+/.test(a), 'a serial number with the time: ' + a);
        assert.ok(/^\d{5}$/.test(await text('fn', 1, 0)), 'TODAY has no fraction');
        await wait(2300);
        const b = await text('fn', 0, 0);
        assert.notStrictEqual(a, b, 'the clock moved on without anyone touching the grid');
        assert.ok(Number(await text('fn', 2, 0)) < 1, 'and the formula over it follows');
    });

    await ok('formula bar: shows the address and the formula of the selected cell; typing in it edits the cell; a read-only grid shows it but cannot be typed in; the sheet keeps its place under it', async () => {
        await mount('fbr', { mode: 'editable', showFormulaBar: true, cells: { A1: 3, A2: 4, A3: '=A1+A2', B1: 'text' } });
        assert.strictEqual(await js(q('fbr', '[data-bar]') + ' ? 1 : 0'), 1, 'the bar is there');
        const barBottom = await js(`(function () { var b = ${q('fbr', '.fbar')}.getBoundingClientRect(), c = ${cell('fbr', 0, 0)}.getBoundingClientRect(); return { bar: Math.round(b.bottom), cell: Math.round(c.top) }; })()`);
        assert.ok(barBottom.cell >= barBottom.bar, 'the sheet starts under the bar: ' + JSON.stringify(barBottom));
        await clickAt(cell('fbr', 2, 0));
        assert.strictEqual(await js(q('fbr', '.fa') + '.textContent'), 'A3');
        assert.strictEqual(await js(q('fbr', '[data-bar]') + '.value'), '=A1+A2', 'the formula as written, while the cell shows 7');
        assert.strictEqual(await text('fbr', 2, 0), '7');
        await clickAt(cell('fbr', 0, 1));
        assert.strictEqual(await js(q('fbr', '[data-bar]') + '.value'), 'text');
        // typing in the bar
        await clickAt(cell('fbr', 2, 0));
        await js(`(function () { var i = ${q('fbr', '[data-bar]')}; i.focus(); i.value = "=A1*A2"; })()`);
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', windowsVirtualKeyCode: 13 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', windowsVirtualKeyCode: 13 });
        await settle(); await wait(60);
        assert.strictEqual(await text('fbr', 2, 0), '12', 'the cell took what was typed in the bar');
        assert.strictEqual((await events('fbr', 'cellChange')).pop().new, '=A1*A2');
        await mount('fbr2', { showFormulaBar: true, cells: { A1: '=1+1' } });
        await clickAt(cell('fbr2', 0, 0));
        assert.strictEqual(await js(q('fbr2', '[data-bar]') + '.value'), '=1+1', 'read-only: it shows the formula');
        assert.strictEqual(await js(q('fbr2', '[data-bar]') + '.readOnly'), true, 'and cannot be typed in');
        await mount('fbr3', { cells: { A1: 1 } });
        assert.strictEqual(await js(q('fbr3', '[data-bar]') + ' ? 1 : 0'), 0, 'no bar unless asked for');
    });

    await ok('formulas: export to Excel keeps the formulas with their results; an error is an error cell', async () => {
        await mount('fz', { cells: { A1: 5, A2: 7, A3: '=SUM(A1:A2)', B1: '=1/0', B2: '=A1&"x"', B3: '=A1>1' }, exportable: true });
        await hookDownload();
        await js('NexaTest.invoke("fz", "exportXlsx")');
        const sheet = readZip((await download()).data)['xl/worksheets/sheet1.xml'];
        assert.ok(/<c r="A3" s="\d+"><f>SUM\(A1:A2\)<\/f><v>12<\/v><\/c>/.test(sheet), 'the formula and its result: ' + sheet.slice(sheet.indexOf('r="A3"') - 3, sheet.indexOf('r="A3"') + 80));
        assert.ok(/<c r="B1" s="\d+" t="e"><f>1\/0<\/f><v>#DIV\/0!<\/v><\/c>/.test(sheet), 'an error cell');
        assert.ok(/<c r="B2" s="\d+" t="str"><f>A1&amp;&quot;x&quot;<\/f><v>5x<\/v><\/c>/.test(sheet) || /<c r="B2" s="\d+" t="str"><f>A1&amp;"x"<\/f><v>5x<\/v><\/c>/.test(sheet), 'a text result');
        assert.ok(/<c r="B3" s="\d+" t="b"><f>A1&gt;1<\/f><v>1<\/v><\/c>/.test(sheet), 'a boolean result');
    });

    await ok('no JavaScript errors in the page', async () => {
        const errs = logs.filter((l) => /error|exception|uncaught/i.test(l) && !/favicon|net::ERR/i.test(l));
        assert.deepStrictEqual(errs.slice(0, 5), []);
    });

    console.log('\n' + passed + ' passed');
}).then((r) => { if (r === null) console.log('SKIP: no Chrome'); }).catch((e) => { console.error(e); process.exit(1); });
