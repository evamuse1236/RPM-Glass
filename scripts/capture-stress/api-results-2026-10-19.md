# Capture API results, 19 October 2026

The real Anthropic API transport passed 46/50 full-corpus cases and 21/30 hardest-case repeats. These are strict deterministic results. A recovered invalid first response still fails a case. Both runs exercised the production Capture backend with seeded stores and no device.

| Workload | API transport | Historical CLI transport | API calls | API usage cost estimate |
| --- | ---: | ---: | ---: | ---: |
| Full corpus | 46/50 (92%) | 48/50 (96%) | 77 | $0.6233010 |
| Hardest ten, three repeats | 21/30 (70%) | 27/30 (90%) | 56 | $0.6836075 |
| Total | 67/80 | 75/80 | 133 | $1.3069085 |

The CLI figures come from [the recorded ramble fixes](../../docs/capture-rambles-fix.md). This historical comparison does not isolate the transport as the cause of a difference. The historical source fingerprint differs, and the CLI did not enforce the phone's output-token cap or thinking settings.

Both authorized commands ran once at concurrency 3. Every API call returned HTTP 200. No 429, 5xx, network timeout, missing usage or extra paid rerun occurred. Recorded usage is 1,821,271 input tokens and 192,353 output tokens, with zero cache-read or cache-write tokens. Cost is calculated from returned usage and [Anthropic's published rates](https://platform.claude.com/docs/en/about-claude/pricing), checked on 19 October 2026. It is an estimate, not an invoice.

## Timing and identity

These are call latencies in seconds, including response parsing and validation. Percentiles use nearest rank and include rejected calls. They exclude earlier capture persistence and later planner application. The long-route samples are all rejected Haiku first attempts; they are not successful-response latencies.

| Route | Full count | Full p50 / p95 | Hardest count | Hardest p50 / p95 |
| --- | ---: | ---: | ---: | ---: |
| Quick Haiku, none | 41 | 2.421 / 6.955 | 15 | 2.309 / 6.184 |
| Careful Haiku, high | 20 | 8.354 / 17.368 | 24 | 8.173 / 20.698 |
| Long Haiku, high | 2 | 26.351 / 26.666 | 6 | 26.376 / 28.739 |
| Hard Sonnet, high | 14 | 3.836 / 20.162 | 11 | 16.497 / 19.148 |

The model served was `claude-haiku-5-5` or `claude-sonnet-5-5`, matching the requested route. Full workload wall time was 188.852 seconds. Hardest workload wall time was 210.261 seconds. These observations do not establish native phone latency or a speedup over the CLI.

Both runs kept app-source fingerprint `deaf8ed18bc46c92b76a2c8ddc9114e0372a10e00d96947ffebfced202a782db` unchanged. Both used corpus fingerprint `31c95e46a44d665a7e6ca0d3ab679099b0bfad44899c1e253cdf54b1dc02ef63`. Their recorded checkout revision is base `286f3b9`; tooling was uncommitted during the runs. No app code changed in this task.

## Every failed case-run

| Workload | Case | Repeat | Observed failure |
| --- | --- | ---: | --- |
| Full | `nine-relative-times` | 1 | All nine proposals remain pending behind an AM/PM question; the checker expects immediate saves and 9 AM. |
| Full | `hinglish-kal-subah` | 1 | Saved two courier tasks instead of one, turning the desired parcel outcome into an extra action. |
| Full | `monologue-purifier` | 1 | Haiku returned an invalid response at exactly 6,000 output tokens; Sonnet recovered and saved the correct task. |
| Full | `monologue-loan` | 1 | Haiku returned an invalid response at exactly 6,000 output tokens; Sonnet recovered and saved the correct task. |
| Hardest | `nine-relative-times` | 1 | All nine proposals remain pending behind an AM/PM question; the strict checker fails. |
| Hardest | `nine-relative-times` | 2 | All nine proposals remain pending behind an AM/PM question; the strict checker fails. |
| Hardest | `nine-relative-times` | 3 | All nine proposals remain pending behind an AM/PM question; the strict checker fails. |
| Hardest | `monologue-purifier` | 1 | Haiku stopped at `max_tokens` with 6,000 output tokens; Sonnet recovered and saved the correct task. |
| Hardest | `monologue-purifier` | 2 | Haiku stopped at `max_tokens` with 6,000 output tokens; Sonnet recovered and saved the correct task. |
| Hardest | `monologue-purifier` | 3 | Haiku stopped at `max_tokens` with 6,000 output tokens; Sonnet recovered and saved the correct task. |
| Hardest | `monologue-loan` | 1 | Haiku stopped at `max_tokens` with 6,000 output tokens; Sonnet recovered and saved the correct task. |
| Hardest | `monologue-loan` | 2 | Haiku stopped at `max_tokens` with 6,000 output tokens; Sonnet recovered and saved the correct task. |
| Hardest | `monologue-loan` | 3 | Haiku stopped at `max_tokens` with 6,000 output tokens; Sonnet recovered and saved the correct task. |

The checker labels the eight rejected monologue attempts `transport error` because they have no parsed output. They are HTTP-successful, incomplete model responses, not network failures. All eight eventually saved the requested canonical task. All four nine-item failures retain their proposals and exact words. The unclear phrase is `tomorrow at nine`, so asking AM/PM is justified; the checker assumes 9 AM and forbids a question. This known expectation mismatch was retained.

Capture defects found, left unfixed:

- `hinglish-kal-subah` saved both `Phone the courier about the parcel` and `Close the parcel issue with the courier`. The latter duplicates the call's purpose as another task.
- The long Haiku high route's 6,000-token budget did not finish either monologue. Every attempt required Sonnet repair, despite eventual correct saved state. The six hardest repeats explicitly record `stopReason: max_tokens`; the full run predates that metadata and records the same token count plus `INVALID_MODEL_RESPONSE`.

## Body receipts and Undo

All three body cases passed against the API. The following quotes join the backend's returned `verb` and `title` fields for readability. They are receipt fields, not model-written claims.

| Case | Backend receipt text | Saved state | Undo verification |
| --- | --- | --- | --- |
| `water-two-glasses` | "Logged" / "2 glasses of water" | Two new glasses, no task | Restored exact prior body and task state. |
| `skip-lunch` | "Skipped" / "Lunch" | Lunch recorded as skipped, no task | Restored exact prior body and task state. |
| `water-and-task` | "Logged" / "2 glasses of water"; "Added" / "Refill the water bottle" | Two glasses and the task today at 2 PM | One Undo restored both changes. |

Each returned a nonempty Undo ID. Undo was driven through `createCaptureAgent` on a separate file-backed copy of the actual API-generated store. Assertions compared the entire body and task list to the pre-turn state and confirmed exact captured words remained. No model was called. Every Undo returned `status: undone` and the receipt `Undone. The previous state is restored.` Original workload stores were preserved.

## Request parity and limits

The transport reuses the target's production prompt, Messages API body builder, provider schema, response parser and four route settings. Fake-fetch tests compare each route's body with the phone's `nativeModelTransport`. Headers and redirect behavior match Java. API mode skips CLI version lookup and isolation probing. It performs no OpenRouter fallback.

The full run exposed one tooling difference: invalid response errors initially used a generic safe message, so the two truncated-response Sonnet repairs received a generic hint instead of the phone's local validation message. That run is retained unchanged. Before the hardest run, the transport was corrected to preserve the local validation message with credentials redacted and to record allowlisted stop reasons. A regression test compares the incomplete-response repair hint with the phone parser. Independent review accepted the correction. First-attempt bodies in the full run and all route settings were already aligned. Do not interpret the full run as exact repair-message parity.

Plain Node fetch cannot duplicate Java's separate 8-second connect and 95-second per-read timers. It enforces the same effective route deadlines, capped at 95 seconds. The native WebView, Android sockets, OpenRouter fallback and UI remain **UNVERIFIED**. No emulator or phone was used.

`npm test` passed after the correction, including 690 JavaScript passes and one existing skip, seven rule tests, 16 cloud tests, cloud typecheck, 23 Java parser checks and ten native cancellation checks. All 26 stress-tooling fixture tests pass. The independent design and code review was GPT-only, single-family. Model the Domain shaped the explicit call record and route-table lookup; the production adapter continues to own request construction.

`npm run check:evidence` fails on inherited app changes relative to main because there is no matching new APK/device screenshot. This task changed tooling only. The user's no-device constraint was preserved. No native verification is claimed.

## Evidence

- [Full API report](../../.verify/capture-stress/2026-10-19T09-38-56-570Z/report.md) and [results](../../.verify/capture-stress/2026-10-19T09-38-56-570Z/results.json).
- [Hardest API report](../../.verify/capture-stress/2026-10-19T09-44-18-255Z/report.md) and [results](../../.verify/capture-stress/2026-10-19T09-44-18-255Z/results.json).
- [Combined accounting, failures and body Undo results](../../.verify/capture-stress/2026-10-19T09-38-56-570Z/comparison.json).
- [Water Undo state](../../.verify/capture-stress/2026-10-19T09-38-56-570Z/body-undo/water-two-glasses-1-1.json), [lunch Undo state](../../.verify/capture-stress/2026-10-19T09-38-56-570Z/body-undo/skip-lunch-1-1.json), [mixed Undo state](../../.verify/capture-stress/2026-10-19T09-38-56-570Z/body-undo/water-and-task-1-1.json).
- [Full test log](../../.verify/stress-api-audit/npm-test.log) and [offline result and Undo verifier](../../.verify/stress-api-audit/verify-api-results.mjs).

Detailed artifacts remain local under ignored `.verify/`. This committed record preserves their measurements and conclusions.
