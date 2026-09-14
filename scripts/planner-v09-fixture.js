// Synthetic fixture for the owned emulator only. Restore its private pre-QA copy afterward.
(async()=>{
 const {data}=await RPM_PLATFORM.action('load');const day=new Date().toLocaleDateString('en-CA');
 const at=new Date().toISOString(),task=(id,title,blockId,minutes,priority,planned=null)=>({id,kind:'plan',title,raw:title,blockId,minutes,priority,planned,plannedDate:null,created:at,state:'active',done:false,archived:false,revisions:[],alertIntent:{type:'off'}});
 data.entries=[task(101,'Read the key sections','qa-block-a',30,1),task(102,'Write three discussion points','qa-block-a',15,2),task(103,'Buy essentials','qa-block-b',20,1)];data.entries[0].must=true;
 data.planner={schema:1,projects:[{id:'qa-project',title:'Prepare for the week',purpose:'Make room for focused work',goalId:null}],blocks:[{id:'qa-block-a',title:'Explain the chapter clearly',purpose:'Feel ready to contribute',projectId:'qa-project'},{id:'qa-block-b',title:'Have home ready',purpose:'Make everyday life easier',projectId:'qa-project'},{id:'qa-empty',title:'Make space for rest',projectId:null}],areas:[],goals:[],events:[],drafts:[],context:{vision:'',goals:'',approved:false},undo:null};
 data.conversations=[{id:'qa-v09-chat',title:'Planner QA',messages:[],archived:false}];data.history=[];data.pending=null;data.undo=null;data.inFlight=null;
 await RPM_PLATFORM.action('save',{expected:data.version,data:{...data,version:data.version+1}});await rpmPhoneRefresh();return {fixture:true,tasks:data.entries.length};
})()
