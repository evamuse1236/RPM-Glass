import {interpretTime,parseTime,formatTime,durationFromText,localDate,inferFeelings,inferAlert,scheduledAlert,statedDays} from './interpret.mjs';
export {parseTime} from './interpret.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {actionsFor,bubble,chips,entryBubble,timeChoices} from './bubbles.mjs';
import {editPatch,editTargets,looksLikeEdit,editTimeContext} from './edits.mjs';

export function emptyData() { return { version: 1, entries: [], results: [] }; }
export function load(file) {
  if (!fs.existsSync(file)) return emptyData();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.version !== 1 || !Array.isArray(data.entries) || !Array.isArray(data.results)) throw new Error('Unsupported or damaged data file. Original file was not changed.');
  return data;
}
export function persist(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(temp, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}
const moods = ['Low', 'Uneasy', 'Okay', 'Good', 'Great'];
const energies = ['Low', 'Medium', 'High'];
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

export class Workflow {
  constructor(data = emptyData(), { save = () => {}, now = () => new Date(), interpreter = null, columns = () => 80 } = {}) {
    this.data = data; this.saveData = save; this.now = now;
    this.interpreter=interpreter;this.modelPending=false;
    this.columns=columns;
    this.mode = 'capture'; this.latest = null; this.pending = null;this.quick=[];
  }
  commit(change) {
    const backup = structuredClone(this.data);
    try { change(); this.saveData(this.data); } catch (error) { this.data = backup; throw error; }
  }
  get(id = this.latest) { return this.data.entries.find(e => e.id === Number(id)); }
  revision(e, reason) { const { revisions, ...snapshot } = e; revisions.push({ at:this.now().toISOString(), reason, snapshot:structuredClone(snapshot) }); }
  update(id, patch, reason) { this.commit(() => { const e = this.get(id); Object.assign(e, patch); this.revision(e, reason); }); }
  summary(e) {
    const kind=e.state==='cancelled'?'Cancelled':e.kind==='plan'?(e.done?'Done':'Plan'):'Check-in';
    const duration=e.minutes==null?(e.kind==='plan'?'Estimate not set':'Actual time not recorded'):e.minutes+(e.kind==='plan'?' min estimate':' min reported');
    return `#${e.id} ${e.title}\n  ${kind} · ${duration}${e.mood?' · '+e.mood:''}${e.energy?' · '+e.energy+' energy':''}${e.planned?'\n  Planned: '+formatTime(e.planned)+(e.alert?.status==='scheduled'?' · '+e.alert.type+' at '+formatTime(e.alert.at):''):e.plannedDate?'\n  Day: '+e.plannedDate+' · time not set':''}${e.purpose?'\n  Purpose: '+e.purpose:''}`;
  }
  ask(kind, id, text, extra = {}) { this.pending = {kind,id,...extra}; return text; }
  capture(text) {
    const id = Math.max(0, ...this.data.entries.map(e=>e.id)) + 1;
    const checkin = this.mode === 'checkin';
    const interpretation=this.modelPending?{source:'openrouter',status:'pending',assumptions:[],planned:null,plannedDate:null}:checkin?null:interpretTime(text,this.now());
    const planned=interpretation?.planned??null;
    const estimate=durationFromText(text);
    const feelings=checkin&&!this.modelPending?inferFeelings(text):null;
    const intent=checkin||this.modelPending?null:inferAlert(text);
    const e = {interpretation,plannedDate:interpretation?.plannedDate??null,planned,id,kind:checkin?'checkin':'plan',raw:text,title:text,created:this.now().toISOString(),minutes:checkin?estimate:(estimate??30),durationSource:estimate!==null?'user_words':checkin?'unknown':'default_estimate',mood:feelings?.mood??null,energy:feelings?.energy??null,feelings,alertIntent:intent,purpose:'',result:null,done:false,alert:planned&&intent?.type?scheduledAlert(intent.type,planned,this.now()):null,revisions:[]};
    this.commit(()=>{this.data.entries.push(e);this.revision(e,'Captured');}); this.latest=id;this.pending=null;
    return this.modelPending?`Saved original #${e.id}.`:this.cards([e],'Saved');
  }
  captureText(line) {
    const text=line.trim();
    if(/^\/new\s+\S/.test(text))return text.replace(/^\/new\s+/, '');
    if(!text||text.startsWith('/')||(this.pending&&!looksLikeEdit(text))||(/^\d{1,2}$/.test(text)&&this.quick[Number(text)-1]))return null;
    const match=text.match(/^actually[\s,]+(.+)$/i);
    if(match&&minutes(match[1])!==null)return null;
    return text;
  }
  async sendAsync(line,{onSaved=()=>{}}={}) {
    const text=this.interpreter?this.captureText(line):null;
    if(text===null)return this.send(line);
    // Durably retain input before network I/O. No speculative alert can fire.
    const reference=this.now();
    const captureOnly=/^\/new\s+/.test(line.trim());
    const previousLatest=this.latest;
    const priorPending=this.pending;
    this.modelPending=true;
    // A fresh edit can interrupt a follow-up, just like /new can.
    if(priorPending&&looksLikeEdit(text))this.pending=null;
    try{this.send(line);}catch(error){this.pending=priorPending;throw error;}finally{this.modelPending=false;}
    const id=this.latest;
    const interactionIndex=this.data.interactions.length-1;
    onSaved('Saved. Reading your note…');
    let result;
    try{result=await this.interpreter(text,{now:reference,mode:this.mode,...(captureOnly?{captureOnly:true}:{})});}
    catch{result={entries:null,metadata:{source:'openrouter',status:'failed',failure:'interpreter_error'}};}
    if(!captureOnly&&(result.intent==='edit'||(!result.entries&&looksLikeEdit(text))))return this.finishEditRequest(id,interactionIndex,result,previousLatest);
    return this.finishCaptureRequest(id,interactionIndex,result,reference,text);
  }
  finishCaptureRequest(id,interactionIndex,result,reference,text){
    const savedIds=[];
    this.commit(()=>{
      const initial=this.get(id);
      if(!result.entries){
        // Existing rules remain useful offline. Failed AI requests require an
        // explicit edit before activating an alert from a weaker interpretation.
        const interpretation=initial.kind==='plan'?interpretTime(text,reference):null;
        const feelings=initial.kind==='checkin'?inferFeelings(text):null;
        Object.assign(initial,{interpretation,planned:interpretation?.planned??null,plannedDate:interpretation?.plannedDate??null,feelings,mood:feelings?.mood??null,energy:feelings?.energy??null,alert:null,alertIntent:initial.kind==='plan'?inferAlert(text):null,ai:result.metadata});
        this.revision(initial,'Local rules fallback; automatic alert withheld');
        savedIds.push(id);
      }else{
        for(const [index,fields] of result.entries.entries()){
          const entryId=index===0?id:Math.max(0,...this.data.entries.map(e=>e.id))+1;
          const entry=index===0?initial:{id:entryId,raw:initial.raw,created:initial.created,result:null,revisions:[]};
          Object.assign(entry,fields,{mood:null,energy:null,feelings:null,captureId:id,ai:result.metadata});
          if(index>0)this.data.entries.push(entry);
          savedIds.push(entryId);
        }
        const feelings=result.feelings;
        if(feelings&&(feelings.mood||feelings.energy)){
          let target=savedIds.map(entryId=>this.get(entryId)).find(e=>e.kind==='checkin');
          if(!target){
            const entryId=Math.max(...this.data.entries.map(e=>e.id))+1;
            target={id:entryId,raw:initial.raw,title:feelings.evidence.join(' '),created:initial.created,kind:'checkin',state:'active',minutes:null,purpose:'',result:null,done:false,planned:null,plannedDate:null,interpretation:null,alert:null,alertIntent:null,revisions:[],captureId:id,ai:result.metadata};
            this.data.entries.push(target);savedIds.push(entryId);
          }
          Object.assign(target,{mood:feelings.mood,energy:feelings.energy,feelings:structuredClone(feelings)});
        }
        for(const entryId of savedIds)this.revision(this.get(entryId),'Model interpretation validated; times computed locally');
      }
      this.data.interactions[interactionIndex].interpretation={...result.metadata,entryIds:savedIds};
    });
    this.latest=savedIds.find(entryId=>this.get(entryId).interpretation?.status==='review')??savedIds.at(-1);
    this.pending=null;
    const needsTime=result.entries&&this.get().interpretation?.status==='review';
    let response=this.cards(savedIds.map(entryId=>this.get(entryId)),'Saved',!needsTime);
    if(!result.entries)response+='\nAI is not available. Your note is saved with local rules. Check the time, then use /time or /alert to set an alert.';
    if(needsTime)response+='\n'+this.timeQuestion(this.get());
    this.commit(()=>{this.data.interactions[interactionIndex].response=response;});
    return response;
  }
  cards(entries,label='',interactive=true){
    this.quick=[];
    const rendered=entries.map(e=>{
      const actions=interactive?actionsFor(e).map(a=>({...a,number:this.quick.push(a)})):[];
      return entryBubble(e,actions,{width:this.columns()});
    });
    return (label?label+'\n':'')+rendered.join('\n')+(interactive?'\nChoose a number, ask for a change, or write another note.':'');
  }
  menu(e=this.get()){
    return e?this.cards([e]):'';
  }
  runAction(action){
    const e=this.get(action.id);
    if(!e)return 'That entry is no longer available. Use /history.';
    this.latest=e.id;this.pending=null;
    if(['time','duration','mood','energy','purpose'].includes(action.key))return this.process('/'+action.key);
    if(action.key==='details')return this.process('/show '+e.id);
    const changes={reminder:['alert','reminder'],alarm:['alert','alarm'],alert_off:['alert','off'],done:['status','done'],reopen:['status','active']};
    const change=changes[action.key];
    if(!change)return 'That action is no longer available. Use /options.';
    return this.applyEdit(e.id,{target:'#'+e.id,targetEvidence:null,changes:[{field:change[0],op:'set',value:change[1],evidence:[]}],clarification:null},'Action: '+action.label);
  }
  finishEditRequest(placeholderId,index,result,previousLatest){
    const backup=structuredClone(this.data);
    const session={latest:previousLatest,pending:structuredClone(this.pending),quick:[...this.quick]};
    const save=this.saveData;this.saveData=()=>{};
    try{
      // Remove only our provisional capture, never a user's existing entry.
      this.data.entries=this.data.entries.filter(e=>e.id!==placeholderId);
      this.latest=previousLatest;this.pending=null;this.quick=[];
      const interaction=this.data.interactions[index];
      interaction.interpretation={...result.metadata,intent:'edit',request:result.edit??null};
      const response=result.edit?this.beginEdit(result.edit,'Natural edit: '+interaction.raw):'Your request is saved. AI could not read the change. No plan or check-in changed. Use /show ID, then /time, /duration, or /alert.';
      interaction.response=response;
      interaction.interpretation.targetId=this.pending?.id??this.latest;
      save(this.data);
      return response;
    }catch(error){this.data=backup;Object.assign(this,session);throw error;}finally{this.saveData=save;}
  }
  beginEdit(edit,reason){
    const matches=editTargets(edit,this.data.entries,this.latest,this.now());
    if(matches.length===1)return this.applyEdit(matches[0].id,edit,reason);
    const options=(matches.length?matches:this.data.entries).slice(-8).map(e=>e.id);
    this.quick=[];
    const choices=options.map((id,i)=>({number:i+1,label:`#${id} ${this.get(id).title}`}));
    return this.ask('edit_target',null,bubble(matches.length?'Which entry did you mean?':'Which saved entry should I change?',[
      ...chips(choices,this.columns()),'[0 Write a name or #ID]','No entry has changed. /cancel leaves it as it is.',
    ],{width:this.columns()}),{edit:structuredClone(edit),reason,options});
  }
  applyEdit(id,edit,reason){
    const e=this.get(id);
    if(!e)return 'Entry not found. No entry was changed.';
    const result=editPatch(e,edit,this.now());
    if(result.error)return result.error;
    this.latest=e.id;
    if(result.need){
      const {field}=result.need;
      const source=edit.changes[result.need.index]?.evidence??[];
      const context=field==='time'?editTimeContext(e,edit.changes[result.need.index],this.now()):null;
      const times=field==='time'?(context?.options.length?context.options:timeChoices({...e,interpretation:{timeEvidence:source}},this.now())):[];
      const options=field==='time'?times.map(t=>t.at):field==='duration'?['15 minutes','20 minutes','30 minutes','60 minutes']:field==='alert'?['reminder','alarm','off']:field==='status'?['done','active','cancelled']:field==='mood'?moods:field==='energy'?energies:[];
      const labels=field==='time'?times.map(t=>t.label):options;
      const dayWords=[...new Set(source.join(' ').match(/\b(?:day after tomorrow|tomorrow|today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi)??[])];
      const days=field==='time'?[...new Set(dayWords.map(day=>interpretTime(day,this.now()).plannedDate).filter(Boolean))]:[];
      this.quick=[];
      return this.ask('edit_value',e.id,bubble(`For #${e.id} · ${e.title}`,['No change yet.',result.need.prompt,...chips(labels.map((label,i)=>({number:i+1,label})),this.columns()),'[0 Write your own] · /cancel'],{width:this.columns()}),{edit:structuredClone(edit),reason,need:result.need,options,days});
    }
    this.update(e.id,result.patch,reason);this.pending=null;
    return this.cards([this.get(e.id)],'Changed. Your original words are still saved.');
  }
  timeQuestion(e,kind='planned_time',extra={}){
    const seed=timeChoices(e,this.now());
    const defaults=e.ai?[]:['tomorrow at 7am','tomorrow at 7pm'];
    const values=[...seed.map(c=>c.at),...(e.planned?[e.planned]:[]),...defaults].map(v=>/^\d{4}-/.test(v)&&v.includes('T')?v:parseTime(v,this.now())).filter(v=>v&&new Date(v)>this.now());
    const options=[...new Set(values)].slice(0,6);
    this.quick=[];
    return this.ask(kind,e.id,bubble(`Time for #${e.id} · ${e.title}`,[e.interpretation?.reason??'Choose a day and time.',...chips(options.map((v,i)=>({number:i+1,label:formatTime(v)})),this.columns()),'[0 Write your own] · or type a time directly · /cancel'],{width:this.columns()}), {...extra,options});
  }
  confirmAlert(e,type,at){return this.ask('confirm_alert',e.id,`${type==='alarm'?'Ringing alarm':'Notification reminder'} for #${e.id} “${e.title}”\nEvent: ${formatTime(at)} · alert: ${formatTime(scheduledAlert(type,at,this.now()).at)}\n1 Set alert  2 Change time  3 Cancel · or reply yes/no`,{type,at});}

  alert(e) {
    if (!e || e.kind !== 'plan') return 'Choose a plan first. Capture one, or use /show ID.';
    return this.ask('alert',e.id,`For #${e.id} “${e.title}”: notification reminder or ringing alarm?\n1 Reminder   2 Alarm   /cancel\nAlarms ring 10 minutes before the event; reminders notify at its time.`);
  }
  answer(text) {
    const question=this.pending;
    const response=this.answerValue(text);
    // A rejected reply must show the current explanation, not the original question.
    if(this.pending===question&&typeof response==='string')question.prompt=response;
    return response;
  }
  answerValue(text) {
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
      if(p.kind==='time')return this.confirmAlert(e,p.type,at);
      this.update(e.id,{planned:at,plannedDate:parsed.plannedDate,interpretation:{...parsed,planned:at,choiceText:text},alert:(e.alert?.type??e.alertIntent?.type)?scheduledAlert(e.alert?.type??e.alertIntent.type,at,this.now()):null},'Time changed by user');this.pending=null;
      return `#${e.id}: ${formatTime(at)}.\n`+this.menu(e);
    }
    if(p.kind==='confirm_alert') {
      if(['yes','y','1'].includes(lower)) {
        if(new Date(scheduledAlert(p.type,p.at,this.now()).at)<=this.now())return this.ask('time',e.id,'That time has passed. Choose a future date and time.',{type:p.type});
        this.update(e.id,{planned:p.at,plannedDate:localDate(new Date(p.at)),alertIntent:{type:p.type,reason:'Chosen by you.'},alert:scheduledAlert(p.type,p.at,this.now())},'Alert confirmed');this.pending=null;return `Scheduled ${p.type} for #${e.id} at ${formatTime(this.get(e.id).alert.at)}. Keep the CLI open.`;
      }
      if(text==='2')return this.timeQuestion(e,'time',{type:p.type});
      if(['no','n','3'].includes(lower)){this.pending=null;return 'Change canceled. The entry is still saved.';}
      return 'Reply yes or no.';
    }
  }
  send(line) {
    const backup=structuredClone(this.data);
    const session={mode:this.mode,latest:this.latest,pending:structuredClone(this.pending),quick:[...this.quick]};
    const save=this.saveData;this.saveData=()=>{};
    try{
      const context={mode:this.mode,target:this.latest,pending:structuredClone(this.pending),quick:[...this.quick]};
      const response=this.process(line);
      if(line.trim()){this.data.interactions??=[];this.data.interactions.push({at:this.now().toISOString(),raw:line,context,response});save(this.data);}
      return response;
    }catch(error){this.data=backup;Object.assign(this,session);throw error;}finally{this.saveData=save;}
  }
  process(line) {
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
      const r={id:Math.max(0,...this.data.results.map(r=>r.id))+1,title:title.trim(),purpose:purpose.join('|').trim()};this.commit(()=>this.data.results.push(r));return `Result R${r.id}: ${r.title}`;
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
}
function choicesText(kind,id,width){return bubble(`${kind==='mood'?'Mood':'Energy'} for #${id}`,[kind==='mood'?'How do you feel?':'How is your energy?',...chips((kind==='mood'?moods:energies).map((label,i)=>({number:i+1,label})),width),'[0 Write your own] · or type a feeling · /cancel'],{width});}
