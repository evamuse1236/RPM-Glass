# Atoll (macOS notch app): what to borrow (2026-10-18)

Source: Haiku scout read Ebullioscopic/Atoll @ 9d24aa2. Swift/SwiftUI, macOS, GPL v3: borrow ideas, never code.

- Two states only: closed (150×32) and open (640×200, width grows with tabs), plus a short "sneak peek" pop for brief events. `enums/generic.swift`, `sizing/matters.swift`.
- Motion: one bouncy spring, 0.4 s (`animations/drop.swift`); sneak peeks 0.3 s smooth.
- Hover opens after 0.3 s; leaving closes after a 100 ms debounce; reopening is blocked for 0.35 s after a close.
- One sneak-peek slot: the newest event wins, with a timeout per type (timer 10 s, default 1.5 s).
- The closed pill's second slot is first-match priority: timer, reminder, recording, focus, then others.
- Outside activities sort by priority, then arrival; at most 4; extras are rejected.
- An open panel holds a "do not auto-close" token while busy (for example, typing).

For RPM: a priority order for the compact pill (current task > water > meal > agent message), a per-type show time for nudges, a cap on what shows at once, and no auto-collapse while the meal field has focus.
