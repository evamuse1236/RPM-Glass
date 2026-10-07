# RPM

For planning behavior, read `CONTEXT.md` and the relevant part of `PRODUCT.md`. Capture, task, result, purpose, must, priority, and calendar commitment have distinct meanings. Preserve the user's original words and recovery/Undo. Completing actions does not by itself establish that a result was achieved.

For UI work, use `DESIGN.md` and the relevant surface contract under `docs/`; validate the named widget or screen at phone size and enlarged text. A build or web preview alone does not verify a native widget.

`/home/darax/Codex Projects/RPM Agent` is the separate Arden coaching project. Its course study and `docs/rpm-widget-recommendations.md` can inform requested product decisions; recommendations are not already-implemented app features. Keep Arden's persona and memory local to that project.

For a Google Tasks batch, read the installed `tasks` skill and preserve its batch/item ledger. A mock-only integration remains unfinished unless accepted as the requested scope. `docs/rpm-deferred-features.md` is a backlog, not authorization to activate features.

For an authorized phone release, compare the working tree, branch, and installed build so the release preserves newer features and unrelated work. Follow `docs/testing.md` and relevant phone setup guidance. Verify package/version, compatible signing, preserved app data, and actual launch. Report commit/push, APK build, device installation, and external integration activation separately.

## Before you say done

1. Run the checks: `npm test` (JS, rules, Convex, typecheck, Java). The same command runs in CI.
2. If app code changed (`app/src/main`, `android-companion`, `chat-prototype`, `intent-v2`, `cli`), drive the changed feature on the real app with the `verify-rpm-glass` skill: `node .claude/skills/verify-rpm-glass/rpmctl.mjs launch` (`rpmctl` below), then the recipe in its `features/` file. Check it at `display phone` and `display large-text` (and `max-text` if text can wrap), read back what was saved with `state`, and run `logs --errors`.
3. Run `rpmctl scenario --all` when the change touches the planner, Capture or layout. Every scenario must pass or be a recorded known bug.
4. Put the evidence paths (`.verify/evidence/<run-id>/NN-*.png`) in the reply. Mark anything you could not drive (model-backed paths, Samsung-only behavior, the real home-screen widget) **UNVERIFIED**.
5. `npm run check:evidence` must pass. In Claude Code the Stop hook runs it for you.
6. Run `rpmctl cleanup` when you finish. Evidence stays.

## Rules and what enforces them

| Rule | Enforced by |
|---|---|
| An error reaches the screen only through `userMessage(error)`, never as raw script text. | `npm run check:rules` (`raw-error-text`), `android-companion/user-message.test.mjs`, and the scenario runner's raw-error guard |
| A change updates the screen in place: existing rows are kept, the field keeps focus, the new item appears once and is saved where it belongs. | `rpmctl scenario plan-add-in-place`, `android-companion/surface-refresh.test.mjs` |
| The field you are typing in is never covered by the keyboard, nav bar, snackbar or FAB. | `rpmctl scenario focused-field-visible` (known bug recorded, expires 2026-11-07) |
| At 200% text no title or action label is cut, and nav labels stay visible. | `rpmctl scenario max-text-reflow` (one exception pending approval) |
| Capture saves the user's exact words before anything else, with or without an AI key. | `rpmctl scenario capture-keeps-words`, `android-companion/capture-session.test.mjs`, `chat-prototype/composer.test.mjs` |
| Dates are honest and compact ("2:30 pm to 3 pm", "Time not set"). | `android-companion/capture-content.test.mjs` |
| "Done" needs proof from the real app: a build and a screenshot newer than the change. | `scripts/agent/require-evidence.mjs` (Stop hook in `.claude/settings.json`, `npm run check:evidence`) |
| A phone release updates the installed app in place: same signing key, and the build matches this checkout. | `rpmctl doctor --serial <phone>` (`installed-signer-matches-local`, `installed-apk-matches-local-build`, `installed-version`) |
| Never drive or change a device the tooling did not start. | `rpmctl` refuses mutating commands on any device but its own read-only emulator |
| Checks run green on a Windows checkout. | `.gitattributes` (LF checkout) and the win32 guards in the file-mode tests |
| Model-backed paths without a key, Samsung behavior and real widget placement are reported as UNVERIFIED, not as passing. | Judgment: `verify-rpm-glass` SKILL.md proof standards |
