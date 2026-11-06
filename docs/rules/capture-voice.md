# Voice agent rules and what enforces them

Rules for the phone's voice agent (Gemini Live): its prompt, tools, traces and eval. `capture.md` points here. Eval: `scripts/agent-rounds/voice-eval.mjs --audio` (see `scripts/agent-rounds/README.md`).

| Rule | Enforced by |
|---|---|
| Every saved voice request writes one capture trace (`kind: 'voice'`): words, reply, tool calls, what applied and the task IDs; Undo marks it `undone`. The saved capture keeps `taskIds` and receipt lines for the hub. | `android-companion/capture-voice.test.mjs` (`each saved voice request leaves one trace…`, `a saved voice capture names the tasks it touched…`) |
