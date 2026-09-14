import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
export function dueAlerts(data,now){return data.entries.filter(e=>!e.done&&e.alert?.status==='scheduled'&&new Date(e.alert.at)<=now);}
export function toneFile(){
  const file=path.join(os.tmpdir(),`rpm-tone-${process.getuid()}.wav`);
  const rate=22050,n=rate*2,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(i/rate*2*Math.PI*660)*7000*(i%rate<rate*.6?1:0)),44+i*2);fs.writeFileSync(file,b,{mode:0o600});return file;
}
export function startAlerts(engine,{report=console.log,spawnProcess=spawn}={}){
  let player=null,ring=null;const active=new Set();
  const launch=(cmd,args)=>{const child=spawnProcess(cmd,args,{stdio:'ignore'});child.on('error',e=>report(`Alert delivery failed: ${e.message}`));child.on('exit',code=>{if(code)report(`${cmd} exited with ${code}; check desktop/audio availability.`);});return child;};
  const dismiss=()=>{if(ring)clearInterval(ring);ring=null;player?.kill();player=null;active.clear();};
  const tick=()=>{
    for(const id of active){const e=engine.get(id);if(!e||e.done||e.alert?.status!=='fired')active.delete(id);}
    if(!active.size&&ring)dismiss();
    for(const e of dueAlerts(engine.data,engine.now())){
      try{engine.update(e.id,{alert:{...e.alert,status:'fired',firedAt:engine.now().toISOString()}},'Alert fired');}catch(error){report('Could not save alert delivery: '+error.message);continue;}
      report(`\n${e.alert.type.toUpperCase()} #${e.id}: ${e.title}${e.alert.type==='alarm'?' — /dismiss to stop ringing':''}`);
      launch('notify-send',['--app-name=RPM','--urgency='+ (e.alert.type==='alarm'?'critical':'normal'),'--',`RPM ${e.alert.type}`,e.title]);
      if(e.alert.type==='alarm'){active.add(e.id);if(!ring){const file=toneFile();const play=()=>{if(!player||player.exitCode!==null)player=launch('pw-play',[file]);};play();ring=setInterval(play,2500);}}
    }
  };
  const timer=setInterval(tick,1000);tick();return {dismiss,stop(){clearInterval(timer);dismiss();},tick};
}
