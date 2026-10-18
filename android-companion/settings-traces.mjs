import {createTraceStore} from './capture-trace.mjs';
import {userMessage} from './user-message.mjs';

const OUTCOME={kept:'Kept',undone:'Undone, likely mistake',edited:'Edited by hand later'};
const STATUS={applied:'Applied','needs-answer':'Waiting for an answer','needs-time':'Waiting for a time','needs-check':'Waiting for a check',
 answered:'Answered',nothing:'Saved, nothing to change','words-kept':'Words saved, model failed','not-saved':'Not saved',failed:'Apply failed'};
const shortModel=model=>String(model??'').replace(/^anthropic\//,'');

function text(tag,cls,value){
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 node.textContent=value;
 return node;
}

/** One line per model call: "claude-haiku-5-5 · Claude · none · 2.1 s · ok". */
const SERVICE={anthropic:'Claude',openrouter:'OpenRouter'};
const runLine=run=>[shortModel(run.servedModel??run.model),SERVICE[run.service],run.serviceFallback?`after ${run.serviceFallback}`:null,run.effort,run.ms!=null?`${(run.ms/1000).toFixed(1)} s`:null,run.ok===false?(run.error??'failed'):'ok',run.escalated?`then ${run.escalated}`:null].filter(Boolean).join(' · ');

/**
 * Settings → Diagnostics: the capture traces kept on this phone, newest first, so a likely mistake can be read
 * without a computer. The same records upload with diagnostics when it is connected.
 */
export function captureTraces({store=createTraceStore(),limit=20}={}){
 const traces=store.list().slice(0,limit);
 const box=document.createElement('details');
 box.className='settings-details';
 const mistakes=traces.filter(t=>t.likelyMistake).length;
 box.append(text('summary','',`Recent captures (${traces.length}${mistakes?`, ${mistakes} undone`:''})`));
 if(!traces.length)box.append(text('p','settings-note','No captures recorded on this phone yet.'));
 for(const t of traces){
  const item=document.createElement('div');
  item.className='settings-note';
  item.append(text('strong','',`${new Date(t.at).toLocaleString()} · ${STATUS[t.applied?.status]??t.applied?.status??'Saved'}${t.outcome?` · ${OUTCOME[t.outcome]??t.outcome}`:''}`));
  item.append(text('p','',`“${String(t.words??'').slice(0,240)}”`));
  for(const run of t.models??[])item.append(text('p','',runLine(run)));
  if(t.latencyMs!=null)item.append(text('p','',`Total ${(t.latencyMs/1000).toFixed(1)} s · ${t.promptVersion}`));
  for(const e of t.errors??[])item.append(text('p','',`${e.stage}: ${userMessage(e)}`));
  box.append(item);
 }
 return box;
}
