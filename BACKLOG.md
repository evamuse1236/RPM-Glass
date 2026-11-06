# Backlog

## 2026-10-31 · Calendar warning: name the cause and offer the fix
What: when calendar permission is off but a calendar was picked before, say "Calendar access is off" with a "Turn on" button. Today every timed capture shows the vague yellow "Calendar could not be fully checked…".
Why: Vishwajit kept seeing the warning and asked why. On the phone, READ_CALENDAR was off (`granted=false`, no user-set flag) while calendar 6 stayed selected. `calendarRisk` in `android-companion/planner-calendar.mjs` warns for `permission_needed` when `configured` is true.
Open questions: what turned the permission off (no USER_SET flag, so maybe an install or Android's unused-app reset)? Should the app ask again on next Capture, or once in Settings?

## 2026-10-28 · Voice: say when the spoken answer is muted
What: when a ramble starts and the phone's media volume is 0, show "Turn up media volume to hear RPM" on the Listening card.
Why: Vishwajit asked why voice never talked back. The app did play its answer, but media volume on the speaker was 0, so it was silent.
Open questions: also offer a one-tap volume raise, or only the hint? Should a later back-and-forth mode (talk, answer, talk again) exist, given that pause detection cut rambles short in the 2026-10-27 probe?

## 2026-10-28 · Voice: a silent ramble invents words and answers in Spanish
What: on the phone, I tapped the mic, stayed silent and tapped Stop. Gemini heard "¿Qué tal?" and replied "¡Hola! ¿Cómo estás?…" in Spanish. Nothing was saved to the plan.
Why: a ramble with no speech should say "I heard nothing" in English, not invent words.
Open questions: pin the reply language in the system prompt, or drop a turn whose audio has no speech before it goes to Gemini?

## 2026-10-27 · Narrow Capture: new things by words, edits by pencil, @ to point
What: Capture's AI reads new things (tasks, reminders, Blocks, questions). A pencil on each saved row opens the existing task sheet for edits. Typing @ in the field picks a saved task, Block or Project, so code knows the target without the model.
Why: in the 88-case run, 10 of the 13 captures that needed Sonnet or a second try were about existing items (moves, retimes, "Done", draft edits); new items failed mainly on misheard dictation. Edits by language carry the snapshot and much of the 30.7 KB prompt.
Open questions: what share of real phone captures are edits (test sets lean toward edits)? Does this revise the 2026-10-18 "acts then confirms" decision for edits? Keep "move gym to 8" by words as a slower fallback, or drop it?

## 2026-10-27 · Jev check before a Sonnet redo in Capture
What: when Haiku's draft fails a local check, ask Jev (about 0.8 s) whether the draft still matches the words, and save it with a review flag in place of a 6–17 s Sonnet redo.
Why: the redo was the whole of the old 10–22 s waits. Jev is a typed decision model, so it fits a yes/no check, not writing.
Open questions: is it worth it while the redo rate stays at 0 (0.34 onward)? It needs about 50 labelled drafts to set the threshold. Details: `docs/prior-art.md`, prototype in `scripts/capture-stress/models.mjs` runs.

## 2026-10-27 · Capture eval: baseline, held-out phrases, frozen checker
The live-eval guard only checks that a real-phrase run exists; it reports the score but does not judge it. In the 2026-10-27 rounds a builder saw the exact failing phrases in its brief, changed the checker (`checks.mjs`) in the same round, and its score was compared with a prototype scored by the old checker.

Mechanism: store a baseline result and fail when real-corpus passes drop below it; split the corpus by case id into a held-out set that no brief may name; record the checker's hash in `results.json` and refuse a comparison across different checker hashes.

Open questions: how many held-out phrases are enough to trust (guess: 20+)? Who adds new real phrases as they come in?

## 2026-10-27 · One owner for each Capture decision (from the redesign prototype)
The redesign prototype scored 56/66 on real phrases with two ideas: code, not the model, owns the time; and the reply is built from what was actually saved. The patch rounds won on score (62/66) but kept two owners for the time, and fixed "6:00 p.m." with another special case. Port the two ideas and compare on the same live eval, with the same checker.

## 2026-10-27 · Capture screen fixtures recorded from the real pipeline
The forming-cards screen passed its tests with a hand-typed receipt, then crashed on every real save (`items.find is not a function`). A test should check each screen fixture against a receipt and partials the real pipeline produced, and builders on both sides of that hand-off should start from one shared recorded fixture.

## 2026-10-27 · Snapshots never show a secret
A device-helper snapshot showed a truncated model-key prefix after the key went into the emulator's AI settings. `rpmctl ui` and `rpmctl shot` output should redact password and API-key fields, with a test that uses a fake sentinel key. Related global idea: a hook that refuses `adb shell input text` carrying a vault value outside `secret run`.

## 2026-10-27 · Web-only builders without an emulator lease (needs your call)
Builders on web-only changes waited on the shared emulator lease again and again; the website builder ran about 74 minutes. Today a web-only change needs `rpmctl sync` plus a screenshot on the emulator. Option: accept a local `browser-shot.mjs` screenshot for web-only changes. This loosens a proof rule, so it is your decision.

## 2026-10-22 · Read each sentence while the person is still talking
Today the model read waits for a 0.9 s pause, reads the whole draft (about 2.5 s), and stops after 4 reads. During voice typing there is often no pause, so model chips come only at the end. The idea: send each finished sentence to Haiku as soon as it ends, and stream the answer so chips appear one by one. By the time the person presses Enter, every sentence is already read, so the save feels instant.

Why: Vishwajit wants Capture to "think in real time" as they type or dictate, not after Send.

Open questions:
- What ends a sentence in dictation: a full stop, "and", or a short pause?
- When a later sentence changes an earlier one ("actually make that 7"), which read wins?
- Cost cap per draft instead of 4 reads? (About $0.0006 per cached Haiku read.)
- Each read could resend the earlier sentences as a cached prefix, so the model only processes the new sentence (inferred from how prompt caching works).
- For the mic button: a live voice model (Gemini Flash Live, OpenAI Realtime) hears speech as it streams and adds tasks mid-sentence, the way Todoist Ramble does. This is bigger: audio streaming, another provider, and a new cost.
- Later: an on-device model (Gemini Nano) for guesses with no network. Does the S24 FE support it?
- Later: guess chips from history ("call mom" is usually 8 PM) before the words say it.

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

## Done

### 2026-10-28 · Voice: Blocks in Areas, Block order (done 2026-10-28, branch `feat/voice-backlog`)
Decided: voice reaches an Area through Goals (no direct link); Blocks keep their deadline order, and voice explains it instead of reordering. Built `save_goal`, `delete_goal` and `save_project goalId`. Live eval: 4 of 4 right.

### 2026-10-28 · Voice: words while talking, Undo after reopening (done 2026-10-28, branch `feat/voice-backlog`)
Measured: Gemini sends words only after Stop. Decided: live words on the website only (browser recognizer, display only); the phone shows none. History keeps Discard for the newest ramble after Capture reopens.
