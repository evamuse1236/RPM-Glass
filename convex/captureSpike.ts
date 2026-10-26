// @ts-nocheck -- Spike imports the untyped phone runtime; remove with the unit 6 adapter.
"use node";

import { v } from "convex/values";
import { isMainThread } from "node:worker_threads";
import { internalAction } from "./functions";
import { runCaptureSpike } from "../scripts/web-sync/capture-run.mjs";
import { withTimeZone } from "../android-companion/zoned-time.mjs";

// Disposable integration probe: no database writes, network model or phone bridge.
export const run = internalAction({
  args: { text: v.string(), timezone: v.string(), now: v.string() },
  handler: async (_ctx, args) => {
    const timezoneBefore = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const result = await withTimeZone(args.timezone, () => runCaptureSpike(args));
    return { ...result, timezoneBefore, isMainThread };
  },
});
