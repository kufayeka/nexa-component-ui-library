// Screenshots of the SPC chart, light and dark, into ../ (node screenshots/scripts/spc.js, or npm run screenshots for all).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1300, height: 1250 }, async ({ js, send, logs }) => {
    const mount = async (name, props, w, h, o) => { await js(`NexaTest.mount(${JSON.stringify(name)}, "nexa-ui-spc", ${JSON.stringify(props)}, ${JSON.stringify(Object.assign({ width: w, height: h }, o || {}))})`); await js('NexaTest.settle()'); };
    let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const g = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u - 3; };
    const t0 = Date.UTC(2026, 9, 6, 0), shaft = [];
    for (let i = 0; i < 60; i++) shaft.push({ time: t0 + i * 6e5, value: +(25 + g() * 0.012 + (i >= 48 ? 0.03 : 0)).toFixed(4), id: 'P' + (1000 + i) });
    await mount('a', { title: 'Shaft diameter (mm), limits locked from the first 25', rows: shaft, idField: 'id', limitsFrom: 'first', baselineCount: 25, usl: 25.06, lsl: 24.94, target: 25, unit: 'mm', ruleSet: 'nelson', notes: [{ key: 'P1048', text: 'Tool changed' }], excluded: ['P1010'] }, 1250, 420);
    const fill = [];
    for (let i = 0; i < 200; i++) fill.push({ time: t0 + i * 6e4, value: +(500 + g() * 1.5 + (i >= 120 ? 1.2 : 0)).toFixed(2) });
    await mount('b', { title: 'Filler weight (g), X̄-R every 5, a phase after the fix', rows: fill, subgroupBy: 'size', subgroupSize: 5, phases: [{ name: 'After nozzle fix', from: String(t0 + 120 * 6e4) }], usl: 506, lsl: 494 }, 1250, 380);
    const rej = [];
    for (let i = 0; i < 30; i++) rej.push({ time: t0 + i * 36e5, defects: Math.max(0, Math.round(8 + g() * 2.5 + (i === 22 ? 12 : 0))), n: 300 + Math.round(rnd() * 200) });
    await mount('c', { title: 'Rejects per hour (p chart, n varies)', rows: rej, dataKind: 'count' }, 620, 320);
    await mount('d', { title: 'Sample (editor)' }, 620, 320, { design: true });
    for (const m of ['light', 'dark']) {
        await js(`document.documentElement.setAttribute("data-nexa-mode", "${m}"); NexaSDK.setTheme(null, "${m}"); document.body.style.background = "${m}" === "dark" ? "#161616" : "#ffffff"; 1`);
        await js('new Promise(function (r) { setTimeout(r, 400); })');
        await js('["a","b","c","d"].forEach(function (n) { NexaTest.wc(n).draw(); }); NexaTest.settle()');
        const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        fs.writeFileSync(SC + '/spc-' + m + '.png', Buffer.from(img.result.data, 'base64'));
    }
    console.log('logs', logs.filter((x) => !/dev mode/.test(x)).slice(0, 5));
}).then(() => process.exit(0));
