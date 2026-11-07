# How Capture's AI works (27 Oct 2026)

What happens between pressing Send and seeing the saved rows, which models we call and how, and what each step costs in time. Measured numbers come from the phone traces and the test runs listed at the end. Everything else is read from the code; file paths are given so you can check.

## 1. The path of one capture

1. **Words are saved first.** The exact text goes into the store before anything else, so nothing is lost if the AI fails. (`intent-v2/src/harness.mjs`)
2. **Local readers try first, no AI.**
   - Quick answers ("what's next?") are answered from the store. (`quickAnswer` in `harness.mjs`)
   - Simple reminders and ranges ("Reminder in 5", "Task from 12 am to 1210") are read by code and saved in about 0 s. (`prepareRead` → `local.turn`)
   - A reply to an open "Which one?" question is matched by code. (`readChoiceReply`)
3. **An early read may already exist.** While you type, the app starts a model read after **900 ms** with no typing (`READ_IDLE_MS` in `android-companion/capture-forming.mjs`). If you press Send without changing the words, that read is reused and the model time is 0. Pressing Send right after typing, or dictating, starts a fresh call. (`intent-v2/src/preview-read.mjs`)
4. **The input is built.** One JSON object is sent as the user message. It holds `messageId`, `sourceUnits` (your words, split into numbered parts), `context`, `activeDraft` (a draft you are working on), `snapshot` (your saved tasks, Blocks and calendar around now) and `repair` (only on a second try). The calendar refresh runs at the same time as the model call. (`intent-v2/src/model-input.mjs`, `android-companion/capture-snapshot.mjs`)
5. **The routing policy picks the model and effort** (section 2).
6. **The model call** (section 3). The answer streams in; forming cards fill from complete titles and times as they arrive.
7. **Checks** (section 4). The reply must match the schema and pass meaning checks.
8. **Escalation or repair.** If Haiku's reply looks like a plan, or fails a check, one more call goes to Sonnet at high effort (section 5). At most one extra call per capture (`maxRepairCalls = 1`).
9. **Staging and save.** Operations are applied with a version check, one Undo is kept, and the reply line is built from what was actually saved. (`captureReply` in `intent-v2/src/model-policy.mjs`)

## 2. Models, routes and effort

All Capture calls use Claude. Source: `intent-v2/src/model-policy.mjs`.

| Route | Model | Effort | Time limit | Max output | Used when |
|---|---|---|---|---|---|
| quick | Haiku 5.5 | none (thinking off) | 25 s | 4,000 tokens | a normal capture or a question |
| careful | Haiku 5.5 | medium | 35 s | 6,000 | answering a question the app asked, a focused draft, a follow-up ("Done", "make that 6 pm") |
| long | Haiku 5.5 | none | 90 s | 16,000 | input of 1,500+ characters |
| longCareful | Haiku 5.5 | medium | 90 s | 16,000 | a long reply to a question or focused draft |
| hard | Sonnet 5.5 | high | 90 s | 16,000 | planning words ("plan my day", "prioritise", "should I", "suggest"), every repair, every escalation |

- Planning words are matched by one regular expression (`REPLAN_SORT_OR_ADVICE`).
- Follow-ups are found by `isContextualFollowUp` (`intent-v2/src/follow-up.mjs`).
- Mercury 3 is wired as an opt-in quick model (`QUICK_CAPTURE_MODEL`), off by default.
- GPT-6 Luna is used for planner suggestions, not Capture.

## 3. How the call is made

Source: `intent-v2/adapters/claude.mjs`, `intent-v2/adapters/transport.mjs`, `app/src/main/java/com/rpm/prototype/ModelGateway.java`, `ModelHttpClient.java`, `ModelStream.java`.

- **Service order:** Anthropic's API directly first. OpenRouter is tried once only if Anthropic has no key, refuses it (401/403), is busy (429) or fails (5xx). On OpenRouter, Claude is pinned to the providers Anthropic, Google and Azure.
- **Request (Anthropic):**
  - `system`: the Capture prompt, about **30.7 KB** (`intent-v2/prompts/intent-system.mjs`), marked `cache_control: ephemeral` (5-minute prompt cache).
  - `messages`: one user message holding the input JSON from step 4.
  - `output_config.format`: strict JSON schema (`TURN_SCHEMA`, about 3.9 KB, `intent-v2/src/schema.mjs`), so the reply is always valid JSON of that shape.
  - Effort "none" sends `thinking: {type: "disabled"}` for Haiku. Sonnet rejects that and gets `between_tools` instead.
  - `stream: true` when the phone supports it; streamed text only paints preview cards, and only the complete final object can save.
- **Connection:** one shared OkHttp client, warmed with a cheap request when Capture opens, so the TLS connection already exists at Send. The prompt cache is not warmed by that request.
- **The key never reaches the web code.** Java adds it natively.
- **Reply checks before parsing:** the answering model must be the one asked for, and the reply must have finished (`end_turn`). Otherwise it is treated as invalid.

### The reply shape

Top-level fields: `schemaVersion`, `mode` (capture, plan, query, reflect…), `draftMode`, `reply` (one short sentence), `decisions` (what each part of your words is: action, reflection, idea…), `operations`, `question`, `clarification`, `memoryCandidates`, `card`.

Each operation is a create, update, complete or delete of a task or other item. Each field inside it carries `name`, `op`, `value`, `origin` (stated or suggested) and `evidence` (the words that justify it). A typical reply for "call mom at 8pm and buy milk tomorrow":

```json
{"schemaVersion":1,"mode":"capture","draftMode":"new","reply":"Two tasks ready: a call to mom at 8 PM, and buying milk tomorrow.",
 "decisions":[{"sourceId":"s0","disposition":"action","note":null}],
 "operations":[
  {"opId":"op1","sourceId":"s0","kind":"create","entity":"task","targetId":null,"fields":[
    {"name":"title","op":"set","value":"Call mom","origin":"stated","evidence":"call mom"},
    {"name":"time","op":"set","value":"8pm","origin":"stated","evidence":"at 8pm"}]},
  {"opId":"op2","sourceId":"s0","kind":"create","entity":"task","targetId":null,"fields":[
    {"name":"title","op":"set","value":"Buy milk","origin":"stated","evidence":"buy milk"},
    {"name":"time","op":"set","value":"tomorrow","origin":"stated","evidence":"tomorrow"}]}],
 "question":null,"clarification":null,"memoryCandidates":[],"card":null}
```

The model returns times as your words ("8pm", "tomorrow"). Code turns them into dates; the model never computes a date.

## 4. Checks after the reply

- **Schema** (`validate` against `TURN_SCHEMA`).
- **Reading the output** (`readOutput`): every operation must come from an action part of your words, IDs must be stable and unique, a new item needs a title, a clarification must offer two to four choices.
- **Follow-ups** (`validateFollowUp`).
- **Times** (`validateIntentTimes`, `android-companion/intent-time-guard.mjs`): a time must match your words. A mismatch is `UNSUPPORTED_TIME`. `retainSupportedTimes` keeps the valid parts and drops only the bad time.
- **Removal safety:** nothing is removed unless your words asked for it (`NO_REMOVAL_INTENT`).

## 5. Escalation and repair

- **Escalation:** after a valid Haiku reply, if `mode` is `plan` or there are more than 3 changes to saved items, the policy asks Sonnet (high effort) once more and keeps Haiku's reply as the fallback.
- **Repair:** if Haiku's reply fails a check (not a network error or time-out), Sonnet gets one more try with the error text in `repair.validationError`.
- If the repair also fails, the valid parts are kept when possible. Otherwise the words stay saved with "needs attention" and a Retry.

## 6. Speed work already shipped (0.34, 27 Oct)

- Forming cards stay after Send and turn into the saved rows.
- One store load per capture (it was about 13).
- Calendar read in parallel with the model call.
- One warmed, reused HTTP client.
- Streaming, so cards fill as the answer arrives.

## 7. Measurements

### On the phone (S24 FE)

| Period | AI captures | Median | Slowest | Over 8 s |
|---|---|---|---|---|
| 18–26 Oct | 47 | 3.3 s | 22.0 s | 7 (5 were Sonnet repairs) |
| 27 Oct onward (0.34+) | 33 | 2.0 s | 4.5 s | 0 |

### Inside one Haiku call (73 calls, test run)

- Time ≈ **1.1 s fixed + 4.35 ms per output token** (r = 0.94), so about 230 tokens per second once writing starts.
- Median output 268 tokens; median call 2.3 s.
- Input per call: about **12,755 tokens read from cache** and about **3,000 uncached** (snapshot and words). Request about 42.6 KB.
- Reply JSON about 620 bytes; `operations` is about 250 of them.
- 11 Sonnet calls in 74 captures: **6 escalations where Haiku labelled a single edit `plan`** ("move groceries to Friday", "Move gym tomorrow to eight pm"), 5 invalid replies, 2 unsupported times.

### Model comparisons

See `docs/prior-art.md`, "Capture's model and a Jev decision step". In short: Haiku called directly is the fastest; Terra was 1.2 s slower and not more accurate overall on 88 graded cases; Mercury, MiniMax, Luna, Beam, Liquid and Jev Router were slower, less safe or both.

## 8. Known weak spots

- Single edits labelled `plan` go to Sonnet (adds 2–6 s).
- Each field repeats `origin` and `evidence`, and writing time grows with every token.
- Simple "thing + time" phrases still call the model.
- The early read waits for a 900 ms pause and does not run on dictation as it arrives.
- Small mechanical reply errors (missing title, repeated IDs, clarification shape) cost a full Sonnet call.
- Misheard dictation ("I need metal to thrive") fails on every model.
- A bare clock edit ("Move Call Raj to 7") fails the time check.

## 9. How to test

- Try Capture in a terminal: `npm run capture` (see `docs/capture-cli.md`).
- Compare models on 14 phrases: `npm run capture:models -- --models haiku,<openrouter id>` (`scripts/capture-stress/models.mjs`, phrases in `model-phrases.json`).
- Compare setups on graded cases: `node scripts/capture-stress/setups.mjs --setups haiku,terra,haiku+terra --sets real-2026-10-27,everyday` (`scripts/capture-stress/setups.mjs`).
- Both need keys: `secret run --env ANTHROPIC_API_KEY=anthropic --env OPENROUTER_API_KEY=openrouter-rpm -- <command>`.
- A Capture AI change must pass a live eval on the real-phrase corpus, judged against `main` on the same day (`AGENTS.md`).
- Phone traces: `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`, then read `localStorage["rpm-capture-traces"]` on `index.html`.

## Sources of the numbers

- Phone traces: read from the S24 FE on 27 Oct.
- `.verify/capture-setups/broad-2026-10-27/` (88 cases, three setups).
- `.verify/capture-models/*-2026-10-27/` (14-phrase model runs).
- `docs/capture-latency-2026-10-22.md` (first latency research).
