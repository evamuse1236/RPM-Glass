# RPM 0.4 redesign verification

Verified 8 September 2026 on the stock Android 16 emulator, using synthetic records and the separate development Convex deployment. The physical Galaxy S24 FE remains on the previously installed 0.3 build; no synthetic records were added to it during this redesign.

## Delivered

- Reusable, trimmed [Mobile Product Design skill](/home/darax/.codex/skills/mobile-product-design/SKILL.md), with Android, visual-system, review and source references; skill metadata validation passed.
- [Plan and design contract](plan.md), including the user's compact-widget and inline-follow-up refinements.
- Native app version 0.4: compact lists and persistent navigation, full-page entry/result editors, Settings and Cloud pages, redesigned alarm presentation, light/dark tokens, and a 4×1 widget.
- Capture keeps its Duration/Purpose and Mood/Energy controls. Follow-up questions and replies stay inline. A separate inline reply field preserves the unfinished main thought. The supported reply handling is deterministic and local; it is not a general-purpose AI chat service.

## Checks performed

| Check | Result and evidence |
|---|---|
| Build and Android lint | Passed; debug app and instrumentation APK assembled with JDK 17 / SDK 36. Lint has no errors; existing warnings remain. |
| Parser | 23 checks passed. Added AM/PM-with-minutes regressions after discovering the 24-hour alternative could consume `at 9:32` before `pm`. Noon, midnight and 24-hour forms pass. |
| Android integration | 38 checks passed against a separate disposable database: persistence, immutable raw input, revisions, exports, outbox acknowledgements, parser, widget inflation and independent alarm/reminder identities. |
| Cloud | 8 tests and TypeScript checks passed. Existing pairing survived updates; redesigned Cloud page showed Up to date / zero queued changes after new emulator saves. |
| Main and editors | Navigated Next and Results; created “Spend more time outside” with its purpose, verified its result page; edited an existing action from 20 to 25 estimated minutes and verified the detail page. |
| Inline replies | Tapped Good mood; typed High energy, twenty minutes, and a purpose. The original unfinished thought remained unchanged. Saved the resulting entry. |
| Inline correction | Typed “Actually, thirty”, received a prompt naming the saved entry, replied yes, and verified its estimate changed from 20 to 30. Original input remains separate. |
| Widget workflows | All four actions exercised. Capture, Check in and Remind open over the actual launcher; Close returns to it. Unfinished Capture text survived closing and reopening. |
| Compact widget | New pin dialog reports 4×1. Actual host allocation 946×273 px; visible bar approximately 64dp high at ordinary text size, with four ≥48dp-high controls. Old 3×2 host allocation stays old until removed/re-added. |
| Larger widget text | At 2× font scale, the new 4×1 widget grows within its cell and wraps/hyphenates labels without omitting their text. Narrow older widget allocations should be re-added or widened. |
| Inline alarm | Typed `today at 9:37 pm`, verified 9:37 PM in the inline confirmation, tapped Set alarm. It fired at 21:37; the foreground service and notification appeared. Opened the redesigned alarm page and dismissed it. The service stopped. |
| Portrait / narrow / keyboard | Inspected ordinary, 1.3× and 2× text; narrow 320dp-equivalent width; ordinary Gboard and visible Save/Close controls. Content scrolls when necessary. |
| Landscape plus 2× text | Tested a 2340×1080 viewport with the keyboard visible. Disabled keyboard full-screen extraction; short layouts place Save in the header and leave the draft visible and scrollable. Saving succeeded and the saved state survived the return to portrait. |
| Dark theme | Inspected main navigation and inline mood replies. [Measured token pairs](contrast.md) meet their stated contrast thresholds. |

Representative screenshots live in `docs/testing/redesign/`: `11-alarm-confirm.png`, `17-cloud.png`, `18-pin-preview.png`, `20-widget-large.png`, `24-alarm.png`, `25-result-detail.png`, `26-entry.png`, `27-landscape-ime.png`, `29-narrow.png`, and final `32-widget.png` / `33-inline-mood.png`.

## Limits

This is a stock emulator at the S24 FE's pixel resolution, not Samsung One UI or Samsung Keyboard. A live TalkBack navigation pass and older Android versions were not tested. Alarm audio was not judged by hearing it on the host. The earlier 0.3 reboot, ten-minute snooze, offline reconnect and export checks remain documented in [the functional baseline](../../testing.md); those unchanged workflows were not all repeated for this visual update. Cloud remains upload-only.

Android permission screens and date/time pickers remain native. Entry-detail choices outside the capture flow may still use short native dialogs. The request to remove pop-ups was applied to the capture/check-in/reminder follow-up workflow.
