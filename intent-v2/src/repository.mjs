import {stable} from './context.mjs';
export function intentState(data){
 const state=data.intentV2??={schema:1,captures:{},drafts:{},transactions:{},approvedMemories:[],sortPreviews:{}};
 state.captures??={};state.drafts??={};state.transactions??={};state.approvedMemories??=[];state.sortPreviews??={};return state;
}
export class SaveUnknownError extends Error {constructor(id){super(`Save status is unknown. Reconcile request ${id}; do not create a new request.`);this.code='SAVE_UNKNOWN';this.requestId=id;}}
export function createMemoryBackend(seed){let data=structuredClone(seed);return {load:async()=>structuredClone(data),save:async(expected,next)=>{if(data.version!==expected){const e=new Error('Version conflict');e.code='VERSION_CONFLICT';throw e;}data=structuredClone(next);}};}
/** Atomic backend contract: save(expectedVersion,next) must compare-and-swap.
 * The operation receipt and state are one write. Read after uncertain writes.
 * This is not an external-effect exactly-once guarantee: native delivery stays separate.
 */
export function createRepository(backend,{maxConflictRetries=2}={}){
 let queue=Promise.resolve();
 async function load(){const data=await backend.load();if(!data||!Number.isInteger(data.version))throw new Error('Initialize the existing RPM store before using the pilot');return data;}
 async function transact(id,input,reduce){
  if(typeof id!=='string'||!id||id.length>220)throw new Error('A stable request ID is required');
  const signature=stable(input);
  const run=async()=>{
   for(let attempt=0;attempt<=maxConflictRetries;attempt++){
    const before=await load(),existing=intentState(before).transactions[id];
    if(existing){if(existing.signature!==signature)throw new Error('REQUEST_ID_REUSED: different payload');return structuredClone(existing.result);}
    const next=structuredClone(before),result=await reduce(next);
    intentState(next).transactions[id]={signature,result:structuredClone(result),at:new Date().toISOString()};next.version=before.version+1;
    try{await backend.save(before.version,next);return result;}
    catch(error){
     let recovered;try{recovered=await load();}catch{throw new SaveUnknownError(id);}
     const receipt=recovered.intentV2?.transactions?.[id];
     if(receipt){if(receipt.signature!==signature)throw new Error('REQUEST_ID_REUSED');return structuredClone(receipt.result);}
     const message=error.message??'';
     const conflict=error.code==='VERSION_CONFLICT'||/Saved context changed|Saved data changed|Version conflict/i.test(message);
     if(conflict&&attempt<maxConflictRetries)continue;
     // These are validation/capacity rejections performed before the AtomicFile
     // write. They are definite failures, not ambiguous acknowledgements.
     if(error.code==='VALIDATION_ERROR'||/Unsupported context format|A conversation is required|Invalid or duplicate entry ID|Context exceeds 16 MB/i.test(message))throw error;
     // The write may still complete after a transport timeout. Preserve its ID.
     throw new SaveUnknownError(id);
    }
   }
  };
  const pending=queue.then(run,run);queue=pending.catch(()=>{});return pending;
 }
 return {load,transact,async receipt(id){return (await load()).intentV2?.transactions?.[id]?.result??null;}};
}
export function nativeBackend(native){return {load:async()=>(await native('load')).data,save:async(expected,data)=>native('save',{expected,data})};}
