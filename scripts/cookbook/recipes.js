'use strict';
// The Form cookbook as real screens. Each recipe is one Nexa screen: its controls, its variables, its Logic (nodes with their positions and wires) and a scenario, the
// clicks and keystrokes of a user, with the moments to photograph. scripts/make-form-cookbook.js runs every screen in a real Node-RED and a real browser, takes the
// pictures of the manual (docs/form/15-cookbook.md) from what actually happens, and writes docs/examples/form-cookbook.json, a project you can import and try.
//
// There is no real server here. A Function node named "Fake server ..." answers after a pause, the way an API Call would: in your own screen, put an API Call there.

// ---- small builders ----------------------------------------------------------------------------------------------------
const ui = (id, type, w, h, props, extra) => Object.assign({ id, type: 'nexa-ui-' + type, x: 0, y: 0, w, h, props: props || {} }, extra || {});
const at = (c, x, y) => Object.assign(c, { x, y });
const form = (id, x, y, w, h, props, children) => ({
    id, type: 'nexa-ui-form', x, y, w, h, slots: true,
    props: Object.assign({ changeDelay: 150, outputValid: '{formValid}', outputDirty: '{formDirty}', outputSubmitting: '{formSending}' }, props || {}),
    children: [{
        id: id + '-fields', type: '@frame', inSlot: 'content', slotLabel: 'Fields', x: 0, y: 0, w, h, style: {},
        layout: { mode: 'vertical', padding: { t: 12, r: 12, b: 12, l: 12 }, gap: 10 }, children
    }]
});
const send = (id, text, props) => ui(id, 'button', 150, 40, Object.assign({ text, formAction: 'submit', waitForValid: true }, props || {}));
const note = (id, text, x, y, w, h) => at(ui(id, 'text', w || 320, h || 40, { text }), x, y);
const stdVars = () => [
    { id: 'v1', name: 'formValid', type: 'boolean', defaultValue: false },
    { id: 'v2', name: 'formDirty', type: 'boolean', defaultValue: false },
    { id: 'v3', name: 'formSending', type: 'boolean', defaultValue: false }
];
const stateNote = (id, x, y) => note(id, 'valid = {formValid}   changed = {formDirty}   sending = {formSending}', x, y, 330, 40);

let wireCount = 0;
// a Logic node as the editor saves it: its own name and place, and its settings in `props`
const node = (id, type, name, x, y, props) => ({ id, type, name, x, y, props: props || {} });
const onEvent = (id, comp, event, name, x, y) => node(id, 'ui-event', name, x, y, { compId: comp, event });
const update = (id, comp, action, name, x, y) => node(id, 'ui-update', name, x, y, { compId: comp, action, config: {} });
const fn = (id, name, code, x, y) => node(id, 'function', name, x, y, { code });
const wires = (pairs) => pairs.map((p) => ({ id: 'w' + (++wireCount), from: p[0], to: p[1], fromPort: p[2] || 0 }));

// a pause before the answer, the way a server takes its time
const SERVER = (ms, body) => 'return new Promise(function (resolve) {\n    setTimeout(function () {\n' + body.split('\n').map((l) => '        ' + l).join('\n') + '\n        resolve(msg);\n    }, ' + ms + ');\n});';

const RULE_STRENGTH = 'var score = 0;\nif (value.length >= 8) score++;\nif (/[A-Z]/.test(value)) score++;\nif (/[0-9]/.test(value)) score++;\nif (/[^A-Za-z0-9]/.test(value)) score++;\nreturn score >= 3 || "Use 8 or more characters with capitals, digits or a symbol";';

// ---- the recipes -------------------------------------------------------------------------------------------------------
const RECIPES = [];

// 1. Login
RECIPES.push({
    id: 'login', number: 1, title: 'Login', path: '/c1-login', width: 760, height: 400,
    variables: stdVars().concat([{ id: 'v4', name: 'welcome', type: 'string', defaultValue: '' }]),
    components: [
        form('FORM', 20, 20, 380, 320, { validateOn: 'blur' }, [
            ui('user', 'input', 340, 92, { formName: 'username', label: 'User name', required: true }),
            ui('pass', 'password-input', 340, 92, { formName: 'password', label: 'Password', required: true }),
            send('go', 'Sign in')
        ]),
        stateNote('state', 420, 20),
        at(ui('welcome', 'text', 330, 40, { text: '{welcome}', fontWeight: 600 }), 420, 70),
        note('hint', 'Try the user name "ann" with the password "secret".', 20, 350, 700, 30)
    ],
    logic: {
        nodes: [
            onEvent('e1', 'FORM', 'submit', 'On Submit', 30, 130),
            fn('f1', 'Fake server: log in', SERVER(1500, 'var v = msg.payload.values;\nmsg.statusCode = (v.username === "ann" && v.password === "secret") ? 200 : 401;'), 250, 130),
            fn('f2', 'Right password?', 'if (msg.statusCode !== 200) return null;\nvars.screen.set("welcome", "Welcome, " + msg.payload.values.username + "!");\nmsg.payload = { reset: true };\nreturn msg;', 500, 60),
            fn('f3', 'Wrong password?', 'if (msg.statusCode === 200) return null;\nmsg.payload = { password: "Wrong user name or password" };\nreturn msg;', 500, 200),
            update('u1', 'FORM', 'done', 'Sending is over', 740, 60),
            update('u2', 'FORM', 'setErrors', 'Set errors', 740, 200)
        ],
        wires: wires([['e1', 'f1'], ['f1', 'f2'], ['f1', 'f3'], ['f2', 'u1'], ['f3', 'u2']])
    },
    inspect: [
        { name: 'inspector-form', comp: 'FORM', group: '@Behaviour', row: 'validateOn' },
        { name: 'inspector-send', comp: 'go', group: '@Form', row: 'formAction' },
        { name: 'inspector-name', comp: 'user', group: '@Form', row: 'formName' }
    ],
    async scenario(p) {
        p.expect('the Sign in button waits for the form', await p.disabled('go'), true);
        await p.shot('empty');
        await p.typeInto('user', 'ann');
        await p.typeInto('pass', 'abc');
        await p.press('Tab');
        await p.click(p.btn('go'));
        await p.wait(150);
        await p.shot('sending');
        await p.wait(1700);
        p.expect('the wrong password is refused under the password field', await p.errorOf('pass'), 'Wrong user name or password');
        await p.shot('wrong-password');
        await p.typeInto('pass', 'secret');
        await p.press('Tab');
        await p.click(p.btn('go'));
        await p.wait(2300);
        p.expect('a good login says welcome', await p.textOf('welcome'), 'Welcome, ann!');
        p.expect('and the form is empty again', await p.valueOf('user'), '');
        await p.shot('welcome');
    }
});

// 2. Registration with a password strength bar
RECIPES.push({
    id: 'register', number: 2, title: 'Registration with a password strength bar', path: '/c2-register', width: 780, height: 470,
    variables: stdVars().concat([{ id: 'v4', name: 'strength', type: 'number', defaultValue: 0 }, { id: 'v5', name: 'welcome', type: 'string', defaultValue: '' }]),
    components: [
        form('FORM', 20, 20, 400, 420, { validateOn: 'change' }, [
            ui('email', 'input', 360, 92, { formName: 'email', label: 'Email', required: true, pattern: '[^@ ]+@[^@ ]+', patternMessage: 'Not an email' }),
            ui('pass', 'password-input', 360, 92, { formName: 'password', label: 'Password', required: true, ruleCode: RULE_STRENGTH }),
            ui('confirm', 'password-input', 360, 92, { formName: 'confirm', label: 'Repeat the password', required: true, ruleCode: 'return value === values.password || "The passwords are not the same";' }),
            send('go', 'Create account')
        ]),
        at(ui('bar', 'progress', 300, 50, { label: 'Password strength', inputValue: '{strength}' }), 450, 20),
        at(ui('welcome', 'text', 300, 40, { text: '{welcome}', fontWeight: 600 }), 450, 100)
    ],
    logic: {
        nodes: [
            onEvent('e1', 'FORM', 'change', 'On Change', 30, 60),
            fn('f1', 'Strength 0 to 100', 'if (msg.payload.name !== "password") return null;     // only the password field\nvar p = msg.payload.value || "", s = 0;\nif (p.length >= 8) s++;\nif (/[A-Z]/.test(p)) s++;\nif (/[0-9]/.test(p)) s++;\nif (/[^A-Za-z0-9]/.test(p)) s++;\nvars.screen.set("strength", s * 25);\nreturn null;', 260, 60),
            onEvent('e2', 'FORM', 'submit', 'On Submit', 30, 200),
            fn('f2', 'Fake server: create the account', SERVER(800, 'vars.screen.set("welcome", "Account made for " + msg.payload.values.email);\nmsg.payload = { reset: true };'), 260, 200),
            update('u1', 'FORM', 'done', 'Sending is over (clear)', 540, 200)
        ],
        wires: wires([['e1', 'f1'], ['e2', 'f2'], ['f2', 'u1']])
    },
    inspect: [
        { name: 'inspector-password-rule', comp: 'pass', group: '@Form', row: 'ruleCode' },
        { name: 'inspector-confirm-rule', comp: 'confirm', group: '@Form', row: 'ruleCode' }
    ],
    async scenario(p) {
        await p.shot('empty');
        await p.typeInto('email', 'ann');
        await p.typeInto('pass', 'abc');
        await p.wait(250);
        p.expect('a short password is refused with its rule', await p.errorOf('pass'), 'Use 8 or more characters with capitals, digits or a symbol');
        p.expect('the email that is not an email is refused', await p.errorOf('email'), 'Not an email');
        await p.shot('weak');
        await p.typeInto('email', 'ann@plant.co');
        await p.typeInto('pass', 'Abcdef12');
        await p.typeInto('confirm', 'Abcdef1');
        await p.wait(250);
        p.expect('the repeated password is not the same', await p.errorOf('confirm'), 'The passwords are not the same');
        p.expect('the strength bar says 75%', await p.textOf('bar', '.out'), '75%');
        await p.shot('not-the-same');
        await p.typeInto('confirm', 'Abcdef12');
        await p.wait(250);
        await p.shot('ready');
        await p.click(p.btn('go'));
        await p.wait(1500);
        p.expect('the account is made', await p.textOf('welcome'), 'Account made for ann@plant.co');
        await p.shot('created');
    }
});

// 3. Production entry that adds up and checks the server
const ADDS_UP = 'return values.ok + values.reject === value || "OK + rejected must equal the total";';
RECIPES.push({
    id: 'production', number: 3, title: 'Production entry that adds up and checks the server', path: '/c3-production', width: 800, height: 600,
    variables: stdVars().concat([{ id: 'v4', name: 'lastSaved', type: 'string', defaultValue: 'nothing yet' }]),
    components: [
        form('FORM', 20, 20, 420, 540, { validateOn: 'change' }, [
            ui('po', 'input', 380, 92, { formName: 'po', label: 'Order number', required: true, pattern: 'PO-[0-9]+', patternMessage: 'Like PO-123', helperText: 'PO-100 is already used (the fake server says so)' }),
            ui('total', 'number-input', 200, 92, { formName: 'total', label: 'Total', required: true, min: 1, ruleCode: ADDS_UP }),
            ui('ok', 'number-input', 200, 92, { formName: 'ok', label: 'OK', defaultValue: 0, min: 0 }),
            ui('reject', 'number-input', 200, 92, { formName: 'reject', label: 'Rejected', defaultValue: 0, min: 0 }),
            send('go', 'Save')
        ]),
        stateNote('state', 460, 20),
        at(ui('saved', 'text', 330, 40, { text: 'Saved: {lastSaved}', fontWeight: 600 }), 460, 70)
    ],
    logic: {
        nodes: [
            onEvent('e1', 'FORM', 'change', 'On Change', 30, 40),
            fn('f1', 'Only the order number', 'if (msg.payload.name !== "po" || msg.payload.errors.po) return null;   // another field, or already wrong\nmsg.po = msg.payload.value;\nreturn msg;', 230, 40),
            fn('f2', 'Fake server: is it used?', SERVER(500, 'msg.payload = { exists: msg.po === "PO-100" };'), 450, 40),
            fn('f3', 'Taken?', 'if (msg.payload.exists) return { payload: { po: "Already used" } };\nreturn null;', 690, 40),
            update('u1', 'FORM', 'setErrors', 'Set errors', 880, 40),
            onEvent('e2', 'FORM', 'submit', 'On Submit', 30, 190),
            fn('f4', 'Fake server: save', SERVER(800, 'var v = msg.payload.values;\nmsg.saved = v.po + " (" + v.ok + " OK, " + v.reject + " rejected)";'), 230, 190),
            fn('f5', 'Remember it', 'vars.screen.set("lastSaved", msg.saved);\nmsg.payload = { reset: true };\nreturn msg;', 450, 190),
            update('u2', 'FORM', 'done', 'Sending is over (clear)', 690, 190)
        ],
        wires: wires([['e1', 'f1'], ['f1', 'f2'], ['f2', 'f3'], ['f3', 'u1'], ['e2', 'f4'], ['f4', 'f5'], ['f5', 'u2']])
    },
    inspect: [
        { name: 'inspector-total-rule', comp: 'total', group: '@Form', row: 'ruleCode' },
        { name: 'inspector-po-pattern', comp: 'po', group: '@Data', row: 'pattern' }
    ],
    async scenario(p) {
        await p.shot('empty');
        await p.typeInto('po', 'PO-1');
        await p.typeInto('total', '10');
        await p.typeInto('ok', '7');
        await p.typeInto('reject', '2');
        await p.wait(250);
        p.expect('7 + 2 is not 10', await p.errorOf('total'), 'OK + rejected must equal the total');
        await p.shot('does-not-add-up');
        await p.typeInto('reject', '3');
        await p.wait(250);
        p.expect('7 + 3 is 10: no error', await p.errorOf('total'), '');
        await p.shot('adds-up');
        await p.typeInto('po', 'PO-100');
        await p.wait(1200);
        p.expect('the fake server says the order number is taken', await p.errorOf('po'), 'Already used');
        await p.shot('taken');
        await p.typeInto('po', 'PO-101');
        await p.wait(250);
        await p.click(p.btn('go'));
        await p.wait(1500);
        p.expect('what was saved is shown, and the form is clear', await p.textOf('saved'), 'Saved: PO-101 (7 OK, 3 rejected)');
        p.expect('the order number is cleared', await p.valueOf('po'), '');
        await p.shot('saved');
    }
});

// 4. Edit a record
RECIPES.push({
    id: 'edit', number: 4, title: 'Edit a record', path: '/c4-edit', width: 800, height: 580,
    variables: stdVars(),
    components: [
        form('FORM', 20, 20, 420, 520, { validateOn: 'change' }, [
            ui('po', 'input', 380, 92, { formName: 'po', label: 'Order number', required: true }),
            ui('total', 'number-input', 200, 92, { formName: 'total', label: 'Total', required: true, min: 1, ruleCode: ADDS_UP }),
            ui('ok', 'number-input', 200, 92, { formName: 'ok', label: 'OK', defaultValue: 0, min: 0 }),
            ui('reject', 'number-input', 200, 92, { formName: 'reject', label: 'Rejected', defaultValue: 0, min: 0 }),
            ui('undo', 'button', 150, 40, { text: 'Revert', formAction: 'reset', variant: 'outline' })
        ]),
        at(ui('save', 'button', 170, 40, { text: 'Save changes', disabled: { $bind: [{ src: 'expr', ref: '!{formDirty}' }], static: true } }), 460, 20),
        stateNote('state', 460, 80)
    ],
    logic: {
        nodes: [
            node('e0', 'onload', 'On Load', 30, 40),
            fn('f1', 'Fake server: get order 7', SERVER(400, 'msg.payload = { po: "PO-7", total: 10, ok: 8, reject: 2 };'), 230, 40),
            update('u1', 'FORM', 'setValues', 'Set values', 480, 40),
            onEvent('e1', 'save', 'click', 'On Click: Save changes', 30, 170),
            update('u2', 'FORM', 'submit', 'Send the form', 290, 170),
            onEvent('e2', 'FORM', 'submit', 'On Submit', 30, 290),
            fn('f2', 'Fake server: save order 7', SERVER(1500, 'msg.statusCode = 200;'), 230, 290),
            update('u3', 'FORM', 'done', 'Sending is over', 490, 290)
        ],
        wires: wires([['e0', 'f1'], ['f1', 'u1'], ['e1', 'u2'], ['e2', 'f2'], ['f2', 'u3']])
    },
    inspect: [
        { name: 'inspector-disabled', comp: 'save', group: '@Behaviour', row: 'disabled' },
        { name: 'inspector-outputs', comp: 'FORM', group: '@Data', row: 'outputDirty' }
    ],
    async scenario(p) {
        await p.wait(1600);
        p.expect('the record is loaded into the form', await p.valueOf('po'), 'PO-7');
        p.expect('Save changes is off: nothing changed yet', await p.disabled('save'), true);
        await p.shot('loaded');
        await p.typeInto('ok', '7');
        await p.wait(250);
        p.expect('the total was only loaded, not touched: its message waits for a Send', await p.errorOf('total'), '');
        p.expect('Save changes is on once the form has changed', await p.disabled('save'), false);
        await p.click(p.btn('save'));
        await p.wait(300);
        p.expect('Save changes sends the form: 7 + 2 is not 10, the total says so', await p.errorOf('total'), 'OK + rejected must equal the total');
        await p.shot('does-not-add-up');
        await p.typeInto('reject', '3');
        await p.wait(250);
        p.expect('the message goes when the numbers add up', await p.errorOf('total'), '');
        await p.shot('edited');
        await p.click(p.btn('save'));
        await p.wait(100);
        await p.shot('saving');
        await p.wait(1700);
        p.expect('after the save the form is not changed any more: Save changes is off', await p.disabled('save'), true);
        await p.shot('saved');
    }
});

// 5. The server says no, field by field (and the list of errors)
RECIPES.push({
    id: 'server-errors', number: 5, title: 'The server says no, field by field', path: '/c5-server-errors', width: 760, height: 470,
    variables: stdVars(),
    components: [
        form('FORM', 20, 20, 420, 420, { validateOn: 'change', errorSummary: true, summaryTitle: 'Please correct:' }, [
            ui('po', 'input', 380, 92, { formName: 'po', label: 'Order number', required: true }),
            ui('qty', 'number-input', 200, 92, { formName: 'qty', label: 'Quantity', required: true, min: 1 }),
            ui('go', 'button', 150, 40, { text: 'Send', formAction: 'submit' })
        ]),
        stateNote('state', 460, 20)
    ],
    logic: {
        nodes: [
            onEvent('e1', 'FORM', 'submit', 'On Submit', 30, 90),
            fn('f1', 'Fake server: says no', SERVER(700, 'msg.statusCode = 422;\nmsg.payload = { errors: { po: "Already used", qty: "Only 5 left" } };'), 240, 90),
            fn('f2', 'Take the field messages', 'var body = msg.payload;\nif (body && body.errors) { msg.payload = body.errors; return msg; }\nmsg.payload = { _form: "Something went wrong" };    // not a field: ignored by the form\nreturn msg;', 480, 90),
            update('u1', 'FORM', 'setErrors', 'Set errors', 730, 90)
        ],
        wires: wires([['e1', 'f1'], ['f1', 'f2'], ['f2', 'u1']])
    },
    inspect: [
        { name: 'inspector-summary', comp: 'FORM', group: '@Behaviour', row: 'errorSummary' }
    ],
    async scenario(p) {
        await p.shot('empty');
        await p.click(p.btn('go'));
        await p.wait(300);
        p.expect('the list names the empty fields', await p.summary(), /Please correct:.*po: Required.*qty: Required/);
        await p.shot('summary');
        await p.typeInto('po', 'PO-9');
        await p.typeInto('qty', '50');
        await p.click(p.btn('go'));
        await p.wait(1300);
        p.expect('the server refuses the order number on its own field', await p.errorOf('po'), 'Already used');
        p.expect('and the quantity on its own', await p.errorOf('qty'), 'Only 5 left');
        p.expect('and the list says so', await p.summary(), /po: Already used.*qty: Only 5 left/);
        await p.shot('server-says-no');
    }
});

// 6. A field that is required only sometimes
RECIPES.push({
    id: 'conditional', number: 6, title: 'A field that is required only sometimes', path: '/c6-conditional', width: 600, height: 400,
    variables: stdVars().concat([{ id: 'v4', name: 'result', type: 'string', defaultValue: '' }]),
    components: [
        form('FORM', 20, 20, 400, 320, { validateOn: 'change' }, [
            ui('has', 'checkbox', 360, 32, { formName: 'hasOrder', text: 'This lot has an order' }),
            ui('po', 'input', 360, 92, { formName: 'po', label: 'Order number', ruleCode: 'return !values.hasOrder || !!value || "Required when there is an order";' }),
            ui('go', 'button', 150, 40, { text: 'Send', formAction: 'submit' })
        ]),
        at(ui('result', 'text', 300, 40, { text: '{result}', fontWeight: 600 }), 20, 350)
    ],
    logic: {
        nodes: [
            onEvent('e1', 'FORM', 'submit', 'On Submit', 30, 60),
            fn('f1', 'Say what was sent', 'var v = msg.payload.values;\nvars.screen.set("result", v.hasOrder ? "Sent with order " + v.po : "Sent without an order");\nreturn msg;', 240, 60),
            update('u1', 'FORM', 'done', 'Sending is over', 500, 60)
        ],
        wires: wires([['e1', 'f1'], ['f1', 'u1']])
    },
    inspect: [{ name: 'inspector-rule', comp: 'po', group: '@Form', row: 'ruleCode' }],
    async scenario(p) {
        await p.shot('off');
        await p.click(p.box('has'));
        await p.click(p.btn('go'));
        await p.wait(300);
        p.expect('with the box ticked the order number is required', await p.errorOf('po'), 'Required when there is an order');
        await p.shot('required');
        await p.typeInto('po', 'PO-5');
        await p.click(p.btn('go'));
        await p.wait(400);
        p.expect('it is sent with the order', await p.textOf('result'), 'Sent with order PO-5');
        await p.shot('sent');
    }
});

// 7. A report filter with a date range
RECIPES.push({
    id: 'filter', number: 7, title: 'A report filter with a date range', path: '/c7-filter', width: 800, height: 420,
    variables: stdVars().concat([{ id: 'v4', name: 'report', type: 'string', defaultValue: '' }]),
    components: [
        form('FORM', 20, 20, 400, 340, { validateOn: 'change' }, [
            ui('period', 'daterange', 360, 92, { formName: 'period', label: 'Period', required: true, timezoneMode: 'utc', timeGranularity: 'off' }),
            ui('line', 'select', 360, 92, { formName: 'line', label: 'Line', required: true, options: [{ value: 'line1', label: 'Line 1' }, { value: 'line2', label: 'Line 2' }, { value: 'line3', label: 'Line 3' }] }),
            send('go', 'Show report')
        ]),
        at(ui('report', 'text', 340, 80, { text: '{report}', fontWeight: 600 }), 440, 20)
    ],
    logic: {
        nodes: [
            onEvent('e1', 'FORM', 'submit', 'On Submit', 30, 60),
            fn('f1', 'Fake server: the report', SERVER(600, 'var v = msg.payload.values;\nvars.screen.set("report", v.line + ": " + v.period.start.slice(0, 10) + " to " + v.period.end.slice(0, 10) + " - 124 batches");'), 240, 60),
            update('u1', 'FORM', 'done', 'Sending is over', 530, 60)
        ],
        wires: wires([['e1', 'f1'], ['f1', 'u1']])
    },
    inspect: [{ name: 'inspector-period', comp: 'period', group: '@Form', row: 'formName' }],
    async scenario(p) {
        await p.shot('empty');
        await p.fill('FORM', { period: { start: '2026-05-01T00:00:00.000Z', end: '2026-05-31T23:59:59.999Z' }, line: 'line2' }, true);
        await p.wait(400);
        await p.shot('filled');
        await p.click(p.btn('go'));
        await p.wait(1300);
        p.expect('the report is for the chosen line and period', await p.textOf('report'), 'line2: 2026-05-01 to 2026-05-31 - 124 batches');
        await p.shot('report');
    }
});

// 8. Setpoints applied together
RECIPES.push({
    id: 'setpoints', number: 8, title: 'Setpoints applied together', path: '/c8-setpoints', width: 820, height: 470,
    variables: stdVars().concat([{ id: 'v4', name: 'speedNow', type: 'number', defaultValue: 800 }, { id: 'v5', name: 'tempNow', type: 'number', defaultValue: 60 }]),
    components: [
        form('FORM', 20, 20, 400, 380, { validateOn: 'change' }, [
            ui('speed', 'number-input', 300, 92, { formName: 'speed', label: 'Speed', suffix: 'rpm', min: 0, max: 1500, step: 10, required: true }),
            ui('temp', 'number-input', 300, 92, { formName: 'temp', label: 'Temperature', suffix: 'C', min: 0, max: 120, required: true }),
            ui('apply', 'button', 150, 40, { text: 'Apply', formAction: 'submit', waitForValid: true }),
            ui('revert', 'button', 150, 40, { text: 'Revert', formAction: 'reset', variant: 'outline' })
        ]),
        at(ui('machine', 'text', 380, 80, { text: 'Machine now: speed {speedNow} rpm, temp {tempNow} C', fontWeight: 600 }), 440, 20),
        at(stateNote('state', 440, 120), 440, 120)
    ],
    logic: {
        nodes: [
            node('e0', 'onload', 'On Load', 30, 40),
            fn('f1', 'Read the machine (after a moment)', SERVER(900, 'msg.payload = { speed: vars.screen.get("speedNow"), temp: vars.screen.get("tempNow") };'), 230, 40),
            update('u1', 'FORM', 'setValues', 'Set values', 470, 40),
            onEvent('e1', 'FORM', 'submit', 'On Submit', 30, 190),
            fn('f2', 'Write the machine (both together)', SERVER(700, 'var v = msg.payload.values;\nvars.screen.set("speedNow", v.speed);\nvars.screen.set("tempNow", v.temp);'), 230, 190),
            update('u2', 'FORM', 'done', 'Sending is over', 540, 190)
        ],
        wires: wires([['e0', 'f1'], ['f1', 'u1'], ['e1', 'f2'], ['f2', 'u2']])
    },
    inspect: [{ name: 'inspector-limits', comp: 'speed', group: '@Data', row: 'max' }],
    async scenario(p) {
        await p.wait(2600);
        p.expect('the form shows what the machine has', [await p.valueOf('speed'), await p.valueOf('temp')].join('/'), '800/60');
        await p.shot('loaded');
        await p.typeInto('speed', '1200');
        await p.typeInto('temp', '75');
        await p.wait(300);
        p.expect('nothing is written to the machine before Apply', await p.textOf('machine'), 'Machine now: speed 800 rpm, temp 60 C');
        await p.shot('edited');
        await p.typeInto('temp', '500');
        await p.wait(300);
        p.expect('500 is over the limit', await p.errorOf('temp'), /maximum is 120/);
        p.expect('and Apply waits', await p.disabled('apply'), true);
        await p.shot('out-of-range');
        await p.typeInto('temp', '75');
        await p.wait(200);
        await p.click(p.btn('apply'));
        await p.wait(1400);
        p.expect('both setpoints reached the machine together', await p.textOf('machine'), 'Machine now: speed 1200 rpm, temp 75 C');
        await p.shot('applied');
        await p.typeInto('speed', '900');
        await p.wait(200);
        await p.click(p.btn('revert'));
        await p.wait(300);
        p.expect('Revert goes back to the values of the machine', await p.valueOf('speed'), '1200');
        await p.shot('reverted');
    }
});

// 9. Show every problem now, without sending
RECIPES.push({
    id: 'check', number: 9, title: 'Show every problem now, without sending', path: '/c9-check', width: 640, height: 400,
    variables: stdVars(),
    components: [
        form('FORM', 20, 20, 380, 330, { validateOn: 'submit' }, [
            ui('po', 'input', 340, 92, { formName: 'po', label: 'Order number', required: true }),
            ui('qty', 'number-input', 200, 92, { formName: 'qty', label: 'Quantity', required: true, min: 1 }),
            ui('check', 'button', 150, 40, { text: 'Check', variant: 'outline' })
        ]),
        stateNote('state', 420, 20)
    ],
    logic: {
        nodes: [
            onEvent('e1', 'check', 'click', 'On Click: Check', 30, 60),
            update('u1', 'FORM', 'validate', 'Check every rule now', 270, 60)
        ],
        wires: wires([['e1', 'u1']])
    },
    inspect: [],
    async scenario(p) {
        await p.shot('empty');
        await p.click(p.btn('check'));
        await p.wait(300);
        p.expect('Check shows the order number is missing', await p.errorOf('po'), 'Required');
        p.expect('and the quantity', await p.errorOf('qty'), 'Required');
        await p.shot('checked');
    }
});

// 10. Focus a field when the screen opens
RECIPES.push({
    id: 'focus', number: 10, title: 'Focus a field when the screen opens', path: '/c10-focus', width: 560, height: 330,
    variables: stdVars(),
    components: [
        form('FORM', 20, 20, 380, 270, { validateOn: 'blur' }, [
            ui('user', 'input', 340, 92, { formName: 'username', label: 'User name', required: true }),
            ui('pass', 'password-input', 340, 92, { formName: 'password', label: 'Password', required: true })
        ])
    ],
    logic: {
        nodes: [
            node('e0', 'onload', 'On Load', 30, 60),
            fn('f1', 'Which field?', 'msg.payload = "username";\nreturn msg;', 230, 60),
            update('u1', 'FORM', 'focus', 'Focus a field', 460, 60)
        ],
        wires: wires([['e0', 'f1'], ['f1', 'u1']])
    },
    inspect: [],
    async scenario(p) {
        await p.wait(700);
        p.expect('the user name field has the focus', await p.focused(), 'user');
        await p.shot('focused');
    }
});

// 11. Show the form's state
RECIPES.push({
    id: 'state', number: 11, title: "Show the form's state", path: '/c11-state', width: 800, height: 360,
    variables: stdVars(),
    components: [
        form('FORM', 20, 20, 380, 310, { validateOn: 'change' }, [
            ui('name', 'input', 340, 92, { formName: 'name', label: 'Name', required: true }),
            ui('mail', 'input', 340, 92, { formName: 'email', label: 'Email', required: true, pattern: '[^@ ]+@[^@ ]+', patternMessage: 'Not an email' }),
            send('go', 'Send')
        ]),
        at(ui('t1', 'text', 340, 36, { text: 'Valid: {formValid}', fontWeight: 600 }), 440, 30),
        at(ui('t2', 'text', 340, 36, { text: 'Changed: {formDirty}', fontWeight: 600 }), 440, 70),
        at(ui('t3', 'text', 340, 36, { text: 'Sending: {formSending}', fontWeight: 600 }), 440, 110)
    ],
    logic: {
        nodes: [
            onEvent('e1', 'FORM', 'submit', 'On Submit', 30, 60),
            fn('f1', 'Fake server', SERVER(1200, 'msg.statusCode = 200;'), 240, 60),
            update('u1', 'FORM', 'done', 'Sending is over', 450, 60)
        ],
        wires: wires([['e1', 'f1'], ['f1', 'u1']])
    },
    inspect: [{ name: 'inspector-outputs', comp: 'FORM', group: '@Data', row: 'outputValid' }],
    async scenario(p) {
        await p.shot('start');
        await p.typeInto('name', 'Ann');
        await p.wait(300);
        p.expect('changed, not valid yet', [await p.textOf('t1'), await p.textOf('t2')].join(' | '), 'Valid: false | Changed: true');
        await p.shot('changed');
        await p.typeInto('mail', 'ann@plant.co');
        await p.wait(300);
        p.expect('now valid', await p.textOf('t1'), 'Valid: true');
        await p.shot('valid');
        await p.click(p.btn('go'));
        await p.wait(500);
        p.expect('sending', await p.textOf('t3'), 'Sending: true');
        await p.shot('sending');
    }
});

// 12. Several forms on one screen
RECIPES.push({
    id: 'two-forms', number: 12, title: 'Several forms on one screen', path: '/c12-two-forms', width: 880, height: 330,
    variables: [{ id: 'v1', name: 'aValid', type: 'boolean', defaultValue: false }, { id: 'v2', name: 'bValid', type: 'boolean', defaultValue: false }],
    components: [
        form('A', 20, 40, 400, 200, { validateOn: 'change', outputValid: '{aValid}', outputDirty: '', outputSubmitting: '' }, [
            ui('an', 'input', 360, 92, { formName: 'name', label: 'Customer name', required: true })
        ]),
        form('B', 450, 40, 400, 200, { validateOn: 'change', outputValid: '{bValid}', outputDirty: '', outputSubmitting: '' }, [
            ui('bn', 'input', 360, 92, { formName: 'name', label: 'Supplier name', required: true })
        ]),
        note('ta', 'Customer form valid: {aValid}', 20, 250, 400, 30),
        note('tb', 'Supplier form valid: {bValid}', 450, 250, 400, 30)
    ],
    logic: { nodes: [], wires: [] },
    inspect: [],
    async scenario(p) {
        await p.shot('both-empty');
        await p.typeInto('an', 'ACME Ltd');
        await p.wait(300);
        p.expect('the customer form is valid', await p.textOf('ta'), 'Customer form valid: true');
        p.expect('the supplier form is not', await p.textOf('tb'), 'Supplier form valid: false');
        await p.shot('one-filled');
    }
});

// 13. Keep the data, or clear it
RECIPES.push({
    id: 'keep-or-clear', number: 13, title: 'Keep the data, or clear it', path: '/c13-keep-or-clear', width: 880, height: 330,
    variables: [],
    components: [
        form('A', 20, 40, 400, 230, { validateOn: 'change', outputValid: '', outputDirty: '', outputSubmitting: '' }, [
            ui('an', 'input', 360, 92, { formName: 'note', label: 'Note (keep)', required: true }),
            ui('ag', 'button', 150, 40, { text: 'Send (Done)', formAction: 'submit', waitForValid: true })
        ]),
        form('B', 450, 40, 400, 230, { validateOn: 'change', outputValid: '', outputDirty: '', outputSubmitting: '' }, [
            ui('bn', 'input', 360, 92, { formName: 'note', label: 'Note (clear)', required: true }),
            ui('bg', 'button', 150, 40, { text: 'Send (Done + reset)', formAction: 'submit', waitForValid: true })
        ])
    ],
    logic: {
        nodes: [
            onEvent('e1', 'A', 'submit', 'On Submit (keep)', 30, 40),
            fn('f1', 'Fake server', SERVER(600, 'msg.statusCode = 200;'), 260, 40),
            update('u1', 'A', 'done', 'Sending is over', 470, 40),
            onEvent('e2', 'B', 'submit', 'On Submit (clear)', 30, 170),
            fn('f2', 'Fake server, then clear', SERVER(600, 'msg.payload = { reset: true };'), 260, 170),
            update('u2', 'B', 'done', 'Sending is over (reset)', 520, 170)
        ],
        wires: wires([['e1', 'f1'], ['f1', 'u1'], ['e2', 'f2'], ['f2', 'u2']])
    },
    inspect: [],
    async scenario(p) {
        await p.typeInto('an', 'Checked the valve');
        await p.typeInto('bn', 'Checked the valve');
        await p.wait(300);
        await p.shot('typed');
        await p.click(p.btn('ag'));
        await p.click(p.btn('bg'));
        await p.wait(1400);
        p.expect('the first form keeps what was typed', await p.valueOf('an'), 'Checked the valve');
        p.expect('the second form is cleared', await p.valueOf('bn'), '');
        await p.shot('after-send');
    }
});


// 14. Is this user name free? (rules on the control, Zod, the server, and "Checking...")
RECIPES.push({
    id: 'username', number: 14, title: 'Is this user name free?', path: '/c14-username', width: 800, height: 520,
    variables: stdVars().concat([{ id: 'v4', name: 'formValues', type: 'object', defaultValue: {} }]),
    components: [
        form('FORM', 20, 20, 420, 300, { validateOn: 'change', outputValues: '{formValues}' }, [
            ui('user', 'input', 380, 92, { formName: 'username', label: 'User name', required: true, minLength: 3, pattern: '[a-z]+', patternMessage: 'Lower case letters only', helperText: '3 to 12 lower case letters' }),
            send('go', 'Create the account')
        ]),
        stateNote('state', 460, 20)
    ],
    logic: {
        nodes: [
            onEvent('e1', 'FORM', 'change', 'On Change', 30, 40),
            fn('f1', 'Only the user name', 'if (msg.payload.name !== "username") return null;\nmsg.payload = { username: msg.payload.value };\nreturn msg;', 220, 40),
            node('v1', 'validate', 'Zod: what a rule cannot say', 440, 40, { schema: 'return z.object({\n    username: z.string()\n        .max(12, "At most 12 letters")\n        .refine(function (v) { return ["admin", "root", "system"].indexOf(v) === -1; }, "That name is reserved")\n});' }),
            update('u1', 'FORM', 'setErrors', 'Set errors', 700, 20),
            fn('f2', 'Say it is being checked', 'msg.payload = "username";\nreturn msg;', 700, 100),
            update('u2', 'FORM', 'setChecking', 'Mark as being checked', 930, 100),
            node('f3', 'function', 'Fake server: is it taken?', 700, 180, { outputs: 2, code: SERVER(1800, 'var name = msg.payload.username;\n// an answer about a name the user has already changed is dropped\nif ((vars.screen.get("formValues") || {}).username !== name) { resolve(null); return; }\nresolve(name === "yeka" || name === "ann" ? [null, { payload: { username: "Already taken" } }] : [{ payload: ["username"] }, null]);').replace('        resolve(msg);\n', '') }),
            update('u3', 'FORM', 'clearErrors', 'Clear errors', 960, 160),
            update('u4', 'FORM', 'setErrors', 'Set errors (taken)', 960, 230),
            onEvent('e2', 'FORM', 'submit', 'On Submit', 30, 330),
            fn('f4', 'Fake server: create it', SERVER(1200, 'msg.payload = { reset: true };'), 250, 330),
            update('u5', 'FORM', 'done', 'Sending is over', 500, 330)
        ],
        wires: wires([['e1', 'f1'], ['f1', 'v1'], ['v1', 'u1', 1], ['v1', 'f2', 0], ['f2', 'u2'], ['v1', 'f3', 0], ['f3', 'u3', 0], ['f3', 'u4', 1], ['e2', 'f4'], ['f4', 'u5']])
    },
    inspect: [{ name: 'inspector-rules', comp: 'user', group: '@Form', row: 'minLength' }],
    dialogs: [{ name: 'dialog-validate', node: 'v1' }],
    async scenario(p) {
        p.expect('the Create button waits: the form starts empty', await p.disabled('go'), true);
        await p.shot('empty');
        await p.typeInto('user', 'ab');
        await p.wait(400);
        p.expect('too short: the rule of the control answers at once', await p.errorOf('user'), 'At least 3 characters');
        await p.shot('too-short');
        await p.typeInto('user', 'root');
        await p.wait(700);
        p.expect('Zod refuses a reserved name', await p.errorOf('user'), 'That name is reserved');
        await p.shot('reserved');
        await p.typeInto('user', 'yeka');
        await p.wait(500);
        p.expect('a good name goes to the server: the field says it is being checked', await p.helperOf('user'), 'Checking\u2026');
        p.expect('and the form cannot be sent meanwhile', await p.disabled('go'), true);
        await p.shot('checking');
        await p.wait(2200);
        p.expect('the server says it is taken', await p.errorOf('user'), 'Already taken');
        await p.shot('taken');
        await p.typeInto('user', 'budi');
        await p.wait(500);
        p.expect('another name: checking again', await p.helperOf('user'), 'Checking\u2026');
        await p.wait(2400);
        p.expect('free: no error, the helper is back, the button is on', [await p.errorOf('user'), await p.helperOf('user'), await p.disabled('go')].join(' | '), ' | 3 to 12 lower case letters | false');
        await p.shot('free');
        await p.click(p.btn('go'));
        await p.wait(300);
        await p.shot('sending');
        await p.wait(1700);
        p.expect('created: the form is empty again', await p.valueOf('user'), '');
    }
});

// 15. The whole form checked by one Zod schema when it is sent
const GATE_SCHEMA = 'return z.object({\n    email: z.string().email("Not an email"),\n    password: z.string().min(8, "At least 8 characters").regex(/[A-Z]/, "Needs a capital letter").regex(/[0-9]/, "Needs a digit"),\n    confirm: z.string(),\n    age: z.number({ invalid_type_error: "Age is required" }).int("Whole years only").min(18, "Must be 18 or older")\n}).refine(function (v) { return v.password === v.confirm; }, { message: "The passwords are not the same", path: ["confirm"] });';
RECIPES.push({
    id: 'gate', number: 15, title: 'One Zod schema for the whole form', path: '/c15-gate', width: 800, height: 700,
    variables: stdVars().concat([{ id: 'v4', name: 'welcome', type: 'string', defaultValue: '' }]),
    components: [
        form('FORM', 20, 20, 420, 600, { validateOn: 'submit', errorSummary: true }, [
            ui('email', 'input', 380, 92, { formName: 'email', label: 'Email', required: true }),
            ui('pass', 'password-input', 380, 92, { formName: 'password', label: 'Password', required: true }),
            ui('confirm', 'password-input', 380, 92, { formName: 'confirm', label: 'Repeat the password', required: true }),
            ui('age', 'number-input', 200, 92, { formName: 'age', label: 'Age', required: true }),
            ui('go', 'button', 170, 40, { text: 'Register', formAction: 'submit' })
        ]),
        stateNote('state', 460, 20),
        at(ui('welcome', 'text', 330, 40, { text: '{welcome}', fontWeight: 600 }), 460, 70)
    ],
    logic: {
        nodes: [
            onEvent('e1', 'FORM', 'submit', 'On Submit', 30, 60),
            node('v1', 'validate', 'Zod: the whole form', 240, 60, { property: 'payload.values', schema: GATE_SCHEMA }),
            update('u1', 'FORM', 'setErrors', 'Set errors', 520, 20),
            fn('f1', 'Fake server: register', SERVER(1200, 'vars.screen.set("welcome", "Registered " + msg.payload.values.email);\nmsg.payload = { reset: true };'), 520, 110),
            update('u2', 'FORM', 'done', 'Sending is over', 760, 110)
        ],
        wires: wires([['e1', 'v1'], ['v1', 'u1', 1], ['v1', 'f1', 0], ['f1', 'u2']])
    },
    inspect: [],
    dialogs: [{ name: 'dialog-validate', node: 'v1' }],
    async scenario(p) {
        await p.shot('empty');
        await p.typeInto('email', 'ann');
        await p.typeInto('pass', 'abcdefgh');
        await p.typeInto('confirm', 'abcdefgi');
        await p.typeInto('age', '17');
        await p.click(p.btn('go'));
        await p.wait(500);
        p.expect('Zod found every mistake at once: the email', await p.errorOf('email'), 'Not an email');
        p.expect('the password (the first message of the field)', await p.errorOf('pass'), 'Needs a capital letter');
        p.expect('the age', await p.errorOf('age'), 'Must be 18 or older');
        p.expect('and the second password, from a rule about both', await p.errorOf('confirm'), 'The passwords are not the same');
        p.expect('and the list above the form names them', await p.summary(), /email: Not an email.*password: Needs a capital letter/);
        await p.shot('everything-wrong');
        await p.typeInto('email', 'ann@plant.co');
        await p.typeInto('pass', 'Abcdefg1');
        await p.typeInto('confirm', 'Abcdefg1');
        await p.typeInto('age', '30');
        await p.click(p.btn('go'));
        await p.wait(300);
        await p.shot('sending');
        await p.wait(1700);
        p.expect('registered', await p.textOf('welcome'), 'Registered ann@plant.co');
        await p.shot('registered');
    }
});

// ---- the project -------------------------------------------------------------------------------------------------------
function buildProject() {
    const screens = RECIPES.map((r) => ({
        id: 'cb-' + r.id, name: r.number + '. ' + r.title, path: r.path, width: r.width, height: r.height, gridSize: 10, snap: false, treeVersion: 1, orphans: [],
        variables: r.variables, components: r.components, logic: r.logic
    }));
    return { id: 'form-cookbook', type: 'kufayeka-nexa-project', name: 'Form cookbook', sparkplugConnection: '', screens, templates: [], types: [], breakpoints: [], theme: null, variables: [] };
}

module.exports = { RECIPES, buildProject };
