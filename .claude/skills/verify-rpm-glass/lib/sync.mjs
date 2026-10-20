import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {PACKAGE, UserError, adb} from './device.mjs';
import {pageTargets, connect} from './page.mjs';
import {ROOT, readState, writeState, journal, target} from './runtime.mjs';
import {BUILT_WEB, builtWeb} from '../../../../scripts/agent/web-assets.mjs';

const BUILT = path.join(ROOT, BUILT_WEB);
export const SYNC_DIR = 'files/dev-companion';
const TEXT = /\.(html|css|js)$/;

export const builtAssetsSha = () => builtWeb(ROOT).sha;

/** The shell line that wipes the app's data for `seed` but keeps synced web assets, so a seeded run still shows them. */
export function wipeAppDataKeepingSync() {
  return `for f in files/*; do [ "$f" = ${SYNC_DIR} ] || rm -rf "$f"; done; rm -rf shared_prefs databases app_webview cache; mkdir -p files`;
}

export function clearSynced(serial) {
  adb(serial, ['shell', `run-as ${PACKAGE} rm -rf ${SYNC_DIR}`], {allowFail: true});
}

function bundle() {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-companion-assets.mjs')], {cwd: ROOT, encoding: 'utf8', windowsHide: true});
  if (r.status !== 0) throw new UserError(`Bundling the web assets failed:\n${(r.stderr || r.stdout).trim().slice(-2000)}`, 'Fix the error above, then rerun `rpmctl sync`.');
}

export const syncCommands = {
  async sync(args) {
    const {serial, state, cdpPort} = target(args, {mutates: true});
    const t0 = Date.now();
    bundle();
    const files = fs.readdirSync(BUILT).filter(f => TEXT.test(f));
    adb(serial, ['shell', `run-as ${PACKAGE} mkdir -p ${SYNC_DIR}`]);
    for (const file of files)
      adb(serial, ['exec-in', `run-as ${PACKAGE} sh -c 'cat > ${SYNC_DIR}/${file}'`], {input: fs.readFileSync(path.join(BUILT, file))});
    const sha = builtAssetsSha();
    state.webSha256 = sha;
    state.syncedAt = Date.now();
    writeState(state);
    let reloaded = 0;
    for (const t of (await pageTargets(serial, cdpPort).catch(() => [])).filter(p => p.url.startsWith('https://rpm.local/'))) {
      const page = await connect(t);
      try { await page.send('Page.reload', {ignoreCache: true}); reloaded++; } finally { page.close(); }
    }
    const out = {ok: true, synced: files, webSha256: sha.slice(0, 16), reloadedPages: reloaded, seconds: Math.round((Date.now() - t0) / 1000),
      note: 'Web assets now load from the synced copy until the next `rpmctl launch` install. Java changes still need `rpmctl launch --build`.'};
    journal(readState(), {command: 'sync', result: out});
    return out;
  },
};
