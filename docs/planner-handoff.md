# RPM 0.8 — planner handoff

Completed 12 September 2026. All implementation phases are checked in [the phased plan](planner-phases.md). This is a signed Android test build, not a Play Store release. No physical phone installation or real Google-account connection is claimed.

## Install

[RPM 0.8 planner APK](../releases/rpm-0.8-planner.apk) — 1,993,189 bytes. Package `com.rpm.prototype`, version code 8, Android 8.0+.

Signature verifies using APK v2. It matches the existing 0.7 signing certificate, allowing an in-place update where that build is installed. Do not uninstall first; export a context backup from Settings before updating.

- APK SHA-256: `dbf9daf59b4efaa474d9dbb3f8b77f947fd4966438cf161e562b55195463e3f5`
- Signing-certificate SHA-256: `525fee39663b1984f55e3f7367eb783968166009a0210293bc4b0b4e8fb00bf1`
- Signed with the existing Android debug certificate. The previous `rpm-0.7-night.apk` is preserved.

## What is ready

- **Three separate surfaces:** fast capture widget, themed Settings, and a full-screen planner opened by Plans.
- **Day:** today first; hourly timeline through 1 AM, earlier hours reachable, overlap lanes, duration resizing, task details, unscheduled tasks, and a readable Day list.
- **Projects:** projects contain RPM blocks, which contain tasks. Drag priority numbers; star musts independently; see compact durations and must/all totals. Edit result, purpose, task notes and leverage; move tasks and blocks between parents.
- **Life:** editable life areas and yearly outcomes, with project links. Swipe upward on the header for a wider view, downward to return. Swipe horizontally through days/projects/years. Labeled controls provide the same navigation without gestures.
- **AI:** Sort proposes an arrangement; Apply draft lets you edit it; Accept plan records the original and final versions. “Don't learn” excludes a draft. Reviewed examples guide later suggestions—this is contextual personalization, not model fine-tuning. Purpose and ask-only Goal ideas receive approved relevant context; sorting does not receive personal documents or chat history.
- **Recurrence:** daily, weekly, weekdays, or 1–365 days after completion. Completing a fixed occurrence keeps the series active. Repeated captures can offer “Recurring?” without silently changing the schedule.
- **Calendar:** choose read-only calendars already synced on Android. The local copy covers 3 days back and 22 ahead, extending around requested dates. Pre-save conflict checks and alternative times work in planner and chat; a conflict override is checked again before saving. Google events are never written.
- Existing custom alarm sound, separate reminder notification sound, themed settings, and responsiveness changes from 0.7 remain included. See [their verification](settings-sounds-performance.md).

## Morning setup and choices

1. Install the APK on your phone and try the actual gestures/keyboard. Emulator checks passed; Samsung-specific feel, notification behavior and battery impact still need physical-device checking.
2. In Day → Calendar, allow read access and select your Google calendars. The account must already have Calendar sync enabled in Android. RPM relies on Android's synced data, not a direct Google OAuth connection or a guarantee of live server freshness.
3. In Life → Goals and vision, add and approve the context you want used. We can create that document together from sources you select. No WhatsApp chats were accessed and no personal goals were invented.

Reversible decisions: vertical level gestures start in the header so timeline scrolling stays natural; at 200% text, Day starts in list mode with Timeline available; unsorted tasks may remain outside blocks; examples are labeled and opt-in.

Current limits: changing a repeating task edits the series, not one occurrence. Conflict checks for repeats cover the next 21 days, not the infinite future. Calendar copies cap at 1,000 instances and report incomplete/stale states. AI sorting considers up to 60 unsorted tasks and the last three accepted examples. No automatic weekly fine-tuning or background personal-data ingestion was added.

## Verification

| Gate | Result |
| --- | --- |
| Build, test APK assembly, Android lint | Pass; 0 lint errors, 26 warnings remain |
| JavaScript regression/domain/API suites | 66 passed |
| Native companion storage, alarms, sounds, calendar provider | 46 passed |
| Legacy persistence, widgets, reminders and parser | 38 passed |
| Final integrated native WebView flow | 8 passed: recurrence, persistence, draft/scroll recovery, calendar scope |
| Offline/empty/error native WebView flow | 7 passed with network disabled; local saves work and AI errors preserve data |
| Actual native touches | Level swipes, day swipe, priority drag and duration resize passed |
| Rendered states | Portrait, 358px narrow viewport, landscape, 200% text, native keyboard; Save stays above IME |
| Live AI sort | Valid proposal, user-edited draft and explicit acceptance persisted separately |
| Regression surfaces | Capture/options, ask-only Goal ideas and independent themed Settings verified |
| Artifact integrity | Signature/version verified; no QA fixtures, test classes, private-store files or recognized key prefixes in app bundle |

Representative captures: [Day](../.impeccable/review/phone-day.png), [Projects](../.impeccable/review/phone-projects.png), [Life](../.impeccable/review/phone-life.png), [large text](../.impeccable/review/phone-large-text.png), [landscape](../.impeccable/review/phone-landscape.png), [keyboard](../.impeccable/review/phone-keyboard.png). QA-labeled content is demonstration data, not bundled personal goals.

Reproduction sources: `testing/planner/day-flow.js`, `hierarchy-flow.js`, `integrated-flow.js`, `finish-flow.js`, `offline-flow.js`; run only against an isolated backed-up QA store. The last script expects network disabled; the AI finish script expects a returned proposal. Unit checks: `node --test android-companion/*.test.mjs chat-prototype/*.test.mjs`. Native checks use `com.rpm.prototype.OfflineTests`, with `-e companion test` for the companion suite.

The independent [finish review](../.impeccable/review/planner-finish-review.md) found one narrow touch-target issue; it is fixed and the bounded verdict is **ship**. Mobile/design guidance preserved Frosted Night and drove keyboard, large-text, gesture and touch-target checks. Named independent subagents used the fallback reviewer/documenter protocols because the harness lacks an `agent_type` loader. [Design conformance](planner-design-conformance.md) records pre-existing global DESIGN.md drift without rewriting it. No new raster art was needed; the inherited butterfly retains its existing provenance record.

The owned emulator's original companion store was restored byte-for-byte after QA, including its two original entries and pending conversation. Synthetic calendar fixtures were cleaned up by tests; a separate QA snapshot remains recoverable on that emulator. No phone or personal credentials were changed.

## Later discussion

[Deferred workbook ideas](rpm-deferred-features.md) are recorded separately. The existing one-time reminder is active for **13 September 2026, 6 PM Asia/Kolkata**, to discuss those ideas or add more—not implement them automatically.
