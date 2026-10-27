#!/usr/bin/env bash
envs=(--env ANTHROPIC_API_KEY=anthropic --env OPENROUTER_API_KEY=openrouter-rpm)
secret has gemini-api >/dev/null 2>&1 && envs+=(--env GEMINI_API_KEY=gemini-api)
exec secret run "${envs[@]}" -- node "$(dirname "$0")/${RAMBLE_SCRIPT:-live.mjs}" "$@"
