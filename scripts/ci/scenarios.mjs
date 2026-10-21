export function scenarioArgs(value = '--all') {
  const args = value.trim().split(/\s+/);
  if (args.length === 1 && args[0] === '--all') return args;
  if (!args.length || args.some(a => !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(a)))
    throw new Error('Scenarios must be --all or space-separated scenario IDs from rpmctl scenario --list.');
  return args;
}

export function scenarioOutcome(report, exitCode, expected = null) {
  const results = report?.results;
  if (![0, 1].includes(exitCode) || !Array.isArray(results) || !results.length)
    return {ok: false, warnings: []};
  if (expected && (results.length !== new Set(expected).size || expected.some(id => !results.some(r => r.id === id))))
    return {ok: false, warnings: []};
  const warnings = results.filter(r => r.status === 'known-bug-fixed').map(r => `${r.id} passed despite its recorded known bug; review the exception.`);
  return {ok: results.every(r => ['pass', 'known-bug', 'known-bug-fixed'].includes(r.status)), warnings};
}
