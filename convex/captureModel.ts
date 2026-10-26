"use node";
// @ts-expect-error Shared API transport is JavaScript.
import { apiCall } from "../scripts/capture-stress/api.mjs";
// @ts-expect-error Shared model adapter is JavaScript.
import * as claude from "../intent-v2/adapters/claude.mjs";
// @ts-expect-error Shared model schema is JavaScript.
import * as schema from "../intent-v2/src/schema.mjs";
// @ts-expect-error Shared transport is JavaScript.
import * as transport from "../intent-v2/adapters/transport.mjs";
// @ts-expect-error Shared prompt is JavaScript.
import { intentSystemPrompt } from "../intent-v2/prompts/intent-system.mjs";
export async function interpret(input:any, options:any) {
  const {output,record}=await apiCall({prompt:intentSystemPrompt,input,route:options.route,deadline:options.deadline,signal:options.signal,adapters:{claude,schema,transport}});
  Object.assign(options.run,{service:"anthropic",provider:"API transport",servedModel:record.servedModel});
  return output;
}
