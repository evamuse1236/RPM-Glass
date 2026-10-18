import ts from 'typescript';

const literal = node => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
const callName = node => ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) ? node.name.text : '';

export function collectSelectors(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const selectors = [];
  const add = (node, name, role) => {
    if (name === undefined) return;
    const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    selectors.push({name, role, call: `${file}:${line} ${node.getText(ast)}`});
  };
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const fn = callName(node.expression), args = node.arguments;
      if (fn === 'tapElement' && args[2] && ts.isObjectLiteralExpression(args[2])) {
        const props = Object.fromEntries(args[2].properties.filter(ts.isPropertyAssignment)
          .map(p => [p.name.getText(ast).replace(/['"]/g, ''), literal(p.initializer)]));
        add(node, props.name, props.role);
      } else if (fn === 'openMenuItem') add(node, literal(args[2]), 'button');
      else if (fn === 'do' && ['tap', 'wait', 'scroll'].includes(literal(args[0]))) {
        const values = args.map(literal), nameAt = values.indexOf('--name'), roleAt = values.indexOf('--role');
        if (nameAt >= 0) add(node, values[nameAt + 1], roleAt >= 0 ? values[roleAt + 1] : undefined);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return selectors;
}

export function appLabels(file, source) {
  const names = [], roles = [];
  if (file.endsWith('.html')) {
    const html = source.replace(/<!--[\s\S]*?-->/g, '');
    names.push(...[...html.matchAll(/(?:aria-label|placeholder|title)\s*=\s*["']([^"']*)["']|>([^<>]+)</g)].map(m => m[1] ?? m[2]));
    roles.push(...[...html.matchAll(/\brole\s*=\s*["']([^"']*)["']/g)].map(m => m[1]));
  } else {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const visit = node => {
      const value = literal(node);
      if (value !== undefined) names.push(value);
      if (ts.isTemplateExpression(node)) names.push(node.head.text, ...node.templateSpans.map(span => span.literal.text));
      if (ts.isCallExpression(node) && callName(node.expression) === 'setAttribute' && literal(node.arguments[0]) === 'role')
        roles.push(literal(node.arguments[1]));
      if (ts.isPropertyAssignment(node) && node.name.getText(ast).replace(/['"]/g, '') === 'role') roles.push(literal(node.initializer));
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  for (const name of names) roles.push(...[...name.matchAll(/\brole\s*=\s*["']([^"']*)["']/g)].map(m => m[1]));
  return {file, names, roles};
}

export function selectorProblem(selector, sources) {
  const matches = sources.filter(source => source.names.some(name => name.includes(selector.name)));
  if (!matches.length) return `${selector.call}\nThe app no longer contains the accessible name "${selector.name}". Update this rpmctl call to the current label, text or placeholder.`;
  if (selector.role && !['button', 'textbox'].includes(selector.role) && !matches.some(source => source.roles.includes(selector.role)))
    return `${selector.call}\nThe app has "${selector.name}", but does not set role "${selector.role}" in the same source file. Update this rpmctl call to the field's current role.`;
  return null;
}
