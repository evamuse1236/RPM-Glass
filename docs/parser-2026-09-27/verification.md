# Time-parser repair and verification — 27 September 2026

## Implemented behavior

The screenshot's `today from 2 pm to 3 pm` was rejected by an unconditional range check after Chrono had correctly found both endpoints. The draft still exposed Add because its action projection checked preview age, but not unresolved preview items.

Clear ranges now retain both endpoints and derive elapsed minutes locally. The same duration reaches Capture preview, planner save, calendar-overlap checks, CLI extraction/fallback, edits and confirmed alert setup. Supported examples include `2–3pm`, `between 2pm and 3pm`, spoken `from two to three pm`, 24-hour clocks and normal overnight ranges.

Ambiguous bare ranges, incomplete/invalid clocks, reversed or excessive ranges, conflicting/invalid durations, DST gaps and repeated wall clocks remain unscheduled for review. A stated offset can disambiguate a repeated wall clock. Calendar-only ranges do not invent start/end clock times. Recurrence remains a separate existing field.

Unresolved previews no longer offer Add, and a crafted commit action cannot bypass the review. Structured field corrections regenerate the preview. Clock-only corrections derive the saved day from either an existing instant or date-only value, preserving a future day while allowing an expired day to follow the existing next-occurrence rule. Raw captures, atomic saves and Undo remain intact. A locally derived range duration retains user-word provenance rather than being incorrectly marked unknown.

The Capture prompt now instructs extraction to preserve both range endpoints. Android's native model allowlist also accepts the explicitly requested GPT-6 Luna evaluation target; default Capture/Classic/planning model IDs remain GPT-5.6 Luna. The separate CLI remains DeepSeek V4.1 Flash.

## Checks completed

- **353 JavaScript tests passed**, spanning Android planning/services, Capture harness/adapter, conversation tools and CLI. Includes tests added before fixes, the exact screenshot scenario, duration conflicts, edits, stale/review controls, overlap review, evidence and Undo.
- **1,728 generated range cases** inside the parser suite: six timezones, all 24 hours, half-hour starting positions, three durations, and September/year-end boundaries. Separate named cases cover DST gaps/folds, overnight ranges, malformed endpoints, AM/PM ambiguity and explicit offsets. Passing means accepted ranges resolve correctly and intentionally ambiguous cases stay in review; it is not a claim to parse every natural-language phrase.
- **63 native companion checks passed** on the owned Android emulator.
- **28 native Capture assertions passed** at system font scales 1.0 and 2.0. Synthetic extraction fixture; real bundled local parser, field correction, native storage, Add touch target and Undo. Both scales showed the 60-minute preview, withheld Add for an unresolved range, preserved exact raw text, and restored entries through Undo. Visible action targets were at least 48dp, the sheet had no horizontal overflow, and Add remained reachable by scrolling at enlarged text. Screenshots were inspected.
- Android debug APK, test APK and lint build passed. `git diff --check` passed.
- **56 live model calls** were completed with synthetic input for the requested small reasoning comparison. See [model review](model-review.md) for the 49-call matched comparison, discarded-probe correction, provider-reported costs, quality failures and limitations. Live extraction output did not mutate the emulator's canonical plans.

Evidence: `output/parser-2026-09-27/javascript-tests.txt`, `android-build.txt`, `native-checks.json`, six PNG screenshots and `luna-sample/` results. Native fixture runner: [check-parser-capture.mjs](../../scripts/check-parser-capture.mjs). Model evaluator tests verify matched requests and reject incomplete ranges, invented AM/PM and empty tool operations.

## Artifact and restoration

- APK: `output/RPM-0.16-time-ranges.apk`
- Package: `com.rpm.prototype`; version code **16**, version name **0.16-time-ranges**.
- SHA-256: `a571b888dc207d0c2b5a4a78447a5933075ad4c6b621f33b469b38de0eb48a35`.
- Android signature verification passed. Certificate SHA-256 matches the preceding 0.15-purpose-first APK: `525fee39663b1984f55e3f7367eb783968166009a0210293bc4b0b4e8fb00bf1`.
- Installed and launched on the owned emulator. The previous purpose-first working changes were preserved in this build. No commit or push was made.
- All **61 original private emulator files** were restored byte-for-byte after testing, with zero extra files. The original font scale was restored. No app launch occurred after restoration; the emulator was shut down. Receipt: `output/parser-2026-09-27/restoration.json`.
- **Not installed on a physical phone.** Real Samsung speech recognition, TalkBack, audible alerts and physical-device model latency were not retested in this task.

## Reproduce

```bash
node --test android-companion/*.test.mjs chat-prototype/*.test.mjs cli/*.test.mjs intent-v2/test/*.test.mjs
bash scripts/build-debug.sh
```

For the native synthetic checks, back up the owned emulator first, install the built APK and test APK, open Capture and forward its debuggable WebView to port 9229. Run `node scripts/check-parser-capture.mjs`, then restore and verify the backup. The runner deliberately refuses a non-emulator serial. Live model evaluation is separately opt-in via `node scripts/compare-luna-native.mjs --run`; it bills the emulator's configured OpenRouter account and never extracts its key.
