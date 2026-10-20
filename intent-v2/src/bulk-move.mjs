import {interpretTime} from '../../cli/interpret.mjs';
import {contextEntity,localStamp} from './context.mjs';

/** A closed grammar over the full store. Strictly after, never at the boundary. */
export function readBulkMove(input,{data}){
 if(input.activeDraft||input.openQuestion||input.sourceUnits.length!==1)return null;
 const unit=input.sourceUnits[0],raw=unit.text.trim();
 const match=raw.match(/^(?:push|move) (?:everything|all tasks) after (\d{1,2}(?::\d{2})?\s*(?:am|pm)?) today to tomorrow[.!]?$/i);
 if(!match)return null;
 const anchor=new Date(input.context.now);anchor.setHours(0,0,0,0);
 const boundary=interpretTime(`today at ${match[1]}`,anchor,{inferBareClock:true});
 if(boundary.status!=='parsed')return null;
 const day=input.context.nowLocal.slice(0,10),clock=localStamp(boundary.planned,input.context.timezone)?.slice(11);
 const selected=(data.entries??[]).filter(e=>(e.kind??'plan')==='plan'&&!e.archived&&!e.done&&e.state!=='cancelled'&&e.planned)
  .filter(e=>{const stamp=localStamp(e.planned,input.context.timezone);return stamp?.slice(0,10)===day&&stamp.slice(11)>clock;});
 // One transaction has a hard 30-operation limit. Never move only a subset.
 if(selected.length>30||selected.some(e=>e.recurrence||e.repeatAfterDays))return null;
 return {entities:selected.map(e=>contextEntity('task',e,input.context.timezone)),turn:{schemaVersion:1,mode:'capture',draftMode:selected.length?'new':'none',reply:'',
  decisions:[{sourceId:unit.id,disposition:'action',note:null}],
  operations:selected.map((e,i)=>({opId:`bulk-${i}`,sourceId:unit.id,kind:'update',entity:'task',targetId:String(e.id),fields:[{name:'time',op:'set',value:'tomorrow',origin:'stated',evidence:raw.match(/tomorrow/i)[0]}]})),
  question:null,clarification:null,memoryCandidates:[],card:null}};
}
