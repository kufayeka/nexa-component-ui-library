// Screenshots of the sample-data chart, light and dark, into ../ (node screenshots/scripts/sample-data.js, or npm run screenshots for all).
const path = require('path'), fs = require('fs');
const UI = path.resolve(__dirname, '../..');
const SC = path.resolve(__dirname, '..');
const { withHarness } = require('@kufayeka/node-red-nexa-dashboard/sdk/testkit');
withHarness({ mounts: { '/v': path.join(UI, 'dist') }, modules: ['/v/ui-library.js'], width: 1000, height: 900 }, async ({ js, send }) => {
    const series = [{ id: 's1', name: 'Series 1' }, { id: 's2', name: 'Series 2', type: 'line' }];
    await js(`NexaTest.mount("ed", "nexa-ui-column-chart", ${JSON.stringify({ series })}, { width: 700, height: 300, design: true })`);
    await js(`NexaTest.mount("pg", "nexa-ui-column-chart", ${JSON.stringify({ series })}, { width: 700, height: 300 })`);
    await js(`NexaTest.mount("ln", "nexa-ui-line-chart", {}, { width: 700, height: 240, design: true })`);
    await js(`document.documentElement.setAttribute("data-nexa-mode", "dark"); NexaSDK.setTheme(null, "dark"); 1`);
    await js('new Promise(function (r) { setTimeout(r, 500); })');
    await js('NexaTest.settle()');
    const img = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(SC + '/sample-data.png', Buffer.from(img.result.data, 'base64'));
}).then(() => process.exit(0));
