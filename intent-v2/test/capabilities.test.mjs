import test from 'node:test';
import assert from 'node:assert/strict';
import {CAPTURE_OPERATIONS,CAPABILITY_RULES} from '../src/capabilities.mjs';
import {OPERATION_SCHEMA,ALLOWED_FIELDS,FIELD_NAMES} from '../src/schema.mjs';
import {intentSystemPrompt} from '../prompts/intent-system.mjs';
import {interpretTurn} from '../src/interpret.mjs';
import {operation,turn} from './helpers.mjs';
import {captureReply} from '../src/model-policy.mjs';
import {compilePlannerOperations} from '../adapters/rpm-glass.mjs';
import {changePlannerSchema} from '../../android-companion/planner-tools.mjs';

test('every schema operation and field has a model-facing description from the same registry',()=>{
 assert.deepEqual(OPERATION_SCHEMA.properties.entity.enum,Object.keys(CAPTURE_OPERATIONS));
 assert.deepEqual(new Set(OPERATION_SCHEMA.properties.kind.enum),new Set(Object.values(CAPTURE_OPERATIONS).flatMap(s=>Object.keys(s.actions))));
 assert.ok(intentSystemPrompt.includes(CAPABILITY_RULES));
 for(const [entity,spec] of Object.entries(CAPTURE_OPERATIONS)){
  assert.ok(spec.description.trim());assert.deepEqual(ALLOWED_FIELDS[entity],spec.fields);
  for(const [kind,description] of Object.entries(spec.actions)){assert.ok(description.trim());assert.ok(CAPABILITY_RULES.includes(`${kind}: ${description}`));}
  for(const field of spec.fields){assert.ok(FIELD_NAMES.includes(field));assert.ok(CAPABILITY_RULES.includes(field));}
 }
});
test('an operation outside the capability table cannot reach the planner',()=>{
 const output=turn('complete this Block',[operation([],{kind:'complete',entity:'block',targetId:'b1'})]);
 assert.throws(()=>interpretTurn(output,{messageId:'m',units:[{id:'s0',text:'complete this Block'}],visibleEntities:[{id:'b1',entity:'block'}]}),/Only a saved task can be completed/);
});
test('every described planner operation compiles to a supported collection and operation',()=>{
 const schema=changePlannerSchema.properties.operations.items.properties;
 for(const [entity,spec] of Object.entries(CAPTURE_OPERATIONS))for(const kind of Object.keys(spec.actions)){
  if(entity==='draft'||kind==='discard')continue;
  const [compiled]=compilePlannerOperations({id:'d',revision:1,operations:[operation([],{entity,kind,targetId:kind==='create'?null:'1'})]},{actionId:'test'});
  assert.ok(schema.collection.enum.includes(compiled.collection),`${entity} ${kind}`);
  assert.ok(schema.type.enum.includes(compiled.type),`${entity} ${kind}`);
 }
});
test('a limitation survives routine receipt normalization without another optional question',()=>{
 const parsed=turn('Send a message',[],{reply:"RPM can't send messages. Want me to save a task?"});
 parsed.operations=[operation()];
 assert.equal(captureReply({parsed,schedulePreview:{items:[]}}),"RPM can't send messages.");
});

test('the model-facing contract separates capturing personal actions from performing them',()=>{
 assert.match(intentSystemPrompt,/Bare personal actions[\s\S]*tasks for the person/);
 for(const verb of ['call','buy','print','email'])assert.match(CAPTURE_OPERATIONS.task.description,new RegExp(`\\b${verb}\\b`));
 assert.match(intentSystemPrompt,/explicitly asks RPM to execute/);
});

test('the model contract distinguishes a new body report from a matching daily aggregate',()=>{
 assert.match(intentSystemPrompt,/aggregate is not evidence that this report was already logged/i);
 assert.match(intentSystemPrompt,/again does not mean a previous day/i);
});

test('the model contract treats explicitly essential actions as Must without promoting every deadline',()=>{
 assert.match(intentSystemPrompt,/have to.*otherwise/);
 assert.match(intentSystemPrompt,/deadline alone does not make an action a Must/i);
});

test('one capture can mix entity kinds and missing create details without a blocking question',()=>{
 assert.match(intentSystemPrompt,/One ramble may create any mix of tasks, Blocks.*Projects and Areas/);
 assert.match(intentSystemPrompt,/title = Result, purpose = Purpose/);
 assert.match(intentSystemPrompt,/link new children to new parents with \$opId/);
 assert.match(intentSystemPrompt,/Leave uncertain create fields unknown instead of asking/);
 assert.match(intentSystemPrompt,/tasks with alert reminder or alarm/);
});
