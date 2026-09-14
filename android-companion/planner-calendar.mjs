export function calendarLabel(value){if(value?.status==='permission_needed'&&!value.configured)return 'Not connected';return ({ready:'Local copy',not_selected:'Not connected',permission_needed:'Permission needed',stale:'Copy is stale',incomplete:'Partial copy',unavailable:'Unavailable'})[value?.status]??'Unavailable';}
export function calendarRisk(value,start,end){
  if(value?.status==='not_selected'||value?.status==='permission_needed'&&!value.configured)return null;
  if(value?.status!=='ready')return 'Calendar could not be fully checked. You can save in RPM, but there may be a conflict.';
  if(value.start>start||value.end<end)return 'This time is outside the available calendar copy.';
  return null;
}
export function calendarRows(value){return (value?.events??[]).filter(e=>typeof e.title==='string'&&Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.end>e.start);}
