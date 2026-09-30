import {localDay, tasks, planner, blockTasks, timelineItems, shiftDay} from './planner-state.mjs';

/** Idempotent, lossless upgrade. Legacy priority remains the storage/API ordering field. */
export function migratePlannerUX(data) {
  if (data.planner?.uxVersion >= 2) return false;
  const upgrade = snapshot => {
    if (!snapshot?.entries) return;
    for (const task of snapshot.entries) {
      if ((task.kind ?? 'plan') !== 'plan') continue;
      task.must = !!(task.must || task.starred || task.star || task.mustDo);
      if (task.purpose && task.blockId) {
        task.revisions ??= [];
        task.revisions.push({reason:'Purpose retained as a note', before:{purpose:task.purpose, notes:task.notes ?? ''}});
        task.notes = [task.notes, 'Previous task purpose: ' + task.purpose].filter(Boolean).join('\n\n');
        task.purpose = '';
      }
    }
    const ids = new Set(snapshot.entries.map(t => t.blockId ?? null));
    for (const id of ids) snapshot.entries.filter(t => (t.blockId ?? null) === id && (t.kind ?? 'plan') === 'plan')
      .sort((a,b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || (Date.parse(a.planned) || Infinity) - (Date.parse(b.planned) || Infinity) || a.id-b.id)
      .forEach((t,i) => {t.priority = i+1;});
    if (snapshot.planner) {snapshot.planner.uxVersion = 2;snapshot.planner.areas?.forEach((area,i)=>{area.colorIndex??=i%8;});}
    upgrade(snapshot.planner?.undo);
  };
  upgrade(data);
  data.planner ??= {schema:1,projects:[],blocks:[],areas:[],goals:[],events:[],drafts:[],context:{vision:'',goals:'',approved:false},undo:null};
  data.planner.uxVersion = 2;
  return true;
}

export function taskContext(data, task) {
  const p = planner(data), block=p.blocks.find(b=>b.id===task.blockId), project=p.projects.find(pr=>pr.id===block?.projectId), goal=p.goals.find(g=>g.id===project?.goalId), area=p.areas.find(a=>a.id===goal?.areaId);
  return {block, project, goal, area, purpose:block?.purpose || (!block ? task.purpose : '') || ''};
}
export function areaTone(area, areas=[]) {
  if (!area) return 'neutral';
  return 'area-' + (area.colorIndex ?? Math.max(0, areas.findIndex(a=>a.id===area.id)) % 8);
}
export function dayTasks(data, day, now=Date.now()) {
  const all=tasks(data), timed=timelineItems(data,day).filter(o=>o.start<+new Date(shiftDay(day,1)+'T00:00:00')).map(o=>({...all.find(t=>t.id===o.id),occurrence:o.occurrence,start:o.start,end:o.end}));
  const dated=all.filter(t=>!t.planned && (t.plannedDate===day || (t.must && day===localDay(now) && t.plannedDate && t.plannedDate<day && !t.done)));
  const completed=all.filter(t=>t.done && (t.plannedDate===day || t.planned && localDay(t.planned)===day));
  for(const t of all.filter(t=>!t.done))for(const c of t.completions??[])if(localDay(c.occurrence)===day)completed.push({...t,done:true,occurrence:c.occurrence});
  const unique=rows=>[...new Map(rows.map(t=>[t.id,t])).values()];
  const active=unique([...timed,...dated]).filter(t=>!t.done);
  const upcoming=active.filter(t=>t.start && t.end>now).sort((a,b)=>a.start-b.start);
  return {active,completed:unique(completed),focus:day===localDay(now)?upcoming[0]??null:null};
}
export function remainingLabel(rows, duration) {
  const done=rows.filter(t=>t.done).length, active=rows.filter(t=>!t.done), unknown=active.filter(t=>t.minutes==null).length;
  return `${done} of ${rows.length} tasks · ${duration(active.reduce((n,t)=>n+(t.minutes??0),0))} left${unknown?' · '+unknown+' unestimated':''}`;
}
export function reorderTask(ids, moving, target) {
  if (!ids.includes(moving) || !ids.includes(target)) return ids;
  const next=ids.filter(id=>id!==moving);next.splice(ids.indexOf(target),0,moving);return next;
}
