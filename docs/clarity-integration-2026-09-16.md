# RPM Clarity integration

## Design contract

The planner needed five changes without disturbing v0.11 data or navigation behavior:

1. Daily opened as a dense timeline without first answering what is planned today.
2. Task completion looked like a minutes control, so the action and estimate were ambiguous.
3. Repeated glow, blur and tinted cards competed with result, purpose and action hierarchy.
4. The selected date, layout choice and Add action were too implicit.
5. Planner appearance had no local System / Light / Dark choice in the integrated Settings destination.

Clarity keeps Jakarta and the Android WebView stack. It uses warm white and graphite backgrounds, opaque content surfaces, a blue action/selection color, amber for labeled must-do state, restrained separators, 48px interaction targets, and translucency only for the bottom navigation unless the user chooses solid navigation. System appearance and Agenda are the defaults.

## Integration boundaries

- `planner.mjs` owns the visible Daily heading, selected-date button, Agenda/Timeline choice, checkbox completion affordance, adjacent estimate copy, plainer RPM labels, and the persisted sort-preview flow.
- `planner-clarity.mjs` owns only local display preferences and adds them to the existing Settings page. It does not read or write planner records or call native services.
- `planner-stitch.css` supplies the semantic palette, focus states, opaque grouping, editor/keyboard sizing, large-text treatment, short-landscape navigation rail, reduced-motion/transparency, contrast, and forced-color fallbacks.
- `planner.html` keeps the external bundled runtime only. No inline script or CSP relaxation is used.
- Safe AI sorting creates a stored preview first. Dismiss changes no plan data; Apply uses the intent service's guarded accept transaction and one canonical Undo snapshot. Older `planner.drafts` remain visible as already-applied legacy arrangements solely for the existing learn/don't-learn choice.

The integration preserves goal-source drafts, Original capture disclosure, selected-tab reveal, scroll restoration, explicit priority controls, move/edit actions, native Settings, calendar and recurrence behavior, and the v0.11 no-drag/no-resize contract.

## Verification targets

- Agenda and Timeline use the same planner data and existing task/calendar detail handlers.
- Large text keeps Agenda, hides the week strip, retains a date-picker button, and allows horizontal bottom-navigation scrolling.
- Light, dark and system palettes keep readable text, visible selection, focus, boundaries and disabled state.
- The editor keeps focus return, Tab containment, Escape/Back behavior, draft recovery, sticky actions, and viewport-height adaptation while the keyboard is open.
- Sort suggestions survive as previews, list every proposed group and unassigned selected task, and do not mutate canonical planner data until Apply.

Automated checks cover preference normalization, external-script-only packaging, semantic theme/fallback selectors, checkbox/estimate markup, safe sort-preview calls, and the pre-existing v0.11 planner interaction contract. Final Android visual and interaction checks belong to the release build pass.
