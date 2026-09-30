# Capture effort routing and parser safeguards

Implementation started 27 September 2026. Verification receipts below distinguish offline checks, live calls and Android installation.

## Runtime policy

- GPT-6 Luna (`openai/gpt-6-luna`) with explicit `reasoning.effort: none` handles ordinary Capture extraction and simple reflection.
- Explicit planning/contextual question cues use `high`. A fast interpretation that identifies itself as a plan or contextual query gets one high follow-up. These cues only raise effort; they do not authorize changes. Quoted planning words can cause an unnecessary high route.
- Schema, exact-source, target-ID or time-precision validation failures may use that same one high repair allowance. Provider/auth/network failures and timeouts do not start a repair loop. Unresolved information stays a question or local review.
- Capture has a 12-second fast budget; high has 30 seconds per attempt. The one shared follow-up allowance bounds a turn to two model calls (at most 60 seconds for two high attempts). Native requests carry cancellation IDs; late replies cannot create drafts after cancellation. Raw words are journalled before inference.
- Planner purpose/idea suggestions and the retained Classic tool conversation use GPT-6 Luna high. Native model requests pin OpenAI and disable fallback. CLI model defaults are unchanged.
- Jev remains the bounded existing-block selector behind **Sort with Jev**. It does not generate arbitrary task titles or run before every Capture. Dates, permissions, validation, Save, stale-state checks and Undo remain local.

The routing evaluator from the earlier experiment remains separate from product runtime. Its 7.4% illustrative saving did not justify paying for Jev before every capture.

## Failure repairs

Retrieved context now includes the locally formatted reference time, each saved task's date, start and computed end. Date-only records expose their saved date explicitly. Context also declares that the retrieved task subset is not full calendar coverage, so the model must not assert that a time is free.

“Read” and “Walk” are valid supplied titles. Planning requests require a concrete result and a few suggested actions, with purpose grounded in the person's words. Task IDs must exist in current context. Routine Capture confirmation text comes from the checked draft and local preview; field edits refresh both. A duration-only amendment retains the original time anchor and temporal evidence.

The local parser supports the tested Romanised phrases `udya sakali`, `subah … baje` and `sakali … vajta`. It resolves a numeric morning clock without changing original wording. `kal` needs explicit future context; unknown or past meaning remains a review. Vague morning never chooses a clock. Conflicting morning clocks also remain a review. This is a bounded vocabulary, not general Hindi/Marathi language support.

A live stress run found a new error: a model assigned PM to “move the walk to 7” by borrowing its saved period. A local precision guard now rejects unsupported clocks for a bounded repair. Saved dates can carry forward; AM/PM cannot be borrowed from another task. Locally unresolved ranges remain reviewable without an extra model call.

Another live case asked “6am or 6pm?” despite the exact source saying `6am`. Local code now recovers that explicit clock when updating a task with a known future saved day. It requires exact current-message evidence and one unambiguous clock; it does not choose a date or AM/PM. The regression was reproduced before the fix, then passed. The draft still requires Save.

## Jev contract

The request supplies up to 24 open, unassigned tasks and 12 existing blocks, with one Choice per task. Options are `block_0`…`block_n` and `keep_unsorted`. The native bridge still accepts only this bounded grouping shape.

The full batch must have every expected answer and probability, a probability sum within rounding tolerance, a selected maximum-probability option, finite confidence, a supported resolved model/provider and valid usage metadata. No partial batch is applied. A block is proposed only at confidence ≥0.65, selected-option probability ≥0.80 and top-two margin ≥0.50. Otherwise the task stays unassigned. These are conservative policy thresholds, not calibrated success probabilities.

The review stores the raw bounded answers, probabilities, usage, model, policy version and SHA-256 request fingerprint. The source version is checked again inside the preview transaction, and candidate records are checked again before Apply. Dismiss, failure or stale evidence leave grouping unchanged; accepted changes remain undoable.

## Verification

Completed on 27 September 2026. Receipts are under [`output/parser-2026-09-27/routing-implementation`](../../output/parser-2026-09-27/routing-implementation/).

| Check | Verified result |
| --- | --- |
| JavaScript tests | 401 passed, including the 1,728 generated time-range cases and the new exact-clock regression |
| Android native tests | 63 companion checks and 38 persistence, revision, export, parser, widget and reminder checks passed |
| Native Capture | 28 checks passed at font scales 1 and 2: ambiguous range review, corrected start/end/duration, reachable Add, persisted time matching preview, original words retained and Undo |
| Render review | Normal-size range preview and doubled-text action layout inspected on the native emulator; Add, Edit and Dismiss remained readable and reachable |
| Android build | Assemble, lint and test-APK assembly passed for the native/UI snapshot used by this artifact |
| Data restoration | All 65 original private files restored byte for byte, then verified again after `sync` and an Android reboot; original font scale restored |

### Live production routing

The 73-case suite has a successful recorded result for every case after repairs and retries. These are automated fixture assertions with sampled manual review, not proof that every interpretation is perfect. Calls used the production service and native encrypted-key transport against synthetic data; they did not save synthetic tasks into the user's plan.

The selected successful results contain 77 model calls: 60 at `none` and 17 at `high`. Their median turn latency was **2.081 seconds**, p95 **8.488 seconds**, and reported call cost **$0.01328994315**. This is a completion-set measurement, not a first-pass success rate or total development spend. It excludes earlier failed/development attempts, separate planning/Jev probes and unknown charges for cancelled calls. The prompt and local pipeline changed since the [earlier none/high comparison](luna-full-comparison.md), so these figures do not establish an apples-to-apples cost advantage.

Failures and interruptions remain in the raw receipts:

- `reflect-03` reached the 12-second fast timeout. The raw capture remained safe; a later retry passed.
- `edit-07` initially borrowed PM from a saved task. The prompt and exact-evidence guard were repaired; the later result asks AM or PM for the bare `7`.
- `sample-correction` redundantly questioned explicit `6am`. The local recovery above and its regression test address that failure; a subsequent live call also passed.
- Two later suite cases were interrupted by another task restarting the shared emulator. They were rerun successfully and are counted as environment interruptions.
- An early bridge preflight used an invalid callback ID and did not dispatch a provider call. A later cold-start run found empty restored emulator files and could not access the model key. Neither run is model-quality evidence. The verified nonempty backup restored all 65 files; live calls then succeeded. Final restoration was flushed and checked after reboot.

Planner purpose and idea suggestions also passed live checks at `high` (1.211 and 1.589 seconds). The contextual availability answer correctly states that the calendar was not read; it does not claim that 5 PM is free. Romanised `Kal subah 8 baje … karna hai` resolved to the expected morning time, while vague `udya sakali` remained a local review without an invented clock.

See `suite-summary.json`, `suite-selected-results.jsonl`, the retained `live-*` directories and `js-tests.log` for the complete evidence and source hashes.

### Jev evaluation and retained limitation

The live two-task smoke check completed in 577 ms at a reported cost of $0.000027174. Jev left “Print fraction worksheets” unassigned despite its related lesson block. This is a missed useful match, so the integration is not described as perfect.

An eight-task wording experiment compared the existing question with clearer wording about contributing to a result. With the existing question, all eight raw choices matched the labels, but the conservative thresholds proposed only three of six useful matches: three omissions and no incorrect assignments. The revised question proposed all six useful matches but also wrongly assigned the ambiguous “Prepare materials” to a fractions lesson (probability 0.80, confidence 0.74, margin 0.61). The revised question was rejected; production retains the conservative wording and thresholds.

Full option probabilities, expected labels, thresholds, proposed matches and usage are saved in `jev-grouping/old.json` and `jev-grouping/revised.json`. Requests passed the Jev skill's dry-run validation. These probes produced review candidates only; no grouping was applied to real records.

### APK and delivery status

The signed [RPM 0.18 APK](../../output/RPM-0.18-luna-routing.apk) is package `com.rpm.prototype`, version code **18**, version name **0.18-luna-routing**. It was installed and launched on the owned emulator, then used for the native checks above. **Physical-phone installation, commit and push were not performed.**

The final APK preserves the successfully built native/UI snapshot from before another task's diagnostics changes. Its only changed archive entry is `assets/companion/runtime.js`, where the reviewed final time-guard module was rebuilt with esbuild. The archive was zipaligned, re-signed with the compatible existing debug certificate, verified and retested. Concurrent diagnostics code remains in the shared checkout and is outside this APK's verification. `asset-parity.json`, `artifact.json` and `final-package/` record that boundary; the APK is not claimed to be a build of every current uncommitted file.

- APK SHA-256: `5f18ddd8124897fe21427fd551cd141b29d3f5e234eb71e53fb52715ecf3f245`
- Signing certificate SHA-256: `525fee39663b1984f55e3f7367eb783968166009a0210293bc4b0b4e8fb00bf1`

After the Codex app closed, the APK hash and saved test/restoration receipts were checked again. No emulator or physical phone was connected at that point. Existing user data and unrelated working-tree changes were preserved.
