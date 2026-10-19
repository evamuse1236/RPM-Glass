/** A demo phone in the browser: it applies commands after one to three seconds and publishes a new snapshot. */
import {userMessage} from '../../../android-companion/user-message.mjs';
import {applyCommand, restoreTask, CommandProblem} from './apply.mjs';
import {LINK_ERROR} from './http.mjs';
import {mockCapture, undoCapture} from './mock-capture.mjs';
import {prepareSnapshot, seedEntries, PHONE_ASLEEP} from './mock-scenarios.mjs';

const CODE = /^[A-HJKMNP-Z2-9]{8}$/;

function undoFor(before, command) {
  const {type, args} = command;
  if (type === 'log-water') return s => {
    const next = structuredClone(s), at = next.body.water.glasses.indexOf(args.at);
    if (at >= 0) next.body.water.glasses.splice(at, 1);
    return next;
  };
  if (type === 'log-meal') return s => ({...s, body: {...s.body, meals: s.body.meals.filter(m => m.id !== command.id)}});
  const task = before.tasks.find(t => t.id === args.taskId);
  return s => restoreTask(s, task);
}

export function createMockPhone({fixture, scenario = null, now = () => new Date(), delay = () => 1000 + Math.random() * 2000, timers = globalThis}) {
  let phone = prepareSnapshot(fixture, scenario, now());
  let emit = () => {};
  let linked = scenario !== 'unlinked';
  const undos = new Map();
  const awake = () => !PHONE_ASLEEP.has(scenario);

  function run(command) {
    try {
      if (command.type === 'undo') {
        const undo = undos.get(command.args.commandId);
        if (!undo) throw new CommandProblem('That change is no longer on the phone to undo.');
        undos.delete(command.args.commandId);
        phone = undo(phone);
      } else if (command.type === 'capture') {
        const {snapshot, taskIds} = mockCapture(phone, command, now());
        undos.set(command.id, s => undoCapture(s, command.id, taskIds));
        phone = snapshot;
      } else {
        const before = phone;
        phone = applyCommand(phone, command, {now: now()});
        undos.set(command.id, undoFor(before, command));
      }
      phone = {...phone, revision: phone.revision + 1, savedAt: new Date(now()).toISOString()};
      emit({type: 'status', id: command.id, status: 'applied', message: 'Done on the phone.', newRevision: phone.revision});
      emit({type: 'snapshot', snapshot: phone});
    } catch (problem) {
      emit({type: 'status', id: command.id, status: problem.status ?? 'rejected', message: userMessage(problem), newRevision: phone.revision});
    }
  }

  return {
    kind: 'mock',
    seed: () => seedEntries(phone, scenario, now()),
    start(onEvent) {
      emit = onEvent;
      if (!linked) return emit({type: 'unlinked'});
      if (scenario === 'offline') emit({type: 'online', online: false});
      if (scenario !== 'loading') timers.setTimeout(() => emit({type: 'snapshot', snapshot: phone}), 250);
    },
    send(command) {
      return new Promise(resolve => timers.setTimeout(() => {
        resolve({id: command.id, status: 'pending', message: 'Waiting for phone', newRevision: null});
        if (awake()) timers.setTimeout(() => run(command), delay());
      }, 120));
    },
    link(code) {
      return new Promise((resolve, reject) => timers.setTimeout(() => {
        if (!CODE.test(code)) return reject(new Error(LINK_ERROR));
        linked = true;
        resolve();
      }, 900));
    },
  };
}
