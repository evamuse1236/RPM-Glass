# Can an agent loop run on the small VM, fast enough?

Type: wayfinder:task (AFK) · Stream: agent · Status: closed · Assignee: claude · Blocked by: none

## Question

Does Pi install and run a 4+ tool-call loop on oracle-vm (954 MB) 3 of 3 times, and what are the latencies (network, model call, Pi overhead per turn) and peak memory? If Pi fails, the same for PicoClaw.

Evidence lands in `../../vm-agent-test-2026-10-18.md`.

## Resolution (2026-10-18)

Passed. Pi 1.3.0 with `claude-haiku-5-5` (Anthropic key; no OpenRouter key was available) finished a 5-turn, 4-tool-call task correctly 3 of 3 times on oracle-vm. Peak memory ~120 MB of 954 MB, no swap. A full loop took 10.6–16.2 s, almost all of it model time; Pi adds ~1.5 s at start and under 0.05 s per turn. The VM reaches the API faster than the PC (median 124 ms vs 197 ms). Install: Node 22 + Pi, ~55 s, ~356 MB disk. Not tested: long contexts, many tools, concurrent runs, Telegram. Detail: [vm-agent-test-2026-10-18](../../vm-agent-test-2026-10-18.md). Also checked and rejected: grokbot ([grokbot-evaluation](../research/grokbot-evaluation.md)): a one-person Telegram bridge over xAI's coding CLI, xAI key by default, 250–400 MB guessed.
