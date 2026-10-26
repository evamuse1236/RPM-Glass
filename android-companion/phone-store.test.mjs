import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {filePhone, stampLocal} from '../scripts/web-sync/phone-store.mjs';
import golden from '../fixtures/record-keys.json' with {type: 'json'};
import snapshot from '../web/fixtures/snapshot.json' with {type: 'json'};

test('stand-in stamping matches the Java golden record keys and groups', () => {
  const next = structuredClone(snapshot); stampLocal({}, next, 'now');
  assert.deepEqual(Object.keys(next.sync.stamps).sort(), [...golden.keys].sort());
  for (const [key, groups] of Object.entries(next.sync.stamps))
    assert.deepEqual(groups, Object.fromEntries(Object.keys(golden.groups[key.split(':')[0]]).map(group => [group, 'now'])));
});

test('local stamps compare raw groups, preserve old stamps, and exclude removed records and checkins', () => {
  const before = {entries: [{id: 1, title: 'Title', alertIntent: {private: 1}}, {id: 2, title: 'Removed'}], sync: {stamps: {'task:1': {title: 'earlier'}}}};
  const next = structuredClone(before); next.entries.pop(); next.entries[0].alertIntent.private = 2;
  next.entries[0].notes = null; next.entries.push({id: 3, kind: 'checkin', title: 'Private'});
  stampLocal(before, next, 'now');
  assert.deepEqual(next.sync.stamps, {'task:1': {title: 'earlier', alertIntent: 'now', notes: 'now'}});
  assert.equal(next.syncSavedAt, 'now');
});

test('file store CAS lets only one concurrent writer save and sync saves stamp nothing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rpm-phone-store-')), path = join(dir, 'phone.json');
  try {
    const data = {version: 0, entries: [], syncSavedAt: 'earlier', sync: {stamps: {kept: {title: 'old'}}}};
    await writeFile(path, JSON.stringify({token: 'fixture', data}));
    const a = filePhone(path), b = filePhone(path);
    const results = await Promise.allSettled([a.save(0, {...data, version: 1}, {origin: 'sync'}), b.save(0, {...data, version: 1}, {origin: 'sync'})]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'VERSION_CONFLICT');
    const saved = await a.load(); assert.equal(saved.syncSavedAt, 'earlier'); assert.deepEqual(saved.sync, data.sync);
    await b.setToken('updated'); assert.deepEqual(await b.load(), saved);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).token, 'updated');
  } finally { await rm(dir, {recursive: true, force: true}); }
});
