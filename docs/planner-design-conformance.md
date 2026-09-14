# Planner design conformance

Documenter protocol substitution: this harness has no `agent_type` loader, so a fresh named subagent ran the supplied fallback Impeccable Documenter protocol.

## Scope and evidence

Checked the full direction contract in `docs/planner-surface-contract.md`, `PRODUCT.md`, and the shipped planner sources: `android-companion/planner.html`, `planner.css`, `planner.mjs`, and `runtime.mjs`. The palette baseline was checked against `android-companion/night.css`. Existing `DESIGN.md` and `.impeccable/design.json` were inspected and left unchanged. No credentials, `.env` files, or phone-pairing tooling files were inspected.

## Five-line system summary

- Palette: deep navy `#0e141d` ground, slate surface `#182331`, raised blue-slate `#213246`, pale text `#f4f7fa`, muted text `#b4c0ce`, cyan accent `#7dd3fc`, and blue-gray divider `#36465b`.
- Type: bundled Jakarta is the 15px/1.5 body voice; bundled Space is the 25px toolbar and 18–24px section/title voice; compact metadata is 11–13px and tabular-numbered.
- Layout: full-height `#planner` shell with toolbar/date strip, three equal Day/Projects/Life controls, independently scrolling workspace, and persistent footer; timeline uses a 54px ruler gutter and `--hour: 96px` (110px at 700px+).
- Components: 48px minimum touch targets; cyan primary buttons and selected tabs; slate secondary controls; transparent cyan links; 12px control/event corners, 10px fields, 12px section rhythm, dashed outlined external commitments, and proportional timed blocks.
- Motion/accessibility: directional 180–220ms transitions (`.18s` editor, `.2s` shifts), reduced-motion overrides, visible cyan focus rings, keyboard-safe forms, and large-text layout adjustments at `fontScale >= 1.5`.

## Conformance to the direction contract

The build implements the specified spatial story: the first view is a compact title/date toolbar followed by Day/Projects/Life scale controls and a vertically scrolling hourly ruler. `planner.mjs` renders proportional task heights, an accent now-line, a distinct dashed external-calendar treatment, an unscheduled capture route, project/block/task hierarchy, and life goals. Header vertical swipes change level; horizontal swipes change day, project, or year; task resize owns its drag gesture; equivalent buttons expose the same operations.

The build reuses Frosted Night’s palette and bundled Jakarta/Space fonts from the direction contract. Unlike the floating widget in `night.css`, the planner uses solid full-screen surfaces (`--bg`, `--surface`) so the time ruler remains legible. The planner’s stateful editor, conflict panel, footer, calendar state, and notice use the same dark-slate/cyan vocabulary and 48px interaction floor.

## Drift not canonized or repaired

The incumbent root `DESIGN.md`/`.impeccable/design.json` still describe the older Android lavender/pixel-garden world and do not describe this planner; that pre-existing drift is reported here only and was not repaired because the requested boundary preserves both global design files. The planner also contains literal one-off blue-gray and amber values (`#20374d`, `#53738c`, `#8c9eaf`, `#ffdf91`, `#b99167`) alongside the Frosted Night variables; these are shipped component details, not promoted to shared tokens. The planner’s 12px rounded event/control language and solid surfaces intentionally diverge from the widget’s 32px glass card and backdrop blur; that is the contract’s full-screen readability decision, not a new global rule.
