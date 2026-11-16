export function calendarLabel(value){if(value?.status==='permission_needed'&&!value.configured)return 'Not connected';return ({ready:'Local copy',not_selected:'Not connected',permission_needed:'Permission needed',stale:'Copy is stale',incomplete:'Partial copy',unavailable:'Unavailable'})[value?.status]??'Unavailable';}
export function calendarRisk(value,start,end){
  if(['not_selected','unlinked'].includes(value?.status)||value?.configured===false||value?.status==='permission_needed'&&!value.configured)return null;
  if(value?.status!=='ready')return 'Calendar could not be fully checked. You can save in RPM, but there may be a conflict.';
  if(value.start>start||value.end<end)return 'This time is outside the available calendar copy.';
  return null;
}
export function calendarRows(value){return (value?.events??[]).filter(e=>typeof e.title==='string'&&Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.end>e.start);}
/** Whether a calendar read's rows say what is busy now, as the notch's own read does: its window holds this moment, or it has no window at all (no calendar chosen, no permission, nothing read), so nothing is busy. */
export function speaksForNow(value,now=Date.now()){const windowed=Number.isFinite(value?.start)&&Number.isFinite(value?.end);return !windowed||value.start<=now&&now<value.end;}
