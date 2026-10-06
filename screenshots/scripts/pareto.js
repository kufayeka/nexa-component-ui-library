// Screenshots of the pareto chart, light and dark, into ../ (node screenshots/scripts/pareto.js, or npm run screenshots for all).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1300, height: 1500 }, async ({ js, send, logs }) => {
    const mount = async (name, props, w, h) => { await js(`NexaTest.mount(${JSON.stringify(name)}, "nexa-ui-pareto", ${JSON.stringify(props)}, { width: ${w}, height: ${h} })`); await js('NexaTest.settle()'); };
    const reasons = [['Jam', 142], ['Changeover', 96], ['No material', 61], ['Maintenance', 44], ['Quality hold', 18], ['Operator break', 9], ['Sensor fault', 6], ['Label printer', 4], ['Air pressure', 3], ['Other stop', 2], ['Power dip', 1], ['Cleaning', 1]].map(([name, value]) => ({ name, value }));
    await mount('a', { title: 'Downtime by reason (min) — top 8 + Others', rows: reasons, unit: 'min', topN: 8, leftTitle: 'Minutes', labels: 'value' }, 1250, 330);
    // an event log, counted, a window, its buttons
    const now = Date.now(), defects = ['Scratch', 'Dent', 'Misalign', 'Color', 'Crack', 'Burr'], log = [];
    for (let i = 0; i < 400; i++) { const k = Math.floor(Math.pow(Math.random(), 2.2) * defects.length); log.push({ time: now - Math.random() * 7 * 864e5, defect: defects[k], shift: ['Morning', 'Afternoon', 'Night'][i % 3] }); }
    await mount('b', { title: 'Defects (event log counted), stacked per shift, last 7 days', rows: log, catField: 'defect', valueField: '', timeField: 'time', window: '7d', windowButtons: true, stackField: 'shift', unit: 'pcs', line: 'smooth', lineLabels: true }, 620, 360);
    const before = [], after = [];
    reasons.slice(0, 6).forEach((r, i) => { before.push({ week: 'Week 40', name: r.name, value: r.value }); after.push({ week: 'Week 41 (after the fix)', name: r.name, value: i === 0 ? 30 : Math.round(r.value * 0.9) }); });
    await mount('c', { title: 'Before / after (the same order)', rows: before.concat(after), groupField: 'week', unit: 'min', aligned: false }, 620, 360);
    await mount('d', { title: 'Horizontal (long names)', rows: reasons.slice(0, 7).map((r) => ({ name: r.name + ' — line 1 filler', value: r.value })), orientation: 'horizontal', labels: 'both', line: 'step', lineArea: true }, 620, 360);
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); document.body.style.background = "${m}" === "dark" ? "#161616" : "#ffffff"; 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('["a","b","c","d"].forEach(function (n) { NexaTest.wc(n).draw(); }); NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/pareto-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
    console.log('logs', logs.filter((x) => !/dev mode/.test(x)).slice(0, 5));
}).then(() => process.exit(0));
