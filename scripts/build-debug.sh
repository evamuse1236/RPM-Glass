#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -z "${JAVA_HOME:-}" && -d .tooling/jdk-17.0.20.1+1 ]]; then export JAVA_HOME="$PWD/.tooling/jdk-17.0.20.1+1"; fi
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$PATH"
./gradlew --no-daemon assembleDebug lintDebug assembleDebugAndroidTest
