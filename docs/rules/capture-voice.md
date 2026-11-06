# Voice agent rules and what enforces them

Rules for the phone's voice agent (Gemini Live): its prompt, tools, traces and eval. `capture.md` points here. Eval: `scripts/agent-rounds/voice-eval.mjs --audio` (see `scripts/agent-rounds/README.md`).

| Rule | Enforced by |
|---|---|
| Every saved voice request writes one capture trace (`kind: 'voice'`): words, reply, tool calls, what applied and the task IDs; Undo marks it `undone`. The saved capture keeps `taskIds` and receipt lines for the hub. | `android-companion/capture-voice.test.mjs` (`each saved voice request leaves one trace…`, `a saved voice capture names the tasks it touched…`) |
| A voice title is the action alone: no filler, no time, day or alert word; a lone word or a fragment is not a request; recognition is biased to en-IN, hi-IN and mr-IN. A prompt change is kept only when it beats a same-day `main` run of `voice-eval.mjs --audio` on the real phrases. | `android-companion/voice-setup.test.mjs`; model behavior: `scripts/agent-rounds/voice-eval.mjs --audio` (live, judged against main) |
