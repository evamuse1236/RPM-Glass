# Motion and refresh verification — 28 September 2026

Historical v21 result. The user subsequently reported remaining jank; [the v22/v23 follow-up](capture-motion-fit-verification-2026-09-28.md) records the GPU/layout repair and the final installed build.

**Implemented, tested, and installed over the existing phone app.** The physical Galaxy S24 FE (SM-S721B) runs `com.rpm.prototype`, versionCode **21**, versionName **0.21-fluid-motion**. The installed APK bytes match the final local artifact. Work remains on `codex/purpose-first-ux`; there was no commit, push or external APK publication. Existing shared planner, parser, model-routing and diagnostic changes remain in the build.

## Causes and resulting behavior

The v20 physical baseline replaced the Capture response five times for five unchanged phone-status reads. Status callbacks rendered unconditionally, overlapping callbacks repeated the same load, and calendar completion rebuilt Planner even when its rows were identical. Planner also assigned direction classes that had no animation rules; editors appeared and disappeared immediately. Capture changed the native WebView height outright.

The repair compares presentation-relevant state, shares overlapping refreshes and retains unchanged cards, navigation and settings pages. Date-sensitive draft actions and delivery changes still invalidate the UI. The comparison includes the active conversation's captures, including older conversations outside the global recent page. Open Details, scroll position and typed input survive a silent refresh.

There are now 220ms directional screen transitions, 240ms sheet entry, 160ms exit, response/notice feedback, and local press, selection and completion feedback. Superseded animation is cancelled; an old close callback cannot hide a newly opened editor. Buttons retain their full 48dp target while their icons respond to presses. Details and other controls use touch-action manipulation: the measured tap-to-click delay fell from 351ms in the failing Android trace to 17ms on the emulator and 2ms in the first physical check.

The visual check found a second, separate source of the refresh-like symptom. An intermediate candidate kept DOM nodes but a physical recording still caught a blank compositor frame while the **native WebView** changed height. The final implementation keeps that viewport stable and animates the **visible Capture panel inside it**. Native keyboard insets resize the available page area; Planner's toolbar stays fixed and its sheet remains above the IME. Tapping the transparent area above Capture still dismisses it. Expand and Compact remain available. The final recorded Capture expansion retained its visible card throughout the inspected frames.

Capture's first paint waits for its initial measurement instead of showing an interim loading-size window. A pending request retains the prior panel height. The original words, review-before-save behavior, Undo and durable composer storage remain. Android Remove animations and browser reduced-motion preferences disable motion.

## Verification

| Check | Result |
| --- | --- |
| JavaScript suites | **428 passed**, including refresh invalidation, coalescing and retry regressions |
| Java parser/corrections | **23 passed** |
| Android build, test APK and lint | Passed, JDK 17 / SDK 36 |
| Android integration on the owned emulator | **113 passed**: 61 companion, 14 diagnostics, 38 persistence/widget/reminder checks |
| Capture fixture journeys | **272 assertions across 31 layouts**, light/dark, normal/200% text, actual keyboard, short/long/error/saved/ambiguous/history/retry/Undo states |
| Motion regressions | **27 passed**, including stable native Capture viewport, intermediate panel sizes, silent refresh, all four tabs, sheets, rapid reopen, settings, reduced motion and doubled-text navigation |
| Planner keyboard layout | **8 checks** at normal and 200% text: actual IME, header/actions above it, and full-height restoration |
| Cold process recovery | **10 passed** for failed save, unsent/submitted words and ordered draft writes |
| Physical phone | **23 motion/refresh checks**, plus **6 final release checks** for pressed target size, Expand/Compact, outside dismissal, reopening and data preservation |
| Generated assets/signing | All **13** packaged companion files match generated assets; compatible signing confirmed |
| Visual evidence | Native emulator and phone recordings plus inspected frames and normal/enlarged-text screenshots |

Physical journeys use existing records read-only. No synthetic task or capture was created on the phone, no actual save/Undo was triggered there, and no paid model request was made in this motion repair. The two newer captures in the fresh phone backup had no recorded interpretation errors; the latest project was visibly saved. The earlier semantic failure diagnosis and four live model replays remain in [Capture response verification](capture-response-verification-2026-09-28.md).

The frame samples demonstrate real intermediate states and the removed blanking; they are not a guarantee of a sustained frame rate. Capture/History frame intervals were more variable than Planner navigation on the phone. The enlarged-text matrix was run on the owned emulator; phone font and animation preferences were retained. TalkBack, speech quality, audible alarms and new model performance were not part of this change.

## Installation and preservation

Fresh private backups preceded installation. The first update preserved all 57 existing private files byte-for-byte. A later candidate added one informational `app.start` diagnostic event; inspection confirmed no old diagnostic rows or settings changed. The stable-viewport update preserved all 56 files in its immediate snapshot; transient database files account for differing file counts. The final control-feedback build was installed with another full backup and a byte check of the actual installed APK.

Across install, launch, physical tests, recordings and the final release checks, the **202,519-byte canonical companion store stayed byte-identical**: version **105**, **16 entries**, **1 conversation**, **7 captures**, **4 drafts**. UID **10338**, compatible signing, stored credentials and app settings were preserved. The phone's original screen timeout (600000ms), font scale and animation scale were retained/restored. No diagnostic integration was newly activated.

- APK: `output/RPM-0.21-fluid-motion.apk`
- APK SHA-256: `0d6048fd68005aa0147b916aa28c6d74beb17994a59a4d444bf72dc4f56ce3be`
- Signing certificate SHA-256: `525fee39663b1984f55e3f7367eb783968166009a0210293bc4b0b4e8fb00bf1`
- Canonical store SHA-256: `b561f483d5b42352e5d0c5f8e7df50ed316962285018d1d3c6386e19f67ed917`

Logs, source hashes, fixtures and machine-readable assertions are in `output/motion-2026-09-28/`. Personal backups, captures and recordings are restricted to the mode-0700 `phone-private` directory, with mode-0600 files. No raw credential was printed or placed in a model prompt. The disposable emulator is stopped after checks; wireless ADB remains available.

The [motion contract](motion-plan-2026-09-28.md) extends the accepted Capture and Planner contracts. Native animation preference detection follows Android's [ValueAnimator.areAnimatorsEnabled documentation](https://developer.android.com/reference/android/animation/ValueAnimator#areAnimatorsEnabled()). Keyboard behavior uses actual native insets; Android's [keyboard animation guidance](https://developer.android.com/develop/ui/views/layout/sw-keyboard) informed the investigation, while the final WebView implementation animates page layout to avoid compositor invalidation.
