import {interpretTime,normalizeReminderTime} from '../../cli/interpret.mjs';
import {capitalizeTitle} from '../../cli/title.mjs';

export function completeShortReminder(output,input){
 if(input.activeDraft||input.openQuestion||input.sourceUnits.length!==1)return output;
 const unit=input.sourceUnits[0],raw=unit.text.trim().replace(/[.!?]+$/,'');
 let match=raw.match(/^(?:please\s+)?(?:(?:set|create|add)\s+(?:me\s+)?(?:an?\s+)?)?(reminder|alarm)\s+(.+)$/i);
 let alert=match?.[1]?.toLowerCase(),time=match?.[2],wake=false;
 if(!match){match=raw.match(/^(?:please\s+)?(remind me|wake me up)\s+(.+)$/i);if(match){wake=/wake/i.test(match[1]);alert=wake?'alarm':'reminder';time=match[2];}}
 if(!match){match=raw.match(/^(\d+\s*(?:min(?:ute)?s?|hours?)\s+baad)\s+yaad\s+dila(?:na|o|na hai)$/i);if(match){alert='reminder';time=match[1];}}
 if(!match){
  const front=raw.match(/^(in\s+\d+\s*(?:minutes?|mins?|hours?|hrs?|days?)?)\s+(remind me|wake me up)(?:\s+to\s+(.+))?$/i);
  if(front){match=front;wake=/wake/i.test(front[2]);alert=wake?'alarm':'reminder';time=front[1]+(front[3]?' to '+front[3]:'');}
 }
 if(!time)return output;
 let subject=null;
 const named=time.match(/^(.+?)\s+to\s+(.+)$/i);
 if(named){
  time=named[1];subject=named[2].trim();
  const subjectAction=subject.replace(/\s+after\s+work$/i,'');
  if(subject.length>100||/[.!?;,\n&+]|\b(?:and|also|plus|then|but|because|so|every|daily|weekly|tomorrow|today|at|in|after|before)\b/i.test(subjectAction))return output;
 }
 const relative=/^(?:in\s+\d+\s*(?:minutes?|mins?|hours?|hrs?|days?)?|\d+\s*(?:min(?:ute)?s?|hours?)\s+baad)$/i;
 const clock=/^at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?$/i;
 const day=/^(?:today|tomorrow)(?:\s+(?:morning|afternoon|evening|night))?(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?$/i;
 if(!relative.test(time)&&!clock.test(time)&&!day.test(time))return output;
 const parsed=interpretTime(normalizeReminderTime(time),new Date(input.context.now),{evidence:raw,subject:subject??(wake?'Wake up':''),inferBareClock:true});
 if(!['parsed','date_only'].includes(parsed.status))return output;
 const title=capitalizeTitle(subject??(wake?'Wake up':alert==='alarm'?'Alarm':'Reminder'));
 const field=(name,value,evidence=null,origin='stated',op='set')=>({name,value,evidence,origin,op});
 const opId='short-alert';
 return {schemaVersion:1,mode:'capture',draftMode:'new',reply:'',decisions:[{sourceId:unit.id,disposition:'action',note:null}],
  operations:[{opId,sourceId:unit.id,kind:'create',entity:'task',targetId:null,fields:[field('title',title,subject??(wake?match[1]:null),subject||wake?'stated':'suggested'),field('time',time,time),field('alert',alert,raw)]}],
  question:null,
  clarification:null,memoryCandidates:[],card:null};
}
