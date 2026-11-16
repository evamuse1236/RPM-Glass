// A tap aimed at a control that is still moving lands on whatever slides under the finger. On GitHub's emulator the
// keyboard rose after a display change and put its "v" key where "Open planner" had been, so the planner never opened
// (run 43867547605, notch-island). Look until the control has stopped, tap there, and if the tap did not do its job look
// again and tap again.
export async function steadyTap({locate, tap, done, pause, tries = 3, looks = 8, settleMs = 250, waitMs = 4000, everyMs = 300}) {
  let taps = 0;
  for (; taps < tries; taps++) {
    if (await done()) return {done: true, taps};
    let at = await locate();
    for (let look = 1; look < looks; look++) {
      await pause(settleMs);
      const again = await locate();
      const still = again[0] === at[0] && again[1] === at[1];
      at = again;
      if (still) break;
    }
    await tap(at);
    for (let waited = 0; waited < waitMs && !(await done()); waited += everyMs) await pause(everyMs);
  }
  return {done: Boolean(await done()), taps};
}
