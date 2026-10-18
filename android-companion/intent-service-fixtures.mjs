import {freshStore} from '../chat-prototype/companion-state.mjs';
import {undo} from '../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../intent-v2/src/repository.mjs';
import {changePlanner} from './planner-tools.mjs';
import {editPlan} from './planner-state.mjs';
import {createIntentService} from './intent-service.mjs';

export const calendar=async()=>({status:'not_selected',events:[]});
export const serviceFor=(model,seed=freshStore(),options={})=>{const backend=createMemoryBackend(seed);return {backend,service:createIntentService({backend,model,changePlanner,undo,readCalendar:calendar,editPlan,clock:()=>new Date('2026-09-16T04:00:00.000Z'),timezone:'Asia/Kolkata',...options})};};
