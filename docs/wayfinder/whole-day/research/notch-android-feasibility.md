# Notch on Android: what the platform allows (scout, 2026-10-18)

Unverified on the Samsung phone. Labels: stated = from the source; inferred = scout's reasoning.

- **Live Updates (Android 16):** promoted ongoing notification shows a status-bar chip (icon + short text, max 96dp) and appears in Samsung's Now Bar (One UI 8 routes third-party apps through Live Updates, secondary). Needs `POST_PROMOTED_NOTIFICATIONS`, `setRequestPromotedOngoing`, no custom RemoteViews. No documented colour control or custom expanded view (inferred). https://developer.android.com/develop/ui/views/notifications/live-update
- **Plain overlay (`TYPE_APPLICATION_OVERLAY`):** always under the status bar (stated). Can't sit over the cutout. https://developer.android.com/about/versions/oreo/android-8.0-changes
- **Accessibility overlay:** how DynamicSpot-style apps draw a pill (community reports). Whether it covers the status bar is unverified. Play policy forbids non-accessibility use (stated), so sideload only. https://support.google.com/googleplay/android-developer/answer/10964491
- **Cutout position:** `WindowInsetsCompat.getDisplayCutout()`, API 28+ (stated). https://developer.android.com/develop/ui/views/layout/display-cutout
- **Open source:** nothing maintained found.
- **Scout verdict (inferred):** Live Update as the reliable base; accessibility overlay pill as the full-control option, tested on the device first.
