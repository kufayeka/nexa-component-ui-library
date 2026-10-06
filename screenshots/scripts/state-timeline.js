// Screenshots of the state-timeline chart, light and dark, into ../ (node screenshots/scripts/state-timeline.js, or npm run screenshots for all).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1300, height: 820 }, async ({ js, send, logs }) => {
    const now = Date.now(), M = 60000, T = now - 8 * 60 * M;
    const props = {
        rows: [{ id: 'f', name: 'Filler' }, { id: 'c', name: 'Capper' }, { id: 'l', name: 'Labeler', staleAfter: 1000 }, { id: 'p', name: 'Palletizer' }],
        rangeBar: true, legend: 'right', legendMode: 'table', barText: 'both', statsBar: true, rowBadge: true, blinkState: 'Stopped', minDuration: 2 * M, timeWindow: '8h'
    };
    await js(`NexaTest.mount("a", "nexa-ui-state-timeline", ${JSON.stringify(props)}, { width: 1250, height: 300 })`);
    await js('NexaTest.settle()');
    // Filler: run run run appended (one block), a 30 s blip, a stop
    const f = [];
    for (let t = T; t < T + 150 * M; t += 5 * M) f.push({ time: t, state: 1 });
    f.push({ time: T + 150 * M, state: 0 }, { time: T + 151 * M, state: 1 }, { time: T + 151.5 * M, state: 0 }, { time: T + 152 * M, state: 1 });
    f.push({ time: T + 300 * M, state: 2 }, { time: T + 360 * M, state: 1 });
    const c = [{ start: T, end: T + 120 * M, state: 1 }, { start: T + 160 * M, end: T + 300 * M, state: 1 }, { time: T + 300 * M, state: 'JAM' }, { time: T + 340 * M, state: 0 }];
    const l = [{ time: T, state: 1 }, { time: T + 200 * M, state: 2 }, { time: T + 250 * M, state: 1 }];
    const pz = [{ time: T, state: 0 }, { time: T + 60 * M, state: 1 }, { time: T + 420 * M, state: 0 }];
    await js(`(function () { var w = NexaTest.wc("a");
        w.setStates(${JSON.stringify(f.slice(0, 1))}, { list: "rows", id: "f" });
        ${JSON.stringify(f.slice(1))}.forEach(function (x) { w.appendChange(x, { list: "rows", id: "f" }); });
        w.setStates(${JSON.stringify(c)}, { list: "rows", id: "c" });
        w.setStates(${JSON.stringify(l)}, { list: "rows", id: "l" });
        w.setStates(${JSON.stringify(pz)}, { list: "rows", id: "p" });
        w._row(w.rowList()[2]).lastAt = Date.now() - 90 * 60000;
        window.__fch = w._row(w.rowList()[0]).ch.length;
        return 1; })()`);
    await js('new Promise(function (r) { setTimeout(r, 300); })');
    console.log('filler changes kept', await js('window.__fch'));
    await js(`NexaTest.mount("b", "nexa-ui-state-timeline", ${JSON.stringify({ rows: [{ id: 'f', name: 'Filler' }, { id: 'c', name: 'Capper' }], lanes: 'split', legend: 'bottom', legendValue: 'pct', barText: 'duration', statsBar: true })}, { width: 800, height: 300 })`);
    await js(`(function () { var w = NexaTest.wc("b"); w.setStates(${JSON.stringify(f)}, { list: "rows", id: "f" }); w.setStates(${JSON.stringify(c)}, { list: "rows", id: "c" }); return 1; })()`);
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('NexaTest.wc("a").draw(); NexaTest.wc("b").draw(); NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/state-timeline-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
    console.log('logs', logs.filter((x) => !/dev mode/.test(x)).slice(0, 8));
}).then(() => process.exit(0));
