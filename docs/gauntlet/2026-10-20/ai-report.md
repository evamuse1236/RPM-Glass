# Capture AI gauntlet, 20 October 2026

This run made two focused changes. It did not establish a broad quality gain.
All counts and timings in the tables are measured. Explanations below carry their own labels.

Work stayed on `gauntlet/ai`. Nothing was pushed. No UI source changed. No model was changed. All live calls used CLI transport. No app key files were read.

The first baseline passed 84/87. Its ten hardest cases passed 10/10. Three calls timed out during an apparent six-hour wall-clock discontinuity. Those failures remain in `g-baseline`. Measured classes were three transport errors, three rejected interpretations and three lost-item failures. They overlap on the same three cases. A fresh widened baseline is the comparison below.

I added 22 everyday cases. Commit `abde95f` saved them before any app fix. The corpus includes short tasks, vague times, Hinglish, speech noise, completion, moves, bulk moves, queries, Purpose, Must, water, meals, corrections and an unsupported request. It also checks task completion and meal foods in canonical storage.

The fixed clock is Monday 19 October 2026 at 10 AM IST. Each run uses separate file-backed seeded stores. Concurrency is three. The same 109 case texts are used before and after.

| Run | Original strict | Corrected expectations | Hardest ten | Remaining failure classes |
| --- | ---: | ---: | ---: | --- |
| Widened baseline | 106/109 | 108/109 | 10/10 | wrong time: 1 |
| Round 1 | 105/109 | 107/109 | 10/10 | lost item: 2; wrong time: 1; repeated question: 1 |
| Round 2 | 104/109 | 106/109 | 9/10 | invented item: 3; lost item: 1 |
| Final with critic | 106/109 | 108/109 | 10/10 | invented item: 1 |

The primary comparison is **108/109 before and 108/109 after**. Failure classes overlap. The widened baseline originally had two lost-item failures and one wrong-time failure. The final run originally had two lost-item failures and one invented-item failure. The two lost-item failures were expectation errors in both runs. The remaining before failure was the missing day on “after lunch”. The remaining final failure was the unrequested 5 PM move.

The original checker totals were 106, 105 and 104 in the widened baseline and two rounds. I stopped the fix loop under the requested two-round no-gain rule. Targeted wins did not justify continuing past that rule. No Capture output was replaced by an extra application-model retry.

| Route | Initial 87 cases | Before: 109 cases | Final: 109 cases |
| --- | --- | --- | --- |
| quick | 46 calls; 7.55 / 10.54 | 70 calls; 7.32 / 10.87 | 72 calls; 8.45 / 11.89 |
| careful | 20 calls; 11.19 / 15.70 | 21 calls; 12.50 / 15.29 | 20 calls; 13.20 / 16.73 |
| long | 2 calls; 47.40 / 48.90 | 2 calls; 46.03 / 51.71 | 2 calls; 50.14 / 52.27 |
| hard | 3 calls; 7.51 / 9.24 | 3 calls; 12.13 / 12.94 | 2 calls; 9.62 / 12.28 |

Cells show recorded calls, then median / p90 in seconds. Percentiles use nearest rank. The initial quick route had three additional timed-out calls without a CLI latency record. They are counted as failures. Quick, careful and long use Haiku 5.5. Hard uses Sonnet 5.5. No route policy or deadline changed.

These are route call times. They include CLI startup, provider work and structured formatting. The judge's calls are separate. Small samples on long and hard routes are weak evidence. Native phone latency is UNVERIFIED. No speedup is claimed.

Measured fix: meal and bedtime windows can save a day without an invented clock. “After lunch” now belongs to today unless another day or an open-ended window was supplied. “Tomorrow after lunch” keeps tomorrow. “Next week after lunch” remains undated. The exact words survive. The normal Capture receipt and Undo path is used.

`android-companion/capture-vague-time.test.mjs` failed before the parser fix. It now checks these windows, explicit clocks, saved date, original words, receipt and Undo. Live `everyday-after-lunch` repeats passed 2/3 after this change alone. The remaining reply refused to print the document. That exposed the second cause.

Measured fix: ordinary personal actions no longer need to be offered back as optional task ideas merely because RPM cannot perform the action. The capability contract distinguishes capturing a person's task from external execution. Printing a document and emailing an office are tasks. Sending a WhatsApp through another app remains unsupported.

`intent-v2/test/capabilities.test.mjs` checks the model-facing contract. Its new assertion failed before the change. This is a prompt contract test; it does not prove model classification. Live repeats supply that evidence: printing, email, an undated purchase and the unsupported WhatsApp request passed 12/12, three runs each. The earlier round had refused both printing and email.

The runner now reports nearest-rank p90 as well as p50 and p95. `scripts/capture-stress/checks.test.mjs` and `api.test.mjs` enforce the percentile calculation. Completion and meal-content checks have negative controls. These change measurement, not app behavior.

Measured critic audit: all 109 final outputs were judged. The final canonical-state critic found 108/109 faithful in meaning. It agreed with the corrected checker on every case. It received words, outputs, seeded entities and canonical saved entities. It did not receive my reasoning or code changes.

The first critic input included new tasks and receipts but omitted edited canonical rows. That made the existing-gym assessment unreliable. I added before/after entities to the runner and replayed all 109 retained outputs through the isolated critic. No Capture call was rerun. The original scores remain in `results-before-canonical-judge.json` and each result's `judgeHistory`. The expanded inputs are saved as `judge-input.json`. A new regression test in `scripts/capture-stress/checks.test.mjs` verifies that completed existing tasks and hierarchy rows reach the critic.

Only two expectations changed after inspection:
- `everyday-kal-gym`: tomorrow's 7 AM Gym morning task already matches “kal subah gym jaana hai”. The evening task does not. A question is unnecessary. The expectation now forbids a question and requires no new item or change.
- `everyday-cancel-reminder`: disabled alarms store `off`, not `null`. The expectation now checks `off` and also preserves the exact task title, day, clock, duration and incomplete state.

Both corrections were applied to the before, after and repeated-case stores with `recheck.mjs`. Case words and model outputs were retained. Backups and hashes preserve the original evaluations. The shared corrected corpus SHA-256 is `8555187fa3a4fd5c373841099516aa0689eb93f3e85542f6938513531584aafa`. All Capture runs kept a stable app-source fingerprint.

Measured corpus limit: one intermediate “call mom at 6” updated the seeded “Call Amma”. The checker expected a new task. Inferred: this is an alias ambiguity in the fixture. The fixture does not establish that identity, so I left that expectation unchanged. The final case and critic agreed. This intermediate mismatch is not proof of a product error.

Remaining measured failures from intermediate rounds:

- `everyday-bulk-after-five`: one output asked whether exactly 5 PM should move. Another moved that boundary task. The request said after 5. Inferred cause: the model does not apply the strict boundary consistently. A bounded local selector is the next fix to try. It must use the full store, preserve clocks and use the existing transaction and Undo.
- `result-purpose-must`: one output created two identical Blocks with different operation IDs. Both were saved. Inferred cause: operation-ID validation does not reject semantically duplicate creates. A safe fix must also rewrite child references and preserve intentional distinct tasks.
- `everyday-correction`: a Thursday-only correction repeated the saved 4 PM clock in its first output. The time guard rejected that precision. Repair then supplied only Thursday and the canonical updater preserved 4 PM. Measured: the result was correct, but it took two model calls. Inferred cause: extraction and time provenance disagree about inherited clocks. The guard should normalize a verified unchanged saved clock rather than authorize a new clock.

The stop rule left these fixes unimplemented. One run cannot estimate their real-world frequency. Guess: the CLI's extra formatting and possible reasoning steps hide some failures in the phone's quick API path. This run cannot establish that. The owner's actual failing captures were unavailable.

Measured verification: `npm test` passed before each commit. The latest run passed 867 JS tests, eight rule tests, 16 cloud tests, cloud typechecking, 23 Java parser checks and ten native cancellation checks.

All six local native scenarios passed on the API 36 S24 FE-sized emulator. The existing Block-title fit exception remained. No new exception was added. The final web assets were synced into the emulator. Canonical readback confirmed the saved task and its Block. `logs --errors` returned an empty list. `npm run check:evidence` passed. `rpmctl cleanup` stopped the owned emulator.

Native evidence is under `.verify/evidence/2026-10-20T06-19-29-129003/`:
- `02-capture-keeps-words-typed.png` and `03-capture-keeps-words-saved.png` show the preserved-words path.
- `04-capture-short-reminder-saved.png` shows a saved reminder, its exact five-minute schedule, and Undo.
- `14-plan-add-in-place-added.png` shows the task saved in its Block.

The new meal-window and prompt-classification paths are UNVERIFIED in the phone UI. The live CLI exercises their production backend. The emulator has no model key. `npm run ci:emulator` refused the unpushed branch. The no-push instruction was preserved; GitHub CI is UNVERIFIED. No phone release was attempted.

Artifacts remain under `.verify/capture-stress/`: `g-baseline`, `g-expanded-baseline`, `g-round1-repeat`, `g-round1-full`, `g-round2-repeat`, `g-round2-full`, and `g-final`. Each has inputs, outputs and saved stores. Full reports retain all failures. Rechecks preserve the original results and their hashes.

CLI project-document and hook canaries passed. Strict custom-prompt-only isolation remains UNVERIFIED. CLI framing and runtime instructions can differ from the phone API. Native networking, provider fallback, actual notification delivery, Samsung behavior, voice transcription and real widget placement remain UNVERIFIED.

## Round 2

Work is on `gauntlet/ai`, alone, with CLI transport. No push, emulator or UI changes are authorized for this track. Native verification will remain UNVERIFIED. The fixed corpus clock stays Monday 19 October at 10 AM IST.

The adversary's 40 cases are committed before app changes. I inspected every expectation against the checker and product terms. Combined water, skipped meal and breakfast checks already exist. A new negative-control test proves each part can fail independently.

Three expectations omitted requested actions. The mixed day now requires Kunal's notes too. Rice and eggs, and atta and oil, now require both goods. The checker permits those shopping pairs in one combined task or two tasks, but omission still fails. `checks.test.mjs` has omission and combined/separate controls. No model result informed these corrections.

Assumptions: “shift by an hour” means later in the adversary's two-calls case. A reported completed call can complete the saved future call. “Have to … otherwise I lose the seat” deliberately marks an essential action. An incidental visa appointment in a reason is context, not permission to invent another task. Existing strict checks enforce that last boundary.

A retained-output audit found two more measurement defects before app edits. The word matcher rejected “fees” for “fee”; it now accepts a direct plural s without permitting unrelated prefixes. The shoes retraction lacked its first-turn checkpoint, so intentionally requested shoes were called an invention before retraction. That checkpoint is now explicit. Intermediate maximum counts use the largest declared checkpoint; the final maximum and retraction still apply. New negative controls preserve both boundaries. The original baseline outputs and scores are retained, and corrected scores come from deterministic replay, without fresh Capture calls.

The two-calls case says “shift by an hour” without earlier or later. I am retaining its adversary expectation but will not make a local reader guess the direction merely to pass it. A clarification on that case is a benchmark failure with an inferred specification ambiguity.

Adversary baseline: 57/80 attempts passed (40 cases, two repeats). The uncorrected checker said 53/80. Four retained outputs gained passes solely from the documented fees/checkpoint corrections. Case words, model outputs and canonical stores did not change.

| Attack class | Baseline |
| --- | ---: |
| ADHD day rambles | 3/8 |
| Voice errors | 2/8 |
| Hinglish | 4/10 |
| Loose saved references | 4/8 |
| Multi-turn corrections | 8/8 |
| Relative and fuzzy time | 8/8 |
| Non-tasks | 6/6 |
| Completion and status | 8/8 |
| Purpose and Must | 4/6 |
| Dangerous misreads | 10/10 |

Fix iteration 1 targets time reading, the biggest measured baseline cause. “Five thirty”, “five forty five”, and clock-shaped “at for thirty” are normalized without altering quantity phrases. Hindi half-hour clocks with future wake-up wording are supported. An isolated exact clock in a multi-action source uses the same guarded inference as other bare clocks. A clock followed by its corrected day can now pass the time guard. A narrow “day after … same time” correction uses the existing day updater.

A day-only correction that echoes the target's unchanged clock no longer needs a repair call. The guard verifies the target, clock and stated day, then sends only the original day evidence to the canonical updater. A different clock still fails. Tests: `capture-spoken-correction.test.mjs` and `intent-time-guard.test.mjs`. The new assertions were red before the fixes.

“Push everything after 5 today to tomorrow” reads the full store locally. The task at exactly 5 stays put. Later open tasks retain their clocks. One receipt and Undo cover the move. The reader abstains above 30 matches, on recurrence and during an open question or draft. `capture-bulk-local.test.mjs` proves selection beyond retrieval limits, the strict boundary, exact words, canonical readback and Undo. Its core assertion was red before the fix.

Equal task and Block creates collapse before application. Child links are rewritten to the retained parent. Different schedules, parents and purposes stay separate. `duplicate-creates.test.mjs` was red at four operations and now requires two, with the retained parent reference. This is conservative equality of normalized field values, not a similarity-based merge of differently worded tasks.

Iteration 1 measured 31/45 on targeted repeats, 68/80 on all adversary attempts, and 109/109 on the old corpus. Baseline time failures accounted for 17 of the 23 failures; health reports, Must and the directionless shift accounted for two each. The targeted run includes the three mandatory round-1 defects, three repeats each; all nine passed. Native behavior is UNVERIFIED. All live runs use stable source fingerprints.
