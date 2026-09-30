# RPM model review — 27 September 2026

**Follow-up completed:** [Full 73-case none-versus-high comparison](luna-full-comparison.md). On 146 new requests, reviewed success was 69/73 for none and 72/73 for high; none was 35% faster at the median and 49% cheaper. This broader result qualifies the initial seven-case recommendation below. Defaults remain unchanged.

DeepSeek V4.1 Flash remains a strong candidate for RPM's cost-conscious interpretation and tool use. The evidence does not establish it as the unique best choice. Model, provider, reasoning mode, schema support and latency must be evaluated together. This combines sampled primary-source research with the small live RPM comparison below; it is not an exhaustive market ranking.

## What this checkout actually uses

- CLI interpretation: `deepseek/deepseek-v4.1-flash`, non-thinking, JSON-object output, local validation, preference for the DeepSeek provider. See [CLI transport](../../cli/openrouter.mjs).
- Android Capture: `openai/gpt-5.6-luna`, strict JSON-schema output. See [intent service](../../android-companion/intent-service.mjs) and [transport](../../intent-v2/adapters/transport.mjs). The Capture harness uses a 12-second interpretation budget with at most one repair. It receives a proposed transaction, then local code validates dates, targets and approval.
- Retained Classic chat and planning assistance: `openai/gpt-5.6-luna`; medium reasoning and tool calls. See [companion agent](../../chat-prototype/companion-agent.mjs) and [planning requests](../../android-companion/planner-ai.mjs).
- Explicit Sort with Jev: `typesafe/jev-1.13`, a separate grouping route.

These are source settings, not a measurement of the APK installed on the physical phone. No default model or provider was changed. The native request allowlist also accepts GPT-6 Luna for the requested evaluation. The screenshot's rejected range was a deterministic local parser rule, so swapping an LLM would not fix it.

## Small live RPM sample

After the follow-up request, 56 paid calls were made through the owned emulator's existing encrypted OpenRouter connection. Only synthetic data was sent; no credential was extracted. The final comparison contains 49 calls: seven identical cases at each configuration. Seven initial tool-probe calls were excluded because the probe omitted the app's explicit `strict:false` setting. All seven tool probes were rerun after correcting it. Total provider-reported usage cost, including discarded probes: **$0.020284**.

| Model / reasoning | Passed | Median time | Slowest | Cost, all 7 |
| --- | ---: | ---: | ---: | ---: |
| GPT-5.6 Luna / medium | 6/7 | 3.18 s | 5.42 s | $0.003835 |
| GPT-6 Luna / none | 7/7 | 1.89 s | 2.96 s | $0.001172 |
| GPT-6 Luna / low | 5/7 | 2.54 s | 3.83 s | $0.001442 |
| GPT-6 Luna / medium | 6/7 | 2.67 s | 4.45 s | $0.001726 |
| GPT-6 Luna / high | 7/7 | 3.23 s | 6.25 s | $0.002052 |
| GPT-6 Luna / xhigh | 7/7 | 3.74 s | 9.44 s | $0.002680 |
| GPT-6 Luna / max | 6/7 | 8.00 s | 19.35 s | $0.004838 |


The six Capture cases covered the reported WID range, ambiguous AM/PM, two actions in one request, correcting an existing task while retaining its day/duration, an explicit non-action, and a linked project/block/task with purpose and a time range. They used the real Capture prompt, schema, context builder, interpretation validator and local scheduling preview at a fixed reference time in Asia/Kolkata. The seventh was an isolated `change_planner` function-call probe, using the app's schema and tool setting. Its output was applied only to a synthetic in-memory store through the real planner. This was not a full multi-turn Classic assistant evaluation.

Inputs, token caps and provider routing were identical across configurations except for model ID and reasoning effort. Capture used its production 3,000-output-token cap; the tool probe used 3,500. Requests were sequential, with configuration order rotated across Capture cases. The response model and OpenAI provider were checked and recorded. Calls ran to the native transport limit so late/truncated replies could be inspected; Capture's actual 12-second harness deadline was checked separately. No automatic repair or retry was applied. All six Capture outputs from none, high and xhigh passed within 12 seconds.

Quality checks covered structure, exact evidence, target IDs, invented optional fields, complete actions/hierarchy, local start/end/duration, and ambiguity handling. Replies and operation summaries were manually reviewed. That review caught the GPT-5.6 Luna baseline saying PM despite its unresolved time field. The local parser blocked saving, but the reply was misleading, making its final score 6/7 rather than the provisional contract-only 7/7.

Other failures: GPT-6 Luna low collapsed two tasks into duplicate title fields and omitted a hierarchy link. Medium supplied unsupported evidence for a hierarchy link. Max exhausted its output budget on the two-task case, returning no usable interpretation after 19.35 seconds. High and xhigh passed, but cost more and took longer than none. All corrected tool probes passed the real planner.

**Finding: GPT-6 Luna with reasoning off was approximately 40.5% faster at the median and 69.4% cheaper than the current GPT-5.6 Luna medium baseline.** Reported cost includes cache behavior and usage charges; it is not a forecast. An illustrative no-cache calculation for the six Capture cases at published standard input/output rates still favors none by about 62%, so the saving is not solely a cache-hit artifact.

This is one attempt per case/level, not a stable accuracy estimate or proof that less reasoning always works better. No repeated trials, live DeepSeek comparison, physical-phone latency measurement or multi-turn tool benchmark was performed. The current sample supports **GPT-6 Luna with reasoning off as the next Capture model candidate**, with existing local validation and review preserved. No app default was switched.

Reproduce with `node scripts/compare-luna-native.mjs --run` on an owned, backed-up emulator with an existing key and debuggable Capture window. [Evaluator](../../intent-v2/evals/luna-sample.mjs), [runner](../../scripts/compare-luna-native.mjs), [final per-call results](../../output/parser-2026-09-27/luna-sample/results.jsonl), [aggregates](../../output/parser-2026-09-27/luna-sample/summary.json). Initial and corrected tool-probe results remain alongside them.

## Comparable listed rates

USD per million tokens, ordinary synchronous text requests, below long-context surcharges. Cached-input rates are separate from uncached input. Provider-specific prices matter: the cheapest model-page headline is not necessarily the route RPM uses.

| Model and route | Input | Output | Cached input | Relevance |
| --- | ---: | ---: | ---: | --- |
| DeepSeek V4.1 Flash / DeepSeek, off-peak | $0.15 | $0.60 | $0.003 | Existing CLI preference |
| DeepSeek V4.1 Flash / DeepSeek, peak | $0.30 | $1.20 | $0.006 | Weekday peak pricing |
| GPT-5.6 Luna / OpenAI standard | $0.20 | $1.20 | $0.020 | Current Android model |
| GPT-6 Luna / OpenAI standard | $0.10 | $0.50 | $0.010 | Cheaper direct schema/tool candidate |
| GLM-5.3 Flash / Z.AI | $0.15 | $0.50 | $0.030 | Serious budget competitor |
| Qwen3.8 Flash / Alibaba | $0.15 | $0.47 | $0.016 | Additional budget candidate |

Sources checked live: [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/), [GPT-5.6 Luna providers](https://openrouter.ai/openai/gpt-5.6-luna), [GPT-6 Luna providers](https://openrouter.ai/openai/gpt-6-luna), [GLM endpoint catalog](https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flash/endpoints), [Qwen providers](https://openrouter.ai/qwen/qwen3.8-flash).

The OpenRouter catalog also lists cheaper third-party endpoints: DeepSeek at $0.035/$0.29 and a promotional GLM endpoint at $0.045/$0.14. Those are different provider routes, not DeepSeek's own or Z.AI's own rates. Promotions, endpoint support and service behavior need separate evaluation. [DeepSeek endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints), [GLM endpoints](https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flash/endpoints).

For an illustrative uncached 2,000-input / 400-output-token request, ignoring reasoning, retries, fees and tools: current Luna costs $0.00088, DeepSeek off-peak $0.00054, GPT-6 Luna $0.00040, and GLM $0.00050. These are arithmetic examples, not observed RPM bills. Additional reasoning tokens and repair calls can change the ranking.

## Capability and the Pareto claim

Artificial Analysis's own current evaluations report an Intelligence Index of about 39 for DeepSeek V4.1 Flash at max reasoning, 42 for GLM-5.3 Flash, and 37 for GPT-6 Luna at max. DeepSeek's measured output speed is substantially higher than GLM's on those evaluated routes. Thus GLM challenges DeepSeek on capability and price, while DeepSeek retains a speed tradeoff. These measurements do not prove either model wins on RPM's short extraction requests, and max-reasoning scores cannot be attributed to the CLI's non-thinking configuration. [DeepSeek evaluation](https://artificialanalysis.ai/models/deepseek-v4-1-flash), [GLM evaluation](https://artificialanalysis.ai/models/glm-5-3-flash), [Luna evaluation](https://artificialanalysis.ai/models/gpt-6-luna).

A Pareto frontier depends on chosen dimensions. A model can be attractive for capability/latency/cost without being the highest-scoring or cheapest. For RPM the useful dimensions are correct proposed changes, no invented schedules or targets, success within the phone's deadline, and total cost after retries. Public coding or broad intelligence scores do not establish that frontier.

## The compatibility issue that matters here

The live OpenRouter endpoint catalog advertises tool calls and `response_format` on DeepSeek's own endpoint, but does **not** advertise `structured_outputs` there. Other hosts serving the same DeepSeek model do advertise it. Android Capture currently requires strict JSON-schema output with parameter support enforced. A plain model-ID substitution is therefore not a verified equivalent route. GPT-6 Luna's standard OpenAI endpoint advertises both strict structured outputs and tools. GLM has the same distinction between its own endpoint and some third-party schema-capable hosts. [DeepSeek endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints), [Luna endpoints](https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints), [GLM endpoints](https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flash/endpoints).

For Android's current task, structured extraction is more directly relevant than unconstrained multi-step tool use. Local parsing, evidence validation, transaction guards and review remain necessary with every model. Jev sorting is a different function; this comparison does not justify replacing it.

## Recommendation

Keep DeepSeek V4.1 Flash as the CLI default for now. It remains a sensible low-cost choice; this research provides no reason to replace it immediately.

For Android Capture, the live sample favors GPT-6 Luna with reasoning off. I recommend it as the next model to trial on a larger capture set, with the existing validation and review controls. High and xhigh did not buy additional correctness on this sample. DeepSeek remains worth a matched evaluation through a verified schema-capable route; no direct DeepSeek-versus-GPT-6 live comparison was run here.

The repository has a 66-case synthetic live evaluation runner at `intent-v2/evals/run-live.mjs`. A larger follow-up can combine that set with the new range/correction sample and repeated identical prompts through each exact route. Score correct task/target/time/duration, schema failures, unnecessary questions, retries, p50/p95 total response time, and provider-reported total cost per correct interpretation. All model output should still pass through the real local parser and commit guards. Existing coarse schema checks alone are insufficient to select a winner.

The shell had no configured API key or key-file variable. The later live evaluation used the emulator's existing encrypted key through the native bridge without reading it into the scripts. Physical-phone behavior was not measured.
