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
