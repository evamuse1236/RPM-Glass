// Read-only, compact emulator evidence. Never reads the key preferences or legacy DB.
import {execFileSync} from 'node:child_process';
const adb=process.env.ADB??'/home/darax/.cache/rpm-android/sdk/platform-tools/adb';
const serial=process.env.ANDROID_SERIAL??'emulator-5554';
const read=file=>execFileSync(adb,['-s',serial,'shell','run-as','com.rpm.prototype','cat',file],{encoding:'utf8'});
const data=JSON.parse(read('files/companion.json'));
const xml=read('shared_prefs/companion-delivery.xml');
const text=xml.match(/<string name="ledger">([\s\S]*?)<\/string>/)?.[1]??'{}';
const ledger=JSON.parse(text.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));
console.log(JSON.stringify({version:data.version,entries:data.entries.map(e=>({id:e.id,title:e.title,planned:e.planned,alert:e.alertIntent?.type,delivery:ledger[e.id]})),pending:data.pending?{operations:data.pending.operations.length,question:data.pending.question}:null,last:data.history.at(-1)?.raw},null,2));
