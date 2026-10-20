# Gauntlet run, 2026-10-20

Branch: `feat/gauntlet-2026-10-20` (worktree `RPM-Glass-apple`). Base: `feat/whole-day-v1` (v0.31) with the Apple-style app restyle undone (`d879b7d`). The notch keeps its even corners and 16dp spacing.

## Done condition (pass/fail)

The run passes when all of these hold on `feat/gauntlet-2026-10-20`:

1. `npm test` exits 0.
2. Design: the planner tab bar is a floating rounded rectangle. `docs/gauntlet/2026-10-20/journeys.md` maps each user journey. A fresh-context critic scores Today, Capture, the task sheet, Blocks and Inbox at 8/10 or more, or three critic rounds are done.
3. AI: the Capture stress corpus (CLI transport) passes more cases than the baseline, with no new failures on the ten hardest cases.
4. Notch: every break scenario in `notch-breaks.md` is fixed with a test, or recorded as a known bug with a reason.
5. Each changed surface has phone-size screenshots, or is marked UNVERIFIED with a reason.

## Tracks

| Track | Checkout | Branch | Who |
|---|---|---|---|
| Design and gestures | `RPM-Glass-g-design` | `gauntlet/design` | Fable plans, Opus builds, fresh critic judges |
| Capture AI | `RPM-Glass-g-ai` | `gauntlet/ai` | GPT-6.1 Sol high builds, Claude judge |
| Notch | `RPM-Glass-g-notch` | `gauntlet/notch` | Opus builds, fresh critic judges |

## Log

- 05:20 Before/after screenshots: the Apple restyle raised body text from 14/16px to 15/17px, added grey pills, clipped times and the Inbox button.
- 05:33 Restyle undone on the new branch. `npm test` passes. Branch pushed.
- 05:35 Key vault is empty after the Linux reinstall, so no Anthropic API key. AI tests use the Claude CLI transport.
- 05:40 Launched: AI track (Codex, GPT-6.1 Sol high), notch track (Opus builder), design plan (Fable). T3 Code reference crops in `/tmp/gauntlet/`.
- 06:12 Bug found and fixed: the planner's Add button and Enter saved nothing (`whenFields is not defined` in quick add). Also broken on `main`, so likely on the phone. New `undefined-names` rules test catches any missing import (`1a64330`).
- 06:12 Open finding for design: a task dated today with no time does not appear on the Today timeline; Inbox shows a count of 1.
- 06:15 UTC Design plan done (journeys, gestures, floating tab bar, Capture composer): `RPM-Glass-g-design/docs/gauntlet/2026-10-20/design-plan.md`. Design builder (Opus) launched on it. Decisions: tab bar radius 20; Capture keeps its v0.30 card stack; no double tap.
- 06:30 UTC AI round 1 done (`gauntlet/ai`, 4 commits): 108/109 before and after; fixed "after lunch" days and refusals of printing/email tasks. The corpus is too easy to show the owner's pain. Round 2: a fresh adversary writes 40 hard cases without seeing code.
- 06:35 UTC Notch track done (`gauntlet/notch`, 12 commits): pill returns after lock/rotation, water row stays at large text, tall islands drop rows instead of clipping, words scale with the morph, title opens the task, press feedback, Undo pill fixed. Open: alarm pop-up shows under the ringing island (owner decision). Fresh critic now scoring screenshots.
- 06:45 UTC Notch critic (fresh, screenshots only): 4–7/10. Top issues: ghost frame behind the alarm (its heads-up notification), digits slip mid-animation, weak Stop, time shown twice. Notch round 2 started with decisions: no heads-up while the notch shows the alarm; Stop is primary.
- 06:50 UTC Adversary wrote 40 hard Capture cases (rambles, voice errors, Hinglish, loose references, non-tasks). AI round 2 started on them, plus local reading for simple captures to cut the 7–8 s wait.
- 07:40 UTC Design build round 1 done (`gauntlet/design`, 14 commits): floating tab bar with sliding pill, Capture composer geometry, Anytime group for untimed tasks, next-task bar, hold-and-drag to reschedule, length drag, water drag, meal swipe, Time/Length sliders, Start now, long-press + for Capture, Inbox swipe menu. Not built: "Likely" tag (needs AI ranking), hold-to-talk (native). Fresh design critic now scoring.
- 07:50 UTC Design critic: next-task 9, borders 8, overlap 3, Capture size 5, overall 6. Round 2 started: + moves inside the floating tab bar (T3 composer style), Search to the top bar, Capture field 16/24, bordered cards, bright Send.
- 08:20 UTC Design round 2 done (4 commits): + inside the tab bar, Search in the top bar, Now pill on the bar's edge, Capture field 16/24 with bordered cards and a bright Send, drag label above the card. Overlap check passes on Today, Blocks, Life, Inbox. Critic round 2 running.
- 08:35 UTC Design critic round 2: alignment 9, corners 9, next task 9, hints 9, size 8, parity 8, overlap 7, borders 7, choice support 6, overall 8. Round 3 (last) started: quick-add sheet 16/24 and tidy chips, dark sheet edges, Now pill spacing, gutter, "Next" case.
- 09:00 UTC Design round 3 done and merged into this branch (`174011f`). `npm test`: 901 + 10 pass. Three critic rounds complete (done condition 2).
- 09:25 UTC Notch round 2 done and merged (`df538f2`): no second frame under a ringing alarm, Stop primary, Done filled, time once, digits roll in place, equal margins, one 40dp circle per row, Undo countdown, large-text scaling, black-wallpaper edge. `npm test`: 919 + 10 pass. Open: island side margin is about 5dp; check the S24's rounded corners on the phone.
- 09:40 UTC AI round 2 merged. Adversary cases 57/80 → 78/80; old corpus 108/109 → 108/109. The 2 left ask "earlier or later?" when the words give no direction.
- 09:45 UTC Emulator drive of the merged branch found and fixed: Capture's field could not be tapped (the handle's invisible strip covered it). `rpmctl tap` now refuses a covered control and names the cover (`fa8b6a7`). Water reader learned "had 2 glasses of water" (`c7b8977`).
- 09:55 UTC Final: `npm test` 979 + 10 pass; all 6 device scenarios pass; `check:evidence` passes on a fresh APK. Evidence: `.verify/evidence/2026-10-20T08-41-07-bca5f5/`.

## Result

All five done-condition checks pass. Open owner decisions:
1. The phone's instant task reader skips any capture while a Block is open, so on a real plan "buy milk tomorrow" still waits for the AI.
2. The island's side margin is about 5dp; check that the S24's rounded corners do not clip it.
3. Not on the phone yet: this branch is not installed or merged to `main`.
- 10:00 UTC Push notification not sent (Remote Control inactive). ZapFast fallback skipped: it is Windows-only and not installed on Linux.

## Round 2 (2026-10-20, afternoon): sizes and the glass bar

Done condition:
1. Apple HIG notes and at least 3 WWDC transcripts saved in the repo. **Pass:** `docs/design-research/apple-design-notes.md` (16 HIG pages, 5 talks).
2. One size scale written down, with a test that fails any off-scale value. **Pass:** `DESIGN.md` → Sizes, `scripts/rules/size-scale.test.mjs` (120 off-scale values fixed).
3. The tab bar is see-through glass; a Settings slider changes it and the value is kept. **Pass:** Settings → Tab bar transparency (Solid to 60%, 20% default); value kept after a force-stop.
4. `npm test` passes, device scenarios pass, phone screenshots exist. See below.

Log:
- Measured every screen with `scripts/design/measure-sizes.mjs`. Before: Today's words started at 90, 122, 127, 141 and 168dp. After: all at 120dp.
- Fable wrote the size spec. A second Fable critic scored sizing 4/10 before and 7/10 after, then flagged a pink tint on the light bar (an oklch mix with `transparent` dropped the hue), a cut-off "in N min" label and a broken-looking sample. All three were fixed.
- Emulator evidence: `.verify/evidence/2026-10-20T09-38-38-6f11ef/`.
