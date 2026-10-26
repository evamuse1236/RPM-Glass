import snapshot from "../../web/fixtures/snapshot.json" with { type: "json" };
import { createCaptureAgent } from "../../android-companion/capture-agent.mjs";
import { createIntentService } from "../../android-companion/intent-service.mjs";
import { createTraceStore } from "../../android-companion/capture-trace.mjs";
import { changePlanner } from "../../android-companion/planner-tools.mjs";
import { editPlan } from "../../android-companion/planner-state.mjs";
import { freshStore } from "../../chat-prototype/companion-state.mjs";
import { undo } from "../../chat-prototype/companion-tools.mjs";
import { createMemoryBackend } from "../../intent-v2/src/repository.mjs";
import { sourceUnits } from "../../intent-v2/src/context.mjs";

import { receiptLines } from "../../android-companion/capture-receipt.mjs";

// Shared disposable probe: deterministic model, in-memory save and lost-ack replay.
export async function runCaptureSpike({ text, timezone, now }) {
  const clock = () => new Date(now);
  if (!Number.isFinite(+clock())) throw new Error("Invalid now");
  const seed = { ...freshStore(), ...structuredClone({
    entries: snapshot.entries, planner: snapshot.planner,
  }) };
  const memory = createMemoryBackend(seed);
  let lostAckRecovered = false;
  const backend = { load: memory.load, save: async (expected, next) => {
    await memory.save(expected, next);
    if (!lostAckRecovered && Object.values(next.intentV2?.drafts ?? {}).some(draft => draft.status === "committed")) {
      lostAckRecovered = true;
      throw new Error("Spike: acknowledgement lost after the committed save");
    }
  } };
  let modelCalls = 0;
  const model = async () => {
    modelCalls++;
    return {
      schemaVersion: 1, mode: "capture", draftMode: "new", reply: "",
      decisions: sourceUnits(text).map(unit => ({
        sourceId: unit.id, disposition: "action", note: null,
      })),
      operations: [{
        opId: "bank", sourceId: "s0", kind: "create", entity: "task", targetId: null,
        fields: [
          { name: "title", op: "set", value: "Call the bank", origin: "stated", evidence: "call the bank" },
          { name: "time", op: "set", value: "tomorrow at 5pm", origin: "stated", evidence: "tomorrow at 5pm" },
        ],
      }],
      question: null, clarification: null, memoryCandidates: [], card: null,
    };
  };
  let traceJSON = "[]";
  const traces = createTraceStore({ clock, storage: {
    getItem: () => traceJSON,
    setItem: (_key, value) => { traceJSON = value; },
  } });
  const service = createIntentService({
    backend, model, changePlanner, editPlan, undo, clock, timezone,
    readCalendar: async () => ({ status: "unavailable", events: [] }),
  });
  const input = { messageId: "spike-bank", conversationId: seed.conversations[0].id, text };
  const agent = createCaptureAgent({ service, traces, clock });
  const result = await agent.capture(input);
  // Recreate the service after save to test replay without its in-process cache.
  const resumed = createIntentService({
    backend, model, changePlanner, editPlan, undo, clock, timezone,
    readCalendar: async () => ({ status: "unavailable", events: [] }),
  });
  const replay = await createCaptureAgent({ service: resumed, traces, clock }).retry(input.messageId);
  const after = await backend.load();
  const tasks = after.entries.filter(entry => !seed.entries.some(old => old.id === entry.id));
  const draft = after.intentV2?.drafts[result.draftId];
  return {
    tasks: tasks.map(({ title, planned, plannedDate }) => ({ title, planned, plannedDate })),
    draftStatus: draft?.status ?? null,
    appliedStatus: result.applied?.status ?? null,
    replayStatus: replay.applied?.status ?? null,
    lostAckRecovered,
    modelCalls,
    rawKept: after.intentV2?.captures[input.messageId]?.raw === text,
    traceCount: traces.list().length,
    receiptText: receiptLines(after, draft, clock()).map(row => [row.verb, row.title, row.when, row.where].filter(Boolean).join(" · ")),
    timezoneDuring: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offsetMinutes: clock().getTimezoneOffset(),
  };
}
