# Jev evaluation and bounded RPM integration

Date: 20 September 2026

## Decision

Use Jev only for **review-only grouping of unsorted tasks into existing RPM blocks**. Keep Luna for conversation, draft generation, purposes, new outcomes and other open-ended work. Keep date resolution, persistence, permission checks, Undo and final application in RPM code.

This earns a small integration because the answer space is bounded, a wrong suggestion is recoverable, and the existing planner already has a persisted preview with explicit Apply/Dismiss controls. Do not add Jev to every message or treat it as a second general-purpose assistant.

## What Jev actually is

Jevable is a gallery of projects built with Jev, not a single companion product or interaction model. Its useful recurring pattern is fast semantic judgment embedded inside an existing interface. The gallery currently presents examples such as adaptive forms, live journal signals, writing feedback and predictive interface actions: <https://jevable.com/>.

TypeSafe describes Jev as a System One model: the caller sends `state` and named typed questions, and receives constrained answers rather than generated prose. Choice returns a selected option, a probability distribution and confidence; Score returns a position on an authored rubric; Noul returns a yes probability. Independent questions over the same state can be batched in one request. Sources: [TypeSafe introduction](https://docs.typesafe.ai/introduction), [primitives](https://docs.typesafe.ai/primitives), [API reference](https://docs.typesafe.ai/api).

The model is not a text generator. TypeSafe explicitly recommends keeping arithmetic and invariants in code, limiting irrelevant state, treating state as potentially adversarial, and using a generative model when new wording or values must be created. Source: [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

OpenRouter serves Jev as a decisions model. The working route verified in this task was:

```text
POST https://openrouter.ai/api/alpha/decisions
model: typesafe/jev-1.13
```

The live response resolved to `typesafe/jev-1.13-20260917` from provider `TypeSafe`. The key came from the user's existing local SillyTavern secret store and was never printed, copied into source, bundled into an APK or exposed to the WebView.

## Small live evaluation

The evaluation used synthetic RPM tasks and blocks only. It did not send phone data or commit planner changes.

| Trial | Requests | Cases | Exact expected choice | Observed latency | Reported cost |
|---|---:|---:|---:|---:|---:|
| Straightforward grouping | 1 | 6 | 6/6 | 1,457 ms | $0.000109368 |
| Ambiguous/adversarial grouping, run 1 | 1 | 12 | 11/12 | 1,312 ms | $0.000163338 |
| Ambiguous/adversarial grouping, run 2 | 1 | 12 | 11/12 | 442 ms | $0.000163338 |

The repeated error grouped “Book a dentist appointment” under the broad Home result. Choice confidence was 0.60 and 0.48. A 0.65 confidence floor would withhold that error and leave it unsorted. It would also withhold some correct but uncertain suggestions, which is the safer tradeoff for a planning preview.

An attempted companion Noul question (“does any block clearly fit?”) contradicted several correct Choice results. This matches TypeSafe's warning that Choice confidence and Noul probabilities are not structurally interchangeable. The integration therefore uses one direct Choice per task, an explicit `keep_unsorted` option and a Choice-confidence floor; it does not add a Noul gate.

These synthetic checks establish API access and a plausible safety threshold, not real-world accuracy. Threshold calibration should use accepted/dismissed user previews over time before any broader use.

## Affected product contract

1. **Primary action:** “Sort with Jev” remains a secondary planner action under RPM blocks. It is not a destination and does not replace manual Move.
2. **Input boundary:** send only open unsorted task titles and the title/purpose of a bounded set of existing RPM blocks. Exclude conversations, memories, revisions, life documents, calendar data and raw history.
3. **Output boundary:** Jev may select only one supplied existing block or `keep_unsorted` for each supplied task. It cannot invent IDs, blocks, projects, purposes, schedules or task fields.
4. **Confidence:** suggestions below 0.65 stay unsorted. `keep_unsorted` always stays unsorted.
5. **State truth:** the network response creates a persisted preview only. Apply is the sole canonical mutation; Dismiss changes nothing. Existing guard snapshots and whole-operation Undo remain authoritative.
6. **Failure:** missing key, timeout, non-2xx response, malformed/partial answers, a changed store version or no existing blocks leaves every task untouched and names the recovery action.
7. **Presentation:** reuse the current sort-preview sheet. Show existing block headings and task titles, plus an authored note that unclear items stayed unsorted. Do not display model probabilities as correctness scores.
8. **Fallback:** keep Luna for Purpose and Goal ideas. Do not silently retry sorting through Luna because that could invent new blocks and changes the feature's contract.

## Verification contract

- Unit-test request minimization, exact candidate allowlisting, prompt-injection text as data, confidence withholding, partial/malformed responses and unexpected model IDs.
- Confirm the preview covers every selected task exactly once and creates no canonical change before Apply.
- Re-run sort-preview stale-guard, Dismiss, Apply and whole-operation Undo tests.
- Exercise missing key, offline/provider failure, no block, no task and changed-data paths.
- Build and lint the Android app. On the physical phone, inspect the preview, Apply/Dismiss/Undo and existing manual Move without clearing private app data.
- Never claim physical-device or live-log verification while ADB remains unauthorized.

## Rejected broader uses

- Replacing Luna chat: Jev cannot generate the assistant reply.
- Creating new RPM outcomes: Jev cannot generate a faithful new title or purpose.
- Date or reminder decisions: Jev's documented numeric/date limits conflict with RPM's local parser and scheduling safeguards.
- Personality, emotion or inferred memory: these add sensitive judgment without an established user benefit and are outside the bounded decision task.
- Predict-as-you-type calls: extra network churn and distracting UI do not address a demonstrated RPM problem.
