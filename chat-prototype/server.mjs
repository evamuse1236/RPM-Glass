import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {Workflow,emptyData} from '../cli/workflow.mjs';
import {actionsFor} from '../cli/bubbles.mjs';
import {formatTime,scheduledAlert} from '../cli/interpret.mjs';
import {createOpenRouter,readApiKey,MODEL} from '../cli/openrouter.mjs';
import {chatContext,sendChat} from './conversation.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const files=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
const token=()=>randomBytes(24).toString('hex');
const moods=['Low','Uneasy','Okay','Good','Great'];
const energies=['Low','Medium','High'];

function entryView(e){
  return {id:e.id,title:e.title,kind:e.kind,state:e.state,done:e.done,minutes:e.minutes,durationSource:e.durationSource,
    when:e.planned?formatTime(e.planned):e.plannedDate?e.plannedDate+' · time not set':null,
    mood:e.mood,energy:e.energy,purpose:e.purpose,
    alert:!e.done&&e.alert?{type:e.alert.type,at:formatTime(e.alert.at),status:e.alert.status}:null,
    timeNote:e.interpretation?.reason??null,raw:e.raw,revisions:e.revisions.length,
    actions:actionsFor(e)};
}

function questionView(w){
  const p=w.pending;if(!p)return null;
  const e=w.get(p.id);let text='',labels=[];
  if(p.kind==='edit_target'){
    text='Which one did you mean?';
    labels=p.options.map(id=>{const e=w.get(id);return `#${id} ${e.title}${e.planned?' · '+formatTime(e.planned):''}`;});
  }else if(p.kind==='edit_value'){
    text=p.need.prompt;labels=p.need.field==='time'?p.options.map(formatTime):p.options;
  }else if(p.kind==='duration'){text=e.kind==='plan'?'How long will it take?':'How long did it take?';labels=(p.options??[]).map(n=>n+' min');}
  else if(p.kind==='mood'){text='How do you feel?';labels=moods;}
  else if(p.kind==='energy'){text='How is your energy?';labels=energies;}
  else if(p.kind==='purpose'){text='Why does this matter to you?';labels=p.options??[];}
  else if(p.kind==='alert'){text='Use a reminder or an alarm?';labels=['Reminder','Alarm'];}
  else if(p.kind==='confirm_alert'){
    const alert=scheduledAlert(p.type,p.at,w.now());
    text=`Use an ${p.type==='alarm'?'alarm':'alert'} at ${formatTime(alert.at)}? This prototype only shows the setting; it will not ring.`;
    labels=['Use this time','Change time','Cancel'];
  }else if(p.kind==='time'||p.kind==='planned_time'){text=e.interpretation?.reason||'What day and time?';labels=(p.options??[]).map(formatTime);}
  else if(p.kind==='correction'){text=`Change #${p.id} to ${p.minutes} minutes?`;labels=['Yes','No'];}
  return {text:p.prompt??text,entryId:e?.id??null,title:e?.title??null,choices:p.custom?[]:labels.map((label,i)=>({label,value:String(i+1)}))};
}

export function createChatServer({interpreter,aiEnabled=Boolean(interpreter),now=()=>new Date(),conversation=false}={}){
  const sessions=new Map();
  const newSession=()=>({id:token(),version:0,busy:false,messages:[],workflow:new Workflow(emptyData(),{interpreter,now})});
  const view=s=>({version:s.version,busy:s.busy,aiEnabled,model:aiEnabled?MODEL:null,mode:s.workflow.mode,selectedId:s.workflow.latest,
    entries:s.workflow.data.entries.map(entryView),messages:s.messages,question:questionView(s.workflow)});
  return http.createServer(async(req,res)=>{
    const port=res.socket.localPort;
    const origins=[`http://127.0.0.1:${port}`,`http://localhost:${port}`];
    if(!origins.some(origin=>origin.slice(7)===req.headers.host))return res.writeHead(403).end('Local access only.');
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy','no-referrer');
    const reply=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    const url=new URL(req.url,origins[0]);
    if(req.method==='GET'&&files.has(url.pathname)){
      const [file,type]=files.get(url.pathname);res.writeHead(200,{'Content-Type':type});return res.end(fs.readFileSync(path.join(directory,file)));
    }
    if(!['/api/state','/api/turn','/api/new'].includes(url.pathname))return reply(404,{error:'Not found.'});
    if(req.headers.origin&&!origins.includes(req.headers.origin))return reply(403,{error:'Open this page on localhost.'});
    if(req.headers['sec-fetch-site']==='cross-site')return reply(403,{error:'Local access only.'});
    let id=req.headers.cookie?.match(/(?:^|;\s*)rpm_test=([a-f0-9]{48})(?:;|$)/)?.[1];
    let session=sessions.get(id);
    if(!session){session=newSession();sessions.set(session.id,session);res.setHeader('Set-Cookie',`rpm_test=${session.id}; HttpOnly; SameSite=Strict; Path=/`);}
    if(url.pathname==='/api/state'&&req.method==='GET')return reply(200,view(session));
    if(req.method!=='POST')return reply(405,{error:'Use POST.'});
    if(!origins.includes(req.headers.origin)||!req.headers['content-type']?.startsWith('application/json'))return reply(403,{error:'Send changes from this chat page.'});
    if(session.busy)return reply(409,{error:'Still reading your last note. Wait a moment.',state:view(session)});
    let body;
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>65536){reply(413,{error:'That note is too long. Try a shorter one.'});return;}chunks.push(chunk);}
      body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!body||typeof body!=='object')throw new Error();
    }catch{return reply(400,{error:'Could not read that request.'});}
    if(url.pathname==='/api/new'){
      const fresh=newSession();sessions.set(fresh.id,fresh);
      res.setHeader('Set-Cookie',`rpm_test=${fresh.id}; HttpOnly; SameSite=Strict; Path=/`);return reply(200,view(fresh));
    }
    if(body.version!==session.version)return reply(409,{error:'The chat changed in another tab. Your draft is still here; try again.',state:view(session)});
    const w=session.workflow;
    const before=new Map(w.data.entries.map(e=>[e.id,JSON.stringify(e)]));
    const safeTypes=['message','action','choice','leave','mode'];
    if(!safeTypes.includes(body.type))return reply(400,{error:'Unknown action.'});
    let text,label;
    if(body.type==='action'){
      const e=w.get(body.entryId),action=e&&actionsFor(e).find(a=>a.key===body.key);
      if(!action)return reply(409,{error:'That choice changed. Use the latest bubble.',state:view(session)});
      w.latest=e.id;w.pending=null;w.cards([e]);
      text=String(w.quick.findIndex(a=>a.key===body.key)+1);label=action.label+' · '+e.title;
    }else if(body.type==='choice'){
      if(!w.pending)return reply(409,{error:'That question has already been answered.',state:view(session)});
      const choice=questionView(w).choices.find(c=>c.value===body.value);
      if(!choice)return reply(400,{error:'Choose one of the shown options.'});
      text=choice.value;label=choice.label;
    }else if(body.type==='leave'){text='/cancel';label='Leave this question';}
    else if(body.type==='mode'){
      if(!['capture','checkin'].includes(body.mode))return reply(400,{error:'Unknown mode.'});
      text='/'+body.mode;label=body.mode==='checkin'?'Check in':'Plan something';
    }else{
      if(typeof body.text!=='string'||!body.text.trim()||body.text.length>12000)return reply(400,{error:'Write a note of up to 12,000 characters.'});
      text=body.text.trim();label=text;
    }
    session.busy=true;session.messages.push({role:'user',text:label});
    try{
      const chat=body.type==='message'&&conversation?await sendChat(w,text,chatContext(w,session.messages.slice(0,-1),questionView(w))):null;
      const response=chat?chat.reply:body.type==='message'?await w.sendAsync(text):w.send(text);
      const changed=w.data.entries.filter(e=>before.get(e.id)!==JSON.stringify(e)).map(e=>e.id);
      if(body.type==='action'&&!changed.length)changed.push(body.entryId);
      const p=questionView(w);
      let message=changed.length?(before.has(changed[0])?'Changed.':'Saved.'):'',detail='';
      if(!changed.length&&!p)message=response.split('\n╭')[0].trim();
      if(p&&p.entryId&&body.type!=='action')message='For '+w.get(p.entryId).title;
      if(p?.entryId&&!changed.length&&p.text==='How do you feel?')message='';
      if(response.includes('AI is not available.'))detail='AI could not read that note. Your words are kept here; check the time. No alert was started.';
      if(chat)message=chat.reply;
      session.messages.push({role:'assistant',text:message,detail,entryIds:changed,question:p});session.version++;
      session.busy=false;reply(200,view(session));
    }catch{
      session.messages.push({role:'assistant',text:'I could not finish that change. Your words are still in this test chat.'});session.version++;
      session.busy=false;reply(500,{error:'Could not finish that change.',state:view(session)});
    }
  });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
  const port=Number(arg('--port','4317'));
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Use a port from 1024 to 65535.');
  const keyFile=arg('--key-file',process.env.RPM_OPENROUTER_KEY_FILE);
  let key=null;
  try{key=readApiKey(keyFile);}catch{console.error('Could not read the private key file. Starting with local rules.');}
  const server=createChatServer({interpreter:key?createOpenRouter({apiKey:key,conversation:true}):null,conversation:true});
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'That port is in use. Choose another with --port.':'Could not start the local server.');process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`RPM test chat: http://127.0.0.1:${port}\n${key?'AI: '+MODEL:'Local rules only; use --key-file for AI.'}\nSeparate in-memory chats. Restarting clears them. No real alarms run.`));
}
