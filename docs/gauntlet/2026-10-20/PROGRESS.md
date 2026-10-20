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
