export type Alert = 'alarm' | 'reminder' | 'off' | null;
export type Slot = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export interface Task {
  id: number; title: string; raw: string; notes: string; purpose: string; planned: string | null; plannedDate: string | null;
  minutes: number | null; alert: Alert; blockId: string | null; must: boolean; priority: number | null; done: boolean; archived: boolean;
  archiveDisposition: 'trash' | 'archive' | null; recurrence: 'daily' | 'weekly' | 'weekdays' | null; repeatAfterDays: number | null;
  completedAt: string | null; completedOccurrences: string[];
}
export interface Entity {
  id: string; title: string; purpose: string; notes: string; archived: boolean; projectId: string | null; goalId: string | null;
  areaId: string | null; year: number | null; horizon: string | null; period: number | null; rating: number | null; colorIndex: number | null;
}
export interface Snapshot {
  schemaVersion: 1; revision: number; savedAt: string; tasks: Task[]; blocks: Entity[]; projects: Entity[]; areas: Entity[]; goals: Entity[];
  drafts: {id: string; status: string; title: string; reply: string; receipt: {text: string}[]; taskIds: number[]}[];
  captures: {id: string; text: string; status: string; createdAt: string | null; receipt: {text: string}[]}[];
  body: {
    water: {settings: {goal: number; intervalMinutes: number; from: string; until: string; glassMl: number; snoozeMinutes: number; reminders: boolean}; glasses: string[]; snoozedUntil: string | null};
    meals: {id: string; name: string; slot: Slot; at: string}[];
    mealPlan: {slots: {slot: Slot; at: string; on: boolean; name: string}[]};
    routines: {id: string; name: string; start: string; end: string; days: number[]; steps: {id: string; title: string}[]; archived: boolean}[];
    runs: {routineId: string; day: string; marks: {stepId: string; state: 'done' | 'skipped'; at: string}[]; skippedDay: boolean}[];
  };
}
type CommandArgs =
  | {type: 'capture'; args: {text: string}}
  | {type: 'complete' | 'uncomplete'; args: {taskId: number; occurrence?: string | null}}
  | {type: 'reschedule'; args: {taskId: number; time: string | null; day: string | null}}
  | {type: 'edit'; args: {taskId: number; fields: {title?: string; notes?: string; time?: string | null; minutes?: number | null; alert?: Alert}}}
  | {type: 'move-to-block'; args: {taskId: number; blockId: string | null}}
  | {type: 'archive' | 'restore'; args: {taskId: number}}
  | {type: 'log-water'; args: {at: string}}
  | {type: 'log-meal'; args: {name: string; slot: Slot; at: string}}
  | {type: 'undo'; args: {commandId: string}};
export type Command = {id: string; baseRevision: number; createdAt: string} & CommandArgs;
export function validateSnapshot(value: unknown): Snapshot;
export function validateCommand(value: unknown): Command;
