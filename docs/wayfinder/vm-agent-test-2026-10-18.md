# VM agent-loop test, 2026-10-18 (oracle-vm, 954 MB RAM, 1/8 core)

Model changed mid-test: no OpenRouter key appeared in 9 min; the coordinator supplied an Anthropic key. Used Pi's anthropic provider, claude-haiku-5-5, thinking off. All numbers measured unless marked inferred.

## Baseline
- 954 MB RAM (428 used, 525 available at start), 2 GB swap (15 MB used), nproc 2, disk 48 GB (4.9 GB used). No Node at start.

## Network latency to https://openrouter.ai/api/v1/models, 20 samples (ms, median / p90)
| | VM | Windows PC |
|---|---|---|
| DNS | 1 / 1 | 13 / 19 |
| TCP connect | 2 / 3 | 29 / 45 |
| TLS done | 89 / 100 | 56 / 85 |
| first byte | 106 / 120 | 79 / 131 |
| total | 124 / 149 | 197 / 276 |
The VM is faster than the PC overall (datacenter link). Files: vm.txt, pc.txt.

## Install
- Pi's install script needs a terminal to install Node, so Node 22.23.3 was installed from nodejs.org with its checksum (17.5 s), then the real pi.dev/install.sh ran (36.8 s). Total about 55 s. Pi 1.3.0.
- Disk: Pi 153 MB (~/.pi) + Node 203 MB (~/.local/node) = about 356 MB.
- Idle: `pi --version` peak RSS 114 MB, 1.5 s wall.
- The install script was read before running (apt/standalone Node path, npm install --ignore-scripts, no sudo needed).

## Plain model call (curl, api.anthropic.com/v1/messages, 20 max tokens, 10 samples)
Time to first/total byte: median 0.81 s, range 0.75 to 1.12 s. Connect+TLS about 50-90 ms.

## Agent loop (task: write file, read, wc -w, append, print; 5 turns, 4 tool calls)
| run | wall | tool calls | peak RSS (process tree) | peak swap | correct |
|---|---|---|---|---|---|
| 1 | 16.2 s | 4 | 120 MB | 22 MB (unchanged from start) | yes (23 words, count correct) |
| 2 | 10.7 s | 4 | 119 MB | 22 MB | yes (28, correct) |
| 3 | 10.6 s | 4 | 120 MB | 22 MB | yes (23, correct) |
Run 1 was slower, probably a slow first API call or cold cache (inferred).
Timed run 4 (timed.txt): startup to first turn 1.5 s; model time per turn 1.9, 1.2, 1.3, 1.9, 1.3 s (sum 7.8 s of 9.4 s total); tool execution about 0.03 s each. Pi overhead per turn is under 0.05 s after the 1.5 s start (measured); the rest is model latency.
Sampling used ps every 0.5 s (sample.sh), so a spike shorter than 0.5 s could be missed.

## Verdict
- Latency: network from the VM is fine (124 ms median to OpenRouter). A 5-turn loop takes about 10 s, almost all model time. PASS.
- Loop runs: 3 of 3 correct. Peak 120 MB vs 954 MB; swap not used. PASS.
- Not tested: OpenRouter/DeepSeek (no key), PicoClaw (Pi worked, so not needed), long contexts, many tools, concurrent runs.
