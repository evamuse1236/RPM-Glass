#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${JAVA_HOME:-}" && -d .tooling/jdk-17.0.20.1+1 ]]; then export JAVA_HOME="$PWD/.tooling/jdk-17.0.20.1+1"; fi
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$PATH"
gradlew="${GRADLEW:-./gradlew}"
tasks=(assembleDebug lintDebug assembleDebugAndroidTest)
if [[ -z "${CLAUDE_CODE_REMOTE_SESSION_ID:-}" ]]; then exec "$gradlew" --no-daemon "${tasks[@]}"; fi
log="$(mktemp)"
for attempt in 1 2 3 4; do
  if "$gradlew" --no-daemon --max-workers=2 "${tasks[@]}" 2>&1 | tee "$log"; then rm -f "$log"; exit 0; fi
  grep -qE '429|Too Many Requests|Could not (GET|HEAD|download|resolve)' "$log" || { rm -f "$log"; exit 1; }
  echo "build-debug: Maven rate limit (attempt $attempt of 4); retrying in $((attempt * ${RETRY_SECONDS:-20})) s" >&2
  sleep $((attempt * ${RETRY_SECONDS:-20}))
done
rm -f "$log"
exit 1
