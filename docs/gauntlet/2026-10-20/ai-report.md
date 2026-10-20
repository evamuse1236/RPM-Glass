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

| Attack class | Baseline | Final |
| --- | ---: | ---: |
| ADHD day rambles | 3/8 | 8/8 |
| Voice errors | 2/8 | 8/8 |
| Hinglish | 4/10 | 10/10 |
| Loose saved references | 4/8 | 6/8 |
| Multi-turn corrections | 8/8 | 8/8 |
| Relative and fuzzy time | 8/8 | 8/8 |
| Non-tasks | 6/6 | 6/6 |
| Completion and status | 8/8 | 8/8 |
| Purpose and Must | 4/6 | 6/6 |
| Dangerous misreads | 10/10 | 10/10 |
| Total | 57/80 | 78/80 |

Fix iteration 1 targets time reading, the biggest measured baseline cause. “Five thirty”, “five forty five”, and clock-shaped “at for thirty” are normalized without altering quantity phrases. Hindi half-hour clocks with future wake-up wording are supported. An isolated exact clock in a multi-action source uses the same guarded inference as other bare clocks. A clock followed by its corrected day can now pass the time guard. A narrow “day after … same time” correction uses the existing day updater.

A day-only correction that echoes the target's unchanged clock no longer needs a repair call. The guard verifies the target, clock and stated day, then sends only the original day evidence to the canonical updater. A different clock still fails. Tests: `capture-spoken-correction.test.mjs` and `intent-time-guard.test.mjs`. The new assertions were red before the fixes.

“Push everything after 5 today to tomorrow” reads the full store locally. The task at exactly 5 stays put. Later open tasks retain their clocks. One receipt and Undo cover the move. The reader abstains above 30 matches, on recurrence and during an open question or draft. `capture-bulk-local.test.mjs` proves selection beyond retrieval limits, the strict boundary, exact words, canonical readback and Undo. Its core assertion was red before the fix.

Equal task and Block creates collapse before application. Child links are rewritten to the retained parent. Different schedules, parents and purposes stay separate. `duplicate-creates.test.mjs` was red at four operations and now requires two, with the retained parent reference. This is conservative equality of normalized field values, not a similarity-based merge of differently worded tasks.

Iteration 1 measured 31/45 on targeted repeats, 68/80 on all adversary attempts, and 109/109 on the old corpus. Baseline time failures accounted for 17 of the 23 failures; health reports, Must and the directionless shift accounted for two each. The targeted run includes the three mandatory round-1 defects, three repeats each; all nine passed. Native behavior is UNVERIFIED. All live runs use stable source fingerprints.

Iteration 2 passed 20/24 targeted attempts and 75/80 adversary attempts. It fixed the past-clause clock leak, explicit due-clock precedence, punctuated day corrections and the near-future Hinglish window. I treat “thodi der mein” as a window on the capture day, with no clock. The exact words remain. Its local parser test is explicit about this policy.

Explicit water counts and leading relative reminders now avoid the model. Literal task commands can also be read locally when no open Block or saved-item match needs interpretation. “Call mom at 6”, “buy milk tomorrow” and “gym 7am” pass the normal save, receipt and Undo tests in that unambiguous setting. The populated benchmark still uses AI for those task shapes because it contains open Blocks and possible saved references. No family identity is guessed.

`capture-local-reader.test.mjs` checks all three task shapes, water quantities, exact words, retry idempotency and Undo. Negative controls cover negation, alternatives, multiple actions, reasons, quantities in titles, other drinks, estimates, history, units, family aliases, saved Gym tasks and open Blocks. `short-reminder.test.mjs` covers a leading “in 20 min”. These tests failed before implementation. Model-path durability, failure and trace fixtures now use wording that still requires the model; their checks remain. The scheduling-help test requires zero additional model calls on tap.

The model contract now distinguishes a fresh body report from an equal saved daily total. It treats “again” as repetition, not an unstated previous day. Explicitly essential wording can mark Must, and a vent needs no follow-up question. `capabilities.test.mjs` tests that contract, not model understanding. The live repeats test understanding. Prompt changes alone still missed one explicit reason in the targeted run.

Duplicate equality now preserves case-sensitive parent IDs and notes. The bulk selector handles an already-passed boundary and keeps the source's capitalization. Their new regression controls failed before these refinements.

Iteration 2 kept the old corpus at 109/109. Its five broad-run failures were two directionless shifts, one malformed inherited day/clock, one lost fee-waiver reason and one unwanted rewrite of the generic saved grocery run. The in-memory browser bundle compiled. No generated UI assets were written.

Iteration 3 recovered the source's exact day when a “same time” edit contained a malformed model-rendered clock. The canonical updater preserves the clock. It also copies a missing explicit loss consequence or “the only way” reason onto a single Inbox action. Clear existing fields, Block purposes and independent clauses are preserved. An explicitly essential leading “I have to” with that reason can mark Must. `task-reasons.test.mjs` and the same-time regression were red before these changes.

A bare new specific action now needs a subject match before it can update a saved task. Sharing “buy” does not identify “Buy groceries”. A mismatch asks for the existing bounded repair before any mutation. `follow-up.test.mjs` injects the bad grocery rewrite, checks the repair creates a separate task, and checks the saved grocery task stays unchanged. Named saved subjects and explicit references remain allowed.

Clock recovery now respects explicit schedule clears and original source ownership during partial validation. An unquoted clock is recovered only immediately after its own exact action quote. Vague windows abstain on other day choices, clocks or actions. `capture-spoken-correction.test.mjs` has positive and negative controls. Iteration 3's targeted run passed 18/21; only the directionless shift failed its three repeats.

Iteration 3's adversary run passed 79/80. It had no transport failures. The only failure asked for the missing shift direction. One other repeat chose the adversary's assumed forward direction and passed. That variation does not establish that the direction was stated.

The next old-corpus run was interrupted by temporary-filesystem quota errors before model calls. It produced no final report. Those partial artifacts stay in `g2-r3-old`. I reran the whole old corpus with `TMPDIR` pointing to `.verify/gauntlet-tmp`, away from the shared temporary filesystem. No other process or emulator was touched.

The complete retry passed 108/109. Its only failure is the previously documented mom/Amma fixture ambiguity: the model moved saved “Call Amma”, while the unchanged expectation asks for a new “Call mom”. No transport failures occurred in the retry. The regression floor is met. This expectation was not loosened.


The resumed run kept every artifact under `.verify`, including CLI temporary files. It reproduced all five interrupted test failures before changing production code. It did not discard those tests.

Iteration 4 closes three clock and recurrence gaps. A new bare clock now retains a saved future day. Its AM/PM still comes from the new words and capture anchor. The alternate receipt chip stays on that same saved day, and Undo restores the selected clock. The full suite exposed one older assertion expecting the capture day instead. That assertion now follows the existing product rule for saved future days; its AM/PM inference check remains. Tests: `capture-time-followup.test.mjs` and `intent-service-time.test.mjs`.

A fresh clock elsewhere in a source cannot hide behind a day-only quotation to inherit the saved AM/PM. `intent-time-guard.test.mjs` injects that bad extraction. A recurring task whose stored start is yesterday also prevents a partial local bulk move today. The full active store is checked before selection. `capture-bulk-local.test.mjs` covers the projected recurrence.

An exact, unique saved task name followed by a literal due clock and “keep the alarm” now reads locally. The explicit due clock wins over a redundant relative nudge. The saved day, duration and alarm remain. One normal receipt and Undo cover the change. `capture-local-reader.test.mjs` checks today and a future day. It rejects duplicate names, recurrence, missing alarms, alternatives, historical days, ranges and extra actions. Those two positive tests were red before the local reader was added.


Iteration 4 passed 22/24 targeted attempts, 76/80 adversary attempts and 108/109 old cases. Two adversary failures asked for the missing shift direction. Two more lost the clock when the model quoted “9 tonight” without “at”. The retained outputs show the parser saving only today. This is a measured parser gap, not a reason to weaken the case. The old failure is the unchanged mom/Amma ambiguity. `npm test` passed before this commit. The browser bundle compiled in memory.


Iteration 5 fixes the clock-first fragment at the parser boundary. “9 tonight”, “9 tomorrow”, “nine Thursday” and “five thirty tonight” keep their exact day and clock without a preceding “at”. Only a leading clock followed directly by a day gets this normalization. “9 eggs tonight” and “5 minute tidy tonight” remain quantities. `cli/bare-clock.test.mjs` checks both sides. `capture-spoken-correction.test.mjs` replays the failing extraction with the five-minute title, exact words, canonical saved clock, duration and Undo. All three new regression tests were red before the fixes.

The local-reader audit also found that “read chapter last Tuesday” could create a future task. Historical words and unsupported windows now make the literal-task reader abstain. “Read the workbook yesterday”, “buy milk next week”, “call mom soon” and the other negative controls go to the model. `capture-local-reader.test.mjs` verifies no local save; it does not claim to prove the model’s later classification.

The final local coverage audit uses the production service and file-backed stores with a non-interpreting model sentinel. A capture counts only with zero model calls and every corpus check passing. There are 55 eligible single-turn texts: 20 everyday and 35 adversary texts. Six read locally, or 10.9%. That is four of 20 everyday texts and two of 35 adversary texts. No local result failed the checker. Median backend latency is 16 ms; p90 is 71 ms. The six texts are the strict bulk move, the existing next-task query, two water reports, the named due-clock edit and the leading relative reminder. The retained baseline outputs had one model-free everyday text and no model-free adversary text.

The “call mom at 6”, “buy milk tomorrow” and “gym 7am” unit tests also use zero model calls with receipt and Undo. The populated benchmark has open Blocks and possible saved references, so those bare task shapes still require the model there. This conservative rule limits the measured speed gain. These are backend timings on this machine, not phone timings. The final audit is `.verify/capture-stress/g2-local-r5/coverage.json`.

No push, emulator launch, sync, cleanup or device install was performed in this resumed run. Cleanup would risk the other agent’s emulator. The in-memory browser bundle compiles. Native Capture, Samsung behavior, alarms and real widget placement remain **UNVERIFIED**. `npm run check:evidence` exits 1 because the APK is older than this branch’s app code. `npm run ci:emulator` refuses the unpushed branch. Logs are `.verify/g2-final-evidence.log`, `.verify/g2-final-ci.log` and `.verify/g2-final-browser-build.log`. No native screenshot is claimed for these changes.


Final adversary comparison: **57/80 before and 78/80 after**, or 71.25% to 97.5%. Every clear case passed both final repeats. The final run made 88 model calls versus 96 in the baseline. There were no transport failures. The fixed clock, case texts, corrected expectations and CLI transport stayed the same. Both runs have stable source fingerprints. Iteration 3’s 79/80 remains recorded. Inferred: its extra pass assumed a direction that was not stated. The final count is not replaced with that best count.

Measured final failures: both repeats of `adv-ref-both-calls-hour` asked whether to move earlier or later and left the calls unchanged. Inferred cause: the expectation supplies a forward direction absent from “both calls today shift by an hour”. A safe clarification fails this benchmark expectation. I retained the case and did not teach the local reader to guess. Rounds 4 and 5 did not improve the best measured pass count, so the loop stops after five rounds. The later fixes address tested safety, speed and extraction variance.

Measured CLI latency: quick calls had an 8.43 s median and 13.05 s p90 in the adversary baseline. The final quick calls had an 8.04 s median and 14.13 s p90. This does not establish faster model work. Careful calls had a 12.15 s final median and 17.35 s p90. Models, route budgets and route effort were not changed. Native latency is **UNVERIFIED**.

The cases and checker are still a finite synthetic workload. Guess: CLI framing can conceal failures that occur through the phone API. That is unmeasured here. Differently worded semantic duplicates remain unmeasured; the implemented merge uses equality of normalized fields and preserves distinct details. The owner’s actual failing captures were not available.


Iteration 5 passed 12/15 targeted attempts, 78/80 adversary attempts and **108/109 old cases**. All three targeted failures asked for the unstated shift direction. All three targeted tidy-clock attempts passed. The old-corpus floor stays at 108/109, matching round 1. Measured old failure: `everyday-call-mom` updated saved “Call Amma” instead of creating the checker’s “Call mom”. Inferred cause: unresolved family identity in the fixture. Its expectation remains unchanged. No transport failure occurred in either final full run.

Final verification: `npm test` passes 918 JS tests, eight rule tests, 16 cloud tests, cloud typechecking, 23 Java parser checks and ten native cancellation checks. The interrupted tests remain in the suite. Red/green proof is in `.verify/resume-targeted.log`, `.verify/g2-r5-red.log` and `.verify/g2-r5-green.log`. The complete final test log is `.verify/g2-final-tests.log`. These checks do not substitute for the explicitly unverified native paths.

Benchmark artifacts are under `.verify/capture-stress/`. The baseline is `g2-baseline`. Iterations 1, 2 and 3 retain `g2-r1-*`, `g2-r2-*` and `g2-r3-*`, including the interrupted old run and its complete retry. The resumed iterations retain `g2-r4-repeat`, `g2-r4-adv`, `g2-r4-old`, `g2-r5-repeat`, `g2-r5-adv` and `g2-r5-old`. Their `results.json`, `report.md`, per-turn outputs and canonical stores preserve the scores above. All completed resumed benchmark runs have stable app-source fingerprints. No case was loosened to obtain a model pass.
