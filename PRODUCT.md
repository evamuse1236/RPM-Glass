# RPM

<!-- impeccable:product-schema 1 -->

## Platform

android

## Stack

The Android companion packages the shared conversational JavaScript/tool engine in a trusted offline WebView. Java owns private storage, Keystore credentials, HTTPS AI requests, floating overlays, notifications and ringing alarms. The desktop HTML companion remains available through Node.js with its existing visual design and preview-only alerts. Legacy Android screens and their separate SQLite/cloud data remain available, not migrated implicitly.

## Users and purpose

A personal planning and check-in tool for the user. Write naturally, see what was understood, then choose a bubble or ask for a change. Optional details must not become a questionnaire. The user removed microphone input from this first prototype's scope.

## Confirmed scope

The user confirmed an assistant, not a coach, with a compact floating browser panel based on their phone reference: ivory surface, green accents, expandable conversation, saved-state cards and contextual bubbles. Import CLI history into a private persistent editable test copy; never write back. Nothing is published. The key stays server-side. The companion uses the user-selected openai/gpt-5.6-luna through OpenRouter; the separate CLI model remains unchanged.

## Product principles

- Keep original words and distinguish planned minutes from reported actual minutes.
- Use short, familiar language: plan, check-in, time, minutes, mood, energy, purpose, reminder, alarm.
- Let the user tap a choice or type a change in the same conversation.
- Ask which entry when a name matches more than one.
- Clearly label prototype-only behavior.
- Keep follow-up questions and their answers connected to the selected entry.
- All unarchived plans, imported history, conversations and explicit preferences are tool-accessible. Supply recent relevant context initially; search/page older context when needed.
- Clear edits apply immediately with Undo. Compound changes are atomic: retain all operations while asking for one missing detail through choice bubbles or typing.
- Remember explicit preferences visibly, not inferred facts. Inspect, correct, archive and restore context; preserve original data.
- Historical cards are snapshots with superseded labels. Current plans shows authoritative latest state.

## Test boundary

The desktop assistant writes only its private persistent test copy. New chats retain plans, memory and older conversations. Desktop reminders and recurrence are settings previews, not real delivery or calendar writes. CLI originals and runtime remain untouched. No microphone is used.

## Android scope (confirmed 2026-09-11)

An installable APK with a draggable butterfly over other apps. The user's Frosted Night HTML now defines the Android UI: one dark assistant card, separate suggestion chips and separate input pill with white circular Send. Long press Send opens labeled menu icons; blank Send and the info icon are non-gesture alternatives. No visible tab bar or pixel-art header. Plus Jakarta Sans and Space Grotesk are bundled offline. Compact maximum is 372 × 370dp; expand for records or large system text. Measured Android insets keep input above the keyboard. Original butterfly remains the launcher; old pixel-garden styling is retired. Reference and acceptance: docs/android-night-plan.md.

RPM reminders use Android notifications; ringing alarms use AlarmManager at the saved plan time, with snooze/dismiss and recurrence. Every current card exposes the native delivery state. User grants notification, overlay, exact-alarm and full-screen permissions through Android. No automatic permission grants, wallpaper changes, microphone, Calendar or Samsung Clock writes.

The APK does not require a desktop server and contains no API key or personal history. The user enters their OpenRouter key on the phone (Keystore encrypted). Desktop companion JSON can be imported explicitly after backup; imported alerts are disarmed until reviewed/enabled. The phone companion store never enters the old Convex outbox. See `docs/android-companion-plan.md` for the surface contract.

## Evidence

`cli/` contains the tested capture/edit workflow and real synthetic API examples. `docs/product-context.md` preserves the earlier product rationale; Android-specific implementation statements there do not describe this web prototype.
