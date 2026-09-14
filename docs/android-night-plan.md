# Frosted Night assistant

User-selected replacement, 2026-09-11. Source: `docs/references/frosted-night-widget.html`, preserved verbatim as reference data, not executable product logic.

## Contract

Replace Android's lavender pixel panel with the supplied dark, simple composition. Keep the butterfly launcher, real conversational engine, local records, API model, notification/alarms, existing permissions and keyboard-inset fix. Browser and legacy database remain unchanged. Do not carry over simulated voice/photo/focus/calendar actions or fake phone chrome/weather from the pasted demo.

Problems addressed: (1) visible tabs/header consume chat space; (2) whole-panel lavender container contradicts the new reference; (3) metadata/detail and old scroll-bottom dominate the current answer; (4) navigation should be secondary long-press actions; (5) current type does not match the reference.

FIRST VIEWPORT: one rounded dark assistant card, cyan status point, current real reply; separate horizontal suggestion chips; separate dark input pill with sparkle and white circular chevron. 372 × 370dp maximum compact host; no fabricated status bar/wallpaper. Use Plus Jakarta Sans and Space Grotesk bundled offline. Dark surfaces remain readable over light wallpaper; CSS frosting is not a claim that Android blurs other apps.

SIGNATURE INTERACTION: hold Send for 380ms to reveal labeled icon actions; release never submits. Tap blank Send or the info/menu icon is an accessible alternative. Destinations: Chat, Plans, Context, History. Actions: Settings, Expand/Compact, Minimize. Menu scrolls within available panel height, dismisses outside/Escape/Android Back, and does not discard draft. No hidden-only route to settings.

Latest answer is primary in compact Chat; previous messages are expandable inside the conversation, never deleted. Receipts retain current links, Undo, raw input, and actual native delivery state. Lists/settings inherit the dark palette. Busy animation only reflects a real request, with reduced-motion support.

Direction seed d09b93d8/index3 acknowledged; explicit supplied reference controls all visual and interaction decisions instead of a concept tournament. Code-led: no generated comp or new raster needed. Previous generated butterfly retained only for launcher; pixel garden no longer ships in the widget bundle.

Checks: build/lint, existing JS/native tests; emulator normal/keyboard/200% text; menu empty-input, long-press with draft/no accidental submit, tap/Escape/Back dismissal, all destinations, saved record, offline/error, and user-visible emulator. Finish with independent review and scoped Android design documentation. Physical phone remains unverified.
