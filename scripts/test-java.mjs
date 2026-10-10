// Plain-JVM checks for Java host classes that need no Android runtime (npm run test:java).
// Node, not bash: on Windows `bash` on PATH is often WSL's, which has no JDK.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, requireJdk, run} from './lib/toolchain.mjs';

const jdk = requireJdk();
const out = path.join(ROOT, '.tooling', 'parser-tests');
fs.mkdirSync(out, {recursive: true});
const SUITES = [
  ['app/src/main/java/com/rpm/prototype/CaptureParser.java', 'tests/CaptureParserTest.java', 'com.rpm.prototype.CaptureParserTest'],
  ['app/src/main/java/com/rpm/prototype/ModelRequests.java', 'tests/ModelRequestsTest.java', 'com.rpm.prototype.ModelRequestsTest'],
];
for (const [source, test, main] of SUITES) {
  if (run(jdk.javac, ['-d', out, source, test]) !== 0) process.exit(1);
  if (run(jdk.java, ['-cp', out, main]) !== 0) process.exit(1);
}
