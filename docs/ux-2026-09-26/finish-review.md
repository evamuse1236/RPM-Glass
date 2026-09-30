## verdict

Post-fix scoring of the three material findings from the full native finish review. The prior full review opened all 49 named current captures; this pass reopened `timeline-dark.png` and `timeline-top-dark.png`, opened `timeline-edge-cases-dark.png` and `settings-widgets-dark.png`, and inspected the associated source and updated contracts. All four targeted captures are valid. No new full-surface defect hunt was performed.

| Finding | Score | Evidence |
|---|---|---|
| 1. Short timeline cards lose task identity; Now label collides with hour labels | **Resolved** | The replacement timeline shows readable task titles in 30-minute cards. The additional controlled-clock capture shows title lines retained in overlapping 15/30-minute cards at 5:58 PM, with a single-line current-time label and no conflicting 18:00 label. `fitTimelineCard` is now called, titles do not shrink, metadata yields first, and the 72dp ruler reserves label space. The red line sits behind event cards. |
| 2. Ineffective transparency setting and success claim | **Resolved** | The Widgets capture shows text size and floating-butterfly controls with no transparency slider. The assistant schema no longer offers transparency, safe native state reports `captureBackground: Solid`, and the legacy native operation rejects the request instead of claiming success. Solid Capture remains intact. |
| 3. Stale persistent Android product/design contracts | **Resolved** | `DESIGN.md` and `PRODUCT.md` now name the purpose-first Planner and opaque Capture as current authority, record the implemented theme/type/layout rules and 372 × 460dp compact sizing, distinguish browser and native home-widget scopes, and mark the earlier pixel-garden/Frosted Night surfaces historical. Product verification boundaries explicitly distinguish synthetic/emulator checks from real-data migration, physical-phone behavior, TalkBack and live AI/speech. |

No regressions were identified within the three fix areas. Reported final validation is 58 targeted native UI assertions, 313 JS tests, native suites of 63 companion / 38 offline / 23 parser, and passing build/lint. Those checks were supplied by the parent and were not re-executed by this reviewer.

## remaining

Clear for the three scored fixes. This ship verdict covers the scored fixes, not the whole surface. Actual TalkBack, hardware haptics/motion, live model/speech quality, personal-phone installation and migration on a real-data copy remain outside the supplied verification evidence; this verdict does not claim those stages were completed.

disposition: ship
