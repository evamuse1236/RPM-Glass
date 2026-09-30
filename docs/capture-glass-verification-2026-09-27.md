# Capture glass implementation — 27 September 2026

## Implemented

Version 0.17-glass-capture restores a scoped tinted glass shell, cyan/violet ambient movement and visible waiting feedback. A completed response reveals once; the model transport still returns a complete reply. More sits beside the microphone and Send at the bottom. Holding Send for 380ms opens the same menu without sending, with movement cancellation. Open planner is pinned at the menu bottom above the composer; other destinations scroll when height is constrained.

The writing field uses its own full-width row on narrow screens and with enlarged text. More remains reachable while a request is busy. Drafts survive a planner round trip, failed sends retain the original words and retry identity, and Edit asks before replacing a different draft. Review-first saves and Undo are preserved. System text-size changes update the layout immediately. Reduced motion replaces the flowing feedback with a static state.

## Verification

- 398 JavaScript tests passed across Android, conversation, CLI and intent suites. Ten focused tests cover hold cancellation, click suppression, menu geometry and one-time reveal behavior.
- 73 native Capture fixture assertions passed on the owned Android emulator: actual touch gestures, keyboard navigation, busy navigation, exact draft recovery, retry identity, protected editing, both themes, open IME, 200% text and forced landscape. Screenshots cover 17 states. Model responses were synthetic; no paid inference was required.
- 28 native parser/preview/Add/Undo checks passed at 100% and 200% text, including matching planned time and duration and preservation of original wording.
- 63 native companion and 38 native offline checks passed.
- Android debug APK, test APK and lint build passed. Scoped token checks pass, including composited text and control-outline contrast over black and white backdrops. Planner styles, tokens and markup match their pre-task SHA-256 hashes. Concurrent planner/parser changes were preserved and included in the final package.
- APK signature verified; the certificate matches the previous build. Version code 17, version name `0.17-glass-capture`, package `com.rpm.prototype`.

Build SHA-256: `efcce0df30201a8145cfda8ee74b2426f3fa5cb5d82416089a7eaa7651e10da7`. Signature certificate SHA-256: `525fee39663b1984f55e3f7367eb783968166009a0210293bc4b0b4e8fb00bf1`.

Evidence is in `output/capture-glass-2026-09-27/`. Native UI runner: `scripts/check-capture-glass.mjs`. It requires a backed-up owned emulator and uses synthetic state. The first parser regression was blocked by a menu deliberately left open by the preceding menu check; closing that fixture state and rerunning passed all 28 assertions.

## Completion

- The independent finish reviewer returned **ship** for the scored fixes: updated design authority, empty-state suppression, soft aurora boundaries and the follow-up metadata contrast correction. This was a verdict on the listed fixes, not a new whole-surface review. The documented provenance-text contrast is approximately 8.59:1; the waiting label also passes 4.5:1 against peak gradient colors.
- PRODUCT.md, DESIGN.md, `.impeccable/design.json` and the Capture section of the planner surface contract now describe the implemented glass system. No new raster assets were added.
- Packaged APK: `output/RPM-0.17-glass-capture.apk`. Its generated WebView assets match those in the signed APK. It was installed and exercised on the owned emulator during QA.
- All 61 original private emulator files were restored byte-for-byte, with zero missing, extra or changed files. Font, rotation and animation settings were restored; no app launch followed restoration. The emulator was shut down. Its retained package after the final restart is the earlier 0.16-time-ranges build; the new 0.17 artifact remains separately available above.
- Receipts: `output/capture-glass-2026-09-27/{artifact,asset-parity,restoration}.json`, `finish-review.md`, `finish-verdict.md`, `documentation-receipt.md`, and the final screenshots. The last waiting-label color adjustment was checked with targeted waiting/reduced-motion recaptures rather than repeating unrelated native journeys.

## Limits

This is implemented and tested on the owned emulator. It has not been installed on the physical phone. Physical-device animation smoothness, TalkBack, live-model latency and speech recognition were not retested. Existing planner/parser work remains in the working tree; no commit or push was made.
