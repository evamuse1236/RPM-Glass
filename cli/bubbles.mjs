import {stripVTControlCharacters} from 'node:util';
import {formatTime,interpretTime} from './interpret.mjs';

const segments=new Intl.Segmenter(undefined,{granularity:'grapheme'});
export const displayText=value=>stripVTControlCharacters(String(value??'')).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g,'').replace(/\t/g,'  ');
const cells=s=>[...segments.segment(s)].reduce((n,{segment})=>n+(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff01-\uff60]/u.test(segment)?2:1),0);
function wrap(text,width){
  const lines=[];
  for(const paragraph of displayText(text).split('\n')){
    let line='';
    for(const word of paragraph.split(/\s+/).filter(Boolean)){
      if(line&&cells(line+' '+word)>width){lines.push(line);line='';}
      for(const {segment} of segments.segment((line?' ':'')+word)){
        if(cells(line+segment)>width){lines.push(line);line='';}
        line+=segment;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function bubble(heading,body,{width=80}={}){
  const size=Math.max(28,Math.min(100,width));
  const inner=size-4;
  const lines=[...wrap(heading,inner),'',...body.flatMap(line=>wrap(line,inner))];
  return '╭'+'─'.repeat(size-2)+'╮\n'+lines.map(line=>'│ '+line+' '.repeat(Math.max(0,inner-cells(line)))+' │').join('\n')+'\n╰'+'─'.repeat(size-2)+'╯';
}
export function chips(actions,width=80){
  const limit=Math.max(28,Math.min(100,width))-4;
  const lines=[];let line='';
  for(const a of actions){
    const chip=`[${a.number} ${displayText(a.label)}]`;
    if(line&&cells(line+'  '+chip)>limit){lines.push(line);line='';}
    line+=(line?'  ':'')+chip;
  }
  if(line)lines.push(line);
  return lines;
}

export function actionsFor(e){
  const action=(key,label)=>({key,label,id:e.id});
  if(e.kind==='plan'&&(e.done||e.state==='cancelled'))return [action('reopen','Use this plan again'),action('details','View history')];
  if(e.kind==='checkin'){
    const choices=[];
    if(e.minutes===null)choices.push(action('duration','How long?'));
    if(!e.mood)choices.push(action('mood','How did it feel?'));
    if(!e.energy)choices.push(action('energy','Energy?'));
    if(!e.purpose)choices.push(action('purpose','Add purpose'));
    if(e.minutes!==null)choices.push(action('duration','Change minutes'));
    if(e.mood)choices.push(action('mood','Edit mood'));
    if(e.energy)choices.push(action('energy','Edit energy'));
    if(e.purpose)choices.push(action('purpose','Change purpose'));
    return choices.slice(0,4);
  }
  const choices=[action('time',e.interpretation?.status==='review'?'Choose time':e.planned?'Change time':'Add time')];
  const defaultDuration=e.durationSource==='default_estimate'||(e.minutes===30&&!e.durationSource);
  if(defaultDuration||e.minutes===null)choices.push(action('duration','Set minutes'));
  const type=e.alert?.type;
  if(e.alert?.status==='needs_time')choices.push(action('reminder','Remind me at the start'));
  else if(type==='alarm')choices.push(action('reminder','Use a reminder'));
  else if(type==='reminder')choices.push(action('alarm','Use an alarm'));
  else if(e.planned)choices.push(action('reminder','Add reminder'));
  if(!e.purpose)choices.push(action('purpose','Add purpose'));
  if(!defaultDuration&&e.minutes!==null)choices.push(action('duration','Change minutes'));
  if(e.planned&&e.alert)choices.push(action('alert_off','No alert'));
  choices.push(action('done','Mark done'));
  return choices.slice(0,5);
}

export function entryBubble(e,actions=[],options={}){
  const kind=e.state==='cancelled'?'Cancelled':e.kind==='checkin'?'Check-in':e.done?'Done':'Plan';
  const facts=[];
  if(e.planned)facts.push(formatTime(e.planned));
  else if(e.plannedDate)facts.push(e.plannedDate+' · time not set');
  else if(e.kind==='plan')facts.push('Time not set');
  if(e.minutes!==null&&e.minutes!==undefined)facts.push(`${e.minutes} min ${e.kind==='plan'?'estimate':'reported'}`+(e.durationSource==='default_estimate'?' (default)':''));
  else if(e.kind==='checkin')facts.push('Actual time not recorded');
  const body=[e.title,facts.join(' · ')];
  if(e.mood||e.energy)body.push([e.mood,e.energy?e.energy+' energy':null].filter(Boolean).join(' · '));
  if(e.purpose)body.push('Purpose: '+e.purpose);
  if(!e.done&&e.alert?.status==='scheduled')body.push((e.alert.type==='alarm'?'Alarm':'Reminder')+' · '+formatTime(e.alert.at));
  else if(e.alert?.status==='needs_time')body.push('It is too late for the 10-minute alarm. You can use a reminder instead.');
  else if(e.kind==='plan'&&e.planned&&!e.alert)body.push('Alert is off');
  if(e.interpretation?.reason)body.push(e.interpretation.reason);
  if(e.interpretation?.assumptions?.length)body.push(e.interpretation.assumptions.join(' '));
  if(actions.length)body.push('',...chips(actions,options.width));
  return bubble(`#${e.id}  ·  ${kind}`,body,options);
}

/** Offer only clocks/days actually mentioned; never invent an "after lunch" time. */
export function timeChoices(e,now){
  const source=(e.interpretation?.timeEvidence??e.extracted?.time?.evidence??[]).join(' ');
  const found=[...(e.interpretation?.candidates??[])];
  const match=source.match(/\bat\s+(\d{1,2}(?::\d{2})?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?:\s*(a\.?m\.?|p\.?m\.?|in the morning|in the evening|in the afternoon))?/i);
  if(match&&!/\b(every|daily|weekly|monthly)\b/i.test(source)){
    const days=[...new Set(source.match(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|day after tomorrow|tomorrow|today)\b/gi)??[])];
    if(!days.length&&e.plannedDate)days.push(e.plannedDate);
    const parts=match[2]?[match[2]]:['am','pm'];
    for(const day of days.length?days:[''])for(const part of parts){
      const parsed=interpretTime(`${day} at ${match[1]} ${part}`,now);
      if(parsed.planned)found.push({at:parsed.planned,label:formatTime(parsed.planned),source});
    }
  }
  return [...new Map(found.filter(c=>new Date(c.at)>now).map(c=>[c.at,c])).values()].sort((a,b)=>new Date(a.at)-new Date(b.at)).slice(0,6);
}
