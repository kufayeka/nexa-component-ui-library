// Screenshots of the gauge chart, light and dark, into ../ (node screenshots/scripts/gauge.js, or npm run screenshots for all).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1300, height: 1250 }, async ({ js, send, logs }) => {
    const now = Date.now(), M = 60000;
    const hist = (f, n) => { const a = []; for (let i = 0; i < n; i++) a.push({ x: now - (n - i) * M, y: Math.round(f(i) * 10) / 10 }); return a; };
    const mount = async (comp, name, props, w, h, list, data) => {
        await js(`NexaTest.mount(${JSON.stringify(name)}, "nexa-ui-${comp}", ${JSON.stringify(props)}, { width: ${w}, height: ${h} })`);
        await js('NexaTest.settle()');
        for (const [id, d] of Object.entries(data || {})) await js(`NexaTest.wc(${JSON.stringify(name)}).setHistory(${JSON.stringify(d)}, { list: ${JSON.stringify(list)}, id: ${JSON.stringify(id)} })`);
        await js('NexaTest.settle()');
    };
    const steps = [{ from: 0, status: 'success', label: 'Normal' }, { from: 70, status: 'warning', label: 'High' }, { from: 90, status: 'error', label: 'Trip' }];
    // four dials, each a model
    await mount('gauge', 'g1', { gauges: [{ id: 'g1', name: 'Pressure', unit: 'bar', max: 100, target: 80, showPeak: true, deltaFrom: 'previous' }], thresholds: steps, sweep: 240, zones: 'ring', zoneLabels: true }, 300, 260, 'gauges', { g1: hist((i) => 55 + 15 * Math.sin(i / 7), 60) });
    await mount('gauge', 'g2', { gauges: [{ id: 'g2', name: 'Speed', unit: 'rpm', max: 3000 }], thresholds: [{ from: 0, status: 'success' }, { from: 2400, status: 'error', label: 'Over' }], sweep: 180, needle: 'tapered', fill: false, zones: 'track', tickPlace: 'outside', labelPlace: 'outside' }, 300, 260, 'gauges', { g2: hist((i) => 1800 + 300 * Math.sin(i / 5), 60) });
    await mount('gauge', 'g3', { gauges: [{ id: 'g3', name: 'Temperature', unit: '°C', min: -20, max: 120, normalLow: 20, normalHigh: 80, setpoint: 65 }], sweep: 270, fill: false, marker: 'outside', markerSize: 14, minorTicks: 9, tickPlace: 'across', tickList: '-20, 0, 20, 40, 60, 80, 100, 120', thickness: 8 }, 300, 260, 'gauges', { g3: hist((i) => 60 + 10 * Math.sin(i / 6), 60) });
    await mount('gauge', 'g4', { gauges: [{ id: 'g4', name: 'OEE', unit: '%' }], sweep: 360, marker: 'inside', ticks: false, labels: false, thickness: 18, thresholds: [{ from: 0, status: 'error' }, { from: 60, status: 'warning' }, { from: 85, status: 'success' }], zones: 'none' }, 300, 260, 'gauges', { g4: hist((i) => 72 + 3 * Math.sin(i / 4), 60) });
    // a bar gauge per look
    const tanks = ['T-101', 'T-102', 'T-103', 'T-104', 'T-105', 'T-106'].map((n, i) => ({ id: 't' + i, name: n, unit: '%', target: i === 2 ? 75 : '' , showPeak: i === 1 }));
    const tdata = {}; tanks.forEach((t, i) => { tdata[t.id] = hist((k) => 20 + i * 14 + 6 * Math.sin(k / 5 + i), 40); });
    await mount('bar-gauge', 'b1', { bars: tanks, thresholds: steps, mode: 'gradient', zoneStrip: true }, 620, 300, 'bars', tdata);
    await mount('bar-gauge', 'b2', { bars: tanks, thresholds: steps, mode: 'lcd', orientation: 'vertical', ticks: true }, 620, 300, 'bars', tdata);
    await mount('bar-gauge', 'b3', { bars: tanks.slice(0, 4), thresholds: steps, mode: 'basic', ticks: true, sort: 'value-desc', radius: 6 }, 620, 200, 'bars', tdata);
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); document.body.style.background = "${m}" === "dark" ? "#161616" : "#ffffff"; 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('["g1","g2","g3","g4","b1","b2","b3"].forEach(function (n) { NexaTest.wc(n).draw(); }); NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/gauge-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
    console.log('logs', logs.filter((x) => !/dev mode/.test(x)).slice(0, 5));
}).then(() => process.exit(0));
