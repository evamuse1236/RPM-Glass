# RPM: readable plans and direct actions

Mode: Operate. Scope: active Android companion, planning destinations, and in-app settings. Browser prototype retains its own palette; the retired original planner remains a compatibility destination.

## Evidence and design decisions

The baseline [RPM overview](../.impeccable/review/usability/before-rpm.png) shows one four-task block occupying nearly the entire portrait viewport. Nested purpose and task containers, large duration badges, small metadata and unlabeled navigation compete with the result title. Source files confirm pointer reordering/resizing and settings navigation to a separate Activity.

Apply Apple's principles with Android controls:

| Source principle | RPM decision |
| --- | --- |
| [Group related items and maintain logical alignment](https://developer.apple.com/design/human-interface-guidelines/layout) | Each RPM result owns one boundary, title and compact list. More space between blocks than within a block. Purpose is supporting text, not a competing nested card. |
| [Use type to show hierarchy and prioritize content when sizes change](https://developer.apple.com/design/human-interface-guidelines/typography) | Clear result/title/body/supporting roles; text reflows. Main widget has a persisted size preference layered on system scaling. Lightness of saved task text comes from color, not a thin unreadable weight. |
| [Integrate status feedback into the interface](https://developer.apple.com/design/human-interface-guidelines/feedback) | A saved receipt has a status label, italic supporting title, directly associated Open and Undo. It differs visibly from an unsaved suggestion and from conversational prose. |
| [Make gestures familiar and provide alternatives](https://developer.apple.com/design/human-interface-guidelines/gestures) | Remove planner drag/drop and resize. Move, priority and time remain explicit controls. |
| [Keep settings contextual](https://developer.apple.com/design/human-interface-guidelines/settings) | Settings becomes the fifth planning destination with retained navigation and Back. System sound/file/permission choices still use Android dialogs. |
| [Android accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility) | 48dp hit areas, selected state beyond color, readable contrast and text enlargement checks. |

These are RPM design decisions informed by the cited principles, not Apple requirements for Android.

## Screen jobs

- Capture: express a thought, inspect its saved state, or choose where to develop it.
- Daily: see scheduled commitments and make direct time/task edits.
- RPM: distinguish outcomes and see the actions that serve each.
- Projects: see larger undertakings and open their constituent blocks.
- Life: review/edit goals, horizons and self-entered life areas.
- Settings: change app-wide preferences while keeping the planning navigation visible.

## State contract

A goal draft is not a saved goal. It retains its source words and can be edited before Save. Back retains its draft; Cancel may deliberately discard it. A saved Open resolves an existing ID against current data, never a title guessed by a model. A deleted/missing target gets a specific recoverable error. Failed navigation never reports that a saved task was lost. Routine local saves and edits retain Undo.

Keep one shared navigation renderer; visible labels and selected state must agree across all five destinations. A settings action can invoke a native picker without creating another RPM settings screen. Returning refreshes status without changing the plan.

## Validation boundary

Use the owned API 36 emulator, synthetic planner fixtures, the user's supplied reproduction text in a synthetic conversation, and backed-up private storage. Inspect normal portrait, narrow phone width, landscape, 200% Android text, 160% widget text, keyboard-open editor, populated/empty planning and saved receipt states. Exercise actual touch scrolling and system Back in addition to DOM-level action checks. Physical-device behavior and live provider output are separate from deterministic routing and emulator results.
