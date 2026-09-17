import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';

test('Glass composer sends exact source and focused draft, retaining its message ID after transport failure',async()=>{
  const nodes=new Map(),storage=new Map(),requests=[];
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',dataset:{},listeners:{},classList:{toggle(){}},
      setAttribute(){},focus(){},addEventListener(event,handler){this.listeners[event]=handler;}});
    return nodes.get(id);
  };
  const context=vm.createContext({
    window:{RPM_PLATFORM:{native:true,compactReply:true},addEventListener(){}},
    document:{getElementById:node,querySelectorAll:()=>[]},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    MutationObserver:class{observe(){}},crypto:{randomUUID},
    fetch:(url,options)=>{
      if(url==='/api/state')return new Promise(()=>{});
      requests.push(JSON.parse(options.body));
      return Promise.reject(new Error('Failed to fetch'));
    },
  });
  vm.runInContext(fs.readFileSync(new URL('./app.js',import.meta.url),'utf8'),context);
  vm.runInContext("state={captureMode:'glass',version:7,csrf:'test'}; conversationId='conversation-1'; focusedDraftId='draft-1';",context);
  const raw='  Print the worksheets, twenty minutes.  ';
  const submit=async()=>{node('message').value=raw;node('composer').listeners.submit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));};
  await submit();
  assert.equal(requests.length,1);
  assert.equal(requests[0].text,raw);
  assert.equal(requests[0].focusDraftId,'draft-1');
  assert.equal(requests[0].conversationId,'conversation-1');
  assert.match(requests[0].messageId,/^[a-f0-9-]{36}$/);
  assert.equal(node('message').value,raw);
  await submit();
  assert.equal(requests[1].messageId,requests[0].messageId);
  vm.runInContext("focusedDraftId='draft-2'",context);
  await submit();
  assert.equal(requests[2].focusDraftId,'draft-2');
  assert.notEqual(requests[2].messageId,requests[1].messageId);
});
