import {alternatives,localDay,conflicts} from './planner-state.mjs';
import {waterStatus,WATER_DEFAULTS,clockText} from './body-state.mjs';
import {calendarRows,calendarRisk} from './planner-calendar.mjs';
import {stable} from '../intent-v2/src/context.mjs';
import {shortHash} from '../intent-v2/src/hash.mjs';

export const stepGuard=row=>shortHash(stable(row));
export function currentReceiptHelp(data,draft){
 const help=draft?.nextStep;if(!help||help.used||draft.status!=='committed')return null;
 if(!help.action)return help;
 const row=data.entries.find(e=>String(e.id)===help.action.targetId);
 return row&&stepGuard(row)===help.action.guard?help:null;
}

/** Optional help follows the receipt. It never becomes a blocking draft question. */
export function receiptHelp(data,draft,{now=new Date(),calendar=null}={}){
 if(draft?.status!=='committed')return null;
 const created=(draft.receipt?.changes??[]).filter(c=>c.type==='create'&&c.collection==='tasks')
  .map(c=>data.entries.find(e=>String(e.id)===String(c.id))).filter(e=>e&&!e.archived&&!e.done);
 const base={kind:'next-step',conversationId:draft.conversationId,draftId:draft.id,revision:draft.revision};
 const name=created.find(e=>/^(?:Reminder|Alarm)$/i.test(e.title));
 if(name)return {text:null,label:'Name it',action:{...base,step:'name',targetId:String(name.id),guard:stepGuard(name)}};
 if(draft.operations.some(o=>o.entity==='water')){
  const water=data.planner?.body?.water??{},status=waterStatus({glasses:water.glasses,settings:{...WATER_DEFAULTS,...water.settings},now,busy:calendarRows(calendar),snoozedUntil:water.snoozedUntil});
  return {text:`${status.count} of ${status.goal} glasses today. ${status.reached?'Goal reached.':status.nextAt?`Next nudge at ${clockText(status.nextAt)}.`:'No more water nudges today.'}`,action:null};
 }
 const task=created.find(e=>!e.planned&&!e.plannedDate);
 // A complete local calendar copy is needed to call a gap free.
 if(!task||calendar?.status!=='ready')return null;
 const minutes=task.minutes??30;
 const at=alternatives(data,new Date(+now+60000),minutes,calendarRows(calendar),task.id)
  .find(at=>localDay(at)===localDay(now)&&!calendarRisk(calendar,Date.parse(at),Date.parse(at)+minutes*60000));
 if(!at)return null;
 return {text:`A ${minutes} minute opening in today's plan.`,label:`Try ${clockText(at)}`,action:{...base,step:'schedule',targetId:String(task.id),guard:stepGuard(task),at}};
}

export function checkReceiptStep(data,action,{now=new Date(),calendar=null}={}){
 const draft=data.intentV2?.drafts?.[action.draftId],help=currentReceiptHelp(data,draft);
 if(!help?.action||stable(help.action)!==stable(action))throw new Error('That next step changed. Use the newest receipt.');
 const row=data.entries.find(e=>String(e.id)===action.targetId);
 if(action.step==='schedule'){
  const start=Date.parse(action.at),end=start+(row.minutes??30)*60000;
  if(start<=+now||calendar?.status!=='ready'||calendarRisk(calendar,start,end)||conflicts(data,start,row.minutes??30,calendarRows(calendar),row.id).length)throw new Error('That opening is no longer available. Ask for a fresh time.');
 }
 return row;
}
