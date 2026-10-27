import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname, join, normalize} from 'node:path';
import ts from 'typescript';

const NODE24 = 'scripts/web-sync/node24.mjs';
const isTest = file => /\.test\.[cm]?[jt]s$|(^|\/)(test|tests|_generated|node_modules)\//.test(file);
const tracked = (...paths) => execFileSync('git', ['ls-files', '--', ...paths], {encoding: 'utf8'}).split('\n').filter(Boolean);
const parse = (text, file) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

const UTC_READS = new Map();
const UNZONED_HANDLERS = new Map();
const OWN_NODE_PIN = new Map([
  ['.claude/skills/verify-rpm-glass/lib/local-convex.mjs', 'Runs every Convex call through its own NODE_24 mise command; the pin must equal node24.mjs.'],
]);
// Started as a child of an already pinned process, so an import of node24.mjs would only rerun tests that load them.
const STARTED_ON_PIN = new Map([
  ['scripts/web-sync/deploy-rehearsal.mjs', 'Started only by deploy-prod-guards.mjs with process.execPath, after deploy-prod.mjs called requireNode24().'],
  ['scripts/web-sync/deploy-prod-guards.mjs', 'Imported by deploy-prod.mjs (pinned) and by deploy-rehearsal.mjs (started on that Node 24 process).'],
]);

const LOCAL_METHODS = /^(get|set)(Hours|Minutes|Seconds|Milliseconds|Date|Day|Month|FullYear|Year)$|^getTimezoneOffset$|^toLocale(Date|Time)?String$|^to(Date|Time)String$/;
const PLANNER_MODULES = /^\.\.\/(android-companion|chat-prototype)\/(?!zoned-time\.mjs$)/;

const isFunction = node => ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
const calleeName = node => ts.isIdentifier(node.expression) ? node.expression.text
  : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
const insideZone = node => {
  for (let at = node; at; at = at.parent)
    if (isFunction(at) && ts.isCallExpression(at.parent) && calleeName(at.parent) === 'withTimeZone' && at.parent.arguments[1] === at) return true;
  return false;
};
const isDate = node => ts.isIdentifier(node) && node.text === 'Date';

function localRead(node) {
  if (ts.isNewExpression(node) && isDate(node.expression)) {
    const args = node.arguments ?? [];
    if (args.length > 1) return 'new Date(fields)';
    if (args.length === 1 && (ts.isStringLiteral(args[0]) || ts.isTemplateExpression(args[0]) || ts.isNoSubstitutionTemplateLiteral(args[0]))) return 'new Date(text)';
    return null;
  }
  if (!ts.isCallExpression(node)) return null;
  if (isDate(node.expression)) return 'Date()';
  const target = node.expression;
  if (!ts.isPropertyAccessExpression(target)) return null;
  if (isDate(target.expression) && target.name.text === 'parse') return 'Date.parse';
  if (target.expression.getText() === 'Intl' && target.name.text === 'DateTimeFormat') return 'Intl.DateTimeFormat';
  return LOCAL_METHODS.test(target.name.text) ? target.name.text : null;
}

export function unzonedReads(text, file) {
  const found = [];
  const visit = node => {
    if (ts.isNewExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.getText() === 'Intl.DateTimeFormat' && !insideZone(node))
      found.push('Intl.DateTimeFormat');
    const read = localRead(node);
    if (read && !insideZone(node)) found.push(read);
    ts.forEachChild(node, visit);
  };
  visit(parse(text, file));
  return found;
}

export function unzonedPlannerCalls(text, file) {
  const source = parse(text, file), planner = new Set(), found = [];
  for (const statement of source.statements)
    if (ts.isImportDeclaration(statement) && PLANNER_MODULES.test(statement.moduleSpecifier.text))
      for (const element of statement.importClause?.namedBindings?.elements ?? []) planner.add(element.name.text);
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && planner.has(node.expression.text) && !insideZone(node)) found.push(node.expression.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const useNode = text => /^\s*["']use node["']/.test(text);
const nodeFiles = () => tracked('convex').filter(file => /\.ts$/.test(file) && !isTest(file) && useNode(readFileSync(file, 'utf8')));

function zonedExports(file) {
  const zoned = new Set();
  for (const statement of parse(readFileSync(file, 'utf8'), file).statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    let calls = false;
    const visit = node => { if (ts.isCallExpression(node) && calleeName(node) === 'withTimeZone') calls = true; ts.forEachChild(node, visit); };
    visit(statement);
    if (calls) zoned.add(statement.name.text);
  }
  return zoned;
}

export function unzonedHandlers(text, file) {
  const source = parse(text, file), imports = new Map(), found = [];
  for (const statement of source.statements)
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text.startsWith('./'))
      for (const element of statement.importClause?.namedBindings?.elements ?? [])
        imports.set(element.name.text, join(dirname(file), `${statement.moduleSpecifier.text}.ts`));
  const visit = node => {
    if (ts.isCallExpression(node) && /^(internal)?[aA]ction$/.test(calleeName(node))) {
      const handler = node.arguments[0]?.properties?.find(property => property.name?.getText() === 'handler');
      let reaches = false;
      const walk = inner => {
        if (ts.isCallExpression(inner)) {
          const name = calleeName(inner);
          if (name === 'withTimeZone' || (imports.has(name) && zonedExports(imports.get(name)).has(name))) reaches = true;
        }
        ts.forEachChild(inner, walk);
      };
      if (handler) walk(handler);
      const owner = node.parent;
      if (!reaches) found.push(ts.isVariableDeclaration(owner) ? owner.name.getText() : '<anonymous>');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function checkAllowed(allowed, entries) {
  assert.deepEqual([...allowed].filter(([, reason]) => reason.trim().length < 10).map(([key]) => key), [], 'Give each allow-list entry a reason');
  const seen = new Set(), problems = [];
  for (const [key, message] of entries) allowed.has(key) ? seen.add(key) : problems.push(`${key}: ${message}`);
  assert.deepEqual(problems, []);
  assert.deepEqual([...allowed.keys()].filter(key => !seen.has(key)), [], 'Remove allow-list entries that no longer match');
}

test('"use node" Convex files read local time only inside withTimeZone', () => {
  const files = nodeFiles();
  assert.ok(files.length > 0);
  checkAllowed(UTC_READS, files.flatMap(file => {
    const text = readFileSync(file, 'utf8');
    return [...unzonedReads(text, file), ...unzonedPlannerCalls(text, file)]
      .map(read => [`${file}:${read}`, 'run it inside withTimeZone(row.timezone, …), or list it in UTC_READS with a reason']);
  }));
});

test('every "use node" action reaches withTimeZone', () => {
  checkAllowed(UNZONED_HANDLERS, nodeFiles().flatMap(file => unzonedHandlers(readFileSync(file, 'utf8'), file)
    .map(name => [`${file}:${name}`, 'call withTimeZone, or a function of a sibling file that calls it, or list it with a reason'])));
});

export function launchesConvex(text, file) {
  let found = false;
  const visit = node => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))
      && /convex\/bin\/main\.js|convex\/package\.json|convex-local-backend/.test(node.text)) found = true;
    if (ts.isArrayLiteralExpression(node)) {
      const words = node.elements.map(element => ts.isStringLiteral(element) ? element.text : null);
      if (words.some((word, index) => word === 'convex' && /^(dev|deploy|import|run|env)$/.test(words[index + 1] ?? ''))) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(text, file));
  return found;
}

const importsOf = (text, file) => parse(text, file).statements
  .filter(statement => ts.isImportDeclaration(statement) && statement.moduleSpecifier.text.startsWith('.'))
  .map(statement => normalize(join(dirname(file), statement.moduleSpecifier.text)));

test('every script that starts Convex runs on Node 24 through node24.mjs', () => {
  const files = tracked('*.mjs', '*.js').filter(file => !isTest(file) && !file.startsWith('convex/'));
  const texts = new Map(files.map(file => [file, readFileSync(file, 'utf8')]));
  const importers = new Map();
  for (const [file, text] of texts) for (const target of importsOf(text, file)) importers.set(target, [...(importers.get(target) ?? []), file]);
  const pinned = (file, path = new Set()) => {
    if (path.has(file)) return false;
    if (importsOf(texts.get(file), file).includes(NODE24)) return true;
    const users = importers.get(file) ?? [];
    return users.length > 0 && users.every(user => pinned(user, new Set([...path, file])));
  };
  checkAllowed(new Map([...OWN_NODE_PIN, ...STARTED_ON_PIN]), files.filter(file => launchesConvex(texts.get(file), file) && !pinned(file))
    .map(file => [file, `add import '${NODE24}' (relative) as the first import`]));
});

test('package scripts start Convex only through the Node 24 wrapper', () => {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  const bare = Object.entries(scripts).filter(([, command]) => /(^|[;&|]\s*)(npx\s+)?convex\s/.test(command)).map(([name]) => name);
  assert.deepEqual(bare, [], 'Use node scripts/web-sync/convex-cli.mjs');
  assert.ok(Object.values(scripts).some(command => command.includes('scripts/web-sync/convex-cli.mjs')));
  assert.match(readFileSync('scripts/web-sync/convex-cli.mjs', 'utf8'), /^import '\.\/node24\.mjs';/);
});

test('the skill\'s own Node pin matches node24.mjs', () => {
  const pin = file => readFileSync(file, 'utf8').match(/node@24\.\d+\.\d+/g);
  const [version] = pin(NODE24);
  for (const file of OWN_NODE_PIN.keys()) assert.deepEqual([...new Set(pin(file))], [version], file);
});

test('the Node checks see local-time reads, launches and handlers', () => {
  assert.deepEqual(unzonedReads(`new Date().getHours();Date.parse(s);new Date(2026,1,1);new Date('2026-01-01T09:00');x.toLocaleString();new Intl.DateTimeFormat();Date();`, 'x.ts'),
    ['getHours', 'Date.parse', 'new Date(fields)', 'new Date(text)', 'toLocaleString', 'Intl.DateTimeFormat', 'Date()']);
  assert.deepEqual(unzonedReads(`Date.now();new Date(ms).toISOString();x.getUTCHours();withTimeZone(z,()=>new Date().getHours());`, 'x.ts'), []);
  assert.deepEqual(unzonedPlannerCalls(`import {editPlan} from "../android-companion/planner-state.mjs";import {withTimeZone} from "../android-companion/zoned-time.mjs";editPlan(d);withTimeZone(z,()=>editPlan(d));`, 'x.ts'), ['editPlan']);
  assert.deepEqual(unzonedHandlers(`export const a=internalAction({handler:()=>work()});export const b=action({handler:()=>withTimeZone(z,work)});`, 'convex/x.ts'), ['a']);
  assert.equal(launchesConvex(`spawn('npx',['convex','run',fn]);`, 'x.mjs'), true);
  assert.equal(launchesConvex('exec(`node node_modules/convex/bin/main.js deploy`);', 'x.mjs'), true);
  assert.equal(launchesConvex(`throw new Error('npx convex dev did not choose');const a=['convex','dev'].join(' ')`, 'x.mjs'), true);
  assert.equal(launchesConvex(`throw new Error('npx convex dev did not choose');`, 'x.mjs'), false);
});
