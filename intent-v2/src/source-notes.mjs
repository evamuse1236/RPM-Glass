export function withNotes(decisions,units){
 const text=new Map(units.map(u=>[u.id,u.text]));
 return decisions.map(d=>d.disposition==='action'||d.note?.trim()?d:{...d,note:(text.get(d.sourceId)??'').trim().replace(/[.,;]+$/,'').slice(0,140)||null});
}
