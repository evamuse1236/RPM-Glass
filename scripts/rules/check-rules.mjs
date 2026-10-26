// Repo rules that come from Dara's past corrections, checked over source text. Each failure names the file, the line
// and what to use instead. Run: npm run check:rules [-- --root <checkout>] (the root flag replays a rule on an old tree).
// An exception goes on the offending line as `rules-allow <rule-id>: <reason>`.
import fs from 'node:fs';
import ts from 'typescript';
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

const ERROR_NAMES = ['error', 'err', 'e', 'problem', 'failure', 'lastError', 'reason'];

// Every place a caught error's message is read: the usual names plus whatever this file binds in catch clauses,
// dotted or computed access, and destructuring in a catch parameter. A comparison (error.message === '...') is not display.
function rawErrorReads(text) {
  const names = new Set(ERROR_NAMES);
  for (const m of text.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)|\.catch\(\s*(?:async\s+)?\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>/g)) names.add(m[1] ?? m[2]);
  const alt = [...names].map(n => n.replace(/\$/g, '\\$')).join('|');
  const read = new RegExp(`\\b(?:${alt})(?:\\?\\.|\\.)message\\b(?!\\s*[!=]==)|\\b(?:${alt})\\??\\.?\\[\\s*['"]message['"]\\s*\\]`);
  const destructure = /catch\s*\(\s*\{[^}]*\bmessage\b|\.catch\(\s*\(?\s*\{[^}]*\bmessage\b/;
  const fromError = new RegExp(`\\{[^}]*\\bmessage\\b[^}]*\\}\\s*=\\s*(?:${alt})\\b`);
  return line => read.test(line) || destructure.test(line) || fromError.test(line);
}

function taskIdAllocations(text) {
  const source = ts.createSourceFile('task.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), lines = new Set();
  const visit = node => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = node.left, right = node.right;
      const max = ts.isNumericLiteral(left) && left.text === '1' ? right : ts.isNumericLiteral(right) && right.text === '1' ? left : null;
      if (max && ts.isCallExpression(max) && max.expression.getText(source) === 'Math.max' && /\bid\b|\bids\b|taskIds/.test(max.getText(source)))
        lines.add(source.getLineAndCharacterOfPosition(node.getStart(source)).line);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return (_line, index) => lines.has(index);
}

export const RULES = [
  {
    id: 'task-id-counter',
    rule: 'Phone task IDs come from the durable counter, never a maximum of current entries.',
    files: root => ['android-companion', 'chat-prototype', 'intent-v2/src', 'intent-v2/adapters'].flatMap(dir => files(root, dir,
      p => p.endsWith('.mjs') && !p.endsWith('.test.mjs') && path.basename(p) !== 'task-ids.mjs')),
    matcher: taskIdAllocations,
    fix: 'Use nextTaskId(data) from android-companion/task-ids.mjs.',
  },
  {
    id: 'raw-error-text',
    rule: 'An error reaches the screen only through userMessage(error), so a script fault never shows as raw text.',
    files: root => [
      ...files(root, 'android-companion', p => p.endsWith('.mjs') && !p.endsWith('.test.mjs') && !p.endsWith('user-message.mjs')),
      ...files(root, 'intent-v2/src', p => p.endsWith('.mjs') && !p.endsWith('.test.mjs')),
    ],
    matcher: rawErrorReads,
    fix: 'Show userMessage(error) from android-companion/user-message.mjs instead of error.message.',
  },
  {
    id: 'inline-style-attribute',
    rule: 'The companion pages run under style-src \'self\' (CompanionSurface.CSP), which drops style="…" attributes, so markup never carries one.',
    files: root => files(root, 'android-companion', p => /\.(mjs|html)$/.test(p) && !p.endsWith('.test.mjs')),
    matcher: () => line => /\sstyle=["'\\]/.test(line),
    fix: 'Use an SVG presentation attribute, a class, or node.style.setProperty() after the node exists.',
  },
];

export function check(root, rules = RULES) {
  const problems = [];
  for (const r of rules) for (const file of r.files(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const matches = r.matcher(text);
    text.split('\n').forEach((line, i) => {
      if (matches(line, i) && !line.includes(`rules-allow ${r.id}:`))
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
