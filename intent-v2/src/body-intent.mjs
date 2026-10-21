export const BODY_INTENTS=Object.freeze({
 water:Object.freeze({collection:'water',fields:['title','count'],required:['count']}),
 meal:Object.freeze({collection:'meals',fields:['title','slot','state'],required:['slot','state']}),
});
export const MEAL_SLOTS=['breakfast','lunch','snack','dinner'];
export const MEAL_STATES=['logged','skipped'];

export function completeWaterLog(output,input){
 if(input.activeDraft||input.openQuestion||input.sourceUnits.length!==1)return output;
 const unit=input.sourceUnits[0],raw=unit.text.trim();
 const counts={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twenty:20,thirty:30,ek:1,do:2,teen:3,chaar:4,paanch:5};
 let count=/^(?:I\s+)?(?:just\s+)?drank\s+water[.!]?$/i.test(raw)?1:null;
 const number='(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty)';
 const english=raw.match(new RegExp(`^(?:I\\s+)?(?:just\\s+)?drank\\s+${number}\\s+glass(?:es)?(?:\\s+of\\s+water)?[.!]?$`,'i'))
  ??raw.match(new RegExp(`^(?:I\\s+)?(?:just\\s+)?(?:had|finished)\\s+${number}\\s+glass(?:es)?\\s+of\\s+water[.!]?$`,'i'));
 const hindi=raw.match(/^(?:abhi\s+)?(\d{1,2}|ek|do|teen|chaar|paanch)\s+glass\s+(?:paani|pani)\s+piya[.!]?$/i);
 const stated=english??hindi;if(stated)count=counts[stated[1].toLowerCase()]??Number(stated[1]);
 if(!Number.isInteger(count)||count<1||count>30)return output;
 return {schemaVersion:1,mode:'capture',draftMode:'new',reply:'',decisions:[{sourceId:unit.id,disposition:'action',note:null}],
  operations:[{opId:'water-log',sourceId:unit.id,kind:'create',entity:'water',targetId:null,fields:[
   {name:'title',op:'set',value:'Water',origin:'suggested',evidence:null},
   {name:'count',op:'set',value:count,origin:'stated',evidence:unit.text}]}],question:null,clarification:null,memoryCandidates:[],card:null};
}

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
