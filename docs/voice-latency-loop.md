# Voice latency loop (2026-10-31)

Done when, on the S24 FE, the median of 5 runs is under 0.8 s from widget tap to Gemini listening
and under 1.5 s from Stop to the saved receipt. Stop early after 2 flat rounds or $3 of Gemini spend.

Command (emulator, fake mic): `node .claude/skills/verify-rpm-glass/rpmctl.mjs voice-time --fixture time --runs 5 [--warm]`

Command (phone, a person talks two requests, then taps Hang up or stays quiet 20 s):
`node .claude/skills/verify-rpm-glass/rpmctl.mjs voice-time --serial <phone> --human --session two`. On a phone voice-time
refuses `--store` and the fake mic and never resets the plan.

## Log

| Round | Device | Start | Mic on | Listening | Words trail | Stop to tool | Stop to receipt | Sessions |
|---|---|---|---|---|---|---|---|---|
| 0 baseline | emulator | cold | 0.58 s | 4.74 s | 2.66 s | 2.63 s | 7.99 s | 3 |
| 1 save at first spoken audio | emulator, seeded plan | cold | 0.72 s | 5.59 s | 3.13 s | 2.78 s (save 3.9 s) | 4.87 s (receipt swapped early) | 3 |
| 1 | emulator, seeded plan | warm | 0.19 s | 3.45 s | 1.86 s | 1.50 s | 2.43 s | 2 |
| 2 plan in the prompt, no get_plan round trip; live card kept, receipt at turn end | emulator, seeded plan | cold | 0.99 s | 5.48 s | 3.17 s | 2.70 s (= save; change on screen 2.71 s) | 6.78 s | 3 |

Always-on voice (`docs/voice-always-on.md`), `voice-time --session two`, emulator, seeded plan, medians of 3, from the end of each clip:

| Start | Listening | R1 tool | R1 change on screen | R1 receipt | R1 spoken | R2 tool | R2 change on screen | R2 receipt | R2 spoken | Sessions |
|---|---|---|---|---|---|---|---|---|---|---|
| cold | 5.86 s | 2.34 s | 2.35 s | 6.28 s | 3.05 s | 0.32 s | 0.33 s | 6.46 s | 1.17 s | 3 |
| warm | 4.32 s | 3.00 s | 3.01 s | 7.00 s | 3.79 s | 0.19 s | 0.20 s | 6.17 s | 1.01 s | 3 |

The receipt waits for the idle `turnComplete`, which arrives about 5 s after the first spoken audio.

Round 1's early receipt swap broke the rule that RPM's sentence streams into the live card; round 2 keeps the
live card and saves the batch at the first spoken audio instead, so the change is on screen and durable early.

Found on the way (not latency): Gemini heard "Alma" for "Amma" in 2 of 13 runs; once it rewrote the seeded
"Buy a birthday card for Amma" into "Call Amma" instead of adding a task.

Sessions used this loop: 16 (plus 15 from the earlier Grok run).

## State (2026-10-31, after round 2)

Changed, uncommitted, in this worktree:
- `voice-time` CLI: plain table, words trail (`voice:words` marks), `--warm`, `--store` (default: gauntlet seed,
  restored before every run without wiping prefs, so the Gemini key stays), receipt check that catches extra changes,
  "Stop to change on screen" (`voice:Trow`). Sub-marks `Ttoken0`, `Ttoken1`, `Topen`, `Tsave`.
- `voice-tools.mjs`: `liveSetup(now, tz, {data})` puts the plan in the prompt (<= 40 KB) and drops "Call get_plan first".
- `capture-voice.mjs`: saves the batch at the first spoken audio after a change (durable, one Undo); a later tool call
  replaces the batch; the receipt still swaps in at turn end.
- Java (Grok): `VoiceToken.warm()` HEAD to the Gemini host on Capture open. Not yet built into an APK; gain UNVERIFIED.

Keys: the vault entry `gemini` is refused from the PC ("API key not valid"); `gemini-api` works. The emulator holds
`gemini` and mints fine (maybe an Android-restricted key; guess).

Proposed 10x direction (waiting for the user's yes): phone-native recording from the widget tap, on-device live words,
a fast text model (or the existing text Capture pipeline) on the finished words, instant receipt, Gemini Live optional.
Prototypes running: Terra live-words probe (Gemini streaming transcription, live-transcribe model); Grok text-brain bench
(~/.cache/text-brain/bench.mjs). Not yet: on-device SpeechRecognizer on the real S24 FE.

## Direction (user, 2026-10-31)

Rejected: the local/text-brain design. Kept: Gemini Live as voice and brain; it talks back; the session stays open
without Stop so the user can keep adding things (automatic turn detection; Stop becomes hang-up).
Research running: labs' latency techniques (Grok, ~/.cache/voice-research/labs.md), framework source (LiveKit, Pipecat,
Google samples; Grok, frameworks.md), Gemini Live features with probes (Terra, gemini-live.md).
