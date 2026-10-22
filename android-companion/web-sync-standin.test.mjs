import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {freshStore} from '../chat-prototype/companion-state.mjs';
import {validateSnapshot} from '../web/contract/validate.mjs';

test('web:phone publishes v2, processes plan and acknowledges its persisted effect', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rpm-standin-')), state = join(folder, 'phone.json');
  const op = {type: 'saveTask', fields: {title: 'Stand-in plan command'}};
  const command = {id: randomUUID(), type: 'plan', args: {op}, baseRevision: 0, createdAt: new Date().toISOString()};
  const exchanges = [], failures = [];
  const server = createServer(async (req, res) => {
    try {
      let text = ''; for await (const bytes of req) text += bytes;
      const payload = JSON.parse(text); validateSnapshot(payload.snapshot); exchanges.push(payload);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({commands: exchanges.length === 1 ? [command] : [], snapshots: [payload.snapshot], revokedCommandIds: []}));
    } catch (error) { failures.push(error); res.writeHead(500); res.end('{}'); }
  });
  try {
    await writeFile(state, JSON.stringify({token: 'synthetic-test-token', data: freshStore()}));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const child = spawn(process.execPath, ['scripts/web-sync/phone-standin.mjs', '--once', '--state', state, '--site', `http://127.0.0.1:${server.address().port}`], {stdio: ['ignore', 'pipe', 'pipe']});
    let output = ''; child.stdout.on('data', bytes => output += bytes); child.stderr.on('data', bytes => output += bytes);
    const status = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(status, 0, output); assert.doesNotMatch(output, /sync failed/); assert.deepEqual(failures, []);
    assert.equal(exchanges.length, 2); assert.equal(exchanges[0].snapshot.schemaVersion, 2);
    assert.equal(exchanges[1].acks[0].status, 'applied');
    assert.equal(exchanges[1].snapshot.entries[0].title, op.fields.title);
    const saved = JSON.parse(await readFile(state, 'utf8'));
    assert.equal(saved.data.entries[0].title, op.fields.title);
    assert.equal(saved.data.webSync.commands[command.id].state, 'final');
  } finally { await new Promise(resolve => server.close(resolve)); await rm(folder, {recursive: true, force: true}); }
});
