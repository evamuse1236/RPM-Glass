# RPM 0.9 — one app, two ways to act

Status: complete. Requested fixes, 12 September 2026. Goal: make conversational capture and direct planning use the same actions and truth, then remove navigation friction. Signed 0.9 update and evidence are in `planner-v09-handoff.md`; physical-phone acceptance remains a user check, not a claimed test.

## What the failures reveal

The 0.8 tests proved individual screens and isolated sorting, but not a spoken capture request creating a block and linking a task. The capture agent has no planner tool registry. RPM blocks have no independent destination. Reordering is limited to one list. Completion is hidden inside task details and deletion is missing. Two top header rows consume the most useful part of the phone screen.

## Phases and completion gates

1. [x] Shared actions and capture AI. Add typed tools to read/search planning data and atomically create/edit/link/move/complete/delete tasks, blocks, projects, life areas and goals. Preserve raw capture, unknown-field rejection, compound requests, schedule checks, undo and explicit approval boundaries. Gate: 10 focused checks pass, including a mocked model request through the real capture-agent path creating a project/block/task; invalid compound changes remain unapplied. Native runtime wiring is included; live end-to-end checks remain Phase 5.
2. [x] Navigation. Four planning levels plus Settings: Date → RPM → Proj → Life → Settings. Both top headers removed; y=0 workspace verified. Date identifies the daily destination; icons retain accessible names. Content-specific controls live within scrolling content or the date chooser. RPM is independent of Projects, and project summaries open its blocks. Native Settings and Back were exercised.
3. [x] Direct task actions. Visible completion tick, recoverable Delete, drag across blocks including empty blocks, drag feedback/scrolling, and non-drag Move alternative. Gate passed: A→B persisted across install/restart, empty-block native touch drop persisted, both orders normalized, recurring tick retained the series, Delete/Undo retained the task and native archive/restore checks reconciled alerts.
4. [x] Shared context and app control. Capture inherits task/block/project and displays a clearable context label. Exact live “make an RPM block and add it here” saved the selected project relationship and linked task. Live compound edits, life area→goal→project linking, navigation, transparency changes and system sound-selection opening passed. Invalid IDs fail validation; context is scoped, not a whole-document dump.
5. [x] Integrated verification and signed update. All five reported journeys exercised; portrait/narrow/landscape/large-text/keyboard, offline and conflict failures, existing alerts/store continuity checked. 86 JS and 88 native checks passed; build/lint passed. Independent fresh review with the user's rejection as brief returned ship after the short-card fix. Signed 0.9 APK verified, previous releases preserved, original emulator store restored byte-for-byte, actual limitations documented in the handoff.

## UI direction

Frosted Night stays: navy ground, pale readable text, cyan selection and Jakarta/Space typography. The day timeline owns the screen; a compact five-destination bottom bar owns navigation. Only the active date is shown, not a duplicate “My day” heading. RPM is an overview of outcome blocks across projects, with block details and tasks; Projects is the higher-level grouping. Task completion is immediately visible; drag targets make movement explicit. Keep 48dp hit areas without making every control look oversized. Task actions remain separate from navigation.

## Boundaries and assumptions

- “Whole app through AI” means the app's own typed planning/navigation/settings capabilities, not arbitrary shell access or access to secrets. System permissions, file/sound pickers and account authorization remain Android-controlled.
- Delete is recoverable removal (archive/trash), not silent permanent destruction. Removing a block/project preserves its contents unassigned unless the user explicitly requests otherwise.
- Calendar remains read-only. Scheduling and completion use the same deterministic logic regardless of entry point.
- Changes are tested on isolated QA data; no personal data is manufactured for demonstration. No model or provider change.
- OpenAI's [function-calling documentation](https://developers.openai.com/api/docs/guides/function-calling) supports the application-executed, validated tool workflow; actual model/provider compatibility is verified through this app's existing OpenRouter path.
