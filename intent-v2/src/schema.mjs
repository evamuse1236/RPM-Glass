/** Small strict JSON-Schema vocabulary, also validated locally. No dependencies. */
const object = properties => ({type:'object', properties, required:Object.keys(properties), additionalProperties:false});
const text = maxLength => ({type:'string', maxLength});
const enumeration = values => ({type:'string', enum:values});
const array = (items,maxItems) => ({type:'array',items,maxItems});
const nullable = schema => ({anyOf:[schema,{type:'null'}]});
export const FIELD_NAMES=['title','purpose','notes','time','minutes','blockId','projectId','goalId','areaId','year','must','priority','recurrence','repeatAfterDays','alert'];
const value={type:['string','integer','boolean','null']};
export const FIELD_SCHEMA=object({name:enumeration(FIELD_NAMES),op:enumeration(['set','clear','unknown']),value,origin:enumeration(['stated','suggested']),evidence:nullable(text(2000))});
export const OPERATION_SCHEMA=object({opId:text(50),sourceId:text(50),kind:enumeration(['create','update','complete','archive']),entity:enumeration(['task','block','project','goal','area']),targetId:nullable(text(100)),fields:array(FIELD_SCHEMA,16)});
export const TURN_SCHEMA=object({
  schemaVersion:{type:'integer',enum:[1]},
  mode:enumeration(['capture','plan','reflect','query']),
  draftMode:enumeration(['new','amend','none']),
  reply:text(900),
  decisions:array(object({sourceId:text(50),disposition:enumeration(['action','idea','reflection','reference','question','preference'])}),100),
  operations:array(OPERATION_SCHEMA,30),
  question:nullable(object({opId:text(50),field:enumeration(FIELD_NAMES),prompt:text(250),options:array(object({label:text(50),value}),3)})),
  memoryCandidates:array(object({text:text(500),evidence:text(1000),sensitive:{type:'boolean'}}),3)
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
export const ALLOWED_FIELDS={
 task:['title','purpose','notes','time','minutes','blockId','must','priority','recurrence','repeatAfterDays','alert'],
 block:['title','purpose','notes','projectId'],project:['title','purpose','notes','goalId'],goal:['title','purpose','notes','areaId','year'],area:['title','purpose','notes']
};
export function validateField(field,entity){
 validate(field,FIELD_SCHEMA);
 if(!ALLOWED_FIELDS[entity]?.includes(field.name))throw new Error(`Field ${field.name} does not belong to ${entity}`);
 if(field.op!=='set'){if(field.value!==null)throw new Error('Clear/unknown must carry null');if(field.op==='clear'&&['title','year','must','priority'].includes(field.name))throw new Error('Required field cannot be cleared');return;}
 const v=field.value,n=field.name;
 if(['minutes','year','priority','repeatAfterDays'].includes(n)){
  const [lo,hi]=n==='year'?[2000,2200]:n==='minutes'?[1,1440]:n==='repeatAfterDays'?[1,365]:[1,100000];
  if(!Number.isInteger(v)||v<lo||v>hi)throw new Error(`Invalid ${n}`);
 } else if(n==='must'){if(typeof v!=='boolean')throw new Error('must must be boolean');}
 else {
  if(typeof v!=='string'||!v.trim())throw new Error(`${n} must be nonempty text`);
  const limit=n==='title'?200:n==='time'?100:n==='notes'?8000:2000;
  if(v.length>limit)throw new Error(`${n} is too long`);
  if(n==='alert'&&!['alarm','reminder','off'].includes(v))throw new Error('Invalid alert');
  if(n==='recurrence'&&!['daily','weekly','weekdays'].includes(v))throw new Error('Invalid recurrence');
 }
}
