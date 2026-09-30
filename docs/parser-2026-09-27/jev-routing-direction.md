# Jev, Luna none and Luna high: evaluated design direction

27 September 2026. **Live synthetic Jev routing evaluation completed; no production routing or parser behavior changed in this turn.** The proposal is sensible as a division of responsibilities. A Jev call should either replace a generative call with a bounded decision or justify the overhead of deciding which generative call follows it.

## Recommended division

| Work | Handler | Why |
| --- | --- | --- |
| Explicit UI actions, schema checks, exact IDs, time arithmetic, calendar overlaps, saved-date preservation, permissions and Undo | Local code | Exact state and rules should decide these, without an inference call. |
| Match to an existing block, select among supplied candidates, classify a genuinely unclear work route | Jev | The complete answer set can be supplied; uncertainty can abstain. |
| Convert a concrete natural-language request into faithful task fields | GPT-6 Luna none | Fast extraction; preserve original words and keep optional fields optional. |
| Suggest new steps, choose priorities, discuss tradeoffs, answer contextual questions | GPT-6 Luna high | The broader suite showed better planning and answer quality, with a latency tradeoff. |
| Missing AM/PM, absent target or other missing user information | Local review / one focused clarification | Extra reasoning cannot supply a fact the user never gave. |

Jev cannot generate arbitrary task titles, purposes or replies. It can select a supplied text span or candidate; code can then copy it. Dates and arithmetic remain local. Current TypeSafe documentation explicitly describes these limitations: [API contract](https://docs.typesafe.ai/api), [known Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13). RPM already has an existing review-first Jev grouping path, documented in [the September integration](../jev-evaluation-and-integration-2026-09-20.md).

## Bounded question and local policy

The probe asks one Choice: “Which kind of help is the person actually requesting?” The complete options are **direct capture/edit**, **planning or contextual reasoning**, **conversation without task changes**, and **needs context/review**. This tests workload classification, not whether a particular model is guaranteed to answer correctly.

Requests use `typesafe/jev-1.13` through OpenRouter's Decisions API. Responses resolved to `typesafe/jev-1.13-20260917`, provider TypeSafe. The native app's existing bounded categorisation contract was reused without broadening its allowlist: synthetic user messages are task cards, and the supplied synthetic work queues occupy the block fields. No actual planner grouping or task write was executed. Only synthetic text was sent; the encrypted native credential was never extracted.

Local rule, fixed before the live runs:

- Baseline is high. An explicit trusted application risk floor can never be downgraded.
- Select none only for direct/conversation when chosen-option probability is at least **0.90**, Choice confidence at least **0.80**, and the top-two probability margin at least **0.60**.
- A reasoning choice keeps high. Missing context, weak confidence, stale evidence, incomplete answers, inconsistent probabilities or provider failure keep the baseline.
- This rule selects model effort only. It never grants permission, validates task meaning or causes a save. Missing context ultimately needs clarification, even if high is retained for interpreting the request.

Full responses were checked with the Jev skill's request/response validators, including all expected probabilities, chosen-option consistency, resolved model and usage. The local policy also tests stale fingerprints, malformed results and risk-floor preservation. Thresholds are provisional; they were not tuned to claim a calibrated success probability.

## Live results

| Probe | Correct workload labels | New held-out cases | Median / p95 | Reported total cost |
| --- | ---: | ---: | --- | ---: |
| Initial wording | 20/24 | — | 380 / 461 ms | $0.000793464 |
| Revised wording | 30/32 | 8/8 | 381 / 608 ms | $0.001134294 |

**56 total live Jev requests cost $0.001927758 (about 0.193 US cents).** The first call in the initial run took 1.854 seconds; the table includes it. All requests and responses are retained; no failed classification was discarded.

The initial request had overlapping wording: direct extraction included preference facts, while preferences also belonged in conversation. The revised request removes that overlap and explicitly separates a present task-change request from negation, third-party intentions and quoted instructions. It fixed those classifications but introduced two planning/direct confusions, both uncertain enough for the unchanged local threshold to retain high. This illustrates why clearer wording and local policy both matter; higher confidence alone is not the success criterion.

The revised policy selected none for 20 cases and high for 12. Seven high routes were fallbacks: two missing-context requests, two uncertain misclassified planning requests, and three uncertain conversational requests. **No labelled reasoning or missing-context case was sent to none in this probe**, at the cost of three unnecessary high routes for conversational cases. These are small synthetic samples, not production calibration.

### Example probabilities and outcomes

| User request | Direct | Reasoning | Conversation | Review | Choice confidence | Local outcome |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Buy milk | 1.00 | 0.00 | 0.00 | 0.00 | 1.00 | none |
| Help make Friday’s fractions lesson ready | 0.53 | 0.47 | 0.00 | 0.00 | 0.36 | high: uncertain downgrade |
| Actually, make it ten | 0.04 | 0.00 | 0.00 | 0.96 | 0.94 | high baseline; missing context still requires clarification |
| Exhausted; do not plan anything | 0.14 | 0.01 | 0.84 | 0.01 | 0.79 | high: uncertain downgrade |

These are model judgments, not measured probabilities that the eventual task will succeed. Outcomes were **shadow selections only**, not applied app routes.

## Does adding Jev pay for itself?

A bounded offline replay joined the revised routes for the original 24 cases to the already-recorded none/high responses from the previous evaluation. It did not run a complete routed pipeline. Costs include the newly measured Jev charge plus the corresponding historical Luna charge.

| Replay policy | Previously reviewed answers selected | Combined illustrative cost | Calls per request |
| --- | ---: | ---: | ---: |
| Always none | 20/24 | $0.002565 | 1 |
| Always high | 23/24 | $0.005994 | 1 |
| Jev then selected mode | 22/24 | $0.005552 | 2 |

That is only **7.4% cheaper than always high** on this mix, and costs more than always none. It also adds roughly the observed router latency before generation. A router with a low standalone price is not automatically a large end-to-end saving. The best uses are bounded operations that replace generation entirely, or ambiguous routes where a decision is worth the extra call. Skip Jev when the selected UI action or an exact rule already settles the route. Cache only against an identical, current evidence fingerprint.

Two previously failing none cases—the ambiguous reading range and saved-date correction—are correctly classified as direct work and still select none. Routing alone would not fix them. The repairs below are therefore central to the design, not optional polish.

## Repairs to make before enforcing the split

| Observed failure | Proposed repair | Acceptance check |
| --- | --- | --- |
| Saved 19:00 walk described as 17:00 | Add locally formatted date/time and computed interval facts to retrieved context; compute availability from actual calendar coverage in code. | No model performs UTC conversion or asserts availability without coverage. |
| “Read” treated as a missing title | State that a generic supplied action is a valid title; validate required title; allow one bounded repair using the exact validation error. | Preserve Read and ask only AM/PM for the ambiguous range. |
| Existing task’s date asked again | Include explicit saved local date and the rule that a clock-only edit keeps it; build routine confirmation copy from the validated preview. | Correct preview and reply agree; no redundant day question. |
| Task #999 proposed despite absence | Retain the current exact-ID guard; constrain candidates and make missing targets explicit in the request. | No guessed target or write; focused correction request. This guard already worked. |
| Shallow lesson-planning reply | Route actual planning to high; require concrete next steps marked as suggestions and grounded purpose. | Meet the planning rubric without inventing personal motives. |
| Hinglish / Marathi dates unresolved | Extend deterministic normalisation for supported phrases, preserving raw text and ambiguous date meanings; test contextual past/future uses. | Explicit tomorrow/8 AM resolves correctly; vague morning does not invent a clock. |
| High response exceeds Capture’s 12 s budget | Give explicit planning a deliberate longer budget or a separately cancellable planning flow; retain fast Capture and raw-save-first recovery. | No silent discard or duplicate save; cancellation and late responses remain guarded. |

A single repair escalation is different from looping until a model agrees. Unresolved user information should stay a clarification, and deterministic facts should not be “verified” by model votes. Keep exact evidence, valid references, complete multi-action extraction, no invented optional fields, stale-state checks, explicit review and Undo on every route.

## Artifacts and verified stage

- [Experimental evaluator](../../intent-v2/evals/jev-routing.mjs), [native probe runner](../../scripts/probe-jev-routing.mjs), [policy tests](../../intent-v2/test/jev-routing.test.mjs). Not imported by product runtime.
- [Initial request schema/examples](../../output/parser-2026-09-27/jev-routing/requests.json), [initial raw results](../../output/parser-2026-09-27/jev-routing/results.jsonl).
- [Revised requests](../../output/parser-2026-09-27/jev-routing/v2/requests.json), [revised raw responses and probabilities](../../output/parser-2026-09-27/jev-routing/v2/results.jsonl), [summary](../../output/parser-2026-09-27/jev-routing/v2/summary.json).
- [Illustrative replay](../../output/parser-2026-09-27/jev-routing/v2/offline-replay.json).
- [Restoration receipt](../../output/parser-2026-09-27/jev-routing/restoration.json): all 65 backed-up emulator files restored byte-for-byte, zero extras, no launch after restoration; emulator shut down.

The three focused policy tests, script syntax check and diff whitespace check passed. Production model defaults, parser, prompts, deadlines and routing remain unchanged by this probe. No new APK, physical-phone installation, commit, push or deployment.
