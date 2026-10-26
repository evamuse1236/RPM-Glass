# Capture (2026-10-18)

This replaces the Capture section of `PRODUCT.md` where they differ. `PRODUCT.md` is over the repo's file-size limit, so it could not be edited in the same change.

## What it does

- Capture saves the exact words first, in one transaction, before any model call. If the model fails, times out or there is no key, the words stay saved with Retry, Edit and (without a key) Connect an AI key.
- Then it reads them and acts. New tasks, reminders, projects and Blocks apply at once with a receipt ("Added Call the bank · Mon 19 Oct, 10:30 AM · Inbox") and Undo. The bar closes itself 6 seconds after a receipt unless touched.
- Changes to saved items (a time change, an edit of an earlier task, done, delete) also apply at once, then show one card: "Changed. Keep it?" with the old value struck through, Undo and Keep. Removal follows one table (`intent-v2/src/removal.mjs`): a saved task goes to Trash; a draft is set aside ("Set aside", Resume brings it back); an alarm or reminder turns its task's alert off ("Alarm off") and keeps the task; a calendar event is refused ("Calendar events stay in your calendar app. Delete it there."). A task and a draft removed together are one change with one Undo that brings both back. The plan snapshot shows which tasks have an alarm or reminder. A plan the model filled in (mode `plan`) is confirmed the same way.
- A clash with the calendar does not block: the change applies and the receipt shows the warning.
- A draft that needs an answer (AM or PM, a time that could not be read, a missing detail) waits with answer chips. The next message answers it.
- When it is unclear which item the words mean, the model asks a choice question: "Which one should I delete?" with two to four chips ("The cooking draft", "Dinner with Asha", "Both"). Each chip's accessible name is "Choose <label>". A tap, or a reply such as "both", "all", "first", "second", "last" or a word from one label, is read on the phone with no model call (`intent-v2/src/choice-reply.mjs`) and applies like any capture, with Keep and Undo. "That one" counts only after an Edit tap on a draft. Anything less clear goes to the model with the question and its choices in view. Only the newest question has chips; a tap on an older one changes nothing.
- What a message points at is decided when its words are saved (`intent-v2/src/conversation-focus.mjs`). An Edit tap on a draft wins. Otherwise, when the last answer asked something (an answer chip question, a choice question, or a question in its reply), the next message points at the same draft and question. The model is shown that draft with the question and choices the person saw.
- Questions get an answer card built from the plan as it is now: the day's agenda, the next item, one task, water or meals. Otherwise a short plain-text answer grounded in the plan snapshot. Water and meals show only when the phone tracks them (`data.body`).
- Undo works while the change is still the latest one, as before.

## Models

- A plain day question on its own ("What's planned today?", "my timetable", "what's next", water, meals) skips the model and shows the card from saved data, so it works with no key (`intent-v2/src/quick-answer.mjs`).
- Every other capture: `anthropic/claude-haiku-5.5`, no reasoning. A reply to an open question (a choice question the phone could not read on its own, or a draft's answer question), a message about the draft in focus, and a follow-up such as "make it a project": Haiku at high effort.
- Re-plan a day or week, sort the Inbox or backlog, advice, or a reading that changes more than three saved items: `anthropic/claude-sonnet-5.5` at high effort. A Haiku reading that turns out hard escalates to Sonnet; if Sonnet then fails, the Haiku reading is used.
- Routing lives in `intent-v2/src/model-policy.mjs`; the native allowlist and limits in `ModelLimits.java`.
- Settings holds two keys. Each call goes to the Anthropic Messages API first (`claude-haiku-5-5`, `claude-sonnet-5-5`, structured output in `output_config.format`, `intent-v2/adapters/claude.mjs`). When Claude has no key, cannot be reached, answers 401, 403, 429 or 5xx, the same call goes once to OpenRouter with the matching model. A 400 or an unusable Claude answer does not fall back. Planner suggestions (GPT Luna), meal guesses and Jev sorting stay on OpenRouter.

## The look

- A dark bar at the bottom (28dp corners, drag handle, no header), large white text, More (three dots) at bottom left, a round filled Send (arrow up; mic when empty) at bottom right. Its colours are the `--bar-*` tokens in `android-companion/theme.css`, dark in both themes.
- More opens a dark sheet with four rows: Planner, History, Context and Settings. Every row opens a real place.
- Receipts, Keep/Undo cards and answer cards sit above the bar in the same dark style. Only the result of this session's sends shows on open, plus anything still waiting (kept words, Keep/Undo, an open question).
- A tap on the empty screen, a swipe down on the handle, or Back closes Capture.

## Logging

One trace per capture. See `docs/diagnostic-logging.md` → Capture traces.
