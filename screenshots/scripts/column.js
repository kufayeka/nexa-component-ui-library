// Screenshots of the column chart, light and dark, into ../ (node screenshots/scripts/column.js, or npm run screenshots for all).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1300, height: 1250 }, async ({ js, send, logs }) => {
    const mount = async (name, props, w, h) => { await js(`NexaTest.mount(${JSON.stringify(name)}, "nexa-ui-column-chart", ${JSON.stringify(props)}, { width: ${w}, height: ${h} })`); await js('NexaTest.settle()'); };
    const floors = ['Floor 1', 'Floor 2', 'Floor 3', 'Floor 4'], hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'];
    const rows = [];
    hours.forEach((h, hi) => floors.forEach((f, fi) => rows.push({ hour: h, floor: f, kwh: Math.round((20 + fi * 6 + Math.sin(hi + fi) * 8 + hi * 2) * 10) / 10 })));
    hours.forEach((h, i) => rows.push({ hour: h, floor: 'Outdoor °C', kwh: 18 + i * 1.5 }));
    hours.forEach((h, i) => rows.push({ hour: h, floor: 'Plan', kwh: 150 + (i % 2) * 10 }));
    await mount('a', { rows, xField: 'hour', yField: 'kwh', splitField: 'floor', title: 'Energy per floor', subtitle: 'stacked, a line on the right axis, a plan target', stacking: 'stacked', legend: 'right', legendMode: 'table',
        series: [{ id: 'Outdoor °C', name: 'Outdoor °C', type: 'line', axis: 'right', stack: false }, { id: 'Plan', name: 'Plan', type: 'target', color: '{token:colors.gray.solid}' }],
        y2Title: '°C', yTitle: 'kWh', thresholds: [{ kind: 'upper', value: 160, label: 'Contract', shade: true }] }, 1250, 330);
    const plain = rows.filter((r) => floors.indexOf(r.floor) !== -1);
    await mount('b', { rows: plain, xField: 'hour', yField: 'kwh', splitField: 'floor', title: 'Side by side, labels', labels: true, columnFill: 'gradient', legend: 'top',
        thresholds: [{ kind: 'upper', value: 45, colorColumns: true, label: 'Peak 45' }] }, 620, 300);
    await mount('c', { rows: plain, xField: 'hour', yField: 'kwh', splitField: 'floor', title: '100 %', stacking: 'percent', labels: true, labelShow: 'percent', legend: 'bottom' }, 620, 300);
    const defects = [['Scratch', 42], ['Dent', 31], ['Misalign', 18], ['Color', 9], ['Crack', 6], ['Other', 4], ['Burr', 3]].map(([c, v]) => ({ c, v }));
    await mount('d', { rows: defects, xField: 'c', yField: 'v', orientation: 'horizontal', categoryOrder: 'value-desc', topN: 4, labels: true, legend: 'none', title: 'Top 4 defects + Others (horizontal)' }, 620, 280);
    const T0 = Date.now() - 48 * 3600000, trows = [];
    for (let i = 0; i < 48 * 12; i++) ['Line A', 'Line B'].forEach((s, k) => trows.push({ t: T0 + i * 300000, s, v: Math.round((30 + k * 12 + 10 * Math.sin(i / 30 + k) + Math.random() * 4) * 10) / 10 }));
    await mount('e', { rows: trows, xField: 't', yField: 'v', splitField: 's', stacking: 'stacked', bucketBy: 'sum', rangeBar: true, title: 'A time x: stacked columns per bucket', legend: 'bottom', legendValue: 'sum' }, 620, 280);
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/column-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
    console.log('logs', logs.filter((x) => !/dev mode/.test(x)).slice(0, 8));
}).then(() => process.exit(0));
