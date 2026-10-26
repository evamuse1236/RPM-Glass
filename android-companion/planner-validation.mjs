import {planner, tasks} from './planner-state.mjs';
import {title, integer, link} from './planner-fields.mjs';
import {validateReviewData} from './planner-review-data.mjs';
import {validateBody} from './body-store.mjs';

export function validatePlanner(data){
  const p=planner(data);if(p.schema!==1)throw new Error('Unsupported planner format.');
  for(const k of ['projects','blocks','areas','goals','events','drafts'])if(!Array.isArray(p[k]))throw new Error('Invalid planning data.');
  for(const k of ['projects','blocks','areas','goals']){const ids=new Set();for(const r of p[k]){if(typeof r.id!=='string'||ids.has(r.id))throw new Error('Duplicate planning ID.');ids.add(r.id);title(r.title);}}
  for(const b of p.blocks)link(p.projects,b.projectId);
  for(const a of p.areas)if(a.rating!=null&&(typeof a.rating!=='number'||!Number.isFinite(a.rating)||a.rating<0||a.rating>10))throw new Error('Choose a life area rating from 0 to 10.');
  for(const g of p.goals){link(p.areas,g.areaId);integer(g.year,2000,2200);if(!['yearly','quarterly','monthly'].includes(g.horizon??'yearly'))throw new Error('Choose a valid goal horizon.');if(g.horizon==='quarterly'||g.horizon==='monthly')integer(g.period,1,g.horizon==='quarterly'?4:12);}
  for(const pr of p.projects)link(p.goals,pr.goalId);
  for(const e of tasks(data)){link(p.blocks,e.blockId);if(e.minutes!=null)integer(e.minutes,1,1440);if(e.priority!=null)integer(e.priority,0,100000);}
  validateReviewData(p);
  validateBody(p);
  return data;
}

/** Planner commits cross runtimes as JSON data, never executable mutators. */
export function assertPlanOp(op) {
  const json = value => value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)
    || Array.isArray(value) && value.every(json)
    || value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Object.values(value).filter(item => item !== undefined).every(json);
  if (!op || typeof op !== 'object' || Array.isArray(op) || typeof op.type !== 'string' || !json(op)) throw new Error('Planning actions must be JSON data ops.');
}
