# Always-on voice (contract, 2026-10-31, revised after review)

User decisions (2026-10-31): Gemini Live stays the voice and the brain and talks back. One session stays open until
the user hangs up, so they can keep adding things. Auto hang-up after 20 s of quiet. Live words while talking are
out of scope. Phone only: the website keeps today's one-ramble behaviour (`startVoice` option `continuous`).

Evidence: `docs/voice-latency-loop.md`, `docs/prior-art.md` (Voice latency section), `~/.cache/voice-research/*.md`.
Reviews: Grok (code) and Terra (Live API docs), 2026-10-31; their points are folded in below.

## Behaviour (phone, `continuous: true`)

1. The widget mic tap (or the Capture mic) opens one Live session. The mic records from the tap; audio is queued until
   `setupComplete`, then sent (already true). The setup is built from the loaded store (keep the `/api/state` wait).
2. No Stop. Automatic activity detection ends each user utterance:
   `realtimeInputConfig.automaticActivityDetection = {disabled: false, endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
   silenceDurationMs: 500}`. No `activityStart` / `activityEnd`; no 2 min talk timer. The prompt no longer says
   "They talk, then stop"; it says to answer every direct request with one short sentence.
3. Each request is its own ramble with its own `messageId`. Its working copy is cloned from the store after the
   previous request's save resolves (tool calls of a new request wait for that save). Tool calls run at once on the
   working copy and are answered at once (today's speed). The request is saved as one capture, one batch, one Undo on
   its final `turnComplete`: no tool call unanswered, and the server says the interaction is idle (not
   `NEED_MORE_INPUT` / `IN_PROGRESS`; check the exact field names in the Live API reference). Words are saved with it.
   A `toolCallCancellation` drops the named calls' ops (replay the rest with the same ids) before that save.
4. While a session is open the orb is "Hang up". Tapping it while Gemini speaks only cuts the speech (clears the
   speaker queue) and reopens the mic; a second tap hangs up. Hang-up, Capture hidden, or 20 s of quiet ends the
   session; a request in progress is saved first. Quiet means: the speaker is caught up, no tool call is unanswered,
   the server is idle, and the mic has heard no speech.
5. Echo: while the speaker's timeline is ahead of `currentTime`, uplink audio is replaced by nothing (not sent).
   `serverContent.interrupted` clears the speaker queue. Full duplex (talking over Gemini) is a later step, after
   the S24 FE echo test.
6. A short local sound (Web Audio, no asset file) plays when a request is saved.
7. `goAway` or a closed socket in an open session: save the request in progress, wait out `VoiceToken.GAP_MS`, mint a
   new token with a setup built from the current store, and continue. Never replay old audio. Session resumption
   handles and context compression are phase 2.
8. The receipt shows Discard only while `rambleUndoable` is true. Each request gets its own receipt; the session keeps
   listening below it.
9. Speech that gets no tool call and no answer before quiet ends: a visible "Didn't catch that. Try again." line
   (proactive audio on gemini-3.8-live can ignore input and cannot be turned off).

## Must stay true

- The key never reaches page code. `VoiceToken.check` accepts the new setup values and nothing wider; the token locks
  the exact setup the page sends.
- Every save goes through `platform.saveWith` (reload and retry). Words are saved before or with changes, never lost.
- The plan in the prompt (`liveSetup(now, tz, {data})`, <= 40 KB) stays.
- Errors reach the screen only through `userMessage`. Release builds carry no fake mic and no timing hooks.

## Proof

- Unit tests: two requests in one session give two captures, two batches, two working Undos; a tool call after the
  first audio of the same request lands in that request; cancellation drops ops; uplink is muted while the speaker
  plays; the idle timer waits for a pending tool and for playback; goAway reconnect saves first and does not replay
  audio; the website path is unchanged; the Java allowlist.
- `rpmctl voice-time --session two`: clip 1, wait for its receipt, clip 2, wait, hang up. Per request: speech end to
  tool call, to change on screen, to receipt, to first spoken audio. Cold and warm, 3 runs each.
- Real S24 FE: echo check (no turn from Gemini's own voice), one two-request run, `dumpsys package` version.

Done when, on the phone, the median from speech end to the change on screen is under 1.5 s for request 2, and under
2.5 s for request 1 on a warm start.
