const API='https://generativelanguage.googleapis.com';
export const LIVE_URL='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
export const LIVE_TOKEN_URL='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

/**
 * A one-use Gemini Live token that only opens a session with `setup` (model, prompt and tools locked),
 * within one minute, for at most ten. The key stays with the caller.
 */
export async function mintVoiceToken(key,setup,now=new Date(),fetchImpl=fetch){
 const at=now.getTime(),body={uses:1,expireTime:new Date(at+10*60e3).toISOString(),newSessionExpireTime:new Date(at+60e3).toISOString(),bidiGenerateContentSetup:setup};
 const response=await fetchImpl(`${API}/v1alpha/auth_tokens`,{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify(body)});
 const answer=await response.json().catch(()=>({}));
 if(!response.ok||typeof answer.name!=='string')throw Object.assign(new Error('Voice is unavailable right now.'),{status:response.status});
 return {token:answer.name,expiresAt:body.expireTime,url:LIVE_TOKEN_URL};
}
