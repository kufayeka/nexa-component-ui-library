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
    const build = async (formProps) => {
        await mount('frm', 'form', Object.assign({ changeDelay: 0, outputValues: OUT('values'), outputErrors: OUT('errors'), outputValid: OUT('valid'), outputDirty: OUT('dirty'), outputSubmitting: OUT('sending') }, formProps || {}), { width: 420, height: 420 });
        await js(`(function () { var wc = NexaTest.wc("frm"); var f = document.createElement("div"); f.slot = "content"; f.id = "frame"; f.style.cssText = "display:flex;flex-direction:column;gap:6px;padding:8px"; wc.appendChild(f); return 1; })()`);
    };
    const into = async (name) => { await js(`(function () { document.getElementById("frame").appendChild(NexaTest.item(${JSON.stringify(name)}).el); return 1; })()`); await settle(); await wait(30); await settle(); };

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

    await ok('no JavaScript errors or warnings', async () => {
        assert.deepStrictEqual(logs.filter((l) => !/dev mode/.test(l)), []);
    });

    console.log(`\n${passed} passed\nALL OK`);
});
