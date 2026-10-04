'use strict';
// The Line Chart end to end, driven by Logic, on a LIVE page of an isolated Node-RED (its own
// userDir in the temp folder — never the user's data/), a real MQTT broker (aedes) and a simulated
// Sparkplug edge. Checks: a series' Live value from a tag; two series both reading msg.payload, each
// from its own Update node; a series' actions (Append / Replace / Clear / Hide); series events
// (Threshold Crossed, Stale, Resume) driving Logic; the chart's actions (Show a range, Follow live,
// annotations) and its Range Change event; the exports (CSV / Excel / PNG) from Update nodes — the
// node's JSON parameters with a trigger's payload ({}, a timestamp), a payload object over them —
// the files captured and read. No page errors.
//   node test/chart-e2e.test.js      (needs Chrome, the dashboard built, ports 1899 / 1898 / 1893 free)
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const D = path.dirname(require.resolve('@kufayeka/node-red-nexa-dashboard/package.json'));
const dashRequire = require('module').createRequire(path.join(D, 'package.json'));
const { Aedes } = dashRequire('aedes');
const mqtt = dashRequire('mqtt');
const sp = require(path.join(D, 'src/server/sparkplug/sparkplugCodec.js'));
const { withPage } = require(path.join(D, 'sdk/testkit/cdp.js'));
const RED_JS = path.resolve(__dirname, '../../../node-red/red.js');
const PORTS = { editor: 1899, pages: 1898, mqtt: 1893 };
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-ui-chart-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, passed = 0, skipped = false;
const check = (label, ok, actual) => { if (!ok) failures++; else passed++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '   actual: ' + JSON.stringify(actual))); };

// ---- the edge: one metric, Temp -------------------------------------------------------------
let temp = 40, mstate = 1;

// ---- the screen ------------------------------------------------------------------------------
const MSG = { $bind: [{ src: 'msg', ref: 'payload' }] };
const stat = (id) => ({ id, type: 'nexa-ui-stat', x: 0, y: 0, w: 200, h: 90, props: { label: 'none', change: '' } });
const sinkOf = (statId, path) => ({ type: 'ui-update', compId: statId, config: { label: { $bind: [{ src: 'msg', ref: path }], static: '?' } } });
const chart = {
    id: 'C1', type: 'nexa-ui-line-chart', x: 20, y: 20, w: 700, h: 320,
    props: {
        exportTitle: 'Main', legend: 'bottom', timeZone: 'utc',
        series: [
            { id: 's1', name: 'Temp', unit: '°C', staleAfter: 1500, separators: 'dot', live: { $bind: [{ src: 'sparkplug', ref: 'G::E1::D1::Temp' }] } },
            { id: 's2', name: 'A', separators: 'dot', live: MSG },
            { id: 's3', name: 'B', separators: 'dot', live: MSG },
            { id: 's4', name: 'Batch', separators: 'dot' }
        ],
        thresholds: [{ value: 50, kind: 'upper', series: 's1', label: 'High', color: '#ef4444' }]
    }
};
// a State Timeline: a row's Live state from a tag, a row from an Update node
const timeline = {
    id: 'C2', type: 'nexa-ui-state-timeline', x: 20, y: 760, w: 700, h: 220,
    props: {
        timeZone: 'utc', exportTitle: 'Line',
        rows: [{ id: 'r1', name: 'Filler', live: { $bind: [{ src: 'sparkplug', ref: 'G::E1::D1::State' }] } }, { id: 'r2', name: 'Capper' }],
        states: [{ label: 'Running', value: '1', color: '#10b981' }, { label: 'Stopped', value: '0', color: '#ef4444' }]
    }
};
const comps = [chart, timeline, Object.assign(stat('pEV'), { y: 360 }), Object.assign(stat('pStale'), { y: 460 }), Object.assign(stat('pResume'), { y: 560 }), Object.assign(stat('pRange'), { y: 660 }), Object.assign(stat('pState'), { x: 740, y: 760 })];
const inj = (id, ms, type, payload) => ({ id, type: 'inject', once: true, onceDelay: ms, intervalMs: 0, payloadType: type, payload });
const item = (id) => ({ list: 'series', id });
const row = (id) => ({ list: 'rows', id });
const nodes = [
    // two series, both msg.payload, each from its own Update node
    inj('iA', 2500, 'num', '5'), { id: 'uA', type: 'ui-update', compId: 'C1', item: item('s2'), config: {} },
    inj('iB', 2500, 'num', '7'), { id: 'uB', type: 'ui-update', compId: 'C1', item: item('s3'), config: {} },
    // a series' actions: append an API's array, then replace it
    inj('iApp', 2600, 'json', '[{"x":1000,"y":3},{"x":2000,"y":4}]'), { id: 'uApp', type: 'ui-update', compId: 'C1', item: item('s4'), action: 'appendPoints', config: {} },
    inj('iRep', 3400, 'json', '[{"x":1000,"y":10},{"x":3000,"y":11}]'), { id: 'uRep', type: 'ui-update', compId: 'C1', item: item('s4'), action: 'replacePoints', config: {} },
    // an annotation (Logic)
    inj('iAnn', 3600, 'json', '{"time":2000,"label":"Batch 1","description":"B-104"}'), { id: 'uAnn', type: 'ui-update', compId: 'C1', action: 'addAnnotation', config: {} },
    // series events -> Logic
    { id: 'eX', type: 'ui-event', compId: 'C1', item: item('s1'), event: 'thresholdCross' }, Object.assign({ id: 'uX' }, sinkOf('pEV', 'payload.direction')),
    { id: 'eS', type: 'ui-event', compId: 'C1', item: item('s1'), event: 'stale' }, Object.assign({ id: 'uS' }, sinkOf('pStale', 'event')),
    { id: 'eR', type: 'ui-event', compId: 'C1', item: item('s1'), event: 'resume' }, Object.assign({ id: 'uR' }, sinkOf('pResume', 'event')),
    // the exports: {} / a timestamp (triggers) keep the node's parameters; a payload object wins
    inj('iX1', 6000, 'json', '{}'), { id: 'uX1', type: 'ui-update', compId: 'C1', action: 'exportData', actionParams: { format: 'xlsx', range: 'all' }, config: {} },
    inj('iX2', 6400, 'date', ''), { id: 'uX2', type: 'ui-update', compId: 'C1', action: 'exportPNG', actionParams: { range: 'visible' }, config: {} },
    inj('iX3', 6800, 'json', '{"format":"csv","range":"all"}'), { id: 'uX3', type: 'ui-update', compId: 'C1', action: 'exportData', actionParams: { format: 'xlsx' }, config: {} },
    // the chart's range (Logic) -> its Range Change event -> Logic; then what is shown, exported
    inj('iRg', 7400, 'json', '{"from":500,"to":3500}'), { id: 'uRg', type: 'ui-update', compId: 'C1', action: 'setRange', config: {} },
    { id: 'eRg', type: 'ui-event', compId: 'C1', event: 'rangeChange' }, Object.assign({ id: 'uRc' }, sinkOf('pRange', 'payload.cause')),
    inj('iX4', 8000, 'date', ''), { id: 'uX4', type: 'ui-update', compId: 'C1', action: 'exportData', actionParams: { format: 'csv' }, config: {} },
    inj('iLive', 8600, 'date', ''), { id: 'uLive', type: 'ui-update', compId: 'C1', action: 'followLive', config: {} },
    // a series hidden: never exported
    inj('iHide', 9000, 'date', ''), { id: 'uHide', type: 'ui-update', compId: 'C1', item: item('s3'), action: 'hide', config: {} },
    inj('iX5', 9400, 'json', '{"format":"csv","range":"all"}'), { id: 'uX5', type: 'ui-update', compId: 'C1', action: 'exportData', config: {} },
    inj('iClr', 9800, 'date', ''), { id: 'uClr', type: 'ui-update', compId: 'C1', item: item('s2'), action: 'clear', config: {} },
    // the State Timeline: a row's history from an Update node; a row's State Change -> Logic; its export
    inj('iSt', 2500, 'json', '[{"start":1000,"end":4000,"state":1},{"start":4000,"end":5000,"state":0,"note":"jam"}]'), { id: 'uSt', type: 'ui-update', compId: 'C2', item: row('r2'), action: 'setStates', config: {} },
    { id: 'eSt', type: 'ui-event', compId: 'C2', item: row('r1'), event: 'stateChange' }, Object.assign({ id: 'uSc' }, sinkOf('pState', 'payload.label')),
    inj('iX6', 10400, 'json', '{"format":"csv","range":"all"}'), { id: 'uX6', type: 'ui-update', compId: 'C2', action: 'exportData', config: {} }
];
const w = (a, b) => ({ id: 'w-' + a + '-' + b, from: a, to: b });
const wires = [w('iA', 'uA'), w('iB', 'uB'), w('iApp', 'uApp'), w('iRep', 'uRep'), w('iAnn', 'uAnn'), w('eX', 'uX'), w('eS', 'uS'), w('eR', 'uR'),
    w('iX1', 'uX1'), w('iX2', 'uX2'), w('iX3', 'uX3'), w('iRg', 'uRg'), w('eRg', 'uRc'), w('iX4', 'uX4'), w('iLive', 'uLive'), w('iHide', 'uHide'), w('iX5', 'uX5'), w('iClr', 'uClr'),
    w('iSt', 'uSt'), w('eSt', 'uSc'), w('iX6', 'uX6')];

function writeFlows() {
    const dir = path.join(S, 'nr-chart');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'settings.js'), 'module.exports = { uiPort: ' + PORTS.editor + ', flowFile: "flows.json", nexaDashboard: { screenWorkerPort: ' + PORTS.pages + ' }, logging: { console: { level: "warn" } }, editorTheme: { tours: false, projects: { enabled: false } } };\n');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'nr-chart', version: '0.0.1', private: true }));
    const project = { id: 'chartproj', type: 'kufayeka-nexa-project', name: 'Chart', sparkplugConnection: 'spc',
        screens: [{ id: 'sC', name: 'Chart', path: '/chart', width: 900, height: 1000, gridSize: 10, snap: false, treeVersion: 1, orphans: [], components: comps, logic: { nodes, wires }, variables: [] }],
        templates: [], types: [], breakpoints: [], theme: null, variables: [] };
    const conn = { id: 'spc', type: 'kufayeka-nexa-sparkplug', name: 'test', brokerUrl: 'mqtt://127.0.0.1:' + PORTS.mqtt, groupFilter: '+', edgeNodeFilter: '+', keepAlive: 30, protocolVersion: '4', reconnectPeriod: 1000, connectTimeout: 10000, clientIdOverride: '' };
    fs.writeFileSync(path.join(dir, 'flows.json'), JSON.stringify([{ id: 'tab1', type: 'tab', label: 'T' }, conn, project], null, 1));
    return dir;
}

async function startEdge() {
    const broker = await Aedes.createBroker();
    const server = net.createServer(broker.handle.bind(broker));
    await new Promise((r) => server.listen(PORTS.mqtt, '127.0.0.1', r));
    const edge = mqtt.connect('mqtt://127.0.0.1:' + PORTS.mqtt, { clientId: 'edge-sim' });
    await new Promise((r) => edge.on('connect', r));
    let seq = 0;
    const birth = () => {
        edge.publish('spBv1.0/G/NBIRTH/E1', sp.encodePayload({ timestamp: Date.now(), seq: seq = 0, metrics: [{ name: 'bdSeq', type: 'UInt64', value: 0 }] }));
        edge.publish('spBv1.0/G/DBIRTH/E1/D1', sp.encodePayload({ timestamp: Date.now(), seq: ++seq % 256, metrics: [{ name: 'Temp', type: 'Double', value: temp }, { name: 'State', type: 'Int32', value: mstate }] }));
    };
    const ddata = () => edge.publish('spBv1.0/G/DDATA/E1/D1', sp.encodePayload({ timestamp: Date.now(), seq: ++seq % 256, metrics: [{ name: 'Temp', type: 'Double', value: temp }] }));
    const dstate = () => edge.publish('spBv1.0/G/DDATA/E1/D1', sp.encodePayload({ timestamp: Date.now(), seq: ++seq % 256, metrics: [{ name: 'State', type: 'Int32', value: mstate }] }));
    edge.subscribe(['spBv1.0/G/NCMD/E1']);
    edge.on('message', (topic, buf) => { const p = sp.decodePayload(buf); if ((p.metrics || []).some((m) => /Rebirth/.test(m.name))) birth(); });
    birth();
    return { birth, ddata, dstate, close: () => { edge.end(true); server.close(); broker.close(); } };
}

// every download the page makes: its name, size, and (CSV / Excel) its text
const CAPTURE = `
window.__downloads = [];
(function () {
    var orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        if (this.download && this.href && this.href.indexOf("blob:") === 0) {
            var rec = { name: this.download, size: 0, text: null, ready: false };
            window.__downloads.push(rec);
            fetch(this.href).then(function (r) { return r.blob(); }).then(function (b) {
                rec.size = b.size;
                return /\\.(csv|xlsx)$/.test(rec.name) ? b.arrayBuffer().then(function (a) { rec.text = new TextDecoder().decode(new Uint8Array(a)); }) : null;
            }).then(function () { rec.ready = true; });
            return;
        }
        return orig.apply(this, arguments);
    };
})();`;

const portFree = (port) => new Promise((resolve) => { const t = net.createServer().once('error', () => resolve(false)).once('listening', () => t.close(() => resolve(true))).listen(port, '127.0.0.1'); });

(async () => {
    for (const p of Object.values(PORTS)) {
        if (!(await portFree(p))) { console.error(`port ${p} is in use (a Node-RED running?) — stop it first`); process.exit(1); }
    }
    const edge = await startEdge();
    const dir = writeFlows();
    const nr = spawn(process.execPath, [RED_JS, '-u', dir], { cwd: path.resolve(RED_JS, '../../..'), stdio: ['ignore', fs.openSync(path.join(S, 'nr.log'), 'w'), fs.openSync(path.join(S, 'nr.err'), 'w')] });
    try {
        for (let i = 0; i < 60; i++) { try { if (await fetch('http://127.0.0.1:' + PORTS.pages + '/nexa/chart').then((r) => r.status === 200)) break; } catch (e) { /* not yet */ } await wait(1000); }
        await wait(2500);
        edge.birth();
        await wait(800);
        const r = await withPage('http://127.0.0.1:' + PORTS.pages + '/nexa/chart', async ({ js, logs }) => {
            const W = `document.querySelector('[data-id="C1"] > *')`;
            const ys = (id) => js(`(function () { var w = ${W}; var s = w.seriesList().filter(function (x) { return x.id === ${JSON.stringify(id)}; })[0]; var b = w._state(s).buf, o = []; for (var i = 0; i < b.count; i++) o.push(b.getY(i)); return o; })()`);
            const label = (id) => js(`(function () { var r = document.querySelector('[data-id="${id}"] > *').renderRoot; var l = r && r.querySelector(".lbl"); return l ? l.textContent.trim() : null; })()`);
            const until = async (fn, ok, ms) => { let v; for (let i = 0; i < (ms || 6000) / 150; i++) { v = await fn(); if (ok(v)) return v; await wait(150); } return v; };
            const downloads = () => js('JSON.stringify(window.__downloads)').then(JSON.parse);

            // 1. a series' Live value from a tag: the value it has now is its first point
            check('Live value from a tag: the first point', JSON.stringify(await until(() => ys('s1'), (v) => v.length >= 1)) === '[40]', await ys('s1'));
            // 2. two series both msg.payload, each from its own Update node
            check('series A: its own message (5)', JSON.stringify(await until(() => ys('s2'), (v) => v.length >= 1)) === '[5]', await ys('s2'));
            check('series B: its own message (7), not A’s', JSON.stringify(await ys('s3')) === '[7]', await ys('s3'));
            // 3. a series' actions: Append (an API's array), then Replace
            check('Batch: Append points, then Replace points', JSON.stringify(await until(() => ys('s4'), (v) => JSON.stringify(v) === '[10,11]')) === '[10,11]', await ys('s4'));
            // 4. Threshold Crossed (40 -> 60 over the upper limit 50) drives Logic
            temp = 60; edge.ddata();
            check('Temp: one more point from the tag', JSON.stringify(await until(() => ys('s1'), (v) => v.length >= 2)) === '[40,60]', await ys('s1'));
            check('On Threshold Crossed -> Logic: "up"', (await until(() => label('pEV'), (v) => v === 'up')) === 'up', await label('pEV'));
            // 5. Stale (no data for 1.5 s), then Resume
            check('On Stale -> Logic', (await until(() => label('pStale'), (v) => v === 'stale', 5000)) === 'stale', await label('pStale'));
            temp = 45; edge.ddata();
            check('On Resume -> Logic', (await until(() => label('pResume'), (v) => v === 'resume')) === 'resume', await label('pResume'));
            check('On Threshold Crossed again: "down" (60 -> 45)', (await until(() => label('pEV'), (v) => v === 'down')) === 'down', await label('pEV'));

            // 6. the exports from Update nodes
            const dl = await until(downloads, (v) => v.filter((x) => x.ready).length >= 3, 9000);
            const [x1, x2, x3] = dl;
            check('Export (Excel) with a {} payload: the node’s JSON parameters (xlsx, all)', x1 && /\.xlsx$/.test(x1.name) && /<sheet name="Info"/.test(x1.text || ''), x1 && { name: x1.name, size: x1.size });
            check('... everything it holds: Batch 10 and 11, the annotation "Batch 1 · B-104"', x1 && /<v>10<\/v>/.test(x1.text) && /<v>11<\/v>/.test(x1.text) && /Batch 1 · B-104/.test(x1.text), null);
            check('... Temp 60 past the upper limit: coloured', x1 && /<c r="B\d+" s="3"><v>60<\/v>/.test(x1.text), null);
            check('Export PNG with an inject timestamp: the node’s parameters (a .png)', x2 && /\.png$/.test(x2.name) && x2.size > 1000, x2 && { name: x2.name, size: x2.size });
            check('Export with a payload object: its keys win (csv over the node’s xlsx)', x3 && /\.csv$/.test(x3.name) && /"Annotation"/.test(x3.text || ''), x3 && { name: x3.name, head: (x3.text || '').slice(0, 80) });
            // 7. Show a range (Logic) -> On Range Change (cause "action") -> Logic; what is shown, exported
            check('Show a time range -> On Range Change -> Logic: "action"', (await until(() => label('pRange'), (v) => v === 'action', 4000)) === 'action', await label('pRange'));
            const d4 = await until(downloads, (v) => v.filter((x) => x.ready).length >= 4, 4000);
            const lines = ((d4[3] && d4[3].text) || '').replace(/^﻿/, '').split('\r\n');
            check('Export what is shown (500…3500 ms): Batch 1000 and 3000, the annotation at 2000; nothing of now', lines.length === 4 && /1970-01-01 00:00:01\.000/.test(lines[1]) && /Batch 1/.test(lines[2]) && /1970-01-01 00:00:03\.000/.test(lines[3]), lines);
            check('Follow live: the chart follows again', (await until(() => js(`!${W}.viewRange`), (v) => v === true)) === true, null);
            // 8. a hidden series: never exported; Clear empties a series
            const d5 = await until(downloads, (v) => v.filter((x) => x.ready).length >= 5, 4000);
            const head5 = ((d5[4] && d5[4].text) || '').replace(/^﻿/, '').split('\r\n')[0];
            check('B hidden (its Hide action): not in the export', head5 === '"Time","Temp (°C)","A","Batch","Annotation"', head5);
            check('A cleared (its Clear action)', JSON.stringify(await until(() => ys('s2'), (v) => v.length === 0)) === '[]', await ys('s2'));

            // 9. the State Timeline
            const ST = `document.querySelector('[data-id="C2"] > *')`;
            const changes = (id) => js(`(function () { var w = ${ST}; return w._row(w.findRow(${JSON.stringify(id)})).ch.map(function (c) { return c.v; }); })()`);
            check('State Timeline: a row from an Update node (Set states)', JSON.stringify(await until(() => changes('r2'), (v) => v.length >= 2)) === '[1,0,null]', await changes('r2'));
            check('... a row’s Live state from a tag: its state now', JSON.stringify(await until(() => changes('r1'), (v) => v.length >= 1)) === '[1]', await changes('r1'));
            check('... On State Change (that row) -> Logic: "Running"', (await until(() => label('pState'), (v) => v === 'Running')) === 'Running', await label('pState'));
            mstate = 0; edge.dstate();
            check('... the tag changes: a new change, On State Change -> "Stopped"', (await until(() => label('pState'), (v) => v === 'Stopped')) === 'Stopped' && JSON.stringify(await changes('r1')) === '[1,0]', await changes('r1'));
            const d6 = await until(downloads, (v) => v.filter((x) => x.ready).length >= 6, 6000);
            const st = ((d6[5] && d6[5].text) || '').replace(/^\ufeff/, '').split('\r\n');
            check('... its export: a row per segment (Capper Running 3 s, Stopped 1 s "jam")', st[0] === '"Row","State","Value","Start","End","Duration (s)","Note"' && st.some((l) => /^"Capper","Running".*,3,""$/.test(l)) && st.some((l) => /^"Capper","Stopped".*,1,"jam"$/.test(l)), st);

            const errs = logs.filter((l) => !/dev mode|DevTools|download/i.test(l));
            check('no errors on the page', errs.length === 0, errs.slice(0, 5));
        }, { width: 1000, height: 1100, initScript: CAPTURE, ready: "!!document.querySelector('[data-id=\"C1\"] > *') && !!document.querySelector('[data-id=\"C2\"] > *')", readyTries: 120 });
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
