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
- Task pane: the time shows 3 times, and 2 controls set the length. Could the ruler's green bar drag to set the length, so the chips go?
- Today date format: the phone shows "7. November 2026 ›" (per `docs/design/today.md`), the website shows "7 November 2026 ›". Which one is right?
- Life: unrated Area tracks have tick marks but no thumb, so they do not look draggable.
- Detail top bar: a long Block title now wraps to 2 lines in the collapsed bar (no ellipsis, per default-text-fit). The bar keeps that height while the title is hidden at rest, so about 16dp of empty bar shows above the page title.
Open question: run another gauntlet on today, nav and task-sheet with a new direction, not more patches?

## 2026-11-07 · Phone signing key does not match CI or pune
The S24 FE app is signed with the laptop debug key (`02620d8a…`, `dara-laptop:~/.config/.android/debug.keystore`, backup `~/Backups/keys/android-debug-2026-10-20.keystore`). The CI key (`PHONE_SIGNER` `525fee39…` in `scripts/ci/check-signer.mjs`, repo secret `RPM_DEBUG_KEYSTORE`) and pune's `~/.android/debug.keystore` (`8df2ca61…`) both fail `adb install -r` with INSTALL_FAILED_UPDATE_INCOMPATIBLE. Release 0.46 was the CI APK re-signed with the laptop key.
Done 2026-11-07: the laptop key is canonical. CI signs with secret `RPM_PHONE_KEYSTORE`, `PHONE_SIGNER` is `02620d8a…`, and pune builds with `~/.android/rpm-phone.keystore`.
