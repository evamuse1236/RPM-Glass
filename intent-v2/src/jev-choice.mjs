/** Validate the whole response before consuming any member of a decision batch. */
export function validateJevChoices(body,questions){
 const invalid=()=>{throw new Error('Jev returned an incomplete or invalid grouping. Nothing changed.');};
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const probability=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
 if(!/^typesafe\/jev-1\.13(?:$|-\d{8}$)/.test(body?.model??'')||(body.provider!==undefined&&body.provider!=='TypeSafe'))invalid();
 if(!object(body.usage)||['input_tokens','output_tokens'].some(k=>!Number.isSafeInteger(body.usage[k])||body.usage[k]<0)||('cost'in body.usage&&(!Number.isFinite(body.usage.cost)||body.usage.cost<0)))invalid();
 if(!object(body.answers)||Object.keys(body.answers).length!==Object.keys(questions).length)invalid();
 for(const [id,question] of Object.entries(questions)){
  const a=body.answers[id],keys=Object.keys(question.criteria);
  if(!object(a)||a.type!=='choice'||!probability(a.confidence)||!keys.includes(a.choice)||!object(a.probabilities))invalid();
  if(Object.keys(a.probabilities).length!==keys.length||keys.some(k=>!probability(a.probabilities[k])))invalid();
  const ps=Object.values(a.probabilities);
  if(Math.abs(ps.reduce((sum,p)=>sum+p,0)-1)>=.02||a.probabilities[a.choice]<Math.max(...ps)-1e-6)invalid();
 }
 return body.answers;
}
export async function jevFingerprint(request){
 const bytes=new TextEncoder().encode(JSON.stringify(request));
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
