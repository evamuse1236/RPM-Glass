# Capture

Capture is the small sheet where a user types or speaks a thought. It saves the exact words as they are typed, and with an AI key it proposes tasks to confirm before anything is added. Without a key it keeps the words and offers to connect a key. From its More menu it reaches the planner, History, Context, About and settings.

## Sub-features

- `capture-open` opens the sheet with the field ready to type.
- `capture-keyless-note` shows the no-key note with a `Connect` button on an empty sheet.
- `capture-draft-hint` shows the promise line while empty and `Draft saved` once typed words are stored.
- `capture-send-keyless` saves typed words with no AI key and shows the kept-words card.
- `capture-menu` opens the More menu with its items.
- `capture-to-planner` opens the planner from the menu.
- `capture-history` lists past captures and conversations, with New conversation, Archive and Restore.
- `capture-context` lists remembered preferences and original words.
- `capture-about` shows the About page and its Phone settings button.
- `capture-expand` toggles the sheet between small and expanded.
- `capture-close` closes the sheet.
- `capture-voice` starts Android voice input and shows the listening card.
- `capture-proposals` shows proposal cards with Save and Not now, and the receipt with Undo (model-backed, UNVERIFIED).

## How to get to it (user POV)

- Open the RPM launcher icon. The Capture sheet appears.
- Tap the widget's `Capture a thought` pill or its mic on the home screen (see the home widget file).
- Tap `Capture` in the planner top bar.
- Tap the floating butterfly (see the floating butterfly file).
- Tap `Ask Capture` in a task's More menu in the planner.
- Tap `Connect` in the keyless note to reach AI key setup.

## Driving it with rpmctl

Preconditions:

- Baseline state. No AI key is connected.
- `rpmctl open capture` has been run and the sheet shows the field `Capture a thought`.

- **Open.** Run `rpmctl open capture`, then `rpmctl shot capture-empty`. The sheet shows the title `Capture`, the textarea named `Capture a thought`, and buttons `Voice input`, `Expand Capture`, `Close Capture` and `More: planner, history, settings`. `Send` appears only once something is typed.
- **Keyless note.** On the empty sheet run `rpmctl ui --all`. The text `Without an AI key, Capture saves your words but can’t sort them.` and a button `Connect` are present. The line `Saved as you type. Added only when you confirm.` is shown under the field.
- **Draft hint.** Run `rpmctl tap --role textbox --name "Capture a thought"` then `rpmctl type "Ask Prof. Rao about the citation format"`. After a moment the line under the field reads `Draft saved` and the mic is replaced by `Send`. Run `rpmctl shot capture-draft-saved`.
- **Send with no key.** Press `rpmctl key enter` (Send does the same). A card appears saying `Your words are saved` with the typed words quoted, then `Connect an AI key to sort this into tasks. Your words stay saved either way.` The dock shows buttons `Edit`, `Retry` and `Connect AI`. Run `rpmctl shot capture-keyless-saved`.
- **Readback.** Run `rpmctl state files/companion.json`. Under `intentV2.captures`, one entry has `raw` equal to the typed words and `status` `captured`; it also carries a `lastError` with code `TRANSPORT_ERROR`. The conversation under `conversations` takes the words as its `title`. No task with that title exists in `entries`, because nothing was confirmed.
- **Edit the kept words.** Run `rpmctl tap --role button --name "Edit"`. The words return to the field with `Send` ready.
- **Connect.** Run `rpmctl tap --role button --name "Connect AI"` (or `Connect` on an empty sheet). The planner opens a native dialog titled `Connect OpenRouter` with a field `OpenRouter API key` and buttons `CANCEL` and `SAVE KEY` (read with `rpmctl ui --native`). Run `rpmctl tap --native "Cancel"`. The planner Settings page shows, with the status line `Enter the key in the secure Android dialog.` Do not enter a key. Run `rpmctl open capture` to return.
- **More menu.** Run `rpmctl tap --role button --name "More: planner, history, settings"`. A menu named `Capture options` appears with menuitems `About`, `Assistant settings`, `Context`, `History`, `What’s planned today?`, `Plan a Result` and `Open planner`. With a draft typed, `Open planner` carries the small note `Your draft is kept`. Run `rpmctl shot capture-menu`.
- **To the planner.** Run `rpmctl tap --role menuitem --name "Open planner"`. The planner opens on Today with the heading `Today`. Run `rpmctl key back`: Capture returns and the typed draft is still in the field.
- **History.** Run `rpmctl tap --role menuitem --name "History"` from the menu. The title reads `History`, with a `Back` button, the line `Previous captures and conversations. New conversations keep your plans and memory.` and a button `New conversation`. Each conversation is a button named like `Ask Prof. Rao about the citation format2 messages`, the current one ending `· current`, and past ones have an `Archive` button. Run `rpmctl shot capture-history`. Tapping `New conversation` returns to an empty chat with the keyless note and a fresh `0 messages · current` conversation in History.
- **Context.** From the menu choose `Context`. The page shows `Remembered preferences`, the empty line `Nothing remembered yet. Tell Capture a preference and it will appear here.`, `Original words`, and a `Show archived` button.
- **About.** From the menu choose `About`. The page shows `Your pocket planner`, `Private phone storage · OpenRouter AI`, several privacy paragraphs and a button `Phone settings` further down. `Phone settings` opens the planner Settings page. `Back` returns to the chat.
- **Assistant settings.** From the menu choose `Assistant settings`. The planner opens on its Settings page (heading `Settings`), not a native screen.
- **Starters.** From the menu choose `What’s planned today?`. Without a key it is saved as words: the card `Your words are saved` quotes the question, and `intentV2.captures` gains an entry with that `raw`.
- **Expand.** Run `rpmctl tap --role button --name "Expand Capture"`. The button name becomes `Make Capture smaller` (pressed true) and the sheet grows. Tap it again to restore. Run `rpmctl shot capture-expanded`.
- **Voice.** With the field empty, run `rpmctl tap --role button --name "Voice input"`. A status reads `Listening with Android voice input` with `Speak in the voice input window...`, and Android's speech window opens. Run `rpmctl key back`: the window closes and the card goes away. Spoken text cannot be produced here, so the transcript result is **UNVERIFIED**.
- **Close.** Run `rpmctl tap --role button --name "Close Capture"`. The sheet leaves and the home screen shows.
- **Large text.** Type a long draft, then run `rpmctl display large-text` and `rpmctl shot capture-large-text`, then `rpmctl display max-text` and `rpmctl shot capture-max-text`, then `rpmctl display phone`. At max text the field scrolls inside the sheet, a `More below` pill appears over the response, and `Send`, `Edit` and `Connect AI` stay reachable.
- **Model path (UNVERIFIED).** With a key, a message would show `Saving your words…`, then `Sorting into your plan…`, then a proposal card with `Save`, `Not now`, chips for day and Block, and a `Leave out` control per task. After `Save` the receipt says `Task added` with `Undo` and `Open in Planner`, and Capture counts down `Closing in 5s`. None of this can run on the emulator.
- **Errors.** Run `rpmctl logs --errors`. The only line seen was a keyboard-process message (`ImeBackDispatcher`), not an app error.

## Gotchas

- The Capture sheet closes itself after a receipt unless touched. The keyless path has no receipt, so it stays open.
- The apostrophes in the keyless note and the starter text are curly (`’`). Use the substring `Without an AI key` or `planned today` in `tap --name`.
- `Send` and the keyboard Enter both send. Shift+Enter makes a new line.
- `Voice input` is hidden while the field holds text. Clear the field first (`rpmctl key del` repeatedly).
- Sending the same words again, for example after `Edit`, saves a second capture. History then shows `2 messages`.
- `open planner` goes through this sheet's menu, so a broken menu breaks every planner recipe.
- The widget mic and `open widget-voice` start listening only after the page has loaded its data. Wait for the `Listening` card before judging.
- Reseed or relaunch resets saved words. A `seed` run replaces Capture history too.
- Native dialog buttons show in capital letters (`CANCEL`) but `tap --native "Cancel"` matches.
