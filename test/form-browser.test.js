'use strict';

// The Form component in a REAL browser (headless Chrome) through the Nexa SDK testkit: controls with a "Name in the form" join the form around them (text fields,
// a number, a password, a checkbox, a select), what is typed is checked at once (required, a pattern, a rule in JavaScript, the number's own limit), errors show
// when the form says, the form writes values / valid / dirty / sending to its outputs, On Submit only when everything is valid, a Send button, Enter, and the
// actions Logic calls (Set errors, Done, Reset, Set values).
//   node test/form-browser.test.js        (skipped when Chrome is not installed)

const assert = require('assert');
const path = require('path');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');

let passed = 0;
const onlyAt = process.argv.indexOf('--only'), only = onlyAt !== -1 ? new RegExp(process.argv[onlyAt + 1] || '.', 'i') : null;
async function ok(label, fn) { if (only && !only.test(label)) return; await fn(); passed++; console.log('✔ ' + label); }

const P = 'nexa-ui-';
const OUT = (n) => '{sparkplug:Plant::Line1::Form::' + n + '}';

withHarness({
    mounts: { '/nexa-component-ui-library/vendor': path.join(__dirname, '..', 'dist') },
    modules: ['/nexa-component-ui-library/vendor/ui-library.js']
}, async ({ js, type, key, logs, send }) => {
    const settle = () => js('NexaTest.settle()');
    const wait = (ms) => js(`new Promise(function (r) { setTimeout(r, ${ms}); })`);
    const root = (name) => `NexaTest.wc(${JSON.stringify(name)}).renderRoot`;
    const q = (name, sel) => `${root(name)}.querySelector(${JSON.stringify(sel)})`;
    const mount = async (name, id, props, opts) => { await js(`NexaTest.mount(${JSON.stringify(name)}, ${JSON.stringify(P + id)}, ${JSON.stringify(props || {})}, ${JSON.stringify(opts || { width: 300, height: 64 })})`); await settle(); };
    const events = (name, kind) => js(`NexaTest.item(${JSON.stringify(name)}).events.filter(function (e) { return e[0] === ${JSON.stringify(kind)}; }).map(function (e) { return e[1]; })`);
    const written = (name, outKey) => js(`(function () { var w = NexaTest.item(${JSON.stringify(name)}).writes.filter(function (x) { return x[0] === ${JSON.stringify(outKey)}; }); return w.length ? w[w.length - 1][1] : "never written"; })()`);
    const clickAt = async (sel) => {
        const r = await js(`(function () { var e = ${sel}; e.scrollIntoView({ block: "center" }); var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
        await settle();
    };
    // the text of a control's error line, '' when none
    const errorOf = (name) => js(`(function () { var h = ${root(name)}.querySelector(".helper.error"); return h ? h.textContent.trim() : ""; })()`);
    // type into a text field: focus, select what is there, type
    const typeInto = async (name, text) => {
        await js(`(function () { var i = ${q(name, 'input')}; i.focus(); i.select(); return 1; })()`);
        if (text === '') await key('Backspace'); else await type(text);
        await settle();
    };

    // the form with its fields in its slot, as the page puts them: the slot frame is a light-DOM child of the form's element
    const build = async (formProps, formName, frameId) => {
        const n = formName || 'frm';
        await mount(n, 'form', Object.assign({ changeDelay: 0, outputValues: OUT('values'), outputErrors: OUT('errors'), outputValid: OUT('valid'), outputDirty: OUT('dirty'), outputSubmitting: OUT('sending') }, formProps || {}), { width: 420, height: 420 });
        await js(`(function () { var wc = NexaTest.wc(${JSON.stringify(n)}); var f = document.createElement("div"); f.slot = "content"; f.id = ${JSON.stringify(frameId || 'frame')}; f.style.cssText = "display:flex;flex-direction:column;gap:6px;padding:8px"; wc.appendChild(f); return 1; })()`);
    };
    const into = async (name, frameId) => { await js(`(function () { document.getElementById(${JSON.stringify(frameId || 'frame')}).appendChild(NexaTest.item(${JSON.stringify(name)}).el); return 1; })()`); await settle(); await wait(30); await settle(); };

    await ok('Form: fields join by name; the form writes values / valid / dirty to its outputs, and errors appear as the user types', async () => {
        await build({ validateOn: 'change' });
        await mount('f-email', 'input', { formName: 'email', required: true, label: 'Email', pattern: '^[^@ ]+@[^@ ]+$', patternMessage: 'Not an email' });
        await mount('f-pw', 'password-input', { formName: 'password', label: 'Password', ruleCode: "return value.length >= 8 || 'At least 8 characters'" });
        await mount('f-age', 'number-input', { formName: 'age', label: 'Age', min: 18 });
        await mount('f-agree', 'checkbox', { formName: 'agree', required: true, text: 'I agree' }, { width: 200, height: 32 });
        for (const n of ['f-email', 'f-pw', 'f-age', 'f-agree']) await into(n);
        assert.deepStrictEqual(await written('frm', 'outputValid'), false, 'the empty required fields: not valid, from the start');
        assert.deepStrictEqual(await errorOf('f-email'), '', 'but nothing is shown before the user touches a field');
        assert.deepStrictEqual(await written('frm', 'outputValues'), { email: '', password: '', age: null, agree: false });
        assert.deepStrictEqual(await written('frm', 'outputDirty'), false);

        await typeInto('f-email', 'ann');
        assert.strictEqual(await errorOf('f-email'), 'Not an email', 'the pattern is checked while typing');
        await typeInto('f-email', 'ann@x.co');
        assert.strictEqual(await errorOf('f-email'), '');
        assert.deepStrictEqual((await written('frm', 'outputValues')).email, 'ann@x.co');
        assert.strictEqual(await written('frm', 'outputDirty'), true);

        await typeInto('f-pw', 'short');
        assert.strictEqual(await errorOf('f-pw'), 'At least 8 characters', 'a rule in JavaScript, as the password is typed');
        assert.strictEqual(await written('frm', 'outputValid'), false);
        await typeInto('f-pw', 'long-enough-1');
        assert.strictEqual(await errorOf('f-pw'), '');

        await typeInto('f-age', '12');
        assert.notStrictEqual(await errorOf('f-age'), '', 'the number\'s own limit (min 18) is the form\'s error too');
        assert.strictEqual(await written('frm', 'outputValid'), false);
        await typeInto('f-age', '30');
        assert.strictEqual(await errorOf('f-age'), '');
        assert.strictEqual((await written('frm', 'outputValues')).age, 30);

        assert.strictEqual(await written('frm', 'outputValid'), false, 'the checkbox is still off and required');
        await clickAt(q('f-agree', '.cb'));
        assert.strictEqual(await written('frm', 'outputValid'), true, 'every rule is met');
        assert.deepStrictEqual(await written('frm', 'outputValues'), { email: 'ann@x.co', password: 'long-enough-1', age: 30, agree: true });
        const ch = await events('frm', 'change');
        assert.ok(ch.length >= 4 && ch.some((e) => e.name === 'password' && e.value === 'long-enough-1'), 'On Change fired for the fields');
        assert.deepStrictEqual((await events('frm', 'validChange')).map((e) => e.valid), [true], 'On Valid Change: once, when it became valid');
    });

    await ok('Form: a form that STARTS empty starts invalid when a field has a shortest text or a pattern: the Send button that waits is off at the first render', async () => {
        await build({ validateOn: 'change' }, 'first', 'frame-first');
        await mount('fs-user', 'input', { formName: 'user', label: 'User', minLength: 3 }, { width: 300, height: 90 });
        await mount('fs-code', 'input', { formName: 'code', label: 'Code', pattern: '[0-9]+', patternMessage: 'Digits only' }, { width: 300, height: 90 });
        await mount('fs-qty', 'number-input', { formName: 'qty', label: 'Qty', min: 1 }, { width: 300, height: 90 });
        await mount('fs-send', 'button', { text: 'Send', formAction: 'submit', waitForValid: true }, { width: 120, height: 40 });
        for (const n of ['fs-user', 'fs-code', 'fs-qty', 'fs-send']) await into(n, 'frame-first');
        assert.strictEqual(await written('first', 'outputValid'), false, 'not valid at the first moment');
        assert.strictEqual(await js(`${q('fs-send', '.btn')}.disabled`), true, 'so the Send button is off');
        assert.strictEqual(await errorOf('fs-user'), '', 'and no error is shown before the user touches anything');
        await typeInto('fs-user', 'ab');
        assert.strictEqual(await errorOf('fs-user'), 'At least 3 characters');
        await typeInto('fs-user', 'abc'); await typeInto('fs-code', '12'); await typeInto('fs-qty', '2');
        assert.strictEqual(await js(`${q('fs-send', '.btn')}.disabled`), false, 'every rule met: the button is on');
        await typeInto('fs-code', '');
        assert.strictEqual(await js(`${q('fs-send', '.btn')}.disabled`), true, 'emptied again: the pattern is broken and the button is off');
    });

    await ok('A helper or an error line never squeezes the control: its box keeps its height when the message appears (an Input, a Number, a Select, a Date Time)', async () => {
        const heightOf = (n, sel) => js(`Math.round(${q(n, sel)}.getBoundingClientRect().height)`);
        const cases = [['sq-in', 'input', '.box', {}], ['sq-num', 'number-input', '.box', {}], ['sq-sel', 'select', '.box', { required: true }], ['sq-dt', 'datetime', '.box', {}]];
        for (const [n, id, sel, extra] of cases) {
            await mount(n, id, Object.assign({ label: 'Label', helperText: 'A helper', formName: n }, extra), { width: 300, height: 90 });
            const before = await heightOf(n, sel);
            await js(`NexaTest.setProps(${JSON.stringify(n)}, { invalid: true, errorText: "Something is wrong here" })`); await settle();
            assert.strictEqual(await heightOf(n, sel), before, n + ': the box is the same height with an error as with a helper');
            assert.ok(before >= 40, n + ': the box has its own size (' + before + ')');
            await js(`NexaTest.setProps(${JSON.stringify(n)}, { invalid: false, errorText: "", helperText: "" })`); await settle();
            assert.ok((await heightOf(n, sel)) >= 40, n + ': and without any line');
        }
        await mount('sq-small', 'input', { label: 'Label', helperText: 'A helper', formName: 'sq-small' }, { width: 300, height: 64 });
        assert.ok((await heightOf('sq-small', '.box')) >= 40, 'in a box as small as 64 px the control still has 40');
    });

    await ok('Form: Mark fields as being checked: the field says "Checking...", the form is not valid and the Send button waits, until Set errors or Clear errors ends it', async () => {
        await build({ validateOn: 'change' }, 'chk', 'frame-chk');
        await mount('ck-user', 'input', { formName: 'username', label: 'User name', helperText: 'Pick one' }, { width: 300, height: 90 });
        await mount('ck-send', 'button', { text: 'Send', formAction: 'submit', waitForValid: true }, { width: 120, height: 40 });
        for (const n of ['ck-user', 'ck-send']) await into(n, 'frame-chk');
        await typeInto('ck-user', 'ann');
        const helper = () => js(`(function () { var h = ${root('ck-user')}.querySelector(".helper"); return h ? h.textContent.trim() : ""; })()`);
        assert.strictEqual(await helper(), 'Pick one');
        assert.strictEqual(await js(`${q('ck-send', '.btn')}.disabled`), false);
        await js('NexaTest.wc("chk").setChecking("username")'); await settle();
        assert.strictEqual(await helper(), 'Checking…', 'the line says it is being checked');
        assert.strictEqual(await written('chk', 'outputValid'), false, 'the form is not valid');
        assert.strictEqual(await js(`${q('ck-send', '.btn')}.disabled`), true, 'so the Send button waits');
        await key('Enter'); await wait(60); await settle();
        assert.deepStrictEqual(await events('chk', 'submit'), [], 'Enter does not send it either');
        await js('NexaTest.wc("chk").clearErrors(["username"])'); await settle();
        assert.strictEqual(await helper(), 'Pick one', 'the check was fine: the helper is back');
        assert.strictEqual(await js(`${q('ck-send', '.btn')}.disabled`), false, 'and the button is on');
        await js('NexaTest.wc("chk").setChecking(["username"])'); await settle();
        await js('NexaTest.wc("chk").setErrors({ username: "Already used" })'); await settle();
        assert.strictEqual(await errorOf('ck-user'), 'Already used', 'the answer was no: the message replaces "Checking..."');
    });

    await ok('Date Time: a format with the name of the month is written as it says (the tokens are replaced in one pass, not one after another)', async () => {
        const text = async (n) => js(`${q(n, 'input')}.value`);
        await mount('fm1', 'datetime', { defaultValue: '2026-05-04T14:30:15.123Z', format: 'MMMM D, YYYY h:mm A' }, { width: 300, height: 64 });
        assert.strictEqual(await text('fm1'), 'May 4, 2026 2:30 PM');
        await mount('fm2', 'datetime', { defaultValue: '2026-05-04T14:30:15.123Z', format: 'D MMM YY, HH:mm:ss.SSS a' }, { width: 300, height: 64 });
        assert.strictEqual(await text('fm2'), '4 May 26, 14:30:15.123 pm');
        await mount('fm3', 'datetime', { defaultValue: '2026-05-04T14:30:15.123Z' }, { width: 300, height: 64 });
        assert.strictEqual(await text('fm3'), '2026-05-04 14:30:15', 'the default format is as it was');
    });

    await ok('Pin Input in a form: the value is the code only while it is complete; deleting a digit makes it empty again', async () => {
        await build({ validateOn: 'change' }, 'pin', 'frame-pin');
        await js(`(function () { if (!window.__origSlot) { window.__origSlot = NexaTest.slot; NexaTest.slot = function (o) { if (!window.__frame) return window.__origSlot(o); var el = document.createElement("div"); el.className = "nexa-test-slot"; if (o && o.width) el.style.width = o.width + "px"; if (o && o.height) el.style.height = o.height + "px"; document.getElementById(window.__frame).appendChild(el); return el; }; } window.__frame = "frame-pin"; return 1; })()`);
        await mount('pn', 'pin-input', { formName: 'pin', required: true, length: 4 }, { width: 300, height: 90 });
        await js('window.__frame = null; true');
        await js(`${q('pn', 'input.pin')}.focus()`);
        await type('1'); await type('2'); await type('3'); await settle(); await wait(40);
        assert.deepStrictEqual([(await written('pin', 'outputValues')).pin, await written('pin', 'outputValid')], ['', false], 'three of four: not a code yet');
        await type('4'); await settle(); await wait(40);
        assert.deepStrictEqual([(await written('pin', 'outputValues')).pin, await written('pin', 'outputValid')], ['1234', true], 'complete: the code');
        await key('Backspace'); await settle(); await wait(40);
        assert.deepStrictEqual([(await written('pin', 'outputValues')).pin, await written('pin', 'outputValid')], ['', false], 'a digit deleted: not a code again');
    });

    await ok('A control inside a frame inside the slot of the Form is still a field of that form (the form finds its fields by where they are, however deep)', async () => {
        await build({ validateOn: 'change' }, 'deep', 'frame-deep');
        await js(`(function () { var outer = document.getElementById("frame-deep"); var inner = document.createElement("div"); inner.id = "frame-deep-inner"; var inner2 = document.createElement("div"); inner2.id = "frame-deep-inner2"; inner.appendChild(inner2); outer.appendChild(inner); window.__frame = "frame-deep-inner2"; if (!window.__origSlot) { window.__origSlot = NexaTest.slot; NexaTest.slot = function (o) { if (!window.__frame) return window.__origSlot(o); var el = document.createElement("div"); el.className = "nexa-test-slot"; if (o && o.width) el.style.width = o.width + "px"; if (o && o.height) el.style.height = o.height + "px"; document.getElementById(window.__frame).appendChild(el); return el; }; } return 1; })()`);
        await mount('dp-user', 'input', { formName: 'user', label: 'User', required: true }, { width: 300, height: 90 });
        await js('window.__frame = null; true');
        await wait(40); await settle();
        const vals = await written('deep', 'outputValues');
        assert.deepStrictEqual(vals, { user: '' }, 'the field two frames down is in the form');
        assert.strictEqual(await written('deep', 'outputValid'), false, 'and its required rule counts');
    });

    await ok('Form: Enter sends it (On Submit with the values, sending on, a second Enter is ignored); Done ends it and the form is clean again', async () => {
        assert.deepStrictEqual(await events('frm', 'submit'), []);
        await js(`(function () { var i = ${q('f-email', 'input')}; i.focus(); return 1; })()`);
        await key('Enter'); await wait(50); await settle();
        const sub = await events('frm', 'submit');
        assert.deepStrictEqual(sub.map((e) => e.values), [{ email: 'ann@x.co', password: 'long-enough-1', age: 30, agree: true }]);
        assert.strictEqual(await written('frm', 'outputSubmitting'), true);
        await key('Enter'); await wait(50);
        assert.strictEqual((await events('frm', 'submit')).length, 1, 'while it is being sent, Enter does not send it again');
        await js('NexaTest.wc("frm").done()'); await settle();
        assert.strictEqual(await written('frm', 'outputSubmitting'), false);
        assert.strictEqual(await written('frm', 'outputDirty'), false, 'what was sent is where the form starts from now');
    });

    await ok('Form: Set errors puts the server\'s refusal on the field and ends the sending; editing that field clears it', async () => {
        await js('NexaTest.wc("frm").setErrors({ email: "Already registered" })'); await settle();
        assert.strictEqual(await errorOf('f-email'), 'Already registered');
        assert.strictEqual(await written('frm', 'outputValid'), false);
        assert.deepStrictEqual((await written('frm', 'outputErrors')).email, 'Already registered');
        await typeInto('f-email', 'bob@x.co');
        assert.strictEqual(await errorOf('f-email'), '');
        assert.strictEqual(await written('frm', 'outputValid'), true);
    });

    await ok('Form: Reset puts every field back where it started (the fields show it); Set values loads a record without calling it a change', async () => {
        // Done made what was sent the start: an empty start is set (a record "loaded" with nothing in it), then the user types, then Reset
        await js('NexaTest.wc("frm").setValues({ email: "", password: "", age: null, agree: false })'); await settle(); await wait(30); await settle();
        await typeInto('f-email', 'typed');
        assert.strictEqual(await written('frm', 'outputDirty'), true);
        await js('NexaTest.wc("frm").reset()'); await settle();
        assert.strictEqual(await js(`${q('f-email', 'input')}.value`), '', 'back to the start');
        assert.deepStrictEqual(await written('frm', 'outputValues'), { email: '', password: '', age: null, agree: false });
        assert.strictEqual(await written('frm', 'outputDirty'), false);
        await js('NexaTest.wc("frm").setValues({ email: "zed@x.co", age: 41, agree: true, nothere: 1 })'); await settle(); await wait(30); await settle();
        assert.strictEqual(await js(`${q('f-email', 'input')}.value`), 'zed@x.co');
        assert.strictEqual(await js(`${q('f-age', 'input')}.value`), '41');
        const vals = await written('frm', 'outputValues');
        assert.deepStrictEqual([vals.email, vals.age, vals.agree], ['zed@x.co', 41, true]);
        assert.strictEqual(await written('frm', 'outputDirty'), false, 'a loaded record is the start, not a change');
    });

    await ok('Form: a failed Submit shows every error and fires On Invalid Submit (not On Submit); validateOn "submit" shows nothing before it', async () => {
        await js('NexaTest.wc("frm").reset()'); await settle();
        await js('NexaTest.setProps("frm", { validateOn: "submit" })'); await settle();
        const before = (await events('frm', 'submit')).length;
        await typeInto('f-email', 'x'); await settle();
        assert.strictEqual(await errorOf('f-email'), '', 'validateOn "submit": no error while typing');
        await js('NexaTest.wc("frm").submit()'); await wait(50); await settle();
        assert.strictEqual(await errorOf('f-email'), 'Not an email', 'after the Submit failed, it is shown');
        assert.strictEqual((await events('frm', 'submit')).length, before, 'no On Submit');
        const inv = await events('frm', 'invalidSubmit');
        assert.ok(inv.length === 1 && inv[0].errors.email === 'Not an email' && inv[0].errors.password === 'At least 8 characters', JSON.stringify(inv));
        await typeInto('f-email', 'x@y.co');
        assert.strictEqual(await errorOf('f-email'), '', 'after a failed Submit, errors follow the typing');
    });

    await ok('Form: a Send button submits the form, waits while it is being sent, and can stay disabled until the form is valid; a Reset button resets', async () => {
        await js('NexaTest.wc("frm").reset()'); await settle();
        await mount('btn-send', 'button', { text: 'Send', formAction: 'submit', waitForValid: true }, { width: 120, height: 40 });
        await mount('btn-reset', 'button', { text: 'Clear', formAction: 'reset' }, { width: 120, height: 40 });
        await into('btn-send'); await into('btn-reset');
        assert.strictEqual(await js(`${q('btn-send', '.btn')}.disabled`), true, 'the form is not valid: the button waits');
        await js('NexaTest.wc("frm").setValues({ email: "a@b.co", password: "long-enough-1", age: 30, agree: true })'); await settle(); await wait(30); await settle();
        assert.strictEqual(await js(`${q('btn-send', '.btn')}.disabled`), false, 'valid: the button is on');
        const before = (await events('frm', 'submit')).length;
        await clickAt(q('btn-send', '.btn')); await wait(50); await settle();
        assert.strictEqual((await events('frm', 'submit')).length, before + 1, 'a click on it sends the form');
        assert.strictEqual(await js(`${q('btn-send', '.btn')}.getAttribute("aria-busy")`), 'true', 'it shows that the form is being sent');
        await js('NexaTest.wc("frm").done()'); await settle();
        assert.strictEqual(await js(`${q('btn-send', '.btn')}.getAttribute("aria-busy")`), 'false');
        await typeInto('f-email', 'zzz');
        await clickAt(q('btn-reset', '.btn')); await settle();
        assert.strictEqual(await js(`${q('f-email', 'input')}.value`), 'a@b.co', 'the Clear button put the form back to where it started (the record that was set)');
    });

    await ok('a control with no Name in the form, or outside any form, behaves as it always did (writes on Enter, no form around it)', async () => {
        await mount('solo', 'input', { label: 'Alone', inputValue: OUT('solo') }, { width: 260, height: 64 });
        await js(`(function () { var i = ${q('solo', 'input')}; i.focus(); i.select(); return 1; })()`);
        await type('hello'); await key('Enter'); await settle();
        assert.deepStrictEqual(await js('NexaTest.item("solo").writes'), [['inputValue', 'hello']]);
        await mount('unnamed', 'input', { label: 'No name' }, { width: 260, height: 64 });
        await into('unnamed');
        await typeInto('unnamed', 'x');
        const vals = await written('frm', 'outputValues');
        assert.ok(!('unnamed' in vals) && !('' in vals), 'a control without a name is not a field');
    });

    await ok('Form: every kind of control is a field: values by name, an error on a required one after a failed Send, Set values fills them all, Reset puts them back', async () => {
        await build({ validateOn: 'submit' }, 'all', 'frame-all');
        const O = { outputValues: OUT('all-values'), outputErrors: OUT('all-errors') };
        const F = {
            'a-check': ['checkbox', { formName: 'check', required: true, text: 'Agree' }],
            'a-switch': ['switch', { formName: 'power', text: 'Power' }],
            'a-radio': ['radio-group', { formName: 'mode', label: 'Mode', defaultValue: 'a' }],
            'a-seg': ['segmented', { formName: 'shift', defaultValue: 'b' }],
            'a-select': ['select', { formName: 'line', label: 'Line', required: true }],
            'a-combo': ['combobox', { formName: 'product', label: 'Product', defaultValue: 'c' }],
            'a-slider': ['slider', { formName: 'speed', label: 'Speed', defaultValue: 20 }],
            'a-tags': ['tags-input', { formName: 'tags', label: 'Tags', required: true, defaultValue: [] }],
            'a-pin': ['pin-input', { formName: 'pin', label: 'PIN', length: 4 }],
            'a-rating': ['rating', { formName: 'stars', defaultValue: 2 }],
            'a-date': ['datetime', { formName: 'when', label: 'When', required: true, timezoneMode: 'utc' }],
            'a-range': ['daterange', { formName: 'period', label: 'Period', required: true, timezoneMode: 'utc' }]
        };
        for (const n of Object.keys(F)) { await mount(n, F[n][0], F[n][1], { width: 320, height: 64 }); await into(n, 'frame-all'); }
        assert.ok(O);
        const vals = await written('all', 'outputValues');
        assert.deepStrictEqual(Object.keys(vals).sort(), ['check', 'line', 'mode', 'period', 'pin', 'power', 'product', 'shift', 'speed', 'stars', 'tags', 'when'], 'every control joined by its name');
        assert.deepStrictEqual([vals.mode, vals.shift, vals.product, vals.speed, vals.stars, vals.power, vals.check], ['a', 'b', 'c', 20, 2, false, false], 'each shows its own default as the start of the form');
        await js('NexaTest.wc("all").submit()'); await wait(80); await settle();
        const inv = await events('all', 'invalidSubmit');
        assert.deepStrictEqual(Object.keys(inv[0].errors).sort(), ['check', 'line', 'period', 'tags', 'when'], 'the required ones that are empty, and only those: ' + JSON.stringify(inv[0].errors));
        assert.strictEqual(await errorOf('a-check'), 'Must be checked', 'a checkbox shows it');
        assert.strictEqual(await errorOf('a-select'), 'Required', 'a select shows it');
        assert.strictEqual(await errorOf('a-tags'), 'Required', 'tags show it');
        assert.strictEqual(await errorOf('a-date'), 'Required', 'a date picker shows it');
        assert.strictEqual(await errorOf('a-range'), 'Required', 'a date range shows it');
        await js(`NexaTest.wc("all").setValues({ check: true, line: "a", tags: ["x", "y"], when: "2026-05-04T10:30:00.000Z", period: { start: "2026-05-01T00:00:00.000Z", end: "2026-05-31T23:59:59.999Z" }, mode: "b", speed: 55 })`);
        await settle(); await wait(60); await settle();
        const after = await written('all', 'outputValues');
        assert.deepStrictEqual([after.check, after.line, after.tags, after.when, after.mode, after.speed], [true, 'a', ['x', 'y'], '2026-05-04T10:30:00.000Z', 'b', 55]);
        assert.deepStrictEqual(after.period, { start: '2026-05-01T00:00:00.000Z', end: '2026-05-31T23:59:59.999Z' });
        assert.strictEqual(await errorOf('a-date'), '', 'filled: no error');
        assert.ok((await js(`${q('a-date', 'input')}.value`)).indexOf('2026-05-04') === 0, 'the date picker shows the date that was set');
        await js('NexaTest.wc("all").submit()'); await wait(80); await settle();
        assert.strictEqual((await events('all', 'submit')).length, 1, 'now valid: On Submit');
        await js('NexaTest.wc("all").done({ reset: true })'); await settle(); await wait(60); await settle();
        const reset = await written('all', 'outputValues');
        assert.deepStrictEqual([reset.check, reset.line, reset.when, reset.mode, reset.speed], [true, 'a', '2026-05-04T10:30:00.000Z', 'b', 55], 'Done with reset: back to where the form started, which is the record that was loaded');
        assert.deepStrictEqual(reset.period, { start: '2026-05-01T00:00:00.000Z', end: '2026-05-31T23:59:59.999Z' });
    });

    await ok('no JavaScript errors or warnings', async () => {
        assert.deepStrictEqual(logs.filter((l) => !/dev mode/.test(l)), []);
    });

    console.log(`\n${passed} passed\nALL OK`);
});
