#!/usr/bin/env python3
"""Emulator regression: real IME must not cover RPM's composer or choice bubbles.

Open CompanionActivity first. Uses actual UIAutomator bounds and Android IME insets,
not a screenshot name or a mocked layout. Does not submit or alter the user's draft.
"""
import os, re, subprocess, time, xml.etree.ElementTree as ET
ADB=os.environ.get('ADB','/home/darax/.cache/rpm-android/sdk/platform-tools/adb')
SERIAL=os.environ.get('ANDROID_SERIAL','emulator-5554')
def adb(*args): return subprocess.check_output([ADB,'-s',SERIAL,*args]).decode()
def tree():
    adb('shell','uiautomator','dump','/sdcard/rpm-keyboard-check.xml')
    return ET.fromstring(adb('shell','cat','/sdcard/rpm-keyboard-check.xml'))
def bounds(node): return tuple(map(int,re.findall(r'\d+',node.get('bounds',''))))
window=adb('shell','dumpsys','window')
if not re.search(r'type=ime frame=\[\d+,(\d+)\]\[\d+,\d+\][^\n]* visible=true',window):
    field=None
    for attempt in range(3):
        nodes=list(tree().iter('node'))
        field=next((n for n in nodes if n.get('resource-id')=='message'),None)
        if field is not None: break
        time.sleep(.35)
    assert field is not None,'Open RPM conversation before running the keyboard check'
    x1,y1,x2,y2=bounds(field)
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    time.sleep(.7)
    window=adb('shell','dumpsys','window')
keyboard=re.search(r'type=ime frame=\[\d+,(\d+)\]\[\d+,\d+\][^\n]* visible=true',window)
assert keyboard,'Keyboard must actually be visible for this check'
top=int(keyboard.group(1));nodes=list(tree().iter('node'))
for name,predicate in [('composer',lambda n:n.get('resource-id')=='message'),('suggestions',lambda n:n.get('text')=='Suggested replies')]:
    found=next((n for n in nodes if predicate(n)),None)
    assert found is not None,f'{name} missing from current phone view'
    b=bounds(found)
    assert b[3]<=top,f'{name} bottom {b[3]} is covered by keyboard starting at {top}'
    assert b[3]>b[1],f'{name} has collapsed to zero height'
    print(f'PASS: {name} bottom {b[3]} <= keyboard top {top}')
