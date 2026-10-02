// Read-only descriptions of planner records for Capture choices. Never writes.
const COLLECTION={blockId:'blocks',projectId:'projects',goalId:'goals',areaId:'areas'};

function plannerRows(data,collection){
 return data?.planner?.[collection]??[];
}

/** Area colour token, matching the planner: an explicit colour, else list order. */
export function areaTone(area,areas=[]){
 if(!area)return null;
 const index=area.colorIndex??Math.max(0,areas.findIndex(a=>a.id===area.id));
 return `area-${index%8}`;
}

function chainFrom(data,collection,row){
 const projects=plannerRows(data,'projects'),goals=plannerRows(data,'goals'),areas=plannerRows(data,'areas');
 const project=collection==='blocks'?projects.find(p=>p.id===row.projectId):collection==='projects'?row:null;
 const goal=collection==='goals'?row:goals.find(g=>g.id===project?.goalId);
 const area=collection==='areas'?row:areas.find(a=>a.id===goal?.areaId);
 return {project,goal,area,areas};
}

/**
 * Describe a planner link value offered as an answer, e.g. a Block id, as
 * {title, subtitle, tone}. Unknown fields or ids return null so the caller
 * shows the option's own label unchanged.
 */
export function describeLink(data,field,value){
 const collection=COLLECTION[field];
 if(!collection||value==null)return null;
 const row=plannerRows(data,collection).find(r=>String(r.id)===String(value));
 if(!row)return null;
 const {project,area,areas}=chainFrom(data,collection,row);
 const parts=[];
 if(area&&collection!=='areas')parts.push(area.title);
 if(project&&collection==='blocks')parts.push(project.title);
 if(!parts.length&&row.purpose)parts.push(row.purpose);
 return {title:row.title,subtitle:parts.join(' · '),tone:areaTone(area,areas)};
}
