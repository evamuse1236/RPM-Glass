import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, statSync } from 'node:fs';

export function adb(serial, args, { allowFail = false, binary = false, timeout = 60_000 } = {}) {
  const r = spawnSync('adb', ['-s', serial, ...args], {
    encoding: binary ? undefined : 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  });
  if (r.error) throw r.error;
  if (r.status !== 0 && !allowFail) {
    const err = (r.stderr || r.stdout || '').toString().trim() || `adb exit ${r.status}`;
    throw new Error(err);
  }
  return binary ? r.stdout : String(r.stdout ?? '');
}

export function shell(serial, command, opts) {
  return adb(serial, ['shell', command], opts);
}

export function devices() {
  const out = spawnSync('adb', ['devices', '-l'], { encoding: 'utf8' });
  if (out.status !== 0) throw new Error(out.stderr || 'adb devices failed');
  return out.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...rest] = line.split(/\s+/);
      return { serial, state, meta: rest.join(' ') };
    })
    .filter((d) => d.state === 'device');
}

export function pickPhone(serial) {
  const list = devices();
  if (serial) {
    const hit = list.find((d) => d.serial === serial);
    if (!hit) throw new Error(`No device ${serial}. Connected: ${list.map((d) => d.serial).join(', ') || 'none'}`);
    return hit;
  }
  const phones = list.filter((d) => !d.serial.startsWith('emulator-'));
  if (phones.length === 1) return phones[0];
  if (phones.length === 0) throw new Error('No USB phone online. Plug one in and enable USB debugging.');
  throw new Error(`Several phones online; pass --serial. ${phones.map((d) => d.serial).join(', ')}`);
}

export function wakeAndUnlock(serial) {
  shell(serial, 'input keyevent KEYCODE_WAKEUP', { allowFail: true });
  const policy = shell(serial, 'dumpsys window policy', { allowFail: true });
  if (/\bmIsShowing=true\b/.test(policy)) {
    // Swipe up only on the lock screen; a PIN remains the user's responsibility.
    shell(serial, 'input swipe 540 2000 540 800 300', { allowFail: true });
  }
}

export function screencap(serial, destPath) {
  const png = adb(serial, ['exec-out', 'screencap', '-p'], { binary: true });
  writeFileSync(destPath, png);
  return destPath;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Own one recorder PID; never stop another session's screenrecord. */
export async function beginScreenrecord(serial, remotePath, { bitRate = '8M', timeLimit = 180 } = {}) {
  const proc = spawn(
    'adb',
    ['-s', serial, 'shell', `echo $$; exec screenrecord --bit-rate ${bitRate} --time-limit ${timeLimit} ${remotePath}`],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '', errors = '', pid;
  proc.stdout.on('data', (data) => { output += data; });
  proc.stderr.on('data', (data) => { errors += data; });
  const closed = new Promise((resolve) => {
    proc.once('error', (error) => { errors += error.message; resolve(); });
    proc.once('close', resolve);
  });
  for (let i = 0; i < 30 && !pid; i++) {
    pid = output.match(/^\s*(\d+)\s*$/m)?.[1];
    if (!pid) await sleep(100);
    if (proc.exitCode != null) break;
  }
  if (!pid || proc.exitCode != null) {
    proc.kill();
    throw new Error(`Could not start phone video: ${errors || output || 'no recorder PID'}`);
  }
  const startedAt = Date.now();
  return {
    remotePath,
    pid,
    startedAt,
    async stop(localPath) {
      if (proc.exitCode == null) shell(serial, `kill -2 ${pid}`, { allowFail: true });
      let timeout;
      const finished = await Promise.race([
        closed.then(() => true),
        new Promise((resolve) => { timeout = setTimeout(() => resolve(false), 10000); }),
      ]);
      clearTimeout(timeout);
      if (!finished) {
        proc.kill();
        throw new Error('Phone video did not finish after SIGINT; remote recording retained.');
      }
      adb(serial, ['pull', remotePath, localPath], { timeout: 120_000 });
      if (!statSync(localPath).size) throw new Error(`Phone video is empty: ${errors}`);
      shell(serial, `rm -f ${remotePath}`, { allowFail: true });
      return localPath;
    },
  };
}
