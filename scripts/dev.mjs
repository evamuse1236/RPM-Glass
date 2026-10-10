// npm run dev [-- --port N]: bundles the WebView assets and serves the planner and Capture in a desktop browser,
// with a stand-in for the Android bridge and sample data (scripts/gauntlet/serve.mjs). No model, no Convex, no phone.
// The real app is Android: see the verify-rpm-glass skill for driving it.
import {run} from './lib/toolchain.mjs';

const i = process.argv.indexOf('--port');
const port = i > 0 ? process.argv[i + 1] : '4173';
if (run(process.execPath, ['scripts/build-companion-assets.mjs']) !== 0) process.exit(1);
console.log(`Planner: http://localhost:${port}/planner.html   Capture: http://localhost:${port}/index.html   (Ctrl+C stops)`);
process.exit(run(process.execPath, ['scripts/gauntlet/serve.mjs', port]));
