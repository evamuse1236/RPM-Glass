# How the notch moves

The island should feel alive the way Apple's Dynamic Island does: it has elastic mass, it follows the finger, and its
content changes in place instead of blinking. This page lists each motion detail, why it exists, the numbers, and the
Reduce Motion path. `docs/notch/motion-prototype.html` plays every detail at 384dp, with a Reduce Motion switch.

## Apple's rules (primary sources)

- "Live Activities use system and custom animations with a maximum duration of two seconds." (HIG, Live Activities)
- "Preserve as much of the existing layout as possible by animating existing elements to their new positions rather
  than removing them." Use "numeric content transitions" for numbers. (HIG, Live Activities)
- The island is "designed to feel like a living organism, with a deliberate elasticity". (WWDC23 10194, Design dynamic
  Live Activities)
- A spring is a duration and a bounce. Bounce 0.15 feels brisk, 0.3 noticeably bouncy, and over 0.4 is too much. A
  spring starts with the gesture's velocity, and retargeting keeps velocity. (WWDC23 10158, Animate with springs)
- "Don't add motion for the sake of adding motion." "Make motion optional." "Strive for realistic feedback motion that
  follows people's gestures." "Avoid adding motion to UI interactions that occur frequently." "Let people cancel
  motion." (HIG, Motion)

Our rules from these: every motion ends in under 400 ms (Apple's ceiling is 2 s), content moves instead of vanishing,
and no motion blocks a tap. Under Reduce Motion (Android "Remove animations", `ValueAnimator.areAnimatorsEnabled()`
false) shapes snap and content cross-fades over 150 ms.

## One spring

The island uses one spring everywhere: `Spring.DAMPING` 0.72 and `Spring.STIFFNESS` 520 (unit mass). In Apple's terms
that is a response of 2π/√520 = 276 ms and a bounce of 1 − 0.72 = 0.28, just under "noticeably bouncy". A step
overshoots by exp(−πζ/√(1−ζ²)) = 3.8%. The press, the drag and the opening morph all use it, so they feel like one
material.

## Details

| # | Detail | Trigger | Spring / curve | Duration | Reduce Motion | Class | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Elastic open | The island grows (pill to island, or island to a larger island) | The spring's closed-form step response (ζ 0.72, k 520), played by the morph's ValueAnimator; passes the target by 3.8% and settles | 350 ms | Size snaps | `Spring.Curve`, `IslandView.morphTo`, `IslandShape.morph` | Kept, new |
| 2 | Firm close | The island shrinks (back to the pill, or to a smaller island) | `IslandBand.STANDARD` cubic (0.2, 0, 0, 1), no bounce, so an undershoot can never show the camera hole | 300 ms | Size snaps | `IslandView.morphTo` | Kept, existing |
| 3 | Rows arrive in turn | A new face comes in | Each row of the face fades in and rises 8dp on the STANDARD curve, 30 ms after the row above it; up to 4 steps, the rest come with the 4th | 90 ms delay + 210 ms per row, 390 ms in all | One 150 ms cross-fade of the whole face, no rise | `IslandView.swap`, `NotchMotion.rowDelayMs` | Kept, new |
| 4 | Odometer digits | The band's value changes ("9m" to "10m") | Each changed digit rolls up on STANDARD; the rightmost changed digit starts first and each place to its left 40 ms later, up to 3 places | 250 ms + 80 ms stagger = 330 ms | Old value fades out while the new one fades in, 150 ms | `IslandBand.drawValue`, `NotchMotion.rollDelayMs` | Kept, stagger new |
| 5 | Rubber-band pull | The finger drags the open island up or down | Resistance curve d·(1 − 1/(x·c/d + 1)), d = 28dp, c = 0.35 up and 0.117 down: follows at 0.35 near the start and stiffens toward 28dp instead of hitting a hard stop | Live with the finger | The island stays put | `IslandGesture.pull` | Kept, new |
| 6 | Release keeps velocity | The finger lifts after a drag | The drag spring (ζ 0.72, k 520) starts with the finger's last speed, capped at 600 dp/s | About 250 ms to rest | Snaps home | `IslandView.follow`, `IslandView.letGo` | Kept, new |
| 7 | Threshold tick | An upward drag passes the close point (24dp) | Haptic only: `GESTURE_THRESHOLD_ACTIVATE` on Android 14+, `CLOCK_TICK` before; once per crossing, and the release then skips its second buzz | Instant | Same haptic (haptics are not motion) | `IslandView.claim`, `IslandGesture.pastClose` | Kept, new |
| 8 | Content bloom | A new face comes in | Rows scale 0.96 to 1 with their fade | 210 ms | None | — | Cut: faces already scale with the island body (`scaleFaces`), so a second scale fights it and reads as busy |
| 9 | Blur in | A new face comes in | Gaussian blur 6px to 0 | 210 ms | None | — | Cut: `RenderEffect` needs Android 12+, allocates per frame, and costs GPU on an always-on overlay |
| 10 | Squash and stretch | The island morphs | Width narrows while height grows, then rebounds | 350 ms | None | — | Cut: the width-leads-height morph already reads as stretch; more is cartoonish |
| 11 | Idle breathing | The island rests | Slow 1.02 scale pulse | 3 s loop | None | — | Cut: the HIG says avoid sustained pulsing, and an always-on overlay must not redraw at rest (battery, "no idle redraws") |

## Details that were already there

- Press: the island shrinks to 0.97 on touch-down on the same spring, and comes back after at least 90 ms.
- Faces fade out over 90 ms and the new one fades in from 8dp below.
- The band's ring fills over 400 ms; the alarm ring pulses to 1.06 every 1.2 s while an alarm rings.
- Long press and committed swipes give a haptic.

## Window and taps

The overshoot of detail 1 stays inside the overlay window: while the island moves, the window is the union of the old
and new shapes plus the shadow margins (12dp at the sides, 16dp below), and the peak overshoot is at most 3.8% of the
size change. Faces never scale above 1 (`IslandShape.faceScale`). The window shrinks to the target only when the morph
ends (`NotchPill.onSettled`). Rows are clickable from the moment they are added, so the stagger never blocks a tap.
