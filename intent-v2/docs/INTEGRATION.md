# Integrating this pilot into RPM-Glass

**Baseline:** `22604e683362e7edd3cbf6e0297ce4dd55a4ce73`. Read this before enabling the feature. The kit deliberately does not auto-replace your runtime or edit personal data.

## 1. Protect the current app

Create a working branch, export a companion-store backup and retain a known-good APK. Keep new behaviour behind an `intentV2Enabled` feature flag, initially false. Test with synthetic data before importing a personal copy. Do not activate alarms from imported records. Preserve existing native secret storage, CSP restrictions, explicit calendar permissions and import disarming.

Copy the kit into a new `intent-v2/` folder. Do **not** overwrite the root `package.json` with this kit’s package file. The kit is a separate testable package; the existing app retains its own scripts and dependencies.

Run the source hotfix dry run:

```bash
node intent-v2/patches/apply-hotfixes.mjs --repo . --check
```

It verifies Git blob hashes for all three files and each exact replacement before writing anything. If your branch changed those files, review `hotfix-spec.mjs` manually against your diff. Do not bypass the hash check and blindly replace text. The installer is not a semantic merge tool.

## 2. Establish one state owner

The existing `android-companion/runtime.mjs` keeps `data` in a module closure and exposes a versioned `save()`. `nativeBackend()` instead reads and writes through `native('load')` and `native('save')`. **Do not leave these as independent unsynchronised authorities.**

For the first integration, route pilot captures/actions through one controller, serialize them with legacy writes, and reload the legacy closure and current phone status after each pilot transaction. Longer term, move both paths onto one repository abstraction. Cross-WebView compare-and-swap remains a final guard, not a substitute for coherent UI state ownership.

A pilot write must update what `view()` returns and what the planner subsequently reads. A fresh store has schema 2 with entries, conversations, history and memories; the `intentV2` namespace is additive. Do not erase unknown fields on native load/save. Keep all canonical tasks in `entries` and all canonical groups in `planner`, not another parallel tasks array.

Data introduced under `intentV2` includes captures, drafts, approved memories and request receipts. Test export/import and rollback with this extra namespace. It contains original text: do not send the entire namespace to the model or automatically log it.

## 3. Wire the actual functions, not copies

`adapters/android-bootstrap.example.mjs` shows dependency injection. Adapt paths for its position under `intent-v2/`:

```js
import {bootstrap} from '../intent-v2/adapters/android-bootstrap.example.mjs';
import {changePlanner} from './planner-tools.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
// Import the prompt as text through the existing bundler's configured text loader,
// or generate a JS string module at build time. Do not fetch it over the WebView.

const harness = bootstrap({
  native,
  changePlanner,
  undo,
  prompt: interpreterPrompt,
  model: verifiedNativeModelId,
  onEvent: event => renderPilotStatus(event),
});
```

The exact inspected contracts are `changePlanner(data, args, meta, readCalendar)` and `undo(data, undoId)`. `changePlanner` mutates the supplied object only after its validations or stores a pending proposal, and returns `undoId`, `plannerChanges`, `plannerReceipts` and task IDs on success. The adapter invokes it on a cloned working copy, then installs the validated canonical result inside the versioned repository transaction.

`editPlan(data, op, now)` likewise mutates the supplied data on success and returns a result ID rather than a whole new store. The sort helper intentionally relies on this actual contract and its `planner.undo` pre-edit snapshot.

Run the optional actual-module smoke check after the original repo dependencies are installed:

```bash
node intent-v2/scripts/test-in-repo.mjs .
```

This loads your real planner modules, uses synthetic in-memory state, and checks capture→canonical commit→Undo. It was **not run against the repository in the delivery environment**. It does not exercise the Android native bridge or provider.

## 4. Route new text through capture, not direct writes

On a new user message, allocate one stable UUID and retain it for retry:

```js
await harness.capture({
  messageId,
  conversationId,
  text,
  focusDraftId: selectedDraftId ?? null,
});
```

Listen for `captured` to acknowledge durable raw capture. Use `ready` to load and display an interpreted draft; `needs-attention` means raw text remains captured but interpretation failed. Do not display “Saved task” for `captured`. The model’s reply is not a persistence receipt.

Retry through `harness.interpret(messageId)`, not a new message with a new ID. A focused draft is explicit: never interpret every new message as an answer to the last pending question. The pilot rejects stale amendments rather than applying them to changed draft state. An eventual target-picker should carry exact entity IDs to the next turn.

Do not run the old `createCompanionAgent` mutation path and the new harness for the same message. Existing legacy `data.pending` blocks pilot canonical commits until explicitly resolved or cancelled. The pilot does not silently migrate or discard that pending transaction.

## 5. Route buttons as typed local actions

Render actions from `draftActions(draft)` in `src/suggestions.mjs`. Their labels are for display; their payload is the operation. A button click sends its payload to `harness.act(action, {actionId})`. Reuse the same `actionId` if transport delivery is uncertain. A genuinely new user decision gets a new ID.

Include the draft ID, conversation ID and revision already bound by the action. Do not reconstruct those from visible labels. On a stale action error, reload the draft, show its changed status and ask for a fresh decision. A question answer changes exactly one field and increments the draft revision; Save applies the latest whole draft. A newer revision invalidates earlier buttons.

Set-field actions support explicit clearing. They cannot change the kind or target of an operation. The narrow pilot supports archive/complete for tasks; group deletion, full undo histories and all original planner operations are not newly reimplemented.

Keep an explicit “Leave this draft” control outside a full row of three substantive choices. Preserve keyboard access and a readable full label; do not reintroduce two-word truncation. Old suggestion chips should either be disabled or fail safely on revision validation.

## 6. Show truthful receipts and side-effect status

Only the result of the repository transaction can trigger a Saved receipt. `createRpmPlanAdapter()` preserves original words and request approval metadata when creating canonical tasks. It keeps unspecified duration unknown rather than displaying an invented 30-minute estimate as user-provided.

Canonical commit and alert delivery are separate. Reload native phone status after saving. Permission denied, imported/disarmed, scheduled and delivered must not share one optimistic success label. A read-only calendar check must not appear as a Google Calendar write. The current app does not expose a calendar-write tool here, and the kit adds none.

If a native save throws, reload and reconcile by the durable request ID. The original native code writes before it reconciles alerts; a later error can therefore follow a successful data write. The repository’s receipt ledger helps recover local mutation status, but production UI must handle its `SaveUnknownError` honestly.

## 7. Replace AI sorting with a real preview

Find the UI call site that currently sends `{type:'aiDraft', blocks}` through `editPlan` immediately after `planningRequest`. Keep the returned proposal outside the canonical task/group state.

```js
const preview = createSortPreview(data, {
  id: previewId,
  selectedTaskIds,
  blocks: proposedBlocks,
  leftUnsorted: explicitlyUnassignedIds,
});
```

Persist this preview under the pilot journal if it must survive restart. Display the grouping without mutating `entries` or `planner.blocks`. A dismiss action records dismissal only. On explicit acceptance, call `acceptSortPreview(data, preview, {revision, editPlan, now})` **inside the shared repository transaction**, and persist its returned preview status in the same transaction.

The helper uses the canonical editor on a private clone and preserves one pre-grouping Undo snapshot. Existing task edits invalidate the preview. Every selected task must be assigned once or explicitly left unsorted; do not silently drop a selected task. The helper has no model call and does not add personal purpose.

Older `unreviewed` legacy drafts have already altered groupings. Do not “migrate” them by applying their proposals again. Leave them visible as legacy applied arrangements and offer existing Undo only where a valid snapshot still exists. Test this separately.

## 8. Connect and configure the model route

The transport expects a route supporting the supplied strict JSON response schema. Choose it by evaluation, not a hardcoded claim about the best model. It uses `require_parameters:true` and disables automatic fallback; provider incompatibility should fail visibly, leaving raw capture intact.

The inspected native `CompanionActivity.model()` accepts only its existing hardcoded model ID and enforces a token ceiling. Update the native model allowlist and settings deliberately before passing another ID from JavaScript. Keep API keys in the existing native key storage. Never add a key to prompts, localStorage, HTML, a source file or a repository commit.

The kit’s Node transport is for server/CLI evaluation. The Android transport calls the existing native bridge. It ignores late responses but cannot stop native HTTP work because the current bridge has no cancellation command. Implement cancellation using request IDs and a native map of active connections, with `disconnect()` on abort/activity teardown. Late native replies must not apply state changes. Ensure the shared native executor cannot remain occupied by abandoned requests.

The ordinary harness limit is one model call plus at most one correction of a validation failure, under a shared 12-second deadline. Transport/schema failures currently exit to retained capture rather than all triggering an automatic repair. More sophisticated escalation is future work. No silent model fallback, background agent or streaming implementation is included.

## 9. Dates, timezones and supported subsets

The kit stores the capture instant and timezone, keeps natural-language time in the draft, and delegates actual parsing to your existing local parser. This prevents adding a conflicting third date parser. It does not guarantee multilingual date parsing simply because a model understands Hinglish or Marathi.

The adapter conservatively refuses a timed draft more than 15 minutes old with `STALE_TIME_REVIEW`. Before broad release, add a clear refresh/review UI that resolves and displays the exact local date and time before approval, including relative phrases such as “in ten minutes.” Do not simply increase that limit to hide the warning. Test midnight rollover, DST travel, date-only tasks, all-day calendar events and recurrence edits.

Calendar reviews are recomputed on every commit attempt; identical reads are cached only inside that validation pass. The adapter supports explicit “keep this time” approval of the current warning token. Alternative-time pickers and unavailable-calendar explanation need their own clear presentation. Never treat unavailable coverage as free time.

The pilot uses daily/weekly/weekdays recurrence and the existing completion-relative repeat field. It does not expose every possible original planner operation, quarterly/monthly goal fields, general group removal, external email, or calendar writes. Keep unsupported operations in the original UI until deliberately added with schema, executor and tests.

## 10. Memory and storage release work

Use `acceptMemory()` only after explicit approval, with a visible candidate. Use `forgetMemory()` to exclude it from active context. That is not erasure of the original chat, journal, exports or backups. A dedicated deletion workflow must cover those sources, retained receipts, retrieval indexes and any server logs introduced later.

The namespace currently preserves captures, drafts and idempotency receipts without automatic compaction. This is intentional to avoid silent data loss, but the existing native store has a 16 MB ceiling. Add size accounting, export, retention preferences and safe compaction before extended daily use. Preserve the idempotency horizon needed for delayed retries when pruning receipts. Include storage-full and failed-backup cases.

The current context selector is bounded lexical retrieval, not a semantic memory engine. Source coverage is sentence/unit coverage, not proof that every action was understood. The richer contradiction/supersession and learning policies in the report are a roadmap, not a hidden implemented service.

## 11. Build and regress the original app

After dependencies are installed in the original repo, its inspected package scripts include:

```bash
npm run test:chat
npm run test:cli
node --test android-companion/*.test.mjs
npm run build:android-assets
```

Also run the repository’s cloud/type checks and Android instrumentation/build workflow where your changes affect them. Inspect the generated asset diff; do not edit only the already-bundled `runtime.js` or ship stale assets. Load prompt text with your bundler and include any new CSS in its explicit build inputs.

The standalone preview uses inline modules/import maps for convenient desktop viewing. **Do not drop that HTML into the production WebView**: its CSP deliberately permits bundled same-origin scripts, not this demo setup. Port the UI through your existing bundled runtime and asset allowlist. Do not loosen the CSP to make the demo work.

Physical-device checks must include keyboard insets, widget expansion, font scaling, TalkBack, touch targets, reduced motion, rotation, app background/foreground, simultaneous planner edits, offline capture, provider timeout, notification permissions, genuine alarm reconciliation and import disarming.

## 12. Roll back safely

Disable the flag, then use the old capture path. Keep the additive `intentV2` namespace in exports; do not discard captured thoughts. Already committed canonical tasks remain ordinary `entries`/`planner` records and should stay visible to the old planner. Preview-only drafts must not silently become tasks on rollback. Restore source hotfix files from their backup or version control after reviewing unrelated newer edits.

A full personal-store restore can reverse legitimate work done after the backup. Prefer feature rollback and explicit Undo for individual committed operations. Confirm the alarm state after any store restore.
