# Capture pipeline rules

These supplement [Capture rules](capture.md).

| Rule | Enforced by |
|---|---|
| One capture reuses one loaded store while every write keeps its version check and uncertain saves reload to reconcile. Exact words and one Undo survive. | `android-companion/capture-pipeline.test.mjs`, `intent-v2/test/capture-store.test.mjs` |
| A calendar refresh overlaps the model, which sees the page's latest calendar copy; saving still checks the calendar. | `intent-v2/test/calendar-parallel.test.mjs`, canonical calendar guards in `createRpmPlanAdapter` |
| Capture warms a shared HTTP pool without a model prompt. Streamed text only previews complete titles, raw times and numeric minutes in changed `partial` lists at least 150 ms apart. Only a valid final object emits `ready` and can save operations. Keyless, non-streaming and reused preview reads retain their save and Undo paths. | `ModelHttpClientTest.java`, `ModelStreamTest.java`, `intent-v2/test/streaming.test.mjs`, `intent-v2/test/model-services.test.mjs`, `android-companion/capture-pipeline.test.mjs`, `android-companion/capture-preview.test.mjs` |
