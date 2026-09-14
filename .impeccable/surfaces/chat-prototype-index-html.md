---
version: 1
slug: "chat-prototype-index-html"
primary_target: "chat-prototype/index.html"
related_targets: ["chat-prototype/app.js","chat-prototype/style.css"]
---

# Conversational RPM prototype

Scope: `chat-prototype/`, browser, Operate. Confirmed after the user's grilling interview. No Android overlay or real alerts.

## Direction contract

THESIS: A small assistant opens into a conversation; editable data supports the conversation rather than dictating a questionnaire.

OWN-WORLD: User's supplied four-panel phone reference, `/tmp/codex-clipboard-303bfb92-625d-45de-800f-43abfd14a640.png`. Warm ivory floating panel, charcoal type, moss-green assistant mark, pale sage user bubbles, compact soft cards and pill suggestions. Preserve panel proportions, bottom composer, small launcher, expanding history. Browser background is a quiet dark surface, not a fake Android home screen.

STORY: Talk normally, inspect actual changes, answer missing details through bubbles, undo mistakes. Current plans and inspectable memory are secondary views with a clear return to chat.

FIRST VIEWPORT: Bottom-right launcher opens a roughly 420px-wide panel. Compact header and controls, short conversation, three suggestions, bottom composer. Expanded state grows vertically; mobile uses the available width. Signature motion is the panel unfolding from its launcher; reduced motion removes the transition.

FORM: User-pinned reference overrides concept seed c5bd3be0. Direct editable web implementation follows the supplied composition; no competing design round.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Behavioral contract

- Persistent private test copy of CLI data; never write back to CLI or call its alert runtime.
- All unarchived history is tool-accessible. Recent chat and current relevant state are provided initially; longer history is searchable and paginated, not silently inaccessible.
- Tool-mediated create/update, explicit preference memory, archival, read context and visual responses.
- Compound edits are atomic. Unresolved proposals survive clarification, reload and restart. Choice bubbles carry full answers.
- Clear reversible changes apply immediately with Undo. No speculative partial saves.
- Original words remain; receipts are snapshots marked when superseded. Current plans is authoritative.
- Archive removes selected records from active AI context without destroying them. New chat retains plans, history and memory.
- Recurrence and alerts are setup previews. No microphone, external calendar writes, real alarm delivery or coaching.

## Acceptance

Test run at 8a -> maybe 9, two-plan edits with 530 shorthand, unresolved AM/PM answered by bubble, interrupted proposals, persistence/restart, old-history lookup, explicit memory and correction, archive/restore, Undo, historical receipts, no external writes, responsive launcher and panel.
