// Repo rules that come from Dara's past corrections, checked over source text. Each failure names the file, the line
// and what to use instead. Run: npm run check:rules [-- --root <checkout>] (the root flag replays a rule on an old tree).
// An exception goes on the offending line as `rules-allow <rule-id>: <reason>`.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function files(root, dir, keep) {
  const out = [];
  const walk = d => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, {withFileTypes: true})) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) { if (!['node_modules', 'build', 'assets'].includes(entry.name)) walk(p); }
      else if (keep(p)) out.push(p);
    }
  };
  walk(path.join(root, dir));
  return out;
}

export const RULES = [
  {
    id: 'raw-error-text',
    rule: 'An error reaches the screen only through userMessage(error), so a script fault never shows as raw text.',
    files: root => files(root, 'android-companion', p => p.endsWith('.mjs') && !p.endsWith('.test.mjs') && !p.endsWith('user-message.mjs')),
    match: line => /\b(?:error|err|e|problem|lastError)\??\.message\b(?!\s*[!=]==)/.test(line),
    fix: 'Show userMessage(error) from android-companion/user-message.mjs instead of error.message.',
  },
];

export function check(root, rules = RULES) {
  const problems = [];
  for (const r of rules) for (const file of r.files(root)) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (r.match(line) && !line.includes(`rules-allow ${r.id}:`))
        problems.push(`rule ${r.id}: ${path.relative(root, file).replace(/\\/g, '/')}:${i + 1}: ${r.rule} ${r.fix}`);
    });
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootArg = process.argv.indexOf('--root');
  const root = path.resolve(rootArg > 0 ? process.argv[rootArg + 1] : path.join(here, '../..'));
  const problems = check(root);
  for (const p of problems) console.error(p);
  console.log(problems.length ? `✖ ${problems.length} rule violation(s)` : `✔ ${RULES.length} rule(s) hold in ${path.relative(process.cwd(), root) || '.'}`);
  process.exit(problems.length ? 1 : 0);
}
