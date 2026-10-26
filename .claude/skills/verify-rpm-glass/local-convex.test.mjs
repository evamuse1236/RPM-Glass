import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {refuseDeployment, localSiteUrl, startLocalConvex} from './lib/local-convex.mjs';

test('the sync scenario refuses the production deployment and any cloud deployment', () => {
  assert.throws(() => refuseDeployment('CONVEX_DEPLOYMENT=dev:neat-emu-821\n'), /neat-emu-821/);
  assert.throws(() => refuseDeployment('CONVEX_DEPLOYMENT=anonymous:x\nCONVEX_SITE_URL=https://neat-emu-821.convex.site\n'), /neat-emu-821/);
  assert.throws(() => refuseDeployment('CONVEX_DEPLOYMENT=prod:other-team-123\n'), /only runs against local Convex/);
  assert.equal(refuseDeployment('CONVEX_DEPLOYMENT=anonymous:anonymous-agent\n'), 'anonymous:anonymous-agent');
  assert.equal(refuseDeployment('CONVEX_DEPLOYMENT=local:mine\n'), 'local:mine');
  assert.equal(refuseDeployment(null), null);
});

test('the phone only gets a site URL on this computer', () => {
  assert.deepEqual(localSiteUrl('CONVEX_SITE_URL=http://127.0.0.1:3213\n'), {siteUrl: 'http://127.0.0.1:3213', port: 3213});
  assert.throws(() => localSiteUrl('CONVEX_SITE_URL=https://neat-emu-821.convex.site\n'), /not a local port/);
  assert.throws(() => localSiteUrl(''), /no CONVEX_SITE_URL/);
});

test('starting refuses before spawning or wiping anything when .env.local names production', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpm-convex-'));
  const data = path.join(root, '.convex', 'local', 'default');
  fs.mkdirSync(data, {recursive: true});
  fs.writeFileSync(path.join(data, 'convex_local_backend.sqlite3'), 'keep');
  fs.writeFileSync(path.join(root, '.env.local'), 'CONVEX_DEPLOYMENT=dev:neat-emu-821\n');
  await assert.rejects(startLocalConvex(root), /neat-emu-821/);
  assert.equal(fs.readFileSync(path.join(data, 'convex_local_backend.sqlite3'), 'utf8'), 'keep');
  assert.equal(fs.existsSync(path.join(root, '.verify')), false);
});
