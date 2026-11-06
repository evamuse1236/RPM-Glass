/**
 * Raw-adb notch UX pass for the USB phone.
 *
 * The pill only draws when there is something to show: a current/next task
 * and/or a habit due now (water first, else the due meal). With neither, the
 * phone shows only the camera — that is expected, not a failure.
 *
 * agent-device / UI automation unbinds the RPM Notch accessibility service, so
 * the pill disappears during the planner tour. This pass goes Home, rebinds the
 * service, then taps by S24 FE cutout geometry and captures with screencap.
 *
 * Live reminder/alarm islands only appear when one fires; those stay optional.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shell, screencap, sleep } from './adb.mjs';

/** Measured Galaxy S24 FE cutout (playground/device.mjs, 2026-10-18). */
export const S24_CUTOUT = Object.freeze({
  width: 1080,
  height: 2340,
  density: 450 / 160,
  left: 506,
  top: 24,
  right: 574,
  bottom: 92,
  statusBarPx: 92,
});

export function notchTapPoints(cutout = S24_CUTOUT) {
  const density = cutout.density;
  const dp = (v) => Math.round(v * density);
  const hole = cutout.right - cutout.left;
  const square = Math.min(hole, cutout.bottom - cutout.top);
  const pillTop = Math.max(dp(2), cutout.bottom - square - dp(4));
  const pillBottom = cutout.statusBarPx > 0 ? Math.max(cutout.statusBarPx, cutout.bottom) : cutout.bottom + dp(4);
  const pillH = pillBottom - pillTop;
  const centerX = Math.floor((cutout.left + cutout.right) / 2);
  const centerY = pillTop + Math.floor(pillH / 2);
  // Midpoints of the drops: left of the hole (task), right of the hole (habit).
  const gap = dp(8) + Math.round(pillH * 0.35);
  return {
    centerX,
    centerY,
    pillTop,
    pillBottom,
    task: { x: Math.max(dp(8), centerX - gap), y: centerY },
    habit: { x: Math.min(cutout.width - dp(8), centerX + gap), y: centerY },
    closeSwipe: { x1: centerX, y1: Math.min(cutout.height - 200, 700), x2: centerX, y2: Math.max(120, pillBottom + 40) },
  };
}

const NOTCH_COMPONENT = 'com.rpm.prototype/com.rpm.prototype.NotchAccessibilityService';

function notchLogs(serial) {
  return shell(serial, 'logcat -d -s RpmNotch:I', { allowFail: true }) || '';
}

function accessibilityDump(serial) {
  return shell(serial, 'dumpsys accessibility', { allowFail: true }) || '';
}

function accessibilityMentionsNotch(serial) {
  return /NotchAccessibilityService|RPM Notch|RpmNotch/i.test(accessibilityDump(serial));
}

function notchIsBound(serial) {
  const dump = accessibilityDump(serial);
  // Bound services block should name the notch while it is drawing.
  return /Bound services:\{[^}]*NotchAccessibilityService/i.test(dump)
    || /Bound services:\{[^}]*com\.rpm\.prototype/i.test(dump);
}

/** Toggle the service off/on so it rebinds after UI automation unbound it. */
export function rebindNotchService(serial) {
  const current = (shell(serial, 'settings get secure enabled_accessibility_services', { allowFail: true }) || '').trim();
  const parts = current && current !== 'null' ? current.split(':').filter(Boolean) : [];
  const others = parts.filter((p) => !/NotchAccessibilityService/.test(p));
  shell(serial, `settings put secure enabled_accessibility_services '${others.join(':')}'`, { allowFail: true });
  shell(serial, 'settings put secure accessibility_enabled 1', { allowFail: true });
  const restored = [...others, NOTCH_COMPONENT].join(':');
  shell(serial, `settings put secure enabled_accessibility_services '${restored}'`, { allowFail: true });
  shell(serial, 'settings put secure accessibility_enabled 1', { allowFail: true });
  return { before: current, after: restored };
}

/** Parse `island drops task=<id|-> habit=<WATER|MEAL|->` from RpmNotch logs. */
export function parseIslandDrops(logs) {
  const m = String(logs || '').match(/island drops task=([^\s]+) habit=([^\s]+)/);
  if (!m) return null;
  const task = m[1] === '-' ? null : m[1];
  const habit = m[2] === '-' ? null : m[2];
  return { task, habit, hasTask: !!task, hasHabit: !!habit, hasAny: !!(task || habit) };
}

/**
 * @param {{
 *   serial: string,
 *   outDir: string,
 *   holdMs?: number,
 *   videoTime?: () => number | null,
 *   contentHint?: { sawTask?: boolean, sawWaterDue?: boolean, sawMealDue?: boolean },
 * }} opts
 */
export async function runNotchPass({ serial, outDir, holdMs = 600, videoTime = () => null, contentHint = {} }) {
  const points = notchTapPoints();
  const shots = [];
  const journal = [];
  const note = [];
  note.push(
    'Notch draws only with a current/next task and/or a due habit (water first, else meal). With neither, no pill — expected.',
  );
  if (contentHint.sawWaterDue || contentHint.sawMealDue || contentHint.sawTask) {
    note.push(
      `Planner tour hinted content: task=${!!contentHint.sawTask} waterDue=${!!contentHint.sawWaterDue} mealDue=${!!contentHint.sawMealDue}.`,
    );
  } else {
    note.push('No due task/habit seen in the planner tour — pill may correctly stay hidden.');
  }

  const push = async (id, title, { optional = true, expectLog = null } = {}) => {
    const t0 = Date.now();
    const videoStart = videoTime();
    const file = join(outDir, `${id}.png`);
    screencap(serial, file);
    const logs = notchLogs(serial);
    const logOk = expectLog ? expectLog.test(logs) : true;
    writeFileSync(join(outDir, `${id}.txt`), [
      `notchPass ${id}`,
      `logOk=${logOk}`,
      `optional=${optional}`,
      `taskTap=${points.task.x},${points.task.y}`,
      `habitTap=${points.habit.x},${points.habit.y}`,
      '--- RpmNotch (tail) ---',
      ...logs.split('\n').slice(-40),
    ].join('\n'));
    const shot = {
      id,
      title,
      path: file,
      ms: Date.now() - t0,
      expectOk: logOk || optional,
      snapshotOk: true,
      screenshotOk: true,
      ok: true,
      optional,
      videoStart,
      videoShot: videoTime(),
      notch: true,
    };
    shots.push(shot);
    journal.push({
      step: id,
      title,
      optional,
      expectOk: shot.expectOk,
      ok: true,
      ms: shot.ms,
      actions: [{ kind: 'screencap', ok: true, logOk }],
      logOk,
    });
    if (holdMs) await sleep(holdMs);
    return { logOk, logs };
  };

  // Leave the WebView / agent-device session; force the service to rebind
  // (UI automation leaves it Enabled but Bound services:{}).
  shell(serial, 'input keyevent KEYCODE_HOME', { allowFail: true });
  await sleep(600);
  const rebound = rebindNotchService(serial);
  note.push(`Rebound Notch a11y: ${rebound.before || '(none)'} → ${rebound.after}`);
  await sleep(2200);

  // Dismiss the floating screenrecord controls if they cover the status bar.
  shell(serial, 'input tap 540 1400', { allowFail: true });
  await sleep(300);

  const a11y = accessibilityMentionsNotch(serial);
  const bound = notchIsBound(serial);
  if (!a11y) note.push('RPM Notch not listed in dumpsys accessibility — Settings → Notch / enable the service.');
  if (a11y && !bound) note.push('Notch enabled but still unbound after rebind — islands UNVERIFIED.');

  shell(serial, 'logcat -c', { allowFail: true });
  await sleep(400);

  const pill = await push('n01-notch-pill', 'Notch pill (home)', {
    optional: true,
    expectLog: /island drops|notch\.service connected|notch\.setting/,
  });
  const drops = parseIslandDrops(pill.logs);
  if (drops) {
    note.push(`island drops task=${drops.task || '-'} habit=${drops.habit || '-'}`);
    if (!drops.hasAny) {
      note.push('No task and no due habit — pill correctly absent. Task/habit island stills stay UNVERIFIED.');
    }
  } else if (bound) {
    note.push('Service bound but no island-drops line yet — content may still be loading, or nothing is due.');
  }

  const { closeSwipe: c } = points;
  let taskOpen = { logOk: false };
  let habitOpen = { logOk: false };

  if (!drops || drops.hasTask) {
    shell(serial, `input tap ${points.task.x} ${points.task.y}`, { allowFail: true });
    await sleep(700);
    taskOpen = await push('n02-notch-task-island', 'Notch · task island', {
      optional: true,
      expectLog: /island expanded|notch\.gesture tap.*"drop":"TASK"/,
    });
    if (!taskOpen.logOk) {
      note.push(
        drops?.hasTask
          ? 'Task drop was logged but island open not confirmed (tap miss or unbound).'
          : 'Task island not confirmed — no current/next task drop, or tap missed.',
      );
    }
    shell(serial, `input swipe ${c.x1} ${c.y1} ${c.x2} ${c.y2} 180`, { allowFail: true });
    await sleep(500);
  } else {
    note.push('Skipped task-island taps — log shows no task drop.');
    await push('n02-notch-task-island', 'Notch · task island (skipped — no task drop)', { optional: true });
  }

  if (!drops || drops.hasHabit) {
    shell(serial, `input tap ${points.habit.x} ${points.habit.y}`, { allowFail: true });
    await sleep(700);
    habitOpen = await push('n03-notch-habit-island', 'Notch · habit island', {
      optional: true,
      expectLog: /island habit|notch\.gesture tap.*"drop":"HABIT"/,
    });
    if (!habitOpen.logOk) {
      note.push(
        drops?.hasHabit
          ? `Habit drop was ${drops.habit} but island open not confirmed (tap miss or unbound).`
          : 'Habit island not confirmed — water/meal not due, or tap missed.',
      );
    }

    // Glass / Log meal control region when the habit island opened.
    shell(serial, `input tap ${points.centerX} ${Math.min(S24_CUTOUT.height - 400, points.pillBottom + 220)}`, { allowFail: true });
    await sleep(600);
    await push('n04-notch-habit-action', 'Notch · habit action / receipt', {
      optional: true,
      expectLog: /notch\.drink|notch\.log_meal|Glass logged|island habit/,
    });
    shell(serial, `input swipe ${c.x1} ${c.y1} ${c.x2} ${c.y2} 180`, { allowFail: true });
    await sleep(400);
  } else {
    note.push('Skipped habit-island taps — log shows no due water/meal.');
    await push('n03-notch-habit-island', 'Notch · habit island (skipped — nothing due)', { optional: true });
    await push('n04-notch-habit-action', 'Notch · habit action (skipped)', { optional: true });
  }

  // Reminder/alarm island only if one is already showing.
  const alertLogs = notchLogs(serial);
  const alertLive = /notch\.(reminder|alarm) shown/.test(alertLogs);
  await push('n05-notch-alert', 'Notch · reminder/alarm (if live)', {
    optional: true,
    expectLog: alertLive ? /notch\.(reminder|alarm)/ : null,
  });
  if (!alertLive) {
    note.push('Live reminder/alarm island UNVERIFIED — none firing during the pass (needs a scheduled alert at now).');
  }

  return {
    shots,
    journal,
    note,
    points,
    drops,
    a11yListed: a11y,
    bound,
    alertLive,
    taskOpen: !!taskOpen.logOk,
    habitOpen: !!habitOpen.logOk,
  };
}
