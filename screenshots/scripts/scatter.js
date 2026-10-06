// Screenshots of the scatter chart, light and dark, into ../ (node screenshots/scripts/scatter.js, or npm run screenshots for all).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1300, height: 1100 }, async ({ js, send, logs }) => {
    const mount = async (name, props, w, h, o) => { await js(`NexaTest.mount(${JSON.stringify(name)}, "nexa-ui-scatter", ${JSON.stringify(props)}, ${JSON.stringify(Object.assign({ width: w, height: h }, o || {}))})`); await js('NexaTest.settle()'); };
    let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u - 3; };
    const ovens = [];
    ['Oven 1', 'Oven 2', 'Oven 3'].forEach((g, k) => { for (let i = 0; i < 150; i++) { const t = 170 + k * 6 + gauss() * 5; ovens.push({ temp: +t.toFixed(1), reject: +(0.2 + (t - 165) * (0.06 + 0.03 * k) + gauss() * 0.4).toFixed(2), oven: g, batch: 'B' + (1000 + i) }); } });
    await mount('a', { title: 'Oven temperature vs reject rate (a fit per oven)', rows: ovens, xField: 'temp', yField: 'reject', groupField: 'oven', labelField: 'batch', fit: 'linear', fitBand: true, xTitle: 'Temperature', xUnit: '°C', yTitle: 'Reject', yUnit: '%', references: [{ axis: 'y', kind: 'line', value: 3, label: 'Reject limit 3 %' }, { axis: 'x', kind: 'band', value: 172, to: 182, label: 'Process window' }] }, 1250, 380);
    const big = [];
    for (let i = 0; i < 60000; i++) { const p = 40 + rnd() * 50; big.push({ power: +p.toFixed(2), temp: +(25 + p * 0.6 + gauss() * 3).toFixed(2) }); }
    for (let i = 0; i < 40; i++) big.push({ power: 40 + rnd() * 50, temp: 95 + rnd() * 20 });
    await mount('b', { title: '60 000 points: density, the outliers as dots', rows: big, xField: 'power', yField: 'temp', xTitle: 'Power', xUnit: 'kW', yTitle: 'Motor temp', yUnit: '°C', fit: 'poly2', fitPer: 'all' }, 620, 340);
    const now = Date.now(), drift = [];
    for (let i = 0; i < 300; i++) drift.push({ x: 10 + i * 0.02 + gauss(), y: 5 + i * 0.01 + gauss() * 0.6, time: now - (300 - i) * 60000, size: rnd() * 100 });
    await mount('c', { title: 'Coloured by time (drift), bubbles, quadrants at the means', rows: drift, timeField: 'time', colorBy: 'time', sizeField: 'size', quadrants: 'mean', quadNames: 'High / high,Low x / high y,Low / low,High x / low y', shapeAround: 'ellipse', legendPosition: 'none' }, 620, 340);
    await mount('d', { title: 'Sample (editor)' }, 620, 300, { design: true });
    await mount('e', { title: 'Hull per group, a shape per group', rows: ovens, xField: 'temp', yField: 'reject', groupField: 'oven', shape: 'group', shapeAround: 'hull', legendPosition: 'right' }, 620, 300);
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); document.body.style.background = "${m}" === "dark" ? "#161616" : "#ffffff"; 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('["a","b","c","d","e"].forEach(function (n) { NexaTest.wc(n).draw(); }); NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/scatter-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
    console.log('logs', logs.filter((x) => !/dev mode/.test(x)).slice(0, 5));
}).then(() => process.exit(0));
