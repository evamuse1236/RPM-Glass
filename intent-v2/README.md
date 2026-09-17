# RPM: from a thought to a next step
## Research, source hotfixes, and a runnable planning-harness pilot

Prepared for Sunny, 16 September 2026. Audited repository: `evamuse1236/RPM-Glass`, commit `22604e683362e7edd3cbf6e0297ce4dd55a4ce73`.

**Start with the interactive preview, then read `docs/RESEARCH_AND_REDESIGN.md`. For implementation, give your coding agent `START_HERE_IMPLEMENT.md` and this entire folder.**

This is a source implementation kit, not an APK and not a claim that the new system is already integrated into your app. The repository was read through GitHub. No branch was changed, no real personal records were edited, and no live model calls were made.

### Run it

Requires Node 20 or later. The kit has no npm dependencies.

```bash
cd RPM-Glass-v2-kit
npm test
npm run demo
```

Open the localhost address printed by the demo server. Alternatively, open `demo/standalone.html` directly in a modern browser. Browser security settings can restrict module imports or storage for local files; use the local server in that case. The standalone page uses the same harness code, with a clearly labelled **scripted model**, not a hidden live AI.

The demo has lesson planning, a simple task, reflection, a memory preference, editable draft fields, typed suggestion buttons, save, Undo, and an example correction. Demo plans stay in that browser when storage is available. It never connects to your actual RPM data or schedules a real alert. The browser-storage adapter is for the demo only, not a multi-tab production database.

### What is included

| Folder or file | Use | Delivery status |
|---|---|---|
| `docs/RESEARCH_AND_REDESIGN.md` | Source audit, research, target experience and architecture | Completed research/design |
| `START_HERE_IMPLEMENT.md` | Phased handoff for a coding agent working in your actual repository | Ready to use |
| `patches/` | Three source-verified hotfix specifications and a hash-guarded installer | Installer and snippet tests implemented; not applied to the full repo here |
| `src/` | Capture journal, strict schema, bounded context, draft merge, typed actions, guarded commit, memory consent, sort preview | Runnable reference implementation |
| `adapters/` | OpenRouter/native transport and wrapper around existing `changePlanner`/`undo` functions | Source-contract integration adapter; actual-repo smoke remains to run |
| `prompts/` | Interpreter, coaching, review, and memory prompts | Ready for evaluation |
| `demo/` | Responsive interaction prototype and standalone HTML | Browser-smoke checked |
| `test/` | Deterministic harness, adapter-stub, preview, patch, and evaluator tests | 86 passed in delivery environment |
| `evals/` | 66 original synthetic cases, simple grader, opt-in live runner | Cases/runner delivered; live scores not measured |
| `docs/INTEGRATION.md` | Exact call sites, native constraints, migration and rollback | Required before production |
| `docs/EVALUATION.md` | What was tested, release gates, known limits, measurement plan | Required before release |

### Immediate source hotfixes

Use a branch and a backup/export first. The installer refuses to write if any of the three source hashes differs from the inspected commit; it does not force a merge onto your newer work.

```bash
node patches/apply-hotfixes.mjs --repo /path/to/RPM-Glass --check
node patches/apply-hotfixes.mjs --repo /path/to/RPM-Glass --apply
```

Review the diff, run the original repo tests, and rebuild its bundled Android assets. These hotfixes remove the anti-coaching wording, stop truncating labels, make the latest user message and pending review accessible in compact chat, correct the purpose label, and stop adding generic goal ideas to every established conversation. They are **not** the full v2 harness installation.

### Evaluate a real model, deliberately

```bash
node evals/run-live.mjs
# Dry run only. To actually call your configured provider:
node evals/run-live.mjs --run --limit 10
# Optional full synthetic set, explicitly authorising 66 requests:
node evals/run-live.mjs --run --all --save-outputs
```

Set `OPENROUTER_API_KEY`, `RPM_MODEL`, and optionally `RPM_PROVIDER` in the shell first. There is no default paid model or key. The runner does not auto-load `.env` files. Provider charges apply only to explicit live runs. `--save-outputs` records synthetic model replies locally for human review; do not substitute private user messages without reviewing logging and consent.

### Important boundaries

The main pilot always reviews model-created drafts before canonical commit. It captures original words immediately; it does not yet auto-commit simple natural-language requests. It does not replace your time parser, alarms, calendar integration, database, or full planner UI. It does not run a memory-consolidation service, calendar writes, push notifications, agent swarms, or genuine “knows you forever” inference. Native cancellation, model-route configuration, shared state ownership, phone accessibility, storage retention and live quality testing remain implementation/release work.

### RPM integration rollout

RPM now includes the harness as an optional **Glass review pilot** under Settings → Thought capture. Classic remains the default because it still owns check-ins, app controls and the approved-memory flow. Glass uses the same canonical planner, local date parser, Android alert reconciliation and Undo transaction; an interpretation failure retains the raw capture and does not trigger an automatic Classic write.
