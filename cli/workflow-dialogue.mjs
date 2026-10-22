import {interpretTime,localDate,formatTime,durationFromText,scheduledAlert,statedDays} from './interpret.mjs';
import {editTargets,looksLikeEdit} from './edits.mjs';
import {bubble,chips} from './bubbles.mjs';
import {capitalizeTitle} from './title.mjs';

export const moods = ['Low', 'Uneasy', 'Okay', 'Good', 'Great'];
export const energies = ['Low', 'Medium', 'High'];
export function minutes(text) {
  const value = text.toLowerCase().trim().replace(/[,.!?]/g, '').replace(/\s*(minutes?|mins?)$/, '').trim();
  const words = {ten:10, fifteen:15, twenty:20, thirty:30, 'forty five':45, sixty:60};
  const n = words[value] ?? (/^\d{1,4}$/.test(value) ? Number(value) : NaN);
  return Number.isInteger(n) && n >= 1 && n <= 1440 ? n : null;
}
export const help = `Write a note. It saves when you press Enter.
Each bubble shows what was saved. Choose a number, or keep writing.
With --ai, you can also ask for changes: Move my meeting one hour later.
/capture             Plan mode (default)
/checkin             Record what you did and how you feel
/remind              Write something you want to remember
/new TEXT            Save a new thought even during a follow-up
/time [WHEN]         Change the selected entry's time
/options             Show the selected entry's bubble again
/duration [MINUTES]   Set estimated or reported minutes
/mood [VALUE]        /energy [VALUE]        /purpose [TEXT]
/purposes            Show reusable purposes
/result RESULT | PURPOSE     Create an optional result
/link RESULT_ID      Link the latest entry to a result
/results             List results
/done [ENTRY_ID]      Mark a plan done; actual minutes stay unchanged
/next                Unfinished plans
/history             Recent entries
/show [ENTRY_ID]      Select an entry and see its original words and history
/alert               Choose a reminder or alarm
/cancel              Leave a follow-up; saved entries remain
/help                Show commands          /quit  Exit

Use /show ID before a command to change an older entry.
With --ai, name it instead: Change the walk to thirty minutes.
If more than one entry matches, the CLI asks which one.
“Actually, twenty” asks before changing minutes for the selected entry.
Alerts run while this CLI is open and the computer is awake. /dismiss stops ringing. /alert off disables the current alert.`;

export function answerValue(text) {
    const p=this.pending, e=this.get(p.id), lower=text.toLowerCase();
    if(p.kind==='edit_target'){
      if(text==='0'){p.custom=true;return 'Write the entry name or #ID, or /cancel.';}
      const chosen=!p.custom&&/^\d+$/.test(text)?p.options[Number(text)-1]:null;
      if(!p.custom&&/^\d+$/.test(text)&&!chosen)return 'Choose a listed number. To use an entry ID, write # before it.';
      const matches=chosen?[this.get(chosen)]:editTargets({...p.edit,target:text},this.data.entries,null,this.now());
      if(matches.length!==1||!matches[0])return 'Choose one listed number, or type an exact name or #ID. /cancel leaves entries unchanged.';
      return this.applyEdit(matches[0].id,p.edit,p.reason);
    }
    if(p.kind==='edit_value'){
      if(text==='0'){p.custom=true;return 'Write your own '+p.need.field+', or /cancel.';}
      let value=!p.custom&&/^\d+$/.test(text)&&p.options[Number(text)-1]?p.options[Number(text)-1]:text;
      if(p.need.field==='time'){
        const period=text.match(/^(?:in the )?(morning|evening|afternoon|am|pm)$/i)?.[1]?.toLowerCase();
        if(period){
          const choices=p.options.filter(v=>(new Date(v).getHours()<12)===['morning','am'].includes(period));
          if(choices.length===1)value=choices[0];
        }
        const parsed=interpretTime(value,this.now());
        if(parsed.assumptions.includes('No day specified; using the next occurrence.')){
          if(p.days.length===1)value=p.days[0]+' '+value;
          else if(p.days.length>1)return 'Which day? Write the day and time, such as Friday at 7pm.';
        }
      }
      const edit=structuredClone(p.edit);edit.clarification=null;
      edit.changes[p.need.index]={field:p.need.field,op:'set',value,evidence:[...(edit.changes[p.need.index]?.evidence??[]),text]};
      return this.applyEdit(e.id,edit,p.reason+' · clarified: '+text);
    }
    if(text==='0'&&['mood','energy','purpose','duration','time','planned_time'].includes(p.kind)){p.custom=true;return 'Write your own '+(p.kind.includes('time')?'date/time':p.kind)+', or /cancel.';}
    if (p.kind==='correction') {
      if (['yes','y','1'].includes(lower)) { this.update(e.id,{minutes:p.minutes,durationSource:'user_words'},`Correction confirmed: ${p.raw}`);this.pending=null;return `Updated #${e.id} to ${p.minutes} minutes ${e.kind==='plan'?'estimated':'reported'}. Your original words are still saved.`; }
      if (['no','n','2'].includes(lower)) {this.pending=null;return 'No change. Keep writing.';}
      return 'Reply yes or no. Use /new TEXT for another thought.';
    }
    if (p.kind==='duration') {
      const n=!p.custom&&p.options&&/^\d+$/.test(text)&&Number(text)<=p.options.length?p.options[Number(text)-1]:(minutes(text)??durationFromText("for "+text));if(n===null||n===undefined)return 'Use 1–1440 minutes, for example 20 or twenty. /cancel to leave it.';
      this.update(e.id,{minutes:n,durationSource:'user_words'},'Duration selected');this.pending=null;return this.cards([e],'Changed.');
    }
    if (['mood','energy'].includes(p.kind)) {
      const choices=p.kind==='mood'?moods:energies;
      const selected=p.custom?text:(choices.find(v=>v.toLowerCase()===lower) ?? choices[Number(text)-1] ?? (!/^\d+$/.test(text)?text:null));
      if(!selected)return 'Choose '+choices.map((v,i)=>`${i+1} ${v}`).join(' · ')+', or /cancel.';
      this.update(e.id,{[p.kind]:selected},p.kind+' selected');this.pending=null;return `#${e.id}: ${p.kind} → ${selected}.`;
    }
    if (p.kind==='purpose') {const value=!p.custom&&p.options&&/^\d+$/.test(text)?p.options[Number(text)-1]:text;if(!value)return 'Choose a listed purpose, or type your own.';this.update(e.id,{purpose:value},'Purpose selected');this.pending=null;return `Purpose added to #${e.id}. You can reuse it with /purposes.`;}
    if (p.kind==='alert') {
      const type=['1','reminder','notification reminder'].includes(lower)?'reminder':['2','alarm','ringing alarm'].includes(lower)?'alarm':null;
      if(!type)return 'Reply 1 for a reminder or 2 for an alarm, or /cancel.';
      if(e.planned&&new Date(e.planned)>this.now())return this.confirmAlert(e,type,e.planned);
      return this.timeQuestion(e,'time',{type});
    }
    if(p.kind==='time'||p.kind==='planned_time') {
      const chosen=!p.custom&&p.options&&/^\d+$/.test(text)?p.options[Number(text)-1]:null;
      let parsed=chosen?{planned:chosen,plannedDate:localDate(new Date(chosen)),status:"chosen",assumptions:[]}:interpretTime(text,this.now());
      if(!chosen&&p.clockAnswer&&parsed.status==='date_only')parsed=interpretTime(parsed.plannedDate+' '+p.clockAnswer,this.now());
      if(e.ai&&!chosen){
        if(parsed.assumptions.some(a=>a.startsWith("AM/PM wasn't specified")))return 'Include AM or PM, or use a 24-hour time. /cancel keeps it unresolved.';
        const noDay=parsed.assumptions.includes('No day specified; using the next occurrence.');
        if(noDay&&e.plannedDate)parsed=interpretTime(e.plannedDate+' '+text,this.now());
        else if(noDay&&e.interpretation?.uncertain){
          const source=(e.interpretation.timeEvidence??[]).join(' ');
          if(/\b(every|daily|weekly|monthly)\b/i.test(source)){p.clockAnswer=text;return 'Repeating plans are not supported yet. Which day should I use for a one-time plan?';}
          const days=statedDays(source,new Date(e.interpretation.reference??this.now()));
          if(days.length>1){p.clockAnswer=text;return 'Include the day as well. Which day should I use?';}
          if(days.length===1)parsed=interpretTime(days[0]+' '+text,this.now());
          // With no stated day, use the normal next-occurrence rule. Uncertainty
          // about an approximate clock must not manufacture a missing-day error.
        }
      }
      const at=chosen??parsed.planned;
      if(!at)return 'What day and time? Choose a number, or write tomorrow at 7am. /cancel leaves it unchanged.';
      if(p.kind==='time')return this.confirmAlert(e,p.type,at,parsed);
      this.update(e.id,{...(parsed.minutes!=null?{minutes:parsed.minutes,durationSource:'user_words'}:{}),planned:at,plannedDate:parsed.plannedDate,interpretation:{...parsed,planned:at,choiceText:text},alert:(e.alert?.type??e.alertIntent?.type)?scheduledAlert(e.alert?.type??e.alertIntent.type,at,this.now()):null},'Time changed by user');this.pending=null;
      return `#${e.id}: ${formatTime(at)}.\n`+this.menu(e);
    }
    if(p.kind==='confirm_alert') {
      if(['yes','y','1'].includes(lower)) {
        if(new Date(scheduledAlert(p.type,p.at,this.now()).at)<=this.now())return this.ask('time',e.id,'That time has passed. Choose a future date and time.',{type:p.type});
        this.update(e.id,{...(p.interpretation?.minutes!=null?{minutes:p.interpretation.minutes,durationSource:'user_words',interpretation:p.interpretation}:{}),planned:p.at,plannedDate:localDate(new Date(p.at)),alertIntent:{type:p.type,reason:'Chosen by you.'},alert:scheduledAlert(p.type,p.at,this.now())},'Alert confirmed');this.pending=null;return `Scheduled ${p.type} for #${e.id} at ${formatTime(this.get(e.id).alert.at)}. Keep the CLI open.`;
      }
      if(text==='2')return this.timeQuestion(e,'time',{type:p.type});
      if(['no','n','3'].includes(lower)){this.pending=null;return 'Change canceled. The entry is still saved.';}
      return 'Reply yes or no.';
    }
  }
export function processLine(line) {
    const text=line.trim();if(!text)return '';
    if(!text.startsWith('/')) {
      if(this.pending)return this.answer(text);
      if(/^\d{1,2}$/.test(text)&&this.quick[Number(text)-1])return this.runAction(this.quick[Number(text)-1]);
      const match=text.match(/^actually[\s,]+(.+)$/i), n=match?minutes(match[1]):null;
      if(n!==null&&this.get())return this.ask('correction',this.latest,`Change #${this.latest} “${this.get().title}” to ${n} minutes ${this.get().kind==='plan'?'estimated':'reported'}?\nyes / no · /new TEXT saves a different thought`,{minutes:n,raw:text});
      if(n!==null&&!this.get())return 'There is no current entry to correct. Use /show ID to select one, or /new TEXT to capture this.';
      if(!this.interpreter&&looksLikeEdit(text))return 'Start the CLI with --ai to ask for changes in your own words. For now, use /show ID, then /time, /duration or /alert. Use /new to save this as a new note.';
      return this.capture(text);
    }
    const [command,...rest]=text.slice(1).split(/\s+/), arg=rest.join(' ');
    if(command==='help')return help;
    if(command==='cancel'){this.pending=null;return 'Follow-up closed. Keep writing.';}
    if(['capture','checkin','remind'].includes(command)){this.mode=command;this.pending=null;this.quick=[];return command==='checkin'?'Check-in mode. What have you been doing?':command==='remind'?'Remind mode. What do you want to remember?':'Capture mode. What is your next thought?';}
    if(command==='options')return this.menu();
    if(command==='new')return arg?this.capture(text.replace(/^\/new\s+/,'')):'Use /new followed by a thought.';
    if(command==='history'||command==='next') {
      const entries=command==='next'?this.data.entries.filter(e=>e.kind==='plan'&&!e.done):this.data.entries.slice(-20).reverse();
      return entries.map(e=>this.summary(e)).join('\n\n')||'Nothing here yet. Capture whenever you want.';
    }
    if(command==='purposes')return [...new Set([...this.data.entries,...this.data.results].map(e=>e.purpose).filter(Boolean))].join('\n')||'No purposes yet. They are optional.';
    if(command==='result') {
      const [title,...purpose]=arg.split('|');if(!title?.trim())return 'Use /result Desired result | Optional purpose';
      const r={id:Math.max(0,...this.data.results.map(r=>r.id))+1,title:capitalizeTitle(title),purpose:purpose.join('|').trim()};this.commit(()=>this.data.results.push(r));return `Result R${r.id}: ${r.title}`;
    }
    if(command==='results')return this.data.results.map(r=>`R${r.id} ${r.title}${r.purpose?' · '+r.purpose:''}`).join('\n')||'No results. Unfiled thoughts are fine.';
    if(command==='show') {
      const e=this.get(arg||this.latest);if(!e)return 'Entry not found. Use /history for IDs.';this.latest=e.id;this.pending=null;this.quick=[];
      return this.summary(e)+`\nInterpretation: ${JSON.stringify(e.interpretation??null)}${e.ai?'\nAI request: '+JSON.stringify(e.ai)+'\nEvidence: '+JSON.stringify(e.evidence??[])+'\nFeelings: '+JSON.stringify(e.feelings??null):''}\nOriginal: ${e.raw}\nSaved: ${e.created}\nResult: ${e.result?'R'+e.result:'Unfiled'}\nAlert: ${e.alert?JSON.stringify(e.alert):'None'}\nRevisions:\n`+e.revisions.map(r=>`  ${r.at} · ${r.reason} · ${r.snapshot.minutes??'unknown'} min`).join('\n');
    }
    const e=this.get(command==='done'&&arg?arg:this.latest);
    if(!['time','duration','mood','energy','purpose','alert','link','done'].includes(command))return 'Unknown command. /help lists the options. Your text was not saved.';
    if(!e)return 'Capture something first, or /show ID to select an existing entry.';
    if(command==='alert'){if(arg==='off'){this.update(e.id,{alert:null,alertIntent:{type:null,reason:'Disabled by user'}},'Alert disabled');this.pending=null;return 'Alert disabled.';}return this.alert(e);}
    if(command==='time'){const q=this.timeQuestion(e);return arg?this.answer(arg):q;}
    if(command==='done') {if(e.kind!=='plan')return 'Check-ins record what happened; only plans can be marked done.';this.update(e.id,{done:true},'Marked done; actual time not inferred');return `#${e.id} marked done.`;}
    if(command==='link') {const r=this.data.results.find(r=>r.id===Number(arg.replace(/^r/i,'')));if(!r)return 'Use /results for an ID, then /link ID.';this.update(e.id,{result:r.id},'Linked result');return `#${e.id} linked to R${r.id}.`;}
    if(['mood','energy'].includes(command)&&e.kind!=='checkin')return 'Mood and energy belong to check-ins. Use /checkin to record a moment.';
    if(command==='duration'){
      const question=bubble(`Minutes for #${e.id} · ${e.title}`,[e.kind==='plan'?'How long will it take?':'How long did it take?',...chips([15,20,30,60].map((n,i)=>({number:i+1,label:n+' min'})),this.columns()),'[0 Write your own] · or type 45 minutes · /cancel'],{width:this.columns()});
      this.ask(command,e.id,question,{options:arg?null:[15,20,30,60]});return arg?this.answer(arg):question;
    }
    if(command==='purpose'){
      const options=[...new Set([...this.data.entries,...this.data.results].map(x=>x.purpose).filter(Boolean))].slice(-4);
      const question=bubble(`Purpose for #${e.id} · ${e.title}`,['Why does this matter to you?',...chips(options.map((label,i)=>({number:i+1,label})),this.columns()),'[0 Write your own] · or type your purpose · /cancel'],{width:this.columns()});
      this.ask(command,e.id,question,{options:arg?null:options});return arg?this.answer(arg):question;
    }
    const question=choicesText(command,e.id,this.columns());
    this.ask(command,e.id,question);return arg?this.answer(arg):question;
  }
function choicesText(kind,id,width){return bubble(`${kind==='mood'?'Mood':'Energy'} for #${id}`,[kind==='mood'?'How do you feel?':'How is your energy?',...chips((kind==='mood'?moods:energies).map((label,i)=>({number:i+1,label})),width),'[0 Write your own] · or type a feeling · /cancel'],{width});}
