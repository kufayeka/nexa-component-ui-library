// Screenshots of the Line Chart's Y axes, light and dark, into ../ (node screenshots/scripts/line-shared-axes.js, or npm run screenshots for all):
// the same three series three ways: an axis of their own (the default), ONE shared axis, and mixed (two share one, one has its own).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
fs.mkdirSync(SC, { recursive: true });
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
const N = 200, T0 = Date.now() - N * 1000;
const pts = (base, amp, ph) => Array.from({ length: N }, (_, i) => ({ x: T0 + i * 1000, y: Math.round((base + Math.sin(i / 11 + ph) * amp + (i % 5) * 0.3) * 100) / 100 }));
const S = (id, name, extra, data) => Object.assign({ id, name, live: data }, extra || {});
const d1 = pts(46, 6, 0), d2 = pts(30, 5, 1), d3 = pts(38, 5, 2), dt = pts(71, 3, 0.5);
const kw = { id: 'a1', name: 'Power kW', axisTitle: 'Power (kW)', unit: 'kW' };
const charts = {
    own: { series: [S('s1', 'press1.kW', { unit: 'kW' }, d1), S('s2', 'press2.kW', { unit: 'kW' }, d2), S('s3', 'press3.kW', { unit: 'kW' }, d3)] },
    shared: { axes: [kw], series: [S('s1', 'press1.kW', { yAxis: 'a1', unit: 'kW' }, d1), S('s2', 'press2.kW', { yAxis: 'a1', unit: 'kW' }, d2), S('s3', 'press3.kW', { yAxis: 'a1', unit: 'kW' }, d3)] },
    mixed: { axes: [kw], series: [S('s1', 'press1.kW', { yAxis: 'a1', unit: 'kW' }, d1), S('s2', 'press2.kW', { yAxis: 'a1', unit: 'kW' }, d2), S('t', 'oven temp', { axis: 'right', axisTitle: 'Temp (°C)', unit: '°C' }, dt)] }
};
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1000, height: 1100 }, async ({ js, send }) => {
    for (const k of Object.keys(charts)) await js(`NexaTest.mount(${JSON.stringify('c-' + k)}, "nexa-ui-line-chart", ${JSON.stringify(Object.assign({ legend: 'bottom' }, charts[k]))}, { width: 940, height: 280 })`);
    await js('NexaTest.settle()');
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/line-shared-axes-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
}).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
