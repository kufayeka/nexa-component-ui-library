// Screenshots of the pie chart, light and dark, into ../ (node screenshots/scripts/pie.js, or npm run screenshots for all).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1300, height: 1450 }, async ({ js, send, logs }) => {
    const mount = async (name, props, w, h) => { await js(`NexaTest.mount(${JSON.stringify(name)}, "nexa-ui-pie", ${JSON.stringify(props)}, { width: ${w}, height: ${h} })`); await js('NexaTest.settle()'); };
    const reasons = [['Jam', 142], ['Changeover', 96], ['No material', 61], ['Maintenance', 44], ['Quality hold', 18], ['Operator break', 9], ['Sensor fault', 4], ['Label printer', 3], ['Air pressure', 2], ['Other stop', 1]].map(([name, value]) => ({ name, value }));
    await mount('a', { title: 'Downtime by reason (min)', rows: reasons, unit: 'min', legend: 'right', legendMode: 'table', slices: [] }, 620, 300);
    await mount('b', { title: 'Machine states (status colours)', kind: 'pie', legend: 'bottom', labelShow: 'name-percent',
        slices: [{ id: 'r', name: 'Running', status: 'success' }, { id: 'i', name: 'Idle', status: 'warning' }, { id: 's', name: 'Stopped', status: 'error' }, { id: 'u', name: 'Setup', status: 'info' }] }, 620, 300);
    for (const [id, v] of [['r', 412], ['i', 64], ['s', 31], ['u', 22]]) await js(`NexaTest.wc("b").setValue(${v}, { list: "slices", id: "${id}" })`);
    await mount('c', { title: 'Energy by area (half donut)', half: true, rows: [{ name: 'HVAC', value: 420 }, { name: 'Lighting', value: 180 }, { name: 'Process', value: 760 }, { name: 'IT', value: 95 }], unit: 'kWh', legend: 'bottom', labelShow: 'percent', slices: [] }, 620, 260);
    const multi = [];
    ['Filler', 'Capper', 'Labeler'].forEach((m, k) => reasons.slice(0, 5).forEach((r, i) => multi.push({ machine: m, name: r.name, value: Math.round(r.value * (0.5 + ((i + k) % 3) * 0.4)) })));
    await mount('d', { title: 'Downtime per machine', rows: multi, groupField: 'machine', legend: 'bottom', topN: 4, labelShow: 'percent', center: 'total', centerLabel: 'min', slices: [] }, 900, 280);
    const areas = [['Assembly', 64], ['Packing', 48], ['Welding', 36], ['Painting', 27], ['Machining', 20], ['QC', 14], ['Warehouse', 9]].map(([name, value]) => ({ name, value }));
    await mount('f', { title: 'Rose: equal angles (Nightingale)', rows: areas, kind: 'pie', rose: 'equal', legend: 'none', labelShow: 'name', slices: [] }, 420, 300);
    await mount('g', { title: 'Rose: angle and radius by value', rows: areas, rose: 'both', ringWidth: 70, legend: 'none', labelShow: 'name-percent', slices: [] }, 420, 300);
    await mount('e', { title: 'Others opened', rows: reasons, legend: 'none', topN: 4, slices: [] }, 420, 260);
    await js(`(function () { var w = NexaTest.wc("e"); w._open = ""; w.draw(); w.requestUpdate(); return 1; })()`);
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); document.body.style.background = "${m}" === "dark" ? "#161616" : "#ffffff"; 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('["a","b","c","d","e","f","g"].forEach(function (n) { NexaTest.wc(n).draw(); }); NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/pie-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
    console.log('logs', logs.filter((x) => !/dev mode/.test(x)).slice(0, 5));
}).then(() => process.exit(0));
