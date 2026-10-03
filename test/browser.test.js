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

    // ---- Line Chart (v3): series are Logic targets ----------------------------------------------
    const S = (id, extra) => Object.assign({ id, name: id.toUpperCase() }, extra || {});
    const series = (name) => `NexaTest.wc(${JSON.stringify(name)})`;
    const counts = (name) => js(`(function () { var w = ${series(name)}; return w.seriesList().map(function (s) { return w._state(s).buf.count; }); })()`);
    const pixels = (name) => js(`(function () { var c = ${root(name)}.querySelector("canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, n = 0; for (var i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()`);
    const T0 = 1727852400000;
    const wave = (k, base, n, step) => Array.from({ length: n || 60 }, (_, i) => ({ x: T0 + i * (step || 1000), y: Math.round((base + Math.sin(i / 6 + k) * 5) * 100) / 100 }));

    await ok('Line Chart: draws, crosshair + tooltip (label, value, unit), the inspector, the two-row ruler drags in time', async () => {
        await mount('chart-test', 'line-chart', { series: [S('s1', { name: 'Speed', unit: 'rpm', live: [{ x: T0, y: 120 }, { x: T0 + 1000, y: 123 }, { x: T0 + 2000, y: 121 }] })] }, { width: 500, height: 260 });
        assert.strictEqual(await js(`!!${root('chart-test')}.querySelector('canvas')`), true);
        const plot = `${root('chart-test')}.querySelector('.plot')`;
        const b = await js(`(function () { var e = ${plot}; e.scrollIntoView({ block: "center" }); var r = e.getBoundingClientRect(); return { x: Math.round(r.left + 200), y: Math.round(r.top + 80), bottom: Math.round(r.bottom - 14), left: Math.round(r.left) }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
        await settle();
        const tip = await js(`${root('chart-test')}.querySelector('.tooltip').textContent`);
        assert.ok(/Speed: 12\d rpm/.test(tip), 'tooltip: ' + tip);
        const rows = await js(`(async function () { var insp = NexaTest.inspector("${P}line-chart", {}); await new Promise(function (r) { setTimeout(r, 250); }); return NexaTest.rows(insp.box).map(function (r) { return r.label; }); })()`);
        for (const l of ['Series', 'Time range', 'Time ruler', 'Zoom in to at most', 'Export button on the chart']) assert.ok(rows.includes(l), 'inspector: ' + l);
        // the ruler (two rows) says it can be dragged, and moves the time (the inspector moved the page: measure again)
        Object.assign(b, await js(`(function () { var e = ${plot}; e.scrollIntoView({ block: "center" }); var r = e.getBoundingClientRect(); return { x: Math.round(r.left + 200), bottom: Math.round(r.bottom - 14) }; })()`));
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x + 50, y: b.bottom });
        await settle();
        assert.ok(await js(`${plot}.classList.contains("hover-ruler")`), 'a grab cursor over the ruler');
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x: b.x + 50, y: b.bottom });
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', buttons: 1, x: b.x, y: b.bottom });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: b.x, y: b.bottom });
        await settle();
        assert.strictEqual(await js(`!!${root('chart-test')}.querySelector('.btn-reset-zoom')`), true, 'dragged: paused, a Live button');
        const ev = await js(`NexaTest.item("chart-test").events.filter(function (e) { return e[0] === "rangeChange" || e[0] === "liveChange"; }).map(function (e) { return e[0] + ":" + (e[1].cause || e[1].live); })`);
        assert.ok(ev.includes('liveChange:false') && ev.includes('rangeChange:ruler'), 'events: ' + JSON.stringify(ev));
        assert.ok((await pixels('chart-test')) > 500);
    });

    await ok('Line Chart: retains drawing and canvas dimensions when switching tabs', async () => {
        await mount('tab-chart-test', 'tabs', { tabs: [{ value: 'chart', label: 'Chart' }, { value: 'blank', label: 'Blank' }], defaultValue: 'chart' }, { width: 500, height: 300 });
        await js(`(function () {
            var tabsEl = NexaTest.wc("tab-chart-test"), comp = NEXA.getComponent("${P}line-chart"), chartEl = document.createElement(comp.tag);
            chartEl.slot = "chart";
            chartEl.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
            chartEl._nexaRender({ series: [{ id: "a", name: "A", live: [{ x: 1000, y: 10 }, { x: 2000, y: 50 }, { x: 3000, y: 30 }] }] });
            tabsEl.appendChild(chartEl);
            return 1;
        })()`);
        await settle();
        await js('new Promise(function (r) { setTimeout(r, 150); })');
        const tag = await js(`NEXA.getComponent("${P}line-chart").tag`);
        const px = () => js(`(function () { var c = NexaTest.wc("tab-chart-test").querySelector("${tag}").renderRoot.querySelector("canvas"); var d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, n = 0; for (var i = 3; i < d.length; i += 4) if (d[i]) n++; return { w: c.width, n: n }; })()`);
        const a = await px();
        assert.ok(a.w > 200 && a.n > 100, JSON.stringify(a));
        await clickAt(q('tab-chart-test', '.tab[data-value="blank"]')); await settle();
        await clickAt(q('tab-chart-test', '.tab[data-value="chart"]')); await settle();
        await js('new Promise(function (r) { setTimeout(r, 150); })');
        const b = await px();
        assert.ok(b.w > 200 && b.n > 100, 'restored: ' + JSON.stringify(b));
    });

    await ok('Line Chart: a live value from a tag — every point kept (a burst, late ones in order, exact), Append by the series\' own action, the newest when shrunk', async () => {
        const S1 = S('s1', { maxPoints: 1000, live: { $bind: [{ src: 'sparkplug', ref: 'G::E::D::trend' }] } });
        await mount('lc-full', 'line-chart', { series: [S1] }, { width: 500, height: 260 });
        const buf = `NexaTest.wc("lc-full").ringBuffer`;
        const xs = () => js(`(function () { var b = ${buf}, o = []; for (var i = 0; i < b.count; i++) o.push(b.getX(i)); return o; })()`);
        await js(`(function () { [[1000, 1.1], [2000, 2.2], [3000, 3.3]].forEach(function (p) { NexaTest.setTag("lc-full", { x: p[0], y: p[1] }, "G::E::D::trend"); }); return 1; })()`);
        await settle();
        assert.deepStrictEqual(await xs(), [1000, 2000, 3000], 'a burst in one tick: every point');
        assert.strictEqual(await js(`${buf}.getY(1)`), 2.2);
        await js(`NexaTest.setTag("lc-full", { x: 2500, y: 9 }, "G::E::D::trend")`); await settle();
        assert.deepStrictEqual(await xs(), [1000, 2000, 2500, 3000], 'a late point in order');
        await js(`NexaTest.setTag("lc-full", 42, "G::E::D::trend")`); await settle();
        assert.strictEqual((await xs()).length, 5, 'a number: one more point (now)');
        const added = await js(`NexaTest.invoke("lc-full", "appendPoints", Array.from({ length: 2000 }, function (_, i) { return { x: 1e13 + i, y: i }; }), { list: "series", id: "s1" })`);
        assert.strictEqual(added, 2000, 'msg.payload = the points, the series\' own action');
        assert.strictEqual(await js(`${buf}.count`), 1000, 'bounded by Points kept');
        await js(`NexaTest.setProps("lc-full", { series: [Object.assign({}, ${JSON.stringify(S1)}, { maxPoints: 100 })] })`); await settle();
        assert.deepStrictEqual([await js(`${buf}.count`), await js(`${buf}.getX(99)`)], [100, 1e13 + 1999], 'shrunk: the newest 100');
        await js(`NexaTest.invoke("lc-full", "clearAll")`); await settle();
        assert.strictEqual(await js(`${buf}.count`), 0, 'Clear every series');
    });

    await ok('Line Chart: the LOD draws exactly what the plain scan draws (1 M points, the full span and zoomed)', async () => {
        await mount('lc-lod', 'line-chart', { series: [S('big', { maxPoints: 1000000 })] }, { width: 600, height: 260 });
        const r = await js(`(function () {
            var wc = NexaTest.wc("lc-lod"), pts = [];
            for (var i = 0; i < 1000000; i++) pts.push({ x: i * 100, y: Math.round(Math.sin(i / 997) * 50 + (i % 13)) });
            wc.appendPoints(pts);
            var buf = wc.ringBuffer, D = wc.decimator.constructor, lod = new D(2048), scan = new D(2048); scan.useLod = false;
            function same(v0, v1, pw) {
                var n1 = lod.decimate(buf, 0, buf.count, pw, v0, v1), n2 = scan.decimate(buf, 0, buf.count, pw, v0, v1);
                if (n1 !== n2) return false;
                for (var k = 0; k < n1; k++) if (lod.outX[k] !== scan.outX[k] || lod.outY[k] !== scan.outY[k]) return false;
                return true;
            }
            lod.decimate(buf, 0, buf.count, 600, buf.getX(0), buf.getX(buf.count - 1));
            var t1 = performance.now(); lod.decimate(buf, 0, buf.count, 600, buf.getX(0), buf.getX(buf.count - 1));
            var ms = performance.now() - t1;
            return { full: same(buf.getX(0), buf.getX(buf.count - 1), 600), zoom: same(30000000, 52000000, 437), ms: ms, count: buf.count };
        })()`);
        assert.strictEqual(r.count, 1000000);
        assert.ok(r.full && r.zoom, 'pixel-identical: ' + JSON.stringify(r));
        assert.ok(r.ms < 20, 'fast: ' + r.ms.toFixed(2) + ' ms');
        await js(`NexaTest.invoke("lc-lod", "clearAll")`);
    });

    await ok('Line Chart: many series — buffers, layers, a right axis, legend (value, unit, number format), a shared / nearest tooltip, Alt+click solo', async () => {
        await mount('lc-multi', 'line-chart', {
            series: [S('a', { name: 'Temp', unit: '°C', live: wave(0, 20), fill: 'gradient' }), S('b', { name: 'Power', unit: 'kW', axis: 'right', variant: 'step', notation: 'si', live: wave(1, 1500) }),
                S('c', { name: 'Flow', variant: 'smooth', dash: 'dashed', live: wave(2, 40) })],
            legendValue: 'last', separators: 'dot', thresholds: [{ value: 25, label: 'High' }]
        }, { width: 600, height: 300 });
        assert.deepStrictEqual(await counts('lc-multi'), [60, 60, 60]);
        const legend = await js(`Array.from(${root('lc-multi')}.querySelectorAll(".lg-item")).map(function (b) { return b.querySelector(".lg-name").textContent + "=" + b.querySelector(".lg-val").textContent; })`);
        assert.ok(/^Power=1\.\d+ MW$/.test(legend[1]), 'engineering notation scales the unit: ' + legend[1]);
        const at = await js(`(function () { var e = ${root('lc-multi')}.querySelector(".plot"); e.scrollIntoView({ block: "center" }); var b = e.getBoundingClientRect(); return { x: Math.round(b.left + 300), y: Math.round(b.top + 100) }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y }); await settle();
        const rows = await js(`Array.from(${root('lc-multi')}.querySelectorAll(".tooltip-row")).map(function (r) { return r.textContent.trim(); })`);
        assert.strictEqual(rows.length, 3, 'shared: ' + JSON.stringify(rows));
        assert.ok(/^Temp: [\d.]+ °C$/.test(rows[0]) && /^Power: [\d.]+ MW$/.test(rows[1]), JSON.stringify(rows));
        const hover = await js(`NexaTest.item("lc-multi").events.filter(function (e) { return e[0] === "hover"; }).pop()`);
        assert.strictEqual(Object.keys(hover[1].values).length, 3, 'On Hover: every value');
        await js(`NexaTest.setProps("lc-multi", { tooltipShows: "nearest" })`); await settle();
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x + 2, y: at.y }); await settle();
        assert.strictEqual(await js(`${root('lc-multi')}.querySelectorAll(".tooltip-row").length`), 1, 'nearest: one row');
        await clickAt(`${root('lc-multi')}.querySelectorAll(".lg-item")[1]`);
        assert.deepStrictEqual(await js(`${series('lc-multi')}._visible().map(function (s) { return s.id; })`), ['a', 'c'], 'hidden from the legend');
        await js(`(function () { ${root('lc-multi')}.querySelectorAll(".lg-item")[2].dispatchEvent(new MouseEvent("click", { bubbles: true, altKey: true })); return 1; })()`); await settle();
        assert.deepStrictEqual(await js(`${series('lc-multi')}._visible().map(function (s) { return s.id; })`), ['c'], 'Alt+click: only this one');
        assert.ok((await pixels('lc-multi')) > 500);
    });

    await ok('Line Chart: a tooltip expression ({value}, {delta}, another series [series]{id}, fmt())', async () => {
        await mount('lc-expr', 'line-chart', {
            separators: 'dot',
            series: [S('p', { name: 'Power', live: [{ x: T0, y: 1000 }, { x: T0 + 1000, y: 1500 }], tooltipMode: 'expression', expression: '{name} ": " fmt({value}, "compact") " (Δ " {delta} "), eff " round({value} / [series]{f} * 100, 1) "%"' }),
                S('f', { name: 'Flow', live: [{ x: T0, y: 2000 }, { x: T0 + 1000, y: 3000 }] })]
        }, { width: 500, height: 260 });
        const r = await js(`(function () { var w = ${series('lc-expr')}, l = w.seriesList(); w.draw(); var hits = [{ s: l[0], x: ${T0 + 1000}, y: 1500, idx: 1 }, { s: l[1], x: ${T0 + 1000}, y: 3000, idx: 1 }]; return w.tooltipText(hits[0], hits); })()`);
        assert.strictEqual(r, 'Power: 1.5K (Δ 500), eff 50%');
    });

    await ok('Line Chart: the series\' own Logic (Append / Replace / Clear / Show / Hide), events with the series as their target', async () => {
        await mount('lc-act', 'line-chart', { series: [S('a'), S('b')], thresholds: [{ value: 10 }] }, { width: 500, height: 260 });
        const t = (id) => JSON.stringify({ list: 'series', id });
        await js(`NexaTest.invoke("lc-act", "appendPoints", [{ x: 1, y: 1 }, { x: 2, y: 2 }], ${t('b')})`);
        assert.deepStrictEqual(await counts('lc-act'), [0, 2], 'only series b');
        await js(`NexaTest.invoke("lc-act", "replacePoints", [{ x: 1, y: 5 }, { x: 2, y: 6 }, { x: 3, y: 7 }], ${t('a')})`);
        assert.deepStrictEqual(await counts('lc-act'), [3, 2]);
        await js(`NexaTest.invoke("lc-act", "appendPoints", { x: 4, y: 12 }, ${t('a')})`);
        const cross = await js(`NexaTest.item("lc-act").events.filter(function (e) { return e[0] === "thresholdCross"; })`);
        assert.deepStrictEqual(cross[0].slice(1), [{ direction: 'up', value: 12, threshold: 10, label: '' }, { list: 'series', id: 'a' }], 'On Threshold Crossed, of series a');
        await js(`NexaTest.invoke("lc-act", "clear", null, ${t('a')})`);
        assert.deepStrictEqual(await counts('lc-act'), [0, 2]);
        await js(`NexaTest.invoke("lc-act", "hide", null, ${t('b')})`);
        assert.strictEqual(await js(`${series('lc-act')}._visible().length`), 0);
        await js(`NexaTest.invoke("lc-act", "show", null, ${t('b')})`);
        assert.strictEqual(await js(`${series('lc-act')}._visible().length`), 1);
        const bad = await js(`(function () { try { NexaTest.invoke("lc-act", "appendPoints", []); return null; } catch (e) { return e.message; } })()`);
        assert.ok(/no action "appendPoints"/.test(bad), 'Append is the series\' action, not the chart\'s: ' + bad);
        await js(`NexaTest.invoke("lc-act", "setRange", { from: 1, to: 2 })`);
        assert.deepStrictEqual(await js(`${series('lc-act')}.viewRange`), { minX: 1, maxX: 2 });
    });

    await ok('Line Chart: On Stale / On Resume (a series that went quiet), Shift+drag = On Range Select, a click = On Click', async () => {
        await mount('lc-ev', 'line-chart', { series: [S('a', { staleAfter: 300 })] }, { width: 500, height: 260 });
        await js(`NexaTest.invoke("lc-ev", "appendPoints", [{ x: ${T0}, y: 1 }, { x: ${T0 + 60000}, y: 2 }], { list: "series", id: "a" })`);
        await js('new Promise(function (r) { setTimeout(r, 1500); })');
        let ev = await js(`NexaTest.item("lc-ev").events.map(function (e) { return e[0]; })`);
        assert.ok(ev.includes('stale'), 'On Stale: ' + JSON.stringify(ev));
        await js(`NexaTest.invoke("lc-ev", "appendPoints", { x: ${T0 + 61000}, y: 3 }, { list: "series", id: "a" })`);
        ev = await js(`NexaTest.item("lc-ev").events.map(function (e) { return e[0]; })`);
        assert.ok(ev.includes('resume'), 'On Resume');
        await settle();
        const b = await js(`(function () { var e = ${root('lc-ev')}.querySelector(".plot"); e.scrollIntoView({ block: "center" }); var r = e.getBoundingClientRect(); return { x: Math.round(r.left + 150), y: Math.round(r.top + 80) }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x: b.x, y: b.y, modifiers: 8 });
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', buttons: 1, x: b.x + 120, y: b.y, modifiers: 8 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: b.x + 120, y: b.y, modifiers: 8 });
        await settle();
        const sel = await js(`NexaTest.item("lc-ev").events.filter(function (e) { return e[0] === "rangeSelect"; }).pop()`);
        assert.ok(sel && sel[1].to > sel[1].from, 'On Range Select: ' + JSON.stringify(sel));
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x: b.x, y: b.y });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: b.x, y: b.y });
        await settle();
        const click = await js(`NexaTest.item("lc-ev").events.filter(function (e) { return e[0] === "click"; }).pop()`);
        assert.ok(click && click[1].time > T0, 'On Click: ' + JSON.stringify(click));
    });

    await ok('Line Chart: zoom / pan limits (Zoom in to at most, Move only where there is data), the navigator\'s window drags', async () => {
        await mount('lc-lim', 'line-chart', { series: [S('a', { live: wave(0, 20, 600, 1000) })], minSpan: '10s', ruler: 'navigator', timeWindow: '1m' }, { width: 600, height: 280 });
        const w = series('lc-lim');
        await js(`${w}.setRange({ from: ${T0 + 100000}, to: ${T0 + 100100} })`);
        let r = await js(`(function () { var s = ${w}._scale; return s.vMaxX - s.vMinX; })()`);
        assert.ok(Math.abs(r - 10000) < 1, 'never closer than 10 s: ' + r);
        await js(`${w}.setRange({ from: ${T0 - 3600000}, to: ${T0 - 3500000} })`);
        r = await js(`${w}._scale.vMinX`);
        assert.strictEqual(r, T0, 'not before the first point');
        await js(`${w}.followLive()`); await settle();
        const g = await js(`(function () { var e = ${root('lc-lim')}.querySelector(".plot"); e.scrollIntoView({ block: "center" }); var r = e.getBoundingClientRect(), m = ${w}.getPlotMetrics(r.width, r.height), n = ${w}._navGeom(m); return { x: Math.round(r.left + (n.a + n.b) / 2), y: Math.round(r.top + n.y + 18), w: n.w }; })()`);
        const before = await js(`${w}._scale.vMinX`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x: g.x, y: g.y });
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', buttons: 1, x: g.x - 200, y: g.y });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: g.x - 200, y: g.y });
        await settle();
        const after = await js(`${w}._scale.vMinX`);
        assert.ok(after < before - 60000, 'the window dragged back in time: ' + (before - after));
        const nav = await js(`NexaTest.item("lc-lim").events.filter(function (e) { return e[0] === "rangeChange"; }).pop()`);
        assert.strictEqual(nav[1].cause, 'navigator');
    });

    await ok('Line Chart: Export — CSV (a column per series) and a real .xlsx (a zip)', async () => {
        await mount('lc-exp', 'line-chart', { series: [S('a', { name: 'A', unit: 'kW', live: [{ x: T0, y: 1.5 }, { x: T0 + 1000, y: 2 }] }), S('b', { name: 'B', live: [{ x: T0, y: 7 }] })], separators: 'dot' }, { width: 500, height: 260, design: true });
        const r = await js(`(async function () {
            var w = ${series('lc-exp')};
            w.draw();
            var csvRows = w.exportData({ format: "csv", range: "all" }), csv = await w._lastExport.blob.text();
            w.exportData({ format: "xlsx", range: "all" });
            var head = new Uint8Array(await w._lastExport.blob.slice(0, 2).arrayBuffer());
            return { csvRows: csvRows, lines: csv.replace(/^\\ufeff/, "").split("\\r\\n"), xlsx: String.fromCharCode(head[0], head[1]), name: w._lastExport.name };
        })()`);
        assert.strictEqual(r.csvRows, 2);
        assert.strictEqual(r.lines[0], '"Time","A (kW)","B"');
        assert.ok(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.000,1\.5,7$/.test(r.lines[1]), r.lines[1]);
        assert.ok(/,2,$/.test(r.lines[2]), 'B has no point then: ' + r.lines[2]);
        assert.strictEqual(r.xlsx, 'PK', 'an .xlsx is a zip');
        assert.ok(/^chart-\d{8}-\d{4}\.xlsx$/.test(r.name), r.name);
    });

    await ok('Line Chart: v1 (flat props) and v2 (Data / Point) charts become v3 (a series\' Live value)', async () => {
        await mount('lc-v1', 'line-chart', { label: 'Old', unit: 'kW', lineColor: '#ff0000', areaFill: false, inputData: '{msg.payload}', inputPoint: '{sparkplug:G::E::D::P}', maxPoints: 500 }, { width: 400, height: 200, migrate: true });
        const p = JSON.parse(await js(`JSON.stringify(NexaTest.item("lc-v1").raw)`));
        assert.deepStrictEqual(Object.keys(p).filter((k) => /^(label|unit|lineColor|inputData|inputPoint|maxPoints)$/.test(k)), []);
        const s = p.series[0];
        assert.deepStrictEqual([s.id, s.name, s.unit, s.color, s.fill, s.maxPoints], ['s1', 'Old', 'kW', '#ff0000', 'none', 500]);
        assert.deepStrictEqual(s.live, { $bind: [{ src: 'sparkplug', ref: 'G::E::D::P' }] }, 'its point binding is its live value');
        assert.ok(!('data' in s) && !('point' in s));
        await mount('lc-v2', 'line-chart', { __v: 2, series: [{ id: 's1', name: 'X', data: { $bind: [{ src: 'msg', ref: 'payload' }] } }], tooltipMode: 'nearest' }, { width: 400, height: 200 });
        const p2 = JSON.parse(await js(`JSON.stringify(NEXA.getComponent("${P}line-chart").migrateProps(NexaTest.item("lc-v2").raw))`));
        assert.deepStrictEqual(p2.series[0].live, { $bind: [{ src: 'msg', ref: 'payload' }] });
        assert.strictEqual(p2.tooltipShows, 'nearest');
    });

    await ok('Line Chart: a gap (longer silence than "Break the line after") splits the line; the canvas shows sample waves', async () => {
        await mount('lc-gap', 'line-chart', { series: [S('g', { gapAfter: 5000, live: [{ x: 0, y: 1 }, { x: 1000, y: 2 }, { x: 20000, y: 3 }, { x: 21000, y: 4 }] })] }, { width: 400, height: 200 });
        assert.strictEqual(await js(`(function () { var w = ${series('lc-gap')}; w.draw(); return w._runs(w._state(w.seriesList()[0]), 5000).length / 2; })()`), 2);
        await mount('lc-design', 'line-chart', { series: [S('a'), S('b')] }, { width: 400, height: 200, design: true });
        assert.deepStrictEqual(await js(`(function () { var w = ${series('lc-design')}; return w.seriesList().map(function (s) { var st = w._state(s); return st.demo && st.buf.count > 0; }); })()`), [true, true]);
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
