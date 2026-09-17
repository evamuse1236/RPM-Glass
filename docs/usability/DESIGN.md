---
name: RPM Android Usability
description: Readable Frosted Night capture, planning, and settings with direct, recoverable actions.
colors:
  planner-ground: "#121125"
  planner-surface: "#1f1d31"
  planner-section: "#1b192c"
  planner-raised: "#29283c"
  planner-ink: "#e3dffb"
  planner-muted: "#b9bacd"
  capture-glass-base: "#121821"
  capture-ink: "#f4f7fa"
  capture-muted: "#b4c0ce"
  action-cyan: "#00f0ff"
  selection-cyan: "#00f0ff1f"
  receipt-success: "#9ee8d1"
  receipt-title: "#d9e3ec"
  purpose-coral: "#ffcecb"
  outcome-violet: "#ddb7ff"
  outcome-mint: "#5ee9b5"
  must-amber: "#fcd34d"
  outcome-coral: "#ffb3b0"
  danger: "#ffb4ab"
  notice-surface: "#343248f5"
  notice-ink: "#f3ecff"
typography:
  headline: {fontFamily: "Jakarta, system-ui, sans-serif", fontSize: "22px", fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.02em"}
  result-title: {fontFamily: "Jakarta, system-ui, sans-serif", fontSize: "21px", fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.025em"}
  body: {fontFamily: "Jakarta, system-ui, sans-serif", fontSize: "14px", fontWeight: 400, lineHeight: 1.5}
  supporting: {fontFamily: "Jakarta, system-ui, sans-serif", fontSize: "12px", fontWeight: 400, lineHeight: 1.5}
  receipt-title: {fontFamily: "Jakarta, system-ui, sans-serif", fontSize: "16px", fontWeight: 400, lineHeight: 1.45}
  compact-label: {fontFamily: "Space, system-ui, sans-serif", fontSize: "11px", fontWeight: 600, lineHeight: 1.3, letterSpacing: "0.16em"}
rounded:
  time: "7px"
  field: "12px"
  section: "14px"
  notice: "16px"
  nav: "18px"
  sheet: "24px 24px 0 0"
  capture: "32px"
  pill: "999px"
spacing:
  micro: "4px"
  gap: "8px"
  compact: "12px"
  page: "16px"
  block: "20px"
  nav-clearance: "184px"
components:
  primary-action: {backgroundColor: "{colors.action-cyan}", textColor: "#002022", rounded: "{rounded.field}", padding: "10px 12px", height: "48px"}
  capture-receipt: {backgroundColor: "transparent", textColor: "{colors.receipt-title}", typography: "{typography.receipt-title}", rounded: "0", padding: "10px 0"}
  planner-navigation-selected: {backgroundColor: "{colors.selection-cyan}", textColor: "{colors.action-cyan}", rounded: "{rounded.field}", height: "62px"}
  rpm-block: {backgroundColor: "{colors.planner-section}", textColor: "{colors.planner-ink}", rounded: "{rounded.section}", padding: "15px 14px 12px"}
  task-row: {backgroundColor: "transparent", textColor: "{colors.planner-ink}", rounded: "0", padding: "4px 0", height: "58px"}
  goal-draft-field: {backgroundColor: "#0d0c1f99", textColor: "{colors.planner-ink}", rounded: "{rounded.field}", padding: "11px 12px"}
  settings-row: {backgroundColor: "transparent", textColor: "{colors.planner-ink}", rounded: "0", padding: "9px 2px", height: "64px"}
  widget-scale: {backgroundColor: "transparent", textColor: "{colors.planner-ink}", rounded: "0", padding: "14px 2px"}
  planner-notice: {backgroundColor: "{colors.notice-surface}", textColor: "{colors.notice-ink}", rounded: "{rounded.notice}", padding: "8px 14px"}
---

# Design System: RPM Android Usability

## Overview

**Creative North Star: "The Readable Night Plan"**

This is a scoped usability layer for the active Android companion. It extends the incumbent [RPM Companion design](../../DESIGN.md) and [RPM Planning — Stitch design](../planner-stitch/DESIGN.md). When guidance conflicts, this file controls the capture receipts, planner task interactions, RPM block hierarchy, integrated Settings destination, goal prefill, and widget text scaling added in the 16 September 2026 usability work. The browser prototype keeps its own contract.

Frosted Night remains a calm dark surface with pale text, cyan action and selection states, and restrained outcome colors. The usability change makes structure visible through spacing, type, boundaries, and direct labels: each RPM result reads as a section; saved changes read as receipts; Settings reads as part of planning; tasks expose deliberate controls instead of hidden manipulation gestures.

This contract records the current source implementation. See [usability verification](../usability-verification-2026-09-16.md) for checks and limits. Source UI post-fix capture verification is running, and the review score will follow. Images under `../../.impeccable/review/usability/` are synthetic QA scenes, not production data or reusable example content.

**Key Characteristics:**

- Dark navy and violet-black surfaces with pale lavender text
- Cyan selection and primary actions, with semantic outcome tones
- One visible boundary per RPM result and quiet dividers between its tasks
- Direct saved-item navigation and editable goal drafts that retain source words
- Five labeled planning destinations, including integrated Settings
- Large-text navigation and metadata that reflow without hiding the current destination
- Widget text scaling layered on Android system font scaling

## Colors

The planner uses a violet-black navy stack while capture uses a bluer translucent night glass. Cyan connects focus, selection, and primary actions across both surfaces; success, purpose, must-do, and error states retain distinct semantic colors.

### Primary

- **Action Cyan:** Primary buttons, focus outlines, active navigation, selection, and planner status.

### Secondary

- **Outcome Violet:** Alternating RPM result and life-area tone.
- **Outcome Mint:** Alternating result tone and positive planning distinction.

### Tertiary

- **Must Amber:** Must-do labels, badges, and filters.
- **Outcome Coral:** Alternating result tone.
- **Purpose Coral:** Purpose headings and original-capture disclosure labels.
- **Receipt Success:** Saved-change status labels.
- **Danger:** Destructive actions and error text.

### Neutral

- **Planner Ground:** Full planner background.
- **Planner Surface:** Navigation and raised control surface.
- **Planner Section:** RPM, project, life, and overview sections.
- **Planner Raised:** Timed cards and floating controls.
- **Planner Ink / Muted:** Primary and supporting planner text.
- **Capture Glass Base:** RGB base for the adjustable translucent capture card.
- **Capture Ink / Muted:** Primary and supporting capture text.
- **Receipt Title:** Softer saved-title text that remains readable against capture glass.
- **Notice Surface / Ink:** High-contrast transient planner feedback above floating controls.

### Named Rules

**The Semantic Cyan Rule.** Cyan marks an available primary action, current destination, focus, or live selection; it is not a general decoration.

**The Saved Receipt Rule.** Use green for the creation status and lighter neutral text for the saved title so the receipt is distinguishable from a suggestion and from conversational prose.

## Typography

**Display Font:** Jakarta (with system sans-serif fallback)
**Body Font:** Jakarta (with system sans-serif fallback)
**Label Font:** Space (with system sans-serif fallback; capture identity and short labels only)

**Character:** Jakarta keeps long plan text plain and compact. Semibold titles establish hierarchy; regular supporting text stays readable. Space appears only in short capture labels and does not replace Jakarta for content.

### Hierarchy

- **Headline:** Planner and Settings page titles.
- **Result Title:** RPM result headings with compact negative tracking.
- **Body:** Task titles, fields, descriptions, and normal settings copy.
- **Supporting:** Purpose, metadata, totals, setting explanations, and status notes.
- **Receipt Title:** Regular-weight italic saved text; the lighter feeling comes from color and style, not a thin font weight.
- **Compact Label:** Short capture identity labels only.

### Named Rules

**The System Times Widget Rule.** The widget preference ranges from 80% to 160% and multiplies Android's system font scale; planning text follows the system scale without the widget multiplier.

**The Readable Lightness Rule.** Make secondary saved text lighter through color and italic styling while retaining regular weight.

## Layout

Planner content sits in a centered phone canvas capped at 680px. Standard page padding is 16px, compacting to 12px below 370px. Scroll pages reserve 184px below their content for the floating controls and five-destination navigation. Short landscape layouts move the navigation left and place planner actions beside it.

Each RPM result owns one section with 20px separation from the next. The result title and optional purpose precede a flat task list; task rows use internal dividers rather than nested cards. Settings uses the same scrolling workspace and navigation, with groups separated by rules and 64px rows.

At large Android text sizes, navigation becomes a horizontal strip of 88px tiles, the selected destination scrolls into view, block metadata occupies full-width rows, task rows wrap, day cells widen and scroll, and editors fill the available height. Font-scale status updates switch this presentation in place. Goal drafts open as planner sheets, keep the editable result first, and retain the full original capture in a disclosure below the fields. The native keyboard inset continues to define usable height.

Planner notices sit above the floating controls. In portrait they leave room on the right for Search and Add; in short landscape they span between the page edges above the adjacent controls.

### Named Rules

**The One Result, One Boundary Rule.** Each RPM result uses one section boundary; purpose and task rows stay inside it.

**The Five Destinations Rule.** Daily, RPM, Projects, Life, and Settings share one labeled navigation renderer and expose the current page beyond color alone.

**The Floating Controls Clearance Rule.** Notices remain readable without covering Search, Add, or the navigation in portrait and short landscape.

## Elevation & Depth

The planner combines opaque tonal layers, thin translucent borders, diffuse dark shadows, and selective cyan glow. Capture uses adjustable translucent night glass over the host app. Sheets receive the strongest elevation and a dimmed scrim; task rows remain flat within their result section. Reduced-motion mode removes transition and animation movement.

### Shadow Vocabulary

- **Planner Glass:** Diffuse shadow plus a faint inset highlight for floating and timed surfaces.
- **Planner Navigation:** A deeper shadow beneath the blurred five-destination control.
- **Capture Glass:** A broad low shadow with an inset highlight around the assistant card.
- **Bottom Sheet:** Upward depth plus a full-screen dim scrim.

### Named Rules

**The Flat Task Rule.** Task rows stay flat inside an RPM block; the block carries the boundary and depth.

## Shapes

Planner sections use gently curved corners; fields and selected navigation cells use tighter 12px corners. Time badges are compact 7px rectangles. Filters remain pills, icon actions remain circular where implemented, and editors rise as 24px top-rounded sheets. Capture keeps its larger 32px glass-card silhouette and circular Send control.

Borders carry hierarchy: a stronger top edge identifies each RPM result, a quiet bottom rule separates purpose, and subtle horizontal rules separate tasks and settings rows. The new task list does not use grip silhouettes, drop targets, or resize handles.

## Components

### Saved Receipt

- **Structure:** A distinct status label above the saved title, with Open directly attached when the saved ID still resolves.
- **Title:** Regular-weight italic text in the receipt-title neutral; never repeat the full change as generic assistant prose.
- **Actions:** Open navigates by saved collection and ID without another model request. Undo remains attached to the save flow. A missing or deleted target reports one footer alert while leaving the receipt and Open control intact.

### RPM Block

- **Shape:** One dark section with a gently curved 14px boundary and a colored top edge.
- **Hierarchy:** Category and duration, result title, optional purpose, Massive Action Plan caption, then task rows.
- **Spacing:** Blocks are separated by 20px; tasks are separated by quiet rules inside the block.

### Task Row

- **Structure:** Time/completion badge, tappable task title, must toggle, and labeled priority control.
- **Behavior:** Completion, must status, time, destination, and priority use explicit controls. Priority opens Move up and Move down actions.
- **State:** Completed titles strike through; must-do state uses amber and remains available through an accessible pressed label.

### Goal Draft

- **Structure:** The proposed result opens as an editable Life goal sheet. Optional purpose, life area, year, horizon, period, and notes remain editable.
- **Source:** The complete captured ramble stays associated with the draft and appears under Original capture; cancelling may discard the draft, while Back retains it.

### Settings

- **Navigation:** Settings is the fifth destination in PlannerActivity. Back returns to the previous planning destination.
- **Rows:** Grouped 64px rows use a strong label, muted explanation, and cyan value. Android-owned sounds, files, keys, and permissions continue through native dialogs.
- **Widget Scale:** The 80–160% range includes a live sample and persists for later widget sessions.

### Planner Notice

- **Position:** The notice sits above the navigation and leaves a right-side lane for portrait Search and Add controls. Short landscape moves it above the horizontal action row.
- **Content:** Saved feedback may include Undo; text wraps within the remaining width.

### Fields and Buttons

- **Fields:** Dark translucent fill, quiet border, 12px corners, 48px minimum height, and cyan focus.
- **Primary Buttons:** Cyan surface, dark text, semibold label, and 48px minimum height.
- **State:** Disabled controls lower opacity; focus uses a visible cyan outline; reduced-motion users receive no decorative movement.

### Named Rules

**The Saved Means Specific Rule.** Open resolves the saved collection and ID against current data; a title or model guess never chooses the destination.

**The Explicit Task Movement Rule.** Tasks move or change priority through labeled controls; planner task rows do not drag, drop, resize, or swipe to mutate.

**The Receipt-Preserving Error Rule.** A local Open failure appears once in the capture footer as an alert and does not replace the saved receipt.

## Do's and Don'ts

### Do:

- **Do** keep each RPM result visually distinct through one surface, top boundary, spacing, and title hierarchy.
- **Do** keep purpose visible as supporting text and preserve long purpose content.
- **Do** show saved changes as a status, italic lighter title, Open, and Undo where available.
- **Do** preserve source words in goal drafts and let the user edit before Save.
- **Do** keep Daily, RPM, Projects, Life, and Settings in one shared labeled navigation.
- **Do** keep the selected large-text navigation tile in view and give block metadata full-width wrapping when needed.
- **Do** place planner notices clear of the floating navigation, Search, and Add controls.
- **Do** apply widget text scaling on top of Android system scaling and keep planner scaling system-controlled.

### Don't:

- **Don't** add task drag handles, drop targets, timeline resize handles, or mutation swipes.
- **Don't** send Open or goal-draft routing back through the model.
- **Don't** turn purpose into a competing nested card or turn every task into its own card.
- **Don't** copy the root browser palette or its stale Android pixel-garden guidance into this scoped Frosted Night surface.
- **Don't** use synthetic QA screenshots as production data, personal context, or reusable sample content.
