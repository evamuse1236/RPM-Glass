# Capture

Capture is a dark bar at the bottom of the screen where a user types or speaks a thought. It saves the exact words first. With an AI key it reads them and applies what they say straight away: new items get a receipt with `Undo`, and changes to saved items wait for `Keep` or `Undo`. Questions get an answer card. Without a key it keeps the words and offers to connect a key. The `+` button opens a sheet that reaches the planner, History, Context and Settings.

## Sub-features

- `capture-open` opens the bar with the field ready to type.
- `capture-send-keyless` saves typed words with no AI key and shows the kept-words card.
- `capture-sheet` opens the `More` sheet with its four rows: Planner, History, Context, Settings.
- `capture-to-planner` opens the planner from the `Planner` row.
- `capture-history` lists this conversation's captures and what became of each.
- `capture-context` lists remembered preferences.
- `capture-close` closes the bar (tap outside it, swipe its handle down, or Back).
- `capture-voice` starts Android voice input and shows the listening card.
- `capture-apply` applies a capture with a receipt and Undo, or a change with Keep and Undo (model-backed, UNVERIFIED on the emulator).
- `capture-answer` answers a question with a card such as the day's agenda (model-backed, UNVERIFIED on the emulator).
- `capture-forming` shows dashed cards with chips above the bar while words are typed, before anything is saved (instant chips keyless; the model read is UNVERIFIED without a key).
- `capture-choice` answers a "Which one?" choice question by a chip tap or a typed "both"/"first" with no model call (keyless with the seed below).

## How to get to it (user POV)

- Open the RPM launcher icon. The bar appears at the bottom.
- Tap the widget's `Capture a thought` pill or its mic on the home screen (see the home widget file).
- Tap `Capture` in the planner top bar.
- Tap the floating butterfly (see the floating butterfly file).

## Driving it with rpmctl

Preconditions:

- After `rpmctl launch`, run `export RPMCTL_OWNER=<owner from launch>` in this agent's shell (PowerShell: `$env:RPMCTL_OWNER = '<owner from launch>'`). Keep it set through cleanup.

- Baseline state. No AI key is connected.
- `rpmctl open capture` has been run and the bar shows the field `Capture a thought`.

- **Open.** Run `rpmctl shot capture-empty`. The bar shows the textarea named `Capture a thought`, a `More` button (three dots) and a round `Voice input` button. `Send` replaces `Voice input` once something is typed. There is no header.
- **Send with no key.** Type words, then press `rpmctl key enter`. A card above the bar shows a green check and the words quoted on one line (a button named `Your words are saved: <words>`; a tap shows them all), with buttons `Edit`, `Retry` and `Connect an AI key`. Run `rpmctl shot capture-keyless-saved`.
- **Readback.** Run `rpmctl state files/companion.json`. Under `intentV2.captures`, one entry has `raw` equal to the typed words and `status` `captured`, with a `lastError`. No task with that title exists in `entries`.
- **Edit the kept words.** With the field empty, tap `Edit`. The words return to the field.
- **Connect.** Tap `Connect an AI key`. The planner opens its Settings with the `Connect OpenRouter` dialog. Cancel it, then run `rpmctl open capture`.
- **Sheet.** Tap `More`. A sheet rises with rows `Planner`, `History`, `Context` and `Settings`, and nothing else. Run `rpmctl shot capture-sheet`. Back, Escape or a tap above the sheet closes it.
- **To the planner.** In the sheet tap `Planner`. The planner opens on Today.
- **History.** In the sheet tap `History`. A card titled `History` with a `Back to Capture` button lists each capture's time, words and outcome (`Applied`, `Answered`, `Words saved, not sorted yet` with `Retry`, `Undone`).
- **Context.** In the sheet tap `Context`. The card shows `Remembered preferences` and a `Show archived` button.
- **Voice.** With the field empty tap `Voice input`. A card reads `Listening`, and Android's speech window opens. Spoken text cannot be produced here, so the transcript is **UNVERIFIED**.
- **Close.** Tap the empty screen above the bar. Capture closes.
- **Model path (UNVERIFIED on the emulator).** With a key, a message shows `Saving your words`, then `Your words are saved · Reading them now.`, then either a receipt (`2 added`, then per item an image named `Added`, the title and chips such as `Mon 19 Oct`, `10:30 AM`, `Inbox`, with `Undo` and `Closing in 5s`), a change card (`Changed. Keep it?` with the old time struck through inside its chip, `Undo` and `Keep`), or an answer card (`Today, …` with the agenda). Undo moves deleted tasks back from Trash.
- **Choice question (keyless).** Run `node scripts/gauntlet/choice-question-seed.mjs .verify/choice.json task`, then `rpmctl seed --file .verify/choice.json` and `rpmctl open capture`. A card reads `One question first`, `Which one should I delete?`, the words `“Delete this”`, and chips named `Choose The cooking draft`, `Choose Dinner with Asha`, `Choose Both`. The field reads `Or answer in your own words`. Run `rpmctl shot capture-choice-question`. Each chip leads with a delete icon; the first has a primary outline: a right swipe on the card (start 24dp or more in from the edge, past 90dp) picks it, the same as tapping it. Tap `Choose Both`: `2 changes made. Keep them?` lists `Dinner with Asha` (image `Moved to Trash`) and `Cook dinner` (image `Set aside`), with `Undo` and `Keep`. `rpmctl state files/companion.json`: entry 1 has `archived: true`, `intentV2.drafts["draft-m0"].status` is `parked`, and the new capture has `choice` and `calls: 0`. Tap `Undo`: entry 1 is back and the draft's status is `draft`. Reseed and type `Both` then Enter: the same result with no key, because the phone reads the reply itself. Reseed with `alarm` instead of `task`: `Both` shows `Alarm off` and entry 1 keeps its task with `alertIntent.type` `off`.
- **The 19 Oct conversation (model-backed, UNVERIFIED without a key).** With a key: capture `Cook dinner tonight at 7` (it asks `7 AM or 7 PM?`), then `Delete this`, `That one only`, `Both`, `First`. Expect a choice question after `Delete this`; `Both` applies with Keep and Undo and its trace has no model call; `First` changes nothing.
- **Forming while typing (keyless).** Type `Call Amma tomorrow at 6 pm, remind me 10 min before` without pressing Enter. A dashed card named `Not saved yet: Call Amma` sits above the bar with chips for tomorrow's date (such as `Wed 21 Oct`), `6:00 PM` and `Reminder`. Run `rpmctl shot capture-forming`. Type `. Wake me at 6:30 with an alarm for the RM quiz`: a second card shows `6:30 AM` and `Alarm`. No `Reading` chip shows without a key. `rpmctl state files/companion.json` has no new capture until Enter. Press Enter: the kept-words card replaces the dashed cards. Check the field stays above the keyboard with `rpmctl scenario focused-field-visible`.
- **Forming with a key (UNVERIFIED on the emulator).** After about a second idle, the last card shows a shimmering `Reading` chip, then the model's title, icon and Block chip. Enter shows the receipt with the same chips, and its trace in Diagnostics says `reused the read while typing`; the read's own trace says `Read while typing, nothing saved`.
- **Traces.** Each capture writes one trace. The planner's Settings → Diagnostics → `Recent captures` lists them with model, timing, outcome and Undo marks.

## Gotchas

- The bar closes itself after a receipt unless touched. The keyless path has no receipt, so it stays open.
- Tap `More` with `--role button`: other buttons contain the word.
- `Send` and the keyboard Enter both send. Shift+Enter makes a new line.
- `Voice input` is hidden while the field holds text.
- The widget mic and `open widget-voice` start listening only after the page has loaded its data.
- Reseed or relaunch resets saved words. A `seed` run replaces Capture history too.
- Browser preview: `node scripts/build-companion-assets.mjs && node scripts/gauntlet/serve.mjs`, then `node scripts/gauntlet/shoot.mjs <dir> 4173 capture` shoots every Capture state at 390 px, light and dark, with a canned model.
