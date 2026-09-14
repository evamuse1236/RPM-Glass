# Full-screen RPM planner — phased implementation

Status: implementation phases 0–6 complete, 12 September 2026. Signed test build and evidence: `docs/planner-handoff.md`. Actual phone calendar selection and personal-context approval remain user-owned setup, not a claimed connection. Dara authorized autonomous reversible decisions overnight and a morning list of assumptions and help needed.

## Overnight execution

Complete phases in sequence without waiting for ordinary reversible decisions. Record assumptions and user-dependent work for the morning. Continue other safe work when a permission, account, or physical-device step is unavailable. Never fabricate a connection or mark an unverified check complete. The existing goal covers the implementation outcome; its wording cannot be edited through the available goal control, so this document records the additional execution direction.

## Design contract

Preserve the live Frosted Night Android theme, bundled fonts, private companion store, alarms, and quick capture. Existing DESIGN.md describes an older Android palette; live `night.css` and the settings/sounds verification are the current visual authority. Do not revive the pixel theme or rewrite the desktop companion.

Three distinct surfaces: compact capture widget, settings, and a genuine full-screen planner. Planner opens on today. Horizontal movement changes days or projects; upward movement changes scale from Day to Projects to Life goals. Downward movement reverses it. Visible labeled navigation provides the same operations. Vertical gestures start on the navigation/header area, leaving the time ruler and long lists free to scroll. Task drag/resize must not trigger navigation.

The first viewport gives the day title and date controls, a compact calendar status, an unscheduled-entry affordance, and a readable timeline. Default visible range begins at 6 AM and extends to 1 AM; earlier entries remain reachable. Day tasks expose compact duration, editable details, their block, purpose, and action plan. Google commitments are visually distinct and read-only. Preserve system insets, keyboard usability, 48dp targets, reduced motion, and large text.

Projects contain RPM blocks; blocks contain tasks. Order by dragging with numbered priorities and accessible move controls. Star musts without reordering; keep non-musts readable. Show compact durations and must/all totals. Life goals organize goals by year and life area. Empty production stores stay empty; examples are explicitly labeled and opt-in.

## Workbook grounding

Supplied source: `/home/darax/Downloads/rpm_fasttrack_workbook.pdf`, 49 PDF pages. Printed pages 18–20: result, purpose, then flexible MAP. Pages 22–25: blocks, manageable chunks, priorities, estimates, vital few actions, calendar protection, and progress toward outcomes. Pages 29–30: leverage and ownership. Pages 36–39: important/non-urgent time and control/influence. Pages 44–47: personal definitions of fulfillment. Project nesting and gesture hierarchy are Dara's product choices; this mini-workbook does not fully specify them. Avoid equating estimated effort with elapsed calendar time.

## Phase 0 — plan and baseline

- [x] Record deferred ideas and schedule the one-time review.
- [x] Define terms, source boundaries, scope and phase checks.
- [x] Inspect current UI/runtime and establish baseline regression tests (38 existing JavaScript checks pass).
- [x] Save a surface-specific design contract before UI changes (`.impeccable/surfaces/android-companion-planner-html.md`).

## Phase 1 — reliable planning data

- [x] Add backward-compatible projects, blocks, life areas/goals and task links.
- [x] Add validated edits, priorities, musts, durations, and revision/undo history.
- [x] Preserve existing entries, alerts, raw capture and concurrent-save safety.
- Gate: isolated tests for old-store migration, links, edits, totals, ordering, invalid writes and undo pass.
- Evidence: 8 new planner state tests and all 38 existing JS checks pass. Android debug build succeeds. Phone persistence/render checks continue in Phase 2.

## Phase 2 — full-screen shell and day

- [x] Open Plans into a full-screen native host, not the widget's plans panel.
- [x] Default today, horizontal day navigation, time ruler, unscheduled tasks and details.
- [x] Reschedule and resize with conflict checks and accessible edit alternatives.
- Gate: rendered primary flow, save/reopen, midnight/overlap cases, Back/keyboard and capture/settings regression checks pass.
- Primary evidence: `testing/planner/day-flow.js` exercised on emulator; save/reload/navigation pass, resize 45 to 60 minutes persisted. Screenshot `testing/planner/day-initial.png`. Cross-device/font/keyboard gates receive final integrated coverage in Phase 6.

## Phase 3 — projects, RPM blocks and life goals

- [x] Add vertical scale navigation plus labeled alternatives; horizontal project navigation.
- [x] Create/edit/move tasks and blocks; result, purpose, MAP and leverage details.
- [x] Add drag priority, must stars, compact durations and totals.
- [x] Create/edit yearly goals and life areas, preserving the selected project/day when navigating.
- Gate: complete populated/empty CRUD journeys, drag versus scroll, 200% text and landscape checks pass.
- Primary evidence: `testing/planner/hierarchy-flow.js` exercised on emulator; project/block/task links, must totals, areas, goals and Back pass. Screenshot `testing/planner/projects-initial.png`. Gesture and typography edge checks remain part of final integrated verification.

## Phase 4 — bounded AI assistance

- [x] AI proposes blocks and sorting immediately on request, with labeled examples.
- [x] Capture original suggestion, user changes and accepted final arrangement; untouched draft is not approval.
- [x] Action-specific context for sorting, purpose and ask-only Goal ideas; editable personal context, no automatic WhatsApp access.
- [x] Compact suggestion labels, one word normally, two rarely.
- Gate: mocked request payload/privacy and malformed-response tests; errors preserve data; no unapproved tasks/goals silently committed.

## Phase 5 — calendar awareness and recurring tasks

- [x] Limited rolling local calendar window; request extra dates when needed; read-only permission and selected calendars.
- [x] Deterministic conflicts and alternative-time bubbles; recheck before commit; stale/denied/unavailable states.
- [x] Fixed schedule and completion-relative recurrence with per-occurrence state.
- Gate: recurrence, midnight, timezone, stale data and conflict tests; Android permission/cache verification. Actual Google account connection requires user/device availability and is reported separately.

## Phase 6 — integrated finish

- [x] Android build, lint, existing/new JS and native suites.
- [x] Render and exercise phone portrait, landscape, large text, offline, empty, error and keyboard states.
- [x] Independent finish review as required by the design guidance; fix material findings.
- [x] Update phase evidence, assumptions, user-help list and deliver a verified signed APK without replacing an existing release.
- Gate: all implementable checks pass; external prerequisites are explicitly listed, not represented as complete.

## Assumptions and morning help list

- Reminder time interpreted as tomorrow, 13 September at 6 PM local time, because the request arrived after midnight on 12 September.
- Preserve current dark blue/cyan Frosted Night visual identity. Build directly from existing components and the precise user interaction brief; no design-choice approval round while Dara is asleep.
- Gesture levels change from the header/navigation region to avoid collision with normal timeline scrolling.
- Calendar integration uses read-only Android calendar-provider data for accounts already synced on the phone; this avoids a new OAuth account system. Native provider feasibility is verified with isolated synthetic events; selecting/authorizing the actual phone calendar remains Dara's step.
- No Google Calendar writes. No WhatsApp ingestion, model fine-tuning, hidden profiling, or invented personal goals.
- Purpose documents can be supported before they contain personal material. Source selection and approval remain a later task.
- Any unavailable live-model, physical-device or authenticated-calendar check must remain explicitly pending.

## Integrated decisions and evidence

- Calendar provider reads are off the UI thread, selected-calendar only, 3 days back/22 ahead, capped at 1,000 expanded instances. Android sync freshness depends on the account's sync service; this is not a claim of direct live Google freshness. No WRITE_CALENDAR permission ships. Test-only synthetic calendar writes are isolated and cleaned up.
- Planner and chat both perform deterministic pre-save checks. Conflict overrides are bound to the reviewed schedule/conflict set and rechecked. Recurring schedules check the next 21 days, not an infinite future guarantee.
- Fixed repeats: daily, weekly, weekdays; Done completes the selected occurrence. After-completion repeats: 1–365 days after completion, retaining the chosen local clock. Editing a recurring task changes the series; per-occurrence rescheduling is not exposed yet.
- Planning events retain compact receipts, drafts retain original/accepted arrangements, and reviewed examples guide future sort prompts. No fine-tuning job or automatic approval exists.
- Long-lived forms keep local private drafts on Back/reopen; Cancel discards and Save clears. Calendar/AI requests do not block normal navigation. At 200% system text, Day defaults to a readable list; Timeline remains selectable. Header adapts in landscape.
- JavaScript suite: 66 checks pass. Native companion suite: 46; legacy native suite: 38. Build and lint pass (0 errors, 26 warnings). Live AI sorting on the emulator's existing connection returned a valid proposal; Apply draft, rename and Accept plan persisted separate initial/final arrangements. No key was read or copied.
- Native touch checks: Day → Projects → Life → Projects, next-day swipe, priority reorder, and resize from 75 to 60 minutes all persisted without accidental editor opening. Native keyboard leaves Save reachable (WebView 495 CSS px tall, Save bottom 487).
- Independent finish review requested one fix: narrow priority targets. Restored 48×48 CSS pixels and verified at 358 CSS px with all row controls inside the viewport. Reviewer verdict: resolved, ship. Design conformance is recorded without rewriting the older global design files.
- Final native WebView integrated flow: 8 checks pass, including fixed and completion-relative repeats, scroll restoration and draft recovery. Offline flow: 7 checks pass with Wi-Fi/mobile data disabled, covering empty states, invalid input, offline local save and visible AI error with no data loss. Capture menu, ask-only Goal ideas and separate Settings verified afterward.
- Original emulator companion data restored byte-for-byte after QA; two original entries retained, no synthetic planner entries. QA snapshot remains recoverable only on the owned emulator. The physical phone was not changed.
