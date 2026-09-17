# Clarity and Glass integration

The supplied Clarity pack contributes a readable agenda, quieter result grouping, distinct completion controls, light/dark/system appearance and keyboard/large-text treatment. Glass contributes durable capture before interpretation, typed draft revisions, explicit approval, atomic receipts and sorting previews that do not rearrange saved plans before acceptance.

## Integration contract

- Preserve the existing v0.11 usability work: direct saved-item Open, goal source words and drafts, integrated Settings, explicit movement rather than drag gestures, widget text scale and accessible navigation.
- Keep the Android WebView, native encrypted credentials, CSP, canonical planner transactions and local store. No demo data or kit installers enter the APK.
- Clarity changes presentation and day layout; Glass drafts remain separate from canonical plans until Save. Model prose cannot establish a save or notification delivery.
- Use the existing model route. Classic remains the default capture path for this release; Glass review is an explicit Settings choice while check-ins, app controls and approved-memory flow remain Classic-only. A Glass failure keeps the raw thought for Retry and never falls back to a Classic write automatically. Do not enable automatic task saves or inferred personal memory.
- Register native model work by request ID before queuing, cancel its connection on abort, and stop outstanding network work when its Activity closes.
- Keep legacy pending changes explicit; do not reinterpret them as approved Glass drafts.

## Verification plan

Baseline: 182 existing Node tests pass. Pre-task source snapshot is `/tmp/rpm-before-kits-20260916`; initial uncommitted work is preserved on `feat/clarity-glass-20260916`.

Run the vendor deterministic suite against the real planner modules, targeted runtime and native cancellation regressions, full relevant JavaScript suites, Android assemble/lint/instrumentation, and actual emulator flows. Inspect populated Daily/RPM/Projects/Life/Settings, light/dark, narrow/landscape/200% text, keyboard editing, source/draft/save/Open/Undo and offline/retry behavior. Back up emulator private data before synthetic fixtures and restore it afterward.

Native networking reference: [Android HttpURLConnection](https://developer.android.com/reference/java/net/HttpURLConnection). Connection cancellation is tested separately from whether a provider stops billing already accepted work.

Final evidence, limitations, file list and rollback instructions will be recorded in the verification report.
