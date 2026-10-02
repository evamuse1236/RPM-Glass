import {tasks} from './planner-state.mjs';

const iso=ms=>Number.isFinite(ms)&&ms>0?new Date(ms).toISOString():null;
const pad=n=>String(n).padStart(2,'0');
const localTime=ms=>{const d=new Date(ms);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;};
const text=v=>typeof v==='string'?v:'';

/** One-time copy of the earlier screens' SQLite entries (what the old widget saved) into the
 *  companion store. Original words, titles, times and edit reasons are kept; the SQLite rows
 *  are not changed, and their alerts stay armed there, so nothing is armed twice.
 *  Idempotent: rows already copied (by legacyId) are skipped. Returns the number copied. */
export function importLegacyEntries(data,legacy,now=new Date()){
  const rows=(legacy?.entries??[]).filter(r=>Number.isInteger(r?._id)&&typeof r.raw==='string');
  const seen=new Set(data.entries.map(e=>e.legacyId).filter(id=>id!=null));
  const fresh=rows.filter(r=>!seen.has(r._id));
  if(!fresh.length)return 0;
  const projects=new Map((legacy.projects??[]).map(p=>[p._id,p]));
  const history=new Map();
  for(const r of legacy.revisions??[]){if(!history.has(r.entry_id))history.set(r.entry_id,[]);history.get(r.entry_id).push({at:iso(r.at),reason:text(r.reason)});}
  const at=now.toISOString();
  let id=Math.max(0,...data.entries.map(e=>e.id));
  let priority=Math.max(0,...tasks(data).filter(t=>(t.blockId??null)===null).map(t=>t.priority??0));
  // Plan order for the copied No block tasks follows the earlier "next" list: timed first, then newest.
  const order=[...fresh].sort((a,b)=>(a.planned==null)-(b.planned==null)||(a.planned??0)-(b.planned??0)||b.created-a.created||a._id-b._id);
  for(const r of order){
    const checkin=r.kind==='checkin',project=projects.get(r.project);
    const alerts=[['reminder',r.reminder,r.reminder_status],['alarm',r.alarm,r.alarm_status]]
      .filter(([,time,status])=>Number.isFinite(time)&&status&&status!=='none')
      .map(([type,time,status])=>`Earlier screens ${type} at ${localTime(time)} (${status}); it stays with the earlier screens.`);
    const notes=[text(r.notes),project&&`Earlier Result: ${text(project.result)}${project.purpose?' · Purpose: '+project.purpose:''}`,...alerts].filter(Boolean).join('\n\n');
    data.entries.push({
      id:++id,kind:checkin?'checkin':'plan',title:text(r.title)||r.raw,raw:r.raw,created:iso(r.created)??at,
      state:r.done?'done':'active',done:!!r.done,planned:checkin?null:iso(r.planned),plannedDate:null,
      minutes:Number.isFinite(r.minutes)?r.minutes:null,durationSource:text(r.duration_source)||(checkin?'not_reported':'default_estimate'),
      purpose:text(r.purpose),mood:r.mood??null,energy:r.energy??null,notes,
      ...(checkin?{}:{must:false,priority:++priority}),
      alert:null,alertIntent:{type:null},recurrence:null,archived:false,source:'legacy-import',legacyId:r._id,
      revisions:[{at,reason:'Copied from the earlier RPM screens',before:null,snapshot:{legacyId:r._id,interpretation:text(r.interpretation),earlierRevisions:history.get(r._id)??[]}}]
    });
  }
  data.legacyImport={at,entries:(data.legacyImport?.entries??0)+fresh.length,source:'Earlier RPM screens'};
  return fresh.length;
}
