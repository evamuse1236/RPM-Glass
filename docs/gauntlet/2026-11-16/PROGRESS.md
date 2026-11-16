# Gauntlet run, 2026-11-16: bugs and architecture

Branch: `ccr-76afab72-lksi4o` (PR #25), from `main` at `009353e` (0.51-planner-pages). The run was a cloud session: no emulator, so GitHub Actions ran the device scenarios. Deadline: merged by 22:15 IST.

Every fix is listed in [fixes.md](fixes.md). What was proven and left unfixed is in `BACKLOG.md` under 2026-11-16.

## Done condition (pass/fail)

1. `npm test` exits 0 on the branch.
2. Every fix has a regression test that failed before the fix, and a fresh critic accepted the commit.
3. A finding that needs an owner decision, a visible change to a screen, a Capture AI pipeline file or a device is not fixed. It goes to `BACKLOG.md`.
4. The emulator scenarios pass on GitHub for the head that merges.
5. A regression review of the final state leaves nothing proven and unfixed.

## Lanes

Each lane had its own worktree and branch, and ran as one workflow of Opus agents.

| Lane | Branch | Tracks |
|---|---|---|
| plan | `gauntlet/plan` | The plan store and Undo; dates, repeats and habit rules; the weekly review |
| ui | `gauntlet/ui` | Task editing; planner pages; Capture and voice outside the AI pipeline; a sweep for flaws already fixed once |
| native | `gauntlet/native` | The notch and Next up widget; alarms, alerts and the bridge; diagnostics, keys and settings |
| sync | `gauntlet/sync` | Web sync and Convex; the website; the rule checks and gates; one rule written in many places |
| review | `gauntlet/review` | Regressions in the gauntlet's own changes: alerts, Undo, sync, save guards, the gates |

## How a finding moved

1. A finder proved it: a repro it ran, or for native code a line-by-line trace.
2. A skeptic re-proved it independently, or refuted it, or set it aside for the owner.
3. A fixer wrote the failing test first, then the smallest fix, and committed in the lane's worktree. One fixer at a time per lane.
4. A fresh critic reviewed the commit and re-ran the test without the fix. A rejected commit got one repair, then a second critic.
5. The lane ran its suites. The lanes were merged into `gauntlet/integrate`, every suite ran there, and the result was pushed for GitHub's `test` and `emulator` runs.

Each lane repeated this with a list of what was already found, until its clock cutoff.

## Log (IST)

- 17:12 Baseline at `009353e`: `npm test` passes (1,706 JS tests, 66 rule checks, 94 Convex tests, the Java unit tests).
- 17:25 Four lanes launched. A first single workflow was stopped: this machine runs two agents per workflow, so one workflow could not finish by the deadline.
- 17:41 Native lane, rounds 1 to 3: five fixes. PR #25 opened as a draft. `test` and `emulator` pass on GitHub.
- 17:55 First merge of all four lanes. Two lanes had fixed the same alert that sounded twice after a restore: `CompanionAlerts.java` keeps the native lane's version and both lanes' tests.
- 18:04 Two lanes stopped early because an agent reported the time as 22:04. The lane script now ignores a time outside the evening's window.
- 18:12 The emulator run failed: `notch-island` timed out opening the planner. Cause: the scenario turns on the camera-cutout overlay, the keyboard comes back up, and `rpmctl open planner` tapped where "Open planner" had been, which was now the "v" key. The failure screenshot shows Capture with "V" typed. Fix: `steadyTap` (`383622c`), which taps only once the button rests and looks again when the planner did not open. Passing again at 18:26.
- 18:31 to 19:24 Checkpoints 4 to 7. Each: merge the lanes, run every suite, push, wait for both GitHub runs. All passed.
- 19:00 Regression-review lane started on the state at `76c425c`. About fifteen fixes had changed the alert ledger, each reviewed alone. It found four regressions in the gauntlet's own work, all fixed: after a time zone change today's repeating alarm would not ring; a snoozed alarm whose snooze passed while the phone was off was dropped; a restore cleared a newer water snooze on the server; rpmctl's list of app files had drifted from the gates'.
- 19:38 A merge of two lanes broke one website test: one lane had made the shared `persist()` wait a turn before saving, and another lane's Must tap now saved a turn late. The UI lane's closer had already fixed it (`91941ae`).
- 19:40 All lanes done. 158 fix commits, 203 files. Checkpoint 8 pushed.
- 19:42 Final regression review started on `b9e8825`. Two of its five reviewers came back within minutes having traced code without running it, so the two riskiest areas got a differential audit instead: the same scenarios run on the old code (`009353e`) and the new, every difference judged.
- 19:50 Final review, sync: the new website sent a `timezone` on plan and Undo commands that the server as deployed refuses, so publishing the Site before deploying Convex would have failed every website edit. Fixed for a browser in India (`b0c6f99`); from other zones Convex must be deployed first.
- 19:50 Final review, save guards: one guard covered every meal row on Today, so a second meal swiped while the first saved was dropped (`1d4c34d`).
- 20:05 Undo audit: 94 Undo flows on each version. 45 differ and all are improvements. One bug in code written today fixed: undoing an earlier voice request reset a meal estimate that had arrived since (`8b2a179`).
- 20:19 Alerts audit: 101 alarm and reminder scenarios on each version, plus a branch-by-branch reading. The judge found the file not safe to merge: a lead alarm cut off mid-ring by a reboot, an app kill or an update never rang again while its task was still ahead; a reminder switched to an alarm armed nothing; a dismissal racing a save skipped tomorrow's alarm; a reminder snoozed just after the update skipped its next day. Five commits (`636682d`, `1c7d19b`, `4d42150`, `a441144`, `3da4434`). The matrix was run again on the final code: every scenario where the old code rang and the user had dismissed nothing rings again. The 19 scenarios that still differ are alerts that had already sounded or been dismissed, or cases the old code left stuck.
- 20:25 Final push. The merge waits for GitHub's `test` and `emulator` runs on this head.

## Result

186 findings went through the lanes, the reviews and the two audits.

| Outcome | Count |
|---|---|
| Fixed, each with a regression test and a critic's acceptance | 158 |
| Proven and set aside for the owner (14 distinct; in `BACKLOG.md`) | 16 |
| Refuted by the skeptic | 11 |
| Already fixed by another lane's commit | 1 |

- By severity: 21 lost or changed data, broke Undo or were a security hole (S1); 87 were wrong behaviour the user meets (S2); 50 were an unusual-path crash or display (S3).
- By kind: 134 bugs and 24 architecture fixes (one rule in several places now pinned by a shared fixture, dead copies removed, checks that could not fail made to fail).
- 166 fix commits (the harness fix among them), 203 files, about 5,400 lines added and 470 removed. About half the added lines are tests.
- Tests: JS 1,706 to 1,861; rule checks 66 to 76; Convex 94 to 99. New shared fixtures: `fixtures/repeat-cases.json` and `fixtures/redaction-cases.json`; the playground's notch copy now reads `fixtures/habit-cases.json` too.
- A critic re-ran the regression test without the fix and saw it fail for 141 of the 158. The other 17 are Java fixes the critic judged from the diff without running Gradle.
- Twelve of the fixes repair the gauntlet's own earlier commits. The regression reviews and the two audits found them; the per-commit critics had not.

Done condition:

1. Pass. `npm test` passes on the final head: 1,861 JS tests, 76 rule checks, 99 Convex tests, the typecheck, the bridge tests and the Java unit tests.
2. Pass, with the 17 Java exceptions above.
3. Pass. No Capture AI pipeline file changed. The 14 set-aside items are in `BACKLOG.md`.
4. Passed on all eight pushed checkpoints, the last being `b9e8825` with every lane merged. The head that merges adds the audits' seven commits and this log, and merges only if both runs pass on it.
5. Pass for alerts and Undo, which got a differential audit. The final reviews of repeat and day rules and of the plan store traced code without running it and found nothing; that is weaker proof.

Not verified:

- Nothing ran on a real phone. The emulator scenarios do not drive alarms, the alert ledger, the Next up widget, a restore or the weekly review. The alert changes are proven by Robolectric JUnit tests and the audit matrix only.
- Each web fix is proven by its test. The browser screenshots show that the planner, the task sheet and Capture still load and draw; they do not drive the fixes.
- Samsung behaviour and the real home-screen widget.
- The Convex changes are not deployed and the website is not republished. Deploy Convex first, then publish the Site (see `BACKLOG.md`).

What the run showed about the method:

- A critic per commit is not enough for a file changed many times. `CompanionAlerts.java` took 19 commits, and seven of them repair regressions that earlier ones introduced.
- A reviewer told to hurry returns leads it did not run. Running one scenario script on both versions and judging the differences found what the readers missed.
- Three timing tests fail when eight agents share four cores. They are in `BACKLOG.md`.
