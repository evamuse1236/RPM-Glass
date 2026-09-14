#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
SDK_PATH="${ANDROID_HOME:-/home/darax/.cache/rpm-android/sdk}"
if [[ -z "${JAVA_HOME:-}" && -d /home/darax/.cache/rpm-android/jdk ]]; then export JAVA_HOME=/home/darax/.cache/rpm-android/jdk; fi
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$PATH"
export ANDROID_HOME="$SDK_PATH"
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}/.android/avd}"
AVD_NAME=RPM_S24_FE
if ! "$SDK_PATH/emulator/emulator" -list-avds | rg -q "^${AVD_NAME}$"; then
    printf 'no\n' | "$SDK_PATH/cmdline-tools/latest/bin/avdmanager" create avd --name "$AVD_NAME" --package 'system-images;android-36;google_apis;x86_64' --device pixel_7
fi
python3 - <<'PY'
from pathlib import Path
import os
p=Path(os.environ['ANDROID_AVD_HOME'])/'RPM_S24_FE.avd/config.ini'
s=p.read_text().splitlines()
settings={'hw.lcd.width':'1080','hw.lcd.height':'2340','hw.lcd.density':'420','hw.ramSize':'2048','hw.keyboard':'no','showDeviceFrame':'no','skin.name':'1080x2340','skin.path':'_no_skin','hw.gpu.enabled':'yes','hw.gpu.mode':'swiftshader_indirect'}
s=[line for line in s if line.split('=')[0].strip() not in settings]
s += [f'{k}={v}' for k,v in settings.items()]
p.write_text('\n'.join(s)+'\n')
PY
# Stock Android at S24 FE resolution; this is not a Samsung system image.
# Add -no-window for headless testing. The default opens a visible emulator.
exec "$SDK_PATH/emulator/emulator" -avd "$AVD_NAME" -no-audio -no-boot-anim -gpu swiftshader_indirect -memory 2048 "$@"
