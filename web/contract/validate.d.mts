export type Alert = 'alarm' | 'reminder' | 'off' | null;
export type Slot = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export interface Task {
  id: number; title: string; raw: string; notes: string; purpose: string; planned: string | null; plannedDate: string | null;
  minutes: number | null; alert: Alert; blockId: string | null; must: boolean; priority: number | null; done: boolean; archived: boolean;
  archiveDisposition: 'trash' | 'archive' | null; recurrence: 'daily' | 'weekly' | 'weekdays' | 'days' | null; repeatAfterDays: number | null;
  completedAt: string | null; completedOccurrences: string[];
}
export interface Entity {
  id: string; title: string; purpose: string; notes: string; archived: boolean; projectId: string | null; goalId: string | null;
  areaId: string | null; year: number | null; horizon: string | null; period: number | null; rating: number | null; colorIndex: number | null;
}
export interface StoreEntity extends Entity {created?: string; achieved?: boolean; achievedAt?: string | null; evidence?: string}
export interface StoreTask extends Omit<Task, 'alert'> {
  kind: 'plan'; state?: string; created?: string; source?: string; durationSource?: string; leverage?: string;
  alertIntent: {type: Alert; lead?: number}; repeatDays?: number[] | null; completions: {occurrence: string; completed: string}[];
  reviewChoice?: {week: string; choice: 'carry' | 'defer' | 'drop'; at: string; cleared?: {planned: string | null; plannedDate: string | null}};
  reviewActivityDays?: string[];
}
type Draft = {id: string; status: string; title: string; reply: string; receipt: {text: string}[]; taskIds: number[]};
type Capture = {id: string; text: string; status: string; createdAt: string | null; receipt: {text: string}[]; question?: string | null};
type WaterSettings = {goal: number; intervalMinutes: number; from: string; until: string; glassMl: number; snoozeMinutes: number; reminders: boolean};
type Step = {id: string; title: string};
type Routine = {id: string; name: string; start: string; end: string; days: number[]; steps: Step[]; archived: boolean; created?: string; updated?: string};
type Mark = {state: 'done' | 'skipped'; at: string};
type Run = {routineId: string; day: string; marks: Record<string, Mark>; skippedDay: boolean};
type Meal = {id: string; name: string; slot: Slot; at: string; state?: 'skipped'; created?: string};
type Guess = {status: 'pending' | 'ready' | 'failed'; by: string; at: string; kcal?: number; protein?: number};
type Body = {
  schema: 1; water: {settings: WaterSettings; glasses: string[]; snoozedUntil: string | null};
  meals: Meal[]; mealPlan: {slots: {slot: Slot; at: string; on: boolean; name: string}[]};
  routines: Routine[]; runs: Run[]; mealGuesses: Record<string, Guess>;
};
type LegacyBody = {
  water: Body['water']; meals: Pick<Meal, 'id' | 'name' | 'slot' | 'at'>[]; mealPlan: Body['mealPlan'];
  routines: Omit<Routine, 'created' | 'updated'>[]; runs: (Omit<Run, 'marks'> & {marks: (Mark & {stepId: string})[]})[];
};
type Verdict = 'achieved' | 'partly' | 'notyet';
type ReviewPatch = {step?: number; finishedAt?: string | null; focusDraft?: string[] | null; inboxIds?: number[]; keptIds?: number[]; clashes?: Record<string, 'a' | 'b' | 'later'>};
export interface Planner {
  schema: 1; reviewVersion: 1; uxVersion: 2; blocks: StoreEntity[]; projects: StoreEntity[]; areas: StoreEntity[]; goals: StoreEntity[];
  context: {vision: string; goals: string; coreValues: string; approved: boolean; updated?: string};
  weeks: Record<string, {focus: string[]; verdicts: Record<string, Verdict>}>;
  reviews: Record<string, ReviewPatch & {step: number; startedAt: string; updatedAt: string}>;
  body: Body; drafts: Draft[]; events: never[];
}
export interface Conflict {id: string; key: string; group: string; kept: unknown; lost: unknown; lostFrom: 'phone' | 'server'; at: string}
export interface Snapshot {
  conflicts?: Conflict[];
  schemaVersion: 2; revision: number; savedAt: string; entries: StoreTask[]; planner: Planner; captures: Capture[];
  tasks: Task[]; blocks: Entity[]; projects: Entity[]; areas: Entity[]; goals: Entity[]; drafts: Draft[]; body: LegacyBody;
}
type TaskFields = {
  title?: string; purpose?: string | null; notes?: string | null; leverage?: string | null; minutes?: number | null;
  planned?: string | null; plannedDate?: string | null; blockId?: string | null; priority?: number; must?: boolean; done?: boolean;
  alert?: Alert; alertLead?: number; recurrence?: Task['recurrence']; repeatDays?: number[] | null; repeatAfterDays?: number | null;
};
type EntityFields = {title: string; purpose?: string | null; notes?: string | null};
type NewBlock = {title: string; purpose?: string; projectId?: string | null};
type Destination = {blockId: string | null} | {newBlock: NewBlock};
type LeafPlanOp = {keepUndo?: boolean} & (
  | {type: 'saveTask'; id?: number | null; occurrence?: string | null; fields: TaskFields}
  | {type: 'reopenTask'; id: number; occurrence?: string | null}
  | {type: 'archiveTask' | 'restoreTask'; id: number; disposition?: 'archive' | 'trash'}
  | {type: 'moveTask'; id: number; blockId: string | null; beforeId?: number | null}
  | {type: 'reorder'; blockId: string | null; ids: number[]}
  | {type: 'sortExisting'; assignments: {blockId: string; taskIds: number[]}[]}
  | {type: 'saveEntity'; id?: string | null; collection: 'blocks'; fields: EntityFields & {projectId?: string | null}}
  | {type: 'saveEntity'; id?: string | null; collection: 'projects'; fields: EntityFields & {goalId?: string | null}}
  | {type: 'saveEntity'; id?: string | null; collection: 'areas'; fields: EntityFields & {rating?: number | null}}
  | {type: 'saveEntity'; id?: string | null; collection: 'goals'; fields: EntityFields & {areaId?: string | null; year: number; horizon?: 'yearly' | 'quarterly' | 'monthly'; period?: number | null}}
  | {type: 'removeEntity'; collection: 'projects' | 'blocks' | 'areas' | 'goals'; id: string}
  | {type: 'archiveBlock'; id: string; archived?: boolean}
  | {type: 'rateAreas'; ratings: {id: string; rating: number}[]}
  | {type: 'context'; vision: string; goals: string; coreValues?: string; approved: boolean}
  | {type: 'markAchieved'; id: string; achieved: boolean; evidence?: string; week?: string | null; verdict?: Verdict}
  | {type: 'setWeekFocus' | 'finishReview'; week: string; ids: string[]}
  | {type: 'reviewTask'; id: number; choice: 'carry' | 'defer' | 'drop'; week: string}
  | ({type: 'groupTask'; id: number} & Destination)
  | ({type: 'groupTasks'; ids: number[]} & Destination)
  | {type: 'saveRoutine'; routine: {id?: string; name: string; start: string; end: string; days: number[]; steps: {id?: string; title: string}[]}}
  | {type: 'removeRoutine'; id: string}
  | {type: 'saveRoutineRun'; run: Omit<Run, 'skippedDay'> & {skippedDay?: boolean}}
  | {type: 'skipRoutineDay'; routineId: string; day: string; skipped?: boolean}
  | {type: 'drinkWater'; at: string}
  | {type: 'snoozeWater'; until: string | null}
  | {type: 'setWater'; fields: Partial<WaterSettings>}
  | {type: 'saveMeal'; meal: {id?: string; name: string; slot: Slot; at?: string; state?: 'logged' | 'skipped'}}
  | {type: 'removeMeal'; id: string}
  | {type: 'setMealGuess'; id: string; guess: {status: Guess['status']; by?: string; kcal?: number; protein?: number}}
  | {type: 'setMealSlot'; slot: Slot; fields: {at?: string; on?: boolean; name?: string | null}}
  | {type: 'removeMealSlot'; slot: 'snack'}
);
export type PlanOp = LeafPlanOp
  | {type: 'reviewProgress'; week: string; patch: ReviewPatch; keepUndo?: boolean}
  | {type: 'batch'; ops: LeafPlanOp[]; keepUndo?: boolean};
type CommandArgs =
  | {type: 'plan'; args: {op: PlanOp; ids?: (string | number)[]}}
  | {type: 'capture'; args: {text: string; timezone?: string}; timezone?: string}
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
export function validatePlanOp(value: unknown): PlanOp;

export function validateRecord(key: string, value: unknown): unknown;
