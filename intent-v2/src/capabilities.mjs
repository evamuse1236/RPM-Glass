import {BODY_INTENTS} from './body-intent.mjs';

const discard='Set aside selected proposals in the focused draft; surviving proposals stay pending.';
const hierarchy=(fields,description)=>({fields,description,actions:{create:'Create this planning item.',update:'Change only the requested fields or move its parent link.',discard}});
export const CAPTURE_OPERATIONS=Object.freeze({
 task:{fields:['title','purpose','notes','time','minutes','blockId','must','priority','recurrence','repeatAfterDays','alert'],
  description:'Concrete actions for the person to do (call, buy, print, email), optional personal purpose, outcome Block, day/time, duration, Must and order. Reminders notify; alarms ring. Habits use daily, weekly, weekdays or repeat-after-days recurrence.',
  actions:{create:'Add a task, reminder, ringing alarm or recurring habit.',update:'Edit, rename, move, schedule, change repetition or switch an alert off.',complete:'Complete a saved task.',archive:'Move a task to Trash; Undo restores it.',discard}},
 block:hierarchy(['title','purpose','notes','projectId'],'An RPM Block holds a desired Result, its personal Purpose and linked actions; it may link to a Project.'),
 project:hierarchy(['title','purpose','notes','goalId'],'A Project groups RPM Blocks and may link to a Goal.'),
 goal:hierarchy(['title','purpose','notes','areaId','year'],'A yearly Goal may link to a Life area. Its parent is optional.'),
 area:hierarchy(['title','purpose','notes'],'A Life area groups goals.'),
 draft:{fields:[],description:'An uncommitted planning proposal.',actions:{archive:'Set a draft aside; Resume restores it.',discard}},
 ...Object.fromEntries(Object.entries(BODY_INTENTS).map(([entity,body])=>[entity,{fields:body.fields,
  description:entity==='water'?'Log the stated count of glasses now; read the saved daily count and next nudge.':'Log the named food and meal slot now, or mark a meal skipped; no invented nutrition.',
  actions:{create:'Save this body log with Undo, together with any requested tasks.',discard}}])),
});
export const OPERATION_KINDS=[...new Set(Object.values(CAPTURE_OPERATIONS).flatMap(spec=>Object.keys(spec.actions)))];
export const CAPABILITY_RULES=Object.entries(CAPTURE_OPERATIONS).map(([entity,spec])=>
 `- ${entity}: ${spec.description} Fields: ${spec.fields.join(', ')||'none'}. ${Object.entries(spec.actions).map(([kind,text])=>`${kind}: ${text}`).join(' ')}`).join('\n');
export const CAPTURE_LIMITS=String.raw`Parent links are optional. Capture only the entities requested; never create an unrequested parent or ask for one to fill a hierarchy. A yearly goal on its own is complete. Undo reverses the latest saved change without erasing the original words. Questions with choices resolve an unknown fact or which supplied item the person means. Optional next steps appear after a receipt and never block saving.
Capture can read routines in the snapshot and create recurring task habits. Editing a routine checklist or water/meal reminder settings requires the planner. Calendar commitments are read-only. RPM cannot send messages, place calls, buy things, control other apps, or deliver terminal reminders on a phone.
Bare personal actions, including imperatives to call someone, buy something, print a document or email an office, are tasks for the person. Capture them directly, including stated timing. Do not treat these as requests for RPM to perform the action or make saving conditional on another tap. Apply the external-action limitation only when the person explicitly asks RPM to execute an action through another app or service, such as transmitting a WhatsApp message with supplied content. Never claim the external action was performed.
For an unsupported request, say exactly what RPM cannot do in one plain sentence and offer one nearest supported action. Do not claim the external action happened. When that alternative was not explicitly requested, keep it as a note with disposition idea so the existing Keep as task chip offers it, rather than silently creating it. For a routine checklist, offer a recurring task or point to Routines in the planner. For changing calendar events, point to the calendar app. Do not invent choice targets or personal details.`;
