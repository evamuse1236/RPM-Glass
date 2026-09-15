import {planner,tasks} from './planner-state.mjs';

const collectionMeta={
  tasks:{view:'day',label:'Task'},
  blocks:{view:'rpm',label:'RPM block'},
  projects:{view:'projects',label:'Project'},
  goals:{view:'life',label:'Goal'},
  areas:{view:'life',label:'Life area'},
};
const statusLabel={create:'created',update:'updated',delete:'removed',restore:'restored',complete:'completed',reopen:'reopened'};

function compactTitle(raw){
  const clean=String(raw??'').trim().replace(/^i\s+(?:want|would like)\s+to\s+/i,'').replace(/\s+/g,' ');
  if(clean.length<=200)return clean;
  const cut=clean.slice(0,200),word=cut.lastIndexOf(' ');
  return (word>140?cut.slice(0,word):cut).trim();
}

function isLegacyGoalSuggestion(suggestion){
  const label=String(suggestion?.label??'').trim().toLowerCase().replace(/[?!.]+$/,'');
  const text=String(suggestion?.text??'').trim().toLowerCase();
  if(/\bgoal ideas?\b|\bshow\b.{0,24}\bgoals?\b|\bsuggest\b.{0,24}\bgoals?\b/.test(text))return false;
  return ['goal','a goal','make goal','make a goal'].includes(label)
    && /\b(?:turn|make|create|save|shape|capture)\b.{0,80}\b(?:goal|this|it|that|message|thought)\b/.test(text)
    && /\bgoal\b/.test(text);
}

export function goalDraftAction(suggestion,sourceRaw,now=new Date()){
  const typed=suggestion?.action==='goal_draft';
  if(!typed&&!isLegacyGoalSuggestion(suggestion))return null;
  if(typeof sourceRaw!=='string'||!sourceRaw.trim()||sourceRaw.length>12000)return null;
  const suggested=typed&&typeof suggestion.title==='string'&&suggestion.title.trim()?suggestion.title:sourceRaw;
  const title=compactTitle(suggested);
  if(!title)return null;
  return {kind:'open_goal_draft',draft:{title,purpose:'',notes:sourceRaw.slice(0,8000),sourceRaw,areaId:null,year:now.getFullYear(),horizon:'yearly',period:null}};
}

export function bindSuggestionActions(suggestions,sourceRaw,now=new Date()){
  return (suggestions??[]).map(s=>{const captureAction=goalDraftAction(s,sourceRaw,now);return captureAction?{...s,captureAction}:s;});
}

export function plannerReceipts(data,changes,entryView){
  return changes.map(change=>{
    const meta=collectionMeta[change.collection];
    if(!meta)throw new Error('Unknown planning receipt collection.');
    const receipt={kind:'planner-change',status:`${meta.label} ${statusLabel[change.type]??'saved'}`,title:change.title,collection:change.collection,id:change.id};
    if(change.collection==='tasks'){
      const entry=data.entries.find(e=>e.id===change.id);
      if(entry)receipt.entry=entryView(entry);
    }
    if(change.type!=='delete')receipt.action={kind:'open_saved',collection:change.collection,id:change.id};
    return receipt;
  });
}

export function resolveCaptureAction(data,action){
  if(!action||typeof action!=='object')throw new Error('That action is no longer available.');
  if(action.kind==='open_goal_draft'){
    const draft=action.draft;
    if(!draft||typeof draft.title!=='string'||!draft.title.trim()||draft.title.length>200||typeof draft.sourceRaw!=='string'||!draft.sourceRaw.trim()||draft.sourceRaw.length>12000||typeof draft.notes!=='string'||draft.notes.length>8000)throw new Error('That goal draft is incomplete.');
    return {action:'planner',payload:{view:'life',draft:structuredClone(draft)}};
  }
  if(action.kind!=='open_saved'||!collectionMeta[action.collection])throw new Error('That action is no longer available.');
  const rows=action.collection==='tasks'?tasks(data):planner(data)[action.collection];
  if(!rows.some(row=>row.id===action.id))throw new Error('That saved item no longer exists.');
  const meta=collectionMeta[action.collection];
  return {action:'planner',payload:{view:meta.view,id:action.id,collection:action.collection}};
}

export async function executeCaptureAction(data,action,navigate){
  const effect=resolveCaptureAction(data,action);
  await navigate(effect.action,effect.payload);
  return effect;
}
