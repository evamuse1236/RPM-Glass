#!/usr/bin/env node
import {startAlerts} from './alerts.mjs';
import readline from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { Workflow,load,persist,help } from './workflow.mjs';
import {createOpenRouter,readApiKey,MODEL} from './openrouter.mjs';

const args=process.argv.slice(2);
if(args.includes('--help')){console.log('npm run cli -- [--data /path/to/data.json] [--ai] [--key-file /private/openrouter.env]\n--ai reads new notes and change requests with OpenRouter ('+MODEL+'). Your history stays local. Default: local rules.\n\n'+help);process.exit(0);}
const flag=args.indexOf('--data');
if(flag>=0&&(!args[flag+1]||args[flag+1].startsWith('--'))){console.error('--data needs a file path');process.exit(1);}
const file=path.resolve(flag>=0?args[flag+1]:path.join(process.env.XDG_DATA_HOME||path.join(os.homedir(),'.local','share'),'rpm-cli','data.json'));
fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
const lock=file+'.lock';let locked=false;
try {
  const keyFlag=args.indexOf('--key-file');
  if(keyFlag>=0&&(!args[keyFlag+1]||args[keyFlag+1].startsWith('--')))throw new Error('--key-file needs a file path');
  if(keyFlag>=0&&!args.includes('--ai'))throw new Error('Use --ai with --key-file to enable OpenRouter.');
  let interpreter=null;
  if(args.includes('--ai')){
    const keyFile=keyFlag>=0?args[keyFlag+1]:process.env.RPM_OPENROUTER_KEY_FILE;
    let apiKey=null;
    try{apiKey=readApiKey(keyFile);}catch{console.error('Could not read a private OpenRouter key file. New captures will use the local fallback.');}
    interpreter=createOpenRouter({apiKey});
  }
  try{fs.mkdirSync(lock,{mode:0o700});locked=true;}catch(error){if(error.code!=='EEXIST')throw error;throw new Error(`Another CLI may be using this data. Close it first. If it crashed, remove the stale lock: ${lock}`);}
  const engine=new Workflow(load(file),{save:data=>persist(file,data),interpreter,columns:()=>process.stdout.columns||80});
  console.log(`\nRPM — plans and check-ins\n\nWrite a note: Run tomorrow at 7am for 20 minutes.\nIt saves when you press Enter. Choose a number, or keep writing.${interpreter?'\nAsk for a change: Move my meeting one hour later.':''}
/capture · /checkin · /remind · /history · /help\nLocal timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
Data: ${file}\n${interpreter?'AI: OpenRouter · '+MODEL+'\nOnly new notes and change requests are sent. Your history stays local.':'Local rules · offline'}\nAlerts need this CLI open and the computer awake. /dismiss stops ringing.\n`);
  const terminal=Boolean(process.stdin.isTTY&&process.stdout.isTTY);
  const rl=readline.createInterface({input:process.stdin,output:process.stdout,terminal});
  const prompt=()=>{if(terminal){rl.setPrompt(engine.pending?'reply › ':engine.mode==='checkin'?'check in › ':engine.mode==='remind'?'remind › ':'capture › ');rl.prompt();}};
  const alerts=startAlerts(engine,{report:message=>{console.log(message);prompt();}});
  let queue=Promise.resolve(),closing=false,busy=false;
  const finish=()=>{alerts.stop();if(locked){fs.rmdirSync(lock);locked=false;}console.log('Saved entries are here when you return.');};
  rl.on('line',line=>{
    if(closing)return;
    if(line.trim()==='/dismiss'){alerts.dismiss();console.log('Ringing stopped.');prompt();return;}
    if(['/quit','/exit'].includes(line.trim())){closing=true;rl.close();return;}
    queue=queue.then(async()=>{
      busy=true;let rawSaved=false;
      try{const response=await engine.sendAsync(line,{onSaved:message=>{rawSaved=true;console.log(message);}});if(response)console.log('\n'+response+'\n');}
      catch(error){console.error(rawSaved?'\nOriginal capture is saved. Could not save its interpretation; use /show to inspect it.\n':'\nNot saved: '+error.message+'\nYour previous saved data is unchanged. Try again.\n');}
      finally{busy=false;if(!closing)prompt();}
    });
  });
  rl.on('SIGINT',()=>{if(rl.line){rl.write(null,{ctrl:true,name:'u'});console.log('\nInput cleared.');if(!busy)prompt();}else rl.close();});
  rl.on('close',()=>{closing=true;void queue.finally(finish);});
  process.on('exit',()=>{if(locked)try{fs.rmdirSync(lock);}catch{}});
  prompt();
} catch(error) {if(locked)fs.rmdirSync(lock);console.error(error.message);process.exitCode=1;}
