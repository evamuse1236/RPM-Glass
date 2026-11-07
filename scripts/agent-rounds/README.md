# Voice agent eval

`voice-eval.mjs` scores the phone's voice agent on phrases. It uses the phone's own Live setup (`liveSetup`) and tools (`createRamble`) against a seeded test day, so nothing touches a real plan.

```sh
secret run --env GEMINI_API_KEY=gemini-api -- node scripts/agent-rounds/voice-eval.mjs --audio --cases scripts/agent-rounds/voice-cases.json --repeat 3
secret run --env GEMINI_API_KEY=gemini-api -- node scripts/agent-rounds/voice-eval.mjs --audio --cases scripts/agent-rounds/voice-cases.json --repo ../main-checkout --repeat 3
```

- `--audio` speaks each phrase with `edge-tts` and streams it like the phone's mic. Use it: sent as text, main passes almost every case, because the bad titles and noise turns come from what the audio model hears.
- `--repo` loads the agent from another checkout (for example a clean `main` worktree), so the branch and main run on the same phrases on the same day. The model is not deterministic; compare runs from the same day only.
- Cases: `kind` is `request` or `noise`. `expect.titles` lists the words each new task must have; `min` is the fewest tasks; `notime` means no clock time in any title; `lead` is the alert lead in minutes. A noise case passes when nothing changed. `voice` and `ttsText` override the TTS voice and words.
- `voice-cases.json` holds invented phrases. Real phrases from the phone stay private in `.verify/agent-rounds/` (git-ignored), because the repository is public.
- `telegram-cases.json` holds Telegram phrases (`expect.telegram`: `draft` {to, words, notStart} for the message sent, `sent`, `read`, `says`, `none`; `then` adds later turns in the same session). They run the real `telegramLink` against a fake bridge (`fakeBridge` in `voice-eval.mjs`) that never touches Telegram; its bots answer each sent message, so `says` checks the reply is read aloud. `main` has no Telegram tools, so judge these against the previous round, and judge `voice-cases.json` against `main`.
