import {processAlive, processImage, killTree, sleep} from './device.mjs';
import {readEmulator, dropEmulator, portInUse, IDLE_MS} from './ownership.mjs';

/** What the idle reaper does next for the warm emulator on a port: keep waiting, stop it, or exit because it is gone. */
export function reaperStep(record, {self, inUse, isEmulator, now = Date.now(), idleMs = IDLE_MS}) {
  if (!record || record.reaperPid !== self) return 'exit';
  if (!isEmulator(record.pid)) return 'forget';
  if (inUse) return 'wait';
  return now - (Date.parse(record.releasedAt ?? record.bootedAt) || now) >= idleMs ? 'stop' : 'wait';
}

if (process.argv[1]?.endsWith('reaper.mjs')) {
  const port = Number(process.argv[2]);
  const isEmulator = pid => /emulator|qemu/i.test(processImage(pid) ?? '');
  for (;;) {
    await sleep(30000);
    const record = readEmulator(port);
    const step = reaperStep(record, {self: process.pid, inUse: portInUse(port), isEmulator});
    if (step === 'exit') process.exit(0);
    if (step === 'forget') { dropEmulator(port); process.exit(0); }
    if (step === 'wait') continue;
    // Don't ask the emulator to exit gracefully (`adb emu kill`): on some host GPUs its gfxstream teardown segfaults and dumps a 1 GB core. It is read-only with no snapshot to save, so SIGKILL loses nothing. See killTree in device.mjs.
    if (isEmulator(record.pid)) killTree(record.pid);
    for (let i = 0; i < 25 && processAlive(record.pid); i++) await sleep(200);
    if (readEmulator(port)?.pid === record.pid) dropEmulator(port);
    process.exit(0);
  }
}
