# SmartIsland (Android notch app): what to borrow (2026-10-18)

Source: Haiku scout read agupta07505/SmartIsland. Kotlin + Compose, minSdk 26, target 36, GPL v3: borrow ideas, never code.

It is the same approach as our spike: a `TYPE_ACCESSIBILITY_OVERLAY` window, with content from a NotificationListenerService.

- Position: user settings (x, y offset, width, height in dp; defaults 0/12/112/34). Its DisplayCutout detector exists but is never called.
- Touch: collapsed, only the pill rect takes touches (hidden `OnComputeInternalInsetsListener`, region insets); expanded, the full window. Fallback when reflection fails: shrink the window to the pill + 32 dp.
- Window: tiny when collapsed, full screen only when expanded; GONE when locked, landscape or idle. Skips `updateViewLayout` when nothing changed.
- Motion: size and corners spring (damping 0.72, stiffness 520); height 0.76/520; fade 190 ms; switching items squashes to 0.92 for 40 ms then springs back; tap bounce to 0.90; auto-collapse after 220 ms.
- Gestures: tap opens; tap outside closes; swipes on the pill; 300 ms hold with a 60 ms haptic.
- Keyboard: when replying, the window drops NOT_FOCUSABLE and uses ADJUST_RESIZE; pill gestures pause.
- Survival: every service callback is wrapped so a crash cannot disable the accessibility service; `onUnbind` returns true; the window is rebuilt on task removal.
- Lock screen: off by default; text redacted when shown.
- Samsung: brand rules and package lists; Shizuku for autostart and battery exemption.
