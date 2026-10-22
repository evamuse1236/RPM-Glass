# Capture gauntlet working notes

Work is confined to gauntlet/ai. No push or UI changes are authorized.

Assumptions set before fixes:
- The product clock is the runner's Monday 19 October 2026, 10 AM IST.
- A vague part of today saves today's date, without a made-up clock.
- Two saved gym sessions require a choice when neither is named.
- A date correction changes the last saved capture, preserving its clock.
- Moving a task to another day preserves its saved clock unless explicitly cleared.
- “After 5 today” excludes the item at exactly 5 and all other days.
- Unsupported message sending should explain the limit before offering a task.
- Completion and meal food must be checked in canonical storage.

The initial 87-case baseline had an apparent wall-clock discontinuity during three calls. Retain those failures. Use a fresh full widened-corpus baseline for the primary before/after comparison.

CI emulator testing requires a pushed commit. The explicit no-push instruction takes precedence. Try the local emulator and retain any launch failure without bypassing evidence checks.
