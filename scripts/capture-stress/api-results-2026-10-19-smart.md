# Capture intent and CLI results, 19 October 2026

Capture now saves `set a reminder in 5` as **Reminder at 10:05 AM**, from the fixed 10 AM test clock, and offers **Name it** afterwards. The final API run passed **58/60** strict corpus cases, compared with **54/60** before. The ten new cases passed **30/30** repeats. The two remaining strict failures are explained below; the checks were not weakened.

These are live Anthropic API tests of the phone's JavaScript Capture pipeline with local seeded stores. They do not prove phone networking, notification delivery or UI behavior.

## What caused the short-command failures

The baseline ran at `3bf9e2a`. The new corpus and its expectations were already present for that run. Both full runs use corpus SHA-256 `c0086c67573ac613ddf459dc4ef100adcc8472397b03f71d9478d09a84d8afef`.

| Request | Before | First failing boundary or observed behavior | Final repeats |
| --- | --- | --- | ---: |
| set a reminder in 5 | Fail | Haiku left the title unknown, which the interpreter rejected. Sonnet supplied Reminder and `in 5 minutes`; the time guard could not derive that clock from exact evidence `in 5`, so recovery removed the time and saved an undated task. | 3/3 |
| remind me in 5 | Fail | Haiku understood five minutes. `UNSUPPORTED_TIME` rejected it because the evidence had no unit. The repair also asked for a subject and offered unrelated dinner titles. | 3/3 |
| set a reminder in 5 mins to call mom | Pass | Explicit units and subject already survived interpretation, guard and apply. | 3/3 |
| alarm in 10 | Fail | The model asked which unrelated saved task should ring. It created no alarm task. The missing subject was treated as blocking. | 3/3 |
| remind me at 6 | Fail | The first question referenced no operation. Repair invented a dinner subject and mixed day choices with guessed AM/PM. The resulting draft waited with the wrong subject. | 3/3 |
| in 20 minutes remind me to drink water | Pass | A correctly timed reminder task, not a water-consumption log. | 3/3 |
| reminder tomorrow morning | Fail | The model turned a valid day-only phrase into an unknown clock and offered invented clock choices. | 3/3 |
| wake me up at 7 | Pass | The baseline correctly held a ringing alarm draft for AM/PM. Later diagnostic runs showed this was not reliable without deterministic completion. | 3/3 |
| 5 min baad yaad dilana | Pass | The existing parser already understood this relative phrase. | 3/3 |
| set a reminder in 2 hours | Pass | Explicit hours already worked and still take precedence. | 3/3 |

Each request has a committed before/after evidence file under [smart-evidence](smart-evidence/), including actual model outputs, word-free trace metadata, rejected stages, final operations, questions and saved timestamps. Start with [the original five-minute failure](smart-evidence/smart-bare-in-five.json). `smart-evidence.test.mjs` replays all ten original API outputs through the current Capture pipeline and corpus checks without paid calls. Full local inputs and stores remain under `.verify/capture-smart/before` and `.verify/capture-smart/final-full`.

## What changed

The CLI uses `createIntentService`, `createCaptureAgent`, the production provider transport, model policy, interpreter, guards, planner application and Undo. It adapts file storage and Node networking. It does not use the old DeepSeek workflow. `npm run cli` remains available separately.

The seeded local store persists across restarts. `--store` chooses another file and `--now` fixes the product clock. The CLI prints receipts, answer cards, typed numbered choices, optional receipt chips, model identity and elapsed wall time. `/undo`, `/state`, `/trace`, `/reset`, `/retry` and `/quit` work. With no key, words are still saved exactly. `/trace` and persisted CLI traces omit words, field values, model replies, error prose and keys. The private local planning store itself necessarily retains the user's words.

Standalone subjectless reminder commands get a bounded completion from their exact words after the model responds and before `interpretTurn`. This supplies a generic title, relative minutes or a proper AM/PM question. It does not handle named subjects, mixed requests or focused replies in place of the model. The trace labels this completion. Bare relative counts are normalized only for the owning reminder/alarm operation, including an update of a saved reminder. Another action cannot authorize the inference. The schema remains version 1, and existing stored captures remain readable.

One capability registry supplies the schema's operation vocabulary, entity fields and model-facing descriptions. The interpreter enforces the operation table. Tests also compile every described planner operation and check its destination. The registry distinguishes reminders from ringing alarms, recurring task habits from planner routine checklists, and read-only calendar events from RPM tasks. Unsupported requests retain a plain limitation and offer a supported task or planner action. A live WhatsApp request said RPM could not send the message and offered a task; no message was sent.

Receipt help stays outside blocking questions. A generic reminder offers Name it, bound to the saved task ID. A new undated task can offer a time when a complete calendar copy verifies the opening. Unknown task length uses a labelled 30-minute opening without saving an invented duration. A tap rechecks the target and calendar, and a consumed chip stays consumed after Undo. Without complete calendar coverage, no free-slot claim is made. `drank water` logs one glass and reads the saved daily count and next nudge through the existing water rules. The fixture already contains three glasses, so the live CLI receipt showed four of eight after that log.

Live driving and review exposed additional failures that were fixed with regression tests. Undo after an accepted clash restored a temporary internal approval as a pending proposal, blocking the next action. The adapter now excludes that temporary state from Undo. A closed choice could invent unrelated gym choices; bare selection replies now change nothing without an open question or focused draft. Capability wording now makes parents optional. A later sentence that restates one action with its method and time is explicitly interpreted as the same task. The three affected older cases passed 9/9 final API repeats.

CLI store ownership uses a Windows named pipe or Linux abstract socket, released by the operating system when the process exits. Tests cover simultaneous opens and killing a real owner process. This removes stale-lock deletion and its two-owner race. The IPC behavior is documented in [Node's net API](https://nodejs.org/api/net.html).

## Counts and cost

Final source is `b0d7772`; the full and repeated runs kept source fingerprint `33dea5e05099041bcc0ae58a53999bdd1cd401eb6bd41fb04c1ea4ed3c13c7a0` unchanged. All recorded runs were source-stable. No latency improvement is claimed. Several diagnostic workloads overlapped, and Node networking differs from Android.

| Workload | Passes | Model calls | Estimated USD |
| --- | ---: | ---: | ---: |
| Baseline full corpus, including new cases | 54/60 | 88 | 0.6688067 |
| Final full corpus | 58/60 | 81 | 0.4645477 |
| Final new cases, three repeats | 30/30 | 30 | 0.0489718 |
| Final older regressions, three repeats | 9/9 | 16 | 0.0667083 |

The six other diagnostic API runs were not discarded. They scored 16/30, 30/30, 58/60, 30/30, 56/60 and 30/30. The first 16/30 run demonstrated that prompt changes alone still produced optional naming questions and missing bare-clock drafts. [The complete ledger](smart-evidence/run-ledger.json) records every workload, fingerprint, failure class and cost.

All stress runs together used **502 model calls, estimated $2.5516631**. Live CLI reproductions and drives used **21 calls, estimated $0.0693504**. Total for this task was **523 calls, estimated $2.6210135**. Estimates use returned token usage and the existing harness's `apiCost` rates, including cache fields. They are not billing receipts. Final full/repeat runs had no transport failures or missing usage. No paid key appears in any artifact.

## Remaining strict failures

- `nine-relative-times` is also a baseline failure. The words say “tomorrow at nine” without AM/PM, while the checker expects a saved 9 AM task and forbids a question. Capture asks AM/PM, following the existing product rule; the current agent holds the whole nine-item draft while that question is open. The expectation and partial-application behavior were left unchanged.
- `goal-not-action` saved exactly one correct yearly goal, its purpose and year. The title was “Run 5 km without stopping”. The token-prefix checker requires `kilomet`, so it reports a lost goal and an invented one. This is a checker vocabulary mismatch, not an extra saved goal. The separate three repeats all passed without changing that checker.

## Verification and limits

`npm test` passed on Windows. The JS runner reported 748 passed and one existing skip out of 749 tests. Rule tests, 16 cloud tests, cloud typechecking, 23 Java parser/correction checks and ten native cancellation checks also passed. Single-family independent review passed after the ownership and choice fixes.

Local live evidence includes `.verify/capture-smart/cli-final-source.txt`, `cli-proof.txt`, `cli-verified.txt` and `cli-no-key.txt`, with their stores beside them. `npm-test-final-source.log` records the full checks. API reports are in `final-full/report.md`, `final-repeat/report.md` and `final-regressions/report.md` under that same directory.

Phone-side model paths, native fallback/network behavior, audible alarms, notification delivery, Samsung behavior and rendered UI at phone/enlarged-text sizes remain **UNVERIFIED**. No emulator, phone, APK build, install or widget verification was performed, as explicitly excluded by the brief. `npm run check:evidence` exits 1 because it requires a fresh APK and emulator screenshot. Its output is retained in `.verify/capture-smart/check-evidence-final.log`; that requirement was not bypassed. No emulator cleanup was needed because this task started none.

Work stayed in `feat/capture-smart` in the requested worktree. No merge or push was performed. The notch Java code, frontend styling and GitHub Actions workflow were untouched. [The CLI guide](../../docs/capture-cli.md) has the three commands to start testing.
