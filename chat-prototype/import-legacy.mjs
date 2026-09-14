import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openStore,transaction} from './companion-store.mjs';
import {localDate} from '../cli/interpret.mjs';
// One-time migration of a user-authorized browser API snapshot; not synthetic harnesses.
const [file,importFile,snapshotFile]=process.argv.slice(2);
if(!file||!importFile||!snapshotFile)throw new Error('Specify companion, CLI source, and browser snapshot paths.');
const store=openStore(file,{importFile});
if(store.data.legacyImported)throw new Error('Browser snapshot already imported.');
const old=JSON.parse(fs.readFileSync(snapshotFile,'utf8'));
transaction(store,d=>{
  const mapping=new Map();let next=Math.max(0,...d.entries.map(e=>e.id))+1;
  for(const oldEntry of old.entries){
    const id=next++;mapping.set(oldEntry.id,id);
    d.entries.push({...oldEntry,id,state:'active',done:false,plannedDate:localDate(new Date(oldEntry.planned)),created:new Date().toISOString(),purpose:'',mood:null,energy:null,archived:false,source:'legacy-browser',alertIntent:{type:oldEntry.alertType??null},alert:null,revisions:[],recurrence:null});
  }
  const cid=randomUUID();
  const messages=old.messages.map(m=>({...m,id:randomUUID(),at:new Date().toISOString(),entryIds:(m.entryIds??[]).map(id=>mapping.get(id))}));
  d.conversations.push({id:cid,title:'Earlier test chat',messages,archived:false});
  for(let i=0;i<messages.length;i++)if(messages[i].role==='user')d.history.push({id:randomUUID(),at:messages[i].at,raw:messages[i].text,response:messages[i+1]?.text??null,entryIds:messages[i+1]?.entryIds??[],conversationId:cid,source:'legacy-browser',archived:false});
  d.legacyImported={at:new Date().toISOString(),entries:old.entries.length,messages:old.messages.length,note:'Legacy API exposed current cards and revision counts, not full earlier revision snapshots. Historical card snapshots were not fabricated.'};
});
console.log(JSON.stringify({importedCLI:store.data.imported,importedBrowser:store.data.legacyImported,entries:store.data.entries.length}));
