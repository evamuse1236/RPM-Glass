import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {persist,load} from '../cli/workflow.mjs';

import {freshStore} from './companion-state.mjs';
export {freshStore,recordSnapshot,restoreSnapshot} from './companion-state.mjs';
export function openStore(file,{importFile}={}){
  if(file&&importFile&&path.resolve(file)===path.resolve(importFile))throw new Error('Test copy must be separate from CLI data.');
  let data;
  if(file&&fs.existsSync(file)){
    data=JSON.parse(fs.readFileSync(file,'utf8'));
    if(data.schema!==2||!['entries','memories','history','conversations'].every(k=>Array.isArray(data[k])))throw new Error('Unsupported or damaged prototype store; original preserved.');
  }else{
    data=freshStore();
    if(importFile&&fs.existsSync(importFile)){
      const source=load(importFile);
      data.entries=structuredClone(source.entries).map(e=>({...e,archived:false,source:'cli-import'}));
      data.history=(source.interactions??[]).map(h=>({id:randomUUID(),at:h.at,raw:h.raw,response:h.response,entryIds:h.interpretation?.entryIds??[],source:'cli-import',archived:false}));
      data.imported={at:new Date().toISOString(),entries:data.entries.length,interactions:data.history.length,source:'CLI snapshot'};
    }
  }
  const save=()=>{if(file)persist(file,data);};
  save();return {get data(){return data;},set data(value){data=value;},save,file};
}
export function transaction(store,fn){
  const backup=structuredClone(store.data);
  try{const result=fn(store.data);store.data.version++;store.save();return result;}
  catch(e){store.data=backup;throw e;}
}
export function lockStore(file){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const lock=file+'.lock';
  if(fs.existsSync(lock)){
    let pid;try{pid=Number(fs.readFileSync(lock,'utf8'));}catch{}
    if(!Number.isInteger(pid)||pid<1)throw new Error('Unreadable companion lock; refusing concurrent access.');
    try{process.kill(pid,0);throw new Error('Companion data is already open in another process.');}catch(e){if(e.code!=='ESRCH')throw e;}
    fs.unlinkSync(lock);
  }
  const fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);
  return ()=>{try{if(fs.readFileSync(lock,'utf8')===String(process.pid))fs.unlinkSync(lock);}catch{}};
}
