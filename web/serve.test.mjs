import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, resolvePath} from './serve.mjs';

test('paths outside web/ are refused', () => {
  assert.equal(resolvePath('/../package.json'), resolvePath('/package.json'));
  assert.equal(resolvePath('/..%2fpackage.json'), null);
  assert.equal(resolvePath('/%2e%2e%2f%2e%2e%2fsecret'), null);
});

test('the server lists builds and serves files from web/', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(base + '/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /RPM web builds/);
    const fixture = await fetch(base + '/fixtures/snapshot.json');
    assert.equal(fixture.status, 200);
    assert.equal(typeof (await fixture.json()).revision, 'number');
    assert.equal((await fetch(base + '/nothing-here.txt')).status, 404);
  } finally {
    server.close();
  }
});
