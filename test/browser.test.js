'use strict';

// Nexa UI in a REAL browser (headless Chrome) through the Nexa SDK testkit: every component
// registers and draws; the form controls read their binding and write the user's change
// (two-way); zag widgets (select, slider, tags, pin, rating) by pointer and keyboard; the
// theme (palettes, tokens, dark mode); the inspector gives every prop its binding, its
// breakpoints and tokens. Needs the dashboard built (npm run build there).
//   node test/browser.test.js         (skipped when Chrome is not installed)
//   node test/browser.test.js --only "Chart|Timeline"   only the tests whose name matches (npm run test:charts)

const assert = require('assert');
const path = require('path');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');

let passed = 0;
const onlyAt = process.argv.indexOf('--only'), only = onlyAt !== -1 ? new RegExp(process.argv[onlyAt + 1] || '.', 'i') : null;
async function ok(label, fn) { if (only && !only.test(label)) return; await fn(); passed++; console.log('✔ ' + label); }

const P = 'nexa-ui-';
const ALL = ['button', 'input', 'textarea', 'number-input', 'password-input', 'checkbox', 'switch', 'radio-group', 'segmented', 'select', 'combobox', 'slider', 'tags-input', 'pin-input', 'rating',
    'text', 'heading', 'badge', 'tag', 'card', 'avatar', 'stat', 'alert', 'progress', 'spinner', 'skeleton', 'separator', 'empty-state', 'timeline', 'fieldset',
    'tabs', 'iframe', 'datetime', 'daterange', 'pagination', 'line-chart', 'state-timeline', 'column-chart', 'pie', 'pareto', 'scatter', 'spc', 'radar', 'gauge', 'bar-gauge', 'area-chart', 'kpi', 'histogram'];
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

    await ok('all 48 components register (UI · Form / Display / Layout / Embed / Charts), each mounts and draws', async () => {
        const reg = await js(`${JSON.stringify(ALL)}.map(function (id) { var d = NEXA.getComponent("${P}" + id); return d ? d.category : "MISSING " + id; })`);
        assert.deepStrictEqual(reg.filter((c) => c !== 'UI · Form' && c !== 'UI · Display' && c !== 'UI · Layout' && c !== 'UI · Embed' && c !== 'UI · Charts'), []);
        for (const id of ALL) await mount('all-' + id, id, {}, { width: 320, height: 120 });
        const empty = await js(`${JSON.stringify(ALL)}.filter(function (id) { var r = NexaTest.wc("all-" + id).renderRoot; return !r || !r.innerHTML || r.innerHTML.replace(/<!--[^]*?-->/g, "").trim() === ""; })`);
        assert.deepStrictEqual(empty, []);
    });

    await ok('Custom CSS: ONE field in every component (Load CSS gives the component\'s own CSS; nothing is saved by default); a rule with the library\'s own selector wins; the older part / state fields show only where they hold text', async () => {
        // every component: one "Custom CSS" field with its own default CSS; the older fields hidden while empty
        const info = await js(`${JSON.stringify(ALL)}.map(function (id) {
            var m = NEXA.getComponent("${P}" + id).nexa, p = m.props, css = p.css, text = css && css.defaultCss ? css.defaultCss() : "";
            var old = Object.keys(p).filter(function (k) { return p[k].type === "css" && k !== "css"; });
            return { id: id, label: css && css.label, saved: css && css.default, lines: text.split("\\n").length, head: text.split("\\n")[0], oldHidden: old.every(function (k) { return p[k].visibleWhen({}) === false && p[k].visibleWhen(Object.assign({}, { [k]: "color: red;" })) === true; }) };
        })`);
        for (const c of info) {
            assert.strictEqual(c.label, 'Custom CSS', c.id);
            assert.strictEqual(c.saved, '', c.id + ': nothing is saved by default (no copy of the library\'s CSS in every component)');
            assert.ok(c.lines > 20, c.id + ': its own CSS is there: ' + c.lines + ' lines');
            assert.ok(/^\/\* .* - its own CSS/.test(c.head), c.id + ': ' + c.head);
            assert.ok(c.oldHidden, c.id + ': the per-part / per-state fields show only when they hold text');
        }
        // what Load CSS gives is valid CSS, and the Button's own rule is in it
        const btn = await js(`(function () { var t = NEXA.getComponent("${P}button").nexa.props.css.defaultCss(), sh = new CSSStyleSheet(); sh.replaceSync(t); return { rules: sh.cssRules.length, hasBtn: /\\.btn \\{/.test(t) }; })()`);
        assert.ok(btn.rules > 10 && btn.hasBtn, JSON.stringify(btn));
        // the text saved in the field is applied AFTER the library's styles: the same selector wins
        const radius = (name) => js(`getComputedStyle(${q(name, '.btn')}).borderRadius`);
        await mount('css-0', 'button', {}, { width: 200, height: 48 });
        await mount('css-1', 'button', { css: '.btn { border-radius: 20px; }' }, { width: 200, height: 48 });
        await mount('css-2', 'button', { css: '.btn { border-radius: 20px; }', cssControl: 'border-radius: 9px;' }, { width: 200, height: 48 });
        assert.strictEqual(await radius('css-0'), '4px', 'no Custom CSS: the library\'s');
        assert.strictEqual(await radius('css-1'), '20px', 'the same selector as the library\'s: the Custom CSS wins');
        assert.strictEqual(await radius('css-2'), '9px', 'a saved cssControl (an older field) still applies, after it');
        // Load CSS, saved untouched, changes nothing
        const text = await js(`NEXA.getComponent("${P}button").nexa.props.css.defaultCss()`);
        await mount('css-3', 'button', { css: text }, { width: 200, height: 48 });
        assert.strictEqual(await radius('css-3'), '4px', 'the loaded CSS as it is: the same look');
        // the text changes live
        await js(`NexaTest.setProps("css-3", { css: ${JSON.stringify(text + '\n.btn { border-radius: 12px; }')} })`); await settle();
        assert.strictEqual(await radius('css-3'), '12px', 'an edit applies at once');
        await js(`NexaTest.setProps("css-3", { css: "" })`); await settle();
        assert.strictEqual(await radius('css-3'), '4px', 'Reset CSS (empty): back to the component\'s own');
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
        assert.strictEqual(await js(`${q('st', '.val')}.textContent.trim()`), '', 'the tag has no value yet: nothing shows (never "???")');
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

    await ok('Date Time: a Milliseconds unit (shown once Seconds is on), exact to the ms, ISO keeps it', async () => {
        await mount('dt-ms', 'datetime', { inputValue: '2026-09-30T10:15:30.123Z', timezoneMode: 'utc', unitPreset: 'datetime-seconds', showMs: true, format: 'YYYY-MM-DD HH:mm:ss.SSS' }, { width: 280, height: 40 });
        assert.strictEqual(await js(`${q('dt-ms', '.input-field')}.value`), '2026-09-30 10:15:30.123', 'the .SSS token');
        // showMs with no seconds shown: no ms field (it would have nothing to attach to)
        await mount('dt-ms2', 'datetime', { inputValue: '2026-09-30T10:15:30.123Z', timezoneMode: 'utc', unitPreset: 'datetime', showMs: true }, { width: 280, height: 40 });
        await js(`NexaTest.wc('dt-ms2').togglePopover()`); await settle();
        assert.strictEqual(await js(`!!${root('dt-ms2')}.querySelector('.time-input.ms')`), false, 'no Seconds shown: Milliseconds does not render');
        // edit the ms field: On Change carries the exact value, ISO keeps 3 digits
        await mount('dt-ms3', 'datetime', { inputValue: '2026-09-30T10:15:30.000Z', timezoneMode: 'utc', unitPreset: 'datetime-seconds', showMs: true }, { width: 280, height: 40 });
        await js(`NexaTest.wc('dt-ms3').togglePopover()`); await settle();
        await js(`(function () { var i = ${root('dt-ms3')}.querySelector('.time-input.ms'); i.value = '45'; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await settle();
        const ev = await js(`NexaTest.item('dt-ms3').events.filter(function (e) { return e[0] === 'change'; }).pop()`);
        assert.ok(/\.045Z$/.test(ev[1].iso), 'the ISO ends in .045Z: ' + ev[1].iso);
        await js(`['dt-ms2', 'dt-ms3'].forEach(function (n) { NexaTest.wc(n).closePopover(); }) || true`); await settle();   // nothing left over the next tests
    });

    await ok('Date Range: a day click always spans the whole day to the millisecond (…00:00:00.000 to …23:59:59.999), whichever day is clicked first', async () => {
        await mount('dr-day', 'daterange', { timezoneMode: 'utc' }, { width: 340, height: 40 });
        // click day 10 then day 5 (backwards): day 5 becomes the start, day 10 the end — each the full day
        const r = await js(`(function () { var w = NexaTest.wc('dr-day'); w._pickDay(2026, 9, 10); w._pickDay(2026, 9, 5); return { s: w._tempStart.toISOString(), e: w._tempEnd.toISOString() }; })()`);
        assert.strictEqual(r.s, '2026-10-05T00:00:00.000Z');
        assert.strictEqual(r.e, '2026-10-10T23:59:59.999Z');
    });

    await ok('Date Range: time granularity — off / minutes / seconds / milliseconds, the ms input, the display format', async () => {
        await mount('dr-gran', 'daterange', { timezoneMode: 'utc', timeGranularity: 'milliseconds', defaultStart: '2026-09-01T08:15:30.250Z', defaultEnd: '2026-09-03T18:00:00.000Z' }, { width: 340, height: 40 });
        assert.strictEqual(await js(`${root('dr-gran')}.querySelectorAll('.range-display-segment')[0].textContent.trim()`), '2026-09-01 08:15:30.250', 'the default format includes seconds and ms');
        await js(`NexaTest.wc('dr-gran').togglePopover()`); await settle();
        const msInputs = await js(`${root('dr-gran')}.querySelectorAll('.time-input.ms').length`);
        assert.strictEqual(msInputs, 2, 'a millisecond input for start and end');
        await js(`(function () { var i = ${root('dr-gran')}.querySelectorAll('.time-input.ms')[1]; i.value = '7'; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await settle();
        const ev = await js(`NexaTest.item('dr-gran').events.filter(function (e) { return e[0] === 'change'; }).pop()`);
        assert.ok(ev && /T18:00:00\.007Z$/.test(ev[1].endIso) && ev[1].end === ev[1].endIso, 'On Change: the end keeps the edited millisecond (ISO output): ' + (ev && ev[1].endIso));

        await mount('dr-sec', 'daterange', { timezoneMode: 'utc', timeGranularity: 'seconds' }, { width: 340, height: 40 });
        await js(`NexaTest.wc('dr-sec').togglePopover()`); await settle();
        assert.strictEqual(await js(`${root('dr-sec')}.querySelectorAll('.time-input.ms').length`), 0, 'seconds granularity: no ms input');
        assert.ok(await js(`${root('dr-sec')}.querySelectorAll('.time-group .time-input').length`) >= 6, 'h, m, s for both start and end');

        await mount('dr-off', 'daterange', { timezoneMode: 'utc' }, { width: 340, height: 40 });
        await js(`NexaTest.wc('dr-off').togglePopover()`); await settle();
        assert.strictEqual(await js(`!!${root('dr-off')}.querySelector('.time-strip')`), false, 'off (the default): no time strip');
        await js(`['dr-gran', 'dr-sec', 'dr-off'].forEach(function (n) { NexaTest.wc(n).closePopover(); }) || true`); await settle();
    });

    await ok('Date Range: a v1 save (enableTime: true) becomes minutes granularity; ISO output always carries exact milliseconds', async () => {
        const m = await js(`NEXA.getComponent("${P}daterange").migrateProps({ __v: 1, enableTime: true })`);
        assert.deepStrictEqual([m.timeGranularity, 'enableTime' in m], ['minutes', false]);
        await mount('dr-iso', 'daterange', { timezoneMode: 'utc', defaultStart: '2026-09-01T00:00:00.000Z', defaultEnd: 1727999999123 }, { width: 340, height: 40 });
        const w = await js(`NexaTest.wc('dr-iso')._formatOutput(NexaTest.wc('dr-iso').endDate)`);
        assert.strictEqual(w, '2024-10-03T23:59:59.123Z', 'a millisecond-precision input stays exact in the ISO output');
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
    // a series (numbers as 1,234.5 whatever the machine's language: separators are per series)
    const S = (id, extra) => Object.assign({ id, name: id.toUpperCase(), separators: 'dot' }, extra || {});
    const series = (name) => `NexaTest.wc(${JSON.stringify(name)})`;
    const counts = (name) => js(`(function () { var w = ${series(name)}; return w.seriesList().map(function (s) { return w._state(s).buf.count; }); })()`);
    const pixels = (name) => js(`(function () { var c = ${root(name)}.querySelector("canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, n = 0; for (var i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()`);
    const T0 = 1727852400000;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
        for (const l of ['Series', 'Time range', 'Time ruler', 'Zoom in to at most', 'Export menu on the chart (⋮)', 'What it exports']) assert.ok(rows.includes(l), 'inspector: ' + l);
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

    await ok('Tabs: too many tabs for the width scroll by themselves: a button at the end with more tabs, the wheel, the chosen tab brought into view; few tabs / Scroll off: none', async () => {
        const many = Array.from({ length: 20 }, (_, i) => ({ value: 't' + i, label: 'Tab number ' + i }));
        await mount('tb-many', 'tabs', { tabs: many, defaultValue: 't0' }, { width: 360, height: 160 });
        const info = (name) => js(`(function () { var w = NexaTest.wc(${JSON.stringify(name)}), r = w.renderRoot, l = r.querySelector(".list"); return { prev: !!r.querySelector(".nav.prev"), next: !!r.querySelector(".nav.next"),
            left: l.scrollLeft, top: l.scrollTop, over: l.scrollWidth > l.clientWidth, overV: l.scrollHeight > l.clientHeight }; })()`);
        const waitFor = async (name, test) => { for (let i = 0; i < 40; i++) { const r = await info(name); if (test(r)) return r; await sleep(50); } return info(name); };
        const page0 = await js('window.scrollY');          // (a long page: the earlier tests scrolled it)
        let r = await info('tb-many');
        assert.deepStrictEqual([r.over, r.prev, r.next, r.left], [true, false, true, 0], 'at the start: more toward the end only');
        // the button: one page of tabs
        await js(`NexaTest.wc("tb-many").renderRoot.querySelector(".nav.next").click()`);
        r = await waitFor('tb-many', (x) => x.left > 100 && x.prev);
        assert.ok(r.left > 100 && r.prev, 'it scrolled, and now there is more behind: ' + JSON.stringify(r));
        // the wheel (a plain vertical wheel over the list moves it sideways; the page is not scrolled)
        const wheel = (dy) => js(`(function () { var l = NexaTest.wc("tb-many").renderRoot.querySelector(".list"), before = l.scrollLeft, e = new WheelEvent("wheel", { deltaY: ${dy}, bubbles: true, cancelable: true, composed: true }); l.dispatchEvent(e); return { moved: l.scrollLeft - before, prevented: e.defaultPrevented }; })()`);
        const w1 = await wheel(60);
        assert.deepStrictEqual([w1.moved, w1.prevented], [60, true], 'the wheel moved the list');
        // at the very end the wheel is the page's again (not prevented) and the end button is gone
        await js(`(function () { var l = NexaTest.wc("tb-many").renderRoot.querySelector(".list"); l.scrollLeft = l.scrollWidth; })()`);
        r = await waitFor('tb-many', (x) => !x.next);
        assert.deepStrictEqual([r.next, r.prev], [false, true], 'at the end: only the way back');
        assert.strictEqual((await wheel(60)).prevented, false, 'nothing to scroll that way: the page scrolls');
        // choosing a tab (Logic: Show a tab) brings it into view, at either end
        await js(`NexaTest.wc("tb-many").renderRoot.querySelector(".list").scrollLeft = 0`);
        const inView = (v) => js(`(function () { var l = NexaTest.wc("tb-many").renderRoot.querySelector(".list"), t = l.querySelector('.tab[data-value="${v}"]'); return { from: t.offsetLeft - l.scrollLeft, to: t.offsetLeft + t.offsetWidth - l.scrollLeft, view: l.clientWidth }; })()`);
        await js(`NexaTest.invoke("tb-many", "select", "t12")`); await settle();
        let vis = await inView('t12');
        assert.ok(vis.from >= 0 && vis.to <= vis.view, 'the chosen tab (t12) is inside the list: ' + JSON.stringify(vis));
        await js(`NexaTest.invoke("tb-many", "select", "t0")`); await settle();
        vis = await inView('t0');
        assert.ok(vis.from >= 0 && vis.to <= vis.view, 'and back at the first: ' + JSON.stringify(vis));
        // the page itself did not move
        assert.strictEqual(await js('window.scrollY'), page0);

        // few tabs: nothing to scroll, no buttons; Scroll off: no buttons either
        await mount('tb-few', 'tabs', { tabs: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], defaultValue: 'a' }, { width: 360, height: 160 });
        r = await info('tb-few');
        assert.deepStrictEqual([r.over, r.prev, r.next], [false, false, false]);
        await mount('tb-off', 'tabs', { tabs: many, defaultValue: 't0', scrollTabs: false }, { width: 360, height: 160 });
        r = await info('tb-off');
        assert.deepStrictEqual([r.prev, r.next], [false, false], 'Scroll off: as before');

        // "Fill the width": a tab stays readable (96 px) and the rest scroll, instead of 20 crushed tabs
        await mount('tb-fit', 'tabs', { tabs: many, defaultValue: 't0', fitted: true }, { width: 360, height: 160 });
        r = await info('tb-fit');
        assert.deepStrictEqual([r.over, r.next], [true, true], 'fitted tabs scroll too');
        const wd = await js(`(function () { var t = NexaTest.wc("tb-fit").renderRoot.querySelector(".tab"); return t.offsetWidth; })()`);
        assert.ok(wd >= 96, 'a fitted tab is at least 96 px: ' + wd);

        // the tabs on the left: the list scrolls up / down, the buttons point that way
        await mount('tb-v', 'tabs', { tabs: many, defaultValue: 't0', orientation: 'vertical' }, { width: 360, height: 200 });
        r = await info('tb-v');
        assert.deepStrictEqual([r.overV, r.prev, r.next], [true, false, true], 'vertical: more below');
        assert.strictEqual(await js(`!!NexaTest.wc("tb-v").renderRoot.querySelector(".nav.next svg")`), true, 'with an arrow');
        assert.strictEqual((await js(`(function () { var l = NexaTest.wc("tb-v").renderRoot.querySelector(".list"), e = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true, composed: true }); l.dispatchEvent(e); return e.defaultPrevented; })()`)), false, 'a vertical list scrolls natively');
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
            legendValue: 'last', thresholds: [{ value: 25, label: 'High' }]
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
        await mount('lc-exp', 'line-chart', { series: [S('a', { name: 'A', unit: 'kW', live: [{ x: T0, y: 1.5 }, { x: T0 + 1000, y: 2 }] }), S('b', { name: 'B', live: [{ x: T0, y: 7 }] })] }, { width: 500, height: 260, design: true });
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

    await ok('Line Chart: export what is shown (zoom / pan), the shown series only, annotations in their own column / row, Excel colours values past a limit, an Info sheet', async () => {
        await mount('lc-x', 'line-chart', {
            series: [S('a', { name: 'Temp', unit: '°C', live: [{ x: T0, y: 10 }, { x: T0 + 1000, y: 30 }, { x: T0 + 2000, y: 5 }, { x: T0 + 3000, y: 20 }] }),
                S('b', { name: 'Hidden', live: [{ x: T0, y: 1 }] })],
            thresholds: [{ value: 25, kind: 'upper', color: '#ef4444', label: 'High' }, { value: 8, kind: 'lower', color: '#3b82f6', label: 'Low' }, { value: 15, kind: 'line' }],
            annotations: [{ label: 'Batch start', time: T0 + 500, description: 'B-104' }, { label: 'Out of view', time: T0 + 9000 }],
            exportTitle: 'Reactor 1'
        }, { width: 500, height: 260, design: true });
        const r = await js(`(async function () {
            var w = ${series('lc-x')};
            w.hide(null, { list: "series", id: "b" });
            w.setRange({ from: ${T0}, to: ${T0 + 2000} });
            w.exportData({ format: "csv" });
            var csv = (await w._lastExport.blob.text()).replace(/^\\ufeff/, "").split("\\r\\n");
            w.exportData({ format: "xlsx" });
            var xl = new TextDecoder().decode(new Uint8Array(await w._lastExport.blob.arrayBuffer()));
            w.exportData({ format: "csv", range: "all", annotations: false });
            var all = (await w._lastExport.blob.text()).replace(/^\\ufeff/, "").split("\\r\\n");
            return { csv: csv, xl: xl, all: all };
        })()`);
        assert.strictEqual(r.csv[0], '"Time","Temp (°C)","Annotation"', 'the hidden series is left out; an Annotation column');
        assert.strictEqual(r.csv.length, 4 + 1, 'zoomed to T0…T0+2s: 3 points + the annotation row (+ the header)');
        assert.ok(/,,"Batch start · B-104"$/.test(r.csv[2]), 'the annotation: its own row at its exact time: ' + r.csv[2]);
        assert.ok(!r.csv.some((l) => /Out of view/.test(l)), 'an annotation outside the time shown: not exported');
        // Excel: 30 past the upper limit (red), 5 past the lower one (blue), 10 / 20 plain; an Info sheet
        const cell = (v) => { const m = new RegExp('<c r="B\\d+"( s="(\\d+)")?><v>' + v + '</v>').exec(r.xl); return m ? Number(m[2] || 0) : -1; };
        assert.ok(cell(30) >= 3 && cell(5) >= 3 && cell(30) !== cell(5), 'values past a limit: a fill each (' + cell(30) + ', ' + cell(5) + ')');
        assert.strictEqual(cell(10), 0, 'a value inside the limits: plain');
        assert.ok(/<sheet name="Info"/.test(r.xl) && /Reactor 1/.test(r.xl) && /High: ≥ 25/.test(r.xl), 'the Info sheet: the title, the limits');
        assert.ok(/<numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss.000"/.test(r.xl), 'times to the millisecond');
        // everything it holds, annotations off: 4 points, no Annotation column, still no hidden series
        assert.strictEqual(r.all[0], '"Time","Temp (°C)"');
        assert.strictEqual(r.all.length, 4 + 1);
    });

    await ok('Line Chart: PNG — 2× sharp, a title and the time span above, the legend below; what is shown or everything', async () => {
        await mount('lc-png', 'line-chart', { series: [S('a', { name: 'Temp', live: [{ x: T0, y: 1 }, { x: T0 + 60000, y: 5 }] }), S('h', { name: 'Gone', live: [{ x: T0, y: 3 }] })], exportTitle: 'Line 1' }, { width: 480, height: 240 });
        const r = await js(`(async function () {
            var w = ${series('lc-png')}; w.draw();
            w.hide(null, { list: "series", id: "h" });
            var p = w.renderRoot.querySelector(".plot"), lw = p.clientWidth, lh = p.clientHeight;
            var a = await w.exportPNG();
            w.setRange({ from: ${T0 + 10000}, to: ${T0 + 20000} });
            var b = await w.exportData({ format: "png", range: "all" });
            var shown = w._scale.vMinX;
            return { lw: lw, lh: lh, a: [a.width, a.height], b: [b.width, b.height], name: a.name, shown: shown };
        })()`);
        assert.strictEqual(r.a[0], r.lw * 2, '2× the chart width');
        assert.ok(r.a[1] > r.lh * 2, 'taller than the chart: the title, the span, the legend');
        assert.ok(/\.png$/.test(r.name));
        assert.strictEqual(r.shown, T0 + 10000, 'the screen keeps its own zoom after an export');
    });

    await ok('Line Chart: zero in the middle (− and +); a threshold kind', async () => {
        await mount('lc-zc', 'line-chart', { series: [S('a', { zeroCenter: true, live: [{ x: T0, y: -3 }, { x: T0 + 1000, y: 10 }] }), S('b', { live: [{ x: T0, y: 2 }, { x: T0 + 1000, y: 4 }] })] }, { width: 480, height: 240 });
        const r = await js(`(function () { var w = ${series('lc-zc')}; w.draw(); var l = w.seriesList(); return [w._scale.yr[l[0]._key], w._scale.yr[l[1]._key]]; })()`);
        assert.strictEqual(r[0].lo, -r[0].hi, 'symmetric around 0: ' + JSON.stringify(r[0]));
        assert.ok(r[0].hi >= 10);
        assert.ok(r[1].lo > 0, 'another series: its own range');
        const kinds = await js(`NEXA.getComponent("${P}line-chart").nexa.props.thresholds.item.fields.kind.options.map(function (o) { return o.value; })`);
        assert.deepStrictEqual(kinds, ['line', 'upper', 'lower', 'band']);
    });

    await ok('Line Chart: Export menu — 3-dots panel menu (CSV, Excel, PNG) and exportFilename expression', async () => {
        await mount('lc-menu', 'line-chart', {
            title: 'Motor Telemetry',
            exportFilename: '{title}-{format}',
            series: [S('m1', { name: 'RPM', live: [{ x: T0, y: 1500 }] })]
        }, { width: 500, height: 260, design: true });

        // 3-dots button exists in corner
        assert.strictEqual(await js(`!!${root('lc-menu')}.querySelector('.btn-menu')`), true);
        assert.strictEqual(await js(`!!${root('lc-menu')}.querySelector('.menu-dropdown')`), false, 'dropdown closed initially');

        // Click 3-dots button -> dropdown opens with CSV, Excel, PNG
        await js(`${root('lc-menu')}.querySelector('.btn-menu').click()`);
        await settle();
        assert.strictEqual(await js(`!!${root('lc-menu')}.querySelector('.menu-dropdown')`), true, 'dropdown opened');
        const items = await js(`Array.from(${root('lc-menu')}.querySelectorAll('.menu-item')).map(function (el) { return el.textContent.trim(); })`);
        assert.deepStrictEqual(items, ['⤓ Download CSV', '⤓ Download Excel', '📷 Download PNG']);

        // Test exportData with exportFilename
        const csvRes = await js(`(async function () {
            var w = ${series('lc-menu')};
            w.exportData({ format: "csv" });
            return w._lastExport.name;
        })()`);
        assert.strictEqual(csvRes, 'Motor Telemetry-csv.csv', '{title}: a token of the chart, never a page variable named title');

        const xlsxRes = await js(`(async function () {
            var w = ${series('lc-menu')};
            w.exportData({ format: "xlsx" });
            return w._lastExport.name;
        })()`);
        assert.strictEqual(xlsxRes, 'Motor Telemetry-xlsx.xlsx');

        // Test exportPNG
        const pngRes = await js(`(async function () {
            var w = ${series('lc-menu')};
            await w.exportPNG();
            var head = new Uint8Array(await w._lastExport.blob.slice(0, 4).arrayBuffer());
            return {
                name: w._lastExport.name,
                sig: Array.from(head)
            };
        })()`);
        assert.strictEqual(pngRes.name, 'Motor Telemetry-png.png');
        assert.deepStrictEqual(pngRes.sig, [137, 80, 78, 71], 'PNG magic bytes');
    });

    await ok('Line Chart: v1 (flat props) and v2 (Data / Point) charts become v3 (a series\' Live value)', async () => {
        await mount('lc-v1', 'line-chart', { label: 'Old', unit: 'kW', lineColor: '#ff0000', areaFill: false, inputData: '{msg.payload}', inputPoint: '{sparkplug:G::E::D::P}', maxPoints: 500 }, { width: 400, height: 200, migrate: true });
        const p = JSON.parse(await js(`JSON.stringify(NexaTest.item("lc-v1").raw)`));
        assert.deepStrictEqual(Object.keys(p).filter((k) => /^(label|unit|lineColor|inputData|inputPoint|maxPoints)$/.test(k)), []);
        const s = p.series[0];
        assert.deepStrictEqual([s.id, s.name, s.unit, s.color, s.fill, s.maxPoints], ['s1', 'Old', 'kW', '#ff0000', 'none', 500]);
        assert.deepStrictEqual(s.live, { $bind: [{ src: 'shared', ref: 'sparkplug::G::E::D::P' }] }, 'its point binding is its live value (a tag = its shared variable)');
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

    // ---- missing data: a null is missing (a 0 is a value); the chart connects, cuts, or cuts and bridges ------------------------------
    await ok('Line Chart: a null / undefined value is missing, not a 0: no point, a break; Connect (the default) draws across, Gap and Bridge cut the line there', async () => {
        const pts = [{ x: T0, y: 5 }, { x: T0 + 1000, y: 0 }, { x: T0 + 2000, y: null }, { x: T0 + 3000, y: 5 }, { x: T0 + 4000, y: 5 }];
        await mount('lc-miss', 'line-chart', { series: [S('a', { live: pts })] }, { width: 400, height: 200 });
        const info = () => js(`(function () { var w = ${series('lc-miss')}, s = w.seriesList()[0], st = w._state(s); w.draw(); return { count: st.buf.count, ys: Array.from({ length: st.buf.count }, function (_, i) { return st.buf.getY(i); }), breaks: Array.from(st.buf.breaksKept()), runs: w._runsOf(s) }; })()`);
        let r = await info();
        assert.deepStrictEqual(r.ys, [5, 0, 5, 5], 'the 0 is a point; the null is not');
        assert.deepStrictEqual(r.breaks, [T0 + 2000]);
        assert.deepStrictEqual(r.runs, [0, 4], 'Connect: one run, as it always was');
        await js(`NexaTest.setProps("lc-miss", { missing: "gap" })`); await settle();
        r = await info();
        assert.deepStrictEqual(r.runs, [0, 2, 2, 4], 'Gap: cut between the 0 and the next 5');
        await js(`NexaTest.setProps("lc-miss", { missing: "bridge" })`); await settle();
        assert.deepStrictEqual((await info()).runs, [0, 2, 2, 4], 'Bridge cuts the same');
        await js(`NexaTest.setProps("lc-miss", { missing: "gap", series: [${JSON.stringify(S('a', { missing: 'connect' }))}] })`); await settle();
        assert.deepStrictEqual((await info()).runs, [0, 4], 'a series that says Connect connects');
        // an object {x, y: undefined}, "" and a word are missing too
        await js(`NexaTest.invoke("lc-miss", "appendPoints", [{ x: ${T0 + 5000}, y: undefined }, { x: ${T0 + 6000}, y: "" }, { x: ${T0 + 7000}, y: "abc" }, { x: ${T0 + 8000}, y: 0 }], { list: "series", id: "a" })`);
        r = await info();
        assert.strictEqual(r.count, 5, 'only the 0 was added');
        // (the fifth: the series lost its Live value when it was replaced above: a value that goes away after one is missing, at "now")
        assert.deepStrictEqual(r.breaks.slice(0, 4), [T0 + 2000, T0 + 5000, T0 + 6000, T0 + 7000]);
        assert.strictEqual(r.breaks.length, 5);
    });

    await ok('Line Chart: a live value that turns null / undefined after a value is missing, once; the next value is a point again', async () => {
        await mount('lc-miss-live', 'line-chart', { missing: 'gap', series: [S('a', { live: 5 })] }, { width: 400, height: 200 });
        const set = async (v) => { await js(`NexaTest.setProps("lc-miss-live", { series: [${JSON.stringify(S('a', { live: v }))}] })`); await settle(); await sleep(15); };
        const info = () => js(`(function () { var w = ${series('lc-miss-live')}, s = w.seriesList()[0], st = w._state(s); w.draw(); return { count: st.buf.count, breaks: st.buf.breaksKept().length, runs: w._runsOf(s).length / 2 }; })()`);
        assert.deepStrictEqual(await info(), { count: 1, breaks: 0, runs: 1 });
        await sleep(15);
        await set(null);
        await set(null);
        assert.strictEqual((await info()).breaks, 1, 'once: the same null again is not another break');
        await sleep(15);
        await set(6);
        const r = await info();
        assert.deepStrictEqual(r, { count: 2, breaks: 1, runs: 2 }, 'the 6 is a point, the line was cut between');
    });

    await ok('Line Chart: the hole is painted by Connect, empty with Gap, dashed with Bridge (pixels, not only the runs)', async () => {
        const pts = [];
        for (let i = 0; i <= 20; i++) pts.push(i === 10 ? { x: T0 + i * 1000, y: null } : { x: T0 + i * 1000, y: 5 });
        await mount('lc-hole', 'line-chart', { showGrid: false, series: [S('a', { min: 0, max: 10, width: 2, live: pts })] }, { width: 500, height: 220 });
        const hole = () => js(`(function () { var w = ${series('lc-hole')}; w.draw(); var sc = w._scale, k = w.seriesList()[0]._key, d = w._lastDpr || 1, ctx = w.canvas.getContext("2d");
            var x0 = Math.round(sc.toX(${T0 + 9300}) * d), x1 = Math.round(sc.toX(${T0 + 10700}) * d), y = Math.round(sc.toY(5, k) * d);
            var data = ctx.getImageData(x0, y - 2, x1 - x0, 5).data, n = 0; for (var i = 3; i < data.length; i += 4) if (data[i]) n++;
            var side = ctx.getImageData(Math.round(sc.toX(${T0 + 2000}) * d), y - 2, Math.round(40 * d), 5).data, m = 0; for (var j = 3; j < side.length; j += 4) if (side[j]) m++;
            return { hole: n, wide: x1 - x0, line: m }; })()`);
        const connect = await hole();
        assert.ok(connect.line > 100, 'the line is drawn: ' + JSON.stringify(connect));
        assert.ok(connect.hole >= connect.wide * 2, 'Connect: the hole is painted ' + JSON.stringify(connect));
        await js(`NexaTest.setProps("lc-hole", { missing: "gap" })`); await settle();
        const gap = await hole();
        assert.strictEqual(gap.hole, 0, 'Gap: nothing in the hole ' + JSON.stringify(gap));
        assert.ok(gap.line > 100, 'but the line is there either side');
        await js(`NexaTest.setProps("lc-hole", { missing: "bridge" })`); await settle();
        const bridge = await hole();
        assert.ok(bridge.hole > 0 && bridge.hole < connect.hole, 'Bridge: a thin dashed line (more than nothing, less than the full line) ' + JSON.stringify([bridge, connect]));
    });

    await ok('Line Chart: the silence that cuts the line (Cut the line after) and the new fields in the inspector', async () => {
        const pts = [{ x: T0, y: 1 }, { x: T0 + 1000, y: 2 }, { x: T0 + 20000, y: 3 }, { x: T0 + 21000, y: 4 }];
        await mount('lc-silence', 'line-chart', { missing: 'gap', gapAfter: 5000, series: [S('a', { live: pts })] }, { width: 400, height: 200 });
        const runs = (name) => js(`(function () { var w = ${series(name)}; w.draw(); return w._runsOf(w.seriesList()[0]); })()`);
        assert.deepStrictEqual(await runs('lc-silence'), [0, 2, 2, 4], 'the chart\'s 5 s');
        await js(`NexaTest.setProps("lc-silence", { series: [${JSON.stringify(S('a', { gapAfter: 60000 }))}] })`); await settle();
        assert.deepStrictEqual(await runs('lc-silence'), [0, 4], 'the series\' own 60 s');
        await mount('lc-saved', 'line-chart', { series: [S('a', { gapAfter: 5000, live: pts })] }, { width: 400, height: 200 });
        assert.deepStrictEqual(await runs('lc-saved'), [0, 2, 2, 4], 'a chart saved before the setting: its series\' gapAfter still cuts');
        const f = await js(`(function () { var n = NEXA.getComponent("${P}line-chart").nexa.props, sf = n.series.item.fields, vis = n.gapAfter.visibleWhen;
            return { chart: [n.missing.default, n.missing.group, n.missing.options.map(function (o) { return o.value; }), n.gapAfter.group, vis({ missing: "connect" }), vis({ missing: "gap" }), vis({ missing: "bridge" })],
                series: [sf.missing.default, sf.missing.options.map(function (o) { return o.value; }), sf.gapAfter.label] }; })()`);
        assert.deepStrictEqual(f.chart, ['connect', 'Data', ['connect', 'gap', 'bridge'], 'Data', false, true, true], 'the chart\'s setting; the silence shows for Gap and Bridge');
        assert.deepStrictEqual(f.series, ['', ['', 'connect', 'gap', 'bridge'], 'Cut the line after silence (ms)'], 'a series: as the chart, or its own');
    });

    await ok('Line Chart: time axis settings — showTime, showDate, dateFormat and tickDensity', async () => {
        await mount('lc-tax', 'line-chart', { series: [S('a', { live: [{ x: T0, y: 1 }] })], showTime: true, showDate: false }, { width: 400, height: 200 });
        const rh1 = await js(`(function () { var w = ${series('lc-tax')}; return w._rulerHeight(); })()`);
        assert.strictEqual(rh1, 28, 'only the time row: ticks 10 + a row 11 + the grip 6 (28 px)');
        await js(`NexaTest.setProps("lc-tax", { showTime: true, showDate: true, dateFormat: "iso" })`); await settle();
        const rh2 = await js(`(function () { var w = ${series('lc-tax')}; return w._rulerHeight(); })()`);
        assert.strictEqual(rh2, 40, 'both rows: ticks 10 + two rows 24 + the grip 6 (40 px)');
        const dt = await js(`(function () { var w = ${series('lc-tax')}; return w.fmtDate(${T0}); })()`);
        assert.ok(/^\d{4}-\d\d-\d\d$/.test(dt), 'ISO format YYYY-MM-DD: ' + dt);
        // with a date row, a tick's label never repeats the date; a date that does not fit gets shorter
        const tk = await js(`(function () { var w = ${series('lc-tax')}, t = ${T0}; return [w.fmtTick(t, 6 * 3600000, false), w.fmtTick(t, 6 * 3600000, true), w.fmtDateShort(t)]; })()`);
        assert.ok(/ \d\d:\d\d$/.test(tk[0]) && /^\d+ \w{3} /.test(tk[0]), 'no date row: the day in the label: ' + tk[0]);
        assert.ok(/^\d\d:\d\d$/.test(tk[1]), 'a date row: the time only: ' + tk[1]);
        assert.ok(/^\d\d-\d\d$/.test(tk[2]), 'the short ISO date: ' + tk[2]);
        const steps = await js(`(function () {
            var w = ${series('lc-tax')};
            var sNorm = w._timeStep(86400000, 600);
            w.p.tickDensity = "loose";
            var sLoose = w._timeStep(86400000, 600);
            w.p.tickDensity = "dense";
            var sDense = w._timeStep(86400000, 600);
            return { sNorm: sNorm, sLoose: sLoose, sDense: sDense };
        })()`);
        assert.ok(steps.sLoose >= steps.sNorm, 'loose step >= normal step');
        assert.ok(steps.sNorm >= steps.sDense, 'normal step >= dense step');
        await js(`NexaTest.setProps("lc-tax", { rulerHeight: 20 })`); await settle();
        const rhPct = await js(`(function () { var w = ${series('lc-tax')}; return w._rulerHeight(200); })()`);
        assert.strictEqual(rhPct, 40, '20% of 200px = 40px');

        // verify across other ruler types (axis, comb, navigator)
        await js(`NexaTest.setProps("lc-tax", { ruler: "axis", rulerHeight: 20 })`); await settle();
        const rhAxis = await js(`(function () { var w = ${series('lc-tax')}; return w._rulerHeight(200); })()`);
        assert.strictEqual(rhAxis, 40, 'axis rulerHeight 20% of 200px = 40px');

        await js(`NexaTest.setProps("lc-tax", { ruler: "axis", showTime: false, showDate: false })`); await settle();
        const rhAxisOff = await js(`(function () { var w = ${series('lc-tax')}; return w._rulerHeight(200); })()`);
        assert.strictEqual(rhAxisOff, 0, 'axis with showTime & showDate false = 0px');

        await js(`NexaTest.setProps("lc-tax", { ruler: "comb", rulerHeight: 20, showTime: true, showDate: true })`); await settle();
        const rhComb = await js(`(function () { var w = ${series('lc-tax')}; return w._rulerHeight(200); })()`);
        assert.strictEqual(rhComb, 40, 'comb rulerHeight 20% of 200px = 40px');

        await js(`NexaTest.setProps("lc-tax", { ruler: "navigator", rulerHeight: 30, showTime: true, showDate: true })`); await settle();
        const rhNav = await js(`(function () {
            var w = ${series('lc-tax')};
            var m = w.getPlotMetrics(400, 300);
            var g = w._navGeom(m);
            return { rh: w._rulerHeight(300), navH: g ? g.h : 0 };
        })()`);
        assert.strictEqual(rhNav.rh, 90, 'navigator rulerHeight 30% of 300px = 90px');
        assert.ok(rhNav.navH > 38, 'navigator dynamic height scaled beyond default: ' + rhNav.navH);
    });

    await ok('Line Chart: annotations (event markers) and line interpolation (step, smooth, linear)', async () => {
        await mount('lc-ann', 'line-chart', {
            series: [S('s1', { live: [{ x: T0, y: 10 }, { x: T0 + 5000, y: 20 }] })],
            annotations: [
                { time: T0 + 1000, label: 'Shift 1', color: '#10b981', description: 'Morning crew' }
            ]
        }, { width: 500, height: 260 });

        // 1. Initial annotation from props
        const count0 = await js(`${series('lc-ann')}._allAnnotations().length`);
        assert.strictEqual(count0, 1);

        // 2. addAnnotation with object { time, label, color }
        await js(`${series('lc-ann')}.addAnnotation({ time: ${T0 + 3000}, label: 'Trip', color: '#ef4444' })`);
        await settle();
        const count1 = await js(`${series('lc-ann')}._allAnnotations().length`);
        assert.strictEqual(count1, 2);

        // 3. addAnnotation with second object { time, label, color }
        await js(`${series('lc-ann')}.addAnnotation({ time: ${T0 + 4000}, label: 'Restart', color: '#3b82f6' })`);
        await settle();
        const count2 = await js(`${series('lc-ann')}._allAnnotations().length`);
        assert.strictEqual(count2, 3);

        // 4. Check drawn annotation hits
        const hits = await js(`${series('lc-ann')}._annotationHits.map(function (h) { return h.label; })`);
        assert.deepStrictEqual(hits, ['Shift 1', 'Trip', 'Restart']);

        // 5. Hover over 'Trip' badge and click it
        await js(`(function () { var el = ${root('lc-ann')}.querySelector(".plot"); el.scrollIntoView({ block: "center" }); })()`);
        await settle();
        const tripPos = await js(`(function () {
            var w = ${series('lc-ann')};
            var h = w._annotationHits.find(function (x) { return x.label === "Trip"; });
            var el = ${root('lc-ann')}.querySelector(".plot");
            var r = el.getBoundingClientRect();
            return { x: Math.round(r.left + h.box.x + h.box.w / 2), y: Math.round(r.top + h.box.y + h.box.h / 2) };
        })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tripPos.x, y: tripPos.y });
        await settle();
        const isHovered = await js(`${series('lc-ann')}._hoverAnnotation && ${series('lc-ann')}._hoverAnnotation.label`);
        assert.strictEqual(isHovered, 'Trip');
        const tipText = await js(`${root('lc-ann')}.querySelector(".tooltip .tooltip-text").textContent`);
        assert.strictEqual(tipText, 'Trip');

        await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x: tripPos.x, y: tripPos.y });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: tripPos.x, y: tripPos.y });
        await settle();
        const annEv = await js(`NexaTest.item("lc-ann").events.filter(function (e) { return e[0] === "annotationClick"; }).pop()`);
        assert.ok(annEv, 'annotationClick event fired');
        assert.strictEqual(annEv[1].label, 'Trip');

        // 6. setAnnotations and clearAnnotations
        await js(`${series('lc-ann')}.setAnnotations([{ time: ${T0 + 2500}, label: 'Solo Batch', color: '#8b5cf6' }])`);
        await settle();
        const dynCount = await js(`${series('lc-ann')}._dynamicAnnotations.length`);
        assert.strictEqual(dynCount, 1);
        assert.strictEqual(await js(`${series('lc-ann')}._dynamicAnnotations[0].label`), 'Solo Batch');

        await js(`${series('lc-ann')}.clearAnnotations()`);
        await settle();
        assert.strictEqual(await js(`${series('lc-ann')}._dynamicAnnotations.length`), 0);

        // 7. Line interpolation (step, smooth, defaultInterpolation)
        await mount('lc-interp', 'line-chart', {
            series: [
                S('s-step', { interpolation: 'step', live: [{ x: T0, y: 0 }, { x: T0 + 1000, y: 1 }, { x: T0 + 2000, y: 0 }] }),
                S('s-smooth', { interpolation: 'smooth', live: [{ x: T0, y: 5 }, { x: T0 + 1000, y: 10 }, { x: T0 + 2000, y: 5 }] }),
                S('s-def', { live: [{ x: T0, y: 2 }] })
            ],
            defaultInterpolation: 'step'
        }, { width: 400, height: 200 });
        const interps = await js(`(function () {
            var w = ${series('lc-interp')};
            return w.seriesList().map(function (s) { return s.variant; });
        })()`);
        assert.deepStrictEqual(interps, ['step', 'smooth', 'step']);
    });

    await ok('Line Chart: every series its own Y axis; on each side in series order from the chart outwards; hidden axes; the gap', async () => {
        const three = (order) => ({
            series: order.map((k) => ({
                temp: S('temp', { axis: 'left', min: 0, max: 100, unit: '°C', color: '#ef4444', live: [{ x: T0, y: 50 }, { x: T0 + 1000, y: 80 }] }),
                curr: S('curr', { axis: 'left', min: 0, max: 50, unit: 'A', color: '#3b82f6', live: [{ x: T0, y: 25 }, { x: T0 + 1000, y: 40 }] }),
                press: S('press', { axis: 'right', min: 0, max: 10, unit: 'bar', color: '#10b981', live: [{ x: T0, y: 5 }, { x: T0 + 1000, y: 8 }] }),
                hid: S('hid', { axis: 'off', min: 0, max: 4, live: [{ x: T0, y: 2 }, { x: T0 + 1000, y: 3 }] })
            })[k])
        });
        const info = (name) => js(`(function () {
            var w = ${series(name)}; w.draw();
            var sc = w._scale, L = sc.layout, by = function (id) { return w.seriesList().filter(function (s) { return s.id === id; })[0]._key; }, ids = ["temp", "curr", "press", "hid"].filter(function (id) { return w.seriesList().some(function (s) { return s.id === id; }); });
            return { left: L.left.map(function (c) { return c.s.id; }), right: L.right.map(function (c) { return c.s.id; }),
                widths: L.left.map(function (c) { return c.w; }), plotX: sc.m.plotX, gap: sc.m.axisGap,
                mid: ids.map(function (id) { return Math.round(sc.toY({ temp: 50, curr: 25, press: 5, hid: 2 }[id], by(id))); }),
                r: ids.map(function (id) { var r = sc.yr[by(id)]; return [r.lo, r.hi]; }) };
        })()`);
        await mount('lc-axes', 'line-chart', three(['temp', 'curr', 'press', 'hid']), { width: 600, height: 300 });
        const a = await info('lc-axes');
        assert.deepStrictEqual([a.left, a.right], [['temp', 'curr'], ['press']], 'a column per series; hidden: none');
        assert.deepStrictEqual(a.r, [[0, 100], [0, 50], [0, 10], [0, 4]], 'each its own scale (a hidden axis too)');
        assert.ok(a.mid.every((y) => y === a.mid[0]), 'each value at its own scale\'s middle: ' + a.mid);
        assert.strictEqual(a.plotX, a.widths[0] + a.gap + a.widths[1] + 4, 'the columns side by side, measured from their labels');
        // the series order is the order from the chart outwards
        await mount('lc-axes2', 'line-chart', three(['curr', 'press', 'temp']), { width: 600, height: 300 });
        assert.deepStrictEqual((await info('lc-axes2')).left, ['curr', 'temp']);
        // the gap between the columns
        await mount('lc-axes3', 'line-chart', Object.assign(three(['temp', 'curr']), { axisGap: 18 }), { width: 600, height: 300 });
        assert.strictEqual((await info('lc-axes3')).plotX - a.plotX, 10, 'axisGap 18 instead of 8');

        // separators / thousands per series
        const formatted = await js(`(function () { var w = ${series('lc-axes')}; var s = Object.assign({}, w.seriesList()[0], { separators: "comma", thousands: true, decimals: "1" }); return w.fmtValue(s, 1234.5); })()`);
        assert.strictEqual(formatted, '1.234,5 °C');
    });

    await ok('Line Chart: the series\' axis settings are one Axis section (Range, Numbers, Spine inside it); the chart\'s own Axes list is the shared axes; no scale / group', async () => {
        const r = await js(`(async function () {
            var f = NEXA.getComponent("${P}line-chart").nexa.props.series.item.fields;
            var t = NexaTest.inspector("${P}line-chart", {});
            await new Promise(function (r) { setTimeout(r, 150); });
            await t.field("series#0.min");
            var rows = NexaTest.rows(t.box).map(function (x) { return x.id; });
            var labels = NexaTest.rows(t.box).map(function (x) { return x.label; });
            t.destroy();
            return { sec: [f.axis.section, f.unit.section, f.min.section, f.notation.section, f.axisLine.section], gone: ["axisScale", "axisGroup", "interpolation"].filter(function (k) { return k in f; }),
                rows: rows.filter(function (id) { return /^series#0\\/Axis/.test(id); }), axesGroup: labels.indexOf("Axes") !== -1 };
        })()`);
        assert.deepStrictEqual(r.sec, ['Axis', 'Axis', 'Axis/Range', 'Axis/Numbers', 'Axis/Spine']);
        assert.deepStrictEqual(r.gone, []);
        assert.deepStrictEqual(r.rows, ['series#0/Axis', 'series#0/Axis/Range', 'series#0/Axis/Numbers', 'series#0/Axis/Spine'], 'the tree: Axis › Range / Numbers / Spine');
        assert.strictEqual(r.axesGroup, true, 'the Axes group is the chart\'s list of shared Y axes (before it, every series had its own axis and the chart had no Axes group)');
    });

    await ok('Line Chart: a threshold follows the scale of the series it names; that series (only) fires On Threshold Crossed', async () => {
        await mount('lc-thr', 'line-chart', {
            series: [S('a', { min: 0, max: 100, live: [{ x: T0, y: 1 }, { x: T0 + 1000, y: 2 }] }), S('b', { axis: 'right', min: 0, max: 10, live: [{ x: T0, y: 1 }, { x: T0 + 1000, y: 2 }] })],
            thresholds: [{ value: 5, series: 'b', label: 'B high' }, { value: 50, label: 'A high' }]
        }, { width: 500, height: 260 });
        const ys = await js(`(function () { var w = ${series('lc-thr')}; w.draw(); var sc = w._scale, l = w.seriesList(); return [w._thresholdOf(w.p.thresholds[0]).id, w._thresholdOf(w.p.thresholds[1]).id, Math.round(sc.toY(5, l[1]._key)), Math.round(sc.toY(50, l[0]._key))]; })()`);
        assert.deepStrictEqual(ys.slice(0, 2), ['b', 'a'], 'named, else the first series');
        assert.strictEqual(ys[2], ys[3], '5 on the scale of B = 50 on the scale of A: both mid-height');
        await js(`NexaTest.invoke("lc-thr", "appendPoints", { x: ${T0 + 2000}, y: 7 }, { list: "series", id: "b" })`);
        await js(`NexaTest.invoke("lc-thr", "appendPoints", { x: ${T0 + 2000}, y: 7 }, { list: "series", id: "a" })`);
        const ev = await js(`NexaTest.item("lc-thr").events.filter(function (e) { return e[0] === "thresholdCross"; }).map(function (e) { return e[2].id + ":" + e[1].threshold; })`);
        assert.deepStrictEqual(ev, ['b:5'], 'b crossed 5 on its scale; a (7 < 50) did not');
    });

    await ok('Line Chart: range buttons above the plot — a span, live; Now after a zoom; Show the last from Logic', async () => {
        const pts = Array.from({ length: 720 }, (_, i) => ({ x: T0 + i * 10000, y: 50 + Math.sin(i / 30) * 10 }));
        await mount('lc-rb', 'line-chart', { series: [S('a', { live: pts })], rangeBar: true }, { width: 600, height: 280 });
        const span = () => js(`(function () { var w = ${series('lc-rb')}; w.draw(); return w._scale.vMaxX - w._scale.vMinX; })()`);
        assert.deepStrictEqual(await js(`Array.from(${root('lc-rb')}.querySelectorAll(".rb-group .rb-btn")).map(function (b) { return b.textContent.trim(); })`), ['15m', '1h', '8h', '24h', '7d']);
        assert.strictEqual(await js(`!!${root('lc-rb')}.querySelector(".rb-live")`), true, 'live: a Live mark, no Now');
        await clickAt(`${root('lc-rb')}.querySelectorAll(".rb-group .rb-btn")[1]`);
        assert.strictEqual(await span(), 3600000, '1h: the last hour');
        assert.strictEqual(await js(`${root('lc-rb')}.querySelector(".rb-btn.on").textContent.trim()`), '1h');
        const ev = await js(`NexaTest.item("lc-rb").events.filter(function (e) { return e[0] === "rangeChange"; }).map(function (e) { return e[1].cause + ":" + e[1].live; })`);
        assert.ok(ev.includes('preset:true'), JSON.stringify(ev));
        await js(`NexaTest.invoke("lc-rb", "setRange", { from: ${T0}, to: ${T0 + 600000} })`); await settle();
        assert.deepStrictEqual(await js(`[!!${root('lc-rb')}.querySelector(".rb-now"), !!${root('lc-rb')}.querySelector(".btn-reset-zoom"), !!${root('lc-rb')}.querySelector(".rb-btn.on")]`), [true, false, false], 'paused: Now (no Reset Zoom chip), no button on');
        await clickAt(`${root('lc-rb')}.querySelector(".rb-now")`);
        assert.deepStrictEqual([await js(`${series('lc-rb')}.viewRange`), await span()], [null, 3600000], 'Now: live again, the span chosen');
        await js(`NexaTest.invoke("lc-rb", "showLast", { span: "15m" })`); await settle();
        assert.strictEqual(await span(), 900000, 'Show the last (Logic)');
    });

    await ok('Line Chart: the legend — around the plot or inside it, a table (Last / Min / Max / Average), a row toggles its series', async () => {
        const two = [S('a', { name: 'A', live: [{ x: T0, y: 1 }, { x: T0 + 1000, y: 3 }, { x: T0 + 2000, y: 2 }] }), S('b', { name: 'B', live: [{ x: T0, y: 10 }, { x: T0 + 1000, y: 30 }, { x: T0 + 2000, y: 20 }] })];
        await mount('lc-lgt', 'line-chart', { series: two, legend: 'right', legendMode: 'table' }, { width: 600, height: 260 });
        const t = await js(`(function () { var r = ${root('lc-lgt')}; r.host.draw(); return { head: Array.from(r.querySelectorAll(".lg-table th")).map(function (e) { return e.textContent.trim(); }),
            a: Array.from(r.querySelectorAll(".lg-row")[0].querySelectorAll(".lg-val")).map(function (e) { return e.textContent; }),
            right: r.querySelector(".c-main").lastElementChild.classList.contains("legend") }; })()`);
        assert.deepStrictEqual(t.head, ['Series', 'Last', 'Min', 'Max', 'Avg']);
        assert.deepStrictEqual(t.a.slice(0, 3), ['2', '1', '3']);
        assert.ok(/^2(\.00)?$/.test(t.a[3]), 'average: ' + t.a[3]);
        assert.strictEqual(t.right, true, 'right of the plot');
        await js(`NexaTest.setProps("lc-lgt", { legendMin: false, legendAvg: false })`); await settle();
        assert.deepStrictEqual(await js(`Array.from(${root('lc-lgt')}.querySelectorAll(".lg-table th")).map(function (e) { return e.textContent.trim(); })`), ['Series', 'Last', 'Max'], 'columns chosen');
        await js(`${root('lc-lgt')}.querySelectorAll(".lg-row")[0].click()`); await settle();
        assert.deepStrictEqual(await js(`${series('lc-lgt')}._visible().map(function (s) { return s.id; })`), ['b'], 'a row click hides its series');
        await mount('lc-lgi', 'line-chart', { series: two, legend: 'inside-tr', legendValue: 'max' }, { width: 600, height: 260 });
        const i = await js(`(function () { var w = ${series('lc-lgi')}; w.draw(); var p = w.renderRoot.querySelector(".plot"), l = p.querySelector(".legend.inside.tr");
            return { inside: !!l, vals: Array.from(l.querySelectorAll(".lg-val")).map(function (e) { return e.textContent; }), right: p.style.getPropertyValue("--lg-r"), padRight: Math.round(w._scale.m.padRight) }; })()`);
        assert.strictEqual(i.inside, true);
        assert.deepStrictEqual(i.vals, ['3', '30']);
        assert.strictEqual(i.right, (i.padRight + 8) + 'px', 'it keeps to the plot');
    });

    await ok('Line Chart: thresholds — a band, a shaded limit, the theme\'s status colours when none is set; a band\'s edges fire On Threshold Crossed', async () => {
        await mount('lc-band', 'line-chart', {
            series: [S('a', { min: 0, max: 100, live: [{ x: T0, y: 10 }, { x: T0 + 60000, y: 10 }] })], showGrid: false,
            thresholds: [{ kind: 'band', value: 40, to: 60, label: 'Normal' }, { kind: 'upper', value: 80, shade: true }, { kind: 'line', value: 30 }, { kind: 'line', value: 20, color: '{token:colors.green.solid}' }]
        }, { width: 500, height: 260 });
        const r = await js(`(function () { var w = ${series('lc-band')}; w.draw(); var sc = w._scale, m = sc.m, k = w.seriesList()[0]._key, c = w.canvas, ctx = c.getContext("2d"), d = w._lastDpr || 1;
            function row(v) { var y = Math.round(sc.toY(v, k) * d), data = ctx.getImageData(Math.round((m.plotX + 20) * d), y, Math.round((m.plotW - 140) * d), 1).data, n = 0; for (var i = 3; i < data.length; i += 4) if (data[i]) n++; return n; }
            var t = w.p.thresholds;
            return { band: row(50), empty: row(70), shaded: row(90), colors: t.map(function (x) { return w._thresholdColor(x); }), status: [w.statusColor("warning"), w.statusColor("error"), w.statusColor("info"), w._tok("{token:colors.green.solid}")] }; })()`);
        assert.ok(r.band > 100 && r.shaded > 100, 'the band and the shade are painted: ' + JSON.stringify(r));
        assert.strictEqual(r.empty, 0, 'nothing between them');
        assert.deepStrictEqual(r.colors, r.status, 'band: warning, limit: error, setpoint: info, a token: the theme\'s');
        assert.ok(/^#|^rgb/.test(r.colors[3]), r.colors[3]);
        await js(`NexaTest.invoke("lc-band", "appendPoints", { x: ${T0 + 120000}, y: 45 }, { list: "series", id: "a" })`);
        await js(`NexaTest.invoke("lc-band", "appendPoints", { x: ${T0 + 180000}, y: 65 }, { list: "series", id: "a" })`);
        const ev = await js(`NexaTest.item("lc-band").events.filter(function (e) { return e[0] === "thresholdCross"; }).map(function (e) { return e[1].direction + ":" + e[1].threshold; })`);
        assert.deepStrictEqual(ev, ['up:40', 'up:30', 'up:20', 'up:60'], 'into the band (and past both lines), then out of its top');
    });

    // ---- shared Y axes: a list of axes, a series picks one (or has its own) ---------------------------------------------------
    const axInfo = (name) => js(`(function () {
        var w = ${series(name)}; w.draw();
        var sc = w._scale, L = sc.layout, list = w.seriesList(), by = function (id) { return list.filter(function (s) { return s.id === id; })[0]; };
        return { left: L.left.map(function (c) { return c.s.id; }), right: L.right.map(function (c) { return c.s.id; }),
            members: L.left.concat(L.right).map(function (c) { return c.members ? c.members.map(function (m) { return m.id; }) : null; }),
            keys: list.map(function (s) { return s._ax; }), yr: list.map(function (s) { var r = sc.yr[s._ax]; return r ? [Math.round(r.lo * 100) / 100, Math.round(r.hi * 100) / 100] : null; }),
            y95: list.map(function (s) { return Math.round(sc.toY(95, s._ax)); }), padLeft: sc.m.padLeft, padRight: sc.m.padRight };
    })()`);
    const live = (a, b) => [{ x: T0, y: a }, { x: T0 + 1000, y: b }];

    await ok('Line Chart: series that pick the same Y axis share ONE scale and ONE drawn axis; Own stays as it was; the axes keep the order of the series', async () => {
        await mount('lc-sh', 'line-chart', {
            axes: [{ id: 'a1', name: 'Power kW' }],
            series: [S('p1', { yAxis: 'a1', live: live(0, 10) }), S('p2', { yAxis: 'a1', live: live(90, 100) }), S('t', { unit: '°C', live: live(20, 30) })]
        }, { width: 600, height: 300 });
        const a = await axInfo('lc-sh');
        assert.deepStrictEqual(a.left, ['a1', 't'], 'two columns, not three: the shared axis (first member) and the own axis of t');
        assert.deepStrictEqual(a.members[0], ['p1', 'p2']);
        assert.deepStrictEqual(a.keys, ['axis:a1', 'axis:a1', 't'], 'the shared ones are on the axis; t on its own key (as before)');
        assert.deepStrictEqual(a.yr[0], a.yr[1], 'one scale');
        assert.ok(a.yr[0][0] <= 0 && a.yr[0][1] >= 100, 'it covers every member: ' + a.yr[0]);
        assert.strictEqual(a.y95[0], a.y95[1], 'a value is at one height for both');
        assert.ok(a.yr[2][0] > 10 && a.yr[2][1] < 40, 't has its own scale: ' + a.yr[2]);
    });

    await ok('Line Chart: the axis\' limits win; a series\' own limits are ignored while it shares; its position (left / right / off)', async () => {
        await mount('lc-shl', 'line-chart', {
            axes: [{ id: 'a1', name: 'Power', min: 0, max: 200, axis: 'right' }, { id: 'a2', name: 'Hidden', min: 0, max: 5, axis: 'off' }],
            series: [S('p1', { yAxis: 'a1', min: 40, max: 60, live: live(40, 60) }), S('p2', { yAxis: 'a1', live: live(10, 20) }), S('h', { yAxis: 'a2', live: live(1, 2) })]
        }, { width: 600, height: 300 });
        const a = await axInfo('lc-shl');
        assert.deepStrictEqual([a.left, a.right], [[], ['a1']], 'on the right; "off": no column');
        assert.deepStrictEqual(a.yr, [[0, 200], [0, 200], [0, 5]], 'hard limits of the axis; p1\'s own 40..60 is not used; a hidden axis still has its scale');
    });

    await ok('Line Chart: an axis stays while one of its series is shown, goes when none is; an axis the series names but the list has not is its own', async () => {
        await mount('lc-shh', 'line-chart', {
            axes: [{ id: 'a1', name: 'Power' }],
            series: [S('p1', { yAxis: 'a1', live: live(0, 10) }), S('p2', { yAxis: 'a1', live: live(5, 20) }), S('g', { yAxis: 'gone', live: live(1, 2) })]
        }, { width: 600, height: 300 });
        const hide = (ids) => js(`(function () { var w = ${series('lc-shh')}; w._hidden.clear(); w.seriesList().forEach(function (s) { if (${JSON.stringify(ids)}.indexOf(s.id) !== -1) w._hidden.add(s._key); }); return 1; })()`);
        let a = await axInfo('lc-shh');
        assert.deepStrictEqual([a.left, a.keys[2]], [['a1', 'g'], 'g'], 'the missing axis: the series has its own');
        await hide(['p1']);
        a = await axInfo('lc-shh');
        assert.deepStrictEqual(a.left, ['a1', 'g'], 'p1 hidden: p2 keeps the axis');
        assert.ok(a.yr[1][1] >= 20 && a.yr[1][1] < 30, 'its scale now covers p2 only: ' + a.yr[1]);
        await hide(['p1', 'p2']);
        a = await axInfo('lc-shh');
        assert.deepStrictEqual(a.left, ['g'], 'both hidden: the axis is gone');
        await hide([]);
    });

    await ok('Line Chart: a threshold follows the shared axis of its series; tooltip and legend values keep the series\' own unit; the axis colour', async () => {
        await mount('lc-sht', 'line-chart', {
            axes: [{ id: 'a1', name: 'Power' }, { id: 'a2', name: 'Red', color: '#ff0000' }, { id: 'a3', name: 'Solo' }],
            thresholds: [{ kind: 'upper', value: 50, series: 'p2' }],
            series: [S('p1', { yAxis: 'a1', unit: 'kW', color: '#3366cc', live: live(0, 10) }), S('p2', { yAxis: 'a1', unit: 'MW', live: live(90, 100) }),
                S('r', { yAxis: 'a2', live: live(0, 1) }), S('o', { yAxis: 'a3', color: '#00aa00', live: live(0, 1) })]
        }, { width: 600, height: 300 });
        const r = await js(`(function () { var w = ${series('lc-sht')}; w.draw(); var sc = w._scale, l = w.seriesList(), t = w.p.thresholds[0], on = w._thresholdOf(t);
            var cols = sc.layout.left, text = w._colors().text;
            return { on: on.id, ax: on._ax, y: Math.round(sc.toY(50, on._ax)), y1: Math.round(sc.toY(50, l[0]._ax)),
                v: [w.fmtValue(l[0], 5), w.fmtValue(l[1], 5)], colours: cols.map(function (c) { return [c.s.id, w._axisColor(c)]; }), text: text, p1: w.colorOf(l[0]), o: w.colorOf(l[3]) };
        })()`);
        assert.deepStrictEqual([r.on, r.ax, r.y === r.y1], ['p2', 'axis:a1', true], 'on the scale of p2 = the shared one');
        assert.ok(/kW/.test(r.v[0]) && /MW/.test(r.v[1]) && !/MW/.test(r.v[0]), 'each series\' own unit: ' + r.v);
        assert.deepStrictEqual(r.colours.map((c) => c[0]), ['a1', 'a2', 'a3']);
        assert.strictEqual(r.colours[0][1], r.text, 'two series, no colour: the text colour');
        assert.strictEqual(r.colours[1][1], '#ff0000', 'its own colour');
        assert.strictEqual(r.colours[2][1], r.o, 'one series, no colour: that series\' colour');
    });

    await ok('Line Chart: a wide scale (a shared axis, 22.8 .. 54.2) has its three or more ticks, not one; a narrow one is as it was', async () => {
        await mount('lc-tk', 'line-chart', { series: [S('a', { live: live(1, 2) })] }, { width: 400, height: 240 });
        const t = await js(`(function () { var w = ${series('lc-tk')}; var ph = 175; return { wide: w._ticks({ lo: 22.84, hi: 54.16 }, ph), full: w._ticks({ lo: 0, hi: 100 }, ph), narrow: w._ticks({ lo: 23, hi: 38 }, ph), tiny: w._ticks({ lo: 0.2, hi: 0.9 }, ph), tall: w._ticks({ lo: 0, hi: 87 }, 300) }; })()`);
        assert.deepStrictEqual(t.wide, [30, 40, 50], 'it was [40]: the step went up to 20');
        assert.deepStrictEqual(t.full, [0, 50, 100], 'a range that already had three: unchanged');
        assert.deepStrictEqual(t.narrow, [25, 30, 35], 'unchanged');
        assert.ok(t.tiny.length >= 3, 'a small range: ' + t.tiny);
        assert.ok(t.tall.length >= 3 && t.tall.length <= 8, 'a tall plot: ' + t.tall);
    });

    await ok('Line Chart: the series list is cached (the same list while the props are the same), with and without Axes: it is read many times a frame', async () => {
        await mount('lc-c0', 'line-chart', { series: [S('a', { live: live(0, 1) })] }, { width: 400, height: 200 });
        await mount('lc-c1', 'line-chart', { axes: [{ id: 'a1', name: 'A' }], series: [S('a', { yAxis: 'a1', live: live(0, 1) })] }, { width: 400, height: 200 });
        for (const n of ['lc-c0', 'lc-c1']) assert.strictEqual(await js(`(function () { var w = ${series(n)}; w.draw(); return w.seriesList() === w.seriesList() && w._axes() === w._axes(); })()`), true, n);
    });

    await ok('Line Chart: the Axes list and the series\' Y axis in the inspector: the fields, the choices, the series\' own axis fields only for Own', async () => {
        const r = await js(`(function () {
            var n = NEXA.getComponent("${P}line-chart").nexa, ax = n.props.axes, sf = n.props.series.item.fields, af = ax.item.fields;
            var P = { axes: [{ id: 'a1', name: 'Power kW' }] };
            return { type: ax.type, group: ax.group, def: ax.default, noun: ax.item.noun, groups: n.groupOrder.slice(0, 3),
                afKeys: Object.keys(af), sections: ['axis', 'softMin', 'axisLine', 'notation'].map(function (k) { return af[k] && af[k].section; }),
                created: ax.item.create([{ id: 'a1' }]), y: sf.yAxis.options(P).map(function (o) { return [o.value, o.label]; }), ySection: sf.yAxis.section,
                order: Object.keys(sf).slice(Object.keys(sf).indexOf('yAxis'), Object.keys(sf).indexOf('yAxis') + 3),
                ownHidden: ['axis', 'axisTitle', 'min', 'max', 'softMin', 'zeroCenter', 'axisLine', 'axisLineColor'].map(function (k) { return [sf[k].visibleWhen({ yAxis: 'a1' }, P), sf[k].visibleWhen({ yAxis: '' }, P)]; }),
                stays: ['unit', 'notation', 'decimals', 'separators', 'thousands', 'valueMap'].map(function (k) { return !sf[k].visibleWhen || sf[k].visibleWhen({ yAxis: 'a1' }, P); }),
                dflt: sf.yAxis.default };
        })()`);
        assert.deepStrictEqual([r.type, r.group, r.def, r.noun, r.groups], ['list', 'Axes', [], 'axis', ['Series', 'Axes', 'Data']]);
        for (const k of ['name', 'id', 'color', 'axis', 'axisTitle', 'unit', 'softMin', 'softMax', 'min', 'max', 'zeroCenter', 'notation', 'decimals', 'separators', 'thousands', 'valueMap', 'axisLine', 'axisLineColor', 'axisLineWidth', 'axisLineDash']) assert.ok(r.afKeys.indexOf(k) !== -1, 'an axis has ' + k);
        assert.ok(r.afKeys.indexOf('yAxis') === -1 && r.afKeys.indexOf('live') === -1, 'and nothing of a series');
        assert.deepStrictEqual(r.sections, [null, 'Range', 'Spine', 'Numbers'], 'sections without the Axis/ prefix (Position: none, at the top; null = undefined through the page)');
        assert.deepStrictEqual(r.created, { axis: 'left', axisTitle: '', axisTitleColor: '', unit: '', softMin: '', softMax: '', min: '', max: '', zeroCenter: false, notation: 'standard', decimals: 'auto', separators: 'locale', thousands: true, valueMap: '', axisLine: true, axisLineColor: '', axisLineWidth: 1, axisLineDash: 'solid', name: 'Axis 2', id: 'a2', color: '' });
        assert.deepStrictEqual(r.y, [['', 'Own axis (its own scale)'], ['a1', 'Power kW']]);
        assert.deepStrictEqual([r.ySection, r.dflt, r.order[0], r.order[1]], ['Axis', '', 'yAxis', 'axis'], 'the first of the Axis section, right before Position');
        assert.deepStrictEqual(r.ownHidden, r.ownHidden.map(() => [false, true]), 'the own axis fields: shown for Own, hidden on a shared axis');
        assert.ok(r.stays.every(Boolean), 'Unit, Numbers and Value texts stay: they are the series\' tooltip and legend');
    });

    await ok('Line Chart: Automatic interpolation is a step while the values are whole numbers; value texts (0=Off, 1=Run) on the axis, in the tooltip and the legend', async () => {
        await mount('lc-auto', 'line-chart', { series: [S('p', { name: 'Pump', variant: 'auto', valueMap: '0=Off, 1=Run', live: [{ x: T0, y: 0 }, { x: T0 + 1000, y: 1 }, { x: T0 + 2000, y: 1 }] })], legendValue: 'last' }, { width: 500, height: 240 });
        const r = await js(`(function () { var w = ${series('lc-auto')}; w.draw(); var s = w.seriesList()[0];
            return { v: w._variantOf(s), ticks: w._scale.layout.left[0].labels, legend: w.renderRoot.querySelector(".lg-val").textContent, tip: w.tooltipText({ s: s, y: 0, x: ${T0}, idx: 0 }, []) }; })()`);
        assert.deepStrictEqual(r, { v: 'step', ticks: ['Off', 'Run'], legend: 'Run', tip: 'Pump: Off' });
        await js(`NexaTest.invoke("lc-auto", "appendPoints", { x: ${T0 + 3000}, y: 0.5 }, { list: "series", id: "p" })`);
        assert.strictEqual(await js(`${series('lc-auto')}._variantOf(${series('lc-auto')}.seriesList()[0])`), 'line', 'a fraction: linear');
        await js(`NexaTest.invoke("lc-auto", "replacePoints", [{ x: ${T0}, y: 2 }, { x: ${T0 + 1000}, y: 3 }], { list: "series", id: "p" })`);
        assert.strictEqual(await js(`${series('lc-auto')}._variantOf(${series('lc-auto')}.seriesList()[0])`), 'step', 'replaced by whole numbers: step again');
    });

    await ok('Line Chart: the last value at the end of each line — apart when they meet, below the ⋮ menu, only while the newest point is in view', async () => {
        await mount('lc-last', 'line-chart', { series: [S('a', { live: [{ x: T0, y: 5 }, { x: T0 + 60000, y: 7 }, { x: T0 + 600000, y: 50 }] }), S('b', { live: [{ x: T0, y: 9 }, { x: T0 + 60000, y: 8 }, { x: T0 + 600000, y: 50 }] })], lastValue: true }, { width: 500, height: 240 });
        const items = () => js(`(function () { var w = ${series('lc-last')}; w.draw(); var sc = w._scale; return w._lastValueItems(w.ctx, w._visible(), sc.toX, sc.toY, sc.m, sc.vMaxX).items.map(function (i) { return { t: i.text, at: Math.round(i.at) }; }).concat([{ top: Math.round(sc.m.plotY) }]); })()`);
        const a = await items();
        assert.deepStrictEqual(a.slice(0, 2).map((i) => i.t), ['50', '50']);
        assert.ok(Math.abs(a[1].at - a[0].at) >= 16, 'apart: ' + JSON.stringify(a));
        await js(`NexaTest.invoke("lc-last", "setRange", { from: ${T0}, to: ${T0 + 120000} })`); await settle();
        assert.strictEqual((await items()).length, 1, 'panned to the past: no last value');
    });

    await ok('Line Chart: v3 charts (chart-level axis settings, a scale / group, a threshold by side) become v4', async () => {
        const p = await js(`JSON.stringify(NEXA.getComponent("${P}line-chart").migrateProps({ __v: 3, leftTitle: "Temp", leftMin: 0, rightSoftMax: 9, leftNotation: "compact", separators: "comma",
            series: [{ id: "s1", axis: "left", axisScale: "independent", axisGroup: "g", notation: "axis" }, { id: "s2", axis: "right", notation: "engineering" }, { id: "s3", axis: "none" }],
            thresholds: [{ value: 1, axis: "right" }, { value: 2, axis: "left" }] }))`);
        const m = JSON.parse(p);
        const [s1, s2, s3] = m.series;
        assert.deepStrictEqual([s1.axisTitle, s1.min, s1.notation, s1.separators, 'axisScale' in s1, 'axisGroup' in s1], ['Temp', 0, 'compact', 'comma', false, false]);
        assert.deepStrictEqual([s2.softMax, s2.notation, s3.axis], [9, 'si', 'off']);
        assert.deepStrictEqual(m.thresholds.map((t) => t.series), ['s2', ''], 'the first series on its side');
        assert.deepStrictEqual(Object.keys(m).filter((k) => /^(left|right)/.test(k) || k === 'separators'), []);
    });

    await ok('Line Chart: in a zoomed canvas (the editor) it draws at its layout size, the pointer in layout px', async () => {
        const props = { series: [S('a', { axisTitle: 'temp', live: [{ x: T0, y: 1 }, { x: T0 + 60000, y: 9 }] }), S('b', { axisTitle: 'hum', live: [{ x: T0, y: 30 }, { x: T0 + 60000, y: 25 }] })], ruler: 'navigator' };
        await mount('lc-z1', 'line-chart', props, { width: 600, height: 300 });
        await mount('lc-z2', 'line-chart', props, { width: 600, height: 300 });
        const r = await js(`(async function () {
            var slot = NexaTest.item("lc-z2").el; slot.style.transform = "scale(0.5)"; slot.style.transformOrigin = "0 0";
            await new Promise(function (r) { setTimeout(r, 100); });
            var a = NexaTest.wc("lc-z1"), b = NexaTest.wc("lc-z2"); a.draw(); b.draw();
            var rect = b.renderRoot.querySelector(".plot").getBoundingClientRect();
            var L = b._local({ clientX: rect.left + 100, clientY: rect.top + 50 });
            return { m1: a._scale.m, m2: b._scale.m, w: b.canvas.width / b.renderRoot.querySelector(".plot").clientWidth, dpr: b._lastDpr, px: L.px, py: L.py };
        })()`);
        assert.deepStrictEqual([r.m2.plotX, r.m2.plotW, r.m2.plotH], [r.m1.plotX, r.m1.plotW, r.m1.plotH], 'the same plot as unzoomed');
        assert.ok(Math.abs(r.w - r.dpr) < 0.02, 'the backing store follows the zoom (sharp, not stretched)');
        assert.deepStrictEqual([Math.round(r.px), Math.round(r.py)], [200, 100], 'a client px at 50 % is 2 layout px');
    });

    // ---- State Timeline ------------------------------------------------------------------------
    const ST = { states: [{ label: 'Running', value: '1', color: '#10b981' }, { label: 'Stopped', value: '0', color: '#ef4444' }, { label: 'High', match: 'range', min: 80, max: 1000, color: '#8b5cf6' }], timeZone: 'utc' };
    const H = 3600000;
    const stw = (name) => `NexaTest.wc(${JSON.stringify(name)})`;

    await ok('State Timeline: changes and intervals (a gap), states by value / range / unknown, statistics over the time shown', async () => {
        await mount('st-a', 'state-timeline', Object.assign({ rows: [{ id: 'm1', name: 'Filler' }, { id: 'm2', name: 'Capper' }] }, ST), { width: 700, height: 240 });
        const r = await js(`(function () {
            var w = ${stw('st-a')};
            // m1: changes; m2: intervals with a gap between them
            w.setStates([{ time: ${T0}, state: 1 }, { time: ${T0 + H}, state: 0 }, { time: ${T0 + 2 * H}, state: 1 }, { time: ${T0 + 3 * H}, state: null }], { list: "rows", id: "m1" });
            w.setStates([{ start: ${T0}, end: ${T0 + H}, state: 95, note: "hot" }, { start: ${T0 + 2 * H}, end: ${T0 + 3 * H}, state: "JAM" }], { list: "rows", id: "m2" });
            w.setRange({ from: ${T0}, to: ${T0 + 3 * H} });
            var l = w.lanes(), m1 = w.statsOf(l[0], ${T0}, ${T0 + 3 * H}), segs2 = w.segmentsOf(w.rowList()[1], ${T0}, ${T0 + 3 * H});
            return { lanes: l.map(function (x) { return x.label; }), m1: m1, segs2: segs2.map(function (s) { var st = w.stateOf(s.v); return [st.label, (s.end - s.start) / ${H}, s.note]; }),
                unknownGrey: w.stateOf("JAM").color === w.statusColor("neutral") && w.stateOf("JAM").def === null };
        })()`);
        assert.deepStrictEqual(r.lanes, ['Filler', 'Capper']);
        assert.deepStrictEqual([Math.round(r.m1.pct * 1000) / 1000, r.m1.ms / H, r.m1.count, r.m1.first, r.m1.last, r.m1.label], [0.667, 2, 2, T0, T0 + 3 * H, 'Running'], 'Running: 2 of 3 hours, entered twice');
        assert.deepStrictEqual(r.segs2, [['High', 1, 'hot'], ['JAM', 1, '']], 'a range state (95 ≥ 80), an unknown value with its own text; the gap left out');
        assert.ok(r.unknownGrey, 'an unknown value: the theme neutral (and hatched: not a state you defined)');
        const px = await js(`(function () { var c = ${root('st-a')}.querySelector("canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, n = 0; for (var i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()`);
        assert.ok(px > 1000, 'drawn');
        const head = await js(`(function () { var w = ${stw('st-a')}; w.draw(); return w._scale.layout.cols.map(function (c) { return c[0]; }); })()`);
        assert.deepStrictEqual(head, ['statsPercent', 'statsDuration'], 'the statistics shown by default: %, total time');
    });

    await ok('State Timeline: a lane per row and state; the statistics of each lane\u2019s own state', async () => {
        await mount('st-b', 'state-timeline', Object.assign({ rows: [{ id: 'm1', name: 'Filler' }], lanes: 'split', statsCount: true, statsFirst: true, statsLast: true }, ST), { width: 700, height: 260 });
        const r = await js(`(function () {
            var w = ${stw('st-b')};
            w.setStates([{ time: ${T0}, state: 1 }, { time: ${T0 + H}, state: 0 }, { time: ${T0 + 2 * H}, state: 1 }, { time: ${T0 + 3 * H}, state: null }], { list: "rows", id: "m1" });
            w.setRange({ from: ${T0}, to: ${T0 + 3 * H} });
            var l = w.lanes();
            return l.map(function (x) { var s = w.statsOf(x, ${T0}, ${T0 + 3 * H}); return [x.label, s.label, s.count, Math.round(s.pct * 1000) / 1000]; });
        })()`);
        assert.deepStrictEqual(r, [['Filler · Running', 'Running', 2, 0.667], ['Filler · Stopped', 'Stopped', 1, 0.333], ['Filler · High', 'High', 0, 0]], 'the defined states, each its lane and statistics');
    });

    await ok('State Timeline: a row\u2019s Live state from a tag (a change now, On State Change of that row; the same value: none); Append change in its place; Clear', async () => {
        await mount('st-c', 'state-timeline', Object.assign({ rows: [{ id: 'm1', name: 'Filler', live: { $bind: [{ src: 'sparkplug', ref: 'G::E::D::State' }] } }, { id: 'm2', name: 'Capper' }] }, ST), { width: 600, height: 200 });
        await js(`NexaTest.setTag("st-c", 1, "G::E::D::State")`); await settle();
        await js(`NexaTest.setTag("st-c", 0, "G::E::D::State")`); await settle();
        await js(`NexaTest.setTag("st-c", 0, "G::E::D::State")`); await settle();
        const r = await js(`(function () { var w = ${stw('st-c')}; return { ch: w._row(w.rowList()[0]).ch.map(function (c) { return c.v; }), ev: NexaTest.item("st-c").events.filter(function (e) { return e[0] === "stateChange"; }).map(function (e) { return [e[1].from, e[1].to, e[1].label, e[2].id]; }) }; })()`);
        assert.deepStrictEqual(r.ch, [1, 0], 'two changes; the same value again: none');
        assert.deepStrictEqual(r.ev, [[null, 1, 'Running', 'm1'], [1, 0, 'Stopped', 'm1']]);
        const r2 = await js(`(function () {
            var w = ${stw('st-c')};
            w.appendChange({ time: ${T0 + 2 * H}, state: 1 }, { list: "rows", id: "m2" });
            w.appendChange({ time: ${T0}, state: 0, note: "late" }, { list: "rows", id: "m2" });
            var a = w._row(w.rowList()[1]).ch.map(function (c) { return [c.t, c.v, c.note]; });
            w.clear(null, { list: "rows", id: "m2" });
            return { a: a, cleared: w._row(w.rowList()[1]).ch.length, byName: w.findRow("Capper").id, byIndex: w.findRow(1).id };
        })()`);
        assert.deepStrictEqual(r2.a, [[T0, 0, 'late'], [T0 + 2 * H, 1, '']], 'a late change in its place');
        assert.deepStrictEqual([r2.cleared, r2.byName, r2.byIndex], [0, 'm2', 'm2']);
        const bad = await js(`(function () { try { NexaTest.invoke("st-c", "appendChange", 1); return null; } catch (e) { return e.message; } })()`);
        assert.ok(/no action "appendChange"/.test(bad), 'Append change is the row\u2019s action, not the chart\u2019s');
    });

    await ok('State Timeline: the same state in a row is ONE block — appends of the same value are not kept, a late one merges forward, values of one state (81, 85) draw as one', async () => {
        await mount('st-m', 'state-timeline', Object.assign({ rows: [{ id: 'm1', name: 'Filler' }, { id: 'm2', name: 'Oven' }] }, ST), { width: 600, height: 200 });
        const r = await js(`(function () { var w = ${stw('st-m')}, t = { list: "rows", id: "m1" };
            [0, 1, 2, 3].forEach(function (k) { w.appendChange({ time: ${T0} + k * 60000, state: 1 }, t); });
            w.appendChange({ time: ${T0 + 10 * 60000}, state: 0, note: "jam" }, t);
            w.appendChange({ time: ${T0 + 12 * 60000}, state: 0 }, t);
            var a = w._row(w.rowList()[0]).ch.map(function (c) { return [c.t, c.v, c.note]; });
            // a late Stopped just before the Stopped block: that block starts earlier
            w.appendChange({ time: ${T0 + 8 * 60000}, state: 0 }, t);
            var b = w._row(w.rowList()[0]).ch.map(function (c) { return [c.t, c.v, c.note]; });
            w.setStates([{ time: ${T0}, state: 81 }, { time: ${T0 + H}, state: 85 }, { time: ${T0 + 2 * H}, state: 1 }, { time: ${T0 + 3 * H}, state: null }], { list: "rows", id: "m2" });
            var oven = w.segmentsOf(w.rowList()[1], ${T0}, ${T0 + 3 * H}).map(function (s) { return [s.info.label, (s.fullEnd - s.fullStart) / ${H}]; });
            var stats = w.statsOf({ row: w.rowList()[1], state: null }, ${T0}, ${T0 + 3 * H});
            return { a: a, b: b, oven: oven, ev: NexaTest.item("st-m").events.filter(function (e) { return e[0] === "stateChange"; }).length };
        })()`);
        assert.deepStrictEqual(r.a, [[T0, 1, ''], [T0 + 10 * 60000, 0, 'jam']], 'Run Run Run Run = one Run; Stop Stop = one Stop (its note kept)');
        assert.deepStrictEqual(r.b, [[T0, 1, ''], [T0 + 8 * 60000, 0, 'jam']], 'a late Stop before the Stop block: the block starts at it');
        assert.deepStrictEqual(r.oven, [['High', 2], ['Running', 1]], '81 and 85 are both High: one block of 2 h');
        assert.strictEqual(r.ev, 2, 'On State Change only for a real change (Run, then Stop)');
    });

    await ok('State Timeline: Hide blips (drawing only: statistics keep them), Stale after (hatched, the state ends there), a gap and an unknown value hatched', async () => {
        await mount('st-n', 'state-timeline', Object.assign({ rows: [{ id: 'm1', name: 'Filler' }, { id: 'm2', name: 'Capper', staleAfter: 60000 }], minDuration: 120000 }, ST), { width: 600, height: 200 });
        const r = await js(`(function () { var w = ${stw('st-n')}, rows = w.rowList();
            w.setStates([{ time: ${T0}, state: 1 }, { time: ${T0 + H}, state: 0 }, { time: ${T0 + H + 30000}, state: 1 }, { time: ${T0 + 2 * H}, state: null }], { list: "rows", id: "m1" });
            var drawn = w.segmentsOf(rows[0], ${T0}, ${T0 + 2 * H}, true).map(function (s) { return [s.info.label, (s.fullEnd - s.fullStart) / 60000]; });
            var kept = w.segmentsOf(rows[0], ${T0}, ${T0 + 2 * H}).map(function (s) { return s.info.label; });
            var count = w.statsOf({ row: rows[0], state: null }, ${T0}, ${T0 + 2 * H}).count;
            w.setStates([{ time: Date.now() - 600000, state: 1 }], { list: "rows", id: "m2" });
            w._row(rows[1]).lastAt = Date.now() - 300000; w._tickClock();
            var cur = w._currentOf(rows[1]), gaps = w.gapsOf(rows[1], Date.now() - ${H}, Date.now() + 1000).map(function (g) { return g.kind; });
            var seg = w.segmentsOf(rows[1], Date.now() - ${H}, Date.now() + 1000)[0];
            return { drawn: drawn, kept: kept, count: count, cur: cur.label, gaps: gaps, staleEnd: Math.round((Date.now() - seg.fullEnd) / 1000) };
        })()`);
        assert.deepStrictEqual(r.drawn, [['Running', 120]], 'the 30 s Stop is drawn as part of the Run before it: one 2 h block');
        assert.deepStrictEqual(r.kept, ['Running', 'Stopped', 'Running'], 'the statistics and exports keep it');
        assert.strictEqual(r.count, 2, 'Running entered twice (the truth)');
        assert.strictEqual(r.cur, 'Stale');
        assert.deepStrictEqual(r.gaps, ['stale']);
        assert.ok(r.staleEnd >= 239 && r.staleEnd <= 241, 'its Run ends 60 s after its last data (4 min ago): ' + r.staleEnd);
        const gap = await js(`(function () { var w = ${stw('st-n')}; w.setStates([{ start: ${T0}, end: ${T0 + H}, state: 1 }, { start: ${T0 + 2 * H}, end: ${T0 + 3 * H}, state: "JAM" }], { list: "rows", id: "m1" });
            return { gaps: w.gapsOf(w.rowList()[0], ${T0}, ${T0 + 3 * H}).map(function (g) { return [g.kind, (g.end - g.start) / ${H}]; }), unknown: w.stateOf("JAM").def === null }; })()`);
        assert.deepStrictEqual(gap, { gaps: [['gap', 1]], unknown: true });
    });

    await ok('State Timeline: the legend part (a table of the states: % / Time / Count over every row; a click hides a state), range buttons, theme colours for the default states', async () => {
        await mount('st-l', 'state-timeline', { rows: [{ id: 'm1', name: 'Filler' }, { id: 'm2', name: 'Capper' }], legend: 'right', legendMode: 'table', rangeBar: true, timeZone: 'utc' }, { width: 700, height: 220 });
        const r = await js(`(function () { var w = ${stw('st-l')};
            w.setStates([{ time: ${T0}, state: 1 }, { time: ${T0 + H}, state: 0 }, { time: ${T0 + 2 * H}, state: null }], { list: "rows", id: "m1" });
            w.setStates([{ time: ${T0}, state: 1 }, { time: ${T0 + 2 * H}, state: null }], { list: "rows", id: "m2" });
            w.setRange({ from: ${T0}, to: ${T0 + 2 * H} }); w.draw();
            var rr = w.renderRoot, rows = Array.from(rr.querySelectorAll(".lg-row")).map(function (x) { return [x.getAttribute("data-key")].concat(Array.from(x.querySelectorAll(".lg-val")).map(function (e) { return e.textContent; })); });
            return { head: Array.from(rr.querySelectorAll(".lg-table th")).map(function (e) { return e.textContent.trim(); }), rows: rows, bar: !!rr.querySelector(".range-bar"),
                green: w.stateOf("1").color === w._tok("{token:colors.green.solid}"), red: w.stateOf("0").color === w._tok("{token:colors.red.solid}") }; })()`);
        assert.deepStrictEqual(r.head, ['State', '%', 'Time', 'Count']);
        assert.deepStrictEqual(r.rows.slice(0, 2), [['Running', '75.0%', '3h 00m', '2×'], ['Stopped', '25.0%', '1h 00m', '1×']]);
        assert.strictEqual(r.bar, true);
        assert.ok(r.green && r.red, 'Running / Stopped: the theme’s green / red tokens');
        await js(`${root('st-l')}.querySelectorAll(".lg-row")[1].click()`); await settle();
        const hid = await js(`(function () { var w = ${stw('st-l')}; w.draw(); var sc = w._scale, b = sc.boxes[0]; return { hidden: Array.from(w._hiddenStates), hit: w._hitAt(sc.m.plotX + sc.m.plotW * 0.75, b.y + b.h / 2, ${T0 + 1.5 * H}).stateInfo, pct: w.statsOf(w.lanes()[0], ${T0}, ${T0 + 2 * H}).pct }; })()`);
        assert.deepStrictEqual(hid, { hidden: ['Stopped'], hit: null, pct: 0.5 }, 'Stopped hidden: not drawn, not hovered; the statistics keep it');
    });

    await ok('State Timeline: the bar text, the share bar, the current state chip (it blinks in its state on a page); v1 "label in its bar" off becomes None', async () => {
        await mount('st-k', 'state-timeline', Object.assign({ rows: [{ id: 'm1', name: 'Filler' }], statsBar: true, rowBadge: true, blinkState: 'Stopped', barText: 'both' }, ST), { width: 700, height: 200 });
        const r = await js(`(async function () { var w = ${stw('st-k')};
            w.setStates([{ time: Date.now() - 2 * ${H}, state: 1 }, { time: Date.now() - ${H}, state: 0 }], { list: "rows", id: "m1" });
            w.draw();
            var sc = w._scale, sh = w._shares(w.lanes()[0], sc.vMinX, sc.vMaxX), badge = w._badgeOf(w.rowList()[0]);
            w.scrollIntoView({ block: "center" }); await new Promise(function (r) { setTimeout(r, 150); });
            var seen = new Set(); for (var i = 0; i < 6; i++) { seen.add(w._blinkOn); await new Promise(function (r) { setTimeout(r, 260); }); }
            return { barW: sc.layout.barW, shares: sh.list.map(function (e) { return [e.label, Math.round(e.ms / sh.covered * 100)]; }), badge: badge.text.split(" · ")[0], blinks: seen.size };
        })()`);
        assert.strictEqual(r.barW, 96, 'the share bar column');
        assert.deepStrictEqual(r.shares, [['Running', 50], ['Stopped', 50]]);
        assert.strictEqual(r.badge, 'Stopped');
        assert.strictEqual(r.blinks, 2, 'in its blink state on a page: it blinks');
        const m = await js(`JSON.stringify(NEXA.getComponent("${P}state-timeline").migrateProps({ __v: 1, showLabels: false }))`);
        const mp = JSON.parse(m);
        assert.deepStrictEqual([mp.barText, 'showLabels' in mp], ['none', false]);
    });

    await ok('State Timeline: the look of the names and the statistics (a column of its own: size, weight, colour), the widths, names and statistics only, a long name wrapped', async () => {
        const rows = [{ id: 'm1', name: 'Filler line one north station' }, { id: 'm2', name: 'Capper' }];
        const hist = `[{ time: ${T0}, state: 1 }, { time: ${T0 + H}, state: 0 }, { time: ${T0 + 2 * H}, state: null }]`;
        await mount('st-look', 'state-timeline', Object.assign({ rows, nameWidth: 25, statsWidth: 30, nameWrap: true, rowHeight: 60, statsHeadColor: '#123456',
            statsStyles: [{ column: 'statsPercent', size: 22, weight: '700', color: '#00aa00' }] }, ST), { width: 800, height: 240 });
        const r = await js(`(function () { var w = ${stw('st-look')}; w.setStates(${hist}, { list: "rows", id: "m1" }); w.setStates(${hist}, { list: "rows", id: "m2" }); w.draw();
            var L = w._scale.layout, ctx = w.canvas.getContext("2d"); ctx.font = w._font(11, "400", w._colors());
            return { W: w._layoutSize().w, labelW: L.labelW, statsW: Math.round(L.statsW), pct: w._statStyle("statsPercent"), time: w._statStyle("statsDuration"), lines: w._nameLines(ctx, "Filler line one north station", 90, 60, 14).length, plotW: w._scale.m.plotW }; })()`);
        assert.strictEqual(r.labelW, Math.round(r.W * 0.25), 'the name column: 25 % of the width');
        assert.strictEqual(r.statsW, Math.round(r.W * 0.3), 'the statistics: 30 % of the width');
        assert.deepStrictEqual(r.pct, { size: 22, weight: '700', color: '#00aa00' }, 'the % column: its own look');
        assert.deepStrictEqual(r.time, { size: 11, weight: '400', color: '' }, 'the others: the look of the statistics');
        assert.ok(r.lines >= 2, 'a long name wraps: ' + r.lines);
        assert.ok(r.plotW > 200, 'the timeline takes the rest');
        await mount('st-tab', 'state-timeline', Object.assign({ rows, showChart: false }, ST), { width: 800, height: 200 });
        const t = await js(`(function () { var w = ${stw('st-tab')}; w.setStates(${hist}, { list: "rows", id: "m1" }); w.draw(); var m = w._scale.m;
            return { plotW: m.plotW, ruler: m.rulerH, statsW: Math.round(w._scale.layout.statsW), labelW: w._scale.layout.labelW }; })()`);
        assert.deepStrictEqual([t.plotW, t.ruler], [0, 0], 'names and statistics only: no timeline, no ruler');
        assert.ok(t.statsW + t.labelW > 700, 'the statistics take the rest of the width: ' + JSON.stringify(t));
    });

    await ok('State Timeline: hover shows the segment (state, start, end, duration, note); a click: On Segment Click', async () => {
        await mount('st-d', 'state-timeline', Object.assign({ rows: [{ id: 'm1', name: 'Filler' }], showStats: false }, ST), { width: 600, height: 200 });
        await js(`(function () { var w = ${stw('st-d')}; w.setStates([{ start: ${T0}, end: ${T0 + H}, state: 1, note: "Batch 7" }, { start: ${T0 + H}, end: ${T0 + 2 * H}, state: 0 }], { list: "rows", id: "m1" }); w.setRange({ from: ${T0}, to: ${T0 + 2 * H} }); return 1; })()`);
        await settle();
        const at = await js(`(function () { var w = ${stw('st-d')}, e = w.renderRoot.querySelector(".plot"); e.scrollIntoView({ block: "center" }); w.draw(); var r = e.getBoundingClientRect(), m = w._scale.m, b = w._scale.boxes[0]; return { x: Math.round(r.left + m.plotX + m.plotW * 0.25), y: Math.round(r.top + b.y + b.h / 2) }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y }); await settle();
        const tip = await js(`${root('st-d')}.querySelector(".tooltip").textContent.replace(/\\s+/g, " ")`);
        assert.ok(/Filler — Running/.test(tip) && /Duration: 1h 00m/.test(tip) && /Batch 7/.test(tip), 'tooltip: ' + tip);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x: at.x, y: at.y });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: at.x, y: at.y });
        await settle();
        const ev = await js(`NexaTest.item("st-d").events.filter(function (e) { return e[0] === "segmentClick"; }).pop()`);
        assert.deepStrictEqual(ev && [ev[1].row, ev[1].state, ev[1].start, ev[1].duration, ev[1].note], ['m1', 'Running', T0, H, 'Batch 7']);
    });

    await ok('State Timeline: export — a row per segment (times to the ms), Excel the state\u2019s colour, a Summary and an Annotations sheet; PNG', async () => {
        await mount('st-e', 'state-timeline', Object.assign({ rows: [{ id: 'm1', name: 'Filler' }], annotations: [{ label: 'Shift 2', time: String(T0 + 30 * 60000) }], exportTitle: 'Line 1' }, ST), { width: 600, height: 200, design: true });
        const r = await js(`(async function () {
            var w = ${stw('st-e')};
            w.setStates([{ start: ${T0}, end: ${T0 + H}, state: 1 }, { start: ${T0 + H}, end: ${T0 + 2 * H}, state: 0, note: "jam" }], { list: "rows", id: "m1" });
            w.draw();
            w.exportData({ format: "csv", range: "all" });
            var csv = (await w._lastExport.blob.text()).replace(/^\\ufeff/, "").split("\\r\\n");
            w.exportData({ format: "xlsx", range: "all" });
            var xl = new TextDecoder().decode(new Uint8Array(await w._lastExport.blob.arrayBuffer()));
            var png = await w.exportPNG({ range: "all" });
            return { csv: csv, xl: xl, png: png && png.width };
        })()`);
        assert.strictEqual(r.csv[0], '"Row","State","Value","Start","End","Duration (s)","Note"');
        assert.ok(/^"Filler","Running","1",\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.000,.*,3600,""$/.test(r.csv[1]), r.csv[1]);
        assert.ok(/"Stopped".*,3600,"jam"$/.test(r.csv[2]), r.csv[2]);
        assert.ok(/^"Annotation","Shift 2"/.test(r.csv[3]), 'the annotation: ' + r.csv[3]);
        assert.ok(/<sheet name="Summary"/.test(r.xl) && /<sheet name="Annotations"/.test(r.xl) && /<sheet name="Info"/.test(r.xl), 'Summary, Annotations, Info');
        assert.ok(/<c r="B2" t="inlineStr" s="3">/.test(r.xl), 'the state cell in its colour');
        assert.ok(r.png > 0, 'a PNG');
    });

    await ok('State Timeline: "now" stands still between data (a hover never moves it); Refresh Every 250 ms moves it, paused while hovered', async () => {
        await mount('st-h', 'state-timeline', Object.assign({ rows: [{ id: 'm1', name: 'Filler' }] }, ST), { width: 600, height: 200 });
        const r = await js(`(async function () {
            var w = ${stw('st-h')}, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
            w.appendChange({ time: Date.now() - 3000, state: 1 }, { list: "rows", id: "m1" });
            w.draw(); var a = w._scale.vMaxX;
            await sleep(400);
            w.hover = { time: a - 1000, px: 100, py: 50, seg: null }; w.draw(); var b = w._scale.vMaxX; w.hover = null;
            await sleep(400); w.draw(); var c = w._scale.vMaxX;
            w.scrollIntoView({ block: "center" }); await sleep(150);
            w.p.refresh = "250ms"; await sleep(700); var d = w._scale.vMaxX;
            w.hover = { time: d - 1000, px: 100, py: 50, seg: null }; await sleep(600); var e = w._scale.vMaxX; w.hover = null;
            w.appendChange({ time: Date.now(), state: 0 }, { list: "rows", id: "m1" }); w.draw(); var f = w._scale.vMaxX;
            return { still: a === b && b === c, ticked: d > c, paused: e === d, data: f > e, ms: w.refreshMs() };
        })()`);
        assert.deepStrictEqual(r, { still: true, ticked: true, paused: true, data: true, ms: 250 });
    });

    await ok('State Timeline: the editor shows sample states; in a zoomed canvas it draws at its layout size', async () => {
        await mount('st-f', 'state-timeline', Object.assign({ rows: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, ST), { width: 600, height: 220, design: true });
        const demo = await js(`(function () { var w = ${stw('st-f')}; return w.rowList().map(function (r) { return w._row(r).demo && w._row(r).ch.length > 0; }); })()`);
        assert.deepStrictEqual(demo, [true, true]);
        await mount('st-g', 'state-timeline', Object.assign({ rows: [{ id: 'a', name: 'A' }] }, ST), { width: 600, height: 220, design: true });
        const z = await js(`(async function () {
            var slot = NexaTest.item("st-g").el; slot.style.transform = "scale(0.5)"; slot.style.transformOrigin = "0 0";
            await new Promise(function (r) { setTimeout(r, 100); });
            var a = ${stw('st-f')}, b = ${stw('st-g')}; a.draw(); b.draw();
            return [a._scale.m.plotH, b._scale.m.plotH];
        })()`);
        assert.strictEqual(z[0], z[1], 'the same plot height at 50 %');
    });

    // ---- Pie / Donut ----------------------------------------------------------------------------
    const pw = (name) => `NexaTest.wc(${JSON.stringify(name)})`;
    const REASONS = [['Jam', 142], ['Changeover', 96], ['No material', 61], ['Maintenance', 44], ['Quality hold', 18], ['Operator break', 9], ['Sensor fault', 4], ['Label printer', 3]].map(([name, value]) => ({ name, value }));

    await ok('Pie: from the top, clockwise, the largest first; past the top N one grey Others, always last (a click opens it); the percents add up to 100', async () => {
        await mount('pi1', 'pie', { rows: REASONS, topN: 4, slices: [] }, { width: 480, height: 280 });
        const r = await js(`(function () { var w = ${pw('pi1')}; w.draw(); var pie = w._pies[0], l = pie.plan.list;
            return { names: l.map(function (s) { return s.name; }), others: l[l.length - 1].others.map(function (o) { return o.name; }), sum: Math.round(l.reduce(function (a, s) { return a + s.percent; }, 0) * 1000) / 1000,
                start: Math.round(pie.slices[0].a0 * 180 / Math.PI), grey: l[l.length - 1].color === w.statusColor("neutral") }; })()`);
        assert.deepStrictEqual(r.names, ['Jam', 'Changeover', 'No material', 'Maintenance', 'Others']);
        assert.deepStrictEqual(r.others, ['Quality hold', 'Operator break', 'Sensor fault', 'Label printer']);
        assert.strictEqual(r.sum, 1);
        assert.strictEqual(r.start, -90, '12 o\u2019clock');
        assert.strictEqual(r.grey, true, 'Others: the theme\u2019s neutral');
        // a click on Others opens it (its slices shown), the chip closes it
        await js(`(function () { var w = ${pw('pi1')}, pie = w._pies[0], q = pie.slices[pie.slices.length - 1], m = (q.a0 + q.a1) / 2, rr = (pie.r + pie.ri) / 2, pl = w.renderRoot.querySelector(".plot"), b = pl.getBoundingClientRect();
            pl.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + pie.cx + Math.cos(m) * rr, clientY: b.top + pie.cy + Math.sin(m) * rr })); return 1; })()`); await settle();
        assert.strictEqual(await js(`(function () { var w = ${pw('pi1')}; w.draw(); return w._pies[0].plan.list.length; })()`), 8, 'Others opened: every slice');
        await js(`${pw('pi1')}.renderRoot.querySelector(".back-chip").click()`); await settle();
        assert.strictEqual(await js(`(function () { var w = ${pw('pi1')}; w.draw(); return w._pies[0].plan.list.length; })()`), 5, 'closed again');
        await js(`NexaTest.setProps("pi1", { othersBelow: 10, topN: 0 })`); await settle();
        assert.deepStrictEqual(await js(`(function () { var w = ${pw('pi1')}; w.draw(); return w._pies[0].plan.list.map(function (s) { return s.name; }); })()`), ['Jam', 'Changeover', 'No material', 'Maintenance', 'Others'], 'below 10 %: into Others');
    });

    await ok('Pie: slices as Logic targets (status colours, Set value), a click fires On Slice Click and the slice\u2019s own On Click, the legend hides a slice (the % of the rest), a pie per group, the export', async () => {
        await mount('pi2', 'pie', { kind: 'pie', slices: [{ id: 'r', name: 'Running', status: 'success' }, { id: 's', name: 'Stopped', status: 'error' }] }, { width: 480, height: 280 });
        await js(`${pw('pi2')}.setValue(75, { list: "slices", id: "r" })`);
        await js(`${pw('pi2')}.setValue(25, { list: "slices", id: "s" })`); await settle();
        const r = await js(`(function () { var w = ${pw('pi2')}; w.draw(); var l = w._pies[0].plan.list; return { c: l.map(function (s) { return s.color; }), ok: w.statusColor("success"), err: w.statusColor("error"), pc: l.map(function (s) { return s.percent; }) }; })()`);
        assert.deepStrictEqual(r.c, [r.ok, r.err], 'the theme\u2019s status colours');
        assert.deepStrictEqual(r.pc, [0.75, 0.25]);
        await js(`(function () { var w = ${pw('pi2')}; window.__pev = []; var old = w.emit.bind(w); w.emit = function (n, p, t) { window.__pev.push([n, p, t && t.id]); return old(n, p, t); };
            var pie = w._pies[0], q = pie.slices[1], m = (q.a0 + q.a1) / 2, pl = w.renderRoot.querySelector(".plot"), b = pl.getBoundingClientRect();
            pl.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + pie.cx + Math.cos(m) * pie.r * 0.6, clientY: b.top + pie.cy + Math.sin(m) * pie.r * 0.6 })); return 1; })()`);
        assert.deepStrictEqual(await js('window.__pev.map(function (e) { return [e[0], e[1].name, e[2] || null]; })'), [['sliceClick', 'Stopped', null], ['click', 'Stopped', 's']]);
        await js(`${pw('pi2')}.renderRoot.querySelectorAll(".lg-item")[1].click()`); await settle();
        assert.deepStrictEqual(await js(`(function () { var w = ${pw('pi2')}; w.draw(); return w._pies[0].plan.list.map(function (s) { return [s.name, s.percent]; }); })()`), [['Running', 1]], 'Stopped hidden: Running is the whole');
        const multi = [];
        ['A', 'B', 'C'].forEach((m) => REASONS.slice(0, 3).forEach((x) => multi.push({ machine: m, name: x.name, value: x.value })));
        await mount('pi3', 'pie', { rows: multi, groupField: 'machine', slices: [] }, { width: 800, height: 260 });
        assert.deepStrictEqual(await js(`(function () { var w = ${pw('pi3')}; w.draw(); return w._pies.map(function (p) { return p.group; }); })()`), ['A', 'B', 'C'], 'a pie per machine');
        assert.strictEqual(await js(`${pw('pi3')}.exportData({ format: "csv" })`), 9);
        for (const look of [{ half: true }, { kind: 'pie', labelPlace: 'outside' }, { center: 'slice', centerSlice: 'Jam' }, { labelShow: 'all', legend: 'right', legendMode: 'table' }]) {
            await js(`NexaTest.setProps("pi3", ${JSON.stringify(look)})`); await settle();
            assert.ok(await pixels('pi3') > 3000, JSON.stringify(look));
        }
    });

    // ---- Radar / Rose ---------------------------------------------------------------------------------
    const rdw = (name) => `NexaTest.wc(${JSON.stringify(name)})`;

    await ok('Radar: axes in their order from the rows, a fixed scale from 0, each axis its own scale, lower-is-better turned round, short of the target marked, small multiples past 3 series', async () => {
        const rows = [{ series: 'L11', OEE: 78, Quality: 97, Speed: 84 }, { series: 'L12', OEE: 64, Quality: 90, Speed: 93 }];
        await mount('rd1', 'radar', { rows, max: 100, target: 85 }, { width: 480, height: 360 });
        const r = await js(`(function () { var w = ${rdw('rd1')}; w.draw(); var m = w._m; return { axes: m.axes.map(function (a) { return [a.name, a.min, a.max]; }), series: m.series.map(function (s) { return s.name; }), radars: w._radars.length,
            short: m.axes.filter(function (a) { return w._short(a, a.target, m.series[0].values.get(a.key)); }).map(function (a) { return a.name; }) }; })()`);
        assert.deepStrictEqual(r.axes, [['OEE', 0, 100], ['Quality', 0, 100], ['Speed', 0, 100]], 'the rows order, 0 .. 100');
        assert.deepStrictEqual(r.series, ['L11', 'L12']); assert.strictEqual(r.radars, 1);
        assert.deepStrictEqual(r.short, ['OEE', 'Speed']);
        assert.ok(await pixels('rd1') > 5000);
        await js(`NexaTest.setProps("rd1", { scale: "axis", axes: [{ name: "Output", field: "out" }, { name: "Scrap", field: "scrap", better: "lower", min: 0, max: 10 }, { name: "Uptime", field: "up" }], rows: [{ series: "A", out: 1250, scrap: 1, up: 93 }] })`); await settle();
        const t = await js(`(function () { var w = ${rdw('rd1')}; w.draw(); var a = w._m.axes; return [a[0].max, Math.round(w._t(a[1], 1) * 100), Math.round(w._t(a[1], 9) * 100)]; })()`);
        assert.ok(t[0] >= 1250, 'its own max'); assert.deepStrictEqual(t.slice(1), [90, 10], 'scrap 1 of 10 is outward (good), 9 inward');
        const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => ({ series: n, x: 50 + i, y: 60, z: 70 }));
        await js(`NexaTest.setProps("rd1", { scale: "shared", axes: [], rows: ${JSON.stringify(six)} })`); await settle();
        assert.strictEqual(await js(`(function () { var w = ${rdw('rd1')}; w.draw(); return w._radars.length; })()`), 6, 'a radar each');
        await js(`NexaTest.setProps("rd1", { layout: "overlay" })`); await settle();
        assert.strictEqual(await js(`(function () { var w = ${rdw('rd1')}; w.draw(); return w._radars.length; })()`), 1);
    });

    await ok('Radar: Set series from Logic, a click gives the series and the axis, the export; Rose: the radius by the value (equal angles or both)', async () => {
        await mount('rd2', 'radar', { max: 100, target: 80 }, { width: 480, height: 360 });
        await js(`${rdw('rd2')}.setSeries({ name: "Shift A", values: { OEE: 70, Quality: 95, Speed: 88 } }); 1`); await settle();
        await js(`(function () { var w = ${rdw('rd2')}; window.__rdev = []; var old = w.emit.bind(w); w.emit = function (n, p, t) { window.__rdev.push([n, p]); return old(n, p, t); }; w.draw(); return 1; })()`);
        const c = await js(`(function () { var w = ${rdw('rd2')}, rd = w._radars[0], pl = w.renderRoot.querySelector(".plot"), b = pl.getBoundingClientRect(), t = w._t(w._m.axes[0], 70);
            pl.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + rd.cx, clientY: b.top + rd.cy - rd.R * t }));
            var e = window.__rdev.filter(function (e) { return e[0] === "pointClick"; })[0]; return e ? [e[1].series, e[1].axis, e[1].value, e[1].short] : null; })()`);
        assert.deepStrictEqual(c, ['Shift A', 'OEE', 70, true]);
        assert.strictEqual(await js(`${rdw('rd2')}.exportData({ format: "xlsx" })`), 1);
        const areas = [['A', 64], ['B', 36], ['C', 16], ['D', 4]].map(([name, value]) => ({ name, value }));
        await mount('ro1', 'pie', { rows: areas, rose: 'equal', kind: 'pie', roseMin: 0, slices: [] }, { width: 400, height: 300 });
        const ro = await js(`(function () { var w = NexaTest.wc("ro1"); w.draw(); var s = w._pies[0].slices, R = w._pies[0].r; return { r: s.map(function (q) { return Math.round(q.r / R * 100); }), span: s.map(function (q) { return Math.round((q.a1 - q.a0) * 100); }) }; })()`);
        assert.deepStrictEqual(ro.r, [100, 75, 50, 25], 'radius by the square root: the area by the value');
        assert.ok(ro.span.every((x) => x === ro.span[0]), 'equal angles');
        await js(`NexaTest.setProps("ro1", { rose: "both" })`); await settle();
        assert.ok(await js(`(function () { var w = NexaTest.wc("ro1"); w.draw(); var s = w._pies[0].slices; return s[0].a1 - s[0].a0 > s[1].a1 - s[1].a0; })()`), 'both: the angle by the value too');
        assert.ok(await pixels('ro1') > 3000);
    });

    // ---- SPC --------------------------------------------------------------------------------------
    const spw = (name) => `NexaTest.wc(${JSON.stringify(name)})`;

    await ok('SPC: I-MR from rows (auto), limits locked from the first N, the shift flagged, phases, X-bar-R every 5, p with n, the capability panel', async () => {
        const t0 = 1727852400000, rows = [];
        for (let i = 0; i < 40; i++) rows.push({ time: t0 + i * 60000, value: 10 + ((i * 7) % 5 - 2) * 0.1 + (i >= 30 ? 2 : 0), id: 'S' + i });
        await mount('sp1', 'spc', { rows, idField: 'id', limitsFrom: 'first', baselineCount: 20, usl: 11, lsl: 9 }, { width: 760, height: 380 });
        const r = await js(`(function () { var w = ${spw('sp1')}; w.draw(); var m = w._model(), P = m.a.points; return { type: m.type, n: P.length, cl: Math.round(P[39].cl * 1000) / 1000, flagged: P.filter(function (q) { return q.rules.indexOf("N1") !== -1; }).map(function (q) { return q.key; }).length, first: P.findIndex(function (q) { return q.rules.length; }), cap: w._cap && w._cap.n, head: w.renderRoot.querySelector(".spc-head").textContent }; })()`);
        assert.strictEqual(r.type, 'imr'); assert.strictEqual(r.n, 40);
        assert.strictEqual(r.cl, 10, 'the centre from the first 20 only');
        assert.strictEqual(r.flagged, 10, 'the 10 shifted points beyond 3 sigma'); assert.strictEqual(r.first, 30);
        assert.ok(r.cap > 0, 'the capability panel'); assert.ok(/I-MR chart/.test(r.head) && /out of control/.test(r.head));
        assert.ok(await pixels('sp1') > 8000);
        await js(`NexaTest.setProps("sp1", { limitsFrom: "all", phases: [{ name: "After fix", from: "${t0 + 30 * 60000}" }] })`); await settle();
        assert.deepStrictEqual(await js(`(function () { var w = ${spw('sp1')}; w.draw(); return w._model().a.segments.map(function (s) { return [s.phase, s.from, s.to]; }); })()`), [['', 0, 29], ['After fix', 30, 39]]);
        await js(`NexaTest.setProps("sp1", { subgroupBy: "size", subgroupSize: 5, phases: [], capability: false })`); await settle();
        assert.deepStrictEqual(await js(`(function () { var w = ${spw('sp1')}; w.draw(); var m = w._model(); return [m.type, m.a.points.length, m.a.points[0].n]; })()`), ['xbar-r', 8, 5]);
        assert.ok(await pixels('sp1') > 5000);
        const cnt = [];
        for (let i = 0; i < 25; i++) cnt.push({ time: t0 + i * 36e5, defects: 4 + (i % 3), n: i % 2 ? 200 : 150 });
        await mount('sp2', 'spc', { rows: cnt, dataKind: 'count' }, { width: 700, height: 300 });
        assert.deepStrictEqual(await js(`(function () { var w = ${spw('sp2')}; w.draw(); var P = w._model().a.points; return [w._model().type, P[0].ucl > P[1].ucl, !!w._cap.rate]; })()`), ['p', true, true]);
        for (const t of ['np', 'c', 'u']) { await js(`NexaTest.setProps("sp2", { chartType: "${t}" })`); await settle(); assert.ok(await pixels('sp2') > 3000, t); }
    });

    await ok('SPC: a click gives its subgroup, notes and exclusions come back from props (the chart keeps nothing), a new violation fires On Violation once, Append value, the export', async () => {
        const t0 = 1727852400000, rows = [];
        for (let i = 0; i < 25; i++) rows.push({ time: t0 + i * 60000, value: 10 + ((i * 3) % 4 - 1.5) * 0.1, id: 'B' + i });
        await mount('sp3', 'spc', { rows, idField: 'id', ruleSet: 'nelson', limitsFrom: 'first', baselineCount: 20 }, { width: 760, height: 360 });
        await js(`(function () { var w = ${spw('sp3')}; window.__spev = []; var old = w.emit.bind(w); w.emit = function (n, p, t) { window.__spev.push([n, p]); return old(n, p, t); }; w.draw(); return 1; })()`);
        const click = await js(`(function () { var w = ${spw('sp3')}, g = w._geo, pl = w.renderRoot.querySelector(".plot"), b = pl.getBoundingClientRect(), x = b.left + g.X(4), y = b.top + g.up.Y(w._model().a.points[4].x);
            ["pointerdown", "pointerup"].forEach(function (t) { pl.dispatchEvent(new PointerEvent(t, { bubbles: true, button: 0, pointerId: 1, clientX: x, clientY: y })); });
            var e = window.__spev.filter(function (e) { return e[0] === "pointClick"; })[0]; return e ? [e[1].key, e[1].time, e[1].excluded] : null; })()`);
        assert.deepStrictEqual(click, ['B4', t0 + 4 * 60000, false]);
        assert.strictEqual(await js('window.__spev.filter(function (e) { return e[0] === "violation"; }).length'), 0, 'the points there at load fire nothing');
        await js(`NexaTest.setProps("sp3", { notes: [{ key: "B4", text: "Tool changed" }], excluded: ["B5"] })`); await settle();
        assert.deepStrictEqual(await js(`(function () { var m = ${spw('sp3')}._model(); return [m.noteAt.get(4)[0].text, m.a.points[5].excluded]; })()`), ['Tool changed', true]);
        await js(`NexaTest.invoke("sp3", "appendValue", { value: 25, time: ${t0 + 30 * 60000} })`); await settle();
        await js('new Promise(function (r) { setTimeout(r, 50); })');
        const v = await js('window.__spev.filter(function (e) { return e[0] === "violation"; }).map(function (e) { return [e[1].value, e[1].chart, e[1].rules.map(function (r) { return r.rule; }).join()]; })');
        assert.deepStrictEqual(v.filter((x) => x[1] === 'upper'), [[25, 'upper', 'N1']], JSON.stringify(v));
        const before = v.length;
        await js(`${spw('sp3')}.draw(); NexaTest.setProps("sp3", { title: "again" })`); await settle();
        assert.strictEqual(await js('window.__spev.filter(function (e) { return e[0] === "violation"; }).length'), before, 'once, not on every redraw');
        assert.strictEqual(await js(`${spw('sp3')}.exportData({ format: "csv" })`), 26);
        assert.strictEqual(await js(`${spw('sp3')}.exportData({ format: "xlsx" })`), 26);
    });

    // ---- Scatter --------------------------------------------------------------------------------
    const scw = (name) => `NexaTest.wc(${JSON.stringify(name)})`;

    await ok('Scatter: every point drawn, a group per field (a legend entry each), a fit per group with its R2; past the limit the density with the outliers as dots', async () => {
        const rows = [];
        for (let i = 0; i < 200; i++) { const x = i / 10; rows.push({ temp: x, reject: 2 * x + 1 + ((i * 37) % 7 - 3) * 0.05, oven: i % 2 ? 'Oven 2' : 'Oven 1' }); }
        await mount('sc1', 'scatter', { rows, xField: 'temp', yField: 'reject', groupField: 'oven', fit: 'linear', fitBand: true, shapeAround: 'ellipse', quadrants: 'mean', quadNames: 'A,B,C,D', references: [{ axis: 'y', kind: 'line', value: 30, label: 'USL' }] }, { width: 600, height: 320 });
        const r = await js(`(function () { var w = ${scw('sc1')}; w.draw(); return { n: w._geo.idx.length, groups: w._data().groups, fits: w._fits.map(function (f) { return [f.group, f.model, Math.round(f.coef[1] * 10) / 10, f.r2 > 0.99]; }), dense: w._dense,
            legend: Array.from(w.renderRoot.querySelectorAll(".lg-name")).map(function (e) { return e.textContent; }) }; })()`);
        assert.strictEqual(r.n, 200);
        assert.deepStrictEqual(r.groups, ['Oven 1', 'Oven 2']);
        assert.deepStrictEqual(r.fits, [['Oven 1', 'linear', 2, true], ['Oven 2', 'linear', 2, true]]);
        assert.deepStrictEqual(r.legend, ['Oven 1', 'Oven 2']);
        assert.strictEqual(r.dense, false);
        assert.ok(await pixels('sc1') > 5000);
        // a big cloud: its density, the sparse points still as dots
        const big = [];
        for (let i = 0; i < 30000; i++) { const a = (i * 2.399) % 6.283, rr = Math.sqrt((i % 997) / 997); big.push({ x: 50 + 10 * rr * Math.cos(a), y: 50 + 10 * rr * Math.sin(a) }); }
        big.push({ x: 90, y: 10 });
        await mount('sc2', 'scatter', { rows: big, densityLimit: 20000 }, { width: 600, height: 320 });
        assert.strictEqual(await js(`(function () { var w = ${scw('sc2')}; w.draw(); return [w._dense, w._geo.idx.length]; })()`).then((v) => JSON.stringify(v)), JSON.stringify([true, 30001]));
        assert.ok(await pixels('sc2') > 5000);
        await js(`NexaTest.setProps("sc2", { density: "off" })`); await settle();
        assert.strictEqual(await js(`(function () { var w = ${scw('sc2')}; w.draw(); return w._dense; })()`), false);
        for (const look of [{ colorBy: 'time', timeField: 't' }, { shape: 'group', fit: 'poly2', fitPer: 'all' }, { xLog: true, yLog: true, fit: 'exp' }, { shapeAround: 'hull', fit: 'log' }]) {
            await js(`NexaTest.setProps("sc1", ${JSON.stringify(look)})`); await settle();
            assert.ok(await pixels('sc1') > 3000, JSON.stringify(look));
        }
    });

    await ok('Scatter: Shift + drag selects EVERY row in the box (On Select), a click gives its point and row, Ctrl + wheel zooms (a plain wheel does not), two live tags add points, the export', async () => {
        const rows = [];
        for (let i = 0; i < 100; i++) rows.push({ x: i, y: i % 10, batch: 'B' + i });
        await mount('sc3', 'scatter', { rows, labelField: 'batch' }, { width: 600, height: 320 });
        await js(`(function () { var w = ${scw('sc3')}; window.__scev = []; var old = w.emit.bind(w); w.emit = function (n, p, t) { window.__scev.push([n, p]); return old(n, p, t); }; w.draw(); return 1; })()`);
        // a box from (x 9.5, y 9.5) to (x 30.5, y 4.5): x 10..30 with y 5..9
        const sel = await js(`(function () { var w = ${scw('sc3')}, g = w._geo, pl = w.renderRoot.querySelector(".plot"), b = pl.getBoundingClientRect();
            var ev = function (t, x, y) { pl.dispatchEvent(new PointerEvent(t, { bubbles: true, button: 0, shiftKey: true, pointerId: 1, clientX: b.left + g.X(x), clientY: b.top + g.Y(y) })); };
            ev("pointerdown", 9.5, 9.5); ev("pointermove", 20, 7); ev("pointermove", 30.5, 4.5); ev("pointerup", 30.5, 4.5);
            var e = window.__scev.filter(function (e) { return e[0] === "select"; })[0]; return e ? { count: e[1].count, first: e[1].rows[0].batch } : null; })()`);
        // x 10..30 with y (x mod 10) 5..9: 15-19 and 25-29
        assert.deepStrictEqual(sel, { count: 10, first: 'B15' });
        const click = await js(`(function () { var w = ${scw('sc3')}, g = w._geo, pl = w.renderRoot.querySelector(".plot"), b = pl.getBoundingClientRect();
            var ev = function (t) { pl.dispatchEvent(new PointerEvent(t, { bubbles: true, button: 0, pointerId: 1, clientX: b.left + g.X(42), clientY: b.top + g.Y(2) })); };
            ev("pointerdown"); ev("pointerup");
            var e = window.__scev.filter(function (e) { return e[0] === "pointClick"; })[0]; return e ? [e[1].x, e[1].y, e[1].label, e[1].index, e[1].row.batch] : null; })()`);
        assert.deepStrictEqual(click, [42, 2, 'B42', 42, 'B42']);
        const zoom = (ctrl) => js(`(function () { var w = ${scw('sc3')}, g = w._geo, pl = w.renderRoot.querySelector(".plot"), b = pl.getBoundingClientRect();
            pl.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: ${ctrl}, deltaY: -100, clientX: b.left + g.px + g.pw / 2, clientY: b.top + g.py + g.ph / 2 })); return w._view ? Math.round(w._view.x1 - w._view.x0) : null; })()`);
        assert.strictEqual(await zoom(false), null, 'a plain wheel scrolls the page');
        const span = await zoom(true);
        assert.ok(span > 0 && span < 105, 'zoomed: ' + span);
        await js(`NexaTest.invoke("sc3", "resetZoom", {})`); await settle();
        assert.strictEqual(await js(`${scw('sc3')}._view`), null);
        assert.strictEqual(await js(`${scw('sc3')}.exportData({ format: "csv" })`), 100);
        await js(`NexaTest.setProps("sc3", { fit: "linear" })`); await settle();
        assert.strictEqual(await js(`(function () { var w = ${scw('sc3')}; w.draw(); return w.exportData({ format: "xlsx" }); })()`), 100);
        // two live tags: a point when either changes
        await mount('sc4', 'scatter', { liveName: 'Motor 1' }, { width: 500, height: 260 });
        for (const v of [{ liveX: 5, liveY: 7 }, { liveX: 6 }, { liveX: 6 }, { liveY: 9 }]) { await js(`NexaTest.setProps("sc4", ${JSON.stringify(v)})`); await settle(); }
        assert.deepStrictEqual(await js(`(function () { var w = ${scw('sc4')}, d = w._data(); w.draw(); return [d.n, Array.from(d.x.subarray(0, d.n)), Array.from(d.y.subarray(0, d.n)), d.groups]; })()`), [3, [5, 6, 6], [7, 7, 9], ['Motor 1']]);
        assert.ok(await pixels('sc4') > 1000);
    });

    // ---- Pareto ---------------------------------------------------------------------------------
    const paw = (name) => `NexaTest.wc(${JSON.stringify(name)})`;

    await ok('Pareto: the bars largest first, Others last, the cumulative % ends at exactly 100 %, the cut-off and the vital few', async () => {
        // values that sum awkwardly in floating point (0.1 + 0.2 …)
        const rows = [['A', 0.1], ['B', 0.2], ['C', 0.7], ['D', 0.3], ['E', 0.05], ['F', 0.05], ['G', 0.01]].map(([name, value]) => ({ name, value }));
        await mount('pa1', 'pareto', { rows, topN: 5, cutoff: 80 }, { width: 600, height: 300 });
        const r = await js(`(function () { var w = ${paw('pa1')}; w.draw(); var pl = w._paretos[0].plan; return { names: pl.bars.map(function (b) { return b.name; }), last: pl.bars[pl.bars.length - 1].cum,
            vital: pl.bars.filter(function (b) { return b.vital; }).map(function (b) { return b.name; }), count: pl.vitalCount, n: pl.n, others: pl.bars[pl.bars.length - 1].others.map(function (o) { return o.name; }) }; })()`);
        assert.deepStrictEqual(r.names, ['C', 'D', 'B', 'A', 'E', 'Others']);
        assert.strictEqual(r.last, 1, 'exactly 100 %');
        assert.deepStrictEqual(r.others, ['F', 'G']);
        assert.deepStrictEqual(r.vital, ['C', 'D', 'B'], 'up to (and with) the bar that reaches 80 %');
        assert.deepStrictEqual([r.count, r.n], [3, 7]);
        assert.ok(await pixels('pa1') > 3000);
    });

    await ok('Pareto: an event log counted per category over a window (Set the window), stacked by a field, before / after in the same order, a click on a bar, the export', async () => {
        const now = Date.now(), log = [];
        [['Scratch', 5, 1], ['Dent', 3, 1], ['Crack', 2, 30]].forEach(([d, n, ageDays]) => { for (let i = 0; i < n; i++) log.push({ time: now - ageDays * 864e5 + i * 1000, defect: d, shift: i % 2 ? 'Night' : 'Day' }); });
        await mount('pa2', 'pareto', { rows: log, catField: 'defect', valueField: '', timeField: 'time', window: '7d', stackField: 'shift' }, { width: 600, height: 300 });
        const counted = () => js(`(function () { var w = ${paw('pa2')}; w.draw(); return w._paretos[0].plan.bars.map(function (b) { return [b.name, b.value]; }); })()`);
        assert.deepStrictEqual(await counted(), [['Scratch', 5], ['Dent', 3]], 'the last 7 days, counted (Crack is 30 days old)');
        await js(`NexaTest.invoke("pa2", "setWindow", { window: "" })`); await settle();
        assert.deepStrictEqual(await counted(), [['Scratch', 5], ['Dent', 3], ['Crack', 2]], 'every row');
        assert.deepStrictEqual(await js(`(function () { var w = ${paw('pa2')}; var b = w._paretos[0].plan.bars[0]; return [b.parts.get("Day"), b.parts.get("Night")]; })()`), [3, 2], 'a bar in its parts (per shift)');
        const ba = [['A', 10, 2], ['B', 6, 9], ['C', 3, 1]].reduce((o, [n, before, after]) => o.concat([{ week: 'W1', name: n, value: before }, { week: 'W2', name: n, value: after }]), []);
        await mount('pa3', 'pareto', { rows: ba, groupField: 'week' }, { width: 700, height: 300 });
        assert.deepStrictEqual(await js(`(function () { var w = ${paw('pa3')}; w.draw(); return w._paretos.map(function (p) { return p.group + ":" + p.plan.bars.map(function (b) { return b.name; }).join(""); }); })()`), ['W1:ABC', 'W2:ABC'], 'after in the order of before');
        await js(`(function () { var w = ${paw('pa3')}; window.__paev = []; var old = w.emit.bind(w); w.emit = function (n, p, t) { window.__paev.push([n, p]); return old(n, p, t); };
            var q = w._rects[0], pl = w.renderRoot.querySelector(".plot"), b = pl.getBoundingClientRect(); pl.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + q.x + q.w / 2, clientY: b.top + q.y + q.h / 2 })); return 1; })()`);
        assert.deepStrictEqual(await js('window.__paev.filter(function (e) { return e[0] === "barClick"; }).map(function (e) { return [e[1].name, e[1].rank, e[1].group]; })'), [['A', 1, 'W1']]);
        assert.strictEqual(await js(`${paw('pa3')}.exportData({ format: "csv" })`), 6);
        for (const look of [{ orientation: 'horizontal', labels: 'both' }, { line: 'smooth', lineArea: true, lineLabels: true }, { aligned: false, line: 'step' }]) {
            await js(`NexaTest.setProps("pa3", ${JSON.stringify(look)})`); await settle();
            assert.ok(await pixels('pa3') > 3000, JSON.stringify(look));
        }
    });

    // ---- Gauge / Bar Gauge (the shared value model: readout.js) -------------------------------
    const gw = (name) => `NexaTest.wc(${JSON.stringify(name)})`;
    const hist60 = (f) => { const now = Date.now(); return Array.from({ length: 60 }, (_, i) => ({ x: now - (60 - i) * 60000 + 30000, y: f(i) })); };

    await ok('Gauge: the arc (any sweep; a ring from the top), the value on its scale, a soft max, the steps as zones, the ticks (automatic, a step, a list), the peak over the window', async () => {
        await mount('ga1', 'gauge', { gauges: [{ id: 'g1', name: 'Pressure', max: 100, softMax: true, showPeak: true }], thresholds: [{ from: 0, status: 'success' }, { from: 80, status: 'error', label: 'Trip' }] }, { width: 300, height: 260 });
        await js(`${gw('ga1')}.setHistory(${JSON.stringify(hist60((i) => (i === 30 ? 130 : 50 + i / 2)))}, { list: "gauges", id: "g1" })`); await settle();
        const r = await js(`(function () { var w = ${gw('ga1')}, t = w.itemList()[0], st = w._state(t), v = w._figure(t, st).v; return { v: v, range: w._range(t, st, v), peak: w._peak(t, st), color: w._stateColor(t, 125), err: w.statusColor("error") }; })()`);
        assert.strictEqual(r.v, 79.5, 'the last value');
        assert.strictEqual(r.range.lo, 0);
        assert.ok(r.range.hi >= 130, 'a soft max grows to the peak (a round number): ' + r.range.hi);
        assert.deepStrictEqual([r.peak.lo, r.peak.hi], [50, 130]);
        assert.strictEqual(r.color, r.err, 'past 80: the Trip step');
        const geo = await js(`(function () { var w = ${gw('ga1')}; w.p.sweep = 360; var g = w._geometry({ x: 0, y: 0, w: 300, h: 260 }, 0, 0, 10); var a = { a0: Math.round(g.a0 * 180 / Math.PI), a1: Math.round(g.a1 * 180 / Math.PI) }; w.p.sweep = 180; var h = w._geometry({ x: 0, y: 0, w: 300, h: 260 }, 0, 0, 10); return { ring: a, half: [Math.round(h.a0 * 180 / Math.PI), Math.round(h.a1 * 180 / Math.PI)] }; })()`);
        assert.deepStrictEqual(geo.ring, { a0: -90, a1: 270 }, 'a full ring starts at the top');
        assert.deepStrictEqual(geo.half, [180, 360], 'a half dial: west to east, over the top');
        const ticks = await js(`import("/nexa-component-ui-library/vendor/chart/readout.js").then(function (m) { return [m.scaleTicks(0, 100, 0, "", 5), m.scaleTicks(0, 100, 25, ""), m.scaleTicks(0, 100, 10, "0, 25, 80, 100, 140")]; })`);
        assert.deepStrictEqual(ticks, [[0, 20, 40, 60, 80, 100], [0, 25, 50, 75, 100], [0, 25, 80, 100]], 'automatic, a step, a list (in range: 140 out)');
        assert.ok(await pixels('ga1') > 3000, 'drawn');
    });

    await ok('Gauge: every pointer model draws (fill, needle line / tapered / arrow, a triangle outside / inside), ticks inside / outside / across, labels outside, zones as a ring / the track / inner', async () => {
        const looks = [{ needle: 'line' }, { needle: 'tapered', fill: false, sweep: 180 }, { needle: 'arrow', zones: 'track' }, { marker: 'outside', fill: false, tickPlace: 'outside', labelPlace: 'outside' },
            { marker: 'inside', sweep: 360, ticks: false, labels: false }, { tickPlace: 'across', tickList: '0, 25, 80, 100', minorTicks: 9, zones: 'inner', zoneLabels: true }];
        for (let i = 0; i < looks.length; i++) {
            await mount('ga2-' + i, 'gauge', Object.assign({ gauges: [{ id: 'g1', name: 'Look ' + i, target: 70, setpoint: 60, normalLow: 40, normalHigh: 80 }], thresholds: [{ from: 0, status: 'success', label: 'OK' }, { from: 85, status: 'error', label: 'Hi' }] }, looks[i]), { width: 260, height: 220 });
            await js(`${gw('ga2-' + i)}.setValue(64, { list: "gauges", id: "g1" })`); await settle();
            assert.ok(await pixels('ga2-' + i) > 2500, JSON.stringify(looks[i]));
        }
    });

    await ok('Bar Gauge: bars horizontal / vertical, basic / gradient / LCD, a shared scale, sorted, the top N, a click on a bar, the export', async () => {
        const bars = ['A', 'B', 'C', 'D'].map((n, i) => ({ id: 'b' + i, name: n, unit: '%', target: i === 1 ? 70 : '' }));
        await mount('bg1', 'bar-gauge', { bars, sort: 'value-desc', topN: 3, thresholds: [{ from: 0, status: 'success' }, { from: 80, status: 'error' }] }, { width: 500, height: 220 });
        for (let i = 0; i < 4; i++) await js(`${gw('bg1')}.setValue(${[30, 90, 55, 10][i]}, { list: "bars", id: "b${i}" })`);
        await settle();
        const r = await js(`(function () { var w = ${gw('bg1')}; w.draw(); return { order: w._ordered().map(function (x) { return x.t.name; }), rects: w._rects.length, red: w._stateColor(w.itemList()[1], 90) === w.statusColor("error") }; })()`);
        assert.deepStrictEqual(r.order, ['B', 'C', 'A'], 'largest first, the top 3');
        assert.strictEqual(r.rects, 3);
        assert.strictEqual(r.red, true);
        for (const look of [{ mode: 'basic' }, { mode: 'lcd', orientation: 'vertical', ticks: true }, { mode: 'gradient', zoneStrip: true, ticks: true }]) {
            await js(`NexaTest.setProps("bg1", ${JSON.stringify(look)})`); await settle();
            assert.ok(await pixels('bg1') > 3000, JSON.stringify(look));
        }
        await js(`(function () { var w = ${gw('bg1')}; window.__bev = []; var old = w.emit.bind(w); w.emit = function (n, p, t) { window.__bev.push([n, p, t && t.id]); return old(n, p, t); }; w.draw(); var q = w._rects[0], pl = w.renderRoot.querySelector(".plot"), b = pl.getBoundingClientRect(); pl.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + q.x + q.w / 2, clientY: b.top + q.y + q.h / 2 })); return 1; })()`);
        assert.deepStrictEqual(await js('window.__bev.filter(function (e) { return e[0] === "barClick"; }).map(function (e) { return [e[1].value, e[2]]; })'), [[90, 'b1']], 'On Bar Click: its value, its target');
        assert.strictEqual(await js(`${gw('bg1')}.exportData({ format: "csv" })`), 4);
    });

    // ---- Area Chart -------------------------------------------------------------------------
    const acw = (name) => `NexaTest.wc(${JSON.stringify(name)})`;

    await ok('Area Chart: standard and stacked area modes, time-series ring buffer, and export', async () => {
        const T = 1728000000000;
        await mount('ac-test', 'area-chart', {
            mode: 'stacked',
            series: [{ id: 's1', name: 'Power Line 1' }, { id: 's2', name: 'Power Line 2' }]
        }, { width: 500, height: 260 });

        const ptsCount = await js(`(function () {
            var w = ${acw('ac-test')};
            w.appendPoints([{ x: ${T}, y: 30 }, { x: ${T + 3600000}, y: 45 }], 's1');
            w.appendPoints([{ x: ${T}, y: 20 }, { x: ${T + 3600000}, y: 35 }], 's2');
            w.draw();
            var b1 = w._state(w.findSeries('s1')).buf.length;
            var b2 = w._state(w.findSeries('s2')).buf.length;
            return { b1: b1, b2: b2, hasScale: !!w._scale };
        })()`);
        assert.strictEqual(ptsCount.b1, 2);
        assert.strictEqual(ptsCount.b2, 2);
        assert.strictEqual(ptsCount.hasScale, true);

        // Export test
        const exp = await js(`(function () {
            var w = ${acw('ac-test')};
            var csv = w.exportData('csv');
            var xlsx = w.exportData('xlsx');
            return { csv: csv, xlsx: xlsx, name: w._lastExport.name };
        })()`);
        assert.strictEqual(exp.csv, 2);
        assert.strictEqual(exp.xlsx, 2);
        assert.ok(/\.xlsx$/.test(exp.name));
    });

    await ok('Area Chart: a null value is missing (never a 0): Connect fills across the hole, Gap cuts the area, Bridge adds a dashed line; stacked: the series adds nothing there', async () => {
        const T = 1728000000000, pts = [];
        for (let i = 0; i <= 20; i++) pts.push(i === 10 ? { x: T + i * 1000, y: null } : { x: T + i * 1000, y: 40 });
        for (const mode of ['standard', 'stacked']) {
            const id = 'ac-gap-' + mode;
            await mount(id, 'area-chart', { mode, series: [{ id: 's1', name: 'A', fillType: 'solid' }, { id: 's2', name: 'B', fillType: 'solid' }] }, { width: 500, height: 260 });
            await js(`(function () { var w = ${acw(id)}; w.appendPoints(${JSON.stringify(pts)}, 's1'); w.appendPoints(${JSON.stringify(pts.map((q) => ({ x: q.x, y: 30 })))}, 's2'); w.draw(); })()`);
            const st = await js(`(function () { var w = ${acw(id)}, buf = w._state(w.findSeries('s1')).buf; return { count: buf.length, breaks: Array.from(buf.breaksKept()), zero: buf.getY(9) }; })()`);
            assert.deepStrictEqual(st, { count: 20, breaks: [T + 10000], zero: 40 }, 'the null is no point (and no 0)');
            const hole = async () => js(`(function () { var w = ${acw(id)}; w.draw(); var sc = w._scale, d = w._lastDpr || 1, ctx = w.canvas.getContext("2d");
                var x0 = Math.round(sc.toScreenX(${T + 9300}) * d), x1 = Math.round(sc.toScreenX(${T + 10700}) * d), y0 = Math.round(sc.plotY * d), h = Math.round(sc.plotH * d);
                var data = ctx.getImageData(x0, y0, x1 - x0, h).data, n = 0; for (var i = 3; i < data.length; i += 4) if (data[i]) n++;
                var side = ctx.getImageData(Math.round(sc.toScreenX(${T + 2000}) * d), y0, x1 - x0, h).data, m = 0; for (var j = 3; j < side.length; j += 4) if (side[j]) m++;
                return { hole: n, side: m }; })()`);
            const connect = await hole();
            await js(`NexaTest.setProps(${JSON.stringify(id)}, { missing: "gap" })`); await settle();
            const gap = await hole();
            await js(`NexaTest.setProps(${JSON.stringify(id)}, { missing: "bridge" })`); await settle();
            const bridge = await hole();
            assert.ok(connect.hole > gap.hole + 500 && connect.side > 500, mode + ': Connect fills the hole, Gap does not ' + JSON.stringify([connect, gap]));
            assert.ok(bridge.hole > gap.hole && bridge.hole < connect.hole, mode + ': Bridge: a dashed line only ' + JSON.stringify([gap, bridge, connect]));
        }
        // a 0 is a value: it is a point
        await mount('ac-zero', 'area-chart', { series: [{ id: 's1', name: 'A' }] }, { width: 400, height: 200 });
        await js(`(function () { var w = ${acw('ac-zero')}; w.appendPoints([{ x: 1000, y: 0 }, { x: 2000, y: null }, { x: 3000, y: "" }, { x: 4000, y: 7 }], 's1'); })()`);
        assert.deepStrictEqual(await js(`(function () { var buf = ${acw('ac-zero')}._state(${acw('ac-zero')}.findSeries('s1')).buf; return [buf.length, buf.getY(0), buf.getY(1), buf.breaksKept().length]; })()`), [2, 0, 7, 2]);
    });

    await ok('Area Chart: the same Update-node actions and live value as the Line Chart: Append / Replace / Clear / Show / Hide of ONE series (params, target), a live value is a point, null after it is missing', async () => {
        const T = 1728000000000, t = (id) => `{ list: "series", id: "${id}" }`;
        await mount('ac-act', 'area-chart', { series: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, { width: 500, height: 240 });
        const buf = (id) => js(`(function () { var w = ${acw('ac-act')}, b = w._state(w.findSeries("${id}")).buf; return { ys: Array.from({ length: b.length }, function (_, i) { return b.getY(i); }), breaks: b.breaksKept().length }; })()`);
        await js(`NexaTest.invoke("ac-act", "appendPoints", [{ x: ${T}, y: 1 }, { x: ${T + 1000}, y: 2 }], ${t('b')})`);
        await js(`NexaTest.invoke("ac-act", "appendPoints", { x: ${T + 2000}, y: 3 }, ${t('b')})`);
        assert.deepStrictEqual((await buf('b')).ys, [1, 2, 3], 'an array, then one point: the series the node targets (b)');
        assert.deepStrictEqual((await buf('a')).ys, [], 'a is untouched');
        await js(`NexaTest.invoke("ac-act", "replacePoints", [{ x: ${T}, y: 9 }], ${t('b')})`);
        assert.deepStrictEqual((await buf('b')).ys, [9], 'Replace');
        await js(`NexaTest.invoke("ac-act", "appendPoints", { points: [{ x: ${T + 5000}, y: 4 }, { x: ${T + 6000}, y: null }] }, ${t('b')})`);
        assert.deepStrictEqual(await buf('b'), { ys: [9, 4], breaks: 1 }, 'a {points: [...]} payload; the null is a break, not a point');
        await js(`NexaTest.invoke("ac-act", "hide", null, ${t('b')})`); await settle();
        assert.strictEqual(await js(`${acw('ac-act')}._hidden.has("b")`), true, 'Hide');
        await js(`NexaTest.invoke("ac-act", "show", null, ${t('b')})`); await settle();
        assert.strictEqual(await js(`${acw('ac-act')}._hidden.has("b")`), false, 'Show');
        await js(`NexaTest.invoke("ac-act", "clear", null, ${t('b')})`); await settle();
        assert.deepStrictEqual(await buf('b'), { ys: [], breaks: 0 }, 'Clear: the points and the breaks');
        const bad = await js(`(function () { try { NexaTest.invoke("ac-act", "appendPoints", []); return null; } catch (e) { return e.message; } })()`);
        assert.ok(/no action "appendPoints"/.test(bad), 'Append is the series\' action, not the chart\'s: ' + bad);

        // the live value (a tag): each value is a point; null / undefined after a value is missing, once; the next value is a point again
        await mount('ac-live', 'area-chart', { series: [{ id: 'a', name: 'A', live: 5 }] }, { width: 500, height: 240 });
        const set = async (v) => { await js(`NexaTest.setProps("ac-live", { series: [${JSON.stringify(Object.assign({ id: 'a', name: 'A' }, v === undefined ? {} : { live: v }))}] })`); await settle(); await sleep(15); };
        const live = () => js(`(function () { var w = ${acw('ac-live')}, b = w._state(w.findSeries("a")).buf; return { ys: Array.from({ length: b.length }, function (_, i) { return b.getY(i); }), breaks: b.breaksKept().length }; })()`);
        assert.deepStrictEqual(await live(), { ys: [5], breaks: 0 }, 'a live value is a point');
        await set(5);
        assert.strictEqual((await live()).ys.length, 1, 'the same value again is not another point');
        await sleep(15);
        await set(null);
        await set(undefined);
        assert.deepStrictEqual(await live(), { ys: [5], breaks: 1 }, 'null, then undefined: missing, once');
        await sleep(15);
        await set(7);
        assert.deepStrictEqual(await live(), { ys: [5, 7], breaks: 1 }, 'the next value is a point again');
        await set([{ x: T, y: 1 }, { x: T + 1000, y: 2 }]);
        assert.deepStrictEqual((await live()).ys, [1, 2, 5, 7], 'an array of {x, y} is accepted: older points go in their place');
    });

    // ---- KPI / Stat ----------------------------------------------------------------------------
    const kw = (name) => `NexaTest.wc(${JSON.stringify(name)})`;
    const KT = { list: 'tiles', id: 'k1' };

    await ok('KPI: a tile shows its figure (last / average / sum over a window), a delta (previous, some time ago: the same figure shifted, the target), a progress to the target', async () => {
        const now = Date.now(), M = 60000;
        // (half a minute off the minute: no point on a window's edge)
        const pts = Array.from({ length: 120 }, (_, i) => ({ x: now - (120 - i) * M + 30000, y: i < 60 ? 10 : 20 }));
        await mount('kp1', 'kpi', { tiles: [{ id: 'k1', name: 'Load', unit: 'kW', reduceBy: 'avg', window: '1h', deltaFrom: 'ago', deltaAgo: '1h', deltaAs: 'value' }] }, { width: 400, height: 150 });
        await js(`${kw('kp1')}.setHistory(${JSON.stringify(pts)}, ${JSON.stringify(KT)})`); await settle();
        const r = await js(`(function () { var w = ${kw('kp1')}, t = w.tileList()[0], st = w._state(t); return { avg: w._figure(t, st).v, ago: w._refValue(t, st), count: st.buf.count }; })()`);
        assert.strictEqual(r.count, 120);
        assert.strictEqual(r.avg, 20, 'the average of the last hour');
        assert.strictEqual(r.ago, 10, 'the same average, one hour earlier');
        await js(`NexaTest.setProps("kp1", { tiles: [{ id: "k1", name: "Load", reduceBy: "last", deltaFrom: "previous", target: 40 }] })`); await settle();
        await js(`${kw('kp1')}.setValue(30, ${JSON.stringify(KT)})`); await settle();
        const d = await js(`(function () { var w = ${kw('kp1')}, t = w.tileList()[0], st = w._state(t), v = w._figure(t, st).v; return { v: v, prev: w._refValue(t, st), delta: w._delta(v, w._refValue(t, st), true, true, {}, "") }; })()`);
        assert.deepStrictEqual([d.v, d.prev], [30, 20]);
        assert.ok(/^▲ 50/.test(d.delta.text) && d.delta.good === true, JSON.stringify(d.delta));
        assert.ok(await pixels('kp1') > 1500);
    });

    await ok('KPI: threshold steps colour a tile (theme status colours; a step for one tile), On State Change; outside its normal band is a warning; On Tile Click; stale', async () => {
        await mount('kp2', 'kpi', { tiles: [{ id: 'k1', name: 'Temp', normalLow: 10, normalHigh: 30 }, { id: 'k2', name: 'Peak' }],
            thresholds: [{ from: 0, status: 'success', tile: 'k2' }, { from: 80, status: 'warning', label: 'High', tile: 'k2' }, { from: 95, status: 'error', label: 'Alarm', tile: 'k2' }] }, { width: 500, height: 150 });
        await js(`(function () { var w = ${kw('kp2')}; w.isEditor = false; window.__kev = []; var old = w.emit.bind(w); w.emit = function (n, p, t) { window.__kev.push([n, p, t && t.id]); return old(n, p, t); }; return 1; })()`);
        for (const v of [50, 85, 99]) await js(`${kw('kp2')}.setValue(${v}, { list: "tiles", id: "k2" })`);
        await js(`${kw('kp2')}.setValue(40, { list: "tiles", id: "k1" })`); await settle();
        const r = await js(`(function () { var w = ${kw('kp2')}, l = w.tileList(); return { k2: w._stateColor(l[1], 99), err: w.statusColor("error"), ok: w._stateColor(l[1], 10), good: w.statusColor("success"), k1: w._stateColor(l[0], 40), warn: w.statusColor("warning"), k1in: w._stateColor(l[0], 20),
            ev: window.__kev.filter(function (e) { return e[0] === "stateChange"; }).map(function (e) { return e[1].from + ">" + e[1].to + "@" + e[2]; }) }; })()`);
        assert.strictEqual(r.k2, r.err, '99: the Alarm step');
        assert.strictEqual(r.ok, r.good);
        assert.strictEqual(r.k1, r.warn, 'outside the normal band: a warning');
        assert.strictEqual(r.k1in, null, 'inside it: the text colour');
        assert.deepStrictEqual(r.ev, ['success>High@k2', 'High>Alarm@k2']);
        await js(`(function () { var w = ${kw('kp2')}; w.draw(); var q = w._rects[1], pl = w.renderRoot.querySelector(".plot"), b = pl.getBoundingClientRect(); pl.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + q.x + q.w / 2, clientY: b.top + q.y + q.h / 2 })); return 1; })()`);
        assert.deepStrictEqual(await js('window.__kev.filter(function (e) { return e[0] === "tileClick"; }).map(function (e) { return [e[1].value, e[2]]; })'), [[99, 'k2']], 'On Tile Click: its value, its target');
        await js(`NexaTest.setProps("kp2", { tiles: [{ id: "k1", name: "Temp", staleAfter: 1000 }, { id: "k2", name: "Peak" }] })`); await settle();
        await js(`(function () { var w = ${kw('kp2')}, st = w._state(w.tileList()[0]); st.lastAt = Date.now() - 5000; w._checkStale(); return 1; })()`);
        assert.deepStrictEqual(await js('window.__kev.filter(function (e) { return e[0] === "stale"; }).map(function (e) { return e[2]; })'), ['k1'], 'On Stale');
    });

    await ok('KPI: the grid of tiles (columns automatic or fixed), the arrangements, the sparkline on a fixed scale, a sparkline only; export CSV / Excel / PNG', async () => {
        const now = Date.now();
        const pts = Array.from({ length: 30 }, (_, i) => ({ x: now - (30 - i) * 60000, y: 50 + i }));
        const tiles = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), sparkMin: 0, sparkMax: 100 }));
        await mount('kp3', 'kpi', { tiles }, { width: 900, height: 140 });
        for (const t of tiles) await js(`${kw('kp3')}.setHistory(${JSON.stringify(pts)}, { list: "tiles", id: "${t.id}" })`);
        await settle();
        const g = await js(`(function () { var w = ${kw('kp3')}; w.draw(); return w._rects.map(function (q) { return [Math.round(q.x), Math.round(q.y)]; }); })()`);
        assert.strictEqual(new Set(g.map((q) => q[1])).size, 1, 'three tiles in one row: ' + JSON.stringify(g));
        await js(`NexaTest.setProps("kp3", { columns: 1 })`); await settle();
        assert.strictEqual(await js(`(function () { var w = ${kw('kp3')}; w.draw(); return new Set(w._rects.map(function (q) { return Math.round(q.x); })).size; })()`), 1, 'one column: a tile under the other');
        for (const arrangement of ['side', 'background']) { await js(`NexaTest.setProps("kp3", { arrangement: "${arrangement}", columns: 0 })`); await settle(); assert.ok(await pixels('kp3') > 2000, arrangement); }
        await js(`NexaTest.setProps("kp3", { showValue: false, arrangement: "stack" })`); await settle();
        assert.ok(await pixels('kp3') > 1000, 'a sparkline only');
        assert.strictEqual(await js(`${kw('kp3')}.exportData({ format: "csv" })`), 3);
        const csv = await js(`${kw('kp3')}._lastExport.blob.text()`);
        assert.ok(/"Name","Value","Unit","State"/.test(csv) && /"A",79/.test(csv), csv);
        assert.strictEqual(await js(`${kw('kp3')}.exportData({ format: "xlsx" })`), 3);
        const png = await js(`${kw('kp3')}.exportPNG().then(function (x) { return x && x.width; })`);
        assert.ok(png > 0, 'a PNG');
    });

    // ---- Histogram --------------------------------------------------------------------------
    const hgw = (name) => `NexaTest.wc(${JSON.stringify(name)})`;

    await ok('Histogram: automatic binning, normal distribution curve, quality spec limits, and export', async () => {
        await mount('hg-test', 'histogram', {
            title: 'Weight Distribution',
            lsl: 495,
            target: 500,
            usl: 505,
            showNormalCurve: true,
            showStats: true
        }, { width: 500, height: 260 });

        const statsResult = await js(`(function () {
            var w = ${hgw('hg-test')};
            w.setData([490, 496, 498, 500, 500, 501, 502, 503, 504, 510]);
            w.draw();
            var st = w._stats;
            return {
                n: st.n,
                mean: Math.round(st.mean),
                hasCp: typeof st.cp === "number",
                hasCpk: typeof st.cpk === "number",
                binCount: w._scale.bins.length,
                hasOutOfSpec: w._scale.bins.some(function (b) { return b.outOfSpec; })
            };
        })()`);
        assert.strictEqual(statsResult.n, 10);
        assert.strictEqual(statsResult.mean, 500);
        assert.strictEqual(statsResult.hasCp, true);
        assert.strictEqual(statsResult.hasCpk, true);
        assert.ok(statsResult.binCount > 0);
        assert.strictEqual(statsResult.hasOutOfSpec, true);

        // Action: append value
        await js(`(function () {
            var w = ${hgw('hg-test')};
            w.appendValue(500);
            w.draw();
        })()`);
        const newN = await js(`${hgw('hg-test')}._stats.n`);
        assert.strictEqual(newN, 11);

        // Export test
        const exp = await js(`(function () {
            var w = ${hgw('hg-test')};
            var csv = w.exportData('csv');
            var xlsx = w.exportData('xlsx');
            return { csv: csv, xlsx: xlsx, name: w._lastExport.name };
        })()`);
        assert.ok(exp.csv > 0);
        assert.ok(exp.xlsx > 0);
        assert.ok(/\.xlsx$/.test(exp.name));
    });

    // ---- gestures: page first (the page scrolls through a chart) / chart first ----------------
    const gestureChart = async (name, extra) => {
        await mount(name, 'state-timeline', Object.assign({ rows: [{ id: 'm1', name: 'Filler' }] }, ST, extra || {}), { width: 600, height: 200 });
        return js(`(function () {
            var w = ${stw(name)};
            w.setStates([{ time: ${T0}, state: 1 }, { time: ${T0 + H}, state: 0 }, { time: ${T0 + 2 * H}, state: 1 }, { time: ${T0 + 3 * H}, state: null }], { list: "rows", id: "m1" });
            var e = w.renderRoot.querySelector(".plot"); e.scrollIntoView({ block: "center" }); w.draw();
            var r = e.getBoundingClientRect(), m = w._scale.m;
            return { x: Math.round(r.left + m.plotX + m.plotW / 2), y: Math.round(r.top + m.plotY + m.plotH / 2), touch: e.style.touchAction };
        })()`);
    };
    const span = (name) => js(`(function () { var w = ${stw(name)}; w.draw(); return w._scale.vMaxX - w._scale.vMinX; })()`);
    // deltaY > 0: scroll down (the page), and on a chart: zoom out; < 0: zoom in
    const wheel = (at, modifiers, dy) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: dy || 120, modifiers: modifiers || 0 });

    await ok('Gestures, page first (the default): a plain wheel over a chart scrolls the page (a hint says Ctrl + scroll); Ctrl + wheel zooms', async () => {
        const at = await gestureChart('g-page');
        assert.strictEqual(at.touch, 'pan-x pan-y', 'one finger: the page\u2019s');
        const s0 = await span('g-page'), y0 = await js('window.scrollY');
        await wheel(at); await js('new Promise(function (r) { setTimeout(r, 250); })');
        const r = await js(`({ y: window.scrollY, hint: !!${root('g-page')}.querySelector(".gesture-hint.on"), live: !${stw('g-page')}.viewRange })`);
        assert.ok(r.y > y0, 'the page scrolled (' + y0 + ' -> ' + r.y + ')');
        assert.ok(r.hint && r.live, 'the chart did not zoom, the hint shows');
        assert.strictEqual(await span('g-page'), s0);
        const at2 = await gestureChart('g-page');
        await wheel(at2, 2, -120); await settle();
        assert.ok(await span('g-page') < s0, 'Ctrl + wheel zooms');
    });

    await ok('Gestures, chart first: a plain wheel zooms, one finger pans (touch-action none)', async () => {
        const at = await gestureChart('g-chart', { gestures: 'chart' });
        assert.strictEqual(at.touch, 'none');
        const s0 = await span('g-chart');
        await wheel(at, 0, -120); await settle();
        assert.ok(await span('g-chart') < s0);
    });

    await ok('Gestures on a touchscreen, page first: one finger scrolls the page, a tap shows the tooltip (a tap elsewhere hides it), two fingers pinch-zoom', async () => {
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        try {
            const touch = (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
            let at = await gestureChart('g-touch');
            const s0 = await span('g-touch'), y0 = await js('window.scrollY');
            await touch('touchStart', [[at.x, at.y]]);
            for (let i = 1; i <= 6; i++) await touch('touchMove', [[at.x, at.y - i * 25]]);
            await touch('touchEnd', []);
            await js('new Promise(function (r) { setTimeout(r, 300); })');
            assert.ok(await js('window.scrollY') > y0, 'the page scrolled');
            assert.ok(await js(`!${stw('g-touch')}.viewRange`), 'the chart did not pan');
            at = await gestureChart('g-touch');
            await touch('touchStart', [[at.x, at.y]]); await touch('touchEnd', []); await settle();
            const tip = () => js(`(function () { var t = ${root('g-touch')}.querySelector(".tooltip"); return !!t && t.style.display !== "none" && t.textContent.trim().length > 0; })()`);
            assert.ok(await tip(), 'a tap: the tooltip');
            await touch('touchStart', [[5, 5]]); await touch('touchEnd', []); await settle();
            assert.ok(!(await tip()), 'a tap elsewhere hides it');
            at = await gestureChart('g-touch');
            await touch('touchStart', [[at.x - 20, at.y], [at.x + 20, at.y]]);
            for (let i = 1; i <= 5; i++) await touch('touchMove', [[at.x - 20 - i * 15, at.y], [at.x + 20 + i * 15, at.y]]);
            await touch('touchEnd', []); await settle();
            assert.ok(await span('g-touch') < s0 * 0.6, 'two fingers apart: zoomed in');
        } finally {
            await send('Emulation.setTouchEmulationEnabled', { enabled: false });
        }
    });

    await ok('Print: a chart paints its own background into the canvas (a browser prints transparent canvas pixels as white paper), sharp (3x); back to transparent after', async () => {
        await gestureChart('g-print');
        const px = () => js(`(function () {
            var w = ${stw('g-print')}, cv = w.renderRoot.querySelector("canvas"), d = cv.getContext("2d").getImageData(1, 1, 1, 1).data;
            var bg = getComputedStyle(w.renderRoot.querySelector(".chart-container")).backgroundColor;
            return { px: Array.from(d), bg: bg, k: Math.round(cv.width / cv.clientWidth) };
        })()`);
        assert.strictEqual((await px()).px[3], 0, 'on screen: transparent (what is behind shows)');
        await js('window.dispatchEvent(new Event("beforeprint")); 1');
        const p = await px();
        const rgb = p.bg.match(/\d+/g).slice(0, 3).map(Number);
        assert.deepStrictEqual(p.px, rgb.concat(255), 'printing: the container’s colour, opaque');
        assert.strictEqual(p.k, 3, 'drawn 3x for paper');
        await js('window.dispatchEvent(new Event("afterprint")); 1');
        assert.strictEqual((await px()).px[3], 0, 'after: transparent again');
    });

    await ok('Histogram: it DRAWS (bars, grid, labels), and its inspector has its props (they were declared under props: / name: and the SDK saw none)', async () => {
        await mount('hg-draw', 'histogram', { title: 'W', lsl: 495, target: 500, usl: 505 }, { width: 500, height: 260 });
        const r = await js(`(async function () {
            var w = NexaTest.wc("hg-draw"), a = [];
            for (var i = 0; i < 400; i++) { var s = 0; for (var k = 0; k < 6; k++) s += Math.sin(i * 12.9898 + k * 78.233) * 0.5 + 0.5; a.push(500 + (s - 3) * 3.2); }
            w.setData(a); await NexaTest.settle(); await new Promise(function (r) { setTimeout(r, 300); });
            var cv = w.renderRoot.querySelector("canvas"), d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data, n = 0;
            for (var j = 3; j < d.length; j += 4) if (d[j]) n++;
            var def = NEXA.getComponent("${P}histogram");
            return { painted: n, label: def.label, props: Object.keys(def.nexa.props) };
        })()`);
        assert.ok(r.painted > 5000, 'bars and axes are painted: ' + r.painted);
        assert.strictEqual(r.label, 'Histogram');
        ['binMode', 'binCount', 'lsl', 'target', 'usl', 'showNormalCurve', 'series'].forEach((k) => assert.ok(r.props.indexOf(k) !== -1, k));
    });

    await ok('Print: every chart with a panel paints it in (Pie, Gauge, Area, Histogram clear through _clearCanvas, not clearRect)', async () => {
        const kinds = { pie: ['pie', { rows: [{ name: 'A', value: 3 }, { name: 'B', value: 1 }] }], gauge: ['gauge', {}], bargauge: ['bar-gauge', {}], area: ['area-chart', { series: [{ id: 's1', name: 'S' }] }],
            hist: ['histogram', {}], column: ['column-chart', {}] };       // (the Sparkline has no panel of its own: nothing to paint in)
        for (const name of Object.keys(kinds)) await mount('pr-' + name, kinds[name][0], kinds[name][1], { width: 300, height: 180 });
        const px = (name) => js(`(function () { var w = NexaTest.wc("pr-${name}"), cv = w.renderRoot.querySelector("canvas"); return Array.from(cv.getContext("2d").getImageData(1, 1, 1, 1).data); })()`);
        for (const name of Object.keys(kinds)) assert.strictEqual((await px(name))[3], 0, name + ' on screen: transparent');
        await js('window.dispatchEvent(new Event("beforeprint")); 1');
        await js('new Promise(function (r) { setTimeout(r, 300); })');
        for (const name of Object.keys(kinds)) assert.strictEqual((await px(name))[3], 255, name + ' printing: opaque');
        await js('window.dispatchEvent(new Event("afterprint")); 1');
        await js('new Promise(function (r) { setTimeout(r, 300); })');
        for (const name of Object.keys(kinds)) assert.strictEqual((await px(name))[3], 0, name + ' after: transparent again');
    });

    await ok('Colours come from the THEME: series i = colors.chart.(i+1) (Carbon categorical), status = the semantic tokens; a theme change restyles; a bare page falls back to Carbon\'s values', async () => {
        await mount('th-line', 'line-chart', { series: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }, { width: 300, height: 160 });
        const get = () => js(`(function () { var w = NexaTest.wc("th-line"), r = document.documentElement.style; return { s0: w.colorOf({ _i: 0 }), s1: w.colorOf({ _i: 1 }), s14: w.colorOf({ _i: 14 }), err: w.statusColor("error"), warn: w.statusColor("warning"), ok: w.statusColor("success") }; })()`);
        let c = await get();
        assert.deepStrictEqual([c.s0, c.s1, c.s14], [c.s0, c.s1, c.s0], 'wraps after 14');
        await js('document.documentElement.style.setProperty("--nexa-colors-chart-1", "#112233"); document.documentElement.style.setProperty("--nexa-colors-chart-2", "#445566"); document.documentElement.style.setProperty("--nexa-colors-red-solid", "#aa0000"); 1');
        c = await get();
        assert.strictEqual(c.s0, '#112233', 'series 0 = colors.chart.1');
        assert.strictEqual(c.s1, '#445566');
        assert.strictEqual(c.s14, '#112233');
        assert.strictEqual(c.err, '#aa0000', 'a threshold / alarm = colors.red.solid');
        await js('["--nexa-colors-chart-1", "--nexa-colors-chart-2", "--nexa-colors-red-solid"].forEach(function (k) { document.documentElement.style.removeProperty(k); }); 1');
        c = await get();
        assert.strictEqual(c.s0.toLowerCase(), '#6929c4', 'no theme variable: Carbon purple 70');
        assert.strictEqual(c.err.toLowerCase(), '#da1e28');
    });

    // ---- Column / Bar Chart -----------------------------------------------------------------------------------
    const cw = (name) => `NexaTest.wc(${JSON.stringify(name)})`;
    const FLOORS = ['F1', 'F2', 'F3'], HOURS = ['08:00', '09:00', '10:00', '11:00'];
    const energyRows = () => { const r = []; HOURS.forEach((h, hi) => FLOORS.forEach((f, fi) => r.push({ hour: h, floor: f, kwh: 10 + fi * 5 + hi }))); return r; };
    const painted = (name) => js(`(function () { var c = ${root(name)}.querySelector("canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, n = 0; for (var i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()`);
    const pointer = (name, type, fx, fy) => js(`(function () { var w = ${cw(name)}, pl = w.renderRoot.querySelector(".plot"), r = pl.getBoundingClientRect(); pl.dispatchEvent(new PointerEvent("${type}", { bubbles: true, clientX: r.left + r.width * ${fx}, clientY: r.top + r.height * ${fy}, pointerId: 3 })); return 1; })()`);
    // the pointer over category i's centre, at a height fraction of the plot
    const pointAt = (name, type, i, fy) => js(`(function () { var w = ${cw(name)}; w.draw(); var g = w._geo, pl = w.renderRoot.querySelector(".plot"), r = pl.getBoundingClientRect();
        pl.dispatchEvent(new PointerEvent("${type}", { bubbles: true, clientX: r.left + g.plotX + g.cpos(g.slots.xs[${i}]), clientY: r.top + g.plotY + g.plotH * ${fy}, pointerId: 3 })); return 1; })()`);
    const COL = 'column-chart';

    await ok('Column Chart: rows split by a field become a series each (long form), draw, and the legend lists them; wide form: a series per y field', async () => {
        await mount('ch1', COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor', title: 'Energy' }, { width: 500, height: 280 });
        const r = await js(`(function () { var w = ${cw('ch1')}; return { xType: w._frame.xType, cats: w._frame.cats, series: w.seriesList().map(function (s) { return s.name; }), legend: Array.from(w.renderRoot.querySelectorAll(".lg-name")).map(function (e) { return e.textContent; }), title: w.renderRoot.querySelector(".c-title").textContent }; })()`);
        assert.strictEqual(r.xType, 'category');
        assert.deepStrictEqual(r.cats, HOURS);
        assert.deepStrictEqual(r.series, FLOORS);
        assert.deepStrictEqual(r.legend, FLOORS);
        assert.strictEqual(r.title, 'Energy');
        assert.ok(await painted('ch1') > 3000, 'columns, axes and labels are drawn');
        await mount('ch2', COL, { rows: [{ t: 'a', p: 1, q: 2 }, { t: 'b', p: 3, q: 4 }], xField: 't', yField: 'p, q' }, { width: 300, height: 200 });
        assert.deepStrictEqual(await js(`${cw('ch2')}.seriesList().map(function (s) { return s.name; })`), ['p', 'q']);
    });

    await ok('Column Chart: Logic Set rows / Append rows replace / add; a time x is detected; item actions (Set data, Set a point, Append, Hide, Show, Clear) drive one series; a click fires On Point Click with the series as target', async () => {
        await mount('ch3', COL, { series: [{ id: 's1', name: 'Load' }], xField: 'x', yField: 'y' }, { width: 500, height: 260 });
        await js(`NexaTest.invoke("ch3", "clearAll")`);            // (the harness is an editor: an empty chart shows sample data until it is cleared)
        await js(`NexaTest.invoke("ch3", "setData", { "A": 5, "B": 9, "C": 7 }, { list: "series", id: "s1", index: 0 })`); await settle();
        assert.deepStrictEqual(await js(`(function () { var w = ${cw('ch3')}; return [w._frame.cats, Array.from(w._frame.series[0].y)]; })()`), [['A', 'B', 'C'], [5, 9, 7]]);
        await js(`NexaTest.invoke("ch3", "setPoint", { x: "B", y: 20 }, { list: "series", id: "s1", index: 0 })`);
        await js(`NexaTest.invoke("ch3", "appendPoint", { x: "D", y: 1 }, { list: "series", id: "s1", index: 0 })`); await settle();
        assert.deepStrictEqual(await js(`(function () { var w = ${cw('ch3')}; return [w._frame.cats, Array.from(w._frame.series[0].y)]; })()`), [['A', 'B', 'C', 'D'], [5, 20, 7, 1]]);
        await js(`NexaTest.invoke("ch3", "hide", null, { list: "series", id: "s1", index: 0 })`); await settle();
        assert.strictEqual(await js(`${cw('ch3')}._visible().length`), 0);
        await js(`NexaTest.invoke("ch3", "show", null, { list: "series", id: "s1", index: 0 })`); await settle();
        assert.strictEqual(await js(`${cw('ch3')}._visible().length`), 1);
        // a click on a column: the event of THAT series
        await js(`window.__ev = []; var w = ${cw('ch3')}; var old = w.emit.bind(w); w.emit = function (n, p, t) { window.__ev.push([n, p, t]); return old(n, p, t); }; w.isEditor = false; 1`);
        await js(`(function () { var w = ${cw('ch3')}; w.draw(); var g = w._geo, pl = w.renderRoot.querySelector(".plot"), r = pl.getBoundingClientRect(); pl.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + g.plotX + g.cpos(1), clientY: r.top + g.plotY + g.plotH * 0.8 })); })()`);
        const ev = await js('window.__ev.filter(function (e) { return e[0] === "pointClick"; })');
        assert.strictEqual(ev.length, 1, JSON.stringify(ev));
        assert.deepStrictEqual(ev[0][2], { list: 'series', id: 's1' });
        assert.strictEqual(ev[0][1].x, 'B');
        await js(`NexaTest.invoke("ch3", "clear", null, { list: "series", id: "s1", index: 0 })`); await settle();
        assert.strictEqual(await js(`${cw('ch3')}._frame.series.length`), 0);
        await mount('ch4', COL, {}, { width: 300, height: 200 });
        const T0 = 1727852400000;
        await js(`NexaTest.invoke("ch4", "setRows", [{ x: ${T0}, y: 1, s: "a" }, { x: ${T0 + 60000}, y: 2, s: "a" }])`); await settle();
        assert.strictEqual(await js(`${cw('ch4')}._xt`), 'time');
        await js(`NexaTest.invoke("ch4", "appendRows", [{ x: ${T0 + 120000}, y: 3, s: "a" }])`); await settle();
        assert.deepStrictEqual(await js(`(function () { var b = ${cw('ch4')}._tser.get("y").buf, o = []; for (var i = 0; i < b.count; i++) o.push(b.getY(i)); return o; })()`), [1, 2, 3], 'a time x: Float64 rings, not rows');
    });

    await ok('Column Chart: a time x line: a null is missing (never a 0): Connect runs across, Gap cuts the line, Bridge dashes the hole; the series can say its own', async () => {
        const T0 = 1727852400000, rows = [];
        for (let i = 0; i <= 20; i++) rows.push({ x: T0 + i * 1000, kw: i === 10 ? null : 40 });
        await mount('ch-gap', COL, { xType: 'time', markers: false, rows, xField: 'x', yField: 'kw', series: [{ id: 'kw', name: 'kW', type: 'line', width: 3 }] }, { width: 500, height: 260 });
        const info = () => js(`(function () { var w = ${cw('ch-gap')}, b = w._tser.get("kw").buf; return { count: b.count, breaks: Array.from(b.breaksKept()), zero: Array.from({ length: b.count }, function (_, i) { return b.getY(i); }).filter(function (v) { return v === 0; }).length }; })()`);
        assert.deepStrictEqual(await info(), { count: 20, breaks: [T0 + 10000], zero: 0 }, 'the null is no point, and no 0');
        const hole = () => js(`(function () { var w = ${cw('ch-gap')}; w.draw(); var g = w._geo, d = w._lastDpr || 1, ctx = w.canvas.getContext("2d");
            var x0 = Math.round((g.plotX + g.cpos(${T0 + 9300})) * d), x1 = Math.round((g.plotX + g.cpos(${T0 + 10700})) * d), y0 = Math.round(g.plotY * d), h = Math.round(g.plotH * d);
            var data = ctx.getImageData(x0, y0, x1 - x0, h).data, n = 0; for (var i = 3; i < data.length; i += 4) if (data[i]) n++;
            var x2 = Math.round((g.plotX + g.cpos(${T0 + 2000})) * d), side = ctx.getImageData(x2, y0, x1 - x0, h).data, m = 0; for (var j = 3; j < side.length; j += 4) if (side[j]) m++;
            return { hole: n, side: m }; })()`);
        const connect = await hole();
        await js(`NexaTest.setProps("ch-gap", { missing: "gap" })`); await settle();
        const gap = await hole();
        await js(`NexaTest.setProps("ch-gap", { missing: "bridge" })`); await settle();
        const bridge = await hole();
        assert.ok(connect.hole > gap.hole + 20 && gap.side > 20, 'Connect paints the hole, Gap does not ' + JSON.stringify([connect, gap]));
        assert.ok(bridge.hole > gap.hole && bridge.hole < connect.hole, 'Bridge: a dashed line only ' + JSON.stringify([gap, bridge, connect]));
        // a series that says Connect connects, whatever the chart says; a series saved with a gapAfter (no setting) still cuts
        await js(`NexaTest.setProps("ch-gap", { missing: "gap", series: [{ id: "kw", name: "kW", type: "line", width: 3, missing: "connect" }] })`); await settle();
        assert.ok((await hole()).hole >= connect.hole - 5, 'the series connects');
        await js(`NexaTest.setProps("ch-gap", { missing: "connect", series: [{ id: "kw", name: "kW", type: "line", width: 3, gapAfter: 500 }] })`); await settle();
        assert.ok((await hole()).hole <= gap.hole + 5, 'a series saved with a gapAfter keeps cutting (every point is 1 s from the next)');
    });

    await ok('Column Chart: stacked piles, 100 % (the axis ends at 100), side by side; the tooltip lists every series at that category with the total of the stack; a single-series tooltip', async () => {
        await mount('ch5', COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor', stacking: 'stacked' }, { width: 500, height: 280 });
        await pointAt('ch5', 'pointermove', 0, 0.4); await settle();
        const tip = await js(`(function () { var t = ${cw('ch5')}.renderRoot.querySelector(".tooltip"); return { shown: t.style.display, text: t.textContent }; })()`);
        assert.strictEqual(tip.shown, 'block');
        assert.ok(/08:00/.test(tip.text) && /F1/.test(tip.text) && /F2/.test(tip.text) && /F3/.test(tip.text) && /Total45/.test(tip.text.replace(/\s/g, '')), tip.text);
        await pointer('ch5', 'pointerleave', 0.2, 0.4);
        assert.strictEqual(await js(`${cw('ch5')}.renderRoot.querySelector(".tooltip").style.display`), 'none');
        const hi = await js(`${cw('ch5')}._geo.axes.get("y").hi`);
        assert.ok(hi >= 45, 'the stack total sets the axis: ' + hi);
        await mount('ch5p', COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor', stacking: 'percent' }, { width: 500, height: 280 });
        assert.strictEqual(await js(`${cw('ch5p')}._geo.axes.get("y").hi`), 100);
        await mount('ch5s', COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor', stacking: 'stacked', tooltipShows: 'single' }, { width: 500, height: 280 });
        await pointAt('ch5s', 'pointermove', 0, 0.95); await settle();
        assert.strictEqual(await js(`${cw('ch5s')}.renderRoot.querySelectorAll(".tooltip-row").length`), 1, 'one series under the cursor');
        await mount('ch5n', COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor' }, { width: 500, height: 280 });
        assert.deepStrictEqual(await js(`(function () { var g = ${cw('ch5n')}._geo; return ["F1", "F2", "F3"].map(function (k) { return g.place.get(k); }); })()`), [0, 1, 2], 'Stack off: side by side, a place each');
    });

    await ok('Column Chart: a series is a column, a line or a target; in the stack or not (a column out of it stands beside the pile, a line in it sits at the total so far); the right axis', async () => {
        const rows = energyRows();
        await mount('cb1', COL, { rows, xField: 'hour', yField: 'kwh', splitField: 'floor', stacking: 'stacked',
            series: [{ id: 'F1', name: 'F1' }, { id: 'F2', name: 'F2', type: 'line' }, { id: 'F3', name: 'F3', stack: false }] }, { width: 500, height: 280 });
        const r = await js(`(function () { var w = ${cw('cb1')}; w.draw(); var g = w._geo; return { places: ["F1", "F3"].map(function (k) { return g.place.get(k); }), line: Array.from(g.lines.get("F2").y), f1: Array.from(g.stackOf.get("F1").hi) }; })()`);
        assert.deepStrictEqual(r.places, [0, 1], 'F1 in the stack (place 0), F3 out of it beside the pile (place 1)');
        assert.deepStrictEqual(r.f1, [10, 11, 12, 13]);
        assert.deepStrictEqual(r.line, [25, 27, 29, 31], 'the line in the stack: F1 + F2, the total so far');
        await mount('cb2', COL, { rows, xField: 'hour', yField: 'kwh', splitField: 'floor', stacking: 'stacked',
            series: [{ id: 'F3', name: 'F3', type: 'line', stack: false, axis: 'right' }, { id: 'F2', name: 'Plan', type: 'target' }] }, { width: 500, height: 280 });
        const t = await js(`(function () { var w = ${cw('cb2')}; w.draw(); var g = w._geo; return { line: Array.from(g.lines.get("F3").y), axis: g.axisOf.get("F3"), right: g.axes.has("y2"), targetStacked: g.stackOf.has("F2"), hi: g.axes.get("y").hi }; })()`);
        assert.deepStrictEqual(t.line, [20, 21, 22, 23], 'a line out of the stack: its own value');
        assert.strictEqual(t.axis, 'y2');
        assert.strictEqual(t.right, true);
        assert.strictEqual(t.targetStacked, false, 'a target never stacks');
        assert.ok(t.hi >= 18, 'the target is on the axis');
        await pointAt('cb2', 'pointermove', 1, 0.5); await settle();
        assert.ok(/Plan \(target\)/.test(await js(`${cw('cb2')}.renderRoot.querySelector(".tooltip").textContent`)), 'the tooltip says it is a target');
        assert.ok(await painted('cb2') > 4000);
    });

    await ok('Column Chart: a colour is a hex OR a theme token; thresholds in the theme\'s status colours; a limit colours the columns past it', async () => {
        await mount('ch6', COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor',
            series: [{ id: 'F1', name: 'F1', color: '{token:colors.red.solid}' }, { id: 'F2', name: 'F2', color: '#123456' }],
            thresholds: [{ kind: 'upper', value: 20, colorColumns: true, label: 'Max' }, { kind: 'band', value: 5, to: 8 }, { kind: 'line', value: 15 }] }, { width: 400, height: 240 });
        const c = await js(`(function () { var w = ${cw('ch6')}, l = w.seriesList(), th = w._thresholds(); return { c: l.map(function (s) { return w.colorOf(s); }), p2: w.seriesColor(2), th: th.map(function (t) { return t.color; }), st: [w.statusColor("error"), w.statusColor("warning"), w.statusColor("info")],
            past: w._columnColor("y", 21, "#000000", th), under: w._columnColor("y", 19, "#000000", th) }; })()`);
        assert.strictEqual(c.c[0], await js(`${cw('ch6')}._tok("{token:colors.red.solid}")`), 'the token, in the current mode');
        assert.strictEqual(c.c[1], '#123456', 'a hex as it is');
        assert.strictEqual(c.c[2], c.p2, 'the third: the palette');
        assert.deepStrictEqual(c.th, c.st, 'limit: error, band: warning, line: info');
        assert.deepStrictEqual([c.past, c.under], [c.st[0], '#000000'], 'past the limit: its colour');
    });

    await ok('Column Chart: horizontal bars, data labels (value / % / both), the total above a stack, a gradient fill; each draws', async () => {
        await mount('ch7h', COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor', stacking: 'stacked', orientation: 'horizontal', labels: true, labelShow: 'both' }, { width: 500, height: 280 });
        assert.strictEqual(await js(`${cw('ch7h')}._geo.horizontal`), true);
        assert.ok(await painted('ch7h') > 3000);
        await mount('ch7t', COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor', stacking: 'stacked', columnFill: 'gradient' }, { width: 500, height: 280 });
        await mount('ch7n', COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor', stacking: 'stacked', labelTotal: false }, { width: 500, height: 280 });
        const top = await js(`[${cw('ch7t')}._geo.plotY, ${cw('ch7n')}._geo.plotY]`);
        assert.ok(top[0] > top[1], 'room above the stacks for their totals: ' + top);
        assert.ok(await painted('ch7t') > 3000);
    });

    await ok('Column Chart: categories by value, the top N and the rest as Others', async () => {
        const rows = [{ c: 'A', v: 5 }, { c: 'B', v: 40 }, { c: 'C', v: 12 }, { c: 'D', v: 30 }, { c: 'E', v: 1 }];
        await mount('cs1', COL, { rows, xField: 'c', yField: 'v', categoryOrder: 'value-desc', topN: 2 }, { width: 400, height: 220 });
        const r = await js(`(function () { var a = ${cw('cs1')}._align(); return { cats: a.cats, v: Array.from(a.cols.get("v")) }; })()`);
        assert.deepStrictEqual(r, { cats: ['B', 'D', 'Others'], v: [40, 30, 18] });
        await js(`NexaTest.setProps("cs1", { others: false, categoryOrder: "data" })`); await settle();
        assert.deepStrictEqual(await js(`${cw('cs1')}._align().cats`), ['B', 'D'], 'the top 2 in the order they came');
    });

    await ok('Column Chart: the legend part (a value, a table of Total / Avg / Max…, positions); a toggle hides a series and fires On Series Toggle', async () => {
        await mount('ch8', COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor', legendValue: 'sum' }, { width: 500, height: 260 });
        assert.deepStrictEqual(await js(`Array.from(${cw('ch8')}.renderRoot.querySelectorAll(".lg-val")).map(function (e) { return e.textContent; })`), ['46', '66', '86']);
        await js(`${cw('ch8')}.renderRoot.querySelector(".lg-item").click()`); await settle();
        assert.strictEqual(await js(`${cw('ch8')}._visible().length`), 2);
        await mount('ch8t', COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor', legend: 'right', legendMode: 'table', legendMin: false, legendLast: false }, { width: 600, height: 260 });
        assert.deepStrictEqual(await js(`Array.from(${cw('ch8t')}.renderRoot.querySelectorAll(".lg-table th")).map(function (e) { return e.textContent.trim(); })`), ['Series', 'Total', 'Avg', 'Max']);
        for (const at of ['top', 'left', 'inside-tr', 'none']) {
            await mount('ch8' + at, COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor', legend: at }, { width: 500, height: 260 });
            const cls = await js(`(function () { var l = ${cw('ch8' + at)}.renderRoot.querySelector(".legend"); return l ? l.className : null; })()`);
            assert.strictEqual(cls !== null, at !== 'none', at);
            if (at === 'left') assert.ok(cls.split(' ').indexOf('v') !== -1, 'vertical: ' + cls);
            if (at === 'inside-tr') assert.ok(/inside tr/.test(cls), cls);
        }
    });

    await ok('Column Chart: export CSV / Excel of what it shows; the editor draws sample data when it is empty', async () => {
        await mount('ch9', COL, { rows: energyRows(), xField: 'hour', yField: 'kwh', splitField: 'floor', title: 'E' }, { width: 400, height: 220 });
        const n = await js(`${cw('ch9')}.exportData({ format: "csv" })`);
        assert.strictEqual(n, 4);
        const csv = await js(`${cw('ch9')}._lastExport.blob.text()`);
        assert.ok(csv.indexOf('"hour","F1","F2","F3"') <= 1, csv.slice(0, 40));
        assert.ok(/"08:00",10,15,20/.test(csv), csv);
        assert.strictEqual(await js(`${cw('ch9')}.exportData({ format: "xlsx" })`), 4);
        assert.ok(/\.xlsx$/.test(await js(`${cw('ch9')}._lastExport.name`)));
        await mount('ch10', COL, {}, { width: 400, height: 220, design: true });
        await js('new Promise(function (r) { setTimeout(r, 200); })');
        assert.ok(await painted('ch10') > 2000, 'sample data in the editor');
        assert.deepStrictEqual(await js(`${cw('ch10')}.seriesList().map(function (s) { return s.name; })`), ['Lighting', 'HVAC']);
        // the sample is not data: a series added in the editor draws ITS sample (the examples go), real data drops it for good
        await js(`NexaTest.setProps("ch10", { series: [{ id: "s1", name: "Load" }] })`); await settle();
        assert.deepStrictEqual(await js(`${cw('ch10')}.seriesList().map(function (s) { return s.name; })`), ['Load'], 'adding a series: no Lighting / HVAC beside it');
        assert.ok(await painted('ch10') > 2000, 'the new series has its sample');
        await js(`NexaTest.setProps("ch10", { series: [{ id: "s1", name: "Load" }, { id: "s2", name: "Spare" }] })`); await settle();
        assert.deepStrictEqual(await js(`${cw('ch10')}.seriesList().map(function (s) { return s.name; })`), ['Load', 'Spare']);
        await js(`NexaTest.invoke("ch10", "setRows", [{ x: "A", y: 3 }])`); await settle();
        assert.deepStrictEqual(await js(`(function () { var w = ${cw('ch10')}; return { cats: w._frame.cats, names: w.seriesList().map(function (s) { return s.name; }), demo: w._demoSig }; })()`),
            { cats: ['A'], names: ['Load', 'Spare', 'y'], demo: '' }, 'real rows: the sample is gone (the listed series stay, empty)');
    });

    await ok('Column Chart: a TIME x keeps every point in Float64 rings (600 000), draws a frame fast, the time ruler, range buttons, zoom, Live, a tooltip; columns grouped to the width of the screen; a line in the stack', async () => {
        const T0 = 1727852400000, N = 200000;
        const made = await js(`(function () { var rows = []; for (var i = 0; i < ${N}; i++) { ["A", "B", "C"].forEach(function (k, j) { rows.push({ t: ${T0} + i * 1000, host: k, v: 40 + j * 10 + 15 * Math.sin(i / 3000 + j) + 4 * Math.sin(i / 30) }); }); } window.__big = rows; return rows.length; })()`);
        assert.strictEqual(made, 3 * N);
        await js(`NexaTest.mount("tm1", "${P}${COL}", { rows: window.__big, xField: "t", yField: "v", splitField: "host", type: "line", legendValue: "last", rangeBar: true }, { width: 600, height: 300 }); 1`);
        await settle();
        const r = await js(`(function () { var w = ${cw('tm1')}; w.draw(); var t = performance.now(); for (var i = 0; i < 5; i++) w.draw(); var ms = (performance.now() - t) / 5;
            return { xt: w._xt, counts: Array.from(w._tser.values()).map(function (x) { return x.buf.count; }), ms: ms, ruler: !!w._scale && w._scale.m.rulerH > 0, f64: w._tser.get("A").buf.y instanceof Float64Array, legend: Array.from(w.renderRoot.querySelectorAll(".lg-val")).map(function (e) { return e.textContent; }), bar: !!w.renderRoot.querySelector(".range-bar") }; })()`);
        assert.strictEqual(r.xt, 'time');
        assert.deepStrictEqual(r.counts, [N, N, N]);
        assert.strictEqual(r.f64, true);
        assert.ok(r.ruler, 'the time ruler');
        assert.ok(r.bar, 'the range buttons');
        assert.ok(r.ms < 80, 'a frame of 600 000 points: ' + r.ms.toFixed(1) + ' ms');
        assert.strictEqual(r.legend.length, 3);
        assert.ok(await painted('tm1') > 8000);
        await js(`NexaTest.invoke("tm1", "setRange", { from: ${T0 + 5000000}, to: ${T0 + 6000000} })`); await settle();
        const z = await js(`(function () { var w = ${cw('tm1')}; return { range: [w._scale.vMinX, w._scale.vMaxX], zoomed: !!w.viewRange }; })()`);
        assert.deepStrictEqual(z.range, [T0 + 5000000, T0 + 6000000]);
        assert.strictEqual(z.zoomed, true);
        await js(`NexaTest.invoke("tm1", "followLive")`); await settle();
        assert.strictEqual(await js(`!!${cw('tm1')}.viewRange`), false);
        await pointer('tm1', 'pointermove', 0.5, 0.4); await settle();
        const tip = await js(`(function () { var t = ${cw('tm1')}.renderRoot.querySelector(".tooltip"); return { shown: t.style.display, text: t.textContent }; })()`);
        assert.strictEqual(tip.shown, 'block');
        assert.ok(/A/.test(tip.text) && /B/.test(tip.text) && /C/.test(tip.text), tip.text);
        await js(`NexaTest.mount("tm2", "${P}${COL}", { rows: window.__big.filter(function (r) { return r.t < ${T0 + 3600000 * 6}; }), xField: "t", yField: "v", splitField: "host", stacking: "stacked", series: [{ id: "C", name: "C", type: "line" }] }, { width: 600, height: 280 }); 1`);
        await settle();
        const c2 = await js(`(function () { var w = ${cw('tm2')}; w.draw(); var g = w._geo, k = 5; return { n: g.n, stacked: g.stackOf.size, top: g.lines.get("C").y[k], sum: g.stackOf.get("C").hi[k] }; })()`);
        assert.ok(c2.n > 20 && c2.n <= 100 && c2.stacked === 3, JSON.stringify(c2));
        assert.strictEqual(c2.top, c2.sum, 'the line in the stack: at the cumulative top');
        await js('delete window.__big; 1');
    });

    await ok('Sample data (Line, State Timeline, Column, KPI, Gauge, Bar Gauge, Pie, Scatter, SPC, Radar): only in the editor, for the user series, marked "Sample data"; on a page with no data the chart is empty; real data drops it', async () => {
        const kinds = [['line-chart', { series: [{ id: 's1', name: 'Speed' }] }, 'appendPoints', [{ x: 1727852400000, y: 3 }], { list: 'series', id: 's1' }],
            ['state-timeline', { rows: [{ id: 'r1', name: 'Filler' }] }, 'appendChange', { time: 1727852400000, state: 1 }, { list: 'rows', id: 'r1' }],
            ['column-chart', { series: [{ id: 's1', name: 'Load' }, { id: 's2', name: 'Temp', type: 'line' }] }, 'setData', { A: 3 }, { list: 'series', id: 's1' }],
            ['kpi', { tiles: [{ id: 'k1', name: 'Load' }] }, 'setValue', 21.5, { list: 'tiles', id: 'k1' }],
            ['gauge', { gauges: [{ id: 'g1', name: 'Load' }] }, 'setValue', 21.5, { list: 'gauges', id: 'g1' }],
            ['bar-gauge', { bars: [{ id: 'b1', name: 'Load' }] }, 'setValue', 21.5, { list: 'bars', id: 'b1' }],
            ['pie', { slices: [{ id: 's1', name: 'Load' }] }, 'setValue', 21.5, { list: 'slices', id: 's1' }],
            ['scatter', {}, 'setRows', [{ x: 1, y: 2 }], null],
            ['radar', {}, 'setRows', [{ series: 'A', x: 1, y: 2, z: 3 }], null],
            ['spc', {}, 'setRows', [{ time: 1727852400000, value: 2 }, { time: 1727852460000, value: 3 }], null]];
        for (const [id, props, action, payload, target] of kinds) {
            await mount('sd-ed-' + id, id, props, { width: 500, height: 220, design: true });
            await js('new Promise(function (r) { setTimeout(r, 150); })');
            const ed = await js(`(function () { var w = NexaTest.wc("sd-ed-${id}"); return { badge: !!w.renderRoot.querySelector(".sample-badge"), legend: Array.from(w.renderRoot.querySelectorAll(".lg-name")).map(function (e) { return e.textContent; }) }; })()`);
            assert.strictEqual(ed.badge, true, id + ': the editor marks its sample');
            if (id === 'column-chart') assert.deepStrictEqual(ed.legend, ['Load', 'Temp'], 'the sample is drawn for the user series: no Lighting / HVAC beside them');
            assert.ok(await painted('sd-ed-' + id) > 1500, id + ': the sample is drawn in the editor');
            await js(`NexaTest.wc("sd-ed-${id}")[${JSON.stringify(action)}](${JSON.stringify(payload)}, ${JSON.stringify(target)}); 1`); await settle();
            assert.strictEqual(await js(`!!NexaTest.wc("sd-ed-${id}").renderRoot.querySelector(".sample-badge")`), false, id + ': real data drops the sample');
            await mount('sd-pg-' + id, id, props, { width: 500, height: 220 });
            await js('new Promise(function (r) { setTimeout(r, 150); })');
            const pg = await js(`(function () { var w = NexaTest.wc("sd-pg-${id}"); w.draw(); return { badge: !!w.renderRoot.querySelector(".sample-badge"), data: w._hasData() }; })()`);
            assert.deepStrictEqual(pg, { badge: false, data: false }, id + ': a page with no data is empty');
        }
    });

    await ok('Column Chart: the inspector is a Power BI style format pane: its cards in order, series as a list of items', async () => {
        const r = await js(`(function () { var m = NEXA.getComponent("${P}${COL}").nexa; var seen = []; Object.keys(m.props).forEach(function (k) { var g = m.props[k].group; if (g && seen.indexOf(g) === -1) seen.push(g); }); return { groups: seen, order: m.groupOrder, targets: m.targetList.map(function (t) { return [t.key, t.actionList.map(function (a) { return a.name; })]; }), label: m.label }; })()`);
        assert.deepStrictEqual(r.order.slice(0, 7), ['Data', 'Series', 'Columns', 'Lines', 'Y axis', 'Secondary Y axis', 'X axis']);
        ['Time axis', 'Title', 'Legend', 'Data labels', 'Tooltip', 'Thresholds', 'Zoom & pan', 'Annotations', 'General', 'Export'].forEach((g) => assert.ok(r.groups.indexOf(g) !== -1, g));
        assert.deepStrictEqual(r.targets, [['series', ['setData', 'setPoint', 'appendPoint', 'clear', 'show', 'hide']]]);
        assert.strictEqual(r.label, 'Column / Bar Chart');
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
