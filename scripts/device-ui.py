#!/usr/bin/env python3
"""Small adb/UIAutomator helper for reproducible emulator verification.

Reads the actual accessibility hierarchy before choosing a control. No app database
is modified. Usage: device-ui.py tree | tap 'Exact text' | type 'text' | shot name
"""
import os, re, subprocess, sys, time, xml.etree.ElementTree as ET
from pathlib import Path
ADB = os.environ.get('ADB', '/home/darax/.cache/rpm-android/sdk/platform-tools/adb')
SERIAL = os.environ.get('ANDROID_SERIAL', 'emulator-5554')
def adb(*args):
    return subprocess.check_output([ADB, '-s', SERIAL, *args])
def tree():
    adb('shell','uiautomator','dump','/sdcard/rpm-window.xml')
    return ET.fromstring(adb('shell','cat','/sdcard/rpm-window.xml'))
def tap(label):
    candidates=[]
    for attempt in range(3):
        candidates = [n for n in tree().iter('node') if n.get('text','').casefold() == label.casefold() or n.get('content-desc','').casefold() == label.casefold() or label.startswith('@') and n.get('resource-id','')==label[1:]]
        if candidates: break
        time.sleep(.35)
    if not candidates: raise SystemExit(f'No visible control: {label!r}')
    n = next((n for n in candidates if n.get('clickable')=='true'), candidates[0])
    x1,y1,x2,y2 = map(int, re.findall(r'\d+',n.get('bounds')))
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    time.sleep(0.35)
if __name__=='__main__':
    action=sys.argv[1]
    if action=='tree':
        for n in tree().iter('node'):
            if n.get('text') or n.get('content-desc') or n.get('class')=='android.widget.EditText':
                print(n.get('class'),repr(n.get('text')),repr(n.get('content-desc')),n.get('bounds'),'clickable='+n.get('clickable',''))
    elif action=='tap':tap(sys.argv[2])
    elif action=='type':
        # input text itself has a remote shell; quote it with shlex, never interpolate raw text.
        import shlex
        adb('shell','input text '+shlex.quote(sys.argv[2].replace(' ','%s')))
    elif action=='shot':
        out=Path(__file__).resolve().parent.parent/'docs'/'testing'/f'{sys.argv[2]}.png'
        out.parent.mkdir(parents=True,exist_ok=True)
        time.sleep(0.4)
        out.write_bytes(adb('exec-out','screencap','-p'))
        print(out)
    else: raise SystemExit('Use tree, tap, type or shot')
