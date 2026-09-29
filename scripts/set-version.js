// Sets the release version everywhere it must match, in one step:
//   npm run version:set 6.8.0
// Updates public/manifest.json, public/sw.js (header + CACHE_NAME),
// public/index.html (nav-version), src/app/00-*.js (app.js header),
// rebuilds public/js/app.js and syncs the Android versionName/versionCode.
// Add the README changelog entry yourself.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('Usage: npm run version:set 6.8.0'); process.exit(1); }
const edit = (rel, fn) => { const p = path.join(root, rel); const before = fs.readFileSync(p, 'utf8'); const after = fn(before); if (after === before) { console.error('No version found in ' + rel); process.exit(1); } fs.writeFileSync(p, after); };
edit('public/manifest.json', s => s.replace(/"version":\s*"[^"]*"/, `"version": "${v}"`));
edit('public/sw.js', s => s.replace(/Service Worker - v[\d.]+/, `Service Worker - v${v}`).replace(/plany-v[\d.]+/, `plany-v${v}`));
edit('public/index.html', s => s.replace(/<span class="nav-version">v[\d.]+<\/span>/, `<span class="nav-version">v${v}</span>`));
const core = fs.readdirSync(path.join(root, 'src', 'app')).filter(f => f.startsWith('00-'))[0];
edit(path.join('src', 'app', core), s => s.replace(/^\/\/ PLANY - Main Application v[\d.]+/, `// PLANY - Main Application v${v}`));
execFileSync(process.execPath, [path.join(__dirname, 'build-app.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(__dirname, 'sync-android-version.js')], { stdio: 'inherit' });
console.log(`Version set to ${v}. Now add a README changelog entry.`);
