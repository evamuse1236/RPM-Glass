const incomplete=Symbol('incomplete');
export function partialOperations(text){
 let i=0;
 const space=()=>{while(/\s/.test(text[i]??'')&&i<text.length)i++;};
 function value(depth=0){
  if(depth>30)return incomplete;
  space();const start=i,c=text[i];
  if(c==='"'){
   i++;
   while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"')return JSON.parse(text.slice(start,i));}
   return incomplete;
  }
  if(c==='{'||c==='['){
   i++;const array=c==='[',out=array?[]:{};space();
   while(i<text.length&&text[i]!== (array?']':'}')){
    let key;
    if(!array){key=value(depth+1);if(typeof key!=='string')return out;space();if(text[i++]!==':')return out;}
    const item=value(depth+1);if(item===incomplete)return out;
    if(array)out.push(item);else Object.defineProperty(out,key,{value:item,enumerable:true,configurable:true,writable:true});
    space();if(text[i]!==',')break;i++;space();
   }
   if(text[i]===(array?']':'}'))i++;
   return out;
  }
  while(i<text.length&&!/[\s,}\]]/.test(text[i]))i++;
  if(i===text.length||i===start)return incomplete;
  return JSON.parse(text.slice(start,i));
 }
 try{
  return (value()?.operations??[]).flatMap(op=>{
   if(!Array.isArray(op?.fields))return [];
   const set=name=>op.fields.find(f=>f?.name===name&&f.op==='set')?.value;
   const title=set('title');if(typeof title!=='string'||!title.trim()||typeof op.opId!=='string'||typeof op.kind!=='string'||typeof op.entity!=='string')return [];
   const time=set('time'),minutes=set('minutes');
   return [{opId:op.opId,kind:op.kind,entity:op.entity,title,time:typeof time==='string'?time:null,minutes:typeof minutes==='number'&&Number.isFinite(minutes)?minutes:null}];
  });
 }catch{return [];}
}

export function partialEmitter({messageId,emit,now=Date.now,schedule=setTimeout,cancel=clearTimeout}){
 let latest='',previous='[]',last=-Infinity,timer=null,closed=false;
 function flush(){
  timer=null;if(closed)return;
  const operations=partialOperations(latest),signature=JSON.stringify(operations);
  if(signature===previous)return;
  last=now();previous=signature;emit({type:'partial',messageId,operations});
 }
 return {
  push(text){if(closed)return;latest=text;if(timer!==null)return;const delay=150-(now()-last);if(delay<=0)flush();else timer=schedule(flush,delay);},
  close(){closed=true;if(timer!==null)cancel(timer);timer=null;}
 };
}
