# Implementation handoff: RPM-Glass intent harness

You are implementing this kit in `evamuse1236/RPM-Glass`. The audited baseline is `22604e683362e7edd3cbf6e0297ce4dd55a4ce73`. Inspect the current branch before modifying it. Do not assume newer source has the same contracts.

## Product objective

Reduce the effort between a thought and a chosen next action. Behave as a warm, observant companion with outcome-focused coaching available when appropriate. Do not force every thought into a task or every task into a complete RPM hierarchy. Preserve user agency and exact data semantics.

Read `docs/RESEARCH_AND_REDESIGN.md`, `docs/INTEGRATION.md`, `docs/EVALUATION.md`, and `README.md`. The kit is a tested standalone pilot with source-contract adapters, not an already integrated production rewrite.

## Non-negotiable invariants

Original words are durable before AI work. Drafts are not canonical plans. A model cannot directly write. Set, clear and unknown are different. Corrections preserve omitted siblings/fields. Buttons identify exact draft revisions, not ambiguous prose. Pending drafts belong to conversations. A retry does not duplicate a task. Saved means durably acknowledged or recovered by receipt; a scheduling request is not proof of notification delivery. Never infer a personal purpose or preference and save it as the user’s own fact. Keep source, target and approval provenance. Preserve native permissions, CSP, secret storage and imported-alert disarming.

## Phase A — establish baseline and small trust fixes

Create a branch and export a synthetic baseline store. Locate the current runtime, store, planner transactions, time parser, native transport, asset builder and tests. Run the original tests. Apply or manually reconcile the three narrowly scoped hotfix specifications; do not bypass hash mismatch. Add regression coverage in the original UI for compact pending review, full labels and generic suggestion suppression. Record baseline model calls and capture/usable-draft latency without logging private text.

Acceptance: original functionality still works, pending compound edits are reviewable/cancellable, no style-only change is described as an AI accuracy fix.

## Phase B — integrate the deterministic pilot behind a flag

Keep the kit in `intent-v2/`, not at repository root. Put legacy and pilot writes behind one shared state owner or explicitly serialize/reload both; do not leave a stale closure. Inject actual `changePlanner`, `undo` and native load/save/calendar calls. Run `node intent-v2/scripts/test-in-repo.mjs .` and add real-module integration tests for multiple linked creates, conflict review, imported alerts and Undo.

Route new free text through `capture()` with stable message IDs. Route chip answers, edits and commits through `act()` with stable action IDs and current revisions. Make retry call `interpret()` on the original message. Reconcile durable receipts after uncertain acknowledgements. Keep legacy pending transactions explicit and do not auto-migrate them.

Acceptance: with AI disabled or delayed, raw text survives restart; invalid or late interpretations cannot mutate canonical plans; duplicate Save delivers one change; Undo restores the whole approved change.

## Phase C — make previews and the interface truthful

Replace canonical `aiDraft` sorting with `createSortPreview` and explicit `acceptSortPreview` inside the shared repository transaction. Persist preview status atomically. Do not reapply existing legacy unreviewed arrangements.

Port the interaction structure from the demo into the existing bundled UI, not by loosening the WebView CSP. Show latest user thought, a short reply, a compact evolving draft, source/suggestion provenance, one useful question and at most three useful choices. Keep dismissal accessible. Native status—not model prose—owns alarm delivery labels. Implement exact local date preview and stale timed-draft refresh.

Acceptance: dismissal never moves a task; every selected sorting item is assigned or visibly unsorted; a correction does not duplicate cards or lose actions; phone font scaling and TalkBack work.

## Phase D — connect and evaluate a real model

Select a currently available route supporting the strict schema. Update native and JavaScript model configuration together. Keep keys native/server-side. Implement native cancellation by request ID, not only JavaScript result suppression. Benchmark one-call interpretation against the baseline before adding another agent. Keep at most one repair under a bounded ordinary-turn budget.

Run the 66 synthetic cases with `--run` explicitly and inspect outputs with the human rubric. Then add consented, redacted actual failure examples. Test both the actions it should take and the actions it must not take. Do not optimise only the final JSON shape.

Acceptance: no wrong-ID, accidental commit, source-loss or stale-action failures in the regression suite; no claimed live performance without recorded measurements. Report model route, date, trial count, category results and latency distribution.

## Phase E — improve relational continuity without hidden profiling

Build an inspectable preferences page over approved memory. Add targeted retrieval, contradiction/supersession review, optional expiry, deletion beyond active-context exclusion, storage growth management and export tests. Never seed the app with unrelated personal information from this chat. Add a dedicated conceptual-question/target-picker continuation so vague requests do not require retyping the original.

Offer coaching depth as a preference, with gentle capture as default. Only after live evidence supports it, add an opt-in automatic-save path for unambiguous explicit low-risk captures, with strong receipts and Undo. Keep suggestions, sensitive memories, destructive/bulk changes and external side effects behind appropriate approval.

Acceptance: an exhausted reflection creates no task; a remembered morning preference does not schedule an appointment; the user can inspect and correct what the assistant believes; storage cannot silently exceed the native limit and lose capture.

## Final implementation report required

Return the actual changed-file list, commands run, tests passed/failed, verified behaviours, measured rather than guessed latency, outstanding limits and rollback instructions. Do not say an APK was built, a model was tested, a repository test passed or a phone alarm worked unless that operation was actually performed.
