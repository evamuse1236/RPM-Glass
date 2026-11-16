# Backlog

## 2026-10-20 · One-step phone install (`rpmctl phone-install`)
Phone installs ran as hand-typed adb chains. A data backup silently came out empty and the install went ahead, and wireless adb hung while it still listed the phone. The command would wrap each adb call in a timeout, refuse when the backup is empty, refuse a lower version or another signing key, and check version and data counts after. Open question: should it also send the APK through Juno?

## 2026-10-20 · Send the APK automatically when a build finishes
Vishwajit asked to be "sent completed RPM Glass APKs". Today it is a manual command (`send-rpm-apk.sh`). A post-build hook could send each finished build. Open question: every build, or only builds from a named release branch?

## 2026-10-20 · Find what emptied the app's data on 20 Oct
Between 21:28 and 21:34 the phone app's whole data folder was emptied with no reinstall. `adb install -r` was retested and keeps data. Open question: did Vishwajit clear storage, or does the app wipe itself?

## 2026-10-20: One habit circle above the + button, in priority order

A small round button sits above the + on Today. It shows only the most important habit that is due now. Water comes first. When no glass is due, it shows the next meal that is not logged. When nothing is due, the circle goes away. Every habit gets a place in this order, so new habits slot in without adding more buttons.

Why: logging water or a meal should take one tap from Today, without a row of habit chips.

Open questions:
- Where does the person set the order? (Habits settings, by drag?)
- Does a skipped meal count as done for the circle?
- Should the notch use the same order, so the phone and the planner agree?

## 2026-10-20: Capture chips that appear while typing

As the person types in Capture, chips appear for what the words mean: day, time, alert, repeat, Must, length. A long sentence becomes several task cards before Enter. The phone reads dates and times on its own, instantly. When the person pauses or presses Enter, a quick model read (Haiku, the way Jev sorts the Inbox) names the task, picks its icon and Block, and splits the sentence.

Why: seeing the chips form shows what Capture understood before anything is saved, and it feels fast.

Open questions:
- How long a pause before the model read? (Prototype: 0.9 s.)
- Does the model read cost too much if it runs on every pause? Maybe only on Enter for short text.
- Should a wrong chip be removable with one tap before saving?

## 2026-10-27 · Website tests that check the page, not the CSS text (from the gauntlet retro)

About a third of the website tests added in the 2026-10-27 design gauntlet match exact lines of CSS text. They pass `npm test` without proving the layout, and they break on any harmless rewrite.

Idea: a `check:rules` lint that refuses `assert.match` on a stylesheet's source, so tests read computed styles or the rendered page instead.

Open questions:
- Rewrite the existing CSS-text tests first, or let the lint cover only new ones?
- Which runner reads computed layout fast enough for `npm test` (jsdom has no layout)?

## 2026-10-27 · Check the published Site's served files (from the gauntlet retro)

The Site is private, so a plain fetch of `/web.css` gets 403 and the Chrome extension did not connect. The published look stays UNVERIFIED after each deploy.

Idea: `npm run web:published` fetches the served bundle with the account token and compares its hash with the staged build before it records the publish.

Open questions:
- Which token can read a private Site without a browser sign-in?

## 2026-11-06 · Fix the notch-island swipe from the inert margin
The `notch-island` emulator scenario fails on main since 2026-11-01 (b943f9b, run 41322515914): a swipe up from the open island's inert left margin never logs `notch.gesture up`, so the island may not close. It is marked a known bug until 2026-11-20 so PR 17 could ship. Open question: did a notch change after 2026-10-28 move the inert margin, or did the emulator cutout change?

## 2026-11-07 · Voice refuses "Read me the messages from Ima Test"
Gemini Live answers "I'm just a language model and can't help with that" to "Read me the messages from Ima Test" every time (6 of 6, text mode), while "What did Ima Test say?" and "Read me the messages from Pantry" work. The word "Test" in a chat name seems to trip a canned refusal. Open questions: does renaming the test bot fix it, or a tool description that names Ima Test? Does it also happen on the phone's mic?

## 2026-11-07 · UI gauntlet leftovers (website and phone)
The UI gauntlet (branch `gauntlet/ui-components`) ended with these open items. Today, nav and the task sheet stopped at 7/7–7/8, below the target of 8.
- Website Capture: is it a dark bar in both themes, or does it follow the page theme? Blind judges preferred a light bar twice, but a light bar was lost on the scrim. The bar is also centred on the window, not on the timeline column, so it crosses the side panel.
  Done 2026-11-08 (PR #23): the bar follows the page theme, and on wide it sits over the main column.
- Task pane: the time shows 3 times, and 2 controls set the length. Could the ruler's green bar drag to set the length, so the chips go?
- Today date format: decided 2026-11-07, "7 November 2026" everywhere (gauntlet round 2, thread A).
- Life: unrated Area tracks have tick marks but no thumb, so they do not look draggable.
  Done 2026-11-08 (PR #23): an unrated Area shows a hollow thumb on a faint groove, on the wheel and the slider.
- Detail top bar: a long Block title now wraps to 2 lines in the collapsed bar (no ellipsis, per default-text-fit). The bar keeps that height while the title is hidden at rest, so about 16dp of empty bar shows above the page title.
Open question: run another gauntlet on today, nav and task-sheet with a new direction, not more patches?

## 2026-11-07 · Phone signing key does not match CI or pune
The S24 FE app is signed with the laptop debug key (`02620d8a…`, `dara-laptop:~/.config/.android/debug.keystore`, backup `~/Backups/keys/android-debug-2026-10-20.keystore`). The CI key (`PHONE_SIGNER` `525fee39…` in `scripts/ci/check-signer.mjs`, repo secret `RPM_DEBUG_KEYSTORE`) and pune's `~/.android/debug.keystore` (`8df2ca61…`) both fail `adb install -r` with INSTALL_FAILED_UPDATE_INCOMPATIBLE. Release 0.46 was the CI APK re-signed with the laptop key.
Done 2026-11-07: the laptop key is canonical. CI signs with secret `RPM_PHONE_KEYSTORE`, `PHONE_SIGNER` is `02620d8a…`, and pune builds with `~/.android/rpm-phone.keystore`.

## 2026-11-08 · Website drive failures (pre-existing)
`node scripts/web-sync/drive.mjs --only habits-settings` fails the same way on `origin/main` as on the gauntlet branch (main: 26 of 40 checks pass).
- Every step reports "waiting for the phone", but the phone saves.
- The `capture` save step fails.
- `capture-history` fails because the top-bar Capture button is hidden at 412px.
Logs: `~/.cache/gauntlet2-c/drive-main.log` and `drive-branch.log`.
Open question: is the drive harness out of date, or is web sync slow?

## 2026-11-16 · Gauntlet leftovers: decisions only you can make
The 2026-11-16 bug and architecture gauntlet (PR #25, log in `docs/gauntlet/2026-11-16/PROGRESS.md`) proved each of these and left it unfixed, because the fix is a product decision or changes what a screen shows.

- **Water reminders off: the circle and the notch disagree.** With water reminders off, Today's habit circle still offers a glass, and the notch shows no water habit. Each side has a test that pins its own answer (`fixtures/habit-cases.json` "reminders-off…", `NotchSceneTest.remindersOffKeepTheWaterCountWithoutANudge`). Open question: does "reminders off" mean no circle on Today, or should the notch offer the glass too?
- **Weekly review Inbox rows swipe left to Delete.** Step 2's rows swipe right to Schedule and left to Delete (commit `a961da0`, and `docs/design/weekly-review.md` says so), while the rules table says Delete is never a swipe. Open question: which one wins?
- **A Result's week verdict and its Block's Achieved can disagree.** Mark a Result Achieved in the review, then "Mark not achieved" on its Block: the review still shows the win. The reverse also happens. Open question: in review step 1, does the week's recorded verdict win, or the Block's current status?
- **The notch hides a calendar meeting you are in while a task runs.** With a 3 to 6 PM meeting and a task running at 3:50 PM, the island shows the task and the next task, and never the meeting. `docs/notch/modules-design.md` lists showing it as a planned change. Open question: add the meeting as a row now, or with the modules redesign?
- **Native screens show dates in the phone's language.** The ringing-alarm line, the web-link dialog and the old Main screen format dates with the device locale ("Sa., 7 Nov." on a German phone), against the day-first, no-dot rule. On an English phone only the comma and AM/PM case differ. Open question: should every native date read "Sat 7 Nov · 2:30 pm"?
- **Website voice receipts use their own words.** Deleting a Block by voice reads "Moved to Trash Block" on the website and "Trash" on the phone; a new Block reads "Added Block" against "New Block". Idea: one verb table for both (`verbOf` in `capture-voice-rows.mjs`).
- **A big sync while you type drops the keyboard.** When a re-render changes more than 14 rows, the focused field moves into the fading layer and focus is lost. The words are kept. It needs a browser or emulator scenario to pin, which this cloud run could not add.
- **"Skip today" on another day's Routine skips that day.** Open Tuesday on Today, open a Routine and choose Skip today: Tuesday's run is skipped and the snackbar says "skipped for today". Open question: should the words name the day ("Skip Tue 17 Nov"), or should the sheet always act on today?
- **A Result whose Must repeats reads "No tasks yet" in review step 4.** A daily Must gives the Result a total of 0 there and no Must time on the day strip, while the week card counts its minutes once. A passing test pins the current count, so the fix needs a decision on how a repeating Must counts in a week.
- **A 24-hour phone shows a bare hour.** With the phone on a 24-hour locale the planner writes "16" and "10 – 16" where the notch writes "4:00 PM". Open question: does the planner follow the phone's clock setting (then "16:00"), or always show 12-hour times?
- **A refused Undo says "another device" on one phone.** Undo now refuses when a later change replaced it, with "This changed on another device." That is also what you see after your own later change on the same phone (a glass from the notch, a water snooze). Open question: what should it say? For example "You changed something after this. Undo that first."
- **An alert that already sounded can read "Time passed · not scheduled".** After a one-time reminder has posted, changing its lead, or undoing a move of a task whose alarm was dismissed, leaves the alert marked missed with that label while the task is still ahead. Nothing is lost (the alert did sound); the words are wrong. Idea: "Reminder posted" or "Alarm dismissed".
- **The playground notch still draws the old water-first island.** `playground/notch-scene.mjs` and its tests pin a different answer from `NotchScene.java` on the shared fixture. It is a developer tool only; the port is about 300 lines.

## 2026-11-16 · Gauntlet leftovers: holes in the gates
- **The merge gate does not run on a fast-forward or squash merge.** `git merge feat/x` as a fast-forward, or `git merge --squash` then `git commit`, puts app changes on main with no `scenario --all`. Idea: a reference-transaction hook on `refs/heads/main`. Open question: should a plain `git pull --ff-only` of an already tested origin main then be refused too?
- **The size-scale check does not look inside custom properties.** `--pad-odd: 6px` declared outside `theme.css` and used through `var()` passes. Existing files already hold px tokens outside `theme.css` (`planner.css` keylines, `planner-pages.css` `--fill`). Open question: which of those are allowed?
- **The Capture live-eval gate never asks for the run of main.** The rules table says a Capture AI change is judged against a run of main the same day; `captureEvalEvidence` accepts one branch run of any age. Open question: make the gate ask for the second (paid) run, or reword the rule?
- **Three timing tests fail under load.** `capture-voice-card.test.mjs` ("heard words arrive in a burst…"), `voice-open-line.test.mjs` ("goAway saves the request in progress…") and two Convex tests with a 5 s limit each failed once while eight agents shared a 4-core machine, and passed alone every time. They passed in every GitHub run. Idea: drive them with a fake clock.

## 2026-11-16 · After the gauntlet merge: three things a cloud session could not do
- **Deploy Convex first.** The server changes (redaction at ingestion, diagnostics errors, the user's zone and the time of the tap for website commands, snapshot limits, merge trimming, a new optional `webCommands.fromRevision` field) take effect only after `npm run web:deploy-prod`.
- **Then republish the website.** `npm run web:stage`, deploy through the Sites plugin, then `npm run web:published`. Order matters: the new website sends a `timezone` on plan and Undo commands, and the old server refuses it. From a browser in India the zone is left out, so either order works there; from any other zone the old server would refuse every website edit until Convex is deployed.
- **Check the native fixes on the phone.** The emulator scenarios passed on GitHub, but no scenario drives alarms, the alert ledger, the Next up widget or a restore. A real alarm with a 30 minute lead, snoozed and then dismissed, and one "Check alerts" in Settings, would cover the riskiest changes.
