import {interpretTime} from '../../cli/interpret.mjs';
import {capitalizeTitle} from '../../cli/title.mjs';
import {completeWaterLog} from './body-intent.mjs';
import {normalizeSpokenTime} from '../../cli/spoken-time.mjs';
import {alertOf,contextEntity} from './context.mjs';

const field=(name,value,evidence=null,origin='stated')=>({name,op:'set',value,origin,evidence});
const ignored=new Set('a an the my to for up of at on with in'.split(' '));
const tokens=text=>(text.toLowerCase().match(/[\p{L}]+/gu)??[]).filter(t=>!ignored.has(t));
// These aliases only veto local creation; they never select or change an item.
const family=text=>text.toLowerCase().replace(/\b(?:amma|mum|mummy|mother)\b/g,'mom').replace(/\b(?:papa|dad|daddy|father)\b/g,'dad');

// An exact saved name and a fully consumed due-clock correction identify one
// change. The explicit due clock wins over a redundant relative nudge.
function readDueClock(input,data){
 const unit=input.sourceUnits[0],raw=unit.text.trim().replace(/[.!]$/,'');
 const matches=(data.entries??[]).filter(e=>(e.kind??'plan')==='plan'&&!e.archived&&e.state!=='cancelled'&&e.title&&raw.toLowerCase().startsWith(e.title.toLowerCase()+' '));
 if(matches.length!==1)return null;
 const target=matches[0],entity=contextEntity('task',target,input.context.timezone);
 if(target.done||target.recurrence||target.repeatAfterDays||alertOf(target)!=='alarm'||!entity.savedLocalDate||entity.savedLocalDate<input.context.nowLocal.slice(0,10))return null;
 const tail=raw.slice(target.title.length),m=tail.match(/^\s+(?:is\s+)?(?:now\s+)?due at (.+?)(?: not (.+?) so push it (\d{1,3}|one|two|five|ten|fifteen|twenty|thirty|forty five|sixty) minutes?)? and keep the alarm$/i);
 if(!m)return null;
 // Full clock grammar, so titles, alternatives and extra actions cannot hide
 // in a partially parsed time. AM/PM uses the normal guarded inference.
 const clock=words=>/^at (?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)?$/i.test(normalizeSpokenTime('at '+words));
 if(!clock(m[1])||m[2]&&!clock(m[2]))return null;
 const evidence='at '+m[1],time=interpretTime(evidence,new Date(input.context.now),{inferBareClock:true});
 if(time.status!=='parsed')return null;
 return {kind:'due-clock',entities:[entity],turn:{schemaVersion:1,mode:'capture',draftMode:'new',reply:'',decisions:[{sourceId:unit.id,disposition:'action',note:null}],
  operations:[{opId:'due-clock',sourceId:unit.id,kind:'update',entity:'task',targetId:String(target.id),fields:[field('time',evidence,evidence)]}],question:null,clarification:null,memoryCandidates:[],card:null}};
}

/** Read a single literal personal action. Every leftover ambiguity goes to AI. */
export function readSimpleCapture(input,{data}){
 if(input.activeDraft||input.openQuestion||input.sourceUnits.length!==1)return null;
 const water=completeWaterLog(null,input);if(water)return {turn:water,kind:'water-log'};
 const due=readDueClock(input,data);if(due)return due;
 const unit=input.sourceUnits[0],raw=unit.text.trim();
 if(raw.length>160||/[?;,&+\n]/.test(raw)||/\b(?:and|or|also|plus|then|but|because|so|if|not|never|don't|dont|maybe|perhaps|might|should|would|could|every|daily|weekly|done|finished|already|instead|again|another|it|that|this|them)\b/i.test(raw))return null;
 let rest=raw.replace(/[.!]$/,'').replace(/^(?:please\s+)?(?:add\s+)?/i,'');
 const must=rest.match(/^must\b/i)?.[0]??null;rest=rest.replace(/^must\s+/i,'');
 const suffix=rest.match(/\s+((?:(?:today|tomorrow|tonight|(?:next\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day)(?:\s+(?:morning|afternoon|evening|night))?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|later today|(?:after|before) (?:breakfast|lunch|dinner|bed)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}(?::\d{2})?\s*(?:am|pm)))$/i);
 const time=suffix?.[1]??null;if(suffix)rest=rest.slice(0,suffix.index);
 const duration=rest.match(/\s+for (\d{1,4}) minutes?$/i);let minutes=null;
 if(duration){minutes=Number(duration[1]);if(minutes<1||minutes>1440)return null;rest=rest.slice(0,duration.index);}
 if(!/^(?:(?:call|buy|email|print|charge|collect|submit|pay|practice|clean|book|read|write|wash|return|finish)\s+[\p{L}][\p{L}\p{M}'’ -]{0,90}|gym)$/iu.test(rest))return null;
 // A time word left inside the title means the suffix did not consume the request.
 if(/\b(?:at|today|tomorrow|tonight|morning|afternoon|evening|night|before|after|in|during|until|by|minutes?|hours?)\b/i.test(rest))return null;
 // Use the full saved store. Shared subject words, family aliases, and open
 // Blocks need semantic matching and filing, so the local reader abstains.
 const subject=tokens(family(rest)).slice(1);
 const related=(data.entries??[]).filter(e=>(e.kind??'plan')==='plan'&&!e.archived&&e.state!=='cancelled')
  .some(e=>tokens(family(e.title)).some(t=>subject.includes(t))||family(e.title).toLowerCase().startsWith(rest.toLowerCase()));
 if(related||(data.planner?.blocks??[]).some(b=>!b.archived&&!b.achieved))return null;
 if(time){
  const parsed=interpretTime(time,new Date(input.context.now),{subject:rest,evidence:raw,inferBareClock:true});
  if(!['parsed','date_only'].includes(parsed.status))return null;
 }
 const fields=[field('title',capitalizeTitle(rest),rest)];
 if(time)fields.push(field('time',time,time));
 if(minutes!==null)fields.push(field('minutes',minutes,duration[0].trim()));
 if(must)fields.push(field('must',true,must));
 return {kind:'simple-task',turn:{schemaVersion:1,mode:'capture',draftMode:'new',reply:'',decisions:[{sourceId:unit.id,disposition:'action',note:null}],
  operations:[{opId:'simple-task',sourceId:unit.id,kind:'create',entity:'task',targetId:null,fields}],question:null,clarification:null,memoryCandidates:[],card:null}};
}
