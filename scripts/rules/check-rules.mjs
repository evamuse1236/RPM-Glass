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

// Lines holding a `*/` outside any comment. In CSS a comment ends at the first `*/`, so a path like res/values*/colors.xml
// inside a comment closes it early and the browser silently drops the next rule (a5352a5 lost the Google Sans Flex @font-face).
// Quotes are not tracked: the text after an early close is comment prose, where an apostrophe would hide the stray `*/`.
// A real `*/` inside a CSS string takes `rules-allow css-comment-close: <reason>` on its line.
function strayCommentClose(text) {
  const bad = new Set();
  let line = 1, inComment = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], two = text.slice(i, i + 2);
    if (c === '\n') { line++; continue; }
    if (inComment) { if (two === '*/') { inComment = false; i++; } continue; }
    if (two === '/*') { inComment = true; i++; } else if (two === '*/') { bad.add(line); i++; }
  }
  return (_, index) => bad.has(index + 1);
}

// Lines of the package.json "scripts" block that call bash, sh or a .sh file. From PowerShell or cmd, `bash` is often
// WSL's, which has no Node or JDK.
function bashInNpmScript(text) {
  const lines = text.split('\n');
  const start = lines.findIndex(l => /^\s*"scripts":\s*\{/.test(l));
  const end = start < 0 ? -1 : lines.findIndex((l, i) => i > start && /^\s*\}/.test(l));
  const calls = /^\s*"[^"]+":\s*"(?:[^"]*[\s;&|(])?(?:bash|sh)(?:[\s"]|$)|^\s*"[^"]+":\s*"[^"]*\.sh\b/;
  return (line, index) => start >= 0 && index > start && (end < 0 || index < end) && calls.test(line);
}

export const RULES = [
  {
    id: 'css-comment-close',
    rule: 'A CSS comment must not contain "*/": it ends the comment early and the browser silently drops the next rule.',
    files: root => [...files(root, 'android-companion', p => p.endsWith('.css')), ...files(root, 'chat-prototype', p => p.endsWith('.css'))],
    matcher: strayCommentClose,
    fix: 'Reword the comment so it has no "*/" (write res/values/colors.xml and res/values-night/colors.xml, not res/values*/colors.xml).',
  },
  {
    id: 'bash-in-npm-script',
    rule: 'npm scripts run from PowerShell, cmd and Git Bash, so none calls bash or a .sh file.',
    files: root => [path.join(root, 'package.json')].filter(p => fs.existsSync(p)),
    matcher: bashInNpmScript,
    fix: 'Write the step as a Node script under scripts/ and use scripts/lib/toolchain.mjs to find the JDK, Android SDK or npm.',
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
