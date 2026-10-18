# Capture (2026-10-18)

This replaces the Capture section of `PRODUCT.md` where they differ. `PRODUCT.md` is over the repo's file-size limit, so it could not be edited in the same change.

## What it does

- Capture saves the exact words first, in one transaction, before any model call. If the model fails, times out or there is no key, the words stay saved with Retry, Edit and (without a key) Connect an AI key.
- Then it reads them and acts. New tasks, reminders, projects and Blocks apply at once with a receipt ("Added Call the bank · Mon 19 Oct, 10:30 AM · Inbox") and Undo. The bar closes itself 6 seconds after a receipt unless touched.
- Changes to saved items (a time change, an edit of an earlier task, done, delete) also apply at once, then show one card: "Changed. Keep it?" with the old value struck through, Undo and Keep. Deletes go to Trash. A plan the model filled in (mode `plan`) is confirmed the same way.
- A clash with the calendar does not block: the change applies and the receipt shows the warning.
- A draft that needs an answer (AM or PM, a time that could not be read, a missing detail) waits with answer chips. The next message answers it.
- Questions get an answer card built from the plan as it is now: the day's agenda, the next item, one task, water or meals. Otherwise a short plain-text answer grounded in the plan snapshot. Water and meals show only when the phone tracks them (`data.body`).
- Undo works while the change is still the latest one, as before.

## Models

- Every capture: `anthropic/claude-haiku-5.5`, no reasoning. Follow-ups to an open draft: Haiku at high effort.
- Re-plan a day or week, sort the Inbox or backlog, advice, or a reading that changes more than three saved items: `anthropic/claude-sonnet-5.5` at high effort. A Haiku reading that turns out hard escalates to Sonnet; if Sonnet then fails, the Haiku reading is used.
- Routing lives in `intent-v2/src/model-policy.mjs`; the native allowlist and limits in `ModelLimits.java`.

## The look

- A dark bar at the bottom (28dp corners, drag handle, no header), large white text, `+` at bottom left, a round filled Send (arrow up; mic when empty) at bottom right. Its colours are the `--bar-*` tokens in `android-companion/theme.css`, dark in both themes.
- `+` opens a dark sheet over a dimmed screen: tiles Photos, Camera, Files, Planner, History, Context, Settings, and rows What's planned today?, Plan a Result, Sort my Inbox, Weekly review. Photos, Camera and Files say "<name> isn't built yet" above the bar.
- Receipts, Keep/Undo cards and answer cards sit above the bar in the same dark style. Only the result of this session's sends shows on open, plus anything still waiting (kept words, Keep/Undo, an open question).
- A tap on the empty screen, a swipe down on the handle, or Back closes Capture.

## Logging

One trace per capture. See `docs/diagnostic-logging.md` → Capture traces.
