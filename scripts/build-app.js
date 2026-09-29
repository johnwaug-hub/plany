// Joins src/app/*.js (in file-name order) into public/js/app.js.
//   npm run build           write public/js/app.js
//   node scripts/build-app.js --check   exit 1 if public/js/app.js is out of date
// The browser still loads ONE classic script, so behaviour is identical to the
// old single file (function hoisting and load order are unchanged).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'src', 'app');
const out = path.join(root, 'public', 'js', 'app.js');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
const built = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
if (process.argv.includes('--check')) {
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (current !== built) {
        console.error('public/js/app.js is out of date with src/app/. Run: npm run build');
        process.exit(1);
    }
    console.log(`app.js is up to date (${files.length} source files).`);
} else {
    fs.writeFileSync(out, built);
    console.log(`Built public/js/app.js from ${files.length} files (${built.split('\n').length} lines).`);
}
