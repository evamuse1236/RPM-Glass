(()=>{
 const V=window.__v={};
 const iso=(dayOffset,h,mi)=>{const d=new Date();d.setDate(d.getDate()+dayOffset);d.setHours(h,mi,0,0);return d.toISOString();};
 const nextId=data=>{let hi=0;for(const e of data.entries??[])if(Number.isInteger(e.id)&&e.id<1e9)hi=Math.max(hi,e.id);return Math.max(data.sync?.nextTaskId??1,hi+1);};
 window.__rpmVoiceStart=opts=>{
  let resolve;const done=new Promise(r=>{resolve=r;});
  let heard='',request=1,changes=[];
  const tell=phase=>opts.onChange({phase,request,heard,changes,said:''});
  V.opts=opts;
  V.ready=()=>tell('listening');
  V.hear=text=>{heard=text;tell('listening');};
  V.loudOn=()=>{clearInterval(V.loud);V.loud=setInterval(()=>opts.onLevel(0.6),60);};
  V.loudOff=()=>{clearInterval(V.loud);opts.onLevel(0);};
  V.result=null;
  V.plan=kind=>{
   const data=opts.data(),n=nextId(data);
   V.ids=V.ids??{rent:n,milk:n+1,bank:n+2};
   const {rent,milk,bank}=V.ids;
   if(kind==='add'){
    const ops=[{type:'saveTask',fields:{title:'Pay rent',planned:iso(1,10,0)}},{type:'saveTask',fields:{title:'Buy milk'}},
     {type:'saveTask',fields:{title:'Call the bank',planned:iso(0,18,30),alert:'alarm'}}];
    changes=[{kind:'add',entity:'task',id:rent,title:'Pay rent',fields:{}},{kind:'add',entity:'task',id:milk,title:'Buy milk',fields:{}},
     {kind:'add',entity:'task',id:bank,title:'Call the bank',fields:{}}];
    V.result={heard,said:'',changes,errors:[],batch:{type:'batch',ops},uuids:[],created:[rent,milk,bank]};
   }else if(kind==='retime'){
    changes=[{kind:'change',entity:'task',id:rent,title:'Pay rent',fields:{}}];
    V.result={heard,said:'',changes,errors:[],batch:{type:'batch',ops:[{type:'saveTask',id:rent,fields:{planned:iso(1,11,30)}}]},uuids:[],created:[]};
   }else{
    changes=[{kind:'remove',entity:'task',id:milk,title:'Buy milk'}];
    V.result={heard,said:'',changes,errors:[],batch:{type:'batch',ops:[{type:'archiveTask',id:milk}]},uuids:[],created:[]};
   }
   tell('working');
  };
  V.talk=()=>tell('speaking');
  V.save=async()=>{await opts.onRequest(V.result,{index:request});request++;heard='';changes=[];tell('listening');return 'saved';};
  const end=()=>{clearInterval(V.loud);resolve({});};
  return {done,stop:end,hangUp:end};
 };
 return 'ready';
})()
