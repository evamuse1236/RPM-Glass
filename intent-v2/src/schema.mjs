import {MEAL_SLOTS,MEAL_STATES} from './body-intent.mjs';
import {CAPTURE_OPERATIONS,OPERATION_KINDS} from './capabilities.mjs';
/** Small strict JSON-Schema vocabulary, also validated locally. No dependencies. */
const object = properties => ({type:'object', properties, required:Object.keys(properties), additionalProperties:false});
const text = maxLength => ({type:'string', maxLength});
const enumeration = values => ({type:'string', enum:values});
const array = (items,maxItems) => ({type:'array',items,maxItems});
const nullable = schema => ({anyOf:[schema,{type:'null'}]});
/** Prepared answer cards the app draws from current data: a day's agenda, the next item, one saved task, water, meals. */
export const CARD_KINDS=['agenda','next','task','water','meals'];
export const FIELD_NAMES=['title','purpose','notes','time','minutes','blockId','projectId','goalId','areaId','year','must','priority','recurrence','repeatAfterDays','alert','count','slot','state'];
const value={type:['string','integer','boolean','null']};
export const FIELD_SCHEMA=object({name:enumeration(FIELD_NAMES),op:enumeration(['set','clear','unknown']),value,origin:enumeration(['stated','suggested']),evidence:nullable(text(2000))});
/** What a choice may point at: a saved item, a draft, or the alarm of a task (its id is the task's id). */
export const CHOICE_TARGETS=['task','draft','proposal','alarm','block','project','goal','area'];
export const CLARIFICATION_ACTIONS=['remove','complete','other'];
export const OPERATION_SCHEMA=object({opId:text(50),sourceId:text(50),kind:enumeration(OPERATION_KINDS),entity:enumeration(Object.keys(CAPTURE_OPERATIONS)),targetId:nullable(text(100)),fields:array(FIELD_SCHEMA,16)});
export const TURN_SCHEMA=object({
  schemaVersion:{type:'integer',enum:[1]},
  mode:enumeration(['capture','plan','reflect','query']),
  draftMode:enumeration(['new','amend','none']),
  reply:text(900),
  // note: a short faithful label for a source unit that becomes no operation, so nothing said vanishes from view.
  decisions:array(object({sourceId:text(50),disposition:enumeration(['action','idea','reflection','reference','question','preference','existing']),note:nullable(text(140))}),100),
  operations:array(OPERATION_SCHEMA,30),
  question:nullable(object({opId:text(50),field:enumeration(FIELD_NAMES),prompt:text(250),options:array(object({label:text(50),value}),3)})),
  // Which item the person means, asked with choices the app shows as buttons and matches replies against.
  clarification:nullable(object({prompt:text(250),action:enumeration(CLARIFICATION_ACTIONS),choices:array(object({label:text(60),targets:array(object({entity:enumeration(CHOICE_TARGETS),id:text(100)}),8)}),4)})),
  memoryCandidates:array(object({text:text(500),evidence:text(1000),sensitive:{type:'boolean'}}),3),
  card:nullable(object({kind:enumeration(CARD_KINDS),day:nullable(text(10)),targetId:nullable(text(100))}))
});
export function validate(value,schema,path='$') {
  if(schema.anyOf){if(schema.anyOf.some(s=>{try{validate(value,s,path);return true;}catch{return false;}}))return;throw new Error(`${path}: no permitted shape`);}
  const types=Array.isArray(schema.type)?schema.type:[schema.type];
  if(!types.some(t=>t==='null'?value===null:t==='array'?Array.isArray(value):t==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):t==='integer'?Number.isInteger(value):typeof value===t))throw new Error(`${path}: invalid type`);
  if(schema.enum&&!schema.enum.includes(value))throw new Error(`${path}: invalid enum`);
  if(value===null)return;
  if(typeof value==='string'&&value.length>(schema.maxLength??Infinity))throw new Error(`${path}: text too long`);
  if(Array.isArray(value)){if(value.length>(schema.maxItems??Infinity))throw new Error(`${path}: too many items`);value.forEach((v,i)=>validate(v,schema.items,`${path}[${i}]`));}
  if(schema.properties){
    for(const k of schema.required)if(!Object.hasOwn(value,k))throw new Error(`${path}.${k}: required`);
    for(const k of Object.keys(value)){if(!Object.hasOwn(schema.properties,k))throw new Error(`${path}.${k}: unknown property`);validate(value[k],schema.properties[k],`${path}.${k}`);}
  }
}
export const ALLOWED_FIELDS=Object.fromEntries(Object.entries(CAPTURE_OPERATIONS).map(([entity,spec])=>[entity,spec.fields]));
export function validateField(field,entity){
 validate(field,FIELD_SCHEMA);
 if(!ALLOWED_FIELDS[entity]?.includes(field.name))throw new Error(`Field ${field.name} does not belong to ${entity}`);
 if(field.op!=='set'){if(field.value!==null)throw new Error('Clear/unknown must carry null');if(field.op==='clear'&&['title','year','must','priority'].includes(field.name))throw new Error('Required field cannot be cleared');return;}
 const v=field.value,n=field.name;
 if(['minutes','year','priority','repeatAfterDays','count'].includes(n)){
  const [lo,hi]=n==='year'?[2000,2200]:n==='minutes'?[1,1440]:n==='repeatAfterDays'?[1,365]:n==='count'?[1,30]:[1,100000];
  if(!Number.isInteger(v)||v<lo||v>hi)throw new Error(`Invalid ${n}`);
 } else if(n==='must'){if(typeof v!=='boolean')throw new Error('must must be boolean');}
 else {
  if(typeof v!=='string'||!v.trim())throw new Error(`${n} must be nonempty text`);
  const limit=n==='title'?200:n==='time'?100:n==='notes'?8000:2000;
  if(v.length>limit)throw new Error(`${n} is too long`);
  if(n==='alert'&&!['alarm','reminder','off'].includes(v))throw new Error('Invalid alert');
  if(n==='recurrence'&&!['daily','weekly','weekdays'].includes(v))throw new Error('Invalid recurrence');
  if(n==='slot'&&!MEAL_SLOTS.includes(v))throw new Error('Invalid meal slot');
  if(n==='state'&&!MEAL_STATES.includes(v))throw new Error('Invalid meal state');
 }
}
