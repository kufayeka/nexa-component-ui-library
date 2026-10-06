// Screenshots of the line chart, light and dark, into ../ (node screenshots/scripts/line.js, or npm run screenshots for all).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
fs.mkdirSync(SC, { recursive: true });
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1300, height: 1250 }, async ({ js, send, logs }) => {
    const T0 = Date.now() - 6 * 3600000;
    const pts = (f, n, stepMs) => { const a = []; for (let i = 0; i < n; i++) a.push({ x: T0 + i * stepMs, y: f(i) }); return a; };
    const mount = async (name, props, w, h, data) => {
        await js(`NexaTest.mount(${JSON.stringify(name)}, "nexa-ui-line-chart", ${JSON.stringify(props)}, { width: ${w}, height: ${h} })`);
        await js('NexaTest.settle()');
        for (const [id, d] of Object.entries(data || {})) await js(`NexaTest.wc(${JSON.stringify(name)}).replacePoints(${JSON.stringify(d)}, { list: "series", id: ${JSON.stringify(id)} })`);
        await js('NexaTest.settle()');
    };
    const temp = pts((i) => Math.round((62 + 10 * Math.sin(i / 40) + 3 * Math.sin(i / 7)) * 10) / 10, 720, 30000);
    const press = pts((i) => Math.round((4.2 + 0.8 * Math.sin(i / 55 + 1)) * 100) / 100, 720, 30000);
    await mount('a', {
        series: [{ id: 'temp', name: 'Reactor temp', unit: '°C', fill: 'gradient', variant: 'smooth' }, { id: 'press', name: 'Pressure', unit: 'bar', axis: 'right' }],
        rangeBar: true, legend: 'right', legendMode: 'table', lastValue: true,
        thresholds: [{ kind: 'band', value: 55, to: 68, label: 'Normal', series: 'temp' }, { kind: 'upper', value: 72, label: 'High', shade: true, series: 'temp' }, { kind: 'line', value: 60, label: 'Setpoint', series: 'temp', dash: 'dotted' }]
    }, 1200, 340, { temp, press });
    const pump = pts((i) => (Math.floor(i / 60) % 3 === 0 ? 0 : 1), 720, 30000);
    const mode = pts((i) => [0, 1, 2, 1][Math.floor(i / 120) % 4], 720, 30000);
    await mount('b', {
        series: [{ id: 'pump', name: 'Pump', variant: 'auto', valueMap: '0=Off, 1=Run', fill: 'solid', fillOpacity: 0.15 }, { id: 'mode', name: 'Mode', variant: 'auto', axis: 'right', valueMap: '0=Idle, 1=Fill, 2=Heat' }],
        legend: 'inside-tl', legendValue: 'last', lastValue: true, rangeBar: true, rangeChoices: '1h, 4h, 12h'
    }, 1200, 260, { pump, mode });
    await js(`NexaTest.wc("b").showLast("1h")`); await js('NexaTest.settle()');
    await mount('c', { series: [{ id: 'a', name: 'Line A' }, { id: 'b', name: 'Line B' }, { id: 'c', name: 'Line C' }], legend: 'inside-tr', legendValue: 'avg', lastValue: true }, 590, 240,
        { a: pts((i) => 50 + 20 * Math.sin(i / 50), 720, 30000), b: pts((i) => 51 + 20 * Math.sin(i / 50 + 0.05), 720, 30000), c: pts((i) => 20 + 5 * Math.cos(i / 30), 720, 30000) });
    await mount('d', { series: [{ id: 'a', name: 'Line A' }, { id: 'b', name: 'Line B' }], legend: 'bottom', legendMode: 'table' }, 590, 240,
        { a: pts((i) => 50 + 20 * Math.sin(i / 50), 720, 30000), b: pts((i) => 30 + 5 * Math.cos(i / 30), 720, 30000) });
    await js(`(function () { var w = NexaTest.wc("d"); w.setRange({ from: ${T0 + 3600000}, to: ${T0 + 7200000} }); })()`); await js('NexaTest.settle()');
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/line-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
    console.log('logs', logs.filter((l) => !/dev mode/.test(l)).slice(0, 8));
}).then(() => process.exit(0));
