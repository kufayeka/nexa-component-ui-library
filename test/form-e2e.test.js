'use strict';
// The Form end to end, the way the user wires it: a LIVE page of an isolated Node-RED (its own userDir in the temp folder, never the user's data/). Fields with a
// "Name in the form", a Send button, and Logic with wires:
//   On Submit -> Function (it "calls the server", 900 ms) -> Update Form: Sending is over     (the form shows it is being sent, then clean again)
//   On Change -> Function (a server check: the order "TAKEN" exists) -> Update Form: Set errors   (the refusal appears on the field)
// The form writes valid / changed / sending into screen variables; a Text reads them.
//   node test/form-e2e.test.js      (needs Chrome, the dashboard built, ports 1899 / 1898 free)
//   SHOTS_DIR=some/folder node test/form-e2e.test.js    also saves a screenshot
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const D = path.dirname(require.resolve('@kufayeka/node-red-nexa-dashboard/package.json'));
const { withPage } = require(path.join(D, 'sdk/testkit/cdp.js'));
const RED_JS = path.resolve(__dirname, '../../../node-red/red.js');
const PORTS = { editor: 1899, pages: 1898 };
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-ui-form-e2e-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, passed = 0;
const check = (label, ok, actual) => { if (!ok) failures++; else passed++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '   actual: ' + JSON.stringify(actual))); };

const field = (id, type, w, h, props) => ({ id, type: 'nexa-ui-' + type, x: 0, y: 0, w, h, props });
const FORM = {
    id: 'FORM', type: 'nexa-ui-form', x: 20, y: 20, w: 420, h: 440, slots: true,
    props: { validateOn: 'change', changeDelay: 100, errorSummary: true, outputValid: '{formValid}', outputDirty: '{formDirty}', outputSubmitting: '{formSending}' },
    children: [{
        id: 'FF', type: '@frame', inSlot: 'content', slotLabel: 'Fields', x: 0, y: 0, w: 420, h: 440, style: {},
        layout: { mode: 'vertical', padding: { t: 12, r: 12, b: 12, l: 12 }, gap: 10 },
        children: [
            field('po', 'input', 300, 64, { formName: 'po', label: 'Order number', required: true, helperText: 'Like PO-123' }),
            field('pw', 'password-input', 300, 64, { formName: 'password', label: 'Password', ruleCode: "return value.length >= 8 || 'At least 8 characters'" }),
            field('qty', 'number-input', 200, 64, { formName: 'qty', label: 'Quantity', min: 1, defaultValue: 1 }),
            field('agree', 'checkbox', 240, 32, { formName: 'agree', text: 'I checked the order', required: true }),
            field('send', 'button', 140, 40, { text: 'Send', formAction: 'submit', waitForValid: true })
        ]
    }]
};
const STATE = field('state', 'text', 400, 44, { text: 'valid={formValid} changed={formDirty} sending={formSending}' });
STATE.x = 480; STATE.y = 20;
// a button outside the form that is on only while the form has changed (Disabled bound to an expression over the form's "changed" output)
const SAVE2 = field('save2', 'button', 140, 40, { text: 'Save changes', disabled: { $bind: [{ src: 'expr', ref: '!{formDirty}' }], static: true } });
SAVE2.x = 480; SAVE2.y = 80;
// what the Send wrote into a variable from On Submit (a Function writing a screen variable)
const LAST = field('last', 'text', 400, 44, { text: 'last={lastPo}' });
LAST.x = 480; LAST.y = 140;

const LOGIC = {
    nodes: [
        { id: 'e1', type: 'ui-event', compId: 'FORM', event: 'submit' },
        { id: 'f1', type: 'function', code: 'window.__submitted = msg.payload; vars.screen.set("lastPo", msg.payload.values.po); return new Promise(function (resolve) { setTimeout(function () { resolve(msg); }, 900); });' },
        { id: 'u1', type: 'ui-update', compId: 'FORM', action: 'done', config: {} },
        { id: 'e2', type: 'ui-event', compId: 'FORM', event: 'change' },
        { id: 'f2', type: 'function', code: "var p = msg.payload; if (p.name === 'po' && p.value === 'TAKEN') { msg.payload = { po: 'Already used' }; return msg; } return null;" },
        { id: 'u2', type: 'ui-update', compId: 'FORM', action: 'setErrors', config: {} }
    ],
    wires: [{ id: 'w1', from: 'e1', to: 'f1' }, { id: 'w2', from: 'f1', to: 'u1' }, { id: 'w3', from: 'e2', to: 'f2' }, { id: 'w4', from: 'f2', to: 'u2' }]
};

function writeFlows() {
    const dir = path.join(S, 'nr-form');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'settings.js'), 'module.exports = { uiPort: ' + PORTS.editor + ', flowFile: "flows.json", nexaDashboard: { screenWorkerPort: ' + PORTS.pages + ' }, logging: { console: { level: "warn" } }, editorTheme: { tours: false, projects: { enabled: false } } };\n');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'nr-form', version: '0.0.1', private: true }));
    const project = { id: 'formproj', type: 'kufayeka-nexa-project', name: 'Form', sparkplugConnection: '',
        screens: [{ id: 'sF', name: 'Form', path: '/form', width: 940, height: 520, gridSize: 10, snap: false, treeVersion: 1, orphans: [], components: [FORM, STATE, SAVE2, LAST], logic: LOGIC,
            variables: [{ id: 'v1', name: 'formValid', type: 'boolean', defaultValue: false }, { id: 'v2', name: 'formDirty', type: 'boolean', defaultValue: false }, { id: 'v3', name: 'formSending', type: 'boolean', defaultValue: false }, { id: 'v4', name: 'lastPo', type: 'string', defaultValue: 'none' }] }],
        templates: [], types: [], breakpoints: [], theme: null, variables: [] };
    fs.writeFileSync(path.join(dir, 'flows.json'), JSON.stringify([{ id: 'tab1', type: 'tab', label: 'T' }, project], null, 1));
    return dir;
}

const portFree = (port) => new Promise((resolve) => { const t = net.createServer().once('error', () => resolve(false)).once('listening', () => t.close(() => resolve(true))).listen(port, '127.0.0.1'); });

(async () => {
    for (const p of Object.values(PORTS)) {
        if (!(await portFree(p))) { console.error('port ' + p + ' is in use (a Node-RED running?) - stop it first'); process.exit(1); }
    }
    const dir = writeFlows();
    const nr = spawn(process.execPath, [RED_JS, '-u', dir], { cwd: path.resolve(RED_JS, '../../..'), stdio: ['ignore', fs.openSync(path.join(S, 'nr.log'), 'w'), fs.openSync(path.join(S, 'nr.err'), 'w')] });
    try {
        for (let i = 0; i < 60; i++) { try { if (await fetch('http://127.0.0.1:' + PORTS.pages + '/nexa/form').then((r) => r.status === 200)) break; } catch (e) { /* not yet */ } await wait(1000); }
        await wait(1500);
        const r = await withPage('http://127.0.0.1:' + PORTS.pages + '/nexa/form', async ({ js, send, type, key, logs }) => {
            await wait(2500);
            const R = (id) => `document.querySelector('[data-id="${id}"] > *').renderRoot`;
            const stateText = () => js(`${R('state')}.querySelector("p").textContent.trim()`);
            const errorOf = (id) => js(`(function () { var h = ${R(id)}.querySelector(".helper.error"); return h ? h.textContent.trim() : ""; })()`);
            const sendBtn = () => js(`(function () { var b = ${R('send')}.querySelector(".btn"); return { disabled: b.disabled, busy: b.getAttribute("aria-busy") }; })()`);
            const typeInto = async (id, text) => {
                await js(`(function () { var i = ${R(id)}.querySelector("input"); i.focus(); i.select(); return 1; })()`);
                if (text === '') await key('Backspace'); else await type(text);
                await wait(250);
            };
            const click = async (sel) => {
                const b = await js(`(function () { var e = ${sel}; e.scrollIntoView({ block: "center" }); var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
                await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', buttons: 1, clickCount: 1 });
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
                await wait(250);
            };

            check('the fields are in the form, drawn inside its slot', (await js(`document.querySelectorAll('[data-id="FORM"] [data-id]').length`)) >= 5, null);
            check('at the start: not valid (an empty required field), nothing changed, nothing sent; the Send button waits', (await stateText()) === 'valid=false changed=false sending=false' && (await sendBtn()).disabled === true, [await stateText(), await sendBtn()]);
            check('... and no error is shown before the user touches anything', (await errorOf('po')) === '' && (await errorOf('agree')) === '', null);

            const save2 = () => js(`${R('save2')}.querySelector(".btn").disabled`);
            check('a button whose Disabled is bound to !{formDirty} is off while nothing changed', (await save2()) === true, await save2());
            await typeInto('po', 'PO-1');
            check('... and on once the form has changed', (await save2()) === false, await save2());
            await typeInto('pw', 'short');
            check('typing a short password: its rule (JavaScript) says so at once, while typing', (await errorOf('pw')) === 'At least 8 characters', await errorOf('pw'));
            await typeInto('pw', 'long-enough-1');
            check('... and the message goes when the password is long enough', (await errorOf('pw')) === '', await errorOf('pw'));
            await typeInto('qty', '0');
            check('the number\'s own limit (min 1) is an error of the form', (await errorOf('qty')) !== '', await errorOf('qty'));
            await typeInto('qty', '3');
            await click(`${R('agree')}.querySelector(".cb")`);
            await wait(300);
            check('every rule met: valid, changed; the Send button is on', (await stateText()) === 'valid=true changed=true sending=false' && (await sendBtn()).disabled === false, [await stateText(), await sendBtn()]);

            // a server check by wire: On Change -> Function -> Set errors
            await typeInto('po', 'TAKEN');
            await wait(500);
            check('On Change -> Function -> Update (Set errors): the server\'s refusal is on the order field', (await errorOf('po')) === 'Already used', await errorOf('po'));
            check('... the form is not valid and the Send button waits', (await stateText()).indexOf('valid=false') === 0 && (await sendBtn()).disabled === true, [await stateText(), await sendBtn()]);
            if (process.env.SHOTS_DIR) {
                fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true });
                await typeInto('pw', 'short');
                fs.writeFileSync(path.join(process.env.SHOTS_DIR, 'form-errors.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
                await typeInto('pw', 'long-enough-1');
            }
            await typeInto('po', 'PO-2');
            await wait(300);
            check('typing in that field clears the message; valid again', (await errorOf('po')) === '' && (await stateText()).indexOf('valid=true') === 0, [await errorOf('po'), await stateText()]);

            // send: On Submit -> Function (300 ms) -> Update (Done)
            if (process.env.SHOTS_DIR) {
                fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true });
                fs.writeFileSync(path.join(process.env.SHOTS_DIR, 'form-filled.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
            }
            await click(`${R('send')}.querySelector(".btn")`);
            await wait(80);
            const during = await sendBtn();
            check('Send: while the server works the button shows it (busy) and the form says sending', during.busy === 'true' && (await stateText()).indexOf('sending=true') !== -1, [during, await stateText()]);
            const submitted = await js('window.__submitted');
            check('On Submit gave Logic the values of every field, by name', submitted && JSON.stringify(submitted.values) === JSON.stringify({ po: 'PO-2', password: 'long-enough-1', qty: 3, agree: true }), submitted);
            await wait(1000);
            check('Update (Done): sending is over and what was sent is where the form starts from (not changed)', (await stateText()) === 'valid=true changed=false sending=false' && (await sendBtn()).busy === 'false', [await stateText(), await sendBtn()]);
            check('... the Function on On Submit wrote a field into a screen variable; the Save changes button is off again', (await js(`${R('last')}.querySelector("p").textContent.trim()`)) === 'last=PO-2' && (await save2()) === true, [await js(`${R('last')}.querySelector("p").textContent.trim()`), await save2()]);

            // a form that is not valid: the Send button is disabled, so a click does nothing; Enter in a field shows the errors instead
            await typeInto('po', '');
            await js(`(function () { ${R('po')}.querySelector("input").focus(); return 1; })()`);
            await key('Enter'); await wait(300);
            check('Enter in a field of an invalid form: no submit, the error is shown on the field', (await errorOf('po')) === 'Required' && JSON.stringify((await js('window.__submitted')).values.po) === '"PO-2"', [await errorOf('po'), await js('window.__submitted')]);

            const summary = await js(`(function () { var s = ${R('FORM')}.querySelector(".summary"); return s ? s.textContent.replace(/\\s+/g, " ").trim() : ""; })()`);
            check('the list of errors above the form names the field and its message after a failed Send', /Please correct:.*po: Required/.test(summary), summary);

            const errs = logs.filter((l) => !/favicon|DevTools|dev mode/.test(l));
            check('no errors in the page', errs.length === 0, errs.slice(0, 3));
            return true;
        }, { width: 1000, height: 600 });
        if (r === null) { console.log('SKIP: no Chrome'); }
    } finally {
        nr.kill();
        await wait(500);
        try { fs.rmSync(S, { recursive: true, force: true }); } catch (e) { /* still held */ }
    }
    console.log(`\n${passed} passed, ${failures} failed`);
    console.log(failures ? 'FAILED' : 'ALL OK');
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
