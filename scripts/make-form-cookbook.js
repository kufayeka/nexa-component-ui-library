'use strict';
// Makes the pictures and the example project of the Form cookbook (docs/form/15-cookbook.md) from what REALLY happens:
//   - an isolated Node-RED (its own userDir in the temp folder, ports 1899 / 1898; never your data/) runs the screens of scripts/cookbook/recipes.js;
//   - for each recipe a headless Chrome opens the screen as a user would see it and does what the recipe says (types, clicks), photographing the moments;
//   - in the editor, a picture of the screen as it is designed, of its Logic (the wires), and of the inspector where the recipe says a setting matters;
//   - docs/examples/form-cookbook.nexa.json: the same screens as a Nexa project file: the Import button of the Screens tab reads it, and you can try them.
//   node scripts/make-form-cookbook.js            (needs Chrome and the dashboard built; takes a few minutes)
//   node scripts/make-form-cookbook.js login edit only some recipes
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const D = path.dirname(require.resolve('@kufayeka/node-red-nexa-dashboard/package.json'));
const { withPage } = require(path.join(D, 'sdk/testkit/cdp.js'));
const { RECIPES, buildProject } = require('./cookbook/recipes.js');

const ROOT = path.join(__dirname, '..');
const IMAGES = path.join(ROOT, 'docs', 'images', 'form');
const RED_JS = path.resolve(__dirname, '../../../node-red/red.js');
const PORTS = { editor: 1899, pages: 1898 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const portFree = (port) => new Promise((resolve) => { const t = net.createServer().once('error', () => resolve(false)).once('listening', () => t.close(() => resolve(true))).listen(port, '127.0.0.1'); });
const only = process.argv.slice(2);
const chosen = RECIPES.filter((r) => !only.length || only.indexOf(r.id) !== -1);

const written = [];
function save(name, base64) {
    fs.mkdirSync(IMAGES, { recursive: true });
    fs.writeFileSync(path.join(IMAGES, name + '.png'), Buffer.from(base64, 'base64'));
    written.push(name + '.png');
}

// ---- the screen as a user sees it ---------------------------------------------------------------------------------------
async function runRecipe(recipe) {
    const url = 'http://127.0.0.1:' + PORTS.pages + '/nexa' + recipe.path;
    const first = recipe.components[0].id;
    await withPage(url, async ({ js, send, type, key, logs }) => {
        await send('Emulation.setDeviceMetricsOverride', { width: recipe.width + 80, height: recipe.height + 80, deviceScaleFactor: 2, mobile: false });
        await wait(2200);
        const R = (id) => `document.querySelector('[data-id="${id}"] > *').renderRoot`;
        const p = {
            wait,
            btn: (id) => `${R(id)}.querySelector(".btn")`,
            box: (id) => `${R(id)}.querySelector(".cb")`,
            async click(sel) {
                const b = await js(`(function () { var e = ${sel}; e.scrollIntoView({ block: "center" }); var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
                await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', buttons: 1, clickCount: 1 });
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
                await wait(300);
            },
            async typeInto(id, text) {
                await js(`(function () { var i = ${R(id)}.querySelector("input"); i.focus(); i.select(); return 1; })()`);
                if (text === '') await key('Backspace'); else await type(text);
                await wait(250);
            },
            async press(name) { await key(name); await wait(200); },
            // fills a form like Logic's "Set values" does (for a field that has no typing, a calendar)
            async fill(formId, values) {
                await js(`document.querySelector('[data-id="${formId}"] > *').setValues(${JSON.stringify(values)}); true`);
                await wait(200);
            },
            // what the user reads on the screen, to check it is what the cookbook says before it is photographed
            helperOf: (id) => js(`(function () { var h = ${R(id)}.querySelector(".helper"); return h ? h.textContent.trim() : ""; })()`),
            errorOf: (id) => js(`(function () { var h = ${R(id)}.querySelector(".helper.error"); return h ? h.textContent.trim() : ""; })()`),
            textOf: (id, sel) => js(`(function () { var e = ${R(id)}.querySelector(${JSON.stringify(sel || 'p, .lbl, .val')}); return e ? e.textContent.replace(/\\s+/g, " ").trim() : ""; })()`),
            valueOf: (id) => js(`${R(id)}.querySelector("input").value`),
            disabled: (id) => js(`${R(id)}.querySelector(".btn").disabled`),
            summary: () => js(`(function () { var s = ${R('FORM')}.querySelector(".summary"); return s ? s.textContent.replace(/\\s+/g, " ").trim() : ""; })()`),
            focused: () => js(`(function () { var a = document.activeElement, host = a && a.closest ? a.closest("[data-id]") : null; return host ? host.getAttribute("data-id") : null; })()`),
            expect(label, actual, expected) {
                const ok = expected instanceof RegExp ? expected.test(String(actual)) : actual === expected;
                if (!ok) throw new Error(recipe.id + ': ' + label + ': expected ' + String(expected) + ' but the screen shows ' + JSON.stringify(actual));
            },
            async shot(name) {
                // the focus ring and the caret blink: a short pause so the picture is the same each time
                await wait(150);
                const rect = await js(`(function () { var a = document.getElementById("nexa-runtime-artboard") || document.body, r = a.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }; })()`);
                const shot = await send('Page.captureScreenshot', { format: 'png', clip: Object.assign({ scale: 1 }, rect) });
                save(recipe.id + '-' + name, shot.result.data);
            }
        };
        await js(`!!document.querySelector('[data-id="${first}"] > *')`);
        await recipe.scenario(p);
        const errs = logs.filter((l) => !/favicon|DevTools|dev mode/.test(l));
        if (errs.length) throw new Error('page errors in ' + recipe.id + ': ' + errs.slice(0, 3).join(' | '));
    }, { width: recipe.width + 80, height: recipe.height + 80, ready: `document.readyState === "complete" && !!document.querySelector('[data-id="${first}"] > *')`, readyTries: 200 });
}

// ---- the editor: the design, the wires, the inspector --------------------------------------------------------------------
async function runEditor() {
    await withPage('http://127.0.0.1:' + PORTS.editor + '/', async ({ js, send, logs }) => {
        await wait(3500);
        await js('RED.sidebar.show("nexa-dashboard-sidebar"); RED.actions.invoke("nexa:open-pages-editor"); true');
        await wait(2500);
        await js('(function () { var b = Array.from(document.querySelectorAll("button")).find(function (b) { return /do not enable/i.test(b.textContent); }); if (b) b.click(); return true; })()');
        // the Nexa pane gets the height of the right-hand side: the splitter between it and the Debug pane is dragged down (once, when the inspector is first needed)
        let tall = false;
        const makeTall = async () => {
            if (tall) return;
            tall = true;
            const handle = await js(`(function () { var h = Array.from(document.querySelectorAll(".red-ui-sidebar-separator-handle")).filter(function (e) { var b = e.getBoundingClientRect(); return b.width > 300 && b.height <= 14; })[0]; if (!h) return null; var b = h.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
            if (!handle) { console.log('  note: the splitter of the sidebar was not found'); return; }
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: handle.x, y: handle.y });
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: handle.x, y: handle.y, button: 'left', buttons: 1, clickCount: 1 });
            for (let y = handle.y; y <= 880; y += 40) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: handle.x, y, buttons: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: handle.x, y: 880, button: 'left', buttons: 0, clickCount: 1 });
            await wait(700);
        };
        const clip = async (name, rect, scale) => {
            const shot = await send('Page.captureScreenshot', { format: 'png', clip: Object.assign({ scale: scale || 1 }, rect) });
            save(name, shot.result.data);
        };
        const sidebar = () => js(`(function () { var r = document.getElementById("red-ui-sidebar").getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 700) }; })()`);

        for (const recipe of chosen) {
            const id = 'cb-' + recipe.id;
            await js(`window.__nexaEditorApi.selectScreenFromSidebar(${JSON.stringify(id)}); window.__nexaEditorState.canvasTabs.activateTab("ui"); window.__nexaEditor.deselectAll(); true`);
            await wait(900);
            // the screen as it is designed (the form shows its dashed frame)
            const design = await js(`(function () { var a = window.__nexaEditorState.artboardEl.get(0), r = a.getBoundingClientRect(); return { x: Math.max(0, r.left - 14), y: Math.max(0, r.top - 30), width: r.width + 28, height: r.height + 44 }; })()`);
            await clip(recipe.id + '-design', design);
            // its Logic: the nodes and the wires
            if (recipe.logic.nodes.length) {
                await js('window.__nexaEditorState.canvasTabs.activateTab("logic"); true');
                await wait(900);
                const logic = await js(`(function () { var nodes = Array.from(document.querySelectorAll(".nexa-logic-node, [data-logic-id]")); if (!nodes.length) return null;
                    var l = 1e9, t = 1e9, r = 0, b = 0; nodes.forEach(function (n) { var q = n.getBoundingClientRect(); l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); });
                    var vp = window.__nexaEditorState.logicViewportEl; vp = vp && vp.get ? vp.get(0) : vp; var v = vp && vp.getBoundingClientRect ? vp.getBoundingClientRect() : { right: window.innerWidth, bottom: window.innerHeight };
                    return { x: Math.max(0, l - 30), y: Math.max(0, t - 30), width: Math.min(r, v.right) - Math.max(0, l - 30) + 30, height: Math.min(b, v.bottom) - Math.max(0, t - 30) + 30, wide: r > v.right }; })()`);
                if (logic) {
                    if (logic.wide) console.log('  note: the Logic of ' + recipe.id + ' is wider than the canvas: move its nodes closer');
                    await clip(recipe.id + '-logic', logic, 2);
                }
                await js('window.__nexaEditorState.canvasTabs.activateTab("ui"); true');
                await wait(500);
            }
            // the inspector, where a setting matters
            for (const item of recipe.inspect || []) {
                await js(`window.__nexaEditorState.sidebarTabs.activateTab("properties"); true`);
                await wait(300);
                await makeTall();
                await js(`window.__nexaEditor.selectOnly(${JSON.stringify(item.comp)}); window.__nexaEditorState.sidebarTabs.activateTab("properties"); true`);
                await wait(700);
                await js(`(function () { var pane = window.__nexaEditorState.propertiesPane.get(0), t = pane.querySelector("nx-tree"); if (t && t.setAllCollapsed) t.setAllCollapsed(true); return 1; })()`);
                await wait(250);
                const ok = await js(`(function () { var pane = window.__nexaEditorState.propertiesPane.get(0), t = pane.querySelector("nx-tree"); if (!t) return "no tree";
                    if (t.reveal) t.reveal(${JSON.stringify(item.row)});
                    var row = Array.from(pane.querySelectorAll(".nx-tree-row")).find(function (r) { return r.dataset.id === ${JSON.stringify(item.row)}; });
                    if (!row) { var g = Array.from(pane.querySelectorAll(".nx-tree-row")).find(function (r) { return r.dataset.id === ${JSON.stringify(item.group)}; }); if (g) g.click(); return g ? "group only" : "no row"; }
                    row.click(); return "row"; })()`);
                await wait(700);
                if (ok === 'no row' || ok === 'no tree') console.log('  note: inspector shot ' + recipe.id + '/' + item.name + ': ' + ok);
                await clip(recipe.id + '-' + item.name, await sidebar());
            }
            // the dialog of a Logic node, as it opens on a double click
            for (const d of recipe.dialogs || []) {
                await js('window.__nexaEditorState.canvasTabs.activateTab("logic"); true');
                await wait(500);
                await js(`(function () { var s = window.__nexaEditorApi.state.screens.find(function (x) { return x.id === ${JSON.stringify(id)}; }); var n = s.logic.nodes.find(function (x) { return x.id === ${JSON.stringify(d.node)}; }); window.__nexaEditor.openLogicNodeDialog(n); return true; })()`);
                await wait(1000);
                const box = await js(`(function () { var r = document.querySelector(".nx-dialog").getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`);
                await clip(recipe.id + '-' + d.name, box);
                await js(`(function () { var b = Array.from(document.querySelectorAll(".nx-dialog-foot button")).find(function (x) { return x.textContent.trim() === "Cancel"; }); b.click(); return true; })()`);
                await wait(400);
                await js('window.__nexaEditorState.canvasTabs.activateTab("ui"); true');
                await wait(300);
            }
            console.log('  editor: ' + recipe.id);
        }
        const errs = logs.filter((l) => !/favicon|DevTools|dev mode/.test(l));
        if (errs.length) console.log('  editor console: ' + errs.slice(0, 3).join(' | '));
    }, { width: 2100, height: 1000, ready: 'document.readyState === "complete" && !!window.RED && !!RED.sidebar', readyTries: 150 });
}

async function main() {
    for (const port of Object.values(PORTS)) {
        if (!(await portFree(port))) { console.error('port ' + port + ' is in use (a Node-RED running?): stop it first'); process.exit(1); }
    }
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-cookbook-'));
    const dir = path.join(temp, 'nr');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'settings.js'), 'module.exports = { uiPort: ' + PORTS.editor + ', flowFile: "flows.json", nexaDashboard: { screenWorkerPort: ' + PORTS.pages + ' }, logging: { console: { level: "warn" } }, editorTheme: { tours: false, projects: { enabled: false } } };\n');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'nr-cookbook', version: '0.0.1', private: true }));
    const project = buildProject();
    fs.writeFileSync(path.join(dir, 'flows.json'), JSON.stringify([{ id: 'tab1', type: 'tab', label: 'T' }, project], null, 1));
    const nr = spawn(process.execPath, [RED_JS, '-u', dir], { cwd: path.resolve(RED_JS, '../../..'), stdio: ['ignore', fs.openSync(path.join(temp, 'nr.log'), 'w'), fs.openSync(path.join(temp, 'nr.err'), 'w')] });
    try {
        for (let i = 0; i < 60; i++) { try { if (await fetch('http://127.0.0.1:' + PORTS.pages + '/nexa' + RECIPES[0].path).then((r) => r.status === 200)) break; } catch (e) { /* not yet */ } await wait(1000); }
        await wait(1500);
        for (const recipe of chosen) {
            await runRecipe(recipe);
            console.log('  page: ' + recipe.id);
        }
        await runEditor();
    } finally {
        nr.kill();
        await wait(500);
        try { fs.rmSync(temp, { recursive: true, force: true }); } catch (e) { /* still held */ }
    }
    // the example project as a Nexa project file: the Import button of the Screens tab reads it (it shows what is in it and changes nothing until you say so)
    const { buildPackage } = require(path.join(D, 'dist/nexa-model.js'));
    fs.mkdirSync(path.join(ROOT, 'docs', 'examples'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'docs', 'examples', 'form-cookbook.nexa.json'), JSON.stringify(buildPackage(project, { name: 'Form cookbook', now: Date.UTC(2026, 9, 20) }), null, 2) + '\n');
    console.log(written.length + ' pictures in docs/images/form, and docs/examples/form-cookbook.nexa.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
