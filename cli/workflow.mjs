import {answerValue as answerDialogue,processLine,moods,energies,minutes} from './workflow-dialogue.mjs';
export {help,minutes} from './workflow-dialogue.mjs';
import {interpretTime,parseTime,formatTime,durationFromText,inferFeelings,inferAlert,scheduledAlert} from './interpret.mjs';
export {parseTime} from './interpret.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {actionsFor,bubble,chips,entryBubble,timeChoices} from './bubbles.mjs';
import {editPatch,editTargets,looksLikeEdit,editTimeContext} from './edits.mjs';
import {capitalizeTitle} from './title.mjs';

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
    const estimate=interpretation?.minutes??durationFromText(text);
    const feelings=checkin&&!this.modelPending?inferFeelings(text):null;
    const intent=checkin||this.modelPending?null:inferAlert(text);
    const e = {interpretation,plannedDate:interpretation?.plannedDate??null,planned,id,kind:checkin?'checkin':'plan',raw:text,title:capitalizeTitle(text),created:this.now().toISOString(),minutes:checkin?estimate:(estimate??30),durationSource:estimate!==null?'user_words':checkin?'unknown':'default_estimate',mood:feelings?.mood??null,energy:feelings?.energy??null,feelings,alertIntent:intent,purpose:'',result:null,done:false,alert:planned&&intent?.type?scheduledAlert(intent.type,planned,this.now()):null,revisions:[]};
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
        Object.assign(initial,{...(interpretation?.minutes!=null?{minutes:interpretation.minutes,durationSource:'user_words'}:{}),interpretation,planned:interpretation?.planned??null,plannedDate:interpretation?.plannedDate??null,feelings,mood:feelings?.mood??null,energy:feelings?.energy??null,alert:null,alertIntent:initial.kind==='plan'?inferAlert(text):null,ai:result.metadata});
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
            target={id:entryId,raw:initial.raw,title:capitalizeTitle(feelings.evidence.join(' ')),created:initial.created,kind:'checkin',state:'active',minutes:null,purpose:'',result:null,done:false,planned:null,plannedDate:null,interpretation:null,alert:null,alertIntent:null,revisions:[],captureId:id,ai:result.metadata};
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
  confirmAlert(e,type,at,interpretation=null){return this.ask('confirm_alert',e.id,`${type==='alarm'?'Ringing alarm':'Notification reminder'} for #${e.id} “${e.title}”\nEvent: ${formatTime(at)} · alert: ${formatTime(scheduledAlert(type,at,this.now()).at)}\n1 Set alert  2 Change time  3 Cancel · or reply yes/no`,{type,at,interpretation});}

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
  answerValue(text) { return answerDialogue.call(this,text); }
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
  process(line) { return processLine.call(this,line); }
}
