// Screenshots of the Radar chart, light and dark, into ../ (node screenshots/scripts/radar.js, or npm run screenshots for all).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1300, height: 1160 }, async ({ js, send, logs }) => {
    const mount = async (name, props, w, h, o) => { await js(`NexaTest.mount(${JSON.stringify(name)}, "nexa-ui-radar", ${JSON.stringify(props)}, ${JSON.stringify(Object.assign({ width: w, height: h }, o || {}))})`); await js('NexaTest.settle()'); };
    const oee = [{ series: 'Line 11', OEE: 78, Availability: 88, Performance: 84, Quality: 97, 'On-time': 72, Safety: 92 }, { series: 'Line 12', OEE: 64, Availability: 71, Performance: 93, Quality: 90, 'On-time': 86, Safety: 78 }];
    await mount('a', { title: 'OEE parts per line, target 85 %', rows: oee, max: 100, unit: '%', target: 85, legend: 'right' }, 620, 380);
    const axes = [{ name: 'Output', field: 'out', unit: 'pcs', target: 1200 }, { name: 'Energy / pc', field: 'kwh', unit: 'kWh', better: 'lower', target: 0.45 }, { name: 'Scrap', field: 'scrap', unit: '%', better: 'lower', target: 2, bandLow: 0, bandHigh: 2 },
        { name: 'Uptime', field: 'up', unit: '%', min: 0, max: 100, target: 90 }, { name: 'Changeover', field: 'co', unit: 'min', better: 'lower', target: 25 }];
    await mount('b', { title: 'Different units: each axis its own scale, lower-is-better turned round', rows: [{ series: 'Shift A', out: 1250, kwh: 0.41, scrap: 1.4, up: 93, co: 22 }, { series: 'Shift B', out: 1010, kwh: 0.52, scrap: 3.1, up: 84, co: 35 }], axes, scale: 'axis', lineStyle: 'smooth', axisLabels: 'name-value', ringLabels: 'none' }, 620, 380);
    const lines = ['L11', 'L12', 'L13', 'L14', 'L15', 'L16'].map((l, i) => ({ series: l, OEE: 60 + (i * 7) % 30, Avail: 70 + (i * 11) % 25, Perf: 65 + (i * 13) % 30, Quality: 85 + (i * 5) % 14, Delivery: 60 + (i * 17) % 35 }));
    await mount('c', { title: '6 lines: small multiples (past 3 series)', rows: lines, max: 100, target: 80, grid: 'circle', legend: 'none', valueLabels: false }, 1250, 330);
    await mount('d', { title: 'Sample (editor)' }, 620, 320, { design: true });
    await mount('e', { title: 'Production by tariff period', rows: [{ series: 'Bottles', Peak: 4200, 'Off peak': 9800, Shoulder: 6100 }], grid: 'polygon', valueLabels: true, legend: 'none', fillOpacity: 0.1 }, 620, 320);
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); document.body.style.background = "${m}" === "dark" ? "#161616" : "#ffffff"; 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('["a","b","c","d","e"].forEach(function (n) { NexaTest.wc(n).draw(); }); NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/radar-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
    console.log('logs', logs.filter((x) => !/dev mode/.test(x)).slice(0, 5));
}).then(() => process.exit(0));
