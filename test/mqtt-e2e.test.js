'use strict';
// Plain MQTT topics end to end (.agents/NEXA_MQTT_PLAN.md step 5): a LIVE page of an isolated Node-RED (its own userDir in the temp folder,
// never the user's data/), against a real MQTT broker (aedes). Nothing Sparkplug: the project has no Sparkplug connection at all, only the
// broker, and its bindings and Logic nodes name the broker themselves.
// Checks:
//   1. bindings read: an input bound to a topic, a stat's label bound to one JSON field, a label bound in the shared-variable form;
//   2. a payload published on the broker shows on the page;
//   3. typing into the bound input publishes to its topic;
//   4. an MQTT Read node gives the topic's value to a Function node, which writes it to another topic with vars.shared.set;
//   5. MQTT Write publishes its fixed Value, and msg.payload as JSON when it has no Value;
//   6. the broker goes away: the values are null (the label's static value shows); it comes back: the values are back.
//   node test/mqtt-e2e.test.js      (needs Chrome, the dashboard built, ports 1899 / 1898 / 1893 free)
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('child_process');
const D = path.dirname(require.resolve('@kufayeka/node-red-nexa-dashboard/package.json'));
const dashRequire = require('module').createRequire(path.join(D, 'package.json'));
const { Aedes } = dashRequire('aedes');
const mqtt = dashRequire('mqtt');
const { withPage } = require(path.join(D, 'sdk/testkit/cdp.js'));
const RED_JS = path.resolve(__dirname, '../../../node-red/red.js');
const PORTS = { editor: 1899, pages: 1898, mqtt: 1893 };
const S = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-ui-mqtt-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, passed = 0, skipped = false;
const check = (label, ok, actual) => { if (!ok) failures++; else passed++; console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '   actual: ' + JSON.stringify(actual))); };

// ---- the broker, which can be taken away and brought back -------------------------------------------------------------------------------
async function startBroker() {
    const broker = await Aedes.createBroker();
    const sockets = new Set();
    let server = null;
    const listen = async () => {
        server = net.createServer((socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); broker.handle(socket); });
        await new Promise((r) => server.listen(PORTS.mqtt, '127.0.0.1', r));
    };
    await listen();
    return {
        broker,
        // every connection cut and no new one taken: what a broker that went down looks like to Nexa
        async down() { const closed = new Promise((r) => server.close(r)); sockets.forEach((s) => s.destroy()); await closed; },
        up: listen,
        close() { sockets.forEach((s) => s.destroy()); server.close(); broker.close(); }
    };
}

/** A client of the test: publishes like a device, and keeps what Nexa publishes. */
async function startDevice() {
    const seen = [];
    const client = mqtt.connect('mqtt://127.0.0.1:' + PORTS.mqtt, { clientId: 'device-sim', reconnectPeriod: 500 });
    await new Promise((r) => client.on('connect', r));
    client.subscribe('line1/#');
    client.on('message', (topic, buf, packet) => { seen.push({ topic, text: buf.toString('utf8'), qos: packet.qos }); });
    const publish = (topic, text, retain) => new Promise((r) => client.publish(topic, text, { retain: !!retain, qos: 1 }, r));
    return { seen, publish, last: (topic) => { const m = seen.filter((x) => x.topic === topic).pop(); return m ? m.text : undefined; }, close: () => client.end(true) };
}

// ---- the Node-RED of the test ---------------------------------------------------------------------------------------------------------------
function writeSettings() {
    const dir = path.join(S, 'nr-mqtt');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'settings.js'), 'module.exports = { uiPort: ' + PORTS.editor + ', flowFile: "flows.json", nexaDashboard: { screenWorkerPort: ' + PORTS.pages + ' }, nexa: { workspace: ' + JSON.stringify(path.join(dir, 'nexa-projects')) + ' }, logging: { console: { level: "warn" } }, editorTheme: { tours: false, projects: { enabled: false } } };\n');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'nr-mqtt', version: '0.0.1', private: true }));
    fs.writeFileSync(path.join(dir, 'flows.json'), '[]');
    return dir;
}

async function studio(method, route, body) {
    const response = await fetch('http://127.0.0.1:' + PORTS.editor + '/nexa-studio' + route, {
        method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined
    });
    const answer = await response.json().catch(() => null);
    if (!response.ok) throw new Error(method + ' ' + route + ' -> ' + response.status + ' ' + JSON.stringify(answer));
    return answer;
}

// The broker, the project "Topics" with one screen and its Logic, saved and deployed: what a person does in the Studio, through its routes.
async function studioSetup() {
    const broker = await studio('POST', '/connections', { kind: 'mqtt', name: 'plant', url: 'mqtt://127.0.0.1:' + PORTS.mqtt });
    const B = broker.id;
    const T = (address) => ({ src: 'mqtt', ref: B + '::' + address });
    const components = [
        { id: 'mI', type: 'nexa-ui-input', x: 20, y: 20, w: 240, h: 64, props: { label: 'Order', inputValue: { $bind: [T('line1/order')] } } },
        { id: 'mT', type: 'nexa-ui-stat', x: 20, y: 100, w: 240, h: 96, props: { label: { $bind: [T('line1/data#temp')], static: 'none' }, inputValue: 0, change: '' } },
        { id: 'mS', type: 'nexa-ui-stat', x: 20, y: 210, w: 240, h: 96, props: { label: { $bind: [{ src: 'shared', ref: 'mqtt::' + B + '::line1/state' }], static: 'none' }, inputValue: 0, change: '' } }
    ];
    const nodes = [
        { id: 'i1', type: 'inject', once: true, onceDelay: 2500, intervalMs: 0, payloadType: 'num', payload: '1' },
        { id: 'r1', type: 'mqtt-read', props: { broker: B, topic: 'line1/data', field: 'temp' } },
        { id: 'f1', type: 'function', code: 'window.__readNode = { payload: msg.payload, topic: msg.topic };\nreturn vars.shared.set("mqtt::' + B + '::line1/echo", msg.payload).then(function () { return null; });' },
        { id: 'i2', type: 'inject', once: true, onceDelay: 3000, intervalMs: 0, payloadType: 'num', payload: '1' },
        { id: 'w1', type: 'mqtt-write', props: { broker: B, topic: 'line1/cmd', value: 'START', qos: 1, retain: false } },
        { id: 'i3', type: 'inject', once: true, onceDelay: 3000, intervalMs: 0, payloadType: 'json', payload: '{"speed":42}' },
        { id: 'w2', type: 'mqtt-write', props: { broker: B, topic: 'line1/setpoint', value: '', qos: 0, retain: false } }
    ];
    const wires = [{ id: 'a', from: 'i1', to: 'r1' }, { id: 'b', from: 'r1', to: 'f1' }, { id: 'c', from: 'i2', to: 'w1' }, { id: 'd', from: 'i3', to: 'w2' }];
    const project = await studio('POST', '/projects', { name: 'Topics' });
    const content = await studio('GET', '/projects/' + project.slug + '/content');
    const screen = { id: 'sM', name: 'Topics', path: '/topics', width: 600, height: 400, gridSize: 10, snap: false, treeVersion: 1, orphans: [], components, variables: [] };
    const sheet = { id: 'main', name: 'Main', owner: { kind: 'screen', id: 'sM' }, order: 0, nodes, wires };
    await studio('PUT', '/projects/' + project.slug + '/content', { revision: content.revision, draft: Object.assign({}, content.draft, { screens: [screen], sheets: [sheet] }) });
    await studio('POST', '/projects/' + project.slug + '/deploy');
    return B;
}

const portFree = (port) => new Promise((resolve) => { const t = net.createServer().once('error', () => resolve(false)).once('listening', () => t.close(() => resolve(true))).listen(port, '127.0.0.1'); });

(async () => {
    for (const p of Object.values(PORTS)) {
        if (!(await portFree(p))) { console.error(`port ${p} is in use (a Node-RED running?) — stop it first`); process.exit(1); }
    }
    const broker = await startBroker();
    const device = await startDevice();
    // retained, as a device keeps its last state on the broker: a page that opens later has the values at once
    await device.publish('line1/order', 'PO-7', true);
    await device.publish('line1/data', '{"temp":21.5,"unit":"C"}', true);
    await device.publish('line1/state', 'RUNNING', true);
    const dir = writeSettings();
    const nr = spawn(process.execPath, [RED_JS, '-u', dir], { cwd: path.resolve(RED_JS, '../../..'), stdio: ['ignore', fs.openSync(path.join(S, 'nr-mqtt.log'), 'w'), fs.openSync(path.join(S, 'nr-mqtt.err'), 'w')] });
    try {
        for (let i = 0; i < 60; i++) { try { const ok = await fetch('http://127.0.0.1:' + PORTS.editor + '/nexa-studio/info').then((r) => r.status === 200); if (ok) break; } catch (e) { /* not yet */ } await wait(1000); }
        await studioSetup();
        for (let i = 0; i < 60; i++) { try { const ok = await fetch('http://127.0.0.1:' + PORTS.pages + '/nexa/topics').then((r) => r.status === 200); if (ok) break; } catch (e) { /* not yet */ } await wait(1000); }
        const r = await withPage('http://127.0.0.1:' + PORTS.pages + '/nexa/topics', async ({ js, send, type, key, logs }) => {
            const R = (id) => `(function () { var h = document.querySelector('[data-id="${id}"] > *'); return h && h.renderRoot; })()`;
            const field = (id) => js(`(function () { var r = ${R(id)}; var i = r && r.querySelector("input"); return i ? i.value : null; })()`);
            const label = (id) => js(`(function () { var r = ${R(id)}; var l = r && r.querySelector(".lbl"); return l ? l.textContent.trim() : null; })()`);
            const until = async (what, test, ms) => { const end = Date.now() + (ms || 8000); let v; while (Date.now() < end) { v = await test(); if (v === true) return true; await wait(150); } return false; };

            await until('', async () => (await js(`!!${R('mI')}`)) === true, 15000);
            // 1. the bindings read the retained payloads
            check('read: an input bound to line1/order shows PO-7', await until('', async () => (await field('mI')) === 'PO-7'), await field('mI'));
            check('read: a label bound to the JSON field temp of line1/data shows 21.5', await until('', async () => (await label('mT')) === '21.5'), await label('mT'));
            check('read: a label bound as the shared variable mqtt::…::line1/state shows RUNNING', await until('', async () => (await label('mS')) === 'RUNNING'), await label('mS'));

            // 2. a new payload on the broker shows on the page
            await device.publish('line1/data', '{"temp":30,"unit":"C"}', true);
            check('change: a new payload of line1/data shows 30', await until('', async () => (await label('mT')) === '30'), await label('mT'));

            // 3. typing into the bound input publishes to its topic
            const at = await js(`(function () { var e = ${R('mI')}.querySelector("input"); var b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', buttons: 1, clickCount: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', buttons: 0, clickCount: 1 });
            await js(`(function () { var e = ${R('mI')}.querySelector("input"); e.focus(); e.select(); return 1; })()`);
            await type('PO-8');
            await key('Enter');
            check('write: typing PO-8 + Enter publishes PO-8 to line1/order', await until('', async () => device.last('line1/order') === 'PO-8'), device.last('line1/order'));

            // 4. the MQTT Read node, then vars.shared.set from code
            check('MQTT Read: msg.payload is the field temp, msg.topic the topic', await until('', async () => {
                const got = await js('JSON.stringify(window.__readNode || null)');
                return got === JSON.stringify({ payload: 21.5, topic: 'line1/data' }) || got === JSON.stringify({ payload: 30, topic: 'line1/data' });
            }), await js('JSON.stringify(window.__readNode || null)'));
            check('vars.shared.set("mqtt::…::line1/echo") publishes the value read', await until('', async () => device.last('line1/echo') === '21.5' || device.last('line1/echo') === '30'), device.last('line1/echo'));

            // 5. MQTT Write: its fixed Value with QoS 1; msg.payload as JSON when it has no Value
            check('MQTT Write: the Value START reaches line1/cmd', await until('', async () => device.last('line1/cmd') === 'START'), device.last('line1/cmd'));
            check('MQTT Write: msg.payload {speed:42} is published as JSON', await until('', async () => device.last('line1/setpoint') === '{"speed":42}'), device.last('line1/setpoint'));

            // 6. the broker goes away: null (the static value shows); it comes back: the values are back
            await broker.down();
            check('broker down: the label falls back to its static value', await until('', async () => (await label('mT')) === 'none', 15000), await label('mT'));
            check('broker down: the state label too, never its stale value', await until('', async () => (await label('mS')) === 'none', 5000), await label('mS'));
            await broker.up();
            check('broker back: the retained values are back', await until('', async () => (await label('mT')) === '30' && (await label('mS')) === 'RUNNING', 20000), [await label('mT'), await label('mS')]);

            const errs = logs.filter((l) => !/dev mode|DevTools/.test(l));
            check('no errors on the page', errs.length === 0, errs.slice(0, 5));
        }, { width: 800, height: 600, ready: "!!document.querySelector('[data-id=\"mS\"]')", readyTries: 120 });
        if (r === null) { console.log('skipped: no Chrome'); skipped = true; }
    } catch (e) {
        failures++;
        console.log('ERROR', e && e.stack || e);
    } finally {
        nr.kill();
        device.close();
        broker.close();
        try { fs.rmSync(S, { recursive: true, force: true }); } catch (e) { /* its log may still be open */ }
        console.log(skipped ? '\nSKIPPED' : failures ? `\n${failures} FAILED` : `\n${passed} passed\nALL OK`);
        setTimeout(() => process.exit(failures ? 1 : 0), 300);
    }
})();
