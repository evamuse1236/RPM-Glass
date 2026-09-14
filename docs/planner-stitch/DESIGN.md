---
name: RPM Planning — Stitch
description: Midnight glass planning with Daily-first shared controls; Android planner only.
colors:
  ground: "#121125"
  surface: "#1f1d31"
  raised: "#29283c"
  ink: "#e3dffb"
  muted: "#b9bacd"
  cyan: "#00f0ff"
  violet: "#ddb7ff"
  mint: "#5ee9b5"
  amber: "#fcd34d"
  coral: "#ffb3b0"
typography:
  body: {fontFamily: "Jakarta, system-ui, sans-serif", fontSize: "14px", fontWeight: 400, lineHeight: 1.5}
  title: {fontFamily: "Jakarta, system-ui, sans-serif", fontSize: "20px", fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.02em"}
  task: {fontFamily: "Jakarta, system-ui, sans-serif", fontSize: "13px", fontWeight: 400, lineHeight: 1.4}
  score: {fontFamily: "Jakarta, system-ui, sans-serif", fontSize: "32px", fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.02em"}
rounded:
  card: "16px"
  field: "12px"
  pill: "999px"
  sheet: "24px 24px 0 0"
spacing:
  page: "16px"
  compact: "12px"
  gap: "8px"
  scroll-clearance: "176px"
components:
  primary: {backgroundColor: "{colors.cyan}", textColor: "#002022", rounded: "{rounded.field}", padding: "10px 12px", height: "48px"}
  field: {backgroundColor: "#0d0c1f99", textColor: "{colors.ink}", rounded: "{rounded.field}", padding: "11px 12px"}
  navigation: {backgroundColor: "#1f1d31e6", textColor: "{colors.ink}", rounded: "{rounded.pill}", height: "64px", width: "min(310px, calc(100% - 48px))"}
  chip: {backgroundColor: "#ffffff06", textColor: "{colors.muted}", rounded: "{rounded.pill}", padding: "9px 12px"}
  chip-selected: {backgroundColor: "#00f0ff20", textColor: "{colors.cyan}", rounded: "{rounded.pill}", padding: "9px 12px"}
  card: {backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.card}", padding: "12px"}
---

# Design System: RPM Planning

## Overview

The user-authored Stitch project is the visual authority. This contract applies only to `android-companion/planner.html`, `planner.mjs`, and `planner-stitch.css`. Root `DESIGN.md` and its sidecar describe earlier browser/capture surfaces and are deliberately preserved, not overwritten or treated as planning authority.

The midnight glass world is implemented from the downloaded source, not a new concept. The authoritative order is **Daily → RPM → Projects → Life**. A component first introduced in an earlier screen retains that appearance in later screens.

## Colors

Cyan identifies the current destination and primary actions. Violet, mint, amber and coral distinguish outcomes and life areas; amber also marks must-do actions. Muted lavender text remains readable against layered violet-black surfaces. Life scores are optional self-ratings, not inferred completion metrics.

## Typography

Jakarta regular and semibold ship as local fonts. Titles and time badges carry emphasis; compact metadata stays secondary. Time, progress and scores use tabular numerals. Android text scaling is respected; enlarged text switches Daily to its readable agenda presentation.

## Layout

Daily owns the seven-day strip, hour timeline, floating five-icon navigation, Search circle and cyan Add button. RPM owns duration badges, result/purpose/action hierarchy and compact bottom sheets. Projects and Life inherit these controls without introducing competing versions.

The phone canvas is capped at 680px. Scroll content has clearance below floating controls. At widths below 370px, cards use compact padding and strips scroll instead of shrinking chip labels. At short landscape heights, navigation moves left and actions sit beside it. Form bodies scroll independently of their fixed Save footer, above the native keyboard inset.

## Elevation & Depth

Translucent tinted cards, thin light borders, diffuse shadows and restrained cyan glows reproduce the Stitch glass material. Navigation uses 24px backdrop blur; Add uses the source cyan gradient. Timeline cards have an opaque base so the current-time line cannot strike through their text. No external image or font requests are needed.

## Shapes

Round cards and fields sit beneath pill filters and circular icon controls. Task rows are compact rounded rectangles. Editors rise as bottom sheets. All action controls retain nonshrinking 48px hit targets; narrow seven-day cells use 44px width with horizontal scrolling when needed.

## Components

- Navigation is one shared renderer across the four views. Its selected state uses a cyan ring, tint and glow. Re-tapping Daily opens date/calendar controls.
- Filter chips never shrink; horizontal overflow stays within the strip.
- Task rows support completion, must status and order independently. Text swipe right completes/reopens; swipe left toggles must. Drag handles reorder or move; explicit controls remain available.
- Project progress derives from actual linked tasks. Zero-task projects show an unscored state, never a fabricated percentage.
- Life has yearly, quarterly and monthly persisted goals, optional area ratings and saved core values. Unrated values are shown as missing, not zero.
- Sheets preserve drafts, validate against the current saved version, trap focus, and support native Back and Undo.

## Do's and Don'ts

- Do resolve shared-component differences using the earliest source in the user's order.
- Do preserve calendar freshness/conflict warnings, recurrence, capture context and transactional saves.
- Do bundle fonts and icons locally and respect reduced motion.
- Don't apply this palette to capture/chat or native settings as part of this change.
- Don't ship Stitch's mock alerts, sample names or invented progress/rating values as application data.

Source manifest: `../references/stitch-planner/sources.json`. Implementation and verification: `../planner-stitch-surface.md`.
