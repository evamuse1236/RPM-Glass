import {planner,tasks} from './planner-state.mjs';
import {validate} from '../chat-prototype/companion-tools.mjs';
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const appViews=['day','rpm','projects','life','settings','calendar','vision','ideas','alarm_sound','reminder_sound','ai_connection','notifications','exact_alarms','import_export'];
export const controlAppSchema=object({action:{type:'string',enum:['open','transparency','show_butterfly','hide_butterfly']},view:{type:['string','null'],enum:[...appViews,null]},id:{type:['string','integer','null']},date:{type:['string','null']},value:{type:['integer','null'],minimum:0,maximum:70},evidence:{type:'array',items:{type:'string'},minItems:1,maxItems:5}});
export function appCommand(data,args,meta){
 validate(args,controlAppSchema);
 if(args.evidence.some(s=>!s.trim()||!meta.raw.includes(s)))throw new Error('Use exact words from the current request.');
 if(args.action!=='open'){
  if(args.view!==null||args.id!==null||args.date!==null)throw new Error('Setting controls do not take a view or record ID.');
  if(args.action==='transparency'&&!Number.isInteger(args.value))throw new Error('Choose a transparency from 0 to 70 percent.');
  if(args.action!=='transparency'&&args.value!==null)throw new Error('This control does not take a value.');
  return {action:'appControl',payload:{action:args.action,value:args.value}};
 }
 if(!appViews.includes(args.view)||args.value!==null)throw new Error('Choose a supported app destination.');
 if(args.date!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(args.date)||!Number.isFinite(Date.parse(args.date+'T12:00'))||args.view!=='day'))throw new Error('Use a valid date only with the day view.');
 if(args.id!==null){const rows=typeof args.id==='number'?tasks(data):planner(data)[args.view==='rpm'?'blocks':args.view==='projects'?'projects':'goals'];if(!['rpm','projects','life'].includes(args.view)||!rows.some(r=>r.id===args.id))throw new Error('Read current IDs before opening an item.');}
 const settings=['settings','alarm_sound','reminder_sound','ai_connection','notifications','exact_alarms','import_export'].includes(args.view);
 return {action:settings?'settings':'planner',payload:settings?{section:args.view}:{view:args.view,id:args.id,date:args.date}};
}
export function createAppTools({native}){return [
 {name:'read_app',description:'Read safe phone settings and permission status, never keys. Use before explaining or changing settings.',schema:object({}),run:()=>native('appSettings')},
 {name:'control_app',description:'Open app views, a specific task/block/project/goal, calendar or sound/settings controls; or set widget transparency (0–70), show/hide butterfly. System permissions and pickers require the user. Does not change plans.',schema:controlAppSchema,terminal:true,run:async(data,args,meta)=>{const effect=appCommand(data,args,meta);if(effect.action==='appControl'){const result=await native(effect.action,effect.payload);return {text:result.message,suggestions:[]};}return {text:'Opening '+args.view.replaceAll('_',' ')+'…',appEffect:effect,suggestions:[]};}}
 ];}
