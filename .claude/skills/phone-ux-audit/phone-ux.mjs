#!/usr/bin/env node
/**
 * One-click RPM Glass phone UX tour (project skill: phone-ux-audit).
 *
 *   npm run phone:ux              # fast profile + video (default)
 *   npm run phone:ux -- --full    # all surfaces including detail sheets
 *   npm run phone:ux -- --no-video
 *
 * Needs a live T3 device_open session (auto-discovers newest config/session).
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pickPhone, wakeAndUnlock, screencap, beginScreenrecord, sleep } from './lib/adb.mjs';
import {
  resolveAgentDevice,
  openApp,
  clickLabel,
  clickAnyLabel,
  longpressLabel,
  pressHome,
  back,
  waitText,
  screenshotFile,
  snapshot,
  ensureApp,
  surfaceMatches,
  surfaceLooksLikeLauncher,
} from './lib/agent-device.mjs';
import { buildTour, PACKAGE } from './lib/tour.mjs';
import { writeGallery } from './lib/gallery.mjs';
import { resolveSessionArgs, batteryLevel } from './lib/session.mjs';
import { inspectVideo, summarizeRun, chapterVtt } from './lib/report.mjs';
import { runNotchPass } from './lib/notch-pass.mjs';

export function parseArgs(argv) {
  const out = {
    serial: null,
    video: true,
    config: null,
    session: null,
    agentDevice: null,
    out: null,
    dryRun: false,
    profile: 'fast',
    holdMs: 600,
    notch: true,
  };
  const value = (i) => {
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${argv[i]} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--serial') out.serial = value(i++);
    else if (a === '--video') out.video = true;
    else if (a === '--no-video') out.video = false;
    else if (a === '--config') out.config = value(i++);
    else if (a === '--session') out.session = value(i++);
    else if (a === '--agent-device') out.agentDevice = value(i++);
    else if (a === '--out') out.out = value(i++);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--fast') out.profile = 'fast';
    else if (a === '--full') out.profile = 'full';
    else if (a === '--profile') out.profile = value(i++);
    else if (a === '--hold-ms') out.holdMs = Number(value(i++));
    else if (a === '--no-notch') out.notch = false;
    else if (a === '--notch') out.notch = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (out.profile !== 'fast' && out.profile !== 'full') throw new Error(`Bad --profile ${out.profile}`);
  if (!Number.isInteger(out.holdMs) || out.holdMs < 0 || out.holdMs > 10000) throw new Error('--hold-ms must be an integer from 0 to 10000');
  return out;
}

function help() {
  console.log(`phone-ux — RPM Glass USB-phone UX tour (project skill)

  npm run phone:ux -- [--fast|--full] [--video|--no-video] [--out DIR]

Profiles:
  --fast   Core surfaces + water/meal/done + settings alerts + notch pass.
  --full   + all task tabs (incl. Reminder/Alarm chips), block detail, Life tabs, Trash.

Session:
  Auto-discovers newest T3 --config/--session after device_open.
  Override with --config / --session / PHONE_UX_* env.

Other:
  --dry-run   Print steps only
  --no-video  Stills only (faster)
  --hold-ms N Hold each captured screen in the video (default 600; 0 for quickest)
  --no-notch  Skip the raw-adb notch pass (pill / task / habit islands)

Video requires FFmpeg to validate decoding and the final frame. The gallery links each
screen to its transition and paused video frame. Detailed results: manifest.json.

State-dependent steps (water due, meal due, live alarm) are optional: missing them does
not fail the run; they appear under optionalSkipped in the manifest.
`);
}

async function runAction(agent, action) {
  switch (action.kind) {
    case 'open':
      return openApp(agent, PACKAGE);
    case 'ensure':
      return ensureApp(agent);
    case 'home':
      return pressHome(agent);
    case 'dismissKeyboard': {
      const snap = snapshot(agent);
      if (/Use voice typing|Switch input method|Symbol keyboard|Shift enabled/i.test(snap.out)) {
        const result = back(agent);
        return { ...result, dismissed: result.ok };
      }
      return { ok: true, dismissed: false };
    }
    case 'click': {
      const r = clickLabel(agent, action.text, { role: action.role, soft: action.soft !== false });
      if (action.optional && !r.ok) return { ...r, ok: true, skipped: true, optional: true };
      return { ...r, optional: !!action.optional };
    }
    case 'anyClick': {
      const r = clickAnyLabel(agent, action.texts || [action.text].filter(Boolean), {
        role: action.role,
        soft: action.soft !== false,
        optional: !!action.optional,
      });
      return { ...r, optional: !!action.optional };
    }
    case 'longpress': {
      const r = longpressLabel(agent, action.text, {
        role: action.role,
        soft: action.soft !== false,
        optional: !!action.optional,
      });
      return { ...r, optional: !!action.optional };
    }
    case 'back':
      return back(agent);
    case 'wait':
      return waitText(agent, action.text);
    case 'pause':
      return sleep(action.ms ?? 200);
    default:
      throw new Error(`Unknown action ${action.kind}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }

  const tour = buildTour(args.profile);

  if (args.dryRun) {
    const notchSteps = args.notch
      ? [
          { id: 'n01-notch-pill', title: 'Notch pill (home)', optional: true },
          { id: 'n02-notch-task-island', title: 'Notch · task island', optional: true },
          { id: 'n03-notch-habit-island', title: 'Notch · habit island', optional: true },
          { id: 'n04-notch-habit-action', title: 'Notch · habit action / receipt', optional: true },
          { id: 'n05-notch-alert', title: 'Notch · reminder/alarm (if live)', optional: true },
        ]
      : [];
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          profile: args.profile,
          notch: args.notch,
          steps: [
            ...tour.map((s) => ({
              id: s.id,
              title: s.title,
              expect: s.expect,
              expects: s.expects,
              selected: s.selected,
              optional: !!s.optional,
            })),
            ...notchSteps,
          ],
        },
        null,
        2,
      ),
    );
    return;
  }

  const resolved = resolveSessionArgs(args);
  if (!resolved.serial) throw new Error('No USB phone. Plug one in or pass --serial.');
  const phone = pickPhone(resolved.serial);
  const agent = resolveAgentDevice({
    bin: resolved.agentDevice,
    config: resolved.config,
    session: resolved.session,
    serial: phone.serial,
  });

  const level = batteryLevel(phone.serial);
  if (level != null && level < 15) {
    console.log(JSON.stringify({ ok: true, phase: 'warn', battery: level, note: 'Battery under 15% — plug in if you can.' }));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runId = `phone-ux-${args.profile}-${stamp}`;
  const outDir = resolve(args.out || join(process.cwd(), '.verify/evidence', runId));
  mkdirSync(outDir, { recursive: true });

  console.log(
    JSON.stringify({
      ok: true,
      phase: 'start',
      serial: phone.serial,
      profile: args.profile,
      steps: tour.length,
      outDir,
      video: args.video,
      holdMs: args.video ? args.holdMs : 0,
      session: resolved.session,
    }),
  );

  wakeAndUnlock(phone.serial);
  await sleep(250);

  let recorder = null;
  let videoPath = null;
  if (args.video) {
    recorder = await beginScreenrecord(phone.serial, `/sdcard/${runId}.mp4`, {
      timeLimit: args.profile === 'full' ? 360 : 240,
      bitRate: '6M',
    });
    await sleep(300);
  }

  const shots = [];
  const journal = [];
  const started = Date.now();
  let interrupted = false, runError = null, videoCheck = null;
  const onInterrupt = () => { interrupted = true; };
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onInterrupt);
  const videoTime = () => recorder ? (Date.now() - recorder.startedAt) / 1000 : null;

  try {
    for (const step of tour) {
      if (interrupted) break;
      const t0 = Date.now();
      const videoStart = videoTime();
      const stepJournal = { step: step.id, title: step.title, actions: [] };
      for (const action of step.actions) {
        if (interrupted) break;
        const actionStarted = Date.now();
        try {
          const r = await runAction(agent, action);
          stepJournal.actions.push({
            kind: action.kind,
            text: action.text || action.texts?.[0],
            ok: r?.ok !== false,
            hit: r?.hit?.label,
            matched: r?.matched,
            skipped: r?.skipped,
            optional: !!action.optional || !!r?.optional,
            recovered: r?.recovered,
            ms: Date.now() - actionStarted,
            error: r?.ok === false ? r.out : undefined,
          });
        } catch (err) {
          stepJournal.actions.push({
            kind: action.kind,
            text: action.text,
            ok: !!action.optional,
            optional: !!action.optional,
            ms: Date.now() - actionStarted,
            error: String(err.message || err),
          });
        }
      }

      let snap = snapshot(agent, { fresh: true });
      if (surfaceLooksLikeLauncher(snap.out)) {
        writeFileSync(join(outDir, `${step.id}-before-recovery.txt`), snap.out);
        openApp(agent);
        await sleep(400);
        snap = snapshot(agent);
        stepJournal.recoveredLauncher = true;
      }

      const expectOk = snap.ok && surfaceMatches(snap.out, step);
      stepJournal.expect = step.expect;
      stepJournal.expects = step.expects;
      stepJournal.expectOk = expectOk;
      stepJournal.optional = !!step.optional;

      const file = join(outDir, `${step.id}.png`);
      writeFileSync(join(outDir, `${step.id}.txt`), snap.out);
      const videoShot = videoTime();
      let screenshotOk = false;
      try {
        const shot = screenshotFile(agent, file);
        if (!shot.ok) screencap(phone.serial, file);
        screenshotOk = existsSync(file) && statSync(file).size > 0;
      } catch (error) {
        stepJournal.actions.push({ kind: 'screenshot', ok: false, error: String(error.message || error) });
      }
      const recovered = stepJournal.recoveredLauncher || stepJournal.actions.some((a) => a.recovered);
      const actionsOk = stepJournal.actions.every((a) => a.ok || a.optional || a.skipped);
      const ok = (expectOk || step.optional) && screenshotOk && (!recovered || step.optional) && actionsOk;
      shots.push({
        id: step.id,
        title: step.title,
        path: file,
        ms: Date.now() - t0,
        expectOk,
        snapshotOk: snap.ok,
        screenshotOk,
        ok,
        optional: !!step.optional,
        videoStart,
        videoShot,
      });
      journal.push({ ...stepJournal, ok, ms: Date.now() - t0 });
      console.log(JSON.stringify({
        ok,
        phase: 'shot',
        id: step.id,
        title: step.title,
        expectOk,
        optional: !!step.optional,
        recovered: !!recovered,
        ms: Date.now() - t0,
      }));
      if (recorder) await sleep(args.holdMs);
    }

    if (!interrupted && args.notch) {
      console.log(JSON.stringify({
        ok: true,
        phase: 'notch-pass',
        note: 'Raw adb after rebind. Pill only shows with a current/next task and/or due habit.',
      }));
      const snapText = (id) => {
        try {
          return readFileSync(join(outDir, `${id}.txt`), 'utf8');
        } catch {
          return '';
        }
      };
      const todayBits = ['03-today', '05-today', '07-today-after-task', '09-today-after-habits', '09a-water-log', '09c-meal-log']
        .map(snapText)
        .join('\n');
      const contentHint = {
        sawTask: /Open task|Mark .+ complete|Now ·|in \d+ min/i.test(todayBits),
        sawWaterDue: /Water,.+Log a glass|Glass logged/i.test(todayBits),
        sawMealDue: /not logged|Log lunch|Log dinner|Log breakfast|Log a meal/i.test(todayBits),
      };
      const notch = await runNotchPass({
        serial: phone.serial,
        outDir,
        holdMs: args.video ? args.holdMs : 0,
        videoTime,
        contentHint,
      });
      shots.push(...notch.shots);
      journal.push(...notch.journal);
      for (const line of notch.note) {
        console.log(JSON.stringify({ ok: true, phase: 'notch-note', note: line }));
      }
    }
  } catch (error) {
    runError = String(error.message || error);
  } finally {
    if (recorder) {
      videoPath = join(outDir, 'full-run.mp4');
      try {
        await recorder.stop(videoPath);
        videoCheck = shots.length ? inspectVideo(videoPath, shots.at(-1)) : { ok: false, error: 'No screen was captured.' };
      } catch (error) {
        videoCheck = { ok: false, error: String(error.message || error) };
      }
    }
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
  }

  if (interrupted) runError = 'Interrupted; partial evidence retained.';
  const expectedSteps = tour.length + (args.notch ? 5 : 0);
  const result = summarizeRun(shots, journal, expectedSteps, videoCheck, runError);
  if (videoCheck?.ok) writeFileSync(join(outDir, 'chapters.vtt'), chapterVtt(shots, videoCheck.duration));
  const galleryPath = writeGallery({ outDir, shots, videoPath: existsSync(videoPath ?? '') ? videoPath : null,
    runId, result, journal, videoCheck });
  const manifest = {
    ...result,
    runId,
    profile: args.profile,
    serial: phone.serial,
    package: PACKAGE,
    battery: level,
    startedAt: new Date(started).toISOString(),
    seconds: Math.round((Date.now() - started) / 1000),
    outDir,
    gallery: galleryPath,
    video: videoPath,
    videoCheck,
    holdMs: args.video ? args.holdMs : 0,
    notch: args.notch,
    commandTimings: agent.timings,
    shots,
    journal,
    note:
      'Stills = layout/density. Video = stutters/motion. Notch = raw-adb pass after planner (automation unbinds a11y). Live reminder/alarm islands need a firing alert — otherwise UNVERIFIED. Optional steps skip when the phone has no due water/meal/tick target.',
  };
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ phase: 'complete', ...result, seconds: manifest.seconds,
    gallery: galleryPath, video: videoPath, videoCheck, manifest: join(outDir, 'manifest.json') }));
  if (!manifest.ok) process.exitCode = interrupted ? 130 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
});
