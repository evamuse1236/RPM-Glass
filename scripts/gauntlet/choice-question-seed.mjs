import fs from 'node:fs';
import {freshStore} from '../../chat-prototype/companion-state.mjs';
import {undo} from '../../chat-prototype/companion-tools.mjs';
import {createMemoryBackend} from '../../intent-v2/src/repository.mjs';
import {sourceUnits} from '../../intent-v2/src/context.mjs';
import {field,operation,turn} from '../../intent-v2/test/helpers.mjs';
import {changePlanner} from '../../android-companion/planner-tools.mjs';
import {editPlan} from '../../android-companion/planner-state.mjs';
import {createIntentService} from '../../android-companion/intent-service.mjs';

const [,, out='choice-question.json', second='task'] = process.argv;
const COOK = 'Cook dinner tonight at 7', now = new Date();
const seed = freshStore();
editPlan(seed, {type: 'saveTask', fields: {title: 'Dinner with Asha', alert: 'alarm', time: 'today 8pm'}}, now);
const choices = [
  {label: 'The cooking draft', targets: [{entity: 'draft', id: 'draft-m0'}]},
  {label: second === 'alarm' ? 'The dinner alarm' : 'Dinner with Asha', targets: [{entity: second, id: '1'}]},
  {label: 'Both', targets: [{entity: 'draft', id: 'draft-m0'}, {entity: second, id: '1'}]},
];
const model = async input => {
  const raw = input.sourceUnits.map(u => u.text).join(' ');
  if (raw === COOK) return turn(COOK, [operation([field('title', 'Cook dinner', COOK), field('time', null, null, 'stated', 'unknown')], {opId: 'cook'})],
    {question: {opId: 'cook', field: 'time', prompt: '7 AM or 7 PM?', options: [{label: '7 PM', value: '7pm'}, {label: '7 AM', value: '7am'}]}});
  return turn(raw, [], {draftMode: 'none', reply: 'Which one should I delete?', decisions: sourceUnits(raw).map(u => ({sourceId: u.id, disposition: 'action', note: null})),
    clarification: {prompt: 'Which one should I delete?', action: 'remove', choices}});
};
const backend = createMemoryBackend(seed);
let t = +now - 60000;
const service = createIntentService({backend, model, changePlanner, undo, readCalendar: async () => ({status: 'not_selected', events: []}), editPlan,
  clock: () => new Date(t += 1000), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone});
const conversationId = (await backend.load()).conversations[0].id;
await service.capture({messageId: 'm0', conversationId, text: COOK});
await service.capture({messageId: 'm1', conversationId, text: 'Delete this'});
fs.writeFileSync(out, JSON.stringify(await backend.load()));
console.log(`Wrote ${out}: "Delete this" waits on a choice question (${second}).`);
