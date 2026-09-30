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
    'tabs', 'iframe', 'datetime', 'pagination'];
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

    await ok('all 34 components register (UI · Form / Display / Layout / Embed), each mounts and draws', async () => {
        const reg = await js(`${JSON.stringify(ALL)}.map(function (id) { var d = NEXA.getComponent("${P}" + id); return d ? d.category : "MISSING " + id; })`);
        assert.deepStrictEqual(reg.filter((c) => c !== 'UI · Form' && c !== 'UI · Display' && c !== 'UI · Layout' && c !== 'UI · Embed'), []);
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

    await ok('the inspector: every plain prop takes a binding (⛓); colours and sizes take theme tokens (◆), a token shows as a chip', async () => {
        const r = await js(`(async function () {
            var t = NexaTest.inspector("${P}button", {});
            await new Promise(function (r) { setTimeout(r, 200); });
            var fields = Array.from(t.box.querySelectorAll(".nx-kit")).filter(function (e) { return e.label; });
            var by = function (l) { return fields.filter(function (e) { return e.label === l; })[0]; };
            var out = { text: !!by("Text") && by("Text").querySelector(".nx-icon-btn .fa-link") !== null,
                radius: by("Corner radius") && (by("Corner radius").querySelector(".nx-token-chip") || {}).textContent,
                tokenBtn: !!(by("Corner radius") && by("Corner radius").querySelector(".nx-token-btn")),
                tabs: Array.from(t.box.querySelectorAll("nx-tab")).map(function (x) { return x.label || x.getAttribute("label"); }) };
            t.destroy();
            return out;
        })()`);
        assert.strictEqual(r.text, true, 'Text: the ⛓ bind button');
        assert.ok(/radii\.md/.test(r.radius || ''), 'the radius is a token chip: ' + r.radius);
        assert.strictEqual(r.tokenBtn, true);
        assert.deepStrictEqual(r.tabs, ['Data', 'Content', 'Style', 'Behaviour', 'Custom CSS']);
    });

    await ok('no JavaScript errors or warnings while drawing them', async () => {
        assert.deepStrictEqual(logs.filter((l) => !/dev mode/.test(l)), []);
    });

    console.log(`\n${passed} passed\nALL OK`);
});
