// Every chart's screenshots, light and dark, into screenshots/ (one harness browser per script, one after another).
const { execFileSync } = require('child_process'), path = require('path'), fs = require('fs');
for (const f of fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && f !== 'all.js').sort()) {
    console.log('-> ' + f);
    execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
}
