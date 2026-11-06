# Capture wait after Send — research, 22 Oct 2026

Complaint: after Send, Capture takes too long to start working.

## Measured on the phone (S24 FE, 40 traces, 18–21 Oct)

- Normal model capture: 2.6–4.3 s total; model call 1.6–3.9 s; the rest (0.5–1.3 s) is phone work.
- Slow captures: 9.5–22 s. Haiku's answer failed a check (INVALID_OUTPUT or UNSUPPORTED_TIME) and a Sonnet high-effort repair added 6–17 s. 6 of ~30 model captures.
- Enter during a running preview read waits for that read (reuse works, but the wait stays).
- Read with: `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`, then evaluate `localStorage.getItem("rpm-capture-traces")` on the `index.html` page.

## Where the time goes (code reading)

1. At Send the forming cards and their chips disappear. One generic card ("Reading them now.") stays until the receipt: `capture-app.mjs:62-82`, `capture-forming.mjs:52`.
2. About 13 full store loads and 4 saves over the native bridge per message (store is ~430 KB): `harness.mjs`, `intent-service.mjs`, `capture-agent.mjs`. Inferred cause of the 0.5–1.3 s phone overhead.
3. Calendar read runs after the save, before the model call, not in parallel: `model-input.mjs:27`.
4. A new `HttpsURLConnection` per call, disconnected after: `ModelGateway.java:37-40`. No streaming. No warm-up when Capture opens.
5. An invalid preview read stays cached; Enter reuses it, fails, then repairs on Sonnet: `preview-read.mjs:63-69`, `harness.mjs:85,112`.
6. Preview reuse needs a 900 ms pause, no edits, plain wording. Enter right after typing, dictation, questions and planning words make fresh calls.

## Outside research (Grok + Haiku scouts, sources in the T3 thread)

- Haiku effort `none` is already set for quick captures.
- Prompt cache lives 5 min; a `max_tokens: 0` request warms it. 1 h TTL costs 2x on write.
- Streaming with `eager_input_streaming` can paint the first card before the JSON ends.
- Cold mobile connections in India cost 2–7 s before the first byte in one Jan 2026 test (not our phone).
- Todoist Ramble draws task cards while the person talks and saves on confirm.

## Fixes, ranked by felt wait removed

1. Keep the forming cards after Send and fill them in place; no blank "Reading" card.
2. Never wait on Sonnet repair: drop invalid preview reads; on a Haiku failure save with the locally read chips and repair in the background.
3. Pass the loaded store through one capture instead of ~13 loads; read the calendar in parallel.
4. One kept-alive HTTP client, warmed (connection + prompt cache) when Capture opens.
5. Stream the model answer so cards fill field by field.

## Haiku call anatomy, 27 Oct 2026 (measured, 73 Haiku calls, `.verify/capture-setups/broad-2026-10-27/haiku`)

- Time ≈ 1.1 s fixed + 4.35 ms per output token (r = 0.94). Median 268 output tokens, 2.3 s per call.
- Prompt cache works: 12,755 cached tokens per call; about 3,000 uncached (snapshot and input).
- Reply JSON averages about 620 bytes; `operations` is about 250 of them, mostly per-field `origin` and `evidence`.
- 11 Sonnet calls in 74 captures: 6 escalations because Haiku labelled a single edit `mode: plan` ("move groceries to Friday", "Move gym tomorrow to eight pm"), 5 invalid replies, 2 unsupported times.
