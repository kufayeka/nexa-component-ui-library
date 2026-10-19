'use strict';

// The Form docs stay true.
//   - FORM.md: every picture it shows is in docs/images/form, and every picture there is shown (a recipe was changed and its pictures were not made again, or the other way round);
//   - FORM.html and FORM_COMPONENTS.html are what the Markdown makes now (node scripts/make-form-guide-html.js);
//   - the example project (docs/examples/form-cookbook.nexa.json) is a good Nexa project file with one screen for each recipe, whose Logic points at controls that are there;
//   - FORM.md names every event, action and output of the Form;
//   - (with Chrome) docs/FORM_COMPONENTS.md is made from the components' own definitions (scripts/make-form-docs.js): every property of every form control has words in
//     scripts/form-docs-notes.js, and the file is what the script makes now.
//   node test/docs-form.test.js        (the last part is skipped when Chrome is not installed)

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'docs');
const read = (...p) => fs.readFileSync(path.join(DOCS, ...p), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const ok = (label) => { passed++; console.log('✔ ' + label); };

(async () => {
    // ---- the pictures
    const guide = read('FORM.md');
    const used = Array.from(new Set(Array.from(guide.matchAll(/\]\(images\/form\/([^)]+\.png)\)/g)).map((m) => m[1])));
    const present = fs.readdirSync(path.join(DOCS, 'images', 'form')).filter((f) => /\.png$/.test(f));
    assert.ok(used.length >= 60, 'FORM.md shows its pictures (' + used.length + ')');
    assert.deepStrictEqual(used.filter((f) => present.indexOf(f) === -1), [], 'FORM.md shows pictures that are not in docs/images/form');
    ok('every picture of FORM.md exists (' + used.length + ')');
    const design = present.filter((f) => /-(design|logic)\.png$/.test(f));
    assert.deepStrictEqual(present.filter((f) => used.indexOf(f) === -1 && design.indexOf(f) === -1), [], 'pictures in docs/images/form that FORM.md does not show');
    ok('every picture of the folder is shown (the design pictures of a recipe may stay unused)');

    // ---- the pages
    const { build } = require('../scripts/make-form-guide-html.js');
    build().forEach((p) => assert.strictEqual(fs.readFileSync(p.file, 'utf8').replace(/\r\n/g, '\n'), p.html.replace(/\r\n/g, '\n'), path.basename(p.file) + ' is out of date: run  node scripts/make-form-guide-html.js'));
    ok('FORM.html and FORM_COMPONENTS.html are what the Markdown says now');

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

    // ---- FORM.md names what the Form has
    ['On Submit', 'On Invalid Submit', 'On Change', 'On Valid Change', 'On Changed or Unchanged', 'On Reset', 'Check every rule now', 'Set values', 'Set errors', 'Clear errors', 'Focus a field', 'Sending is over'].forEach((label) => {
        assert.ok(guide.indexOf(label) !== -1, 'FORM.md has no "' + label + '"');
    });
    ['values', 'errors', 'valid', 'dirty', 'submitting'].forEach((o) => assert.ok(new RegExp('`' + o + '`').test(guide), 'FORM.md does not say what `' + o + '` is'));
    RECIPES.forEach((r) => assert.ok(new RegExp('### ' + r.number + '\\. ').test(guide), 'FORM.md has no recipe ' + r.number + ' (' + r.title + ')'));
    ok('FORM.md names every event, action and output of the Form, and has every recipe of the examples');

    // ---- the reference, from the components themselves (needs Chrome)
    const { generate } = require('../scripts/make-form-docs.js');
    const made = await generate();
    if (!made) { console.log('SKIP: no Chrome (the reference is not checked)'); console.log('\n' + passed + ' passed\nALL OK'); return; }
    assert.deepStrictEqual(made.missing, [], 'no words yet in scripts/form-docs-notes.js for: ' + made.missing.join(', '));
    ok('every property of every form control has words');
    assert.strictEqual(read('FORM_COMPONENTS.md'), made.text.replace(/\r\n/g, '\n'), 'docs/FORM_COMPONENTS.md is out of date: run  node scripts/make-form-docs.js');
    ok("docs/FORM_COMPONENTS.md is what the components say now");

    console.log('\n' + passed + ' passed\nALL OK');
})().catch((e) => { console.error(e); process.exit(1); });
