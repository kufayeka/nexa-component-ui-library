'use strict';
// Writes docs/FORM_COMPONENTS.md: every control a Form can hold (and the Form and its Send button), with every property, event, action and output. The tables come
// from the components' own definitions, read in headless Chrome, so nothing can be left out; the words come from scripts/form-docs-notes.js.
//   node scripts/make-form-docs.js            (needs Chrome and the dashboard built)
const path = require('path');
const fs = require('fs');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
const { NOTES, BY_COMPONENT, COMPONENTS, COMMON } = require('./form-docs-notes.js');

const ORDER = [
    ['form', 'Form'], ['input', 'Input'], ['textarea', 'Textarea'], ['number-input', 'Number Input'], ['password-input', 'Password Input'], ['checkbox', 'Checkbox'],
    ['switch', 'Switch'], ['radio-group', 'Radio Group'], ['segmented', 'Segmented Control'], ['select', 'Select'], ['combobox', 'Combobox'], ['slider', 'Slider'],
    ['tags-input', 'Tags Input'], ['pin-input', 'Pin Input'], ['rating', 'Rating'], ['datetime', 'Date Time'], ['daterange', 'Date Range'], ['button', 'Button']
];
const GROUPS = ['Data', 'Field', 'Content', 'Display', 'Style', 'Behaviour', 'Form', 'Number Format', 'Granularity', 'Timezone / UTC', 'Format', 'Presets'];

const cell = (s) => String(s === undefined || s === null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const show = (v) => (v === '' || v === undefined || v === null ? '(empty)' : typeof v === 'object' ? '`' + JSON.stringify(v).slice(0, 60) + '`' : '`' + String(v) + '`');
const noteOf = (id, key) => BY_COMPONENT[id + '.' + key] || NOTES[key] || null;
const isCss = (key) => key === 'css' || /^css[A-Z]/.test(key);

function typeOf(p) {
    if (p.type === 'tag') return p.access === 'write' ? 'a tag / variable to write' : 'a tag / variable / message to read';
    if (p.type === 'enum') return 'a choice: ' + (p.options || []).slice(0, 8).map((o) => '`' + String(o).split(' = ')[0] + '`').join(', ') + ((p.options || []).length > 8 ? ' ...' : '');
    return { string: 'text', text: 'long text', number: 'number', boolean: 'on / off', list: 'list', range: 'number (a slider)', asset: 'an asset', code: 'code' }[p.type] || String(p.type);
}

function build(meta) {
    const out = [];
    const missing = [];
    out.push('# Form controls: every property, event and action', '',
        '<!-- Written by scripts/make-form-docs.js from the components\' own definitions; the words are in scripts/form-docs-notes.js. Do not edit by hand: run the script. -->', '',
        'This is the reference of the **Form** and of every control a form can hold. How a form works, and what it can do for you, is in **FORM.md**; the recipes are its cookbook.', '',
        '- A property is in the inspector under the tab named in its table (Data, Field, Content, Display, Style, Behaviour, Form ...).',
        '- Almost every property can be **bound** (a variable, a tag, the message, an expression), and set per screen size; the ones in the Data tab that read or write a value are tags / variables by nature.',
        '- Every control has **Custom CSS** (the `css` property and one for each of its parts); they are described once, below, and not repeated.', '');

    // ---- the properties every control has
    out.push('## Properties every control has', '', '| Property | What it is for |', '| --- | --- |');
    const seen = {};
    ORDER.forEach(([id]) => (meta[id] ? meta[id].properties : []).forEach((p) => { if (COMMON.indexOf(p.key) !== -1 && !seen[p.key]) seen[p.key] = p; }));
    COMMON.forEach((k) => {
        const p = seen[k];
        if (!p) return;
        const note = NOTES[k];
        if (!note) missing.push(k);
        out.push('| ' + cell(p.label) + ' (`' + k + '`) | ' + cell(note) + ' |');
    });
    out.push('', 'Not every control has every one of them: a Checkbox has no Placeholder, a Slider no Variant. Each control below lists the common ones it has.', '');

    ORDER.forEach(([id, title]) => {
        const m = meta[id];
        if (!m) { missing.push('component ' + id); return; }
        const c = COMPONENTS[id] || {};
        if (!COMPONENTS[id]) missing.push('component ' + id);
        out.push('## ' + title + ' (`nexa-ui-' + id + '`)', '');
        if (c.intro) out.push(c.intro, '');
        if (c.value) out.push('**What the form gets from it:** ' + c.value, '');
        if (c.recipe) out.push('**Try:** ' + c.recipe, '');
        const props = m.properties.filter((p) => !isCss(p.key));
        const common = props.filter((p) => COMMON.indexOf(p.key) !== -1);
        const own = props.filter((p) => COMMON.indexOf(p.key) === -1);
        if (common.length) out.push('**Properties it has from the common list:** ' + common.map((p) => '`' + p.key + '`').join(', ') + '.', '');
        const cssKeys = m.properties.filter((p) => isCss(p.key)).map((p) => p.key);
        if (cssKeys.length) out.push('**Custom CSS:** ' + cssKeys.map((k) => '`' + k + '`').join(', ') + '.', '');
        // a common property this control describes in its own way
        const own2 = common.filter((p) => BY_COMPONENT[id + '.' + p.key]);
        const tableProps = own.concat(own2);
        if (tableProps.length) {
            const groups = {};
            tableProps.forEach((p) => { (groups[p.group || 'Other'] = groups[p.group || 'Other'] || []).push(p); });
            const names = GROUPS.filter((g) => groups[g]).concat(Object.keys(groups).filter((g) => GROUPS.indexOf(g) === -1));
            names.forEach((g) => {
                out.push('### ' + g + ' tab', '', '| Property | Kind and default | What it is for |', '| --- | --- | --- |');
                groups[g].forEach((p) => {
                    const note = noteOf(id, p.key);
                    if (!note) missing.push(id + '.' + p.key);
                    out.push('| ' + cell(p.label) + ' (`' + p.key + '`) | ' + cell(typeOf(p)) + (p.type === 'tag' ? '' : '; default ' + cell(show(p.default))) + ' | ' + cell(note) + ' |');
                });
                out.push('');
            });
        }
        if (m.events.length) {
            out.push('### Events (Logic: an "On ..." node)', '', '| Event | When | `msg.payload` |', '| --- | --- | --- |');
            m.events.forEach((e) => out.push('| ' + cell(e.label) + ' (`' + e.name + '`) | ' + cell(e.help || '') + ' | ' + cell(e.payload ? Object.keys(e.payload).map((k) => '`' + k + '` ' + e.payload[k]).join(', ') : '(none)') + ' |'));
            out.push('');
        }
        if (m.actions.length) {
            out.push('### Actions (Logic: an Update node on this control)', '', '| Action | What it does |', '| --- | --- |');
            m.actions.forEach((a) => out.push('| ' + cell(a.label) + ' (`' + a.name + '`) | ' + cell(a.help || '') + (a.example ? ' `msg.payload`: `' + cell(a.example) + '`' : '') + ' |'));
            out.push('');
        }
    });
    return { text: out.join('\n') + '\n', missing: missing };
}

// the text of the docs and the properties that have no words yet (null when there is no Chrome)
async function generate() {
    const root = path.join(__dirname, '..');
    let result = null;
    await withHarness({
        mounts: { '/nexa-component-ui-library/vendor': path.join(root, 'dist') },
        modules: ['/nexa-component-ui-library/vendor/ui-library.js']
    }, async ({ js }) => {
        const ids = ORDER.map((o) => o[0]);
        const meta = await js(`(function () {
            var ids = ${JSON.stringify(ids)}, res = {};
            ids.forEach(function (id) {
                var d = NEXA.getComponent("nexa-ui-" + id), m = d && d.nexa;
                if (!m) { res[id] = null; return; }
                function strip(p) {
                    var o = {};
                    Object.keys(p).forEach(function (k) {
                        var v = p[k];
                        if (typeof v === "function") return;
                        if (k === "options" && Array.isArray(v)) { o.options = v.map(function (x) { return x && typeof x === "object" ? (x.value + (x.label && x.label !== x.value ? " = " + x.label : "")) : String(x); }); return; }
                        if (k === "item" || k === "fields") return;
                        o[k] = v;
                    });
                    return o;
                }
                var props = Array.isArray(m.props) ? m.props : Object.keys(m.props || {}).map(function (k) { return Object.assign({ key: k }, m.props[k]); });
                res[id] = { label: d.label, properties: props.map(strip), events: (m.eventList || []).map(strip), actions: (m.actionList || []).map(strip) };
            });
            return res;
        })()`);
        result = build(meta);
    });
    return result;
}

async function main() {
    const root = path.join(__dirname, '..');
    const result = await generate();
    if (!result) { console.log('SKIP: no Chrome'); return; }
    if (result.missing.length) { console.error('No words yet in scripts/form-docs-notes.js for: ' + result.missing.join(', ')); process.exit(1); }
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'FORM_COMPONENTS.md'), result.text);
    console.log('docs/FORM_COMPONENTS.md written (' + result.text.length + ' characters)');
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { build, generate };
