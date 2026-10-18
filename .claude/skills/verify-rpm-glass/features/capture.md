# Capture

Capture is a dark bar at the bottom of the screen where a user types or speaks a thought. It saves the exact words first. With an AI key it reads them and applies what they say straight away: new items get a receipt with `Undo`, and changes to saved items wait for `Keep` or `Undo`. Questions get an answer card. Without a key it keeps the words and offers to connect a key. The `+` button opens a sheet that reaches the planner, History, Context and Settings.

## Sub-features

- `capture-open` opens the bar with the field ready to type.
- `capture-send-keyless` saves typed words with no AI key and shows the kept-words card.
- `capture-sheet` opens the `+` sheet with its tiles and rows.
- `capture-not-built` shows `Photos isn’t built yet` (also Camera, Files) above the bar.
- `capture-to-planner` opens the planner from the `Planner` tile.
- `capture-history` lists this conversation's captures and what became of each.
- `capture-context` lists remembered preferences.
- `capture-close` closes the bar (tap outside it, swipe its handle down, or Back).
- `capture-voice` starts Android voice input and shows the listening card.
- `capture-apply` applies a capture with a receipt and Undo, or a change with Keep and Undo (model-backed, UNVERIFIED on the emulator).
- `capture-answer` answers a question with a card such as the day's agenda (model-backed, UNVERIFIED on the emulator).

## How to get to it (user POV)

- Open the RPM launcher icon. The bar appears at the bottom.
- Tap the widget's `Capture a thought` pill or its mic on the home screen (see the home widget file).
- Tap `Capture` in the planner top bar.
- Tap the floating butterfly (see the floating butterfly file).

## Driving it with rpmctl

Preconditions:

- Baseline state. No AI key is connected.
- `rpmctl open capture` has been run and the bar shows the field `Capture a thought`.

- **Open.** Run `rpmctl shot capture-empty`. The bar shows the textarea named `Capture a thought`, a `+` button named `More: planner, history, settings` and a round `Voice input` button. `Send` replaces `Voice input` once something is typed. There is no header.
- **Send with no key.** Type words, then press `rpmctl key enter`. A card above the bar reads `Your words are saved` with the words quoted, then `Connect an AI key to sort this into your plan. Your words stay saved either way.` with buttons `Edit`, `Retry` and `Connect an AI key`. Run `rpmctl shot capture-keyless-saved`.
- **Readback.** Run `rpmctl state files/companion.json`. Under `intentV2.captures`, one entry has `raw` equal to the typed words and `status` `captured`, with a `lastError`. No task with that title exists in `entries`.
- **Edit the kept words.** With the field empty, tap `Edit`. The words return to the field.
- **Connect.** Tap `Connect an AI key`. The planner opens its Settings with the `Connect OpenRouter` dialog. Cancel it, then run `rpmctl open capture`.
- **Sheet.** Tap `More: planner, history, settings`. The screen dims and a dark sheet rises with tiles `Photos`, `Camera`, `Files`, `Planner`, `History`, `Context`, `Settings` (scroll the row sideways) and rows `What’s planned today?`, `Plan a Result`, `Sort my Inbox`, `Weekly review`. Run `rpmctl shot capture-sheet`. Back or a tap on the dimmed area closes it.
- **Not built.** In the sheet tap `Photos`. The sheet closes and `Photos isn’t built yet` shows above the bar for a few seconds.
- **To the planner.** In the sheet tap `Planner`. The planner opens on Today. `Weekly review` opens the planner's weekly review.
- **History.** In the sheet tap `History`. A card titled `History` with a `Back to Capture` button lists each capture's time, words and outcome (`Applied`, `Answered`, `Words saved, not sorted yet` with `Retry`, `Undone`).
- **Context.** In the sheet tap `Context`. The card shows `Remembered preferences` and a `Show archived` button.
- **Starters.** `What’s planned today?` sends that question. Without a key the card `Your words are saved` quotes it. `Plan a Result` puts `Help me plan a Result: ` in the field without sending.
- **Voice.** With the field empty tap `Voice input`. A card reads `Listening`, and Android's speech window opens. Spoken text cannot be produced here, so the transcript is **UNVERIFIED**.
- **Close.** Tap the empty screen above the bar. Capture closes.
- **Model path (UNVERIFIED on the emulator).** With a key, a message shows `Saving your words`, then `Your words are saved · Reading them now.`, then either a receipt (`Added Call the bank` / `Mon 19 Oct, 10:30 AM · Inbox` with `Undo` and `Closing in 5s`), a change card (`Changed. Keep it?` with the old time struck through, `Undo` and `Keep`), or an answer card (`Today, …` with the agenda). Undo moves deleted tasks back from Trash.
- **Traces.** Each capture writes one trace. The planner's Settings → Diagnostics → `Recent captures` lists them with model, timing, outcome and Undo marks.

## Gotchas

- The bar closes itself after a receipt unless touched. The keyless path has no receipt, so it stays open.
- Curly apostrophes (`’`) appear in `What’s planned today?` and `isn’t built yet`. Use substrings in `tap --name`.
- `Send` and the keyboard Enter both send. Shift+Enter makes a new line.
- `Voice input` is hidden while the field holds text.
- The widget mic and `open widget-voice` start listening only after the page has loaded its data.
- Reseed or relaunch resets saved words. A `seed` run replaces Capture history too.
- Browser preview: `node scripts/build-companion-assets.mjs && node scripts/gauntlet/serve.mjs`, then `node scripts/gauntlet/shoot.mjs <dir> 4173 capture` shoots every Capture state at 390 px, light and dark, with a canned model.
