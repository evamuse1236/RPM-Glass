# RPM usability update — 16 September 2026

Status: implementation in progress. User requested phased work, Sol high implementation, Luna medium research, and emulator verification.

## Problems and direction

1. Capture choices lose the destination and source words: every suggestion currently submits text to the model. Saved Open must navigate by the actual saved ID without another model call; goal choices must open an editable prefilled goal draft and retain the entire ramble.
2. Settings currently launches CompanionSettingsActivity. Settings belongs inside PlannerActivity with a route back and retained planning state; Android permission and picker dialogs remain system-controlled.
3. Planner pointer dragging/reordering/resizing competes with scrolling. Remove drag/drop handlers and visual handles; keep explicit Move, priority and time editing. The separately floating launcher is outside planner drag/drop scope.
4. Saved confirmations repeat the entire task as undifferentiated assistant prose. Show a clear creation label and the task title in lighter italic text, retaining readable contrast, Undo and working Open.
5. RPM blocks merge visually. Make each result a distinct grouped section through surface, boundary, spacing and title hierarchy; carry the same semantic typography, actions and navigation conventions across Daily, RPM, Projects, Life, capture and Settings.

Maintain Frosted Night navy, pale text, cyan selection and the existing offline fonts. Apple HIG informs hierarchy, grouping, readable scalable type, feedback and familiar navigation. Adapt to Android targets/insets/Back. No imported personal examples, new account systems, provider change or deferred-feature work.

## Phases

### 1 — reliable capture actions
- Direct, validated navigation actions tied to saved IDs and source messages.
- Goal suggestion opens a goal form with an editable result and preserved original ramble; optional purpose/area/year must not require rewriting.
- Structured, lighter italic saved title with a distinct status label; safe legacy-message handling.
- Gate: regression checks exercise real capture results and routing, including no provider request for Open, multiple changes, missing/deleted targets, drafts and cancellation.

### 2 — simple interactions and integrated settings
- Remove planner task drag/drop, reorder grips and timeline drag/resize handlers; explicit controls retain equivalent editing.
- Settings is a planner destination. Preserve existing sounds, permissions, key, imports/exports, recovery and launcher controls.
- Persist widget text size (80–160% relative to Android system font scale), show a preview, apply it on return and after restart. Planning text continues honoring system font scale.
- Gate: same PlannerActivity while switching Settings, Back restores planning; widget setting persists and changes capture text; ordinary scrolling never edits tasks.

### 3 — coherent hierarchy
- Review official source notes, then use RPM overview as representative flow before extending shared components.
- Distinct result sections with clear title, optional purpose, task rows and compact metadata; purpose remains available when long.
- Consistent labeled navigation, grouped settings, forms, focus/pressed/selected/disabled states and useful empty/error states.
- Gate: rendered normal/narrow/landscape/large-text views with long content, saved receipts and keyboard; readable contrast and Android 48dp controls.

### 4 — verify and package
- JavaScript suites, Android build/lint/instrumentation and emulator journeys with isolated QA data and backups.
- Preserve original emulator store and preferences; remove QA fixtures from release assets.
- Signed versioned APK, evidence and concise handoff with physical-device/live-provider limitations.

## Implementation boundaries

- Capture agent: shared chat renderer, companion-agent schemas as needed, runtime, planner-tools, capture routing helper and associated tests. Coordinates runtime settings API with settings agent.
- Settings agent: reusable native settings controller/host, native activities/controls, settings module and native checks. Coordinates planner integration through exported mountSettings(api, host) and native settingsAction API.
- Planner agent: planner.mjs, planner-stitch.css, night.css and planner gesture/navigation checks. Receives source-backed design direction from primary; implements goal target contract and integrated settings destination.
- Primary: source evaluation, design decisions, integration review, emulator verification, release and documentation.
