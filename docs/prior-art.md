# Prior art

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
