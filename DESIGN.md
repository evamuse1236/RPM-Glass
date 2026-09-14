---
name: RPM Companion
description: Separate browser ivory-and-green and Android pixel-garden worlds for conversational planning and check-ins.
colors:
  stage: "#252d29"
  paper: "#e8e2d5"
  surface: "#f5f0e6"
  ink: "#252920"
  muted: "#606154"
  sage: "#d2d9c4"
  green: "#456347"
  line: "#c8c4b6"
  danger: "#943c2b"
  launcher-bg: "#cbd4b8"
  launcher-ink: "#283922"
  mark-ink: "#f4f0de"
  stage-header: "#b7c0b5"
  stage-title: "#f0eedf"
  stage-note: "#dee3d5"
  stage-note-muted: "#abb8a8"
  scrollbar: "#9a9e88"
  android-ink: "#292441"
  android-paper: "#eee4ec"
  android-lavender: "#d9c7e8"
  android-line: "#b9a7c3"
  android-accent: "#6c467d"
  android-panel-border: "#776087"
  android-header-ground: "#27253e"
  android-header-ink: "#fff5df"
  android-control: "#e5d5eced"
  android-control-ink: "#3e2d50"
  android-nav: "#e7dbec"
  android-selected: "#d9c3e8"
  android-user-bubble: "#d6c4e2"
  android-card: "#faf3ed"
  android-surface: "#fffaf0"
  android-choice: "#f4eadd"
  android-choice-first: "#dce4c7"
  android-entry-edge: "#9b80ac"
  android-metadata: "#645b69"
  android-composer-area: "#dfcfe6"
  android-control-line: "#706178"
  android-placeholder: "#706177"
  android-send: "#cba7de"
  android-focus: "#8956b0"
  android-delivery-ink: "#426239"
  android-delivery-surface: "#edf0df"
  android-native-paper: "#f7f0df"
  android-native-lavender: "#e4d8f1"
  android-native-line: "#6b527b"
  android-launcher: "#d9bdea"
typography:
  body: {fontFamily: "ui-rounded, \"Segoe UI\", system-ui, sans-serif", fontSize: "15px", fontWeight: 400, lineHeight: 1.5}
  stage-title: {fontFamily: "ui-rounded, \"Segoe UI\", system-ui, sans-serif", fontSize: "clamp(30px, 4vw, 48px)", fontWeight: 450, lineHeight: 1.18, letterSpacing: "-0.03em"}
  panel-welcome: {fontFamily: "ui-rounded, \"Segoe UI\", system-ui, sans-serif", fontSize: "25px", fontWeight: 450, lineHeight: 1.25}
  label: {fontFamily: "ui-rounded, \"Segoe UI\", system-ui, sans-serif", fontSize: "12px", fontWeight: 400, lineHeight: 1.5}
  android-body: {fontFamily: "system-ui, sans-serif", fontSize: "15px", fontWeight: 400, lineHeight: 1.45}
  android-brand: {fontFamily: "monospace", fontSize: "18px", fontWeight: 800, letterSpacing: "1px"}
  android-title: {fontFamily: "system-ui, sans-serif", fontSize: "20px", fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.5px"}
  android-welcome: {fontFamily: "monospace", fontSize: "21px", fontWeight: 700, lineHeight: 1.22, letterSpacing: "-0.5px"}
  android-nav: {fontFamily: "monospace", fontSize: "12px", fontWeight: 700}
  android-label: {fontFamily: "system-ui, sans-serif", fontSize: "12px", fontWeight: 400, lineHeight: 1.5}
  android-choice: {fontFamily: "system-ui, sans-serif", fontSize: "13px", fontWeight: 400, lineHeight: 1.35}
  android-composer: {fontFamily: "system-ui, sans-serif", fontSize: "16px", fontWeight: 400, lineHeight: 1.5}
rounded: {bubble: "16px 16px 4px 16px", control: "16px", field: "25px", panel: "28px", pill: "999px", mobile-panel: "25px", android-panel: "24px", android-control: "14px", android-nav: "12px", android-bubble: "19px 19px 5px 19px", android-card: "17px", android-choice: "22px", android-pending: "16px", android-delivery: "10px", android-composer: "23px", android-send: "18px"}
spacing: {xs: "5px", sm: "8px", md: "12px", lg: "16px", xl: "20px", panel: "18px", android-xs: "4px", android-sm: "6px", android-md: "8px", android-card: "10px", android-lg: "12px", android-xl: "16px"}
components:
  launcher: {backgroundColor: "{colors.launcher-bg}", textColor: "{colors.launcher-ink}", typography: "{typography.body}", rounded: "{rounded.pill}", padding: "16px 23px"}
  panel: {backgroundColor: "{colors.paper}", textColor: "{colors.ink}", rounded: "{rounded.panel}", width: "min(440px, calc(100vw - 32px))", height: "min(550px, calc(100dvh - 48px))"}
  assistant-mark: {backgroundColor: "{colors.green}", textColor: "{colors.mark-ink}", rounded: "50%", size: "35px"}
  user-bubble: {backgroundColor: "{colors.sage}", textColor: "{colors.ink}", rounded: "{rounded.bubble}", padding: "11px 14px"}
  choice-chip: {backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.pill}", padding: "8px 12px"}
  entry-card: {backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.control}", padding: "13px 14px"}
  composer: {backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.field}", padding: "7px 8px 7px 15px"}
  android-panel: {backgroundColor: "{colors.android-paper}", textColor: "{colors.android-ink}", rounded: "{rounded.android-panel}", width: "100%", height: "100%"}
  android-icon-button: {backgroundColor: "{colors.android-control}", textColor: "{colors.android-control-ink}", rounded: "{rounded.android-control}", padding: "0", size: "48px"}
  android-send: {backgroundColor: "{colors.android-send}", textColor: "{colors.android-ink}", rounded: "{rounded.android-send}", padding: "0", size: "48px"}
  android-choice: {backgroundColor: "{colors.android-choice}", textColor: "{colors.android-ink}", typography: "{typography.android-choice}", rounded: "{rounded.android-choice}", padding: "8px 12px"}
  android-choice-first: {backgroundColor: "{colors.android-choice-first}", textColor: "{colors.android-ink}", typography: "{typography.android-choice}", rounded: "{rounded.android-choice}", padding: "8px 12px"}
  android-entry: {backgroundColor: "{colors.android-card}", textColor: "{colors.android-ink}", rounded: "{rounded.android-card}", padding: "10px"}
  android-composer: {backgroundColor: "{colors.android-surface}", textColor: "{colors.android-ink}", typography: "{typography.android-composer}", rounded: "{rounded.android-composer}", padding: "4px"}
  android-nav-selected: {backgroundColor: "{colors.android-selected}", textColor: "{colors.android-ink}", typography: "{typography.android-nav}", rounded: "{rounded.android-nav}", padding: "4px 6px"}
  android-user-bubble: {backgroundColor: "{colors.android-user-bubble}", textColor: "{colors.android-ink}", rounded: "{rounded.android-bubble}", padding: "9px 12px"}
  android-delivery: {backgroundColor: "{colors.android-delivery-surface}", textColor: "{colors.android-delivery-ink}", rounded: "{rounded.android-delivery}", padding: "8px"}
---

# Design System: RPM Companion

## Overview

This contract holds two separately scoped implementations. Unprefixed tokens and Browser subsections belong to `chat-prototype/`; `android-` tokens and Android subsections belong to `android-companion/` and its native companion screens. Neither world replaces the other or establishes a repo-wide palette. Android uses the live refinements in `docs/android-companion-plan.md`; its earlier larger, stepped-panel styling is superseded.

### Browser

**Creative North Star: "The Floating Conversation"**

The browser prototype is a small assistant that opens from a quiet dark stage into a warm, ivory conversation panel. The user’s words, current saved state, and next choice stay primary; the visual system gives them room without becoming a dashboard. The supplied phone reference is the pinned visual direction: moss green marks the assistant, pale sage carries user bubbles, and soft cream surfaces hold compact cards and controls.

The panel is intentionally local and conversational. Its compact state preserves the reference’s proportions while expansion makes history and context inspectable. The browser background is a calm dark surface, not a simulated phone home screen. This browser world covers `chat-prototype/` only.

**Key Characteristics:**

- Warm ivory floating panel against a quiet dark green-charcoal stage
- Moss-green assistant mark and send action; pale sage user bubbles
- Compact pills, soft cards, and readable system-sans typography
- Unfolding panel, responsive mobile width, and reduced-motion support

### Android

The approved Android direction is a small pixel-game companion with a recognizable butterfly entry point. Pale lavender and cream hold a compact, rounded conversation; midnight-indigo text and outlines keep the surface readable. The generated butterfly and garden carry the pixel-art atmosphere, while proportional body text supports writing and inspecting saved plans.

The butterfly floats over the user's existing app. Its garden stays inside the conversation header, with short monospace accents in the brand and navigation. Compact spacing, rounded tactile controls, and active suggestion bubbles immediately above the composer follow the user's live refinements. Native settings keep the same ink, cream, and lavender family in a scrollable phone screen.

**Key Characteristics:**

- Generated butterfly launcher and pixel-garden header
- Compact rounded lavender-and-cream conversation with midnight-indigo ink
- Proportional body text with monospace accents in short headings and navigation
- Active choices immediately above the input, with native keyboard clearance and an expandable panel

The visual finish record is `.impeccable/review/android/finish-review.md`. Its latest ship verdict resolves the two scored fixes: fixed-size drawn icons at 200% text and composer placeholder contrast. It is not a fresh whole-surface or functional approval.

## Colors

### Browser

The palette is warm, muted, and low-chroma: dark stage outside, parchment paper for the panel, cream surfaces for controls, charcoal ink, and one moss-green action color.

### Primary

- **Moss Green** (`#456347`): Assistant mark, send button, caret, focus outline, and action emphasis.
- **Pale Sage** (`#d2d9c4`): User message bubbles and quiet positive surfaces.

### Neutral

- **Quiet Stage** (`#252d29`): Browser background.
- **Warm Paper** (`#e8e2d5`): Floating panel background.
- **Soft Cream** (`#f5f0e6`): Composer, entry cards, selected view, and choice chips.
- **Charcoal Ink** (`#252920`): Primary text and icon color.
- **Muted Ink** (`#606154`): Metadata, helper text, and quiet actions.
- **Warm Divider** (`#c8c4b6`): Navigation and record separators and chip borders.
- **Deep Rust** (`#943c2b`): Error status text.
- **Launcher Sage** (`#cbd4b8`): Closed assistant launcher background.
- **Launcher Ink** (`#283922`): Closed launcher text.
- **Mark Ivory** (`#f4f0de`): Assistant mark contrast.

### Named Rules

**The Quiet Accent Rule.** Moss green is reserved for assistant identity, sending, focus, and actionable emphasis; it does not become a decorative multi-accent system.

### Android

The Android palette combines a dark garden header with pale lavender chrome and warm cream reading and writing surfaces. The `android-` frontmatter tokens record the final CSS cascade; the native settings colors are separately named because those values remain in active native use.

- **Primary:** Lilac Send (`android-send`) and Plum Accent (`android-accent`) carry sending and game-control emphasis; the focus token provides the visible keyboard outline.
- **Secondary:** Soft Sage (`android-choice-first`) distinguishes the first attached action. Delivery Sage and Delivery Ink describe the native delivery-status block; the status text carries its actual meaning.
- **Neutral:** Midnight Ink, Lavender Paper, Cream Surface, Warm Card, and Lavender Chrome organize conversation, composer, cards, and navigation. Muted Plum (`android-placeholder`) is used for placeholder and quiet footer/disclosure text; entered text stays Midnight Ink.
- **Native surfaces:** Native Paper, Native Lavender, Native Line, and Launcher Lilac apply to the native settings controls and butterfly backing. They do not redefine the WebView's final paper and chrome colors.

## Typography

### Browser

**Display Font:** none; the stage heading uses the same `ui-rounded, "Segoe UI", system-ui, sans-serif` stack.
**Body Font:** `ui-rounded, "Segoe UI", system-ui, sans-serif`.
**Label/Mono Font:** none.

**Character:** Familiar, rounded, and conversational. Hierarchy comes from compact size changes, weight, spacing, and muted metadata rather than display typography.

### Hierarchy

- **Stage title** (450, `clamp(30px, 4vw, 48px)`, 1.18, `-0.03em`): Quiet invitation on the dark stage.
- **Panel welcome** (450, `25px`, 1.25): Opening prompt inside an empty conversation.
- **Title** (550–650, `14–20px`, approximately 1.3): View headings, entry titles, and assistant identity.
- **Body** (400, `15px`, 1.5): Conversation and general interface text.
- **Label** (400, `11–13px`, 1.5): Metadata, navigation, helper text, and compact actions.

### Android

Body copy uses `system-ui, sans-serif`; monospace is concentrated in the short RPM brand, tabs, welcome heading, and small section headings. The frontmatter records WebView CSS sizes, which Android enlarges using the system font scale. Conversation body uses the `android-body` role; writing uses `android-composer`, with card titles at 16px bold and metadata using `android-label`.

Native settings use Android system text at 15–16sp, section labels at 20sp, and a bold monospace title at 25sp. Keep native sp distinct from the CSS px values above. The header and send icons are authored SVG paths, fixed at 24px inside nonshrinking 48px controls; they do not scale as text glyphs. The darker placeholder has 5.51:1 contrast on the composer surface in the reviewed build.

## Layout

### Browser

The page uses a full-height dark stage with a compact header and a quiet left-side stage note. The assistant is fixed to the bottom-right: the closed launcher sits 32px from the right and bottom (with safe-area support), while the open panel sits 28px from those edges. The compact panel is `min(440px, calc(100vw - 32px))` wide and `min(550px, calc(100dvh - 48px))` tall; expanded mode becomes `min(490px, calc(100vw - 32px))` wide and `min(850px, calc(100dvh - 48px))` tall.

The panel is a vertical shell: header, view navigation, independently scrolling content, and a persistent composer footer. Content uses 18px horizontal padding, reducing to 15px on small screens. At `600px` and below, the panel is 12px from viewport edges, uses `calc(100vw - 24px)`, and keeps the bottom safe area. The view navigation, launcher, and composer remain touch-readable at phone size.

### Android

The native butterfly occupies a 64dp square and can be dragged within the available screen. Tapping it opens a lower-right panel capped at 330 × 420dp with 12dp outer clearance. Expanded mode uses the available viewport with 4dp clearance. On creation, system font scale above 1.3 opens the expanded panel automatically. The transparent native host measures system-bar and keyboard insets, then moves and sizes the painted child panel above them.

Inside the WebView, the shell stacks the garden header, Chat / Plans / Context / History navigation, independently scrolling content, and a persistent footer. The content uses 12px horizontal padding and 16px bottom padding; cards use 10px internal padding. Active suggestion or clarification choices occupy a horizontally scrollable row immediately above the composer. Card actions remain attached to their records. Tabs scroll horizontally when enlarged labels need more space. The compact-height media query hides the brand sublabel and quiet footer note at 430 CSS px and below; primary controls retain their 48px minimum height.

CSS dimensions describe the WebView interior; native dp dimensions describe the host and floating launcher. Native settings use a full-width scroll column with 20dp padding and buttons at least 52dp high.

## Elevation & Depth

### Browser

This is a lifted floating surface on a dark stage. Depth is structural rather than card-by-card: the panel uses `0 24px 70px #0006`, the launcher uses `0 12px 35px #0004`, and inner cards remain shadow-free with tonal contrast and warm dividers. The panel’s fixed placement and bottom-right transform origin reinforce that it belongs to the launcher.

### Shadow Vocabulary

- **Floating panel** (`box-shadow: 0 24px 70px #0006`): Open assistant shell.
- **Launcher** (`box-shadow: 0 12px 35px #0004`): Closed entry point above the stage.

### Android

The conversation panel is flat within its outlined rounded shell: the final CSS removes its inset shadow. Depth comes from the garden image, tonal layers, thin outlines, and short offset shadows under choice bubbles and the composer. The selected tab uses an inset lower edge. The native activity dims the app behind it by 0.12; the floating butterfly has native elevation of 8 physical pixels.

The sidecar preserves the exact Android control shadows and motion. Buttons shift down 2px while pressed, and background changes transition over 0.12s only when reduced motion is not requested. Header icon controls remain shadow-free in the final compact styling.

## Shapes

### Browser

The form language is soft and compact. The panel uses a 28px radius (25px on small screens); cards and message containers use 16px; the composer uses a 25px capsule; navigation and choice controls are full pills. The user bubble is directional, `16px 16px 4px 16px`. Dividers are one-pixel warm lines. Focus is a 3px moss-green outline with a 3px offset; the composer uses a 2px outline when focused within.

### Android

Rounded corners are the confirmed refinement. Use the Android radius tokens for the outer panel, controls, tabs, cards, bubbles, composer, and delivery blocks. A two-pixel muted-purple border defines the panel; inner controls use thinner borders. User bubbles retain a small lower-right corner, cards retain their three-pixel left accent, and pending groups use a rounded dashed outline. Pixel structure belongs to the raster art and short type accents rather than stepped container corners.

The native butterfly backing and settings buttons share the current `pixelBackground` drawable: its radius is 36 physical pixels and stroke is 3 physical pixels. Those source values are not dp measurements. Focus in the WebView uses a three-pixel purple outline inset by three pixels.

## Components

The following existing component subsections describe the browser. The Android subsection that follows defines the phone variants.

### Launcher

- **Shape:** Full pill, `border-radius: 999px`; 16px × 23px padding; 62px minimum height.
- **Color:** `#cbd4b8` background with `#283922` text and icon.
- **Behavior:** Fixed bottom-right entry point; hidden while the panel is open.

### Panel and Header

- **Shape:** Warm paper shell, 28px radius, clipped overflow, fixed bottom-right placement.
- **Header:** 16px 17px 11px padding; 35px circular moss mark; brand label with muted “Here with you” sublabel.
- **Controls:** Transparent 40px circular icon buttons for expand and minimize.

### Buttons and Choice Chips

- **Primary:** `.send` is a 36px green circle with a 19px icon; disabled state follows global disabled opacity.
- **Choice:** `.choice` uses cream fill, 1px warm divider, full pill radius, 8px × 12px padding, 38px minimum height.
- **Quiet:** `.quiet` is borderless, muted, underlined where used for reversible or secondary actions.
- **States:** Keyboard focus uses the global green outline; controls transition background and filter over `.15s` when motion is allowed.

### Cards / Containers

- **Entry card:** `.entry` uses cream fill, 16px radius, 13px × 14px padding, and 8px vertical separation. Entry metadata is 12px muted text; actions stay attached to the entry.
- **Receipt:** `.receipt` preserves earlier state and labels it “Earlier state” or “Archived”; its “Current” action returns to current plans.
- **Pending proposal:** `.pending` is separated by a warm divider and keeps unresolved operations and choice answers in the same conversation.

### Inputs / Fields

- **Composer:** Cream capsule `#composer`, 25px radius, 7px 8px 7px 15px padding. The textarea is transparent, borderless, grows from 35px to 110px, and uses a moss caret.
- **Focus:** `#composer:focus-within` gets a 2px green outline; textarea focus itself has no outline.
- **Status:** Quiet muted helper text; `.status.error` uses Deep Rust. The footer states “Local test copy · alerts preview only.”

### Navigation

- **View nav:** Four compact pill-like controls beneath the header, separated by a one-pixel divider. The pressed view uses cream fill, charcoal ink, and semibold weight.
- **Views:** Chat is primary; Current plans, Context, and History are inspectable secondary views with a clear return to chat through the brand button.

### Signature Component: Conversational Entry

The entry card keeps title, time, planned or reported minutes, recurrence, alert-preview state, mood/energy, original words, and attached edit/archive actions together. User text is right-aligned in a sage directional bubble; assistant text remains plain on paper. Suggestions and unresolved proposal choices stay in the same message flow.

### Android

- **Butterfly launcher:** Generated pixel-art butterfly on a rounded lilac native backing. Tap opens the conversation, drag moves it, and long press hides it. It is hidden over RPM's own screens; a visible service notification also offers Hide. Preserve the raster's sharp pixels.
- **Garden header:** The generated garden fills the header width at its bottom edge; the 38px butterfly sits beside the short RPM label. Expand and minimize use labeled 48px controls with 24px drawn icons. The brand returns to conversation.
- **Navigation:** Four labeled destinations remain directly below the header. The selected tab uses pale lilac fill and an inset lower edge. Labels remain available through horizontal scrolling at large text sizes.
- **Choices:** Rounded tactile bubbles, with the first action in soft sage and remaining actions in warm cream. Active reply choices stay immediately above the composer and scroll horizontally; record-specific actions stay with their card. Choice controls keep a 48px minimum height.
- **Cards and delivery:** Warm cream cards contain title, time, estimated or reported minutes, original words, and attached actions. A sage delivery block presents Android's current scheduling or delivery state. Historical receipts and unresolved proposals retain their labels and entry context.
- **Composer and send:** Cream rounded field with a thin muted-purple outline, a textarea that grows from 48px to 140px, and the lilac 48px send control. The placeholder uses `android-placeholder` at full opacity. Send, expand, and minimize share fixed-size centered SVG geometry; disabled controls use 0.5 opacity.
- **Native settings:** A scrollable cream screen with monospace title and rounded lavender buttons. Permission and connection labels describe the current phone state. Its native sizing and drawable values are recorded separately from WebView tokens.

## Do's and Don'ts

### Browser

- **Do** keep the assistant as a small floating browser panel with a clear launcher.
- **Do** preserve warm ivory paper, cream inner surfaces, charcoal text, moss green identity/action, and sage user bubbles.
- **Do** keep current state, original words, receipts, choices, and Undo attached to the conversation.
- **Do** retain the persistent bottom composer and explicit prototype-only alert note.
- **Do** preserve responsive width and the `prefers-reduced-motion` gate for unfolding and transitions.
- **Don't** turn this surface into a dashboard, questionnaire, fake Android home screen, or full-page centered chat.
- **Don't** reintroduce microphone, recording, real alerts, calendar writes, or coaching language.
- **Don't** add a lavender/purple accent family or decorative display type to this browser surface.
- **Don't** detach follow-up choices from the selected entry or hide original words.

### Android

- **Do** preserve the generated butterfly and garden, compact rounded panel, proportional body text, and short monospace accents.
- **Do** keep active suggestion and clarification bubbles immediately above the composer, while record actions remain attached to the selected entry.
- **Do** retain the compact and expanded native sizing, keyboard-inset handling, system text scaling, 48px WebView primary controls, and fixed 24px drawn icons.
- **Do** show the native delivery state on current cards and keep original words, receipts, and Undo connected to the conversation.
- **Don't** replace the user's wallpaper or introduce an invented fairy character.
- **Don't** reintroduce stepped panel corners, oversized empty surfaces, or text-glyph send/expand/minimize icons.
- **Don't** apply the browser's preview-only alert restriction or ivory-and-green palette to the Android companion; each world's rules stay within its stated scope.
