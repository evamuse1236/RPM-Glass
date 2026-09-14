import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes} from 'node:crypto';
import {openStore,transaction,lockStore} from './companion-store.mjs';
import {entryView,propose,undo} from './companion-tools.mjs';
import {readApiKey} from '../cli/openrouter.mjs';
import {MODEL,createCompanionAgent} from './companion-agent.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const files=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
export function createCompanionServer({store=openStore(),agent=createCompanionAgent(),aiEnabled=false,now=()=>new Date()}={}){
  let busy=false;const csrf=randomBytes(24).toString('hex');
  const view=()=>({version:store.data.version,busy,csrf,aiEnabled,model:MODEL,entries:store.data.entries.map(entryView),memories:store.data.memories,history:store.data.history,conversations:store.data.conversations,pending:store.data.pending,undoId:store.data.undo?.id??null,imported:store.data.imported});
  const server=http.createServer(async(req,res)=>{
    const port=res.socket.localPort;const origins=[`http://127.0.0.1:${port}`,`http://localhost:${port}`];
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    if(!origins.some(o=>o.slice(7)===req.headers.host)||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&!origins.includes(req.headers.origin))return send(403,{error:'Local access only.'});
    const url=new URL(req.url,origins[0]);
    if(req.method==='GET'&&files.has(url.pathname)){const [file,type]=files.get(url.pathname);res.writeHead(200,{'Content-Type':type});return res.end(fs.readFileSync(path.join(directory,file)));}
    if(req.method==='GET'&&url.pathname==='/api/state')return send(200,view());
    if(req.method!=='POST'||url.pathname!=='/api/turn')return send(404,{error:'Not found.'});
    if(!origins.includes(req.headers.origin)||!req.headers['content-type']?.startsWith('application/json')||req.headers['x-rpm-token']!==csrf)return send(403,{error:'Refresh this local page before making changes.'});
    if(busy)return send(409,{error:'Still working on the previous message.',state:view()});
    let body;
    try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)return send(413,{error:'That message is too long.'});chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString());}catch{return send(400,{error:'Could not read the request.'});}
    if(!body||body.version!==store.data.version)return send(409,{error:'Another tab changed the data. Your draft is kept; try again.',state:view()});
    let c=store.data.conversations.find(c=>c.id===body.conversationId);
    if(!c)c=store.data.conversations.find(c=>!c.archived);
    if(!c)return send(400,{error:'Choose or create an active conversation.'});
    const cid=c.id;
    try{
      if(body.type==='new'){
        transaction(store,data=>data.conversations.push({id:randomUUID(),title:'New conversation',messages:[],archived:false}));return send(200,view());
      }
      if(body.type==='undo'){
        transaction(store,data=>{const result=undo(data,body.undoId);c.messages.push({id:randomUUID(),role:'assistant',at:now().toISOString(),...result});});return send(200,view());
      }
      if(body.type==='cancel'){
        transaction(store,data=>{data.pending=null;c.messages.push({id:randomUUID(),role:'assistant',text:'I left that proposal. Nothing was changed.',at:now().toISOString()});});return send(200,view());
      }
      if(['archive','restore'].includes(body.type)){
        if(!['entries','memories','history','conversations'].includes(body.collection))return send(400,{error:'Unknown record type.'});
        if(body.collection==='conversations'&&body.id===cid&&body.type==='archive')return send(400,{error:'Open another conversation before archiving this one.'});
        transaction(store,data=>{const raw=`${body.type} this ${body.collection} record`;const result=propose(data,{operations:[{type:body.type,collection:body.collection,id:body.id,fields:{},evidence:[raw]}],continuation:false,question:null,choices:[]},{raw,conversationId:cid,now:now()});c.messages.push({id:randomUUID(),role:'assistant',at:now().toISOString(),...result});});return send(200,view());
      }
      if(body.type!=='message'||typeof body.text!=='string'||!body.text.trim()||body.text.length>12000)return send(400,{error:'Write a message of up to 12,000 characters.'});
      if(c.archived)return send(400,{error:'Restore this conversation before replying.'});
      const raw=body.text.trim();busy=true;
      transaction(store,data=>{c.messages.push({id:randomUUID(),role:'user',text:raw,at:now().toISOString()});if(c.messages.length===1)c.title=raw.slice(0,60);});
      // Work on a clone: failed tools, network errors and interrupted calls never leak partial edits.
      const draft=structuredClone(store.data);
      const result=await agent(draft,raw,{conversationId:cid,now:now()});
      const backup=store.data;
      try{
        store.data=draft;
        transaction(store,data=>{
          data.conversations.find(x=>x.id===cid).messages.push({id:randomUUID(),role:'assistant',at:now().toISOString(),...result});
          data.history.push({id:randomUUID(),raw,response:result.text,at:now().toISOString(),source:'conversation',conversationId:cid,entryIds:result.entryIds??[],archived:false});
        });
      }catch(e){store.data=backup;throw e;}
      busy=false;return send(200,view());
    }catch{
      busy=false;return send(500,{error:'Could not save that change. Your last saved data is intact. Refresh and try again.',state:view()});
    }
  });
  return server;
}

export function startCompanion(args=process.argv.slice(2)){
  const arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
  const port=Number(arg('--port','4318'));if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid port.');
  const base=process.env.XDG_DATA_HOME||path.join(process.env.HOME,'.local/share');
  const file=arg('--data',path.join(base,'rpm-companion/data.json'));
  const importFile=arg('--import-cli',path.join(base,'rpm-cli/data.json'));
  const release=lockStore(file);let store;
  try{store=openStore(file,{importFile});}catch(e){release();throw e;}
  process.once('exit',release);
  let key=null;try{key=readApiKey(arg('--key-file',process.env.RPM_OPENROUTER_KEY_FILE));}catch{}
  const server=createCompanionServer({store,agent:createCompanionAgent({apiKey:key}),aiEnabled:!!key});
  server.once('close',release);
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(()=>process.exit(0)));
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port already in use.':'Could not start companion.');process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`RPM companion: http://127.0.0.1:${port}\nPersistent local test copy. CLI originals unchanged. Alerts are previews.\nAI: ${key?MODEL:'not connected'}`));
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))startCompanion();
