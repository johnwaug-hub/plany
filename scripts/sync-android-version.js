// Copies the app version from public/manifest.json into the Android build
// (versionName = "6.6.0", versionCode = 60600) so store builds always match
// the web release. Run: npm run cap:version   (also runs before cap:sync)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8')).version;
const [maj, min, pat] = version.split('.').map(n => parseInt(n, 10) || 0);
const code = maj * 10000 + min * 100 + pat;
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
let g = fs.readFileSync(gradlePath, 'utf8');
const before = g;
g = g.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
if (g === before && !before.includes(`versionName "${version}"`)) {
    console.error('Could not find versionCode/versionName in android/app/build.gradle');
    process.exit(1);
}
fs.writeFileSync(gradlePath, g);
console.log(`Android version set to ${version} (versionCode ${code})`);
