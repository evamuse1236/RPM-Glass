import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {createCaptureSession,privateTrace} from './capture-session.mjs';
import {userMessage} from '../android-companion/user-message.mjs';

export function captureOptions(args){
 const options={file:'.verify/capture-cli/store.json'};
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(flag==='--help')return {help:true};
  if(!['--store','--now'].includes(flag)||!args[i+1])throw new Error('Use --store <file> or --now <ISO>.');
  options[flag==='--store'?'file':'now']=args[++i];
 }
 return options;
}

export function renderCapture({card,result,ms},{aiEnabled=true}={}){
 const lines=[],draft=card?.draft;
 if(card?.status==='captured')lines.push(aiEnabled?'Your words are saved. '+(card.lastError?.message??'Retry to read them.'):'Your words are saved. AI is off. Restart with a key, then /retry.');
 else{
  if(card?.reply)lines.push(card.reply);
  for(const row of draft?.lines??[])lines.push([row.verb,row.title,row.when,row.where,row.alert].filter(Boolean).join(' · '));
  if(draft?.status==='draft')for(const op of draft.operations)lines.push([op.kind,op.fields.find(f=>f.name==='title')?.value??op.targetTitle??op.entity,...op.fields.filter(f=>f.name==='time').map(f=>f.op==='unknown'?'Time needs an answer':f.value)].join(' · '));
  if(card?.card)lines.push(`Card: ${card.card.kind} (use /state to read the saved day).`);
  if(draft?.applied?.warning)lines.push(draft.applied.warning);
  if(draft?.receipt?.undoId&&draft.status==='committed')lines.push('Undo: /undo');
 }
 const question=card?.clarification?.open?card.clarification:draft?.question;
 if(question)lines.push(question.prompt);
 const actions=card?.clarification?.open?card.clarification.actions:draft?.actions??[];
 actions.forEach((a,i)=>lines.push(`${i+1}. ${a.label}`));
 for(const note of card?.notes??[])lines.push(`Also heard: ${note.note}`);
 const runs=result?.modelRuns??[];
 lines.push(`${runs.map(r=>`${r.servedModel??r.model} (${r.effort??'none'})`).join(', ')||'No model call'} · ${(ms/1000).toFixed(1)}s`);
 return {text:lines.join('\n'),actions};
}

async function main(){
 const options=captureOptions(process.argv.slice(2));
 if(options.help){console.log('npm run capture -- [--store <file>] [--now <ISO>]\n/undo /state /trace /reset /retry /quit');return;}
 process.env.TZ='Asia/Kolkata';
 const session=await createCaptureSession(options);
 const rl=createInterface({input:process.stdin,output:process.stdout,terminal:process.stdin.isTTY});
 let actions=[];
 console.log(`RPM Capture. Local test store: ${path.resolve(options.file)}\nType your words, a choice number, or /help. /quit exits.`);
 const show=observation=>{const view=renderCapture(observation,session);actions=view.actions;console.log(view.text);};
 try{
  for await(const line of rl){
   if(!line.trim())continue;
   try{
    if(line==='/quit')break;
    if(line==='/help'){console.log('/undo /state /trace /reset /retry /quit. Type a shown number to choose.');continue;}
    if(line==='/state'){const data=await session.backend.load();console.log(JSON.stringify({tasks:data.entries,blocks:data.planner?.blocks,body:data.planner?.body},null,2));continue;}
    if(line==='/trace'){const card=await session.latest();console.log(JSON.stringify(privateTrace(session.traces.get(card?.messageId)),null,2));continue;}
    if(line==='/reset'){await session.reset();actions=[];console.log('Reset to the seeded day.');continue;}
    if(line==='/undo'){await session.undo();actions=[];console.log('Undone. Your original words are saved.');continue;}
    if(line==='/retry'){show(await session.retry());continue;}
    if(/^\d+$/.test(line)&&actions.length){const item=actions[Number(line)-1];if(!item)throw new Error('Choose one of the shown numbers.');show(await session.act(item));continue;}
    show(await session.send(line));
   }catch(error){console.log(userMessage(error));}
  }
 }finally{rl.close();await session.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(userMessage(error));process.exitCode=1;});
