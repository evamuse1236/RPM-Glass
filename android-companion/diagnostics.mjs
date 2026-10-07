const secretKey=/^(authorization|proxy.?authorization|cookie|set.?cookie|.*password.*|.*secret.*|.*api[_-]?key.*|.*private[_-]?key.*|.*credential.*|access[_-]?token|refresh[_-]?token|client[_-]?token|session[_-]?token|token|pairing[_-]?code)$/i;
export function redactText(value){return String(value).replace(/\bBearer\s+[^\s"'<>]+/gi,'Bearer [REDACTED]').replace(/\bsk-[a-zA-Z0-9_-]{12,}/g,'[REDACTED]').replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,'[REDACTED]').replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization|cookie|pairing[_-]?code)["']?\s*[:=]\s*["']?)[^\s,;&"'<>}]+/gi,'$1[REDACTED]').replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[REDACTED]@');}
/** Snapshot arguments now, without invoking getters or user toJSON methods. */
export function snapshot(value){
  const seen=new WeakSet();let nodes=0;
  const visit=(v,depth=0)=>{
    if(++nodes>1500||depth>10)return '[Structure limit]';
    if(typeof v==='string')return redactText(v.length>24000?v.slice(0,24000)+' [Truncated]':v);
    if(v===null||typeof v==='boolean')return v;
    if(typeof v==='number')return Number.isFinite(v)?v:String(v);
    if(typeof v!=='object')return redactText(String(v));
    if(seen.has(v))return '[Circular]';seen.add(v);
    try{
      if(v instanceof Error){const out={name:redactText(v.name),message:redactText(v.message),stack:redactText(v.stack??'')};if(v.cause)out.cause=visit(v.cause,depth+1);return out;}
      if(v instanceof Date)return Number.isFinite(v.getTime())?v.toISOString():'Invalid Date';
      if(v instanceof Map)return visit([...v.entries()],depth+1);
      if(v instanceof Set)return visit([...v.values()],depth+1);
      const keys=Object.keys(v),out=Array.isArray(v)?[]:{};
      for(const key of keys.slice(0,100)){const descriptor=Object.getOwnPropertyDescriptor(v,key);Object.defineProperty(out,key,{value:secretKey.test(key)?'[REDACTED]':descriptor&&'value' in descriptor?visit(descriptor.value,depth+1):'[Getter]',enumerable:true,configurable:true,writable:true});}
      if(keys.length>100){if(Array.isArray(out))out.push('[More items truncated]');else out._truncatedKeys=keys.length-100;}
      return out;
    }catch{return '[Unserializable]';}
  };
  let result=visit(value),json=JSON.stringify(result);
  if(new TextEncoder().encode(json).length>42000)result={truncated:true,preview:redactText(json).slice(0,11000),originalBytes:new TextEncoder().encode(json).length};
  return result;
}
export function installDiagnostics({host=window,sessionId=crypto.randomUUID(),clock=()=>performance.now(),id=()=>crypto.randomUUID()}={}){
  const emit=(kind,level,payload,context={})=>{
    try{host.RpmNative?.diagnostic?.(JSON.stringify({eventId:id(),sessionId,occurredAt:Date.now(),kind,level,operationId:context.operationId??'',operation:context.operation??'',outcome:context.outcome??'',payload:snapshot(payload)}));}catch{/* Reporting cannot break the operation being observed. */}
  };
  const originals=new Map(),timers=new Map(),counts=new Map();
  const methods=['log','debug','info','warn','error','trace','assert','table','dir','dirxml','group','groupCollapsed','groupEnd','clear','count','countReset','time','timeLog','timeEnd'];
  for(const method of methods){const original=host.console?.[method];if(typeof original!=='function')continue;originals.set(method,original);host.console[method]=function(...args){
    Reflect.apply(original,this,args);
    if(method==='assert'&&args[0])return;
    let label='default';try{label=String(args[0]??'default');}catch{}let extra={};
    if(method==='time'){if(!timers.has(label))timers.set(label,clock());}
    if(['timeEnd','timeLog'].includes(method)&&timers.has(label)){extra.durationMs=Math.max(0,clock()-timers.get(label));if(method==='timeEnd')timers.delete(label);}
    if(method==='count'){const count=(counts.get(label)??0)+1;counts.set(label,count);extra.count=count;}
    if(method==='countReset')counts.delete(label);
    if(timers.size>1000)timers.delete(timers.keys().next().value);if(counts.size>1000)counts.delete(counts.keys().next().value);
    emit('console',['error','assert'].includes(method)?'error':method==='warn'?'warn':method==='debug'?'debug':method==='info'?'info':'log',{method,args:method==='assert'?args.slice(1):args,...extra});
  };}
  const onError=e=>emit('exception','error',{error:e.error??e.message/* rules-allow raw-error-text: diagnostics log, never shown */,source:e.filename,line:e.lineno,column:e.colno},{operation:'javascript',outcome:'error'});
  const onRejection=e=>emit('rejection','error',{error:e.reason},{operation:'promise',outcome:'error'});
  host.addEventListener?.('error',onError);host.addEventListener?.('unhandledrejection',onRejection);
  try{host.RpmNative?.diagnosticsReady?.();}catch{}
  return {
    emit,
    async track(operation,context,run){const start=clock();let outcome='success',error,result;try{result=await run();if(result?.status==='error'||result?.error){outcome='error';error=result.error??result.lastError;}else if(result?.status==='cancelled')outcome='cancelled';return result;}catch(e){outcome=e?.name==='AbortError'?'cancelled':'error';error=e;throw e;}finally{emit('operation',outcome==='error'?'error':'info',{...context,durationMs:Math.max(0,clock()-start),resultStatus:result?.status??null,error:error??null},{operation,operationId:context.operationId,outcome});}},
    restore(){for(const [name,fn] of originals)host.console[name]=fn;host.removeEventListener?.('error',onError);host.removeEventListener?.('unhandledrejection',onRejection);}
  };
}
