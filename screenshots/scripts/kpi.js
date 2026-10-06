// Screenshots of the kpi chart, light and dark, into ../ (node screenshots/scripts/kpi.js, or npm run screenshots for all).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1300, height: 1000 }, async ({ js, send, logs }) => {
    const now = Date.now(), M = 60000;
    const hist = (f, n, step) => { const a = []; for (let i = 0; i < n; i++) a.push({ x: now - (n - i) * step, y: Math.round(f(i) * 100) / 100 }); return a; };
    const mount = async (name, props, w, h, data) => {
        await js(`NexaTest.mount(${JSON.stringify(name)}, "nexa-ui-kpi", ${JSON.stringify(props)}, { width: ${w}, height: ${h} })`);
        await js('NexaTest.settle()');
        for (const [id, d] of Object.entries(data || {})) await js(`NexaTest.wc(${JSON.stringify(name)}).setHistory(${JSON.stringify(d)}, { list: "tiles", id: ${JSON.stringify(id)} })`);
        await js('NexaTest.settle()');
    };
    await mount('a', {
        tiles: [
            { id: 'e', name: 'Energy today', unit: 'kWh', reduceBy: 'sum', window: '24h', deltaFrom: 'ago', deltaAgo: '1h', upIsGood: false, subtitle: 'vs 1 h ago' },
            { id: 'p', name: 'Peak demand', unit: 'kW', reduceBy: 'last', notation: 'standard', decimals: '1', deltaFrom: 'previous' },
            { id: 'pf', name: 'Power factor', decimals: '2', normalLow: 0.92, normalHigh: 1, sparkMin: 0.8, sparkMax: 1, spark: 'line' },
            { id: 'c', name: 'Output', unit: 'pcs', target: 12000, reduceBy: 'last', deltaFrom: 'target', subtitle: 'plan 12 000' }
        ],
        thresholds: [{ from: 0, status: 'success', tile: 'p' }, { from: 400, status: 'warning', label: 'High', tile: 'p' }, { from: 480, status: 'error', label: 'Alarm', tile: 'p' }]
    }, 1250, 170, {
        e: hist((i) => 30 + 10 * Math.sin(i / 7), 96, 15 * M), p: hist((i) => 380 + 60 * Math.sin(i / 5) + (i > 55 ? 40 : 0), 60, M),
        pf: hist((i) => 0.93 + 0.02 * Math.sin(i / 4) - (i > 50 ? 0.03 : 0), 60, M), c: hist((i) => i * 160, 60, M)
    });
    await mount('b', { tiles: [{ id: 't', name: 'Oven temperature', unit: '°C', decimals: '1' }, { id: 'h', name: 'Humidity', unit: '%', sparkMin: 0, sparkMax: 100 }], colorMode: 'background', arrangement: 'side',
        thresholds: [{ from: 0, status: 'success' }, { from: 200, status: 'error', label: 'Overheat', tile: 't' }, { from: 70, status: 'warning', tile: 'h' }] }, 620, 130,
        { t: hist((i) => 180 + i * 0.6, 60, M), h: hist((i) => 45 + 5 * Math.sin(i / 6), 60, M) });
    await mount('c', { tiles: [{ id: 'x', name: 'Line speed (sparkline only)', unit: 'm/min' }, { id: 'y', name: 'Pump 2', staleAfter: 1000 }], showValue: true, arrangement: 'background' }, 620, 130,
        { x: hist((i) => 120 + 10 * Math.sin(i / 3), 60, M), y: hist((i) => 3 + Math.sin(i / 5), 60, M) });
    await js(`(function () { var w = NexaTest.wc("c"); var st = w._state(w.tileList()[1]); st.lastAt = Date.now() - 5 * 60000; st.stale = true; w.draw(); return 1; })()`);
    await mount('d', { tiles: [{ id: 's', name: 'Throughput', spark: 'bars' }], showValue: false, tileBorder: false }, 300, 80, { s: hist((i) => 50 + 20 * Math.sin(i / 4), 40, M) });
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('["a","b","c","d"].forEach(function (n) { NexaTest.wc(n).draw(); }); NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/kpi-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
    console.log('logs', logs.filter((x) => !/dev mode/.test(x)).slice(0, 5));
}).then(() => process.exit(0));
