import {BODY_INTENTS} from '../intent-v2/src/body-intent.mjs';
import {editPlan} from './planner-state.mjs';
import {integer} from './planner-fields.mjs';
import {SLOT_NAMES} from './body-state.mjs';

export const BODY_COLLECTION_FIELDS=Object.fromEntries(Object.values(BODY_INTENTS).map(body=>[body.collection,body.fields]));
const logs={
 water(data,fields,now){
  const count=integer(fields.count,1,30),at=now.toISOString();
  let id;
  for(let i=0;i<count;i++)id=editPlan(data,{type:'drinkWater',at},now);
  return {id,title:`${count} ${count===1?'glass':'glasses'} of water`,at,count};
 },
 meals(data,fields,now){
  if(!['logged','skipped'].includes(fields.state))throw new Error('Choose logged or skipped for the meal.');
  const id=editPlan(data,{type:'saveMeal',meal:{name:fields.title,slot:fields.slot,state:fields.state,at:now.toISOString()}},now);
  const meal=data.planner.body.meals.find(m=>m.id===id);
  return {id,title:meal.state==='skipped'?SLOT_NAMES[meal.slot]:meal.name,at:meal.at,state:meal.state??'logged'};
 },
};

export function applyBodyLog(data,op,now){
 if(op.type!=='create'||op.id!==null)throw new Error('Body logs create a new record; use Undo to take it back.');
 return logs[op.collection](data,op.fields,now);
}
