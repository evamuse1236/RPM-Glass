# Intent harness

Capture interpretation used by the Android app. It turns a captured thought into a reviewable draft and commits only what the person accepts. It started as a vendored kit (2026-09-16); Git history keeps the original kit's docs, patches and checksums.

- `src/`: the harness, context building, schema validation, follow-up questions, Jev sort previews and model policy. Bundled into the Android runtime.
- `adapters/rpm-glass.mjs` and `adapters/transport.mjs`: the planner adapter and the native model transport. Also bundled.
- `prompts/intent-system.mjs`: the system prompt. Also bundled.
- `test/`: deterministic tests. Run `node --test intent-v2/test/*.test.mjs` from the repository root.
