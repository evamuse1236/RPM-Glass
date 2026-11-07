import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

/** Validate video-stream metadata and coverage through the final screen. */
export function inspectVideo(path, finalShot) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,nb_frames:format=duration', '-of', 'json', path], { encoding: 'utf8', timeout: 15000 });
  if (result.error || result.status !== 0) {
    return { ok: false, error: `Video validation failed: ${result.error?.message || result.stderr || 'ffprobe failed'}` };
  }
  const check = videoCoverage(JSON.parse(result.stdout), finalShot.videoStart);
  if (!check.ok || !check.frames) return { ...check, ok: false, error: check.error || 'Video has no frame count.' };
  // A static Android screen emits no repeated frames: the media can end before
  // the last screenshot's wall time. Decode it and compare its final image.
  const finalFrame = join(dirname(path), 'video-final.png');
  const decoded = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', path, '-vf', `select=eq(n\\,${check.frames - 1})`,
    '-frames:v', '1', finalFrame], { encoding: 'utf8', timeout: 60000 });
  if (decoded.error || decoded.status !== 0 || decoded.stderr.trim()) {
    return { ...check, ok: false, error: `Video decode failed: ${decoded.error?.message || decoded.stderr}` };
  }
  const compared = spawnSync('ffmpeg', ['-i', finalFrame, '-i', finalShot.path, '-lavfi', 'ssim', '-f', 'null', '-'],
    { encoding: 'utf8', timeout: 15000 });
  const similarity = Number(compared.stderr?.match(/All:([\d.]+)/)?.[1]);
  // Launcher / notch stills change every second (clock, recording chrome); require
  // only that a final frame decoded when the last shot is a notch pass.
  if (finalShot?.notch) {
    return { ...check, ok: true, finalFrame, finalFrameSimilarity: similarity || null, notchFinal: true };
  }
  const ok = compared.status === 0 && similarity >= .98;
  return { ...check, ok, finalFrame, finalFrameSimilarity: similarity || null,
    error: ok ? undefined : 'The video final frame does not match the final phone screenshot (SSIM below 0.98).' };
}

export function videoCoverage(data, requiredSeconds) {
  const stream = data.streams?.[0];
  const duration = Number(data.format?.duration);
  const ok = !!stream && duration > 0 && duration + 1 >= requiredSeconds;
  return { ok, duration, width: stream?.width, height: stream?.height, frames: Number(stream?.nb_frames) || null,
    requiredSeconds, error: ok ? undefined : 'Video is missing a video stream or ends before the final screen.' };
}

export function summarizeRun(shots, journal, expectedSteps, videoCheck = null, runError = null) {
  const requiredShots = shots.filter((s) => !s.optional);
  const requiredJournal = journal.filter((s) => !s.optional);
  const expectFails = requiredShots.filter((s) => !s.expectOk).map((s) => s.id);
  const actionFails = requiredJournal.flatMap((s) =>
    s.actions.filter((a) => !a.ok && !a.optional && !a.skipped).map((a) => ({ step: s.step, ...a })),
  );
  const recoveryFails = requiredJournal
    .filter((s) => s.recoveredLauncher || s.actions.some((a) => a.recovered))
    .map((s) => s.step);
  const evidenceFails = requiredShots.filter((s) => !s.snapshotOk || !s.screenshotOk).map((s) => s.id);
  const optionalSkipped = shots.filter((s) => s.optional && !s.expectOk).map((s) => s.id);
  return {
    ok: !runError && shots.length === expectedSteps && !expectFails.length && !actionFails.length &&
      !recoveryFails.length && !evidenceFails.length && (!videoCheck || videoCheck.ok),
    completedSteps: shots.length, expectedSteps, expectFails, actionFails, recoveryFails, evidenceFails,
    optionalSkipped, runError,
  };
}

export function chapterVtt(shots, duration) {
  const stamp = (seconds) => new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
  return 'WEBVTT\n\n' + shots.map((s, i) => `${s.id}\n${stamp(s.videoStart)} --> ${stamp(shots[i + 1]?.videoStart ?? duration)}\n${s.title.replace(/[\r\n]/g, ' ')}\n`).join('\n');
}
