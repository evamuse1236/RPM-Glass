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
  repeat:{type:['string','null'],enum:['daily','weekly','weekdays',null]},must:{type:'boolean'},notes:{type:'string'},purpose:{type:'string'},done:{type:'boolean'}})},
 {name:'delete_task',description:'Move a task to Trash. It can be restored.',parameters:object({id},['id'])},
 {name:'move_task',description:'Move a task into a Block, or to the Inbox with blockId null. Put it before another task with beforeId, else last.',parameters:object({id,blockId:maybe('string'),beforeId:maybe('integer')},['id','blockId'])},
 {name:'order_block',description:'Set the priority order of tasks in one Block (or the Inbox with blockId null), most important first. Listed tasks go to the top in that order; the rest keep their order below.',parameters:object({blockId:maybe('string'),ids:{type:'array',items:id}},['blockId','ids'])},
 {name:'save_block',description:'Add an RPM Block (no id) or change one. Title is the result wanted, purpose is why it matters. projectId puts it in a Project; null takes it out.',parameters:object({id:entityId,title:{type:'string'},purpose:{type:'string'},projectId:maybe('string')})},
 {name:'delete_block',description:'Remove a Block. Its tasks move to the Inbox.',parameters:object({id:entityId},['id'])},
 {name:'save_project',description:'Add a Project (no id) or change one.',parameters:object({id:entityId,title:{type:'string'},purpose:{type:'string'}})},
 {name:'delete_project',description:'Remove a Project. Its Blocks stay, outside any Project.',parameters:object({id:entityId},['id'])},
 {name:'save_area',description:'Add a life Area (no id) or change one. rating is 0 to 10.',parameters:object({id:entityId,title:{type:'string'},purpose:{type:'string'},rating:maybe('number')})},
 {name:'delete_area',description:'Remove a life Area.',parameters:object({id:entityId},['id'])},
]);

const parts=(date,timeZone)=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
export function offsetOf(date,timeZone){
 const p=parts(date,timeZone),local=Date.UTC(+p.year,p.month-1,+p.day,+p.hour,+p.minute),minutes=Math.round((local-Math.floor(date/60000)*60000)/60000);
 const sign=minutes<0?'-':'+',abs=Math.abs(minutes);return `${sign}${String(Math.floor(abs/60)).padStart(2,'0')}:${String(abs%60).padStart(2,'0')}`;
}
const localTime=(iso,timeZone)=>new Date(iso).toLocaleString('en-US',{timeZone,weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});

export function planView(data,timeZone){
 const p=planner(data),blocks=p.blocks.filter(live);
 const task=e=>({id:e.id,title:e.title,done:!!e.done,start:e.planned?localTime(e.planned,timeZone):null,day:e.plannedDate??null,minutes:e.minutes??null,alert:e.alertIntent?.type??null,repeat:e.recurrence??null,must:!!e.must,priority:e.priority??null});
 return {
  inbox:blockTasks(data,null).map(task),
  blocks:blocks.map(b=>({id:b.id,title:b.title,purpose:b.purpose||null,projectId:b.projectId??null,tasks:blockTasks(data,b.id).map(task)})),
  projects:p.projects.filter(live).map(x=>({id:x.id,title:x.title,purpose:x.purpose||null})),
  areas:p.areas.filter(live).map(a=>({id:a.id,title:a.title,purpose:a.purpose||null,rating:a.rating??null})),
 };
}

export function systemPrompt(now,timeZone){
 const today=now.toLocaleString('en-US',{timeZone,weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit'});
 return `You keep a person's RPM planner. They talk, then stop; you change the plan with tools, then say in one short, warm sentence what you did.
Now: ${today} (time zone ${timeZone}, offset ${offsetOf(now,timeZone)}).
RPM: a task is one action. A Block is one result the person wants (title), with a purpose (why it matters) and the tasks that get it. Projects hold Blocks. Areas are parts of life. Priority is the order of tasks inside a Block, most important first. Must marks a task as essential.
- Call get_plan first.
- Make every change they asked for: add, change, complete, reopen, remove or move tasks; add, change or remove Blocks, Projects and Areas; give purposes; set priorities.
- Use their words for titles. Never invent tasks, times or lengths they did not say.
- "Tomorrow", "tonight", "in 20 minutes" and weekday names count from now. A time without am or pm means the next sensible one.
- A saved item they name or clearly mean is changed, not added again.
- To sort tasks into Blocks, put each task in the Block whose result it serves. Leave a task in the Inbox when no Block clearly fits, and say so.
- Removing is only for what they asked to remove.
- If something is unclear, make the most likely choice and say what you chose. Never wait for an answer before saving what you are sure of.`;
}

/** The Gemini Live setup message for one session. Both the phone and the website server build it from here. */
export function liveSetup(now,timeZone){
 return {model:`models/${LIVE_MODEL}`,generationConfig:{responseModalities:['AUDIO']},
  systemInstruction:{parts:[{text:systemPrompt(now,timeZone)}]},
  tools:[{functionDeclarations:TOOLS.map(t=>({name:t.name,description:t.description,parametersJsonSchema:t.parameters}))}],
  inputAudioTranscription:{},outputAudioTranscription:{},realtimeInputConfig:{automaticActivityDetection:{disabled:true}}};
}

const TASK_FIELDS=[['title','title'],['minutes','minutes'],['blockId','blockId'],['alert','alert'],['alertLead','alertLead'],['repeat','recurrence'],['must','must'],['notes','notes'],['purpose','purpose']];
const COLLECTION={block:'blocks',project:'projects',area:'areas'};
const findTask=(data,taskId)=>{const t=data.entries.find(e=>e.id===taskId&&!e.archived&&(e.kind??'plan')==='plan');if(!t)throw new Error(`No task ${taskId}. Call get_plan.`);return t;};
const findEntity=(data,kind,entity)=>{const x=planner(data)[COLLECTION[kind]].find(r=>r.id===entity);if(!x)throw new Error(`No ${kind} ${entity}. Call get_plan.`);return x;};

/**
 * The planner ops for one tool call against `data`, and the change it makes in plain words.
 * get_plan has no ops. Throws a message the model can read when the call names something missing.
 */
export function toolOps(data,name,args={}){
 if(name==='save_task'){
  const before=args.id!=null?findTask(data,args.id):null,fields={},ops=[];
  for(const [from,to] of TASK_FIELDS)if(from in args)fields[to]=args[from];
  if('start'in args){if(args.start!==null&&!Number.isFinite(Date.parse(args.start)))throw new Error('start must be ISO with an offset.');fields.planned=args.start?new Date(args.start).toISOString():null;}
  if('day'in args)fields.plannedDate=args.day;
  if(args.done===true)fields.done=true;
  if(!before&&!fields.title)throw new Error('A new task needs a title.');
  if(Object.keys(fields).length||!before)ops.push({type:'saveTask',...(before?{id:before.id}:{}),fields});
  if(args.done===false&&before?.done)ops.push({type:'reopenTask',id:before.id});
  const kind=!before?'add':args.done===true?'complete':args.done===false?'reopen':'change';
  return {ops,change:{kind,entity:'task',id:before?.id??null,title:fields.title??before.title,fields:args}};
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
  if(kind==='project')fields.goalId=before?.goalId??null;
  if(kind==='area'&&'rating'in args)fields.rating=args.rating;
  if(fields.projectId)findEntity(data,'project',fields.projectId);
  return {ops:[{type:'saveEntity',collection:COLLECTION[kind],...(before?{id:before.id}:{}),fields}],change:{kind:before?'change':'add',entity:kind,id:before?.id??null,title:fields.title,fields:args}};
 }
 if(verb==='delete'&&COLLECTION[kind]){const x=findEntity(data,kind,args.id);return {ops:[{type:'removeEntity',collection:COLLECTION[kind],id:x.id}],change:{kind:'remove',entity:kind,id:x.id,title:x.title}};}
 throw new Error(`Unknown tool ${name}.`);
}
