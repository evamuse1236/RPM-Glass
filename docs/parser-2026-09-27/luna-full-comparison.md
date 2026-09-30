# GPT-6 Luna: none versus high on the full RPM evaluation

Run date: 27 September 2026. Status: complete; 146 live requests, all answers reviewed, emulator data restored.

## Scope and method

73 synthetic cases at each reasoning setting: all 66 existing cases in `intent-v2/evals/cases.jsonl`, plus the seven range, correction, compound, negation, hierarchy and tool-call regressions from the earlier sample. 146 paid requests, one attempt per case per setting. No retry or repair; no default-model change.

Both configurations use `openai/gpt-6-luna`, pinned to the OpenAI provider through OpenRouter, with parameter support required and fallback disabled. The real Capture system prompt, strict schema, source/context builder and local validator are identical between modes. Capture retains its 3,000-output-token cap; the isolated `change_planner` probe uses 3,500 tokens and the app's explicit `strict:false` setting. The reference instant is 2026-09-16 04:00 UTC, in Asia/Kolkata.

Requests are sequential, with the first configuration alternated for each case. Latency is elapsed native request-to-response time, excluding local grading. Responses are allowed to finish up to the native transport limit, while the real Capture budget of 12 seconds is reported separately. Costs come from provider-reported per-request usage, including any prompt caching; missing cost is not treated as zero.

The existing encrypted credential remains inside the owned Android emulator. Only synthetic messages and synthetic context are sent. Captured model outputs are validated locally; the isolated tool probe executes only against an in-memory synthetic store. Canonical emulator plans are not changed by the evaluator. Private emulator data was backed up before launch and restored after testing: all 65 backed-up files matched byte-for-byte, with no extra files. Font scale remained 1.0. The emulator was shut down without launching the app after restoration; no physical phone was touched.

## Scoring

Original coarse contract scores are retained separately from supplemental semantic assertions. The supplemental assertions were written before this run and tested against deliberately incorrect actions and times. They check task content, dates, clock values, durations, clear-versus-unknown, recurrence, alert type, preserved saved dates, and hierarchy links where the fixture has a concrete expected answer.

Every completed answer is also reviewed against its source and the existing case-specific review notes. This catches unsupported claims, lost meaning, invented optional details, misleading replies and poor ambiguity handling that a valid schema alone cannot establish. Manual review is by the assistant, not an independent or blinded human panel. Raw results are retained separately from any reviewed scores.

An appropriate clarification counts as success when the request is genuinely ambiguous. A reply which claims a write or invents a time is a failure even when the local application prevents that write. Local parser limitations on otherwise faithful multilingual extraction are reported separately; they must not be mistaken for better model reasoning.

## Results

All 146 calls completed through the requested GPT-6 Luna / OpenAI route. Provider-reported costs are available for every call. No request was retried or discarded. **Total cost: $0.022023 (2.20 US cents).**

| Measure | Reasoning none | Reasoning high |
| --- | ---: | ---: |
| Automated contract + semantic assertions | 72/73 | 72/73 |
| Reviewed overall success | **69/73 (94.5%)** | **72/73 (98.6%)** |
| Original 66 cases, reviewed | 64/66 | 65/66 |
| Seven added regression/tool cases, reviewed | 5/7 | 7/7 |
| Median response | **1.706 s** | 2.623 s |
| 95th percentile response | **2.375 s** | 7.436 s |
| Slowest response | **3.674 s** | 15.641 s |
| Total cost for 73 requests | **$0.007431** | $0.014593 |
| Cost per reviewed success | **$0.000108** | $0.000203 |
| Capture answers correct within 12 s (excludes tool probe) | 68/72 | **70/72** |
| Capture calls exceeding 12 s | **0** | 1 |
| Reported reasoning tokens | 0 | 13,998 |
| Reported cached input tokens | 157,597 | 157,597 |

None was **35.0% faster at the median and 49.1% cheaper**. High passed three more reviewed cases overall. Pairwise, both passed 68 cases; high alone passed four, and none alone passed one. Neither setting failed a case in common under the interpretation rubric. This small difference from a single run is evidence for further selection, not a statistically established accuracy advantage. Equal cached-input totals make the cost gap in this run more interpretable than an unmatched cache comparison.

### Where none failed

| Case | Finding | Severity / application behavior |
| --- | --- | --- |
| `sample-ambiguous` | For “Read tomorrow from 2 to 3,” treated the sufficient title Read as unknown and asked what to read instead of resolving AM/PM. | Real interpretation validator rejected the missing title; no task was committed. |
| `query-03` | Misread the saved 19:00 walk as 17:00–17:20 and incorrectly denied a free hour at 17:00. | Incorrect user-facing answer; no mutation. |
| `rpm-01` | Merely restated lesson preparation instead of giving concrete next steps. | Planning-quality failure against the original case review rubric. High supplied three suggested steps and preserved the stated purpose. |
| `sample-correction` | Asked which day despite the existing task's date being supplied. | Misleading, unnecessary clarification in the reply. The local preview itself correctly retained the saved date. |

The last three were found during answer review, not by the coarse contract score. They are deliberately distinguished from a parser/schema failure. All review decisions and explanations are saved in `manual-review.json`.

### Where high failed or was too slow

- `edit-09`: proposed completing task #999 although that ID was absent from the supplied records. The real local validator blocked it. None correctly asked which task was intended.
- `rpm-01`: the helpful lesson-planning response arrived after **15.641 seconds**, so it would miss Capture's 12-second interpretation budget even though its content passed. The live experiment allowed it to finish for analysis.

Both isolated `change_planner` probes passed application to synthetic in-memory state. Both complete 2pm–3pm range/hierarchy cases retained the correct start, end and 60-minute duration.

### Shared application limitation

Both models faithfully preserved the Hinglish `Kal subah 8 baje` and Marathi `udya sakali` time phrases, but the local English parser returned review. These count as faithful model extraction, **not successful automatic scheduling**. The first contains an explicit tomorrow-at-8-AM meaning; the second supplies tomorrow morning without an exact clock. More reasoning did not resolve this shared parser/localisation limitation.

### Recommendation

The initial seven-case result overstated how cleanly none would win on a broader workload. This run favors **high for reviewed answer quality**, while **none wins latency and cost**. None remains a reasonable candidate for routine Capture; high is worth considering for contextual queries, richer planning and repair after local validation rejects an interpretation. That split has not itself been benchmarked, and a validator-triggered retry would not catch every misleading reply found here.

Before choosing a single default, address the concrete gaps: preserve title and saved-date context under none, provide locally formatted saved times so query answers do not depend on model timezone arithmetic, and keep target-ID guards for both. High would need a deliberate handling strategy for complex requests beyond the current Capture deadline. No production prompt, model default, timeout or routing was changed in this comparison.

### Local verification

**357 JavaScript tests passed**, including the four new evaluator checks. These include the existing parser stress tests. Syntax checks and `git diff --check` passed. No new APK, physical-phone installation, commit, push or deployment was made.


## Limits

This compares one fixed synthetic turn per case at each level, not repeated-trial production reliability. It includes one isolated function-call probe, not an entire multi-turn Classic assistant tool benchmark. The 357 deterministic JavaScript tests are independent of model selection and are run once to verify the surrounding code; they are not 357 live prompts per model. Native phone UI, speech recognition, physical-phone latency and real-user outcomes are outside this model comparison.

## Reproduction and evidence

- Evaluator: `intent-v2/evals/luna-full.mjs`
- Opt-in paid runner: `node scripts/compare-luna-full.mjs --run`
- Evaluator regressions: `intent-v2/test/luna-full.test.mjs`
- [Request manifest](../../output/parser-2026-09-27/luna-full/manifest.json)
- [Immutable raw results](../../output/parser-2026-09-27/luna-full/results.jsonl) and [automated summary](../../output/parser-2026-09-27/luna-full/summary.json)
- [Per-answer review notes](../../output/parser-2026-09-27/luna-full/manual-review.json)
- [Reviewed results](../../output/parser-2026-09-27/luna-full/reviewed-results.jsonl) and [reviewed aggregate/category scores](../../output/parser-2026-09-27/luna-full/reviewed-summary.json)
- Offline aggregation: `node scripts/summarize-luna-full.mjs output/parser-2026-09-27/luna-full`
- [Emulator restoration receipt](../../output/parser-2026-09-27/luna-full/restoration.json)
