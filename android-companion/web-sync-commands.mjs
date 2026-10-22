import {createRepository} from '../intent-v2/src/repository.mjs';
import {stable} from '../intent-v2/src/context.mjs';
import {editPlan} from './planner-state.mjs';
import {userMessage} from './user-message.mjs';
import {validateCommand, validateSnapshot} from '../web/contract/validate.mjs';
import {targets, targetRecord} from './web-sync-targets.mjs';
export {targets} from './web-sync-targets.mjs';
import {buildSnapshot} from './web-sync-snapshot.mjs';

const records = data => ((data.webSync ??= {}).commands ??= {});
const guard = async data => {
  const bytes = new TextEncoder().encode(stable({entries: data.entries, planner: data.planner, memories: data.memories, pending: data.pending, history: data.history, conversations: data.conversations, undo: data.undo}));
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
};
const keysFor = command => {
  const safety = ['archived'];
  const fields = {complete: ['title', 'done', 'recurrence', 'repeatAfterDays', 'planned', 'plannedDate', 'completedOccurrences'], uncomplete: ['title', 'done', 'recurrence', 'repeatAfterDays', 'planned', 'plannedDate', 'completedOccurrences'],
    reschedule: ['planned', 'plannedDate', 'recurrence', 'repeatAfterDays'], 'move-to-block': ['blockId'], archive: ['title', 'done', 'blockId', 'planned', 'plannedDate', 'archiveDisposition'], restore: ['archiveDisposition', 'blockId']};
  return [...safety, ...(command.type === 'edit' ? Object.keys(command.args.fields).flatMap(k => k === 'time' ? ['planned', 'plannedDate', 'recurrence', 'repeatAfterDays'] : [k]) : fields[command.type] ?? [])];
};
function conflict(data, command, snapshots) {
  if (['capture', 'log-water', 'log-meal', 'undo'].includes(command.type)) return null;
  const planTargets = command.type === 'plan' ? targets(command.args.op) : null;
  if (planTargets?.length === 0) return null;
  const current = buildSnapshot(data), base = command.baseRevision === current.revision ? current : snapshots.find(s => s.revision === command.baseRevision);
  if (!base) return 'That saved version is no longer available. Refresh the planner and try again.';
  if (planTargets) {
    if (planTargets.some(target => stable(targetRecord(base, target)) !== stable(targetRecord(current, target)))) return 'That plan record changed on the phone. Refresh the planner and try again.';
    return null;
  }
  const before = base.tasks.find(t => t.id === command.args.taskId), now = current.tasks.find(t => t.id === command.args.taskId);
  if (!before || !now) return 'That task is no longer available. Refresh the planner.';
  const changed = ['archive', 'restore'].includes(command.type) ? stable(before) !== stable(now) : keysFor(command).some(key => stable(before[key]) !== stable(now[key]));
  if (changed) return 'That task changed on the phone. Refresh the planner and try again.';
  if (command.type === 'move-to-block' && command.args.blockId !== null) {
    const id = command.args.blockId, old = base.blocks.find(b => b.id === id), next = current.blocks.find(b => b.id === id);
    if (!old || !next || next.archived || old.archived !== next.archived) return 'That Result changed on the phone. Refresh the planner.';
  }
  return null;
}
function operation(command) {
  const {type, args: a} = command;
  if (type === 'plan') return a.op;
  if (type === 'complete') return {type: 'saveTask', id: a.taskId, occurrence: a.occurrence, fields: {done: true}};
  if (type === 'uncomplete') return {type: 'reopenTask', id: a.taskId, occurrence: a.occurrence};
  if (type === 'reschedule') return {type: 'saveTask', id: a.taskId, fields: {planned: a.time, plannedDate: a.day}};
  if (type === 'edit') { const {time, ...fields} = a.fields; if ('time' in a.fields) fields.planned = time; return {type: 'saveTask', id: a.taskId, fields}; }
  if (type === 'move-to-block') return {type: 'moveTask', id: a.taskId, blockId: a.blockId};
  if (type === 'archive' || type === 'restore') return {type: type === 'archive' ? 'archiveTask' : 'restoreTask', id: a.taskId, disposition: 'trash'};
  if (type === 'log-water') return {type: 'drinkWater', at: a.at};
  if (type === 'log-meal') return {type: 'saveMeal', meal: {name: a.name, slot: a.slot, at: a.at}};
  return {type: 'undo'};
}
function identity(record, signature) {
  if (record && record.signature !== signature) { const error = new Error('A browser command ID was reused with different content.'); error.code = 'COMMAND_ID_REUSED'; throw error; }
}

/** Receipts share the same atomic companion-store write as each planner effect. */
export function createWebSyncProcessor({backend, capture, clock = () => new Date()}) {
  const repository = createRepository(backend);
  let queue = Promise.resolve();
  async function finish(data, command, status, message) {
    const result = {id: command.id, status, message, newRevision: data.version + 1};
    const journal = data.intentV2?.captures?.[command.id], draft = data.intentV2?.drafts?.[journal?.draftId];
    const captureUndo = status === 'applied' && command.type === 'capture' && draft?.status === 'committed' ? {undoGuard: await guard(data), undoCapture: {draftId: draft.id, conversationId: draft.conversationId}} : {};
    records(data)[command.id] = {...records(data)[command.id], signature: stable(command), state: 'final', result,
      ...captureUndo,
      ...(status === 'applied' && command.type !== 'capture' && command.type !== 'undo' && !(command.type === 'plan' && (command.args.op.keepUndo || command.args.op.type === 'reviewProgress')) ? {undoGuard: await guard(data)} : {})};
    return result;
  }
  async function captureCommand(command) {
    const reserved = await repository.transact(`web:reserve:${command.id}`, command, data => {
      const commands = records(data); identity(commands[command.id], stable(command));
      let chat = data.conversations.find(c => c.id === data.webSync.conversationId && !c.archived);
      if (!chat) { chat = {id: command.id, title: 'Web Capture', messages: [], archived: false}; data.conversations.push(chat); data.webSync.conversationId = chat.id; }
      commands[command.id] = {signature: stable(command), state: 'processing', messageId: command.id, conversationId: chat.id};
      return {messageId: command.id, conversationId: chat.id, text: command.args.text};
    });
    let failed = null;
    try {
      if (!capture) throw new Error('Capture is unavailable on the phone. Try again in Capture.');
      const saved = await repository.load(), journal = saved.intentV2?.captures?.[command.id];
      if (journal?.status === 'interpreted') {
        const draft = saved.intentV2?.drafts?.[journal.draftId];
        if (draft?.status === 'draft') await capture.apply(draft.id);
      } else await capture.capture(reserved);
    } catch (error) {
      if (error.code === 'SAVE_UNKNOWN') throw error;
      failed = userMessage(error);
    }
    return repository.transact(`web:finish:${command.id}`, command, data => {
      const journal = data.intentV2?.captures?.[command.id], draft = data.intentV2?.drafts?.[journal?.draftId];
      if (draft?.status === 'committed') return finish(data, command, 'applied', 'Capture saved on the phone.');
      if (!failed && journal?.status === 'interpreted') return finish(data, command, 'applied', draft ? 'Words saved. Open Capture on the phone to review the draft.' : 'Capture saved on the phone.');
      return finish(data, command, 'rejected', journal ? 'Your words were kept on the phone. Open Capture to retry.' : failed ?? 'Capture could not be saved. Try again on the phone.');
    });
  }
  async function undoCaptureCommand(command) {
    const reserved = await repository.transact(`web:undo-reserve:${command.id}`, command, async data => {
      const target = records(data)[command.args.commandId];
      if (!target?.undoCapture || target.result?.status !== 'applied' || target.undoGuard !== await guard(data)) return {result: await finish(data, command, 'conflict', 'The plan changed since that Capture. Review the current plan on the phone before undoing.')};
      records(data)[command.id] = {signature: stable(command), state: 'processing', undoCapture: target.undoCapture, undoGuard: target.undoGuard};
      return {input: {...target.undoCapture, actionId: `web-${command.id}`}, guard: target.undoGuard};
    });
    if (reserved.result) return reserved.result;
    const receiptId = `undo:${reserved.input.actionId}`;
    let latest = await repository.load(), applied = latest.intentV2?.transactions?.[receiptId]?.result?.status === 'undone';
    let status = 'applied', message = 'Capture undone on the phone.';
    if (!applied) {
      if (await guard(latest) !== reserved.guard) { status = 'conflict'; message = 'The plan changed since that Capture. Review the current plan on the phone before undoing.'; }
      else {
        try { if (!capture?.undo) throw new Error('Capture Undo is unavailable on the phone.'); await capture.undo(reserved.input); }
        catch (error) { if (error.code === 'SAVE_UNKNOWN') throw error; status = 'rejected'; message = userMessage(error); }
        latest = await repository.load(); applied = latest.intentV2?.transactions?.[receiptId]?.result?.status === 'undone';
        if (applied) { status = 'applied'; message = 'Capture undone on the phone.'; }
      }
    }
    return repository.transact(`web:finish:${command.id}`, command, data => finish(data, command, status, message));
  }
  async function run(command, snapshots, revoked) {
    validateCommand(command);
    snapshots.forEach(validateSnapshot);
    const saved = await repository.load(), record = records(saved)[command.id]; identity(record, stable(command));
    if (record?.state === 'final') return structuredClone(record.result);
    if (revoked && record?.state !== 'processing') {
      const cancellation = await repository.transact(`web:revoke:${command.id}`, command, async data => {
        const current = records(data)[command.id]; identity(current, stable(command));
        if (current?.state === 'final') return {result: current.result};
        if (current?.state === 'processing') return {resume: true};
        return {result: await finish(data, command, 'rejected', 'This browser was revoked before the phone started the command.')};
      });
      if (cancellation.result) return cancellation.result;
    }
    if (command.type === 'capture') return captureCommand(command);
    if (command.type === 'undo' && (record?.undoCapture || saved.webSync.commands[command.args.commandId]?.undoCapture)) return undoCaptureCommand(command);
    return repository.transact(`web:command:${command.id}`, command, async data => {
      const problem = conflict(data, command, snapshots);
      if (problem) return finish(data, command, 'conflict', problem);
      if (command.type === 'undo') {
        const target = records(data)[command.args.commandId];
        if (!target?.undoGuard || target.result?.status !== 'applied' || target.undoGuard !== await guard(data) || !data.planner?.undo) return finish(data, command, 'conflict', 'The plan changed since that action. Undo it on the phone after reviewing the current plan.');
      }
      try { editPlan(data, operation(command), clock()); }
      catch (error) { return finish(data, command, 'rejected', userMessage(error)); }
      return finish(data, command, 'applied', command.type === 'undo' ? 'Change undone on the phone.' : 'Saved on the phone.');
    });
  }
  return {repository, snapshot: async () => buildSnapshot(await repository.load()), process(command, {snapshots = [], revoked = false} = {}) {
    const input = structuredClone(command), bases = structuredClone(snapshots);
    const pending = queue.then(() => run(input, bases, revoked), () => run(input, bases, revoked)); queue = pending.catch(() => {}); return pending;
  }};
}
