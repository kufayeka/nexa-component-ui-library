'use strict';

// The Form manual (docs/form/) stays true.
//   - README.md is the table of contents: every chapter file is listed, every listed file exists, and in the order of its numbers;
//   - every picture a chapter shows is in docs/images/form, and every picture in that folder is shown;
//   - the example project (docs/examples/form-cookbook.nexa.json) is a good Nexa project file with one screen for each recipe, whose Logic points at controls that are there;
//   - the cookbook chapter has every recipe of scripts/cookbook/recipes.js, in order, under its number and title;
//   - the manual names every event, action and output of the Form;
//   - (with Chrome) every property, event and action of every form control, as the components themselves define them, is named in the manual.
//   node test/docs-form.test.js        (the last part is skipped when Chrome is not installed)

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');
const MANUAL = path.join(DOCS, 'form');
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const ok = (label) => { passed++; console.log('✔ ' + label); };

(async () => {
    // ---- the table of contents
    const chapters = fs.readdirSync(MANUAL).filter((f) => /\.md$/.test(f) && f !== 'README.md').sort();
    const toc = read(path.join(MANUAL, 'README.md'));
    const listed = Array.from(toc.matchAll(/\]\(([^)#]+\.md)\)/g)).map((m) => m[1]);
    assert.deepStrictEqual(listed.filter((f) => chapters.indexOf(f) === -1), [], 'the contents list a chapter that is not there');
    assert.deepStrictEqual(chapters.filter((f) => listed.indexOf(f) === -1), [], 'a chapter is not in the contents');
    const numbered = listed.filter((f) => /^\d\d-/.test(f));
    assert.deepStrictEqual(numbered, numbered.slice().sort(), 'the contents are not in the order of the chapters');
    ok('the contents list every chapter (' + chapters.length + '), in order');

    // every chapter starts with its own number as the contents give it
    numbered.forEach((file) => {
        const n = parseInt(file, 10);
        const first = read(path.join(MANUAL, file)).split('\n')[0];
        assert.ok(first.indexOf('# ' + n + '. ') === 0, file + ' does not start with "# ' + n + '. ": ' + first);
    });
    ok('every chapter is headed with its number');

    // every link between chapters goes somewhere
    chapters.concat(['README.md']).forEach((file) => {
        const text = read(path.join(MANUAL, file));
        Array.from(text.matchAll(/\]\(([^)#]+)(#[^)]*)?\)/g)).forEach((m) => {
            if (/^https?:/.test(m[1])) return;
            assert.ok(fs.existsSync(path.join(MANUAL, m[1])), file + ' links to ' + m[1] + ', which is not there');
        });
    });
    ok('every link in the manual goes to a file that is there');

    // ---- the pictures
    const all = chapters.concat(['README.md']).map((f) => read(path.join(MANUAL, f)));
    const manual = all.join('\n');
    const used = Array.from(new Set(Array.from(manual.matchAll(/\]\(\.\.\/images\/form\/([^)]+\.png)\)/g)).map((m) => m[1])));
    const present = fs.readdirSync(path.join(DOCS, 'images', 'form')).filter((f) => /\.png$/.test(f));
    assert.ok(used.length >= 60, 'the manual shows its pictures (' + used.length + ')');
    assert.deepStrictEqual(used.filter((f) => present.indexOf(f) === -1), [], 'the manual shows pictures that are not in docs/images/form');
    ok('every picture of the manual exists (' + used.length + ')');
    assert.deepStrictEqual(present.filter((f) => used.indexOf(f) === -1), [], 'pictures in docs/images/form that the manual does not show');
    ok('every picture of the folder is shown');

    // ---- the example project
    const D = path.dirname(require.resolve('@kufayeka/node-red-nexa-dashboard/package.json'));
    const M = require(path.join(D, 'dist/nexa-model.js'));
    const { RECIPES } = require('../scripts/cookbook/recipes.js');
    const file = fs.readFileSync(path.join(DOCS, 'examples', 'form-cookbook.nexa.json'), 'utf8');
    const read2 = M.readPackage(file);
    assert.deepStrictEqual(read2.errors, [], 'the example project is not a good Nexa project file');
    const screens = read2.data.screens;
    assert.strictEqual(screens.length, RECIPES.length, 'one screen for each recipe');
    screens.forEach((s) => {
        const ids = {};
        (function walk(list) { (list || []).forEach((c) => { ids[c.id] = true; walk(c.children); }); })(s.components);
        const logic = s.logic || { nodes: [], wires: [] };
        logic.nodes.forEach((n) => {
            assert.ok(n.props && typeof n.props === 'object', s.name + ': Logic node ' + n.id + ' is not in the saved shape (props)');
            if (n.props.compId) assert.ok(ids[n.props.compId], s.name + ': Logic node "' + n.name + '" points at a control that is not on the screen: ' + n.props.compId);
        });
        const nodeIds = {};
        logic.nodes.forEach((n) => { nodeIds[n.id] = true; });
        logic.wires.forEach((w) => assert.ok(nodeIds[w.from] && nodeIds[w.to], s.name + ': a wire joins a node that is not there'));
    });
    ok('the example project is a good Nexa project file: ' + screens.length + ' screens, every Logic node and wire points at something that is there');

    // ---- the cookbook chapter
    const cookbook = read(path.join(MANUAL, '15-cookbook.md'));
    const headings = Array.from(cookbook.matchAll(/^## (\d+)\. (.+)$/gm)).map((m) => [parseInt(m[1], 10), m[2]]);
    assert.deepStrictEqual(headings, RECIPES.map((r) => [r.number, r.title]), 'the cookbook chapter does not have the recipes of scripts/cookbook/recipes.js, in order');
    assert.deepStrictEqual(RECIPES.map((r) => r.number), RECIPES.map((r, i) => i + 1), 'the recipes are not numbered 1, 2, 3 ...');
    assert.deepStrictEqual(screens.map((s) => s.name), RECIPES.map((r) => r.number + '. ' + r.title), 'the screens of the example project are not the recipes');
    ok('the cookbook chapter has every recipe, and the example project has the same screens');

    // ---- the manual names what the Form has
    ['On Submit', 'On Invalid Submit', 'On Change', 'On Valid Change', 'On Changed or Unchanged', 'On Reset', 'Check every rule now', 'Send the form', 'Reset', 'Set values', 'Set errors',
        'Mark fields as being checked', 'Clear errors', 'Focus a field', 'Sending is over'].forEach((label) => {
        assert.ok(manual.indexOf(label) !== -1, 'the manual has no "' + label + '"');
    });
    ['outputValues', 'outputErrors', 'outputValid', 'outputDirty', 'outputSubmitting', 'validateOn', 'submitOnEnter', 'changeDelay', 'errorSummary', 'summaryTitle',
        'submit', 'invalidSubmit', 'validChange', 'dirtyChange', 'setValues', 'setErrors', 'setChecking', 'clearErrors', 'done'].forEach((key) => {
        assert.ok(manual.indexOf('`' + key + '`') !== -1, 'the manual does not say what `' + key + '` is');
    });
    ok('the manual names every event, action, output and setting of the Form');

    // ---- the controls, from the components themselves (needs Chrome)
    const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
    const ids = ['form', 'input', 'textarea', 'number-input', 'password-input', 'checkbox', 'switch', 'radio-group', 'segmented', 'select', 'combobox', 'slider', 'tags-input',
        'pin-input', 'rating', 'datetime', 'daterange', 'button'];
    let meta = null;
    await withHarness({
        mounts: { '/nexa-component-ui-library/vendor': path.join(__dirname, '..', 'dist') },
        modules: ['/nexa-component-ui-library/vendor/ui-library.js']
    }, async ({ js }) => {
        meta = await js(`(function () {
            var res = {};
            ${JSON.stringify(ids)}.forEach(function (id) {
                var d = NEXA.getComponent("nexa-ui-" + id), m = d && d.nexa;
                if (!m) { res[id] = null; return; }
                var props = Array.isArray(m.props) ? m.props : Object.keys(m.props || {}).map(function (k) { return { key: k }; });
                res[id] = {
                    properties: props.map(function (p) { return p.key; }),
                    events: (m.eventList || []).map(function (e) { return e.key || e.name; }),
                    actions: (m.actionList || []).map(function (a) { return a.key || a.name; })
                };
            });
            return res;
        })()`);
    });
    if (!meta) { console.log('SKIP: no Chrome (the controls are not checked against the components)'); console.log('\n' + passed + ' passed\nALL OK'); return; }
    const missing = [];
    ids.forEach((id) => {
        assert.ok(meta[id], 'the component nexa-ui-' + id + ' is not defined');
        const isCss = (k) => k === 'css' || /^css[A-Z]/.test(k);
        meta[id].properties.filter((k) => !isCss(k)).forEach((k) => { if (manual.indexOf('`' + k + '`') === -1) missing.push(id + ' property ' + k); });
        meta[id].events.forEach((k) => { if (manual.indexOf('`' + k + '`') === -1) missing.push(id + ' event ' + k); });
        meta[id].actions.forEach((k) => { if (manual.indexOf('`' + k + '`') === -1) missing.push(id + ' action ' + k); });
        // the custom CSS settings are in the manual too, once each
        meta[id].properties.filter(isCss).forEach((k) => { if (manual.indexOf('`' + k + '`') === -1) missing.push(id + ' CSS ' + k); });
    });
    assert.deepStrictEqual(missing, [], 'the manual does not name: ' + missing.join(', '));
    const checked = ids.reduce((n, id) => n + meta[id].properties.length + meta[id].events.length + meta[id].actions.length, 0);
    assert.ok(checked > 400, 'the components were read (' + checked + ' names)');
    ok('every property, event and action of every form control is named in the manual (' + checked + ' names)');

    console.log('\n' + passed + ' passed\nALL OK');
})().catch((e) => { console.error(e); process.exit(1); });
