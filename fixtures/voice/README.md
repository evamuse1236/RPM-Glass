# Voice timing fixtures

Five clips for `rpmctl voice-time`. Each JSON names the spoken phrase, WAV duration, and expected save. `needsSaved` is the plan that must already exist for the change and question clips.

WAVs are 16 kHz mono PCM from Microsoft Edge neural TTS (`edge-tts`, `en-US-JennyNeural`). Regenerate with `node scripts/voice-fixtures.mjs` (needs `edge-tts` on PATH and `ffmpeg`). Without them the script falls back to tone placeholders, which must not be used for Live timing.

`ramble` speaks the first ~70 words of `ramble.txt` (~24 s) so a timing suite stays near the prior 21 s ramble benchmark. The full monologue stays in `ramble.txt`.

`change` moves saved task 106, Call Amma, to tomorrow at 9 pm. `question` asks about saved task 202, Buy milk, and should not add a task.
