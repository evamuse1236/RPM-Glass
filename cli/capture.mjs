import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {createCaptureSession,privateTrace} from './capture-session.mjs';
import {userMessage} from '../android-companion/user-message.mjs';
import {dayAgenda,nextItem,bodyToday} from '../android-companion/capture-agenda.mjs';
import {formatTime} from './interpret.mjs';
import {localDay} from '../android-companion/planner-state.mjs';

const taskLine=row=>`${row.done?'[x]':'[ ]'} ${row.title} · ${row.planned?formatTime(row.planned):row.plannedDate?row.plannedDate+' · Time not set':'Time not set'}${row.alertIntent?.type?' · '+row.alertIntent.type:''}`;
export function renderState(data,{now=new Date()}={}){
 const lines=['Saved day',...(data.entries??[]).filter(e=>!e.archived).map(taskLine)];
 for(const block of data.planner?.blocks??[])if(!block.archived)lines.push(`Block: ${block.title}${block.purpose?' · '+block.purpose:''}`);
 const body=bodyToday(data,{now});if(body)lines.push(`Water: ${body.water.glasses} of ${body.water.goal} glasses today`,...body.meals.map(m=>`${m.slot}: ${m.text}`));
 return lines.join('\n');
}

export function renderAnswer(card,{data,events=[],now=new Date()}={}){
 if(!card||!data)return [];
 if(card.kind==='agenda'){const agenda=dayAgenda(data,{day:card.day??localDay(now),events}),rows=[...agenda.timed,...agenda.anytime];return rows.length?rows.map(i=>`${i.start==null?'Any time':formatTime(i.start)} · ${i.title}`):['Nothing planned for that day.'];}
 if(card.kind==='next'){const item=nextItem(data,{now,events});return [item?`${formatTime(item.start)} · ${item.title}`:'Nothing else is planned today or tomorrow.'];}
 if(card.kind==='task'){const row=data.entries.find(e=>String(e.id)===card.targetId);return [row?taskLine(row):'That task is no longer in your plan.'];}
 const body=bodyToday(data,{now});if(!body)return ['Water and meals are not logged yet.'];
 return card.kind==='water'?[`${body.water.glasses} of ${body.water.goal} glasses today`]:body.meals.length?body.meals.map(m=>`${m.slot}: ${m.text}`):['No meals logged today.'];
}

export function captureOptions(args){
 const options={file:'.verify/capture-cli/store.json'};
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(flag==='--help')return {help:true};
  if(!['--store','--now'].includes(flag)||!args[i+1])throw new Error('Use --store <file> or --now <ISO>.');
  options[flag==='--store'?'file':'now']=args[++i];
 }
 return options;
}

export function renderCapture({card,result,ms},{aiEnabled=true,data=null,events=[],now=new Date()}={}){
 const lines=[],draft=card?.draft;
 if(card?.status==='captured')lines.push(aiEnabled?'Your words are saved. '+(card.lastError?.message??'Retry to read them.'):'Your words are saved. AI is off. Restart with a key, then /retry.');
 else{
  if(card?.reply&&card.reply!==(card.clarification?.prompt??draft?.question?.prompt)&&!(draft?.status==='committed'&&card.reply.startsWith('Draft ready to review.')))lines.push(card.reply);
  for(const row of draft?.lines??[])lines.push([row.verb,row.title,row.when,row.where,row.alert].filter(Boolean).join(' · '));
  if(draft?.status==='draft')for(const op of draft.operations)lines.push([op.kind,op.fields.find(f=>f.name==='title')?.value??op.targetTitle??op.entity,...op.fields.filter(f=>f.name==='time').map(f=>f.op==='unknown'?'Time needs an answer':f.value)].join(' · '));
  if(card?.card)lines.push(...renderAnswer(card.card,{data,events,now}));
  if(draft?.applied?.warning)lines.push(draft.applied.warning);
  if(draft?.receipt?.undoId&&draft.status==='committed')lines.push('Undo: /undo');
 }
 const question=card?.clarification?.open?card.clarification:draft?.question;
 if(question)lines.push(question.prompt);
 const help=draft?.nextStep;
 if(help?.text)lines.push(help.text);
 const noteActions=(card?.notes??[]).filter(n=>['idea','preference','question'].includes(n.disposition)).map(n=>({label:n.keptTaskId?'Undo kept task':`Keep as task: ${n.note}`,action:{kind:'keep-note',conversationId:card.conversationId,messageId:card.messageId,sourceId:n.sourceId,keep:!n.keptTaskId}}));
 const actions=[...(card?.clarification?.open?card.clarification.actions:draft?.actions??[]),...(help?.action?[{label:help.label,action:help.action}]:[]),...noteActions];
 actions.forEach((a,i)=>lines.push(`${i+1}. ${a.label}`));
 for(const note of card?.notes??[])lines.push(`Also heard: ${note.note}`);
 const runs=result?.modelRuns??[];
 lines.push(`${!runs.length&&card?.status==='interpreted'?'Read locally':!aiEnabled?'No model answered':runs.map(r=>`${r.servedModel??r.model}${r.ok?'':' unavailable'} (${r.effort??'none'})`).join(', ')||'No model call'} · ${(ms/1000).toFixed(1)}s`);
 return {text:lines.join('\n'),actions};
}

async function main(){
 const options=captureOptions(process.argv.slice(2));
 if(options.help){console.log('npm run capture -- [--store <file>] [--now <ISO>]\n/undo /state /trace /reset /retry /quit');return;}
 process.env.TZ='Asia/Kolkata';
 const session=await createCaptureSession(options);
 const rl=createInterface({input:process.stdin,output:process.stdout,terminal:process.stdin.isTTY});
 rl.on('SIGINT',()=>rl.close());
 let actions=[];
 console.log(`RPM Capture. Local test store: ${path.resolve(options.file)}\nType your words, a choice number, or /help. /quit exits.`);
 const show=async observation=>{const view=renderCapture(observation,{aiEnabled:session.aiEnabled,data:await session.backend.load(),events:session.events,now:session.clock()});actions=view.actions;console.log(view.text);};
 try{
  for await(const line of rl){
   if(!line.trim())continue;
   try{
    if(line==='/quit')break;
    if(line==='/help'){console.log('/undo /state /trace /reset /retry /quit. Type a shown number to choose.');continue;}
    if(line==='/state'){console.log(renderState(await session.backend.load(),{now:session.clock()}));continue;}
    if(line==='/trace'){const card=await session.latest();console.log(JSON.stringify(privateTrace(session.traces.get(card?.messageId)),null,2));continue;}
    if(line==='/reset'){await session.reset();actions=[];console.log('Reset to the seeded day.');continue;}
    if(line==='/undo'){await session.undo();actions=[];console.log('Undone. Your original words are saved.');continue;}
    if(line==='/retry'){await show(await session.retry());continue;}
    if(/^\d+$/.test(line)&&actions.length){const item=actions[Number(line)-1];if(!item)throw new Error('Choose one of the shown numbers.');await show(await session.act(item));continue;}
    await show(await session.send(line));
   }catch(error){console.log(userMessage(error));}
  }
 }finally{rl.close();await session.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(userMessage(error));process.exitCode=1;});
