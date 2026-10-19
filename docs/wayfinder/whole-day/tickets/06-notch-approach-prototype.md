# Which way can the notch actually be built on the Samsung phone?

Type: wayfinder:prototype (HITL) · Stream: notch · Status: open · Assignee: you (phone test) · Blocked by: none

## Question

Build two rough versions on the phone and compare: (a) an Android 16 Live Update (status-bar chip and Now Bar; reliable, but no colour control and no custom expanded view), (b) an accessibility-service overlay pill at the camera cutout (full control, sideload only, Play policy forbids it). Which one meets the notch decisions, or is a mix best?

Research so far: [notch-android-feasibility](../research/notch-android-feasibility.md).

## Spike result (2026-10-18, emulator only)

Branch `spike/notch-lab` (commit a3601b8), code only in `app/src/debug/`. Evidence: `.verify/evidence/2026-10-18T08-59-14/` in that worktree.

- Overlay pill (b): works. It draws a black pill above the status bar on an Android 16 emulator, with task name and minutes left (measured, screenshot 09).
- Live Update (a): the notification posts, but the emulator did not promote it to a status-bar chip. It may need Android 16 QPR1. On the Samsung phone: UNVERIFIED.
- `./gradlew assembleDebug lintDebug` passes. `scripts/build-debug.sh` fails on HEAD already (`OfflineTests.java:59`), not from this spike.

Recommendation: a mix. The overlay pill is the notch; a Live Update is the fallback when the accessibility service is off.

To close: install the debug build on the phone, turn on the RPM accessibility service, and check the pill sits on the camera cutout.

Prior art read 2026-10-18: [Atoll](../research/notch-atoll.md), [SmartIsland](../research/notch-smartisland.md).

## Round 2 (2026-10-18): prior art applied

Commit cb23fa3 on `spike/notch-lab`. Evidence: `.verify/evidence/2026-10-18T10-07-43/` (side-by-side with Atoll and SmartIsland: `19-ours-vs-reference.png`).

- Pill sits on the real cutout from window insets; the collapsed window is only the pill, so a tap 36 px beside it reaches the app below (measured).
- Priority: water shows 8 s, then the task returns; the second item becomes a separate black circle (split island).
- New look: pure black, panel hangs from the top edge, one hero row (tile, title, bar 20m / -25m, five bare controls), three small rows.
- Hides on the lock screen and in landscape. `assembleDebug lintDebug testDebugUnitTest` pass; 15 new JUnit tests.
- Seen by Claude: on the emulator the split island covers part of the status bar (a status icon shows between the two shapes). The emulator's cutout is larger than the S24 FE's, so the pill there is 51 dp tall; on the real phone: UNVERIFIED.
