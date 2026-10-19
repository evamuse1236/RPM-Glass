export const BODY_INTENTS=Object.freeze({
 water:Object.freeze({collection:'water',fields:['title','count'],required:['count']}),
 meal:Object.freeze({collection:'meals',fields:['title','slot','state'],required:['slot','state']}),
});
export const MEAL_SLOTS=['breakfast','lunch','snack','dinner'];
export const MEAL_STATES=['logged','skipped'];

export function checkBodyOperation(op){
 const body=BODY_INTENTS[op.entity];
 if(!body||op.kind==='discard')return;
 if(op.kind!=='create'||op.targetId!==null)throw new Error('Body logs create a new record; use Undo to take it back');
 for(const name of body.required){
  const field=op.fields.find(f=>f.name===name);
  if(!field||field.op==='clear')throw new Error(`A ${op.entity} log requires ${name}`);
  if(['count','state'].includes(name)&&field.op==='set'&&field.origin!=='stated')throw new Error(`A body log needs the stated ${name}`);
 }
}
