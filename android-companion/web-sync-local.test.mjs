import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('local Convex compatibility shim makes real JSON-import metafile inputs readable as paths', () => {
  const script = `
    import esbuild from 'esbuild';
    import {statSync} from 'node:fs';
    const {metafile} = await esbuild.build({entryPoints:['web/contract/records.mjs'],bundle:true,metafile:true,write:false,platform:'node'});
    const paths = Object.keys(metafile.inputs);
    for (const path of paths) statSync(path);
    console.log(JSON.stringify(paths));
  `;
  const paths = JSON.parse(execFileSync(process.execPath, ['--require', './scripts/web-sync/convex-json-imports.cjs', '--input-type=module', '-e', script], {encoding: 'utf8'}));
  assert.ok(paths.includes('web/contract/records.json'));
  assert.ok(paths.includes('web/contract/snapshot.schema.json'));
  assert.ok(paths.every(path => !path.includes(' with {')));
});
