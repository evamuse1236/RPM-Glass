import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTour, TOUR } from './lib/tour.mjs';
import { writeGallery } from './lib/gallery.mjs';
import { parseSnapshot, findLabel, surfaceLooksLikeLauncher, surfaceMatches } from './lib/agent-device.mjs';
import { summarizeRun, videoCoverage, chapterVtt } from './lib/report.mjs';
import { notchTapPoints, parseIslandDrops, S24_CUTOUT } from './lib/notch-pass.mjs';
import { parseArgs } from './phone-ux.mjs';
import { resolveSessionArgs, latestHostConfig } from './lib/session.mjs';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('phone-ux tour', () => {
  it('rejects missing CLI values and invalid video holds before touching a phone', () => {
    for (const args of [['--config'], ['--out', '--full'], ['--hold-ms', 'NaN'], ['--hold-ms', '-1']]) {
      assert.throws(() => parseArgs(args));
    }
    assert.equal(parseArgs(['--hold-ms', '0']).holdMs, 0);
    assert.equal(parseArgs([]).holdMs, 600);
    assert.equal(parseArgs([]).notch, true);
    assert.equal(parseArgs(['--no-notch']).notch, false);
  });

  it('places S24 FE notch taps beside the camera hole', () => {
    const pts = notchTapPoints(S24_CUTOUT);
    assert.ok(pts.task.x < pts.centerX);
    assert.ok(pts.habit.x > pts.centerX);
    assert.equal(pts.centerX, 540);
    assert.ok(pts.centerY > 0 && pts.centerY < 120);
  });

  it('treats empty island drops as no pill content', () => {
    assert.deepEqual(parseIslandDrops('island drops task=- habit=-'), {
      task: null, habit: null, hasTask: false, hasHabit: false, hasAny: false,
    });
    assert.equal(parseIslandDrops('island drops task=42 habit=WATER').hasAny, true);
    assert.equal(parseIslandDrops('island drops task=- habit=MEAL').hasHabit, true);
    assert.equal(parseIslandDrops(''), null);
  });

  it('skips strict SSIM when the final shot is a notch still', () => {
    const recording = { streams: [{ width: 1080, height: 2340, nb_frames: '10' }], format: { duration: '10.5' } };
    // videoCoverage alone; inspectVideo needs ffmpeg — unit-check the branch via summarize tolerance
    assert.equal(videoCoverage(recording, 10).ok, true);
    const shots = [{ id: 'n05', expectOk: true, snapshotOk: true, screenshotOk: true, optional: true, notch: true }];
    const summary = summarizeRun(shots, [{ step: 'n05', optional: true, actions: [{ kind: 'screencap', ok: true }] }], 1, {
      ok: true,
      notchFinal: true,
    });
    assert.equal(summary.ok, true);
  });

  it('requires the requested tab to be selected, not merely visible', () => {
    const surface = '@e1 [group] "Vision" [selected]\n@e2 [group] "Quarter"';
    assert.equal(surfaceMatches(surface, {expect: 'Quarter', selected: 'Quarter'}), false);
    assert.equal(surfaceMatches(surface, {expect: 'Vision', selected: 'Vision'}), true);
  });

  it('refuses false green runs despite matching expected text', () => {
    const shots = [{id: 'screen', expectOk: true, snapshotOk: true, screenshotOk: true}];
    const journal = [{step: 'screen', actions: [{kind: 'click', ok: true}]}];
    assert.equal(summarizeRun(shots, journal, 1, {ok: true}).ok, true);
    assert.equal(summarizeRun(shots, journal, 2).ok, false); // incomplete
    assert.equal(summarizeRun(shots, journal, 1, {ok: false}).ok, false); // recording lost
    assert.equal(summarizeRun([{...shots[0], snapshotOk: false}], journal, 1).ok, false);
    const failed = summarizeRun(shots, [{step: 'screen', actions: [{kind: 'click', ok: false}]}], 1);
    assert.equal(failed.ok, false);
    assert.equal(failed.actionFails[0].step, 'screen');
    assert.deepEqual(summarizeRun(shots, [{...journal[0], recoveredLauncher: true}], 1).recoveryFails, ['screen']);
  });

  it('requires a video stream that reaches the final screen', () => {
    const recording = {streams: [{width: 1080, height: 2340}], format: {duration: '10.5'}};
    assert.equal(videoCoverage(recording, 10).ok, true);
    assert.equal(videoCoverage(recording, 15).ok, false);
    assert.equal(videoCoverage({streams: [], format: {duration: 10}}, 10).ok, false);
  });

  it('writes ordered video chapters with millisecond timestamps', () => {
    const vtt = chapterVtt([{id: 'one', title: 'First', videoStart: .35}, {id: 'two', title: 'Next', videoStart: 62.4}], 65);
    assert.match(vtt, /00:00:00.350 --> 00:01:02.400/);
    assert.match(vtt, /00:01:02.400 --> 00:01:05.000/);
  });
  it('fast profile is a subset of full and has unique ids', () => {
    const fast = buildTour('fast');
    const full = buildTour('full');
    assert.ok(fast.length < full.length, `fast ${fast.length} vs full ${full.length}`);
    assert.equal(new Set(fast.map((s) => s.id)).size, fast.length);
    assert.equal(new Set(full.map((s) => s.id)).size, full.length);
    assert.ok(fast.every((s) => s.expect || s.expects?.length));
    assert.ok(full.some((s) => s.id.includes('task-sheet')));
    assert.ok(full.some((s) => s.id.includes('block-detail')));
    assert.ok(full.some((s) => s.id.includes('habits')));
    assert.ok(fast.some((s) => s.id.includes('water-log')));
    assert.ok(fast.some((s) => s.id.includes('meal-log')));
    assert.ok(fast.some((s) => s.id.includes('task-done')));
    assert.ok(fast.some((s) => s.id.includes('settings-sounds')));
    assert.ok(full.some((s) => s.id.includes('alert-reminder')));
    assert.ok(TOUR.length === fast.length);
  });

  it('optional steps do not fail the run summary', () => {
    const shots = [
      { id: 'req', expectOk: true, snapshotOk: true, screenshotOk: true },
      { id: 'opt', expectOk: false, snapshotOk: true, screenshotOk: true, optional: true },
    ];
    const journal = [
      { step: 'req', actions: [{ kind: 'click', ok: true }] },
      { step: 'opt', optional: true, actions: [{ kind: 'anyClick', ok: true, skipped: true, optional: true }] },
    ];
    const summary = summarizeRun(shots, journal, 2, { ok: true });
    assert.equal(summary.ok, true);
    assert.deepEqual(summary.optionalSkipped, ['opt']);
    assert.deepEqual(summary.expectFails, []);
  });

  it('parses snapshot refs and matches Inbox substrings', () => {
    const nodes = parseSnapshot(`
@e1 [button] "More"
@e2 [button] "Inbox 30 tasks not in a Block"
@e3 [button] "Blocks"
`);
    assert.equal(findLabel(nodes, 'More', { role: 'button' }).ref, '@e1');
    assert.equal(findLabel(nodes, 'Inbox').label.includes('Inbox'), true);
    assert.equal(surfaceLooksLikeLauncher('Google Search\nPage 1 of 3.'), true);
    assert.equal(surfaceLooksLikeLauncher('@e1 [group] "planner"\nToday'), false);
  });

  it('resolves session args shape', () => {
    const r = resolveSessionArgs({ serial: 'TEST', config: '/tmp/c.json', session: 't3-x', agentDevice: '/bin/true' });
    assert.equal(r.serial, 'TEST');
    assert.equal(r.session, 't3-x');
    // host config discovery should not throw
    latestHostConfig();
  });

  it('writes a gallery that references every still', () => {
    const dir = mkdtempSync(join(tmpdir(), 'phone-ux-'));
    try {
      const shots = buildTour('fast').slice(0, 3).map((s) => {
        const path = join(dir, `${s.id}.png`);
        writeFileSync(path, 'fake');
        return { id: s.id, title: s.title, path };
      });
      const gallery = writeGallery({ outDir: dir, shots, videoPath: null, runId: 'test-run' });
      const html = readFileSync(gallery, 'utf8');
      for (const s of shots) assert.match(html, new RegExp(s.id));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('links screens to playable chapters and safely displays failures', () => {
    const dir = mkdtempSync(join(tmpdir(), 'phone-ux-gallery-'));
    try {
      const shots = [{id: 'screen', title: 'Task sheet', path: join(dir, 'screen.png'),
        expectOk: true, ok: false, videoStart: 2, videoShot: 5}];
      const gallery = writeGallery({outDir: dir, shots, runId: 'test', videoPath: join(dir, 'full-run.mp4'),
        videoCheck: {ok: true, duration: 4}, result: {ok: false, completedSteps: 1, expectedSteps: 1},
        journal: [{step: 'screen', actions: [{kind: 'click', ok: false, error: '<script>bad()</script>'}]}]});
      const html = readFileSync(gallery, 'utf8');
      assert.match(html, /data-time="2" data-play="true"/);
      assert.match(html, /data-time="3.98"/); // a static final screen may outlast its last encoded frame
      assert.match(html, /chapters\.vtt/);
      assert.match(html, />FAIL</);
      assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
      assert.doesNotMatch(html, /<script>bad\(\)<\/script>/);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
