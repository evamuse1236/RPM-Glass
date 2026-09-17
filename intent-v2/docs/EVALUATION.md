# Evaluation and delivery verification

## What was run here

The kit’s `npm test` completed with **86 tests passed, 0 failed, 0 skipped**, using Node.js 22.16.0 in Linux. The set includes deterministic state/interpretation tests, adapter tests using contract stubs, sort-preview tests, source-hotfix snippet checks and synthetic-evaluator checks. It is not the original repository’s test suite.

Chromium browser smoke checks used the system Chromium executable through Playwright. The standalone HTML was loaded with `page.set_content`; full-page desktop (1440 px wide) and mobile (390 px wide) screenshots were inspected. The checks exercised AM/PM selection, draft commit, Undo, reflection without plan creation, memory approval and a Forget control. No JavaScript page errors were observed. No horizontal overflow was detected at the tested mobile width. These are browser smoke checks, not exhaustive accessibility or device certification.

Because the `set_content` context did not provide normal origin-backed localStorage, that run exercised the demo’s labelled session-memory fallback. A served-origin persistence test was not part of that browser run. Core restart/idempotency behaviour was exercised through repository fixtures. Neither test is a claim that native storage/phone lifecycle behaviour was verified.

The live evaluation runner was run in **dry-run mode only**. It selected ten of 66 synthetic cases and made no API calls. No model quality score, real provider latency, monetary cost, Android compilation result or notification-delivery result is claimed.

## What the deterministic tests cover

Schema and semantic guards: missing/extra keys, set/clear/unknown distinctions, exact field provenance, suggested versus stated fields, source-unit coverage, unsupported IDs/links and absent optional fields.

Conversation state: source retention before model work, bounded timeout, late results, repair bounds, isolated drafts, stable-operation amendments and stale revision checks.

Persistence: same-message/action idempotency, conflicting payloads under reused IDs, compare-and-swap retries, receipt recovery after uncertain save acknowledgement and Undo protections.

Transactions and UI actions: no partial commit of unresolved compound requests, exact typed answers, stale/mismatched chips, calendar review tokens, model-independent local decisions and consented memory.

Sorting: preview does not modify canonical groups, dismiss does not rearrange, duplicate/omitted selections fail, a changed target invalidates approval, failed application stays isolated and whole-operation Undo is retained.

Hotfix tests verify replacement matching on controlled snippets, not successful installation onto a full checkout. The installer independently verifies original source hashes at the user’s installation time.

## What these tests do not establish

They do not prove that a real model extracts every clause, asks the most helpful question, has an accurate picture of the user, correctly handles all languages, or reliably interprets dates in the native parser. They do not prove the dependency-injected adapter succeeds against a complete checked-out repository: run `scripts/test-in-repo.mjs` there. They do not measure end-to-end phone performance, alert delivery, native cancellation, data retention or screen-reader usability.

The 66 synthetic cases are a starter specification, not a scientifically representative or calibrated benchmark. Their simple field/count grader deliberately does not claim complete semantic scoring. Human review can find valid alternate solutions or overly strict expectations; revise a case when its grading is unfair rather than forcing the model to imitate a single wording.

## Run a model comparison

Use the same prompt, schema, case set, reference instant and timezone for each route. First verify that the provider supports the actual schema. Run:

```bash
# No request:
node evals/run-live.mjs
# Ten requests, after configuring environment variables:
node evals/run-live.mjs --run --limit 10 --save-outputs
# Full initial suite: 66 requests:
node evals/run-live.mjs --run --all --save-outputs
```

Default output records case ID, requested model, optional provider, duration, contract result and review notes. `--save-outputs` adds the full synthetic model output locally. The runner makes one request per case with a 20-second request timeout, not the production harness’s one-repair policy. Its latency includes request completion but not native persistence or the complete user journey. It does not commit any plans.

Repeat the full set across several trials before selecting a route. Keep a locked regression subset and a separate evolving capability set. Avoid changing the prompt and cases simultaneously without recording both versions. Record actual provider-resolved model metadata, token usage and cost through a production telemetry adapter later; the small supplied runner does not collect all of those.

## Human review rubric

Score each dimension 0–2, and attach a reason for every 0. Zero on a safety/data-integrity dimension fails the case regardless of total.

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Faithfulness | Invents or changes intent | Minor ambiguity needs editing | Matches intended meaning |
| Completeness | Loses a requested action | Captures most, retains an unresolved source | Accounts for all requested actions |
| Non-actions | Turns feeling/quote/idea into obligation | Borderline or overly pushy | Keeps non-actions distinct |
| Provenance | Fabricates purpose/memory/evidence | Labels uncertainty weakly | Stated and suggested details are clear |
| Targeting | Wrong entity or duplicate correction | Needs extra disambiguation | Correct current ID and sparse change |
| Question value | Unnecessary or wrong question | Relevant but could be smaller | One answer materially helps the next move |
| Warmth and agency | Shaming, intrusive or manipulative | Polite but generic | Specific, calm, useful and easy to decline |
| Startability | Inflates work or vague next step | Usable with further shaping | Clear manageable next action |
| Receipt truth | Claims unperformed save/delivery | Unclear state wording | Actual state and permissions are explicit |

Review refusals to create tasks as well as task creation. “No new task” is often the correct result. More engagement is not inherently better.

## Initial release gates (proposed, not measured)

Require zero wrong-target writes, accidental commits, duplicate side effects and lost original captures in the deterministic/real-module regression suite. Require zero failures in the explicitly tested stale action, compound omission and uncertain-acknowledgement cases. This is a regression gate, not a proof that future incidents are impossible.

For live interpretation, agree a minimum acceptable first-pass correctness rate and report it by category. A single aggregate can hide a dangerous weakness in negation or edits. Aim to reduce unnecessary questions and correction effort relative to the measured baseline, without reducing needed clarification. Compare cost per successful capture, not cost per token alone.

Proposed performance targets to validate on the user’s device: roughly 100 ms for local capture/choice acknowledgement where storage permits, two-second median usable draft and five-second p95 normal draft, with a clear bounded fallback. These are goals. The delivery does not show that any route achieves them.

## Required next tests in the real app

Run the actual-module smoke, original Node suites, asset build, applicable cloud checks and Android instrumentation. Add: force-close after raw capture; acknowledgement lost after durable write; simultaneous planner/capture edits; repeated retry taps; stale sort approval; unavailable and stale calendar coverage; midnight/timezone changes; recurring occurrence versus series completion; imported alarms disarmed; permission denial; TalkBack; large text; keyboard/rotation; full storage; export/import; rollback.

Before enabling long-term memory, test archival propagation through all context paths and implement deletion/retention. Before enabling low-risk auto-save, demonstrate the extractor’s false-positive and wrong-target behaviour on actual, consented user examples. Before claiming “fast,” instrument the full native interaction rather than quoting this kit’s unit-test runtime.
