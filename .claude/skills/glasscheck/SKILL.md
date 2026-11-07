---
name: glasscheck
description: Audit RPM Glass on the real USB phone with a screen gallery, continuous video, and critical UI/UX findings. Use for phone walkthroughs, density and typography reviews, and examining transitions or visible stalls.
---

# Glasscheck

Examine the installed `com.rpm.prototype` build on the USB phone. Use the existing CLI from this repository's root; its implementation remains in `.claude/skills/phone-ux-audit/`.

This is a phone UX examination, separate from the build and emulator proof required by `verify-rpm-glass`. An audit does not authorize installing a different build, changing app data, or redesigning the app.

## Run

1. Call T3 `device_list`, then `device_open` on the requested physical phone. The usual device is the Samsung SM-S721B, serial `RZCY810547H`; verify it is connected. Keep the exact launcher, serial, config and session returned by `device_open` on agent-device commands. Prefer snapshot refs to coordinates.
2. Wake/unlock only if locked. Swipe when appropriate; leave a PIN to the user. Preserve existing drafts and app data. Avoid seeding, wiping or force-stopping. Below 15% battery, warn once and continue when USB charging.
3. Run the full tour unless the user requests a shorter pass:

   ```bash
   npm run phone:ux:full -- --serial <phone> --config <device_open-config> --session <device_open-session>
   ```

   Session arguments can auto-discover after `device_open`; explicit values keep the run pinned to the intended phone. FFmpeg (`ffmpeg` and `ffprobe`) is required for video validation.
4. Read the resulting manifest and inspect the evidence. A pass requires `ok: true`, all requested steps completed, empty `expectFails`, `actionFails`, `recoveryFails` and `evidenceFails`, and a passing `videoCheck` when recording. Recovery does not erase a failure. An interrupted run retains partial evidence and is incomplete.
5. Review representative PNGs and every screen relevant to the user's request. Watch the video at 1× for transitions and visible stalls; use the gallery's per-screen chapter links, paused frames and 0.5× playback for closer inspection. Write critical findings about density, type, hierarchy, sheet motion and navigation, grounded in those artifacts. A successful tour alone is not a UX verdict.

## Pace and coverage

- `npm run phone:ux` visits core surfaces plus water/meal/done receipts, Settings sounds/alerts, and a raw-adb notch pass. `npm run phone:ux:full` also covers detail sheets, Alert Reminder/Alarm chips, and all task tabs.
- `--hold-ms 1200` gives more reading time; `--hold-ms 0` removes reading holds for the quickest pass. Settling waits and video validation remain. The default recording hold is 600ms per captured screen.
- `--no-video` explicitly requests stills only. `--dry-run` lists the planned screens without driving the phone. `--no-notch` skips the Home notch pass.
- Coverage comes from the predefined tour, not automatic discovery of every possible app state. Water/meal/done and live reminder/alarm islands are **optional**: they capture when the phone's current store has a due target, otherwise they land in `optionalSkipped` and do not fail the run. Undo restores water and Done ticks when those steps hit.

Each captured surface gets a PNG and accessibility-text snapshot, alongside the continuous MP4. The gallery links each still to its transition and paused video frame. `chapters.vtt` provides chapter timestamps; `manifest.json` retains actions, failures and timings. Video validation decodes the recording and compares its final frame with the final screenshot.

### Notch, habits, alerts

The notch pill only appears when there is something to show: a **current or next task** and/or a **habit due now** (water first, else the due meal). With neither, the camera alone is correct — not a tour failure.

Automation (agent-device / T3) unbinds the RPM Notch accessibility service, so the pill is invisible during planner driving. After the planner steps, glasscheck presses Home, **rebinds** the service, reads `island drops task=… habit=…`, and uses raw `adb` taps on the S24 FE cutout geometry (`lib/notch-pass.mjs`) to capture:

- `n01` collapsed pill over the launcher (or empty status bar when nothing is due)
- `n02` task island when a task drop is present
- `n03` habit island when water or a meal is due
- `n04` habit action / Glass or Log meal receipt when that island opened
- `n05` reminder/alarm island **only if one is already firing**

In-app stills cover water log + Undo, meal sheet, Done + Undo, Alert Reminder/Alarm chips, and Settings · Sounds & alerts. Live reminder/alarm islands, full-screen `Time for your plan`, and audible alarm sound stay **UNVERIFIED** unless a scheduled alert fires during the pass. For gesture proof beyond the tour, use `verify-rpm-glass/features/notch.md`.

Android recordings omit repeated frames on static screens. Their duration can be shorter than wall time; frame rate is not a measurement of app rendering performance. Mark animation smoothness **UNVERIFIED** if you cannot actually inspect playback.

## Tour maintenance

If asked to improve or repair the audit, inspect [the tour](../../../.claude/skills/phone-ux-audit/lib/tour.mjs), [driver](../../../.claude/skills/phone-ux-audit/lib/agent-device.mjs), and [video/report checks](../../../.claude/skills/phone-ux-audit/lib/report.mjs). Distinguish selector drift from a product defect. Preserve fresh screen checks, meaningful failure status, original video motion and the user's app state. Verify a tour fix with another full phone pass; do not weaken an expectation to make it green.

For code changes, run the focused phone-audit tests, `npm test`, and `npm run check:evidence`. Follow the repository's additional proof requirements if app code changes. Keep CLI and workflow definitions shared between Claude and Codex rather than copying the implementation.

## Report

Link the absolute evidence directory, `gallery.html`, `full-run.mp4` when recorded, and PNGs supporting the top UX findings. Include elapsed seconds, failure lists, video validation and anything **UNVERIFIED**. Name any CLI/tour files changed. Commit only when asked.
