'use strict';

// Nexa UI in a REAL browser (headless Chrome) through the Nexa SDK testkit: every component
// registers and draws; the form controls read their binding and write the user's change
// (two-way); zag widgets (select, slider, tags, pin, rating) by pointer and keyboard; the
// theme (palettes, tokens, dark mode); the inspector gives every prop its binding, its
// breakpoints and tokens. Needs the dashboard built (npm run build there).
//   node test/browser.test.js         (skipped when Chrome is not installed)

const assert = require('assert');
const path = require('path');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');

let passed = 0;
async function ok(label, fn) { await fn(); passed++; console.log('✔ ' + label); }

const P = 'nexa-ui-';
const ALL = ['button', 'input', 'textarea', 'number-input', 'password-input', 'checkbox', 'switch', 'radio-group', 'segmented', 'select', 'combobox', 'slider', 'tags-input', 'pin-input', 'rating',
    'text', 'heading', 'badge', 'tag', 'card', 'avatar', 'stat', 'alert', 'progress', 'spinner', 'skeleton', 'separator', 'empty-state', 'timeline', 'fieldset',
    'tabs', 'iframe', 'datetime', 'daterange', 'pagination', 'line-chart'];
const TAG = '{sparkplug:Plant::Line1::Mixer::Speed}';

withHarness({
    mounts: { '/nexa-component-ui-library/vendor': path.join(__dirname, '..', 'dist'), '/fx': path.join(__dirname, 'fixtures') },
    modules: ['/nexa-component-ui-library/vendor/ui-library.js']
}, async ({ js, type, key, logs, send }) => {
    const settle = () => js('NexaTest.settle()');
    // after a style change: its CSS transition (0.15 s) done
    const calm = async () => {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });   // no hover
        await settle(); await js('new Promise(function (r) { setTimeout(r, 260); })');
    };
    const root = (name) => `NexaTest.wc(${JSON.stringify(name)}).renderRoot`;
    const q = (name, sel) => `${root(name)}.querySelector(${JSON.stringify(sel)})`;
    const item = (name) => js(`(function () { var i = NexaTest.item(${JSON.stringify(name)}); return { writes: i.writes.slice(), events: i.events.map(function (e) { return [e[0], e[1]]; }) }; })()`);
    const mount = async (name, id, props, opts) => { await js(`NexaTest.mount(${JSON.stringify(name)}, ${JSON.stringify(P + id)}, ${JSON.stringify(props || {})}, ${JSON.stringify(opts || { width: 300, height: 48 })})`); await settle(); };
    const clickAt = async (sel) => {
        const r = await js(`(function () { var e = ${sel}; e.scrollIntoView({ block: "center" }); var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
        await settle();
    };

    await ok('all 36 components register (UI · Form / Display / Layout / Embed / Charts), each mounts and draws', async () => {
        const reg = await js(`${JSON.stringify(ALL)}.map(function (id) { var d = NEXA.getComponent("${P}" + id); return d ? d.category : "MISSING " + id; })`);
        assert.deepStrictEqual(reg.filter((c) => c !== 'UI · Form' && c !== 'UI · Display' && c !== 'UI · Layout' && c !== 'UI · Embed' && c !== 'UI · Charts'), []);
        for (const id of ALL) await mount('all-' + id, id, {}, { width: 320, height: 120 });
        const empty = await js(`${JSON.stringify(ALL)}.filter(function (id) { var r = NexaTest.wc("all-" + id).renderRoot; return !r || !r.innerHTML || r.innerHTML.replace(/<!--[^]*?-->/g, "").trim() === ""; })`);
        assert.deepStrictEqual(empty, []);
    });

    await ok('Button: a click fires On Click and writes its value; its palette is the theme\'s, light and dark', async () => {
        await mount('b', 'button', { text: 'Start', outputValue: TAG, clickValue: '1', variant: 'subtle' }, { width: 120, height: 40 });
        const bg = () => js(`getComputedStyle(${q('b', 'button')}).backgroundColor`);
        assert.strictEqual(await bg(), 'rgb(208, 226, 255)', 'subtle = primary (blue) 100 in light');
        await clickAt(q('b', 'button'));
        const it = await item('b');
        assert.deepStrictEqual(it.events.filter((e) => e[0] === 'click'), [['click', { value: 1 }]]);
        assert.deepStrictEqual(it.writes, [['outputValue', 1]]);
        await js('NexaTest.setMode("dark")'); await calm();
        assert.strictEqual(await bg(), 'rgb(0, 29, 108)', 'subtle = blue 900 in dark');
        await js('NexaTest.setMode("light")'); await calm();
        await js(`NexaTest.setProps("b", { colorPalette: "green", variant: "solid" })`); await calm();
        assert.strictEqual(await bg(), 'rgb(25, 128, 56)', 'green solid (600)');
        await js(`NexaTest.setProps("b", { loading: true, loadingText: "Starting…" })`); await settle();
        assert.deepStrictEqual(await js(`[${q('b', 'button')}.disabled, ${q('b', 'button')}.textContent.trim(), !!${q('b', '.spin')}]`), [true, 'Starting…', true]);
    });

    await ok('Input: shows its binding; typing + Enter writes (two-way); the field: label, helper, error', async () => {
        await mount('in', 'input', { inputValue: TAG, label: 'Order', helperText: 'The PO number' }, { width: 260, height: 64 });
        await js('NexaTest.setTag("in", "PO-1")'); await settle();
        assert.strictEqual(await js(`${q('in', 'input')}.value`), 'PO-1');
        assert.deepStrictEqual(await js(`[${q('in', '.label')}.textContent.trim(), ${q('in', '.helper')}.textContent.trim()]`), ['Order', 'The PO number']);
        await js(`${q('in', 'input')}.focus()`);
        await js(`(function () { var i = ${q('in', 'input')}; i.select(); return 1; })()`);
        await type('PO-2'); await key('Enter'); await settle();
        const it = await item('in');
        assert.deepStrictEqual(it.writes, [['inputValue', 'PO-2']], 'Value (write) empty: back to Value (read)');
        await js(`NexaTest.setProps("in", { invalid: true, errorText: "Unknown order" })`); await settle();
        assert.deepStrictEqual(await js(`[${q('in', '.helper')}.textContent.trim(), ${q('in', '.helper')}.classList.contains("error")]`), ['Unknown order', true]);
    });

    await ok('Number Input: ± steps and writes, within min / max', async () => {
        await mount('n', 'number-input', { defaultValue: 0, min: 0, max: 2, step: 1 }, { width: 160, height: 40 });
        await clickAt(q('n', '.stepper button[aria-label=Increase]'));
        await clickAt(q('n', '.stepper button[aria-label=Increase]'));
        await clickAt(q('n', '.stepper button[aria-label=Increase]'));
        const ch = (await item('n')).events.filter((e) => e[0] === 'change').map((e) => e[1].value);
        assert.deepStrictEqual(ch, [1, 2], 'the third + stays at the max');
    });

    await ok('Checkbox / Switch: a click writes true (two-way), the binding shows the state; unbound keeps its own', async () => {
        await mount('cb', 'checkbox', { inputValue: TAG, text: 'Enabled' }, { width: 200, height: 32 });
        await js('NexaTest.setTag("cb", "false")'); await settle();
        assert.strictEqual(await js(`${q('cb', 'input')}.checked`), false);
        await clickAt(q('cb', '.cb'));
        assert.deepStrictEqual((await item('cb')).writes, [['inputValue', true]]);
        assert.strictEqual(await js(`${q('cb', 'input')}.checked`), true, 'shown at once (optimistic)');
        await mount('sw', 'switch', { text: 'Pump' }, { width: 200, height: 32 });
        await clickAt(q('sw', '.sw'));
        assert.deepStrictEqual([await js(`${q('sw', 'input')}.checked`), (await item('sw')).events.map((e) => e[0])], [true, ['change']]);
        assert.deepStrictEqual((await item('sw')).writes, [], 'nothing bound: nothing written');
    });

    await ok('Radio Group / Segmented: options from the list or from data; a pick writes its value', async () => {
        await mount('r', 'radio-group', { defaultValue: 'a', outputValue: TAG }, { width: 320, height: 40 });
        await clickAt(`${root('r')}.querySelectorAll(".dot")[1]`);
        assert.deepStrictEqual((await item('r')).writes, [['outputValue', 'b']]);
        await mount('sg', 'segmented', { defaultValue: 'x', inputItems: '{modes}' }, { width: 320, height: 40 });
        await js('NexaTest.setVariable("modes", [{ value: "x", label: "Auto" }, { value: "y", label: "Manual" }])'); await settle();
        assert.deepStrictEqual(await js(`Array.from(${root('sg')}.querySelectorAll(".item")).map(function (e) { return e.textContent.trim() + (e.classList.contains("checked") ? "*" : ""); })`), ['Auto*', 'Manual']);
        await clickAt(`${root('sg')}.querySelectorAll(".item")[1]`);
        assert.deepStrictEqual((await item('sg')).events.map((e) => e[1].value), ['y']);
    });

    await ok('Select (zag): opens, a pick writes and closes; the keyboard (↓ Enter) picks too', async () => {
        await mount('s', 'select', { outputValue: TAG, placeholder: 'Pick a line' }, { width: 240, height: 40 });
        assert.strictEqual(await js(`${q('s', '.val')}.textContent.trim()`), 'Pick a line');
        await clickAt(q('s', '.trigger'));
        assert.strictEqual(await js(`${q('s', '.trigger')}.getAttribute("aria-expanded")`), 'true');
        await clickAt(`${root('s')}.querySelectorAll(".opt")[1]`);
        assert.deepStrictEqual((await item('s')).writes, [['outputValue', 'b']]);
        assert.deepStrictEqual([await js(`${q('s', '.val')}.textContent.trim()`), await js(`${q('s', '.trigger')}.getAttribute("aria-expanded")`)], ['Option B', 'false']);
        await js(`${q('s', '.trigger')}.focus()`);
        await key('ArrowDown'); await settle(); await key('ArrowDown'); await settle(); await key('Enter'); await settle();
        const w = (await item('s')).writes;
        assert.ok(w.length === 2 && w[1][1] !== 'b', 'another option by the keyboard: ' + JSON.stringify(w));
    });

    await ok('Combobox (zag): typing filters the options; a pick writes', async () => {
        await mount('c', 'combobox', { options: [{ value: 'p1', label: 'Pump 1' }, { value: 'p2', label: 'Pump 2' }, { value: 'v1', label: 'Valve 1' }] }, { width: 240, height: 40 });
        await js(`${q('c', 'input')}.focus()`);
        await type('val'); await settle();
        assert.deepStrictEqual(await js(`Array.from(${root('c')}.querySelectorAll(".opt-text")).map(function (e) { return e.textContent; })`), ['Valve 1']);
        await clickAt(q('c', '.opt'));
        assert.deepStrictEqual((await item('c')).events.filter((e) => e[0] === 'change').map((e) => e[1].value), ['v1']);
    });

    await ok('Slider (zag): the arrow keys move it; the value is written; it shows the value with its unit', async () => {
        await mount('sl', 'slider', { defaultValue: 40, step: 5, unit: '%', outputValue: TAG }, { width: 260, height: 48 });
        assert.strictEqual(await js(`${q('sl', '.out')}.textContent.trim()`), '40 %');
        await js(`${q('sl', '.thumb')}.focus()`);
        await key('ArrowRight'); await settle(); await js('new Promise(function (r) { setTimeout(r, 100); })');
        assert.strictEqual(await js(`${q('sl', '.out')}.textContent.trim()`), '45 %');
        assert.deepStrictEqual((await item('sl')).writes, [['outputValue', 45]]);
    });

    await ok('Tags Input (zag): Enter adds a tag, its × removes it; the array is written', async () => {
        await mount('tg', 'tags-input', { defaultValue: ['a'], outputValue: TAG }, { width: 300, height: 40 });
        await js(`${q('tg', 'input.entry')}.focus()`);
        await type('pump'); await key('Enter'); await settle();
        assert.deepStrictEqual(await js(`Array.from(${root('tg')}.querySelectorAll(".tag-text")).map(function (e) { return e.textContent; })`), ['a', 'pump']);
        await clickAt(`${root('tg')}.querySelectorAll(".tag button")[0]`);
        assert.deepStrictEqual((await item('tg')).writes.map((w) => w[1]), [['a', 'pump'], ['pump']]);
    });

    await ok('Pin Input (zag): four digits -> On Complete and the code written', async () => {
        await mount('pin', 'pin-input', { length: 4, outputValue: TAG }, { width: 240, height: 48 });
        await js(`${q('pin', 'input.pin')}.focus()`);
        await type('1'); await type('2'); await type('3'); await type('4'); await settle();
        const it = await item('pin');
        assert.deepStrictEqual(it.writes, [['outputValue', '1234']]);
        assert.ok(it.events.some((e) => e[0] === 'complete' && e[1].value === '1234'));
    });

    await ok('Rating (zag): a click on the 4th star writes 4', async () => {
        await mount('ra', 'rating', { defaultValue: 2, outputValue: TAG }, { width: 200, height: 36 });
        await clickAt(`${root('ra')}.querySelectorAll(".star")[3]`);
        assert.deepStrictEqual((await item('ra')).writes, [['outputValue', 4]]);
    });

    await ok('Text / Heading: theme tokens by default (colour, size, weight), light and dark; a binding instead', async () => {
        await mount('tx', 'text', {}, { width: 240, height: 44 });
        const cs = (name, p) => js(`getComputedStyle(${q(name, '[part~=text]')}).${p}`);
        assert.deepStrictEqual([await cs('tx', 'color'), await cs('tx', 'fontSize'), await cs('tx', 'fontWeight')], ['rgb(22, 22, 22)', '14px', '400']);
        await js('NexaTest.setMode("dark")'); await settle();
        assert.strictEqual(await cs('tx', 'color'), 'rgb(244, 244, 244)', 'colors.fg in dark');
        await js('NexaTest.setMode("light")'); await settle();
        await mount('hd', 'heading', { text: '{title}' }, { width: 280, height: 40 });
        await js('NexaTest.setVariable("title", "Line 2 overview")'); await settle();
        assert.deepStrictEqual([await js(`${q('hd', 'h2')}.textContent`), await cs('hd', 'fontSize'), await cs('hd', 'fontWeight')], ['Line 2 overview', '28px', '400']);
    });

    await ok('Stat: the value from a tag, formatted, its unit; the change up (good: green) / down', async () => {
        await mount('st', 'stat', { inputValue: TAG, decimals: 1, change: '-3.2', upIsGood: true }, { width: 220, height: 96 });
        assert.strictEqual(await js(`${q('st', '.val')}.textContent.trim()`), '???', 'the tag has no value yet');
        await js('NexaTest.setTag("st", "1234.56")'); await settle();
        assert.deepStrictEqual(await js(`[${q('st', '.val')}.textContent.trim(), ${q('st', '.unit')}.textContent, ${q('st', '.chg')}.className, ${q('st', '.chg')}.textContent.trim()]`),
            ['1234.6', 'pcs/h', 'chg bad', '3.2%']);
    });

    await ok('Progress: bar and circle, the value from a tag (aria), the percent; Spinner, Skeleton, Separator draw', async () => {
        await mount('pg', 'progress', { inputValue: TAG, min: 0, max: 200 }, { width: 240, height: 36 });
        await js('NexaTest.setTag("pg", "50")'); await settle();
        assert.deepStrictEqual(await js(`[${q('pg', '[role=progressbar]')}.getAttribute("aria-valuenow"), ${q('pg', '.out')}.textContent, ${q('pg', '.bar')}.style.width]`), ['50', '25%', '25%']);
        await js('NexaTest.setProps("pg", { shape: "circle" })'); await settle();
        assert.strictEqual(await js(`!!${q('pg', '.circle svg .arc')} && ${q('pg', '.mid')}.textContent`), '25%');
        await mount('sk', 'skeleton', { lines: 4 }, { width: 240, height: 80 });
        assert.strictEqual(await js(`${root('sk')}.querySelectorAll(".b").length`), 4);
        await js('NexaTest.setProps("sk", { loaded: true })'); await settle();
        assert.strictEqual(await js(`${root('sk')}.querySelectorAll(".b").length`), 0, 'loaded: gone');
        await mount('sp', 'separator', { label: 'or' }, { width: 240, height: 20 });
        assert.deepStrictEqual(await js(`[${root('sp')}.querySelectorAll(".line").length, ${q('sp', '.lbl')}.textContent]`), [2, 'or']);
    });

    await ok('Alert: its status\' palette and icon; × closes it (On Close); Tag: × too; Avatar: initials, a palette from the name', async () => {
        await mount('al', 'alert', { status: 'error', closable: true }, { width: 360, height: 72 });
        assert.strictEqual(await js(`${q('al', '[part~=alert]')}.getAttribute("role")`), 'alert');
        assert.strictEqual(await js(`getComputedStyle(${q('al', '.alert')}).backgroundColor`), 'rgb(255, 241, 241)', 'inline: red 50 (soft)');
        await clickAt(q('al', '.close'));
        assert.deepStrictEqual([(await item('al')).events.map((e) => e[0]), await js(`!!${q('al', '.alert')}`)], [['close'], false]);
        await mount('tg2', 'tag', { text: 'Line 2', closable: true }, { width: 120, height: 32 });
        await clickAt(q('tg2', '.close'));
        assert.deepStrictEqual((await item('tg2')).events.map((e) => e[0]), ['close']);
        await mount('av', 'avatar', { name: 'Grace Hopper' }, { width: 48, height: 48 });
        assert.strictEqual(await js(`${q('av', '.initials')}.textContent`), 'GH');
    });

    await ok('Timeline: steps from data (the fields named), each its palette; Card: its actions fire', async () => {
        await mount('tl', 'timeline', { inputItems: '{steps}', titleField: 'name' }, { width: 300, height: 200 });
        await js('NexaTest.setVariable("steps", [{ name: "Start", time: "08:00", color: "green" }, { name: "Stop", time: "16:00", color: "red" }])'); await settle();
        assert.deepStrictEqual(await js(`Array.from(${root('tl')}.querySelectorAll(".ttl")).map(function (e) { return e.textContent; })`), ['Start', 'Stop']);
        await mount('cd', 'card', { secondaryAction: 'Later' }, { width: 300, height: 220 });
        await clickAt(q('cd', '.act.primary'));
        assert.deepStrictEqual((await item('cd')).events, [['primary', {}], ['action', { action: 'primary' }]]);
    });

    await ok('Tabs: a panel per tab (a <slot> each: what is put in it shows with its tab); click / arrows choose, written two-way; its actions', async () => {
        await mount('tb', 'tabs', { inputValue: TAG }, { width: 420, height: 240 });
        await js(`NexaTest.setTag("tb", "trends")`); await settle();
        const state = () => js(`(function () { var r = ${root('tb')}; var s = r.querySelector("slot");
            return { sel: Array.from(r.querySelectorAll(".tab")).filter(function (t) { return t.getAttribute("aria-selected") === "true"; }).map(function (t) { return t.dataset.value; }),
                slot: s ? s.name : null, shown: Array.from(NexaTest.wc("tb").children).filter(function (c) { return c.getClientRects().length > 0; }).map(function (c) { return c.slot; }) }; })()`);
        // the page puts each panel's frame in its element, as a light-DOM child with slot="<value>"
        await js(`(function () { var wc = NexaTest.wc("tb"); ["overview", "trends", "alarms"].forEach(function (v) { var d = document.createElement("div"); d.slot = v; d.style.cssText = "position:absolute;inset:0"; d.textContent = v; wc.appendChild(d); }); return 1; })()`);
        await settle();
        assert.deepStrictEqual(await state(), { sel: ['trends'], slot: 'trends', shown: ['trends'] }, 'the bound value picks the tab');
        await clickAt(q('tb', '.tab[data-value="alarms"]'));
        assert.deepStrictEqual(await state(), { sel: ['alarms'], slot: 'alarms', shown: ['alarms'] });
        assert.deepStrictEqual((await item('tb')).writes, [['inputValue', 'alarms']], 'written back (two-way)');
        await js(`NexaTest.setTag("tb", "alarms")`); await settle();
        await key('ArrowRight'); await settle();
        assert.deepStrictEqual((await state()).sel, ['overview'], '→ from the last: the first (focus on the tab)');
        await js(`NexaTest.setTag("tb", "overview")`); await settle();
        await key('End'); await settle();
        assert.deepStrictEqual((await state()).sel, ['alarms']);
        await js(`NexaTest.setTag("tb", "alarms")`); await settle();
        const panelBox = await js(`(function () { var p = ${q('tb', '.panel')}.getBoundingClientRect(), c = Array.from(NexaTest.wc("tb").children).filter(function (c) { return c.slot === "alarms"; })[0].getBoundingClientRect();
            return [Math.round(c.width) === Math.round(p.width), Math.round(c.height) === Math.round(p.height), p.height > 150]; })()`);
        assert.deepStrictEqual(panelBox, [true, true, true], 'the slot frame fills the panel');
        // unbound: its own value; the actions (Logic)
        await mount('tb2', 'tabs', { tabs: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }, { value: 'c', label: 'C' }], defaultValue: 'a', variant: 'contained' }, { width: 300, height: 200 });
        await js('NexaTest.wc("tb2").next()'); await settle();
        assert.strictEqual(await js(`${q('tb2', '.tab[aria-selected=true]')}.dataset.value`), 'c', 'next skips the disabled tab');
        await js('NexaTest.wc("tb2").select({ value: "a" })'); await settle();
        assert.deepStrictEqual((await item('tb2')).events.map((e) => e[1].value), ['c', 'a']);
        assert.deepStrictEqual(await js('NEXA.getComponent("nexa-ui-tabs").slotsOf({ tabs: [{ value: "x", label: "X" }, { label: "Y" }, "Z"] })'),
            [{ name: 'x', label: 'X' }, { name: 'Y', label: 'Y' }, { name: 'Z', label: 'Z' }], 'its slots: one per tab');
    });

    await ok('Iframe: loads its URL + parameters (eager, sandbox, allow…); On Load / On Message; Send a message, Set parameters, Reload, Open URL; allowed origins; Grafana', async () => {
        await mount('ifr', 'iframe', { src: '/fx/embed-child.html', params: [{ key: 'line', value: '2', enabled: true }, { key: 'off', value: 'x', enabled: false }], loading: 'eager' }, { width: 400, height: 200 });
        const events = async (name) => (await item('ifr')).events.filter((e) => e[0] === name).map((e) => e[1]);
        const until = async (fn, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return v; await js('new Promise(function (r) { setTimeout(r, 50); })'); } };
        await until(async () => (await events('load')).length === 1);
        const loads = await events('load');
        assert.deepStrictEqual([loads.length, /\/fx\/embed-child\.html\?line=2$/.test(loads[0].url), loads[0].count], [1, true, 1], JSON.stringify(loads));
        const origin = await js('location.origin');
        await until(async () => (await events('message')).length === 1);
        assert.deepStrictEqual(await events('message'), [{ data: { hello: '?line=2' }, origin }]);
        const attrs = await js(`(function () { var f = ${q('ifr', 'iframe')}; return [f.getAttribute("loading"), f.getAttribute("allow"), f.hasAttribute("sandbox"), f.getAttribute("referrerpolicy"), !!${q('ifr', '.veil')}]; })()`);
        assert.deepStrictEqual(attrs, ['eager', 'fullscreen', false, 'strict-origin-when-cross-origin', false], 'loaded: no Loading veil');
        await js('NexaTest.setProps("ifr", { sandbox: true, sbForms: true })'); await settle();
        assert.strictEqual(await js(`${q('ifr', 'iframe')}.getAttribute("sandbox")`), 'allow-scripts allow-same-origin allow-forms');
        await js('NexaTest.setProps("ifr", { sandbox: false })'); await settle();
        // Send a message: the page echoes it
        await js('NexaTest.wc("ifr").postMessage({ data: { ping: 1 } })');
        await until(async () => (await events('message')).some((m) => m.data && m.data.echo));
        assert.deepStrictEqual((await events('message')).pop().data, { echo: { ping: 1 } });
        // Set parameters: loaded again with them
        await js('NexaTest.wc("ifr").setParams({ line: 3, shift: "B" })'); await settle();
        await until(async () => (await events('load')).length >= 2);
        assert.ok(/line=3&shift=B$/.test((await events('load')).pop().url), 'the new parameters');
        // Reload, Open URL
        const n = (await events('load')).length;
        await js('NexaTest.wc("ifr").reload()');
        await until(async () => (await events('load')).length > n);
        assert.strictEqual((await events('load')).length, n + 1, 'reloaded');
        await js('NexaTest.wc("ifr").navigate({ url: "/fx/embed-child.html?other=1" })'); await settle();
        await until(async () => /other=1$/.test(((await events('load')).pop() || {}).url || ''));
        assert.ok(/other=1$/.test((await events('load')).pop().url));
        // only allowed origins: from another origin, nothing
        await js('NexaTest.setProps("ifr", { allowOrigins: "https://grafana.example" })'); await settle();
        const before = (await events('message')).length;
        await js('NexaTest.wc("ifr").postMessage({ data: "x" })'); await js('new Promise(function (r) { setTimeout(r, 300); })');
        assert.strictEqual((await events('message')).length, before, 'a message from a not allowed origin is ignored');
        // Grafana: kiosk, the theme with the colour mode, time range, refresh, variables
        const g = await js(`import("/nexa-component-ui-library/vendor/embed.js").then(function (m) { var p = { src: "https://g.example/d/abc/plant?orgId=1", preset: "grafana", gKiosk: "full", gTheme: "auto", gFrom: "now-1h", gTo: "now", gRefresh: "10s", gVars: [{ name: "line", value: "2" }], params: [{ key: "viewPanel", value: "4" }] };
            return [m.buildEmbedUrl(p, {}, "dark"), m.buildEmbedUrl(Object.assign({}, p, { gKiosk: "tv" }), {}, "light")]; })`);
        assert.deepStrictEqual(g, ['https://g.example/d/abc/plant?orgId=1&kiosk=&theme=dark&from=now-1h&to=now&refresh=10s&var-line=2&viewPanel=4',
            'https://g.example/d/abc/plant?orgId=1&kiosk=tv&theme=light&from=now-1h&to=now&refresh=10s&var-line=2&viewPanel=4']);
        // Auto-convert to embed URL: YouTube, Vimeo, Google Docs/Sheets, Figma, Loom, Spotify, CodePen, converter template
        const converted = await js(`import("/nexa-component-ui-library/vendor/embed.js").then(function (m) {
            return [
                m.toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s"),
                m.toEmbedUrl("https://youtu.be/dQw4w9WgXcQ"),
                m.toEmbedUrl("https://vimeo.com/12345678"),
                m.toEmbedUrl("https://docs.google.com/document/d/1abcXYZ/edit?usp=sharing"),
                m.toEmbedUrl("https://docs.google.com/spreadsheets/d/2abcXYZ/edit#gid=0"),
                m.toEmbedUrl("https://drive.google.com/file/d/3abcXYZ/view"),
                m.toEmbedUrl("https://loom.com/share/abc12345"),
                m.toEmbedUrl("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"),
                m.toEmbedUrl("https://codepen.io/user/pen/xyz"),
                m.toEmbedUrl("https://example.com/page", { converter: "https://embed.test/?url={url}" }),
                m.toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", { autoEmbed: false }),
                m.buildEmbedUrl({ src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })
            ];
        })`);
        assert.deepStrictEqual(converted, [
            "https://www.youtube.com/embed/dQw4w9WgXcQ?start=90",
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
            "https://player.vimeo.com/video/12345678",
            "https://docs.google.com/document/d/1abcXYZ/preview?usp=sharing",
            "https://docs.google.com/spreadsheets/d/2abcXYZ/preview#gid=0",
            "https://drive.google.com/file/d/3abcXYZ/preview",
            "https://loom.com/embed/abc12345",
            "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT",
            "https://codepen.io/user/embed/xyz",
            "https://embed.test/?url=https%3A%2F%2Fexample.com%2Fpage",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ"
        ]);
        // lazy by default; "Loading…" until it loads
        await mount('ifr2', 'iframe', { src: '/fx/embed-child.html' }, { width: 300, height: 150 });
        assert.strictEqual(await js(`${q('ifr2', 'iframe')}.getAttribute("loading")`), 'lazy');
    });

    await ok('Password Input: matches Text Input styling with flush Carbon reveal button and type toggling', async () => {
        await mount('pw-test', 'password-input', { label: 'Password' }, { width: 220, height: 40 });
        const inputType = () => js(`${q('pw-test', 'input')}.type`);
        assert.strictEqual(await inputType(), 'password', 'starts as password type');
        const hasToggle = await js(`!!${q('pw-test', '.reveal-btn')}`);
        assert.strictEqual(hasToggle, true, 'has Carbon reveal toggle button');
        await clickAt(q('pw-test', '.reveal-btn'));
        assert.strictEqual(await inputType(), 'text', 'switches to text on reveal');
        await clickAt(q('pw-test', '.reveal-btn'));
        assert.strictEqual(await inputType(), 'password', 'switches back to password on hide');
    });

    await ok('Date Time: granular unit selection, template formatting and universal UTC support', async () => {
        const iso = '2026-09-30T10:15:30.000Z';
        await mount('dt-test', 'datetime', {
            label: 'Timestamp',
            inputValue: iso,
            timezoneMode: 'utc',
            format: 'YYYY-MM-DD HH:mm:ss'
        }, { width: 260, height: 40 });

        const val = await js(`${q('dt-test', '.input-field')}.value`);
        assert.strictEqual(val, '2026-09-30 10:15:30', 'formats UTC date/time according to format template');

        const badge = await js(`${q('dt-test', '.tz-badge')}.textContent.trim()`);
        assert.strictEqual(badge, 'UTC', 'displays UTC badge in UTC mode');
    });

    await ok('Date Range: dual calendar selection, start and end bindings, presets and UTC formatting', async () => {
        const startIso = '2026-09-01T00:00:00.000Z';
        const endIso = '2026-09-30T23:59:59.000Z';
        await mount('dr-test', 'daterange', {
            label: 'Date Range',
            defaultStart: startIso,
            defaultEnd: endIso,
            timezoneMode: 'utc',
            format: 'YYYY-MM-DD'
        }, { width: 340, height: 40 });

        const startText = await js(`${root('dr-test')}.querySelectorAll('.range-display-segment')[0].textContent.trim()`);
        const endText = await js(`${root('dr-test')}.querySelectorAll('.range-display-segment')[1].textContent.trim()`);
        assert.strictEqual(startText, '2026-09-01', 'start date formatted');
        assert.strictEqual(endText, '2026-09-30', 'end date formatted');

        const badge = await js(`${root('dr-test')}.querySelector('.tz-badge').textContent.trim()`);
        assert.strictEqual(badge, 'UTC', 'displays UTC badge');
    });

    await ok('Pagination: IBM Carbon pagination bar with items per page, item range, and page navigation', async () => {
        await mount('pag-test', 'pagination', {
            total: 120,
            pageSize: 10,
            page: 1,
            outputPage: TAG,
            outputOffset: TAG,
            pageSizeOptions: '10, 20, 50, 100'
        }, { width: 560, height: 48 });

        const range = await js(`${q('pag-test', '.pag-range')}.textContent.replace(/\\s+/g, ' ').trim()`);
        assert.strictEqual(range, '1–10 of 120 items', 'shows correct 1-10 range');

        // Click next page button
        await clickAt(`${root('pag-test')}.querySelector('.pag-nav-btn[aria-label="Next page"]')`);
        const it = await item('pag-test');
        assert.strictEqual(it.writes.some((w) => w[0] === 'outputPage' && w[1] === 2), true, 'writes page 2');
        assert.strictEqual(it.writes.some((w) => w[0] === 'outputOffset' && w[1] === 10), true, 'writes offset 10');
        assert.strictEqual(it.events.some((e) => e[0] === 'change' && e[1].page === 2), true, 'emits change event');
        // Test numeric variant
        await mount('pag-num', 'pagination', {
            variant: 'numeric',
            total: 100,
            pageSize: 10,
            page: 3,
            outputPage: TAG
        }, { width: 400, height: 48 });

        const activeText = await js(`${root('pag-num')}.querySelector('.pag-num-btn.active').textContent.trim()`);
        assert.strictEqual(activeText, '3', 'active numeric button shows page 3');

        // Click page 4 button (index 0 is prev, index 1 is page 1, index 2 is page 2, index 3 is page 3, index 4 is page 4)
        await clickAt(`${root('pag-num')}.querySelectorAll('.pag-num-btn')[4]`);
        const itNum = await item('pag-num');
        assert.strictEqual(itNum.writes.some((w) => w[0] === 'outputPage' && w[1] === 4), true, 'clicking page 4 button writes page 4');
    });

    await ok('Line Chart: draws virtualized time-series canvas, crosshair, and tooltip', async () => {
        const testData = [
            { x: 1727852400000, y: 120 },
            { x: 1727852401000, y: 123 },
            { x: 1727852402000, y: 121 }
        ];
        await mount('chart-test', 'line-chart', { series: [{ name: 'Speed', unit: 'rpm', data: { $bind: [], static: testData } }] }, { width: 500, height: 260 });
        const canvasExists = await js(`!!${root('chart-test')}.querySelector('canvas')`);
        assert.strictEqual(canvasExists, true, 'canvas element created');

        // Check hover crosshair and tooltip
        const containerSel = `${root('chart-test')}.querySelector('.chart-container')`;
        const b = await js(`(function () { var e = ${containerSel}; e.scrollIntoView({ block: "center" }); var r = e.getBoundingClientRect(); return { x: Math.round(r.left + 200), y: Math.round(r.top + 80) }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
        await settle();

        const tooltipText = await js(`(function () { var t = ${root('chart-test')}.querySelector('.tooltip'); return t ? t.textContent : ''; })()`);
        assert.ok(tooltipText.includes('Speed:'), 'tooltip displays series label: ' + tooltipText);
        assert.ok(tooltipText.includes('rpm'), 'tooltip displays unit: ' + tooltipText);

        // Verify inspector exposes timeWindow and maxPoints properties
        const inspectorProps = await js(`(async function () {
            var insp = NexaTest.inspector("${P}line-chart", {});
            await new Promise(function (r) { setTimeout(r, 250); });
            var rows = NexaTest.rows(insp.box).map(function (r) { return r.label; });
            return rows;
        })()`);
        assert.ok(inspectorProps.includes('Time range'), 'inspector has Time range');
        assert.ok(inspectorProps.includes('Series'), 'inspector has the Series list');
        assert.ok(inspectorProps.includes('Time ruler (drag to scrub)'), 'inspector has the time ruler toggle');

        // Test comb scrubbing: drag in comb area (y = bottom ruler)
        const combPoint = await js(`(function () {
            var e = ${root('chart-test')}.querySelector('.plot');   // the time ruler: the plot's bottom (the legend is under it)
            var r = e.getBoundingClientRect();
            return { x: Math.round(r.left + 250), y: Math.round(r.bottom - 15) };
        })()`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x: combPoint.x, y: combPoint.y });
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', buttons: 1, x: combPoint.x - 50, y: combPoint.y });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: combPoint.x - 50, y: combPoint.y });
        await settle();

        const hasResetButton = await js(`!!${root('chart-test')}.querySelector('.btn-reset-zoom')`);
        assert.strictEqual(hasResetButton, true, 'reset zoom button appears after scrubbing time comb');

        // Verify canvas is NOT white / blank after scrub and hover
        const hasDrawnPixels = await js(`(function () {
            var c = ${root('chart-test')}.querySelector('canvas');
            var ctx = c.getContext('2d');
            var img = ctx.getImageData(0, 0, c.width, c.height).data;
            var nonZero = 0;
            for (var i = 0; i < img.length; i += 4) { if (img[i+3] > 0) nonZero++; }
            return nonZero > 500;
        })()`);
        assert.strictEqual(hasDrawnPixels, true, 'canvas retains drawn chart lines after scrub and hover');
    });

    await ok('Line Chart: retains drawing and canvas dimensions when switching tabs', async () => {
        await mount('tab-chart-test', 'tabs', {
            tabs: [{ value: 'chart', label: 'Chart' }, { value: 'blank', label: 'Blank' }],
            defaultValue: 'chart'
        }, { width: 500, height: 300 });

        // Slot a line chart into 'chart' tab
        await js(`(function () {
            var tabsEl = NexaTest.wc("tab-chart-test");
            var comp = NEXA.getComponent("${P}line-chart");
            var chartEl = document.createElement(comp.tag);
            chartEl.slot = "chart";
            chartEl.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
            chartEl._nexaRender({ series: [{ name: "A", data: [{ x: 1000, y: 10 }, { x: 2000, y: 50 }, { x: 3000, y: 30 }] }] });
            tabsEl.appendChild(chartEl);
            return 1;
        })()`);
        await settle();
        await js('new Promise(function (r) { setTimeout(r, 150); })');

        const tag = await js(`NEXA.getComponent("${P}line-chart").tag`);

        // 1. Initial render on active 'chart' tab
        const initialPixels = await js(`(function () {
            var chartEl = NexaTest.wc("tab-chart-test").querySelector("${tag}");
            var c = chartEl.renderRoot.querySelector("canvas");
            var ctx = c.getContext("2d");
            var img = ctx.getImageData(0, 0, c.width, c.height).data;
            var nonZero = 0;
            for (var i = 0; i < img.length; i += 4) { if (img[i+3] > 0) nonZero++; }
            return { width: c.width, height: c.height, nonZero: nonZero };
        })()`);
        assert.ok(initialPixels.width > 200, 'canvas width initially > 200: ' + initialPixels.width);
        assert.ok(initialPixels.nonZero > 100, 'canvas has drawn pixels initially: ' + initialPixels.nonZero);

        // 2. Switch away to 'blank' tab
        await clickAt(q('tab-chart-test', '.tab[data-value="blank"]'));
        await settle();
        await js('new Promise(function (r) { setTimeout(r, 100); })');

        // 3. Switch BACK to 'chart' tab
        await clickAt(q('tab-chart-test', '.tab[data-value="chart"]'));
        await settle();
        await js('new Promise(function (r) { setTimeout(r, 150); })');

        // 4. Verify canvas is NOT 1x1, has full dimensions, and chart lines are still rendered
        const restoredPixels = await js(`(function () {
            var chartEl = NexaTest.wc("tab-chart-test").querySelector("${tag}");
            var c = chartEl.renderRoot.querySelector("canvas");
            var ctx = c.getContext("2d");
            var img = ctx.getImageData(0, 0, c.width, c.height).data;
            var nonZero = 0;
            for (var i = 0; i < img.length; i += 4) { if (img[i+3] > 0) nonZero++; }
            return { width: c.width, height: c.height, nonZero: nonZero };
        })()`);
        assert.ok(restoredPixels.width > 200, 'canvas width restored > 200 after tab switch: ' + restoredPixels.width);
        assert.ok(restoredPixels.nonZero > 100, 'canvas has drawn pixels restored after tab switch: ' + restoredPixels.nonZero);
    });

    await ok('Line Chart: loads and renders a series\' array data while its point is bound to a message not there yet', async () => {
        const tag = await js(`NEXA.getComponent("${P}line-chart").tag`);
        const result = await js(`(async function () {
            var comp = NEXA.getComponent("${P}line-chart");
            var el = document.createElement(comp.tag);
            el.style.cssText = "width:400px;height:250px;";
            document.body.appendChild(el);
            el._nexaRender({
                series: [{ name: "T", point: "{msg.append}", data: [{ x: 1790874000000, y: 27.4 }, { x: 1790877600000, y: 29.1 }] }],
                timeWindow: "auto"
            });
            await new Promise(function (r) { setTimeout(r, 100); });
            var c = el.renderRoot.querySelector("canvas");
            var count = el.ringBuffer ? el.ringBuffer.count : 0;
            var ctx = c.getContext("2d");
            var img = ctx.getImageData(0, 0, c.width, c.height).data;
            var nonZero = 0;
            for (var i = 0; i < img.length; i += 4) { if (img[i+3] > 0) nonZero++; }
            el.remove();
            return { count: count, nonZero: nonZero };
        })()`);
        assert.strictEqual(result.count, 2, 'the series loaded its 2 points');
        assert.ok(result.nonZero > 50, 'canvas rendered pixels: ' + result.nonZero);
    });


    await ok('Line Chart: keeps every point (several in one tick, late ones in order, exact values, appendPoints, the newest when shrunk)', async () => {
        const S1 = { id: 's1', name: 'Trend', maxPoints: 1000, point: { $bind: [{ src: 'sparkplug', ref: 'G::E::D::trend' }] } };
        await mount('lc-full', 'line-chart', { series: [S1] }, { width: 500, height: 260 });
        const buf = `NexaTest.wc("lc-full").ringBuffer`;
        const xs = () => js(`(function () { var b = ${buf}, o = []; for (var i = 0; i < b.count; i++) o.push(b.getX(i)); return o; })()`);
        // three values in ONE tick (a burst): none may be lost
        await js(`(function () { [[1000, 1.1], [2000, 2.2], [3000, 3.3]].forEach(function (p) { NexaTest.setTag("lc-full", { x: p[0], y: p[1] }, "G::E::D::trend"); }); return 1; })()`);
        await settle();
        assert.deepStrictEqual(await xs(), [1000, 2000, 3000], 'a burst in one tick: every point');
        assert.strictEqual(await js(`${buf}.getY(1)`), 2.2, 'exact value (no Float32 rounding)');
        // a late point (reconnect): put in its place, so search / zoom stay right
        await js(`NexaTest.setTag("lc-full", { x: 2500, y: 9 }, "G::E::D::trend")`); await settle();
        assert.deepStrictEqual(await xs(), [1000, 2000, 2500, 3000], 'a late point in order');
        // the same sample delivered twice is one point
        await js(`NexaTest.setTag("lc-full", { x: 3000, y: 3.3 }, "G::E::D::trend")`); await settle();
        assert.strictEqual((await xs()).length, 4, 'an exact repeat of the last point is not added');
        // a batch from Logic: Update Component -> appendPoints
        const added = await js(`NexaTest.invoke("lc-full", "appendPoints", { points: Array.from({ length: 2000 }, function (_, i) { return { x: 4000 + i, y: i }; }) })`);
        assert.strictEqual(added, 2000);
        assert.strictEqual(await js(`${buf}.count`), 1000, 'bounded by Max Points (the oldest go)');
        assert.strictEqual(await js(`${buf}.getX(999)`), 5999, 'the newest kept');
        // Max Points smaller: the NEWEST stay
        await js(`NexaTest.setProps("lc-full", { series: [Object.assign({}, ${JSON.stringify(S1)}, { maxPoints: 100 })] })`); await settle();
        assert.deepStrictEqual([await js(`${buf}.count`), await js(`${buf}.getX(0)`), await js(`${buf}.getX(99)`)], [100, 5900, 5999], 'shrunk: the newest 100');
        await js(`NexaTest.invoke("lc-full", "clearPoints")`); await settle();
        assert.strictEqual(await js(`${buf}.count`), 0, 'clearPoints');
    });

    await ok('Line Chart: the LOD draws exactly what the plain scan draws (1 M points, the full span and zoomed)', async () => {
        await mount('lc-lod', 'line-chart', { series: [{ name: 'Big', maxPoints: 1000000 }] }, { width: 600, height: 260 });
        const r = await js(`(function () {
            var wc = NexaTest.wc("lc-lod"), buf = wc.ringBuffer, pts = [];
            for (var i = 0; i < 1000000; i++) pts.push({ x: i * 100, y: Math.round(Math.sin(i / 997) * 50 + (i % 13)) });
            wc.appendPoints({ points: pts });
            var D = wc.decimator.constructor, lod = new D(2048), scan = new D(2048); scan.useLod = false;
            function same(v0, v1, pw) {
                var s = 0, e = buf.count;
                var n1 = lod.decimate(buf, s, e, pw, v0, v1), n2 = scan.decimate(buf, s, e, pw, v0, v1);
                if (n1 !== n2) return false;
                for (var k = 0; k < n1; k++) if (lod.outX[k] !== scan.outX[k] || lod.outY[k] !== scan.outY[k]) return false;
                return true;
            }
            var t0 = performance.now(); lod.decimate(buf, 0, buf.count, 600, buf.getX(0), buf.getX(buf.count - 1));
            var t1 = performance.now(); lod.decimate(buf, 0, buf.count, 600, buf.getX(0), buf.getX(buf.count - 1));
            var ms = performance.now() - t1;
            return { full: same(buf.getX(0), buf.getX(buf.count - 1), 600), zoom: same(30000000, 52000000, 437), ms: ms, count: buf.count };
        })()`);
        assert.strictEqual(r.count, 1000000);
        assert.ok(r.full && r.zoom, 'pixel-identical to the scan: ' + JSON.stringify(r));
        assert.ok(r.ms < 20, 'a full-span draw of 1 M points is fast: ' + r.ms.toFixed(2) + ' ms');
        await js(`NexaTest.invoke("lc-lod", "clearPoints")`);
    });


    await ok('Line Chart: many series — each its own data and buffer, layers, a right axis, legend, a shared tooltip', async () => {
        const t0 = 1790874000000;
        const wave = (k, base) => Array.from({ length: 60 }, (_, i) => ({ x: t0 + i * 1000, y: base + Math.sin(i / 6 + k) * 5 }));
        await mount('lc-multi', 'line-chart', {
            series: [
                { id: 'a', name: 'Temp', unit: '°C', data: { $bind: [], static: wave(0, 20) }, fill: 'gradient' },
                { id: 'b', name: 'Power', unit: 'kW', axis: 'right', variant: 'step', data: { $bind: [], static: wave(1, 300) } },
                { id: 'c', name: 'Flow', variant: 'smooth', dash: 'dashed', data: { $bind: [], static: wave(2, 40) } }
            ],
            legendValue: 'last', thresholds: [{ value: 25, label: 'High', color: '#ef4444' }]
        }, { width: 600, height: 300 });
        const wc = `NexaTest.wc("lc-multi")`;
        const r = await js(`(function () { var w = ${wc}; return { counts: w.seriesList().map(function (s) { return w._state(s).buf.count; }), right: w._usesRight(),
            legend: Array.from(w.renderRoot.querySelectorAll(".lg-item")).map(function (b) { return b.querySelector(".lg-name").textContent + "=" + b.querySelector(".lg-val").textContent; }) }; })()`);
        assert.deepStrictEqual(r.counts, [60, 60, 60], 'each series its own buffer');
        assert.strictEqual(r.right, true, 'a series on the right axis: the right axis shows');
        assert.strictEqual(r.legend.length, 3);
        assert.ok(/^Power=\d+(\.\d+)? kW$/.test(r.legend[1]), 'the legend shows the last value and the unit: ' + r.legend[1]);
        // a shared tooltip: every series at the time under the cursor
        const at = await js(`(function () { var e = ${root('lc-multi')}.querySelector(".plot"); e.scrollIntoView({ block: "center" }); var b = e.getBoundingClientRect(); return { x: Math.round(b.left + 300), y: Math.round(b.top + 100) }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
        await settle();
        const rows = await js(`Array.from(${root('lc-multi')}.querySelectorAll(".tooltip-row")).map(function (r) { return r.textContent.trim(); })`);
        assert.strictEqual(rows.length, 3, 'shared: one row per series: ' + JSON.stringify(rows));
        assert.ok(/^Temp:/.test(rows[0]) && / °C$/.test(rows[0]), rows[0]);
        const hover = await js(`NexaTest.item("lc-multi").events.filter(function (e) { return e[0] === "hover"; }).pop()`);
        assert.ok(hover && Object.keys(hover[1].values).length === 3, 'Logic hears the hover: ' + JSON.stringify(hover));
        // nearest: one row
        await js(`NexaTest.setProps("lc-multi", { tooltipMode: "nearest" })`); await settle();
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x + 2, y: at.y });
        await settle();
        assert.strictEqual(await js(`${root('lc-multi')}.querySelectorAll(".tooltip-row").length`), 1, 'nearest: one row');
        // the legend: a click hides a series (and tells Logic), Alt+click shows only that one
        await clickAt(`${root('lc-multi')}.querySelectorAll(".lg-item")[1]`);
        let vis = await js(`${wc}._visible().map(function (s) { return s.id; })`);
        assert.deepStrictEqual(vis, ['a', 'c'], 'hidden from the legend');
        const tog = await js(`NexaTest.item("lc-multi").events.filter(function (e) { return e[0] === "seriesToggle"; }).pop()`);
        assert.deepStrictEqual(tog[1], { series: 'b', visible: false });
        await js(`(function () { ${root('lc-multi')}.querySelectorAll(".lg-item")[2].dispatchEvent(new MouseEvent("click", { bubbles: true, altKey: true })); return 1; })()`); await settle();
        vis = await js(`${wc}._visible().map(function (s) { return s.id; })`);
        assert.deepStrictEqual(vis, ['c'], 'Alt+click: only this one');
        const px = await js(`(function () { var c = ${root('lc-multi')}.querySelector("canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, n = 0; for (var i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()`);
        assert.ok(px > 500, 'drawn: ' + px);
    });

    await ok('Line Chart: Logic per series (append / set / clear / show), by Id, name or index; others untouched', async () => {
        await mount('lc-act', 'line-chart', { series: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, { width: 500, height: 260 });
        const counts = () => js(`(function () { var w = NexaTest.wc("lc-act"); return w.seriesList().map(function (s) { return w._state(s).buf.count; }); })()`);
        assert.strictEqual(await js(`NexaTest.invoke("lc-act", "appendPoints", { series: "b", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })`), 2);
        assert.deepStrictEqual(await counts(), [0, 2], 'only series b');
        await js(`NexaTest.invoke("lc-act", "setPoints", { series: "A", points: [{ x: 1, y: 5 }, { x: 2, y: 6 }, { x: 3, y: 7 }] })`);
        assert.deepStrictEqual(await counts(), [3, 2], 'by name');
        await js(`NexaTest.invoke("lc-act", "appendPoints", { series: 1, points: [{ x: 3, y: 3 }] })`);
        assert.deepStrictEqual(await counts(), [3, 3], 'by index');
        await js(`NexaTest.invoke("lc-act", "clearSeries", { series: "a" })`);
        assert.deepStrictEqual(await counts(), [0, 3]);
        await js(`NexaTest.invoke("lc-act", "setVisible", { series: "b", visible: false })`);
        assert.deepStrictEqual(await js(`NexaTest.wc("lc-act")._visible().length`), 0);
        await js(`NexaTest.invoke("lc-act", "setRange", { from: 1, to: 2 })`);
        assert.deepStrictEqual(await js(`NexaTest.wc("lc-act").viewRange`), { minX: 1, maxX: 2 });
    });

    await ok('Line Chart: two series fed by two messages stay independent; a tag point appends; ??? adds nothing', async () => {
        const M = (path) => ({ $bind: [{ src: 'msg', ref: path }] });
        await mount('lc-msg', 'line-chart', { series: [{ id: 't', name: 'T', data: M('payload.temp') }, { id: 'p', name: 'P', data: M('payload.press'), point: { $bind: [{ src: 'sparkplug', ref: 'G::E::D::P' }] } }] }, { width: 500, height: 260 });
        const counts = () => js(`(function () { var w = NexaTest.wc("lc-msg"); return w.seriesList().map(function (s) { return w._state(s).buf.count; }); })()`);
        await js(`NexaTest.setMessage("lc-msg", { payload: { temp: [{ x: 1, y: 1 }, { x: 2, y: 2 }] } })`); await settle();
        assert.deepStrictEqual(await counts(), [2, 0]);
        await js(`NexaTest.setMessage("lc-msg", { payload: { press: [{ x: 1, y: 9 }] } })`); await settle();
        assert.deepStrictEqual(await counts(), [2, 1], 'the second message leaves the first series alone');
        await js(`NexaTest.setTag("lc-msg", 42, "G::E::D::P")`); await settle();
        assert.deepStrictEqual(await counts(), [2, 2], 'a number from a tag: one more point (now)');
        await js(`NexaTest.setTag("lc-msg", "???", "G::E::D::P")`); await settle();
        assert.deepStrictEqual(await counts(), [2, 2], 'unknown: nothing added');
    });

    await ok('Line Chart: a v1 chart (one series in flat props) becomes Series 1, its bindings kept', async () => {
        await mount('lc-v1', 'line-chart', { label: 'Old', unit: 'kW', lineColor: '#ff0000', areaFill: false, inputData: '{msg.payload}', inputPoint: '{sparkplug:G::E::D::P}', maxPoints: 500, __fallback: { inputData: '[]' } }, { width: 400, height: 200, migrate: true });
        const raw = await js(`JSON.stringify(NexaTest.item("lc-v1").raw)`);
        const p = JSON.parse(raw);
        assert.deepStrictEqual(Object.keys(p).filter((k) => /^(label|unit|lineColor|inputData|inputPoint|maxPoints|__fallback)$/.test(k)), [], 'the flat props are gone: ' + raw);
        const s = p.series[0];
        assert.deepStrictEqual([s.id, s.name, s.unit, s.color, s.fill, s.maxPoints], ['s1', 'Old', 'kW', '#ff0000', 'none', 500]);
        assert.deepStrictEqual(s.data, { $bind: [{ src: 'msg', ref: 'payload' }], static: '[]' }, 'its data binding + fallback');
        assert.deepStrictEqual(s.point, { $bind: [{ src: 'sparkplug', ref: 'G::E::D::P' }] });
    });

    await ok('Line Chart: a gap (longer silence than "Break the line after") splits the line; the canvas shows sample waves', async () => {
        await mount('lc-gap', 'line-chart', { series: [{ name: 'G', gapAfter: 5000, data: [{ x: 0, y: 1 }, { x: 1000, y: 2 }, { x: 20000, y: 3 }, { x: 21000, y: 4 }] }] }, { width: 400, height: 200 });
        const runs = await js(`(function () { var w = NexaTest.wc("lc-gap"), s = w.seriesList()[0]; return w._runs(w._state(s), 5000).length / 2; })()`);
        assert.strictEqual(runs, 2, 'two runs');
        await mount('lc-design', 'line-chart', { series: [{ name: 'A' }, { name: 'B' }] }, { width: 400, height: 200, design: true });
        const demo = await js(`(function () { var w = NexaTest.wc("lc-design"); return w.seriesList().map(function (s) { var st = w._state(s); return st.demo && st.buf.count > 0; }); })()`);
        assert.deepStrictEqual(demo, [true, true], 'the editor shows a sample wave per series');
    });

    await ok('the inspector: every plain prop takes a binding (Static | Binding); colours and sizes take theme tokens (◆), a token shows as a chip', async () => {
        const r = await js(`(async function () {
            var t = NexaTest.inspector("${P}button", {});
            await new Promise(function (r) { setTimeout(r, 200); });
            // the property tree: pick a prop's row, its widget is in the pane
            var rows = NexaTest.rows(t.box);
            var by = function (l) { var row = rows.filter(function (x) { return x.label === l; })[0]; return row ? t.field(row.id) : Promise.resolve(null); };
            var text = await by("Text"), out = { text: !!text && text.querySelector(".nx-fs-row .nx-mode-select") !== null };
            var radius = await by("Corner radius");
            out.radius = radius && (radius.querySelector(".nx-token-chip") || {}).textContent;
            out.tokenBtn = !!(radius && radius.querySelector(".nx-token-btn"));
            out.tabs = rows.filter(function (x) { return /^@[^/]+$/.test(x.id); }).map(function (x) { return x.label; });
            t.destroy();
            return out;
        })()`);
        assert.strictEqual(r.text, true, 'Text: the Static | Binding switch');
        assert.ok(/radii\.md/.test(r.radius || ''), 'the radius is a token chip: ' + r.radius);
        assert.strictEqual(r.tokenBtn, true);
        assert.deepStrictEqual(r.tabs, ['Data', 'Content', 'Style', 'Behaviour', 'Custom CSS']);
    });

    await ok('no JavaScript errors or warnings while drawing them', async () => {
        assert.deepStrictEqual(logs.filter((l) => !/dev mode/.test(l)), []);
    });

    console.log(`\n${passed} passed\nALL OK`);
});
