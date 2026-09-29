'use strict';
// Tags end to end: every Nexa UI component that reads or writes a tag, on a LIVE page of an
// isolated Node-RED (its own userDir in the temp folder — never the user's data/), against a
// real MQTT broker (aedes) and a simulated Sparkplug edge (G / E1 / D1) that answers a DCMD
// like a PLC: applies it and publishes DDATA. Each component twice: on the screen, and in a
// Tabs panel (mounted late, after the plugin registered). Checks: the tag's value is shown;
// a change at the edge shows; the user's input is written (DCMD, the right value / format)
// and the echo is shown; device death -> "???", rebirth -> the value again; no page errors.
//   node test/tags-e2e.test.js      (needs Chrome, the dashboard built, ports 1899 / 1898 / 1893 free)
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const D = path.dirname(require.resolve('@kufayeka/node-red-nexa-dashboard/package.json'));
const dashRequire = require('module').createRequire(path.join(D, 'package.json'));
const { Aedes } = dashRequire('aedes');
const mqtt = dashRequire('mqtt');
const sp = require(path.join(D, 'lib/sparkplug/sparkplugCodec.js'));
const { withPage } = require(path.join(D, 'sdk/testkit/cdp.js'));
const RED_JS = path.resolve(__dirname, '../../../node-red/red.js');
const PORTS = { editor: 1899, pages: 1898, mqtt: 1893 };
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-ui-tags-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, passed = 0, skipped = false;
const check = (label, ok, actual) => { if (!ok) failures++; else passed++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '   actual: ' + JSON.stringify(actual))); };

// ---- the tags --------------------------------------------------------------------------
const METRICS = {
    Num: ['Float', 12.5], Int: ['Int32', 3], Bool: ['Boolean', true], Txt: ['String', 'PO-7'], Area: ['String', 'hello'],
    Pass: ['String', 'x'], Opt: ['String', 'b'], Combo: ['String', 'a'], Slide: ['Double', 40], Tags: ['String', '["x","y"]'],
    Pin: ['String', '1234'], Rate: ['Int32', 3], Stat: ['Double', 1284.5], Prog: ['Double', 60], Tab: ['String', 'trends'], Cmd: ['Int32', 0]
};
const all = {};
Object.keys(METRICS).forEach((k) => { all[k] = METRICS[k]; all['S_' + k] = METRICS[k]; });
const values = {};
Object.keys(all).forEach((k) => { values[k] = all[k][1]; });
const TAG = (m) => `{sparkplug:G::E1::D1::${m}}`;
const writes = []; // [metric, value] from DCMDs

// ---- the screen: one of each, and the same set in a Tabs panel ---------------------------
let n = 0;
function set(prefix) {
    const c = (type, w, h, props) => ({ id: prefix + (++n), type: 'nexa-ui-' + type, x: 0, y: 0, w, h, props });
    const t = (m) => TAG(prefix === 'p' ? m : 'S_' + m);
    return [
        c('input', 220, 64, { label: 'Txt', inputValue: t('Txt') }),
        c('textarea', 220, 90, { label: 'Area', inputValue: t('Area') }),
        c('number-input', 200, 64, { label: 'Num', inputValue: t('Num') }),
        c('number-input', 200, 64, { label: 'Int', inputValue: t('Int') }),
        c('password-input', 200, 64, { label: 'Pass', inputValue: t('Pass') }),
        c('checkbox', 160, 32, { text: 'Bool', inputValue: t('Bool') }),
        c('switch', 160, 32, { text: 'Bool', inputValue: t('Bool') }),
        c('radio-group', 300, 56, { label: 'Opt', inputValue: t('Opt') }),
        c('segmented', 280, 40, { inputValue: t('Opt') }),
        c('select', 220, 64, { label: 'Opt', inputValue: t('Opt') }),
        c('combobox', 220, 64, { label: 'Combo', inputValue: t('Combo') }),
        c('slider', 260, 72, { label: 'Slide', inputValue: t('Slide'), showValue: true }),
        c('tags-input', 280, 64, { label: 'Tags', inputValue: t('Tags') }),
        c('pin-input', 220, 72, { label: 'Pin', length: 4, inputValue: t('Pin') }),
        c('rating', 200, 36, { inputValue: t('Rate'), showValue: true }),
        c('stat', 220, 96, { label: 'Stat', inputValue: t('Stat'), change: '' }),
        c('progress', 260, 40, { label: 'Prog', inputValue: t('Prog') }),
        c('button', 140, 40, { text: 'Cmd', outputValue: t('Cmd'), clickValue: '7' }),
        c('tabs', 300, 120, { inputValue: t('Tab') })
    ];
}
const top = set('p');
const inSlot = set('s');
const pos = (list, x0) => { let y = 20; list.forEach((c) => { c.x = x0; c.y = y; y += c.h + 12; }); return y; };
pos(top, 20);
// the slot set: in a Tabs' "overview" panel (a vertical auto layout places them)
const host = { id: 'HOST', type: 'nexa-ui-tabs', x: 400, y: 20, w: 420, h: 1900, props: { defaultValue: 'overview' }, slots: true, children: [
    { id: 'HF1', type: '@frame', inSlot: 'overview', slotLabel: 'Overview', x: 0, y: 40, w: 420, h: 1860, layout: { mode: 'vertical', padding: { t: 8, r: 8, b: 8, l: 8 }, gap: 12 }, style: {}, children: inSlot },
    { id: 'HF2', type: '@frame', inSlot: 'trends', slotLabel: 'Trends', x: 0, y: 40, w: 420, h: 1860, layout: { mode: 'vertical' }, style: {}, children: [] },
    { id: 'HF3', type: '@frame', inSlot: 'alarms', slotLabel: 'Alarms', x: 0, y: 40, w: 420, h: 1860, layout: { mode: 'vertical' }, style: {}, children: [] }] };

function writeFlows() {
    const dir = path.join(S, 'nr-tags');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'settings.js'), 'module.exports = { uiPort: ' + PORTS.editor + ', flowFile: "flows.json", nexaDashboard: { screenWorkerPort: ' + PORTS.pages + ' }, logging: { console: { level: "warn" } }, editorTheme: { tours: false, projects: { enabled: false } } };\n');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'nr-tags', version: '0.0.1', private: true }));
    const project = { id: 'tagsproj', type: 'kufayeka-nexa-project', name: 'Tags', sparkplugConnection: 'spc',
        screens: [{ id: 'sT', name: 'Tags', path: '/tags', width: 900, height: 2000, gridSize: 10, snap: false, treeVersion: 1, orphans: [], components: top.concat([host]), logic: { nodes: [], wires: [] }, variables: [] }],
        templates: [], types: [], breakpoints: [], theme: null, variables: [] };
    const conn = { id: 'spc', type: 'kufayeka-nexa-sparkplug', name: 'test', brokerUrl: 'mqtt://127.0.0.1:' + PORTS.mqtt, groupFilter: '+', edgeNodeFilter: '+', keepAlive: 30, protocolVersion: '4', reconnectPeriod: 1000, connectTimeout: 10000, clientIdOverride: '' };
    fs.writeFileSync(path.join(dir, 'flows.json'), JSON.stringify([{ id: 'tab1', type: 'tab', label: 'T' }, conn, project], null, 1));
    return dir;
}

// ---- broker + edge ---------------------------------------------------------------------
async function startEdge() {
    const broker = await Aedes.createBroker();
    const server = net.createServer(broker.handle.bind(broker));
    await new Promise((r) => server.listen(PORTS.mqtt, '127.0.0.1', r));
    const edge = mqtt.connect('mqtt://127.0.0.1:' + PORTS.mqtt, { clientId: 'edge-sim' });
    await new Promise((r) => edge.on('connect', r));
    let seq = 0;
    const metric = (k) => ({ name: k, type: all[k][0], value: values[k] });
    const birth = () => {
        edge.publish('spBv1.0/G/NBIRTH/E1', sp.encodePayload({ timestamp: Date.now(), seq: seq = 0, metrics: [{ name: 'bdSeq', type: 'UInt64', value: 0 }] }));
        edge.publish('spBv1.0/G/DBIRTH/E1/D1', sp.encodePayload({ timestamp: Date.now(), seq: ++seq % 256, metrics: Object.keys(all).map(metric) }));
    };
    const ddata = (keys) => edge.publish('spBv1.0/G/DDATA/E1/D1', sp.encodePayload({ timestamp: Date.now(), seq: ++seq % 256, metrics: keys.map(metric) }));
    edge.subscribe(['spBv1.0/G/DCMD/E1/D1', 'spBv1.0/G/NCMD/E1']);
    edge.on('message', (topic, buf) => {
        const p = sp.decodePayload(buf);
        if (/NCMD/.test(topic)) { if ((p.metrics || []).some((m) => /Rebirth/.test(m.name))) birth(); return; }
        const changed = [];
        (p.metrics || []).forEach((m) => { writes.push([m.name, m.value, m.type]); if (all[m.name]) { values[m.name] = m.value; changed.push(m.name); } });
        // a PLC: applies it and reports the new value
        setTimeout(() => ddata(changed), 30);
    });
    birth();
    return { broker, server, edge, birth, ddata, close: () => { edge.end(true); server.close(); broker.close(); } };
}

const portFree = (port) => new Promise((resolve) => { const t = net.createServer().once('error', () => resolve(false)).once('listening', () => t.close(() => resolve(true))).listen(port, '127.0.0.1'); });

(async () => {
    for (const p of Object.values(PORTS)) {
        if (!(await portFree(p))) { console.error(`port ${p} is in use (a Node-RED running?) — stop it first`); process.exit(1); }
    }
    const edge = await startEdge();
    const dir = writeFlows();
    const nr = spawn(process.execPath, [RED_JS, '-u', dir], { cwd: path.resolve(RED_JS, '../../..'), stdio: ['ignore', fs.openSync(path.join(S, 'nr-tags.log'), 'w'), fs.openSync(path.join(S, 'nr-tags.err'), 'w')] });
    try {
        for (let i = 0; i < 60; i++) { try { const ok = await fetch('http://127.0.0.1:' + PORTS.pages + '/nexa/tags').then((r) => r.status === 200); if (ok) break; } catch (e) { /* not yet */ } await wait(1000); }
        await wait(2500); // the worker's MQTT client up, the birth seen
        edge.birth();
        await wait(1000);
        const r = await withPage('http://127.0.0.1:' + PORTS.pages + '/nexa/tags', async ({ js, send, type, key, logs }) => {
            await wait(2500);
            const R = (id) => `document.querySelector('[data-id="${id}"] > *').renderRoot`;
            const read = (id, kind) => js(`(function () { var r = ${R(id)}; if (!r) return "no root";
                switch (${JSON.stringify(kind)}) {
                    case "field": var i = r.querySelector("input, textarea"); return i ? i.value : null;
                    case "check": return r.querySelector("input").checked;
                    case "choice": var c = r.querySelector(".item.checked"); return c ? c.textContent.trim() : null;
                    case "select": return r.querySelector(".val").textContent.trim();
                    case "slider": return r.querySelector(".out").textContent.trim();
                    case "tags": return Array.from(r.querySelectorAll(".tag-text")).map(function (t) { return t.textContent.trim(); }).join(",");
                    case "pin": return Array.from(r.querySelectorAll("input.pin")).map(function (i) { return i.value; }).join("");
                    case "rating": return r.querySelector(".rating-out").textContent.trim();
                    case "stat": return r.querySelector(".val").textContent.trim();
                    case "progress": return r.querySelector(".out").textContent.trim();
                    case "tabs": var t = r.querySelector(".tab[aria-selected=true]"); return t ? t.dataset.value : null;
                } })()`);
            const KIND = { input: 'field', textarea: 'field', 'number-input': 'field', 'password-input': 'field', checkbox: 'check', switch: 'check', 'radio-group': 'choice', segmented: 'choice',
                select: 'select', combobox: 'field', slider: 'slider', 'tags-input': 'tags', 'pin-input': 'pin', rating: 'rating', stat: 'stat', progress: 'progress', tabs: 'tabs' };
            const EXPECT = { Txt: 'PO-7', Area: 'hello', Num: '12.5', Int: '3', Pass: 'x', Bool: true, Opt_choice: 'Option B', Opt_select: 'Option B', Combo: 'Option A', Slide: '40', Tags: 'x,y', Pin: '1234', Rate: '3', Stat: '1284.5', Prog: '60%', Tab: 'trends' };
            const metricOf = (c) => (c.props.inputValue || c.props.outputValue || '').replace(/^.*::(S_)?/, '').replace('}', '');
            const expectOf = (c, kind) => { const m = metricOf(c); return m === 'Opt' ? EXPECT['Opt_' + (kind === 'select' ? 'select' : 'choice')] : EXPECT[m]; };
            const both = top.concat(inSlot);
            // 1. READ: each shows its tag's value
            for (const c of both) {
                const kind = KIND[c.type.slice(8)];
                if (!kind) continue;
                const got = await read(c.id, kind);
                check(`read  ${c.id.charAt(0) === 'p' ? 'screen' : 'in tab'} ${c.type.slice(8)} (${metricOf(c)})`, got === expectOf(c, kind), got);
            }
            // 2. A CHANGE at the edge reaches both copies
            values.Num = 99.25; values.S_Num = 99.25; values.Bool = false; values.S_Bool = false; values.Opt = 'c'; values.S_Opt = 'c'; values.Stat = 7; values.S_Stat = 7;
            edge.ddata(['Num', 'S_Num', 'Bool', 'S_Bool', 'Opt', 'S_Opt', 'Stat', 'S_Stat']);
            await wait(800);
            for (const c of both.filter((x) => /Num|Bool|Opt|Stat/.test(metricOf(x)))) {
                const kind = KIND[c.type.slice(8)];
                const m = metricOf(c);
                const exp = m === 'Num' ? '99.25' : m === 'Bool' ? false : m === 'Stat' ? '7' : 'Option C';
                const got = await read(c.id, kind);
                check(`change ${c.id.charAt(0) === 'p' ? 'screen' : 'in tab'} ${c.type.slice(8)} (${m})`, got === exp, got);
            }
            // 3. WRITE: the user's input goes to the tag (DCMD), the edge echoes, the component shows it
            const at = async (sel) => js(`(function () { var e = ${sel}; e.scrollIntoView({ block: "center" }); var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
            const click = async (sel) => { const p = await at(sel);
                await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 }); await wait(150); };
            const q = (id, sel) => `${R(id)}.querySelector(${JSON.stringify(sel)})`;
            const selAll = (id, sel) => js(`(function () { var e = ${q(id, sel)}; e.focus(); e.select(); return 1; })()`);
            const typeInto = async (id, sel, text) => { await click(q(id, sel)); await selAll(id, sel); await type(text); await key('Enter'); };
            const idOf = (prefix, typ, metric) => both.find((c) => c.id.charAt(0) === prefix && c.type === 'nexa-ui-' + typ && metricOf(c) === metric).id;
            const lastWrite = (m) => { const w = writes.filter((x) => x[0] === m).pop(); return w ? w[1] : undefined; };
            const W = async (label, metric, act, exp, readBack) => {
                const before = writes.length;
                await act();
                await wait(900);
                const got = lastWrite(metric);
                check(`write ${label} -> ${metric} = ${JSON.stringify(exp)}`, writes.length > before && JSON.stringify(got) === JSON.stringify(exp), writes.slice(before));
                if (readBack) { const r = await readBack(); check(`  echo shown (${label})`, r.ok, r.got); }
            };
            for (const P of ['p', 's']) {
                const pre = P === 'p' ? '' : 'S_', where = P === 'p' ? 'screen' : 'in tab';
                const id = (t, m) => idOf(P, t, m);
                await W(`${where} number-input`, pre + 'Num', () => typeInto(id('number-input', 'Num'), 'input', '42'), 42,
                    async () => { const g = await read(id('number-input', 'Num'), 'field'); return { ok: g === '42', got: g }; });
                await W(`${where} number-input int`, pre + 'Int', () => typeInto(id('number-input', 'Int'), 'input', '8'), 8);
                await W(`${where} input`, pre + 'Txt', () => typeInto(id('input', 'Txt'), 'input', 'PO-9'), 'PO-9',
                    async () => { const g = await read(id('input', 'Txt'), 'field'); return { ok: g === 'PO-9', got: g }; });
                await W(`${where} checkbox`, pre + 'Bool', () => click(q(id('checkbox', 'Bool'), '.row')), true,
                    async () => { const g = await read(id('switch', 'Bool'), 'check'); return { ok: g === true, got: g }; });
                await W(`${where} switch`, pre + 'Bool', () => click(q(id('switch', 'Bool'), '.row')), false);
                await W(`${where} radio`, pre + 'Opt', () => click(`${R(id('radio-group', 'Opt'))}.querySelectorAll(".item")[0]`), 'a',
                    async () => { const g = await read(id('segmented', 'Opt'), 'choice'); return { ok: g === 'Option A', got: g }; });
                await W(`${where} segmented`, pre + 'Opt', () => click(`${R(id('segmented', 'Opt'))}.querySelectorAll(".item")[1]`), 'b');
                await W(`${where} rating`, pre + 'Rate', () => click(`${R(id('rating', 'Rate'))}.querySelectorAll(".star")[4]`), 5,
                    async () => { const g = await read(id('rating', 'Rate'), 'rating'); return { ok: g === '5', got: g }; });
                await W(`${where} slider`, pre + 'Slide', async () => { await click(q(id('slider', 'Slide'), '.thumb')); await key('ArrowRight'); }, 41);
                await W(`${where} tabs`, pre + 'Tab', () => click(q(id('tabs', 'Tab'), '.tab[data-value="alarms"]')), 'alarms');
                await W(`${where} button`, pre + 'Cmd', () => click(q(id('button', 'Cmd'), 'button')), 7);
                await W(`${where} tags`, pre + 'Tags', () => typeInto(id('tags-input', 'Tags'), 'input.entry', 'z'), '["x","y","z"]',
                    async () => { const g = await read(id('tags-input', 'Tags'), 'tags'); return { ok: g === 'x,y,z', got: g }; });
                await W(`${where} pin`, pre + 'Pin', async () => { await click(q(id('pin-input', 'Pin'), 'input.pin')); await type('5678'); }, '5678');
                await W(`${where} password`, pre + 'Pass', () => typeInto(id('password-input', 'Pass'), 'input', 'sec'), 'sec');
                await W(`${where} textarea`, pre + 'Area', async () => { await click(q(id('textarea', 'Area'), 'textarea')); await selAll(id('textarea', 'Area'), 'textarea'); await type('bye'); await key('Enter', 2); }, 'bye');
                await W(`${where} select`, pre + 'Opt', async () => { await click(q(id('select', 'Opt'), '.trigger')); await wait(200); console.log('select dbg', await js(`(function () { var r = ${R(id('select', 'Opt'))}; var m = r.querySelector('.menu'); var o = r.querySelectorAll('.opt')[2]; var b = o.getBoundingClientRect(); var t = document.elementFromPoint(b.left + 5, b.top + 5); var nd = r.host.parentElement, cs = getComputedStyle(nd); var pz = r.querySelector('.positioner'); return JSON.stringify({ z: nd.style.zIndex, ov: cs.overflow, tf: cs.transform, contain: cs.contain, hcs: getComputedStyle(r.host).overflow + '/' + getComputedStyle(r.host).contain, pos: pz && getComputedStyle(pz).position, pbox: pz && JSON.stringify(pz.getBoundingClientRect()), hidden: m.hidden, state: m.getAttribute('data-state'), box: [b.left, b.top, b.width, b.height], hit: t && t.tagName + '#' + (t.getAttribute('data-id') || ''), n: r.querySelectorAll('.opt').length }); })()`)); await click(`${R(id('select', 'Opt'))}.querySelectorAll(".opt")[2]`); }, 'c');
                await W(`${where} combobox`, pre + 'Combo', async () => { await click(q(id('combobox', 'Combo'), 'input')); await selAll(id('combobox', 'Combo'), 'input'); await type('Option B'); await wait(200); await key('ArrowDown'); await key('Enter'); }, 'b');
            }
            console.log('tags writes (type):', JSON.stringify(writes.filter((w) => /Tags/.test(w[0]))));
            // 4. The edge goes away: every value shows "???" (no frozen value); it comes back
            edge.edge.publish('spBv1.0/G/DDEATH/E1/D1', sp.encodePayload({ timestamp: Date.now(), seq: 99, metrics: [] }));
            await wait(800);
            const dead = await read('p3', 'field');
            check('device death: a field shows ??? (not its stale value)', dead === '' || dead === '???' || /\?\?\?/.test(await js(`${R('p3')}.textContent`)), dead);
            edge.birth(); await wait(1200);
            check('rebirth: the value is back', (await read('p3', 'field')) === String(values.Num), await read('p3', 'field'));
            const ss = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
            if (process.env.NEXA_SHOT) fs.writeFileSync(process.env.NEXA_SHOT, Buffer.from(ss.result.data, 'base64'));
            const errs = logs.filter((l) => !/dev mode|DevTools/.test(l));
            check('no errors on the page', errs.length === 0, errs.slice(0, 5));
        }, { width: 1000, height: 2100, ready: "!!document.querySelector('[data-id=\"s3\"]')", readyTries: 120 });
        if (r === null) { console.log('skipped: no Chrome'); skipped = true; }
    } catch (e) {
        failures++;
        console.log('ERROR', e && e.stack || e);
    } finally {
        nr.kill();
        edge.close();
        try { fs.rmSync(S, { recursive: true, force: true }); } catch (e) { /* its log may still be open */ }
        console.log(skipped ? '\nSKIPPED' : failures ? `\n${failures} FAILED` : `\n${passed} passed\nALL OK`);
        setTimeout(() => process.exit(failures ? 1 : 0), 300);
    }
})();
