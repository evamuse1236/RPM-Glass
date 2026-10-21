# Apple design notes for RPM (2026-10-20)

Sources:
- Apple Human Interface Guidelines, fetched as JSON from `developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`. Pages read: layout, typography, buttons, tab-bars, toolbars, materials, color, sliders, toggles, text-fields, lists-and-tables, sheets, accessibility, motion, gestures, designing-for-ios. The `spacing` page returns 404.
- Five WWDC talks. Their English transcripts were downloaded with `yt-dlp --skip-download --write-auto-subs`:
  - WWDC25 "Get to know the new design system" (`DS2ildqCrB0`)
  - WWDC25 "Meet Liquid Glass" (`IrGYUq1mklk`)
  - WWDC25 "Design foundations from idea to interface" (`dGcqqA3Sl-o`)
  - WWDC17 "Essential Design Principles" (`Sv3G3z6WzxU`)
  - WWDC26 "Principles of great design" (`Xa9L2yx_QH8`)
- T3 Code's composer (`pingdotgg/t3code` @ 774c6c1, `apps/web/src/components/chat/ComposerSurface.tsx`, `apps/web/src/index.css`).

iOS points and Android dp are the same physical size class (about 1/160 inch), so the numbers below carry over to the WebView's CSS px.

## Numbers from the HIG

| Topic | Rule |
|---|---|
| Hit target | 44 × 44 pt default, 28 × 28 pt minimum (iOS). |
| Space around controls | About 12 pt around a bezeled control, about 24 pt around a bezel-less one. |
| Body text | 17 pt on 22 pt leading at the default size. The minimum is 11 pt. |
| Type ramp (default size) | Large Title 34/41, Title 1 28/34, Title 2 22/28, Title 3 20/25, Headline 17/22 semibold, Body 17/22, Callout 16/21, Subhead 15/20, Footnote 13/18, Caption 1 12/16, Caption 2 11/13. |
| Contrast | 4.5:1 for text up to 17 pt; 3:1 at 18 pt or bold. |
| Tab bar | Floats above content at the bottom, on glass that lets content show through. Labels are single words. Never hide or disable a tab. |
| Glass | Only on the navigation layer that floats over content, never on content. Use it sparingly. Over bright content, dim behind it (Apple suggests a 35% dark layer). |
| Materials | Thicker material gives more contrast; thinner keeps more context. Text-heavy surfaces use the regular (thicker) variant. |
| Reduce transparency | The system setting makes glass frostier or solid. |
| Buttons | One or two prominent buttons per view. Buttons in a set share a size and differ in style. Every custom button has a press state. Corners are concentric with the bar they sit in. |
| Layout | Order by importance, top and leading. Align for scanning. Group related items. Indent to show that one item belongs to another. |

## Lessons from the talks

1. **One radius scale, concentric.** A nested corner equals the parent's radius minus the padding between them. A capsule's radius is half its height.
2. **Hierarchy from size, weight and spacing, not boxes.** Remove borders and backgrounds that only add weight. The most important item is larger or higher in contrast.
3. **Few sizes.** Keep few type sizes, weights and colors, and use them the same way everywhere.
4. **Proximity groups.** Things that belong together sit close; groups sit apart. Repeated items keep an even rhythm.
5. **The bottom bar is for navigation.** Screen actions sit with their content. The primary action is separate from the tabs.
6. **Glass only on the floating layer.** Never stack glass on glass. Controls on glass use fills, not more glass.
7. **Legibility on glass.** A scroll edge fade sits where content passes under the bar. Over bright content the glass darkens.
8. **Tint only the primary action.** Tinting everything removes the emphasis.
9. **Fallbacks.** Reduce Transparency and Reduce Motion get a solid, still version.

## T3 Code's composer

| Part | Value |
|---|---|
| Fill | The raised surface at 80% opacity, on a `::before` layer |
| Blur | 16px (dark), 12px (light) |
| Saturation | 1.08 (dark), 1.14 (light) |
| Border | 1px, white at 5% (dark), black at 8% (light), with a 3% white inner highlight |
| Corners | 22px |
| Shadow | None in dark |
| No backdrop-filter | Solid fill |

## What RPM takes from this

- Body text stays 14 to 16dp. Apple's 17pt body is for iOS's SF type; Android's Google Sans at 14 to 16dp reads the same size on the S24 FE at 384dp. The defects in RPM are uneven sizes, not small ones.
- Every size comes from one scale (see `DESIGN.md`, Sizes). `scripts/rules/size-scale.test.mjs` fails any value off the scale.
- The planner's tab bar becomes the one glass surface: the float tone at a fill the person picks in Settings (default 80%, as in T3), 16px blur, 1.08 saturation, a 1px border at 5–8%, and a solid bar when transparency is off.
