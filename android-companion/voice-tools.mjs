import {planner,blockTasks} from './planner-state.mjs';

export const LIVE_MODEL='gemini-3.8-live';

const live=x=>!x.archived;
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const id={type:'integer'},entityId={type:'string'},maybe=t=>({type:[t,'null']});

export const TOOLS=Object.freeze([
 {name:'get_plan',description:'Read every saved task, Block, Project and Area with their ids. Call it before changing anything.',parameters:object({})},
 {name:'save_task',description:'Add a task (no id) or change one (with id). Send only the fields to set. done:true completes it, done:false reopens it. Times are local ISO with the offset, like 2026-10-28T18:00:00+05:30.',parameters:object({
  id:{...id,description:'Existing task id. Leave out to add a task.'},title:{type:'string'},
  start:{...maybe('string'),description:'Start date and time, ISO with offset.'},day:{...maybe('string'),description:'A day with no time, YYYY-MM-DD.'},
  minutes:maybe('integer'),blockId:{...maybe('string'),description:'Block id, or null for the Inbox.'},
  alert:{type:['string','null'],enum:['reminder','alarm','off',null]},alertLead:{type:'integer',description:'Minutes before the start.'},
  repeat:{type:['string','null'],enum:['daily','weekly','weekdays',null]},must:{type:'boolean'},notes:{type:'string'},purpose:{type:'string'},done:{type:'boolean'},
  pastOk:{type:'boolean',description:'Only after they confirmed a start time that has already passed.'},duplicate:{type:'boolean',description:'Only when they asked for a second task with the same title.'}})},
 {name:'delete_task',description:'Move a task to Trash. Only when their words ask to delete or remove it. It can be restored.',parameters:object({id},['id'])},
 {name:'restore_task',description:'Bring a task back from the Trash (ids in the plan\'s trash list). Use this, never save_task, when they ask to restore or bring back a task.',parameters:object({id},['id'])},
 {name:'undo_last',description:'Undo your own last change, when they say undo that, take it back or that was wrong.',parameters:object({})},
 {name:'move_task',description:'Move a task into a Block, or to the Inbox with blockId null. Put it before another task with beforeId, else last.',parameters:object({id,blockId:maybe('string'),beforeId:maybe('integer')},['id','blockId'])},
 {name:'order_block',description:'Set the priority order of tasks in one Block (or the Inbox with blockId null), most important first. Listed tasks go to the top in that order; the rest keep their order below.',parameters:object({blockId:maybe('string'),ids:{type:'array',items:id}},['blockId','ids'])},
 {name:'save_block',description:'Add an RPM Block (no id) or change one. Title is the result wanted, purpose is why it matters. projectId puts it in a Project; null takes it out.',parameters:object({id:entityId,title:{type:'string'},purpose:{type:'string'},projectId:maybe('string')})},
 {name:'delete_block',description:'Remove a Block. Its tasks move to the Inbox.',parameters:object({id:entityId},['id'])},
 {name:'save_project',description:'Add a Project (no id) or change one. goalId puts it under a Goal, and so in that Goal\'s Area; null takes it out.',parameters:object({id:entityId,title:{type:'string'},purpose:{type:'string'},goalId:maybe('string')})},
 {name:'delete_project',description:'Remove a Project. Its Blocks stay, outside any Project.',parameters:object({id:entityId},['id'])},
 {name:'save_goal',description:'Add a Goal (no id) or change one. A Goal sits in one Area (areaId) and holds Projects. A new Goal is for this year unless year is given.',parameters:object({id:entityId,title:{type:'string'},purpose:{type:'string'},areaId:maybe('string'),year:{type:'integer'}})},
 {name:'delete_goal',description:'Remove a Goal. Its Projects stay, outside any Goal.',parameters:object({id:entityId},['id'])},
 {name:'save_area',description:'Add a life Area (no id) or change one. rating is 0 to 10.',parameters:object({id:entityId,title:{type:'string'},purpose:{type:'string'},rating:maybe('number')})},
 {name:'delete_area',description:'Remove a life Area.',parameters:object({id:entityId},['id'])},
]);

const parts=(date,timeZone)=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
export function offsetOf(date,timeZone){
 const p=parts(date,timeZone),local=Date.UTC(+p.year,p.month-1,+p.day,+p.hour,+p.minute),minutes=Math.round((local-Math.floor(date/60000)*60000)/60000);
 const sign=minutes<0?'-':'+',abs=Math.abs(minutes);return `${sign}${String(Math.floor(abs/60)).padStart(2,'0')}:${String(abs%60).padStart(2,'0')}`;
}
const localTime=(iso,timeZone)=>new Date(iso).toLocaleString('en-US',{timeZone,weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});

const TRASH_IN_VIEW=20;
const isTask=e=>(e.kind??'plan')==='plan';
const trashed=data=>data.entries.filter(e=>isTask(e)&&e.archived&&e.archiveDisposition!=='archive');

/** Words that must be in what was heard before a call removes or completes something. A yes answers a question the model asked. */
export const ASKED=Object.freeze({
 remove:/\b(delete|deleted|remove|removed|trash|bin|drop|cancel|cancelled|canceled|get rid|erase|scrap|discard|don'?t need|no longer need)\b/i,
 complete:/\b(done|did|finished|finish|complete|completed|tick|ticked|check(ed)? (it )?off|mark(ed)?)\b/i,
 yes:/\b(yes|yeah|yep|yup|sure|confirm|confirmed|go ahead|do it|please do)\b/i,
});
const NOT_ASKED={remove:'They did not ask to remove this. Change nothing and ask them first.',complete:'They did not say this is done. Change nothing and ask them first.'};

/** Refuses a remove or complete that the heard words do not ask for. */
export function checkAsked(name,args,heard){
 const need=name.startsWith('delete_')?'remove':name==='save_task'&&args?.done===true?'complete':null;
 if(need&&!ASKED[need].test(heard)&&!ASKED.yes.test(heard))throw new Error(NOT_ASKED[need]);
}

export function planView(data,timeZone){
 const p=planner(data),blocks=p.blocks.filter(live);
 const task=e=>({id:e.id,title:e.title,done:!!e.done,start:e.planned?localTime(e.planned,timeZone):null,day:e.plannedDate??null,minutes:e.minutes??null,alert:e.alertIntent?.type??null,repeat:e.recurrence??null,must:!!e.must,priority:e.priority??null});
 return {
  inbox:blockTasks(data,null).map(task),
  blocks:blocks.map(b=>({id:b.id,title:b.title,purpose:b.purpose||null,projectId:b.projectId??null,tasks:blockTasks(data,b.id).map(task)})),
  projects:p.projects.filter(live).map(x=>({id:x.id,title:x.title,purpose:x.purpose||null,goalId:x.goalId??null})),
  goals:p.goals.filter(live).map(g=>({id:g.id,title:g.title,purpose:g.purpose||null,areaId:g.areaId??null,year:g.year})),
  areas:p.areas.filter(live).map(a=>({id:a.id,title:a.title,purpose:a.purpose||null,rating:a.rating??null})),
  trash:trashed(data).slice(-TRASH_IN_VIEW).map(e=>({id:e.id,title:e.title})),
 };
}

/** Plans bigger than this stay out of the prompt, so the setup stays under the phone's 64 KB limit. */
export const PLAN_IN_PROMPT_MAX=40000;

const planLines=plan=>plan?`- The plan as it is now is below (the same answer get_plan gives). Save at once; call get_plan only after your own saves, to see their results.
PLAN: ${plan}`:'- Call get_plan first.';

/** The phone's open line: Gemini ends each request after half a second of quiet, and the session stays open. */
export const OPEN_LINE_DETECTION=Object.freeze({disabled:false,endOfSpeechSensitivity:'END_SENSITIVITY_HIGH',silenceDurationMs:500});
const OPENING={
 once:'They talk, then stop; you change the plan with tools, then say in one short, warm sentence what you did.',
 open:'The line stays open, so they can add more after each answer. Change the plan with tools, and answer every direct request with one short sentence.',
};

export function systemPrompt(now,timeZone,{plan=null,continuous=false,persona=''}={}){
 const today=now.toLocaleString('en-US',{timeZone,weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit'});
 return `You keep a person's RPM planner. ${continuous?OPENING.open:OPENING.once}
Now: ${today} (time zone ${timeZone}, offset ${offsetOf(now,timeZone)}).
RPM: a task is one action. A Block is one result the person wants (title), with a purpose (why it matters) and the tasks that get it. Projects hold Blocks. Areas are parts of life; an Area holds Goals, and a Goal holds Projects. Priority is the order of tasks inside a Block, most important first. Must marks a task as essential. Blocks have no order of their own: the planner lists them by deadline, the latest dated task in each.
${planLines(plan)}
- Make every change they asked for: add, change, complete, reopen, remove or move tasks; add, change or remove Blocks, Projects and Areas; give purposes; set priorities.
- Use their words for titles. Never invent tasks, times or lengths they did not say.
- "Tomorrow", "tonight", "in 20 minutes" and weekday names count from now. A time without am or pm means the next sensible one.
- A saved item they name or clearly mean is changed, not added again.
- To sort tasks into Blocks, put each task in the Block whose result it serves. Leave a task in the Inbox when no Block clearly fits, and say so.
- To put a Project in an Area, give it a Goal of that Area (save_project goalId). If the Area has no Goal for this year, add one with save_goal, named from their words or else after the Area, and say so. A Block goes into an Area through its Project; if it has none, put it in a fitting Project or add one.
- If they ask to move, reorder or prioritize a Block itself, change nothing for that request, and say the planner lists Blocks by their deadline, so an earlier date on one of its tasks moves it up.
- A new item's id is in the answer to its save; never guess an id.
- Removing or completing is only for what their words ask to remove or complete. When unsure, ask before you remove or complete anything.
- "It", "that" and "them" mean the items you changed last, unless they name another.
- "Restore" or "bring back" means restore_task from the trash list, never a new task. "Undo that" means undo_last.
- If what you heard is not a request to you (talking to someone else, a video, half a sentence), change nothing and say nothing.
- A start time that has already passed today: ask whether they mean another day before you save it.
- If something else is unclear, make the most likely choice and say what you chose. Never wait for an answer before saving what you are sure of.${personaLines(persona)}`;
}

/** Gemini Live prebuilt voices offered in Settings, each with its one-word feel from Google's voice list. */
export const VOICES=Object.freeze([
 {name:'Puck',feel:'Upbeat'},{name:'Charon',feel:'Informative'},{name:'Kore',feel:'Firm'},{name:'Aoede',feel:'Breezy'},
 {name:'Achird',feel:'Friendly'},{name:'Sulafat',feel:'Warm'},{name:'Achernar',feel:'Soft'},{name:'Gacrux',feel:'Mature'}].map(Object.freeze));
export const PERSONA_MAX=300;
/** The offered voice with this name, or null for Gemini's own default. */
export const voiceName=value=>VOICES.find(v=>v.name===value)?.name??null;
/** One line of at most PERSONA_MAX characters, so a persona cannot add lines that look like rules. */
export const personaText=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,PERSONA_MAX).trim():'';
function personaLines(value){
 const persona=personaText(value);
 return persona?`\n\nPersona: speak as ${persona}\nThe rules above always win over the persona. It changes only your tone and wording, never what you save, which tools you call or which rule you follow.`:'';
}

/**
 * The Gemini Live setup message for one session. Both the phone and the website server build it from here.
 * `continuous` is the phone's open line; the website keeps one ramble per press.
 */
export function liveSetup(now,timeZone,{data=null,continuous=false,voice=null,persona=''}={}){
 let view=null;
 try{view=data?JSON.stringify(planView(data,timeZone)):null;}catch{view=null;}
 const plan=view&&view.length<=PLAN_IN_PROMPT_MAX?view:null;
 const name=voiceName(voice);
 const generationConfig={responseModalities:['AUDIO']};
 if(name)generationConfig.speechConfig={voiceConfig:{prebuiltVoiceConfig:{voiceName:name}}};
 return {model:`models/${LIVE_MODEL}`,generationConfig,
  systemInstruction:{parts:[{text:systemPrompt(now,timeZone,{plan,continuous,persona})}]},
  tools:[{functionDeclarations:TOOLS.map(t=>({name:t.name,description:t.description,parametersJsonSchema:t.parameters}))}],
  inputAudioTranscription:{},outputAudioTranscription:{},realtimeInputConfig:{automaticActivityDetection:continuous?{...OPEN_LINE_DETECTION}:{disabled:true}}};
}

const TASK_FIELDS=[['title','title'],['minutes','minutes'],['blockId','blockId'],['alert','alert'],['alertLead','alertLead'],['repeat','recurrence'],['must','must'],['notes','notes'],['purpose','purpose']];
const COLLECTION={block:'blocks',project:'projects',goal:'goals',area:'areas'};
const PAST_GRACE_MS=5*60000;
const sameTitle=(a,b)=>a.trim().toLowerCase()===b.trim().toLowerCase();
const findTask=(data,taskId)=>{const t=data.entries.find(e=>e.id===taskId&&!e.archived&&(e.kind??'plan')==='plan');if(!t)throw new Error(`No task ${taskId}. Call get_plan.`);return t;};
const findEntity=(data,kind,entity)=>{const x=planner(data)[COLLECTION[kind]].find(r=>r.id===entity);if(!x)throw new Error(`No ${kind} ${entity}. Call get_plan.`);return x;};

/**
 * The planner ops for one tool call against `data`, and the change it makes in plain words.
 * get_plan has no ops. Throws a message the model can read when the call names something missing.
 */
export function toolOps(data,name,args={},now=new Date()){
 if(name==='save_task'){
  const before=args.id!=null?findTask(data,args.id):null,fields={},ops=[];
  for(const [from,to] of TASK_FIELDS)if(from in args)fields[to]=args[from];
  if('start'in args){if(args.start!==null&&!Number.isFinite(Date.parse(args.start)))throw new Error('start must be ISO with an offset.');fields.planned=args.start?new Date(args.start).toISOString():null;}
  if('day'in args&&!args.start){fields.plannedDate=args.day;if(args.day)fields.planned=null;}
  if(args.done===true)fields.done=true;
  if(!before&&!fields.title)throw new Error('A new task needs a title.');
  if(fields.planned&&!args.pastOk&&Date.parse(fields.planned)<now-PAST_GRACE_MS&&fields.planned!==before?.planned)throw new Error('That time has already passed. Ask them which day they mean, then call again with pastOk true.');
  if(!before&&!args.duplicate){
   const binned=trashed(data).findLast(e=>sameTitle(e.title,fields.title));
   if(binned)throw new Error(`"${binned.title}" is in the Trash as task ${binned.id}. Use restore_task to bring it back.`);
   const twin=data.entries.find(e=>isTask(e)&&!e.archived&&!e.done&&sameTitle(e.title,fields.title));
   if(twin)throw new Error(`"${twin.title}" is already saved as task ${twin.id}. Change that one, or call again with duplicate true if they want a second.`);
  }
  if(Object.keys(fields).length||!before)ops.push({type:'saveTask',...(before?{id:before.id}:{}),fields});
  if(args.done===false&&before?.done)ops.push({type:'reopenTask',id:before.id});
  const kind=!before?'add':args.done===true?'complete':args.done===false?'reopen':'change';
  return {ops,change:{kind,entity:'task',id:before?.id??null,title:fields.title??before.title,fields:args}};
 }
 if(name==='restore_task'){
  const t=data.entries.find(e=>e.id===args.id&&isTask(e)&&e.archived);
  if(!t)throw new Error(`Task ${args.id} is not in the Trash. Call get_plan.`);
  return {ops:[{type:'restoreTask',id:t.id}],change:{kind:'restore',entity:'task',id:t.id,title:t.title}};
 }
 if(name==='delete_task'){const t=findTask(data,args.id);return {ops:[{type:'archiveTask',id:t.id}],change:{kind:'remove',entity:'task',id:t.id,title:t.title}};}
 if(name==='move_task'){
  const t=findTask(data,args.id),block=args.blockId==null?null:findEntity(data,'block',args.blockId);
  if(args.beforeId!=null)findTask(data,args.beforeId);
  return {ops:[{type:'moveTask',id:t.id,blockId:block?.id??null,...(args.beforeId!=null?{beforeId:args.beforeId}:{})}],change:{kind:'move',entity:'task',id:t.id,title:t.title,to:block?.title??'Inbox'}};
 }
 if(name==='order_block'){
  const block=args.blockId==null?null:findEntity(data,'block',args.blockId),inBlock=new Set(blockTasks(data,block?.id??null).map(t=>t.id));
  if(!Array.isArray(args.ids)||!args.ids.length||new Set(args.ids).size!==args.ids.length||args.ids.some(i=>!inBlock.has(i)))throw new Error('List tasks from that Block, each once. Call get_plan.');
  return {ops:args.ids.map((taskId,i)=>({type:'saveTask',id:taskId,fields:{priority:i+1}})),change:{kind:'order',entity:'block',id:block?.id??null,title:block?.title??'Inbox'}};
 }
 const [verb,kind]=name.split('_');
 if(verb==='save'&&COLLECTION[kind]){
  const before=args.id?findEntity(data,kind,args.id):null,fields={};
  for(const key of ['title','purpose','notes'])fields[key]=key in args?args[key]:before?.[key]??'';
  if(!fields.title)throw new Error(`A ${kind} needs a title.`);
  if(kind==='block')fields.projectId='projectId'in args?args.projectId:before?.projectId??null;
  if(kind==='project')fields.goalId='goalId'in args?args.goalId:before?.goalId??null;
  if(kind==='goal'){
   Object.assign(fields,{areaId:'areaId'in args?args.areaId:before?.areaId??null,year:args.year??before?.year??now.getFullYear()});
   if(!before)fields.horizon='yearly';
  }
  if(kind==='area'&&'rating'in args)fields.rating=args.rating;
  if(fields.projectId)findEntity(data,'project',fields.projectId);
  if(fields.goalId)findEntity(data,'goal',fields.goalId);
  if(fields.areaId)findEntity(data,'area',fields.areaId);
  return {ops:[{type:'saveEntity',collection:COLLECTION[kind],...(before?{id:before.id}:{}),fields}],change:{kind:before?'change':'add',entity:kind,id:before?.id??null,title:fields.title,fields:args}};
 }
 if(verb==='delete'&&COLLECTION[kind]){const x=findEntity(data,kind,args.id);return {ops:[{type:'removeEntity',collection:COLLECTION[kind],id:x.id}],change:{kind:'remove',entity:kind,id:x.id,title:x.title}};}
 throw new Error(`Unknown tool ${name}.`);
}
