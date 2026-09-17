# RPM should carry the mental load, not hand back a form
## Source audit and research-backed redesign

**For Sunny · 16 September 2026**
**Inspected source:** `evamuse1236/RPM-Glass` at `22604e683362e7edd3cbf6e0297ce4dd55a4ce73`.

## 1. The central recommendation

Do not begin by adding a more elaborate personality prompt or a team of agents. Separate **understanding**, **proposing**, **committing**, and **following through**. Make ordinary choices local and exact. Reserve deeper reasoning for moments when it changes what the person should do next.

The experience should combine three qualities: a friend who listens and remembers accurately; a coach who helps identify a meaningful outcome and a manageable next step; and a meticulous assistant who saves precisely what was agreed. Warmth must not weaken data integrity. Data integrity must not turn the conversation into a questionnaire.

A useful product promise is: **“Say it once. Keep what matters. Make the next step easier.”** The app succeeds when a thought is safely captured, a worthwhile action becomes easier to start, or an unnecessary commitment is deliberately dropped. More messages, more tasks, and longer sessions are not success by themselves.

Anthropic distinguishes predictable workflows from open-ended agents and recommends adding complexity only when it demonstrably helps [R1]. For this app, a small deterministic workflow around a capable interpretation model is the right starting point. This is a design recommendation, not a benchmark result for RPM.

## 2. What was actually inspected

The audit traced the current Android companion through `runtime.mjs`, `companion-agent.mjs`, `companion-tools.mjs`, `planner-tools.mjs`, `planner-chat.mjs`, `planner-state.mjs`, `planner-ai.mjs`, `capture-actions.mjs`, and the shared chat UI. Native review covered `CompanionActivity.java` and `CompanionStore.java`. The repository contains older desktop/CLI and Android generations; the README is partly historical. The modern companion uses a native-backed WebView and an independent companion store, not simply the older SQLite capture flow. See the pinned source index below.

This was a static source audit, not observation of the installed app processing your real messages. The original repository test suite, live provider, Android build and physical phone were not run here. Where I discuss slowness, I distinguish code-level causes of additional work from measured latency. The new kit’s own deterministic tests and scripted browser interactions were run.

### Current path

```text
user text / many suggestion buttons
  → runtime journals the message
  → initial context + planner context + broad tool list
  → model chooses read / respond / mutation tool
  → optional additional model/tool rounds
  → change_planner or propose_changes
  → canonical validation and calendar checks
  → native store write + alert reconciliation
  → fixed receipt and/or another question
```

There is solid work worth retaining: saving the original before the model call, atomic compound edits, current-record IDs, source evidence, revision snapshots, Undo, native secret storage, archived-context filtering and calendar warnings. Replacing these with a permissive “friendly agent” would be a regression.

## 3. The highest-impact problems

### The personality contract contradicts the desired product

The base prompt identifies the assistant as “not a coach”; the response tool also prohibits coaching. Later planner instructions override earlier tool-routing rules. A model receives layered exceptions rather than one coherent contract. Moreover, successful mutations terminate with fixed receipts such as “Saved.” The friendly voice cannot fix an upstream decision or improve a terminal response that the program hardcodes. Sources: `companion-agent.mjs`, `companion-tools.mjs`, `planner-tools.mjs`.

**Change:** use one interpreter contract, with a compact caring reply generated alongside a proposed patch. Let code add the actual saved receipt after durable success. Deeper coaching gets its own explicitly selected mode, not a contradiction appended to the base prompt.

### A preview is not consistently a preview

In `planner-state.mjs`, `aiDraft` already adds blocks and moves tasks. `acceptDraft` mostly records acceptance, while `dismissDraft` changes draft metadata without restoring the old grouping. Its `initial` arrangement is also recorded after the proposed grouping has been applied. A person can reasonably interpret “unreviewed” as “not yet saved,” but that is not what the state transition does.

**Change:** stage grouping in shadow state. Show the before/after arrangement. Apply once on acceptance and preserve a single Undo covering the whole operation. The kit’s `sort-preview.mjs` implements this boundary around the legacy planner editor. It must replace the old sort call site; merely importing the helper does not fix existing behaviour.

### A correction can demand reconstruction of an entire transaction

The old continuation prompts ask the model to resubmit every prior operation. The guards compare identities such as operation type, collection, ID and reference, but do not merge fields by an immutable operation identifier. Multiple creates with null IDs and omitted fields are especially worth testing. This creates a structural risk of losing or reinterpreting an earlier part of a compound request; it is not evidence that every continuation currently fails.

**Change:** assign stable operation IDs when drafting. “Actually, make that ten minutes” produces a patch to one operation. Code retains its title, links, and all sibling actions. The model does not reconstruct the whole plan. A new thought opens another draft rather than hijacking an old unresolved question.

### Suggestion bubbles often route a decision back through language

Most ordinary suggestions contain text that is submitted as a fresh user message. The app then asks the model to interpret a decision the interface already knows. This can add a request and introduce referential ambiguity. There are already typed exceptions for goal drafts and opening saved items; those are useful foundations. Native labels are also truncated to two words, and generic goal ideas are appended in established conversations. Sources: `app.js`, `capture-actions.mjs`, `runtime.mjs`.

**Change:** use typed, revision-bound actions. Keep a plain-language label for the human, but send an exact operation for the program. Do not display a “Goal ideas” button merely because there is room for one.

### Compactness hides the thing the user needs to trust

The `compactReply` branch returns after rendering the latest assistant response. It bypasses the later full pending-transaction section. The user can receive an answer bubble without seeing the complete set of changes that the answer affects. Source: `app.js`.

**Change:** show the latest user thought, a short reply and a compact change preview. Keep earlier dialogue reachable. Keep dismissal available even when the suggestion row is full. A small widget should expose less chrome, not less truth.

### Personal context is unevenly supplied

Initial context primarily takes recent entries and recent memories. The planner summary omits approved personal vision, while purpose-specific retrieval selects a few paragraphs even when keyword relevance is zero. Core values can be stored but are not included in that purpose context. These are routing problems, not evidence that the model needs a longer biography. Sources: `companion-tools.mjs`, `planner-tools.mjs`, `planner-ai.mjs`, `planner-state.mjs`.

**Change:** give each turn a small relevant context packet: active draft, current referenced records, a few approved preferences, and pertinent outcome/purpose context. Never substitute remembered preferences for current authorisation.

### Latency and failure reporting need stronger boundaries

The main loop permits seven model steps and a 45-second overall budget, with non-streamed responses and up to two repairs. Some multiple read calls are processed sequentially. The native transport does not propagate the JavaScript abort signal to its HTTP connection. The model is hardcoded in both JavaScript and Java, so changing the JavaScript string alone will not enable another route. Sources: `companion-agent.mjs`, `runtime.mjs`, `CompanionActivity.java`.

A further durability edge matters: native `write` saves the JSON before reconciling alerts. An exception or lost acknowledgement after that write can leave the user uncertain whether the change happened. Source: `CompanionStore.java`.

**Change:** use a bounded ordinary path, durable request IDs, receipt lookup after uncertain writes, and native cancellation as a separate implementation task. Do not claim a failed acknowledgement proves nothing was saved. These are identified failure modes, not measured incidence rates.

## 4. What the conversation should feel like

### Simple capture

**You:** “Buy milk.”

**RPM:** “Milk, added to the draft.” A single compact task appears, without a mandatory purpose, estimate, project or question. In this pilot you tap Save; after persistence succeeds, the interface says “Saved.” A future preference can allow automatic saving of clearly explicit, low-risk task requests, but only after the extraction route has earned that trust in evaluation.

The critical distinction is that the raw thought is already safe before either interpretation or commitment. A one-tap review is not an excuse to delay capture.

### Messy thought with an actionable core

**You:** “Friday’s fractions lesson needs to be ready. I want them to really understand it, not memorise steps. Tomorrow at seven I could choose the example, then make three practice questions. Maybe I should start a maths club someday.”

**RPM:** “The lesson is the priority here. I’ve kept the maths-club thought separate. For choosing the example, did you mean seven in the morning or evening?”

The draft contains one outcome, the stated purpose, and the two relevant actions. The idea is preserved but not made into another obligation. The AM and PM chips modify only the example-selection time. They do not invoke an agent or recreate the practice-question task. Suggestions are clearly labelled when the app adds them, rather than implying every detail came from you.

### A moment that should not become a task

**You:** “I’m exhausted. Please don’t plan anything for me tonight.”

**RPM:** “Okay. We can leave the planning alone tonight.”

No recovery routine, life goal, energy diagnosis or new memory appears. This is not a failed conversion. It is a successful recognition of intent.

### A grounded coaching moment

**You:** “I keep avoiding this report. Help me get unstuck.”

**RPM:** “What is making it heavy: not knowing what to say, too much to cover, or worrying it won’t be good enough?”

After your answer, the next step might be “write three rough points,” not “finish report.” The system should not assume the obstacle from a stored personality sketch. A friend-like feel comes from appropriate attention and accurate continuity, not claiming hidden knowledge.

## 5. The proposed harness

```text
CAPTURE — durable original words, message ID, instant and timezone
   ↓
CONTEXT — referenced records + active draft + relevant approved memory
   ↓
INTERPRET — one structured model response, no write tools
   ↓
VALIDATE — schema + source coverage + field provenance + target/link IDs
   ↓
DRAFT — stable operations, one unresolved issue, visible proposed changes
   ↓
LOCAL ACTION — answer / edit / park / approve, with revision checks
   ↓
COMMIT — canonical planner validation, fresh schedule checks, durable receipt
   ↓
FOLLOW THROUGH — clear next action, truthful reminder status, Undo
```

The ordinary path is one model request. One additional repair is permitted within the same overall deadline. The pilot does not run an extraction agent, a planning agent, a memory agent and a stylist sequentially for every message. OpenAI’s latency guidance specifically distinguishes reducing requests and generated output from merely shortening input, and recommends avoiding model calls for constrained responses [R2].

### Put different jobs on different paths

| User interaction | Interpretation work | Mutation authority |
|---|---|---|
| New free-text capture | One structured interpretation | Draft only |
| Choose AM/PM, edit duration, park a draft | No model call | Exact local draft patch |
| Save a reviewed draft | No model call | Existing canonical planner adapter |
| Ask a broader planning question | Deliberate coaching/review mode | Proposed plan only |
| Search unfamiliar older history | Bounded retrieval path, introduced when needed | Read-only |
| Set or change a real reminder | Current planner/native checks | Native status remains authoritative |

The pilot implements the first three rows and the prompt/data foundation for the rest. It is not a new general-purpose autonomous agent runtime. Read-only search across an entire archive and full weekly-review orchestration remain integration work.

## 6. Make wrong writes difficult by construction

A title, time and purpose are not just values; they have different origins. Each draft field represents **set**, **clear**, or **unknown**. Omission means leave the previous value alone. This prevents a missing field from accidentally turning into a deletion.

Stated fields have exact supporting text from the current message. Suggested fields are explicitly marked as suggestions. A later UI edit has a structured action ID, not a fabricated quote pretending the user typed it. Source evidence is useful provenance, but substring matching cannot prove semantic entailment. “Do not call Sam” contains “call Sam”; the validator must not be advertised as solving intent comprehension by itself.

The strict response schema is designed around patch arrays. It is not a blind switch from `strict:false` to `strict:true` on the old sparse schemas. OpenRouter documents structured-output support for compatible routes and the need to require supported parameters [R3]. Schema conformance still does not establish that the plan is the right plan.

Every current text unit gets a disposition: action, idea, reflection, reference, question or preference. A unit can yield multiple action operations. The implementation verifies coverage of supplied units, not perfect semantic coverage of every clause. Completeness therefore also needs model evaluations and human review.

Existing targets and links must have appeared in current context. Drafts record target fingerprints. A late reply cannot silently overwrite a task edited elsewhere. Actions carry conversation, draft and revision identifiers; stale chips fail safely. Repeated delivery of the same action ID returns its stored result rather than creating another task.

The repository abstraction writes the state change and its request receipt together through compare-and-swap. If acknowledgement is uncertain, it reloads and looks for that receipt. This covers local mutation idempotency; it is not an exactly-once guarantee for external services. Alerts and any future calendar writes need their own side-effect status and reconciliation.

## 7. Ask the question that changes the next move

A missing field does not automatically deserve a question. Use a decision rule: **will the answer materially change what can be safely saved or what the person can usefully do next?**

A new task at “seven” may need AM/PM. “Buy milk” does not need a reason. A vague desired life change may need an outcome question. A tiny chore probably does not. A purpose question is valuable when the person is choosing between meaningful priorities, but oppressive when asked for every entry.

Ask one blocking question at a time. Put the question beside the affected draft field. Offer two or three distinct answers, using short but meaningful labels. Keep “leave this as a draft” available. A generic “Skip” should never silently delete the ambiguous part of a compound request.

The narrow pilot can bind questions to unresolved fields such as time. Ambiguous target selection and conceptual outcome questions currently fall back to a conversational reply with no mutation. The raw thought remains available, but a dedicated target-picker and first-class conceptual-question continuation are important next improvements. Do not pretend the pilot already handles all such flows elegantly.

For a compound request, retain a draft of everything. Commit together by default. A later “save only the clear items” action can explicitly partition operations, but should display which items remain uncommitted and should not silently break dependencies. That partition action is specified here, not implemented in the current pilot.

## 8. Memory that earns familiarity

Build familiarity from records the person can inspect and correct. Separate explicit preferences, meaningful project context, current commitments, temporary session state, and hypotheses inferred from repeated interactions. Those categories must not all become one permanent biography.

The pilot implements approved memory candidates, exact evidence, timestamps, optional expiry, active-context exclusion and a Forget action. Relevant existing explicit memories are also available. It does not implement semantic deduplication, automatic contradiction resolution, encrypted memory deletion or a background consolidation service.

A proposed richer memory record should include its claim, category, source IDs, approval status, scope, validity period, superseded-by link and last verification time. Retrieval should select by relevance and current validity. The contextual payload should be small enough to inspect in a trace. Anthropic’s context-engineering guidance emphasises selecting the right information rather than continually expanding what is sent [R4].

A remembered preference such as “I like quiet mornings for writing” can justify a tentative suggestion. It cannot authorise creating an 8 am writing appointment. “You told me mornings usually work better; does that still fit?” is grounded. “I know you always sabotage your evenings” is an invented judgement.

Do not save transient distress as identity. Do not quietly import this ChatGPT conversation’s personal context into the app. A warm product can offer a brief onboarding conversation and a reviewable “How I can help” page. Memory settings should distinguish “stop using this” from “delete the source and backups,” because archiving is not erasure. The current kit’s Forget action is exclusion, not secure deletion.

## 9. Best friend plus RPM, without motivational pressure

The official RPM material frames planning through results, purpose and an action plan [R5]. Borrow that structure and its focus on personally meaningful outcomes; do not copy a celebrity’s persona or marketing guarantees.

The friend side listens, notices context, remembers corrections and permits rest. The coach side asks for a concrete outcome, identifies a likely high-leverage next step and checks whether the commitment is realistic. The assistant side distinguishes a suggestion from a promise and a promise from a completed action.

Use a light-touch opening, not repeated emotional analysis. “This matters because you want the children to understand” is appropriate when that purpose was supplied. “You are changing the destiny of a generation” is flattery that adds little operational value. Do not call every small task a breakthrough.

Make challenge intensity a user preference: gentle by default, more direct when requested. Even direct mode must not shame, manufacture urgency or refuse a decision to stop. The broader behaviour-change literature includes criticism of designing primarily for technology engagement rather than internalised motivation [R6]. Here the concrete product implication is to measure whether the user felt helped and chose a useful next step, not whether the assistant kept the conversation going.

## 10. A quieter, more truthful interface

Use one compact conversation surface and one evolving plan preview, not repeated giant cards after every sentence. In the widget, the last user thought, short reply, current draft and suggestion row matter more than dashboard navigation. On a larger screen, show the plan and conversation side by side. On mobile, put the companion and its immediate choices first, with detailed plan review reachable below.

The state language should be unmistakable: **Captured** means the original is durable. **Draft** means interpreted but not committed. **Needs an answer** marks a specific unresolved field. **Saved** requires a durable receipt. **Phone permission needed** is different from scheduled, delivered or read. **Earlier version** prevents old cards from masquerading as current truth.

Suggested and stated details need a label or icon as well as colour. This matters for colour-blind users and for anyone skimming. Use readable body text, visible keyboard focus, generous touch targets, reduced motion and an opaque high-contrast fallback for glass effects. Do not let decorative translucency carry critical meaning. Microsoft’s HAX library provides useful patterns for correction, dismissal, understandable behaviour and user control [R7].

The included preview uses a restrained dark surface with a readable serif heading and simple controls. It demonstrates interaction structure, not a replacement of every existing planner page. It has no downloaded fonts or dependencies. It deliberately labels its model as scripted.

## 11. Make speed a measured property

Measure capture acknowledgement, time to a usable draft, local-choice response, commit acknowledgement and correction time separately. A spinner appearing immediately is not proof the thought was saved. A streamed greeting is not a usable plan.

Proposed acceptance targets for a later measured pilot are: durable local acknowledgement and local chip interactions around 100 ms where device storage permits; a normal usable draft around two seconds median and five seconds at the 95th percentile; clear recovery rather than indefinite waiting. These are targets, not results obtained here. Low-end phones, provider routes and slow networks may require different thresholds.

Start by removing unnecessary round trips. Keep output compact. Retrieve only relevant context. Cache stable prompt prefixes where the chosen provider supports it, but do not assume shrinking a prompt alone produces large speed gains. Parallelise independent reads only when the route actually needs them. Cache calendar reads within one validation pass, not across later approvals.

Benchmark exact model/provider routes using the same cases. The fastest acceptable route is the one that meets intent, evidence and correction requirements at acceptable latency—not a particular model name chosen from reputation. The native allowlist must be updated deliberately alongside JavaScript configuration. Keep a route that fails strict-schema capability checks from silently downgrading its contract.

The new JavaScript harness ignores late results after cancellation or timeout. The existing native HTTP request may still continue. Implement a native request-ID cancellation map and disconnect the relevant connection; do not claim that work is already cancelled merely because the widget stopped waiting.

## 12. Evaluate the system the user experiences

The delivery includes 86 passing deterministic tests and 66 synthetic model-evaluation cases. These are different assets: the former exercise code under controlled fixtures; the latter are inputs and expectations for live testing and have not received a live-model score.

Use deterministic graders for IDs, state changes, duplicate prevention, source retention, draft revisions and Undo. Use semantic review for whether all intended actions were captured, none were invented, purpose is grounded and the question is worth asking. Use human judgement for warmth, pressure, relevance and whether the next step feels startable. Anthropic’s evaluation guidance separates transcripts from actual outcomes and recommends combining graders rather than treating a plausible reply as success [R8].

Track wrong-write rate, invented-task rate, omission rate, unnecessary-question rate, correction burden, first-pass success, p50/p95 usable-draft latency and cost per successful capture. Add a small voluntary “Did that reduce the effort?” measure. Do not treat accepted suggestions as proof they were good; acquiescence and hurried taps are possible.

The regression set must include negation, quoted fiction, third-party intentions, temporary emotion, several actions in one sentence, rapid corrections, duplicate names, stale buttons, midnight changes, unavailable calendars, offline restart, uncertain save acknowledgements and reminders without permissions. Expand it with redacted real failures only after consent. Report category-level failures rather than one flattering aggregate score.

## 13. The implementation order

First repair visible trust problems and collect a baseline. Then put the capture journal and draft controller behind a feature flag. Keep the canonical planner and native store. Add typed actions, exact receipts and full pending review. Integrate the shadow sort preview. Next connect the chosen provider and benchmark it. Only then expand memory, deeper coaching and optional low-risk auto-save.

The kit is intentionally a working pilot plus a source-specific integration path, not a claim that every production concern has been solved. The remaining major gates are shared runtime state ownership, native cancellation, exact date preview/refresh, memory retention and deletion, full target-choice continuations, production accessibility, physical-device tests and live-model evaluation. `INTEGRATION.md` and `START_HERE_IMPLEMENT.md` turn those gates into concrete work.

The desired end state is not an assistant that fills every RPM field. It is an assistant that recognises when a thought needs a home, when a plan needs a question, when a person needs gentleness, and when the best next interaction is simply a reliable Save.

---

## Sources and audit index

Research sources below are primary documentation or original research. Accessed 16 September 2026. Their principles inform the design; none validates this implementation’s live accuracy or behavioural benefit.

[R1] Anthropic. *Building effective agents.* https://www.anthropic.com/engineering/building-effective-agents

[R2] OpenAI. *Latency optimization.* https://developers.openai.com/api/docs/guides/latency-optimization

[R3] OpenRouter. *Structured outputs.* https://openrouter.ai/docs/guides/features/structured-outputs

[R4] Anthropic. *Effective context engineering for AI agents.* https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

[R5] Tony Robbins. *How to make a Massive Action Plan (MAP).* https://www.tonyrobbins.com/blog/how-to-make-a-massive-action-plan-map

[R6] Alberts, L., Lyngs, U., & Lukoff, K. (2024). *Designing for Sustained Motivation: A Review of Self-Determination Theory in Behaviour Change Technologies.* https://arxiv.org/abs/2402.00121

[R7] Microsoft. *HAX Design Library.* https://www.microsoft.com/en-us/haxtoolkit/library/

[R8] Anthropic. (2026). *Demystifying evals for AI agents.* https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents

### Pinned repository files

All findings refer to the commit above, not whatever `main` contains later. Use the named functions to locate statements; this avoids fragile line numbers in minified source.

- [Agent loop and prompt](https://github.com/evamuse1236/RPM-Glass/blob/22604e683362e7edd3cbf6e0297ce4dd55a4ce73/chat-prototype/companion-agent.mjs): `instruction`, `createCompanionAgent`.
- [Legacy tools, evidence and initial context](https://github.com/evamuse1236/RPM-Glass/blob/22604e683362e7edd3cbf6e0297ce4dd55a4ce73/chat-prototype/companion-tools.mjs): `schemas`, `initialContext`, `propose`, `undo`.
- [Planner transactions](https://github.com/evamuse1236/RPM-Glass/blob/22604e683362e7edd3cbf6e0297ce4dd55a4ce73/android-companion/planner-tools.mjs): `changePlanner`, `plannerSummary`, `plannerInstruction`.
- [Grouping and canonical state](https://github.com/evamuse1236/RPM-Glass/blob/22604e683362e7edd3cbf6e0297ce4dd55a4ce73/android-companion/planner-state.mjs): `editPlan`, `aiDraft`, `acceptDraft`, `dismissDraft`.
- [Purpose and grouping model requests](https://github.com/evamuse1236/RPM-Glass/blob/22604e683362e7edd3cbf6e0297ce4dd55a4ce73/android-companion/planner-ai.mjs): `planningContext`, `relevantContext`, `planningRequest`.
- [Shared conversation UI](https://github.com/evamuse1236/RPM-Glass/blob/22604e683362e7edd3cbf6e0297ce4dd55a4ce73/chat-prototype/app.js): `suggestions`, `renderChat`, `render`.
- [Typed actions already present](https://github.com/evamuse1236/RPM-Glass/blob/22604e683362e7edd3cbf6e0297ce4dd55a4ce73/android-companion/capture-actions.mjs): `goalDraftAction`, `resolveCaptureAction`.
- [Runtime bridge](https://github.com/evamuse1236/RPM-Glass/blob/22604e683362e7edd3cbf6e0297ce4dd55a4ce73/android-companion/runtime.mjs): `native`, `save`, `/api/turn` interception.
- [Calendar and recurrence validation](https://github.com/evamuse1236/RPM-Glass/blob/22604e683362e7edd3cbf6e0297ce4dd55a4ce73/android-companion/planner-chat.mjs): `phoneProposal`, `scheduleChecks`.
- [Native model transport](https://github.com/evamuse1236/RPM-Glass/blob/22604e683362e7edd3cbf6e0297ce4dd55a4ce73/app/src/main/java/com/rpm/prototype/CompanionActivity.java): `Bridge.invoke`, `model`.
- [Durable store](https://github.com/evamuse1236/RPM-Glass/blob/22604e683362e7edd3cbf6e0297ce4dd55a4ce73/app/src/main/java/com/rpm/prototype/CompanionStore.java): `write`, `writeRaw`, `validate`.
