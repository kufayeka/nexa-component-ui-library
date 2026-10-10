// Screenshots of "When data is missing", light and dark, into ../ (node screenshots/scripts/missing-data.js, or npm run screenshots for all).
// A machine runs, one value is MISSING (null: a hole of one second), it sends 0 once (a 0 is a value), it is off for 25 s (no data), it runs again.
// Line and Area: Connect / Gap / Gap with a dashed bridge; a stacked Area and the Column Chart's line: the bridge. The second Line series says
// Connect itself, so it stays connected on every chart.
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
fs.mkdirSync(SC, { recursive: true });
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
const T0 = Date.now() - 61000;
const motor = [], pump = [];
for (let i = 0; i <= 60; i++) {
    if (i > 20 && i < 46) continue;                                   // off for 25 s: nothing arrives
    const x = T0 + i * 1000;
    motor.push({ x, y: i === 10 ? null : i === 14 ? 0 : Math.round((40 + Math.sin(i / 4) * 12) * 10) / 10 });
    pump.push({ x, y: Math.round((20 + i / 3) * 10) / 10 });
}
const MODES = [['connect', 'Connect'], ['gap', 'Gap'], ['bridge', 'Gap with a dashed bridge']];
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1000, height: 1200 }, async ({ js, send }) => {
    const size = { width: 940, height: 190 };
    const mount = (name, id, props) => js(`NexaTest.mount(${JSON.stringify(name)}, "nexa-ui-${id}", ${JSON.stringify(props)}, ${JSON.stringify(size)})`);
    for (const [m] of MODES) {
        await mount('line-' + m, 'line-chart', { missing: m, gapAfter: 5000, legend: 'bottom', series: [{ id: 'a', name: 'Motor (A)', live: motor, unit: 'A' }, { id: 'b', name: 'Pump (its own: Connect)', missing: 'connect', live: pump }] });
    }
    for (const [m] of MODES) {
        await mount('area-' + m, 'area-chart', { missing: m, gapAfter: 5000, mode: 'standard', series: [{ id: 'a', name: 'Motor (A)', fillType: 'solid' }] });
    }
    await mount('area-stacked', 'area-chart', { missing: 'bridge', gapAfter: 5000, mode: 'stacked', series: [{ id: 'a', name: 'Motor (A)', fillType: 'solid' }, { id: 'b', name: 'Pump', fillType: 'solid' }] });
    await mount('column-line', 'column-chart', { xType: 'time', missing: 'bridge', gapAfter: 5000, markers: false, xField: 'x', yField: 'y', series: [{ id: 'y', name: 'Motor (A)', type: 'line', width: 3 }], rows: motor });
    await js('NexaTest.settle()');
    for (const [m] of MODES) await js(`NexaTest.wc("area-${m}").appendPoints(${JSON.stringify(motor)}, "a")`);
    await js(`NexaTest.wc("area-stacked").appendPoints(${JSON.stringify(motor)}, "a")`);
    await js(`NexaTest.wc("area-stacked").appendPoints(${JSON.stringify(pump)}, "b")`);
    await js('NexaTest.settle()');
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/missing-data-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
}).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
