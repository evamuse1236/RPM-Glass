# Capture ramble fixes, 19 October 2026

Implemented on `fix/capture-rambles`. Verification uses the production Capture backend and live Claude CLI as a stand-in transport. Native API timing and screen behavior are UNVERIFIED. No device was used.

## Causes and changes

| Class | First failing boundary | Change |
| --- | --- | --- |
| Focus | Runner dropped persistent Edit focus and deferred removal application. Capture could park a whole draft but could not remove one proposal. | Runner follows Capture navigation. Validated `discard` removes exact proposal IDs, preserves pending survivors, and gives a separate receipt and Undo. |
| Choice checking | Checker ignored structured clarification prompts and treated a missing draft as successful removal. | Both are checked directly, with negative controls. |
| Body logs | Capture schema and compiler had no water or meal operations. | Typed body logs reach existing `editPlan` operations through one planner transaction, including mixed logs and tasks. Skipped meals preserve source words, display Skipped, and stay out of usual foods and nutrition guesses. |
| Time rejection | Guard treated Chrono's implied meridiem as missing even with stated morning or noon. | Match part-of-day evidence locally and recognize noon and midnight. A different action's AM/PM cannot authorize the clock. |
| Wrong time and repeated question | Spoken clocks without preceding `at`, such as `eleven in the morning`, were not normalized. | Normalize only beside an explicit time marker. A clock-only update keeps the target's saved day. |
| Batch rejection | Exhausted repair discarded an interpretation with otherwise valid operations. | Retain checked operations, omit the unsupported clock, and name the unapplied time on the receipt. Preserve earlier draft times and provenance when rejecting an amendment. A failed repair can use the checked parts of the earlier response. |
| Deadline | The 35-second careful route was also the deadline for CLI startup, reasoning and StructuredOutput. Native Haiku read limit was 40 seconds. | Captures of at least 1,500 characters retain Haiku high and 6,000 tokens but receive 90 seconds; native reads allow 95 seconds. Short deadlines and Sonnet routing remain unchanged. |
| Transport error | CLI cancellation raced directory removal; `EBUSY` could mask the timeout. | Wait for process close, retry Windows cleanup, and preserve the original transport failure. |

Proposal removal preserves the original guards on surviving saved-item edits. It does not authorize overwriting external changes. Mixed removal and amendment retains the current source and refreshes its schedule preview. Undo refuses to overwrite a later draft edit.

The original dinner words are unchanged. Removal turns now auto-apply, as they do in Capture. In `Delete this` → `That one only` → `Both` → `First`, Both applies immediately; First cannot reverse it. The separate first-only case still requires the second proposal's identity and all original fields to survive. These expectation and checker corrections limit direct comparison with historical totals.

## Verification

| Run | Baseline | Earlier branch fix | This change |
| --- | ---: | ---: | ---: |
| Full corpus | 36/50 (72%) | 34/50 (68%) | 48/50 (96%) |
| Hardest ten, three repeats | 11/30 (36.7%) | 10/30 (33.3%) | 27/30 (90%) |

Both commands used concurrency 3. Both final runs report unchanged source with SHA-256 `fa9fb5d8bf9fb2f195c847d1ee1b5e69bb026d59019517f23f0e6c8558bc7366`. There are no focus-loss, interpretation-rejection, transport-error or raw-word-loss failures in either run. All three focus cases pass the full run; every selected focus repeat passes the hardest run.

Evidence is in [the full report](../.verify/capture-stress/2026-10-19T08-15-32-252Z/report.md) and [the hardest report](../.verify/capture-stress/2026-10-19T08-20-53-471Z/report.md), with `results.json` and per-turn saved stores beside each. The interrupted `08-13-38` run is not used. Historical baselines remain in the separate ramble worktree's `.verify/capture-stress/baseline-2026-10-19` and `hardest-2026-10-19` directories.

Remaining failures are explicit rather than silent losses.

- `nine-relative-times` fails once in the full run and in all three hardest repeats. All nine proposals remain in the saved draft. The input says `tomorrow at nine` without AM/PM, while the checker expects 9 AM and forbids a question. Capture correctly asks AM/PM and leaves the batch pending. The strict historical expectation is retained rather than inventing a period to make it pass.
- `thinking-not-permission` fails only in the full run. The model asks whether to look at Call Raj after the person says they only need to express feeling overwhelmed. No tasks change. This unsolicited follow-up is a remaining model-response issue.

All eight long-monologue case-runs pass. The two full-run CLI responses report 12,461 and 14,597 output tokens, including 8,427 and 10,043 reasoning tokens respectively. CLI framing and reasoning differ from native API requests, so these counts do not prove that the phone's 6,000-token cap is sufficient. Native latency, token sufficiency, provider fallback and screen behavior remain UNVERIFIED.

`npm test` passes. It includes 671 JavaScript tests, with 670 passed and one existing skip, seven rule tests, 16 cloud tests, cloud typecheck, 23 plain-JVM parser checks and 10 model cancellation checks. The separate Gradle `ModelLimitsTest` passes seven tests. Independent single-family review found two draft-removal defects; both have red-before-green regressions and the final review passes.

`check:evidence` reports the expected missing build/device screenshot evidence. The user explicitly prohibited emulator and phone use. No native feature or screenshot verification is claimed.

New screen text to verify at phone size and enlarged text includes `Logged`, `2 glasses of water`, `Skipped`, `Lunch · Skipped`, `Removed from draft`, `Keep`, `Undo`, and the receipt warning that a time was not applied. Check proposal choices via both typed replies and chips, mixed-log Undo, and editing skipped lunch into logged food. Native notch handling of skipped meal state is UNVERIFIED.

Fix Root Causes drove the runner-versus-Capture reproductions. Model the Domain drove body operations and proposal removal. Test Behavior drove saved-state, receipt, source, guard and Undo assertions. Live CLI results remain a proxy for the phone; the CLI does not enforce the phone's token cap.
