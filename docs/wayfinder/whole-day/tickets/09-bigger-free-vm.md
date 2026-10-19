# Get Oracle's free Ampere A1 VM (only if the small VM fails)

Type: wayfinder:task (HITL) · Stream: agent · Status: closed · Assignee: claude · Blocked by: 01-vm-agent-loop-test

## Question

If ticket 01 fails on memory or CPU: try to create a free Ampere A1 instance (needs your OK: it changes Oracle settings). If capacity never appears, decide on a paid VPS. Close as not needed if 01 passes.

## Resolution (2026-10-18)

Not needed: the small VM passed ticket 01 with ~120 MB peak. Revisit only if real use (long contexts, many tools) outgrows it.
