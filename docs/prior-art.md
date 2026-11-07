# Prior art

## Capture's model and a Jev decision step (2026-10-27)

**Measured** with `npm run capture:models` (the phone's Capture code, 14 phrases, one run each, saved under `.verify/capture-models/`):

| Model | Read | Median | Slowest | Sonnet redo | Wrong saves |
|---|---|---|---|---|---|
| Haiku 5.5, direct to Anthropic (the phone's path) | 14/14 | 1.9 s | 4.3 s | 0 | none seen |
| Mercury 3 | 14/14 | 2.5 s | 9.1 s | 1 | dropped times on messy phrases |
| MiniMax M3 | 14/14 | 2.5 s | 9.2 s | 2 | trashed "Call Raj" for "Get rid of the shower task" |
| GPT-6.1 Terra | 14/14 | 3.0 s | 5.2 s | 0 | none seen; asked what the garbled dinner ramble meant |
| Reflection Beam 1.0 (reasoning cannot be turned off) | 14/14 | 3.2 s | 22.1 s | 3 | twice used all 4,000 reply tokens on reasoning |
| GPT-6 Luna | 13/14 | 2.8 s | 25 s (timed out on the dinner ramble) | 0 | none seen |
| Jev Router | 13/14 | 7.3 s | 36.5 s | 2 | one time-out |
| Liquid LFM 2.5 (2.6B free, 2.6B paid, 24B) | smoke test only | 11–13 s | | every time | read the wrong item; ran out of tokens |

**Broader test, three setups** (`node scripts/capture-stress/setups.mjs`, 88 graded cases from the real, everyday, conversation, basic and smart sets, one run each, `.verify/capture-setups/broad-2026-10-27/`):

| Setup | Passed | First read, median / p90 | Backup calls (time) | Terra cost |
|---|---|---|---|---|
| Haiku, Sonnet backup (the phone) | 83/88 | 2.3 s / 5.1 s | 11 (2.3–5.9 s) | — |
| Terra only | 81/88 | 3.5 s / 4.6 s | 0 | $0.27 |
| Haiku, Terra backup | 81/88 | 2.4 s / 5.5 s | 10 (3.8–7.8 s) | $0.06 |

Terra lost 6 of 22 real phrases (merged "call mom" into Call Amma, split "Answer Kris and Aria", changed an existing Exercise) and won the clarification, follow-up and clock-edit cases Haiku failed. As a backup it was slower than Sonnet. Two-case gaps are inside one-run noise.

**Verdict: keep Haiku direct.** No tested model is faster on the phone's path, and the two close ones break our safety checks more often.

**Jev (TypeSafe's decision model)** answers typed questions (choice, yes/no, score) with probabilities, without writing text. A three-question prototype on the same phrases took a median of 0.81 s and about $0.00003 a call. Message kind was sensible on 13 of 14 phrases; "must ask first" and "draft matches" were not usable without tuned thresholds. Projects read: jev-cookbook (median 391 ms), laya-jev-lab (median 525 ms), HA-Jev (one call, many questions), reflex and jev-preflight (check after the work), jcm-router, switchboard, prismhq/jev-router, LiteLLM (route before the call, 2.5–5 s timeouts, no measured gain).

A second prototype let Jev label each part of the phrase (task, detail, question, change, filler; alert; what each time means) while `chrono-node` and a duration pattern read the times in code. One Jev call per phrase, median 0.83 s. It got all 7 clean phrases right, labelled questions and changes correctly, and turned both messy dictations into garbage titles.

**ScaleDown Extract** (non-generative span extractor on OpenRouter, probed 27 Oct with title, time, duration, reminder and question fields): median 1.45 s, one call 21.8 s. Right on the clean phrases (shower, call mom plus buy milk, exercise 30 min, buy milk plus clear the table); returned nothing for "Answer Kris and Aria", "Task from 12 am to 1210", "Done" and "Get rid of the shower task". Over the network it is not much faster than Haiku, which does the whole job. Xing4.0-29B-Intent exists (Hugging Face weights; only the general Xing4.0 is on OpenRouter) and is too large for the phone.

**Verdict: borrow later, not now.** A routing step before every call adds 0.3–1 s and only saves the failed first call, so it pays off only if many captures need a redo; none have since 0.34. The useful shape is a check on the draft that runs only when a local check fails, before any Sonnet redo, with thresholds tuned on a labelled set of real phrases.

## Quick add's date reading (`parseWhen`, 2026-10-26)

**Considered:** chrono-node 2.10.1. It is already in `package.json`, `cli/interpret.mjs` uses it, and it is already inside `runtime.js`, so the planner could import it with no new asset. Super Productivity (MIT) bases its quick add on it.

**Verdict: skip for now; keep the small parser in `planner/task-values.mjs`.** Measured on the quick add tests (`android-companion/parse-when.test.mjs`, `task-fields.test.mjs`), plain `chrono.parse(text, now, {forwardDate: true})` gets 5 of 22 cases wrong:

| Title | chrono-node | Quick add wants |
|---|---|---|
| "I sat the exam", "sun cream" | Saturday, Sunday | nothing |
| "march on the capital" | 1 March | nothing |
| "call at 8" | 8:00 AM | nothing (no am/pm) |
| "Weekly review saturday" on a Saturday | today | next Saturday (as Todoist reads it) |
| "Dinner tonight" | 10:00 PM | 7:00 PM |

A chrono wrapper would need a filter for each row, which is about as much code as the parser it replaces. The highlight already uses the parser's own `start` and `end` offsets, so chrono gives no gain there. Revisit if quick add must read dates such as "next week", "in 3 days" or "Nov 4": chrono reads those, and the small parser does not.

## 2026-10-26 · Capture, notch swipe, quick add, desktop website

Grok sweeps run as T3 sub-agents. Stars and dates are as Grok read them on 2026-10-26.

| Need | Found | Verdict |
|---|---|---|
| Time ranges in Capture ("12 am to 1210", a range already running, "now for 30 min") | chrono-node (MIT), already our parser in `cli/interpret.mjs`; Microsoft Recognizers-Text (MIT, JS build 3 years old); Sherlock (MIT, stale since 2023) | Keep chrono. It reads "12 am to 1210" as 00:00–12:10 (Grok measured), so we normalise a 4-digit end to the start's meridiem and start a running range now. Skip the others. |
| No slow repair loop for model output | BAML schema-aligned parse (Apache-2.0); partial-json-parser-js (MIT); jsonrepair (ISC); Outlines, llguidance, xgrammar (need the model host) | Borrow later for streaming Capture (BACKLOG 2026-10-22). Today we drop an unsupported time and save instead of a Sonnet repair. Constrained decoding does not fit a hosted API. |
| Dedupe extracted tasks against saved ones | Fuse.js (Apache-2.0); no task-specific library | Skip for now. Exact normalised title (and day) is stricter and safer than fuzzy matching for "Already on your list". |
| Collapsed notch pill swipe-away at y=0 | Smart Island (GPL-3.0): 16dp collapsed swipe, 40×28dp minimum target, +16dp hit box below; Expressive Cutout (GPL-3.0): 90dp sideways dismiss, window hugs the pill; Islandify (MIT): flick at 2× slop or 500 px/s; AOSP eats ACTION_DOWN at y<1 | Borrow the numbers, not GPL source. Pill swipe up commits at 12dp; up, left and right mean Later. Possible next step: grow the pill's hit box below the status bar. |
| Quick add that parses words inline | Super Productivity short syntax (MIT): chrono offsets drive the highlight; Vikunja Quick Add Magic (AGPL); Tasks.org `@day` (GPL); highlightable-input (MIT) | Borrow Super Productivity's approach: parser spans drive the mirror highlight. Use our own chrono, no new dependency. |
| What "+" should do | Material 3 (one primary action per screen; a FAB menu holds only related actions), Material 2 speed dial (3–6 options), NN/g progressive disclosure | "+" adds a task. No stub or navigation options behind it. |
| Desktop website | Todoist and Linear key maps; tinykeys, hotkeys-js, ctxmenu (MIT); Material rail at 600dp; container queries | Own small key map and menu, one action list per row driving hover, right-click and keys. Layout switches on the planner column's width. |
| Phone-only writer, web sends commands | Replicache (archived), PowerSync queue, Automerge, Jazz, Evolu, Triplit: all multi-writer | Skip. Our Convex command queue already fits; borrow the "N waiting for the phone" count. |

## Voice latency for an always-on Gemini Live session (2026-10-31)

Sources: ~/.cache/voice-research/{labs,frameworks,gemini-live}.md (primary docs and framework source, cited there).

| Prior art | Verdict | Why |
|---|---|---|
| LiveKit Agents Google realtime plugin: session resumption handle kept and forwarded on reconnect (`realtime_api.py` 1001-1007, 1240-1246) | Borrow | Same pattern keeps our one socket alive past the ~10 min connection limit |
| Pipecat Gemini Live service: `SessionResumptionConfig`, `_reconnect` with handle, WHEN_IDLE/SILENT scheduling (`gemini_live/llm.py`) | Borrow | Reconnect on goAway; tool result scheduling |
| LiveKit `prewarm_fnc` | Borrow (idea) | Mint and connect before the user speaks; the tap only unmutes |
| LiveKit turn detector, Pipecat smart-turn | Skip | Ignored with server turn detection; a second detector only adds a wait |
| Gemini automatic activity detection, END_SENSITIVITY_HIGH, silenceDurationMs 500 | Adopt | Measured first tool 0.04-0.7 s after speech ends vs 2.7 s after Stop today |
| Gemini sliding-window compression + session resumption | Adopt | Session longer than 15 min; resume for 2 h |
| ElevenLabs filler after a wait; web console clears the audio queue on `interrupted` | Borrow | Local earcon on toolCall; barge-in stops our speaker |
| OpenAI WebRTC/WARP, Deepgram Flux early tools, cascaded ~100 ms TTS | Skip | Needs another provider; user keeps Gemini Live |
| gemini-3.5-transcribe-live in a second session | Maybe | Measured interim words 1.4 s into a clip; doubles audio input cost |
