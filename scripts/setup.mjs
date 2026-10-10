// One-command setup from a fresh clone (npm run setup): deps, Playwright Chromium, assets, .env.local, toolchain check.
// Exits 1 and names every missing piece that `npm test` or `npm run verify` needs.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, findJdk, JDK_HELP, findAndroidSdk, SDK_HELP, run, npmCmd} from './lib/toolchain.mjs';

const missing = [];
const step = (label) => console.log(`\n== ${label}`);

step('Node');
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) missing.push(`Node ${process.versions.node}; need 22 or newer (CI uses 22). Install from https://nodejs.org or \`winget install OpenJS.NodeJS.LTS\`.`);
else console.log(`✔ Node ${process.versions.node}`);

if (!process.argv.includes('--no-install')) {
  step('npm ci');
  if (run(npmCmd, ['ci']) !== 0) missing.push('`npm ci` failed; read its output above.');
  step('Playwright Chromium (browser preview drive in npm run verify)');
  if (run(process.execPath, [path.join(ROOT, 'node_modules/playwright/cli.js'), 'install', 'chromium']) !== 0)
    missing.push('`npx playwright install chromium` failed; read its output above.');
}

step('.env.local');
const env = path.join(ROOT, '.env.local');
if (fs.existsSync(env)) console.log('✔ .env.local exists (left as is)');
else { fs.copyFileSync(path.join(ROOT, '.env.example'), env); console.log('✔ .env.local created from .env.example (names only, all commented out)'); }

step('JDK 17+ (npm test runs the Java host tests)');
const jdk = findJdk();
if (!jdk) missing.push(`No JDK. ${JDK_HELP}`);
else if (jdk.major < 17) missing.push(`JDK ${jdk.major} via ${jdk.from}; need 17 or newer. ${JDK_HELP}`);
else console.log(`✔ JDK ${jdk.major} via ${jdk.from}`);

step('Android SDK (npm run verify builds the debug APK)');
const sdk = findAndroidSdk();
if (!sdk) missing.push(`No Android SDK. ${SDK_HELP}`);
else if (!sdk.platform36 || !sdk.buildTools) missing.push(`Android SDK at ${sdk.dir} lacks ${!sdk.platform36 ? 'platforms;android-36' : 'build-tools;36.0.0'}. ${SDK_HELP}`);
else console.log(`✔ Android SDK via ${sdk.from}, platform 36 and build-tools 36.0.0 present`);

if (fs.existsSync(path.join(ROOT, 'node_modules'))) {
  step('WebView assets (app/src/main/assets/companion, used by npm run dev and the APK)');
  if (run(process.execPath, ['scripts/build-companion-assets.mjs']) !== 0) missing.push('scripts/build-companion-assets.mjs failed; read its output above.');
}

if (missing.length) {
  console.error(`\n✖ Setup incomplete:\n${missing.map(m => `  - ${m}`).join('\n')}`);
  process.exit(1);
}
console.log('\n✔ Setup done. Next: npm test, npm run dev, npm run verify.');
