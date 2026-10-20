# RPM

For planning behavior, read `CONTEXT.md` and the relevant part of `PRODUCT.md`. Capture, task, result, purpose, must, priority, and calendar commitment have distinct meanings. Preserve the user's original words and recovery/Undo. Completing actions does not by itself establish that a result was achieved.

For UI work, use `DESIGN.md` and the relevant surface contract under `docs/`; validate the named widget or screen on the S24 FE at One UI default text (`rpmctl display phone`); larger text sizes are not a target. A build or web preview alone does not verify a native widget.

`/home/darax/Codex Projects/RPM Agent` is the separate Arden coaching project. Its course study and `docs/rpm-widget-recommendations.md` can inform requested product decisions; recommendations are not already-implemented app features. Keep Arden's persona and memory local to that project.

For a Google Tasks batch, read the installed `tasks` skill and preserve its batch/item ledger. A mock-only integration remains unfinished unless accepted as the requested scope. `docs/rpm-deferred-features.md` is a backlog, not authorization to activate features.

For an authorized phone release, compare the working tree, branch, and installed build so the release preserves newer features and unrelated work. Follow `docs/testing.md` and relevant phone setup guidance. Verify package/version, compatible signing, preserved app data, and actual launch. Report commit/push, APK build, device installation, and external integration activation separately.

## Before you say done

1. Run the checks: `npm test` (JS, rules, Convex, typecheck, Java). The same command runs in CI.
2. If app code changed (`app/src/main`, `android-companion`, `chat-prototype`, `intent-v2`, `cli`), use the `verify-rpm-glass` skill and run `npm run ci:emulator` after pushing the branch. For feature paths beyond those scenarios, use the local emulator as an interactive fallback: `node .claude/skills/verify-rpm-glass/rpmctl.mjs launch` (`rpmctl` below), then the recipe in its `features/` file. After a web-only edit, `rpmctl sync` reloads it in seconds. Check the changed screen at `display phone` (One UI default text), read back what was saved with `state`, and run `logs --errors`.
3. Run every scenario in CI with `npm run ci:emulator` when the change touches the planner, Capture or layout. Every scenario must pass or be a recorded known bug.
4. Put the evidence paths (`.verify/evidence/<run-id>/NN-*.png`) in the reply. Mark anything you could not drive (model-backed paths, Samsung-only behavior, the real home-screen widget) **UNVERIFIED**.
5. `npm run check:evidence` must pass. In Claude Code the Stop hook runs it for you.
6. Run `rpmctl cleanup` when you finish. Evidence stays.

## Rules and what enforces them

Before changing Capture, read `docs/rules/capture.md`. Before changing the notch, read `docs/rules/notch.md`. Each holds that area's rules and checks; the table below holds the rest.

| Rule | Enforced by |
|---|---|
| One agent drives one emulator | Machine-wide rpmctl lease for the worktree and ports, plus the run owner token (missing tokens warn for one compatibility release) |
| Run emulator tests on GitHub Actions by default; use the local emulator for interactive driving. CI adopts only an explicitly selected read-only emulator. | `.github/workflows/emulator.yml`, `npm run ci:emulator`, rpmctl adoption and lifecycle tests in `npm test` |
| On Windows, rpmctl starts the emulator's netsimd itself with no console, so no netsim window pops up. | `.claude/skills/verify-rpm-glass/lifecycle.test.mjs` (`netsimToStart`) |
| rpmctl selectors match the app | `.claude/skills/verify-rpm-glass/selectors.test.mjs` in `npm test` |
| An error reaches the screen only through `userMessage(error)`, never as raw script text. | `npm run check:rules` (`raw-error-text`), `android-companion/user-message.test.mjs`, and the scenario runner's raw-error guard |
| A change updates the screen in place: existing rows are kept, the field keeps focus, the new item appears once and is saved where it belongs. | `rpmctl scenario plan-add-in-place`, `android-companion/surface-refresh.test.mjs` |
| The field you are typing in is never covered by the keyboard, nav bar, snackbar or FAB; while the keyboard is open the planner hides its tab bar and + button. | `rpmctl scenario focused-field-visible` |
| Design and proof target the user's S24 FE at One UI default text: 384dp wide (density 450), 100% text. Enlarged text (130%, 200%) is not a target (user, 2026-10-19). At that size no title or action label is cut, no word is split across two lines (Today, Blocks, the task sheet, Capture), and nav labels stay visible. | `.claude/skills/verify-rpm-glass/display-target.test.mjs`, `rpmctl scenario default-text-fit` (one exception pending approval) |
| Every stylesheet Capture and the planner link is served by the native asset allowlist. | `android-companion/companion-assets.test.mjs` |
| Dates are honest and compact ("2:30 pm to 3 pm", "Time not set"). | `android-companion/capture-content.test.mjs` |
| No page shows a scrollbar. | `android-companion/companion-assets.test.mjs` |
| Task rows swipe right to complete and left to schedule (Move in the Inbox); a drag locks to one axis after 8px; no swipe starts within 24dp of a screen edge; Delete is never a swipe. On Today a timed card held still for 250ms lifts and moves in 15-minute steps (its knurl changes the length); a vertical drag before the lift scrolls and never moves a card. | `android-companion/task-swipe.test.mjs`, `android-companion/spine-drag.test.mjs` |
| On a "Which one?" card the first chip carries a check, and a right swipe on the card picks it with the same action as tapping it; an answered question offers no swipe. | `android-companion/capture-question-swipe.test.mjs` |
| Motion tokens in `theme.css` match `motion-core.mjs`. | `android-companion/motion-tokens.test.mjs` |
| A Block's add field finds Inbox tasks by word starts and pulls one in; Enter alone creates. | `android-companion/block-add.test.mjs`, `rpmctl scenario plan-add-in-place` |
| The task sheet's Time row is a slider over every half hour from 6:00 AM to 11:00 PM (its chips, opened by tapping the value, add the task's own off-grid time); Length is a slider from 5 min to 4 h; a slider saves only when let go and names its value for TalkBack. Its Day row is Today, Tomorrow and five weekdays. | `android-companion/habits.test.mjs`, `android-companion/fact-slider.test.mjs` |
| With no saved meal plan, meals sit at 8:30 AM, 1 PM and 8 PM; a meal turned off leaves Today but its logged meal stays. Water steppers keep 1–20 glasses and 15–240 minutes. | `android-companion/habits.test.mjs` |
| On Today a drag across the Water row adds one glass per 24dp (never takes a saved glass off) and saves them as one change with one Undo; a meal not yet logged swipes right to log its usual food now with Undo, or opens the meal sheet when it has none. | `android-companion/spine-drag.test.mjs` (`glassesFor`), `verify-rpm-glass` drive of Today |
| Water and meal rules are the same in the planner and the notch: both pass `fixtures/habit-cases.json`. | `android-companion/habit-rules.test.mjs`, `NotchHabitsTest.java` |
| `rpmctl seed` keeps synced web assets, so a seeded run shows the synced code. | `.claude/skills/verify-rpm-glass/seed-sync.test.mjs` |
| A web-only change can be proven with `rpmctl sync` instead of a new APK; the screenshot must carry the hash of the exact assets now built, and Java changes still need the APK. | `scripts/rules/require-evidence.test.mjs` |
| Every name an app page uses is declared or imported; a missing import fails `npm test`, not the phone. | `scripts/rules/undefined-names.test.mjs` |
| "Done" needs proof from the real app: a local build with an rpmctl screenshot newer than the change, or a passing GitHub emulator run (`npm run ci:emulator`) whose commit has the same app files as HEAD and nothing uncommitted. | `scripts/agent/require-evidence.mjs` (Stop hook in `.claude/settings.json`, `npm run check:evidence`), `scripts/rules/require-evidence.test.mjs` |
| A GitHub emulator run builds with the phone's key (repo secret `RPM_DEBUG_KEYSTORE`), so its `rpm-emulator-build` artifact installs over the app from any computer: `gh run download <run> -n rpm-emulator-build`. | `scripts/ci/check-signer.mjs` step in `.github/workflows/emulator.yml`, `scripts/ci/emulator.test.mjs` |
| A phone release updates the installed app in place: same signing key, and the build matches this checkout. | `rpmctl doctor --serial <phone>` (`installed-signer-matches-local`, `installed-apk-matches-local-build`, `installed-version`) |
| Drive only an emulator the tooling started or explicitly adopted on the CI runner. | `rpmctl` requires the device identity, lease and owner; `launch --attach` validates the read-only emulator's PID, port, AVD and process start identity |
| Checks run green on a Windows checkout. | `.gitattributes` (LF checkout) and the win32 guards in the file-mode tests |
| Model-backed paths without a key, Samsung behavior and real widget placement are reported as UNVERIFIED, not as passing. | Judgment: `verify-rpm-glass` SKILL.md proof standards |
