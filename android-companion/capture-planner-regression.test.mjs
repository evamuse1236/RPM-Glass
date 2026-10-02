import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionAgent,MODEL} from '../chat-prototype/companion-agent.mjs';
import {freshStore} from '../chat-prototype/companion-state.mjs';
test('malformed multi-call replies are repaired without executing a partial transaction',async()=>{const data=freshStore();let count=0;const call={id:'one',type:'function',function:{name:'respond',arguments:JSON.stringify({message:'No changes requested.',suggestions:[]})}};const agent=createCompanionAgent({apiKey:'fixture',fetchImpl:async(_,o)=>{assert.equal(JSON.parse(o.body).parallel_tool_calls,undefined);return {ok:true,json:async()=>({model:MODEL,choices:[{finish_reason:'tool_calls',message:{tool_calls:++count===1?[call,{...call,id:'two'}]:[call]}}]})};}});const r=await agent(data,'Hello',{conversationId:data.conversations[0].id});assert.equal(r.error,undefined);assert.equal(count,2);assert.equal(data.entries.length,0);});
