# Android butterfly companion

Confirmed 2026-09-11: build an installable APK, keep the conversational assistant, use Imagegen pixel-art butterfly artwork, float over other apps, use RPM notification reminders and Android ringing alarms. No microphone. Preserve the web prototype and all existing records.

Live refinements: active suggestion/clarification bubbles sit immediately above the composer; corners are rounded; the default panel is compact (330 × 420 dp max), with less internal whitespace and richer pixel-art garden imagery. These user refinements override the earlier stepped, larger-panel styling below. Keep 48 dp primary touch targets and a larger view when needed. A transparent full-window host measures IME/system insets and moves/resizes only the painted child panel above the keyboard.

## Implementation contract

- Reuse the tested JavaScript conversation/tool/date engine in bundled, offline-loadable WebView assets. Native Android owns private atomic storage, HTTPS OpenRouter calls, encrypted credentials, overlay permission and alert delivery. No desktop server or secrets in the APK.
- Keep the older Java screens/database available. New companion data is separate; desktop context may be imported explicitly, with a recoverable backup and alerts disarmed on import.
- One persistent, draggable butterfly opens a compact conversation over the current app. A visible foreground-service notification offers Hide. No invisible restart at boot or permission bypass.
- Clear multi-entry edits and Undo reconcile native schedules. Pending proposals never arm partial changes. Show requested versus scheduled, permission-needed, delivered and missed states honestly. Reminder timing may be delayed by Android; ringing alarms use AlarmManager alarm-clock scheduling with snooze/dismiss. No Calendar or other app writes.
- Preserve local drafts, original words, history, memories, archives, replies and whole pending batches. Internet is required only for AI interpretation.

## Direction contract

THESIS: A small pixel-game companion, not a dashboard. The butterfly is the recognizable entry point; the conversation remains the work surface.

OWN-WORLD: Midnight-indigo outlines, pale lavender/cream surfaces, lilac/pink butterfly pixels, rounded tactile game buttons and selected tabs. Readable proportional body text; pixel styling concentrates in artwork, chrome and short headings. No wallpaper replacement or invented fairy character.

STORY: Tap butterfly, speak by typing, see real saved changes and native delivery status, tap a choice or Undo. Inspect plans/context/history without leaving the assistant.

FIRST VIEWPORT: 64dp draggable butterfly over the user's existing app. Tap opens a lower-right compact panel (330 × 420dp maximum) with butterfly/name and minimize/expand controls, four labeled destinations, scrollable conversation and a persistent keyboard-safe composer. Expanded mode uses the available viewport; large system text automatically expands it. The butterfly hides over RPM's own screens.

FORM: User-pinned pixel-game/reference topology overrides direction seed cde1b6e6 (index 7). Direct implementation of supplied references with generated butterfly and pixel-garden assets; no unrelated concept tournament. Native phone first; preserve the browser's existing ivory/green system.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Acceptance

Build APK and lint; run existing 114 JS tests and Android integration tests. Emulator: launcher/overlay/open/hide, compact/expanded/keyboard/rotation, 200% text, real model turn, atomic clarification, notification, alarm firing/snooze/dismiss, cancellation and rescheduling, denied permissions, persistence/reboot and import disarmed. Synthetic data only; do not claim physical-phone/Samsung behavior or heard audio from a headless emulator.

## References

- User layout: `/tmp/codex-clipboard-b276cc9f-5eef-4795-ac78-677dc511b906.png`
- User butterfly palette/entry point: `/tmp/codex-clipboard-e9652bb4-6621-400b-b629-ac29fa82b798.png`
- Android: https://developer.android.com/develop/background-work/services/alarms
- Bridge security: https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges
- Foreground service: https://developer.android.com/develop/background-work/services/fgs/service-types#special-use
