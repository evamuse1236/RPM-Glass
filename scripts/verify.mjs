// The full gate before saying done (npm run verify): tests and typecheck, Android debug build and lint, the browser
// preview smoke drive at phone and desktop width, and the evidence check. Runs every step, then exits 1 if any failed.
// It does not drive the Android app; changed app code still needs the verify-rpm-glass skill (see AGENTS.md).
import {run, npmCmd} from './lib/toolchain.mjs';

const STEPS = [
  ['npm test (JS, rules, Convex tests, typecheck, Java host tests)', npmCmd, ['test']],
  ['Android debug APK + lint (npm run build:android)', process.execPath, ['scripts/build-android.mjs']],
  ['Planner preview drive at 390x844 and 1440x900', process.execPath, ['scripts/preview-drive.mjs']],
  ['Evidence for changed app code (npm run check:evidence)', process.execPath, ['scripts/agent/require-evidence.mjs']],
];
const results = [];
for (const [label, cmd, args] of STEPS) {
  console.log(`\n== ${label}`);
  results.push([label, run(cmd, args)]);
}
console.log('\n== verify summary');
for (const [label, code] of results) console.log(`${code === 0 ? '✔ PASS' : `✖ FAIL (exit ${code})`}  ${label}`);
process.exit(results.every(([, code]) => code === 0) ? 0 : 1);
