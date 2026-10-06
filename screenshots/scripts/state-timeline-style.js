// Screenshots of the state-timeline-style chart, light and dark, into ../ (node screenshots/scripts/state-timeline-style.js, or npm run screenshots for all).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1300, height: 900 }, async ({ js, send, logs }) => {
    const now = Date.now(), M = 60000, T = now - 8 * 60 * M;
    const rows = [{ id: 'f', name: 'Filler line 1 — bottle filling station north' }, { id: 'c', name: 'Capper' }, { id: 'l', name: 'Labeler with a long name too' }];
    const focus = { statsCount: true, statsCurrent: true, statsStyles: [{ column: 'statsPercent', size: 20, weight: '700', color: '{token:colors.green.solid}' }], statsHeadSize: 11, statsHeadColor: '{token:colors.blue.solid}' };
    const mount = async (name, props, h) => {
        await js(`NexaTest.mount(${JSON.stringify(name)}, "nexa-ui-state-timeline", ${JSON.stringify(props)}, { width: 1250, height: ${h} })`);
        await js(`(function () { var w = NexaTest.wc(${JSON.stringify(name)}), T = ${T}, M = ${M}; ["f", "c", "l"].forEach(function (id, k) { var ch = []; for (var t = T, i = k; t < ${now}; i++) { ch.push({ time: t, state: [1, 0, 2, 1][i % 4] }); t += (20 + ((i * 37 + k * 11) % 50)) * M; } w.setStates(ch, { list: "rows", id: id }); }); return 1; })()`);
        await js('NexaTest.settle()');
    };
    await mount('a', Object.assign({ rows, nameWrap: true, nameSize: 13, nameWeight: '600', nameWidth: 18, statsWidth: 30, rowHeight: 48 }, focus), 230);
    await mount('b', Object.assign({ rows, showChart: false, nameAlign: 'left', nameSize: 14, legend: 'none' }, focus), 200);
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('NexaTest.wc("a").draw(); NexaTest.wc("b").draw(); NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/state-timeline-style-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
    console.log('logs', logs.filter((x) => !/dev mode/.test(x)).slice(0, 5));
}).then(() => process.exit(0));
