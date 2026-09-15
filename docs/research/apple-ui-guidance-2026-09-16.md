# UI guidance research: Apple HIG and Android guidance

Research date: 2026-09-16  
Scope: official, primary guidance relevant to the RPM Android app refresh. The “RPM application” notes are hypotheses for the product team; they are not claims made by Apple or Google.

## Source principles

### 1. Establish hierarchy through structure and grouping

Apple says to establish hierarchy so people understand “where they are and what comes next.” Its layout guidance recommends placing important items early in reading order, aligning components for scanning, and grouping controls in logical sections with enough space around them. It also recommends progressive disclosure when all content cannot be shown at once.

Sources: [Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout). Short source wording: “Establish hierarchy.”

**RPM application (hypothesis):** Give each RPM block a strong, repeated anatomy: one purpose/title, one primary action or state, and supporting metadata. Use spacing, alignment, and section headers to make blocks read as intentional groups. Treat visually indistinguishable blocks as a hierarchy problem before adding decoration: distinguish role and state through placement, labels, weight, and accessible text. Keep secondary details behind an explicit disclosure affordance.

### 2. Use typography as information architecture and support larger text

Apple’s typography guidance says font size, weight, and color should communicate hierarchy, while preserving relative distinctions as text grows. It recommends avoiding light weights, minimizing typeface variety, adapting layouts to all Dynamic Type sizes, minimizing truncation, and enlarging meaningful icons with text. Apple’s accessibility page recommends allowing at least 200% text enlargement where possible.

Sources: [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility). Short source wording: “Prioritize important content when responding to text-size changes.”

**RPM application (hypothesis):** Make widget and in-app message text scale from Android `sp`, with layouts that reflow rather than clip. Preserve the difference between title, message, timestamp, and status at large sizes. Avoid tiny secondary labels and thin weights. A widget should expose the useful message at a glance; if space is tight, remove low-value metadata before shrinking the main text.

### 3. Keep settings contextual and limited

Apple recommends using settings for general, infrequently changed options, while task-specific options should be available in the screen they affect. It warns that putting task options in a separate settings area disconnects them from context. Apple’s settings guidance also describes a stable navigation surface for settings panes and a title that reflects the visible pane.

Source: [Settings](https://developer.apple.com/design/human-interface-guidelines/settings). Short source wording: “When possible, prefer letting people modify task-specific options without going to your settings area.”

**RPM application (hypothesis):** Keep capture behavior and other task controls beside the capture flow. Keep global preferences in one in-app settings destination with a clear title and stable section structure. If the current settings action opens a separate window, treat that as a navigation/context break: prefer an in-place destination or clearly scoped sheet on phone-sized surfaces, with an obvious close/back path and preserved parent context.

### 4. Feedback should explain status, outcome, and next action

Apple defines feedback as helping people know what is happening, what they can do next, and the result of an action. It recommends placing status feedback near the item it describes, using alerts only for critical and ideally actionable information, and reserving success confirmations for significant actions. Feedback should be accessible through more than one channel, such as text plus color, sound, or haptics.

Source: [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback). Short source wording: “Consider integrating status feedback into your interface.”

**RPM application (hypothesis):** Rewrite capture messages around a simple state model: what was captured, what the app understood, and the next available action. Put the state next to the relevant capture result. Use persistent inline status for routine success and errors; reserve blocking dialogs for decisions that need immediate input. Make success, failure, and pending states distinguishable by text and iconography as well as color.

### 5. Prefer standard, discoverable interactions; avoid gesture-only flows

Apple recommends supporting standard gestures and offering alternative input when a complex gesture is required. Android similarly says not to rely on gestures for all actions and recommends explicit accessibility actions for flows. Android Compose guidance says to prefer higher-level components and gesture modifiers because they include semantics, visual interaction feedback, focus, and accessibility support.

Sources: [Apple Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures), [Android accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility), [Compose gesture guidance](https://developer.android.com/develop/ui/compose/touch-input/pointer-input/understand-gestures). Short source wording: “Don’t rely on gestures to complete all actions.”

**RPM application (hypothesis):** Removing drag-and-drop from the primary RPM interaction is consistent with the accessibility principle when dragging is not essential to the task. Offer explicit buttons, menus, or reorder controls for any action that was previously drag-only. If a gesture remains, expose the same action through a labeled control or accessibility custom action, and show a visible pressed/selected state.

### 6. Make touch targets and system navigation safe

Android recommends touch targets of at least 48 dp, even when the visible icon is smaller. Android’s predictive-back guidance says to avoid touch gestures or drag targets under system gesture insets. This is directly applicable to a phone UI even though the hierarchy and typography research above comes from Apple.

Sources: [Android accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility), [Predictive back](https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back). Short source wording: “Ensure all touch targets are at least 48 dp.”

**RPM application (hypothesis):** Give capture, settings, close/back, and block actions 48 dp or larger hit areas, including generous padding around small icons. Keep bottom-edge actions clear of gesture navigation insets. Test back from capture, settings, and any transient confirmation so it returns to the expected parent state rather than closing the task unexpectedly.

### 7. Widget text should remain readable at a glance

Apple’s widget guidance recommends text at 11 points or larger, avoiding rasterized text, and using text elements/styles so text scales and remains accessible. It also says color should support the content without competing with it and meaning should not depend on color alone.

Source: [Widgets](https://developer.apple.com/design/human-interface-guidelines/widgets). Short source wording: “Avoid very small font sizes.”

**RPM application (hypothesis):** Treat widget text size as a content hierarchy decision, not just a styling knob. Keep the primary RPM message readable, use live text rather than baked images, and pair color changes with labels/icons. Validate the smallest supported widget size and the largest configured system font before calling the widget readable.

## Limits and design handoff

Apple’s HIG is platform-specific guidance and does not prescribe an Android implementation. The Android touch-target, accessibility-action, Compose semantics, and predictive-back points above are the Android-specific constraints. The RPM applications are design directions to evaluate against the existing product behavior and screenshots; they should be validated on the named phone and widget surfaces.
